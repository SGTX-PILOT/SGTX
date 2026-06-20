import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Default partner GTID (matches portal-config.ts default tenant)
const DEFAULT_PARTNER_GTID = "SGTX-XX-MKT-000001-API1";

// GET /api/sgtx/marketplace/leads?partnerGtid=...
// Lists PartnerLeadAttribution records for the partner.
export async function GET(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    // Ensure a default marketplace partner record exists (seed-on-read)
    await ensureDefaultPartner();

    const [leads, activeCount, disputedCount, expiredCount] = await Promise.all([
      db.partnerLeadAttribution.findMany({
        where: { partnerGtid },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "ACTIVE" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "DISPUTED" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "EXPIRED" } }),
    ]);

    return NextResponse.json({
      leads,
      summary: {
        total: leads.length,
        active: activeCount,
        disputed: disputedCount,
        expired: expiredCount,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/sgtx/marketplace/leads
// Body: { partnerGtid?, buyerGtid, sellerGtid, revenueSharePct?, expiresAt? }
// Called when a trade is initiated with partner attribution (Part 12C.12.3).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any));
  const partnerGtid = body.partnerGtid || DEFAULT_PARTNER_GTID;
  const { buyerGtid, sellerGtid } = body;
  if (!buyerGtid || !sellerGtid) {
    return NextResponse.json(
      { error: "buyerGtid and sellerGtid are required" },
      { status: 400 },
    );
  }
  try {
    await ensureDefaultPartner();

    // Check for existing active attribution for the same buyer-seller pair
    const existing = await db.partnerLeadAttribution.findFirst({
      where: { partnerGtid, buyerGtid, sellerGtid, status: "ACTIVE" },
    });
    if (existing) {
      return NextResponse.json({ ok: true, lead: existing, duplicate: true });
    }

    const lead = await db.partnerLeadAttribution.create({
      data: {
        partnerGtid,
        buyerGtid,
        sellerGtid,
        revenueSharePct: Number(body.revenueSharePct ?? 10),
        status: "ACTIVE",
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    // Fire a webhook event (best-effort, logged to WebhookDeliveryLog)
    await fireWebhook(partnerGtid, "lead.created", {
      leadId: lead.id,
      buyerGtid,
      sellerGtid,
      revenueSharePct: lead.revenueSharePct,
    }).catch(() => {});

    return NextResponse.json({ ok: true, lead });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ---------- helpers ----------
async function ensureDefaultPartner() {
  const exists = await db.marketplacePartner.findUnique({
    where: { partnerGtid: DEFAULT_PARTNER_GTID },
  });
  if (exists) return exists;
  return db.marketplacePartner.create({
    data: {
      partnerGtid: DEFAULT_PARTNER_GTID,
      partnerName: "Acme Trade Marketplace (Demo)",
      apiKey: `sgtx_live_${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 10)}`,
      webhookUrl: "https://example.com/webhooks/sgtx",
      revenueSharePct: 10,
      status: "ACTIVE",
      agreementSignedAt: new Date("2026-01-01"),
    },
  });
}

async function fireWebhook(partnerGtid: string, eventType: string, payload: any) {
  const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
  if (!partner?.webhookUrl) {
    // Log as undeliverable
    await db.webhookDeliveryLog.create({
      data: {
        partnerGtid,
        eventType,
        payload: JSON.stringify(payload),
        responseStatus: null,
        deliveredAt: null,
        retryCount: 0,
      },
    });
    return;
  }
  let responseStatus: number | null = null;
  let deliveredAt: Date | null = null;
  try {
    const res = await fetch(partner.webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-SGTX-Event": eventType },
      body: JSON.stringify({ event: eventType, data: payload, timestamp: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
    responseStatus = res.status;
    if (res.status >= 200 && res.status < 300) deliveredAt = new Date();
  } catch {
    responseStatus = null;
  }
  await db.webhookDeliveryLog.create({
    data: {
      partnerGtid,
      eventType,
      payload: JSON.stringify(payload),
      responseStatus,
      deliveredAt,
      retryCount: 0,
    },
  });
}
