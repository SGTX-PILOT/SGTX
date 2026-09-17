import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getMetrics } from "@/lib/sgtx/brain-os";
import { bootstrapBrainOS } from "@/lib/sgtx/brain-os/bootstrap";

// GET /api/sgtx/brain-os/metrics
// Returns Prometheus-format metrics by default (text/plain) for direct
// scraping. Pass `?format=json` to receive a JSON array suitable for
// dashboards.
export async function GET(req: Request): Promise<Response> {
  try {
    await bootstrapBrainOS();

    const url = new URL(req.url);
    const format = url.searchParams.get("format") || "prometheus";

    const metrics = await getMetrics();

    if (format === "json") {
      return NextResponse.json({
        format: "json",
        metrics: metrics.exportJson(),
        timestamp: new Date().toISOString(),
      });
    }

    // Prometheus text format — `text/plain; version=0.0.4` per the exposition
    // format spec.
    return new Response(metrics.exportPrometheus(), {
      status: 200,
      headers: {
        "Content-Type": "text/plain; version=0.0.4; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    logger.error("[brain-os/metrics GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to export metrics" },
      { status: 500 },
    );
  }
}
