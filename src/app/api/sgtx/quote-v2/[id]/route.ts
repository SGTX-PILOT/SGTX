// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { getQuote, sendQuote, acceptQuote, rejectQuote } from "@/lib/sgtx/quote";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: Promise<{ params: { id: string } }>) {
  const { id } = await params;
  const q = await getQuote(id);
  if (!q) return NextResponse.json({ ok: false, error: "Quote not found" }, { status: 404 });
  return NextResponse.json({ ok: true, quote: q });
}

export async function PATCH(req: NextRequest, { params }: Promise<{ params: { id: string } }>) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action;
    let q;
    if (action === "send") q = await sendQuote(id);
    else if (action === "accept") q = await acceptQuote(id);
    else if (action === "reject") q = await rejectQuote(id, body.reason);
    else return NextResponse.json({ ok: false, error: "Unknown action" }, { status: 400 });
    if (!q) return NextResponse.json({ ok: false, error: "Quote not found or invalid status transition" }, { status: 400 });
    return NextResponse.json({ ok: true, quote: q });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
