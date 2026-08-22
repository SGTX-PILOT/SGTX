// @ts-nocheck
// §10 Alerts — GET by DB id
// GET /api/sgtx/integrations/alerts/[id]
import { NextResponse } from "next/server";
import { getAlert } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const alert = await getAlert(id);
    if (!alert) {
      // Fall back to lookup by alertId (ALT-YYYYMMDD-NNNNN).
      const { getAlertByAlertId } = await import(
        "@/lib/sgtx/integration-alerts"
      );
      const byAlertId = await getAlertByAlertId(id);
      if (!byAlertId) {
        return NextResponse.json({ error: "alert not found" }, { status: 404 });
      }
      return NextResponse.json({ alert: byAlertId });
    }
    return NextResponse.json({ alert });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
