// @ts-nocheck
// §2 Provider Relationship — check visibility
// GET /api/sgtx/transport/providers/can-see?traderGtid=X&providerGtid=Y
import { NextResponse } from "next/server";
import { canTraderSeeProvider } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const traderGtid = url.searchParams.get("traderGtid");
    const providerGtid = url.searchParams.get("providerGtid");
    if (!traderGtid || !providerGtid) {
      return NextResponse.json(
        { error: "traderGtid and providerGtid required" },
        { status: 400 },
      );
    }
    const result = await canTraderSeeProvider(traderGtid, providerGtid);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/transport/providers/can-see] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
