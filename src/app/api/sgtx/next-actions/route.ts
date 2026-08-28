// @ts-nocheck
// SGTX Part 67 + 106 + 107 — Next Required Actions / Trade Blocker / What Happens Next
// GET /api/sgtx/next-actions?ustn=USTN                              — getNextRequiredActions
// GET /api/sgtx/next-actions?ustn=USTN&view=blocker                 — getTradeBlocker
// GET /api/sgtx/next-actions?ustn=USTN&view=next                    — getWhatHappensNext
import { NextResponse } from "next/server";
import {
  getNextRequiredActions,
  getTradeBlocker,
  getWhatHappensNext,
} from "@/lib/sgtx/next-actions";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn");
    const view = url.searchParams.get("view") || "actions";
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (view === "blocker") {
      const blocker = await getTradeBlocker(ustn);
      return NextResponse.json({ ok: true, ustn, blocker });
    }
    if (view === "next") {
      const steps = await getWhatHappensNext(ustn);
      return NextResponse.json({ ok: true, ustn, nextSteps: steps, count: steps.length });
    }
    const actions = await getNextRequiredActions(ustn);
    return NextResponse.json({ ok: true, ustn, actions, count: actions.length });
  } catch (err: any) {
    logger.error("[api/sgtx/next-actions] GET failed", { error: err?.message });
    return NextResponse.json({ error: err?.message || "internal error" }, { status: 500 });
  }
}
