// @ts-nocheck
/**
 * SGTX Master Amendment — §91 Recovery Vault Engine
 * ===========================================================================
 *
 * Implements the §91 Forensic Evidence Repository — the immutable,
 * hash-verifiable vault for everything that proves what happened to a
 * USTN. The vault is NOT the canonical event spine (§12) — it is the
 * storage layer for the *content* behind the events:
 *
 *   - the full event history snapshot
 *   - state transition records
 *   - raw evidence (documents, signatures, bank records)
 *   - authority determinations (court, regulator, arbitrator)
 *   - policy versions in force at the time
 *   - reconciliation cases
 *   - assembled dispute packets
 *   - corrective / recovery actions taken
 *   - settlement certificates
 *   - closure certificates
 *
 * §91 — Every entry is content-addressable: the `entryHash` is a SHA-256
 * of the canonical content. Verification is constant-time: re-hash the
 * stored content and compare.
 *
 * Small entries are stored inline (entryContent JSON). Large entries are
 * stored at entryUrl (object storage / signed URL).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §91 Constants — entry types ============

/**
 * §91 — the canonical entry types. Each maps to a kind of forensic
 * record that the vault can store.
 */
export const ENTRY_TYPES = [
  "EVENT_HISTORY",          // full event chain snapshot
  "STATE_TRANSITION",       // a single state transition record
  "EVIDENCE",               // raw evidence (document, signature, bank record)
  "AUTHORITY_DETERMINATION",// court ruling, regulator decision, arbitrator award
  "POLICY_VERSION",         // policy version in force at the time
  "RECONCILIATION_CASE",    // a reconciliation case file
  "DISPUTE_PACKET",         // assembled dispute packet (§90)
  "CORRECTIVE_ACTION",      // corrective action taken
  "RECOVERY_ACTION",        // recovery action taken (§115)
  "SETTLEMENT_CERTIFICATE", // bank settlement certificate (§53)
  "CLOSURE_CERTIFICATE",    // closure certificate (§6)
  "EXCEPTION_RECORD",       // exception event record
  "OBLIGATION_GRAPH",       // obligation graph snapshot
  "EXTERNAL_IDENTIFIER",    // external identifier record
  "TWIN_SNAPSHOT",          // transaction twin snapshot
] as const;

export type EntryType = (typeof ENTRY_TYPES)[number];

// ============ Types ============

export interface RecoveryVaultEntryRow {
  id: string;
  ustn?: string | null;
  entryType: string;
  entryReference?: string | null;
  entryHash?: string | null;
  entryContent?: string | null;
  entryUrl?: string | null;
  createdAt: Date;
}

export interface StoreEntryInput {
  ustn?: string | null;
  entryType: string;
  entryReference?: string | null;
  /** Inline content — JSON-serialized for small entries. */
  content?: any;
  /** URL for large entries (object storage / signed URL). */
  entryUrl?: string | null;
  /** Skip hash computation (caller has already hashed). */
  precomputedHash?: string | null;
}

export interface VerifyEntryResult {
  id: string;
  verified: boolean;
  expectedHash?: string | null;
  actualHash?: string | null;
}

// ============ §91.0 Pure helpers ============

/**
 * Pure: canonical serialization for hashing. Stable JSON with sorted
 * keys, no whitespace. Used by `storeEntry` and `verifyEntryHash`.
 */
export function canonicalEntryContent(content: any): string {
  if (content === null || content === undefined) return "";
  if (typeof content === "string") return content;
  try {
    return JSON.stringify(content, Object.keys(content).sort());
  } catch {
    return String(content);
  }
}

/**
 * Pure: compute the SHA-256 of the canonical entry content. Uses dynamic
 * `await import('node:crypto')` so the module works in any runtime.
 */
