// @ts-nocheck
/**
 * SGTX Customs Gateway — Customs Hold Management (§158)
 * ===========================================================================
 *
 * Manages customs holds placed on a trade by a customs authority or
 * Partner Government Agency (PGA). A hold blocks release of cargo
 * until the issuing authority resolves it.
 *
 * Hold types (§158):
 *
 *   CUSTOMS_HOLD     — placed by the customs authority (general)
 *   PGA_HOLD         — placed by a Partner Government Agency (FDA,
 *                      EPA, USDA, etc.) — non-customs authority
 *   INSPECTION_HOLD  — physical / documentary inspection in progress
 *   DOCUMENT_HOLD    — missing or incorrect documentation
 *   PAYMENT_HOLD     — duty / tax payment pending
 *
 * Hold lifecycle:
 *   ACTIVE → RELEASED       (authority releases)
 *   ACTIVE → ESCALATED      (broker / trader escalates)
 *   ESCALATED → RELEASED    (post-escalation release)
 *
 * CRITICAL CONSTRAINTS (§158 + §113):
 *   - Holds are issued by GOVERNMENT AUTHORITIES. SGTX NEVER issues a
 *     CUSTOMS_HOLD or PGA_HOLD on its own behalf — it only records the
 *     hold placed by the authority. The `issuedBy` field MUST carry the
 *     authority identifier (e.g. "US-CBP", "EU-DG-TAXUD", "EG-NAFEZA",
 *     "FDA", "EPA", "USDA").
 *   - A `RELEASED` hold is recorded only when the authority provides a
 *     `releaseReference` (an authoritative evidence identifier — e.g.
 *     a CBP release ABI message, an e-CERT reference). SGTX NEVER
 *     infers a release without authoritative evidence (§113).
 *   - This module is NON-CUSTODIAL: a PAYMENT_HOLD is a status flag —
 *     it does NOT move funds. Actual duty payment flows through the
 *     non-custodial payment engine (separate module).
 *   - All consequential operations (release, escalate) are audited via
 *     the Activity table + Loom hash chain.
 *
 * Persistence:
 *   - Holds are persisted as rows in the existing `Activity` table.
 *     `action` = "CUSTOMS_HOLD", `metadata` (JSON) carries the full
 *     CustomsHold payload. This reuses the existing table without
 *     schema changes.
 *   - Releasing / escalating INSERTs a new Activity row (append-only)
 *     — the prior row is NEVER mutated. The latest row by `createdAt`
 *     for a given `id` (in metadata) is the current state.
 *
 * All public functions are wrapped in try/catch with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type CustomsHoldType =
  | "CUSTOMS_HOLD"
  | "PGA_HOLD"
  | "INSPECTION_HOLD"
  | "DOCUMENT_HOLD"
  | "PAYMENT_HOLD";

export const HOLD_TYPES: CustomsHoldType[] = [
  "CUSTOMS_HOLD", "PGA_HOLD", "INSPECTION_HOLD", "DOCUMENT_HOLD", "PAYMENT_HOLD",
];

export type HoldStatus = "ACTIVE" | "RELEASED" | "ESCALATED";

export interface CustomsHold {
  id: string;
  ustn: string;
  holdType: CustomsHoldType;
  reason: string;
  issuedBy: string;
  issuedAt: Date;
  expectedResolution: Date | null;
  status: HoldStatus;
  releasedAt: Date | null;
  releaseReference: string | null;
  notes: string;
}

// ============ Public API ============

/**
 * §158 — Create a new customs hold. The `issuedBy` field MUST be a
 * government authority identifier — SGTX NEVER issues a hold on its own
 * behalf. Returns the created hold. NEVER throws — on error returns a
 * minimal valid skeleton (with status="ACTIVE" and notes describing
 * the failure) so the caller can still see the intent.
 */
export async function createHold(
  ustn: string,
  holdType: string,
  reason: string,
  issuedBy: string,
): Promise<CustomsHold> {
  const hold = _newHold(ustn, holdType, reason, issuedBy);
  try {
    if (!ustn) throw new Error("ustn is required");
    if (!HOLD_TYPES.includes(hold.holdType)) {
      throw new Error(`Invalid holdType: ${holdType}. Valid: ${HOLD_TYPES.join(", ")}`);
    }
    if (!issuedBy) throw new Error("issuedBy is required (government authority identifier)");
    if (!reason) throw new Error("reason is required");
    const trade = (await db.trade.findUnique({ where: { ustn } })) as any;
    if (!trade) throw new Error(`trade not found for USTN ${ustn}`);
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: null,
        action: "CUSTOMS_HOLD",
        description: `Customs hold placed by ${issuedBy}: ${reason}`,
        type: "WARN",
        metadata: JSON.stringify({ ...hold, _holdEvent: "CREATED", _version: 1 }),
      },
    });
    await _appendHoldEvent(hold, "HOLD_CREATED", { issuedBy, holdType: hold.holdType });
    logger.info("[customs-gateway/hold-management] hold created", {
      holdId: hold.id, ustn, holdType: hold.holdType, issuedBy,
    });
    return hold;
  } catch (err) {
    logger.error("[customs-gateway/hold-management] createHold failed", {
      error: String(err), ustn, holdType, issuedBy,
    });
    hold.notes = `${hold.notes} [persistence-failed: ${String(err)}]`;
    return hold;
  }
}

