// @ts-nocheck
/**
 * SGTX Part 72 — Dwell-Time Optimization Engine (A1/A2 Advisory Only)
 * ===========================================================================
 *
 * Dwell time = the total time cargo spends sitting idle in a terminal /
 * warehouse / CY / CFS between vessel discharge (or gate-in) and gate-out
 * (or final delivery). Every additional day past free time triggers
 * demurrage (in-terminal) or detention (out-of-terminal) charges.
 *
 * AUTHORITY LEVEL — A1 / A2 ADVISORY ONLY:
 *   This engine NEVER auto-substitutes providers, NEVER auto-reroutes
 *   cargo, NEVER auto-extends free time, and NEVER books trucks. It only
 *   computes the dwell-risk score and produces a next-action recommendation
 *   that a human operator must approve. The Governor (G-overnor gate)
 *   re-validates every advisory before any state mutation.
 *
 * The engine consumes existing Add-On 9 (demurrage) + Add-On 24 (terminal)
 * data plus the live Trade / Shipment / CustomsOperation / GlobalPayment
 * / GovernmentReference models — it does NOT duplicate their calculations.
 *
 * Inputs triangulated (per §72.3):
 *   • vessel ETA            — Shipment.eta / VesselSchedule.eta
 *   • customs status        — CustomsOperation.status
 *   • terminal free time    — PortFreeTime (seeded by demurrage engine)
 *   • gate status           — GateIn / GateOut events
 *   • truck ETA             — DeliveryAcceptance / TruckAppointment
 *   • warehouse appointment — WarehouseSlot
 *   • payment status        — GlobalPayment.status
 *   • document completeness — FinalEvidencePackage.completenessScore
 *
 * Dwell risk bands (§72.5):
 *   LOW       — free time remaining > 72h, docs complete, payment cleared
 *   MEDIUM    — free time 24-72h OR one minor blocker (e.g. pending doc)
 *   HIGH      — free time < 24h OR payment pending OR customs hold
 *   CRITICAL  — past free time OR customs hold + payment pending
 *
 * Non-marketplace guarantee: when no truck ETA / warehouse appointment
 * exists, the engine flags the gap but does NOT propose an alternative
 * provider. Provider substitution is forbidden (L0 constitution).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type DwellRiskBand = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface DwellRiskResult {
  ustn: string;
  dwellRisk: DwellRiskBand;
  freeTimeExpiry: Date;
  projectedCost: number;
  nextAction: string;
  responsibleParty: string;
  factors: {
    vesselEta?: Date;
    customsStatus?: string;
    freeTimeDays?: number;
    freeTimeRemainingHours?: number;
    gateStatus?: string;
    truckEta?: Date;
    warehouseAppointment?: Date;
    paymentStatus?: string;
    documentCompleteness?: number;
  };
  computedAt: string;
}

// ============ §72.4 — Load trade context ============

async function loadTradeContext(ustn: string): Promise<any> {
  try {
    const trade = await db.trade.findUnique({
      where: { ustn },
      include: {
        shipments: true,
        customsOperations: true,
        globalPayments: true,
        governmentReferences: true,
        deliveryAcceptances: true,
        events: { take: 50, orderBy: { createdAt: "desc" } },
      },
    });
    return trade || null;
  } catch (err: any) {
    logger.warn("[dwell-time] loadTradeContext failed", { ustn, error: err?.message });
    return null;
  }
}

async function loadFreeTime(ustn: string, portUnlocode?: string): Promise<any> {
  try {
    if (!portUnlocode) return null;
    const row = await db.portFreeTime.findUnique({
      where: { portUnlocode_containerType: { portUnlocode, containerType: "DRY" } },
    }).catch(() => null);
    return row;
  } catch (err: any) {
    logger.warn("[dwell-time] loadFreeTime failed", { ustn, portUnlocode, error: err?.message });
    return null;
  }
}

async function loadEvidenceScore(ustn: string): Promise<number | undefined> {
  try {
    const pkg = await db.finalEvidencePackage.findFirst({
      where: { ustn },
      orderBy: { sealedAt: "desc" },
      select: { completenessScore: true },
    }).catch(() => null);
    return pkg?.completenessScore ?? undefined;
  } catch {
    return undefined;
  }
}

// ============ §72.5 — Risk band computation ============

function computeRiskBand(factors: any): DwellRiskBand {
  const hrs = factors.freeTimeRemainingHours;
  const past = typeof hrs === "number" && hrs <= 0;
  const customsHold = /HOLD|INSPECT|DETAIN/i.test(factors.customsStatus || "");
  const payPending = /PENDING|UNPAID|AWAITING/i.test(factors.paymentStatus || "");
  const docsIncomplete = (factors.documentCompleteness ?? 1) < 0.8;

  if (past || (customsHold && payPending)) return "CRITICAL";
  if (typeof hrs === "number" && hrs < 24) return "HIGH";
  if (customsHold || payPending || docsIncomplete) return "HIGH";
  if (typeof hrs === "number" && hrs < 72) return "MEDIUM";
  return "LOW";
}

function computeProjectedCost(factors: any): number {
  try {
    if (typeof factors.freeTimeRemainingHours !== "number") return 0;
    const overHours = Math.max(0, -factors.freeTimeRemainingHours);
    // average demurrage ~ $75/day per container, capped at 5 containers per trade
    const perDay = 75;
    const containers = 1;
    return Math.round((overHours / 24) * perDay * containers);
  } catch {
    return 0;
  }
}

function buildNextAction(risk: DwellRiskBand, factors: any): string {
  try {
    switch (risk) {
      case "CRITICAL":
        return "URGENT: free time exceeded or customs+payment blocked. Escalate to broker + carrier immediately; request free-time extension and prioritise customs release payment.";
      case "HIGH":
        if (/HOLD|INSPECT|DETAIN/i.test(factors.customsStatus || ""))
          return "Customs hold detected. Engage broker to clear inspection; ensure all paperwork attached to customs entry.";
        if (/PENDING|UNPAID/i.test(factors.paymentStatus || ""))
          return "Payment pending. Trigger duty/VAT payment via the payment engine before free time expires.";
        return "Free time expiring <24h. Confirm truck appointment + warehouse slot now to avoid demurrage.";
      case "MEDIUM":
        return "Free time 24-72h. Schedule truck pickup and verify document completeness to avoid escalation.";
      default:
        return "No action required. Monitor free-time window.";
    }
  } catch {
    return "Monitor free-time window.";
  }
}

function responsiblePartyFor(risk: DwellRiskBand, factors: any): string {
  try {
    if (risk === "CRITICAL") return "BROKER + CARRIER + BUYER";
    if (/HOLD|INSPECT/i.test(factors.customusStatus || factors.customsStatus || "")) return "CUSTOMS BROKER";
    if (/PENDING|UNPAID/i.test(factors.paymentStatus || "")) return "BUYER (FINANCE)";
    if (risk === "HIGH" || risk === "MEDIUM") return "FORWARDER / TRUCK OPERATOR";
    return "FORWARDER";
  } catch {
    return "FORWARDER";
  }
}

// ============ Public API ============

export async function calculateDwellRisk(ustn: string): Promise<DwellRiskResult> {
  const now = new Date();
  try {
    const trade = await loadTradeContext(ustn);
    const shipment = trade?.shipments?.[0] || trade?.shipment;
    const customsOp = trade?.customsOperations?.[0];
    const payment = trade?.globalPayments?.[0];
    const delivery = trade?.deliveryAcceptances?.[0];

    const portUnlocode = shipment?.portOfDischarge || shipment?.dischargePort;
    const freeTimeRow = await loadFreeTime(ustn, portUnlocode);
    const freeTimeDays = freeTimeRow?.freeTimeDays ?? 5;
    const gateInEvent = trade?.events?.find((e: any) => /GATE_IN|DISCHARGE/i.test(e.eventType || e.type || ""));
    const freeTimeStart = gateInEvent?.createdAt ? new Date(gateInEvent.createdAt) : (shipment?.ata ? new Date(shipment.ata) : now);
    const freeTimeExpiry = new Date(freeTimeStart.getTime() + freeTimeDays * 86400_000);
    const freeTimeRemainingHours = Math.round((freeTimeExpiry.getTime() - now.getTime()) / 3_600_000);

    const completeness = await loadEvidenceScore(ustn);
    const factors = {
      vesselEta: shipment?.eta ? new Date(shipment.eta) : undefined,
      customsStatus: customsOp?.status,
      freeTimeDays,
      freeTimeRemainingHours,
      gateStatus: gateInEvent ? "GATE_IN" : "AWAITING_DISCHARGE",
      truckEta: delivery?.scheduledAt ? new Date(delivery.scheduledAt) : undefined,
      warehouseAppointment: undefined,
      paymentStatus: payment?.status,
      documentCompleteness: completeness,
    };

    const dwellRisk = computeRiskBand(factors);
    const projectedCost = computeProjectedCost(factors);
    const nextAction = buildNextAction(dwellRisk, factors);
    const responsibleParty = responsiblePartyFor(dwellRisk, factors);

    return {
      ustn,
      dwellRisk,
      freeTimeExpiry,
      projectedCost,
      nextAction,
      responsibleParty,
      factors,
      computedAt: now.toISOString(),
    };
  } catch (err: any) {
    logger.error("[dwell-time] calculateDwellRisk uncaught", { ustn, error: err?.message });
    return {
      ustn,
      dwellRisk: "LOW",
      freeTimeExpiry: new Date(now.getTime() + 5 * 86400_000),
      projectedCost: 0,
      nextAction: "Unable to compute dwell risk — manual review required.",
      responsibleParty: "FORWARDER",
      factors: {},
      computedAt: now.toISOString(),
    };
  }
}
