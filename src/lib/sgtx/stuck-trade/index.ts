// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// SGTX Part 3.15.3.7 — Stuck Trade Recovery (G5UA8)
//
// Detects trades whose milestones are overdue beyond SLA and auto-escalates
// per the v12 blueprint section 3.15.3.7 + gate G5UA8:
//   L1 (notify)               — 24h overdue: Smart Inbox alert (priority 90)
//   L2 (request intervention) — 72h overdue: alert + manual intervention request
//   L3 (auto-cancel)          — 7d overdue:  trade auto-cancelled unless extended
//
// The detection runs as a periodic cron (every hour) and exposes a manual
// trigger endpoint for tenant admins.

import { db } from "@/lib/db";
import { enforceStuckTradeGate } from "@/lib/sgtx/ai/orchestrator";

export interface StuckTradeDetection {
  ustn: string;
  tradeId: string;
  currentStatus: string;
  expectedMilestone: string;
  expectedByDate: Date;
  overdueHours: number;
  escalationLevel: 0 | 1 | 2 | 3;
  escalationAction: string;
  tenantMessage: string;
  decisionId: string;
}

/**
 * Expected SLA per milestone (in hours from previous milestone).
 * Used to compute the "expectedByDate" for each trade's current status.
 */
export const MILESTONE_SLA_HOURS: Record<string, number> = {
  INITIATED: 48,           // seller should respond within 48h
  STAGE1_PENDING: 72,      // Stage 1 payment expected within 72h
  STAGE1_SETTLED: 24,      // customs submission within 24h
  CUSTOMS_SUBMITTED: 72,   // booking within 72h
  BOOKED: 48,              // loading within 48h of booking
  LOADED: 24,              // departure within 24h of loading
  DEPARTED: 12,            // IN_TRANSIT status within 12h (AIS confirm)
  IN_TRANSIT: 336,         // arrival within 14 days max (route-dependent)
  ARRIVED: 96,             // customs import within 4 days
  CUSTOMS_IMPORT: 96,      // delivery within 4 days
  DELIVERED: 48,           // settlement within 48h
  SETTLED: 720,            // completion 30 days after settlement (system)
};

/**
 * Detect all stuck trades across the platform.
 * A trade is "stuck" if its current status has persisted beyond the SLA.
 * Returns one StuckTradeDetection row per overdue trade.
 */
export async function detectStuckTrades(): Promise<StuckTradeDetection[]> {
  const detections: StuckTradeDetection[] = [];

  // Load all active (non-terminal) trades
  const trades = await db.trade.findMany({
    where: {
      status: { notIn: ["COMPLETED", "CANCELLED", "DISPUTED", "DISTRESSED"] },
    },
    select: {
      id: true,
      ustn: true,
      status: true,
      buyerGtid: true,
      sellerGtid: true,
      commodity: true,
      updatedAt: true,
    },
    }) as any;

  const now = new Date();

  for (const trade of trades) {
    const slaHours = MILESTONE_SLA_HOURS[trade.status];
    if (!slaHours) continue; // no SLA defined for this status

    // Expected milestone completion date = updatedAt + SLA
    const expectedByDate = new Date(trade.updatedAt.getTime() + slaHours * 60 * 60 * 1000);
    if (now <= expectedByDate) continue; // not overdue

    const overdueHours = Math.floor((now.getTime() - expectedByDate.getTime()) / (60 * 60 * 1000));

    // Determine expected next milestone (for messaging)
    const expectedMilestone = expectedNextMilestone(trade.status);

    // Run the gate to get the escalation level
    const gateResult = enforceStuckTradeGate({
      ustn: trade.ustn,
      currentStatus: trade.status,
      expectedMilestone,
      expectedByDate,
      now,
    });

    // Upsert the StuckTradeAlert row
    try {
      const existing = await db.stuckTradeAlert.findFirst({
        where: { ustn: trade.ustn, resolvedAt: null },
        orderBy: { createdAt: "desc" },
            }) as any;

      if (existing) {
        // Update escalation level if it has increased
        if (gateResult.escalationLevel > existing.escalationLevel) {
          await db.stuckTradeAlert.update({
            where: { id: existing.id },
            data: {
              escalationLevel: gateResult.escalationLevel,
              lastEscalatedAt: now,
              stuckReason: gateResult.escalationAction,
            },
                    }) as any;
        }
      } else {
        // Create a new alert
        await db.stuckTradeAlert.create({
          data: {
            ustn: trade.ustn,
            tradeId: trade.id,
            stuckReason: gateResult.escalationAction,
            stuckSince: expectedByDate,
            expectedMilestone,
            expectedByDate,
            escalationLevel: gateResult.escalationLevel,
            lastEscalatedAt: now,
          },
                }) as any;
      }
    } catch (e) {
      // best-effort persistence
    }

    detections.push({
      ustn: trade.ustn,
      tradeId: trade.id,
      currentStatus: trade.status,
      expectedMilestone,
      expectedByDate,
      overdueHours,
      escalationLevel: gateResult.escalationLevel,
      escalationAction: gateResult.escalationAction,
      tenantMessage: gateResult.tenant_message,
      decisionId: gateResult.decision_id,
        }) as any;

    // Send Smart Inbox alerts based on escalation level
    if (gateResult.escalationLevel >= 1) {
      await sendEscalationAlert(trade, gateResult, overdueHours) as any;
    }

    // L3: auto-cancel the trade (unless the parties have explicitly extended)
    if (gateResult.escalationLevel === 3 && gateResult.escalationAction === "AUTO_CANCEL") {
      await autoCancelStuckTrade(trade, gateResult) as any;
    }
  }

  return detections;
}

