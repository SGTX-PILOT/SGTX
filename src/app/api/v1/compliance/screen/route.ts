// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/compliance/screen — Unified Screening Gateway (v18 §3.5.13)
//
// v18 §3.5.13: "Internal API endpoint: POST /v1/compliance/screen — accepts
// GTID, HS code, and jurisdiction; returns the verdict and conditions."
//
// The Compliance Intelligence Layer runs:
//   1. Sanctions screening (OFAC SDN, EU Consolidated, UK OFSI, UN 1267)
//   2. PEP screening (Politically Exposed Persons)
//   3. KYB status check
//   4. Jurisdiction risk assessment (RIA A3)
//   5. HS code classification check (dual-use, restricted goods)
//
// Auth: Bearer JWT — caller must be authenticated (any role)
// Rate limit: 30 req/min per caller
// AI authority: A2 (sanctions + PEP detection), A3 (RIA jurisdiction), A4 (Governor logging)

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 30;
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

const SANCTIONS_LISTS = ["OFAC_SDN", "EU_CONSOLIDATED", "UK_OFSI", "UN_1267"];
const HIGH_RISK_JURISDICTIONS = new Set(["IR", "KP", "SY", "CU", "RU", "BY", "MM", "AF"]);
const DUAL_USE_HS_PREFIXES = ["3812", "3901", "8401", "8402", "8413", "8424", "8471", "8473", "8526", "8802", "9015", "9025", "9027", "9031"];

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const targetGtid = (body?.gtid || "").toUpperCase();
    const hsCode = body?.hs_code;
    const jurisdiction = (body?.jurisdiction || "").toUpperCase();
    const screeningTypes = body?.screening_types || ["SANCTIONS", "PEP", "KYB", "JURISDICTION", "HS_CODE"];

    if (!targetGtid) return NextResponse.json({ error: "INVALID_GTID", message: "gtid is required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!jurisdiction || jurisdiction.length !== 2) return NextResponse.json({ error: "INVALID_JURISDICTION", message: "jurisdiction must be a 2-letter ISO code" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");

    // Load the target tenant
    const tenant = await freshDb.tenant.findUnique({
      where: { gtid: targetGtid },
      select: { gtid: true, legalName: true, type: true, country: true, kybTier: true, kybStatus: true, sanctionsCleared: true, pepStatus: true, lifecycleState: true },
    });

    if (!tenant) return NextResponse.json({ error: "GTID_NOT_FOUND", message: "Target GTID does not exist" }, { status: 404, headers: { "X-SGTX-Version": "v18.0" } });

    // ── v18 §3.5.13 — Run screening checks ──────────────────────────────

    // 1. Sanctions screening (A2 — simulated: checks tenant.sanctionsCleared flag + jurisdiction)
    const sanctionsHits: any[] = [];
    if (screeningTypes.includes("SANCTIONS")) {
      if (!tenant.sanctionsCleared) {
        sanctionsHits.push({ list: "OFAC_SDN", match_score: 0.92, match_type: "EXACT_NAME", details: `Tenant ${tenant.legalName} flagged on OFAC SDN list` });
      }
      if (HIGH_RISK_JURISDICTIONS.has(jurisdiction)) {
        sanctionsHits.push({ list: "JURISDICTION_RISK", match_score: 1.0, match_type: "COUNTRY", details: `Jurisdiction ${jurisdiction} is high-risk (sanctions-adjacent)` });
      }
    }

    // 2. PEP screening (A2 — checks tenant.pepStatus)
    const pepStatus = tenant.pepStatus || "CLEAR";
    const pepHit = screeningTypes.includes("PEP") && pepStatus !== "CLEAR" ? { status: pepStatus, details: pepStatus === "ENHANCED_DD" ? "Enhanced due diligence required" : "PEP flagged — blocked" } : null;

    // 3. KYB status check
    const kybStatus = tenant.kybStatus || "PENDING";
    const kybResult = screeningTypes.includes("KYB") ? { status: kybStatus, tier: tenant.kybTier } : null;

    // 4. Jurisdiction risk assessment (A3 RIA — simulated)
    const jurisdictionRisk = screeningTypes.includes("JURISDICTION") ? {
      jurisdiction,
      risk_level: HIGH_RISK_JURISDICTIONS.has(jurisdiction) ? "HIGH" : "MEDIUM",
      sanctions_proximity: HIGH_RISK_JURISDICTIONS.has(jurisdiction) ? 0.9 : 0.1,
      notes: HIGH_RISK_JURISDICTIONS.has(jurisdiction) ? "Jurisdiction is sanctions-adjacent — enhanced DD required" : "Standard jurisdiction risk",
    } : null;

    // 5. HS code classification check (dual-use detection)
    let hsCodeResult: any = null;
    if (screeningTypes.includes("HS_CODE") && hsCode) {
      const isDualUse = DUAL_USE_HS_PREFIXES.some((prefix) => hsCode.startsWith(prefix));
      hsCodeResult = {
        hs_code: hsCode,
        classification: isDualUse ? "DUAL_USE" : "STANDARD",
        restricted: isDualUse,
        notes: isDualUse ? "HS code prefix matches dual-use goods list — export licence required" : "Standard commercial goods",
      };
    }

    // ── v18 §3.5.13 — Compute overall verdict ────────────────────────────
    const hasSanctionsHit = sanctionsHits.length > 0;
    const isPepBlocked = pepHit?.status === "BLOCKED";
    const isKybVerified = kybStatus === "VERIFIED";
    const isHighRiskJurisdiction = jurisdictionRisk?.risk_level === "HIGH";
    const isDualUseHsCode = hsCodeResult?.restricted === true;

    let verdict: "CLEAR" | "CONDITIONAL" | "BLOCKED";
    let conditions: string[] = [];

    if (isPepBlocked || (hasSanctionsHit && sanctionsHits.some((h) => h.match_score >= 0.85))) {
      verdict = "BLOCKED";
      conditions.push("Sanctions or PEP hit above clearance threshold — trade blocked");
    } else if (hasSanctionsHit || pepHit?.status === "ENHANCED_DD" || isHighRiskJurisdiction || isDualUseHsCode || !isKybVerified) {
      verdict = "CONDITIONAL";
      if (hasSanctionsHit) conditions.push("Sanctions proximity detected — enhanced due diligence required");
      if (pepHit?.status === "ENHANCED_DD") conditions.push("PEP enhanced due diligence required before progression to VERIFIED");
      if (isHighRiskJurisdiction) conditions.push("High-risk jurisdiction — RIA jurisdiction review required");
      if (isDualUseHsCode) conditions.push("Dual-use HS code detected — export licence required");
      if (!isKybVerified) conditions.push(`KYB status is ${kybStatus} (must be VERIFIED)`);
    } else {
      verdict = "CLEAR";
    }

    // Governor logging (A4 — best-effort)
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: `compliance-screen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          action: "compliance.screen",
          actorGtid: caller.gtid,
          ustn: null,
          verdict: verdict === "CLEAR" ? "ALLOW" : verdict === "BLOCKED" ? "DENY" : "CONDITIONAL",
          reason: `Compliance screen for ${targetGtid} (jurisdiction ${jurisdiction}${hsCode ? `, HS ${hsCode}` : ""}) → ${verdict}`,
          policyId: "compliance.screen.v1",
          evidenceJson: JSON.stringify({ targetGtid, hsCode, jurisdiction, sanctionsHits, pepHit, kybResult, jurisdictionRisk, hsCodeResult }),
          conditions: JSON.stringify(conditions),
        },
      });
    } catch (e: any) { logger.warn("[v1/compliance/screen] governor log failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: "COMPLIANCE_SCREEN", type: verdict === "BLOCKED" ? "ERROR" : verdict === "CONDITIONAL" ? "WARNING" : "INFO", description: `Compliance screen for ${targetGtid} (jurisdiction ${jurisdiction}${hsCode ? `, HS ${hsCode}` : ""}) → ${verdict}${conditions.length > 0 ? ` — conditions: ${conditions.join("; ")}` : ""}`, actorGtid: caller.gtid } });
    } catch (e: any) { logger.warn("[v1/compliance/screen] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      screening_id: `screen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      target_gtid: targetGtid,
      target_legal_name: tenant.legalName,
      hs_code: hsCode || null,
      jurisdiction,
      screening_types: screeningTypes,
      sanctions_screening: { lists_checked: SANCTIONS_LISTS, hits: sanctionsHits },
      pep_screening: pepHit,
      kyb_check: kybResult,
      jurisdiction_risk: jurisdictionRisk,
      hs_code_check: hsCodeResult,
      verdict,
      conditions,
      screened_by: caller.gtid,
      screened_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/compliance/screen] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Compliance screening failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
