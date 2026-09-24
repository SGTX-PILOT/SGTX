// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/marketplace/leads/[id]/reject
// Body: { reason, rejectedBy? }
// Marks a lead attribution as REJECTED. Reason is required (≥10 chars) and
// is recorded on the webhook log payload so the partner's audit trail can
// reconstruct why a lead was declined.
//
// v18 §16.8.14 Tab 1 (Leads/Intent Inbox) — the partner's Reject button
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
  const reason = String(body.reason || "").trim();
  if (reason.length < 10) {
    return NextResponse.json(
      { error: "reason must be ≥10 characters" },
      { status: 400 },
    );
  }
  try {
    const lead = await db.partnerLeadAttribution.findUnique({ where: { id } });
    if (!lead) {
      return NextResponse.json({ error: "lead not found" }, { status: 404 });
    }
    if (lead.status === "ACCEPTED") {
      return NextResponse.json(
        { error: "cannot reject a lead that was already accepted" },
        { status: 409 },
      );
    }
    if (lead.status === "REJECTED") {
      return NextResponse.json({ ok: true, lead, idempotent: true });
    }
    const updated = await db.partnerLeadAttribution.update({
      where: { id },
      data: { status: "REJECTED" },
    });

    // Best-effort webhook fire
    const partner = await db.marketplacePartner.findUnique({
      where: { partnerGtid: lead.partnerGtid },
    });
    if (partner?.webhookUrl) {
      try {
        await fetch(partner.webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-SGTX-Event": "lead.rejected" },
          body: JSON.stringify({
            event: "lead.rejected",
            data: { leadId: lead.id, reason, rejectedBy: body.rejectedBy || "partner" },
            timestamp: new Date().toISOString(),
          }),
          signal: AbortSignal.timeout(5000),
        });
      } catch {}
    }
    await db.webhookDeliveryLog.create({
      data: {
        partnerGtid: lead.partnerGtid,
        eventType: "lead.rejected",
        payload: JSON.stringify({ leadId: lead.id, reason, rejectedBy: body.rejectedBy || "partner" }),
        responseStatus: null,
        deliveredAt: new Date(),
        retryCount: 0,
      },
    });

    return NextResponse.json({ ok: true, lead: updated });
  } catch (e: any) {
    logger.error("[api/marketplace/leads/reject] POST failed", { error: e?.message, id });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
