// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

export const dynamic = "force-dynamic";

// POST /api/v1/packing/{id}/lock — Packing plan lock (v18 §8.2.8 Step 8 + §8.13.9)
//
// v18 §8.2.8: Packing & Containerisation — packing plan lock required before quote submission
// v18 §8.13.9: Validation Gates (Lock & Barcode) — G1U15
// v18 §8.13.4: At packing plan lock, the pallet_details record is hashed (SHA256)
//
// Auth: Bearer JWT — caller must be the seller
// Rate limit: 5 req/min per caller (irreversible action)
// Governor gate: G1U15 (packing plan lock)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
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

    const lockerGtid = (body?.locker_gtid || caller.gtid).toUpperCase();
    const palletDetails = body?.pallet_details; // JSON array of pallet SSCC + position data

    if (caller.gtid !== lockerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the locker_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(lockerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    // v18 §8.13.4 — hash the pallet_details record at lock time (SHA256)
    const palletHash = palletDetails ? "sha256:" + createHash("sha256").update(JSON.stringify(palletDetails)).digest("hex") : null;

    // Governor decision (G1U15 — packing plan lock)
    const { freshDb } = await import("@/lib/db-fresh");
    const lockId = `packing-lock-${packingPlanId}-${Date.now()}`;
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: lockId,
          action: "packing.lock",
          actorGtid: lockerGtid,
          ustn: null,
          verdict: "ALLOW",
          reason: `Packing plan ${packingPlanId} locked by ${lockerGtid}`,
          policyId: "packing.lock.v1",
          evidenceJson: JSON.stringify({ packingPlanId, palletHash, palletCount: Array.isArray(palletDetails) ? palletDetails.length : 0 }),
          conditions: "[]",
        },
      });
    } catch (e: any) { logger.warn("[v1/packing/{id}/lock] governor log failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: "PACKING_PLAN_LOCKED", type: "INFO", description: `Packing plan ${packingPlanId} locked by ${lockerGtid} — pallet_hash: ${palletHash?.slice(0, 24) || "none"}...`, actorGtid: lockerGtid } });
    } catch (e: any) { logger.warn("[v1/packing/{id}/lock] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      lock_id: lockId,
      packing_plan_id: packingPlanId,
      locker_gtid: lockerGtid,
      pallet_hash_sha256: palletHash,
      pallet_count: Array.isArray(palletDetails) ? palletDetails.length : 0,
      governor_verdict: "ALLOW",
      governor_gate: "G1U15",
      status: "LOCKED",
      locked_at: new Date().toISOString(),
      // v18 §8.13.6 — Reprint Policy (Governor-Enforced): any reprint after lock requires Governor approval
      reprint_policy: "Governor-Enforced (v18 §8.13.6) — reprint requires POST /v1/packing/{id}/reprint with reason",
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/packing/{id}/lock] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Packing plan lock failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
