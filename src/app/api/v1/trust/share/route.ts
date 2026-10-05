// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createHash, randomBytes } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/v1/trust/share — Generate a sharing token for the caller's Trust Passport (v18 §4.12.4)
//
// v18 §4.12.4 Step 2 — Share with Counterparty: the admin clicks "Share
// Passport" → selects the recipient's GTID (from saved contacts) or chooses
// "Anyone with link" (anonymous token). The admin selects which dimensions
// to share. Click "Generate Link" → the system returns a one-time token URL.
//
// Auth: Bearer JWT (caller must have a valid Trust Passport).
//
// Request body:
//   {
//     "shared_with_gtid": "SGTX-EG-TRD-002139-XXXX" | null,
//     "dimensions": ["tri_score", "compliance_health", ...],
//     "expires_in_days": 7 (default) | 30 (max)
//   }
//
// Response shape:
//   {
//     "token": "<one-time-token>",
//     "verification_url": "/api/v1/trust/verify/<token>",
//     "shared_with_gtid": "..." | null,
//     "dimensions": [...],
//     "expires_at": "<ISO-8601>"
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

const DEFAULT_DIMENSIONS = [
  "tri_score",
  "tri_status",
  "compliance_health",
  "documentation_quality",
];

const ALLOWED_DIMENSIONS = new Set([
  "tri_score",
  "tri_confidence",
  "tri_status",
  "settlement_reliability",
  "compliance_health",
  "documentation_quality",
  "financing_performance",
  "dispute_resolution",
  "customs_performance",
  "logistics_performance",
  "trade_volume_consistency",
  "verified_identifiers",
  "compliance_summary",
  "financing_summary",
  "dispute_summary",
  "trust_graph_reference",
]);

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

    const sharedWithGtid = body?.shared_with_gtid ?? null;
    const requestedDimensions: string[] = Array.isArray(body?.dimensions)
      ? body.dimensions
      : DEFAULT_DIMENSIONS;
    const expiresInDays = Math.min(Math.max(1, body?.expires_in_days ?? 7), 30);

    // Validate dimensions
    const invalidDimensions = requestedDimensions.filter((d) => !ALLOWED_DIMENSIONS.has(d));
    if (invalidDimensions.length > 0) {
      return NextResponse.json(
        { error: "Invalid dimensions", invalid: invalidDimensions, allowed: Array.from(ALLOWED_DIMENSIONS) },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");
    const passport = await freshDb.trustPassport.findUnique({
      where: { tenantGtid: caller.gtid },
    });

    if (!passport) {
      return NextResponse.json(
        {
          error: "PASSPORT_NOT_FOUND",
          message: "You do not have a Trust Passport. Generate one first via POST /api/sgtx/trust-passport/generate",
        },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    if (passport.expiresAt && passport.expiresAt < new Date()) {
      return NextResponse.json(
        { error: "PASSPORT_EXPIRED", message: "Your Trust Passport has expired. Generate a new one first" },
        { status: 410, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Verify the recipient is a saved contact (if specific GTID given)
    if (sharedWithGtid) {
      const contact = await freshDb.savedContact.findFirst({
        where: { ownerGtid: caller.gtid, contactGtid: sharedWithGtid.toUpperCase() },
      });
      if (!contact) {
        return NextResponse.json(
          { error: "RECIPIENT_NOT_SAVED_CONTACT", message: "Recipient must be a saved contact (non-marketplace rule)" },
          { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
        );
      }
    }

    // Generate one-time token
    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

    // Persist the share token (v18 §4.12.6 TrustPassportToken)
    const tokenRow = await freshDb.trustPassportToken.create({
      data: {
        passportId: passport.id,
        token,
        sharedWithGtid: sharedWithGtid ? sharedWithGtid.toUpperCase() : null,
        dimensions: JSON.stringify(requestedDimensions),
        expiresAt,
        revoked: false,
      },
    });

    return NextResponse.json(
      {
        token,
        verification_url: `/api/v1/trust/verify/${token}`,
        shared_with_gtid: sharedWithGtid ? sharedWithGtid.toUpperCase() : null,
        dimensions: requestedDimensions,
        expires_at: expiresAt.toISOString(),
        token_id: tokenRow.id,
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/trust/share] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Trust Passport share failed" },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
