// 9.6 — List Quotes (by USTN or provider)
import { NextRequest, NextResponse } from "next/server";
import { listQuotes } from "@/lib/sgtx/providers";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const providerGtid = req.nextUrl.searchParams.get("providerGtid");
  const status = req.nextUrl.searchParams.get("status");
  const quotes = await listQuotes({ ustn: ustn || undefined, providerGtid: providerGtid || undefined, status: status || undefined });
  return NextResponse.json({ quotes, total: quotes.length });
}
