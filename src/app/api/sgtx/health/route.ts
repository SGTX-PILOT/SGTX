import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// GET /api/sgtx/health — Platform health check (blueprint Part 13.2.1 + 27.14)
// Liveness probe: returns 200 if the process is alive and DB is reachable.
// For a deeper readiness check (probing AI, governor, external adapters), use /api/sgtx/health/ready.
//
// Blueprint v13.1 FINAL — surfaced as the `version`, `blueprint`, `transportEngines`,
// `addOns`, `portals`, and `tables` fields below. The `tables` count is computed
// dynamically from `sqlite_master` so it stays truthful as migrations land;
// a hard-coded fallback (379) protects against any raw-SQL hiccup so the
// liveness probe never 500s purely because the count query failed.
export async function GET() {
  try {
    // Test DB connectivity via simple counts
    const tenants = await db.tenant.count();
    const trades = await db.trade.count();
    const inboxItems = await db.inboxItem.count({ where: { dismissed: false } });

    let tables = 379; // safe fallback (matches the v13.1 baseline migration)
    try {
      const rows = (await db.$queryRawUnsafe(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name NOT LIKE '_prisma_%' AND name NOT LIKE 'sqlite_%'",
      )) as Array<{ n: bigint | number }>;
      const n = Number(rows?.[0]?.n);
      if (Number.isFinite(n) && n > 0) tables = n;
    } catch (tblErr: any) {
      logger.error("[api/sgtx/health] table count query failed (using fallback 379)", {
        error: tblErr?.message || String(tblErr),
      });
    }

    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "v13.1",
      blueprint: "v13.1 FINAL",
      transportEngines: ["road", "air", "roro", "rail"],
      addOns: { total: 28, implemented: 27, reserved: 1 },
      portals: 12,
      tables,
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