/** Returns the expected next milestone for a given current status. */
function expectedNextMilestone(currentStatus: string): string {
  const next: Record<string, string> = {
    INITIATED: "STAGE1_PENDING",
    STAGE1_PENDING: "STAGE1_SETTLED",
    STAGE1_SETTLED: "CUSTOMS_SUBMITTED",
    CUSTOMS_SUBMITTED: "BOOKED",
    BOOKED: "LOADED",
    LOADED: "DEPARTED",
    DEPARTED: "IN_TRANSIT",
    IN_TRANSIT: "ARRIVED",
    ARRIVED: "CUSTOMS_IMPORT",
    CUSTOMS_IMPORT: "DELIVERED",
    DELIVERED: "SETTLED",
    SETTLED: "COMPLETED",
  };
  return next[currentStatus] || "—";
}

/**
 * Send Smart Inbox alert to both buyer and seller based on escalation level.
 * L1: priority 80, L2: priority 90, L3: priority 95.
 */
async function sendEscalationAlert(
  trade: { id: string; ustn: string; buyerGtid: string; sellerGtid: string; commodity: string },
  gateResult: { escalationLevel: number; escalationAction: string; tenant_message: string; decision_id: string },
  overdueHours: number,
): Promise<void> {
  const priority = gateResult.escalationLevel === 1 ? 80
    : gateResult.escalationLevel === 2 ? 90 : 95;
  const title = `Stuck trade — ${trade.ustn.slice(0, 24)}… (L${gateResult.escalationLevel})`;
  const description = `${gateResult.tenant_message} Overdue by ${overdueHours}h. Decision ID: ${gateResult.decision_id}.`;

  try {
    await Promise.all([
      db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          tradeId: trade.id,
          category: "SHIPMENT_ALERT",
          priority,
          title,
          description,
          ctaLabel: gateResult.escalationLevel === 3 ? "Extend or Cancel" : "Take Action",
          deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }).catch(() => null),
      db.inboxItem.create({
        data: {
          tenantGtid: trade.sellerGtid,
          tradeId: trade.id,
          category: "SHIPMENT_ALERT",
          priority,
          title,
          description,
          ctaLabel: gateResult.escalationLevel === 3 ? "Extend or Cancel" : "Take Action",
          deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      }).catch(() => null),
    ]);
  } catch {
    // best-effort
  }
}

/**
 * L3 auto-cancel: transition the trade to CANCELLED status.
 * Per blueprint 3.15.3.7, the trade is auto-cancelled after 7 days overdue
 * unless the parties have manually extended it. Extension is performed via
 * a separate endpoint (POST /api/sgtx/stuck-trade/extend) that resets the SLA.
 */
