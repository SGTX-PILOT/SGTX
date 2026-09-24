// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/marketplace/webhooks/register
// Body: { partnerGtid?, webhookUrl, events?: string[] }
//
// Registers (or updates) the partner's webhook URL. The MarketplacePartner
// schema supports a single webhook URL column (no separate Webhook model),
// so "register" overwrites the previous URL — the partner's webhook delivery
// log retains the full history regardless.
//
// v18 §16.8.14 Tab 2 (Webhook Management) — the partner's Register Webhook
// button calls this endpoint.
const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

const ALLOWED_EVENTS = new Set([
  "lead.created",
  "lead.accepted",
  "lead.rejected",
  "lead.expired",
  "revenue.attributed",
  "revenue.disputed",
  "agreement.updated",
  "test.ping",
]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const partnerGtid = body.partnerGtid || DEFAULT_PARTNER_GTID;
    const webhookUrl = String(body.webhookUrl || "").trim();
    if (!webhookUrl) {
      return NextResponse.json({ error: "webhookUrl required" }, { status: 400 });
    }
    // Validate URL shape
    try {
      const u = new URL(webhookUrl);
      if (!["http:", "https:"].includes(u.protocol)) {
        throw new Error("protocol must be http or https");
      }
    } catch {
      return NextResponse.json(
        { error: "webhookUrl must be a valid http(s) URL" },
        { status: 400 },
      );
    }
    // Validate events
    const events: string[] = Array.isArray(body.events) ? body.events : [];
    const invalid = events.filter((e) => !ALLOWED_EVENTS.has(e));
    if (invalid.length > 0) {
      return NextResponse.json(
        { error: `unsupported event(s): ${invalid.join(", ")}` },
        { status: 400 },
      );
    }

    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "partner not found" }, { status: 404 });
    }

    const updated = await db.marketplacePartner.update({
      where: { partnerGtid },
      data: { webhookUrl },
    });

    return NextResponse.json({
      ok: true,
      webhook: {
        url: updated.webhookUrl,
        events: events.length > 0 ? events : Array.from(ALLOWED_EVENTS),
        registeredAt: updated.createdAt, // proxy timestamp — schema has no updatedAt
      },
      note: "Webhook URL registered. Delivery log retains full history regardless of updates.",
    });
  } catch (e: any) {
    logger.error("[api/marketplace/webhooks/register] POST failed", { error: e?.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
