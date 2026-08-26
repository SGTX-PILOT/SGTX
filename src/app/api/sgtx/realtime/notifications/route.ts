// @ts-nocheck
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return new Response("tenantGtid required", { status: 400 });
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: any) => controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      send({ type: "connected", tenantGtid, timestamp: new Date().toISOString() });
      const interval = setInterval(async () => {
        try {
          const recentItems = await db.inboxItem.findMany({
            where: { tenantGtid, createdAt: { gt: new Date(Date.now() - 10000) } },
            take: 5,
          });
          for (const item of recentItems) {
            send({ type: "inbox", id: item.id, title: item.title, priority: item.priority, category: item.category });
          }
        } catch { /* ignore poll errors */ }
      }, 10000);
      const heartbeat = setInterval(() => send({ type: "heartbeat", timestamp: new Date().toISOString() }), 30000);
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        clearInterval(heartbeat);
        controller.close();
      });
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
    },
  });
}
