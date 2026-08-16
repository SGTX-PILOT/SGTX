// POST /api/sgtx/logistics/quote/[quoteId]/assumption
// Add an assumption or an exclusion.
//
// Body: { key, value, isExclusion?: boolean }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import { addAssumption, addExclusion, getAssumptions } from "@/lib/sgtx/logistics";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ quoteId: string }> },
) {
  try {
    const caller = getCaller(req);
    if (!caller.isAuthenticated) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const { quoteId } = await ctx.params;
    const body = await req.json();
    if (!body.key || !body.value) {
      return NextResponse.json({ error: "key + value required" }, { status: 400 });
    }
    const r = body.isExclusion
      ? await addExclusion(quoteId, body.key, body.value)
      : await addAssumption(quoteId, body.key, body.value);
    const all = await getAssumptions(quoteId);
    return NextResponse.json({ ok: true, added: r, all });
  } catch (e: any) {
    logger.error("[logistics/quote/assumption] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to add assumption" }, { status: 500 });
  }
}
