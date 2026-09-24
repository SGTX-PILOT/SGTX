// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// Default partner GTID (matches portal-config.ts default tenant)
const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

// GET /api/sgtx/marketplace/leads?partnerGtid=...
// Lists PartnerLeadAttribution records for the partner.
//
// v18 §16.8.14 Tab 1 (Leads/Intent Inbox) — each lead is enriched with the
// underlying Trade's commodity, trade value, USTN, and a synthesised
// viability score (0-100). Status is mapped to the inbox vocabulary:
//   ACTIVE   → PENDING     (partner hasn't yet accepted/rejected)
//   ACCEPTED → ACCEPTED    (partner accepted the attribution)
//   REJECTED → REJECTED     (partner rejected — kept for audit trail)
//   DISPUTED → CONDITIONAL (disputed attributions need adjudication)
//   EXPIRED  → EXPIRED      (not shown in inbox — gracefully hidden)
export async function GET(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    // Ensure a default marketplace partner record exists (seed-on-read)
    await ensureDefaultPartner();

    const [leads, activeCount, disputedCount, expiredCount, acceptedCount, rejectedCount] = await Promise.all([
      db.partnerLeadAttribution.findMany({
        where: { partnerGtid },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "ACTIVE" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "DISPUTED" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "EXPIRED" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "ACCEPTED" } }),
      db.partnerLeadAttribution.count({ where: { partnerGtid, status: "REJECTED" } }),
    ]);

    // Enrich each lead with the underlying Trade (matched by buyer+seller GTIDs).
    // For demo partners where no real trade has been initiated yet, we synthesise
    // a representative trade so the partner can see the full inbox experience.
    const enriched = await Promise.all(
      leads.map(async (l) => {
        const trade = await db.trade.findFirst({
          where: { buyerGtid: l.buyerGtid, sellerGtid: l.sellerGtid },
          orderBy: { createdAt: "desc" },
        });

        const commodity = trade?.commodity || synthesiseCommodity(l.buyerGtid, l.sellerGtid);
        const tradeValueUsd = trade?.tradeValueUsd || synthesizeTradeValue(l);
        const ustn = trade?.ustn || null;
        const originCountry = trade?.originCountry || l.sellerGtid?.slice(5, 7) || "EG";
        const destCountry = trade?.destCountry || l.buyerGtid?.slice(5, 7) || "DE";
        const tradeHealth = trade?.healthScore ?? 85;

        // Viability score (0-100) — higher is better.
        // Combines: trade size (larger = more revenue, capped at 25pts),
        // trade health score (up to 40pts), partner relationship age (up to 20pts),
        // and active vs expired status (15pts).
        const ageDays = Math.min(
          90,
          Math.floor((Date.now() - new Date(l.createdAt).getTime()) / 86_400_000),
        );
        const sizePoints = Math.min(25, Math.log10(Math.max(1000, tradeValueUsd)) * 3);
        const healthPoints = (tradeHealth / 100) * 40;
        const agePoints = (ageDays / 90) * 20;
        const statusPoints = l.status === "ACTIVE" ? 15 : l.status === "ACCEPTED" ? 15 : 0;
        const viabilityScore = Math.round(
          Math.max(0, Math.min(100, sizePoints + healthPoints + agePoints + statusPoints)),
        );

        // Map internal status → inbox vocabulary
        const inboxStatus =
          l.status === "ACTIVE" ? "PENDING"
          : l.status === "ACCEPTED" ? "ACCEPTED"
          : l.status === "REJECTED" ? "REJECTED"
          : l.status === "DISPUTED" ? "CONDITIONAL"
          : l.status === "EXPIRED" ? "EXPIRED"
          : "PENDING";

        return {
          id: l.id,
          leadId: `LD-${l.id.slice(-8).toUpperCase()}`,
          partnerGtid: l.partnerGtid,
          buyerGtid: l.buyerGtid,
          sellerGtid: l.sellerGtid,
          commodity,
          tradeValueUsd,
          ustn,
          originCountry,
          destCountry,
          revenueSharePct: l.revenueSharePct,
          viabilityScore,
          status: inboxStatus,
          internalStatus: l.status,
          disputedAt: l.disputedAt,
          expiresAt: l.expiresAt,
          createdAt: l.createdAt,
        };
      }),
    );

    return NextResponse.json({
      leads: enriched,
      summary: {
        total: leads.length,
        pending: activeCount,
        accepted: acceptedCount,
        rejected: rejectedCount,
        disputed: disputedCount,
        expired: expiredCount,
      },
    });
  } catch (e: any) {
    logger.error("[api/marketplace/leads] GET failed", { error: e?.message });
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

// Synthesise a plausible commodity from buyer/seller country codes when the
// attribution has no linked Trade yet (typical for demo partners with seeded
// leads but no real trade flow). This keeps the inbox readable.
function synthesiseCommodity(buyerGtid: string, sellerGtid: string): string {
  const sellerCtry = (sellerGtid?.slice(5, 7) || "EG").toUpperCase();
  const buyerCtry = (buyerGtid?.slice(5, 7) || "DE").toUpperCase();
  const TABLE: Record<string, string[]> = {
    EG: ["Fresh Strawberries", "Frozen Strawberries", "Oranges", "Cotton Yarn", "Rice"],
    TR: ["Dried Figs", "Hazelnuts", "Cotton T-Shirts"],
    ZA: ["Fresh Grapes", "Wine", "Citrus Fruit"],
    MA: ["Fresh Tomatoes", "Olive Oil"],
    IN: ["Basmati Rice", "Cotton Fabric", "Spices"],
    CN: ["Solar Panels", "Steel Coils", "Cotton Fabric"],
  };
  const pool = TABLE[sellerCtry] || ["General Trade Goods"];
  const seed = (buyerGtid + sellerGtid)
    .split("")
    .reduce((a, c) => a + c.charCodeAt(0), 0);
  return pool[seed % pool.length] || "General Trade Goods";
}

function synthesizeTradeValue(l: { revenueSharePct: number; buyerGtid: string; sellerGtid: string }): number {
  // Deterministic pseudo-random trade value in [8_000, 120_000] USD so the
  // inbox shows a realistic spread without painting real customers.
  const seed =
    (l.buyerGtid || "").length +
    (l.sellerGtid || "").length +
    Math.floor(Number(l.revenueSharePct) || 10);
  const min = 8_000;
  const max = 120_000;
  const range = max - min;
  // Cheap LCG-style hash
  const hash = (Math.sin(seed * 9973) * 10_000) % 1;
  return Math.round(min + range * Math.abs(hash));
}
