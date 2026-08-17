// SGTX UN/LOCODE Full-World Sync — 5-country batched tick (daily cron)
// ============================================================================
// POST /api/sgtx/shipping/unlocode-full-sync/batch
//
// Requires CRON_SECRET (Vercel cron sends `Bearer <CRON_SECRET>` automatically).
//
// Designed to be called by the master daily cron OR an external scheduler.
// Syncs 5 countries per call (~30s total — fits within Hobby's 60s limit):
//   • If body `{ "batch": ["US","CN","DE","JP","IN"] }` is provided, syncs
//     those specific country codes.
//   • If no body (or empty batch), syncs the NEXT 5 countries from the
//     round-robin queue (oldest syncedAt first, never-synced first).
//
// Throughput: 5 countries/day × 249 countries ÷ 5 ≈ 50 days for a full
// worldwide UN/LOCODE refresh. Acceptable for port data.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { syncBatch, getFullSyncProgress } from "@/lib/sgtx/shipping/unlocode-full-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard limit

const CRON_SECRET = process.env.CRON_SECRET;

function authorize(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === CRON_SECRET;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — CRON_SECRET-protected 5-country batch tick
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const t0 = Date.now();
  try {
    // Parse body defensively — empty body falls back to round-robin queue.
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    let codes: string[] | undefined;
    if (body && Array.isArray(body.batch) && body.batch.length > 0) {
      codes = body.batch
        .map((c: unknown) => (typeof c === "string" ? c.toUpperCase().trim() : ""))
        .filter((c: string) => c.length === 2);
    }
    // If codes is undefined, syncBatch() pulls the next 5 from the queue.

    const result = await syncBatch(codes);
    const progress = await getFullSyncProgress();

    return NextResponse.json({
      ok: result.ok,
      mode: codes ? "explicit-batch" : "round-robin",
      batchSynced: result.results.map((r) => r.countryCode),
      result,
      progress,
      totalDurationMs: Date.now() - t0,
    });
  } catch (e: any) {
    // Defensive: never throw to the cron caller.
    logger.error("unlocode-full-sync batch POST failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — describe the endpoint (public, useful for ops dashboards)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const progress = await getFullSyncProgress();
    return NextResponse.json({
      ok: true,
      route: "/api/sgtx/shipping/unlocode-full-sync/batch",
      schedule: "called by master daily cron OR external scheduler",
      defaultBatchSize: 5,
      throughput:
        "5 countries/day × 249 countries ÷ 5 ≈ 50 days for full worldwide refresh",
      mode: "round-robin (oldest syncedAt first, never-synced first)",
      auth: "POST requires Authorization: Bearer <CRON_SECRET>",
      progress,
    });
  } catch (e: any) {
    logger.error("unlocode-full-sync batch GET failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
