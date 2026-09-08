// @ts-nocheck
// =============================================================================
// SGTX v17 §5.6 — Governor Gates: Multi-Shipment Contract Sub-Gates
// -----------------------------------------------------------------------------
// G2U-MS1..MS4 — Multi-shipment-specific Phase 2 sub-gates.
//
// These gates run on top of the multi-shipment lib functions to enforce the
// v17 §5.6 multi-shipment contract invariants:
//
//   G2U-MS1 — Multi-shipment schedule fully defined
//             Every shipment must have a delivery_date (eta), a port
//             (originPort/destPort), and a container_count ≥1.
//
//   G2U-MS2 — Per-shipment fee calculated correctly (1.5% per shipment)
//             For every locked shipment, the FeeLock.sgtxFeeUsd must equal
//             shipmentValue × 1.5%. For unlocked shipments, the gate is
//             advisory (fee is calculated at lock time).
//
//   G2U-MS3 — Schedule modification only on unlocked shipments
//             The Activity log must not contain any
//             MULTI_SHIPMENT_SCHEDULE_ADDENDUM entries referencing a
//             shipment whose current status is LOCKED/IN_TRANSIT/DELIVERED.
//             (A locked shipment can only be modified via the trade-change
//             amendment procedure, NOT via this gate-protected flow.)
//
//   G2U-MS4 — Schedule modification reason ≥20 chars
//             Every MULTI_SHIPMENT_SCHEDULE_ADDENDUM Activity entry must have
//             a reason field (in metadata) with at least 20 characters.
//
// All gates are async validators returning the canonical GateResult shape
// from the gates-registry. They never throw — they degrade gracefully to a
// CRITICAL fail with a descriptive message on internal errors.
//
// NON-MARKETPLACE: gates never produce scores, rankings, or counterparty
// recommendations. They answer binary per-gate "passed?" questions only.
// =============================================================================

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  SGTX_FEE_RATE_PER_SHIPMENT,
  MIN_REASON_LENGTH,
  computeShipmentFee,
} from "@/lib/sgtx/multi-shipment";

// Re-use the canonical GateResult type from the registry for symmetry.
import type { GateResult, GateContext, GateSeverity } from "./gates-registry";

// ============ Helpers ============

/**
 * Resolve a master_contract_id from the gate context. The context may
 * carry it via contract_id (canonical) or master_contract_id (alt name).
 */
function resolveMasterContractId(ctx: GateContext): string | null {
  const c = ctx as any;
  return (
    c.contract_id ||
    c.master_contract_id ||
    c.masterContractId ||
    null
  );
}

/**
 * Resolve a shipment_id from the gate context.
 */
function resolveShipmentId(ctx: GateContext): string | null {
  const c = ctx as any;
  return c.shipment_id || c.shipmentId || null;
}

// ============ G2U-MS1 — Multi-shipment schedule fully defined ============

/**
 * G2U-MS1 — Multi-shipment schedule fully defined.
 *
 * Validates that EVERY shipment in the master contract has:
 *   • delivery_date (eta) — non-null
 *   • port (destPort or originPort) — non-empty
 *   • container_count ≥ 1
 *
 * Context inputs (any one):
 *   • ctx.contract_id / ctx.master_contract_id — master contract ID
 *     (validates ALL shipments in the master contract)
 *   • ctx.shipment_id — single shipment ID (validates just that shipment)
 *   • ctx.trade_id — Trade row ID (validates all shipments under the trade)
 *
 * If none of the above are supplied, returns a CRITICAL fail with a
 * descriptive remediation.
 */
