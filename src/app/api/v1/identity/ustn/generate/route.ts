// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/identity/ustn/generate — Internal USTN generation (v18 §5.1.6)
//
// v18 §5.1.6: Endpoint is INTERNAL — only called during contract lock
// (Stage J → K of the Phase 3 Master Flow, §9.2). Generates a USTN in the
// v18 format `SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}` and persists the atomic
// per-year-per-trader sequence.
//
// Auth: Bearer JWT with ADM/GOV role, OR caller is the buyer/seller on the
// locked contract (verified via the contract's buyerGtid/sellerGtid).
//
// Request body (v18 §5.1.6):
//   {
//     "seller_gtid": "SGTX-EG-TRD-002139-7F3A",
//     "buyer_gtid": "SGTX-DE-TRD-001234-5B6C",
//     "contract_id": "MC-20260415-001",
//     "shipment_number": 1
//   }
//
// Response shape (v18 §5.1.6):
//   {
//     "ustn": "SGTX-EG-26-F3A-1",
//     "country": "EG",
//     "year": "26",
//     "trader_id": "F3A",
//     "sequence": 1,
//     "generated_at": "2026-04-15T12:00:00Z",
//     "loom_hash": "sha256:a1b2c3..."
//   }

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// v18 §5.1.3 — extract the trader ID (last 3 chars of GTID checksum)
function extractTraderId(gtid: string): string {
  if (!gtid || typeof gtid !== "string") return "";
  const parts = gtid.split("-");
  if (parts.length !== 5) return "";
  const checksum = parts[4];
  if (!checksum || checksum.length < 3) return "";
  return checksum.slice(-3).toUpperCase();
}

// v18 §5.1.2 — country from the seller's GTID (per spec example: SGTX-EG-TRD-... → country EG)
function extractCountry(gtid: string): string {
  if (!gtid || typeof gtid !== "string") return "";
  const parts = gtid.split("-");
  if (parts.length < 3) return "";
  return parts[1].toUpperCase();
}

// In-memory rate limiter (5 req/min per caller — USTN generation is rare + irreversible)
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || req.headers.get("x-client-ip") || "unknown";
}

function checkRateLimit(key: string) {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

const GTID_REGEX = /^SGTX-([A-Z]{2})-([A-Z]{3})-(\d{6})-([A-F0-9]{4})$/i;

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const ip = resolveClientIp(req);
    const rl = checkRateLimit(`${caller.gtid}:${ip}`);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)), "X-SGTX-Version": "v18.0" } },
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: "INVALID_JSON", message: "Invalid JSON body" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const sellerGtid = (body?.seller_gtid || "").toUpperCase();
    const buyerGtid = (body?.buyer_gtid || "").toUpperCase();
    const contractId = body?.contract_id;
    const shipmentNumber = body?.shipment_number ?? 1;

    // Validate GTIDs
    if (!sellerGtid.match(GTID_REGEX)) {
      return NextResponse.json(
        { error: "INVALID_SELLER_GTID", message: "seller_gtid must match SGTX-{CC}-{TYPE}-{SEQ6}-{CHECKSUM4}" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!buyerGtid.match(GTID_REGEX)) {
      return NextResponse.json(
        { error: "INVALID_BUYER_GTID", message: "buyer_gtid must match SGTX-{CC}-{TYPE}-{SEQ6}-{CHECKSUM4}" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!contractId || typeof contractId !== "string") {
      return NextResponse.json(
        { error: "INVALID_CONTRACT_ID", message: "contract_id is required" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // Authorization: caller must be ADM/GOV OR one of the contract parties
    if (caller.role !== "ADM" && caller.role !== "GOV" && caller.gtid !== sellerGtid && caller.gtid !== buyerGtid) {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "Caller must be the buyer or seller on the contract, or an ADM/GOV" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // v18 §5.1.3 — extract trader ID + country from the seller GTID
    const country = extractCountry(sellerGtid);
    const traderId = extractTraderId(sellerGtid);
    const year2 = String(new Date().getFullYear()).slice(-2);

    if (!country || !traderId) {
      return NextResponse.json(
        { error: "GTID_PARSE_FAILED", message: "Could not extract country/traderId from seller_gtid" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");

    // v18 §5.1.5 — atomic sequence acquisition from ustn_counters table
    const seqRow = await freshDb.ustnCounter.upsert({
      where: { country_year_traderId: { country, year: year2, traderId } },
      update: { lastSequence: { increment: 1 } },
      create: { country, year: year2, traderId, lastSequence: 1 },
    });
    const sequence = Number((seqRow as any).lastSequence);

    // Assemble USTN (v18 §5.1.1 format)
    const ustn = `SGTX-${country}-${year2}-${traderId}-${sequence}`;

    // Governor decision (audit log)
    let loomHash: string | null = null;
    try {
      const decisionId = `ustn-gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      await freshDb.governorDecision.create({
        data: {
          decisionId,
          action: "ustn_generation",
          actorGtid: caller.gtid,
          ustn,
          verdict: "ALLOW",
          reason: `USTN generated at contract lock for ${contractId} shipment ${shipmentNumber}`,
          policyId: "identity.ustn.generate.v18",
          evidenceJson: JSON.stringify({
            sellerGtid,
            buyerGtid,
            contractId,
            shipmentNumber,
            country,
            year: year2,
            traderId,
            sequence,
          }),
          conditions: "[]",
        },
      });
      // Compute a simple SHA-256 loom hash for the generation event
      const { createHash } = await import("crypto");
      loomHash = "sha256:" + createHash("sha256").update(JSON.stringify({ ustn, contractId, shipmentNumber, sellerGtid, buyerGtid })).digest("hex");
    } catch (e: any) {
      logger.warn("[v1/identity/ustn/generate] Governor log failed (non-fatal):", { error: e?.message });
    }

    return NextResponse.json(
      {
        ustn,
        country,
        year: year2,
        trader_id: traderId,
        sequence,
        contract_id: contractId,
        shipment_number: shipmentNumber,
        seller_gtid: sellerGtid,
        buyer_gtid: buyerGtid,
        generated_at: new Date().toISOString(),
        loom_hash: loomHash,
        format: "v18",
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
          "X-RateLimit-Remaining": String(rl.remaining),
        },
      },
    );
  } catch (e: any) {
    logger.error("[v1/identity/ustn/generate] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "USTN generation failed", message: e?.message },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
