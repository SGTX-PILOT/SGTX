// POST /api/sgtx/logistics/fallback/activate
// Activate a fallback. Always seller-initiated + Governor-gated — never automatic.
//
// Body: { ustn, serviceType, level: "PRIMARY" | "BACKUP" | "EMERGENCY",
//         sellerGtid, governorDecisionId?, traderMode? }
//
// If `governorDecisionId` is missing, the route will invoke the Governor
// itself (recording the activation request in the Loom chain) and pass the
// resulting decisionId into the lib call.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { activateFallback, type FallbackLevel } from "@/lib/sgtx/logistics";
import { governorLogisticsFallbackActivate } from "@/lib/sgtx/governor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const body = await req.json();
    if (!body.ustn || !body.serviceType || !body.level || !body.sellerGtid) {
      return NextResponse.json(
        { error: "ustn, serviceType, level, sellerGtid required" },
        { status: 400 },
      );
    }
    const validLevels: FallbackLevel[] = ["PRIMARY", "BACKUP", "EMERGENCY"];
    if (!validLevels.includes(body.level as FallbackLevel)) {
      return NextResponse.json({ error: `Invalid level ${body.level}` }, { status: 400 });
    }

    // Seller-initiated enforcement — caller must explicitly opt in.
    if (body.sellerGtid !== (caller.tenantGtid || body.sellerGtid) && caller.role !== "OWNER" && caller.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Fallback activation must be explicitly seller-initiated" },
        { status: 403 },
      );
    }

    let governorDecisionId = body.governorDecisionId as string | undefined;
    if (!governorDecisionId) {
      const gov = await governorLogisticsFallbackActivate(
        {
          quoteId: "(fallback)",
          ustn: body.ustn,
          serviceType: body.serviceType,
          level: body.level,
          sellerGtid: body.sellerGtid,
        },
        caller.tenantGtid || undefined,
        body.traderMode,
      );
      governorDecisionId = gov.decisionId;
    }

    const result = await activateFallback(
      body.ustn,
      body.serviceType,
      body.level as FallbackLevel,
      body.sellerGtid,
      governorDecisionId,
    );
    if (!result.ok) {
      return NextResponse.json({ ok: false, reason: result.reason }, { status: 409 });
    }
    return NextResponse.json({
      ok: true,
      fallback: result.fallback,
      governorDecision: governorDecisionId,
    });
  } catch (e: any) {
    logger.error("[logistics/fallback/activate] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to activate fallback" }, { status: 500 });
  }
}
