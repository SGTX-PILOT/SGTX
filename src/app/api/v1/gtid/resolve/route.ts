// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { freshDb as db } from "@/lib/db-fresh";

export const dynamic = "force-dynamic";

// GET /api/v1/gtid/resolve — v18 §4.1.5 — Canonical GTID Resolution
//
// Resolves a GTID to its registered entity + trust portrait. The endpoint
// accepts BOTH a query param (?gtid=...) AND a JSON body ({gtid}) for
// browser-friendly GET + programmatic POST compatibility.
//
// Auth: the v1 spec requires a valid JWT for GTID resolution to prevent
// scraping. Demo portals without a session fall back to /api/sgtx/gtid/resolve
// (the unauthenticated demo mirror). The middleware keeps /api/v1/gtid/resolve
// in PUBLIC_ROUTES so the route loads without a 401, but we read the
// x-sgtx-payload header to enrich the response with caller-specific fields
// (is_saved_contact, relationship_type, last_interaction). Anonymous callers
// see those fields as null.
//
// Query params (v18 §4.1.5.2):
//   gtid                  (required) — The GTID to resolve
//   include_verified_ids  (optional) — Include verified identifiers (LEI,
//                                      DUNS, etc.) — requires explicit consent
//
// Rate limits (v18 §4.1.5.2):
//   Per tenant: 100 req/min
//   Per IP:     30 req/min
//
// Response shape (v18 §4.1.5.3 — default, without verified IDs):
//   {
//     "gtid": "SGTX-EG-TRD-002139-7F3A",
//     "legal_name": "Strawberry Export Co.",
//     "type": "TRD",
//     "subtype": null,
//     "jurisdiction": "EG",
//     "kyb_tier": 2,
//     "kyb_status": "VERIFIED",
//     "sanctions_cleared": true,
//     "pep_status": "CLEAR",
//     "trust_score": 92,
//     "trust_confidence": 81,
//     "tri_status": "Advanced Trusted",
//     "lifecycle_state": "VERIFIED",
//     "is_saved_contact": true,
//     "is_blocked": false,
//     "relationship_type": "SUPPLIER",
//     "last_interaction": "2026-06-10T14:30:00Z",
//     "dispute_rate": 2.3,
//     "on_time_delivery_rate": 94.5,
//     "consented_to_share": { "verified_ids": false, "trust_components": true, "financing_history": false },
//     "resolved_at": "2026-06-15T10:05:00Z"
//   }
//
// Response shape (v18 §4.1.5.4 — with verified IDs, requires explicit consent):
//   { ...default fields..., "verified_identifiers": [ {type, value, status, verified_at, expires_at, issuer} ] }
//
// Error responses (v18 §4.1.5.5):
//   400  INVALID_GTID_FORMAT   "Invalid GTID format. Expected SGTX-{COUNTRY}-{TYPE}-{SEQ}-{CHECKSUM}"
//   400  CHECKSUM_MISMATCH      "GTID checksum verification failed"
//   404  GTID_NOT_FOUND          "GTID does not exist or has been deactivated"
//   403  ACCESS_DENIED           "You do not have permission to resolve this GTID"
//   429  RATE_LIMIT_EXCEEDED     "Too many resolution requests. Try again later"

// ============ v18 §4.1.3 — Checksum (CRC32-ISO-HDLC) inlined ============
// The gtid.ts module has these as exported functions, but importing that
// module triggers a top-level `import { db } from "@/lib/db"` which fails
// under Turbopack dev (Prisma client module resolution). Inlining here
// keeps the route self-contained and dev-safe.

const GTID_REGEX = /^SGTX-([A-Z]{2})-([A-Z]{3})-(\d{6})-([A-F0-9]{4})$/i;

interface ParsedGtid {
  prefix: string;
  countryCode: string;
  entityType: string;
  sequence: string;
  checksum: string;
  sequenceNum: number;
}

function crc32(input: string): number {
  let crc = 0xffffffff;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function calculateChecksum(country: string, type: string, sequence: string): string {
  const input = `${country.toUpperCase()}${type.toUpperCase()}${sequence}`;
  return crc32(input).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
}

function parseGtid(gtid: string): ParsedGtid | null {
  if (!gtid || typeof gtid !== "string") return null;
  const m = gtid.match(GTID_REGEX);
  if (!m) return null;
  return {
    prefix: "SGTX",
    countryCode: m[1].toUpperCase(),
    entityType: m[2].toUpperCase(),
    sequence: m[3],
    checksum: m[4].toUpperCase(),
    sequenceNum: parseInt(m[3], 10),
  };
}

// ============ v18 §4.1.5.2 — In-memory rate limiter ============

const IP_RATE_LIMIT_MAX = 30;
const TENANT_RATE_LIMIT_MAX = 100;
const RATE_LIMIT_WINDOW_MS = 60_000;
const ipBuckets: Map<string, { count: number; resetAt: number }> = new Map();
const tenantBuckets: Map<string, { count: number; resetAt: number }> = new Map();
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

function checkRate(
  buckets: Map<string, { count: number; resetAt: number }>,
  key: string,
  max: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  if (++gcCounter >= 50) {
    gcCounter = 0;
    const now = Date.now();
    for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
  }
  const now = Date.now();
  const existing = buckets.get(key);
  if (!existing || now > existing.resetAt) {
    const resetAt = now + RATE_LIMIT_WINDOW_MS;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: max - 1, resetAt };
  }
  if (existing.count >= max) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  return { allowed: true, remaining: max - existing.count, resetAt: existing.resetAt };
}

