// POST /api/sgtx/logistics/quote/[quoteId]/surcharge
// Add a surcharge (known / conditional / excluded) and recalc totals.
//
// Body: { type, amount, description?, isConditional?, condition?, isExcluded? }

import { NextRequest, NextResponse } from "next/server";
import { getCaller } from "@/lib/sgtx/auth/caller";
import { logger } from "@/lib/sgtx/logger";
import {
  addSurcharge,
  addExcludedSurcharge,
  type SurchargeType,
} from "@/lib/sgtx/logistics";

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
    if (!body.type) {
      return NextResponse.json({ error: "type required" }, { status: 400 });
    }

    if (body.isExcluded) {
      if (!body.description) {
        return NextResponse.json({ error: "description required for excluded surcharge" }, { status: 400 });
      }
      const r = await addExcludedSurcharge(quoteId, body.type as SurchargeType, body.description);
      return NextResponse.json({ ok: true, surcharge: r.surcharge, breakdown: r.breakdown });
    }

    if (typeof body.amount !== "number") {
      return NextResponse.json({ error: "amount required for non-excluded surcharge" }, { status: 400 });
    }
    const r = await addSurcharge(
      quoteId,
      body.type as SurchargeType,
      body.amount,
      !!body.isConditional,
      body.condition,
      body.description,
    );
    return NextResponse.json({ ok: true, surcharge: r.surcharge, breakdown: r.breakdown });
  } catch (e: any) {
    logger.error("[logistics/quote/surcharge] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to add surcharge" }, { status: 500 });
  }
}
