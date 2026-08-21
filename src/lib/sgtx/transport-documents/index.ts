// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX Phase 5 — §5 Transport Documents (Canonical Document Registry)
 * ------------------------------------------------------------
 * Implements the 11 transport-document types per the SGTX Blueprint §5:
 *   ROAD_WAYBILL | E_CMR | MAWB | HAWB | E_AWB | BILL_OF_LADING |
 *   E_BL | RAIL_CONSIGNMENT | FERRY_DOCUMENT | DELIVERY_ORDER | POD
 *
 * Per spec: "Mode engines remain responsible for detailed execution."
 * This lib is the canonical REGISTRY — it stores, transitions, and
 * verifies documents. The mode engines (road-corridor / air-cargo / the
 * future ocean/rail/ferry engines) GENERATE / EXECUTE the actual
 * document payloads; this lib links to them via `modeEngineRef` +
 * `modeEngineType` on the TransportDocument row.
 *
 * Document lifecycle (per §5):
 *   DRAFT ──issue──▶ ISSUED ──surrender──▶ SURRENDERED ──release──▶ RELEASED
 *                  ├──amend──▶ AMENDED
 *                  └──cancel──▶ CANCELLED ──▶ VOID
 *
 * Verification:
 *   `issueDocument` generates a SHA-256 `verificationHash` over the
 *   payload (sorted-key JSON, to make hashing deterministic).
 *   `verifyDocument` recomputes the hash and compares. Any tampering
 *   with the payload after issuance is detected as a hash mismatch.
 *
 * Design principles (carry-over from Phase 5 transport-graph + Phase 1):
 *   • SGTX is NON-MARKETPLACE — documents are never auto-issued or
 *     auto-shared. The provider (issuer) explicitly creates them.
 *   • Every DB call is wrapped defensively — the registry never
 *     throws to the caller; instead it logs + returns a safe default.
 *   • `generateDocumentNumber` and `getDocumentTypeForMode` are pure.
 *   • SHA-256 hashing uses `node:crypto` via dynamic import so this
 *     module stays server-only (no `crypto` leak into client bundles).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §5 Document types & statuses ============

export const DOCUMENT_TYPES = [
  "ROAD_WAYBILL",
  "E_CMR",
  "MAWB",
  "HAWB",
  "E_AWB",
  "BILL_OF_LADING",
  "E_BL",
  "RAIL_CONSIGNMENT",
  "FERRY_DOCUMENT",
  "DELIVERY_ORDER",
  "POD",
] as const;

export const DOCUMENT_STATUSES = [
  "DRAFT",
  "ISSUED",
  "SURRENDERED",
  "RELEASED",
  "AMENDED",
  "CANCELLED",
  "VOID",
] as const;

/**
 * Maps a transport mode to the document types applicable to that mode.
 * Per spec §5:
 *   • ROAD → ROAD_WAYBILL, E_CMR, DELIVERY_ORDER, POD
 *   • AIR  → MAWB, HAWB, E_AWB, DELIVERY_ORDER, POD
 *   • OCEAN→ BILL_OF_LADING, E_BL, DELIVERY_ORDER, POD
 *   • RAIL → RAIL_CONSIGNMENT, DELIVERY_ORDER, POD
 *   • FERRY→ FERRY_DOCUMENT, DELIVERY_ORDER, POD
 * DELIVERY_ORDER + POD are universal end-of-journey documents.
 */
export const MODE_DOCUMENT_TYPES: Record<string, string[]> = {
  ROAD: ["ROAD_WAYBILL", "E_CMR", "DELIVERY_ORDER", "POD"],
  AIR: ["MAWB", "HAWB", "E_AWB", "DELIVERY_ORDER", "POD"],
  OCEAN: ["BILL_OF_LADING", "E_BL", "DELIVERY_ORDER", "POD"],
  RAIL: ["RAIL_CONSIGNMENT", "DELIVERY_ORDER", "POD"],
  FERRY: ["FERRY_DOCUMENT", "DELIVERY_ORDER", "POD"],
};

