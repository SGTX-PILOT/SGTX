import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/notifications — List notification log for a tenant (blueprint 12A.11)
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const channel = req.nextUrl.searchParams.get("channel");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const notifications = await db.notificationLog.findMany({
    where: {
      tenantGtid,
      ...(channel ? { channel } : {}),
    },
    orderBy: { sentAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ notifications });
}

// POST /api/sgtx/notifications — Record a sent notification
export async function POST(req: NextRequest) {
  const { tenantGtid, channel, category, title, message, deliveryStatus } = await req.json();
  if (!tenantGtid || !channel || !title) return NextResponse.json({ error: "tenantGtid, channel, title required" }, { status: 400 });
  const notification = await db.notificationLog.create({
    data: {
      tenantGtid,
      channel, // IN_APP | EMAIL | SMS | WHATSAPP | PUSH
      category: category || "GENERAL",
      title,
      message: message || "",
      deliveryStatus: deliveryStatus || "SENT",
    },
  });
  return NextResponse.json({ ok: true, notification });
}
