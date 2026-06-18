// 9.6 — Decline Quote
import { NextRequest, NextResponse } from "next/server";
import { declineQuote } from "@/lib/sgtx/providers";

export async function POST(req: NextRequest) {
  try {
    const { quoteId, declinedByGtid, reason } = await req.json();
    if (!quoteId || !declinedByGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await declineQuote({ quoteId, declinedByGtid, reason });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ok: true, message: "Quote declined." });
  } catch (e: any) { console.error("[providers/decline]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
