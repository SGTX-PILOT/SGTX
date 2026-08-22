// @ts-nocheck
// §3 Logistics Quote V2 — list all quotes for a leg.
// GET /api/sgtx/transport/quotes/leg/[legId]
import { NextResponse } from "next/server";
import { getQuotesForLeg } from "@/lib/sgtx/logistics-quote-v2";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const quotes = await getQuotesForLeg(legId);
    return NextResponse.json({ quotes });
  } catch (err: any) {
    logger.error("[api/transport/quotes/leg/[legId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
