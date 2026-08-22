// @ts-nocheck
// §2 Provider Relationship — check route authorization
// GET /api/sgtx/transport/providers/authorized-route?providerGtid=X&originLocation=Y&destinationLocation=Z
import { NextResponse } from "next/server";
import { isProviderAuthorizedForRoute } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerGtid = url.searchParams.get("providerGtid");
    const originLocation = url.searchParams.get("originLocation");
    const destinationLocation =
      url.searchParams.get("destinationLocation") || undefined;
    if (!providerGtid || !originLocation || !destinationLocation) {
      return NextResponse.json(
        {
          error:
            "providerGtid, originLocation and destinationLocation required",
        },
        { status: 400 },
      );
    }
    const authorized = await isProviderAuthorizedForRoute(
      providerGtid,
      originLocation,
      destinationLocation,
    );
    return NextResponse.json({
      providerGtid,
      originLocation,
      destinationLocation,
      authorized,
    });
  } catch (err: any) {
    logger.error("[api/transport/providers/authorized-route] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
