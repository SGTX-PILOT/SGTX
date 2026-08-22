// @ts-nocheck
// §10 Alerts — summary
// GET /api/sgtx/integrations/alerts/summary
import { NextResponse } from "next/server";
import { getAlertSummary } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const summary = await getAlertSummary();
    return NextResponse.json({ summary });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/summary] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
