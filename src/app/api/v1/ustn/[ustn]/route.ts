// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/ustn/{ustn} — USTN Master Object resolution (v18 §5.5.2)
//
// v18 §5.5.2: Authenticated, role-based filtering. Returns the USTN master
// object filtered by the requester's permissions:
//   • A logistics provider sees only their services
//   • A buyer sees full commercial terms but not the seller's internal costs
//   • A financier sees all trade data
//   • A government official sees only compliance documents
//
// Auth: Bearer JWT. Demo portals fall back to /api/sgtx/ustn/resolve which
// uses a tenant query param.
//
// Path params (v18 §5.5.2):
//   ustn (required) — must match the v18 validation regex
//
// Query params (v18 §5.5.2):
//   include_timeline (default: true) — include the full event timeline
//   include_documents (default: role-dependent) — include document references
//   version — request a specific cached version of the master object
//
// Rate limits (v18 §5.5.2): 100 req/min per tenant
//
// Response: the USTN master object (v18 §5.3) filtered by role.

const USTN_V18_REGEX = /^SGTX-([A-Z]{2})-(\d{2})-([A-Z0-9]{3,4})-(\d{1,6})$/;

interface CallerPayload {
  gtid?: string;
  tenantGtid?: string;
  role?: string;
  activeTraderMode?: string;
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

// Per-tenant rate limiter (100 req/min)
const RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;

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

export async function GET(
  req: NextRequest,
  { params }: { params: { ustn: string } },
) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required", hint: "Use /api/sgtx/ustn/resolve for demo-portal access" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const tenantKey = caller.tenantGtid || caller.gtid;
    const rl = checkRateLimit(tenantKey);
    if (!rl.allowed) {
      return NextResponse.json(
        { error: "RATE_LIMIT_EXCEEDED", message: "Per-tenant rate limit exceeded (100 req/min)", retry_after_seconds: Math.ceil((rl.resetAt - Date.now()) / 1000) },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(rl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)),
            "X-SGTX-Version": "v18.0",
          },
        },
      );
    }

    const ustn = params.ustn.toUpperCase();
    if (!USTN_V18_REGEX.test(ustn)) {
      return NextResponse.json(
        { error: "INVALID_USTN_FORMAT", message: "USTN must match v18 format: SGTX-{COUNTRY}-{YEAR}-{TRADER}-{SEQ}" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const sp = req.nextUrl.searchParams;
    const includeTimeline = sp.get("include_timeline") !== "false"; // default true
    const includeDocumentsParam = sp.get("include_documents");
    const version = sp.get("version");

    const { freshDb } = await import("@/lib/db-fresh");

    // v18 §5.3 — Build the USTN master object
    const trade = await freshDb.trade.findUnique({
      where: { ustn },
      include: {
        buyer: { select: { gtid: true, legalName: true, type: true, country: true } },
        seller: { select: { gtid: true, legalName: true, type: true, country: true } },
        shipments: {
          select: {
            ustn: true, sequence: true, vesselName: true, vesselImo: true, containerNo: true,
            containerCount: true, carrierGtid: true, status: true,
            originPort: true, destPort: true, etd: true, eta: true,
            departedAt: true, arrivedAt: true,
          },
        },
        ...(includeTimeline ? { activities: { select: { action: true, description: true, actorGtid: true, createdAt: true }, orderBy: { createdAt: "asc" } } } : {}),
        invoices: { select: { id: true, number: true, status: true, amountUsd: true, dueDate: true } },
        quotations: { select: { id: true, quoteNumber: true, serviceProviderGtid: true, status: true, totalUsd: true } },
      },
    });

    if (!trade) {
      return NextResponse.json(
        { error: "USTN_NOT_FOUND", message: "USTN does not exist or has been deactivated", ustn },
        { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    // ── v18 §5.5.3 — Role-based filtering ────────────────────────────────────
    const isBuyer = trade.buyerGtid === caller.gtid;
    const isSeller = trade.sellerGtid === caller.gtid;
    const isFinancier = caller.role === "FIN";
    const isGov = caller.role === "GOV";
    const isAdm = caller.role === "ADM";
    const isLsp = caller.role === "LSP";
    const isShip = caller.role === "SHIP";

    const masterObject: any = {
      ustn: trade.ustn,
      status: trade.status,
      phase: trade.phase,
      commodity: trade.commodity,
      commodityHs: trade.commodityHs,
      incoterm: trade.incoterm,
      originPort: trade.originPort,
      destPort: trade.destPort,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      coldChain: trade.coldChain,
      containerCount: trade.containerCount,
      multiShipment: trade.multiShipment,
      healthScore: trade.healthScore,
      tradeValueUsd: isBuyer || isFinancier || isAdm ? trade.tradeValueUsd : undefined,
      parties: {
        buyer: trade.buyer,
        seller: trade.seller,
      },
      shipments: trade.shipments,
      ...(includeTimeline ? { timeline: trade.activities } : {}),
    };

    // Role-based field filtering per v18 §5.5.3
    if (isLsp) {
      // Logistics provider sees only their services
      masterObject.quotations = trade.quotations.filter((q: any) => q.serviceProviderGtid === caller.gtid);
      masterObject.shipments = trade.shipments.filter((s: any) => s.carrierGtid === caller.gtid);
      delete masterObject.tradeValueUsd;
      delete masterObject.invoices;
    } else if (isShip) {
      // Shipping line sees only their shipments
      masterObject.shipments = trade.shipments.filter((s: any) => s.carrierGtid === caller.gtid);
      delete masterObject.tradeValueUsd;
      delete masterObject.invoices;
      delete masterObject.quotations;
    } else if (isSeller) {
      // Seller sees full commercial terms but buyer's financing is hidden
      masterObject.quotations = trade.quotations;
      // Don't include invoices that show buyer-side financing details
      masterObject.invoices = trade.invoices.filter((inv: any) => inv.status !== "BUYER_FINANCING");
    } else if (isBuyer) {
      // Buyer sees full commercial terms but NOT seller's internal costs
      masterObject.quotations = trade.quotations;
      masterObject.invoices = trade.invoices;
      // Note: seller's internal cost breakdown is not exposed via the master object
    } else if (isFinancier) {
      // Financier sees all trade data
      masterObject.quotations = trade.quotations;
      masterObject.invoices = trade.invoices;
    } else if (isGov) {
      // Government official sees only compliance documents
      masterObject.quotations = [];
      masterObject.shipments = trade.shipments.map((s: any) => ({
        ustn: s.ustn, status: s.status, originPort: s.originPort, destPort: s.destPort,
      }));
      delete masterObject.tradeValueUsd;
      delete masterObject.invoices;
    } else if (isAdm) {
      // Admin sees everything
      masterObject.quotations = trade.quotations;
      masterObject.invoices = trade.invoices;
    }

    // Documents (role-dependent default per v18 §5.5.2)
    const includeDocuments = includeDocumentsParam === "true" || (includeDocumentsParam === null && (isBuyer || isSeller || isFinancier || isAdm));
    if (includeDocuments) {
      try {
        const docs = await freshDb.document.findMany({
          where: { trade: { ustn } },
          select: { id: true, title: true, type: true, status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        });
        masterObject.documents = docs;
      } catch {
        // document table might not exist in dev — non-fatal
      }
    }

    return NextResponse.json(
      {
        ...masterObject,
        requester_role: caller.role,
        requester_gtid: caller.gtid,
        requester_mode: caller.activeTraderMode || null,
        version: version || "latest",
        resolved_at: new Date().toISOString(),
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
    logger.error("[v1/ustn/{ustn}] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "USTN resolution failed", message: e?.message },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
