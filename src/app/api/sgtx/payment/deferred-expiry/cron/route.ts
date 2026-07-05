// POST /api/sgtx/payment/deferred-expiry/cron
// Runs the three-step deferred payment guarantee escalation (Part 6.8.2):
//   Step 1 — Reminder (T-7d, priority 70)
//   Step 2 — Alert     (T-1d, priority 90)
//   Step 3 — Expiry    (T-0,  priority 100; auto-charge if authorised else block)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { runDeferredExpiryCron } from "@/lib/sgtx/payment/deferred";

export async function POST() {
  try {
    const result = await runDeferredExpiryCron();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e: any) {
    logger.error("[payment/deferred-expiry/cron]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  // Allow GET for cron-style invocation (e.g., uptime monitors)
  try {
    const result = await runDeferredExpiryCron();
    return NextResponse.json({
      ok: true,
      ranAt: new Date().toISOString(),
      ...result,
    });
  } catch (e: any) {
    logger.error("[payment/deferred-expiry/cron GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
