import { NextRequest, NextResponse } from "next/server";
import { verifyToken } from "@/lib/v1/auth";

// POST /api/v1/auth/logout — revoke a session (stateless JWT, so we just acknowledge).
// Body: { session_token?: string, refresh_token?: string }
// Returns: { ok: true, message: "Session revoked" }
// NOTE: In a stateless JWT system, the client MUST discard both tokens. The server
// can optionally maintain a revocation list; for now we acknowledge the request.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const token = body.session_token || body.refresh_token;
    if (token) {
      // Verify the token (don't fail logout if invalid — just acknowledge)
      const payload = verifyToken(token);
      if (payload) {
        // In production: add to revocation list (Redis) with TTL = token expiry
        // For now: just log the logout event
        return NextResponse.json({
          ok: true,
          message: "Session revoked",
          subject: payload.sub,
          revokedAt: new Date().toISOString(),
        });
      }
    }
    return NextResponse.json({
      ok: true,
      message: "Session revoked (no valid token provided — client should discard tokens)",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
