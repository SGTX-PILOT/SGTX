// @ts-nocheck
// SGTX Phase 2 §7 — Classification Engine API
//   POST /api/sgtx/regulatory/classification/classify
//   Body: { productName?, hs6?, composition?, material?, casNumbers?, jurisdictionCode? }
//   Returns: ClassifyResult (hs6, nationalCode, dualUse, strategic, confidence, verdict, ...).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { classifyProduct } from "@/lib/sgtx/classification";

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
    // At least one identifier must be present so the engine has something to
    // classify on. Accept hs6 OR productName (composition/material/cas are
    // secondary hints).
    if (!body.hs6 && !body.productName && !body.composition && !body.material) {
      return NextResponse.json(
        { error: "at least one of hs6, productName, composition, material required" },
        { status: 400 },
      );
    }
    const result = await classifyProduct({
      productName: body.productName,
      hs6: body.hs6,
      composition: body.composition,
      material: body.material,
      casNumbers: Array.isArray(body.casNumbers) ? body.casNumbers : undefined,
      jurisdictionCode: body.jurisdictionCode,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/classification/classify] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
