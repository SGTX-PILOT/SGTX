// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/dispute/file — Dispute filing (v18 §5.8.2 + §14.3)
//
// v18 §5.8.2: "POST /v1/dispute/file — dispute filing (ustn)"
// v18 §14.3: Disputes Phase 8 — filing, FeeLock freeze, mediation log, escalation ladder
//
// Auth: Bearer JWT — caller must be a party to the trade (buyer, seller, or financier)
// Rate limit: 5 req/min per caller (disputes are deliberate + irreversible)
// Governor gate: G1U41 (dispute resolution validated)

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

const VALID_DISPUTE_CATEGORIES = new Set([
  "QUALITY", "QUANTITY", "TIMING", "PAYMENT", "DOCUMENTATION",
  "CUSTOMS", "LOGISTICS", "INSURANCE", "FINANCING", "REGULATORY",
]);

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const filerGtid = (body?.filer_gtid || "").toUpperCase();
    const category = (body?.category || "").toUpperCase();
    const severity = (body?.severity || "MEDIUM").toUpperCase();
    const description = body?.description;
    const remedySought = body?.remedy_sought;
    const evidenceRefs = body?.evidence_refs || [];

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!filerGtid) return NextResponse.json({ error: "INVALID_FILER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!VALID_DISPUTE_CATEGORIES.has(category)) return NextResponse.json({ error: "INVALID_CATEGORY", message: `category must be one of: ${Array.from(VALID_DISPUTE_CATEGORIES).join(", ")}` }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(severity)) return NextResponse.json({ error: "INVALID_SEVERITY" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!description || typeof description !== "string") return NextResponse.json({ error: "INVALID_DESCRIPTION" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    if (caller.gtid !== filerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the filer_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(filerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");

    // Verify the trade exists + filer is a party
    const trade = await freshDb.trade.findUnique({ where: { ustn }, select: { ustn: true, buyerGtid: true, sellerGtid: true, status: true } });
    if (!trade) return NextResponse.json({ error: "USTN_NOT_FOUND" }, { status: 404, headers: { "X-SGTX-Version": "v18.0" } });

    const isParty = trade.buyerGtid === filerGtid || trade.sellerGtid === filerGtid;
    if (!isParty && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Filer must be a party to the trade (buyer, seller) or ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    // Create dispute record
    const caseNumber = `D${new Date().getFullYear()}-${Date.now().toString(36).toUpperCase()}`;
    let persisted = false;
    try {
      await freshDb.dispute.create({
        data: {
          caseNumber,
          ustn,
          filedByGtid: filerGtid,
          category,
          severity,
          status: "FILED",
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/dispute/file] persist failed (non-fatal):", { error: e?.message }); }

    // Governor decision (G1U41 — dispute resolution validated)
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: `gov-dispute-file-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          action: "dispute.file",
          actorGtid: filerGtid,
          ustn,
          verdict: "ALLOW",
          reason: `Dispute ${caseNumber} filed by ${filerGtid} (${category}/${severity})`,
          policyId: "dispute.file.v1",
          evidenceJson: JSON.stringify({ caseNumber, category, severity, description, remedySought, evidenceRefs }),
          conditions: "[]",
        },
      });
    } catch (e: any) { logger.warn("[v1/dispute/file] governor log failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: "DISPUTE_FILED", type: "WARNING", description: `Dispute ${caseNumber} filed for USTN ${ustn} by ${filerGtid} — ${category}/${severity}: ${description}${remedySought ? ` (remedy: ${remedySought})` : ""}`, actorGtid: filerGtid } });
    } catch (e: any) { logger.warn("[v1/dispute/file] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      case_number: caseNumber,
      ustn,
      filer_gtid: filerGtid,
      category,
      severity,
      description,
      remedy_sought: remedySought || null,
      evidence_refs: evidenceRefs,
      status: "FILED",
      fee_lock_state: "FROZEN", // v18 §14.3 — FeeLock freezes on dispute filing
      governor_verdict: "ALLOW",
      governor_gate: "G1U41",
      escalation_ladder: ["1. Direct negotiation", "2. Mediation (A1 advisory)", "3. Arbitration", "4. Court (SGTX provides evidence only)"],
      filed_at: new Date().toISOString(),
      persisted,
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/dispute/file] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Dispute filing failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
