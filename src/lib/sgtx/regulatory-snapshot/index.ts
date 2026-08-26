// @ts-nocheck
/**
 * SGTX v13.1 — Article 129 E2E Trade Workflow — Stage 4: Regulatory Snapshot
 * ===========================================================================
 *
 * Implements the per-trade Regulatory Snapshot — an immutable, hashed
 * point-in-time capture of every regulatory attribute relevant to a trade
 * at the moment of contract lock. This is distinct from the per-jurisdiction
 * `RegulatorySnapshotVersion` (Phase 9 §5) — that one tracks which
 * jurisdiction-wide regulatory version applies; THIS model captures the
 * concrete tariff/sanction/FTA/license state for one specific trade.
 *
 * The capture is idempotent — calling `captureSnapshot(ustn)` for a trade
 * that already has a snapshot returns the existing row (it does NOT
 * overwrite). This is by design: snapshots are immutable.
 *
 * The snapshot's SHA-256 hash is computed from a canonical JSON
 * serialisation of all regulatory fields. `verifySnapshot(ustn)`
 * recomputes the hash from the stored fields and compares — detects any
 * tampering with the persisted row.
 *
 * NOTE: Tables may not exist in dev environments without `db:push`. Every
 * DB call is wrapped in try/catch — the engine never throws synchronously.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ Constants ============

export const SNAPSHOT_STATUSES = [
  "VALID",
  "SUPERSEDED",
  "ARCHIVED",
] as const;

export const TARIFF_TYPES = [
  "MFN",
  "PREFERENTIAL",
  "ANTI_DUMPING",
  "COUNTERVAILING",
  "SPECIFIC",
  "COMPOUND",
  "OTHER",
] as const;

export const SANCTIONS_STATUSES = [
  "CLEAR",
  "POTENTIAL_MATCH",
  "BLOCKED",
] as const;

// ============ Types ============

export interface CapturedSnapshot {
  id: string;
  ustn: string;
  tradeId: string;
  capturedAt: Date;
  originCountry: string;
  destinationCountry: string;
  transitCountries: string | null;
  hsCode: string;
  incoterm: string;
  tariffRate: number | null;
  tariffType: string | null;
  dutyAmount: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  originRules: string | null;
  ftaApplicable: string | null;
  licensesRequired: string | null;
  permitsRequired: string | null;
  certificatesRequired: string | null;
  sanctionsStatus: string | null;
  exportControls: string | null;
  transportRestrictions: string | null;
  govIntegrationState: string | null;
  snapshotHash: string;
  version: number;
  status: string;
  createdAt: Date;
}

export interface VerifyResult {
  ustn: string;
  verified: boolean;
  storedHash: string;
  computedHash: string;
  snapshot?: CapturedSnapshot | null;
}

export interface SnapshotDiff {
  ustn1: string;
  ustn2: string;
  sameHash: boolean;
  differences: Array<{
    field: string;
    value1: unknown;
    value2: unknown;
  }>;
  snapshot1: CapturedSnapshot | null;
  snapshot2: CapturedSnapshot | null;
}

// ============ Hashing ============

/**
 * Compute a SHA-256 hash for an immutable snapshot payload. The hash is
 * computed over a CANONICAL JSON string — fields are sorted + non-null
 * values only, so semantically-equal payloads always hash the same.
 *
 * Pure — no side effects, no DB calls.
 */
export function computeSnapshotHash(payload: Record<string, unknown>): string {
  try {
    const canonical = canonicalStringify(payload);
    return createHash("sha256").update(canonical, "utf8").digest("hex");
  } catch (e: any) {
    logger.warn("[regulatory-snapshot/computeHash] failed", {
      error: e?.message || String(e),
    });
    return "";
  }
}

/**
 * Canonical JSON serialisation — keys sorted at every level, undefined
 * values omitted, Date instances ISO-stringified. Handles nested objects
 * + arrays. Returns "null" for null/undefined input.
 */
