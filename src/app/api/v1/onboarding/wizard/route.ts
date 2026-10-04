// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getOnboardingWizardPayload } from "@/lib/sgtx/identity/onboarding-wizard";

export const dynamic = "force-dynamic";

// GET /api/v1/onboarding/wizard — Public SGTX Onboarding Wizard (v18 §4.3)
//
// Exposes the canonical 6-step onboarding wizard structure:
//   • Wizard Overview (total steps, AI authority, one-click guarantee,
//     non-marketplace rule)
//   • Step 1 — Welcome & GTID Confirmation (4 fields, A1 preselect,
//     Governor entity-type validation)
//   • Step 2 — Organization Details (8 basic fields + 5 verified IDs +
//     document upload with A2 HF Donut extraction)
//   • Step 3 — KYB/KYC Verification (dynamic document list, biometric
//     liveness via ZITADEL WebAuthn, 3 verification statuses)
//   • Step 4 — Profile Configuration (TRD-specific + all-tenant + consent)
//   • Step 5 — Create First Resource (per-tenant-type resource catalogues)
//   • Step 6 — Enter Sandbox (characteristics + guided 6-step practice
//     trade + UI elements)
//   • Post-Onboarding Go Live (4 conditions)
//   • Trade Readiness Assessment (8 categories + scoring formula +
//     thresholds + Governor integration)
//
// No auth required. Rate-limited 100 req/min/IP.

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

    const payload = getOnboardingWizardPayload();
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
    logger.error("[api/v1/onboarding/wizard] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "Onboarding wizard metadata unavailable" },
      { status: 503 },
    );
  }
}
