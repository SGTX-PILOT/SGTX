import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit } from "@/lib/v1/auth";
export async function POST(req: NextRequest) {
  try {
    const { credential_id } = await req.json();
    if (!credential_id) return NextResponse.json({ error: "credential_id required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`passkey:${ip}`, 5)) return NextResponse.json({ error: "Rate limit" }, { status: 429 });
    const device = await db.deviceRegistry.findFirst({ where: { deviceId: credential_id }, include: { employee: { include: { tenant: true } } } });
    if (!device) return NextResponse.json({ error: "Device not found" }, { status: 401 });
    const sessionToken = signToken({ sub: device.employee.id, email: device.employee.email, tenantGtid: device.employee.tenantGtid, mfaVerified: true });
    const refreshToken = signToken({ sub: device.employee.id, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ session_token: sessionToken, refresh_token: refreshToken, employee: { id: device.employee.id, email: device.employee.email, full_name: device.employee.fullName }, tenant: { gtid: device.employee.tenant.gtid, legal_name: device.employee.tenant.legalName } });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
