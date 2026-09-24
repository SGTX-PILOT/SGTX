// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/marketplace/revenue/dispute
// Body: { partnerGtid?, leadId, reason }
//
// Marks a lead attribution as DISPUTED and stamps disputedAt. The reason
// is recorded on the WebhookDeliveryLog so the partner's audit trail can
// reconstruct the dispute history. Reason is required (≥20 chars).
//
// v18 §16.8.14 Tab 4 (Revenue Attribution) — the Dispute Attribution
// button calls this.
const DEFAULT_PARTNER_GTID = "SGTX-ZZ-MKT-000001-C3D4";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const partnerGtid = body.partnerGtid || DEFAULT_PARTNER_GTID;
    const leadId = String(body.leadId || "").trim();
    const reason = String(body.reason || "").trim();
    if (!leadId) {
      return NextResponse.json({ error: "leadId required" }, { status: 400 });
    }
    if (reason.length < 20) {
      return NextResponse.json(
        { error: "reason must be ≥20 characters" },
        { status: 400 },
      );
    }
    const lead = await db.partnerLeadAttribution.findUnique({ where: { id: leadId } });
    if (!lead) {
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }
    if (lead.partnerGtid !== partnerGtid) {
      return NextResponse.json(
        { error: "lead does not belong to this partner" },
        { status: 403 },
      );
    }
    const updated = await db.partnerLeadAttribution.update({
      where: { id: leadId },
      data: { status: "DISPUTED", disputedAt: new Date() },
    });

    // Record the dispute on the webhook log so the partner's audit trail
    // retains the reason + timestamp regardless of whether a webhook fires.
    await db.webhookDeliveryLog.create({
      data: {
        partnerGtid,
        eventType: "revenue.disputed",
        payload: JSON.stringify({ leadId, reason, disputedAt: new Date().toISOString() }),
        responseStatus: null,
        deliveredAt: new Date(),
        retryCount: 0,
      },
    });

    return NextResponse.json({
      ok: true,
      lead: updated,
      dispute: {
        leadId,
        reason,
        disputedAt: updated.disputedAt,
      },
    });
  } catch (e: any) {
    logger.error("[api/marketplace/revenue/dispute] POST failed", { error: e?.message });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
