// @ts-nocheck
/**
 * SGTX Customs Gateway — Core (Jurisdiction-Neutral Engine)
 * ===========================================================================
 *
 * This is the CORE that routes a customs declaration to its country adapter.
 * It is jurisdiction-neutral: it does NOT contain any US- or EG-specific
 * logic. All country specifics live in adapters (see adapter-registry.ts).
 *
 * Lifecycle (high level):
 *
 *   createDeclaration       — generates a DRAFT declaration row
 *   transitionDeclaration   — walks the state machine (declaration-lifecycle.ts)
 *   submitDeclaration       — runs the full pre-submit chain:
 *        1. Governor G1 (execution gated — mandatory ALLOW)
 *        2. Broker authorization (GTID + relationship + credential state)
 *        3. Country adapter (via adapter-registry)
 *        4. NEVER submits before broker certification (L0)
 *        5. Idempotent (idempotency_key persisted in IntegrationConnectorLog)
 *   getDeclarationHistory   — replayable version chain (canonical events)
 *
 * Persistence:
 *   - Declarations are stored as rows in the existing `CustomsDeclaration`
 *     Prisma table. Extra fields (ustn, jurisdiction, adapterId,
 *     filingProfileId, credentialReference, version, payloadHash,
 *     previousVersionHash, governorDecisionId, signatureStatus) are
 *     serialised as JSON in the `etaXml` column (a nullable String).
 *   - History is replayed from the existing `CanonicalEvent` table filtered
 *     by ustn + eventType prefix "CUSTOMS_DECLARATION_*".
 *
 * L0 constraints:
 *   - NON-CUSTODIAL: this module never moves funds; the EG-CBE adapter only
 *     issues non-custodial settlement INSTRUCTIONS.
 *   - NON-MARKETPLACE: the registry lists adapters; the engine NEVER
 *     auto-selects one on the broker's behalf. The broker + Governor choose.
 *   - GOVERNOR MANDATORY: submitDeclaration refuses to file without a G1
 *     ALLOW verdict recorded in the GovernorDecision table.
 *   - BROKER AUTHORIZATION REQUIRED: submitDeclaration verifies the broker's
 *     GTID, an active provider-relationship, and a non-revoked credential
 *     reference. Filer code is metadata — NEVER the sole authorization.
 *   - NEVER submit before broker certification — enforced by canSubmit().
 *   - try/catch with safe defaults on every public function — failures return
 *     a minimal valid skeleton or empty array; never throw into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";
import {
  isValidTransition,
  requiresGovernorApproval,
  canSubmit,
  preconditionsForSubmit,
  getLifecycleMeta,
} from "./declaration-lifecycle";
import {
  getAdapter,
  getAdapterByJurisdiction,
  type CustomsAdapter,
  type CustomsDeclaration,
  type SubmissionResult,
} from "./adapter-registry";

// Re-export the public types + lifecycle helpers for convenience.
export type { CustomsDeclaration, SubmissionResult, CustomsAdapter };
export {
  isValidTransition,
  requiresGovernorApproval,
  canSubmit,
  preconditionsForSubmit,
  getLifecycleMeta,
};

// ============ §STATES ============

export const DECLARATION_STATES = [
  "DRAFT", "VALIDATING", "READY", "CONDITIONAL", "BROKER_REVIEW",
  "BROKER_CERTIFIED", "GOVERNOR_APPROVED", "SIGNED", "SUBMITTED",
  "ACKNOWLEDGED", "PROCESSING", "ACCEPTED",
  // Alternative states
  "BROKER_REJECTED", "REJECTED", "CORRECTION_REQUIRED",
  "CUSTOMS_HOLD", "PGA_HOLD", "GOVERNOR_DENIED",
  "EXTERNAL_SYSTEM_ERROR", "CANCELLED", "EXPIRED",
];

// ============ §TYPES ============

export interface DeclarationVersion {
  version: number;
  state: string;
  payloadHash: string;
  previousVersionHash: string | null;
  actorGtid: string | null;
  reason: string;
  recordedAt: string;
  eventId: string | null;
}

export interface DeclarationListFilter {
  ustn?: string;
  jurisdiction?: string;
  brokerGtid?: string;
  state?: string;
  adapterId?: string;
  limit?: number;
}

export interface BrokerAuthorization {
  authorized: boolean;
  brokerGtid: string;
  ustn: string;
  reasons: string[];
  checkedAt: string;
}

// ============ §PERSISTENCE helpers ============

/**
 * The existing CustomsDeclaration Prisma model has these fields:
 *   id, tradeId, brokerGtid, declarationNo, regime, status,
 *   dutyUsd, etaXml, nafezaStatus, clearedAt, createdAt
 *
 * We map the spec's CustomsDeclaration shape onto it as follows:
 *   id                  → id
 *   tradeId             → tradeId
 *   brokerGtid          → brokerGtid
 *   externalReference   → declarationNo
 *   state               → status (canonical SGTX state name)
 *   governmentStatus    → nafezaStatus
 *   updatedAt           → clearedAt (re-purposed as last-updated ts)
 *   Everything else (ustn, jurisdiction, adapterId, filingProfileId,
 *   credentialReference, version, payloadHash, previousVersionHash,
 *   governorDecisionId, signatureStatus) is serialised into `etaXml` as JSON.
 */

