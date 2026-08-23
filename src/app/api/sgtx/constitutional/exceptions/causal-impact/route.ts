// @ts-nocheck
// §69 Exception Engine — causal impact analysis for an event type
// POST /api/sgtx/constitutional/exceptions/causal-impact  body: { eventType, ustn? }
import { NextResponse } from "next/server";
import { causalImpactAnalysis } from "@/lib/sgtx/exception-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const { eventType, ustn } = body || {};
    if (!eventType) {
      return NextResponse.json(
        { error: "eventType required" },
        { status: 400 },
      );
    }
    const impact = await causalImpactAnalysis(eventType, ustn || null);
    return NextResponse.json({ impact });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/exceptions/causal-impact] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
