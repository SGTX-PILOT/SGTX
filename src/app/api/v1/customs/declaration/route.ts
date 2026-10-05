// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/customs/declaration — Customs declaration (v18 §5.8.2)
//
// v18 §5.8.2: "POST /v1/customs/declaration — customs declaration reference (ustn)"
//
// Auth: Bearer JWT — caller must be a CBR (Customs Broker) or ADM/GOV
// Rate limit: 10 req/min per caller

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 10;
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

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const declarationType = (body?.declaration_type || "").toUpperCase(); // EXPORT | IMPORT | TRANSIT
    const brokerGtid = (body?.broker_gtid || "").toUpperCase();
    const hsCode = body?.hs_code;
    const commodityDescription = body?.commodity_description;
    const originCountry = (body?.origin_country || "").toUpperCase();
    const destCountry = (body?.dest_country || "").toUpperCase();
    const declaredValueUsd = body?.declared_value_usd;
    const currency = body?.currency || "USD";
    const customsAuthority = body?.customs_authority; // e.g., "EG-NAFEZA", "DE-ZOLL"

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!["EXPORT", "IMPORT", "TRANSIT"].includes(declarationType)) return NextResponse.json({ error: "INVALID_DECLARATION_TYPE" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!brokerGtid) return NextResponse.json({ error: "INVALID_BROKER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!hsCode) return NextResponse.json({ error: "INVALID_HS_CODE" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof declaredValueUsd !== "number" || declaredValueUsd <= 0) return NextResponse.json({ error: "INVALID_DECLARED_VALUE" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    // Caller must be the broker or ADM/GOV
    if (caller.gtid !== brokerGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the broker_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(brokerGtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");
    const declarationId = `cust-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let persisted = false;
    try {
      await freshDb.customsDeclaration.create({
        data: {
          id: declarationId,
          ustn,
          brokerGtid: brokerGtid,
          commodity: commodityDescription || "Unknown",
          status: "SUBMITTED",
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/customs/declaration] persist failed (non-fatal):", { error: e?.message }); }

    try {
      await freshDb.activity.create({ data: { action: "CUSTOMS_DECLARATION_SUBMITTED", type: "INFO", description: `Customs ${declarationType} declaration for USTN ${ustn} by broker ${brokerGtid} (HS ${hsCode}, $${declaredValueUsd} ${currency}, ${originCountry}→${destCountry}) via ${customsAuthority}`, actorGtid: brokerGtid } });
    } catch (e: any) { logger.warn("[v1/customs/declaration] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      declaration_id: declarationId,
      ustn,
      declaration_type: declarationType,
      broker_gtid: brokerGtid,
      hs_code: hsCode,
      commodity_description: commodityDescription,
      origin_country: originCountry,
      dest_country: destCountry,
      declared_value_usd: declaredValueUsd,
      currency,
      customs_authority: customsAuthority,
      status: "SUBMITTED",
      submitted_at: new Date().toISOString(),
      persisted,
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/customs/declaration] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Customs declaration failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
