// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/quote/submit — Quote submission (v18 §5.8.2)
//
// v18 §5.8.2: "POST /v1/quote/submit — quote submission (ustn in request body)"
//
// Auth: Bearer JWT — caller must be a TRD seller or LSP/SHIP/LAB/QC/CBR provider
// Rate limit: 20 req/min per caller
//
// Request body:
//   {
//     "ustn": "SGTX-EG-26-F3A-1",
//     "quote_number": "Q-20260415-001",
//     "service_provider_gtid": "SGTX-EG-TRD-002139-7F3A",
//     "line_items": [{ "description": "...", "quantity": 100, "unit": "MT", "unit_price_usd": 500, "total_usd": 50000 }],
//     "total_usd": 50000,
//     "currency": "USD",
//     "validity_days": 7,
//     "sla": "48 hours",
//     "eta": "2026-07-05T14:00:00Z",
//     "conditions": ["FOB Alexandria", "Insurance included"]
//   }
//
// Response: { quote_id, ustn, status: "SUBMITTED", submitted_at }

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

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "INVALID_JSON" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } }); }

    const ustn = (body?.ustn || "").toUpperCase();
    const quoteNumber = body?.quote_number;
    const serviceProviderGtid = (body?.service_provider_gtid || "").toUpperCase();
    const lineItems = body?.line_items;
    const totalUsd = body?.total_usd;
    const currency = body?.currency || "USD";
    const validityDays = Math.min(Math.max(1, body?.validity_days ?? 7), 30);
    const sla = body?.sla;
    const eta = body?.eta;
    const conditions = body?.conditions || [];

    if (!ustn) return NextResponse.json({ error: "INVALID_USTN", message: "ustn is required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!quoteNumber) return NextResponse.json({ error: "INVALID_QUOTE_NUMBER", message: "quote_number is required" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!serviceProviderGtid) return NextResponse.json({ error: "INVALID_SERVICE_PROVIDER_GTID" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (!Array.isArray(lineItems) || lineItems.length === 0) return NextResponse.json({ error: "INVALID_LINE_ITEMS", message: "line_items must be a non-empty array" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    if (typeof totalUsd !== "number" || totalUsd <= 0) return NextResponse.json({ error: "INVALID_TOTAL_USD" }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });

    // Caller must be the service provider
    if (caller.gtid !== serviceProviderGtid && caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json({ error: "ACCESS_DENIED", message: "Caller must be the service_provider_gtid or an ADM/GOV" }, { status: 403, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) }, { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } });

    const { freshDb } = await import("@/lib/db-fresh");
    const quoteId = `quote-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let persisted = false;
    try {
      await freshDb.serviceQuotation.create({
        data: {
          id: quoteId,
          quoteNumber,
          ustn,
          serviceProviderGtid,
          commodity: lineItems[0]?.description || "Unknown",
          status: "SUBMITTED",
          totalUsd,
          originPort: conditions.find((c: string) => c.includes("FOB"))?.split(" ")[1] || null,
          destPort: null,
        },
      });
      persisted = true;
    } catch (e: any) { logger.warn("[v1/quote/submit] persist failed (non-fatal):", { error: e?.message }); }

    // Activity log
    try {
      await freshDb.activity.create({ data: { action: "QUOTE_SUBMITTED", type: "INFO", description: `Quote ${quoteNumber} submitted for USTN ${ustn} by ${serviceProviderGtid} (total $${totalUsd} ${currency})`, actorGtid: serviceProviderGtid } });
    } catch (e: any) { logger.warn("[v1/quote/submit] activity log failed (non-fatal):", { error: e?.message }); }

    return NextResponse.json({
      quote_id: quoteId,
      quote_number: quoteNumber,
      ustn,
      service_provider_gtid: serviceProviderGtid,
      total_usd: totalUsd,
      currency,
      status: "SUBMITTED",
      validity_days: validityDays,
      sla,
      eta,
      conditions,
      submitted_at: new Date().toISOString(),
      persisted,
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/quote/submit] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Quote submission failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
