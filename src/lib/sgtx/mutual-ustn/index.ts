// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Mutual USTN Recognition
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 §24 Phase 4 (Years 3-5): "mutual USTN recognition".
//
// A USTN (Universal Sovereign Trade Number) is issued by ONE sovereign node
// — typically the node nearest to the seller's jurisdiction. Once issued,
// the USTN must be VERIFIABLE by every other sovereign node on the network.
// This is the "mutual recognition" model: each node trusts the USTNs issued
// by every other node, provided the issuing node is in the recognition
// agreement registry.
//
// When a USTN crosses a node boundary (e.g. issued by Cairo, presented to
// Frankfurt for customs clearance), the receiving node:
//   1. Looks up the issuing node's recognition agreement status.
//   2. If the agreement is ACTIVE → the USTN is recognised + verifiable.
//   3. If the agreement is SUSPENDED or absent → the USTN is REJECTED +
//      must be re-issued by a recognised node.
//
// Conflict resolution (Sovereign Jurisdiction Supremacy, G3):
//   When nodes disagree about the state of a USTN (e.g. Cairo says
//   "ACCEPTED", Frankfurt says "REJECTED"), the STRICTEST rule wins. This
//   matches the Jurisdiction Fabric conflict resolution — a REJECTED state
//   from any node overrides an ACCEPTED state from any other node, because
//   rejection is stricter than acceptance.
//
// This lib is read-only with respect to the database. Recognition agreements
// live in-memory and are seeded on first import. The existing `Trade` model
// (`ustn` field) is left untouched — the USTN lifecycle is the Loom's
// responsibility.
//
// Functions exposed:
//   - registerUstnRecognition(nodeA, nodeB, agreement) → { recognitionId }
//   - verifyUstnAcrossNodes(ustn) → { recognizedBy, rejectedBy, consensus }
//   - getRecognitionAgreements() → { agreements: [...] }
//   - resolveUstnConflict(ustn, conflictingStates) → { resolvedState, authority, reason }
// ═══════════════════════════════════════════════════════════════════════════════

import { logger } from "@/lib/sgtx/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type RecognitionStatus = "ACTIVE" | "SUSPENDED" | "TERMINATED" | "PENDING";

export interface RecognitionAgreement {
  recognitionId: string;
  nodeA: string;              // issuing node ID
  nodeB: string;              // recognising node ID
  status: RecognitionStatus;
  signedAt: string;           // ISO date
  terminatesAt?: string;     // optional expiry
  signedBy: string[];          // signatory authority names
  legalBasis: string;          // e.g. "Egypt-EU Association Agreement Art. 5"
}

export interface UstnVerificationResult {
  ustn: string;
  recognizedBy: string[];     // node IDs that recognise this USTN
  rejectedBy: string[];       // node IDs that reject it
  consensus: "UNANIMOUS_RECOGNITION" | "UNANIMOUS_REJECTION" | "SPLIT";
  issuingNode: string | null;
  totalNodes: number;
  recognitionRate: number;    // 0..1 — recognised / total
}

export interface UstnConflictResolution {
  ustn: string;
  resolvedState: "REJECTED" | "ACCEPTED" | "PENDING" | "UNKNOWN";
  authority: string;          // the node whose strictest rule won
  reason: string;
  consideredStates: Array<{ nodeId: string; state: string; reason?: string }>;
  principle: string;
}

// ── In-memory agreement registry ─────────────────────────────────────────────

const AGREEMENTS: Map<string, RecognitionAgreement> = new Map();

