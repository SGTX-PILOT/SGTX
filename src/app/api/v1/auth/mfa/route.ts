import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken, checkRateLimit } from "@/lib/v1/auth";
export async function POST(req: NextRequest) {
  try {
    const { session_token, code } = await req.json();
    if (!session_token || !code) return NextResponse.json({ error: "session_token and code required" }, { status: 400 });
    const ip = req.headers.get("x-forwarded-for") || "unknown";
    if (!checkRateLimit(`mfa:${ip}`, 3)) return NextResponse.json({ error: "Rate limit: 3 attempts/min" }, { status: 429 });
    const payload = verifyToken(session_token);
    if (!payload) return NextResponse.json({ error: "Invalid session token" }, { status: 401 });
    // Demo: accept "000000" or any 6-digit
    if (code.length !== 6) return NextResponse.json({ error: "Invalid MFA code" }, { status: 401 });
    const newSession = signToken({ ...payload, mfaVerified: true });
    const newRefresh = signToken({ sub: payload.sub, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({ session_token: newSession, refresh_token: newRefresh, mfa_verified: true });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
