// @ts-nocheck
// SGTX Phase 3 §5 — TBT Engine API
//   POST /api/sgtx/compliance/tbt/determine
//   Body: TbtInput — { hs6?, productName?, jurisdictionCode, transportMode? }
//   Returns: TbtDetermination — list of matching TBT requirements + top verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineTbtRequirements } from "@/lib/sgtx/tbt";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.jurisdictionCode) {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const result = await determineTbtRequirements({
      hs6: body.hs6,
      productName: body.productName,
      jurisdictionCode: body.jurisdictionCode,
      transportMode: body.transportMode,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/tbt/determine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
