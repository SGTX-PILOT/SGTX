// Unified Multi-Source Pesticide MRL Lookup (Brain AI orchestrates EU + Codex)
// GET /api/sgtx/pesticides/lookup?pesticide=Acephate&commodity=Citrus+fruits&euProductCode=0110000
// Returns MRL from BOTH sources + the strictest applicable MRL.

import { NextRequest, NextResponse } from "next/server";
import { lookupMultiSourceMrl } from "@/lib/sgtx/compliance/multi-source-pesticides";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pesticide = searchParams.get("pesticide");
  const commodity = searchParams.get("commodity");
  const euProductCode = searchParams.get("euProductCode") || undefined;

  if (!pesticide || !commodity) {
    return NextResponse.json({
      error: "Required: ?pesticide=NAME&commodity=NAME[&euProductCode=0110000]",
    }, { status: 400 });
  }

  const result = await lookupMultiSourceMrl(pesticide, commodity, euProductCode);
  return NextResponse.json({ ok: true, ...result });
}
