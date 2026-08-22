// @ts-nocheck
// §10 Alerts — THE MAIN SCAN FUNCTION
// POST /api/sgtx/integrations/alerts/scan  → checkAndGenerateAlerts
// Returns the count of new alerts generated.
import { NextResponse } from "next/server";
import { checkAndGenerateAlerts } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await checkAndGenerateAlerts();
    return NextResponse.json({
      checked: result.checked,
      generated: result.generated,
      newAlerts: result.alerts,
      count: result.generated,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/scan] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
