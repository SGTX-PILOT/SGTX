// @ts-nocheck
/**
 * SGTX Master Amendment — §90 Dispute Packet Assembler
 * ===========================================================================
 *
 * Implements the §90 Dispute Packet — a single, self-contained forensic
 * packet assembled from every available source of evidence for a USTN,
 * ready for submission to an external authority (court, arbitrator,
 * regulator, ODR platform, bank dispute desk).
 *
 * §90 — A dispute packet contains:
 *   - transactionHistory  — full canonical event spine
 *   - timeline            — human-readable chronology
 *   - contractReferences   — contract IDs + versions + clauses
 *   - applicableClauses   — clauses invoked by the dispute
 *   - documents           — sealed document set
 *   - signatures          — signature proofs
 *   - bankPaymentEvents   — bank-side payment records
 *   - logisticsEvidence   — GPS, AIS, telematics, warehouse receipts
 *   - authorityEvents     — customs, regulator, court rulings
 *   - reconciliationDiscrepancies — any unmatched records
 *   - stateChanges        — state vector deltas
 *   - eventReasons        — explanation of why each event happened
 *   - supportingEvidence  — additional evidence (photos, emails, invoices)
 *   - aiGeneratedSummary  — §AIV advisory summary (NON-BINDING)
 *   - sourceReferences    — pointers to vault entries for each piece
 *
 * §90 — The AI-generated summary is ADVISORY ONLY (§AIV). It cannot be
 * used as the sole basis for any binding decision — human review is
 * always required.
 *
 * Packet lifecycle: ASSEMBLED → REVIEWED → RESOLVED → ARCHIVED.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getEventHistory } from "@/lib/sgtx/event-spine";
import { getEntriesByUstn } from "@/lib/sgtx/recovery-vault";
import { getIdentifiersByUstn } from "@/lib/sgtx/external-identifier";
import { getExceptions } from "@/lib/sgtx/exception-engine";
import { getObligations } from "@/lib/sgtx/obligation-graph";
import { getPaymentLegs } from "@/lib/sgtx/settlement-orchestration";
import { getStateVector } from "@/lib/sgtx/state-vector";
import { getExposure } from "@/lib/sgtx/financial-exposure";

// ============ §90 Constants — packet lifecycle ============

/**
 * §90 — Dispute packet lifecycle states.
 */
export const PACKET_STATUSES = [
  "ASSEMBLED",   // freshly assembled, pending review
  "REVIEWED",    // reviewed by an operator, ready to submit
  "RESOLVED",    // dispute resolved (via settlement, ruling, withdrawal)
  "ARCHIVED",   // archived after resolution (post-closure observation elapsed)
] as const;

export type PacketStatus = (typeof PACKET_STATUSES)[number];

/**
 * §AIV — AI summary disclaimer (always prepended to the aiGeneratedSummary).
 */
export const AI_SUMMARY_DISCLAIMER =
  "ADVISORY ONLY — This AI-generated summary is non-binding and may not " +
  "be used as the sole basis for any binding decision (§AIV). Human review required.";

// ============ Types ============

