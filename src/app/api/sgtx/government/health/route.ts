// 7.8 — Government Integration Health Dashboard
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { TRIGGER_MAP } from "@/lib/sgtx/government";

export async function GET() {
  const [logs, integrationHealth] = await Promise.all([
    db.integrationConnectorLog.findMany({ orderBy: { createdAt: "desc" }, take: 100 }),
    db.integrationHealth.findMany(),
  ]);

  const stats: Record<string, { total: number; success: number; failed: number; retrying: number; successRate: number }> = {};
  for (const log of logs) {
    if (!stats[log.apiName]) stats[log.apiName] = { total: 0, success: 0, failed: 0, retrying: 0, successRate: 0 };
    stats[log.apiName].total++;
    if (log.status === "SUCCESS") stats[log.apiName].success++;
    else if (log.status === "FAILED") stats[log.apiName].failed++;
    else if (log.status === "RETRYING") stats[log.apiName].retrying++;
  }
  for (const api of Object.keys(stats)) {
    stats[api].successRate = stats[api].total > 0 ? Math.round((stats[api].success / stats[api].total) * 100) : 0;
  }

  return NextResponse.json({
    apiStats: stats,
    integrationHealth,
    triggerMap: TRIGGER_MAP,
    recentLogs: logs.slice(0, 20),
    totalCalls: logs.length,
  });
}
