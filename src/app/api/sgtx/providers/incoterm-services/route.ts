// 9.7 — Incoterm-Based Service Filtering
import { NextRequest, NextResponse } from "next/server";
import { getIncotermServices, validateMandatoryServices } from "@/lib/sgtx/providers";

export async function GET(req: NextRequest) {
  const incoterm = req.nextUrl.searchParams.get("incoterm");
  if (!incoterm) return NextResponse.json({ error: "incoterm required" }, { status: 400 });
  const result = await getIncotermServices(incoterm);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const { incoterm, acceptedQuotes } = await req.json();
    if (!incoterm || !Array.isArray(acceptedQuotes)) return NextResponse.json({ error: "incoterm and acceptedQuotes array required" }, { status: 400 });
    const result = await validateMandatoryServices({ incoterm, acceptedQuotes });
    return NextResponse.json(result);
  } catch (e: any) { console.error("[providers/incoterm-services]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
