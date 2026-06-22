import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { verifyToken } from "@/lib/v1/auth";
export async function POST(req: NextRequest) {
  try {
    const { onboarding_token } = await req.json();
    if (!onboarding_token) return NextResponse.json({ error: "onboarding_token required" }, { status: 400 });
    const payload = verifyToken(onboarding_token);
    if (!payload) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    const gtid = payload.sub;
    await db.tenant.update({ where: { gtid }, data: { lifecycleState: "VERIFIED", kybTier: 2, sanctionsCleared: true, trustScore: 50 } });
    return NextResponse.json({ ok: true, gtid, lifecycle_state: "VERIFIED", kyb_tier: 2, sanctions_cleared: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
