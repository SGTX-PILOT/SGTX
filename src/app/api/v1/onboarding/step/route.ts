import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { verifyToken } from "@/lib/v1/auth";
export async function POST(req: NextRequest) {
  try {
    const { onboarding_token, step, data } = await req.json();
    if (!onboarding_token || !step) return NextResponse.json({ error: "onboarding_token and step required" }, { status: 400 });
    const payload = verifyToken(onboarding_token);
    if (!payload) return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
    const gtid = payload.sub;
    if (step === 2 && data) {
      await db.tenant.update({ where: { gtid }, data: { lifecycleState: "ONBOARDING", contactEmail: data.contactEmail, officeAddress: data.officeAddress } }).catch(() => null);
    }
    if (step === 3) await db.tenant.update({ where: { gtid }, data: { lifecycleState: "KYB_PENDING" } }).catch(() => null);
    return NextResponse.json({ ok: true, step, next_step: step < 4 ? `step_${step + 1}` : "complete" });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
