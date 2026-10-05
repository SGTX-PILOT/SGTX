// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/v1/identity/gtid/generate — Internal GTID generation (v18 §4.1.4.3)
//
// v18 §4.1.4.3: Endpoint is INTERNAL — only called during onboarding.
// Generates a GTID for the given (country, entity_type) pair, persists the
// atomic sequence, and returns the GTID + sequence + checksum.
//
// Auth: Bearer JWT with ADM or GOV role (admin-only). Demo portals use
// /api/sgtx/onboarding/start which has its own rate-limited flow.
//
// Request body (v18 §4.1.4.3):
//   {
//     "country_code": "EG",
//     "entity_type": "TRD",
//     "legal_name": "Strawberry Export Co.",
//     "jurisdiction": "EG"
//   }
//
// Response shape (v18 §4.1.4.3):
//   {
//     "gtid": "SGTX-EG-TRD-002139-7F3A",
//     "sequence": 2139,
//     "checksum": "7F3A",
//     "created_at": "2026-06-15T10:00:00Z"
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

// Inlined CRC32-ISO-HDLC checksum (avoids importing @/lib/sgtx/identity/gtid
// which triggers Turbopack Prisma load at module-eval time)
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

const VALID_ENTITY_TYPES = new Set(["TRD", "LSP", "SHIP", "LAB", "QC", "CBR", "FIN", "GOV", "MP"]);

// In-memory rate limiter (10 req/min per admin caller)
const RATE_LIMIT_MAX = 10;
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

export async function POST(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) {
      return NextResponse.json(
        { error: "Authentication required" },
        { status: 401, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    // v18 §4.1.4.3 — internal endpoint, restricted to ADM/GOV roles
    if (caller.role !== "ADM" && caller.role !== "GOV") {
      return NextResponse.json(
        { error: "ACCESS_DENIED", message: "GTID generation is restricted to ADM/GOV roles. Demo portals use /api/sgtx/onboarding/start" },
        { status: 403, headers: { "X-SGTX-Version": "v18.0" } },
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

    const countryCode = (body?.country_code || body?.country || "").toUpperCase();
    const entityType = (body?.entity_type || body?.type || "").toUpperCase();
    const legalName = body?.legal_name;
    const jurisdiction = (body?.jurisdiction || countryCode).toUpperCase();

    if (!countryCode || countryCode.length !== 2) {
      return NextResponse.json(
        { error: "INVALID_COUNTRY_CODE", message: "country_code must be a 2-letter ISO 3166-1 alpha-2 code" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!entityType || !VALID_ENTITY_TYPES.has(entityType)) {
      return NextResponse.json(
        { error: "INVALID_ENTITY_TYPE", message: `entity_type must be one of: ${Array.from(VALID_ENTITY_TYPES).join(", ")}` },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }
    if (!legalName || typeof legalName !== "string" || legalName.trim().length < 2) {
      return NextResponse.json(
        { error: "INVALID_LEGAL_NAME", message: "legal_name is required (min 2 chars)" },
        { status: 400, headers: { "X-SGTX-Version": "v18.0" } },
      );
    }

    const { freshDb } = await import("@/lib/db-fresh");

    // Step 1: Atomic sequence acquisition (v18 §4.1.4.2)
    const seqRow = await freshDb.gtidSequence.upsert({
      where: { countryCode_entityType: { countryCode, entityType } },
      update: { lastSequence: { increment: 1 } },
      create: { countryCode, entityType, lastSequence: 1 },
    });
    const sequence = (seqRow as any).lastSequence;
    const seqStr = String(sequence).padStart(6, "0");

    // Step 2: Checksum calculation (CRC32-ISO-HDLC)
    const checksum = calculateChecksum(countryCode, entityType, seqStr);

    // Step 3: Assemble GTID
    const gtid = `SGTX-${countryCode}-${entityType}-${seqStr}-${checksum}`;

    // Step 4: Persist tenant (lifecycle_state = REGISTERED per v18 §4.1.4.1)
    const tenant = await freshDb.tenant.create({
      data: {
        gtid,
        legalName: legalName.trim(),
        type: entityType,
        country: countryCode,
        lifecycleState: "REGISTERED",
        kybTier: 0,
        sanctionsCleared: false,
        trustScore: 0,
      },
    });

    // Step 5: Governor decision (audit log)
    try {
      await freshDb.governorDecision.create({
        data: {
          decisionId: `gtid-gen-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
          action: "gtid_generation",
          actorGtid: caller.gtid,
          ustn: null,
          verdict: "ALLOW",
          reason: `GTID generated for ${entityType} in ${countryCode}: ${gtid}`,
          policyId: "identity.gtid.generate.v1",
          evidenceJson: JSON.stringify({ gtid, sequence, checksum, legalName, jurisdiction }),
          conditions: "[]",
        },
      });
    } catch (e: any) {
      logger.warn("[v1/identity/gtid/generate] Governor log failed (non-fatal):", { error: e?.message });
    }

    return NextResponse.json(
      {
        gtid: tenant.gtid,
        sequence,
        checksum,
        country_code: countryCode,
        entity_type: entityType,
        legal_name: tenant.legalName,
        jurisdiction,
        created_at: new Date().toISOString(),
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
    logger.error("[v1/identity/gtid/generate] error:", { error: e?.message || String(e) });
    return NextResponse.json(
      { error: "GTID generation failed", message: e?.message },
      { status: 503, headers: { "X-SGTX-Version": "v18.0" } },
    );
  }
}
