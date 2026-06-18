import { NextRequest, NextResponse } from "next/server";
import { runComplianceScreening } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/compliance/screen  { tenantGtid, ustn?, counterpartyGtid? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const result = await runComplianceScreening(body);
  return NextResponse.json(result);
}
