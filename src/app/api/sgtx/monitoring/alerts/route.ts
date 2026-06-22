import { NextResponse } from "next/server";
import { getAlerts } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/alerts — active alerts (Alertmanager view)
//
// Blueprint Part 15.3 — Prometheus Alertmanager routing. Returns all firing
// alerts split by severity:
//   - critical: 2 alerts (FeeLock p99 breach, HSM rotation overdue)
//   - warning:  3 alerts (CBE rate-limit, Inbox depth, Governor conditional rate)
//   - info:     4 alerts (Release webhook slow, AI cost spike, PSP replay, Loom OK)
//
// Each alert carries: severity, service, title, description, firedAt,
// resolvedAt, status, labels, annotations, runbookUrl, silencesAvailable.
export async function GET() {
  try {
    const alerts = getAlerts();
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...alerts,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[monitoring/alerts GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch alerts" },
      { status: 500 },
    );
  }
}
