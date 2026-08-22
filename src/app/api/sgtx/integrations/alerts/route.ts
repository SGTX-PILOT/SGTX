// @ts-nocheck
// §10 Alerts — list (GET) + create (POST)
// GET  /api/sgtx/integrations/alerts?alertType=X&severity=Y&status=Z&jurisdictionCode=W&connectorId=V
// POST /api/sgtx/integrations/alerts  body: CreateAlertInput  → createAlert
import { NextResponse } from "next/server";
import { listAlerts, createAlert } from "@/lib/sgtx/integration-alerts";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const alertType = url.searchParams.get("alertType") || undefined;
    const severity = url.searchParams.get("severity") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const connectorId = url.searchParams.get("connectorId") || undefined;
    if (alertType) filters.alertType = alertType;
    if (severity) filters.severity = severity;
    if (status) filters.status = status;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (connectorId) filters.connectorId = connectorId;
    const alerts = await listAlerts(filters);
    return NextResponse.json({ alerts });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.alertType) {
      return NextResponse.json({ error: "alertType required" }, { status: 400 });
    }
    if (!body.title) {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    const alert = await createAlert(body);
    return NextResponse.json({ alert });
  } catch (err: any) {
    logger.error("[api/sgtx/integrations/alerts] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
