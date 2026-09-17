// @ts-nocheck
// SGTX Phase 3 §2 — Permit Engine API
//   GET /api/sgtx/compliance/permits/[id] — fetch a single TradePermit by id.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getTradePermit } from "@/lib/sgtx/permit";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const permit = await getTradePermit(id);
    if (!permit) {
      return NextResponse.json(
        { error: "trade permit not found", id },
        { status: 404 },
      );
    }
    return NextResponse.json({ permit });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/permits/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
