// @ts-nocheck
// §16 Event Spine — verify hash chain integrity
// GET /api/sgtx/constitutional/events/verify-chain?ustn=X
import { NextResponse } from "next/server";
import { verifyEventChain } from "@/lib/sgtx/event-spine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const verification = await verifyEventChain(ustn);
    return NextResponse.json({ verification });
  } catch (err: any) {
    logger.error("[api/constitutional/events/verify-chain] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
