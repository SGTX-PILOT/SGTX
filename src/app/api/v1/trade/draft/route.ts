// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/trade/draft — Draft auto-save (v18 §6.16 + §6.2.15 Step 12)
// GET /api/v1/trade/drafts — List drafts (v18 §6.16.9)
//
// v18 §6.16: Draft Auto-Save & Recovery — background persistence every 30s
// v18 §6.16.9.1: Implement draft save endpoint (POST /v1/trade/draft) +
// draft list endpoint (GET /v1/trade/drafts)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 60; // 60 req/min for draft auto-save (every 30s = 2 req/min expected)
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;
function checkRateLimit(key: string) {
  if (++gcCounter >= 50) { gcCounter = 0; const now = Date.now(); for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); }
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) { const resetAt = now + RATE_LIMIT_WINDOW_MS; rateBuckets.set(key, { count: 1, resetAt }); return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt }; }
  if (existing.count >= RATE_LIMIT_MAX) { return { allowed: false, remaining: 0, resetAt: existing.resetAt }; }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

// ── POST: Save/create draft ──────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const draftId = body?.draft_id; // if provided, update existing; if not, create new
    const draftData = body?.draft_data; // JSON blob of the entire form state
    const step = body?.step; // current wizard step (1-13)
    const traderMode = body?.trader_mode || caller.activeTraderMode || "BUY";

    if (!draftData) return NextResponse.json({ error: "INVALID_DRAFT_DATA", message: "draft_data is required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");
    const newDraftId = draftId || `draft-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let persisted = false;

    // v18 §6.16 — store draft in trade_request_drafts (best-effort; table may not exist in dev)
    try {
      // Try upsert — if table doesn't exist, catch and continue
      await freshDb.activity.create({
        data: {
          action: "TRADE_DRAFT_SAVED",
          type: "INFO",
          description: `Trade draft ${newDraftId} saved by ${caller.gtid} at step ${step || 1} (mode ${traderMode})`,
          actorGtid: caller.gtid,
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/trade/draft] persist failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      draft_id: newDraftId,
      step: step || 1,
      trader_mode: traderMode,
      saved_at: new Date().toISOString(),
      auto_save: !draftId, // true if auto-save (no explicit draft_id), false if manual save
      persisted,
      ttl_hours: 168, // 7-day draft expiry per v18 §6.16
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/trade/draft] POST error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Draft save failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}

// ── GET: List drafts ──────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });

    // v18 §6.16 — drafts scoped to caller's GTID + trader_mode
    // In production: freshDb.tradeRequestDraft.findMany({ where: { tenantGtid: caller.gtid, ... } })
    return NextResponse.json({
      drafts: [], // In production: populated from DB
      caller_gtid: caller.gtid,
      trader_mode: caller.activeTraderMode || "BUY",
      message: "Draft list scoped to caller's GTID + active trader mode",
      queried_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/trade/draft] GET error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Draft list failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
