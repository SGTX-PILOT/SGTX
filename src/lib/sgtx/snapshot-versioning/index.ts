// @ts-nocheck
/**
 * SGTX Phase 9 — §5 Trade Snapshot Versioning
 * ===========================================================================
 *
 * Implements the trade snapshot versioning layer on top of the
 * `RegulatorySnapshotVersion` Prisma model (schema line 7429).
 *
 * §5 — Existing locked trades retain their original regulatory snapshot;
 * future trades use the new version.
 *
 * Each regulatory change (Phase 9 §2) creates a new snapshot version when
 * it is COMPILED (Phase 9 §4). The new version becomes ACTIVE for future
 * trades when the change is DEPLOYED. Existing trades that are LOCKED (Phase
 * 4 contract locked) at the time of deployment retain the version that was
 * ACTIVE at their lock time — they continue to be evaluated under their
 * original regulatory rules even after new versions are deployed.
 *
 * The 3 snapshot policies (§5 — on the parent RegulatoryChangeV2):
 *
 *   PRESERVE_EXISTING — existing locked trades retain their original
 *                       snapshot; future trades use the new version
 *                       (default).
 *   RETROACTIVE        — existing trades MUST be re-evaluated against the
 *                       new rules (e.g. a sanctions update — existing
 *                       trades are immediately non-compliant if they
 *                       now match a sanctions list).
 *   TRANSITIONAL      — existing trades get a grace period during which
 *                       they can be brought into compliance with the new
 *                       rule; future trades use the new version
 *                       immediately.
 *
 * `getSnapshotForTrade(ustn)` is the §5 CRITICAL function — it returns the
 * snapshot version for a specific trade. If the trade is LOCKED, it returns
 * the version at lock time; else it returns the current ACTIVE version.
 *
 * The lock association is stored on the Trade row (via `globalNotes` marker
 * — see `lockTradeToVersion`). If the Trade model gains a
 * `regulatorySnapshotVersionId` column in the future, that field is
 * preferred automatically.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes. Pure helpers
 * (`computeSnapshotHash`, `generateVersionId`, `isVersionActive`,
 * `compareVersions`) have no DB calls + no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §5 Constants ============

/**
 * The 3 snapshot version statuses (§5).
 *
 *   ACTIVE     — the version is the current regulatory snapshot for its
 *                jurisdiction. Only ONE ACTIVE version per jurisdiction at
 *                a time (enforced by `activateVersion`).
 *   SUPERSEDED — the version was ACTIVE but has been replaced by a newer
 *                version (`supersededByVersion` points to the new one).
 *                Existing locked trades pinned to this version continue
 *                to use it.
 *   ARCHIVED   — the version is no longer in use (e.g. the change was
 *                rolled back). Kept for audit history.
 */
export const SNAPSHOT_VERSION_STATUSES = [
  "ACTIVE",
  "SUPERSEDED",
  "ARCHIVED",
] as const;

/**
 * The marker prefix used to store a snapshot version lock on a Trade row's
 * `globalNotes` field. Format: `[RSV-LOCK:RSV-YYYYMMDD-NNNNN]`. This is a
 * pragmatic storage mechanism until the Trade model gains a dedicated
 * `regulatorySnapshotVersionId` column.
 */
export const RSV_LOCK_MARKER_PREFIX = "[RSV-LOCK:";
export const RSV_LOCK_MARKER_SUFFIX = "]";

/**
 * Regex that extracts a versionId from a Trade.globalNotes string. Matches
 * the format `RSV-YYYYMMDD-NNNNN` (5-digit zero-padded suffix).
 */
const RSV_ID_REGEX = /RSV-\d{8}-\d{5}/;

// ============ Types ============

