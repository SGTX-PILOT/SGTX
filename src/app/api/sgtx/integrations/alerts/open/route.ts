// @ts-nocheck
// §10 Alerts — all OPEN alerts (admin inbox)
// GET /api/sgtx/integrations/alerts/open
import { NextResponse } from "next/server";
import { getOpenAlerts } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const alerts = await getOpenAlerts();
    return NextResponse.json({ alerts, count: alerts.length });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/open] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
