// 3B.6.6 — Cold-Chain Alerts (list + record)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { recordColdChainAlert } from "@/lib/sgtx/execution";
import { coldChainAlertNarrative } from "@/lib/sgtx/ai/orchestrator";

export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const shipmentId = req.nextUrl.searchParams.get("shipmentId");
  const where: any = {};
  if (ustn) where.ustn = ustn;
  if (shipmentId) where.shipmentId = shipmentId;
  const alerts = await db.coldChainAlert.findMany({ where, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ alerts, total: alerts.length, critical: alerts.filter(a => a.severity === "CRITICAL").length });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { shipmentId, excursionTemp, durationMin, originalShelfLifeDays, commodity, containerNo } = body;
    if (!shipmentId || excursionTemp === undefined || !durationMin) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }
    // AI narrative (A2 LSTM-style)
    let aiNarrative = `Container ${containerNo} experienced ${excursionTemp}°C for ${durationMin} min. Shelf life reduced. Recommended action: accelerate customs clearance.`;
    try {
      const r = await coldChainAlertNarrative({
        containerNo: containerNo || "Container",
        commodity: commodity || "commodity",
        excursionTemp, durationMin, targetTemp: -18,
        predictedShelfLifeDays: Math.max(1, originalShelfLifeDays - Math.ceil((Math.abs(excursionTemp - (-18)) * durationMin) / 60 * 0.3)),
        originalShelfLifeDays,
      });
      aiNarrative = r.content;
    } catch { /* ignore */ }
    const result = await recordColdChainAlert({ shipmentId, excursionTemp, durationMin, originalShelfLifeDays, aiNarrative });
    if (!result.ok) return NextResponse.json({ error: "Failed" }, { status: 500 });
    return NextResponse.json(result);
  } catch (e: any) {
    console.error("[execution/cold-chain/alerts]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
