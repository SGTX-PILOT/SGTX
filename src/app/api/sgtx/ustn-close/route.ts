// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 5: USTN-Close Ceremony (wrapper)
// POST /api/sgtx/ustn-close  body: { ustn, closedBy }
//
// Wraps the existing `closeTrade()` (from src/lib/sgtx/trade-closure) with:
//   • canonical event-spine append (USTN_CLOSED or USTN_CLOSED_WITH_OPEN_DISPUTE)
//   • a clean response payload matching Art 129 contract:
//       { closed, ustn, closedAt, conditionsMet, blockers? }
//
// NOTE: The existing closeTrade() function is COMPLETE — it already
// verifies the 7 closure conditions (delivery accepted, settlement complete,
// reconciliation complete, customs complete, post-clearance complete,
// disputes satisfied, evidence sealed) via `evaluateClosureReadiness`. It
// updates the TradeClosureState row (the canonical closure state model —
// NOT Trade.closureState which does not exist). This wrapper is a thin
// ceremony layer + event-spine recorder.
import { NextResponse } from "next/server";
import {
  closeTrade,
  evaluateClosureReadiness,
  CLOSURE_CONDITIONS,
} from "@/lib/sgtx/trade-closure";
import { appendEvent } from "@/lib/sgtx/event-spine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn || typeof body.ustn !== "string") {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.closedBy || typeof body.closedBy !== "string") {
      return NextResponse.json(
        { error: "closedBy required" },
        { status: 400 },
      );
    }
    const ustn = body.ustn;
    const closedBy = body.closedBy;

    // Pre-check: surface conditions BEFORE attempting closeTrade so the
    // response payload includes the `conditionsMet` array even when
    // closeTrade refuses (conditions not met).
    let preReadiness: any = null;
    try {
      preReadiness = await evaluateClosureReadiness(ustn);
    } catch (e: any) {
      logger.warn(
        "[api/sgtx/ustn-close] pre-readiness evaluation failed (non-blocking)",
        { ustn, error: e?.message },
      );
    }
    const conditionsMet = (preReadiness?.conditions || []).map((c: any) => ({
      id: c.id,
      label: CLOSURE_CONDITIONS.find((cc) => cc.id === c.id)?.label || c.id,
      met: !!c.met,
      notes: c.notes || null,
    }));

    // Invoke the canonical closeTrade function. NEVER fabricates closure —
    // if readiness.allMet=false (and the special-case open-dispute path
    // doesn't apply), the closureState stays OPEN or READY_FOR_CLOSURE
    // and the returned `closureBlockers` lists the specific blocker codes.
    const state = await closeTrade(ustn, closedBy);
    const closureState = (state as any)?.closureState || "OPEN";
    const closed =
      closureState === "USTN_CLOSED" ||
      closureState === "USTN_CLOSED_WITH_OPEN_DISPUTE";
    const blockers: string[] = Array.isArray((state as any)?.closureBlockers)
      ? (state as any).closureBlockers
      : [];

    // Append a canonical event to the event spine (non-blocking).
    if (closed) {
      try {
        await appendEvent({
          ustn,
          eventType:
            closureState === "USTN_CLOSED_WITH_OPEN_DISPUTE"
              ? "USTN_CLOSED_WITH_OPEN_DISPUTE"
              : "USTN_CLOSED",
          eventTypeCategory: "CLOSURE",
          actor: closedBy,
          authority: "trade-closure",
          idempotencyKey: `ustn-close:${ustn}:${closureState}`,
          notes: `USTN close ceremony invoked by ${closedBy}. Closure state: ${closureState}.`,
        });
      } catch (e: any) {
        logger.error(
          "[api/sgtx/ustn-close] event-spine append failed (non-blocking)",
          { ustn, error: e?.message },
        );
      }
    }

    return NextResponse.json({
      closed,
      ustn,
      closureState,
      closedAt: (state as any)?.closedAt || null,
      closedBy: (state as any)?.closedBy || (closed ? closedBy : null),
      conditionsMet,
      blockers,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/ustn-close] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
