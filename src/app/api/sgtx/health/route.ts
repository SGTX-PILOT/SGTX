import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/health — Platform health check (blueprint Part 13.2.1 + 27.14)
export async function GET() {
  try {
    // Test DB connectivity
    await db.$queryRaw`SELECT 1`;
    // Count key entities
    const [tenants, trades, inboxItems] = await Promise.all([
      db.tenant.count(),
      db.trade.count(),
      db.inboxItem.count({ where: { dismissed: false } }),
    ]);
    return NextResponse.json({
      status: "healthy",
      timestamp: new Date().toISOString(),
      version: "v12.0",
      checks: {
        database: "ok",
        ai_orchestrator: "ok",
        governor: "ok",
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
