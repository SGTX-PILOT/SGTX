// GET /api/sgtx/logistics/quote/[quoteId]/drift
// Detect drift: compares current quote state vs the SELECTED version snapshot.

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { detectDrift } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const result = await detectDrift(quoteId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[logistics/quote/drift] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to detect drift" }, { status: 500 });
  }
}
