import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { generateHealthSummary } from "@/lib/sgtx/ai/orchestrator";
import { healthComponents } from "@/lib/sgtx/format";

// POST /api/sgtx/ai/health-summary  { ustn: string }
export async function POST(req: NextRequest) {
  const { ustn } = await req.json();
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  const trade = await db.trade.findUnique({
    where: { ustn },
    include: { documents: true, shipments: true, invoices: true, disputes: true, timeline: true, buyer: true, seller: true },
  });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  const components = healthComponents(trade);
  const result = await generateHealthSummary(trade, components);
  return NextResponse.json({ ...result, components });
}
