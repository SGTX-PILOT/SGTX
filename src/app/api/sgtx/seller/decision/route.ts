// POST /api/sgtx/seller/decision — Seller accepts/clarifies/declines/proposes changes

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tradeRequestId, sellerGtid, action, clarificationQuestions, proposedChanges, declineReason } = body;

    if (!tradeRequestId || !sellerGtid || !action) {
      return NextResponse.json({ error: "tradeRequestId, sellerGtid, and action required" }, { status: 400 });
    }

    if (!["ACCEPT", "CLARIFY", "PROPOSE_CHANGES", "DECLINE"].includes(action)) {
      return NextResponse.json({ error: "action must be ACCEPT, CLARIFY, PROPOSE_CHANGES, or DECLINE" }, { status: 400 });
    }

    const trade = await db.trade.findUnique({ where: { id: tradeRequestId } });
    if (!trade) {
      return NextResponse.json({ error: "Trade request not found" }, { status: 404 });
    }
    if (trade.sellerGtid !== sellerGtid) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 });
    }

    let newStatus = trade.status;

    if (action === "ACCEPT") {
      newStatus = "SELLER_ACCEPTED";
      await db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          category: "SELLER_ACCEPTED",
          priority: "HIGH",
          title: "Seller accepted your request",
          message: `Seller has accepted your trade request.`,
          actionUrl: `/trades/${trade.ustn}`,
          dismissed: false,
        },
      }).catch(() => {});
    } else if (action === "CLARIFY") {
      newStatus = "CLARIFICATION_REQUESTED";
      if (clarificationQuestions && Array.isArray(clarificationQuestions)) {
        for (const q of clarificationQuestions) {
          await db.inboxItem.create({
            data: {
              tenantGtid: trade.buyerGtid,
              category: "CLARIFICATION_REQUEST",
              priority: "HIGH",
              title: `Seller question: ${q.field || "General"}`,
              message: q.question || "",
              actionUrl: `/trades/${trade.ustn}`,
              dismissed: false,
            },
          }).catch(() => {});
        }
      }
    } else if (action === "PROPOSE_CHANGES") {
      newStatus = "SELLER_PROPOSED_CHANGES";
      await db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          category: "SELLER_CHANGE_PROPOSAL",
          priority: "HIGH",
          title: "Seller proposed changes",
          message: `Seller has proposed modifications. Review the changes.`,
          actionUrl: `/trades/${trade.ustn}`,
          dismissed: false,
        },
      }).catch(() => {});
    } else if (action === "DECLINE") {
      newStatus = "SELLER_DECLINED";
      await db.inboxItem.create({
        data: {
          tenantGtid: trade.buyerGtid,
          category: "SELLER_DECLINED",
          priority: "MEDIUM",
          title: "Seller declined your request",
          message: `Reason: ${declineReason || "Not specified"}.`,
          actionUrl: `/trades/${trade.ustn}`,
          dismissed: false,
        },
      }).catch(() => {});
    }

    await db.trade.update({ where: { id: tradeRequestId }, data: { status: newStatus } });
    logger.info("seller-decision", { tradeRequestId, action, newStatus });

    return NextResponse.json({ ok: true, action, newStatus });
  } catch (e: any) {
    logger.error("[seller/decision POST] error:", e);
    return NextResponse.json({ error: "Action failed", detail: e?.message }, { status: 500 });
  }
}
