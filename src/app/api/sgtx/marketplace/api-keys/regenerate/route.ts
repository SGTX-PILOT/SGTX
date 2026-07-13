import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

// POST /api/sgtx/marketplace/api-keys/regenerate
// Body: { partnerGtid? }
// Generates a new API key. Old key invalidated immediately.
// (In production, a 24-hour grace period would apply — Part 12C.12.6.)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const partnerGtid = body.partnerGtid || DEFAULT_PARTNER_GTID;
  try {
    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "Partner not found" }, { status: 404 });
    }

    const newKey = `sgtx_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`;
    const updated = await db.marketplacePartner.update({
      where: { partnerGtid },
      data: { apiKey: newKey },
    });

    const masked =
      newKey.length > 16
        ? `${newKey.slice(0, 12)}${"•".repeat(8)}${newKey.slice(-4)}`
        : `${newKey.slice(0, 4)}${"•".repeat(8)}`;

    return NextResponse.json({
      ok: true,
      masked,
      prefix: newKey.slice(0, 12),
      previousKeyLast4: partner.apiKey.slice(-4),
      regeneratedAt: updated.createdAt, // schema has no updatedAt — use createdAt as proxy timestamp
      note: "Old API key invalidated immediately. Update your integration to use the new key.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
