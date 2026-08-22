// @ts-nocheck
// §4 Gap Analysis — summary
// GET /api/sgtx/integrations/gaps/summary?jurisdictionCode=X
import { NextResponse } from "next/server";
import { getGapSummary } from "@/lib/sgtx/gap-analysis";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const summary = await getGapSummary(jurisdictionCode);
    return NextResponse.json({ summary });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/gaps/summary] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
