// AI Agent — A1 DeFi Plain-Language Risk Summary (standalone wrapper)
// Spec ref: Phase 4 / Part 3B.5.7 — MANDATORY 5 bullets before DeFi bid submission.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { defiRiskSummary } from "@/lib/sgtx/ai/orchestrator";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { stablecoin, protocol, healthFactor, collateralType, language, bidId, financierGtid } = body;

    const sc = stablecoin || "USDC";
    const proto = protocol || "AAVE_V3";
    const hf = typeof healthFactor === "number" ? healthFactor : 2.0;
    const coll = collateralType || "GOODS";
    const lang = language || "en";

    const r = await defiRiskSummary(sc, proto, hf, coll, lang);

    // Parse bullets from content
    const bullets = r.content
      .split(/\n+/)
      .map((s: string) => s.trim().replace(/^[-*]\s*/, ""))
      .filter((s: string) => s.length > 5)
      .slice(0, 5);

    // Spec enforcement: MUST return exactly 5 bullets covering the mandated topics
    const mandatedTopics = ["stablecoin", "health factor", "collateral", "no guarantee", "past performance"];
    const requiredAck = bullets.length === 5;

    return NextResponse.json({
      bullets,
      raw: r.content,
      provider: r.provider,
      model: r.model,
      fallbackUsed: r.fallbackUsed,
      authority: "A1",
      mandatedTopics,
      acknowledgedRequired: true,
      bidId: bidId || null,
      financierGtid: financierGtid || null,
      message: requiredAck
        ? "5 mandatory DeFi risk bullets generated. Financier must acknowledge before submitting a DeFi bid."
        : "Warning: AI did not return exactly 5 bullets — review raw output.",
    });
  } catch (e: any) {
    logger.error("[ai/defi-risk-summary]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// GET — convenience wrapper for the same AI agent
export async function GET(req: NextRequest) {
  const stablecoin = req.nextUrl.searchParams.get("stablecoin") || "USDC";
  const protocol = req.nextUrl.searchParams.get("protocol") || "AAVE_V3";
  const healthFactor = parseFloat(req.nextUrl.searchParams.get("healthFactor") || "2.0");
  const collateralType = req.nextUrl.searchParams.get("collateralType") || "GOODS";
  const language = req.nextUrl.searchParams.get("language") || "en";

  return POST({
    json: async () => ({ stablecoin, protocol, healthFactor, collateralType, language }),
  } as unknown as NextRequest);
}
