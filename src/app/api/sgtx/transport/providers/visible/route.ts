// @ts-nocheck
// §2 Provider Relationship — non-marketplace visibility endpoint.
// GET /api/sgtx/transport/providers/visible?traderGtid=X&providerType=Y&jurisdictionCode=Z&serviceType=W&route=R
//
// Returns a FLAT list of providers visible to the trader. NO ranking,
// NO sorting by performance. internalTrustScore is included but is
// INTERNAL — MUST NOT be shown publicly to other traders.
import { NextResponse } from "next/server";
import { listVisibleProviders } from "@/lib/sgtx/provider-relationship";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const traderGtid = url.searchParams.get("traderGtid");
    if (!traderGtid) {
      return NextResponse.json(
        { error: "traderGtid required" },
        { status: 400 },
      );
    }
    const filters: any = {};
    const providerType = url.searchParams.get("providerType") || undefined;
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    const serviceType = url.searchParams.get("serviceType") || undefined;
    const route = url.searchParams.get("route") || undefined;
    if (providerType) filters.providerType = providerType;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (serviceType) filters.serviceType = serviceType;
    if (route) filters.route = route;
    // NON-MARKETPLACE: flat list, no ranking by performance.
    const providers = await listVisibleProviders(traderGtid, filters);
    return NextResponse.json({
      providers,
      count: providers.length,
      // Explicit reminder for API consumers (this is a non-marketplace endpoint).
      note: "Flat list — no ranking by performance. internalTrustScore is internal — not shown publicly.",
    });
  } catch (err: any) {
    logger.error("[api/transport/providers/visible] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
