import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, checkRateLimit, verifyPassword, generateCsrfToken } from "@/lib/v1/auth";

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
    // CERT-32 P0 FIX: Removed the universal "sgtx-demo" backdoor password.
    //
    // The previous code (lines 28-46 in the prior version) accepted the
    // literal string "sgtx-demo" for ANY employee that had no passwordHash,
    // and silently auto-hashed it on first use. This was a universal
    // backdoor: any attacker who knew a registered email could authenticate
    // with the literal "sgtx-demo" password and obtain a valid session JWT,
    // including for admin and government accounts.
    //
    // The justification in the prior comment ("safe because the account is
    // in KYB_PENDING state") was incorrect: a KYB_PENDING admin or gov
    // account still had read access to platform-level data, and the
    // onboarding wizard does not gate every action on KYB tier.
    //
    // Replacement policy:
    //   * Employees with a passwordHash use real PBKDF2 verification.
    //   * Employees without a passwordHash CANNOT authenticate via this
    //     endpoint. They must complete onboarding (which sets a password)
    //     or use the passkey / SSO flows.
    //   * Demo logins (the launcher's "Demo Login — Click any portal"
    //     buttons) are routed through a separate `/api/v1/auth/demo-login`
    //     endpoint that is restricted to NODE_ENV !== "production" and
    //     only mints demo-scoped JWTs. (See src/app/api/v1/auth/demo-login.)
    if (!employee.passwordHash) {
      // CERT-29: deterministic, classified, observable error.
      // We do NOT reveal whether the email exists; this is the same
      // "Invalid email or password" message used elsewhere to avoid
      // user-enumeration.
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }
    const valid = verifyPassword(password, employee.passwordHash);

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
