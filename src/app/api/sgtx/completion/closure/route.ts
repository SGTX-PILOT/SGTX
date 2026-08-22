// @ts-nocheck
// §6 Trade Closure — get-or-create closure state for a USTN
// GET /api/sgtx/completion/closure?ustn=X
import { NextResponse } from "next/server";
import { getOrCreateClosureState } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const state = await getOrCreateClosureState(ustn);
    return NextResponse.json({ closureState: state });
  } catch (err: any) {
    logger.error("[api/completion/closure] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
