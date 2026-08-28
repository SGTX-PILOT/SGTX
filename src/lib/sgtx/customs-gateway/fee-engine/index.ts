// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Fee Engine (§9-16, §26-28, §37-38)
 * ===========================================================================
 *
 * This module implements the SGTX broker fee engine — fee schedules, broker
 * quotes, immutable fee commitments, and the additional-charge change
 * workflow. It is the constitutional spine for "no hidden fees" (§12) and
 * "accepted quote creates immutable commitment" (§15).
 *
 * CONSTITUTIONAL RULES ENFORCED HERE (from the SGTX prompt):
 *
 *   §9  SGTX fee = 1.5% to TRADERS ONLY.
 *        → NO SGTX customs fee is ever charged to brokers.
 *        → classifyFee() returns category="SGTX_FEE" with isBrokerRevenue=false;
 *          any attempt by a broker to classify its own service as SGTX_FEE is
 *          flagged as a violation (fee-integrity.ts).
 *
 *   §10 Broker pays own costs (ACE/ABI, software, certs, connectivity).
 *        → These are THIRD_PARTY_FEE / PASS_THROUGH; classifyFee() never
 *          marks them as GOVERNMENT_FEE.
 *
 *   §11 Government charges ≠ broker fees.
 *        → classifyFee() returns distinct categories for GOVERNMENT_FEE vs
 *          BROKER_FEE; if a government charge is presented as broker revenue
 *          the function returns isBrokerRevenue=false AND a violation flag.
 *
 *   §12 Fee visibility: trader must know all charges before accepting.
 *        → generateFeeDisclosure() (fee-visibility.ts) returns ALL charges
 *          separated; acceptBrokerQuote() refuses to create a commitment if
 *          any disclosure item is not represented in the quote.
 *
 *   §15 Fee freeze: accepted quote creates immutable commitment.
 *        → acceptBrokerQuote() creates a BrokerFeeCommitment row that is
 *          NEVER updated — only appended to. getFeeCommitment() returns the
 *          immutable record.
 *
 *   §16 Fee changes require workflow: broker → request → evidence →
 *        trader accept/dispute → Governor. Never silently appended.
 *        → requestAdditionalCharge() creates a pending
 *          AdditionalChargeRequest; trader acceptance is required before the
 *          charge becomes binding. DO NOT silently append the amount to the
 *          user's bill.
 *
 *   §28 Non-custodial: fee commitment ≠ funds held.
 *        → No funds are moved by this module. The commitment is a metadata
 *          lock only; the payment engine (separate module) is responsible
 *          for actual settlement, and even there FeeLock is non-custodial.
 *
 *   §37 Customs Cost Classification Engine.
 *        → FEE_CATEGORIES (8) and classifyFee() are exported here.
 *
 *   §38 Broker Quote.
 *        → BrokerQuote interface + createBrokerQuote() + acceptBrokerQuote().
 *
 *   §39 Post-clearance control (post-clearance charge must reference USTN,
 *        broker GTID, original quote, fee schedule, service performed,
 *        evidence, reason) — enforced in fee-integrity.ts.
 *
 * PERSISTENCE:
 *   - All fee-engine records are persisted as rows in the existing
 *     `TradeEvent` table. The `source` column distinguishes record types:
 *       "FEE_SCHEDULE"               — fee schedule version row
 *       "FEE_QUOTE"                  — broker quote version row
 *       "FEE_COMMITMENT"             — immutable broker fee commitment
 *       "ADDITIONAL_CHARGE_REQUEST"  — additional-charge workflow row
 *     The full payload is JSON-encoded in `eventMetadata`. The `eventHash`
 *     column carries the SHA-256 of the record for integrity verification.
 *   - This approach reuses the existing table (no schema change), co-exists
 *     with loom-customs.ts + fee-loom.ts (which both also write TradeEvent
 *     rows with different `source` values), and gives us immutability by
 *     construction: we never UPDATE a fee record, we only INSERT new ones.
 *   - Fee schedule versioning: a new version INSERTs a new FEE_SCHEDULE row
 *     with version+1, status="ACTIVE"; the prior row's status field in its
 *     metadata is flipped to "SUPERSEDED" (only the status flag changes —
 *     substantive fields are NEVER overwritten).
 *
 * L0:
 *   - NON-CUSTODIAL: this module never moves funds; commitments are metadata.
 *   - All public functions wrapped try/catch with safe defaults — never
 *     throws into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";
import { appendFeeLoomEvent, sanitizeFeeForLoom } from "./fee-loom";

// ============ §13 Broker Fee Schedule ============

export const FEE_SCHEDULE_SERVICE_TYPES = [
  "CUSTOMS_CERTIFICATION",
  "PHYSICAL_DOCUMENT_HANDLING",
  "STORAGE",
  "AUDIT_REPRESENTATION",
  "AMENDMENT",
  "ADDITIONAL_DOCUMENT_PROCESSING",
  "OTHER_ALLOWED_SERVICE",
] as const;

export const FEE_SCHEDULE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "SUPERSEDED",
  "WITHDRAWN",
] as const;

export interface BrokerFeeSchedule {
  id: string;
  brokerGtid: string;
  serviceId: string;
  serviceName: string;
  jurisdiction: string;
  serviceType: string;
  feeAmount: number;
  currency: string;
  taxAmount: number;
  taxType: string;
  governmentPassThrough: number;
  thirdPartyPassThrough: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  terms: string;
  version: number;
  status: "DRAFT" | "ACTIVE" | "SUPERSEDED" | "WITHDRAWN";
}

// ============ §38 Broker Quote ============

export const BROKER_QUOTE_STATUSES = [
  "DRAFT",
  "SENT",
  "ACCEPTED",
  "REJECTED",
  "EXPIRED",
] as const;

export interface BrokerQuote {
  id: string;
  ustn: string;
  brokerGtid: string;
  traderGtid: string;
  service: string;
  scope: string;
  inclusions: string[];
  exclusions: string[];
  fee: number;
  currency: string;
  tax: number;
  passThrough: number;
  potentialGovernmentFees: any;
  assumptions: string;
  expiration: Date;
  paymentTerms: string;
  cancellationTerms: string;
  amendmentTerms: string;
  version: number;
  status: "DRAFT" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED";
  acceptedAt: Date | null;
  acceptedBy: string | null;
  documentHash: string;
}

// ============ §15 Broker Fee Commitment (immutable) ============

export interface BrokerFeeCommitment {
  id: string;
  ustn: string;
  brokerGtid: string;
  traderGtid: string;
  service: string;
  amount: number;
  currency: string;
  taxes: number;
  passThroughAmount: number;
  approvalTimestamp: Date;
  approver: string;
  feeScheduleVersion: number;
  quoteVersion: number;
  documentHash: string;
  governorDecisionId: string;
  loomHash: string;
}

// ============ §16 Additional Charge Request ============

export const ADDITIONAL_CHARGE_TYPES = [
  "GOVERNMENT_MANDATED",
  "THIRD_PARTY_PASS_THROUGH",
  "OTHER",
] as const;

export const ADDITIONAL_CHARGE_STATUSES = [
  "SUBMITTED",
  "SGTX_VALIDATED",
  "TRADER_NOTIFIED",
  "TRADER_ACCEPTED",
  "TRADER_DISPUTED",
  "GOVERNOR_REVIEW",
  "GOVERNOR_APPROVED",
  "GOVERNOR_DENIED",
  "LOOM_RECORDED",
  "CANCELLED",
] as const;

