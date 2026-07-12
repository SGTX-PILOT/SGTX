import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { featureGateResponse } from "@/lib/sgtx/platform/feature-check";

export async function POST(req: NextRequest, { params }: { params: Promise<{ chatId: string }> }) {
  // Feature gate — Platform Admin can deactivate the GTID Chat add-on.
  const gate = await featureGateResponse("gtid_chat");
  if (gate) return gate;

  try {
    const { chatId } = await params;
    let chat = await db.gtidChat.findUnique({ where: { chatId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } } });
    if (!chat) chat = await db.gtidChat.findUnique({ where: { id: chatId }, include: { messages: { orderBy: { createdAt: "asc" }, take: 500 } } });
    if (!chat) return NextResponse.json({ error: "Chat not found" }, { status: 404 });
    if (chat.messages.length === 0) return NextResponse.json({ error: "Cannot summarize empty chat" }, { status: 409 });
    const lines = chat.messages.map(m => `[${m.senderName}] ${m.message}`);
    const transcript = lines.join("\n");
    let summary = "";
    try {
      const { runAI } = await import("@/lib/sgtx/ai/multi-provider");
      const result = await runAI({
        agent_name: "chat_summarizer",
        authority_level: "A1",
        system_prompt: "Summarize this trade chat in max 5 sentences with main points, decisions, and action items.",
        user_prompt: transcript,
        max_tokens: 250,
        temperature: 0.3,
      });
      summary = result.content;
    } catch { summary = `Chat with ${chat.messages.length} messages. Key topics: ${chat.messages.slice(0, 3).map(m => m.message.split(" ").slice(0, 5).join(" ")).join("; ")}.`; }
    await db.gtidChat.update({ where: { id: chat.id }, data: { aiSummary: summary, aiSummaryAt: new Date() } });
    return NextResponse.json({ ok: true, summary, messageCount: chat.messages.length });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