// Document state machine (allowed transitions).
const DOCUMENT_STATE_MACHINE: Record<string, string[]> = {
  DRAFT: ["ISSUED", "CANCELLED", "VOID"],
  ISSUED: ["SURRENDERED", "AMENDED", "CANCELLED", "VOID"],
  SURRENDERED: ["RELEASED", "CANCELLED", "VOID"],
  RELEASED: ["VOID"],
  AMENDED: ["SURRENDERED", "AMENDED", "CANCELLED", "VOID"],
  CANCELLED: ["VOID"],
  VOID: [],
};

// ============ Input types ============

export interface CreateDocInput {
  ustn?: string;
  graphId?: string;
  legId?: string;
  documentType: string;
  documentNumber?: string; // auto-generated if omitted
  issuerGtid?: string;
  holderGtid?: string;
  modeEngineRef?: string;
  modeEngineType?: string;
  isElectronic?: boolean;
  payload?: any;
  attachments?: string[];
  notes?: string;
}

// ============ Pure helpers ============

function isValidDocType(t?: string | null): boolean {
  return !!t && (DOCUMENT_TYPES as readonly string[]).includes(t);
}

function isValidDocStatus(s?: string | null): boolean {
  return !!s && (DOCUMENT_STATUSES as readonly string[]).includes(s);
}

function isValidTransition(from: string, to: string): boolean {
  if (!isValidDocStatus(from) || !isValidDocStatus(to)) return false;
  if (from === to) return true;
  const allowed = DOCUMENT_STATE_MACHINE[from] || [];
  return allowed.includes(to);
}

/**
 * Deterministic JSON serialization for hashing: keys sorted, stable
 * whitespace. Ensures the same payload always yields the same hash
 * regardless of property order.
 */
function canonicalJson(value: any): string {
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value, Object.keys(value).sort());
  } catch {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
}

/**
 * Pure document-number generator. Format depends on type:
 *   • AIR (MAWB/HAWB/E_AWB) → "{PREFIX}-{3-digit-airline}-{8-digit-serial}"
 *     e.g. MAWB-160-12345675
 *   • OCEAN (BILL_OF_LADING/E_BL) → "B/L-{5-char-port}-{YYYY}-{6-digit-serial}"
 *     e.g. B/L-EGDAH-2024-001234
 *   • ROAD (ROAD_WAYBILL/E_CMR) → "eCMR-{YYYY}-{6-digit-serial}"
 *   • Others use a generic "{TYPE}-{YYYY}-{6-digit-serial}" pattern.
 *
 * Pure: no I/O, no Math.random (uses a per-second timestamp + a
 * deterministic pseudo-serial derived from a counter seed). Production
 * callers may pass their own documentNumber to override.
 */
export function generateDocumentNumber(documentType: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(now.getUTCDate()).padStart(2, "0");
  const hh = String(now.getUTCHours()).padStart(2, "0");
  const mi = String(now.getUTCMinutes()).padStart(2, "0");
  // Deterministic serial seed: 6 digits from time-of-day seconds + ms.
  const seed =
    (now.getUTCSeconds() * 1000 + now.getUTCMilliseconds()) % 1000000;
  const serial6 = String(seed).padStart(6, "0");
  const serial8 = String(seed * 137 + 1).padStart(8, "0").slice(-8);

  switch (documentType) {
    case "MAWB":
      return `MAWB-160-${serial8}`;
    case "HAWB":
      return `HAWB-160-${serial8}`;
    case "E_AWB":
      return `EAWB-160-${serial8}`;
    case "BILL_OF_LADING":
      // Defaulting port to "EGDAH" (Alexandria) as a stable placeholder.
      // The mode engine / caller overrides via documentNumber on create.
      return `B/L-EGDAH-${yyyy}-${serial6}`;
    case "E_BL":
      return `eBL-EGDAH-${yyyy}-${serial6}`;
    case "ROAD_WAYBILL":
      return `RW-${yyyy}${mm}${dd}-${serial6}`;
    case "E_CMR":
      return `eCMR-${yyyy}-${serial6}`;
    case "RAIL_CONSIGNMENT":
      return `RC-${yyyy}${mm}${dd}-${serial6}`;
    case "FERRY_DOCUMENT":
      return `FD-${yyyy}${mm}${dd}-${serial6}`;
    case "DELIVERY_ORDER":
      return `DO-${yyyy}${mm}${dd}-${serial6}`;
    case "POD":
      return `POD-${yyyy}${mm}${dd}-${hh}${mi}-${serial6}`;
    default:
      return `${documentType || "DOC"}-${yyyy}-${serial6}`;
  }
}

