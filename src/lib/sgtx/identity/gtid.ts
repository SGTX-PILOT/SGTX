// SGTX Part 2.1 — Global Trade Identity (GTID) library
// Implements: format (2.1.1), entity types (2.1.2), checksum (2.1.3),
// generation (2.1.4), resolution caching (2.1.6), revocation (2.1.8.3).
//
// This module consolidates the GTID primitives previously duplicated across
// /api/sgtx/onboarding, /api/sgtx/gtid/resolve and /lib/v1/auth. It is the
// single source of truth for GTID format + checksum + sequence generation.

import { db } from "@/lib/db";

// ============ 2.1.1 Format ============
export const GTID_REGEX = /^SGTX-([A-Z]{2})-([A-Z]{3})-(\d{6})-([A-F0-9]{4})$/i;

export interface ParsedGtid {
  prefix: string;       // "SGTX"
  countryCode: string;  // 2-letter ISO
  entityType: string;   // 3-letter code
  sequence: string;     // 6-digit zero-padded
  checksum: string;     // 4-hex digit
  sequenceNum: number;  // numeric sequence
}

// ============ 2.1.2 Entity Type Codes ============
export const ENTITY_TYPE_CODES = [
  "TRD", // Trader
  "LSP", // Logistics Service Provider
  "SHIP", // Shipping Line
  "LAB", // Laboratory
  "QC", // Quality Control
  "CBR", // Customs Broker
  "FIN", // Financier
  "GOV", // Government
  "MP",  // Marketplace Partner
] as const;
export type EntityType = (typeof ENTITY_TYPE_CODES)[number];

// Legacy aliases still present in DB; accepted for backwards compatibility.
export const LEGACY_ENTITY_ALIASES: Record<string, EntityType> = {
  BANK: "FIN", // FIN subtype, legacy main code
  PFI: "FIN",  // FIN subtype, legacy main code
  ADM: "GOV",  // legacy alias for GOV
  MKT: "MP",   // legacy alias for MP
};

export const FINANCIER_SUBTYPES = ["BANK", "PFI"] as const;
export const LSP_SUBTYPES = ["TRUCKING", "FORWARDER", "WAREHOUSING"] as const;

export function isValidEntityType(code: string): boolean {
  if (!code || typeof code !== "string") return false;
  const upper = code.toUpperCase();
  return (ENTITY_TYPE_CODES as readonly string[]).includes(upper) || upper in LEGACY_ENTITY_ALIASES;
}

export function normalizeEntityType(code: string): EntityType {
  const upper = (code || "").toUpperCase();
  if ((ENTITY_TYPE_CODES as readonly string[]).includes(upper as EntityType)) {
    return upper as EntityType;
  }
  if (upper in LEGACY_ENTITY_ALIASES) return LEGACY_ENTITY_ALIASES[upper];
  throw new Error(`Invalid entity type: ${code}`);
}

// ============ 2.1.3 Checksum (CRC32-ISO-HDLC) ============
//
// Blueprint 2.1.3: CRC32-ISO-HDLC of {country}{type}{sequence}, then take the
// first 4 hex digits (most-significant 16 bits of the 32-bit CRC). The prose
// says "first 2 bytes 0x7F3A" of the CRC result. The Rust sample uses
// `crc & 0xFFFF` (low 16 bits) which is inconsistent with the prose — we
// follow the prose + the existing auth.ts implementation (first 4 hex chars)
// to remain backwards-compatible with the existing ~880 tenants already
// issued with the first-4-hex algorithm.
export function crc32(input: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < input.length; i++) {
    crc ^= input.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/** Compute the 4-hex-digit checksum for the {country}{type}{sequence} triple. */
export function calculateChecksum(country: string, type: string, sequence: string): string {
  const input = `${country.toUpperCase()}${type.toUpperCase()}${sequence}`;
  // Take the first 4 hex digits of the full 32-bit CRC (matches auth.ts +
  // /api/sgtx/onboarding/route.ts). Equivalent to the most-significant 16 bits.
  return crc32(input).toString(16).toUpperCase().padStart(8, "0").slice(0, 4);
}

/** Build a complete GTID string from components. */
export function formatGtid(country: string, type: string, sequence: number | string): string {
  const seq = typeof sequence === "number"
    ? String(sequence).padStart(6, "0")
    : sequence.padStart(6, "0");
  const checksum = calculateChecksum(country, type, seq);
  return `SGTX-${country.toUpperCase()}-${type.toUpperCase()}-${seq}-${checksum}`;
}

// ============ 2.1.3 Verification ============
export function parseGtid(gtid: string): ParsedGtid | null {
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

/** Validate format + checksum. Returns true iff the checksum matches. */
export function verifyGtid(gtid: string): boolean {
  const p = parseGtid(gtid);
  if (!p) return false;
  const expected = calculateChecksum(p.countryCode, p.entityType, p.sequence);
  return expected === p.checksum;
}

// ============ 2.1.4 Generation (atomic sequence) ============
/**
 * Atomically acquire the next sequence number for (country, type) by upserting
 * the GtidSequence row. Two concurrent callers will get distinct sequence
 * numbers because Prisma's upsert serialises the increment under a single
 * transaction (SQLite SERIALIZABLE by default). Returns the new sequence value.
 */
export async function acquireNextSequence(country: string, type: string): Promise<number> {
  const countryCode = country.toUpperCase();
  const entityType = normalizeEntityType(type);
  // Upsert creates the row if missing; on update we increment lastSequence.
  const rec = await db.gtidSequence.upsert({
    where: { countryCode_entityType: { countryCode, entityType } },
    update: { lastSequence: { increment: 1 } },
    create: { countryCode, entityType, lastSequence: 1 },
  });
  return rec.lastSequence;
}

/** Generate the next GTID for (country, type), persisting the sequence atomically. */
export async function generateGtid(country: string, type: string): Promise<{ gtid: string; sequence: number; checksum: string }> {
  const entityType = normalizeEntityType(type);
  const sequence = await acquireNextSequence(country, entityType);
  const seq = String(sequence).padStart(6, "0");
  const checksum = calculateChecksum(country, entityType, seq);
  return {
    gtid: `SGTX-${country.toUpperCase()}-${entityType}-${seq}-${checksum}`,
    sequence,
    checksum,
  };
}

// ============ 2.1.6 Resolution Cache (L1 in-memory, 5-min TTL) ============
// Cache key: gtid:{gtid}:v:{includeVerified}
// Invalidation: explicit invalidateGtidCache(gtid) on tenant profile update.
// Performance targets (Part 2.1.6.3): hit <10ms, DB fallback p95 <50ms.

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
  version: number;
}
const RESOLUTION_CACHE = new Map<string, CacheEntry<unknown>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** Version counter — bumped on invalidate, included in cache key per blueprint. */
const GTID_VERSIONS = new Map<string, number>();

export function gtidCacheKey(gtid: string, includeVerified: boolean): string {
  const v = GTID_VERSIONS.get(gtid.toUpperCase()) ?? 1;
  return `gtid:${gtid.toUpperCase()}:v:${v}:${includeVerified ? 1 : 0}`;
}

export function getCachedResolution<T>(gtid: string, includeVerified: boolean): T | null {
  const key = gtidCacheKey(gtid, includeVerified);
  const entry = RESOLUTION_CACHE.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    RESOLUTION_CACHE.delete(key);
    return null;
  }
  return entry.value as T;
}

