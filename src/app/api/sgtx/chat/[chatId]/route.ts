import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function GET(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  // Feature gate — Platform Admin can deactivate the GTID Chat add-on.
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  try {
    const { chatId } = await params;
    let chat = await db.gtidChat.findUnique({ where: { chatId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } } });
    if (!chat) chat = await db.gtidChat.findUnique({ where: { id: chatId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    return NextResponse.json({ ok: true, chat });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