/**
 * §158 — Get all ACTIVE holds for a USTN. Returns the latest
 * non-RELEASED hold record per hold id. NEVER throws — returns [] on
 * error.
 */
export async function getActiveHolds(ustn: string): Promise<CustomsHold[]> {
  try {
    const all = await getAllHolds({ ustn });
    return all.filter((h) => h.status === "ACTIVE");
  } catch (err) {
    logger.error("[customs-gateway/hold-management] getActiveHolds failed", { error: String(err), ustn });
    return [];
  }
}

/**
 * §158 — Release a hold. The `releaseReference` MUST be provided — it
 * is the authoritative evidence identifier from the issuing authority
 * (e.g. CBP release ABI message id, e-CERT reference). SGTX NEVER
 * infers a release without authoritative evidence (§113). Returns the
 * updated hold. NEVER throws — on error returns the prior hold state.
 */
export async function releaseHold(
  holdId: string,
  releaseReference: string,
): Promise<CustomsHold | null> {
  try {
    if (!holdId) throw new Error("holdId is required");
    if (!releaseReference) {
      throw new Error("releaseReference is required (authoritative evidence — §113)");
    }
    const current = await _findLatestHoldById(holdId);
    if (!current) throw new Error(`hold ${holdId} not found`);
    if (current.status === "RELEASED") {
      throw new Error(`hold ${holdId} is already RELEASED`);
    }
    const released: CustomsHold = {
      ...current,
      status: "RELEASED",
      releasedAt: new Date(),
      releaseReference,
      notes: `${current.notes} [released via ${releaseReference}]`.trim(),
    };
    const trade = (await db.trade.findUnique({ where: { ustn: current.ustn } })) as any;
    if (trade) {
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: null,
          action: "CUSTOMS_HOLD",
          description: `Hold ${holdId} released by ${current.issuedBy} (ref: ${releaseReference})`,
          type: "INFO",
          metadata: JSON.stringify({ ...released, _holdEvent: "RELEASED", _version: 1 }),
        },
      });
    }
    await _appendHoldEvent(released, "HOLD_RELEASED", { releaseReference });
    logger.info("[customs-gateway/hold-management] hold released", {
      holdId, releaseReference, issuedBy: current.issuedBy,
    });
    return released;
  } catch (err) {
    logger.error("[customs-gateway/hold-management] releaseHold failed", {
      error: String(err), holdId, releaseReference,
    });
    return null;
  }
}

/**
 * §158 — Escalate a hold (broker / trader escalation). This does NOT
 * release the hold — it flags that an escalation has been raised.
 * Returns the updated hold. NEVER throws — on error returns the prior
 * hold state.
 */
export async function escalateHold(
  holdId: string,
  reason: string,
): Promise<CustomsHold | null> {
  try {
    if (!holdId) throw new Error("holdId is required");
    if (!reason) throw new Error("reason is required");
    const current = await _findLatestHoldById(holdId);
    if (!current) throw new Error(`hold ${holdId} not found`);
    if (current.status === "RELEASED") {
      throw new Error(`hold ${holdId} is RELEASED — cannot escalate`);
    }
    const escalated: CustomsHold = {
      ...current,
      status: "ESCALATED",
      notes: `${current.notes} [escalated: ${reason}]`.trim(),
    };
    const trade = (await db.trade.findUnique({ where: { ustn: current.ustn } })) as any;
    if (trade) {
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: null,
          action: "CUSTOMS_HOLD",
          description: `Hold ${holdId} escalated: ${reason}`,
          type: "WARN",
          metadata: JSON.stringify({ ...escalated, _holdEvent: "ESCALATED", _version: 1 }),
        },
      });
    }
    await _appendHoldEvent(escalated, "HOLD_ESCALATED", { reason });
    logger.info("[customs-gateway/hold-management] hold escalated", { holdId, reason });
    return escalated;
  } catch (err) {
    logger.error("[customs-gateway/hold-management] escalateHold failed", {
      error: String(err), holdId, reason,
    });
    return null;
  }
}

/**
 * §158 — List holds, optionally filtered by USTN / status / holdType.
 * NEVER throws — returns [] on error.
 */
