// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/marketplace/leads/[id]/accept
// Body: { partnerGtid?, acceptedBy? }
// Marks a lead attribution as ACCEPTED. Idempotent — accepting an already
// ACCEPTED lead is a no-op. Fires a webhook event so the partner's
// downstream system can record acceptance.
//
// v18 §16.8.14 Tab 1 (Leads/Intent Inbox) — the partner's Accept button
// calls this endpoint.
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const { id } = params;
  if (!id) {
    return NextResponse.json({ error: "lead id required" }, { status: 400 });
  }
  const body = await req.json().catch(() => ({} as any));
  try {
    const lead = await db.partnerLeadAttribution.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }
    if (lead.status === "REJECTED") {
      return NextResponse.json(
        { error: "cannot accept a lead that was already rejected" },
        { status: 409 },
      );
    }
    if (lead.status === "ACCEPTED") {
      return NextResponse.json({ ok: true, lead, idempotent: true });
    }
    const updated = await db.partnerLeadAttribution.update({
      where: { id },
      data: { status: "ACCEPTED" },
    });

    // Best-effort webhook fire
    const partner = await db.marketplacePartner.findUnique({
      where: { partnerGtid: lead.partnerGtid },
    });
    if (partner?.webhookUrl) {
      try {
        await fetch(partner.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-SGTX-Event": "lead.accepted" },
          body: JSON.stringify({
            event: "lead.accepted",
            data: { leadId: lead.id, acceptedBy: body.acceptedBy || "partner" },
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
    }
    await db.webhookDeliveryLog.create({
      data: {
        partnerGtid: lead.partnerGtid,
        eventType: "lead.accepted",
        payload: JSON.stringify({ leadId: lead.id, acceptedBy: body.acceptedBy || "partner" }),
        responseStatus: null,
        deliveredAt: new Date(),
        retryCount: 0,
      },
    });

    return NextResponse.json({ ok: true, lead: updated });
  } catch (e: any) {
    logger.error("[api/marketplace/leads/accept] POST failed", { error: e?.message, id });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
