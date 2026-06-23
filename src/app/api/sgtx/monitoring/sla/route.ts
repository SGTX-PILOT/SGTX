import { NextRequest, NextResponse } from "next/server";
import { getSLAStatus } from "@/lib/sgtx/monitoring";

// GET /api/sgtx/monitoring/sla — SLA status for all services
//
// Blueprint Part 15.1 — returns per-service SLA status:
//   - 12 services (Governor, End-to-End Workflow, FeeLock KV, GTID Resolution,
//     Audit Log, Smart Inbox, Container Release API, Payment Orchestrator,
//     Government Adapter Layer, AI Orchestrator, PDPL Compliance, Identity Service)
//   - Per service: availability target vs current, p95 latency, RTO, RPO,
//     monthly credit %, status (MEETING/BREACHED/AT_RISK), trend
//   - Overall availability + credits owed
//
// Query params:
//   ?window=24h|7d|30d  — measurement window (default 24h)
export async function GET(req: NextRequest) {
  try {
    const windowParam = (req.nextUrl.searchParams.get("window") as "24h" | "7d" | "30d") || "24h";
    const validWindows = ["24h", "7d", "30d"];
    if (!validWindows.includes(windowParam)) {
      return NextResponse.json(
        { error: `Invalid window: ${windowParam}. Valid: ${validWindows.join(", ")}` },
        { status: 400 },
      );
    }

    const sla = await getSLAStatus(windowParam);
    return NextResponse.json({
      ok: true,
      mode: "SIMULATION",
      ...sla,
    });
  } catch (e: any) {
    console.error("[monitoring/sla GET] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to fetch SLA status" },
      { status: 500 },
    );
  }
}
