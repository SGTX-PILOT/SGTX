// SGTX Tier 2 — Certificate of Origin list endpoint.
//
// GET /api/sgtx/certificates?ustn=...
// GET /api/sgtx/certificates?tradeId=...
//
// Returns the most-recently-issued certificates first.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/**
 * GET handler — list certificates by `ustn` or `tradeId`.
 */
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const tradeId = req.nextUrl.searchParams.get("tradeId");

    if (!ustn && !tradeId) {
      return NextResponse.json(
        { error: "Provide either ?ustn= or ?tradeId=" },
        { status: 400 },
      );
    }

    const where: { ustn?: string; tradeId?: string } = {};
    if (ustn) where.ustn = ustn;
    if (tradeId) where.tradeId = tradeId;

    const certificates = await db.certificateOfOrigin.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      count: certificates.length,
      certificates,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