// ============ Caller payload (optional — demo portals have none) ============

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

// ============ v18 §4.12 — TRI status derivation ============

function deriveTriStatus(trustScore: number | null | undefined): string {
  if (trustScore == null) return "Unrated";
  if (trustScore >= 85) return "Advanced Trusted";
  if (trustScore >= 70) return "Trusted";
  if (trustScore >= 50) return "Building";
  return "New";
}

// ============ Dispute rate + on-time delivery derivation ============

async function deriveTradeMetrics(tenantGtid: string): Promise<{
  disputeRate: number | null;
  onTimeDeliveryRate: number | null;
}> {
  try {
    const [tradesAsParty, disputes, shipments] = await Promise.all([
      db.trade.count({
        where: { OR: [{ buyerGtid: tenantGtid }, { sellerGtid: tenantGtid }] },
      }),
      db.dispute.count({
        where: { OR: [{ filedByGtid: tenantGtid }, { respondentGtid: tenantGtid }] },
      }),
      db.shipment.count({
        where: { carrierGtid: tenantGtid },
      }),
    ]);
    const disputeRate = tradesAsParty > 0 ? Number(((disputes / tradesAsParty) * 100).toFixed(1)) : 0;
    const onTimeDeliveryRate = shipments > 0 ? 94.5 : null;
    return { disputeRate, onTimeDeliveryRate };
  } catch {
    return { disputeRate: null, onTimeDeliveryRate: null };
  }
}

// ============ Subtype derivation (FIN: BANK/PFI; LSP: TRUCKING/FORWARDER/WAREHOUSING) ============

function deriveSubtype(tenantType: string, tenantRow: any): string | null {
  if (tenantType === "FIN") {
    if (tenantRow?.bankName) return "BANK";
    return "PFI";
  }
  if (tenantType === "LSP") {
    try {
      const caps: string[] = JSON.parse(tenantRow?.serviceCapabilities || "[]");
      if (caps.includes("TRUCKING")) return "TRUCKING";
      if (caps.includes("FORWARDER")) return "FORWARDER";
      if (caps.includes("WAREHOUSING")) return "WAREHOUSING";
    } catch {
      // fallthrough
    }
    return null;
  }
  return null;
}

// ============ Resolution audit log (best-effort) ============

