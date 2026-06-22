import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  // Feature gate — Platform Admin can deactivate the GTID Chat add-on.
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  try {
    const { chatId } = await params;
    const { senderGtid, senderName, message, attachments } = await req.json();
    let chat = await db.gtidChat.findUnique({ where: { chatId } });
    if (!chat) chat = await db.gtidChat.findUnique({ where: { id: chatId } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    const msg = await db.gtidChatMessage.create({ data: { chatId: chat.chatId, senderGtid, senderName, message, attachments: attachments ? JSON.stringify(attachments) : null } });
    await db.gtidChat.update({ where: { id: chat.id }, data: { lastMessageAt: new Date() } });
    return NextResponse.json({ ok: true, messageId: msg.id });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
