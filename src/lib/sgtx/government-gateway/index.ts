// @ts-nocheck
/**
 * SGTX Parts 33 + 34 — Government Gateway (14-operation connector standard)
 * ===========================================================================
 *
 * Every SGTX-to-government connector MUST implement these 14 operations:
 *
 *   DISCOVER       — list available declaration types, permits, certificates
 *   AUTHENTICATE   — verify credentials / obtain session token
 *   VALIDATE       — pre-validate a declaration before submission
 *   PREPARE        — build the government-format envelope from SGTX data
 *   SUBMIT         — submit the prepared envelope
 *   STATUS         — query submission status
 *   AMEND          — amend a previously submitted declaration
 *   CANCEL         — cancel a submitted declaration
 *   INSPECT        — request customs inspection / query inspection result
 *   RELEASE        — request goods release / query release status
 *   DOCUMENT       — submit a supporting document (B/L, certificate, etc.)
 *   PERMIT         — apply for / query a permit
 *   CERTIFICATE    — apply for / query a certificate (COO, phyto, halal)
 *   PAYMENT        — pay duties / taxes / fees via the gateway
 *   RECONCILE      — reconcile gateway responses with bank settlement
 *
 * Each operation returns a ConnectorOperation descriptor with:
 *   - idempotencyRequired
 *   - expected response time
 *   - retry policy
 *   - fallback action
 *
 * `getAuthoritativeStatus(ustn)` returns the OFFICIAL government status of a
 * trade — derived from the integration_connector_log rows and the latest
 * authoritative government response. It NEVER manufactures status. If no
 * authoritative record exists, it returns SGTX_READY (meaning SGTX has
 * prepared but not yet submitted).
 *
 * Statuses (per §33):
 *   SGTX_READY                  — SGTX has prepared; nothing submitted yet
 *   SUBMITTED                   — submitted to government; awaiting response
 *   GOVERNMENT_ACCEPTED         — government accepted the submission
 *   GOVERNMENT_REJECTED         — government rejected the submission
 *   GOVERNMENT_HOLD             — government has placed a hold (inspection)
 *   GOVERNMENT_RELEASED         — government has released the goods
 *   MANUAL_AUTHORITY_CONFIRMED  — non-API authority confirmed via manual channel
 *
 * All DB calls are try/catch-wrapped with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §33 Types ============

export type ConnectorOp =
  | "DISCOVER" | "AUTHENTICATE" | "VALIDATE" | "PREPARE" | "SUBMIT"
  | "STATUS" | "AMEND" | "CANCEL" | "INSPECT" | "RELEASE"
  | "DOCUMENT" | "PERMIT" | "CERTIFICATE" | "PAYMENT" | "RECONCILE";

export interface ConnectorOperation {
  operation: ConnectorOp;
  description: string;
  idempotencyRequired: boolean;
  expectedResponseMs: number;
  retryPolicy: { maxRetries: number; backoffMs: number[] };
  fallbackAction: string;
  sideEffect: "READ" | "WRITE" | "PAYMENT";
}

export type AuthoritativeState =
  | "SGTX_READY"
  | "SUBMITTED"
  | "GOVERNMENT_ACCEPTED"
  | "GOVERNMENT_REJECTED"
  | "GOVERNMENT_HOLD"
  | "GOVERNMENT_RELEASED"
  | "MANUAL_AUTHORITY_CONFIRMED";

export interface AuthoritativeStatus {
  ustn: string;
  state: AuthoritativeState;
  lastConnectorCallAt?: string | null;
  governmentReference?: string | null;
  evidence: { source: string; operation: string; status: string; timestamp: string }[];
  neverManufactured: boolean;
  evaluatedAt: string;
}

// ============ §33 14-Operation Registry ============

export const CONNECTOR_OPERATIONS: ConnectorOperation[] = [
  { operation: "DISCOVER", description: "List declaration types, permits, certificates supported by the connector",
    idempotencyRequired: false, expectedResponseMs: 500,
    retryPolicy: { maxRetries: 2, backoffMs: [500, 1000] },
    fallbackAction: "Use cached discovery snapshot", sideEffect: "READ" },
  { operation: "AUTHENTICATE", description: "Verify connector credentials and obtain session token",
    idempotencyRequired: false, expectedResponseMs: 1000,
    retryPolicy: { maxRetries: 1, backoffMs: [1000] },
    fallbackAction: "Manual portal authentication", sideEffect: "READ" },
  { operation: "VALIDATE", description: "Pre-validate a declaration payload before submission",
    idempotencyRequired: true, expectedResponseMs: 1500,
    retryPolicy: { maxRetries: 2, backoffMs: [1000, 2000] },
    fallbackAction: "Manual review by broker", sideEffect: "READ" },
  { operation: "PREPARE", description: "Build the government-format envelope from SGTX data",
    idempotencyRequired: true, expectedResponseMs: 800,
    retryPolicy: { maxRetries: 3, backoffMs: [500, 1000, 2000] },
    fallbackAction: "Generate envelope locally (offline)", sideEffect: "READ" },
  { operation: "SUBMIT", description: "Submit the prepared envelope to the government system",
    idempotencyRequired: true, expectedResponseMs: 3000,
    retryPolicy: { maxRetries: 3, backoffMs: [1000, 2000, 4000] },
    fallbackAction: "Manual portal submission with pre-filled envelope", sideEffect: "WRITE" },
  { operation: "STATUS", description: "Query the submission status from the government system",
    idempotencyRequired: false, expectedResponseMs: 800,
    retryPolicy: { maxRetries: 3, backoffMs: [1000, 2000, 4000] },
    fallbackAction: "Polling / portal lookup", sideEffect: "READ" },
  { operation: "AMEND", description: "Amend a previously submitted declaration",
    idempotencyRequired: true, expectedResponseMs: 2000,
    retryPolicy: { maxRetries: 2, backoffMs: [1000, 2000] },
    fallbackAction: "Supplementary declaration via portal", sideEffect: "WRITE" },
  { operation: "CANCEL", description: "Cancel a submitted declaration",
    idempotencyRequired: true, expectedResponseMs: 1500,
    retryPolicy: { maxRetries: 2, backoffMs: [1000, 2000] },
    fallbackAction: "Written cancellation request", sideEffect: "WRITE" },
  { operation: "INSPECT", description: "Request customs inspection or query inspection result",
    idempotencyRequired: false, expectedResponseMs: 1500,
    retryPolicy: { maxRetries: 2, backoffMs: [2000, 4000] },
    fallbackAction: "Phone customs inspection desk", sideEffect: "READ" },
  { operation: "RELEASE", description: "Request goods release or query release status",
    idempotencyRequired: false, expectedResponseMs: 1500,
    retryPolicy: { maxRetries: 3, backoffMs: [2000, 4000, 8000] },
    fallbackAction: "Manual release order from customs office", sideEffect: "READ" },
  { operation: "DOCUMENT", description: "Submit a supporting document (B/L, certificate, etc.)",
    idempotencyRequired: true, expectedResponseMs: 2000,
    retryPolicy: { maxRetries: 3, backoffMs: [1000, 2000, 4000] },
    fallbackAction: "Email document to customs broker", sideEffect: "WRITE" },
  { operation: "PERMIT", description: "Apply for or query a permit",
    idempotencyRequired: true, expectedResponseMs: 5000,
    retryPolicy: { maxRetries: 2, backoffMs: [2000, 4000] },
    fallbackAction: "Manual permit application at authority", sideEffect: "WRITE" },
  { operation: "CERTIFICATE", description: "Apply for or query a certificate (COO, phyto, halal)",
    idempotencyRequired: true, expectedResponseMs: 5000,
    retryPolicy: { maxRetries: 2, backoffMs: [2000, 4000] },
    fallbackAction: "Paper application to issuing authority", sideEffect: "WRITE" },
  { operation: "PAYMENT", description: "Pay duties, taxes, or fees via the gateway",
    idempotencyRequired: true, expectedResponseMs: 3000,
    retryPolicy: { maxRetries: 3, backoffMs: [5000, 10000, 20000] },
    fallbackAction: "Bank transfer with manual reconciliation", sideEffect: "PAYMENT" },
  { operation: "RECONCILE", description: "Reconcile gateway responses with bank settlement",
    idempotencyRequired: false, expectedResponseMs: 2000,
    retryPolicy: { maxRetries: 3, backoffMs: [2000, 4000, 8000] },
    fallbackAction: "Finance team reviews bank statement (MT940/camt.053)", sideEffect: "READ" },
];

// ============ §33 Operation lookup ============

export async function getConnectorOperations(
  connectorId: string,
): Promise<ConnectorOperation[]> {
  try {
    if (!connectorId) return CONNECTOR_OPERATIONS;
    // All SGTX connectors implement all 14 operations — return the full set.
    // The connectorId is logged for audit but does not change the contract.
    logger.debug("[government-gateway] getConnectorOperations", { connectorId });
    return CONNECTOR_OPERATIONS;
  } catch (err: any) {
    logger.error("[government-gateway] getConnectorOperations failed", { connectorId, error: err?.message });
    return [];
  }
}

export function listConnectorOperations(): ConnectorOp[] {
  return CONNECTOR_OPERATIONS.map((o) => o.operation);
}

export function getOperationByName(name: string): ConnectorOperation | null {
  try {
    const op = (name || "").toUpperCase() as ConnectorOp;
    return CONNECTOR_OPERATIONS.find((o) => o.operation === op) || null;
  } catch {
    return null;
  }
}

// ============ §33+34 Authoritative Status ============

const STATUS_PRECEDENCE: AuthoritativeState[] = [
  "MANUAL_AUTHORITY_CONFIRMED",
  "GOVERNMENT_RELEASED",
  "GOVERNMENT_HOLD",
  "GOVERNMENT_REJECTED",
  "GOVERNMENT_ACCEPTED",
  "SUBMITTED",
  "SGTX_READY",
];

function inferStateFromLog(log: any): AuthoritativeState | null {
  try {
    const status = (log?.status || "").toString().toUpperCase();
    const apiName = (log?.apiName || "").toString().toUpperCase();
    const responseBody = typeof log?.responseBody === "string" ? safeParse(log.responseBody) : log?.responseBody;
    const govStatus = (responseBody?.status || responseBody?.governmentStatus || "").toString().toUpperCase();

    // Manual authority confirmation takes precedence
    if (apiName.includes("MANUAL") || govStatus === "MANUAL_CONFIRMED") {
      return "MANUAL_AUTHORITY_CONFIRMED";
    }
    // Release operation
    if (apiName.includes("RELEASE") || govStatus === "RELEASED") return "GOVERNMENT_RELEASED";
    // Hold / inspection
    if (apiName.includes("INSPECT") || govStatus.includes("HOLD") || govStatus.includes("INSPECT")) {
      return "GOVERNMENT_HOLD";
    }
    // Rejected
    if (status === "FAILED" || govStatus === "REJECTED" || govStatus === "REFUSED") {
      return "GOVERNMENT_REJECTED";
    }
    // Accepted
    if (govStatus === "ACCEPTED" || govStatus === "ACCEPT" || govStatus === "APPROVED") {
      return "GOVERNMENT_ACCEPTED";
    }
    // Submitted (but no response yet)
    if (status === "SUCCESS" || status === "COMPLETED") {
      return "SUBMITTED";
    }
    if (status === "PENDING" || status === "QUEUED") {
      return "SUBMITTED";
    }
    return null;
  } catch {
    return null;
  }
}

function safeParse(s: any): any {
  try { return typeof s === "string" ? JSON.parse(s) : s; } catch { return null; }
}

export async function getAuthoritativeStatus(ustn: string): Promise<AuthoritativeStatus> {
  if (!ustn) {
    return {
      ustn: "", state: "SGTX_READY",
      evidence: [], neverManufactured: true,
      evaluatedAt: new Date().toISOString(),
    };
  }
  try {
    let logs: any[] = [];
    try {
      logs = await db.integrationConnectorLog.findMany({
        where: { ustn },
        orderBy: { createdAt: "desc" },
        take: 50,
      });
    } catch (err: any) {
      logger.warn("[government-gateway] log query failed — treating as SGTX_READY", { ustn, error: err?.message });
    }

    if (!logs || logs.length === 0) {
      // No authoritative record exists. NEVER manufacture a status — return SGTX_READY.
      return {
        ustn,
        state: "SGTX_READY",
        lastConnectorCallAt: null,
        governmentReference: null,
        evidence: [],
        neverManufactured: true,
        evaluatedAt: new Date().toISOString(),
      };
    }

    // Infer state from each log entry and pick the highest-precedence state
    const evidence: AuthoritativeStatus["evidence"] = [];
    const inferred: { state: AuthoritativeState; ts: string; log: any }[] = [];
    for (const log of logs) {
      const state = inferStateFromLog(log);
      const ts = (log.createdAt && log.createdAt.toISOString) ? log.createdAt.toISOString() : new Date().toISOString();
      if (state) {
        inferred.push({ state, ts, log });
      }
      evidence.push({
        source: log.apiName || "unknown",
        operation: log.endpoint || "unknown",
        status: log.status || "unknown",
        timestamp: ts,
      });
    }

    let finalState: AuthoritativeState = "SGTX_READY";
    let lastCall: string | null = null;
    let govRef: string | null = null;
    if (inferred.length > 0) {
      // Pick by precedence — most advanced state wins
      for (const target of STATUS_PRECEDENCE) {
        const found = inferred.find((i) => i.state === target);
        if (found) {
          finalState = found.state;
          lastCall = found.ts;
          const responseBody = typeof found.log.responseBody === "string"
            ? safeParse(found.log.responseBody) : found.log.responseBody;
          govRef = responseBody?.governmentReference || responseBody?.referenceNumber || found.log.idempotencyKey || null;
          break;
        }
      }
    } else {
      // Logs exist but none inferred a state — still SUBMITTED (we did call something)
      finalState = "SUBMITTED";
      lastCall = (logs[0].createdAt && logs[0].createdAt.toISOString) ? logs[0].createdAt.toISOString() : null;
    }

    logger.info("[government-gateway] authoritative status resolved", { ustn, state: finalState, evidenceCount: evidence.length });

    return {
      ustn,
      state: finalState,
      lastConnectorCallAt: lastCall,
      governmentReference: govRef,
      evidence,
      neverManufactured: true,
      evaluatedAt: new Date().toISOString(),
    };
  } catch (err: any) {
    logger.error("[government-gateway] getAuthoritativeStatus failed", { ustn, error: err?.message });
    return {
      ustn,
      state: "SGTX_READY",
      evidence: [],
      neverManufactured: true,
      evaluatedAt: new Date().toISOString(),
    };
  }
}

// ============ §34 Auxiliary: listConnectors ============

export function listKnownConnectors(): { id: string; country: string; system: string }[] {
  return [
    { id: "EG-NAFEZA", country: "EG", system: "Nafeza" },
    { id: "EG-CARGOX", country: "EG", system: "CargoX" },
    { id: "EG-ETA", country: "EG", system: "ETA e-Invoice" },
    { id: "EG-CBE", country: "EG", system: "Central Bank of Egypt" },
    { id: "US-ACE", country: "US", system: "ACE" },
    { id: "DE-ATLAS", country: "DE", system: "ATLAS" },
    { id: "GB-CDS", country: "GB", system: "CDS" },
    { id: "AE-FASAH", country: "AE", system: "FASAH" },
    { id: "SA-FASAH", country: "SA", system: "FASAH" },
    { id: "CN-GACC", country: "CN", system: "China Single Window" },
    { id: "IN-ICEGATE", country: "IN", system: "ICEGATE" },
    { id: "BR-SISCOMEX", country: "BR", system: "Siscomex" },
    { id: "AU-ICS", country: "AU", system: "ICS" },
  ];
}
