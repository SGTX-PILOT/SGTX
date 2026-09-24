// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/marketplace/api-keys/revoke
// Body: { partnerGtid?, reason? }
//
// Revokes the partner's current API key by:
//   1. Replacing it with a `sgtx_revoked_…` placeholder (the apiKey column
//      is UNIQUE + NOT NULL, so we cannot null it out without a schema
//      migration).
//   2. Setting partner.status = "REVOKED" so any inbound API call hits a
//      401 on the auth gate.
//
// The partner can re-activate by calling POST /api/sgtx/api-keys/regenerate
// (which generates a fresh key + sets status back to "ACTIVE").
//
// v18 §16.8.14 Tab 4 (API Key Management) — the Revoke button calls this.
const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const partnerGtid = body.partnerGtid || DEFAULT_PARTNER_GTID;
    const reason = String(body.reason || "manual revoke").trim();

    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "partner not found" }, { status: 404 });
    }
    const previousKeyLast4 = partner.apiKey.slice(-4);
    const revokedKey = `sgtx_revoked_${Math.random().toString(36).slice(2, 18)}`;
    const updated = await db.marketplacePartner.update({
      where: { partnerGtid },
      data: { apiKey: revokedKey, status: "REVOKED" },
    });

    return NextResponse.json({
      ok: true,
      revokedAt: new Date().toISOString(),
      previousKeyLast4,
      reason,
      note: "API key replaced with `sgtx_revoked_…` placeholder and partner status set to REVOKED. Inbound requests will fail auth until you regenerate a new key.",
    });
  } catch (e: any) {
    logger.error("[api/marketplace/api-keys/revoke] POST failed", { error: e?.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
