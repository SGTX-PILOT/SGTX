import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

// GET /api/sgtx/marketplace/webhooks?partnerGtid=...
// Lists WebhookDeliveryLog records for the partner + their currently
// registered webhook URL (the partner record stores a single webhookUrl;
// the delivery log retains the full history of every attempt).
//
// v18 §16.8.14 Tab 2 (Webhook Management) — read side of the panel.
export async function GET(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });

    const [logs, delivered, failed, retried] = await Promise.all([
      db.webhookDeliveryLog.findMany({
        where: { partnerGtid },
        orderBy: { createdAt: "desc" },
        take: 100,
      }),
      db.webhookDeliveryLog.count({ where: { partnerGtid, deliveredAt: { not: null } } }),
      db.webhookDeliveryLog.count({ where: { partnerGtid, OR: [{ deliveredAt: null }, { responseStatus: { not: 200 } }] } }),
      db.webhookDeliveryLog.count({ where: { partnerGtid, retryCount: { gt: 0 } } }),
    ]);

    // Compute the success rate from the last 50 deliveries — surfaces a
    // honest "this week's reliability" number rather than a cumulative
    // ratio that's heavily skewed by historical failures.
    const recent = logs.slice(0, 50);
    const recentDelivered = recent.filter((l) => l.deliveredAt).length;
    const recentSuccessRate =
      recent.length > 0 ? Math.round((recentDelivered / recent.length) * 100) : 0;

    // Last delivery timestamp (for the "last delivery" column)
    const lastDelivery = logs[0]?.createdAt ?? null;

    return NextResponse.json({
      partner: partner
        ? {
            partnerGtid: partner.partnerGtid,
            partnerName: partner.partnerName,
            webhookUrl: partner.webhookUrl,
            status: partner.status,
            // Schema only stores one webhook URL; we surface it as a single
            // "registered webhook" so the UI can render the register/delete
            // affordances honestly.
            registeredWebhooks: partner.webhookUrl
              ? [
                  {
                    id: `wh-${partner.partnerGtid.slice(-8)}`,
                    url: partner.webhookUrl,
                    events: [
                      "lead.created",
                      "lead.accepted",
                      "lead.rejected",
                      "lead.expired",
                      "revenue.attributed",
                      "revenue.disputed",
                      "agreement.updated",
                      "test.ping",
                    ],
                    status: partner.status === "ACTIVE" ? "ACTIVE" : "INACTIVE",
                    registeredAt: partner.createdAt,
                    lastDeliveryAt: lastDelivery,
                    recentSuccessRate,
                  },
                ]
              : [],
          }
        : null,
      logs,
      summary: {
        total: logs.length,
        delivered,
        failed,
        retried,
        deliveryRate: logs.length > 0 ? Math.round((delivered / logs.length) * 100) : 0,
        recentSuccessRate,
        lastDeliveryAt: lastDelivery,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/sgtx/marketplace/webhooks?partnerGtid=...
// Unregisters (clears) the partner's webhook URL. The delivery log is
// preserved for audit. Useful when rotating to a new endpoint or
// pausing integrations.
export async function DELETE(req: NextRequest) {
  const partnerGtid = req.nextUrl.searchParams.get("partnerGtid") || DEFAULT_PARTNER_GTID;
  try {
    const partner = await db.marketplacePartner.findUnique({ where: { partnerGtid } });
    if (!partner) {
      return NextResponse.json({ error: "partner not found" }, { status: 404 });
    }
    const previous = partner.webhookUrl;
    await db.marketplacePartner.update({
      where: { partnerGtid },
      data: { webhookUrl: null },
    });
    return NextResponse.json({
      ok: true,
      previousUrl: previous,
      note: "Webhook URL cleared. Delivery log retained for audit.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
