// 3B.7.3 — Cancel auto-payment (within cancel window)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { cancelSettlement } from "@/lib/sgtx/settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { instructionId, buyerGtid } = body;
    if (!instructionId || !buyerGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await cancelSettlement({ instructionId, buyerGtid });
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Payment cancelled successfully." });
  } catch (e: any) {
    logger.error("[settlement/cancel]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
