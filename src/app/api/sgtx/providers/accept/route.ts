// 9.6 — Accept Quote
import { NextRequest, NextResponse } from "next/server";
import { acceptQuote } from "@/lib/sgtx/providers";

export async function POST(req: NextRequest) {
  try {
    const { quoteId, acceptedByGtid, notes } = await req.json();
    if (!quoteId || !acceptedByGtid) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await acceptQuote({ quoteId, acceptedByGtid, notes });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json({ ...result, message: `Quote accepted. Invoice will be generated and added to ${result.paymentStage} payment plan.` });
  } catch (e: any) { console.error("[providers/accept]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
