import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAI } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/sar — list all SARs
export async function GET() {
  const sars = await db.suspiciousActivityReport.findMany({ orderBy: { createdAt: "desc" } });
  return NextResponse.json(sars);
}

// POST /api/sgtx/sar — generate a SAR draft (Part 1.12)
// Body: { tradeUstn, detectionRule, parties }
export async function POST(req: NextRequest) {
  const { tradeUstn, detectionRule } = await req.json();
  if (!tradeUstn) return NextResponse.json({ error: "tradeUstn required" }, { status: 400 });

  const trade = await db.trade.findUnique({
    where: { ustn: tradeUstn },
    include: { buyer: true, seller: true, shipments: true, invoices: true },
  });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  // A2 detection (simulated Isolation Forest + rule-based)
  const detectionRules: Record<string, string> = {
    volume_spike: `Trade value $${trade.tradeValueUsd} significantly exceeds the tenant's historical average.`,
    circular_trade: `Payment routing suggests circular trade pattern between ${trade.buyer?.country} and ${trade.seller?.country}.`,
    value_mismatch: `Invoice value (${fmtUsd(trade.invoices?.[0]?.amountUsd)}) does not align with declared trade value ($${trade.tradeValueUsd}).`,
    sanctions_proximity: `GNN analysis indicates sanctions proximity within 2 hops for involved parties.`,
  };

  const narrative = detectionRules[detectionRule] || detectionRules.value_mismatch;

  // A1 AI narrative generation
  const aiResult = await runAI({
    agentName: "sar_narrative_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX SAR Narrative Generator (A1). Generate a plain-language suspicious activity report narrative. Include: summary of suspicious pattern, involved parties and roles, timeframe and value ranges, why the activity is considered suspicious. Be factual and evidence-based. Do not recommend actions — the compliance officer decides. Non-marketplace.",
    userPrompt: `Detection rule: ${detectionRule}\nTrade USTN: ${trade.ustn}\nCommodity: ${trade.commodity}\nValue: $${trade.tradeValueUsd}\nBuyer: ${trade.buyer?.legalName} (${trade.buyer?.country})\nSeller: ${trade.seller?.legalName} (${trade.seller?.country})\nRoute: ${trade.originPort} → ${trade.destPort}\nTrigger: ${narrative}\n\nGenerate the SAR narrative.`,
    fallbackKey: "dispute_root_cause",
    maxTokens: 250,
    temperature: 0.3,
  });

  // Determine report type based on jurisdiction
  const reportType = trade.buyer?.country === "EG" || trade.seller?.country === "EG" ? "EG_AML" : trade.buyer?.country === "US" || trade.seller?.country === "US" ? "FinCEN" : "EU_ECB";

  const sar = await db.suspiciousActivityReport.create({
    data: {
      reportType,
      detectionRule,
      involvedUstns: JSON.stringify([trade.ustn]),
      parties: JSON.stringify({ buyer_gtid: trade.buyerGtid, seller_gtid: trade.sellerGtid, buyer_name: trade.buyer?.legalName, seller_name: trade.seller?.legalName }),
      narrative: aiResult.content,
      draftStatus: "DRAFT",
    },
  });

  return NextResponse.json({ sar, aiProvider: aiResult.provider });
}

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}
