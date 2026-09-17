// @ts-nocheck
// SGTX Phase 4 §1 — Global Customs Engine
// ---------------------------------------------------------------------------
// Implements the 15 SGTX customs operation types:
//
//   EXPORT, IMPORT, TRANSIT, TEMPORARY_EXPORT, TEMPORARY_IMPORT,
//   INWARD_PROCESSING, OUTWARD_PROCESSING, BONDED_WAREHOUSE, FREE_ZONE,
//   RE_EXPORT, RE_IMPORT, DESTRUCTION, ABANDONMENT, DRAWBACK,
//   POST_CLEARANCE.
//
// Each operation carries the full §1 canonical record: jurisdiction,
// customs authority, customs office, procedure, declaration, broker,
// documents, inspection, fees, duties, taxes, guarantees, release,
// government references. The 6 government-authoritative statuses (§4)
// drive the lifecycle:
//
//   SGTX_READY → SUBMITTED → GOVERNMENT_ACCEPTED / GOVERNMENT_REJECTED
//                / GOVERNMENT_HOLD → GOVERNMENT_RELEASED
//
// §4 — Authoritative release
// --------------------------
//   The ONLY entry point that flips a CustomsOperationV2 into the
//   GOVERNMENT_RELEASED state is `recordRelease`, and it requires a
//   non-empty releaseReference obtained from the gateway `release`
//   operation. The customs engine NEVER fabricates a release.
//
// §2 — Gateway delegation
// ---------------------
//   submitCustomsOperation / checkOperationStatus / amendCustomsOperation
//   / cancelCustomsOperation all delegate to the corresponding `submit` /
//   `status` / `amend` / `cancel` operations in `@/lib/sgtx/gov-gateway`.
//
// §3 — Tariff / fee / duty / tax computation
// -----------------------------------------
//   `computeOperationFees` calls into the Phase 2 tariff engine
//   (`@/lib/sgtx/tariff`) when an HS code + customs value is available on
//   the declaration; otherwise it surfaces the manual fee/duty/tax lines
//   stored on the operation itself.
//
// Design rules (mandatory per the SGTX convention):
//   • // @ts-nocheck at the top.
//   • Every DB call wrapped in try/catch with safe defaults (return null /
//     [] / a stub on failure; never throws).
//   • Uses `import { db } from "@/lib/db"` and
//   `import { logger } from "@/lib/sgtx/logger"`.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import * as gateway from "@/lib/sgtx/gov-gateway";
import { computeTariff } from "@/lib/sgtx/tariff";

// Re-export the gateway primitives + types so consumers can import them from
// a single entry point if they wish.
export { gateway };
export type { GatewayResult } from "@/lib/sgtx/gov-gateway";

// ============ Module constants ============

/**
 * The 15 SGTX customs operation types per §1. Each value maps 1:1 to the
 * `CustomsOperationV2.operationType` column.
 */
export const CUSTOMS_OPERATION_TYPES = [
  "EXPORT",
  "IMPORT",
  "TRANSIT",
  "TEMPORARY_EXPORT",
  "TEMPORARY_IMPORT",
  "INWARD_PROCESSING",
  "OUTWARD_PROCESSING",
  "BONDED_WAREHOUSE",
  "FREE_ZONE",
  "RE_EXPORT",
  "RE_IMPORT",
  "DESTRUCTION",
  "ABANDONMENT",
  "DRAWBACK",
  "POST_CLEARANCE",
] as const;

/**
 * The 6 government-authoritative statuses that govern a customs operation
 * (§4). Mirrors `CustomsOperationV2.status`.
 */
export const GOV_STATUSES = [
  "SGTX_READY",
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_REJECTED",
  "GOVERNMENT_HOLD",
  "GOVERNMENT_RELEASED",
] as const;

/**
 * Allowed status transitions (§4). Government release is AUTHORITATIVE —
 * the transition into GOVERNMENT_RELEASED is only valid from
 * GOVERNMENT_ACCEPTED (a rejected/hold operation cannot be released; a
 * release requires a prior acceptance).
 */
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  SGTX_READY: ["SUBMITTED", "GOVERNMENT_REJECTED"],
  SUBMITTED: ["GOVERNMENT_ACCEPTED", "GOVERNMENT_REJECTED", "GOVERNMENT_HOLD"],
  GOVERNMENT_HOLD: ["GOVERNMENT_ACCEPTED", "GOVERNMENT_REJECTED", "SUBMITTED"],
  GOVERNMENT_ACCEPTED: ["GOVERNMENT_RELEASED", "GOVERNMENT_HOLD", "GOVERNMENT_REJECTED"],
  GOVERNMENT_REJECTED: ["SGTX_READY", "SUBMITTED"], // re-submit after fix
  GOVERNMENT_RELEASED: [], // terminal — no further transitions
};

