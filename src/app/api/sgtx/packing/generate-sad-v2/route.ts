// 5.5 — Nafeza SAD V2 (full spec JSON + XML with ACID, certificates, transport, invoice ref)
import { NextRequest, NextResponse } from "next/server";
import { generateNafezaSad } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, sellerGtid, brokerGtid, regime, customsOffice, hsCode, originCountry, destCountry } = body;
    if (!ustn || !sellerGtid || !hsCode || !originCountry || !destCountry) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await generateNafezaSad({ ustn, tradeId, sellerGtid, brokerGtid, regime: regime || "EXPORT", customsOffice, hsCode, originCountry, destCountry });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[packing/generate-sad-v2]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
