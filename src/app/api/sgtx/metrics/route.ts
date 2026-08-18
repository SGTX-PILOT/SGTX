import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/metrics — Prometheus-format metrics endpoint (blueprint Part 25 + 27.14)
export async function GET(req: NextRequest) {
  const format = req.nextUrl.searchParams.get("format") || "prometheus";

  try {
    const [tenants, trades, activeTrades, disputes, inboxItems, financingRequests, incidents, slaMetrics] = await Promise.all([
      db.tenant.count(),
      db.trade.count(),
      db.trade.count({ where: { status: { in: ["PENDING_SELLER_RESPONSE", "INITIATED", "QUOTED", "NEGOTIATING", "CONTRACT_SIGNED", "IN_EXECUTION"] } } }),
      db.dispute.count(),
      db.inboxItem.count({ where: { dismissed: false } }),
      db.financingRequest.count(),
      db.incident.count({ where: { status: { in: ["OPEN", "INVESTIGATING"] } } }),
      db.slaMetric.findMany({ orderBy: { measuredAt: "desc" }, take: 7 }),
    ]);

    if (format === "json") {
      return NextResponse.json({
        tenants, trades, activeTrades, disputes, pendingInbox: inboxItems,
        financingRequests, openIncidents: incidents,
        slaMetrics,
        timestamp: new Date().toISOString(),
      });
    }

    // Prometheus text format
    const lines = [
      "# HELP sgtx_tenants_total Total number of registered tenants",
      "# TYPE sgtx_tenants_total gauge",
      `sgtx_tenants_total ${tenants}`,
      "# HELP sgtx_trades_total Total number of trades",
      "# TYPE sgtx_trades_total gauge",
      `sgtx_trades_total ${trades}`,
      "# HELP sgtx_active_trades Total trades in active phases",
      "# TYPE sgtx_active_trades gauge",
      `sgtx_active_trades ${activeTrades}`,
      "# HELP sgtx_disputes_total Total disputes",
      "# TYPE sgtx_disputes_total gauge",
      `sgtx_disputes_total ${disputes}`,
      "# HELP sgtx_pending_inbox Total undismissed inbox items",
      "# TYPE sgtx_pending_inbox gauge",
      `sgtx_pending_inbox ${inboxItems}`,
      "# HELP sgtx_financing_requests_total Total financing requests",
      "# TYPE sgtx_financing_requests_total gauge",
      `sgtx_financing_requests_total ${financingRequests}`,
      "# HELP sgtx_open_incidents Total open incidents",
      "# TYPE sgtx_open_incidents gauge",
      `sgtx_open_incidents ${incidents}`,
    ];
    // SLA metrics per component
    const components = new Set(slaMetrics.map(m => m.component));
    lines.push("# HELP sgtx_component_availability_pct Availability percentage per component",
      "# TYPE sgtx_component_availability_pct gauge");
    for (const comp of components) {
      const latest = slaMetrics.find(m => m.component === comp);
      if (latest) lines.push(`sgtx_component_availability_pct{component="${comp}"} ${latest.availabilityPct}`);
    }

    return new NextResponse(lines.join("\n") + "\n", {
      headers: { "Content-Type": "text/plain; version=0.0.4" },
    });
  } catch (e: any) {
    return new NextResponse(`# Error collecting metrics: ${e.message}\n`, {
      status: 503,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
