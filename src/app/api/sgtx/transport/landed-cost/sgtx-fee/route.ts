// @ts-nocheck
// §4 Landed Cost — compute SGTX fee (pure).
// GET /api/sgtx/transport/landed-cost/sgtx-fee?freightUsd=X&customsUsd=Y
//
// Formula: Math.max(25, (freightUsd + customsUsd) * 0.005). Min $25.
import { NextResponse } from "next/server";
import { computeSgtxFee } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const freightUsdRaw = url.searchParams.get("freightUsd");
    const customsUsdRaw = url.searchParams.get("customsUsd");
    if (freightUsdRaw == null || customsUsdRaw == null) {
      return NextResponse.json(
        { error: "freightUsd and customsUsd required" },
        { status: 400 },
      );
    }
    const freightUsd = Number(freightUsdRaw);
    const customsUsd = Number(customsUsdRaw);
    if (isNaN(freightUsd) || isNaN(customsUsd)) {
      return NextResponse.json(
        { error: "freightUsd and customsUsd must be numbers" },
        { status: 400 },
      );
    }
    const sgtxFee = computeSgtxFee(freightUsd, customsUsd);
    return NextResponse.json({
      freightUsd,
      customsUsd,
      sgtxFee,
      formula: "max(25, (freightUsd + customsUsd) * 0.005)",
    });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/sgtx-fee] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
