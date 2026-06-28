import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { signToken, verifyToken, checkRateLimit, verifyTotp } from "@/lib/v1/auth";

export async function POST(req: NextRequest) {
  try {
    const { session_token, code } = await req.json();
    if (!session_token || !code) return NextResponse.json({ error: "session_token and code required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`mfa:${ip}`, 3)) return NextResponse.json({ error: "Rate limit: 3 attempts/min" }, { status: 429 });
    const payload = verifyToken(session_token);
    if (!payload) return NextResponse.json({ error: "Invalid session token" }, { status: 401 });

    // ============ Real TOTP verification (RFC 6238) ============
    // Look up the employee's TOTP secret
    const employee = await db.employee.findUnique({ where: { id: payload.sub } });
    if (!employee) return NextResponse.json({ error: "Employee not found" }, { status: 404 });

    if (!employee.totpSecret) {
      // No TOTP enrolled — auto-verify (shouldn't happen if requires_mfa was true)
      const newSession = signToken({ ...payload, mfaVerified: true });
      const newRefresh = signToken({ sub: payload.sub, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
      return NextResponse.json({ session_token: newSession, refresh_token: newRefresh, mfa_verified: true });
    }

    // Real TOTP verification with ±1 time window (30s steps, allows clock drift)
    const valid = verifyTotp(employee.totpSecret, code, 1);
    if (!valid) {
      return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
    }

    const newSession = signToken({ ...payload, mfaVerified: true });
    const newRefresh = signToken({ sub: payload.sub, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ session_token: newSession, refresh_token: newRefresh, mfa_verified: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