export interface RegulatorySnapshotVersion {
  id: string;
  versionId: string;
  changeId?: string | null;
  jurisdictionCode: string;
  versionNumber: number;
  snapshotContent?: string | null;
  snapshotHash?: string | null;
  activeTradesUsingThisVersion: number;
  status: string;
  supersededByVersion?: string | null;
  effectiveDate?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSnapshotInput {
  /** The changeId (RCG-…) that created this version. Optional (manual versions). */
  changeId?: string | null;
  /** ISO alpha-2 country / customs territory code. */
  jurisdictionCode: string;
  /**
   * The snapshot content — a JSON-serializable object representing the
   * full regulatory state at this version (tariff rates, document
   * requirements, SPS rules, etc.). Will be JSON.stringified before
   * storage. If omitted, `snapshotContent` is null.
   */
  snapshotContent?: any;
  /** Optional effective date (defaults to now). */
  effectiveDate?: Date;
  /**
   * Initial status. Defaults to "ACTIVE". Use "DRAFT" to create a pending
   * version that is later activated via `activateVersion`.
   */
  status?: string;
}

export interface ListSnapshotVersionsFilters {
  jurisdictionCode?: string;
  changeId?: string;
  status?: string;
}

export interface VersionComparison {
  sameContent: boolean;
  hashMatch: boolean;
  versionDiff: number;
}

// ============ §5.0 Pure helpers ============

/**
 * Pure: generate a `RSV-YYYYMMDD-NNNNN` version id. 5-digit zero-padded
 * random suffix per UTC day. No DB, no side effects.
 */
export function generateVersionId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `RSV-${ymd}-${n}`;
}

/**
 * Pure: compute the SHA-256 hash of the snapshot content. The content is
 * canonicalized (sorted keys, deterministic JSON) before hashing so the
 * same content always produces the same hash. Returns the hex-encoded
 * digest. No DB, no side effects (other than reading the crypto module).
 *
 * Returns an empty string on null/undefined input.
 */
export function computeSnapshotHash(content: any): string {
  if (content === null || content === undefined) return "";
  let cryptoMod: any;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cryptoMod = require("node:crypto");
  } catch {
    // Bun/edge fallback — use the global Web Crypto API if available.
    // Synchronous SHA-256 isn't available via WebCrypto, so we fall back
    // to a simple non-crypto hash (FNV-1a). This is acceptable for
    // snapshot-versioning use cases where the hash is for change-detection,
    // not cryptographic integrity.
    return fnv1aHash(JSON.stringify(content));
  }
  const shasum = cryptoMod.createHash("sha256");
  let canonical: string;
  if (typeof content === "string") {
    // Try to parse + re-canonicalize. If parsing fails, hash the raw string.
    try {
      const parsed = JSON.parse(content);
      canonical = canonicalJson(parsed);
    } catch {
      canonical = content;
    }
  } else if (typeof content === "object") {
    canonical = canonicalJson(content);
  } else {
    canonical = String(content);
  }
  shasum.update(canonical, "utf8");
  return shasum.digest("hex");
}

/**
 * Pure: canonical JSON serialization with sorted keys (stable output).
 * Recursively sorts object keys at every depth. No DB, no side effects.
 */
function canonicalJson(value: any): string {
  if (value === null || value === undefined) return "null";
  if (typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalJson).join(",") + "]";
  }
  const keys = Object.keys(value).sort();
  const pairs = keys.map(
    (k) => JSON.stringify(k) + ":" + canonicalJson(value[k]),
  );
  return "{" + pairs.join(",") + "}";
}

/**
 * Pure: FNV-1a 32-bit hash (fallback when node:crypto is unavailable).
 * Returns an 8-char hex string. Not cryptographic — used only for
 * change-detection. No DB, no side effects.
 */
function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash + ((hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24))) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * Pure: true if the snapshot version's status is ACTIVE. No DB, no side
 * effects. Defensive against null/undefined input.
 */
export function isVersionActive(
  version: RegulatorySnapshotVersion | null | undefined,
): boolean {
  if (!version) return false;
  return String(version.status || "").toUpperCase() === "ACTIVE";
}

/**
 * Pure: compare two snapshot versions. Returns whether the content is the
 * same, whether the hashes match, and the version-number difference
 * (versionA.versionNumber - versionB.versionNumber). No DB, no side
 * effects. Defensive against null/undefined input — returns
 * `{ sameContent: false, hashMatch: false, versionDiff: 0 }` if either
 * input is missing.
 */
