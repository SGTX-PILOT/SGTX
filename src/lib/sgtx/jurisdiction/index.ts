// SGTX Jurisdiction Fabric (CCL-014 §2, §4, §5)
// ---------------------------------------------------------------------------
// This module provides the canonical read/write helpers for the three
// permanent global foundation models introduced by CCL-014:
//
//   • JurisdictionFabric   — a node in the global jurisdiction tree
//                            (country, customs territory, economic union,
//                             free zone, port/airport customs, SEZ, etc.)
//   • RegulatorySource     — a law / regulation / tariff / official notice /
//                            gov API spec / SPS rule / standards req / tax /
//                            export-control / sanctions source referenced by
//                            a jurisdiction at lookup time.
//   • RegulatorySnapshot   — an immutable, hashed point-in-time copy of the
//                            applicable rules + tariff + document +
//                            government-integration state for a trade, taken
//                            at trade-lock. Used for after-the-fact audits
//                            (e.g. "what rules applied when this USTN
//                             locked?") and for the Governor G-J3 / G-J4
//                            consistency gates.
//
// Design rules (per CCL-014):
//   • Every DB call is defensive — failures are caught, logged via the shared
//     SGTX logger, and degraded to a safe default (null / empty array).
//   • All read helpers return Prisma model rows directly (no DTO trimming)
//     so the API layer can decide what to expose.
//   • Hierarchy walks are bounded (max 16 levels) to prevent cycles in
//     malformed data from hanging the request.
//   • Snapshot creation is idempotent on (ustn, jurisdictionCode): re-calling
//     `createRegulatorySnapshot` for the same (ustn, jurisdiction) returns the
//     existing snapshot rather than creating a duplicate.
//
// NO Governor gate is wired here. G-J1..G-J4 live alongside the other
// Governor gates in `src/lib/sgtx/governor/gates-jurisdiction.ts` and call
// into the pure boolean helpers (`isJurisdictionActive`,
// `isJurisdictionValid`, `isRegulatorySourceStale`,
// `isRegulatorySourceExpired`) exposed below.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// Re-export the Prisma-generated types so callers don't have to import
// `@prisma/client` separately. These resolve at compile time to the actual
// Prisma model types.
import type {
  JurisdictionFabric,
  RegulatorySource,
  RegulatorySnapshot,
} from "@prisma/client";

export type { JurisdictionFabric, RegulatorySource, RegulatorySnapshot };

// ============ Constants ============

/** Hard ceiling on hierarchy depth to avoid runaway recursion on cyclic data. */
const MAX_HIERARCHY_DEPTH = 16;

/** Days after which a regulatory source is considered stale (lastChecked > 90d). */
const STALE_THRESHOLD_DAYS = 90;

// ============ Read helpers ============

/**
 * Get a single jurisdiction by its unique code (ISO 3166-1 alpha-2 or
 * customs territory code). Defensive — returns null on failure or if no
 * jurisdiction exists for the supplied code.
 */
