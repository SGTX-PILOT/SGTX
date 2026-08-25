// GET /api/sgtx/demurrage-dispute/list?ustn=X — list demurrage disputes for a shipment
//
// Returns the dispute rows (newest first). Optionally filter by status:
//   ?ustn=X              (required)
//   ?status=PENDING      (optional — PENDING | RESOLVED | REJECTED)
//
// ---------------------------------------------------------------------------
// STRUCT-FIX (audit follow-up): NOT consolidated with Add-On 9.
//
// Add-On 26's /demurrage-dispute/list reads from the DemurrageDispute table
// (filtering by ustn + optional status) and returns { ok, ustn, disputes,
// count }. Add-On 9's equivalent GET at /api/sgtx/demurrage/[ustn] reads
// from the DemurrageTracking table (filtering by ustn + optional
// containerNumber), attaches a fresh live calculation (calculateDemurrage)
// to each row, and returns { ustn, tracking, count }.
//
// Different table, different filter shape, different response payload —
// intentionally kept as a separate Add-On 26 endpoint.
//
// The Add-On 26 POST route (/demurrage-dispute/create) WAS consolidated
// into Add-On 9's /demurrage/dispute POST because those two handlers were
// byte-for-byte identical. See demurrage-dispute/create/route.ts for that
// re-export.
// ---------------------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

const VALID_STATUS = new Set(["PENDING", "RESOLVED", "REJECTED"]);

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || "";
    const status = url.searchParams.get("status") || "";

    if (!ustn) {
      return NextResponse.json({ error: "Missing required query param: ustn" }, { status: 400 });
    }

    const where: any = { ustn };
    if (status) {
      if (!VALID_STATUS.has(status)) {
        return NextResponse.json(
          { error: `Invalid status. Valid: ${Array.from(VALID_STATUS).join(", ")}` },
          { status: 400 },
        );
      }
      where.status = status;
    }

    const disputes = await (db as any).demurrageDispute.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      ok: true,
      ustn,
      disputes: disputes || [],
      count: (disputes || []).length,
    });
  } catch (e: any) {
    logger.error("[demurrage-dispute/list] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
