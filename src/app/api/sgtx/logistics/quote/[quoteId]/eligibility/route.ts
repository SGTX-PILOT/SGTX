// GET /api/sgtx/logistics/quote/[quoteId]/eligibility
// Check provider eligibility for the quote. Returns factual gates only
// (license / insurance / sanctions / capability / capacity) — NO match score.
//
// Query params (optional): serviceType, jurisdiction

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { checkProviderEligibility, getProviderProfile } from "@/lib/sgtx/logistics";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const sp = req.nextUrl.searchParams;
    const quote = await db.logisticsQuote.findUnique({
      where: { quoteId },
      select: { providerGtid: true, serviceType: true },
    });
    if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 });
    if (!quote.providerGtid) {
      return NextResponse.json({
        ok: true,
        note: "Mode A quote (manual) — no provider to gate",
        eligible: true,
      });
    }
    const serviceType = (sp.get("serviceType") || quote.serviceType) as any;
    const jurisdiction = sp.get("jurisdiction") || undefined;
    const eligibility = await checkProviderEligibility(
      quote.providerGtid,
      serviceType,
      jurisdiction,
    );
    const profile = await getProviderProfile(quote.providerGtid);
    return NextResponse.json({ ok: true, eligibility, profile });
  } catch (e: any) {
    logger.error("[logistics/quote/eligibility] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to check eligibility" }, { status: 500 });
  }
}
