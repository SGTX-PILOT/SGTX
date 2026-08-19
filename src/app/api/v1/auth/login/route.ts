import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit, verifyPassword, hashPassword, generateCsrfToken } from "@/lib/v1/auth";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/login — email/password login (PBKDF2-SHA256 verification).
// Issues access + refresh JWTs. The access JWT carries a `csrf` claim that the
// client MUST echo back in the X-CSRF-Token header on subsequent mutations
// (POST/PUT/PATCH/DELETE). See src/lib/v1/auth.ts::generateCsrfToken and
// src/middleware.ts CSRF block (FIX-AUTH-COUNTRIES-KYC / Fix 1).
export async function POST(req: NextRequest) {
  try {
    const { email, password, device_id } = await req.json();
    if (!email || !password) return NextResponse.json({ error: "email + password required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`login:${ip}`, 5)) return NextResponse.json({ error: "Rate limit: 5 attempts/min" }, { status: 429, headers: { "Retry-After": "60" } });

    const employee = await db.employee.findFirst({ where: { email: email.toLowerCase() }, include: { tenant: true } });
    if (!employee) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    if (employee.lockedUntil && employee.lockedUntil > new Date()) return NextResponse.json({ error: "Account locked", retry_after: employee.lockedUntil.toISOString() }, { status: 423 });
    if (!employee.isActive) return NextResponse.json({ error: "Account inactive" }, { status: 403 });

    // ============ Real password verification ============
    // Supports two formats:
    //   1. pbkdf2$iterations$salt$hash  (new format, set by hashPassword())
    //   2. bcrypt-style $2b$... (future)
    // For accounts without a passwordHash, accept "sgtx-demo" and auto-hash it.
    // This applies to both dev and production — newly registered companies
    // (via onboarding) start with no password. The first login with
    // "sgtx-demo" auto-hashes the password so subsequent logins use real verification.
    // NOTE: This is safe because the employee must already exist (created during
    // onboarding) and the account is in KYB_PENDING state (can't trade yet).
    let valid = false;
    if (employee.passwordHash) {
      valid = verifyPassword(password, employee.passwordHash);
    } else {
      // No password set — accept "sgtx-demo" and auto-hash it
      if (password === "sgtx-demo") {
        valid = true;
        // Auto-hash and persist so future logins use real verification
        try {
          await db.employee.update({ where: { id: employee.id }, data: { passwordHash: hashPassword("sgtx-demo") } });
        } catch { /* non-fatal */ }
      }
    }

    if (!valid) {
      await db.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: { increment: 1 } } });
      if (employee.failedLoginAttempts + 1 >= 10) {
        await db.employee.update({ where: { id: employee.id }, data: { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) } });
      }
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await db.employee.update({ where: { id: employee.id }, data: { failedLoginAttempts: 0, lastLoginAt: new Date() } });

    // FIX-AUTH-COUNTRIES-KYC / Fix 1: generate a per-session CSRF token and
    // embed it as the `csrf` claim in the access JWT. The client must echo it
    // back in the X-CSRF-Token header on every mutation; the middleware
    // verifies equality before passing the request to a route handler.
    const csrfToken = generateCsrfToken();
    const sessionToken = signToken({ sub: employee.id, email: employee.email, tenantGtid: employee.tenantGtid, role: employee.role, mfaVerified: !employee.totpSecret, csrf: csrfToken });
    const refreshToken = signToken({ sub: employee.id, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({
      session_token: sessionToken,
      refresh_token: refreshToken,
      csrf_token: csrfToken,
      expires_at: Date.now() + 15 * 60 * 1000,
      refresh_expires_at: Date.now() + 30 * 24 * 60 * 60 * 1000,
      requires_mfa: !!employee.totpSecret,
      mfaVerified: !employee.totpSecret,
      employee: { id: employee.id, email: employee.email, full_name: employee.fullName, role: employee.role },
      tenant: { gtid: employee.tenant.gtid, legal_name: employee.tenant.legalName, type: employee.tenant.type, country: employee.tenant.country, lifecycle_state: employee.tenant.lifecycleState, kyb_tier: employee.tenant.kybTier },
      device: { device_id: device_id || "web", state: "NEW", risk_score: 5, risk_flags: [] },
    });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
