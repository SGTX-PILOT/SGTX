// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getNegotiationWorkflowPayload } from "@/lib/sgtx/workflow/negotiation-workflow";

export const dynamic = "force-dynamic";

// GET /api/v1/workflow/negotiation — Public SGTX Negotiation Workflow (v18 §9)
//
// Phase 3 canonical data: 12-stage master flow (A-L), 14 negotiation
// components, 2 contract generation paths (Clause Forge + Upload), 7 final
// lock preconditions (G1U22-G1U27 + G1U11 CFR), atomic lock semantics,
// USTN generation at lock, 5 canonical events, and CFR gate.

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

    const payload = getNegotiationWorkflowPayload();
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
    logger.error("[api/v1/workflow/negotiation] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Negotiation workflow metadata unavailable" }, { status: 503 });
  }
}
