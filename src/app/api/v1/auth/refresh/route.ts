import { NextRequest, NextResponse } from "next/server";
import { signToken, verifyToken } from "@/lib/v1/auth";

// POST /api/v1/auth/refresh — exchange a refresh token for a new session + refresh token pair.
// Body: { refresh_token: string }
// Returns: { session_token, refresh_token, expires_in }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const token = body.refresh_token || body.session_token;
    if (!token) return NextResponse.json({ error: "refresh_token required" }, { status: 400 });
    const payload = verifyToken(token);
    if (!payload) return NextResponse.json({ error: "Invalid or expired refresh token" }, { status: 401 });
    if (payload.type && payload.type !== "refresh") {
      return NextResponse.json({ error: "Token is not a refresh token" }, { status: 400 });
    }
    const newSession = signToken({
      sub: payload.sub,
      email: payload.email,
      tenantGtid: payload.tenantGtid,
      mfaVerified: true,
    });
    const newRefresh = signToken({ sub: payload.sub, type: "refresh" }, 30 * 24 * 60 * 60 * 1000);
    return NextResponse.json({
      session_token: newSession,
      refresh_token: newRefresh,
      expires_in: 24 * 60 * 60,
      token_type: "Bearer",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
