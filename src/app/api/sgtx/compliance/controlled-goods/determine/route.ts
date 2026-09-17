// @ts-nocheck
// SGTX Phase 3 §6 — Controlled Goods Engine API
//   POST /api/sgtx/compliance/controlled-goods/determine
//   Body: ControlledGoodsInput — { hs6?, productName?, casNumbers?,
//                                  jurisdictionCode, originCountry, destCountry,
//                                  applicantGtid? }
//   Returns: ControlledGoodsDetermination — list of matching controls + top verdict.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineControlledGoods } from "@/lib/sgtx/controlled-goods";

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
    if (!body.jurisdictionCode || !body.originCountry || !body.destCountry) {
      return NextResponse.json(
        {
          error:
            "jurisdictionCode, originCountry and destCountry are required",
        },
        { status: 400 },
      );
    }
    const result = await determineControlledGoods({
      hs6: body.hs6,
      productName: body.productName,
      casNumbers: Array.isArray(body.casNumbers) ? body.casNumbers : undefined,
      jurisdictionCode: body.jurisdictionCode,
      originCountry: body.originCountry,
      destCountry: body.destCountry,
      applicantGtid: body.applicantGtid,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/controlled-goods/determine] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
