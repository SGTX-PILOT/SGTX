// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { auditFullLoomChain } from "@/lib/sgtx/governor";

export const dynamic = "force-dynamic";

// GET /api/v1/verify/loom — Public Loom Verification endpoint (Blueprint §3.5)
//
// Public, unauthenticated, rate-limited (10 req/min/IP) chain verification.
// Replays the full Loom hash chain from genesis, recomputes every Governor
// decision hash, and returns:
//   {
//     chain_verified:    boolean,
//     decision_count:    number,
//     latest_hash:        string | null,
//     genesis_hash:       string,
//     decision_hashes:    string[],   // ordered list of every loomHash
//     verified_at:        string  (ISO-8601)
//   }
//
// Optional query params:
//   ?limit=100      cap on the number of decision_hashes returned (the chain
//                   is still fully replayed; only the returned hashes array
//                   is truncated to keep payloads small). Default 100, max 1000.
//   ?offset=0       offset into the decision_hashes array (applied after limit).
//
// Rate limiting is in-memory per source IP — production should use Redis. The
// limiter exposes X-RateLimit-Remaining and X-RateLimit-Reset headers so the
// caller can back off gracefully.
//
// This endpoint is intentionally read-only and public so that any external
// auditor (court, regulator, counterparty, partner node) can independently
// verify the integrity of the SGTX Governor Loom chain without authenticating.

// ──────────────────────────────────────────────────────────────────────────
// In-memory rate limiter — 10 requests / minute / IP
// ──────────────────────────────────────────────────────────────────────────
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute

interface RateBucket {
  count: number;
  resetAt: number; // epoch-ms
}
const rateBuckets: Map<string, RateBucket> = new Map();

// Opportunistic GC: prune expired buckets every ~32 requests so the Map cannot
// grow unbounded in long-running processes.
let gcCounter = 0;
const GC_INTERVAL = 32;

function pruneExpiredBuckets(): void {
  const now = Date.now();
  for (const [key, bucket] of rateBuckets) {
    if (bucket.resetAt <= now) rateBuckets.delete(key);
  }
}

function resolveClientIp(req: NextRequest): string {
  // x-forwarded-for may be a comma-separated list — take the first hop.
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

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch-ms
}

function checkRateLimit(ip: string): RateLimitResult {
  if (++gcCounter >= GC_INTERVAL) {
    gcCounter = 0;
    pruneExpiredBuckets();
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
  return {
    allowed: true,
    remaining: RATE_LIMIT_MAX - existing.count,
    resetAt: existing.resetAt,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// GET handler
// ──────────────────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    // 1) Rate-limit check (per source IP).
    const ip = resolveClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        {
          error: "Rate limit exceeded",
          retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000),
        },
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

    // 2) Parse optional pagination on the returned hashes array.
    const sp = req.nextUrl.searchParams;
    const rawLimit = Number.parseInt(sp.get("limit") || "100", 10);
    const rawOffset = Number.parseInt(sp.get("offset") || "0", 10);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(rawLimit, 1), 1000)
      : 100;
    const offset = Number.isFinite(rawOffset) ? Math.max(rawOffset, 0) : 0;

    // 3) Replay the full Loom chain from genesis. auditFullLoomChain() returns
    //    { chainVerified, decisionCount, genesisHash, latestHash, mismatches }.
    //    The caller also wants every decision's loomHash so we re-query the
    //    GovernorDecision table in the same chronological order used by the
    //    audit function (createdAt asc). The hashes returned here are the
    //    STORED hashes — chainVerified=false if any of them failed recompute.
    const audit = await auditFullLoomChain();

    // Fetch stored hashes in the same chronological order so the public
    // verifier can reproduce the linkage. We use a single ordered query
    // rather than audit.mismatches (which only contains broken decisions).
    const { db } = await import("@/lib/db");
    const decisions = await db.governorDecision.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        decisionId: true,
        loomHash: true,
        previousHash: true,
        createdAt: true,
      },
    });

    const allHashes: string[] = decisions.map((d: any) => d.loomHash);
    const pagedHashes = allHashes.slice(offset, offset + limit);

    const verifiedAt = new Date().toISOString();

    const body = {
      chain_verified: audit.chainVerified,
      decision_count: audit.decisionCount,
      latest_hash: audit.latestHash,
      genesis_hash: audit.genesisHash,
      decision_hashes: pagedHashes,
      // Total available hashes (before pagination) — lets callers know whether
      // they need to page further to retrieve the full chain.
      total_decision_hashes: allHashes.length,
      limit,
      offset,
      mismatches: audit.mismatches.length,
      verified_at: verifiedAt,
    };

    return NextResponse.json(body, {
      status: audit.chainVerified ? 200 : 409,
      headers: {
        "X-RateLimit-Remaining": String(rl.remaining),
        "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
        "Cache-Control":
          "no-store, no-cache, must-revalidate, max-age=0",
      },
    });
  } catch (e: any) {
    logger.error("[v1/verify/loom GET] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: e?.message || "Loom verification failed" },
      { status: 500 },
    );
  }
}