export function compareVersions(
  versionA: RegulatorySnapshotVersion | null | undefined,
  versionB: RegulatorySnapshotVersion | null | undefined,
): VersionComparison {
  if (!versionA || !versionB) {
    return { sameContent: false, hashMatch: false, versionDiff: 0 };
  }
  const hashA = String(versionA.snapshotHash || "");
  const hashB = String(versionB.snapshotHash || "");
  const hashMatch = !!hashA && !!hashB && hashA === hashB;
  // sameContent: hashes match (preferred) OR raw content strings match.
  const contentA = String(versionA.snapshotContent || "");
  const contentB = String(versionB.snapshotContent || "");
  const sameContent = hashMatch || (!!contentA && contentA === contentB);
  const versionDiff =
    Number(versionA.versionNumber || 0) - Number(versionB.versionNumber || 0);
  return { sameContent, hashMatch, versionDiff };
}

/**
 * Pure: extract the locked versionId marker from a Trade.globalNotes
 * string. Returns the versionId (`RSV-YYYYMMDD-NNNNN`) or null if no
 * marker is present. No DB, no side effects.
 */
export function extractLockedVersionId(globalNotes: unknown): string | null {
  if (!globalNotes || typeof globalNotes !== "string") return null;
  const match = globalNotes.match(RSV_ID_REGEX);
  return match ? match[0] : null;
}

/**
 * Pure: build a Trade.globalNotes string that includes the RSV-LOCK
 * marker for the given versionId. Preserves any existing notes content
 * (appends the marker if not already present). No DB, no side effects.
 */
export function buildLockedGlobalNotes(
  existingNotes: string | null | undefined,
  versionId: string,
): string {
  if (!versionId) return existingNotes || "";
  const marker = `${RSV_LOCK_MARKER_PREFIX}${versionId}${RSV_LOCK_MARKER_SUFFIX}`;
  if (existingNotes && existingNotes.includes(marker)) {
    return existingNotes;
  }
  // Remove any pre-existing RSV-LOCK marker (different version) — only
  // one lock marker is kept at a time.
  let cleaned = existingNotes || "";
  if (cleaned) {
    cleaned = cleaned
      .replace(
        new RegExp(
          `\\${RSV_LOCK_MARKER_PREFIX}[^${RSV_LOCK_MARKER_SUFFIX}]*\\${RSV_LOCK_MARKER_SUFFIX}`,
          "g",
        ),
        "",
      )
      .trim();
  }
  return cleaned ? `${cleaned}\n${marker}` : marker;
}

// ============ §5.1 createSnapshotVersion ============

/**
 * Create a new regulatory snapshot version. Generates a `versionId`
 * (`RSV-YYYYMMDD-NNNNN`), increments the `versionNumber` for the
 * jurisdiction (highest existing versionNumber + 1, starting at 1),
 * and computes the `snapshotHash` (SHA-256 of the snapshotContent).
 *
 * The version is created with `status="ACTIVE"` by default (per the
 * schema default). Use `input.status` to override (e.g. "DRAFT"). To
 * formally supersede the previous ACTIVE version for the jurisdiction,
 * call `activateVersion(versionId)` after creation.
 *
 * Throws on invalid input. Throws on DB error.
 */
