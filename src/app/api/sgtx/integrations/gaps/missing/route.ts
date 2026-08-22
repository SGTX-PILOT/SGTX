// @ts-nocheck
// §4 Gap Analysis — THE CRITICAL "what's missing" query
// GET /api/sgtx/integrations/gaps/missing?jurisdictionCode=X
import { NextResponse } from "next/server";
import { getMissingGaps } from "@/lib/sgtx/gap-analysis";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const gaps = await getMissingGaps(jurisdictionCode);
    return NextResponse.json({ gaps, count: gaps.length });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/missing] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
