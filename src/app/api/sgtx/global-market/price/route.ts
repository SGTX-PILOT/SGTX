import { NextRequest, NextResponse } from "next/server";
import { getGlobalPrice } from "@/lib/sgtx/compliance/global-market-intelligence";
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const commodity = searchParams.get("commodity");
  const isFrozen = searchParams.get("frozen") === "true" ? true : searchParams.get("fresh") === "true" ? false : undefined;
  if (!commodity) return NextResponse.json({ error: "Required: ?commodity=STRAWBERRIES&frozen=true" }, { status: 400 });
  const prices = await getGlobalPrice(commodity, isFrozen);
  return NextResponse.json({ ok: true, count: prices.length, prices });
}
