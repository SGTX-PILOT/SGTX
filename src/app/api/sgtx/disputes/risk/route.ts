import { NextRequest, NextResponse } from "next/server";
import { assessShipmentRisk, generateFinancingRecommendation } from "@/lib/sgtx/dispute";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const result = await assessShipmentRisk(ustn);
  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.action === "financing") {
      const result = await generateFinancingRecommendation(body);
      return NextResponse.json(result);
    }
    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