export async function validateG2UMS1(ctx: GateContext): Promise<GateResult> {
  const masterContractId = resolveMasterContractId(ctx);
  const shipmentId = resolveShipmentId(ctx);
  const tradeId = ctx.trade_id;

  if (!masterContractId && !shipmentId && !tradeId) {
    return {
      gateId: "G2U-MS1",
      passed: false,
      severity: "CRITICAL",
      message: "G2U-MS1 requires contract_id (master_contract_id), shipment_id, or trade_id in the context.",
      remediation: "Provide a master_contract_id (via contract_id), a shipment_id, or a trade_id to validate the multi-shipment schedule.",
    };
  }

  try {
    let shipments: any[] = [];
    let resolvedTradeId: string | null = null;

    if (shipmentId) {
      const shipment = await db.shipment.findUnique({
        where: { id: shipmentId },
        include: { trade: true },
      });
      if (!shipment) {
        return {
          gateId: "G2U-MS1",
          passed: false,
          severity: "CRITICAL",
          message: `Shipment ${shipmentId} not found — cannot validate schedule.`,
          remediation: "Provide a valid shipment_id.",
        };
      }
      shipments = [shipment];
      resolvedTradeId = shipment.tradeId;
    } else if (masterContractId) {
      const trade = await db.trade.findFirst({
        where: { masterContractId },
        include: { shipments: true },
      });
      if (!trade) {
        return {
          gateId: "G2U-MS1",
          passed: false,
          severity: "CRITICAL",
          message: `Master contract ${masterContractId} not found — cannot validate schedule.`,
          remediation: "Provide a valid master_contract_id.",
        };
      }
      shipments = (trade.shipments || []) as any[];
      resolvedTradeId = trade.id;
    } else if (tradeId) {
      const trade = await db.trade.findUnique({
        where: { id: tradeId },
        include: { shipments: true },
      });
      if (!trade) {
        return {
          gateId: "G2U-MS1",
          passed: false,
          severity: "CRITICAL",
          message: `Trade ${tradeId} not found — cannot validate schedule.`,
          remediation: "Provide a valid trade_id.",
        };
      }
      shipments = (trade.shipments || []) as any[];
      resolvedTradeId = trade.id;
    }

    if (shipments.length === 0) {
      return {
        gateId: "G2U-MS1",
        passed: false,
        severity: "CRITICAL",
        message: `No shipments found — multi-shipment contract requires at least 2 shipments (v17 §5.6).`,
        remediation: `Add shipments to ${resolvedTradeId ? `trade ${resolvedTradeId}` : `master contract ${masterContractId}`} via /api/sgtx/contract/multi-shipment/create.`,
      };
    }

    const missingFields: string[] = [];
    for (const s of shipments) {
      const seq = s.sequence;
      if (!s.eta) {
        missingFields.push(`Shipment #${seq} missing delivery_date (eta).`);
      }
      if (!s.destPort && !s.originPort) {
        missingFields.push(`Shipment #${seq} missing port (originPort/destPort).`);
      }
      const cc = Number(s.containerCount);
      if (!Number.isFinite(cc) || cc < 1) {
        missingFields.push(`Shipment #${seq} container_count must be ≥1 (got ${s.containerCount}).`);
      }
    }

    if (missingFields.length === 0) {
      return {
        gateId: "G2U-MS1",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS1 PASS — all ${shipments.length} shipment(s) have delivery_date, port, and container_count.`,
      };
    }

    return {
      gateId: "G2U-MS1",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS1 FAIL — ${missingFields.length} schedule gap(s): ${missingFields.join("; ")}`,
      remediation: missingFields.join(" "),
    };
  } catch (e: any) {
    logger.error("[G2U-MS1] validator threw:", e);
    return {
      gateId: "G2U-MS1",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS1 validator threw: ${e?.message || String(e)}`,
      remediation: "Escalate to SGTX support.",
    };
  }
}

// ============ G2U-MS2 — Per-shipment fee calculated correctly (1.5%) ============

/**
 * G2U-MS2 — Per-shipment fee calculated correctly (1.5% per shipment).
 *
 * For every LOCKED shipment, the FeeLock.sgtxFeeUsd must equal the per-shipment
 * trade value × 1.5%. The per-shipment value is derived from the FeeLock's
 * totalAmountUsd minus the sgtxFeeUsd (i.e. the principal amount). For
 * UNLOCKED shipments, the gate is advisory (the fee is calculated at lock
 * time, so there's nothing to validate yet — we report the planned fees
 * instead).
 *
 * Context inputs:
 *   • ctx.contract_id / ctx.master_contract_id — master contract ID
 *   • ctx.shipment_id — single shipment ID
 *   • ctx.trade_id — Trade row ID
 */
export async function validateG2UMS2(ctx: GateContext): Promise<GateResult> {
  const masterContractId = resolveMasterContractId(ctx);
  const shipmentId = resolveShipmentId(ctx);
  const tradeId = ctx.trade_id;

  if (!masterContractId && !shipmentId && !tradeId) {
    return {
      gateId: "G2U-MS2",
      passed: false,
      severity: "CRITICAL",
      message: "G2U-MS2 requires contract_id (master_contract_id), shipment_id, or trade_id in the context.",
      remediation: "Provide a master_contract_id (via contract_id), a shipment_id, or a trade_id to validate per-shipment fees.",
    };
  }

  try {
    // Resolve shipments
    let shipments: any[] = [];
    if (shipmentId) {
      const shipment = await db.shipment.findUnique({
        where: { id: shipmentId },
      });
      if (!shipment) {
        return {
          gateId: "G2U-MS2",
          passed: false,
          severity: "CRITICAL",
          message: `Shipment ${shipmentId} not found.`,
          remediation: "Provide a valid shipment_id.",
        };
      }
      shipments = [shipment];
    } else if (masterContractId) {
      const trade = await db.trade.findFirst({
        where: { masterContractId },
        include: { shipments: true },
      });
      if (!trade) {
        return {
          gateId: "G2U-MS2",
          passed: false,
          severity: "CRITICAL",
          message: `Master contract ${masterContractId} not found.`,
          remediation: "Provide a valid master_contract_id.",
        };
      }
      shipments = (trade.shipments || []) as any[];
    } else if (tradeId) {
      const trade = await db.trade.findUnique({
        where: { id: tradeId },
        include: { shipments: true },
      });
      if (!trade) {
        return {
          gateId: "G2U-MS2",
          passed: false,
          severity: "CRITICAL",
          message: `Trade ${tradeId} not found.`,
          remediation: "Provide a valid trade_id.",
        };
      }
      shipments = (trade.shipments || []) as any[];
    }

    // Filter to LOCKED shipments with real per-shipment USTNs (not the
    // unlocked placeholder). Only these have a FeeLock to validate.
    const lockedShipments = shipments.filter(
      (s) => s.status === "LOCKED" && s.ustn && !s.ustn.includes("#UNLOCKED-"),
    );

    if (lockedShipments.length === 0) {
      // Advisory: no locked shipments yet — fee calculation deferred to lock time.
      return {
        gateId: "G2U-MS2",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS2 PASS (advisory) — 0/${shipments.length} shipment(s) locked. Per-shipment fees will be calculated at 1.5% × shipmentValue at lock time (v17 §5.6).`,
      };
    }

    // Look up the FeeLock for each locked shipment's USTN.
    const lockedUstns = lockedShipments.map((s) => s.ustn);
    const feeLocks = await db.feeLock.findMany({
      where: { ustn: { in: lockedUstns } },
      select: { ustn: true, sgtxFeeUsd: true, totalAmountUsd: true, status: true },
    });

    const feeLockByUstn = new Map<string, any>();
    for (const fl of feeLocks) {
      // Keep the most recent FeeLock per USTN (status ACTIVE preferred)
      const prev = feeLockByUstn.get(fl.ustn);
      if (!prev || (fl.status === "ACTIVE" && prev.status !== "ACTIVE")) {
        feeLockByUstn.set(fl.ustn, fl);
      }
    }

    const mismatches: string[] = [];
    for (const s of lockedShipments) {
      const fl = feeLockByUstn.get(s.ustn);
      if (!fl) {
        mismatches.push(`Shipment #${s.sequence} (${s.ustn}): no FeeLock record found.`);
        continue;
      }
      const principal = Number(fl.totalAmountUsd) - Number(fl.sgtxFeeUsd);
      const expectedFee = computeShipmentFee(principal);
      const actualFee = Number(fl.sgtxFeeUsd);
      // Allow a 1-cent rounding tolerance
      if (Math.abs(actualFee - expectedFee) > 0.01) {
        mismatches.push(
          `Shipment #${s.sequence} (${s.ustn}): fee mismatch — expected $${expectedFee.toFixed(2)} (1.5% × $${principal.toFixed(2)}), got $${actualFee.toFixed(2)}.`,
        );
      }
    }

    if (mismatches.length === 0) {
      return {
        gateId: "G2U-MS2",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS2 PASS — all ${lockedShipments.length} locked shipment(s) have correct per-shipment fees (1.5% × shipmentValue).`,
      };
    }

    return {
      gateId: "G2U-MS2",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS2 FAIL — ${mismatches.length} fee mismatch(es): ${mismatches.join("; ")}`,
      remediation: mismatches.join(" "),
    };
  } catch (e: any) {
    logger.error("[G2U-MS2] validator threw:", e);
    return {
      gateId: "G2U-MS2",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS2 validator threw: ${e?.message || String(e)}`,
      remediation: "Escalate to SGTX support.",
    };
  }
}

// ============ G2U-MS3 — Schedule modification only on unlocked shipments ============

/**
 * G2U-MS3 — Schedule modification only on unlocked shipments.
 *
 * Validates that no MULTI_SHIPMENT_SCHEDULE_ADDENDUM Activity entries have
 * been recorded for shipments whose current status is LOCKED/IN_TRANSIT/
 * DELIVERED. The lib function modifyShipmentSchedule enforces this at write
 * time, so a violation here indicates either:
 *   (a) the shipment was locked AFTER an addendum was recorded (legitimate —
 *       the addendum was applied when the shipment was still unlocked), or
 *   (b) an out-of-band modification bypassed the gate (audit flag).
 *
 * This gate walks the Activity log for the master contract + cross-references
 * each addendum's shipment_id against the shipment's CURRENT status. A
 * violation is flagged when a shipment is currently LOCKED but its most
 * recent addendum was added AFTER its lockedAt timestamp (which would
 * indicate an attempted modification of a locked shipment).
 *
 * Context inputs:
 *   • ctx.contract_id / ctx.master_contract_id — master contract ID
 *   • ctx.shipment_id — single shipment ID
 *   • ctx.trade_id — Trade row ID
 */
export async function validateG2UMS3(ctx: GateContext): Promise<GateResult> {
  const masterContractId = resolveMasterContractId(ctx);
  const shipmentId = resolveShipmentId(ctx);
  const tradeId = ctx.trade_id;

  if (!masterContractId && !shipmentId && !tradeId) {
    return {
      gateId: "G2U-MS3",
      passed: false,
      severity: "CRITICAL",
      message: "G2U-MS3 requires contract_id (master_contract_id), shipment_id, or trade_id in the context.",
      remediation: "Provide a master_contract_id (via contract_id), a shipment_id, or a trade_id to validate schedule-modification lock-state.",
    };
  }

  try {
    // Resolve the trade
    let trade: any = null;
    if (shipmentId) {
      const shipment = await db.shipment.findUnique({
        where: { id: shipmentId },
        include: { trade: true },
      });
      trade = shipment?.trade;
    } else if (masterContractId) {
      trade = await db.trade.findFirst({
        where: { masterContractId },
        include: { shipments: true },
      });
    } else if (tradeId) {
      trade = await db.trade.findUnique({
        where: { id: tradeId },
        include: { shipments: true },
      });
    }
    if (!trade) {
      return {
        gateId: "G2U-MS3",
        passed: false,
        severity: "CRITICAL",
        message: `Trade/master-contract not found — cannot validate schedule-modification lock-state.`,
        remediation: "Provide a valid master_contract_id, shipment_id, or trade_id.",
      };
    }

    // Walk Activity log for addenda
    const addendumActivities = await db.activity.findMany({
      where: {
        tradeId: trade.id,
        action: "MULTI_SHIPMENT_SCHEDULE_ADDENDUM",
      },
      orderBy: { createdAt: "asc" },
    });

    if (addendumActivities.length === 0) {
      return {
        gateId: "G2U-MS3",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS3 PASS — no schedule addenda recorded for master contract ${trade.masterContractId}.`,
      };
    }

    // Build shipment_id → shipment row lookup
    const shipments = (trade.shipments || []) as any[];
    const shipmentById = new Map<string, any>();
    for (const s of shipments) shipmentById.set(s.id, s);

    const violations: string[] = [];
    for (const a of addendumActivities) {
      let meta: any = {};
      try { meta = JSON.parse(a.metadata || "{}"); } catch { continue; }
      const sid = meta.shipment_id;
      if (!sid) continue;
      const s = shipmentById.get(sid);
      if (!s) {
        violations.push(`Addendum ${meta.addendum_id || "?"} references unknown shipment ${sid}.`);
        continue;
      }
      const lockedStatuses = ["LOCKED", "IN_TRANSIT", "ARRIVED", "DELIVERED", "COMPLETED"];
      if (lockedStatuses.includes(s.status)) {
        // Check whether the addendum was added AFTER the lock timestamp
        const lockTs = s.releasedAt ? new Date(s.releasedAt) : null;
        const addendumTs = new Date(a.createdAt);
        if (lockTs && addendumTs > lockTs) {
          violations.push(
            `Shipment #${s.sequence} was ${s.status} (locked at ${lockTs.toISOString()}) but an addendum was added at ${addendumTs.toISOString()} — out-of-band modification of a locked shipment.`,
          );
        }
        // If the addendum was added BEFORE the lock, it's legitimate — the
        // shipment was unlocked at the time, then locked afterwards.
      }
    }

    if (violations.length === 0) {
      return {
        gateId: "G2U-MS3",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS3 PASS — all ${addendumActivities.length} addendum/addenda were applied to unlocked shipments (no out-of-band modifications of locked shipments).`,
      };
    }

    return {
      gateId: "G2U-MS3",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS3 FAIL — ${violations.length} violation(s): ${violations.join("; ")}`,
      remediation: violations.join(" "),
    };
  } catch (e: any) {
    logger.error("[G2U-MS3] validator threw:", e);
    return {
      gateId: "G2U-MS3",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS3 validator threw: ${e?.message || String(e)}`,
      remediation: "Escalate to SGTX support.",
    };
  }
}

// ============ G2U-MS4 — Schedule modification reason ≥20 chars ============

/**
 * G2U-MS4 — Schedule modification reason ≥20 chars.
 *
 * Validates that EVERY MULTI_SHIPMENT_SCHEDULE_ADDENDUM Activity entry has
 * a `reason` field in its metadata with at least MIN_REASON_LENGTH (20)
 * characters. The lib function modifyShipmentSchedule enforces this at
 * write time, so a violation here indicates an out-of-band modification
 * that bypassed the gate (audit flag).
 *
 * Context inputs:
 *   • ctx.contract_id / ctx.master_contract_id — master contract ID
 *   • ctx.shipment_id — single shipment ID
 *   • ctx.trade_id — Trade row ID
 */
export async function validateG2UMS4(ctx: GateContext): Promise<GateResult> {
  const masterContractId = resolveMasterContractId(ctx);
  const shipmentId = resolveShipmentId(ctx);
  const tradeId = ctx.trade_id;

  if (!masterContractId && !shipmentId && !tradeId) {
    return {
      gateId: "G2U-MS4",
      passed: false,
      severity: "CRITICAL",
      message: "G2U-MS4 requires contract_id (master_contract_id), shipment_id, or trade_id in the context.",
      remediation: "Provide a master_contract_id (via contract_id), a shipment_id, or a trade_id to validate schedule-modification reasons.",
    };
  }

  try {
    // Resolve the trade
    let trade: any = null;
    if (shipmentId) {
      const shipment = await db.shipment.findUnique({
        where: { id: shipmentId },
        include: { trade: true },
      });
      trade = shipment?.trade;
    } else if (masterContractId) {
      trade = await db.trade.findFirst({
        where: { masterContractId },
      });
    } else if (tradeId) {
      trade = await db.trade.findUnique({
        where: { id: tradeId },
      });
    }
    if (!trade) {
      return {
        gateId: "G2U-MS4",
        passed: false,
        severity: "CRITICAL",
        message: `Trade/master-contract not found — cannot validate schedule-modification reasons.`,
        remediation: "Provide a valid master_contract_id, shipment_id, or trade_id.",
      };
    }

    const addendumActivities = await db.activity.findMany({
      where: {
        tradeId: trade.id,
        action: "MULTI_SHIPMENT_SCHEDULE_ADDENDUM",
      },
      orderBy: { createdAt: "asc" },
    });

    if (addendumActivities.length === 0) {
      return {
        gateId: "G2U-MS4",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS4 PASS — no schedule addenda recorded for master contract ${trade.masterContractId}.`,
      };
    }

    const violations: string[] = [];
    for (const a of addendumActivities) {
      let meta: any = {};
      try { meta = JSON.parse(a.metadata || "{}"); } catch {
        violations.push(`Addendum activity ${a.id} has malformed metadata — cannot extract reason.`);
        continue;
      }
      const reason = String(meta.reason || "").trim();
      if (reason.length < MIN_REASON_LENGTH) {
        violations.push(
          `Addendum ${meta.addendum_id || a.id} for shipment ${meta.shipment_id || "?"} has reason "${reason}" (${reason.length} chars) — must be ≥${MIN_REASON_LENGTH} chars (v17 §5.6).`,
        );
      }
    }

    if (violations.length === 0) {
      return {
        gateId: "G2U-MS4",
        passed: true,
        severity: "CRITICAL",
        message: `G2U-MS4 PASS — all ${addendumActivities.length} addendum/addenda have reasons ≥${MIN_REASON_LENGTH} chars.`,
      };
    }

    return {
      gateId: "G2U-MS4",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS4 FAIL — ${violations.length} violation(s): ${violations.join("; ")}`,
      remediation: violations.join(" "),
    };
  } catch (e: any) {
    logger.error("[G2U-MS4] validator threw:", e);
    return {
      gateId: "G2U-MS4",
      passed: false,
      severity: "CRITICAL",
      message: `G2U-MS4 validator threw: ${e?.message || String(e)}`,
      remediation: "Escalate to SGTX support.",
    };
  }
}

// ============ Re-exports ============

export const MULTI_SHIPMENT_GATE_IDS = ["G2U-MS1", "G2U-MS2", "G2U-MS3", "G2U-MS4"] as const;

export const MULTI_SHIPMENT_GATE_DESCRIPTIONS: Record<string, string> = {
  "G2U-MS1": "Multi-shipment schedule fully defined (delivery_date + port + container_count for every shipment)",
  "G2U-MS2": "Per-shipment SGTX fee calculated correctly (1.5% × shipmentValue per shipment)",
  "G2U-MS3": "Schedule modification only on unlocked shipments (no out-of-band mods of locked shipments)",
  "G2U-MS4": `Schedule modification reason ≥${MIN_REASON_LENGTH} chars (every addendum has a documented rationale)`,
};

export {
  SGTX_FEE_RATE_PER_SHIPMENT,
  MIN_REASON_LENGTH,
};
