// SGTX UN/LOCODE Full-World Sync — single-country tick + batch trigger
// ============================================================================
// Routes:
//   GET  /api/sgtx/shipping/unlocode-full-sync
//        → returns round-robin progress (no auth — public observability).
//
//   POST /api/sgtx/shipping/unlocode-full-sync          (no body)
//        → requires CRON_SECRET — syncs the NEXT country in the round-robin.
//          Suitable for a daily cron tick (one country per call).
//
//   POST /api/sgtx/shipping/unlocode-full-sync          (body: { batch: [...] })
//        → requires CRON_SECRET — syncs a specific batch of countries.
//          Useful when an external scheduler wants to fan out specific codes.
//
// For a 5-country batched tick, use the sibling route:
//   POST /api/sgtx/shipping/unlocode-full-sync/batch

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getFullSyncProgress,
  syncNextCountry,
  syncBatch,
} from "@/lib/sgtx/shipping/unlocode-full-sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Hobby plan hard limit; single-country sync ~5-10s

const CRON_SECRET = process.env.CRON_SECRET;

function authorize(req: NextRequest): boolean {
  if (!CRON_SECRET) return false;
  const auth = req.headers.get("authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "");
  return token === CRON_SECRET;
}

// ─────────────────────────────────────────────────────────────────────────────
// GET — public progress (no auth)
// ─────────────────────────────────────────────────────────────────────────────
export async function GET() {
  try {
    const progress = await getFullSyncProgress();
    return NextResponse.json({ ok: true, progress });
  } catch (e: any) {
    logger.error("unlocode-full-sync GET failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// POST — CRON_SECRET-protected single-country tick OR explicit batch
// ─────────────────────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!authorize(req)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  try {
    // Parse body defensively — empty body is allowed (single-country mode).
    let body: any = null;
    try {
      body = await req.json();
    } catch {
      body = null;
    }

    // Mode A: explicit batch in body → sync those specific countries.
    if (body && Array.isArray(body.batch) && body.batch.length > 0) {
      const codes = body.batch
        .map((c: unknown) => (typeof c === "string" ? c.toUpperCase().trim() : ""))
        .filter((c: string) => c.length === 2);
      const result = await syncBatch(codes);
      return NextResponse.json({ ok: result.ok, mode: "batch", result });
    }

    // Mode B (default): sync the next country in the round-robin queue.
    const { countryCode, result, queueSizeBefore } = await syncNextCountry();
    return NextResponse.json({
      ok: result.ok,
      mode: "next-country",
      countryCode,
      queueSizeBefore,
      result,
    });
  } catch (e: any) {
    // Defensive: never throw to the cron caller.
    logger.error("unlocode-full-sync POST failed", {
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