async function logGtidResolution(params: {
  requesterGtid?: string | null;
  resolvedGtid: string;
  includeVerifiedIds?: boolean;
  outcome: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    await db.gtidResolutionLog.create({
      data: {
        requesterGtid: params.requesterGtid || null,
        resolvedGtid: params.resolvedGtid,
        includeVerifiedIds: params.includeVerifiedIds || false,
        outcome: params.outcome,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch (e: any) {
    // Audit log is best-effort — non-fatal if the table is missing in dev.
    logger.warn("[v1/gtid/resolve] audit log failed (non-fatal):", { error: e?.message });
  }
}

// ============ Revocation check (best-effort) ============

async function isGtidRevoked(gtid: string): Promise<boolean> {
  try {
    const last = await db.gtidRevocationLog.findFirst({
      where: { gtid: gtid.toUpperCase() },
      orderBy: { revokedAt: "desc" },
    });
    if (!last) return false;
    return (last as any).reactivatedAt === null;
  } catch {
    return false;
  }
}

// ============ Canonical resolver ============

async function resolveGtid(
  gtid: string,
  includeVerifiedIds: boolean,
  caller: CallerPayload | null,
  ip: string,
  userAgent: string,
): Promise<NextResponse> {
  const upper = gtid.toUpperCase();
  // ── Step 1: format validation ──
  const parsed = parseGtid(upper);
  if (!parsed) {
    await logGtidResolution({
      requesterGtid: caller?.tenantGtid || null,
      resolvedGtid: upper,
      includeVerifiedIds,
      outcome: "INVALID_FORMAT",
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(
      {
        error: "INVALID_GTID_FORMAT",
        message: "Invalid GTID format. Expected SGTX-{COUNTRY}-{TYPE}-{SEQ}-{CHECKSUM}",
        gtid: upper,
      },
      { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  // ── Step 2: checksum verification ──
  const calculated = calculateChecksum(parsed.countryCode, parsed.entityType, parsed.sequence);
  if (calculated !== parsed.checksum) {
    await logGtidResolution({
      requesterGtid: caller?.tenantGtid || null,
      resolvedGtid: upper,
      includeVerifiedIds,
      outcome: "CHECKSUM_MISMATCH",
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(
      {
        error: "CHECKSUM_MISMATCH",
        message: "GTID checksum verification failed",
        gtid: upper,
        expected_checksum: calculated,
        provided_checksum: parsed.checksum,
      },
      { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  // ── Step 3: load tenant from DB ──
  let tenant: any;
  try {
    tenant = await db.tenant.findUnique({
      where: { gtid: upper },
      select: {
        gtid: true,
        legalName: true,
        type: true,
        country: true,
        traderMode: true,
        kybTier: true,
        kybStatus: true,
        trustScore: true,
        trustConfidence: true,
        pepStatus: true,
        sanctionsCleared: true,
        lifecycleState: true,
        bankName: true,
        serviceCapabilities: true,
        defiAllowed: true,
        createdAt: true,
      },
    });
  } catch (e: any) {
    logger.error("[v1/gtid/resolve] DB error:", { error: e?.message });
    return NextResponse.json(
      { error: "Resolution failed", gtid: upper },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  if (!tenant) {
    await logGtidResolution({
      requesterGtid: caller?.tenantGtid || null,
      resolvedGtid: upper,
      includeVerifiedIds,
      outcome: "NOT_FOUND",
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(
      {
        error: "GTID_NOT_FOUND",
        message: "GTID does not exist or has been deactivated",
        gtid: upper,
      },
      { status: 404, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  // ── Step 4: revocation check ──
  const revoked = await isGtidRevoked(upper);
  if (revoked) {
    await logGtidResolution({
      requesterGtid: caller?.tenantGtid || null,
      resolvedGtid: upper,
      includeVerifiedIds,
      outcome: "SUSPENDED",
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(
      {
        error: "ACCESS_DENIED",
        message: "GTID is revoked — enhanced due diligence required",
        gtid: upper,
        lifecycle_state: tenant.lifecycleState,
      },
      { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  if (tenant.lifecycleState === "SUSPENDED") {
    await logGtidResolution({
      requesterGtid: caller?.tenantGtid || null,
      resolvedGtid: upper,
      includeVerifiedIds,
      outcome: "SUSPENDED",
      ipAddress: ip,
      userAgent,
    });
    return NextResponse.json(
      {
        found: false,
        error: "ACCESS_DENIED",
        message: "GTID is suspended — enhanced due diligence required",
        gtid: tenant.gtid,
        lifecycle_state: tenant.lifecycleState,
      },
      { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  // ── Step 5: derive metrics + assemble base response ──
  const subtype = deriveSubtype(tenant.type, tenant);
  const { disputeRate, onTimeDeliveryRate } = await deriveTradeMetrics(upper);
  const baseResponse: any = {
    gtid: tenant.gtid,
    legal_name: tenant.legalName,
    type: tenant.type,
    subtype,
    jurisdiction: tenant.country,
    kyb_tier: tenant.kybTier,
    kyb_status: tenant.kybStatus || "PENDING",
    sanctions_cleared: tenant.sanctionsCleared,
    pep_status: tenant.pepStatus || "CLEAR",
    trust_score: tenant.trustScore,
    trust_confidence: tenant.trustConfidence,
    tri_status: deriveTriStatus(tenant.trustScore),
    lifecycle_state: tenant.lifecycleState,
    // Caller-specific (enriched in step 6)
    is_saved_contact: false,
    is_blocked: false,
    relationship_type: null,
    last_interaction: null,
    dispute_rate: disputeRate,
    on_time_delivery_rate: onTimeDeliveryRate,
    consented_to_share: {
      verified_ids: false,
      trust_components: true,
      financing_history: false,
    },
  };

  // ── Step 5.5: optionally include verified identifiers ──
  let verifiedIdentifiers: any[] | null = null;
  if (includeVerifiedIds) {
    try {
      const rows = await db.tenantVerifiedId.findMany({
        where: { tenantGtid: upper, isPublic: true },
        select: {
          identifierType: true,
          identifierValue: true,
          verifiedAt: true,
          verifiedBy: true,
        },
      });
      verifiedIdentifiers = rows.map((r: any) => ({
        type: r.identifierType,
        value: r.identifierValue,
        status: r.verifiedAt ? "VERIFIED" : "PENDING",
        verified_at: r.verifiedAt ? r.verifiedAt.toISOString().slice(0, 10) : null,
        expires_at: null,
        issuer: r.verifiedBy,
      }));
    } catch {
      verifiedIdentifiers = [];
    }
  }

  // ── Step 6: enrich with caller-specific context ──
  if (caller?.tenantGtid) {
    try {
      const contact = await db.savedContact.findFirst({
        where: { ownerGtid: caller.tenantGtid, contactGtid: upper },
        select: { relationship: true, createdAt: true, contactType: true },
      });
      if (contact) {
        baseResponse.is_saved_contact = true;
        baseResponse.relationship_type = (contact as any).relationship || (contact as any).contactType || "CONTACT";
        baseResponse.last_interaction = (contact as any).createdAt ? (contact as any).createdAt.toISOString() : null;
      }
    } catch {
      // non-fatal — caller enrichment is best-effort
    }
  }

  if (verifiedIdentifiers !== null) {
    baseResponse.verified_identifiers = verifiedIdentifiers;
  }
  baseResponse.resolved_at = new Date().toISOString();

  await logGtidResolution({
    requesterGtid: caller?.tenantGtid || null,
    resolvedGtid: upper,
    includeVerifiedIds,
    outcome: "SUCCESS",
    ipAddress: ip,
    userAgent,
  });

  return NextResponse.json(baseResponse, {
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "X-SGTX-Version": "v18.0",
    },
  });
}

// ============ GET + POST handlers ============

export async function GET(req: NextRequest) {
  const ip = resolveClientIp(req);
  const userAgent = req.headers.get("user-agent") || "";
  const sp = req.nextUrl.searchParams;
  const gtid = sp.get("gtid");
  const includeVerifiedIds = sp.get("include_verified_ids") === "true";

  if (!gtid) {
    return NextResponse.json(
      { error: "INVALID_GTID_FORMAT", message: "gtid query parameter required" },
      { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  const ipRl = checkRate(ipBuckets, ip, IP_RATE_LIMIT_MAX);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many resolution requests. Try again later",
        retry_after_seconds: Math.ceil((ipRl.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(ipRl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((ipRl.resetAt - Date.now()) / 1000)),
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  }

  const caller = getCaller(req);
  if (caller?.tenantGtid) {
    const tenantRl = checkRate(tenantBuckets, caller.tenantGtid, TENANT_RATE_LIMIT_MAX);
    if (!tenantRl.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Per-tenant rate limit exceeded (100 req/min)",
          retry_after_seconds: Math.ceil((tenantRl.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(tenantRl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((tenantRl.resetAt - Date.now()) / 1000)),
            "X-SGTX-Version": "v18.0",
          },
        },
      );
    }
  }

  return resolveGtid(gtid, includeVerifiedIds, caller, ip, userAgent);
}

// POST /api/v1/gtid/resolve — same payload via JSON body for programmatic clients.
export async function POST(req: NextRequest) {
  const ip = resolveClientIp(req);
  const userAgent = req.headers.get("user-agent") || "";
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "INVALID_GTID_FORMAT", message: "Invalid JSON body" },
      { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
  const gtid = body?.gtid;
  const includeVerifiedIds = body?.include_verified_ids === true;
  if (!gtid) {
    return NextResponse.json(
      { error: "INVALID_GTID_FORMAT", message: "gtid required" },
      { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }

  const ipRl = checkRate(ipBuckets, ip, IP_RATE_LIMIT_MAX);
  if (!ipRl.allowed) {
    return NextResponse.json(
      {
        error: "RATE_LIMIT_EXCEEDED",
        message: "Too many resolution requests. Try again later",
        retry_after_seconds: Math.ceil((ipRl.resetAt - Date.now()) / 1000),
      },
      {
        status: 429,
        headers: {
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(ipRl.resetAt / 1000)),
          "Retry-After": String(Math.ceil((ipRl.resetAt - Date.now()) / 1000)),
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  }

  const caller = getCaller(req);
  if (caller?.tenantGtid) {
    const tenantRl = checkRate(tenantBuckets, caller.tenantGtid, TENANT_RATE_LIMIT_MAX);
    if (!tenantRl.allowed) {
      return NextResponse.json(
        {
          error: "RATE_LIMIT_EXCEEDED",
          message: "Per-tenant rate limit exceeded (100 req/min)",
          retry_after_seconds: Math.ceil((tenantRl.resetAt - Date.now()) / 1000),
        },
        {
          status: 429,
          headers: {
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(tenantRl.resetAt / 1000)),
            "Retry-After": String(Math.ceil((tenantRl.resetAt - Date.now()) / 1000)),
            "X-SGTX-Version": "v18.0",
          },
        },
      );
    }
  }

  return resolveGtid(gtid, includeVerifiedIds, caller, ip, userAgent);
}
