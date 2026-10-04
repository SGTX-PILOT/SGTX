// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/search — Authenticated universal search (v18 §2.5.4)
//
// Authenticated search across the user's authorised universe. The spec
// requires coverage of SIX entity types:
//   1. shipments      (Shipment.ustn, containerNo, vesselName, blNumber)
//   2. quotes         (Quote.quoteNumber, commodity, originPort, destPort)
//   3. contracts      (TradeContract.contractId, ustn, contractType)
//   4. financing agreements (FinancingAgreement.agreementNumber, ustn)
//   5. disputes       (Dispute.caseNumber, ustn, category)
//   6. contacts       (SavedContact.contactGtid, contactName)
//
// Auth: Bearer JWT (verified by middleware). The middleware populates
// x-sgtx-payload with { gtid, role, tenantGtid, activeTraderMode }.
//
// Query params:
//   q        — required, minimum 2 characters, max 256
//   tenant   — optional tenant scope filter (defaults to caller's tenant)
//   limit    — optional, default 10, max 50 (per entity type)
//   types    — optional comma-separated subset of:
//              "shipments,quotes,contracts,financing,disputes,contacts"
//              (defaults to all six)
//
// Response shape (v18 §2.5.4):
//   {
//     "query": "<q>",
//     "results": {
//       "shipments":   [ { ustn, containerNo, vesselName, status, ... } ],
//       "quotes":      [ { quoteNumber, ustn, commodity, status, ... } ],
//       "contracts":   [ { contractId, ustn, contractType, status, ... } ],
//       "financing":   [ { agreementNumber, ustn, status, ... } ],
//       "disputes":    [ { caseNumber, ustn, category, status, ... } ],
//       "contacts":    [ { contactGtid, contactName, type, ... } ]
//     },
//     "total": <sum>,
//     "timestamp": "<ISO-8601>"
//   }
//
// Rate-limited 50 req/min/IP (in-memory per source IP).

const RATE_LIMIT_MAX = 50;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

function resolveClientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("x-real-ip") ||
    req.headers.get("cf-connecting-ip") ||
    req.headers.get("x-client-ip") ||
    "unknown"
  );
}

function checkRateLimit(ip: string) {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k);
  }
  const now = Date.now();
  const existing = rateBuckets.get(ip);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    rateBuckets.set(ip, { count: 1, resetAt });
    return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt };
  }
  if (existing.count >= RATE_LIMIT_MAX) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

const ALL_TYPES = ["shipments", "quotes", "contracts", "financing", "disputes", "contacts"] as const;
type SearchType = (typeof ALL_TYPES)[number];

function parseTypes(raw: string | null): Set<SearchType> {
  if (!raw) return new Set(ALL_TYPES);
  const requested = raw.split(",").map((s) => s.trim()).filter(Boolean) as SearchType[];
  const valid = new Set<SearchType>();
  for (const t of requested) {
    if ((ALL_TYPES as readonly string[]).includes(t)) valid.add(t);
  }
  return valid.size === 0 ? new Set(ALL_TYPES) : valid;
}

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
  activeTraderMode?: string;
}

