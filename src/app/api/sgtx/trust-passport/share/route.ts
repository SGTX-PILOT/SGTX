import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSharingLink } from "@/lib/sgtx/identity";

// POST /api/sgtx/trust-passport/share  { tenantGtid, sharedWithGtid?, dimensions? }
// dimensions: ["all"] or ["settlement_reliability","compliance_health",...,"financing_summary","dispute_summary","customs_performance","logistics_performance","trade_volume_consistency","trust_graph"]
export async function POST(req: NextRequest) {
  const { tenantGtid, sharedWithGtid, dimensions } = await req.json();
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const passport = await db.trustPassport.findUnique({ where: { tenantGtid } });
  if (!passport) return NextResponse.json({ error: "generate passport first" }, { status: 404 });
  const result = await createSharingLink(passport.id, { sharedWithGtid, dimensions });
  return NextResponse.json(result);
}

// GET /api/sgtx/trust-passport/share?tenant=GTID — list active shares
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const passport = await db.trustPassport.findUnique({ where: { tenantGtid: tenant } });
  if (!passport) return NextResponse.json({ shares: [] });
  const shares = await db.trustPassportToken.findMany({ where: { passportId: passport.id }, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ shares });
}

// DELETE /api/sgtx/trust-passport/share — revoke a token
export async function DELETE(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  await db.trustPassportToken.update({ where: { token }, data: { revoked: true } });
  return NextResponse.json({ success: true });
}
