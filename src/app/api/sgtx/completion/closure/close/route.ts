// @ts-nocheck
// §6 Trade Closure — close trade (THE USTN_CLOSED GATE).
// Body: { ustn, closedBy }
// Returns closureState + any unmet conditions (REFUSES to fabricate closure
// if `evaluateClosureReadiness` returns allMet=false).
// POST /api/sgtx/completion/closure/close
import { NextResponse } from "next/server";
import { closeTrade, evaluateClosureReadiness } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body.closedBy) {
      return NextResponse.json(
        { error: "closedBy required" },
        { status: 400 },
      );
    }
    const state = await closeTrade(body.ustn, body.closedBy);
    // Re-evaluate to surface any unmet conditions (defensive — closeTrade
    // already ran evaluateClosureReadiness internally; we re-run only to
    // produce a clean unmetConditions array for the response payload).
    let unmetConditions: any[] = [];
    try {
      const readiness = await evaluateClosureReadiness(body.ustn);
      unmetConditions = (readiness.conditions || [])
        .filter((c: any) => !c.met)
        .map((c: any) => ({ id: c.id, label: c.label, notes: c.notes }));
    } catch {
      // Best-effort — the closed/refreshed state is still returned above.
    }
    return NextResponse.json({
      closureState: state,
      unmetConditions,
    });
  } catch (err: any) {
    logger.error("[api/completion/closure/close] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
