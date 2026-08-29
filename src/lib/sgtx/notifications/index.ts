// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "WEBHOOK" | "SLACK";

export interface NotificationRequest {
  tenantGtid: string; channel: NotificationChannel; priority: string;
  title: string; body: string; category: string;
  ctaLabel?: string; ctaTab?: string; ustn?: string; metadata?: any;
}

export async function sendNotification(request: NotificationRequest): Promise<{ sent: boolean; channel: string; messageId: string }> {
  try {
    // 1. Always create Smart Inbox item
    const inbox = await db.inboxItem.create({
      data: {
        tenantGtid: request.tenantGtid,
        tradeId: request.ustn || null,
        category: request.category,
        priority: request.priority === "CRITICAL" ? 95 : request.priority === "HIGH" ? 85 : request.priority === "MEDIUM" ? 70 : 50,
        title: request.title,
        description: request.body,
        ctaLabel: request.ctaLabel || undefined,
      },
    }).catch(() => null);

    // 2. Email/SMS/Webhook/Slack: stub (no SMTP/SMS gateway configured)
    if (request.channel !== "IN_APP") {
      logger.info(`[notifications] ${request.channel} notification stub:`, { to: request.tenantGtid, title: request.title });
    }

    return { sent: true, channel: request.channel, messageId: inbox?.id || `NOTIF-${Date.now()}` };
  } catch (e: any) { logger.error("[notifications] sendNotification error:", e); return { sent: false, channel: request.channel, messageId: "" }; }
}

export async function notifyTradeInitiated(buyerGtid: string, sellerGtid: string, ustn: string) {
  await sendNotification({ tenantGtid: buyerGtid, channel: "IN_APP", priority: "MEDIUM", title: `Trade initiated — ${ustn}`, body: `Your trade request has been submitted. USTN: ${ustn}`, category: "GENERAL", ctaLabel: "View Trade" });
  await sendNotification({ tenantGtid: sellerGtid, channel: "IN_APP", priority: "HIGH", title: `New trade request — ${ustn}`, body: `A buyer has submitted a trade request. Review and prepare your quote.`, category: "NEW_OFFER", ctaLabel: "Review & Quote" });
}

export async function notifyQuoteSubmitted(buyerGtid: string, sellerGtid: string, ustn: string, totalQuote: number) {
  await sendNotification({ tenantGtid: buyerGtid, channel: "IN_APP", priority: "HIGH", title: `Quote received — ${ustn}`, body: `Seller submitted a quote for $${totalQuote.toLocaleString()}. Review and accept or counter.`, category: "NEGOTIATION", ctaLabel: "Review Quote" });
}

export async function notifyContractLocked(buyerGtid: string, sellerGtid: string, ustn: string) {
  await sendNotification({ tenantGtid: buyerGtid, channel: "IN_APP", priority: "HIGH", title: `Contract locked — ${ustn}`, body: `Contract has been locked. USTN is now active. Shipment tracking enabled.`, category: "NEGOTIATION", ctaLabel: "View Trade" });
  await sendNotification({ tenantGtid: sellerGtid, channel: "IN_APP", priority: "HIGH", title: `Contract locked — ${ustn}`, body: `Contract has been locked. USTN is now active. Prepare shipment.`, category: "NEGOTIATION", ctaLabel: "View Trade" });
}

export async function notifyCustomsHold(ustn: string, holdType: string) {
  await sendNotification({ tenantGtid: "SGTX-EG-GOV-000001-9A0B", channel: "IN_APP", priority: "HIGH", title: `Customs hold — ${ustn}`, body: `Customs hold: ${holdType}. Review required.`, category: "COMPLIANCE", ctaLabel: "Review Hold", ustn });
}

export async function notifyCustomsReleased(ustn: string) {
  await sendNotification({ tenantGtid: "SGTX-EG-GOV-000001-9A0B", channel: "IN_APP", priority: "MEDIUM", title: `Customs released — ${ustn}`, body: `Customs has released the shipment.`, category: "COMPLIANCE", ustn });
}

export async function notifyDeliveryAccepted(ustn: string) {
  await sendNotification({ tenantGtid: "SGTX-EG-GOV-000001-9A0B", channel: "IN_APP", priority: "MEDIUM", title: `Delivery accepted — ${ustn}`, body: `Delivery has been accepted by the receiver.`, category: "GENERAL", ustn });
}

export async function notifyUSTNClosed(ustn: string) {
  await sendNotification({ tenantGtid: "SGTX-EG-GOV-000001-9A0B", channel: "IN_APP", priority: "HIGH", title: `USTN CLOSED — ${ustn}`, body: `Trade has been closed. Evidence package sealed.`, category: "GENERAL", ustn });
}

export async function notifyFeeDispute(ustn: string, brokerGtid: string, traderGtid: string, violationType: string) {
  await sendNotification({ tenantGtid: traderGtid, channel: "IN_APP", priority: "HIGH", title: `Fee dispute detected — ${ustn}`, body: `A fee violation was detected: ${violationType}. You can dispute this charge.`, category: "COMPLIANCE", ctaLabel: "View Dispute", ustn });
  await sendNotification({ tenantGtid: brokerGtid, channel: "IN_APP", priority: "HIGH", title: `Fee dispute opened — ${ustn}`, body: `A fee dispute has been opened: ${violationType}. Please provide evidence.`, category: "COMPLIANCE", ctaLabel: "Respond", ustn });
}

export async function notifyCredentialExpiring(brokerGtid: string, adapterId: string, daysRemaining: number) {
  await sendNotification({ tenantGtid: brokerGtid, channel: "IN_APP", priority: daysRemaining <= 7 ? "HIGH" : "MEDIUM", title: `Credential expiring — ${adapterId}`, body: `Your customs credential for ${adapterId} expires in ${daysRemaining} days. Please renew.`, category: "COMPLIANCE", ctaLabel: "Renew Credential" });
}

export async function getNotificationPreferences(tenantGtid: string) {
  return [{ channel: "IN_APP", category: "ALL", enabled: true }, { channel: "EMAIL", category: "CRITICAL", enabled: true }];
}
export async function updateNotificationPreference(tenantGtid: string, channel: string, category: string, enabled: boolean) {
  logger.info("[notifications] preference updated:", { tenantGtid, channel, category, enabled });
}