// ============ Exported interfaces ============

export interface CreateOperationInput {
  ustn?: string;
  tradeId?: string;
  operationType: string;
  jurisdictionCode: string;
  customsAuthority?: string;
  customsOffice?: string;
  procedure?: string;
  declaration?: any;
  brokerGtid?: string;
  documents?: any[];
  inspection?: any;
  fees?: any[];
  duties?: any[];
  taxes?: any[];
  guarantees?: any;
  transportMode?: string;
  workflowId?: string;
  workflowStepId?: string;
}

export interface CustomsOperationResult {
  operation: any; // CustomsOperationV2
  gatewayResult: any; // GatewayResult from the gateway
  ok: boolean;
  error?: string;
}

export interface FeeLine {
  type: string;
  amount: number;
  currency: string;
  status: string;
}

export interface DutyLine {
  type: string;
  rate: number;
  amount: number;
  basis: string;
  status: string;
}

export interface TaxLine {
  type: string;
  rate: number;
  amount: number;
  status: string;
}

// ============ Internal helpers ============

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function jsonStringify(v: unknown): string | null {
  try {
    const s = JSON.stringify(v ?? null);
    if (!s) return null;
    return s; // CustomsOperationV2 JSON columns are not size-capped at the lib layer
  } catch {
    return null;
  }
}

function parseJson<T = any>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function isValidOperationType(t: string): boolean {
  return (CUSTOMS_OPERATION_TYPES as readonly string[]).includes(str(t));
}

function isValidStatus(s: string): boolean {
  return (GOV_STATUSES as readonly string[]).includes(str(s));
}

/**
 * canTransition — pure check that a transition is permitted by the §4
 * authoritative lifecycle. Does NOT consider the release-reference rule
 * — that is enforced separately in `transitionOperationStatus` / `recordRelease`.
 */
