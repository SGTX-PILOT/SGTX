import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST(req: NextRequest) {
  // Feature gate — Platform Admin can deactivate the GTID Chat add-on.
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  try {
    const { participant1Gtid, participant2Gtid, ustn, createdBy } = await req.json();
    if (!participant1Gtid || !participant2Gtid) return NextResponse.json({ error: "participant1Gtid and participant2Gtid required" }, { status: 400 });
    const chatId = `CHAT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
    const chat = await db.gtidChat.create({ data: { chatId, participant1Gtid, participant2Gtid, ustn: ustn || null, status: "ACTIVE", createdBy: createdBy || participant1Gtid } });
    return NextResponse.json({ ok: true, chat });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
export async function GET(req: NextRequest) {
  // Feature gate (also gates read access when chat is deactivated)
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const status = req.nextUrl.searchParams.get("status") || "ACTIVE";
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const chats = await db.gtidChat.findMany({ where: { OR: [{ participant1Gtid: tenantGtid }, { participant2Gtid: tenantGtid }], status }, orderBy: { lastMessageAt: "desc" }, take: 50 });
  return NextResponse.json({ ok: true, chats, total: chats.length });
}
