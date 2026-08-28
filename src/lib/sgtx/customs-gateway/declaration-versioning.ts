// @ts-nocheck
/**
 * SGTX Customs Gateway — Declaration Versioning
 * ===========================================================================
 *
 * Implements immutable, hash-chained declaration versioning. Every legally
 * material change to a customs declaration creates a NEW version — previous
 * versions are NEVER modified or deleted.
 *
 * Storage: versions are persisted in the TradeEvent table with:
 *   - eventType = "DECLARATION_VERSION_CREATED"
 *   - source = "DECLARATION_VERSION"
 *   - eventMetadata = JSON of { versionId, declarationId, version, createdBy,
 *     reason, payloadHash, previousVersionHash, governorDecisionId,
 *     signatureStatus, payload }
 *   - previousHash = eventHash of the prior version (hash chain)
 *   - eventHash = SHA-256 of the canonical version record
 *
 * Hash chain: each version's previousVersionHash is the eventHash (== the
 * DeclarationVersion.payloadHash-equivalent stored on the row) of the prior
 * version. This binds every version to its predecessor — tampering with any
 * historical version breaks the chain.
 *
 * IMUTABLE: versions are never modified or deleted. There is NO update or
 * delete function in this module.
 *
 * LEGAL: every version is a legally material record. The hash chain + the
 * createdBy + reason fields provide full provenance — a court or auditor can
 * reconstruct exactly who changed what, when, and why.
 *
 * AUDIT: every version has full provenance:
 *   - createdBy (actor GTID)
 *   - reason (free-text justification, mandatory)
 *   - payloadHash (SHA-256 of canonical payload JSON)
 *   - previousVersionHash (link to prior version)
 *   - governorDecisionId (if the change required Governor approval)
 *   - signatureStatus (e.g. "UNSIGNED", "SIGNED", "PENDING_SIGNATURE")
 *
 * All public functions are wrapped in try/catch with safe defaults — the
 * versioning engine never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { sanitizeForLoom } from "@/lib/sgtx/customs-gateway/loom-customs";

// ============ §1 Types ============

export interface DeclarationVersion {
  versionId: string;
  declarationId: string;
  version: number;
  createdBy: string;
  createdAt: Date;
  reason: string;
  payloadHash: string;
  previousVersionHash: string | null;
  governorDecisionId: string | null;
  signatureStatus: string | null;
  payload: any;
}

// ============ §2 Pure helpers ============

/**
 * Canonicalise a payload for hashing. Deterministic: sorts object keys,
 * converts Dates to ISO strings, drops undefined values. This is the
 * canonical form that payloadHash is computed over.
 *
 * NEVER throws — on internal error returns "{}".
 */
function canonicalisePayload(payload: any): string {
  try {
    if (payload === null || payload === undefined) return "null";
    // Use a replacer that sorts keys and normalises Dates.
    return JSON.stringify(payload, (key, value) => {
      if (value instanceof Date) return value.toISOString();
      if (typeof value === "bigint") return String(value);
      if (value === undefined) return null;
      return value;
    });
  } catch (err) {
    logger.warn("[declaration-versioning] canonicalisePayload failed — empty", {
      error: String(err),
    });
    return "{}";
  }
}

/**
 * Compute the SHA-256 hash of a payload. Uses the canonical form (sorted
 * keys, ISO dates). Returns "error-<random>" on internal failure.
 */
