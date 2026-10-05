// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/trust/revoke — Revoke a Trust Passport sharing token (v18 §4.12.4 Step 4)
//
// v18 §4.12.4 Step 4: at any time, the admin clicks "Revoke" next to the
// shared token. Revocation is immediate. Any subsequent attempt to verify
// that token returns { "valid": false, "reason": "revoked" }.
//
// Auth: Bearer JWT — the caller must be the original sharer (sharedWithGtid
// null means "anyone with link", so anyone holding the token can verify, but
// only the sharer can revoke).
//
// Request body:
//   { "token": "<sharing-token-to-revoke>" }
//
// Response shape:
//   {
//     "revoked": true,
//     "token": "<redacted>",
//     "revoked_at": "<ISO-8601>"
//   }

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON body" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const token = body?.token;
    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json(
        { error: "Token must be a string of at least 16 characters" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");
    const tokenRow = await freshDb.trustPassportToken.findUnique({
      where: { token },
    });

    if (!tokenRow) {
      return NextResponse.json(
        { error: "TOKEN_NOT_FOUND", message: "Token does not exist" },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Verify the caller owns this token (i.e., the underlying passport belongs to the caller)
    const passport = await freshDb.trustPassport.findUnique({
      where: { id: tokenRow.passportId },
    });
    if (!passport || passport.tenantGtid !== caller.gtid) {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "Only the original sharer can revoke this token" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (tokenRow.revoked) {
      return NextResponse.json(
        { revoked: true, message: "Token was already revoked", revoked_at: tokenRow.updatedAt || new Date().toISOString() },
        { status: 200, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Revoke
    await freshDb.trustPassportToken.update({
      where: { id: tokenRow.id },
      data: { revoked: true },
    });

    return NextResponse.json(
      {
        revoked: true,
        token: token.substring(0, 8) + "...(redacted)",
        revoked_at: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/trust/revoke] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Trust Passport revoke failed" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
