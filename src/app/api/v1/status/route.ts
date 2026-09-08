// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/status — Public platform status (v17 §18.26)
//
// Returns the SGTX platform status:
//   {
//     "status": "operational"|"degraded"|"outage",
//     "version": "v17",
//     "build": "<git-sha>",
//     "uptime": <seconds>,
//     "region": "EG-CAIRO-EAST" | "EU-FRA" | "US-EAST" | ...,
//     "sovereign_node": "EG-01" | "EU-01" | "US-01" | ...,
//     "services": {
//       "governor": "up"|"degraded"|"down",
//       "database": "up"|"degraded"|"down",
//       "ai": "up"|"degraded"|"down",
//       "customs": "up"|"degraded"|"down"
//     },
//     "timestamp": <ISO-8601>
//   }
//
// No auth required. Rate-limited 100 req/min/IP (in-memory per source IP).
// The middleware's anonymous bucket (50 req/min) is the backstop.

// ============ In-memory rate limiter (100 req/min/IP) ============

const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-client-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// ============ Process uptime tracker ============

const PROCESS_START_AT = Date.now();

function getUptimeSeconds(): number {
  return Math.floor((Date.now() - PROCESS_START_AT) / 1000);
}

// ============ Service health probes ============

async function probeGovernor(): Promise<"up" | "degraded" | "down"> {
  try {
    const { db } = await import("@/lib/db");
    const count = await db.governorDecision.count({ take: 1 });
    return count >= 0 ? "up" : "down";
  } catch {
    return "down";
  }
}

async function probeDatabase(): Promise<"up" | "degraded" | "down"> {
  try {
    const { db } = await import("@/lib/db");
    await db.tenant.count({ take: 1 });
    return "up";
  } catch {
    return "down";
  }
}

async function probeAI(): Promise<"up" | "degraded" | "down"> {
  try {
    // The AI orchestrator is the canonical AI service. We probe by importing
    // the module — if the import succeeds, the orchestrator is wired in.
    // A live probe (running an A1 prompt) would be too expensive for a
    // status check (A1 prompt + LLM call ~ 1-5 seconds).
    await import("@/lib/sgtx/ai/orchestrator");
    return "up";
  } catch {
    return "degraded";
  }
}

async function probeCustoms(): Promise<"up" | "degraded" | "down"> {
  try {
    // The customs gateway adapter is the canonical customs service.
    await import("@/lib/sgtx/customs-gateway");
    return "up";
  } catch {
    return "degraded";
  }
}

function getRegion(): string {
  return (
    process.env.SGTX_REGION ||
    process.env.SGTX_NODE_REGION ||
    process.env.VERCEL_REGION ||
    "EG-CAIRO-EAST"
  );
}

function getSovereignNode(): string {
  return (
    process.env.SGTX_SOVEREIGN_NODE ||
    process.env.SGTX_NODE_ID ||
    "EG-01"
  );
}

function getBuild(): string {
  return (
    process.env.SGTX_BUILD ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.GIT_COMMIT_SHA ||
    "dev"
  );
}

// ============ GET handler ============

export async function GET(req: NextRequest) {
  try {
    const ip = resolveClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const [governor, database, ai, customs] = await Promise.all([
      probeGovernor(),
      probeDatabase(),
      probeAI(),
      probeCustoms(),
    ]);

    const services = { governor, database, ai, customs };
    const down = Object.values(services).filter((s) => s === "down").length;
    const degraded = Object.values(services).filter((s) => s === "degraded").length;
    const overall: "operational" | "degraded" | "outage" =
      down >= 2 ? "outage" : down === 1 || degraded >= 2 ? "degraded" : "operational";

    return NextResponse.json(
      {
        status: overall,
        version: "v17",
        build: getBuild(),
        uptime: getUptimeSeconds(),
        region: getRegion(),
        sovereign_node: getSovereignNode(),
        services,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Cache-Control": "no-store, max-age=0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/v1/status] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      {
        status: "outage",
        version: "v17",
        build: getBuild(),
        uptime: getUptimeSeconds(),
        region: getRegion(),
        sovereign_node: getSovereignNode(),
        services: { governor: "down", database: "down", ai: "down", customs: "down" },
        timestamp: new Date().toISOString(),
        error: e?.message || "Status probe failed",
      },
      { status: 503 },
    );
  }
}
