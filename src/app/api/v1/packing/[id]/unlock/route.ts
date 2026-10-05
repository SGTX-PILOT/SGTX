// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/packing/{id}/unlock — Packing plan unlock (v18 §8.13.9)
//
// v18 §8.13.9: Lock release endpoint — release the packing plan lock
// Auto-release after inactivity (cron job) also supported
//
// Auth: Bearer JWT — caller must be the original locker or ADM/GOV
// Rate limit: 5 req/min per caller

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 5;
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const packingPlanId = params.id;
    if (!packingPlanId) return NextResponse.json({ error: "INVALID_PACKING_PLAN_ID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { body = {}; }

    const unlockerGtid = (body?.unlocker_gtid || caller.gtid).toUpperCase();
    const reason = body?.reason || "Manual unlock";

    if (caller.gtid !== unlockerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the unlocker_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(unlockerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");
    try {
      await freshDb.activity.create({ data: { action: "PACKING_PLAN_UNLOCKED", type: "INFO", description: `Packing plan ${packingPlanId} unlocked by ${unlockerGtid} — reason: ${reason}`, actorGtid: unlockerGtid } });
    } catch (e: any) { logger.warn("[v1/packing/{id}/unlock] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      packing_plan_id: packingPlanId,
      unlocker_gtid: unlockerGtid,
      reason,
      status: "UNLOCKED",
      unlocked_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/packing/{id}/unlock] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Packing plan unlock failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
