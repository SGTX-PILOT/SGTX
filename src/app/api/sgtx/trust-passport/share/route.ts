import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { createSharingLink } from "@/lib/sgtx/identity";

// POST /api/sgtx/trust-passport/share  { tenantGtid } — creates one-time sharing token (7-day expiry)
export async function POST(req: NextRequest) {
  const { tenantGtid } = await req.json();
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const passport = await db.trustPassport.findUnique({ where: { tenantGtid } });
  if (!passport) return NextResponse.json({ error: "generate passport first" }, { status: 404 });
  const result = await createSharingLink(passport.id);
  return NextResponse.json(result);
}

// DELETE /api/sgtx/trust-passport/share — revoke a token
export async function DELETE(req: NextRequest) {
  const { token } = await req.json();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  await db.trustPassportToken.update({ where: { token }, data: { revoked: true } });
  return NextResponse.json({ success: true });
}
