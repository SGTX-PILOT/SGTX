// @ts-nocheck
// SGTX v13.1 Art 129 — Stage 5: USTN-Close Ceremony (status + checklist)
// GET /api/sgtx/ustn-close/[ustn]  — returns closure state + 7-condition checklist
import { NextRequest, NextResponse } from "next/server";
import {
  isTradeClosed,
  getClosureChecklist,
  evaluateClosureReadiness,
  CLOSURE_CONDITIONS,
} from "@/lib/sgtx/trade-closure";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    // Closed?
    const closed = await isTradeClosed(ustn);

    // 7-condition checklist.
    let checklist: any[] = [];
    try {
      const c = await getClosureChecklist(ustn);
      checklist = (c || []).map((item) => ({
        id: item.condition,
        label: CLOSURE_CONDITIONS.find((cc) => cc.id === item.condition)?.label || item.condition,
        met: !!item.met,
        notes: item.notes || null,
      }));
    } catch (e: any) {
      logger.warn(
        "[api/sgtx/ustn-close/[ustn]] checklist fetch failed (table missing?)",
        { ustn, error: e?.message },
      );
    }

    // Readiness summary (allMet + readyForClosure).
    let readiness: any = null;
    try {
      readiness = await evaluateClosureReadiness(ustn);
    } catch (e: any) {
      logger.warn(
        "[api/sgtx/ustn-close/[ustn]] readiness evaluation failed (non-blocking)",
        { ustn, error: e?.message },
      );
    }

    // Pull the persisted closure-state row directly (for closedAt/closedBy/notes).
    let closureRow: any = null;
    try {
      closureRow = await db.tradeClosureState.findUnique({
        where: { ustn },
      });
    } catch (e: any) {
      logger.warn(
        "[api/sgtx/ustn-close/[ustn]] closureState fetch failed (table missing?)",
        { ustn, error: e?.message },
      );
    }

    const closureState = closureRow?.closureState || "OPEN";
    return NextResponse.json({
      ustn,
      closed,
      closureState,
      closedAt: closureRow?.closedAt || null,
      closedBy: closureRow?.closedBy || null,
      readyForClosure: readiness?.readyForClosure || false,
      allConditionsMet: readiness?.allMet || false,
      checklist,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/ustn-close/[ustn]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
