// 3B.5.7 — DeFi Plain-Language Risk Summary (5 bullets, AI)
import { NextRequest, NextResponse } from "next/server";
import { defiRiskSummary } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const stablecoin = req.nextUrl.searchParams.get("stablecoin") || "USDC";
  const protocol = req.nextUrl.searchParams.get("protocol") || "AAVE_V3";
  const healthFactor = parseFloat(req.nextUrl.searchParams.get("healthFactor") || "2.0");
  const collateralType = req.nextUrl.searchParams.get("collateralType") || "GOODS";
  const language = req.nextUrl.searchParams.get("language") || "en";

  try {
    const r = await defiRiskSummary(stablecoin, protocol, healthFactor, collateralType, language);
    // Parse bullets from content
    const bullets = r.content
      .split(/\n+/)
      .map((s: string) => s.trim().replace(/^[-*]\s*/, ""))
      .filter((s: string) => s.length > 5)
      .slice(0, 5);
    return NextResponse.json({
      bullets,
      raw: r.content,
      provider: r.provider,
      model: r.model,
      fallbackUsed: r.fallbackUsed,
      acknowledgedRequired: true,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST — record acknowledgment
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { bidId, financierGtid, language, protocol, stablecoin } = body;
    // In production this would persist `defi_risk_acknowledged_at` on the Employee record.
    // For demo: we just return the acknowledgment timestamp; the bid-submission endpoint
    // will receive `defiRiskAcknowledgedAt` and store it on FinancingBid.
    return NextResponse.json({
      ok: true,
      acknowledgedAt: new Date().toISOString(),
      financierGtid,
      language,
      protocol,
      stablecoin,
      bidId: bidId || null,
      message: "DeFi risk summary acknowledged. You may now submit a DeFi bid.",
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
