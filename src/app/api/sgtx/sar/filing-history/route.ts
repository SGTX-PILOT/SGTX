// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getSarFilingHistory } from "@/lib/sgtx/sar/fiu-filing";

export const dynamic = "force-dynamic";

// GET /api/sgtx/sar/filing-history?tenant_gtid=X — SAR filing history for a tenant (v17 §3.5)
//
// Returns the SAR filing history for a tenant (filtered by parsing the
// parties JSON blob for a matching buyer or seller GTID). The platform
// governance / compliance officer tenant (SGTX-EG-GOV-000001-9A0B) sees
// all SARs.
//
// Returns:
//   {
//     "filings": [
//       {
//         "sarId": "...",
//         "reportType": "EG_AML"|"FinCEN"|"EU_ECB",
//         "detectionRule": "volume_spike"|...,
//         "filingReference": "FIU-EG-20260118-A4B2C6D8" | null,
//         "filedAt": <ISO-8601> | null,
//         "status": "DRAFT"|"FILED"|...,
//         "fiuAuthority": "Egyptian Money Laundering Combatting Unit (MLCU / EMLCU)" | null,
//         "filingId": "FIL-EG-..." | null
//       },
//       ...
//     ]
//   }
//
// Public read endpoint — tenant scoping via query param. Rate-limited
// 50 req/min/IP via the middleware anonymous bucket.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const tenantGtid = sp.get("tenant_gtid") || sp.get("tenantGtid") || "";
    if (!tenantGtid) {
      return NextResponse.json(
        { error: "tenant_gtid query parameter required" },
        { status: 400 },
      );
    }
    const result = await getSarFilingHistory(tenantGtid);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store, max-age=0" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/sar/filing-history] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "SAR filing history query failed" },
      { status: 500 },
    );
  }
}