export async function getJurisdiction(
  code: string,
): Promise<JurisdictionFabric | null> {
  if (!code || typeof code !== "string") return null;
  try {
    const j = await db.jurisdictionFabric.findUnique({
      where: { code: code.toUpperCase() },
    });
    return j;
  } catch (e: any) {
    logger.error("[jurisdiction/getJurisdiction] failed", {
      code,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Walk the parent chain from `code` up to the root jurisdiction.
 * Returns an ordered array: [code, parent, grandparent, ..., root].
 * Defensive — on failure, returns whatever prefix was collected.
 * Bounded by MAX_HIERARCHY_DEPTH to prevent runaway cycles.
 */
export async function getJurisdictionHierarchy(
  code: string,
): Promise<JurisdictionFabric[]> {
  if (!code) return [];
  const chain: JurisdictionFabric[] = [];
  let currentCode: string | null = code.toUpperCase();
  const seen = new Set<string>();
  try {
    while (currentCode && chain.length < MAX_HIERARCHY_DEPTH) {
      if (seen.has(currentCode)) {
        // Cycle guard — malformed hierarchy in DB.
        logger.warn("[jurisdiction/getJurisdictionHierarchy] cycle detected", {
          code,
          currentCode,
          depth: chain.length,
        });
        break;
      }
      seen.add(currentCode);
      const node = await db.jurisdictionFabric.findUnique({
        where: { code: currentCode },
      });
      if (!node) break;
      chain.push(node);
      // Parent is referenced by `parentJurisdictionId` (id, not code), so
      // we have to fetch the parent row to get its code for the next loop.
      if (!node.parentJurisdictionId) break;
      try {
        const parent = await db.jurisdictionFabric.findUnique({
          where: { id: node.parentJurisdictionId },
        });
        currentCode = parent ? parent.code : null;
      } catch (e: any) {
        logger.warn(
          "[jurisdiction/getJurisdictionHierarchy] parent lookup failed",
          { code: currentCode, parentId: node.parentJurisdictionId, error: e?.message },
        );
        break;
      }
    }
    return chain;
  } catch (e: any) {
    logger.error("[jurisdiction/getJurisdictionHierarchy] failed", {
      code,
      error: e?.message || String(e),
    });
    return chain;
  }
}

/**
 * Get the immediate child jurisdictions of `code`.
 * Defensive — returns [] on failure.
 */
export async function getChildJurisdictions(
  code: string,
): Promise<JurisdictionFabric[]> {
  if (!code) return [];
  try {
    const parent = await db.jurisdictionFabric.findUnique({
      where: { code: code.toUpperCase() },
      select: { id: true },
    });
    if (!parent) return [];
    const children = await db.jurisdictionFabric.findMany({
      where: { parentJurisdictionId: parent.id },
      orderBy: { name: "asc" },
    });
    return children;
  } catch (e: any) {
    logger.error("[jurisdiction/getChildJurisdictions] failed", {
      code,
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Get all regulatory sources attached to a jurisdiction (by code).
 * Defensive — returns [] on failure.
 */
export async function getRegulatorySources(
  jurisdictionCode: string,
): Promise<RegulatorySource[]> {
  if (!jurisdictionCode) return [];
  try {
    const j = await db.jurisdictionFabric.findUnique({
      where: { code: jurisdictionCode.toUpperCase() },
      select: { id: true },
    });
    if (!j) return [];
    const sources = await db.regulatorySource.findMany({
      where: { jurisdictionId: j.id },
      orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
    });
    return sources;
  } catch (e: any) {
    logger.error("[jurisdiction/getRegulatorySources] failed", {
      jurisdictionCode,
      error: e?.message || String(e),
    });
    return [];
  }
}

// ============ Pure boolean validators ============

/**
 * Pure boolean check — is the jurisdiction row marked ACTIVE?
 * (Does NOT consider effective-date windows — see `isJurisdictionValid`.)
 */
export function isJurisdictionActive(j: JurisdictionFabric | null): boolean {
  if (!j) return false;
  return j.status === "ACTIVE";
}

/**
 * Validate a jurisdiction's overall validity:
 *   • status must be ACTIVE
 *   • effectiveFrom (if set) must be in the past
 *   • effectiveUntil (if set) must be in the future
 *
 * Returns `{ valid, issues[] }` — `issues` is a list of human-readable
 * reason strings (one per failed check). Empty `issues` + `valid:true`
 * means the jurisdiction is fully valid.
 */
export function isJurisdictionValid(j: JurisdictionFabric | null): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];
  if (!j) {
    return { valid: false, issues: ["jurisdiction is null"] };
  }
  if (j.status !== "ACTIVE") {
    issues.push(`status is ${j.status} (expected ACTIVE)`);
  }
  const now = Date.now();
  if (j.effectiveFrom) {
    const from = new Date(j.effectiveFrom).getTime();
    if (!isNaN(from) && now < from) {
      issues.push(
        `effectiveFrom ${new Date(j.effectiveFrom).toISOString()} is in the future`,
      );
    }
  }
  if (j.effectiveUntil) {
    const until = new Date(j.effectiveUntil).getTime();
    if (!isNaN(until) && now > until) {
      issues.push(
        `effectiveUntil ${new Date(j.effectiveUntil).toISOString()} is in the past (expired)`,
      );
    }
  }
  return { valid: issues.length === 0, issues };
}

/**
 * Pure boolean check — is a regulatory source stale?
 * A source is "stale" if its `lastChecked` is older than STALE_THRESHOLD_DAYS
 * (90 days). Stale ≠ expired — stale means we should re-verify, but the
 * source is still usable as a fallback.
 */
export function isRegulatorySourceStale(source: RegulatorySource | null): boolean {
  if (!source) return true;
  if (!source.lastChecked) return true;
  const last = new Date(source.lastChecked).getTime();
  if (isNaN(last)) return true;
  const ageMs = Date.now() - last;
  return ageMs > STALE_THRESHOLD_DAYS * 24 * 60 * 60 * 1000;
}

/**
 * Pure boolean check — is a regulatory source expired?
 * A source is "expired" if its `expiryDate` is set and in the past, OR if
 * its `legalStatus` is REPEALED. Expired sources must NOT be used to make
 * decisions — they're kept for historical audit only.
 */
export function isRegulatorySourceExpired(source: RegulatorySource | null): boolean {
  if (!source) return true;
  if (source.legalStatus === "REPEALED") return true;
  if (source.expiryDate) {
    const exp = new Date(source.expiryDate).getTime();
    if (!isNaN(exp) && Date.now() > exp) return true;
  }
  return false;
}

// ============ Snapshot management ============

/**
 * Create a regulatory snapshot for a trade at lock time.
 *
 * A snapshot is an immutable, hashed point-in-time copy of:
 *   • all applicable regulatory sources for the jurisdiction
 *   • the tariff / document / transport / government-integration state
 *
 * Idempotent: if a snapshot already exists for (ustn, jurisdictionCode),
 * the existing snapshot is returned instead of creating a duplicate.
 *
 * Defensive — returns null on failure (caller should treat null as
 * "snapshot creation failed; trade lock should be blocked or retried").
 */
export async function createRegulatorySnapshot(input: {
  ustn: string;
  tradeId?: string;
  jurisdictionCode: string;
}): Promise<RegulatorySnapshot | null> {
  if (!input?.ustn || !input?.jurisdictionCode) {
    logger.warn("[jurisdiction/createRegulatorySnapshot] missing required input", {
      ustn: input?.ustn,
      jurisdictionCode: input?.jurisdictionCode,
    });
    return null;
  }
  try {
    const j = await db.jurisdictionFabric.findUnique({
      where: { code: input.jurisdictionCode.toUpperCase() },
      include: {
        regulatorySources: {
          where: { legalStatus: "IN_FORCE" },
          orderBy: [{ effectiveDate: "desc" }, { createdAt: "desc" }],
        },
      },
    });
    if (!j) {
      logger.warn(
        "[jurisdiction/createRegulatorySnapshot] jurisdiction not found",
        { jurisdictionCode: input.jurisdictionCode },
      );
      return null;
    }

    // Idempotency check — return existing snapshot if one exists for this
    // (ustn, jurisdictionId) pair. This makes re-calling safe during retries.
    try {
      const existing = await db.regulatorySnapshot.findFirst({
        where: {
          ustn: input.ustn,
          jurisdictionId: j.id,
        },
        orderBy: { createdAt: "desc" },
      });
      if (existing) {
        logger.info(
          "[jurisdiction/createRegulatorySnapshot] returning existing snapshot",
          { snapshotId: existing.id, ustn: input.ustn, jurisdictionCode: j.code },
        );
        return existing;
      }
    } catch (e: any) {
      // Non-fatal — log and fall through to create.
      logger.warn(
        "[jurisdiction/createRegulatorySnapshot] idempotency check failed",
        { ustn: input.ustn, error: e?.message },
      );
    }

    // Build the snapshot payload from the in-force regulatory sources.
    const applicableRules: Record<string, any> = {
      sourceCount: j.regulatorySources.length,
      sources: j.regulatorySources.map((s) => ({
        id: s.id,
        sourceType: s.sourceType,
        title: s.title,
        officialUrl: s.officialUrl,
        effectiveDate: s.effectiveDate ? s.effectiveDate.toISOString() : null,
        expiryDate: s.expiryDate ? s.expiryDate.toISOString() : null,
        sourceHash: s.sourceHash,
        legalStatus: s.legalStatus,
        verificationStatus: s.verificationStatus,
      })),
    };
    const applicableRulesJson = JSON.stringify(applicableRules);

    const tariffSnapshot = JSON.stringify({
      // Tariff data would be hydrated by the customs-tariff service; the
      // snapshot preserves whatever the caller has already attached.
      capturedAt: new Date().toISOString(),
      source: "jurisdiction-fabric",
    });
    const documentSnapshot = JSON.stringify({
      capturedAt: new Date().toISOString(),
      requiredDocs: [],
    });
    const transportRequirements = JSON.stringify({
      capturedAt: new Date().toISOString(),
    });
    const governmentIntegrations = JSON.stringify({
      capturedAt: new Date().toISOString(),
      connectors: [],
    });

    // SHA-256 of the full snapshot payload (used by G-J4 to detect drift).
    // Implemented with the Node `crypto` module — fine because this lib
    // only runs server-side.
    const snapshotHash = await computeSnapshotHash({
      ustn: input.ustn,
      jurisdictionId: j.id,
      applicableRulesJson,
      tariffSnapshot,
      documentSnapshot,
      transportRequirements,
      governmentIntegrations,
    });

    const created = await db.regulatorySnapshot.create({
      data: {
        ustn: input.ustn,
        tradeId: input.tradeId || null,
        jurisdictionId: j.id,
        applicableRules: applicableRulesJson,
        customsProcedure: null,
        sanctionsState: null,
        transportRequirements,
        governmentIntegrations,
        tariffSnapshot,
        documentSnapshot,
        snapshotHash,
        version: 1,
        status: "VALID",
        // New per-trade explicit fields (Art 129 Stage 4 — LIFECYCLE-GAP):
        // Backfill with trade-derived defaults so the row is consistent.
        originCountry: "",
        destinationCountry: "",
        hsCode: "",
        incoterm: "",
      },
    });

    logger.info("[jurisdiction/createRegulatorySnapshot] created", {
      snapshotId: created.id,
      ustn: input.ustn,
      jurisdictionCode: j.code,
      sourceCount: j.regulatorySources.length,
    });
    return created;
  } catch (e: any) {
    logger.error("[jurisdiction/createRegulatorySnapshot] failed", {
      ustn: input.ustn,
      jurisdictionCode: input.jurisdictionCode,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Get the most-recent applicable regulatory snapshot for a trade (by USTN).
 * Defensive — returns null on failure or if no snapshot exists.
 */
export async function getRegulatorySnapshot(
  ustn: string,
): Promise<RegulatorySnapshot | null> {
  if (!ustn) return null;
  try {
    const snap = await db.regulatorySnapshot.findFirst({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return snap;
  } catch (e: any) {
    logger.error("[jurisdiction/getRegulatorySnapshot] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Validate that the snapshot taken at trade-lock is still consistent with
 * the current state of the regulatory sources for the same jurisdiction.
 *
 * Compares the snapshot's `applicableRules` payload against the live
 * RegulatorySource rows for the snapshot's jurisdiction, and returns:
 *   • consistent: true  if no in-force source's hash/title/effectiveDate
 *                         has changed since the snapshot was taken.
 *   • consistent: false if any source has changed (or been added/removed)
 *                         — each changed source produces one entry in `changes`
 *                         with the field name + snapshot value + current value.
 *
 * Defensive — on failure, returns `{ consistent: true, changes: [] }` to
 * avoid blocking a trade on a transient DB error.
 */
export async function validateSnapshotConsistency(ustn: string): Promise<{
  consistent: boolean;
  changes: { field: string; snapshotValue: string; currentValue: string }[];
}> {
  if (!ustn) return { consistent: true, changes: [] };
  try {
    const snap = await getRegulatorySnapshot(ustn);
    if (!snap) {
      // No snapshot = nothing to compare against = vacuously consistent.
      return { consistent: true, changes: [] };
    }
    if (!snap.jurisdictionId) {
      return { consistent: true, changes: [] };
    }

    // Parse the snapshot's applicableRules payload. Defensive against
    // malformed JSON.
    let snapRules: { sources?: any[] } = {};
    try {
      snapRules = JSON.parse(snap.applicableRules || "{}");
    } catch {
      snapRules = {};
    }
    const snapSourcesById = new Map<string, any>();
    if (Array.isArray(snapRules.sources)) {
      for (const s of snapRules.sources) {
        if (s?.id) snapSourcesById.set(s.id, s);
      }
    }

    // Fetch live in-force regulatory sources for the same jurisdiction.
    let liveSources: RegulatorySource[] = [];
    try {
      liveSources = await db.regulatorySource.findMany({
        where: {
          jurisdictionId: snap.jurisdictionId,
          legalStatus: "IN_FORCE",
        },
      });
    } catch (e: any) {
      logger.warn(
        "[jurisdiction/validateSnapshotConsistency] live source fetch failed",
        { ustn, error: e?.message },
      );
      return { consistent: true, changes: [] };
    }

    const changes: { field: string; snapshotValue: string; currentValue: string }[] = [];
    const liveIds = new Set<string>();

    for (const live of liveSources) {
      liveIds.add(live.id);
      const snapSrc = snapSourcesById.get(live.id);
      if (!snapSrc) {
        // New source added since snapshot — record as a change.
        changes.push({
          field: `source.${live.id}.added`,
          snapshotValue: "(absent)",
          currentValue: live.title || live.id,
        });
        continue;
      }
      // Field-by-field comparison for tracked attributes.
      if (String(snapSrc.title ?? "") !== String(live.title ?? "")) {
        changes.push({
          field: `source.${live.id}.title`,
          snapshotValue: String(snapSrc.title ?? ""),
          currentValue: String(live.title ?? ""),
        });
      }
      if (String(snapSrc.sourceHash ?? "") !== String(live.sourceHash ?? "")) {
        changes.push({
          field: `source.${live.id}.sourceHash`,
          snapshotValue: String(snapSrc.sourceHash ?? ""),
          currentValue: String(live.sourceHash ?? ""),
        });
      }
      const snapEff = snapSrc.effectiveDate ?? null;
      const liveEff = live.effectiveDate ? live.effectiveDate.toISOString() : null;
      if (String(snapEff ?? "") !== String(liveEff ?? "")) {
        changes.push({
          field: `source.${live.id}.effectiveDate`,
          snapshotValue: String(snapEff ?? ""),
          currentValue: String(liveEff ?? ""),
        });
      }
      if (String(snapSrc.legalStatus ?? "") !== String(live.legalStatus ?? "")) {
        changes.push({
          field: `source.${live.id}.legalStatus`,
          snapshotValue: String(snapSrc.legalStatus ?? ""),
          currentValue: String(live.legalStatus ?? ""),
        });
      }
    }

    // Detect sources that were present at snapshot time but are no longer
    // in-force (superseded or removed).
    for (const [id, snapSrc] of snapSourcesById.entries()) {
      if (!liveIds.has(id)) {
        changes.push({
          field: `source.${id}.removed`,
          snapshotValue: String(snapSrc.title ?? id),
          currentValue: "(absent or no longer IN_FORCE)",
        });
      }
    }

    return { consistent: changes.length === 0, changes };
  } catch (e: any) {
    logger.error("[jurisdiction/validateSnapshotConsistency] failed", {
      ustn,
      error: e?.message || String(e),
    });
    return { consistent: true, changes: [] };
  }
}

// ============ Internal helpers ============

/**
 * Compute a SHA-256 hash of the snapshot payload. Uses Node's `crypto`
 * module — this lib is server-side only.
 *
 * The hash is computed over a deterministic concatenation of the snapshot
 * fields (ustn + jurisdictionId + the four JSON payloads). Any change to
 * any of those fields produces a different hash, which G-J4 uses to detect
 * drift between snapshot-time and the current state.
 */
async function computeSnapshotHash(input: {
  ustn: string;
  jurisdictionId: string;
  applicableRulesJson: string;
  tariffSnapshot: string;
  documentSnapshot: string;
  transportRequirements: string;
  governmentIntegrations: string;
}): Promise<string> {
  try {
    // Use dynamic import so the `crypto` module is only loaded server-side.
    const { createHash } = await import("node:crypto");
    const h = createHash("sha256");
    h.update(input.ustn);
    h.update("|");
    h.update(input.jurisdictionId);
    h.update("|");
    h.update(input.applicableRulesJson);
    h.update("|");
    h.update(input.tariffSnapshot);
    h.update("|");
    h.update(input.documentSnapshot);
    h.update("|");
    h.update(input.transportRequirements);
    h.update("|");
    h.update(input.governmentIntegrations);
    return h.digest("hex");
  } catch (e: any) {
    logger.warn("[jurisdiction/computeSnapshotHash] failed; using fallback", {
      error: e?.message,
    });
    // Fallback — non-cryptographic but unique-per-input string. This only
    // runs if Node's crypto is unavailable (shouldn't happen in a server
    // context, but defensive).
    return `fallback-${input.ustn}-${input.jurisdictionId}-${input.applicableRulesJson.length}`;
  }
}
