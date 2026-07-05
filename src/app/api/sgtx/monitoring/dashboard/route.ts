import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getMonitoringDashboard } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/dashboard — complete monitoring dashboard
//
// Blueprint Part 15.5 — Grafana-equivalent combined dashboard. Returns SLA
// status, active alerts, status page, and a metrics summary in a single call
// (avoids 3 round-trips for dashboard rendering).
//
// Response shape:
//   {
//     sla: SLAStatusResult,            // 12 services with availability/latency
//     alerts: AlertsResult,            // critical/warning/info arrays
//     status: StatusPage,              // overall + services + incidents
//     metrics: {
//       totalServices, operationalServices, degradedServices, outageServices,
//       criticalAlerts, warningAlerts,
//       p95LatencyAvgMs, overallAvailability, creditsOwedPct
//     },
//     generatedAt: ISO timestamp
//   }
export async function GET() {
  try {
    const dashboard = await getMonitoringDashboard();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...dashboard,
    });
  } catch (e: any) {
    logger.error("[monitoring/dashboard GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch monitoring dashboard" },
      { status: 500 },
    );
  }
}
