// @ts-nocheck
// §2 Provider Relationship — check commodity authorization (HS6)
// GET /api/sgtx/transport/providers/authorized-commodity?providerGtid=X&hs6=Y
import { NextResponse } from "next/server";
import { isProviderAuthorizedForCommodity } from "@/lib/sgtx/provider-relationship";
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
    const authorized = await isProviderAuthorizedForCommodity(
      providerGtid,
      hs6,
    );
    return NextResponse.json({ providerGtid, hs6, authorized });
  } catch (err: any) {
    logger.error(
      "[api/transport/providers/authorized-commodity] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
