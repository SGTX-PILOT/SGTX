// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConstitutionPayload } from "@/lib/sgtx/constitutional-foundation";

export const dynamic = "force-dynamic";

// GET /api/v1/constitution — Public SGTX constitutional foundation (v18 §3)
//
// Exposes the canonical Layer 0 immutable invariants:
//   • 7 Governor Principles (G1–G7)             — v18 §3.1
//   • 29-Point Transaction Constitution        — v18 §3.2
//   • 9 Extended Constitutional Principles     — v18 §3.2.1 (Points 30–38)
//   • 38 All Constitutional Points (1..29 + 30..38)
//   • AI Authority Ladder (A0–A5)              — v18 §3.3
//   • AI Authority Quick Reference              — v18 §3.3.2
//   • AI Agent Registry (5 entries)             — v18 §3.4.1
//   • Fallback Chains by Authority              — v18 §3.4.2
//   • Forbidden Actions (A5)                    — v18 §3.3.1
//   • Enforcement Stack Components (5)          — v18 §3.5
//
// This is the machine-readable mirror of v18 §3 — auditors, regulators,
// and downstream teams use it to verify which invariants the live
// platform enforces.
//
// No auth required. Rate-limited 100 req/min/IP (in-memory per source IP).

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

    const payload = getConstitutionPayload();
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
    logger.error("[api/v1/constitution] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "Constitution metadata unavailable" },
      { status: 503 },
    );
  }
}
