// POST /api/sgtx/payment/retry — body: { apiName, endpoint, body, ustn?, simulateFailures? }
// Tests the retry helper (Part 6.13). Wraps an external API call with retry + exponential backoff.
// Set simulateFailures=N to force N failed attempts before success (for testing).
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { withRetry, getRetryPolicy, listRetryPolicies, RETRY_POLICIES } from "@/lib/sgtx/payment/retry";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { apiName, endpoint, body: payload, ustn, simulateFailures = 0 } = body;
    if (!apiName || !endpoint) {
      return NextResponse.json({ error: "apiName, endpoint required" }, { status: 400 });
    }

    if (!RETRY_POLICIES[apiName]) {
      return NextResponse.json({
        error: `apiName must be one of ${Object.keys(RETRY_POLICIES).join(", ")}`,
      }, { status: 400 });
    }

    let callCount = 0;
    const result = await withRetry(
      apiName,
      endpoint,
      payload ?? {},
      async (b: any) => {
        callCount++;
        if (callCount <= simulateFailures) {
          return { ok: false as const, error: `Simulated failure #${callCount}`, status: 503 };
        }
        return { ok: true as const, result: { processed: true, body: b, callCount } };
      },
      { ustn }
    );

    return NextResponse.json({
      ok: result.ok,
      attempts: result.attempts,
      lastError: result.lastError,
      fallbackTriggered: result.fallbackTriggered,
      idempotencyKey: result.idempotencyKey,
      logIds: result.logIds,
      result: result.result,
    });
  } catch (e: any) {
    logger.error("[payment/retry]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const apiName = req.nextUrl.searchParams.get("apiName");
    if (apiName) {
      const policy = getRetryPolicy(apiName);
      if (!policy) return NextResponse.json({ error: "Policy not found" }, { status: 404 });
      return NextResponse.json({ apiName, policy });
    }
    return NextResponse.json({ policies: listRetryPolicies() });
  } catch (e: any) {
    logger.error("[payment/retry GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
