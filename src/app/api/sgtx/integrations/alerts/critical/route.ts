// @ts-nocheck
// §10 Alerts — CRITICAL OPEN alerts (urgent queue)
// GET /api/sgtx/integrations/alerts/critical
import { NextResponse } from "next/server";
import { getCriticalAlerts } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const alerts = await getCriticalAlerts();
    return NextResponse.json({ alerts, count: alerts.length });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/critical] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