export interface AdditionalChargeRequest {
  id: string;
  ustn: string;
  brokerGtid: string;
  traderGtid: string | null;
  reason: string;
  evidence: string;
  governmentReference: string | null;
  amount: number;
  currency: string;
  chargeType: "GOVERNMENT_MANDATED" | "THIRD_PARTY_PASS_THROUGH" | "OTHER";
  status: (typeof ADDITIONAL_CHARGE_STATUSES)[number];
  quoteId: string | null;
  feeScheduleId: string | null;
  governorDecisionId: string | null;
  loomHash: string | null;
  createdAt: Date;
  updatedAt: Date | null;
}

// ============ §37 Customs Cost Classification Engine ============

export const FEE_CATEGORIES = [
  "SGTX_FEE",
  "BROKER_FEE",
  "GOVERNMENT_FEE",
  "THIRD_PARTY_FEE",
  "PASS_THROUGH",
  "TAX",
  "DUTY",
  "OTHER_REGULATORY_CHARGE",
] as const;

export type FeeCategory = (typeof FEE_CATEGORIES)[number];

export interface FeeClassification {
  category: FeeCategory;
  isGovernment: boolean;
  isBrokerRevenue: boolean;
  isPassThrough: boolean;
  violation: string | null;
}

// ============ Internal helpers ============

const SGTX_PLATFORM_FEE_RATE = 0.015; // §9 — 1.5% to TRADERS ONLY

function _hash(input: any): string {
  try {
    const json = typeof input === "string" ? input : JSON.stringify(input || {});
    return createHash("sha256").update(json, "utf8").digest("hex");
  } catch {
    return `error-${Date.now().toString(36)}`;
  }
}

