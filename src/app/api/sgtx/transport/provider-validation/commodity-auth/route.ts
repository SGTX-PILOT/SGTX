// @ts-nocheck
// §6 Provider Validation — check commodity authorization (HS6).
// GET /api/sgtx/transport/provider-validation/commodity-auth?providerGtid=X&hs6=Y
//
// Checks the provider's COMMODITY_AUTHORIZATION validation row. Returns
// { authorized, reason }.
import { NextResponse } from "next/server";
import { checkCommodityAuthorization } from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerGtid = url.searchParams.get("providerGtid");
    const hs6 = url.searchParams.get("hs6");
    if (!providerGtid || !hs6) {
      return NextResponse.json(
        { error: "providerGtid and hs6 required" },
        { status: 400 },
      );
    }
    const result = await checkCommodityAuthorization(providerGtid, hs6);
    return NextResponse.json({
      providerGtid,
      hs6,
      authorized: result.authorized,
      reason: result.reason,
    });
  } catch (err: any) {
    logger.error(
      "[api/transport/provider-validation/commodity-auth] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