export interface DisputePacketRow {
  id: string;
  packetId: string;
  ustn?: string | null;
  transactionHistory?: string | null;
  timeline?: string | null;
  contractReferences?: string | null;
  applicableClauses?: string | null;
  documents?: string | null;
  signatures?: string | null;
  bankPaymentEvents?: string | null;
  logisticsEvidence?: string | null;
  authorityEvents?: string | null;
  reconciliationDiscrepancies?: string | null;
  stateChanges?: string | null;
  eventReasons?: string | null;
  supportingEvidence?: string | null;
  aiGeneratedSummary?: string | null;
  sourceReferences?: string | null;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AssembledDisputePacket extends DisputePacketRow {
  computedSummary: {
    totalEvents: number;
    totalDocuments: number;
    totalPaymentLegs: number;
    totalExceptions: number;
    totalObligations: number;
    hasOpenExceptions: boolean;
    hasUnresolvedDisputes: boolean;
    hasReconciliationBreaks: boolean;
  };
}

// ============ §90.0 Pure helpers ============

/**
 * Pure: generate a packetId in the form:
 *   DP-{ustn8}-{YYYYMMDDHHMMSS}-{RANDOM6}
 */
export function generatePacketId(
  ustn?: string | null,
  when?: Date,
): string {
  const u = (ustn || "GLOBAL").slice(0, 8).toUpperCase();
  const t = when || new Date();
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const ts =
    `${t.getUTCFullYear()}${pad(t.getUTCMonth() + 1)}${pad(t.getUTCDate())}` +
    `${pad(t.getUTCHours())}${pad(t.getUTCMinutes())}${pad(t.getUTCSeconds())}`;
  const r = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `DP-${u}-${ts}-${r}`;
}

/**
 * Pure: parse a JSON-encoded packet field. Defensive — returns []
 * for arrays, {} for objects, "" for strings.
 */
export function parsePacketField(
  raw: unknown,
  as: "array" | "object" | "string" = "array",
): any {
  if (raw === null || raw === undefined) {
    return as === "array" ? [] : as === "object" ? {} : "";
  }
  if (Array.isArray(raw)) return as === "array" ? raw : as === "object" ? {} : "";
  if (typeof raw === "object") return as === "object" ? raw : as === "array" ? [] : "";
  if (typeof raw !== "string") return as === "array" ? [] : as === "object" ? {} : String(raw);
  try {
    const parsed = JSON.parse(raw);
    if (as === "array") return Array.isArray(parsed) ? parsed : [];
    if (as === "object") return parsed && typeof parsed === "object" ? parsed : {};
    return parsed;
  } catch {
    return as === "array" ? [] : as === "object" ? {} : raw;
  }
}

/**
 * Pure: build a human-readable timeline from a list of canonical events.
 * Returns an array of { timestamp, eventId, eventType, actor, notes }.
 */
export function buildTimeline(
  events: Array<{
    eventTime?: Date | string;
    eventId?: string;
    eventType?: string;
    actor?: string | null;
    notes?: string | null;
  }>,
): Array<{ timestamp: string; eventId: string; eventType: string; actor: string; notes: string }> {
  if (!Array.isArray(events)) return [];
  return events
    .map((e) => ({
      timestamp: e.eventTime instanceof Date ? e.eventTime.toISOString() : String(e.eventTime || ""),
      eventId: String(e.eventId || ""),
      eventType: String(e.eventType || ""),
      actor: String(e.actor || ""),
      notes: String(e.notes || ""),
    }))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

// ============ §90.1 assembleDisputePacket ============

/**
 * Assemble a dispute packet for a USTN by collecting every available
 * source of evidence:
 *
 *   - canonical event history → transactionHistory + timeline
 *   - recovery vault entries → supportingEvidence + sourceReferences
 *   - external identifiers  → contractReferences
 *   - exceptions             → eventReasons
 *   - obligations            → applicableClauses (from disputeCondition)
 *   - payment legs           → bankPaymentEvents
 *   - state vector           → stateChanges
 *   - financial exposure     → reconciliationDiscrepancies (if disputedAmount > 0)
 *
 * The assembled packet is persisted to the DisputePacket table with
 * status=ASSEMBLED.
 *
 * Returns the assembled packet (with computed summary), or null on error.
 */
export async function assembleDisputePacket(
  ustn: string,
): Promise<AssembledDisputePacket | null> {
  if (!ustn) return null;
  const packetId = generatePacketId(ustn);

  // Collect all sources in parallel-safe try/catch blocks
  let events: any[] = [];
  try {
    events = await getEventHistory(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getEventHistory failed", {
      error: String(err),
      ustn,
    });
  }

  let vaultEntries: any[] = [];
  try {
    vaultEntries = await getEntriesByUstn(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getEntriesByUstn failed", {
      error: String(err),
      ustn,
    });
  }

