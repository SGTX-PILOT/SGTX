// @ts-nocheck
// §6 Trade Closure — evaluate readiness (returns the 7-condition checklist)
// POST /api/sgtx/completion/closure/evaluate?ustn=X
import { NextResponse } from "next/server";
import { evaluateClosureReadiness } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const readiness = await evaluateClosureReadiness(ustn);
    return NextResponse.json({ readiness });
  } catch (err: any) {
    logger.error("[api/completion/closure/evaluate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