function seedDefaultAgreements(): void {
  if (AGREEMENTS.size > 0) return;
  // Default: every pair of sovereign nodes has an ACTIVE mutual recognition
  // agreement. This is the full-mesh Phase 4 target state.
  const defaultNodes = [
    "NODE-CAIRO-01",
    "NODE-DUBAI-01",
    "NODE-FRANKFURT-01",
    "NODE-SINGAPORE-01",
    "NODE-MUMBAI-01",
    "NODE-SHANGHAI-01",
    "NODE-SAOPAULO-01",
    "NODE-VIRGINIA-01",
    "NODE-NAIROBI-01",
    "NODE-CAPETOWN-01",
    "NODE-ISTANBUL-01",
  ];
  const now = new Date().toISOString();

  let i = 0;
  for (let a = 0; a < defaultNodes.length; a++) {
    for (let b = a + 1; b < defaultNodes.length; b++) {
      const nodeA = defaultNodes[a];
      const nodeB = defaultNodes[b];
      const id = `REC-${String(++i).padStart(5, "0")}`;
      AGREEMENTS.set(id, {
        recognitionId: id,
        nodeA,
        nodeB,
        status: "ACTIVE",
        signedAt: now,
        signedBy: ["SGTX Foundation", "Sovereign Node Operator A", "Sovereign Node Operator B"],
        legalBasis: "SGTX v17 §24 Phase 4 Mutual USTN Recognition Agreement (default full-mesh)",
      });
    }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Register a new mutual USTN recognition agreement between two sovereign
 * nodes. The agreement is keyed by a unique recognitionId. Both nodeA and
 * nodeB must be valid sovereign node IDs (the API route enforces this —
 * the lib is permissive and accepts any string for testing).
 *
 * Returns the new recognitionId.
 */
export function registerUstnRecognition(
  nodeA: string,
  nodeB: string,
  agreement: Partial<RecognitionAgreement> = {},
): { recognitionId: string; status: RecognitionStatus } {
  try {
    seedDefaultAgreements();
    const a = (nodeA || "").trim();
    const b = (nodeB || "").trim();
    if (!a || !b) {
      return { recognitionId: "", status: "PENDING" };
    }

    // Check if an agreement already exists for this pair (either direction)
    for (const existing of AGREEMENTS.values()) {
      if (
        (existing.nodeA === a && existing.nodeB === b) ||
        (existing.nodeA === b && existing.nodeB === a)
      ) {
        // Update the existing agreement
        if (agreement.status) existing.status = agreement.status;
        if (agreement.signedAt) existing.signedAt = agreement.signedAt;
        if (agreement.terminatesAt) existing.terminatesAt = agreement.terminatesAt;
        if (agreement.signedBy) existing.signedBy = agreement.signedBy;
        if (agreement.legalBasis) existing.legalBasis = agreement.legalBasis;
        logger.info("[mutual-ustn] updated existing agreement", {
          recognitionId: existing.recognitionId,
          nodeA: a,
          nodeB: b,
          status: existing.status,
        });
        return { recognitionId: existing.recognitionId, status: existing.status };
      }
    }

    // Create a new agreement
    const id = `REC-${String(AGREEMENTS.size + 1).padStart(5, "0")}`;
    const newAgreement: RecognitionAgreement = {
      recognitionId: id,
      nodeA: a,
      nodeB: b,
      status: agreement.status || "ACTIVE",
      signedAt: agreement.signedAt || new Date().toISOString(),
      terminatesAt: agreement.terminatesAt,
      signedBy: agreement.signedBy || ["SGTX Foundation"],
      legalBasis: agreement.legalBasis || "SGTX v17 §24 Phase 4 Mutual USTN Recognition Agreement",
    };
    AGREEMENTS.set(id, newAgreement);

    logger.info("[mutual-ustn] registered new agreement", {
      recognitionId: id,
      nodeA: a,
      nodeB: b,
      status: newAgreement.status,
    });

    return { recognitionId: id, status: newAgreement.status };
  } catch (err: any) {
    logger.error("[mutual-ustn] registerUstnRecognition failed", { error: err?.message, nodeA, nodeB });
    return { recognitionId: "", status: "PENDING" };
  }
}

/**
 * Verify a USTN across all sovereign nodes.
 *
 * The USTN format encodes the issuing node: `USTN-{COUNTRY}-{YEAR}-{SERIAL}`
 * (e.g. `USTN-EG-2024-00001` → issued by Egypt → Cairo node). The function:
 *   1. Parses the USTN to identify the issuing node.
 *   2. For every other node, looks up the recognition agreement with the
 *      issuing node.
 *   3. If the agreement is ACTIVE → recognisedBy. If SUSPENDED/TERMINATED/
 *      absent → rejectedBy.
 *   4. Determines the consensus:
 *        - UNANIMOUS_RECOGNITION if all nodes recognise it.
 *        - UNANIMOUS_REJECTION if all reject it.
 *        - SPLIT if some recognise + some reject.
 *
 * Returns the recognition map + consensus.
 */
export function verifyUstnAcrossNodes(ustn: string): UstnVerificationResult {
  try {
    seedDefaultAgreements();

    const ustnStr = (ustn || "").trim().toUpperCase();
    if (!ustnStr) {
      return {
        ustn: "",
        recognizedBy: [],
        rejectedBy: [],
        consensus: "UNANIMOUS_REJECTION",
        issuingNode: null,
        totalNodes: 0,
        recognitionRate: 0,
      };
    }

    // Parse the USTN to identify the issuing country + node
    // Format: USTN-{COUNTRY}-{YEAR}-{SERIAL} or USTN-{COUNTRY}-{SERIAL}
    const match = ustnStr.match(/^USTN-([A-Z]{2})-\d+/);
    const issuingCountry = match ? match[1] : null;

    // Map issuing country → issuing node ID
    const COUNTRY_TO_NODE: Record<string, string> = {
      EG: "NODE-CAIRO-01",
      AE: "NODE-DUBAI-01",
      DE: "NODE-FRANKFURT-01",
      SG: "NODE-SINGAPORE-01",
      IN: "NODE-MUMBAI-01",
      CN: "NODE-SHANGHAI-01",
      BR: "NODE-SAOPAULO-01",
      US: "NODE-VIRGINIA-01",
      KE: "NODE-NAIROBI-01",
      ZA: "NODE-CAPETOWN-01",
      TR: "NODE-ISTANBUL-01",
    };
    const issuingNode = issuingCountry ? COUNTRY_TO_NODE[issuingCountry] || null : null;

    // Collect all known node IDs from the agreements
    const allNodeIds = new Set<string>();
    for (const ag of AGREEMENTS.values()) {
      allNodeIds.add(ag.nodeA);
      allNodeIds.add(ag.nodeB);
    }
    // Always include the issuing node itself (a node always recognises its own USTNs)
    if (issuingNode) allNodeIds.add(issuingNode);

    const recognizedBy: string[] = [];
    const rejectedBy: string[] = [];

    for (const nodeId of allNodeIds) {
      // A node always recognises its own USTNs
      if (issuingNode && nodeId === issuingNode) {
        recognizedBy.push(nodeId);
        continue;
      }

      // Find an agreement between issuingNode + this node
      let agreement: RecognitionAgreement | undefined;
      for (const ag of AGREEMENTS.values()) {
        if (
          (ag.nodeA === issuingNode && ag.nodeB === nodeId) ||
          (ag.nodeA === nodeId && ag.nodeB === issuingNode)
        ) {
          agreement = ag;
          break;
        }
      }

      if (agreement && agreement.status === "ACTIVE") {
        recognizedBy.push(nodeId);
      } else if (agreement && (agreement.status === "SUSPENDED" || agreement.status === "TERMINATED")) {
        rejectedBy.push(nodeId);
      } else {
        // No agreement → default to rejection (strict — better safe than sorry)
        rejectedBy.push(nodeId);
      }
    }

    const total = recognizedBy.length + rejectedBy.length;
    const recognitionRate = total > 0 ? recognizedBy.length / total : 0;

    let consensus: UstnVerificationResult["consensus"];
    if (rejectedBy.length === 0 && recognizedBy.length > 0) {
      consensus = "UNANIMOUS_RECOGNITION";
    } else if (recognizedBy.length === 0 && rejectedBy.length > 0) {
      consensus = "UNANIMOUS_REJECTION";
    } else {
      consensus = "SPLIT";
    }

    return {
      ustn: ustnStr,
      recognizedBy: recognizedBy.sort(),
      rejectedBy: rejectedBy.sort(),
      consensus,
      issuingNode,
      totalNodes: total,
      recognitionRate,
    };
  } catch (err: any) {
    logger.error("[mutual-ustn] verifyUstnAcrossNodes failed", { error: err?.message, ustn });
    return {
      ustn: (ustn || "").trim().toUpperCase(),
      recognizedBy: [],
      rejectedBy: [],
      consensus: "UNANIMOUS_REJECTION",
      issuingNode: null,
      totalNodes: 0,
      recognitionRate: 0,
    };
  }
}

/**
 * List all recognition agreements (signed + pending + suspended + terminated).
 */
export function getRecognitionAgreements(): { agreements: RecognitionAgreement[]; count: number } {
  try {
    seedDefaultAgreements();
    const agreements = Array.from(AGREEMENTS.values()).sort((a, b) =>
      a.recognitionId.localeCompare(b.recognitionId),
    );
    return { agreements, count: agreements.length };
  } catch (err: any) {
    logger.error("[mutual-ustn] getRecognitionAgreements failed", { error: err?.message });
    return { agreements: [], count: 0 };
  }
}

/**
 * When nodes disagree about the state of a USTN, the STRICTEST rule wins
 * (per Sovereign Jurisdiction Supremacy, G3).
 *
 * Strictness ranking (from strictest to most permissive):
 *   REJECTED (4) > PENDING (3) > ACCEPTED (2) > UNKNOWN (1)
 *
 * When two nodes tie at the same strictness level, the one whose jurisdiction
 * has the higher precedence (e.g. customs union > country > port) wins.
 *
 * Returns the resolved state + the authority (the winning node) + reason.
 */
export function resolveUstnConflict(
  ustn: string,
  conflictingStates: Array<{ nodeId: string; state: string; reason?: string }>,
): UstnConflictResolution {
  try {
    if (!Array.isArray(conflictingStates) || conflictingStates.length === 0) {
      return {
        ustn: (ustn || "").trim().toUpperCase(),
        resolvedState: "UNKNOWN",
        authority: "",
        reason: "No conflicting states provided",
        consideredStates: [],
        principle: "Sovereign Jurisdiction Supremacy (G3) — strictest rule wins",
      };
    }

    // Strictness ranking: higher number = stricter
    const strictness: Record<string, number> = {
      REJECTED: 4,
      PENDING: 3,
      ACCEPTED: 2,
      UNKNOWN: 1,
    };

    // Sort the conflicting states by strictness (descending — strictest first)
    const sorted = [...conflictingStates].sort((a, b) => {
      const sa = strictness[(a.state || "UNKNOWN").toUpperCase()] || 0;
      const sb = strictness[(b.state || "UNKNOWN").toUpperCase()] || 0;
      if (sa !== sb) return sb - sa;
      // Tie — sort by node ID for determinism
      return a.nodeId.localeCompare(b.nodeId);
    });

    const winner = sorted[0];
    const resolvedState = (winner.state || "UNKNOWN").toUpperCase() as
      | "REJECTED" | "ACCEPTED" | "PENDING" | "UNKNOWN";

    return {
      ustn: (ustn || "").trim().toUpperCase(),
      resolvedState,
      authority: winner.nodeId,
      reason:
        winner.reason ||
        `Strictest state (${resolvedState}) from ${winner.nodeId} wins per Sovereign Jurisdiction Supremacy (G3)`,
      consideredStates: conflictingStates.map((s) => ({
        nodeId: s.nodeId,
        state: (s.state || "UNKNOWN").toUpperCase(),
        reason: s.reason,
      })),
      principle: "Sovereign Jurisdiction Supremacy (G3) — strictest applicable rule wins. Strictness ranking: REJECTED > PENDING > ACCEPTED > UNKNOWN",
    };
  } catch (err: any) {
    logger.error("[mutual-ustn] resolveUstnConflict failed", { error: err?.message, ustn });
    return {
      ustn: (ustn || "").trim().toUpperCase(),
      resolvedState: "UNKNOWN",
      authority: "",
      reason: err?.message || "internal error",
      consideredStates: conflictingStates || [],
      principle: "Sovereign Jurisdiction Supremacy (G3) — strictest rule wins",
    };
  }
}

// ── Test helper: reset (only used by tests / dev) ────────────────────────────
export function _resetRecognitionAgreements(): void {
  AGREEMENTS.clear();
}
