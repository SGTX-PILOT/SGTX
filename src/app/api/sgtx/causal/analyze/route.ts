import { NextRequest, NextResponse } from "next/server";
import { runCausalAnalysis } from "@/lib/sgtx/addons";

// POST /api/sgtx/causal/analyze
// Body: { entityType: string, entityRef: string, factors: { name: string; weight: number }[] }
// Persists a CausalAttribution record and returns root causes + AI summary (Part 11.3).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (
    !body ||
    typeof body.entityType !== "string" ||
    typeof body.entityRef !== "string" ||
    !Array.isArray(body.factors) ||
    body.factors.length === 0
  ) {
    return NextResponse.json(
      {
        error:
          "entityType (string), entityRef (string), and non-empty factors[] ({name, weight}) are required",
      },
      { status: 400 },
    );
  }

  const factors = body.factors.map((f: any) => ({
    name: String(f.name),
    weight: Number(f.weight),
  }));

  const result = await runCausalAnalysis(body.entityType, body.entityRef, factors);
  return NextResponse.json(result);
}