export async function computeEntryHash(content: any): Promise<string> {
  const payload = canonicalEntryContent(content);
  if (!payload) return "";
  try {
    const crypto = await import("node:crypto");
    return crypto.createHash("sha256").update(payload, "utf8").digest("hex");
  } catch {
    // Fallback FNV-1a
    let h = 0x811c9dc5;
    for (let i = 0; i < payload.length; i++) {
      h ^= payload.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return `fnv-${h.toString(16).padStart(8, "0")}-${payload.length.toString(16)}`;
  }
}

// ============ §91.1 storeEntry ============

/**
 * Store an entry in the recovery vault. Computes the SHA-256 hash of the
 * canonical content (unless `precomputedHash` is provided) and persists
 * the row.
 *
 * Small entries are stored inline (entryContent). Large entries should
 * use entryUrl instead of inline content (caller responsibility).
 *
 * Returns the new entry row, or null on error.
 */
export async function storeEntry(
  ustn: string | null | undefined,
  entryType: string,
  content: any,
  options?: {
    entryReference?: string | null;
    entryUrl?: string | null;
    precomputedHash?: string | null;
  },
): Promise<RecoveryVaultEntryRow | null> {
  if (!entryType) {
    logger.warn("[recovery-vault] storeEntry rejected: missing entryType");
    return null;
  }
  if (!ENTRY_TYPES.includes(entryType as EntryType)) {
    logger.warn("[recovery-vault] unknown entry type", { entryType });
    // Don't reject — still store, but log
  }

  let entryHash = options?.precomputedHash || null;
  let entryContent: string | null = null;
  if (content !== null && content !== undefined) {
    if (typeof content === "string") {
      entryContent = content;
    } else {
      try {
        entryContent = JSON.stringify(content);
      } catch {
        entryContent = String(content);
      }
    }
    if (!entryHash) {
      entryHash = await computeEntryHash(content);
    }
  }

  try {
    const row = await db.recoveryVaultEntry.create({
      data: {
        ustn: ustn || null,
        entryType,
        entryReference: options?.entryReference || null,
        entryHash,
        entryContent,
        entryUrl: options?.entryUrl || null,
      },
    });
    logger.info("[recovery-vault] entry stored", {
      id: row.id,
      ustn: ustn || null,
      entryType,
      entryReference: options?.entryReference || null,
      hasHash: !!entryHash,
      contentSize: entryContent?.length || 0,
    });
    return row as RecoveryVaultEntryRow;
  } catch (err) {
    logger.error("[recovery-vault] storeEntry create failed", {
      error: String(err),
      ustn: ustn || null,
      entryType,
    });
    return null;
  }
}

// ============ §91.2 getEntry ============

/**
 * Retrieve a vault entry by its row id. Returns null if not found.
 */
export async function getEntry(
  id: string,
): Promise<RecoveryVaultEntryRow | null> {
  if (!id) return null;
  try {
    const row = await db.recoveryVaultEntry.findUnique({
      where: { id },
    });
    return (row as RecoveryVaultEntryRow) || null;
  } catch (err) {
    logger.error("[recovery-vault] getEntry failed", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §91.3 getEntriesByUstn ============

/**
 * Get all vault entries for a USTN, ordered by createdAt ascending. Returns
 * [] on error or if no USTN is provided.
 */
export async function getEntriesByUstn(
  ustn: string,
): Promise<RecoveryVaultEntryRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.recoveryVaultEntry.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return (rows as RecoveryVaultEntryRow[]) || [];
  } catch (err) {
    logger.error("[recovery-vault] getEntriesByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §91.4 getEntriesByType ============

/**
 * Get all vault entries for a USTN of a specific entryType. Returns [] on
 * error or if no USTN is provided.
 */
export async function getEntriesByType(
  ustn: string,
  entryType: string,
): Promise<RecoveryVaultEntryRow[]> {
  if (!ustn || !entryType) return [];
  try {
    const rows = await db.recoveryVaultEntry.findMany({
      where: { ustn, entryType },
      orderBy: { createdAt: "asc" },
    });
    return (rows as RecoveryVaultEntryRow[]) || [];
  } catch (err) {
    logger.error("[recovery-vault] getEntriesByType failed", {
      error: String(err),
      ustn,
      entryType,
    });
    return [];
  }
}

/**
 * Get a vault entry by its entryReference (the ID of the referenced object,
 * e.g. an exceptionId, a packetId, a settlementInstructionId).
 */
export async function getEntryByReference(
  entryReference: string,
  entryType?: string,
): Promise<RecoveryVaultEntryRow | null> {
  if (!entryReference) return null;
  try {
    const where: any = { entryReference };
    if (entryType) where.entryType = entryType;
    const row = await db.recoveryVaultEntry.findFirst({
      where,
      orderBy: { createdAt: "desc" },
    });
    return (row as RecoveryVaultEntryRow) || null;
  } catch (err) {
    logger.error("[recovery-vault] getEntryByReference failed", {
      error: String(err),
      entryReference,
    });
    return null;
  }
}

// ============ §91.5 verifyEntryHash ============

/**
 * Verify the hash integrity of a vault entry. Re-computes the SHA-256
 * from the stored content and compares to the stored entryHash.
 *
 * Returns `{ verified: true }` if the hash matches. Returns
 * `{ verified: false, expectedHash, actualHash }` if not.
 *
 * Entries with no stored hash or no stored content return verified=false.
 */
export async function verifyEntryHash(
  id: string,
): Promise<VerifyEntryResult> {
  const empty: VerifyEntryResult = { id, verified: false };
  if (!id) return empty;
  try {
    const row = await db.recoveryVaultEntry.findUnique({
      where: { id },
    });
    if (!row) return empty;
    if (!row.entryHash || !row.entryContent) {
      return { id, verified: false, expectedHash: row.entryHash || null, actualHash: null };
    }
    // Parse the stored content (it might be JSON or plain string)
    let parsedContent: any = row.entryContent;
    try {
      parsedContent = JSON.parse(row.entryContent);
    } catch {
      // Treat as plain string
    }
    const actualHash = await computeEntryHash(parsedContent);
    const verified = actualHash === row.entryHash;
    if (!verified) {
      logger.warn("[recovery-vault] hash mismatch — possible tampering", {
        id,
        entryType: row.entryType,
        ustn: row.ustn,
        expectedHash: row.entryHash,
        actualHash,
      });
    }
    return {
      id,
      verified,
      expectedHash: row.entryHash,
      actualHash,
    };
  } catch (err) {
    logger.error("[recovery-vault] verifyEntryHash failed", {
      error: String(err),
      id,
    });
    return empty;
  }
}

/**
 * Bulk verify all vault entries for a USTN. Returns a summary plus the
 * list of broken entries (those that fail hash verification).
 */
export async function verifyAllEntriesForUstn(
  ustn: string,
): Promise<{
  ustn: string;
  totalEntries: number;
  verified: number;
  broken: number;
  brokenEntries: Array<{ id: string; entryType: string; expectedHash?: string | null; actualHash?: string }>;
}> {
  const empty = { ustn, totalEntries: 0, verified: 0, broken: 0, brokenEntries: [] };
  if (!ustn) return empty;
  const entries = await getEntriesByUstn(ustn);
  let verified = 0;
  const brokenEntries: any[] = [];
  for (const e of entries) {
    const r = await verifyEntryHash(e.id);
    if (r.verified) verified++;
    else brokenEntries.push({
      id: e.id,
      entryType: e.entryType,
      expectedHash: r.expectedHash,
      actualHash: r.actualHash,
    });
  }
  return {
    ustn,
    totalEntries: entries.length,
    verified,
    broken: brokenEntries.length,
    brokenEntries,
  };
}
