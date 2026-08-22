// @ts-nocheck
// §6 Provider Validation — check route authorization.
// GET /api/sgtx/transport/provider-validation/route-auth?providerGtid=X&originLocation=Y&destinationLocation=Z
//
// Checks the provider's ROUTE_AUTHORIZATION validation row (must be VALIDATED
// and within date window). Returns { authorized, reason }.
import { NextResponse } from "next/server";
import { checkRouteAuthorization } from "@/lib/sgtx/provider-validation";
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
    const result = await checkRouteAuthorization(
      providerGtid,
      originLocation,
      destinationLocation,
    );
    return NextResponse.json({
      providerGtid,
      originLocation,
      destinationLocation,
      authorized: result.authorized,
      reason: result.reason,
    });
  } catch (err: any) {
    logger.error(
      "[api/transport/provider-validation/route-auth] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