  let externalIds: any[] = [];
  try {
    externalIds = await getIdentifiersByUstn(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getIdentifiersByUstn failed", {
      error: String(err),
      ustn,
    });
  }

  let exceptions: any[] = [];
  try {
    exceptions = await getExceptions(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getExceptions failed", {
      error: String(err),
      ustn,
    });
  }

  let obligations: any[] = [];
  try {
    obligations = await getObligations(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getObligations failed", {
      error: String(err),
      ustn,
    });
  }

  let paymentLegs: any[] = [];
  try {
    paymentLegs = await getPaymentLegs(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getPaymentLegs failed", {
      error: String(err),
      ustn,
    });
  }

  let stateVector: any = null;
  try {
    stateVector = await getStateVector(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getStateVector failed", {
      error: String(err),
      ustn,
    });
  }

  let exposure: any = null;
  try {
    exposure = await getExposure(ustn);
  } catch (err) {
    logger.warn("[dispute-packet] getExposure failed", {
      error: String(err),
      ustn,
    });
  }

  // Build packet fields
  const timeline = buildTimeline(events);
  const contractReferences = externalIds.map((e) => ({
    type: e.identifierType,
    value: e.identifierValue,
    authority: e.issuingAuthority,
  }));
  const applicableClauses = obligations
    .filter((o) => o.disputeCondition || o.disputeCondition === "")
    .map((o) => ({
      obligationId: o.obligationId,
      type: o.obligationType,
      disputeCondition: o.disputeCondition,
      beneficiary: o.beneficiary,
    }));
  const documents = vaultEntries
    .filter((v) => v.entryType === "EVIDENCE" || v.entryType === "SETTLEMENT_CERTIFICATE")
    .map((v) => ({
      id: v.id,
      type: v.entryType,
      reference: v.entryReference,
      hash: v.entryHash,
    }));
  const signatures = vaultEntries
    .filter((v) => v.entryType === "AUTHORITY_DETERMINATION")
    .map((v) => ({
      id: v.id,
      reference: v.entryReference,
      hash: v.entryHash,
    }));
  const bankPaymentEvents = paymentLegs.map((p) => ({
    legId: p.legId,
    beneficiary: p.beneficiaryName,
    amount: p.amount,
    currency: p.currency,
    state: p.legState,
    bankRef: p.bankTransactionRef,
    executedAt: p.executionTimestamp,
  }));
  const authorityEvents = events.filter(
    (e) => e.authority && e.authority !== "SGTX",
  );
  const reconciliationDiscrepancies =
    exposure && exposure.disputedAmount > 0
      ? [{
          disputedAmount: exposure.disputedAmount,
          currency: exposure.currency,
          outstandingExposure: exposure.outstandingExposure,
          reopenedExposure: exposure.reopenedExposure,
        }]
      : [];
  const stateChanges = stateVector
    ? {
        execution: stateVector.execution,
        financial: stateVector.financial,
        documentary: stateVector.documentary,
        dispute: stateVector.dispute,
        exposure: stateVector.exposure,
        closure: stateVector.closure,
        finalityClass: stateVector.finalityClass,
        divergenceIndex: stateVector.divergenceIndex,
      }
    : {};
  const eventReasons = exceptions.map((e) => ({
    exceptionId: e.exceptionId,
    category: e.exceptionCategory,
    type: e.exceptionType,
    severity: e.severity,
    status: e.status,
    notes: e.resolutionNotes,
  }));
  const supportingEvidence = vaultEntries.map((v) => ({
    id: v.id,
    type: v.entryType,
    reference: v.entryReference,
    hash: v.entryHash,
    createdAt: v.createdAt,
  }));
  const sourceReferences = vaultEntries.map((v) => v.id);

  // Computed summary
  const computedSummary = {
    totalEvents: events.length,
    totalDocuments: documents.length,
    totalPaymentLegs: paymentLegs.length,
    totalExceptions: exceptions.length,
    totalObligations: obligations.length,
    hasOpenExceptions: exceptions.some((e) => e.status === "OPEN"),
    hasUnresolvedDisputes: exceptions.some(
      (e) => e.exceptionCategory === "EXECUTION" && e.status !== "RESOLVED",
    ),
    hasReconciliationBreaks:
      paymentLegs.some((p) => p.reconciliationStatus === "DIVERGENT") ||
      reconciliationDiscrepancies.length > 0,
  };

  try {
    const row = await db.disputePacket.create({
      data: {
        packetId,
        ustn,
        transactionHistory: JSON.stringify(events),
        timeline: JSON.stringify(timeline),
        contractReferences: JSON.stringify(contractReferences),
        applicableClauses: JSON.stringify(applicableClauses),
        documents: JSON.stringify(documents),
        signatures: JSON.stringify(signatures),
        bankPaymentEvents: JSON.stringify(bankPaymentEvents),
        logisticsEvidence: JSON.stringify(
          vaultEntries.filter((v) => v.entryType === "EVIDENCE"),
        ),
        authorityEvents: JSON.stringify(authorityEvents),
        reconciliationDiscrepancies: JSON.stringify(reconciliationDiscrepancies),
        stateChanges: JSON.stringify(stateChanges),
        eventReasons: JSON.stringify(eventReasons),
        supportingEvidence: JSON.stringify(supportingEvidence),
        aiGeneratedSummary: null, // set later via addAiSummary
        sourceReferences: JSON.stringify(sourceReferences),
        status: "ASSEMBLED",
      },
    });
    logger.info("[dispute-packet] packet assembled", {
      packetId,
      ustn,
      ...computedSummary,
    });
    return {
      ...(row as DisputePacketRow),
      computedSummary,
    } as AssembledDisputePacket;
  } catch (err) {
    logger.error("[dispute-packet] assembleDisputePacket create failed", {
      error: String(err),
      ustn,
      packetId,
    });
    return null;
  }
}

