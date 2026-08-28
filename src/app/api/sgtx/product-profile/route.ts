// @ts-nocheck
/**
 * SGTX Part 11 — Product Profile API
 * GET /api/sgtx/product-profile?hsCode=<HS>&productName=<NAME>
 *   Returns: ProductProfile
 * GET /api/sgtx/product-profile?classify=1&description=<DESC>[&hsCode=<HS>]
 *   Returns: ClassificationResult (A2-assisted)
 */

import { NextRequest, NextResponse } from "next/server";
import { getProductProfile, classifyProduct, listProductCategories } from "@/lib/sgtx/product-profile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const hsCode = searchParams.get("hsCode") || "";
    const productName = searchParams.get("productName") || "";
    const classify = searchParams.get("classify");

    if (classify === "1") {
      const description = searchParams.get("description") || "";
      if (!description && !hsCode) {
        return NextResponse.json(
          { ok: false, error: "description or hsCode required for classify=1" },
          { status: 400 },
        );
      }
      const result = await classifyProduct(hsCode, description);
      return NextResponse.json({ ok: true, classification: result });
    }

    if (!hsCode && !productName) {
      return NextResponse.json({
        ok: true,
        categories: listProductCategories(),
        usage: "Provide ?hsCode=<HS>[&productName=<NAME>] or ?classify=1&description=<DESC>",
      });
    }
    const profile = await getProductProfile(hsCode, productName);
    return NextResponse.json({ ok: true, profile });
  } catch (err: any) {
    logger.error("[api/product-profile] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
