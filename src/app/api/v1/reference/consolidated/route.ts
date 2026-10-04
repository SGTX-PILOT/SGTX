// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConsolidatedReferencePayload } from "@/lib/sgtx/reference/consolidated-reference";

export const dynamic = "force-dynamic";

// GET /api/v1/reference/consolidated — Public SGTX Consolidated Reference (v18 §15-§24)
//
// Consolidates the high-level canonical reference data from the final 10
// sections of the v18 blueprint:
//   • §15 Governor Gates Complete Matrix (42 gates G1U1-G1U42 across 7 groups)
//   • §16 Portal Architecture (10 portals + 4 command center components)
//   • §17 Complete Data Model (425+ tables across 24 domains)
//   • §18 API Endpoint Index (25 categories, 400+ endpoints)
//   • §19 Canonical Transaction State (5 finality rules + reconciliation)
//   • §20 Global Trade Graph (6 transport engines + jurisdiction fabric)
//   • §21 Platform Guarantees (6 security + 5 availability + 7 privacy)
//   • §22 Platform Add-Ons (50 add-ons)
//   • §23 Network Effects (4 barcode formats + 7 workflow examples)
//   • §24 Canonical Terminology & Roadmap (15 key terms + 8 phases + 4 validation gates)

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
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-client-ip") || "unknown";
}

function checkRateLimit(ip: string) {
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

    const payload = getConsolidatedReferencePayload();
    return NextResponse.json(
      {
        ...payload,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/v1/reference/consolidated] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Consolidated reference metadata unavailable" }, { status: 503 });
  }
}
