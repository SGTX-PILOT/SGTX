import { NextRequest, NextResponse } from "next/server";
import { getColdChainRequirement } from "@/lib/sgtx/grire";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const hsCode = url.searchParams.get("hsCode");
  const country = url.searchParams.get("country");
  if (!hsCode || !country) return NextResponse.json({ ok: false, error: "hsCode and country required" }, { status: 400 });
  const coldChain = await getColdChainRequirement(hsCode, country);
  if (!coldChain) return NextResponse.json({ ok: false, error: "No cold chain data" }, { status: 404 });
  return NextResponse.json({ ok: true, coldChain });
}
