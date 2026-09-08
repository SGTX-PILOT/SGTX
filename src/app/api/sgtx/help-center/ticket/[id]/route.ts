// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getSupportTicket } from "@/lib/sgtx/help-center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/help-center/ticket/[id] — fetch a single support ticket.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!id) return NextResponse.json({ error: "ticket id required" }, { status: 400 });
  try {
    const ticket = await getSupportTicket(id);
    if (!ticket) return NextResponse.json({ error: "ticket not found" }, { status: 404 });
    return NextResponse.json({ ticket });
  } catch (e: any) {
    logger.error("[api/help-center/ticket/[id]] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}