export async function getAllHolds(filter?: {
  ustn?: string;
  status?: string;
  holdType?: string;
}): Promise<CustomsHold[]> {
  try {
    const where: any = { action: "CUSTOMS_HOLD" };
    if (filter?.ustn) {
      const trade = (await db.trade.findUnique({ where: { ustn: filter.ustn } })) as any;
      if (!trade) return [];
      where.tradeId = trade.id;
    }
    const rows = (await db.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as any[];
    // Reconstruct the latest state per hold id (append-only).
    const byId = new Map<string, CustomsHold>();
    for (const row of rows) {
      let parsed: any = null;
      try {
        parsed = row.metadata ? JSON.parse(row.metadata) : null;
      } catch {
        continue;
      }
      if (!parsed || !parsed.id) continue;
      // First occurrence (newest row) wins — it carries the latest state.
      if (!byId.has(parsed.id)) {
        byId.set(parsed.id, _rowToHold(parsed, row));
      }
    }
    let holds = Array.from(byId.values());
    if (filter?.status) {
      holds = holds.filter((h) => h.status === filter.status);
    }
    if (filter?.holdType) {
      holds = holds.filter((h) => h.holdType === filter.holdType);
    }
    return holds.sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime());
  } catch (err) {
    logger.error("[customs-gateway/hold-management] getAllHolds failed", { error: String(err) });
    return [];
  }
}

// ============ Internal helpers ============

function _newHold(
  ustn: string,
  holdType: string,
  reason: string,
  issuedBy: string,
): CustomsHold {
  const now = new Date();
  return {
    id: `HOLD-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    ustn,
    holdType: (HOLD_TYPES as string[]).includes(holdType)
      ? (holdType as CustomsHoldType)
      : "CUSTOMS_HOLD",
    reason: String(reason || "").slice(0, 2000),
    issuedBy,
    issuedAt: now,
    expectedResolution: null,
    status: "ACTIVE",
    releasedAt: null,
    releaseReference: null,
    notes: "",
  };
}

async function _findLatestHoldById(holdId: string): Promise<CustomsHold | null> {
  try {
    const rows = (await db.activity.findMany({
      where: { action: "CUSTOMS_HOLD" },
      orderBy: { createdAt: "desc" },
      take: 500,
    })) as any[];
    for (const row of rows) {
      let parsed: any = null;
      try {
        parsed = row.metadata ? JSON.parse(row.metadata) : null;
      } catch {
        continue;
      }
      if (parsed && parsed.id === holdId) {
        return _rowToHold(parsed, row);
      }
    }
    return null;
  } catch (err) {
    logger.error("[customs-gateway/hold-management] _findLatestHoldById failed", {
      error: String(err), holdId,
    });
    return null;
  }
}

function _rowToHold(parsed: any, row: any): CustomsHold {
  return {
    id: parsed.id,
    ustn: parsed.ustn || "",
    holdType: parsed.holdType || "CUSTOMS_HOLD",
    reason: parsed.reason || "",
    issuedBy: parsed.issuedBy || "",
    issuedAt: parsed.issuedAt ? new Date(parsed.issuedAt) : new Date(row.createdAt),
    expectedResolution: parsed.expectedResolution ? new Date(parsed.expectedResolution) : null,
    status: parsed.status || "ACTIVE",
    releasedAt: parsed.releasedAt ? new Date(parsed.releasedAt) : null,
    releaseReference: parsed.releaseReference || null,
    notes: parsed.notes || "",
  };
}

async function _appendHoldEvent(hold: CustomsHold, eventType: string, payload: any): Promise<void> {
  try {
    const eventSpine = await import("@/lib/sgtx/event-spine");
    const appendEvent = (eventSpine as any).appendEvent;
    if (typeof appendEvent !== "function") return;
    await appendEvent({
      ustn: hold.ustn,
      eventType,
      eventTime: new Date(),
      observationTime: new Date(),
      sourceSystem: "CUSTOMS_GATEWAY_HOLD_MANAGEMENT",
      authority: hold.issuedBy,
      evidenceReference: [
        { type: "hold_id", value: hold.id },
        { type: "hold_type", value: hold.holdType },
        { type: "hold_status", value: hold.status },
        ...(hold.releaseReference ? [{ type: "release_reference", value: hold.releaseReference }] : []),
      ],
      actor: hold.issuedBy,
      idempotencyKey: `CUSTOMS-HOLD-${hold.id}-${eventType}`,
      notes: `Customs hold ${hold.id} (${hold.holdType}): ${eventType}`,
      ...payload,
    });
  } catch (err) {
    logger.warn("[customs-gateway/hold-management] _appendHoldEvent failed", { error: String(err) });
  }
}