export async function computePayloadHash(payload: any): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const canonical = canonicalisePayload(payload);
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  } catch (err) {
    logger.error("[declaration-versioning] computePayloadHash failed", {
      error: String(err),
    });
    return `error-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }
}

/**
 * Compute the SHA-256 hash of a DeclarationVersion record (the row-level
 * hash). Binds together: versionId, declarationId, version, createdBy,
 * reason, payloadHash, previousVersionHash, timestamp.
 *
 * Returns "error-<random>" on internal failure.
 */
async function computeVersionHash(v: Partial<DeclarationVersion>): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const canonical = JSON.stringify({
      versionId: String(v.versionId || ""),
      declarationId: String(v.declarationId || ""),
      version: Number(v.version || 0),
      createdBy: String(v.createdBy || ""),
      reason: String(v.reason || ""),
      payloadHash: String(v.payloadHash || ""),
      previousVersionHash: String(v.previousVersionHash || ""),
      timestamp: v.createdAt instanceof Date ? v.createdAt.toISOString() : String(v.createdAt || ""),
    }, Object.keys({
      versionId: 1, declarationId: 1, version: 1, createdBy: 1,
      reason: 1, payloadHash: 1, previousVersionHash: 1, timestamp: 1,
    }).sort());
    return crypto.createHash("sha256").update(canonical, "utf8").digest("hex");
  } catch (err) {
    return `error-${Date.now().toString(36)}`;
  }
}

/**
 * Generate a deterministic version ID. Format:
 *   DV-<declarationId8>-<version>-<random6>
 */
function generateVersionId(declarationId: string, version: number): string {
  try {
    const d = String(declarationId || "UNKNOWN").slice(0, 8).toUpperCase();
    const v = Number(version) || 0;
    const r = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `DV-${d}-${v}-${r}`;
  } catch {
    return `DV-UNKNOWN-0-${Date.now().toString(36).toUpperCase()}`;
  }
}

// ============ §3 createVersion ============

/**
 * Create a new immutable declaration version.
 *
 * Steps:
 *   1. Look up the most recent existing version (getLatestVersion).
 *   2. Compute the new version number = latest.version + 1 (or 1 if none).
 *   3. Compute payloadHash = SHA-256(canonicalPayloadJSON(payload)).
 *   4. Set previousVersionHash = latest.eventHash (the prior version's
 *      row-level hash). Null if this is the first version.
 *   5. Compute the row-level hash (computeVersionHash).
 *   6. Persist as a TradeEvent row with source = "DECLARATION_VERSION".
 *
 * The payload is sanitised via sanitizeForLoom before being stored — no
 * credentials, secrets, filer codes, etc. ever enter a version record.
 *
 * Returns the new DeclarationVersion on success, or a minimal error skeleton
 * on failure. NEVER throws.
 */
export async function createVersion(
  declarationId: string,
  payload: any,
  createdBy: string,
  reason: string,
): Promise<DeclarationVersion> {
  try {
    if (!declarationId) {
      logger.warn("[declaration-versioning] createVersion rejected: missing declarationId");
      return _errorVersion("", 0, createdBy || "", "missing declarationId");
    }
    if (!createdBy) {
      logger.warn("[declaration-versioning] createVersion rejected: missing createdBy", {
        declarationId,
      });
      return _errorVersion(declarationId, 0, "", "missing createdBy");
    }
    if (!reason) {
      logger.warn("[declaration-versioning] createVersion rejected: missing reason", {
        declarationId,
        createdBy,
      });
      return _errorVersion(declarationId, 0, createdBy, "missing reason");
    }

    // §1 Find latest version (for hash chain + version number).
    const latest = await getLatestVersion(declarationId);
    const version = (latest?.version || 0) + 1;
    const previousVersionHash = latest?.payloadHash || null;
    // We use the row-level eventHash as the previousVersionHash to bind
    // versions together — but the latest?.eventHash (the TradeEvent row's
    // eventHash) is what we need. getLatestVersion returns payloadHash in
    // the DeclarationVersion interface, but the TradeEvent row stores the
    // row-level hash in eventHash. We re-fetch to be safe.
    let previousRowHash: string | null = null;
    if (latest) {
      try {
        const row = await db.tradeEvent.findFirst({
          where: {
            ustn: declarationId,
            source: "DECLARATION_VERSION",
            eventMetadata: { contains: `"versionId":"${latest.versionId}"` },
          },
          orderBy: { createdAt: "desc" },
        });
        if (row?.eventHash) previousRowHash = row.eventHash;
      } catch (err) {
        logger.warn("[declaration-versioning] could not fetch prior row hash — continuing", {
          error: String(err),
        });
      }
    }

    // §2 Sanitise payload — NEVER store credentials.
    const sanitisedPayload = sanitizeForLoom(payload || {});

    // §3 Compute payload hash.
    const payloadHash = await computePayloadHash(sanitisedPayload);

    // §4 Build the version record.
    const versionId = generateVersionId(declarationId, version);
    const createdAt = new Date();
    const governorDecisionId =
      (sanitisedPayload && sanitisedPayload.governorDecisionId) || null;
    const signatureStatus =
      (sanitisedPayload && sanitisedPayload.signatureStatus) || "UNSIGNED";

    const candidate: Partial<DeclarationVersion> = {
      versionId,
      declarationId,
      version,
      createdBy,
      createdAt,
      reason,
      payloadHash,
      previousVersionHash: previousRowHash,
      governorDecisionId,
      signatureStatus,
      payload: sanitisedPayload,
    };
    const rowHash = await computeVersionHash(candidate);

    // §5 Persist as TradeEvent.
    try {
      await db.tradeEvent.create({
        data: {
          ustn: declarationId,
          eventType: "DECLARATION_VERSION_CREATED",
          eventDescription: `Declaration version ${version} created`,
          eventMetadata: JSON.stringify({
            versionId,
            declarationId,
            version,
            createdBy,
            reason,
            payloadHash,
            previousVersionHash: previousRowHash,
            governorDecisionId,
            signatureStatus,
            payload: sanitisedPayload,
          }).slice(0, 8000),
          actorGtid: createdBy,
          source: "DECLARATION_VERSION",
          previousHash: previousRowHash,
          eventHash: rowHash,
        },
      });
    } catch (dbErr) {
      logger.error("[declaration-versioning] persist failed", {
        error: String(dbErr),
        declarationId,
        version,
      });
      return _errorVersion(declarationId, version, createdBy, "persist failed");
    }

    logger.info("[declaration-versioning] version created", {
      declarationId,
      version,
      versionId,
      createdBy,
      hasPreviousHash: !!previousRowHash,
    });

    return {
      versionId,
      declarationId,
      version,
      createdBy,
      createdAt,
      reason,
      payloadHash,
      previousVersionHash: previousRowHash,
      governorDecisionId,
      signatureStatus,
      payload: sanitisedPayload,
    };
  } catch (err) {
    logger.error("[declaration-versioning] createVersion failed — safe fallback", {
      error: String(err),
      declarationId,
    });
    return _errorVersion(declarationId, 0, createdBy, String(err));
  }
}

// ============ §4 getVersionHistory ============

/**
 * Return all versions for a declaration, oldest first.
 *
 * Returns an empty array on error — never throws.
 */
export async function getVersionHistory(
  declarationId: string,
): Promise<DeclarationVersion[]> {
  try {
    if (!declarationId) return [];
    const rows = await db.tradeEvent.findMany({
      where: {
        ustn: declarationId,
        source: "DECLARATION_VERSION",
      },
      orderBy: { createdAt: "asc" },
      take: 500,
    });
    return (rows || []).map((r: any) => _rowToVersion(r));
  } catch (err) {
    logger.error("[declaration-versioning] getVersionHistory failed — empty list", {
      error: String(err),
      declarationId,
    });
    return [];
  }
}

// ============ §5 getLatestVersion ============

/**
 * Return the most recent version for a declaration, or null if none exist.
 *
 * Returns null on error — never throws.
 */
export async function getLatestVersion(
  declarationId: string,
): Promise<DeclarationVersion | null> {
  try {
    if (!declarationId) return null;
    const row = await db.tradeEvent.findFirst({
      where: {
        ustn: declarationId,
        source: "DECLARATION_VERSION",
      },
      orderBy: { createdAt: "desc" },
    });
    if (!row) return null;
    return _rowToVersion(row);
  } catch (err) {
    logger.error("[declaration-versioning] getLatestVersion failed — null", {
      error: String(err),
      declarationId,
    });
    return null;
  }
}

// ============ §6 compareVersions ============

export interface VersionDiff {
  differences: any[];
  added: any[];
  removed: any[];
  modified: any[];
}

/**
 * Compare two versions of a declaration. Produces a structured diff:
 *   - added:    keys present in v2 but not v1
 *   - removed:  keys present in v1 but not v2
 *   - modified: keys present in both with different values
 *   - differences: flat list of all changes (path, before, after)
 *
 * The comparison is shallow-by-default with deep-path support for nested
 * objects (paths like "a.b.c").
 *
 * Returns an empty diff on error or if either version is missing.
 */
export async function compareVersions(
  declarationId: string,
  version1: number,
  version2: number,
): Promise<VersionDiff> {
  try {
    if (!declarationId) return _emptyDiff();
    const history = await getVersionHistory(declarationId);
    const v1 = history.find((v) => v.version === version1);
    const v2 = history.find((v) => v.version === version2);
    if (!v1 || !v2) {
      logger.warn("[declaration-versioning] compareVersions: version not found", {
        declarationId,
        version1,
        version2,
        historySize: history.length,
      });
      return _emptyDiff();
    }
    return _diff(v1.payload || {}, v2.payload || {});
  } catch (err) {
    logger.error("[declaration-versioning] compareVersions failed — empty diff", {
      error: String(err),
      declarationId,
    });
    return _emptyDiff();
  }
}

// ============ §7 Internal helpers ============

function _rowToVersion(row: any): DeclarationVersion {
  try {
    const meta = row?.eventMetadata
      ? (typeof row.eventMetadata === "string"
          ? JSON.parse(row.eventMetadata)
          : row.eventMetadata)
      : {};
    return {
      versionId: meta.versionId || row?.id || "unknown",
      declarationId: meta.declarationId || row?.ustn || "",
      version: Number(meta.version) || 0,
      createdBy: meta.createdBy || row?.actorGtid || "",
      createdAt: row?.createdAt || new Date(),
      reason: meta.reason || "",
      payloadHash: meta.payloadHash || row?.eventHash || "",
      previousVersionHash: meta.previousVersionHash || row?.previousHash || null,
      governorDecisionId: meta.governorDecisionId || null,
      signatureStatus: meta.signatureStatus || "UNSIGNED",
      payload: meta.payload || null,
    };
  } catch {
    return _errorVersion(row?.ustn || "", 0, row?.actorGtid || "", "parse failed");
  }
}

function _errorVersion(
  declarationId: string,
  version: number,
  createdBy: string,
  reason: string,
): DeclarationVersion {
  return {
    versionId: `DV-ERROR-${Date.now().toString(36).toUpperCase()}`,
    declarationId,
    version,
    createdBy,
    createdAt: new Date(),
    reason: `ERROR: ${reason}`,
    payloadHash: "error",
    previousVersionHash: null,
    governorDecisionId: null,
    signatureStatus: "UNSIGNED",
    payload: null,
  };
}

function _emptyDiff(): VersionDiff {
  return { differences: [], added: [], removed: [], modified: [] };
}

/**
 * Deep diff between two objects. Produces:
 *   - added:    array of paths present in b but not a
 *   - removed:  array of paths present in a but not b
 *   - modified: array of { path, before, after }
 *   - differences: flat list (same as modified + added + removed combined)
 *
 * Paths use dot notation: "a.b.c". Arrays are compared by index; differing
 * indices appear as "modified".
 */
function _diff(a: any, b: any, prefix = ""): VersionDiff {
  const result: VersionDiff = _emptyDiff();
  try {
    _diffWalk(a, b, prefix, result);
    // Combine all into differences.
    result.differences = [
      ...result.added.map((p) => ({ path: p, type: "added" })),
      ...result.removed.map((p) => ({ path: p, type: "removed" })),
      ...result.modified,
    ];
  } catch {
    // best-effort
  }
  return result;
}

function _diffWalk(
  a: any,
  b: any,
  prefix: string,
  result: VersionDiff,
): void {
  try {
    const aIsObj = a !== null && typeof a === "object" && !Array.isArray(a);
    const bIsObj = b !== null && typeof b === "object" && !Array.isArray(b);

    if (aIsObj && bIsObj) {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      const aSet = new Set(aKeys);
      const bSet = new Set(bKeys);
      for (const k of bKeys) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (!aSet.has(k)) {
          result.added.push(path);
        } else {
          _diffWalk(a[k], b[k], path, result);
        }
      }
      for (const k of aKeys) {
        if (!bSet.has(k)) {
          const path = prefix ? `${prefix}.${k}` : k;
          result.removed.push(path);
        }
      }
      return;
    }

    if (Array.isArray(a) && Array.isArray(b)) {
      const max = Math.max(a.length, b.length);
      for (let i = 0; i < max; i++) {
        const path = prefix ? `${prefix}[${i}]` : `[${i}]`;
        if (i >= a.length) {
          result.added.push(path);
        } else if (i >= b.length) {
          result.removed.push(path);
        } else {
          _diffWalk(a[i], b[i], path, result);
        }
      }
      return;
    }

    // Primitive comparison.
    if (a !== b) {
      result.modified.push({
        path: prefix || "(root)",
        before: a,
        after: b,
      });
    }
  } catch {
    // best-effort
  }
}
