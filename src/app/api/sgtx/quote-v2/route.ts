// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createQuote, listQuotes } from "@/lib/sgtx/quote";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
  const buyerGtid = req.nextUrl.searchParams.get("buyerGtid");
  const status = req.nextUrl.searchParams.get("status");
  const quotes = await listQuotes({ ustn: ustn || undefined, sellerGtid: sellerGtid || undefined, buyerGtid: buyerGtid || undefined, status: status || undefined });
  return NextResponse.json({ ok: true, quotes, count: quotes.length, filter: { ustn, sellerGtid, buyerGtid, status } });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const q = await createQuote(body);
    if (!q) return NextResponse.json({ ok: false, error: "Failed to create quote" }, { status: 500 });
    return NextResponse.json({ ok: true, quote: q });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
