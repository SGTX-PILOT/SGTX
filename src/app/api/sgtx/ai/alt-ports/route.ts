import { NextRequest, NextResponse } from "next/server";
import { alternativePortSuggester } from "@/lib/sgtx/ai/orchestrator";
export async function POST(req: NextRequest) {
  const { destCountry, commodity, currentPort } = await req.json();
  if (!destCountry) return NextResponse.json({ error: "destCountry required" }, { status: 400 });
  const result = await alternativePortSuggester(destCountry, commodity || "", currentPort || "");
  return NextResponse.json(result);
}