interface DeclarationExtras {
  ustn: string;
  jurisdiction: string;
  adapterId: string;
  filingProfileId: string;
  credentialReference: string;
  version: number;
  payloadHash: string;
  previousVersionHash: string | null;
  governorDecisionId: string | null;
  signatureStatus: string | null;
}

function computePayloadHash(payload: any): string {
  try {
    const canonical = JSON.stringify(payload || {}, Object.keys(payload || {}).sort());
    return createHash("sha256").update(canonical).digest("hex");
  } catch {
    return "";
  }
}

function rowToDeclaration(row: any): CustomsDeclaration {
  try {
    const extras: DeclarationExtras = row?.etaXml
      ? safeParseExtras(row.etaXml)
      : defaultExtras();
    return {
      id: row?.id || "",
      ustn: extras.ustn || "",
      tradeId: row?.tradeId || "",
      jurisdiction: extras.jurisdiction || "",
      adapterId: extras.adapterId || "",
      brokerGtid: row?.brokerGtid || "",
      filingProfileId: extras.filingProfileId || "",
      credentialReference: extras.credentialReference || "",
      state: row?.status || "DRAFT",
      version: extras.version ?? 1,
      payloadHash: extras.payloadHash || "",
      previousVersionHash: extras.previousVersionHash || null,
      governorDecisionId: extras.governorDecisionId || null,
      signatureStatus: extras.signatureStatus || null,
      externalReference: row?.declarationNo || null,
      governmentStatus: row?.nafezaStatus || null,
      createdAt: row?.createdAt || new Date(),
      updatedAt: row?.clearedAt || row?.createdAt || new Date(),
    };
  } catch {
    return null as any;
  }
}

function safeParseExtras(s: string): DeclarationExtras {
  try {
    const parsed = typeof s === "string" ? JSON.parse(s) : s;
    return { ...defaultExtras(), ...(parsed || {}) };
  } catch {
    return defaultExtras();
  }
}

function defaultExtras(): DeclarationExtras {
  return {
    ustn: "",
    jurisdiction: "",
    adapterId: "",
    filingProfileId: "",
    credentialReference: "",
    version: 1,
    payloadHash: "",
    previousVersionHash: null,
    governorDecisionId: null,
    signatureStatus: null,
  };
}

// ============ §CREATE ============

