import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const DEFAULT_PARTNER_GTID = "SGTX-XX-MKT-000001-API1";

// GET /api/sgtx/marketplace/webhooks?partnerGtid=...
// Lists WebhookDeliveryLog records for the partner.
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

    return NextResponse.json({
      partner: partner
        ? {
            partnerGtid: partner.partnerGtid,
            partnerName: partner.partnerName,
            webhookUrl: partner.webhookUrl,
            status: partner.status,
          }
        : null,
      logs,
      summary: {
        total: logs.length,
        delivered,
        failed,
        retried,
        deliveryRate: logs.length > 0 ? Math.round((delivered / logs.length) * 100) : 0,
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
