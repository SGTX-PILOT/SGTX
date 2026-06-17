import { NextRequest, NextResponse } from "next/server";
import { generateWhyItMatters } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/ai/why-matters  { label: string, context: string }
export async function POST(req: NextRequest) {
  const { label, context } = await req.json();
  if (!label) return NextResponse.json({ error: "label required" }, { status: 400 });
  const result = await generateWhyItMatters({ label, context: context || "" });
  return NextResponse.json(result);
}
