// POST /api/sgtx/logistics/fallback/create
// Create a fallback plan (primary + optional backup + optional emergency).
//
// Body: { ustn, serviceType, primaryQuoteId, backupQuoteId?, emergencyQuoteId? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { createFallbackPlan } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const body = await req.json();
    if (!body.ustn || !body.serviceType || !body.primaryQuoteId) {
      return NextResponse.json(
        { error: "ustn, serviceType, primaryQuoteId required" },
        { status: 400 },
      );
    }
    const r = await createFallbackPlan(
      body.ustn,
      body.serviceType,
      body.primaryQuoteId,
      body.backupQuoteId,
      body.emergencyQuoteId,
    );
    return NextResponse.json({ ok: true, fallback: r.fallback });
  } catch (e: any) {
    logger.error("[logistics/fallback/create] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to create fallback" }, { status: 500 });
  }
}