function getCaller(req: NextRequest): CallerPayload | null {
  // Middleware populates x-sgtx-payload header on authenticated requests
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  try {
    const ip = resolveClientIp(req);
    const rl = checkRateLimit(ip);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "Rate limit exceeded", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
          },
        },
      );
    }

    const caller = getCaller(req);
    // v18 §2.5.4 — Authenticated search. Return 401 for anonymous callers.
    // (Demo portals that lack a session fall back to /api/sgtx/search which
    // is the demo-friendly mirror that scopes by query-param tenantGtid.)
    if (!caller || !caller.tenantGtid) {
      return NextResponse.json(
        { error: "Authentication required", hint: "Use /api/sgtx/search for demo-portal anonymous access" },
        { status: 401 },
      );
    }

    const sp = req.nextUrl.searchParams;
    const q = (sp.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json({ error: "Query must be at least 2 characters" }, { status: 400 });
    }
    if (q.length > 256) {
      return NextResponse.json({ error: "Query must be at most 256 characters" }, { status: 400 });
    }

    const requestedLimit = parseInt(sp.get("limit") || "10", 10);
    const limit = Number.isFinite(requestedLimit) ? Math.min(Math.max(1, requestedLimit), 50) : 10;
    const tenantScope = sp.get("tenant") || caller.tenantGtid;
    const types = parseTypes(sp.get("types"));

    const { db } = await import("@/lib/db");
    const contains = { contains: q } as const;
    // Tenant-scoped universe: trades where caller is buyer OR seller, then
    // all downstream records (shipments, quotes, contracts, financing,
    // disputes) that join to those trades. Contacts are scoped directly.
    const scopedTradeFilter = {
      OR: [{ buyerGtid: tenantScope }, { sellerGtid: tenantScope }],
    };

    const tasks: Promise<{ type: SearchType; rows: any[] }>[] = [];

    if (types.has("shipments")) {
      tasks.push(
        db.shipment
          .findMany({
            where: {
              AND: [
                { trade: scopedTradeFilter },
                {
                  OR: [
                    { ustn: contains },
                    { containerNo: contains },
                    { vesselName: contains },
                    { blNumber: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              ustn: true,
              containerNo: true,
              vesselName: true,
              status: true,
              originPort: true,
              destPort: true,
              eta: true,
            },
          })
          .then((rows) => ({ type: "shipments" as SearchType, rows })),
      );
    }
    if (types.has("quotes")) {
      tasks.push(
        db.quote
          .findMany({
            where: {
              AND: [
                { trade: scopedTradeFilter },
                {
                  OR: [
                    { quoteNumber: contains },
                    { commodity: contains },
                    { originPort: contains },
                    { destPort: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              quoteNumber: true,
              ustn: true,
              commodity: true,
              status: true,
              totalUsd: true,
              serviceProviderGtid: true,
            },
          })
          .then((rows) => ({ type: "quotes" as SearchType, rows })),
      );
    }
    if (types.has("contracts")) {
      tasks.push(
        db.tradeContract
          .findMany({
            where: {
              AND: [
                { trade: scopedTradeFilter },
                {
                  OR: [
                    { contractId: contains },
                    { ustn: contains },
                    { contractType: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              contractId: true,
              ustn: true,
              contractType: true,
              governingLaw: true,
              status: true,
              signedAt: true,
            },
          })
          .then((rows) => ({ type: "contracts" as SearchType, rows })),
      );
    }
    if (types.has("financing")) {
      tasks.push(
        db.financingAgreement
          .findMany({
            where: {
              AND: [
                { trade: scopedTradeFilter },
                {
                  OR: [
                    { agreementNumber: contains },
                    { ustn: contains },
                    { financierGtid: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              agreementNumber: true,
              ustn: true,
              financierGtid: true,
              status: true,
              principalUsd: true,
            },
          })
          .then((rows) => ({ type: "financing" as SearchType, rows })),
      );
    }
    if (types.has("disputes")) {
      tasks.push(
        db.dispute
          .findMany({
            where: {
              AND: [
                { trade: scopedTradeFilter },
                {
                  OR: [
                    { caseNumber: contains },
                    { ustn: contains },
                    { category: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              caseNumber: true,
              ustn: true,
              category: true,
              status: true,
              severity: true,
              filedByGtid: true,
            },
          })
          .then((rows) => ({ type: "disputes" as SearchType, rows })),
      );
    }
    if (types.has("contacts")) {
      tasks.push(
        db.savedContact
          .findMany({
            where: {
              AND: [
                { tenantGtid: tenantScope },
                {
                  OR: [
                    { contactGtid: contains },
                    { contactName: contains },
                    { contactType: contains },
                  ],
                },
              ],
            },
            take: limit,
            orderBy: { createdAt: "desc" },
            select: {
              contactGtid: true,
              contactName: true,
              contactType: true,
              trustScore: true,
            },
          })
          .then((rows) => ({ type: "contacts" as SearchType, rows })),
      );
    }

    const settled = await Promise.all(tasks);
    const results: Record<string, any[]> = {
      shipments: [],
      quotes: [],
      contracts: [],
      financing: [],
      disputes: [],
      contacts: [],
    };
    let total = 0;
    for (const { type, rows } of settled) {
      results[type] = rows;
      total += rows.length;
    }

    return NextResponse.json(
      {
        query: q,
        results,
        total,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "X-RateLimit-Remaining": String(rl.remaining),
          "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/v1/search] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "Search failed", timestamp: new Date().toISOString() },
      { status: 500 },
    );
  }
}