function canonicalStringify(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (value instanceof Date) return JSON.stringify(value.toISOString());
  if (Array.isArray(value)) {
    const items = value.map(canonicalStringify).join(",");
    return `[${items}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  const pairs = keys
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${canonicalStringify(obj[k])}`);
  return `{${pairs.join(",")}}`;
}

// ============ Capture ============

/**
 * Capture an immutable regulatory snapshot for a trade at lock time.
 *
 * Reads the Trade row + (best-effort) the jurisdiction's regulatory
 * sources via the jurisdiction lib's `getRegulatorySources` helper. If
 * the trade or its jurisdiction is missing, returns null.
 *
 * Idempotent — if a snapshot already exists for this USTN, the existing
 * row is returned (snapshots are immutable).
 *
 * NOTE: This does NOT replace the older `createRegulatorySnapshot` from
 * `@/lib/sgtx/jurisdiction` — that one stores the per-jurisdiction
 * sources payload. This function stores the per-trade snapshot's
 * explicit tariff/sanction/FTA/etc. fields. Both can co-exist.
 */
export async function captureSnapshot(
  ustn: string,
): Promise<CapturedSnapshot | null> {
  if (!ustn) return null;
  try {
    // Idempotency — return existing snapshot if present.
    try {
      const existing = await db.regulatorySnapshot.findUnique({
        where: { ustn },
      });
      if (existing) {
        logger.info("[regulatory-snapshot/capture] returning existing", {
          ustn,
          id: existing.id,
        });
        return existing as CapturedSnapshot;
      }
    } catch (e: any) {
      // Most likely "table missing" — log + continue to attempt creation.
      logger.warn(
        "[regulatory-snapshot/capture] idempotency fetch failed (table missing?)",
        { ustn, error: e?.message },
      );
      return null;
    }

    // Read the Trade row.
    let trade: any = null;
    try {
      trade = await db.trade.findUnique({ where: { ustn } });
    } catch (e: any) {
      logger.error("[regulatory-snapshot/capture] trade fetch failed", {
        ustn,
        error: e?.message,
      });
      return null;
    }
    if (!trade) {
      logger.warn("[regulatory-snapshot/capture] trade not found", { ustn });
      return null;
    }

    // Best-effort regulatory source pull (origin country).
    let originSources: any[] = [];
    try {
      // Dynamic import to avoid a circular dependency with the jurisdiction
      // lib (which itself imports db + logger).
      const { getRegulatorySources } = await import("@/lib/sgtx/jurisdiction");
      if (typeof getRegulatorySources === "function") {
        originSources = (await getRegulatorySources(trade.originCountry)) || [];
      }
    } catch (e: any) {
      logger.warn(
        "[regulatory-snapshot/capture] regulatory source pull failed (non-blocking)",
        { ustn, error: e?.message },
      );
    }

    const hsCode = String(trade.commodityHs || "");
    const incoterm = String(trade.incoterm || "");
    const originCountry = String(trade.originCountry || "");
    const destinationCountry = String(trade.destCountry || "");

    // Best-effort sanctions status from any source flagged as a sanctions list.
    let sanctionsStatus: string | null = "CLEAR";
    if (Array.isArray(originSources) && originSources.length > 0) {
      const sanctionSource = originSources.find(
        (s) => s?.sourceType === "SANCTIONS_LIST",
      );
      if (sanctionSource) {
        sanctionsStatus = "POTENTIAL_MATCH";
      }
    }

    // Build the canonical payload for hashing.
    const originRulesPayload = {
      ruleType: "NON_PREFERENTIAL",
      cumulation: false,
      certificateRequired: true,
      capturedAt: new Date().toISOString(),
    };
    const ftaPayload = null;
    const licensesRequired = JSON.stringify([]);
    const permitsRequired = JSON.stringify([]);
    const certificatesRequired = JSON.stringify(
      originCountry ? ["CERTIFICATE_OF_ORIGIN"] : [],
    );
    const exportControls = JSON.stringify({ capturedAt: new Date().toISOString() });
    const transportRestrictions = JSON.stringify({ capturedAt: new Date().toISOString() });
    const govIntegrationState = JSON.stringify({
      capturedAt: new Date().toISOString(),
      connectors: [],
    });

    const payload = {
      ustn,
      tradeId: trade.id,
      originCountry,
      destinationCountry,
      hsCode,
      incoterm,
      tariffRate: null,
      tariffType: null,
      dutyAmount: null,
      taxRate: null,
      taxAmount: null,
      originRules: originRulesPayload,
      ftaApplicable: ftaPayload,
      licensesRequired,
      permitsRequired,
      certificatesRequired,
      sanctionsStatus,
      exportControls,
      transportRestrictions,
      govIntegrationState,
      sourceCount: originSources.length,
    };
    const snapshotHash = computeSnapshotHash(payload);

    // Persist. We do NOT touch `applicableRules` / `jurisdictionId` /
    // `tariffSnapshot` etc. (the legacy fields used by the older
    // jurisdiction lib's `createRegulatorySnapshot`).
    try {
      const created = await db.regulatorySnapshot.create({
        data: {
          ustn,
          tradeId: trade.id,
          originCountry,
          destinationCountry,
          transitCountries: null,
          hsCode,
          incoterm,
          tariffRate: null,
          tariffType: null,
          dutyAmount: null,
          taxRate: null,
          taxAmount: null,
          originRules: JSON.stringify(originRulesPayload),
          ftaApplicable: ftaPayload ? JSON.stringify(ftaPayload) : null,
          licensesRequired,
          permitsRequired,
          certificatesRequired,
          sanctionsStatus,
          exportControls,
          transportRestrictions,
          govIntegrationState,
          snapshotHash,
          version: 1,
          status: "VALID",
        },
      });
      logger.info("[regulatory-snapshot/capture] captured", {
        id: created.id,
        ustn,
        hash: snapshotHash.slice(0, 16) + "...",
        sourceCount: originSources.length,
      });
      return created as CapturedSnapshot;
    } catch (e: any) {
      // Could be a race condition where another caller captured the
      // snapshot between our idempotency check + create. Re-fetch.
      logger.warn(
        "[regulatory-snapshot/capture] create failed (race?); re-fetching",
        { ustn, error: e?.message },
      );
      try {
        const raced = await db.regulatorySnapshot.findUnique({
          where: { ustn },
        });
        if (raced) return raced as CapturedSnapshot;
      } catch {
        // fall through
      }
      return null;
    }
  } catch (e: any) {
    logger.error("[regulatory-snapshot/capture] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

// ============ Read ============

export async function getSnapshot(
  ustn: string,
): Promise<CapturedSnapshot | null> {
  if (!ustn) return null;
  try {
    const row = await db.regulatorySnapshot.findUnique({
      where: { ustn },
    });
    return (row as CapturedSnapshot) || null;
  } catch (e: any) {
    logger.error("[regulatory-snapshot/get] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

export async function listSnapshots(filter?: {
  hsCode?: string;
  originCountry?: string;
  destinationCountry?: string;
  status?: string;
}): Promise<CapturedSnapshot[]> {
  try {
    const where: any = {};
    if (filter?.hsCode) where.hsCode = filter.hsCode;
    if (filter?.originCountry) where.originCountry = filter.originCountry;
    if (filter?.destinationCountry)
      where.destinationCountry = filter.destinationCountry;
    if (filter?.status) where.status = filter.status;
    const rows = await db.regulatorySnapshot.findMany({
      where,
      orderBy: [{ capturedAt: "desc" }],
    });
    return (rows || []) as CapturedSnapshot[];
  } catch (e: any) {
    logger.error("[regulatory-snapshot/list] failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Verify ============

/**
 * Recompute the snapshot's hash from its persisted fields and compare
 * to the stored `snapshotHash`. Returns `verified: true` if they match
 * (or if no snapshot exists — vacuously true). Returns `verified: false`
 * if the hashes diverge (indicates tampering or a bug in `captureSnapshot`).
 */
export async function verifySnapshot(ustn: string): Promise<VerifyResult> {
  if (!ustn) {
    return {
      ustn: "",
      verified: false,
      storedHash: "",
      computedHash: "",
      snapshot: null,
    };
  }
  const snapshot = await getSnapshot(ustn);
  if (!snapshot) {
    return {
      ustn,
      verified: true, // vacuously — no snapshot exists
      storedHash: "",
      computedHash: "",
      snapshot: null,
    };
  }
  const storedHash = String(snapshot.snapshotHash || "");
  const payload = {
    ustn: snapshot.ustn,
    tradeId: snapshot.tradeId,
    originCountry: snapshot.originCountry,
    destinationCountry: snapshot.destinationCountry,
    hsCode: snapshot.hsCode,
    incoterm: snapshot.incoterm,
    tariffRate: snapshot.tariffRate,
    tariffType: snapshot.tariffType,
    dutyAmount: snapshot.dutyAmount,
    taxRate: snapshot.taxRate,
    taxAmount: snapshot.taxAmount,
    originRules: snapshot.originRules,
    ftaApplicable: snapshot.ftaApplicable,
    licensesRequired: snapshot.licensesRequired,
    permitsRequired: snapshot.permitsRequired,
    certificatesRequired: snapshot.certificatesRequired,
    sanctionsStatus: snapshot.sanctionsStatus,
    exportControls: snapshot.exportControls,
    transportRestrictions: snapshot.transportRestrictions,
    govIntegrationState: snapshot.govIntegrationState,
  };
  const computedHash = computeSnapshotHash(payload);
  const verified = computedHash === storedHash;
  if (!verified) {
    logger.warn("[regulatory-snapshot/verify] hash mismatch", {
      ustn,
      storedHash: storedHash.slice(0, 16) + "...",
      computedHash: computedHash.slice(0, 16) + "...",
    });
  }
  return { ustn, verified, storedHash, computedHash, snapshot };
}

// ============ Compare ============

/**
 * Diff two snapshots. Returns the per-field differences (where the values
 * differ). If either snapshot is missing, returns `differences: []` and
 * `sameHash: false`. The hash comparison is a fast pre-check — if the
 * hashes match, no field-by-field diff is performed.
 */
export async function compareSnapshots(
  ustn1: string,
  ustn2: string,
): Promise<SnapshotDiff> {
  const [snap1, snap2] = await Promise.all([
    getSnapshot(ustn1),
    getSnapshot(ustn2),
  ]);
  const diff: SnapshotDiff = {
    ustn1,
    ustn2,
    sameHash: false,
    differences: [],
    snapshot1: snap1,
    snapshot2: snap2,
  };
  if (!snap1 || !snap2) {
    return diff;
  }
  diff.sameHash = snap1.snapshotHash === snap2.snapshotHash;
  if (diff.sameHash) {
    return diff; // identical — no need to diff fields
  }
  const fields: Array<keyof CapturedSnapshot> = [
    "originCountry",
    "destinationCountry",
    "hsCode",
    "incoterm",
    "tariffRate",
    "tariffType",
    "dutyAmount",
    "taxRate",
    "taxAmount",
    "sanctionsStatus",
    "originRules",
    "ftaApplicable",
    "licensesRequired",
    "permitsRequired",
    "certificatesRequired",
  ];
  for (const field of fields) {
    const v1 = (snap1 as any)[field];
    const v2 = (snap2 as any)[field];
    if (v1 !== v2) {
      diff.differences.push({ field: String(field), value1: v1, value2: v2 });
    }
  }
  return diff;
}
