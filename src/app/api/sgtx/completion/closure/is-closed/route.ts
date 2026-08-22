// @ts-nocheck
// §6 Trade Closure — is closed? (true only if closureState=USTN_CLOSED)
// GET /api/sgtx/completion/closure/is-closed?ustn=X
import { NextResponse } from "next/server";
import { isTradeClosed } from "@/lib/sgtx/trade-closure";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const closed = await isTradeClosed(ustn);
    return NextResponse.json({ ustn, closed });
  } catch (err: any) {
    logger.error("[api/completion/closure/is-closed] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