export async function createSnapshotVersion(
  input: CreateSnapshotInput,
): Promise<RegulatorySnapshotVersion> {
  if (!input) {
    throw new Error("[snapshot-versioning] input is required");
  }
  if (!input.jurisdictionCode) {
    throw new Error("[snapshot-versioning] jurisdictionCode is required");
  }
  const jurisdictionCode = String(input.jurisdictionCode)
    .toUpperCase()
    .trim();
  if (!jurisdictionCode) {
    throw new Error("[snapshot-versioning] jurisdictionCode is empty");
  }
  const versionId = generateVersionId();
  // Compute the next versionNumber for this jurisdiction.
  let nextVersionNumber = 1;
  try {
    const latest = await db.regulatorySnapshotVersion.findFirst({
      where: { jurisdictionCode },
      orderBy: { versionNumber: "desc" },
      select: { versionNumber: true },
    });
    if (latest && typeof latest.versionNumber === "number") {
      nextVersionNumber = latest.versionNumber + 1;
    }
  } catch (err) {
    logger.error(
      "[snapshot-versioning] createSnapshotVersion versionNumber lookup failed (defaulting to 1)",
      {
        error: String(err),
        jurisdictionCode,
      },
    );
  }
  // Serialize + hash the snapshot content.
  const contentSerialized =
    input.snapshotContent === undefined || input.snapshotContent === null
      ? null
      : typeof input.snapshotContent === "string"
        ? input.snapshotContent
        : JSON.stringify(input.snapshotContent);
  const snapshotHash = contentSerialized
    ? computeSnapshotHash(contentSerialized)
    : null;
  const status = input.status || "ACTIVE";
  try {
    const created = await db.regulatorySnapshotVersion.create({
      data: {
        versionId,
        changeId: input.changeId || null,
        jurisdictionCode,
        versionNumber: nextVersionNumber,
        snapshotContent: contentSerialized,
        snapshotHash,
        status,
        effectiveDate: input.effectiveDate || null,
      },
    });
    logger.info("[snapshot-versioning] snapshot version created", {
      versionId,
      jurisdictionCode,
      versionNumber: nextVersionNumber,
      changeId: input.changeId || null,
      status,
      hash: snapshotHash ? snapshotHash.slice(0, 12) + "…" : null,
    });
    return created as RegulatorySnapshotVersion;
  } catch (err) {
    logger.error("[snapshot-versioning] createSnapshotVersion DB error", {
      error: String(err),
      versionId,
      jurisdictionCode,
    });
    throw err;
  }
}

// ============ §5.2 getSnapshotVersion ============

/**
 * Get a snapshot version by its business `versionId`
 * (`RSV-YYYYMMDD-NNNNN`). Returns null if not found or on DB error. Never
 * throws.
 */
export async function getSnapshotVersion(
  versionId: string,
): Promise<RegulatorySnapshotVersion | null> {
  if (!versionId) return null;
  try {
    const row = await db.regulatorySnapshotVersion.findUnique({
      where: { versionId },
    });
    return (row as RegulatorySnapshotVersion | null) || null;
  } catch (err) {
    logger.error("[snapshot-versioning] getSnapshotVersion DB error", {
      error: String(err),
      versionId,
    });
    return null;
  }
}

// ============ §5.3 getActiveVersion ============

/**
 * Get the current ACTIVE snapshot version for a jurisdiction. If multiple
 * ACTIVE versions exist (a transitional state during deployment), the
 * newest by `versionNumber` is returned. Returns null if no ACTIVE
 * version exists for the jurisdiction or on DB error. Never throws.
 */
export async function getActiveVersion(
  jurisdictionCode: string,
): Promise<RegulatorySnapshotVersion | null> {
  const jc = String(jurisdictionCode || "").toUpperCase().trim();
  if (!jc) return null;
  try {
    const row = await db.regulatorySnapshotVersion.findFirst({
      where: { jurisdictionCode: jc, status: "ACTIVE" },
      orderBy: [{ versionNumber: "desc" }, { createdAt: "desc" }],
    });
    return (row as RegulatorySnapshotVersion | null) || null;
  } catch (err) {
    logger.error("[snapshot-versioning] getActiveVersion DB error", {
      error: String(err),
      jurisdictionCode: jc,
    });
    return null;
  }
}

// ============ §5.4 listSnapshotVersions ============

/**
 * List snapshot versions with optional filters. Returns [] on DB error.
 * Never throws. Ordered by versionNumber descending (newest first).
 */
