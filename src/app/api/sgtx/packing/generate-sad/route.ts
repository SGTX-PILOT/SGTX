// Nafeza SAD Generation + Submission
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateCustomsSad, submitSadToNafeza } from "@/lib/sgtx/packing";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, sadId, ustn, tradeId, sellerGtid, brokerGtid, regime, customsOffice, hsCode, originCountry, destCountry } = body;

    if (action === "submit-nafeza") {
      if (!sadId) return NextResponse.json({ error: "sadId required" }, { status: 400 });
      const result = await submitSadToNafeza(sadId);
      if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
      return NextResponse.json(result);
    }

    // Default: generate SAD
    if (!ustn || !sellerGtid || !hsCode || !originCountry || !destCountry) return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    const result = await generateCustomsSad({ ustn, tradeId, sellerGtid, brokerGtid, regime: regime || "EXPORT", customsOffice, hsCode, originCountry, destCountry });
    if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[packing/generate-sad]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const sellerGtid = req.nextUrl.searchParams.get("sellerGtid");
  const where: any = {};
  if (ustn) where.ustn = ustn;
  if (sellerGtid) where.sellerGtid = sellerGtid;
  const sads = await db.customsDeclaration.findMany({ where, orderBy: { generatedAt: "desc" } });
  return NextResponse.json({ sads, total: sads.length });
}
