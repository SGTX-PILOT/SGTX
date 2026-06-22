import { NextRequest, NextResponse } from "next/server";
import { getTradeGraphScore } from "@/lib/sgtx/addons";

// GET /api/sgtx/gnn/trade-graph?tenantGtid=...
// Returns the institutional trade-graph ego-network view for a tenant
// (Part 11.1.4 — trust-based mapping with anonymisation).
//
// Response shape (blueprint 11.1.4):
//   {
//     "nodeCount": 48,
//     "edgeCount": 12,
//     "avgTrust": 78,
//     "directConnections": 47,
//     "trustedConnections": 12,
//     "networkTrustScore": 82,
//     "indirectExposure": "2 hops to 3 financial institutions",
//     "privacyNotice": "All counts are anonymised; ..."
//   }
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) {
    return NextResponse.json(
      { error: "tenantGtid is required" },
      { status: 400 },
    );
  }
  const result = await getTradeGraphScore(tenantGtid);
  return NextResponse.json(result);
}
