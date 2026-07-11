// EU Pesticides MRL Compliance Check API
// POST /api/sgtx/eu-pesticides/mrl-check
// Body: { pesticide: "Acephate", productCode: "0110010", detectedLevelMgKg: 0.05 }
// Returns: compliant/non-compliant verdict + MRL value + exceedance factor

import { NextRequest, NextResponse } from "next/server";
import { checkMrlCompliance } from "@/lib/sgtx/compliance/eu-pesticides-client";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { pesticide, productCode, detectedLevelMgKg } = body;

    if (!pesticide || !productCode || typeof detectedLevelMgKg !== "number") {
      return NextResponse.json({
        error: "Required: { pesticide: string, productCode: string, detectedLevelMgKg: number }",
      }, { status: 400 });
    }

    const result = await checkMrlCompliance(pesticide, productCode, detectedLevelMgKg);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