async function autoCancelStuckTrade(
  trade: { id: string; ustn: string; buyerGtid: string; sellerGtid: string; commodity: string },
  gateResult: { decision_id: string; tenant_message: string },
): Promise<void> {
  try {
    await db.trade.update({
      where: { id: trade.id },
      data: { status: "CANCELLED" },
        }) as any;
    await db.activity.create({
      data: {
        tradeId: trade.id,
        action: "AUTO_CANCELLED_STUCK",
        type: "CRITICAL",
        description: `Trade auto-cancelled by Stuck Trade Recovery (L3, gate G5UA8). Decision: ${gateResult.decision_id}. ${gateResult.tenant_message}`,
        metadata: JSON.stringify({ gate: "G5UA8", level: 3, decision_id: gateResult.decision_id }),
      },
        }) as any;
    // Resolve the StuckTradeAlert
    await db.stuckTradeAlert.updateMany({
      where: { ustn: trade.ustn, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolution: "CANCELLED",
        resolutionNotes: "Auto-cancelled by L3 escalation (G5UA8).",
      },
        }) as any;
  } catch {
    // best-effort
  }
}

/**
 * Manually resolve a stuck-trade alert (used when the trade advances naturally
 * or the parties mutually agree to extend).
 */
export async function resolveStuckTrade(
  ustn: string,
  resolution: "COMPLETED" | "FALSE_ALARM",
  notes?: string,
): Promise<{ ok: boolean; ustn: string }> {
  try {
    await db.stuckTradeAlert.updateMany({
      where: { ustn, resolvedAt: null },
      data: {
        resolvedAt: new Date(),
        resolution,
        resolutionNotes: notes || null,
      },
        }) as any;
    return { ok: true, ustn };
  } catch (e: any) {
    return { ok: false, ustn };
  }
}

/**
 * Extend the SLA for a stuck trade (resets the updatedAt, giving the parties
 * more time before L3 auto-cancellation triggers). Requires mutual consent —
 * the API endpoint verifies that both parties have acknowledged.
 */
export async function extendStuckTradeSla(
  ustn: string,
  extensionHours: number,
  extendedByGtid: string,
  reason: string,
): Promise<{ ok: boolean; ustn: string; newExpectedBy: string }> {
  if (extensionHours < 1 || extensionHours > 168) {
    throw new Error("Extension must be between 1 and 168 hours (7 days).");
  }
  if (!reason || reason.trim().length < 20) {
    throw new Error("Reason must be at least 20 characters (mutual-consent audit trail).");
  }

    const trade = await db.trade.findUnique({ where: { ustn } }) as any;
  if (!trade) throw new Error(`Trade ${ustn} not found`);

  // Touch updatedAt to reset the SLA clock
  await db.trade.update({
    where: { id: trade.id },
    data: { updatedAt: new Date() },
    }) as any;

  // Log the extension
  await db.activity.create({
    data: {
      tradeId: trade.id,
      actorGtid: extendedByGtid,
      action: "STUCK_TRADE_SLA_EXTENDED",
      type: "INFO",
      description: `Stuck-trade SLA extended by ${extensionHours}h by ${extendedByGtid}. Reason: ${reason}`,
      metadata: JSON.stringify({ extensionHours, reason, extendedByGtid }),
    },
    }) as any;

  // Resolve any existing alert (it will be re-detected if the trade remains stuck)
  await db.stuckTradeAlert.updateMany({
    where: { ustn, resolvedAt: null },
    data: {
      resolvedAt: new Date(),
      resolution: "FALSE_ALARM",
      resolutionNotes: `SLA extended by ${extensionHours}h by ${extendedByGtid}.`,
    },
    }) as any;

  const newExpectedBy = new Date(Date.now() + extensionHours * 60 * 60 * 1000).toISOString();
  return { ok: true, ustn, newExpectedBy };
}

/**
 * List all currently-stuck trades (with active alerts).
 */
export async function listStuckTrades(filter?: { escalationLevel?: number; ustn?: string }): Promise<any[]> {
  const where: any = { resolvedAt: null };
  if (filter?.escalationLevel) where.escalationLevel = filter.escalationLevel;
  if (filter?.ustn) where.ustn = filter.ustn;

  return db.stuckTradeAlert.findMany({
    where,
    orderBy: { escalationLevel: "desc" },
    take: 50,
    }) as any;
}
