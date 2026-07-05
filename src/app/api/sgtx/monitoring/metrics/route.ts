import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getPrometheusMetrics } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/metrics — Prometheus exposition format (richer)
//
// Blueprint Part 15.1 + 27.14 — Prometheus `/metrics` endpoint. Returns
// Prometheus exposition-format text (text/plain; version=0.0.4) consumable
// by any Prometheus scraper. This endpoint supplements the existing
// `/api/sgtx/metrics` endpoint with the broader metric set maintained by the
// `src/lib/sgtx/monitoring` module — including Governor decisions,
// FeeLock counters, container releases, government adapter calls, PSP intents,
// Loom chain length, HSM key counts, incidents, per-service availability,
// and build info.
//
// The existing `/api/sgtx/metrics` endpoint (Part 25 baseline) remains
// untouched and continues to return its tenant/trade/dispute counts.
//
// Response Content-Type: text/plain; version=0.0.4; charset=utf-8
export async function GET() {
  try {
    const text = getPrometheusMetrics();
    return new NextResponse(text, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "X-SGTX-Metrics-Source": "monitoring-module-v1",
      },
    });
  } catch (e: any) {
    logger.error("[monitoring/metrics GET] error:", e);
    return new NextResponse(`# Error collecting metrics: ${e?.message || "unknown"}\n`, {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