export function setCachedResolution<T>(gtid: string, includeVerified: boolean, value: T, ttlMs: number = CACHE_TTL_MS): void {
  const key = gtidCacheKey(gtid, includeVerified);
  RESOLUTION_CACHE.set(key, { value, expiresAt: Date.now() + ttlMs, version: GTID_VERSIONS.get(gtid.toUpperCase()) ?? 1 });
}

export function invalidateGtidCache(gtid: string): void {
  const upper = gtid.toUpperCase();
  const next = (GTID_VERSIONS.get(upper) ?? 1) + 1;
  GTID_VERSIONS.set(upper, next);
  // Drop any existing entries for this GTID (any version) so the next read
  // misses cache and pulls fresh data.
  for (const k of RESOLUTION_CACHE.keys()) {
    if (k.startsWith(`gtid:${upper}:v:`)) RESOLUTION_CACHE.delete(k);
  }
}

export function clearGtidCache(): void {
  RESOLUTION_CACHE.clear();
  GTID_VERSIONS.clear();
}

// ============ 2.1.8.3 Revocation helpers ============
/**
 * Record a GTID revocation event. Does NOT change lifecycle state — that's
 * the caller's responsibility. Returns the created GtidRevocationLog row.
 */
export async function revokeGtid(gtid: string, revocationType: string, reason?: string, revokedBy?: string) {
  const upper = gtid.toUpperCase();
  invalidateGtidCache(upper);
  return db.gtidRevocationLog.create({
    data: { gtid: upper, revocationType, reason: reason || null, revokedBy: revokedBy || null },
  });
}

/** Returns true iff there is an active (non-reactivated) revocation for the GTID. */
export async function isGtidRevoked(gtid: string): Promise<boolean> {
  const upper = gtid.toUpperCase();
  const last = await db.gtidRevocationLog.findFirst({
    where: { gtid: upper },
    orderBy: { revokedAt: "desc" },
  });
  if (!last) return false;
  // If the most recent entry has a reactivatedAt timestamp, the GTID is
  // currently active. Otherwise it's revoked.
  return last.reactivatedAt === null;
}

/** Reactivate a previously-revoked GTID (e.g., after sanctions are cleared). */
export async function reactivateGtid(gtid: string): Promise<void> {
  const upper = gtid.toUpperCase();
  const last = await db.gtidRevocationLog.findFirst({
    where: { gtid: upper, reactivatedAt: null },
    orderBy: { revokedAt: "desc" },
  });
  if (last) {
    await db.gtidRevocationLog.update({ where: { id: last.id }, data: { reactivatedAt: new Date() } });
  }
  invalidateGtidCache(upper);
}

// ============ 2.1.8.2 Resolution audit logging ============
export async function logGtidResolution(params: {
  requesterGtid?: string | null;
  resolvedGtid: string;
  includeVerifiedIds?: boolean;
  outcome: string; // SUCCESS | NOT_FOUND | SUSPENDED | ARCHIVED | INVALID_FORMAT | CHECKSUM_MISMATCH | RATE_LIMITED
  ipAddress?: string | null;
  userAgent?: string | null;
}) {
  try {
    await db.gtidResolutionLog.create({
      data: {
        requesterGtid: params.requesterGtid || null,
        resolvedGtid: params.resolvedGtid,
        includeVerifiedIds: !!params.includeVerifiedIds,
        outcome: params.outcome,
        ipAddress: params.ipAddress || null,
        userAgent: params.userAgent || null,
      },
    });
  } catch {
    // best-effort — audit log failure must not block resolution
  }
}
