import { NextRequest, NextResponse } from "next/server";
import { getTriForViewer } from "@/lib/sgtx/dispute";

// GET /api/sgtx/tri/breakdown?tenantGtid=...&viewerGtid=...
// Privacy-aware TRI breakdown (Part 10.14.8).
// - Owner (viewerGtid === tenantGtid) sees the full component breakdown.
// - Counterparty (viewerGtid !== tenantGtid) sees only the badge UNLESS the
//   tenant has granted explicit consent via POST /api/sgtx/tri/share.
// - When consent exists, the counterparty sees only the consented components.
export async function GET(req: NextRequest) {
  try {
    const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
    const viewerGtid = req.nextUrl.searchParams.get("viewerGtid");
    if (!tenantGtid || !viewerGtid) {
      return NextResponse.json({ error: "tenantGtid and viewerGtid required" }, { status: 400 });
    }
    const result = await getTriForViewer(tenantGtid, viewerGtid);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
