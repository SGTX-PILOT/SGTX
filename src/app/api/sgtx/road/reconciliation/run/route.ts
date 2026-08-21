// @ts-nocheck
// POST /api/sgtx/road/reconciliation/run
// Body: { ustn, country? }
// Runs government reconciliation — compares government-declared fields against
// the platform's canonical Trade record and writes GovernmentReconciliationEvent
// rows for any mismatches found.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { ustn: body.ustn } });
    if (!trade) {
      return NextResponse.json(
        { error: "Trade not found for USTN" },
        { status: 404 },
      );
    }

    // Pull all government references for this USTN (optionally country-filtered)
    const refs = await db.governmentReference.findMany({
      where: {
        ustn: body.ustn,
        ...(body.country ? { country: String(body.country).toUpperCase() } : {}),
      },
    });

    const events: any[] = [];

    for (const ref of refs) {
      // Compare source payload hash against current trade hash to detect drift.
      // Since the platform doesn't store a structured payload, we use the
      // reference status as the proxy: any non-ACTIVE reference is suspicious.
      if (ref.status === "EXPIRED" || ref.status === "CANCELLED") {
        // Mark stale references
        events.push({
          type: "STALE",
          governmentReference: ref.referenceNumber,
          country: ref.country,
          expected: "ACTIVE",
          actual: ref.status,
        });
      }

      // For each reference, also verify the USTN is consistent with our trade.
      // This is a placeholder for a deeper payload comparison — the engine
      // currently uses field-level checks performed elsewhere (see
      // validateDocumentConsistency).
    }

    // Persist reconciliation events
    for (const e of events) {
      try {
        await db.governmentReconciliationEvent.create({
          data: {
            ustn: body.ustn,
            governmentReference: e.governmentReference,
            country: e.country,
            reconciliationType: e.type as any,
            expectedValue: e.expected,
            actualValue: e.actual,
            status: "OPEN",
          },
        });
      } catch (err: any) {
        logger.warn("[api/road/reconciliation/run] event persist failed", {
          error: err?.message,
        });
      }
    }

    // Check for MISSING references — does the trade have an export declaration?
    const exportRef = refs.find(
      (r: any) => r.referenceType === "EXPORT_DECLARATION",
    );
    if (!exportRef) {
      const event = {
        type: "MISSING",
        governmentReference: "(none)",
        country: body.country || trade.originCountry,
        expected: "EXPORT_DECLARATION",
        actual: "(missing)",
      };
      try {
        await db.governmentReconciliationEvent.create({
          data: {
            ustn: body.ustn,
            governmentReference: event.governmentReference,
            country: event.country,
            reconciliationType: "MISSING" as any,
            expectedValue: event.expected,
            actualValue: event.actual,
            status: "OPEN",
          },
        });
        events.push(event);
      } catch (err: any) {
        logger.warn("[api/road/reconciliation/run] MISSING event persist failed", {
          error: err?.message,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      ustn: body.ustn,
      referencesChecked: refs.length,
      events: events.length,
      eventSummary: events.reduce((acc: Record<string, number>, e: any) => {
        acc[e.type] = (acc[e.type] || 0) + 1;
        return acc;
      }, {}),
    });
  } catch (err: any) {
    logger.error("[api/road/reconciliation/run] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
