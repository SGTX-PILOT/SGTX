import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

// GET /api/sgtx/chat?tenantGtid=...&status=ACTIVE
// Lists all chats where tenantGtid is participant1 or participant2.
// This is the canonical list endpoint — UI calls /api/sgtx/chat (not /api/sgtx/chat/start).
export async function GET(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the GTID Chat add-on.
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const status = req.nextUrl.searchParams.get("status") || "ACTIVE";
  const ustn = req.nextUrl.searchParams.get("ustn");

  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }

  const where: any = {
    OR: [{ participant1Gtid: tenantGtid }, { participant2Gtid: tenantGtid }],
    status,
  };
  if (ustn) where.ustn = ustn;

  const chats = await db.gtidChat.findMany({
    where,
    orderBy: { lastMessageAt: "desc" },
    take: 50,
    include: {
      messages: { orderBy: { createdAt: "desc" }, take: 1, select: { message: true, senderName: true, createdAt: true } },
    },
  });

  return NextResponse.json({ ok: true, chats, total: chats.length });
}
