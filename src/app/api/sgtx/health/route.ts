import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/health — Platform health check (blueprint Part 13.2.1 + 27.14)
// Liveness probe: returns 200 if the process is alive and DB is reachable.
// For a deeper readiness check (probing AI, governor, external adapters), use /api/sgtx/health/ready.
export async function GET() {
  try {
    // Test DB connectivity via a simple count
    const tenants = await db.tenant.count();
    const trades = await db.trade.count();
    const inboxItems = await db.inboxItem.count({ where: { dismissed: false } });
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "v12.0",
      checks: {
        database: "ok",
        // Note: ai_orchestrator and governor are checked in /health/ready
        // to keep this liveness probe fast.
      },
      counts: { tenants, trades, pendingInbox: inboxItems },
    });
  } catch (e: any) {
    return NextResponse.json({
      status: "unhealthy",
      error: e.message,
      timestamp: new Date().toISOString(),
    }, { status: 503 });
  }
}
