// GET /api/sgtx/payment/psp-health — returns current health snapshot for all PSPs
// POST /api/sgtx/payment/psp-health — body: { provider, healthScore, latencyMs, errorRate }
//   Records a health check (called by psp-health-monitor cron).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getPspHealth, getAllPspHealth, recordPspHealthCheck, ensurePaymentAggregatorsSeeded } from "@/lib/sgtx/payment/fallback";
import { PspProvider, PSP_PROVIDERS } from "@/lib/sgtx/payment/psp-split";

export async function GET() {
  try {
    await ensurePaymentAggregatorsSeeded();
    const snapshot = await getAllPspHealth();
    return NextResponse.json({ psps: snapshot, generatedAt: new Date().toISOString() });
  } catch (e: any) {
    logger.error("[payment/psp-health GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, healthScore, latencyMs, errorRate } = body;
    if (!provider || healthScore === undefined || latencyMs === undefined) {
      return NextResponse.json({ error: "provider, healthScore, latencyMs required" }, { status: 400 });
    }
    if (!PSP_PROVIDERS.includes(provider as PspProvider)) {
      return NextResponse.json({ error: `provider must be one of ${PSP_PROVIDERS.join(", ")}` }, { status: 400 });
    }
    await ensurePaymentAggregatorsSeeded();
    const snapshot = await recordPspHealthCheck(
      provider as PspProvider,
      Number(healthScore),
      Number(latencyMs),
      Number(errorRate ?? 0)
    );
    return NextResponse.json({ ok: true, snapshot });
  } catch (e: any) {
    logger.error("[payment/psp-health POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
