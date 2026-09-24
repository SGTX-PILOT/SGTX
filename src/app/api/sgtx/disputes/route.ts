// @ts-nocheck
// SGTX v18 §16.8.8 — Dispute Fast-Track & Override Flagging
//
// GET /api/sgtx/disputes?type=QC&respondentGtid=GTID&filedByGtid=GTID&status=FILED&category=QUALITY
//
// Lists disputes with optional filters. Used by the QC portal's
// "Dispute Fast-Track" tab and the CBR's audit invitation list (the audit
// endpoint delegates to FeedbackTicket — this route is strictly for Dispute).
//
// Response:
//   {
//     ok: true,
//     count: N,
//     disputes: Dispute[]
//   }
//
// The Dispute model uses `type` (e.g. QUALITY, FEE, INSPECTION, LAB,
// SHIPPING, DOCUMENT). The spec mentions both `type=QC` and `category=QUALITY`
// — both are accepted here (type and category both map to Dispute.type).

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// Acceptable alias map: alias -> canonical Dispute.type
const TYPE_ALIASES: Record<string, string> = {
  QC: "QUALITY",
  QUALITY: "QUALITY",
  LAB: "LAB",
  INSPECTION: "INSPECTION",
  FEE: "FEE",
  SHIPPING: "SHIPPING",
  DOCUMENT: "DOCUMENT",
};

function resolveType(raw?: string | null): string | null {
  if (!raw) return null;
  const upper = String(raw).toUpperCase();
  return TYPE_ALIASES[upper] || upper;
}

export async function GET(req: NextRequest) {
  try {
    const typeParam = req.nextUrl.searchParams.get("type")
      || req.nextUrl.searchParams.get("category");
    const respondentGtid = req.nextUrl.searchParams.get("respondentGtid");
    const filedByGtid = req.nextUrl.searchParams.get("filedByGtid");
    const status = req.nextUrl.searchParams.get("status");
    const ustn = req.nextUrl.searchParams.get("ustn");

    const where: any = {};
    if (respondentGtid) where.respondentGtid = respondentGtid;
    if (filedByGtid) where.filedByGtid = filedByGtid;
    if (ustn) where.ustn = ustn;
    if (status) {
      const parts = status.split(",").map((s) => s.trim()).filter(Boolean);
      where.status = parts.length === 1 ? parts[0] : { in: parts };
    }
    const resolvedType = resolveType(typeParam);
    if (resolvedType) where.type = resolvedType;

    const disputes = await db.dispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 200,
      include: {
        evidence: true,
        prediction: true,
        qcOverrideFlags: true,
      },
    });

    return NextResponse.json({
      ok: true,
      count: disputes.length,
      disputes,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[disputes/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
