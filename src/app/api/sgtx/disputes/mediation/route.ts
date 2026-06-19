import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { postMediationMessage } from "@/lib/sgtx/dispute";

// GET /api/sgtx/disputes/mediation?disputeId=...
// Returns the mediation log for a dispute (blueprint 10.5)
export async function GET(req: NextRequest) {
  try {
    const disputeId = req.nextUrl.searchParams.get("disputeId");
    if (!disputeId) {
      return NextResponse.json({ error: "disputeId required" }, { status: 400 });
    }
    const dispute = await db.dispute.findUnique({
      where: { id: disputeId },
      include: { trade: { select: { ustn: true, commodity: true, tradeValueUsd: true } } },
    });
    if (!dispute) {
      return NextResponse.json({ error: "Dispute not found" }, { status: 404 });
    }
    const messages = await db.disputeMediation.findMany({
      where: { disputeId },
      orderBy: { createdAt: "asc" },
    });
    return NextResponse.json({
      ok: true,
      dispute: {
        id: dispute.id,
        status: dispute.status,
        type: dispute.type,
        description: dispute.description,
        claimAmountUsd: dispute.claimAmountUsd,
        trade: dispute.trade,
      },
      messages: messages.map((m: any) => ({
        id: m.id,
        senderGtid: m.senderGtid,
        senderName: m.senderName,
        senderRole: m.senderRole,
        messageType: m.messageType,
        messageText: m.messageText,
        offerAmountUsd: m.offerAmountUsd,
        offerConditions: m.offerConditions ? JSON.parse(m.offerConditions) : null,
        sentimentScore: m.sentimentScore,
        sentimentFlag: m.sentimentFlag,
        createdAt: m.createdAt,
      })),
      count: messages.length,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to fetch mediation log" }, { status: 500 });
  }
}

// POST /api/sgtx/disputes/mediation — Post a mediation message
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await postMediationMessage(body);
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
