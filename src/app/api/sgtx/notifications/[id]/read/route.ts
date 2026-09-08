// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { markNotificationRead } from "@/lib/sgtx/notifications/center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/notifications/[id]/read — mark a notification as read/dismissed.
// Works against both InboxItem (In-App) and NotificationLog (Email/SMS/Push/WhatsApp).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "notification id required" }, { status: 400 });
  }
  try {
    const result = await markNotificationRead(id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "notification not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/notifications/read] failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "mark-read failed" }, { status: 500 });
  }
}
