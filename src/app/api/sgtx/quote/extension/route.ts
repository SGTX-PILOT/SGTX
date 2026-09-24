// @ts-nocheck
/**
 * POST /api/sgtx/quote/extension
 *
 * v18 §16.9.3.5 — Deadline Extension Request.
 *
 * Either party can request an extension on an active offer. The counterparty
 * receives a Smart Inbox item and can approve (one click) or reject (with reason).
 *
 * Body: {
 *   ustn: string,
 *   duration: "24h" | "48h" | "7d" | string,  // extension duration
 *   reason?: string,  // optional but recommended
 *   requesterGtid: string,
 * }
 *
 * Returns: {
 *   ok: true,
 *   extensionId: string,
 *   status: "EXTENSION_REQUESTED",
 *   proposedDeadline: string,  // new ISO deadline
 *   createdAt: string,
 * }
 */
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const DURATION_MS: Record<string, number> = {
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, duration, reason, requesterGtid } = body;

    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
    if (!duration) return NextResponse.json({ error: "duration required (24h/48h/7d)" }, { status: 400 });
    if (!requesterGtid) return NextResponse.json({ error: "requesterGtid required" }, { status: 400 });

    const durationMs = DURATION_MS[duration] || parseInt(duration, 10) || 24 * 60 * 60 * 1000;
    const proposedDeadline = new Date(Date.now() + durationMs).toISOString();

    // Verify trade exists
    const trade = await db.trade.findUnique({ where: { ustn } });
    if (!trade) {
      return NextResponse.json({ error: `Trade ${ustn} not found` }, { status: 404 });
    }

    // Log activity
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: requesterGtid,
        action: "QUOTE_DEADLINE_EXTENSION_REQUESTED",
        description: `Extension requested: +${duration}. Reason: ${reason || "N/A"}`,
        metadata: JSON.stringify({ duration, reason, proposedDeadline, requesterGtid }),
      },
    }).catch(() => {});

    // Smart Inbox to counterparty
    const counterpartyGtid = requesterGtid === trade.buyerGtid ? trade.sellerGtid : trade.buyerGtid;
    await db.inboxItem.create({
      data: {
        ustn,
        tenantGtid: counterpartyGtid,
        category: "NEGOTIATION",
        title: `Deadline extension request for ${ustn}`,
        description: `+${duration} requested. Reason: ${reason || "N/A"}. Proposed new deadline: ${proposedDeadline}`,
        priority: 70,
        ctaLabel: "Approve Extension",
        ctaUrl: `/trades/${ustn}`,
        status: "PENDING",
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000), // must respond within 24h
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      extensionId: `EXT-${Date.now()}`,
      status: "EXTENSION_REQUESTED",
      proposedDeadline,
      duration,
      reason: reason || null,
      createdAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[quote/extension] POST failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