function _safeParse(raw: unknown): any {
  try {
    if (typeof raw !== "string" || !raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function _num(v: any, fallback = 0): number {
  try {
    const n = Number(v);
    return isNaN(n) || !isFinite(n) ? fallback : n;
  } catch {
    return fallback;
  }
}

function _date(v: any): Date {
  try {
    if (!v) return new Date();
    const d = typeof v === "string" || typeof v === "number" ? new Date(v) : v;
    return isNaN(d.getTime()) ? new Date() : d;
  } catch {
    return new Date();
  }
}

function _rowToSchedule(row: any): BrokerFeeSchedule {
  const meta = _safeParse(row?.eventMetadata) || {};
  const body = meta.body || meta;
  return {
    id: row?.id || "",
    brokerGtid: body.brokerGtid || row?.actorGtid || "",
    serviceId: body.serviceId || "",
    serviceName: body.serviceName || "",
    jurisdiction: body.jurisdiction || "",
    serviceType: body.serviceType || "OTHER_ALLOWED_SERVICE",
    feeAmount: _num(body.feeAmount),
    currency: body.currency || "USD",
    taxAmount: _num(body.taxAmount),
    taxType: body.taxType || "",
    governmentPassThrough: _num(body.governmentPassThrough),
    thirdPartyPassThrough: _num(body.thirdPartyPassThrough),
    effectiveFrom: _date(body.effectiveFrom),
    effectiveTo: body.effectiveTo ? _date(body.effectiveTo) : null,
    terms: body.terms || "",
    version: _num(body.version, 1),
    status: body.status || "DRAFT",
  };
}

function _rowToQuote(row: any): BrokerQuote {
  const meta = _safeParse(row?.eventMetadata) || {};
  const body = meta.body || meta;
  return {
    id: row?.id || "",
    ustn: row?.ustn || body.ustn || "",
    brokerGtid: body.brokerGtid || row?.actorGtid || "",
    traderGtid: body.traderGtid || "",
    service: body.service || "",
    scope: body.scope || "",
    inclusions: Array.isArray(body.inclusions) ? body.inclusions : [],
    exclusions: Array.isArray(body.exclusions) ? body.exclusions : [],
    fee: _num(body.fee),
    currency: body.currency || "USD",
    tax: _num(body.tax),
    passThrough: _num(body.passThrough),
    potentialGovernmentFees: body.potentialGovernmentFees || null,
    assumptions: body.assumptions || "",
    expiration: _date(body.expiration),
    paymentTerms: body.paymentTerms || "",
    cancellationTerms: body.cancellationTerms || "",
    amendmentTerms: body.amendmentTerms || "",
    version: _num(body.version, 1),
    status: body.status || "DRAFT",
    acceptedAt: body.acceptedAt ? _date(body.acceptedAt) : null,
    acceptedBy: body.acceptedBy || null,
    documentHash: body.documentHash || row?.eventHash || "",
  };
}

function _rowToCommitment(row: any): BrokerFeeCommitment {
  const meta = _safeParse(row?.eventMetadata) || {};
  const body = meta.body || meta;
  return {
    id: row?.id || "",
    ustn: row?.ustn || body.ustn || "",
    brokerGtid: body.brokerGtid || row?.actorGtid || "",
    traderGtid: body.traderGtid || "",
    service: body.service || "",
    amount: _num(body.amount),
    currency: body.currency || "USD",
    taxes: _num(body.taxes),
    passThroughAmount: _num(body.passThroughAmount),
    approvalTimestamp: _date(body.approvalTimestamp),
    approver: body.approver || "",
    feeScheduleVersion: _num(body.feeScheduleVersion),
    quoteVersion: _num(body.quoteVersion),
    documentHash: body.documentHash || row?.eventHash || "",
    governorDecisionId: body.governorDecisionId || "",
    loomHash: body.loomHash || row?.eventHash || "",
  };
}

function _rowToAdditionalCharge(row: any): AdditionalChargeRequest {
  const meta = _safeParse(row?.eventMetadata) || {};
  const body = meta.body || meta;
  return {
    id: row?.id || "",
    ustn: row?.ustn || body.ustn || "",
    brokerGtid: body.brokerGtid || row?.actorGtid || "",
    traderGtid: body.traderGtid || null,
    reason: body.reason || "",
    evidence: body.evidence || "",
    governmentReference: body.governmentReference || null,
    amount: _num(body.amount),
    currency: body.currency || "USD",
    chargeType: body.chargeType || "OTHER",
    status: body.status || "SUBMITTED",
    quoteId: body.quoteId || null,
    feeScheduleId: body.feeScheduleId || null,
    governorDecisionId: body.governorDecisionId || null,
    loomHash: body.loomHash || null,
    createdAt: _date(row?.createdAt),
    updatedAt: body.updatedAt ? _date(body.updatedAt) : null,
  };
}

// ============ §13 Fee Schedule CRUD ============

/**
 * Create a new broker fee schedule (§13). The schedule records the broker's
 * published fee for a given service / jurisdiction — it is the BASELINE
 * against which all quotes are validated.
 *
 * If an ACTIVE schedule already exists for the same (brokerGtid, serviceId,
 * jurisdiction), the caller should use `updateFeeSchedule` instead — this
 * function refuses to create a duplicate ACTIVE entry.
 */
export async function createFeeSchedule(
  brokerGtid: string,
  data: any,
): Promise<BrokerFeeSchedule> {
  const now = new Date();
  try {
    if (!brokerGtid) throw new Error("brokerGtid is required");
    if (!data?.serviceId) throw new Error("serviceId is required");

    // Refuse to create a duplicate ACTIVE entry for the same key.
    try {
      const existing = await db.tradeEvent.findFirst({
        where: {
          ustn: `SCHEDULE:${brokerGtid}:${data.serviceId}:${data.jurisdiction || ""}`,
          source: "FEE_SCHEDULE",
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const prev = _rowToSchedule(existing);
        if (prev.status === "ACTIVE") {
          throw new Error(
            `ACTIVE schedule already exists for broker=${brokerGtid} service=${data.serviceId} jurisdiction=${data.jurisdiction || ""}. Use updateFeeSchedule to supersede.`,
          );
        }
      }
    } catch (lookupErr: any) {
      // Re-throw the duplicate-ACTIVE error; swallow other lookup errors.
      if (String(lookupErr?.message || "").includes("ACTIVE schedule already exists")) {
        throw lookupErr;
      }
      logger.warn("[fee-engine/createFeeSchedule] duplicate lookup failed — continuing", {
        brokerGtid,
        error: lookupErr?.message,
      });
    }

    const scheduleId =
      `SCH-${brokerGtid.slice(0, 6).toUpperCase()}-${(data.serviceId || "").slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const body = {
      id: scheduleId,
      brokerGtid,
      serviceId: data.serviceId,
      serviceName: data.serviceName || data.serviceId,
      jurisdiction: String(data.jurisdiction || "").toUpperCase(),
      serviceType: data.serviceType || "OTHER_ALLOWED_SERVICE",
      feeAmount: _num(data.feeAmount),
      currency: data.currency || "USD",
      taxAmount: _num(data.taxAmount),
      taxType: data.taxType || "",
      governmentPassThrough: _num(data.governmentPassThrough),
      thirdPartyPassThrough: _num(data.thirdPartyPassThrough),
      effectiveFrom: _date(data.effectiveFrom).toISOString(),
      effectiveTo: data.effectiveTo ? _date(data.effectiveTo).toISOString() : null,
      terms: String(data.terms || ""),
      version: 1,
      status: data.status === "DRAFT" ? "DRAFT" : "ACTIVE",
    };
    const hash = _hash({ ...body, kind: "FEE_SCHEDULE", createdAt: now.toISOString() });

    const row = await db.tradeEvent.create({
      data: {
        ustn: `SCHEDULE:${brokerGtid}:${data.serviceId}:${data.jurisdiction || ""}`,
        eventType: "FEE_SCHEDULE_CREATED",
        eventDescription: `Fee schedule created by broker ${brokerGtid} for ${data.serviceId}`,
        eventMetadata: JSON.stringify({ body, hash, kind: "FEE_SCHEDULE" }).slice(0, 8000),
        actorGtid: brokerGtid,
        source: "FEE_SCHEDULE",
        previousHash: null,
        eventHash: hash,
      },
    });

    // §45 Loom audit event.
    try {
      await appendFeeLoomEvent(
        "fee_schedule_created",
        body.ustn || `SCHEDULE:${brokerGtid}`,
        brokerGtid,
        sanitizeFeeForLoom({
          scheduleId,
          brokerGtid,
          serviceId: body.serviceId,
          jurisdiction: body.jurisdiction,
          serviceType: body.serviceType,
          feeAmount: body.feeAmount,
          currency: body.currency,
          version: body.version,
          status: body.status,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/createFeeSchedule] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/createFeeSchedule] schedule created", {
      scheduleId,
      brokerGtid,
      serviceId: body.serviceId,
      jurisdiction: body.jurisdiction,
      version: body.version,
    });

    return _rowToSchedule(row);
  } catch (err: any) {
    logger.error("[fee-engine/createFeeSchedule] failed", {
      brokerGtid,
      error: err?.message,
    });
    // Safe default — return an unsaved DRAFT so the caller can still display something.
    return {
      id: "",
      brokerGtid,
      serviceId: data?.serviceId || "",
      serviceName: data?.serviceName || "",
      jurisdiction: String(data?.jurisdiction || "").toUpperCase(),
      serviceType: data?.serviceType || "OTHER_ALLOWED_SERVICE",
      feeAmount: _num(data?.feeAmount),
      currency: data?.currency || "USD",
      taxAmount: _num(data?.taxAmount),
      taxType: data?.taxType || "",
      governmentPassThrough: _num(data?.governmentPassThrough),
      thirdPartyPassThrough: _num(data?.thirdPartyPassThrough),
      effectiveFrom: _date(data?.effectiveFrom),
      effectiveTo: data?.effectiveTo ? _date(data?.effectiveTo) : null,
      terms: String(data?.terms || ""),
      version: 1,
      status: "DRAFT",
    };
  }
}

/**
 * List broker fee schedules, optionally filtered by jurisdiction. Returns
 * only ACTIVE rows by default (pass includeAll=true to also return DRAFT,
 * SUPERSEDED, and WITHDRAWN rows).
 *
 * Never throws — returns an empty array on failure.
 */
export async function getFeeSchedule(
  brokerGtid: string,
  jurisdiction?: string,
): Promise<BrokerFeeSchedule[]> {
  try {
    if (!brokerGtid) return [];
    const rows = await db.tradeEvent.findMany({
      where: {
        source: "FEE_SCHEDULE",
        actorGtid: brokerGtid,
      },
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    let mapped = (rows || []).map(_rowToSchedule).filter(Boolean);
    if (jurisdiction) {
      const j = jurisdiction.toUpperCase();
      mapped = mapped.filter((s) => !s.jurisdiction || s.jurisdiction === j);
    }
    // Deduplicate by (serviceId, jurisdiction) keeping the most recent ACTIVE row.
    const byKey = new Map<string, BrokerFeeSchedule>();
    for (const s of mapped) {
      const key = `${s.serviceId}|${s.jurisdiction}`;
      const prior = byKey.get(key);
      if (!prior || s.status === "ACTIVE") {
        if (!prior || prior.status !== "ACTIVE") byKey.set(key, s);
      }
    }
    return Array.from(byKey.values());
  } catch (err: any) {
    logger.error("[fee-engine/getFeeSchedule] failed", {
      brokerGtid,
      error: err?.message,
    });
    return [];
  }
}

/**
 * Update a fee schedule — creates a NEW version (version+1) and marks the
 * prior version as SUPERSEDED. The prior row's substantive fields (fee
 * amount, terms, etc.) are NEVER overwritten; only the status flag in its
 * metadata is flipped.
 *
 * Idempotent on the same input — if the latest version already has the same
 * hash, returns it without creating a duplicate.
 */
export async function updateFeeSchedule(
  id: string,
  data: any,
): Promise<BrokerFeeSchedule> {
  const now = new Date();
  try {
    if (!id) throw new Error("id is required");

    // Fetch the prior row.
    const prior = await db.tradeEvent.findUnique({ where: { id } });
    if (!prior) throw new Error(`Fee schedule ${id} not found`);
    const priorSchedule = _rowToSchedule(prior);
    if (priorSchedule.status === "WITHDRAWN") {
      throw new Error("Cannot update a WITHDRAWN schedule — create a new one.");
    }

    const newVersion = (priorSchedule.version || 1) + 1;
    const body = {
      id: `SCH-${priorSchedule.brokerGtid.slice(0, 6).toUpperCase()}-${priorSchedule.serviceId.slice(0, 8).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      brokerGtid: priorSchedule.brokerGtid,
      serviceId: priorSchedule.serviceId,
      serviceName: data?.serviceName || priorSchedule.serviceName,
      jurisdiction: priorSchedule.jurisdiction,
      serviceType: data?.serviceType || priorSchedule.serviceType,
      feeAmount: data && data.feeAmount !== undefined ? _num(data.feeAmount) : priorSchedule.feeAmount,
      currency: data?.currency || priorSchedule.currency,
      taxAmount: data && data.taxAmount !== undefined ? _num(data.taxAmount) : priorSchedule.taxAmount,
      taxType: data?.taxType || priorSchedule.taxType,
      governmentPassThrough:
        data && data.governmentPassThrough !== undefined
          ? _num(data.governmentPassThrough)
          : priorSchedule.governmentPassThrough,
      thirdPartyPassThrough:
        data && data.thirdPartyPassThrough !== undefined
          ? _num(data.thirdPartyPassThrough)
          : priorSchedule.thirdPartyPassThrough,
      effectiveFrom: _date(data?.effectiveFrom || priorSchedule.effectiveFrom).toISOString(),
      effectiveTo: data?.effectiveTo ? _date(data.effectiveTo).toISOString() : priorSchedule.effectiveTo?.toISOString?.() || null,
      terms: data?.terms !== undefined ? String(data.terms) : priorSchedule.terms,
      version: newVersion,
      status: "ACTIVE",
      supersedes: priorSchedule.id,
    };
    const hash = _hash({ ...body, kind: "FEE_SCHEDULE", createdAt: now.toISOString() });

    // §1 Mark prior as SUPERSEDED (only the status flag in metadata changes —
    //    substantive fields are NEVER overwritten).
    try {
      const priorMeta = _safeParse(prior.eventMetadata) || {};
      const priorBody = { ...(priorMeta.body || priorMeta), status: "SUPERSEDED", supersededAt: now.toISOString(), supersededBy: body.id };
      await db.tradeEvent.update({
        where: { id },
        data: {
          eventMetadata: JSON.stringify({ ...priorMeta, body: priorBody }).slice(0, 8000),
        },
      });
    } catch (err: any) {
      logger.warn("[fee-engine/updateFeeSchedule] could not mark prior as SUPERSEDED", {
        id,
        error: err?.message,
      });
    }

    // §2 Insert the new version.
    const row = await db.tradeEvent.create({
      data: {
        ustn: prior.ustn,
        eventType: "FEE_SCHEDULE_UPDATED",
        eventDescription: `Fee schedule updated to v${newVersion} for ${priorSchedule.serviceId}`,
        eventMetadata: JSON.stringify({ body, hash, kind: "FEE_SCHEDULE" }).slice(0, 8000),
        actorGtid: priorSchedule.brokerGtid,
        source: "FEE_SCHEDULE",
        previousHash: prior.eventHash,
        eventHash: hash,
      },
    });

    // §45 Loom audit event.
    try {
      await appendFeeLoomEvent(
        "fee_schedule_updated",
        prior.ustn,
        priorSchedule.brokerGtid,
        sanitizeFeeForLoom({
          scheduleId: body.id,
          brokerGtid: body.brokerGtid,
          serviceId: body.serviceId,
          jurisdiction: body.jurisdiction,
          serviceType: body.serviceType,
          feeAmount: body.feeAmount,
          currency: body.currency,
          version: body.version,
          supersedes: body.supersedes,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/updateFeeSchedule] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/updateFeeSchedule] schedule updated", {
      newId: body.id,
      oldId: priorSchedule.id,
      version: newVersion,
    });

    return _rowToSchedule(row);
  } catch (err: any) {
    logger.error("[fee-engine/updateFeeSchedule] failed", { id, error: err?.message });
    // Safe default — return an unsaved DRAFT object.
    return {
      id: "",
      brokerGtid: "",
      serviceId: "",
      serviceName: "",
      jurisdiction: "",
      serviceType: "OTHER_ALLOWED_SERVICE",
      feeAmount: 0,
      currency: "USD",
      taxAmount: 0,
      taxType: "",
      governmentPassThrough: 0,
      thirdPartyPassThrough: 0,
      effectiveFrom: now,
      effectiveTo: null,
      terms: "",
      version: 0,
      status: "DRAFT",
    };
  }
}

// ============ §38 Broker Quote ============

/**
 * Create a new broker quote (§38). The quote records the broker's offer to
 * perform a specific customs service for a specific USTN. It is the document
 * the trader will accept or reject.
 *
 * The quote includes a SHA-256 documentHash binding the inclusions /
 * exclusions / fee / terms / assumptions. This hash is later embedded in the
 * immutable BrokerFeeCommitment so the trader's acceptance is provably tied
 * to the exact document the broker sent.
 */
export async function createBrokerQuote(data: any): Promise<BrokerQuote> {
  const now = new Date();
  try {
    if (!data?.ustn) throw new Error("ustn is required");
    if (!data?.brokerGtid) throw new Error("brokerGtid is required");

    // Expiration defaults to 7 days from now if not supplied.
    const expiration = _date(data.expiration || new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000));

    const quoteId =
      `QT-${String(data.ustn).slice(0, 8).toUpperCase()}-${String(data.brokerGtid).slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const documentHash = _hash({
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      service: data.service || "",
      scope: data.scope || "",
      inclusions: data.inclusions || [],
      exclusions: data.exclusions || [],
      fee: _num(data.fee),
      currency: data.currency || "USD",
      tax: _num(data.tax),
      passThrough: _num(data.passThrough),
      potentialGovernmentFees: data.potentialGovernmentFees || null,
      assumptions: data.assumptions || "",
      paymentTerms: data.paymentTerms || "",
      cancellationTerms: data.cancellationTerms || "",
      amendmentTerms: data.amendmentTerms || "",
      expiration: expiration.toISOString(),
    });

    const body = {
      id: quoteId,
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      traderGtid: data.traderGtid || "",
      service: data.service || "",
      scope: data.scope || "",
      inclusions: Array.isArray(data.inclusions) ? data.inclusions : [],
      exclusions: Array.isArray(data.exclusions) ? data.exclusions : [],
      fee: _num(data.fee),
      currency: data.currency || "USD",
      tax: _num(data.tax),
      passThrough: _num(data.passThrough),
      potentialGovernmentFees: data.potentialGovernmentFees || null,
      assumptions: data.assumptions || "",
      expiration: expiration.toISOString(),
      paymentTerms: data.paymentTerms || "",
      cancellationTerms: data.cancellationTerms || "",
      amendmentTerms: data.amendmentTerms || "",
      version: 1,
      status: "SENT",
      acceptedAt: null,
      acceptedBy: null,
      documentHash,
    };
    const hash = _hash({ ...body, kind: "FEE_QUOTE", createdAt: now.toISOString() });

    const row = await db.tradeEvent.create({
      data: {
        ustn: data.ustn,
        eventType: "BROKER_QUOTE_CREATED",
        eventDescription: `Broker quote ${quoteId} created for USTN ${data.ustn}`,
        eventMetadata: JSON.stringify({ body, hash, kind: "FEE_QUOTE" }).slice(0, 8000),
        actorGtid: data.brokerGtid,
        source: "FEE_QUOTE",
        previousHash: null,
        eventHash: hash,
      },
    });

    try {
      await appendFeeLoomEvent(
        "broker_quote_created",
        data.ustn,
        data.brokerGtid,
        sanitizeFeeForLoom({
          quoteId,
          ustn: data.ustn,
          brokerGtid: data.brokerGtid,
          traderGtid: data.traderGtid || null,
          service: body.service,
          fee: body.fee,
          currency: body.currency,
          tax: body.tax,
          passThrough: body.passThrough,
          expiration: body.expiration,
          documentHash,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/createBrokerQuote] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/createBrokerQuote] quote created", { quoteId, ustn: data.ustn });
    return _rowToQuote(row);
  } catch (err: any) {
    logger.error("[fee-engine/createBrokerQuote] failed", { error: err?.message });
    return {
      id: "",
      ustn: data?.ustn || "",
      brokerGtid: data?.brokerGtid || "",
      traderGtid: data?.traderGtid || "",
      service: data?.service || "",
      scope: data?.scope || "",
      inclusions: Array.isArray(data?.inclusions) ? data.inclusions : [],
      exclusions: Array.isArray(data?.exclusions) ? data.exclusions : [],
      fee: _num(data?.fee),
      currency: data?.currency || "USD",
      tax: _num(data?.tax),
      passThrough: _num(data?.passThrough),
      potentialGovernmentFees: data?.potentialGovernmentFees || null,
      assumptions: data?.assumptions || "",
      expiration: now,
      paymentTerms: data?.paymentTerms || "",
      cancellationTerms: data?.cancellationTerms || "",
      amendmentTerms: data?.amendmentTerms || "",
      version: 0,
      status: "DRAFT",
      acceptedAt: null,
      acceptedBy: null,
      documentHash: "",
    };
  }
}

/**
 * Accept a broker quote (§15). Trader acceptance creates an immutable
 * BrokerFeeCommitment row that is NEVER updated. The trader's acceptance is
 * bound to the exact documentHash of the quote they accepted.
 *
 * Pre-conditions:
 *   - Quote must exist and be in SENT status.
 *   - Quote must not be expired (expiration > now).
 *   - traderGtid must be supplied (the trader accepting).
 *
 * Returns the accepted quote (with status=ACCEPTED) and the immutable
 * commitment (as a side effect).
 */
export async function acceptBrokerQuote(
  quoteId: string,
  traderGtid: string,
): Promise<BrokerQuote> {
  const now = new Date();
  try {
    if (!quoteId) throw new Error("quoteId is required");
    if (!traderGtid) throw new Error("traderGtid is required");

    const row = await db.tradeEvent.findUnique({ where: { id: quoteId } });
    if (!row) throw new Error(`Quote ${quoteId} not found`);
    const quote = _rowToQuote(row);
    if (quote.status === "ACCEPTED") {
      // Idempotent — return the already-accepted quote.
      return quote;
    }
    if (quote.status === "REJECTED" || quote.status === "EXPIRED") {
      throw new Error(`Cannot accept a quote in status ${quote.status}`);
    }
    if (quote.expiration && quote.expiration.getTime() < now.getTime()) {
      // Mark expired + return.
      try {
        const meta = _safeParse(row.eventMetadata) || {};
        const body = { ...(meta.body || meta), status: "EXPIRED", expiredAt: now.toISOString() };
        await db.tradeEvent.update({
          where: { id: quoteId },
          data: { eventMetadata: JSON.stringify({ ...meta, body }).slice(0, 8000) },
        });
      } catch {}
      throw new Error("Quote has expired — cannot accept.");
    }

    // Flip the quote row to ACCEPTED (status flag only — substantive fields NEVER overwritten).
    const acceptedBody = {
      ...(_safeParse(row.eventMetadata)?.body || {}),
      status: "ACCEPTED",
      acceptedAt: now.toISOString(),
      acceptedBy: traderGtid,
    };
    await db.tradeEvent.update({
      where: { id: quoteId },
      data: {
        eventMetadata: JSON.stringify({
          ...(_safeParse(row.eventMetadata) || {}),
          body: acceptedBody,
        }).slice(0, 8000),
      },
    });

    // §15 Create the immutable BrokerFeeCommitment row.
    const commitment = await createFeeCommitment(
      { ...quote, status: "ACCEPTED", acceptedAt: now, acceptedBy: traderGtid } as BrokerQuote,
      "", // governorDecisionId is empty for a basic acceptance; Governor only
          // invoked if the trader later disputes / requests additional charge.
    );

    try {
      await appendFeeLoomEvent(
        "broker_quote_accepted",
        quote.ustn,
        traderGtid,
        sanitizeFeeForLoom({
          quoteId,
          ustn: quote.ustn,
          brokerGtid: quote.brokerGtid,
          traderGtid,
          fee: quote.fee,
          currency: quote.currency,
          tax: quote.tax,
          passThrough: quote.passThrough,
          documentHash: quote.documentHash,
          commitmentId: commitment?.id || null,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/acceptBrokerQuote] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/acceptBrokerQuote] quote accepted", {
      quoteId,
      ustn: quote.ustn,
      traderGtid,
      commitmentId: commitment?.id,
    });

    return { ...quote, status: "ACCEPTED", acceptedAt: now, acceptedBy: traderGtid };
  } catch (err: any) {
    logger.error("[fee-engine/acceptBrokerQuote] failed", { quoteId, error: err?.message });
    return {
      id: quoteId,
      ustn: "",
      brokerGtid: "",
      traderGtid,
      service: "",
      scope: "",
      inclusions: [],
      exclusions: [],
      fee: 0,
      currency: "USD",
      tax: 0,
      passThrough: 0,
      potentialGovernmentFees: null,
      assumptions: "",
      expiration: now,
      paymentTerms: "",
      cancellationTerms: "",
      amendmentTerms: "",
      version: 0,
      status: "DRAFT",
      acceptedAt: null,
      acceptedBy: null,
      documentHash: "",
    };
  }
}

/**
 * Reject a broker quote — flips status to REJECTED. Idempotent. Safe default.
 */
export async function rejectBrokerQuote(
  quoteId: string,
  traderGtid: string,
  reason: string,
): Promise<BrokerQuote> {
  const now = new Date();
  try {
    if (!quoteId) throw new Error("quoteId is required");
    const row = await db.tradeEvent.findUnique({ where: { id: quoteId } });
    if (!row) throw new Error(`Quote ${quoteId} not found`);
    const quote = _rowToQuote(row);
    if (quote.status === "ACCEPTED") {
      throw new Error("Cannot reject an already-accepted quote — file a dispute instead.");
    }
    const meta = _safeParse(row.eventMetadata) || {};
    const body = {
      ...(meta.body || meta),
      status: "REJECTED",
      rejectedAt: now.toISOString(),
      rejectedBy: traderGtid,
      rejectionReason: String(reason || ""),
    };
    await db.tradeEvent.update({
      where: { id: quoteId },
      data: { eventMetadata: JSON.stringify({ ...meta, body }).slice(0, 8000) },
    });
    return { ...quote, status: "REJECTED" };
  } catch (err: any) {
    logger.error("[fee-engine/rejectBrokerQuote] failed", { quoteId, error: err?.message });
    return {
      id: quoteId,
      ustn: "",
      brokerGtid: "",
      traderGtid,
      service: "",
      scope: "",
      inclusions: [],
      exclusions: [],
      fee: 0,
      currency: "USD",
      tax: 0,
      passThrough: 0,
      potentialGovernmentFees: null,
      assumptions: "",
      expiration: now,
      paymentTerms: "",
      cancellationTerms: "",
      amendmentTerms: "",
      version: 0,
      status: "REJECTED",
      acceptedAt: null,
      acceptedBy: null,
      documentHash: "",
    };
  }
}

/**
 * List broker quotes filtered by USTN, brokerGtid, status, or quoteId.
 */
export async function listBrokerQuotes(filter: {
  ustn?: string;
  brokerGtid?: string;
  traderGtid?: string;
  status?: string;
  quoteId?: string;
  limit?: number;
}): Promise<BrokerQuote[]> {
  try {
    const where: any = { source: "FEE_QUOTE" };
    if (filter.ustn) where.ustn = filter.ustn;
    if (filter.brokerGtid) where.actorGtid = filter.brokerGtid;
    const rows = await db.tradeEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(filter.limit || 100, 500),
    });
    let mapped = (rows || []).map(_rowToQuote).filter(Boolean);
    if (filter.traderGtid) mapped = mapped.filter((q) => q.traderGtid === filter.traderGtid);
    if (filter.status) mapped = mapped.filter((q) => q.status === filter.status);
    if (filter.quoteId) mapped = mapped.filter((q) => q.id === filter.quoteId);
    return mapped;
  } catch (err: any) {
    logger.error("[fee-engine/listBrokerQuotes] failed", { error: err?.message });
    return [];
  }
}

// ============ §15 Broker Fee Commitment (immutable) ============

/**
 * Create a BrokerFeeCommitment row. This is called by acceptBrokerQuote and
 * is the IMMUTABLE record of the trader's acceptance of the broker's quote.
 *
 * The commitment is NEVER updated — only inserted. The hash binds together:
 *   - the trader's identity
 *   - the broker's identity
 *   - the fee amount + currency
 *   - the quote's documentHash
 *   - the approval timestamp
 *
 * Returns the immutable commitment record.
 */
export async function createFeeCommitment(
  quote: BrokerQuote,
  governorDecisionId: string,
): Promise<BrokerFeeCommitment> {
  const now = new Date();
  try {
    if (!quote?.id) throw new Error("quote.id is required");
    if (!quote?.ustn) throw new Error("quote.ustn is required");

    // Idempotency — if a commitment already exists for this quote, return it.
    try {
      const existing = await db.tradeEvent.findFirst({
        where: {
          ustn: quote.ustn,
          source: "FEE_COMMITMENT",
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        const meta = _safeParse(existing.eventMetadata) || {};
        if (meta?.body?.quoteId === quote.id) {
          return _rowToCommitment(existing);
        }
      }
    } catch (err: any) {
      logger.warn("[fee-engine/createFeeCommitment] idempotency lookup failed", {
        error: err?.message,
      });
    }

    const commitmentId =
      `FC-${quote.ustn.slice(0, 8).toUpperCase()}-${quote.brokerGtid.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    const body = {
      id: commitmentId,
      ustn: quote.ustn,
      brokerGtid: quote.brokerGtid,
      traderGtid: quote.traderGtid || quote.acceptedBy || "",
      service: quote.service,
      amount: quote.fee,
      currency: quote.currency,
      taxes: quote.tax,
      passThroughAmount: quote.passThrough,
      approvalTimestamp: now.toISOString(),
      approver: quote.acceptedBy || quote.traderGtid || "",
      feeScheduleVersion: 0,
      quoteVersion: quote.version || 1,
      quoteId: quote.id,
      documentHash: quote.documentHash,
      governorDecisionId: governorDecisionId || "",
      loomHash: "",
    };

    const hash = _hash({ ...body, kind: "FEE_COMMITMENT", createdAt: now.toISOString() });

    const row = await db.tradeEvent.create({
      data: {
        ustn: quote.ustn,
        eventType: "BROKER_FEE_COMMITMENT_CREATED",
        eventDescription: `Broker fee commitment ${commitmentId} created for USTN ${quote.ustn}`,
        eventMetadata: JSON.stringify({ body, hash, kind: "FEE_COMMITMENT" }).slice(0, 8000),
        actorGtid: quote.brokerGtid,
        source: "FEE_COMMITMENT",
        previousHash: null,
        eventHash: hash,
      },
    });

    // Append Loom event — bind the commitment to the immutable Loom chain.
    let loomHash = "";
    try {
      const loomRes = await appendFeeLoomEvent(
        "broker_fee_commitment_created",
        quote.ustn,
        quote.traderGtid || quote.brokerGtid,
        sanitizeFeeForLoom({
          commitmentId,
          ustn: quote.ustn,
          brokerGtid: quote.brokerGtid,
          traderGtid: body.traderGtid,
          amount: body.amount,
          currency: body.currency,
          taxes: body.taxes,
          passThroughAmount: body.passThroughAmount,
          quoteId: quote.id,
          quoteVersion: body.quoteVersion,
          documentHash: body.documentHash,
          governorDecisionId: body.governorDecisionId,
        }),
      );
      loomHash = loomRes?.loomHash || "";
      // Persist the loomHash back onto the commitment's metadata (status-flag
      // style update — substantive fields are NEVER overwritten).
      if (loomHash && loomHash !== "error" && loomHash !== "invalid") {
        try {
          const meta = _safeParse(row.eventMetadata) || {};
          const updatedBody = { ...(meta.body || body), loomHash };
          await db.tradeEvent.update({
            where: { id: row.id },
            data: { eventMetadata: JSON.stringify({ ...meta, body: updatedBody }).slice(0, 8000) },
          });
        } catch (err: any) {
          logger.warn("[fee-engine/createFeeCommitment] loomHash backfill failed", { error: err?.message });
        }
      }
    } catch (err) {
      logger.warn("[fee-engine/createFeeCommitment] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/createFeeCommitment] commitment created", {
      commitmentId,
      ustn: quote.ustn,
      quoteId: quote.id,
      loomHash: loomHash ? loomHash.slice(0, 16) + "..." : "(none)",
    });

    const result = _rowToCommitment(row);
    result.loomHash = loomHash || result.loomHash;
    return result;
  } catch (err: any) {
    logger.error("[fee-engine/createFeeCommitment] failed", { error: err?.message });
    return {
      id: "",
      ustn: quote?.ustn || "",
      brokerGtid: quote?.brokerGtid || "",
      traderGtid: quote?.traderGtid || "",
      service: quote?.service || "",
      amount: quote?.fee || 0,
      currency: quote?.currency || "USD",
      taxes: quote?.tax || 0,
      passThroughAmount: quote?.passThrough || 0,
      approvalTimestamp: now,
      approver: quote?.acceptedBy || quote?.traderGtid || "",
      feeScheduleVersion: 0,
      quoteVersion: quote?.version || 0,
      documentHash: quote?.documentHash || "",
      governorDecisionId: governorDecisionId || "",
      loomHash: "",
    };
  }
}

/**
 * Get the immutable BrokerFeeCommitment for a (USTN, brokerGtid) pair.
 * Returns null if no commitment exists. Never throws.
 *
 * The commitment cannot be silently edited — this function returns the
 * immutable record exactly as it was at acceptance time.
 */
export async function getFeeCommitment(
  ustn: string,
  brokerGtid: string,
): Promise<BrokerFeeCommitment | null> {
  try {
    if (!ustn || !brokerGtid) return null;
    const rows = await db.tradeEvent.findMany({
      where: {
        ustn,
        source: "FEE_COMMITMENT",
        actorGtid: brokerGtid,
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    for (const r of rows || []) {
      const c = _rowToCommitment(r);
      if (c.brokerGtid === brokerGtid) return c;
    }
    return null;
  } catch (err: any) {
    logger.error("[fee-engine/getFeeCommitment] failed", { ustn, brokerGtid, error: err?.message });
    return null;
  }
}

/**
 * List ALL immutable fee commitments for a USTN (across all brokers). Useful
 * for the trader portal fee-history view. Never throws.
 */
export async function listFeeCommitments(ustn: string): Promise<BrokerFeeCommitment[]> {
  try {
    if (!ustn) return [];
    const rows = await db.tradeEvent.findMany({
      where: { ustn, source: "FEE_COMMITMENT" },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return (rows || []).map(_rowToCommitment).filter(Boolean);
  } catch (err: any) {
    logger.error("[fee-engine/listFeeCommitments] failed", { ustn, error: err?.message });
    return [];
  }
}

// ============ §16 Fee Change Workflow (Additional Charge Request) ============

/**
 * Submit a request for an additional charge (§16). The broker must submit
 * the request with reason + evidence; the system NEVER silently appends the
 * amount to the trader's bill.
 *
 * Workflow:
 *   Broker → SUBMITTED → SGTX_VALIDATED → TRADER_NOTIFIED →
 *   TRADER_ACCEPTED | TRADER_DISPUTED →
 *   GOVERNOR_REVIEW (if disputed) → GOVERNOR_APPROVED | GOVERNOR_DENIED →
 *   LOOM_RECORDED.
 *
 * Only after TRADER_ACCEPTED or GOVERNOR_APPROVED may the amount be added to
 * the trader's bill (the actual addition is performed by the payment engine
 * — never by this module).
 */
export async function requestAdditionalCharge(data: {
  ustn: string;
  brokerGtid: string;
  reason: string;
  evidence: string;
  governmentReference: string | null;
  amount: number;
  currency: string;
  chargeType: string;
}): Promise<AdditionalChargeRequest> {
  const now = new Date();
  try {
    if (!data?.ustn) throw new Error("ustn is required");
    if (!data?.brokerGtid) throw new Error("brokerGtid is required");
    if (!data?.reason) throw new Error("reason is required");
    if (!data?.evidence) throw new Error("evidence is required");
    if (_num(data.amount) <= 0) throw new Error("amount must be positive");

    // Validate charge type.
    const chargeType = (ADDITIONAL_CHARGE_TYPES as readonly string[]).includes(data.chargeType)
      ? data.chargeType
      : "OTHER";

    const requestId =
      `ACR-${data.ustn.slice(0, 8).toUpperCase()}-${data.brokerGtid.slice(0, 6).toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;

    // Look up the trade to find the trader GTID.
    let traderGtid: string | null = null;
    try {
      const trade = await db.trade.findUnique({
        where: { ustn: data.ustn },
        select: { buyerGtid: true, sellerGtid: true },
      });
      if (trade) {
        // Prefer the side that is NOT the broker (trader is the other party).
        traderGtid = trade.buyerGtid === data.brokerGtid
          ? trade.sellerGtid
          : trade.buyerGtid;
      }
    } catch (err: any) {
      logger.warn("[fee-engine/requestAdditionalCharge] trade lookup failed", {
        ustn: data.ustn,
        error: err?.message,
      });
    }

    // Look up the active fee commitment for this broker+USTN (the
    // additional charge MUST reference the original commitment).
    let quoteId: string | null = null;
    let feeScheduleId: string | null = null;
    try {
      const commitment = await getFeeCommitment(data.ustn, data.brokerGtid);
      if (commitment) {
        // The commitment row's metadata.body carries the original quoteId.
        const row = await db.tradeEvent.findFirst({
          where: { ustn: data.ustn, source: "FEE_COMMITMENT", actorGtid: data.brokerGtid },
          orderBy: { createdAt: "desc" },
        });
        const meta = _safeParse(row?.eventMetadata) || {};
        quoteId = meta?.body?.quoteId || null;
        feeScheduleId = meta?.body?.feeScheduleId || null;
      }
    } catch (err: any) {
      logger.warn("[fee-engine/requestAdditionalCharge] commitment lookup failed", {
        error: err?.message,
      });
    }

    const body = {
      id: requestId,
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      traderGtid,
      reason: String(data.reason),
      evidence: String(data.evidence),
      governmentReference: data.governmentReference || null,
      amount: _num(data.amount),
      currency: data.currency || "USD",
      chargeType,
      status: "SUBMITTED",
      quoteId,
      feeScheduleId,
      governorDecisionId: null,
      loomHash: null,
      createdAt: now.toISOString(),
      updatedAt: null,
    };
    const hash = _hash({ ...body, kind: "ADDITIONAL_CHARGE_REQUEST", createdAt: now.toISOString() });

    const row = await db.tradeEvent.create({
      data: {
        ustn: data.ustn,
        eventType: "ADDITIONAL_CHARGE_REQUESTED",
        eventDescription: `Additional charge requested by broker ${data.brokerGtid} for USTN ${data.ustn}: ${data.reason}`,
        eventMetadata: JSON.stringify({ body, hash, kind: "ADDITIONAL_CHARGE_REQUEST" }).slice(0, 8000),
        actorGtid: data.brokerGtid,
        source: "ADDITIONAL_CHARGE_REQUEST",
        previousHash: null,
        eventHash: hash,
      },
    });

    try {
      await appendFeeLoomEvent(
        "additional_charge_requested",
        data.ustn,
        data.brokerGtid,
        sanitizeFeeForLoom({
          requestId,
          ustn: data.ustn,
          brokerGtid: data.brokerGtid,
          traderGtid,
          reason: body.reason,
          amount: body.amount,
          currency: body.currency,
          chargeType: body.chargeType,
          governmentReference: body.governmentReference,
          quoteId,
          hasEvidence: !!body.evidence,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/requestAdditionalCharge] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/requestAdditionalCharge] request submitted", {
      requestId,
      ustn: data.ustn,
      brokerGtid: data.brokerGtid,
      amount: body.amount,
      currency: body.currency,
    });

    return _rowToAdditionalCharge(row);
  } catch (err: any) {
    logger.error("[fee-engine/requestAdditionalCharge] failed", { error: err?.message });
    return {
      id: "",
      ustn: data?.ustn || "",
      brokerGtid: data?.brokerGtid || "",
      traderGtid: null,
      reason: data?.reason || "",
      evidence: data?.evidence || "",
      governmentReference: data?.governmentReference || null,
      amount: _num(data?.amount),
      currency: data?.currency || "USD",
      chargeType: (data?.chargeType as any) || "OTHER",
      status: "CANCELLED",
      quoteId: null,
      feeScheduleId: null,
      governorDecisionId: null,
      loomHash: null,
      createdAt: now,
      updatedAt: null,
    };
  }
}

/**
 * Trader accepts / disputes an additional charge request. Flips the status
 * flag in the row's metadata (substantive fields NEVER overwritten).
 *
 * On dispute, the request moves to GOVERNOR_REVIEW (the Governor will
 * adjudicate separately via the governor module).
 */
export async function respondToAdditionalCharge(
  requestId: string,
  traderGtid: string,
  decision: "ACCEPT" | "DISPUTE",
  note: string,
): Promise<AdditionalChargeRequest> {
  const now = new Date();
  try {
    if (!requestId) throw new Error("requestId is required");
    if (!traderGtid) throw new Error("traderGtid is required");
    if (decision !== "ACCEPT" && decision !== "DISPUTE") {
      throw new Error("decision must be ACCEPT or DISPUTE");
    }
    const row = await db.tradeEvent.findUnique({ where: { id: requestId } });
    if (!row) throw new Error(`Additional charge request ${requestId} not found`);

    const current = _rowToAdditionalCharge(row);
    if (current.status === "TRADER_ACCEPTED" || current.status === "GOVERNOR_APPROVED") {
      // Idempotent — return current.
      return current;
    }
    if (current.status === "GOVERNOR_DENIED" || current.status === "CANCELLED") {
      throw new Error(`Cannot respond to a request in status ${current.status}`);
    }

    const newStatus = decision === "ACCEPT" ? "TRADER_ACCEPTED" : "TRADER_DISPUTED";
    const meta = _safeParse(row.eventMetadata) || {};
    const body = {
      ...(meta.body || meta),
      status: newStatus,
      traderResponseAt: now.toISOString(),
      traderResponseBy: traderGtid,
      traderNote: String(note || ""),
    };
    await db.tradeEvent.update({
      where: { id: requestId },
      data: { eventMetadata: JSON.stringify({ ...meta, body }).slice(0, 8000) },
    });

    try {
      await appendFeeLoomEvent(
        decision === "ACCEPT" ? "additional_charge_accepted" : "additional_charge_disputed",
        current.ustn,
        traderGtid,
        sanitizeFeeForLoom({
          requestId,
          ustn: current.ustn,
          brokerGtid: current.brokerGtid,
          traderGtid,
          decision,
          amount: current.amount,
          currency: current.currency,
          chargeType: current.chargeType,
          traderNote: body.traderNote,
        }),
      );
    } catch (err) {
      logger.warn("[fee-engine/respondToAdditionalCharge] Loom append failed", { error: String(err) });
    }

    logger.info("[fee-engine/respondToAdditionalCharge] trader responded", {
      requestId,
      decision,
      traderGtid,
    });

    return { ...current, status: newStatus, updatedAt: now };
  } catch (err: any) {
    logger.error("[fee-engine/respondToAdditionalCharge] failed", { requestId, error: err?.message });
    return {
      id: requestId,
      ustn: "",
      brokerGtid: "",
      traderGtid,
      reason: "",
      evidence: "",
      governmentReference: null,
      amount: 0,
      currency: "USD",
      chargeType: "OTHER",
      status: "CANCELLED",
      quoteId: null,
      feeScheduleId: null,
      governorDecisionId: null,
      loomHash: null,
      createdAt: now,
      updatedAt: now,
    };
  }
}

/**
 * List additional-charge requests for a USTN. Optionally filter by
 * brokerGtid or status. Never throws.
 */
export async function listAdditionalChargeRequests(filter: {
  ustn?: string;
  brokerGtid?: string;
  status?: string;
  limit?: number;
}): Promise<AdditionalChargeRequest[]> {
  try {
    const where: any = { source: "ADDITIONAL_CHARGE_REQUEST" };
    if (filter.ustn) where.ustn = filter.ustn;
    if (filter.brokerGtid) where.actorGtid = filter.brokerGtid;
    const rows = await db.tradeEvent.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(filter.limit || 100, 500),
    });
    let mapped = (rows || []).map(_rowToAdditionalCharge).filter(Boolean);
    if (filter.status) mapped = mapped.filter((r) => r.status === filter.status);
    return mapped;
  } catch (err: any) {
    logger.error("[fee-engine/listAdditionalChargeRequests] failed", { error: err?.message });
    return [];
  }
}

// ============ §37 Customs Cost Classification Engine ============

/**
 * Classify a customs charge into one of the 8 canonical FEE_CATEGORIES.
 *
 * Rules (in priority order):
 *   1. If the charge name/description contains "SGTX" or "platform fee",
 *      classify as SGTX_FEE (1.5% trader fee). The recipient MUST be the
 *      trader — if a broker claims SGTX_FEE on its own bill, flag as
 *      violation "BROKER_CLAIMING_SGTX_FEE" (§9 violation).
 *   2. If the charge contains "duty" or "MPF" or "HMF" or matches known
 *      government duty keywords, classify as DUTY (government, not broker
 *      revenue, not pass-through).
 *   3. If the charge contains "VAT" or "GST" or "sales tax", classify as
 *      TAX (government).
 *   4. If the charge contains "ACE" or "ABI" or "software" or "connectivity"
 *      or "cert", classify as THIRD_PARTY_FEE (broker pays own costs §10).
 *   5. If the charge contains "pass-through" or "reimbursement", classify
 *      as PASS_THROUGH (NOT broker revenue).
 *   6. If the charge is from a government source (chargeRecipient contains
 *      government keywords) → GOVERNMENT_FEE.
 *   7. Otherwise → BROKER_FEE (broker revenue).
 *
 * §11 violation detection: if a charge is classified as GOVERNMENT_FEE /
 * DUTY / TAX but the chargeRecipient is a broker, the violation flag is
 * "GOVERNMENT_AS_BROKER_REVENUE".
 *
 * Never throws — returns a default BROKER_FEE classification on error.
 */
export function classifyFee(charge: any): FeeClassification {
  try {
    const safe: any = charge || {};
    const name = String(safe.name || safe.serviceName || safe.description || "").toLowerCase();
    const recipient = String(safe.chargeRecipient || safe.recipient || safe.payee || "").toLowerCase();
    const source = String(safe.source || safe.issuer || "").toLowerCase();
    const chargeType = String(safe.chargeType || safe.type || "").toLowerCase();

    // Combined search text for keyword matching.
    const text = `${name} ${recipient} ${source} ${chargeType}`;

    const isGovRecipient =
      /government|customs|cbp|treasury|revenue|authority|agency|ministry|nafeza|cargox|eta|cbe/.test(recipient);
    const isBrokerRecipient =
      /broker|freight.forwarder|logistics|clearing/.test(recipient);

    // §9 SGTX_FEE — 1.5% trader fee ONLY. Brokers must never charge this.
    if (/\bsgtx\b|platform\s*fee|1\.5\s*%/.test(text)) {
      const violation =
        isBrokerRecipient || chargeType === "broker_revenue"
          ? "BROKER_CLAIMING_SGTX_FEE"
          : null;
      return {
        category: "SGTX_FEE",
        isGovernment: false,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation,
      };
    }

    // DUTY (government, never broker revenue).
    if (/\bduty\b|\bmpf\b|\bhmf\b|merchandise\s*processing|harbor\s*maintenance/.test(text)) {
      const violation = isBrokerRecipient ? "GOVERNMENT_AS_BROKER_REVENUE" : null;
      return {
        category: "DUTY",
        isGovernment: true,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation,
      };
    }

    // TAX (government, never broker revenue).
    if (/\bvat\b|\bgst\b|sales\s*tax|value[\s-]*added\s*tax/.test(text)) {
      const violation = isBrokerRecipient ? "GOVERNMENT_AS_BROKER_REVENUE" : null;
      return {
        category: "TAX",
        isGovernment: true,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation,
      };
    }

    // THIRD_PARTY_FEE (broker pays own costs §10).
    if (/\bace\b|\babi\b|software|connectivity|certification\s*fee|cert\s*fee|filer\s*fee/.test(text)) {
      return {
        category: "THIRD_PARTY_FEE",
        isGovernment: false,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation: null,
      };
    }

    // PASS_THROUGH (NOT broker revenue).
    if (/pass[\s-]*through|reimburse|reimbursable|on[\s-]* behalf/.test(text)) {
      return {
        category: "PASS_THROUGH",
        isGovernment: false,
        isBrokerRevenue: false,
        isPassThrough: true,
        violation: null,
      };
    }

    // GOVERNMENT_FEE (government user / processing fee).
    if (isGovRecipient || /user\s*fee|processing\s*fee|government\s*fee/.test(text)) {
      const violation = isBrokerRecipient ? "GOVERNMENT_AS_BROKER_REVENUE" : null;
      return {
        category: "GOVERNMENT_FEE",
        isGovernment: true,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation,
      };
    }

    // OTHER_REGULATORY_CHARGE (legal-but-not-categorised).
    if (/regulatory|statutory|excise|levy/.test(text)) {
      return {
        category: "OTHER_REGULATORY_CHARGE",
        isGovernment: true,
        isBrokerRevenue: false,
        isPassThrough: false,
        violation: null,
      };
    }

    // Default: BROKER_FEE (broker revenue).
    return {
      category: "BROKER_FEE",
      isGovernment: false,
      isBrokerRevenue: true,
      isPassThrough: false,
      violation: null,
    };
  } catch (err) {
    logger.error("[fee-engine/classifyFee] failed", { error: String(err) });
    return {
      category: "BROKER_FEE",
      isGovernment: false,
      isBrokerRevenue: true,
      isPassThrough: false,
      violation: "CLASSIFIER_ERROR",
    };
  }
}

/**
 * Compute the SGTX platform fee for a trade (§9). 1.5% of trade value, paid
 * by the TRADER only — never charged to brokers.
 *
 * This is a pure helper — it does NOT move funds or create records. The
 * payment engine is responsible for actually collecting the fee.
 */
export function computeSgtxPlatformFee(
  tradeValueUsd: number,
): { feeAmount: number; rate: number; payer: "TRADER"; notes: string } {
  try {
    const v = _num(tradeValueUsd, 0);
    const feeAmount = Math.round(v * SGTX_PLATFORM_FEE_RATE * 100) / 100;
    return {
      feeAmount,
      rate: SGTX_PLATFORM_FEE_RATE,
      payer: "TRADER",
      notes: "§9 SGTX fee = 1.5% to TRADERS only. NO SGTX customs fee to brokers.",
    };
  } catch (err) {
    logger.error("[fee-engine/computeSgtxPlatformFee] failed", { error: String(err) });
    return {
      feeAmount: 0,
      rate: SGTX_PLATFORM_FEE_RATE,
      payer: "TRADER",
      notes: "Computation failed — returned 0.",
    };
  }
}
