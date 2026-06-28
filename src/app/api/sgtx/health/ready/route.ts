import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/health/ready — Readiness probe with real dependency checks.
// Probes: database, AI orchestrator config, governor Loom chain, env secrets.
// Returns 503 if any critical dependency is down. Use for load balancer traffic gating.
export async function GET() {
  const checks: Record<string, { status: string; latency_ms?: number; detail?: string }> = {};
  let allHealthy = true;

  // 1. Database connectivity (with latency measurement)
  try {
    const t0 = Date.now();
    await db.tenant.count();
    checks.database = { status: "ok", latency_ms: Date.now() - t0 };
  } catch (e: any) {
    checks.database = { status: "down", detail: e.message };
    allHealthy = false;
  }

  // 2. Environment secrets (verify all required secrets are set)
  try {
    const isProd = process.env.NODE_ENV === "production";
    const requiredSecrets = isProd
      ? ["SGTX_SESSION_SECRET", "SGTX_REFRESH_SECRET", "CRON_SECRET", "SGTX_PLATFORM_KEY"]
      : ["SGTX_SESSION_SECRET", "SGTX_REFRESH_SECRET", "CRON_SECRET", "SGTX_PLATFORM_KEY"];
    const missing = requiredSecrets.filter(s => !process.env[s]);
    if (missing.length > 0) {
      checks.secrets = { status: "degraded", detail: `Missing: ${missing.join(", ")}` };
      if (isProd) allHealthy = false;
    } else {
      checks.secrets = { status: "ok" };
    }
  } catch (e: any) {
    checks.secrets = { status: "down", detail: e.message };
    allHealthy = false;
  }

  // 3. Governor Loom chain integrity
  try {
    const t0 = Date.now();
    const decisionCount = await db.governorDecision.count();
    checks.governor = { status: "ok", latency_ms: Date.now() - t0, decisionCount };
  } catch (e: any) {
    checks.governor = { status: "down", detail: e.message };
    allHealthy = false;
  }

  // 4. AI orchestrator (check if AI config exists — don't make external calls in health check)
  try {
    const aiConfigCount = await db.configurationHistory.count({
      where: { configKey: { startsWith: "ai." } },
    });
    checks.ai_orchestrator = {
      status: "ok",
      detail: aiConfigCount > 0 ? "configured" : "default (no custom config)",
    };
  } catch (e: any) {
    checks.ai_orchestrator = { status: "degraded", detail: e.message };
    // AI is not critical for platform operation — don't fail the readiness check
  }

  // 5. Critical tables have data (basic sanity)
  try {
    const tenantCount = await db.tenant.count();
    if (tenantCount === 0) {
      checks.seed_data = { status: "degraded", detail: "No tenants in DB — may need seeding" };
    } else {
      checks.seed_data = { status: "ok", tenantCount };
    }
  } catch (e: any) {
    checks.seed_data = { status: "down", detail: e.message };
    allHealthy = false;
  }

  return NextResponse.json({
    status: allHealthy ? "ready" : "not_ready",
    timestamp: new Date().toISOString(),
    version: "v12.0",
    checks,
  }, { status: allHealthy ? 200 : 503 });
}
