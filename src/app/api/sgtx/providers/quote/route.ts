// 9.6 — Send Quote (unified for all provider types)
import { NextRequest, NextResponse } from "next/server";
import { sendQuote } from "@/lib/sgtx/providers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, providerGtid, providerType, serviceType, feeUsd, currency, validityDays, notes, description, vessel, voyage, etd, eta, sampleInstructions, inspectionDate, inspectionLocation } = body;
    if (!providerGtid || !providerType || !serviceType || feeUsd === undefined) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await sendQuote({ ustn, tradeId, providerGtid, providerType, serviceType, feeUsd: +feeUsd, currency, validityDays, notes, description, vessel, voyage, etd: etd ? new Date(etd) : undefined, eta: eta ? new Date(eta) : undefined, sampleInstructions, inspectionDate, inspectionLocation });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[providers/quote]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
