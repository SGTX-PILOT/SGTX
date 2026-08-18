// POST /api/sgtx/demurrage/track — Create (or update) a tracking record
//
// Body:
//   {
//     ustn, containerNumber, carrierGtid?, portUnlocode, containerType,
//     releaseDate (ISO), gateOutDate? (ISO),
//     freeTimeDays?          // optional — auto-resolved from PORT_FREE_TIME if missing
//     currency? = "USD",
//     governorDecisionId?
//   }
//
// Resolves free time (if not supplied), runs the pure calculateDemurrage()
// engine, and persists a DemurrageTracking row. If a tracking row already
// exists for (ustn + containerNumber), it is updated.
//
// Response:
//   { ok, trackingId, created, calc }
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateDemurrage,
  getPortFreeTime,
  persistDemurrageTracking,
} from "@/lib/sgtx/demurrage";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      containerNumber,
      carrierGtid,
      portUnlocode,
      containerType,
      releaseDate,
      gateOutDate,
      freeTimeDays,
      currency = "USD",
      governorDecisionId,
    } = body || {};

    // Validate required fields
    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!containerNumber) missing.push("containerNumber");
    if (!portUnlocode) missing.push("portUnlocode");
    if (!containerType) missing.push("containerType");
    if (!releaseDate) missing.push("releaseDate");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const releaseDateObj = new Date(releaseDate);
    if (isNaN(releaseDateObj.getTime())) {
      return NextResponse.json({ error: "Invalid releaseDate" }, { status: 400 });
    }

    const gateOutDateObj = gateOutDate ? new Date(gateOutDate) : undefined;
    if (gateOutDate && isNaN(gateOutDateObj!.getTime())) {
      return NextResponse.json({ error: "Invalid gateOutDate" }, { status: 400 });
    }

    // Resolve free time: explicit > port lookup > default 7
    const resolvedFreeTime = typeof freeTimeDays === "number"
      ? freeTimeDays
      : getPortFreeTime(portUnlocode, containerType);

    // Load carrier tariff (defensive)
    let carrierTariff: { demurrageRates: Record<string, number>; detentionRates: Record<string, number> } | undefined;
    try {
      if (carrierGtid) {
        const tariff = await (db as any).carrierDemurrageTariff.findFirst({
          where: { carrierGtid, portUnlocode, containerType, isActive: true },
          orderBy: { validFrom: "desc" },
        });
        if (tariff) {
          carrierTariff = {
            demurrageRates: safeParse(tariff.demurrageRates) || {},
            detentionRates: safeParse(tariff.detentionRates) || {},
          };
        }
      }
    } catch (e: any) {
      logger.warn("[demurrage/track] carrier tariff lookup failed", { error: e?.message });
    }

    // Run the pure calculation
    const calc = calculateDemurrage({
      containerType,
      carrier: carrierGtid || "(unknown)",
      port: portUnlocode,
      releaseDate: releaseDateObj,
      gateOutDate: gateOutDateObj,
      freeTimeDays: resolvedFreeTime,
      carrierTariff,
    });

    // Persist to DemurrageTracking
    const persisted = await persistDemurrageTracking({
      ustn,
      containerNumber,
      carrierGtid,
      portUnlocode,
      containerType,
      freeTimeDays: resolvedFreeTime,
      releaseDate: releaseDateObj,
      gateOutDate: gateOutDateObj,
      calc,
      currency,
      governorDecisionId,
    });

    if (!persisted) {
      return NextResponse.json(
        { ok: false, error: "Calculation succeeded but persistence failed (see server logs)" },
        { status: 500 },
      );
    }

    // Defensive: emit an alert if status indicates escalation or warning
    try {
      await maybeCreateAlert({
        ustn,
        trackingId: persisted.id,
        status: calc.status,
        containerNumber,
        portUnlocode,
        totalAmount: calc.totalAmount,
        excessDays: calc.excessDays,
      });
    } catch (e: any) {
      logger.warn("[demurrage/track] alert creation failed (non-blocking)", { error: e?.message });
    }

    return NextResponse.json({
      ok: true,
      trackingId: persisted.id,
      created: persisted.created,
      calc,
    });
  } catch (e: any) {
    logger.error("[demurrage/track] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}

// ── helpers ──────────────────────────────────────────────────────────────

async function maybeCreateAlert(input: {
  ustn: string;
  trackingId: string;
  status: string;
  containerNumber: string;
  portUnlocode: string;
  totalAmount: number;
  excessDays: number;
}): Promise<void> {
  if (input.status === "FREE_TIME" || input.status === "NOT_STARTED") return;

  const alertTypeMap: Record<string, string> = {
    WARNING_48H: "FREE_TIME_48H",
    WARNING_24H: "FREE_TIME_24H",
    DEMURRAGE_STARTED: "DEMURRAGE_STARTED",
    DETENTION_STARTED: "DEMURRAGE_STARTED",
    ESCALATED: "ESCALATED",
  };
  const alertType = alertTypeMap[input.status];
  if (!alertType) return;

  // Deduplicate — only one alert per (ustn, trackingId, alertType) pair.
  const existing = await (db as any).demurrageAlert.findFirst({
    where: { ustn: input.ustn, demurrageTrackingId: input.trackingId, alertType },
    select: { id: true },
  });
  if (existing) return;

  const message = input.status === "ESCALATED"
    ? `Demurrage ESCALATED — container ${input.containerNumber} at ${input.portUnlocode}: ${input.excessDays} excess days, $${input.totalAmount.toFixed(2)} accrued.`
    : input.status === "DEMURRAGE_STARTED" || input.status === "DETENTION_STARTED"
      ? `Demurrage charges accruing — container ${input.containerNumber} at ${input.portUnlocode}. Total: $${input.totalAmount.toFixed(2)}.`
      : `Free-time warning (${input.status}) — container ${input.containerNumber} at ${input.portUnlocode}. Arrange gate-out.`;

  await (db as any).demurrageAlert.create({
    data: {
      ustn: input.ustn,
      demurrageTrackingId: input.trackingId,
      alertType,
      message,
    },
  });
}

function safeParse(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}
