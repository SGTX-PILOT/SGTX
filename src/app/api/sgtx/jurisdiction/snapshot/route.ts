// @ts-nocheck
// POST /api/sgtx/jurisdiction/snapshot
// Body: { ustn: string, jurisdictionCode: string, tradeId?: string }
// Creates (or returns, if idempotent) a regulatory snapshot at trade lock.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createRegulatorySnapshot } from "@/lib/sgtx/jurisdiction";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!body?.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }

    const snapshot = await createRegulatorySnapshot({
      ustn: String(body.ustn),
      jurisdictionCode: String(body.jurisdictionCode),
      tradeId: body.tradeId ? String(body.tradeId) : undefined,
    });

    if (!snapshot) {
      return NextResponse.json(
        {
          error:
            "snapshot creation failed — jurisdiction may not exist, or DB error (see server logs)",
          ustn: body.ustn,
          jurisdictionCode: body.jurisdictionCode,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ snapshot });
  } catch (err: any) {
    logger.error("[api/sgtx/jurisdiction/snapshot] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