// ============ §90.2 getDisputePacket ============

/**
 * Get a dispute packet by its packetId. Returns null if not found.
 */
export async function getDisputePacket(
  packetId: string,
): Promise<DisputePacketRow | null> {
  if (!packetId) return null;
  try {
    const row = await db.disputePacket.findUnique({
      where: { packetId },
    });
    return (row as DisputePacketRow) || null;
  } catch (err) {
    logger.error("[dispute-packet] getDisputePacket failed", {
      error: String(err),
      packetId,
    });
    return null;
  }
}

// ============ §90.3 getDisputePacketsByUstn ============

/**
 * Get all dispute packets for a USTN, ordered by createdAt descending
 * (most recent first). Returns [] on error.
 */
export async function getDisputePacketsByUstn(
  ustn: string,
): Promise<DisputePacketRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.disputePacket.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return (rows as DisputePacketRow[]) || [];
  } catch (err) {
    logger.error("[dispute-packet] getDisputePacketsByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

// ============ §AIV addAiSummary ============

/**
 * §AIV — Add an AI-generated summary to a dispute packet. The summary
 * is ADVISORY ONLY — the disclaimer is prepended automatically so any
 * reader sees the non-binding notice.
 *
 * Returns the updated packet, or null on error.
 */
export async function addAiSummary(
  packetId: string,
  summary: string,
  metadata?: { model?: string; generatedAt?: Date; confidence?: number },
): Promise<DisputePacketRow | null> {
  if (!packetId || !summary) return null;
  const fullSummary = `${AI_SUMMARY_DISCLAIMER}\n\n---\n\nSummary (model=${metadata?.model || "unknown"}, generated=${(metadata?.generatedAt || new Date()).toISOString()}, confidence=${metadata?.confidence ?? "n/a"}):\n\n${summary}`;
  try {
    const updated = await db.disputePacket.update({
      where: { packetId },
      data: { aiGeneratedSummary: fullSummary },
    });
    logger.info("[dispute-packet] AI summary added (advisory)", {
      packetId,
      model: metadata?.model,
      confidence: metadata?.confidence,
    });
    return updated as DisputePacketRow;
  } catch (err) {
    logger.error("[dispute-packet] addAiSummary failed", {
      error: String(err),
      packetId,
    });
    return null;
  }
}

/**
 * Update a dispute packet's status (ASSEMBLED → REVIEWED → RESOLVED → ARCHIVED).
 * Validates the lifecycle transition.
 */
export async function updatePacketStatus(
  packetId: string,
  newStatus: string,
): Promise<DisputePacketRow | null> {
  if (!packetId || !newStatus) return null;
  if (!PACKET_STATUSES.includes(newStatus as PacketStatus)) {
    logger.warn("[dispute-packet] unknown status", { newStatus });
    return null;
  }
  try {
    const current = (await db.disputePacket.findUnique({
      where: { packetId },
    })) as DisputePacketRow | null;
    if (!current) return null;
    // Validate transition
    const transitions: Record<string, string[]> = {
      ASSEMBLED: ["REVIEWED", "RESOLVED", "ARCHIVED"],
      REVIEWED: ["RESOLVED", "ARCHIVED"],
      RESOLVED: ["ARCHIVED"],
      ARCHIVED: [],
    };
    if (!transitions[current.status]?.includes(newStatus)) {
      logger.warn("[dispute-packet] invalid status transition", {
        packetId,
        from: current.status,
        to: newStatus,
      });
      return current;
    }
    const updated = await db.disputePacket.update({
      where: { packetId },
      data: { status: newStatus },
    });
    logger.info("[dispute-packet] packet status updated", {
      packetId,
      from: current.status,
      to: newStatus,
    });
    return updated as DisputePacketRow;
  } catch (err) {
    logger.error("[dispute-packet] updatePacketStatus failed", {
      error: String(err),
      packetId,
      newStatus,
    });
    return null;
  }
}
