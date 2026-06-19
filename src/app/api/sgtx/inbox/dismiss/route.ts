import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/inbox/dismiss — Dismiss a Smart Inbox item (blueprint 12A.1.1.5)
// Body: { inboxId: string }
export async function POST(req: NextRequest) {
  try {
    const { inboxId } = await req.json();
    if (!inboxId) {
      return NextResponse.json({ error: "inboxId required" }, { status: 400 });
    }
    const item = await db.inboxItem.update({
      where: { id: inboxId },
      data: { dismissed: true },
    });
    return NextResponse.json({ ok: true, item });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to dismiss inbox item" }, { status: 500 });
  }
}