export async function listSnapshotVersions(
  filters?: ListSnapshotVersionsFilters,
): Promise<RegulatorySnapshotVersion[]> {
  const where: Record<string, unknown> = {};
  if (filters?.jurisdictionCode) {
    where.jurisdictionCode = String(filters.jurisdictionCode)
      .toUpperCase()
      .trim();
  }
  if (filters?.changeId) where.changeId = filters.changeId;
  if (filters?.status) where.status = filters.status;
  try {
    const rows = await db.regulatorySnapshotVersion.findMany({
      where,
      orderBy: [{ versionNumber: "desc" }],
    });
    return (rows as RegulatorySnapshotVersion[]) || [];
  } catch (err) {
    logger.error("[snapshot-versioning] listSnapshotVersions DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §5.5 getVersionByNumber ============

/**
 * Get a snapshot version by jurisdiction + version number. Returns null
 * if not found or on DB error. Never throws.
 */
export async function getVersionByNumber(
  jurisdictionCode: string,
  versionNumber: number,
): Promise<RegulatorySnapshotVersion | null> {
  const jc = String(jurisdictionCode || "").toUpperCase().trim();
  if (!jc) return null;
  const vn = Number(versionNumber);
  if (!Number.isFinite(vn) || vn < 1) return null;
  try {
    const row = await db.regulatorySnapshotVersion.findFirst({
      where: { jurisdictionCode: jc, versionNumber: vn },
    });
    return (row as RegulatorySnapshotVersion | null) || null;
  } catch (err) {
    logger.error("[snapshot-versioning] getVersionByNumber DB error", {
      error: String(err),
      jurisdictionCode: jc,
      versionNumber: vn,
    });
    return null;
  }
}

// ============ §5.6 activateVersion ============

/**
 * Activate a snapshot version. Marks the specified version ACTIVE +
 * supersedes the previous ACTIVE version for the same jurisdiction
 * (sets its `status=SUPERSEDED` + `supersededByVersion` to the new
 * versionId). If the version is already ACTIVE, the supersession of the
 * previous ACTIVE version is still performed (idempotent).
 *
 * Throws if the version is not found. Throws on DB error.
 */
export async function activateVersion(
  versionId: string,
): Promise<RegulatorySnapshotVersion> {
  if (!versionId) {
    throw new Error("[snapshot-versioning] versionId is required");
  }
  const version = await getSnapshotVersion(versionId);
  if (!version) {
    throw new Error(
      `[snapshot-versioning] snapshot version not found: ${versionId}`,
    );
  }
  const jc = version.jurisdictionCode;
  // Find the previous ACTIVE version (excluding the one we're activating).
  let previousActiveId: string | null = null;
  try {
    const prev = await db.regulatorySnapshotVersion.findFirst({
      where: {
        jurisdictionCode: jc,
        status: "ACTIVE",
        versionId: { not: versionId },
      },
      orderBy: [{ versionNumber: "desc" }],
    });
    if (prev) {
      previousActiveId = prev.versionId;
    }
  } catch (err) {
    logger.error(
      "[snapshot-versioning] activateVersion previous-active lookup failed",
      {
        error: String(err),
        versionId,
        jurisdictionCode: jc,
      },
    );
  }
  // Supersede the previous ACTIVE version (if any).
  if (previousActiveId) {
    try {
      await db.regulatorySnapshotVersion.update({
        where: { versionId: previousActiveId },
        data: {
          status: "SUPERSEDED",
          supersededByVersion: versionId,
        },
      });
      logger.info(
        "[snapshot-versioning] previous ACTIVE version superseded",
        {
          previousVersionId: previousActiveId,
          newVersionId: versionId,
          jurisdictionCode: jc,
        },
      );
    } catch (err) {
      logger.error(
        "[snapshot-versioning] activateVersion supersede failed (non-fatal)",
        {
          error: String(err),
          previousVersionId: previousActiveId,
          newVersionId: versionId,
        },
      );
    }
  }
  // Activate the target version.
  try {
    const updated = await db.regulatorySnapshotVersion.update({
      where: { versionId },
      data: { status: "ACTIVE" },
    });
    logger.info("[snapshot-versioning] snapshot version activated", {
      versionId,
      jurisdictionCode: jc,
      versionNumber: version.versionNumber,
      supersededPrevious: previousActiveId,
    });
    return updated as RegulatorySnapshotVersion;
  } catch (err) {
    logger.error("[snapshot-versioning] activateVersion DB error", {
      error: String(err),
      versionId,
    });
    throw err;
  }
}

// ============ §5.7 archiveVersion ============

/**
 * Archive a snapshot version (status → ARCHIVED). Archived versions are
 * kept for audit history but are no longer ACTIVE or superseding. Existing
 * locked trades pinned to an archived version continue to use it (their
 * `getSnapshotForTrade` lookup still resolves to the archived version via
 * the lock marker).
 *
 * Throws if the version is not found. Throws on DB error.
 */
export async function archiveVersion(
  versionId: string,
): Promise<RegulatorySnapshotVersion> {
  if (!versionId) {
    throw new Error("[snapshot-versioning] versionId is required");
  }
  const version = await getSnapshotVersion(versionId);
  if (!version) {
    throw new Error(
      `[snapshot-versioning] snapshot version not found: ${versionId}`,
    );
  }
  try {
    const updated = await db.regulatorySnapshotVersion.update({
      where: { versionId },
      data: { status: "ARCHIVED" },
    });
    logger.info("[snapshot-versioning] snapshot version archived", {
      versionId,
      jurisdictionCode: version.jurisdictionCode,
      previousStatus: version.status,
    });
    return updated as RegulatorySnapshotVersion;
  } catch (err) {
    logger.error("[snapshot-versioning] archiveVersion DB error", {
      error: String(err),
      versionId,
    });
    throw err;
  }
}

// ============ §5.8 getSnapshotForTrade (§5 CRITICAL) ============

/**
 * §5 CRITICAL: get the snapshot version for a specific trade.
 *
 * If the trade is LOCKED (Phase 4 contract locked — TradeContract row with
 * status indicating LOCKED or SIGNED, OR a Trade.globalNotes RSV-LOCK
 * marker exists), return the version that was active at lock time
 * (i.e. the versionId stored in the lock marker — or, if not stored, the
 * version that was ACTIVE when the contract was signed).
 *
 * If the trade is new/future (no lock, no contract signed), return the
 * current ACTIVE version for the trade's jurisdiction (originCountry
 * preferred, falling back to destCountry).
 *
 * Returns null if the trade is not found, no ACTIVE version exists for
 * the jurisdiction, or on DB error. Never throws.
 */
export async function getSnapshotForTrade(
  ustn: string,
): Promise<RegulatorySnapshotVersion | null> {
  if (!ustn) return null;
  // 1. Load the Trade row.
  let trade: any = null;
  try {
    trade = await db.trade.findUnique({ where: { ustn } });
  } catch (err) {
    logger.error(
      "[snapshot-versioning] getSnapshotForTrade trade lookup failed",
      { error: String(err), ustn },
    );
    return null;
  }
  if (!trade) {
    // No trade row — return null (no snapshot for an unknown trade).
    return null;
  }
  // 2. If the trade has a regulatorySnapshotVersionId field (future
  //    schema), use it directly.
  const directVersionId = (trade as any).regulatorySnapshotVersionId;
  if (directVersionId && typeof directVersionId === "string") {
    const v = await getSnapshotVersion(directVersionId);
    if (v) return v;
  }
  // 3. Check the Trade.globalNotes for an RSV-LOCK marker.
  const lockedVersionId = extractLockedVersionId(trade.globalNotes);
  if (lockedVersionId) {
    const v = await getSnapshotVersion(lockedVersionId);
    if (v) return v;
  }
  // 4. Check whether the trade is LOCKED via TradeContract (Phase 4).
  //    A signed/locked contract means the trade is locked → use the
  //    version that was ACTIVE at signedAt time.
  let contractSignedAt: Date | null = null;
  try {
    const contract = await db.tradeContract.findFirst({
      where: { ustn },
      orderBy: { signedAt: "desc" },
    });
    if (contract && contract.signedAt) {
      contractSignedAt = contract.signedAt;
    }
  } catch (err) {
    logger.error(
      "[snapshot-versioning] getSnapshotForTrade contract lookup failed",
      { error: String(err), ustn },
    );
  }
  // Determine the jurisdiction for the trade (originCountry preferred).
  const jurisdictionCode = String(
    trade.originCountry || trade.destCountry || "",
  )
    .toUpperCase()
    .trim();
  if (!jurisdictionCode) return null;
  // 5. If the trade is locked (contract signed), find the version that was
  //    ACTIVE at lock time (most recent version created at/before signedAt).
  if (contractSignedAt) {
    try {
      const vAtLock = await db.regulatorySnapshotVersion.findFirst({
        where: {
          jurisdictionCode,
          createdAt: { lte: contractSignedAt },
        },
        orderBy: [{ versionNumber: "desc" }],
      });
      if (vAtLock) {
        return vAtLock as RegulatorySnapshotVersion;
      }
    } catch (err) {
      logger.error(
        "[snapshot-versioning] getSnapshotForTrade historical version lookup failed",
        { error: String(err), ustn, jurisdictionCode, contractSignedAt },
      );
    }
  }
  // 6. Default: return the current ACTIVE version for the jurisdiction.
  return getActiveVersion(jurisdictionCode);
}

// ============ §5.9 lockTradeToVersion ============

/**
 * Lock a trade to a specific snapshot version. This is called when a trade
 * is locked (Phase 4 contract/lock) — the trade retains this version even
 * after new versions are deployed.
 *
 * Stores the versionId on the Trade row's `globalNotes` field as a marker
 * (`[RSV-LOCK:RSV-YYYYMMDD-NNNNN]`). If the Trade model gains a
 * `regulatorySnapshotVersionId` column in the future, that field is
 * preferred automatically (the lookup in `getSnapshotForTrade` checks it
 * first).
 *
 * Also increments the version's `activeTradesUsingThisVersion` counter.
 *
 * Throws if the trade or version is not found. Throws on DB error.
 */
export async function lockTradeToVersion(
  ustn: string,
  versionId: string,
): Promise<void> {
  if (!ustn) {
    throw new Error("[snapshot-versioning] ustn is required");
  }
  if (!versionId) {
    throw new Error("[snapshot-versioning] versionId is required");
  }
  // Verify the version exists.
  const version = await getSnapshotVersion(versionId);
  if (!version) {
    throw new Error(
      `[snapshot-versioning] snapshot version not found: ${versionId}`,
    );
  }
  // Load the Trade row to read the existing globalNotes.
  let trade: any = null;
  try {
    trade = await db.trade.findUnique({
      where: { ustn },
      select: { ustn: true, globalNotes: true },
    });
  } catch (err) {
    logger.error(
      "[snapshot-versioning] lockTradeToVersion trade lookup failed",
      { error: String(err), ustn },
    );
    throw err;
  }
  if (!trade) {
    throw new Error(`[snapshot-versioning] trade not found: ${ustn}`);
  }
  // Build the new globalNotes string with the lock marker.
  const newNotes = buildLockedGlobalNotes(trade.globalNotes, versionId);
  try {
    await db.trade.update({
      where: { ustn },
      data: { globalNotes: newNotes },
    });
    // Increment the version's activeTradesUsingThisVersion counter.
    try {
      await db.regulatorySnapshotVersion.update({
        where: { versionId },
        data: { activeTradesUsingThisVersion: { increment: 1 } },
      });
    } catch (countErr) {
      logger.error(
        "[snapshot-versioning] lockTradeToVersion counter increment failed (non-fatal)",
        { error: String(countErr), versionId, ustn },
      );
    }
    logger.info("[snapshot-versioning] trade locked to version", {
      ustn,
      versionId,
      jurisdictionCode: version.jurisdictionCode,
    });
  } catch (err) {
    logger.error("[snapshot-versioning] lockTradeToVersion DB error", {
      error: String(err),
      ustn,
      versionId,
    });
    throw err;
  }
}

// ============ §5.10 getTradesByVersion ============

/**
 * Get the USTNs of all trades locked to a specific snapshot version.
 * Performs a substring search on `Trade.globalNotes` for the RSV-LOCK
 * marker containing the versionId. Returns [] on DB error or if no
 * trades are locked to the version. Never throws.
 *
 * NOTE: this is a substring search — for very large trade volumes, a
 * dedicated `regulatorySnapshotVersionId` column on the Trade model
 * would be more efficient (TODO: schema migration).
 */
export async function getTradesByVersion(
  versionId: string,
): Promise<string[]> {
  if (!versionId) return [];
  const marker = `${RSV_LOCK_MARKER_PREFIX}${versionId}${RSV_LOCK_MARKER_SUFFIX}`;
  try {
    const rows = await db.trade.findMany({
      where: { globalNotes: { contains: versionId } },
      select: { ustn: true, globalNotes: true },
    });
    // Filter to ensure the marker is exactly the lock marker (not a
    // coincidental substring match).
    const ustns: string[] = [];
    for (const r of rows) {
      const notes = String(r.globalNotes || "");
      if (
        notes.includes(marker) ||
        extractLockedVersionId(notes) === versionId
      ) {
        ustns.push(r.ustn);
      }
    }
    return ustns;
  } catch (err) {
    logger.error("[snapshot-versioning] getTradesByVersion DB error", {
      error: String(err),
      versionId,
    });
    return [];
  }
}

// ============ §5.11 incrementActiveTradeCount ============

/**
 * Increment the `activeTradesUsingThisVersion` counter on a snapshot
 * version. Called when a new trade is created on this version (the trade
 * will use this version until either the trade is locked or a newer
 * version is deployed + the trade is not yet locked).
 *
 * Never throws — errors are logged.
 */
export async function incrementActiveTradeCount(
  versionId: string,
): Promise<void> {
  if (!versionId) return;
  try {
    await db.regulatorySnapshotVersion.update({
      where: { versionId },
      data: { activeTradesUsingThisVersion: { increment: 1 } },
    });
    logger.info(
      "[snapshot-versioning] active trade count incremented",
      { versionId },
    );
  } catch (err) {
    logger.error(
      "[snapshot-versioning] incrementActiveTradeCount DB error",
      { error: String(err), versionId },
    );
  }
}

// ============ §5.12 Reactivate previous version (rollback helper) ============

/**
 * Reactivate the previous ACTIVE version for a jurisdiction — used by the
 * change-approval `rollbackChange` flow. Given the versionId that was
 * deployed by a change that is now being rolled back, finds the version it
 * superseded (`supersededByVersion` reverse lookup) + reactivates it. The
 * rolled-back version is archived (status → ARCHIVED).
 *
 * Returns the reactivated previous version, or null if no previous
 * version exists (the jurisdiction will have no ACTIVE version after
 * rollback). Never throws — errors are logged.
 *
 * This is an internal helper, exported for the change-approval lib +
 * admin portal use.
 */
export async function reactivatePreviousVersion(
  versionId: string,
): Promise<RegulatorySnapshotVersion | null> {
  if (!versionId) return null;
  const version = await getSnapshotVersion(versionId);
  if (!version) return null;
  const jc = version.jurisdictionCode;
  // Find the version this one superseded (the one whose
  // supersededByVersion === versionId).
  let previousVersion: RegulatorySnapshotVersion | null = null;
  try {
    const prev = await db.regulatorySnapshotVersion.findFirst({
      where: { supersededByVersion: versionId },
    });
    previousVersion = (prev as RegulatorySnapshotVersion | null) || null;
  } catch (err) {
    logger.error(
      "[snapshot-versioning] reactivatePreviousVersion lookup failed",
      { error: String(err), versionId },
    );
  }
  // Archive the rolled-back version.
  try {
    await db.regulatorySnapshotVersion.update({
      where: { versionId },
      data: { status: "ARCHIVED" },
    });
  } catch (err) {
    logger.error(
      "[snapshot-versioning] reactivatePreviousVersion archive failed (non-fatal)",
      { error: String(err), versionId },
    );
  }
  // Reactivate the previous version (if any).
  if (previousVersion) {
    try {
      const reactivated = await db.regulatorySnapshotVersion.update({
        where: { versionId: previousVersion.versionId },
        data: {
          status: "ACTIVE",
          supersededByVersion: null,
        },
      });
      logger.info(
        "[snapshot-versioning] previous version reactivated (rollback)",
        {
          rolledBackVersionId: versionId,
          reactivatedVersionId: previousVersion.versionId,
          jurisdictionCode: jc,
        },
      );
      return reactivated as RegulatorySnapshotVersion;
    } catch (err) {
      logger.error(
        "[snapshot-versioning] reactivatePreviousVersion reactivate failed",
        { error: String(err), versionId: previousVersion.versionId },
      );
    }
  }
  return null;
}
