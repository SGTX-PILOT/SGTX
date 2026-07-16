import { NextRequest, NextResponse } from "next/server";
import { issueChallenge } from "@/lib/v1/passkey";

export const dynamic = "force-dynamic";

// POST /api/v1/auth/passkey/challenge — issue a WebAuthn challenge.
//
// Body: { session_id?: string }  — optional session identifier. If absent,
//        the server uses the X-Forwarded-For IP as a fallback session key
//        (so anonymous pre-auth clients can still get a challenge).
//
// Returns: { challenge: string, expires_in: 300 }
//
// The challenge is 32 random bytes (base64url, 43 chars), bound to the
// session ID for 5 minutes, and single-use (consumed by the verify endpoint).
// See src/lib/v1/passkey.ts for the full state machine (FIX-AUTH-COUNTRIES-KYC / Fix 4).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as { session_id?: string }));
    const sessionId =
      (typeof body.session_id === "string" && body.session_id) ||
      req.headers.get("x-forwarded-for") ||
      "anonymous";
    const challenge = issueChallenge(sessionId);
    return NextResponse.json({
      challenge,
      expires_in: 300, // 5 minutes
      session_id: sessionId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — convenience for clients that prefer GET (no body). Reads session_id
// from the `?session_id=` query param, falling back to IP.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sessionId =
      sp.get("session_id") ||
      req.headers.get("x-forwarded-for") ||
      "anonymous";
    const challenge = issueChallenge(sessionId);
    return NextResponse.json({
      challenge,
      expires_in: 300,
      session_id: sessionId,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