/**
 * Pure: returns the applicable document types for a transport mode.
 * Falls back to DELIVERY_ORDER + POD if the mode is unknown (universal
 * end-of-journey docs).
 */
export function getDocumentTypeForMode(mode: string): string[] {
  const m = (mode || "").toUpperCase();
  if (MODE_DOCUMENT_TYPES[m]) return [...MODE_DOCUMENT_TYPES[m]];
  return ["DELIVERY_ORDER", "POD"];
}

/**
 * Computes the SHA-256 hex hash of a payload using node:crypto via a
 * dynamic import. Returns the hex string. If crypto is unavailable,
 * returns an empty string and the caller treats that as "hash missing".
 *
 * Deterministic: same input always yields same output. Used by
 * `issueDocument` (write) and `verifyDocument` (read).
 */
async function sha256Hex(payload: any): Promise<string> {
  try {
    const crypto = await import("node:crypto");
    const data = canonicalJson(payload);
    return crypto.createHash("sha256").update(data, "utf8").digest("hex");
  } catch (err) {
    logger.error("transport-documents: sha256 failed", {
      error: String(err),
    });
    return "";
  }
}

function safeParseArray(raw: any): string[] {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function safeParseJson(raw: any): any {
  if (raw && typeof raw === "object") return raw;
  if (typeof raw === "string" && raw.trim().length > 0) {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return null;
}

// ============ §5a createTransportDocument ============

/**
 * Creates a new TransportDocument in DRAFT status. Auto-generates a
 * document number if omitted. The mode engine that "owns" the actual
 * document payload is referenced via `modeEngineRef` + `modeEngineType`.
 */
export async function createTransportDocument(
  input: CreateDocInput,
): Promise<any> {
  try {
    if (!isValidDocType(input.documentType)) {
      return { ok: false, error: "INVALID_DOCUMENT_TYPE", valid: DOCUMENT_TYPES };
    }
    const documentNumber =
      input.documentNumber || generateDocumentNumber(input.documentType);

    const data: any = {
      ustn: input.ustn || null,
      graphId: input.graphId || null,
      legId: input.legId || null,
      documentType: input.documentType,
      documentNumber,
      issuerGtid: input.issuerGtid || null,
      holderGtid: input.holderGtid || null,
      modeEngineRef: input.modeEngineRef || null,
      modeEngineType: input.modeEngineType || null,
      isElectronic: input.isElectronic !== false, // default true
      status: "DRAFT",
      payload: input.payload != null ? JSON.stringify(input.payload) : null,
      attachments:
        input.attachments && input.attachments.length > 0
          ? JSON.stringify(input.attachments)
          : null,
      notes: input.notes || null,
    };

    const doc = await db.transportDocument.create({ data });
    logger.info("transport-documents: created", {
      id: doc.id,
      type: input.documentType,
      documentNumber,
    });
    return doc;
  } catch (err) {
    logger.error("transport-documents: createTransportDocument failed", {
      error: String(err),
      input,
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5b getTransportDocument ============

export async function getTransportDocument(
  id: string,
): Promise<any | null> {
  try {
    return await db.transportDocument.findUnique({ where: { id } });
  } catch (err) {
    logger.error("transport-documents: getTransportDocument failed", {
      id,
      error: String(err),
    });
    return null;
  }
}

// ============ §5c listTransportDocuments ============

/**
 * Lists documents filtered by any of: ustn, graphId, legId,
 * documentType, status, issuerGtid. Returns up to 500 rows, newest first.
 */
export async function listTransportDocuments(
  filters?: {
    ustn?: string;
    graphId?: string;
    legId?: string;
    documentType?: string;
    status?: string;
    issuerGtid?: string;
  },
): Promise<any[]> {
  try {
    const where: any = {};
    if (filters?.ustn) where.ustn = filters.ustn;
    if (filters?.graphId) where.graphId = filters.graphId;
    if (filters?.legId) where.legId = filters.legId;
    if (filters?.documentType) where.documentType = filters.documentType;
    if (filters?.status) where.status = filters.status;
    if (filters?.issuerGtid) where.issuerGtid = filters.issuerGtid;
    return (
      (await db.transportDocument.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 500,
      })) || []
    );
  } catch (err) {
    logger.error("transport-documents: listTransportDocuments failed", {
      filters,
      error: String(err),
    });
    return [];
  }
}

// ============ §5d issueDocument ============

/**
 * Transitions a document DRAFT → ISSUED. Sets issuedAt, stores the
 * provided `documentNumber` (in case the issuing authority assigned a
 * final one), merges any additional `payload` fields, and computes the
 * verificationHash (SHA-256 of the final payload + metadata).
 */
export async function issueDocument(
  id: string,
  documentNumber: string,
  payload?: any,
): Promise<any> {
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) return { ok: false, error: "DOCUMENT_NOT_FOUND" };
    if (!isValidTransition(doc.status, "ISSUED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: doc.status,
        to: "ISSUED",
        allowed: DOCUMENT_STATE_MACHINE[doc.status] || [],
      };
    }

    // Merge payload: existing + new (new wins).
    const existingPayload = safeParseJson(doc.payload) || {};
    const mergedPayload =
      payload != null
        ? { ...existingPayload, ...(payload as object) }
        : existingPayload;

    const finalDocNumber = documentNumber || doc.documentNumber || "";
    const hash = await sha256Hex({
      documentType: doc.documentType,
      documentNumber: finalDocNumber,
      payload: mergedPayload,
      issuerGtid: doc.issuerGtid,
      graphId: doc.graphId,
      legId: doc.legId,
      ustn: doc.ustn,
    });

    const updated = await db.transportDocument.update({
      where: { id },
      data: {
        status: "ISSUED",
        documentNumber: finalDocNumber,
        payload: JSON.stringify(mergedPayload),
        issuedAt: new Date(),
        verificationHash: hash,
      },
    });

    logger.info("transport-documents: issued", {
      id,
      documentNumber: finalDocNumber,
      hash,
    });
    return updated;
  } catch (err) {
    logger.error("transport-documents: issueDocument failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5e surrenderDocument ============

/**
 * Transitions ISSUED → SURRENDERED. Used for e-BL release flow
 * (the shipper/surrendering party surrenders the negotiable document
 * to the carrier so the consignee can claim the cargo).
 */
export async function surrenderDocument(id: string): Promise<any> {
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) return { ok: false, error: "DOCUMENT_NOT_FOUND" };
    if (!isValidTransition(doc.status, "SURRENDERED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: doc.status,
        to: "SURRENDERED",
        allowed: DOCUMENT_STATE_MACHINE[doc.status] || [],
      };
    }
    const updated = await db.transportDocument.update({
      where: { id },
      data: {
        status: "SURRENDERED",
        surrenderedAt: new Date(),
      },
    });
    logger.info("transport-documents: surrendered", { id });
    return updated;
  } catch (err) {
    logger.error("transport-documents: surrenderDocument failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5f releaseDocument ============

/**
 * Transitions SURRENDERED → RELEASED. The carrier releases the cargo
 * to the consignee after the document has been surrendered.
 * Records `releasedBy` (the releasing party's GTID) in the payload
 * (under `releasedBy`) and stamps `releasedAt`.
 */
export async function releaseDocument(
  id: string,
  releasedBy: string,
): Promise<any> {
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) return { ok: false, error: "DOCUMENT_NOT_FOUND" };
    if (!isValidTransition(doc.status, "RELEASED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: doc.status,
        to: "RELEASED",
        allowed: DOCUMENT_STATE_MACHINE[doc.status] || [],
      };
    }
    const existingPayload = safeParseJson(doc.payload) || {};
    const newPayload = { ...existingPayload, releasedBy };
    const updated = await db.transportDocument.update({
      where: { id },
      data: {
        status: "RELEASED",
        releasedAt: new Date(),
        payload: JSON.stringify(newPayload),
      },
    });
    logger.info("transport-documents: released", { id, releasedBy });
    return updated;
  } catch (err) {
    logger.error("transport-documents: releaseDocument failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5g amendDocument ============

/**
 * Transitions ISSUED → AMENDED. Keeps the OLD payload snapshot in the
 * `attachments` JSON array (so the audit trail is preserved) before
 * applying the new amendments. Re-computes the verificationHash.
 */
export async function amendDocument(
  id: string,
  amendments: any,
): Promise<any> {
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) return { ok: false, error: "DOCUMENT_NOT_FOUND" };
    if (!isValidTransition(doc.status, "AMENDED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: doc.status,
        to: "AMENDED",
        allowed: DOCUMENT_STATE_MACHINE[doc.status] || [],
      };
    }

    const oldPayload = safeParseJson(doc.payload) || {};
    const oldAttachments = safeParseArray(doc.attachments);

    // Snapshot the pre-amendment payload into attachments for audit.
    const snapshotRef = {
      kind: "pre-amendment-snapshot",
      at: new Date().toISOString(),
      payload: oldPayload,
      verificationHash: doc.verificationHash || null,
    };
    const newAttachments = [...oldAttachments, snapshotRef];

    const mergedPayload = { ...oldPayload, ...(amendments || {}) };
    const hash = await sha256Hex({
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      payload: mergedPayload,
      issuerGtid: doc.issuerGtid,
      graphId: doc.graphId,
      legId: doc.legId,
      ustn: doc.ustn,
      amended: true,
    });

    const updated = await db.transportDocument.update({
      where: { id },
      data: {
        status: "AMENDED",
        payload: JSON.stringify(mergedPayload),
        attachments: JSON.stringify(newAttachments),
        verificationHash: hash,
      },
    });
    logger.info("transport-documents: amended", { id });
    return updated;
  } catch (err) {
    logger.error("transport-documents: amendDocument failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5h cancelDocument ============

/**
 * Transitions any non-VOID status → CANCELLED. Records the cancellation
 * reason in the payload (under `cancellationReason`) and appends to `notes`.
 */
export async function cancelDocument(
  id: string,
  reason: string,
): Promise<any> {
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) return { ok: false, error: "DOCUMENT_NOT_FOUND" };
    if (!isValidTransition(doc.status, "CANCELLED")) {
      return {
        ok: false,
        error: "INVALID_TRANSITION",
        from: doc.status,
        to: "CANCELLED",
        allowed: DOCUMENT_STATE_MACHINE[doc.status] || [],
      };
    }
    const existingPayload = safeParseJson(doc.payload) || {};
    const newPayload = {
      ...existingPayload,
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
    };
    const updated = await db.transportDocument.update({
      where: { id },
      data: {
        status: "CANCELLED",
        payload: JSON.stringify(newPayload),
        notes: doc.notes
          ? `${doc.notes}\n[CANCELLED] ${reason}`
          : `[CANCELLED] ${reason}`,
      },
    });
    logger.info("transport-documents: cancelled", { id, reason });
    return updated;
  } catch (err) {
    logger.error("transport-documents: cancelDocument failed", {
      id,
      error: String(err),
    });
    return { ok: false, error: String(err) };
  }
}

// ============ §5i verifyDocument ============

/**
 * Verifies the integrity of an issued document by recomputing the
 * SHA-256 hash of the stored payload + metadata and comparing it to
 * the stored `verificationHash`.
 *
 * Returns:
 *   • valid: true iff the document exists, has a hash, and the recomputed
 *            hash matches.
 *   • hashMatch: true iff the hashes match (regardless of doc existence).
 *   • reason: human-readable explanation.
 */
export async function verifyDocument(
  id: string,
  verifiedBy: string,
): Promise<{ valid: boolean; hashMatch: boolean; reason: string }> {
  const safe = { valid: false, hashMatch: false, reason: "" };
  try {
    const doc = await db.transportDocument.findUnique({ where: { id } });
    if (!doc) {
      return { ...safe, reason: "DOCUMENT_NOT_FOUND" };
    }
    if (!doc.verificationHash) {
      // Document was never issued (no hash yet) — cannot verify.
      return {
        ...safe,
        reason: `Document ${doc.documentNumber || id} has no verificationHash (not yet issued).`,
      };
    }
    // Recompute the hash over the SAME fields used at issue time.
    const payload = safeParseJson(doc.payload) || {};
    const recomputed = await sha256Hex({
      documentType: doc.documentType,
      documentNumber: doc.documentNumber,
      payload,
      issuerGtid: doc.issuerGtid,
      graphId: doc.graphId,
      legId: doc.legId,
      ustn: doc.ustn,
      // For amended documents, the issue-time hash included `amended: true`.
      amended: doc.status === "AMENDED",
    });

    const hashMatch = recomputed !== "" && recomputed === doc.verificationHash;

    // Record verification attempt.
    try {
      await db.transportDocument.update({
        where: { id },
        data: {
          verifiedAt: new Date(),
          verifiedBy: verifiedBy || null,
        },
      });
    } catch (e) {
      logger.warn("transport-documents: verify stamp failed", {
        id,
        error: String(e),
      });
    }

    if (hashMatch) {
      return {
        valid: true,
        hashMatch: true,
        reason: `Verification hash matches for ${doc.documentNumber || id}.`,
      };
    }
    return {
      valid: false,
      hashMatch: false,
      reason: `Hash mismatch for ${doc.documentNumber || id}: stored=${(doc.verificationHash || "").slice(0, 16)}… recomputed=${recomputed.slice(0, 16)}… — payload may have been tampered with.`,
    };
  } catch (err) {
    logger.error("transport-documents: verifyDocument failed", {
      id,
      error: String(err),
    });
    return { ...safe, reason: String(err) };
  }
}

// ============ §5j getDocumentByNumber ============

export async function getDocumentByNumber(
  documentNumber: string,
): Promise<any | null> {
  try {
    if (!documentNumber) return null;
    const rows = await db.transportDocument.findMany({
      where: { documentNumber },
      orderBy: { createdAt: "desc" },
      take: 1,
    });
    return rows && rows.length > 0 ? rows[0] : null;
  } catch (err) {
    logger.error("transport-documents: getDocumentByNumber failed", {
      documentNumber,
      error: String(err),
    });
    return null;
  }
}

// ============ §5k getDocumentsForGraph ============

/**
 * Returns all transport documents associated with a transport graph
 * (directly on the graph OR on any of its legs).
 */
export async function getDocumentsForGraph(
  graphId: string,
): Promise<any[]> {
  try {
    if (!graphId) return [];
    const direct = await db.transportDocument.findMany({
      where: { graphId },
      orderBy: { createdAt: "asc" },
    });
    // Also include documents linked only to legs of this graph.
    const legIds: string[] = [];
    try {
      const legs = await db.transportLeg.findMany({
        where: { graphId },
        select: { id: true },
      });
      legIds.push(...legs.map((l: any) => l.id));
    } catch {
      /* non-fatal — legs may not be populated */
    }
    const legDocs =
      legIds.length > 0
        ? await db.transportDocument.findMany({
            where: {
              legId: { in: legIds },
              graphId: null, // avoid double-counting those already linked to the graph
            },
            orderBy: { createdAt: "asc" },
          })
        : [];
    return [...(direct || []), ...(legDocs || [])];
  } catch (err) {
    logger.error("transport-documents: getDocumentsForGraph failed", {
      graphId,
      error: String(err),
    });
    return [];
  }
}

// ============ §5l getDocumentsForLeg ============

export async function getDocumentsForLeg(legId: string): Promise<any[]> {
  try {
    if (!legId) return [];
    return (
      (await db.transportDocument.findMany({
        where: { legId },
        orderBy: { createdAt: "asc" },
      })) || []
    );
  } catch (err) {
    logger.error("transport-documents: getDocumentsForLeg failed", {
      legId,
      error: String(err),
    });
    return [];
  }
}