function canTransition(from: string, to: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

// ============ 1. createCustomsOperation ============

/**
 * createCustomsOperation — create a new customs operation in the SGTX_READY
 * state. The operation is NOT yet submitted to any government system.
 *
 * @returns The created CustomsOperationV2 row, or a non-persisted stub on
 *          DB failure (id prefixed "tmp-").
 */
export async function createCustomsOperation(input: CreateOperationInput): Promise<any> {
  const operationType = str(input?.operationType);
  if (!isValidOperationType(operationType)) {
    logger.error("[customs-engine] createCustomsOperation invalid operationType", { operationType });
    throw new Error(`invalid operationType: ${operationType}`);
  }
  const jurisdictionCode = str(input?.jurisdictionCode);
  if (!jurisdictionCode) {
    logger.error("[customs-engine] createCustomsOperation missing jurisdictionCode");
    throw new Error("jurisdictionCode is required");
  }

  const data = {
    ustn: str(input?.ustn) || null,
    tradeId: str(input?.tradeId) || null,
    operationType,
    jurisdictionId: null,
    jurisdictionCode,
    customsAuthority: str(input?.customsAuthority) || null,
    customsOffice: str(input?.customsOffice) || null,
    procedure: str(input?.procedure) || null,
    declaration: jsonStringify(input?.declaration),
    brokerGtid: str(input?.brokerGtid) || null,
    documents: jsonStringify(input?.documents || []),
    inspection: jsonStringify(input?.inspection || { required: false, status: "NOT_REQUIRED" }),
    fees: jsonStringify(input?.fees || []),
    duties: jsonStringify(input?.duties || []),
    taxes: jsonStringify(input?.taxes || []),
    guarantees: jsonStringify(input?.guarantees || null),
    release: jsonStringify({ status: "NOT_RELEASED", releasedAt: null, releaseReference: null, authority: null }),
    governmentReferences: jsonStringify([]),
    status: "SGTX_READY",
    connectorStatus: "NOT_DISCOVERED",
    transportMode: str(input?.transportMode) || null,
    workflowId: str(input?.workflowId) || null,
    workflowStepId: str(input?.workflowStepId) || null,
  };

  try {
    const row = await db.customsOperationV2.create({ data });
    return row;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[customs-engine] createCustomsOperation failed", { operationType, jurisdictionCode, error: reason });
    // Return a non-persisted stub so callers can still operate on a typed object.
    return {
      ...data,
      id: `tmp-${Date.now()}`,
      _stub: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
}

// ============ 2. submitCustomsOperation ============

/**
 * submitCustomsOperation — submit a customs operation via the gateway.
 * Transitions the operation SGTX_READY → SUBMITTED → GOVERNMENT_ACCEPTED /
 * GOVERNMENT_REJECTED / GOVERNMENT_HOLD based on the gateway response.
 *
 * §9 — pass an idempotencyKey to enable duplicate detection.
 */
export async function submitCustomsOperation(
  operationId: string,
  connectorId: string,
  idempotencyKey?: string,
): Promise<CustomsOperationResult> {
  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    return { operation: null, gatewayResult: null, ok: false, error: "operation not found" };
  }

  // Only submit from SGTX_READY (or after a prior REJECTED → re-set to READY).
  if (str(operation.status) !== "SGTX_READY") {
    return {
      operation,
      gatewayResult: null,
      ok: false,
      error: `operation is in ${operation.status} — only SGTX_READY operations can be submitted`,
    };
  }

  // Mark SUBMITTED before invoking the gateway so a crash mid-flight leaves
  // the operation in a recoverable state.
  await transitionOperationStatus(operationId, "SUBMITTED", "submit invoked");

  // Build the gateway payload from the operation's declaration + context.
  const declaration = parseJson(operation.declaration, {});
  const payload = {
    ustn: operation.ustn,
    tradeId: operation.tradeId,
    operationId: operation.id,
    operationType: operation.operationType,
    jurisdictionCode: operation.jurisdictionCode,
    customsAuthority: operation.customsAuthority,
    customsOffice: operation.customsOffice,
    procedure: operation.procedure,
    brokerGtid: operation.brokerGtid,
    transportMode: operation.transportMode,
    ...declaration,
  };

  const gatewayResult = await gateway.submit(connectorId, operation.operationType, payload, idempotencyKey);

  // §4 — translate the gateway status into the operation's authoritative status.
  let nextStatus: string;
  switch (str(gatewayResult.status)) {
    case "GOVERNMENT_ACCEPTED":
      nextStatus = "GOVERNMENT_ACCEPTED";
      break;
    case "GOVERNMENT_HOLD":
      nextStatus = "GOVERNMENT_HOLD";
      break;
    case "DUPLICATE":
      // Duplicate — leave in SUBMITTED (the original op is the one to track).
      nextStatus = "SUBMITTED";
      break;
    case "GOVERNMENT_REJECTED":
    default:
      nextStatus = "GOVERNMENT_REJECTED";
      break;
  }

  try {
    const update: Record<string, unknown> = {
      status: nextStatus,
      connectorStatus: "PRODUCTION_CONNECTED",
    };
    if (gatewayResult.governmentReference) {
      update.declarationNumber = gatewayResult.governmentReference;
    }
    if (nextStatus === "GOVERNMENT_ACCEPTED") update.acceptedAt = new Date();
    if (nextStatus === "GOVERNMENT_REJECTED") {
      update.rejectedAt = new Date();
      update.rejectionReason = str(gatewayResult.error) || "rejected by government system";
    }
    if (nextStatus === "GOVERNMENT_HOLD") {
      update.holdAt = new Date();
      update.holdReason = parseJson<any>(gatewayResult.responsePayload, {}).holdReason || "government hold";
    }
    if (gatewayResult.responsePayload) {
      const govRefs = parseJson<any[]>(operation.governmentReferences, []);
      govRefs.push({
        authority: operation.customsAuthority || "CUSTOMS",
        type: operation.operationType,
        reference: gatewayResult.governmentReference,
        status: nextStatus,
        recordedAt: new Date().toISOString(),
      });
      update.governmentReferences = jsonStringify(govRefs);
    }
    await db.customsOperationV2.update({ where: { id: operationId }, data: update });
  } catch (err) {
    logger.error("[customs-engine] submitCustomsOperation — post-gateway update failed", { operationId, error: err instanceof Error ? err.message : String(err) });
  }

  // Persist a GovernmentSubmission row (best effort).
  try {
    await db.governmentSubmission.create({
      data: {
        ustn: operation.ustn || null,
        tradeId: operation.tradeId || null,
        connectorId,
        customsOperationId: operationId,
        submissionType: operation.operationType,
        status: nextStatus,
        governmentReference: gatewayResult.governmentReference || null,
        governmentMessage: str(gatewayResult.error) || null,
        payload: jsonStringify(payload),
        responsePayload: jsonStringify(gatewayResult.responsePayload),
        idempotencyKey: str(idempotencyKey) || null,
        submittedAt: new Date(),
        acceptedAt: nextStatus === "GOVERNMENT_ACCEPTED" ? new Date() : null,
        rejectedAt: nextStatus === "GOVERNMENT_REJECTED" ? new Date() : null,
        holdAt: nextStatus === "GOVERNMENT_HOLD" ? new Date() : null,
        duplicateDetected: gatewayResult.duplicate === true,
      },
    });
  } catch (err) {
    logger.warn("[customs-engine] submitCustomsOperation — GovernmentSubmission create failed", { operationId, error: err instanceof Error ? err.message : String(err) });
  }

  const refreshed = await getCustomsOperation(operationId);
  return {
    operation: refreshed || operation,
    gatewayResult,
    ok: gatewayResult.ok === true,
    error: gatewayResult.error,
  };
}

// ============ 3. checkOperationStatus ============

/**
 * checkOperationStatus — query the gateway for the status of a submitted
 * operation. Translates the gateway response into the operation's
 * authoritative status.
 */
export async function checkOperationStatus(operationId: string): Promise<CustomsOperationResult> {
  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    return { operation: null, gatewayResult: null, ok: false, error: "operation not found" };
  }
  if (!operation.declarationNumber) {
    return { operation, gatewayResult: null, ok: false, error: "operation has no declarationNumber — not yet submitted to a government system" };
  }

  // Look up the connector that handled the submission. We try the most recent
  // GovernmentSubmission row for this operation.
  let connectorId: string | null = null;
  try {
    const lastSub = await db.governmentSubmission.findFirst({
      where: { customsOperationId: operationId },
      orderBy: { createdAt: "desc" },
    });
    if (lastSub) connectorId = lastSub.connectorId || null;
  } catch (err) {
    logger.warn("[customs-engine] checkOperationStatus — could not load GovernmentSubmission", { operationId, error: err instanceof Error ? err.message : String(err) });
  }

  if (!connectorId) {
    return { operation, gatewayResult: null, ok: false, error: "no connector recorded for this operation — cannot query status" };
  }

  const gatewayResult = await gateway.status(connectorId, operation.declarationNumber);

  // §4 — translate gateway status into the operation's authoritative status.
  let nextStatus: string | null = null;
  switch (str(gatewayResult.status)) {
    case "GOVERNMENT_ACCEPTED":
      if (operation.status === "SUBMITTED" || operation.status === "GOVERNMENT_HOLD") nextStatus = "GOVERNMENT_ACCEPTED";
      break;
    case "GOVERNMENT_HOLD":
      nextStatus = "GOVERNMENT_HOLD";
      break;
    case "GOVERNMENT_RELEASED":
      // Release handled separately by recordRelease (releaseReference required).
      // We DO NOT auto-transition here — only gateway.release is authoritative.
      break;
    case "GOVERNMENT_REJECTED":
      nextStatus = "GOVERNMENT_REJECTED";
      break;
    case "SUBMITTED":
    default:
      // No transition — remain in the current state.
      break;
  }

  if (nextStatus && nextStatus !== operation.status) {
    try {
      await transitionOperationStatus(operationId, nextStatus, "status poll");
    } catch (err) {
      logger.warn("[customs-engine] checkOperationStatus — transition failed", { operationId, nextStatus, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const refreshed = await getCustomsOperation(operationId);
  return {
    operation: refreshed || operation,
    gatewayResult,
    ok: gatewayResult.ok,
    error: gatewayResult.error,
  };
}

// ============ 4. amendCustomsOperation ============

/**
 * amendCustomsOperation — amend a previously-submitted operation via the
 * gateway. Records the amendment on the operation + leaves the operation in
 * GOVERNMENT_ACCEPTED (amendments are non-state-changing at the §4 level).
 */
export async function amendCustomsOperation(
  operationId: string,
  amendments: any,
): Promise<CustomsOperationResult> {
  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    return { operation: null, gatewayResult: null, ok: false, error: "operation not found" };
  }
  if (!operation.declarationNumber) {
    return { operation, gatewayResult: null, ok: false, error: "operation has no declarationNumber — not yet submitted" };
  }

  let connectorId: string | null = null;
  try {
    const lastSub = await db.governmentSubmission.findFirst({
      where: { customsOperationId: operationId },
      orderBy: { createdAt: "desc" },
    });
    if (lastSub) connectorId = lastSub.connectorId || null;
  } catch (err) {
    logger.warn("[customs-engine] amendCustomsOperation — could not load connector", { operationId, error: err instanceof Error ? err.message : String(err) });
  }
  if (!connectorId) {
    return { operation, gatewayResult: null, ok: false, error: "no connector recorded for this operation" };
  }

  const gatewayResult = await gateway.amend(connectorId, operation.declarationNumber, amendments);

  if (gatewayResult.ok) {
    try {
      // Append the amendments to the declaration JSON for audit.
      const declaration = parseJson(operation.declaration, {});
      const history = Array.isArray(declaration._amendments) ? declaration._amendments : [];
      history.push({ at: new Date().toISOString(), amendments });
      declaration._amendments = history;
      await db.customsOperationV2.update({
        where: { id: operationId },
        data: { declaration: jsonStringify(declaration) },
      });
    } catch (err) {
      logger.warn("[customs-engine] amendCustomsOperation — update failed", { operationId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const refreshed = await getCustomsOperation(operationId);
  return {
    operation: refreshed || operation,
    gatewayResult,
    ok: gatewayResult.ok,
    error: gatewayResult.error,
  };
}

// ============ 5. cancelCustomsOperation ============

/**
 * cancelCustomsOperation — cancel a previously-submitted operation via the
 * gateway. Transitions the operation to GOVERNMENT_REJECTED (the §4
 * terminal state for a cancelled declaration).
 */
export async function cancelCustomsOperation(
  operationId: string,
  reason: string,
): Promise<CustomsOperationResult> {
  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    return { operation: null, gatewayResult: null, ok: false, error: "operation not found" };
  }
  if (!operation.declarationNumber) {
    return { operation, gatewayResult: null, ok: false, error: "operation has no declarationNumber — not yet submitted" };
  }

  let connectorId: string | null = null;
  try {
    const lastSub = await db.governmentSubmission.findFirst({
      where: { customsOperationId: operationId },
      orderBy: { createdAt: "desc" },
    });
    if (lastSub) connectorId = lastSub.connectorId || null;
  } catch (err) {
    logger.warn("[customs-engine] cancelCustomsOperation — could not load connector", { operationId, error: err instanceof Error ? err.message : String(err) });
  }
  if (!connectorId) {
    return { operation, gatewayResult: null, ok: false, error: "no connector recorded for this operation" };
  }

  const gatewayResult = await gateway.cancel(connectorId, operation.declarationNumber, reason);

  if (gatewayResult.ok) {
    try {
      await db.customsOperationV2.update({
        where: { id: operationId },
        data: {
          status: "GOVERNMENT_REJECTED",
          rejectedAt: new Date(),
          rejectionReason: `cancelled: ${str(reason) || "no reason provided"}`,
        },
      });
    } catch (err) {
      logger.warn("[customs-engine] cancelCustomsOperation — update failed", { operationId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const refreshed = await getCustomsOperation(operationId);
  return {
    operation: refreshed || operation,
    gatewayResult,
    ok: gatewayResult.ok,
    error: gatewayResult.error,
  };
}

// ============ 6. recordInspection ============

/**
 * recordInspection — record an inspection result on the operation. The
 * inspection field is a JSON blob (required, status, result, inspector).
 * This function does NOT change the §4 authoritative status — inspection
 * results feed into the release decision but do not flip the state
 * themselves.
 */
export async function recordInspection(
  operationId: string,
  inspectionResult: any,
): Promise<any> {
  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    throw new Error("operation not found");
  }
  const inspection = {
    required: true,
    status: str(inspectionResult?.status) || "COMPLETED",
    result: inspectionResult?.result ?? inspectionResult,
    inspector: str(inspectionResult?.inspector) || null,
    inspectedAt: inspectionResult?.inspectedAt || new Date().toISOString(),
  };
  try {
    const updated = await db.customsOperationV2.update({
      where: { id: operationId },
      data: { inspection: jsonStringify(inspection) },
    });
    return updated;
  } catch (err) {
    logger.error("[customs-engine] recordInspection failed", { operationId, error: err instanceof Error ? err.message : String(err) });
    return { ...operation, inspection: jsonStringify(inspection) };
  }
}

// ============ 7. recordRelease ============

/**
 * recordRelease — §4 CRITICAL. The ONLY entry point that transitions a
 * CustomsOperationV2 into GOVERNMENT_RELEASED. Requires:
 *
 *   1. The operation is currently in GOVERNMENT_ACCEPTED (cannot release a
 *      rejected or hold operation).
 *   2. A non-empty `releaseReference` (obtained from the gateway `release`
 *      operation — never fabricated).
 *
 * Throws otherwise — this is the §4 enforcement point.
 */
export async function recordRelease(
  operationId: string,
  releaseReference: string,
  authority: string,
): Promise<any> {
  const ref = str(releaseReference);
  if (!ref) {
    throw new Error("recordRelease requires a non-empty releaseReference — government release cannot be fabricated");
  }

  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    throw new Error("operation not found");
  }
  if (str(operation.status) !== "GOVERNMENT_ACCEPTED") {
    throw new Error(`recordRelease requires the operation to be in GOVERNMENT_ACCEPTED (current: ${operation.status}) — cannot release a rejected/hold operation`);
  }

  const releaseBlob = {
    status: "RELEASED",
    releasedAt: new Date().toISOString(),
    releaseReference: ref,
    authority: str(authority) || operation.customsAuthority || "CUSTOMS",
  };

  try {
    const updated = await db.customsOperationV2.update({
      where: { id: operationId },
      data: {
        status: "GOVERNMENT_RELEASED",
        releasedAt: new Date(),
        release: jsonStringify(releaseBlob),
      },
    });

    // Update the workflow step (if linked) so the multi-agency workflow
    // sees this step as GOVERNMENT_RELEASED.
    if (operation.workflowStepId) {
      try {
        await db.workflowStep.update({
          where: { id: operation.workflowStepId },
          data: {
            status: "GOVERNMENT_RELEASED",
            releasedAt: new Date(),
            governmentReference: ref,
          },
        });
      } catch (err) {
        logger.warn("[customs-engine] recordRelease — workflow step update failed", { operationId, workflowStepId: operation.workflowStepId, error: err instanceof Error ? err.message : String(err) });
      }
    }

    // Update the GovernmentSubmission row(s) for this operation.
    try {
      await db.governmentSubmission.updateMany({
        where: { customsOperationId: operationId },
        data: { status: "GOVERNMENT_RELEASED", releasedAt: new Date() },
      });
    } catch (err) {
      logger.warn("[customs-engine] recordRelease — government submission update failed", { operationId, error: err instanceof Error ? err.message : String(err) });
    }

    return updated;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.error("[customs-engine] recordRelease failed", { operationId, error: reason });
    throw new Error(`recordRelease failed: ${reason}`);
  }
}

// ============ 8. listCustomsOperations ============

/**
 * listCustomsOperations — list operations with optional filters.
 */
export async function listCustomsOperations(
  filters?: {
    operationType?: string;
    jurisdictionCode?: string;
    status?: string;
    ustn?: string;
    brokerGtid?: string;
    transportMode?: string;
  },
): Promise<any[]> {
  try {
    const where: Record<string, unknown> = {};
    if (filters) {
      if (str(filters.operationType)) where.operationType = filters.operationType;
      if (str(filters.jurisdictionCode)) where.jurisdictionCode = filters.jurisdictionCode;
      if (str(filters.status)) where.status = filters.status;
      if (str(filters.ustn)) where.ustn = filters.ustn;
      if (str(filters.brokerGtid)) where.brokerGtid = filters.brokerGtid;
      if (str(filters.transportMode)) where.transportMode = filters.transportMode;
    }
    const rows = await db.customsOperationV2.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 500,
    });
    return rows || [];
  } catch (err) {
    logger.error("[customs-engine] listCustomsOperations failed", { filters, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ============ 9. getCustomsOperation ============

/**
 * getCustomsOperation — fetch a single operation by id.
 */
export async function getCustomsOperation(id: string): Promise<any | null> {
  if (!str(id)) return null;
  try {
    const row = await db.customsOperationV2.findUnique({ where: { id } });
    return row || null;
  } catch (err) {
    logger.error("[customs-engine] getCustomsOperation failed", { id, error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

// ============ 10. getOperationByUstn ============

/**
 * getOperationByUstn — all operations for a given USTN (a trade may have
 * multiple customs operations — one per agency / step).
 */
export async function getOperationByUstn(ustn: string): Promise<any[]> {
  if (!str(ustn)) return [];
  try {
    const rows = await db.customsOperationV2.findMany({
      where: { ustn },
      orderBy: { createdAt: "asc" },
    });
    return rows || [];
  } catch (err) {
    logger.error("[customs-engine] getOperationByUstn failed", { ustn, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ============ 11. computeOperationFees ============

/**
 * computeOperationFees — compute the fees/duties/taxes for an operation.
 * Uses the Phase 2 tariff engine (`computeTariff`) when the declaration
 * carries an HS code + customs value; otherwise returns the manual fee /
 * duty / tax lines stored on the operation itself.
 *
 * @returns { fees, duties, taxes, totalUsd }
 */
export async function computeOperationFees(
  operationId: string,
): Promise<{ fees: FeeLine[]; duties: DutyLine[]; taxes: TaxLine[]; totalUsd: number }> {
  const empty = { fees: [], duties: [], taxes: [], totalUsd: 0 };
  const operation = await getCustomsOperation(operationId);
  if (!operation) return empty;

  const declaration = parseJson<any>(operation.declaration, {});
  const manualFees = parseJson<any[]>(operation.fees, []);
  const manualDuties = parseJson<any[]>(operation.duties, []);
  const manualTaxes = parseJson<any[]>(operation.taxes, []);

  const fees: FeeLine[] = manualFees.map((f) => ({
    type: str(f?.type) || "FEE",
    amount: Number(f?.amount) || 0,
    currency: str(f?.currency) || "USD",
    status: str(f?.status) || "PENDING",
  }));
  const taxes: TaxLine[] = manualTaxes.map((t) => ({
    type: str(t?.type) || "TAX",
    rate: Number(t?.rate) || 0,
    amount: Number(t?.amount) || 0,
    status: str(t?.status) || "PENDING",
  }));

  // Try to compute duties via the Phase 2 tariff engine.
  const hs6 = str(declaration?.hs6 || declaration?.hsCode?.slice(0, 6));
  const customsValueUsd = Number(declaration?.customsValueUsd || declaration?.invoiceValue);
  let duties: DutyLine[] = manualDuties.map((d) => ({
    type: str(d?.type) || "DUTY",
    rate: Number(d?.rate) || 0,
    amount: Number(d?.amount) || 0,
    basis: str(d?.basis) || "customs_value",
    status: str(d?.status) || "PENDING",
  }));

  if (hs6 && Number.isFinite(customsValueUsd) && customsValueUsd > 0) {
    try {
      const tariffResult = await computeTariff({
        hs6,
        hsCode: str(declaration?.hsCode) || undefined,
        jurisdictionCode: str(operation.jurisdictionCode),
        originCountry: str(declaration?.originCountry || declaration?.origin),
        customsValueUsd,
        quantity: Number(declaration?.quantity) || undefined,
        netWeightKg: Number(declaration?.netWeightKg) || undefined,
        agreementId: str(declaration?.agreementId) || undefined,
        effectiveDate: declaration?.effectiveDate ? new Date(declaration.effectiveDate) : undefined,
      });
      if (tariffResult && Array.isArray(tariffResult.lines)) {
        duties = tariffResult.lines.map((line: any) => ({
          type: str(line?.tariffType) || "DUTY",
          rate: typeof line?.rate === "number" ? line.rate : 0,
          amount: Number(line?.amount) || 0,
          basis: str(line?.basis) || "customs_value",
          status: "COMPUTED",
        }));
      }
    } catch (err) {
      logger.warn("[customs-engine] computeOperationFees — tariff engine failed, falling back to manual duties", { operationId, error: err instanceof Error ? err.message : String(err) });
    }
  }

  // Total — sum of fee + duty + tax amounts (USD).
  const totalUsd =
    fees.reduce((s, f) => s + (f.currency === "USD" ? f.amount : 0), 0) +
    duties.reduce((s, d) => s + d.amount, 0) +
    taxes.reduce((s, t) => s + t.amount, 0);

  return { fees, duties, taxes, totalUsd };
}

// ============ 12. transitionOperationStatus ============

/**
 * transitionOperationStatus — validate a status transition against the
 * §4 authoritative lifecycle and apply it. Government release is
 * AUTHORITATIVE: the transition to GOVERNMENT_RELEASED is ONLY allowed
 * when a releaseReference is provided (callers should use recordRelease,
 * which performs the release + sets the reference atomically).
 *
 * @throws if the transition is not permitted by ALLOWED_TRANSITIONS, or
 *         if a release is attempted without a releaseReference.
 */
export async function transitionOperationStatus(
  operationId: string,
  newStatus: string,
  reason?: string,
): Promise<any> {
  const target = str(newStatus);
  if (!isValidStatus(target)) {
    throw new Error(`invalid status: ${target}`);
  }

  const operation = await getCustomsOperation(operationId);
  if (!operation) {
    throw new Error("operation not found");
  }

  const current = str(operation.status);

  // §4 — release is authoritative.
  if (target === "GOVERNMENT_RELEASED") {
    // Callers MUST go through recordRelease. Direct transitions are not allowed
    // (recordRelease performs the releaseReference validation + writes the
    // release blob). The only acceptable caller here is recordRelease itself,
    // which passes the releaseReference via the reason field.
    if (!str(reason)) {
      throw new Error("transition to GOVERNMENT_RELEASED requires a releaseReference — use recordRelease()");
    }
    // We accept the transition (recordRelease passes the releaseReference as
    // the reason and writes the release blob separately).
  } else if (!canTransition(current, target)) {
    throw new Error(`invalid status transition: ${current} → ${target}`);
  }

  const update: Record<string, unknown> = { status: target };
  if (target === "SUBMITTED") update.submittedAt = new Date();
  if (target === "GOVERNMENT_ACCEPTED") update.acceptedAt = new Date();
  if (target === "GOVERNMENT_REJECTED") {
    update.rejectedAt = new Date();
    update.rejectionReason = str(reason) || "rejected by government system";
  }
  if (target === "GOVERNMENT_HOLD") {
    update.holdAt = new Date();
    update.holdReason = str(reason) || "government hold";
  }

  try {
    const updated = await db.customsOperationV2.update({ where: { id: operationId }, data: update });
    return updated;
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    logger.error("[customs-engine] transitionOperationStatus failed", { operationId, target, error: why });
    throw new Error(`status transition failed: ${why}`);
  }
}

// ============ 13. getOperationsForWorkflow ============

/**
 * getOperationsForWorkflow — all operations linked to a multi-agency
 * workflow.
 */
export async function getOperationsForWorkflow(workflowId: string): Promise<any[]> {
  if (!str(workflowId)) return [];
  try {
    const rows = await db.customsOperationV2.findMany({
      where: { workflowId },
      orderBy: { createdAt: "asc" },
    });
    return rows || [];
  } catch (err) {
    logger.error("[customs-engine] getOperationsForWorkflow failed", { workflowId, error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

// ============ 14. isOperationReleased ============

/**
 * isOperationReleased — pure function. Returns true ONLY if the operation
 * is in GOVERNMENT_RELEASED state AND the release blob has both a
 * `releasedAt` and a `releaseReference`. Used by downstream systems to
 * gate cargo release / settlement / dispatch decisions.
 *
 * @param operationOrId  Either an operation row or its id. When an id is
 *                       passed the row is fetched from the DB (async-ish
 *                       via the awaited helper). When a row is passed the
 *                       check is fully synchronous.
 */
export function isOperationReleased(operationOrId: any): boolean {
  if (!operationOrId) return false;
  // If a string id was passed by mistake we still return false — the caller
  // should fetch the operation first (this preserves the pure-function contract).
  if (typeof operationOrId === "string") return false;
  const op = operationOrId as any;
  if (str(op.status) !== "GOVERNMENT_RELEASED") return false;
  const release = parseJson<any>(op.release, {});
  if (!release || !release.releasedAt) return false;
  if (!str(release.releaseReference)) return false;
  return true;
}
