// @ts-nocheck
/**
 * SGTX v17 §20 — Classification Engine API
 * GET /api/sgtx/engines/classification
 *   No params → list all HS chapters
 *   ?action=classify&product=X&origin=EG → classify a product
 *   ?action=getInfo&hsCode=081110 → HS code info
 *   ?action=validate&hsCode=081110 → validate HS code format
 *
 * POST /api/sgtx/engines/classification
 *   Body: { action, product?, origin?, hsCode? }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  classifyProduct, getHsCodeInfo, validateHsCode, listHsChapters,
} from "@/lib/sgtx/engines/classification-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();
    const product = searchParams.get("product") || "";
    const origin = searchParams.get("origin") || "";
    const hsCode = searchParams.get("hsCode") || "";

    if (!action) {
      return NextResponse.json({
        ok: true,
        chapters: listHsChapters(),
        note: "Use ?action=classify&product=X&origin=EG, ?action=getInfo&hsCode=081110, or ?action=validate&hsCode=081110",
      });
    }

    if (action === "classify") {
      return NextResponse.json({ ok: true, result: classifyProduct(product, origin) });
    }
    if (action === "getInfo") {
      return NextResponse.json({ ok: true, result: getHsCodeInfo(hsCode) });
    }
    if (action === "validate") {
      return NextResponse.json({ ok: true, result: validateHsCode(hsCode) });
    }

    return NextResponse.json(
      { ok: false, error: `Unknown action "${action}". Supported: classify, getInfo, validate` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/engines/classification] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "classify") {
      return NextResponse.json({ ok: true, result: classifyProduct(body.product || "", body.origin || "") });
    }
    if (action === "getInfo") {
      return NextResponse.json({ ok: true, result: getHsCodeInfo(body.hsCode || "") });
    }
    if (action === "validate") {
      return NextResponse.json({ ok: true, result: validateHsCode(body.hsCode || "") });
    }
    return NextResponse.json(
      { ok: false, error: `Unknown action "${action}". Supported: classify, getInfo, validate` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/sgtx/engines/classification] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