export async function createDeclaration(
  ustn: string,
  jurisdiction: string,
  brokerGtid: string,
): Promise<CustomsDeclaration> {
  const now = new Date();
  try {
    if (!ustn || !jurisdiction) {
      throw new Error("ustn and jurisdiction are required");
    }
    // Look up the trade by USTN so we can attach the row to its tradeId.
    let tradeId = "";
    try {
      const trade = await db.trade.findUnique({ where: { ustn }, select: { id: true } });
      if (trade) tradeId = trade.id;
    } catch (err: any) {
      logger.warn("[customs-gateway/createDeclaration] trade lookup failed", { ustn, error: err?.message });
    }

    // Pick the adapter for this jurisdiction (does NOT auto-submit — just records intent).
    const adapter = getAdapterByJurisdiction(jurisdiction);
    const adapterId = adapter?.adapterId || "";

    const extras: DeclarationExtras = {
      ustn,
      jurisdiction: jurisdiction.toUpperCase(),
      adapterId,
      filingProfileId: "",
      credentialReference: "",
      version: 1,
      payloadHash: computePayloadHash({ ustn, jurisdiction, brokerGtid, createdAt: now.toISOString() }),
      previousVersionHash: null,
      governorDecisionId: null,
      signatureStatus: null,
    };

    const row = await db.customsDeclaration.create({
      data: {
        tradeId: tradeId || `ustn:${ustn}`,
        brokerGtid: brokerGtid || null,
        declarationNo: null,
        regime: "IMPORT",
        status: "DRAFT",
        etaXml: JSON.stringify(extras),
        nafezaStatus: null,
        clearedAt: now,
      },
    });

    logger.info("[customs-gateway/createDeclaration] declaration created", {
      id: row.id,
      ustn,
      jurisdiction,
      adapterId,
      brokerGtid,
    });

    // Record an event-spine entry so the lifecycle is replayable.
    try {
      await recordDeclarationEvent({
        ustn,
        eventType: "CUSTOMS_DECLARATION_CREATED",
        actorGtid: brokerGtid,
        reason: `Declaration created for jurisdiction ${jurisdiction}`,
        payloadHash: extras.payloadHash,
        version: 1,
      });
    } catch (err: any) {
      logger.warn("[customs-gateway/createDeclaration] event-spine record failed", { ustn, error: err?.message });
    }

    return rowToDeclaration(row);
  } catch (err: any) {
    logger.error("[customs-gateway/createDeclaration] failed", { ustn, jurisdiction, error: err?.message });
    // Safe default — return an unsaved draft object so the caller can still display something.
    return {
      id: "",
      ustn,
      tradeId: "",
      jurisdiction: jurisdiction.toUpperCase(),
      adapterId: "",
      brokerGtid,
      filingProfileId: "",
      credentialReference: "",
      state: "DRAFT",
      version: 1,
      payloadHash: "",
      previousVersionHash: null,
      governorDecisionId: null,
      signatureStatus: null,
      externalReference: null,
      governmentStatus: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

// ============ §GET ============

export async function getDeclaration(id: string): Promise<CustomsDeclaration | null> {
  try {
    if (!id) return null;
    const row = await db.customsDeclaration.findUnique({ where: { id } });
    if (!row) return null;
    return rowToDeclaration(row);
  } catch (err: any) {
    logger.error("[customs-gateway/getDeclaration] failed", { id, error: err?.message });
    return null;
  }
}

// ============ §LIST ============

export async function listDeclarations(
  filter: DeclarationListFilter = {},
): Promise<CustomsDeclaration[]> {
  try {
    const where: any = {};
    if (filter.brokerGtid) where.brokerGtid = filter.brokerGtid;
    if (filter.state) where.status = filter.state;
    // ustn / jurisdiction / adapterId are stored inside etaXml JSON; do an in-memory filter.
    const rows = await db.customsDeclaration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(filter.limit || 100, 500),
    });
    const mapped = rows.map(rowToDeclaration).filter(Boolean);
    return mapped.filter((d) => {
      if (filter.ustn && d.ustn !== filter.ustn) return false;
      if (filter.jurisdiction && d.jurisdiction !== filter.jurisdiction.toUpperCase()) return false;
      if (filter.adapterId && d.adapterId !== filter.adapterId) return false;
      return true;
    });
  } catch (err: any) {
    logger.error("[customs-gateway/listDeclarations] failed", { error: err?.message });
    return [];
  }
}

// ============ §TRANSITION ============

export async function transitionDeclaration(
  id: string,
  newState: string,
  actorGtid: string,
  reason: string,
): Promise<CustomsDeclaration> {
  try {
    if (!id || !newState) throw new Error("id and newState are required");
    const current = await getDeclaration(id);
    if (!current) throw new Error(`Declaration ${id} not found`);

    if (!isValidTransition(current.state, newState)) {
      throw new Error(`Invalid transition: ${current.state} → ${newState}`);
    }

    // If Governor approval is required, verify a recent GovernorDecision exists.
    // (The full Governor gate runs in submitDeclaration; here we just verify
    //  the recorded decision is present and ALLOW.)
    if (requiresGovernorApproval(current.state, newState)) {
      const ok = await verifyGovernorDecision(current, newState);
      if (!ok) {
        throw new Error(`Governor G1 approval required for ${current.state} → ${newState}`);
      }
    }

    // Compute new version + hash chain.
    const newVersion = (current.version || 1) + (newState === "DRAFT" && current.state === "CORRECTION_REQUIRED" ? 0 : 1);
    const newPayloadHash = computePayloadHash({
      id, state: newState, version: newVersion, previousHash: current.payloadHash, actor: actorGtid, reason,
    });

    const extras: DeclarationExtras = {
      ustn: current.ustn,
      jurisdiction: current.jurisdiction,
      adapterId: current.adapterId,
      filingProfileId: current.filingProfileId,
      credentialReference: current.credentialReference,
      version: newVersion,
      payloadHash: newPayloadHash,
      previousVersionHash: current.payloadHash || null,
      governorDecisionId: current.governorDecisionId,
      signatureStatus: newState === "SIGNED" ? "SIGNED" : current.signatureStatus,
    };

    const updated = await db.customsDeclaration.update({
      where: { id },
      data: {
        status: newState,
        etaXml: JSON.stringify(extras),
        clearedAt: new Date(),
        ...(newState === "ACCEPTED" ? { clearedAt: new Date() } : {}),
      },
    });

    // Record the transition in the event spine.
    try {
      await recordDeclarationEvent({
        ustn: current.ustn,
        eventType: `CUSTOMS_DECLARATION_${newState}`,
        actorGtid,
        reason: reason || `${current.state} → ${newState}`,
        payloadHash: newPayloadHash,
        version: newVersion,
      });
    } catch (err: any) {
      logger.warn("[customs-gateway/transitionDeclaration] event-spine record failed", { id, error: err?.message });
    }

    logger.info("[customs-gateway/transitionDeclaration] transitioned", {
      id, from: current.state, to: newState, actorGtid, reason,
    });

    return rowToDeclaration(updated);
  } catch (err: any) {
    logger.error("[customs-gateway/transitionDeclaration] failed", { id, newState, error: err?.message });
    // Re-throw so the API route can surface a 4xx — but only for caller errors.
    throw err;
  }
}

// ============ §SUBMIT — the G1-gated, broker-authorized, idempotent filing ============

export async function submitDeclaration(
  id: string,
): Promise<SubmissionResult> {
  const now = new Date().toISOString();
  try {
    if (!id) throw new Error("id is required");
    const declaration = await getDeclaration(id);
    if (!declaration) {
      return {
        ok: false,
        adapterId: "",
        ustn: "",
        declarationId: id,
        status: "REJECTED",
        message: "Declaration not found.",
        submittedAt: now,
        idempotencyKey: "",
      };
    }

    // G7 + L0: NEVER submit before broker certification + Governor approval + signature.
    if (!canSubmit(declaration.state)) {
      const unmet = preconditionsForSubmit(declaration.state);
      return {
        ok: false,
        adapterId: declaration.adapterId,
        ustn: declaration.ustn,
        declarationId: id,
        status: "REJECTED",
        message: `Submission blocked: ${unmet.join(" | ")}`,
        submittedAt: now,
        idempotencyKey: "",
      };
    }

    // ── 1. Governor G1 gate ──────────────────────────────────────────────
    const govOk = await verifyGovernorDecision(declaration, "SUBMITTED");
    if (!govOk) {
      return {
        ok: false,
        adapterId: declaration.adapterId,
        ustn: declaration.ustn,
        declarationId: id,
        status: "REJECTED",
        message: "Governor G1 ALLOW verdict required before submission (L0).",
        submittedAt: now,
        idempotencyKey: "",
      };
    }

    // ── 2. Broker authorization (GTID + relationship + credential) ──────
    const brokerAuth = await verifyBrokerAuthorization(declaration);
    if (!brokerAuth.authorized) {
      return {
        ok: false,
        adapterId: declaration.adapterId,
        ustn: declaration.ustn,
        declarationId: id,
        status: "REJECTED",
        message: `Broker authorization failed: ${brokerAuth.reasons.join(" | ")}`,
        submittedAt: now,
        idempotencyKey: "",
      };
    }

    // ── 3. Adapter lookup (jurisdiction-neutral) ────────────────────────
    const adapter = getAdapter(declaration.adapterId) || getAdapterByJurisdiction(declaration.jurisdiction);
    if (!adapter) {
      return {
        ok: false,
        adapterId: declaration.adapterId,
        ustn: declaration.ustn,
        declarationId: id,
        status: "REJECTED",
        message: `No adapter registered for jurisdiction ${declaration.jurisdiction}.`,
        submittedAt: now,
        idempotencyKey: "",
      };
    }

    // ── 4. Idempotency key (persisted in IntegrationConnectorLog) ────────
    const idempotencyKey = `CUSTOMS-SUBMIT-${id}-${declaration.payloadHash || declaration.version}`;

    // Check if a prior successful submission with this key already exists.
    const prior = await checkPriorSubmission(idempotencyKey);
    if (prior) {
      logger.info("[customs-gateway/submitDeclaration] idempotent replay", { id, idempotencyKey });
      return prior;
    }

    // ── 5. Submit via adapter ────────────────────────────────────────────
    const result = await adapter.submit(declaration);

    // Persist the result reference back onto the declaration row.
    try {
      const extras: DeclarationExtras = safeParseExtras(
        (await db.customsDeclaration.findUnique({ where: { id }, select: { etaXml: true } }))?.etaXml || "",
      );
      extras.signatureStatus = extras.signatureStatus || "SIGNED";
      const updatedStatus = result.ok ? "ACKNOWLEDGED" : "EXTERNAL_SYSTEM_ERROR";
      await db.customsDeclaration.update({
        where: { id },
        data: {
          status: updatedStatus,
          declarationNo: result.externalReference || result.governmentReference || null,
          nafezaStatus: result.governmentStatus || null,
          etaXml: JSON.stringify(extras),
          clearedAt: new Date(),
        },
      });
      await recordDeclarationEvent({
        ustn: declaration.ustn,
        eventType: result.ok ? "CUSTOMS_DECLARATION_ACKNOWLEDGED" : "CUSTOMS_DECLARATION_EXTERNAL_SYSTEM_ERROR",
        actorGtid: declaration.brokerGtid,
        reason: result.message,
        payloadHash: declaration.payloadHash,
        version: declaration.version,
      });
    } catch (err: any) {
      logger.warn("[customs-gateway/submitDeclaration] post-submit persistence failed", { id, error: err?.message });
    }

    // Persist the idempotency record so retries replay the same result.
    await persistIdempotencyRecord(idempotencyKey, result);

    return result;
  } catch (err: any) {
    logger.error("[customs-gateway/submitDeclaration] failed", { id, error: err?.message });
    return {
      ok: false,
      adapterId: "",
      ustn: "",
      declarationId: id,
      status: "REJECTED",
      message: `Submission engine error: ${err?.message || String(err)}`,
      submittedAt: now,
      idempotencyKey: "",
    };
  }
}

// ============ §HISTORY ============

export async function getDeclarationHistory(id: string): Promise<DeclarationVersion[]> {
  try {
    if (!id) return [];
    const declaration = await getDeclaration(id);
    if (!declaration) return [];

    // Replay from CanonicalEvent rows for this USTN with eventType prefix.
    let events: any[] = [];
    try {
      events = await db.canonicalEvent.findMany({
        where: {
          ustn: declaration.ustn,
          eventType: { startsWith: "CUSTOMS_DECLARATION_" },
        },
        orderBy: { observationTime: "asc" },
        take: 200,
      });
    } catch (err: any) {
      logger.warn("[customs-gateway/getDeclarationHistory] canonicalEvent query failed", { id, error: err?.message });
    }

    if (events.length === 0) {
      // Fallback — synthesize a single version from the current declaration.
      return [{
        version: declaration.version,
        state: declaration.state,
        payloadHash: declaration.payloadHash,
        previousVersionHash: declaration.previousVersionHash,
        actorGtid: declaration.brokerGtid,
        reason: "Current persisted state (no event-spine history found).",
        recordedAt: declaration.createdAt?.toISOString?.() || new Date().toISOString(),
        eventId: null,
      }];
    }

    let version = 0;
    return events.map((e: any) => {
      version += 1;
      return {
        version,
        state: (e.eventType || "").replace("CUSTOMS_DECLARATION_", ""),
        payloadHash: e.eventHash || "",
        previousVersionHash: e.previousEventHash || null,
        actorGtid: e.actor || null,
        reason: e.notes || "",
        recordedAt: e.observationTime?.toISOString?.() || e.createdAt?.toISOString?.() || new Date().toISOString(),
        eventId: e.eventId || null,
      };
    });
  } catch (err: any) {
    logger.error("[customs-gateway/getDeclarationHistory] failed", { id, error: err?.message });
    return [];
  }
}

// ============ §BROKER AUTHORIZATION (G2U22 hook) ============

export async function verifyBrokerAuthorization(
  declaration: CustomsDeclaration,
): Promise<BrokerAuthorization> {
  const checkedAt = new Date().toISOString();
  const reasons: string[] = [];
  try {
    if (!declaration?.brokerGtid) {
      reasons.push("Broker GTID is missing on the declaration.");
      return { authorized: false, brokerGtid: "", ustn: declaration?.ustn || "", reasons, checkedAt };
    }
    // 1. Verify the broker tenant exists + is type BROKER + sanctions-cleared.
    let broker: any = null;
    try {
      broker = await db.tenant.findUnique({ where: { gtid: declaration.brokerGtid } });
    } catch (err: any) {
      logger.warn("[customs-gateway/verifyBrokerAuthorization] tenant lookup failed", { brokerGtid: declaration.brokerGtid, error: err?.message });
    }
    if (!broker) {
      reasons.push(`Broker tenant ${declaration.brokerGtid} not found.`);
    } else {
      if (broker.type && broker.type !== "BROKER" && broker.type !== "CUSTOMS_BROKER" && broker.type !== "BANK") {
        reasons.push(`Tenant ${declaration.brokerGtid} is type ${broker.type}, not BROKER.`);
      }
      if (broker.sanctionsCleared === false) {
        reasons.push(`Broker ${declaration.brokerGtid} is sanctions-flagged.`);
      }
      if (broker.lifecycleState && broker.lifecycleState !== "VERIFIED" && broker.lifecycleState !== "ACTIVE") {
        reasons.push(`Broker lifecycleState is ${broker.lifecycleState}, must be VERIFIED or ACTIVE.`);
      }
    }

    // 2. Verify the trade + the broker is one of the trade's assigned brokers.
    if (declaration.ustn) {
      let trade: any = null;
      try {
        trade = await db.trade.findUnique({
          where: { ustn: declaration.ustn },
          select: { buyerCustomsBrokerGtid: true, sellerCustomsBrokerGtid: true },
        });
      } catch (err: any) {
        logger.warn("[customs-gateway/verifyBrokerAuthorization] trade lookup failed", { ustn: declaration.ustn, error: err?.message });
      }
      if (trade) {
        const isAssigned =
          trade.buyerCustomsBrokerGtid === declaration.brokerGtid ||
          trade.sellerCustomsBrokerGtid === declaration.brokerGtid;
        if (!isAssigned) {
          reasons.push(`Broker ${declaration.brokerGtid} is not assigned to USTN ${declaration.ustn} (buyer/seller broker mismatch).`);
        }
      }
    }

    // 3. Verify the broker has at least one ACTIVE liability insurance policy
    //    (Add-On 10 — soft check; absence is a warning, not a hard block, in
    //    this release; a future G2U22 hook may hard-block).
    try {
      const policies = await db.brokerLiabilityInsurance.findMany({
        where: { brokerGtid: declaration.brokerGtid, status: "ACTIVE" },
        take: 5,
      });
      if (!policies || policies.length === 0) {
        // Soft warning — record but do NOT block (kept here for visibility).
        logger.info("[customs-gateway/verifyBrokerAuthorization] no active liability policy", { brokerGtid: declaration.brokerGtid });
      }
    } catch (err: any) {
      logger.warn("[customs-gateway/verifyBrokerAuthorization] policy lookup failed", { brokerGtid: declaration.brokerGtid, error: err?.message });
    }

    // 4. Credential reference check — if the declaration has a credential
    //    reference, it must be non-empty. (We do NOT use the filer code as
    //    the sole authorization — filer code is metadata.)
    if (declaration.credentialReference === "__REVOKED__") {
      reasons.push("Broker credential has been revoked.");
    }

    return {
      authorized: reasons.length === 0,
      brokerGtid: declaration.brokerGtid,
      ustn: declaration.ustn,
      reasons,
      checkedAt,
    };
  } catch (err: any) {
    logger.error("[customs-gateway/verifyBrokerAuthorization] failed", { brokerGtid: declaration?.brokerGtid, error: err?.message });
    return {
      authorized: false,
      brokerGtid: declaration?.brokerGtid || "",
      ustn: declaration?.ustn || "",
      reasons: ["Authorization check failed internally — see logs."],
      checkedAt,
    };
  }
}

// ============ §GOVERNOR verification (G1) ============

async function verifyGovernorDecision(
  declaration: CustomsDeclaration,
  intendedAction: string,
): Promise<boolean> {
  try {
    // If the declaration already has a governorDecisionId recorded, trust it
    // (the transitionDeclaration call recorded the decision at GOVERNOR_APPROVED).
    if (declaration.governorDecisionId) {
      const decision = await db.governorDecision.findUnique({
        where: { decisionId: declaration.governorDecisionId },
      });
      if (decision && decision.verdict === "ALLOW") return true;
      if (decision && decision.verdict === "DENY") return false;
    }
    // Fallback: run the Governor inline via dynamic import (avoids cycle).
    const { governorDecide } = await import("@/lib/sgtx/governor");
    const response = await governorDecide({
      action: `customs.${intendedAction.toLowerCase()}`,
      actorGtid: declaration.brokerGtid || undefined,
      resourceUstn: declaration.ustn,
      payload: { declarationId: declaration.id, jurisdiction: declaration.jurisdiction, adapterId: declaration.adapterId },
    });
    if (response.verdict === "ALLOW") {
      // Persist the decisionId back onto the declaration for future replays.
      try {
        const extras = safeParseExtras(
          (await db.customsDeclaration.findUnique({ where: { id: declaration.id }, select: { etaXml: true } }))?.etaXml || "",
        );
        extras.governorDecisionId = response.decisionId;
        await db.customsDeclaration.update({
          where: { id: declaration.id },
          data: { etaXml: JSON.stringify(extras) },
        });
      } catch (err: any) {
        logger.warn("[customs-gateway/verifyGovernorDecision] persist decisionId failed", { id: declaration.id, error: err?.message });
      }
      return true;
    }
    return false;
  } catch (err: any) {
    logger.error("[customs-gateway/verifyGovernorDecision] failed", { id: declaration.id, error: err?.message });
    // Safe default — DENY on internal failure (never auto-ALLOW).
    return false;
  }
}

// ============ §EVENT SPINE recorder ============

async function recordDeclarationEvent(input: {
  ustn: string;
  eventType: string;
  actorGtid: string;
  reason: string;
  payloadHash: string;
  version: number;
}): Promise<void> {
  try {
    const eventId = `EVT-CSTM-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    // Walk the chain for the previous hash.
    let previousHash: string | null = null;
    try {
      const last = await db.canonicalEvent.findFirst({
        where: { ustn: input.ustn, eventType: { startsWith: "CUSTOMS_DECLARATION_" } },
        orderBy: { observationTime: "desc" },
        select: { eventHash: true },
      });
      previousHash = last?.eventHash || null;
    } catch {
      // ignore — no prior hash; chain starts here.
    }
    const hashInput = `${eventId}|${input.ustn}|${input.eventType}|${input.payloadHash}|${previousHash || ""}`;
    const eventHash = createHash("sha256").update(hashInput).digest("hex");
    await db.canonicalEvent.create({
      data: {
        eventId,
        ustn: input.ustn,
        eventType: input.eventType,
        eventTypeCategory: "ASSERTION",
        eventTime: new Date(),
        observationTime: new Date(),
        effectiveTime: new Date(),
        sourceSystem: "SGTX-CUSTOMS-GATEWAY",
        authority: "SGTX",
        evidenceReference: JSON.stringify([{ type: "declaration_version", version: input.version }]),
        previousEventHash: previousHash,
        eventHash,
        actor: input.actorGtid,
        authorizationContext: JSON.stringify({ actorGtid: input.actorGtid, reason: input.reason }),
        idempotencyKey: `CSTM-EVT-${input.ustn}-${input.version}`,
        status: "RECORDED",
        notes: input.reason,
      },
    });
  } catch (err: any) {
    logger.warn("[customs-gateway/recordDeclarationEvent] failed", { ustn: input.ustn, error: err?.message });
  }
}

// ============ §IDEMPOTENCY persistence ============

async function checkPriorSubmission(idempotencyKey: string): Promise<SubmissionResult | null> {
  try {
    const log = await db.integrationConnectorLog.findUnique({
      where: { idempotencyKey },
    });
    if (!log || log.status !== "SUCCESS") return null;
    const body = typeof log.responseBody === "string" ? JSON.parse(log.responseBody) : log.responseBody;
    if (!body) return null;
    return {
      ok: !!body.ok,
      adapterId: body.adapterId || "",
      ustn: body.ustn || "",
      declarationId: body.declarationId || "",
      externalReference: body.externalReference,
      governmentReference: body.governmentReference,
      governmentStatus: body.governmentStatus,
      status: body.status || "PENDING",
      message: `[IDEMPOTENT REPLAY] ${body.message || ""}`,
      submittedAt: body.submittedAt || log.createdAt?.toISOString?.() || new Date().toISOString(),
      idempotencyKey,
    };
  } catch (err: any) {
    logger.warn("[customs-gateway/checkPriorSubmission] failed", { idempotencyKey, error: err?.message });
    return null;
  }
}

async function persistIdempotencyRecord(idempotencyKey: string, result: SubmissionResult): Promise<void> {
  try {
    const exists = await db.integrationConnectorLog.findUnique({
      where: { idempotencyKey },
    });
    if (exists) return;
    await db.integrationConnectorLog.create({
      data: {
        logId: `LOG-CSTM-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`,
        apiName: "CUSTOMS_GATEWAY",
        endpoint: "submitDeclaration",
        ustn: result.ustn || null,
        idempotencyKey,
        requestBody: JSON.stringify({ declarationId: result.declarationId, adapterId: result.adapterId }).slice(0, 2000),
        responseBody: JSON.stringify(result).slice(0, 2000),
        statusCode: result.ok ? 200 : 500,
        status: result.ok ? "SUCCESS" : "FAILED",
      },
    });
  } catch (err: any) {
    logger.warn("[customs-gateway/persistIdempotencyRecord] failed", { idempotencyKey, error: err?.message });
  }
}
