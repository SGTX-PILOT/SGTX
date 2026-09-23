// SGTX Tier 2 — Certificate of Origin list endpoint.
//
// GET /api/sgtx/certificates?ustn=...
// GET /api/sgtx/certificates?tradeId=...
// GET /api/sgtx/certificates?issuerGtid=GTID   — CBR portal "all certificates
//                                                  issued by this chamber/broker"
// GET /api/sgtx/certificates?status=ISSUED|PRESENTED|VERIFIED|...
// GET /api/sgtx/certificates?issuerGtid=GTID&status=PENDING   — pending issuance queue
//
// Returns the most-recently-issued certificates first.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/**
 * GET handler — list certificates by `ustn`, `tradeId`, or `issuerGtid`.
 */
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn");
    const tradeId = req.nextUrl.searchParams.get("tradeId");
    const issuerGtid = req.nextUrl.searchParams.get("issuerGtid") || req.nextUrl.searchParams.get("issuer");
    const status = req.nextUrl.searchParams.get("status");

    if (!ustn && !tradeId && !issuerGtid) {
      return NextResponse.json(
        { error: "Provide either ?ustn=, ?tradeId=, or ?issuerGtid=" },
        { status: 400 },
      );
    }

    const where: { ustn?: string; tradeId?: string; issuerGtid?: string; status?: string | { in: string[] } } = {};
    if (ustn) where.ustn = ustn;
    if (tradeId) where.tradeId = tradeId;
    if (issuerGtid) where.issuerGtid = issuerGtid;
    if (status) {
      const statuses = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = statuses.length === 1 ? statuses[0] : { in: statuses };
    }

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
