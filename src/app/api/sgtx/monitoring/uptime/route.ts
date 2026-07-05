import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getUptimeHistory } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/uptime — uptime history (synthetic probes)
//
// Blueprint Part 15.2 — Blackbox Exporter-style synthetic probes per service.
// Returns 5-min-interval data points for the requested window.
//
// Query params (all optional):
//   ?service=<service name>  — filter to one service (omit = all services)
//   ?hours=24                — window in hours (default 24, max 168 = 7 days)
//
// Returns:
//   - Single service: { service, windowHours, dataPoints[], availabilityPct,
//                       avgLatencyMs, p95LatencyMs, p99LatencyMs,
//                       totalRequests, failedRequests, regions }
//   - All services:   { services: UptimeHistory[] }
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const service = sp.get("service") ?? undefined;
    const hoursParam = sp.get("hours");
    let hours = hoursParam ? Number(hoursParam) : 24;
    if (!Number.isFinite(hours) || hours <= 0) hours = 24;
    hours = Math.min(168, Math.max(1, hours)); // cap at 7 days

    const result = getUptimeHistory(service, hours);

    // If a specific service was requested, validate that it exists
    if (service && "services" in result === false) {
      // Single-service result returned normally
    }
    if (service && "service" in result === false && "services" in result === false) {
      // Should not happen — defensive
    }

    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...result,
      checkedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    logger.error("[monitoring/uptime GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch uptime history" },
      { status: 500 },
    );
  }
}
