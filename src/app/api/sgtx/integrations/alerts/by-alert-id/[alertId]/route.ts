// @ts-nocheck
// §10 Alerts — GET by alertId (ALT-YYYYMMDD-NNNNN)
// GET /api/sgtx/integrations/alerts/by-alert-id/[alertId]
import { NextResponse } from "next/server";
import { getAlertByAlertId } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ alertId: string }> },
) {
  try {
    const { alertId } = await params;
    if (!alertId) {
      return NextResponse.json({ error: "alertId required" }, { status: 400 });
    }
    const alert = await getAlertByAlertId(alertId);
    if (!alert) {
      return NextResponse.json({ error: "alert not found" }, { status: 404 });
    }
    return NextResponse.json({ alert });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/integrations/alerts/by-alert-id/[alertId]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
