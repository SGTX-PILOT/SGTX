import { NextRequest, NextResponse } from "next/server";
import { assessGnnRisk } from "@/lib/sgtx/addons";

// GET /api/sgtx/gnn/risk?tenantGtid=...&counterpartyGtid=...
// Returns the GNN sanctions-proximity + graph-risk assessment (Part 11.1).
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const counterpartyGtid = req.nextUrl.searchParams.get("counterpartyGtid");
  if (!tenantGtid || !counterpartyGtid) {
    return NextResponse.json(
      { error: "tenantGtid and counterpartyGtid are required" },
      { status: 400 },
    );
  }
  const result = await assessGnnRisk(tenantGtid, counterpartyGtid);
  return NextResponse.json(result);
}
