import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit } from "@/lib/v1/auth";

export async function POST(req: NextRequest) {
  try {
    const { email, password, device_id } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "email + password required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`login:${ip}`, 5)) return NextResponse.json({ error: "Rate limit: 5 attempts/min" }, { status: 429, headers: { "Retry-After": "60" } });

    const employee = await db.employee.findUnique({ where: { email: email.toLowerCase() }, include: { tenant: true } });
    if (!employee) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    if (employee.lockedUntil && employee.lockedUntil > new Date()) return NextResponse.json({ error: "Account locked", retry_after: employee.lockedUntil.toISOString() }, { status: 423 });
    if (!employee.isActive) return NextResponse.json({ error: "Account inactive" }, { status: 403 });

    // Demo: accept "sgtx-demo" if no passwordHash
    const valid = employee.passwordHash ? false : password === "sgtx-demo";
    if (!valid) {
      await db.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: { increment: 1 } } });
      if (employee.failedLoginAttempts + 1 >= 10) {
        await db.employee.update({ where: { id: employee.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });
      }
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await db.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: 0, lastLoginAt: new Date() } });
    const sessionToken = signToken({ sub: employee.id, email: employee.email, tenantGtid: employee.tenantGtid, role: employee.role, mfaVerified: !employee.totpSecret });
    const refreshToken = signToken({ sub: employee.id, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ session_token: sessionToken, refresh_token: refreshToken, expires_at: Date.now() + 15 * 60 * 1000, refresh_expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000, requires_mfa: !!employee.totpSecret, mfaVerified: !employee.totpSecret, employee: { id: employee.id, email: employee.email, full_name: employee.fullName, role: employee.role }, tenant: { gtid: employee.tenant.gtid, legal_name: employee.tenant.legalName, type: employee.tenant.type, country: employee.tenant.country, lifecycle_state: employee.tenant.lifecycleState, kyb_tier: employee.tenant.kybTier }, device: { device_id: device_id || "web", state: "NEW", risk_score: 5, risk_flags: [] } });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
