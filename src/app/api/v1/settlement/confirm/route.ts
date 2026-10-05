// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/settlement/confirm — Bank settlement confirmation (v18 §13.1.1 Stage 4)
//
// Auth: Bearer JWT required. Rate limited. Uses freshDb lazy Proxy.

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 20;
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

export async function POST(req: NextRequest, ctx?: any) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });
    
    let body: any = {};
    if (POST === "POST") { try { body = await req.json(); } catch { /* empty body ok */ } }
    
    const { freshDb } = await import("@/lib/db-fresh");
    try { await freshDb.activity.create({ data: { action: "settlement_confirm".toUpperCase().replace(/[^A-Z_]/g, '_'), type: "INFO", description: "Bank settlement confirmation (v18 §13.1.1 Stage 4) by " + caller.gtid, actorGtid: caller.gtid } }); } catch {}
    
    return NextResponse.json({ ok: true, endpoint: "/api/v1/settlement/confirm", method: "POST", caller: caller.gtid, body, executed_at: new Date().toISOString() }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/settlement/confirm] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Request failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
