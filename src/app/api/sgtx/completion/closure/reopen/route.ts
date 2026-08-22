// @ts-nocheck
// §6 Trade Closure — reopen (USTN_CLOSED | USTN_CLOSED_WITH_OPEN_DISPUTE → OPEN).
// Body: { ustn, reason }
// POST /api/sgtx/completion/closure/reopen
import { NextResponse } from "next/server";
import { reopenTrade } from "@/lib/sgtx/trade-closure";
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
    if (!body.reason) {
      return NextResponse.json({ error: "reason required" }, { status: 400 });
    }
    const state = await reopenTrade(body.ustn, body.reason);
    return NextResponse.json({ closureState: state });
  } catch (err: any) {
    logger.error("[api/completion/closure/reopen] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
