// Unified Multi-Source Pesticide MRL Compliance Check (Brain AI)
// POST /api/sgtx/pesticides/mrl-check
// Body: { pesticide: "Acephate", commodity: "Citrus fruits", detectedLevelMgKg: 0.05, euProductCode: "0110000" }
// Returns compliance verdict from BOTH EU + Codex + the strictest applicable verdict.

import { NextRequest, NextResponse } from "next/server";
import { checkMultiSourceCompliance } from "@/lib/sgtx/compliance/multi-source-pesticides";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pesticide, commodity, detectedLevelMgKg, euProductCode } = body;

    if (!pesticide || !commodity || typeof detectedLevelMgKg !== "number") {
      return NextResponse.json({
        error: "Required: { pesticide: string, commodity: string, detectedLevelMgKg: number, euProductCode?: string }",
      }, { status: 400 });
    }

    const result = await checkMultiSourceCompliance(pesticide, commodity, detectedLevelMgKg, euProductCode);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
