// @ts-nocheck
/**
 * SGTX Master Amendment — §37-38 Bank Settlement Gateway Engine
 * ===========================================================================
 *
 * Implements the §37 Bank Settlement Gateway (BSG) — the abstraction
 * layer between SGTX and the actual bank rails. The BSG normalizes
 * payment instructions into a canonical form, validates them through
 * the §62 6-stage pipeline, and tracks the bank's response.
 *
 * §37 — Integration types (§36):
 *   ISO_20022  — ISO 20022 message (pacs.008, pacs.009, camt.054, etc.)
 *   API        — bank REST/JSON API
 *   H2H        — host-to-host (SFTP, MQ, AS2)
 *   SFTP       — file-based (MT101, MT103, MT940)
 *
 * §62 — Gateway processing pipeline (6 stages):
 *   1. schema validation       — payload conforms to bank's schema
 *   2. signature validation    — payload is signed by an authorized party
 *   3. USTN validation         — USTN exists and is in a payable state
 *   4. beneficiary consistency — beneficiary matches across all legs
 *   5. bank policy             — bank's own business rules
 *   6. AML/sanctions           — sanctions screening (OFAC, EU, UN, etc.)
 *
 * §38 — Gateway lifecycle:
 *   DRAFT → VALIDATED → SUBMITTED → BANK_ACCEPTED → PROCESSING → EXECUTED
 *                                                       ↘ REJECTED
 *                                                       ↘ RETURNED
 *                                                       ↘ UNKNOWN
 *
 * No real bank calls are made — this engine SIMULATES bank processing
 * for the SGTX platform. All bank responses are synthetic but follow
 * realistic patterns (success on valid input, REJECTED on schema or
 * AML failure, RETURNED on bank policy failure).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine
 * never throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { appendEvent } from "@/lib/sgtx/event-spine";

// ============ §36 Constants — integration types ============

/**
 * §36 — Bank integration types.
 */
export const INTEGRATION_TYPES = [
  "ISO_20022",
  "API",
  "H2H",
  "SFTP",
] as const;

export type IntegrationType = (typeof INTEGRATION_TYPES)[number];

/**
 * §38 — Gateway lifecycle states.
 */
export const GATEWAY_STATES = [
  "DRAFT",
  "VALIDATED",
  "SUBMITTED",
  "BANK_ACCEPTED",
  "PROCESSING",
  "EXECUTED",
  "REJECTED",
  "RETURNED",
  "UNKNOWN",
] as const;

export type GatewayState = (typeof GATEWAY_STATES)[number];

/**
 * §62 — Pipeline stages.
 */
export const PIPELINE_STAGES = [
  { id: "SCHEMA", label: "Schema validation" },
  { id: "SIGNATURE", label: "Signature validation" },
  { id: "USTN", label: "USTN validation" },
  { id: "BENEFICIARY", label: "Beneficiary consistency" },
  { id: "BANK_POLICY", label: "Bank policy" },
  { id: "AML_SANCTIONS", label: "AML / sanctions" },
] as const;

// ============ Types ============

export interface BankSettlementGatewayRow {
  id: string;
  gatewayId: string;
  ustn?: string | null;
  bankGtid?: string | null;
  bankName?: string | null;
  integrationType: string;
  instructionPayload?: string | null;
  instructionVersion: number;
  schemaValidated: boolean;
  signatureValidated: boolean;
  ustnValidated: boolean;
  beneficiaryConsistency: boolean;
  bankPolicyChecked: boolean;
  amlSanctionsChecked: boolean;
  status: string;
  bankResponse?: string | null;
  submittedAt?: Date | null;
  bankConfirmedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateGatewayInstructionInput {
  ustn?: string | null;
  bankGtid?: string | null;
  bankName?: string | null;
  integrationType: string;
  instructionPayload?: Record<string, any> | null;
  instructionVersion?: number;
}

export interface GatewayProcessResult {
  gatewayId: string;
  status: string;
  stages: Array<{
    id: string;
    label: string;
    passed: boolean;
    reason?: string;
  }>;
  bankResponse?: Record<string, any>;
}

// ============ §37.0 Pure helpers ============

/**
 * Pure: generate a gatewayId in the form:
 *   BSG-{ustn8}-{YYYYMMDDHHMMSS}-{RANDOM6}
 */
export function generateGatewayId(
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
  return `BSG-${u}-${ts}-${r}`;
}

/**
 * Pure: validate that an integration type is one of the canonical types.
 */
export function isValidIntegrationType(type: string): boolean {
  return INTEGRATION_TYPES.includes(type as IntegrationType);
}

/**
 * Pure: simulate the §62 schema validation stage. Returns true if the
 * payload is a non-empty object with the required fields for the
 * integration type.
 */
export function simulateSchemaValidation(
  payload: Record<string, any> | null | undefined,
  integrationType: string,
): { passed: boolean; reason?: string } {
  if (!payload || typeof payload !== "object") {
    return { passed: false, reason: "PAYLOAD_MISSING" };
  }
  if (!isValidIntegrationType(integrationType)) {
    return { passed: false, reason: "UNKNOWN_INTEGRATION_TYPE" };
  }
  // Required fields per integration type (simulated)
  const required: Record<string, string[]> = {
    ISO_20022: ["messageId", "messageType", "amount", "currency"],
    API: ["requestId", "beneficiaryId", "amount", "currency"],
    H2H: ["sessionId", "filename", "amount", "currency"],
    SFTP: ["filename", "messageType", "amount", "currency"],
  };
  const fields = required[integrationType] || [];
  for (const f of fields) {
    if (payload[f] === undefined || payload[f] === null || payload[f] === "") {
      return { passed: false, reason: `MISSING_FIELD_${f}` };
    }
  }
  return { passed: true };
}

/**
 * Pure: simulate the §62 signature validation stage. Returns true if the
 * payload includes a non-empty `signature` field.
 */
export function simulateSignatureValidation(
  payload: Record<string, any> | null | undefined,
): { passed: boolean; reason?: string } {
  if (!payload) return { passed: false, reason: "PAYLOAD_MISSING" };
  if (!payload.signature || typeof payload.signature !== "string") {
    return { passed: false, reason: "SIGNATURE_MISSING" };
  }
  if (payload.signature.length < 8) {
    return { passed: false, reason: "SIGNATURE_TOO_SHORT" };
  }
  return { passed: true };
}

/**
 * Pure: simulate the §62 USTN validation stage. Returns true if the USTN
 * is a non-empty string (in production, this would check the trade
 * table + state vector for a payable state).
 */
export function simulateUstnValidation(
  ustn: string | null | undefined,
): { passed: boolean; reason?: string } {
  if (!ustn || typeof ustn !== "string" || ustn.length < 8) {
    return { passed: false, reason: "INVALID_USTN" };
  }
  if (!ustn.startsWith("SGTX-")) {
    return { passed: false, reason: "USTN_FORMAT_INVALID" };
  }
  return { passed: true };
}

/**
 * Pure: simulate the §62 beneficiary consistency check. Returns true if
 * the payload's beneficiary field is consistent (same name on all legs).
 */
export function simulateBeneficiaryConsistency(
  payload: Record<string, any> | null | undefined,
): { passed: boolean; reason?: string } {
  if (!payload) return { passed: false, reason: "PAYLOAD_MISSING" };
  if (!payload.beneficiaryName) {
    return { passed: false, reason: "BENEFICIARY_NAME_MISSING" };
  }
  if (!payload.beneficiaryId) {
    return { passed: false, reason: "BENEFICIARY_ID_MISSING" };
  }
  return { passed: true };
}

/**
 * Pure: simulate the §62 bank policy check. Returns true if amount > 0
 * and currency is in the bank's supported list.
 */
export function simulateBankPolicyCheck(
  payload: Record<string, any> | null | undefined,
): { passed: boolean; reason?: string } {
  if (!payload) return { passed: false, reason: "PAYLOAD_MISSING" };
  const amount = Number(payload.amount);
  if (!isFinite(amount) || amount <= 0) {
    return { passed: false, reason: "AMOUNT_INVALID" };
  }
  const supportedCurrencies = ["USD", "EUR", "GBP", "AED", "SAR", "EGP", "CNY", "JPY"];
  if (!supportedCurrencies.includes(String(payload.currency || "").toUpperCase())) {
    return { passed: false, reason: "CURRENCY_NOT_SUPPORTED" };
  }
  return { passed: true };
}

/**
 * Pure: simulate the §62 AML/sanctions check. Returns true if the
 * beneficiary's name is not on a (simulated) deny list.
 */
export function simulateAmlSanctionsCheck(
  payload: Record<string, any> | null | undefined,
): { passed: boolean; reason?: string } {
  if (!payload) return { passed: false, reason: "PAYLOAD_MISSING" };
  const denyList = ["SANCTIONED_ENTITY", "OFAC_BLOCKED", "EU_RESTRICTED"];
  const name = String(payload.beneficiaryName || "").toUpperCase();
  if (denyList.some((s) => name.includes(s))) {
    return { passed: false, reason: "SANCTIONS_HIT" };
  }
  return { passed: true };
}

// ============ §37.1 createGatewayInstruction ============

/**
 * Create a new bank settlement gateway instruction. The instruction
 * starts in DRAFT state with all 6 validation flags = false.
 *
 * Returns the new gateway row, or null on error.
 */
export async function createGatewayInstruction(
  input: CreateGatewayInstructionInput,
): Promise<BankSettlementGatewayRow | null> {
  if (!input || !input.integrationType) {
    logger.warn("[bank-settlement-gateway] create rejected: missing integrationType");
    return null;
  }
  if (!isValidIntegrationType(input.integrationType)) {
    logger.warn("[bank-settlement-gateway] unknown integration type", {
      integrationType: input.integrationType,
    });
    return null;
  }
  const gatewayId = generateGatewayId(input.ustn);
  try {
    const row = await db.bankSettlementGateway.create({
      data: {
        gatewayId,
        ustn: input.ustn || null,
        bankGtid: input.bankGtid || null,
        bankName: input.bankName || null,
        integrationType: input.integrationType,
        instructionPayload: input.instructionPayload
          ? JSON.stringify(input.instructionPayload)
          : null,
        instructionVersion: input.instructionVersion || 1,
        schemaValidated: false,
        signatureValidated: false,
        ustnValidated: false,
        beneficiaryConsistency: false,
        bankPolicyChecked: false,
        amlSanctionsChecked: false,
        status: "DRAFT",
        bankResponse: null,
        submittedAt: null,
        bankConfirmedAt: null,
      },
    });
    logger.info("[bank-settlement-gateway] instruction created (DRAFT)", {
      gatewayId,
      ustn: input.ustn || null,
      integrationType: input.integrationType,
      bankName: input.bankName || null,
    });
    return row as BankSettlementGatewayRow;
  } catch (err) {
    logger.error("[bank-settlement-gateway] createGatewayInstruction failed", {
      error: String(err),
      gatewayId,
      ustn: input.ustn || null,
    });
    return null;
  }
}

// ============ §62 processGateway ============

/**
 * Process a gateway instruction through the §62 6-stage pipeline.
 *
 * On all stages passing: state transitions DRAFT → VALIDATED → SUBMITTED
 *   → BANK_ACCEPTED → PROCESSING → EXECUTED.
 *
 * On any stage failing: state transitions to REJECTED (with the failing
 *   stage recorded) and processing stops.
 *
 * Each stage's pass/fail is recorded on the gateway row (schemaValidated,
 * signatureValidated, etc.) so the audit trail is complete.
 *
 * Returns the final state + per-stage results. Does NOT make real bank
 * calls — all bank responses are simulated.
 */
export async function processGateway(
  gatewayId: string,
): Promise<GatewayProcessResult> {
  const empty: GatewayProcessResult = {
    gatewayId,
    status: "UNKNOWN",
    stages: [],
  };
  if (!gatewayId) return empty;
  let row: BankSettlementGatewayRow | null = null;
  try {
    row = (await db.bankSettlementGateway.findUnique({
      where: { gatewayId },
    })) as BankSettlementGatewayRow | null;
  } catch (err) {
    logger.error("[bank-settlement-gateway] processGateway: find failed", {
      error: String(err),
      gatewayId,
    });
    return empty;
  }
  if (!row) return empty;

  // Parse payload
  let payload: Record<string, any> | null = null;
  try {
    payload = row.instructionPayload ? JSON.parse(row.instructionPayload) : null;
  } catch {
    payload = null;
  }

  // Run each stage in sequence
  const stageResults: GatewayProcessResult["stages"] = [];
  const updates: Record<string, boolean> = {};
  let allPassed = true;

  // 1. Schema validation
  const schema = simulateSchemaValidation(payload, row.integrationType);
  stageResults.push({ id: "SCHEMA", label: "Schema validation", passed: schema.passed, reason: schema.reason });
  updates.schemaValidated = schema.passed;
  if (!schema.passed) {
    allPassed = false;
    await finalizeGateway(row, "REJECTED", { failedStage: "SCHEMA", reason: schema.reason }, updates);
    return { gatewayId, status: "REJECTED", stages: stageResults, bankResponse: { failedStage: "SCHEMA", reason: schema.reason } };
  }

  // 2. Signature validation
  const sig = simulateSignatureValidation(payload);
  stageResults.push({ id: "SIGNATURE", label: "Signature validation", passed: sig.passed, reason: sig.reason });
  updates.signatureValidated = sig.passed;
  if (!sig.passed) {
    allPassed = false;
    await finalizeGateway(row, "REJECTED", { failedStage: "SIGNATURE", reason: sig.reason }, updates);
    return { gatewayId, status: "REJECTED", stages: stageResults, bankResponse: { failedStage: "SIGNATURE", reason: sig.reason } };
  }

  // 3. USTN validation
  const ustn = simulateUstnValidation(row.ustn);
  stageResults.push({ id: "USTN", label: "USTN validation", passed: ustn.passed, reason: ustn.reason });
  updates.ustnValidated = ustn.passed;
  if (!ustn.passed) {
    allPassed = false;
    await finalizeGateway(row, "REJECTED", { failedStage: "USTN", reason: ustn.reason }, updates);
    return { gatewayId, status: "REJECTED", stages: stageResults, bankResponse: { failedStage: "USTN", reason: ustn.reason } };
  }

  // 4. Beneficiary consistency
  const ben = simulateBeneficiaryConsistency(payload);
  stageResults.push({ id: "BENEFICIARY", label: "Beneficiary consistency", passed: ben.passed, reason: ben.reason });
  updates.beneficiaryConsistency = ben.passed;
  if (!ben.passed) {
    allPassed = false;
    await finalizeGateway(row, "REJECTED", { failedStage: "BENEFICIARY", reason: ben.reason }, updates);
    return { gatewayId, status: "REJECTED", stages: stageResults, bankResponse: { failedStage: "BENEFICIARY", reason: ben.reason } };
  }

  // 5. Bank policy
  const policy = simulateBankPolicyCheck(payload);
  stageResults.push({ id: "BANK_POLICY", label: "Bank policy", passed: policy.passed, reason: policy.reason });
  updates.bankPolicyChecked = policy.passed;
  if (!policy.passed) {
    allPassed = false;
    await finalizeGateway(row, "RETURNED", { failedStage: "BANK_POLICY", reason: policy.reason }, updates);
    return { gatewayId, status: "RETURNED", stages: stageResults, bankResponse: { failedStage: "BANK_POLICY", reason: policy.reason } };
  }

  // 6. AML/sanctions
  const aml = simulateAmlSanctionsCheck(payload);
  stageResults.push({ id: "AML_SANCTIONS", label: "AML / sanctions", passed: aml.passed, reason: aml.reason });
  updates.amlSanctionsChecked = aml.passed;
  if (!aml.passed) {
    allPassed = false;
    await finalizeGateway(row, "REJECTED", { failedStage: "AML_SANCTIONS", reason: aml.reason }, updates);
    return { gatewayId, status: "REJECTED", stages: stageResults, bankResponse: { failedStage: "AML_SANCTIONS", reason: aml.reason } };
  }

  // All stages passed → transition through VALIDATED → SUBMITTED → BANK_ACCEPTED → PROCESSING → EXECUTED
  if (allPassed) {
    const bankResponse = {
      bankReference: `BNK-${gatewayId.slice(-12)}`,
      confirmedAt: new Date().toISOString(),
      settlementValueDate: new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString(),
      status: "EXECUTED",
    };
    await finalizeGateway(
      row,
      "EXECUTED",
      bankResponse,
      updates,
      bankResponse,
    );
    logger.info("[bank-settlement-gateway] gateway EXECUTED", {
      gatewayId,
      ustn: row.ustn,
      bankReference: bankResponse.bankReference,
    });

    // Append canonical PAYMENT_SETTLED event
    try {
      await appendEvent({
        ustn: row.ustn,
        eventType: "PAYMENT_SETTLED",
        eventTypeCategory: "CONFIRMATION",
        authority: row.bankName || "BANK",
        actor: "bank-settlement-gateway",
        evidenceReference: [gatewayId, bankResponse.bankReference],
        notes: `Gateway ${gatewayId} executed (bankRef ${bankResponse.bankReference})`,
        idempotencyKey: `BSG-EXEC-${gatewayId}`,
      });
    } catch (err) {
      logger.warn("[bank-settlement-gateway] could not append canonical event", {
        error: String(err),
        gatewayId,
      });
    }

    return {
      gatewayId,
      status: "EXECUTED",
      stages: stageResults,
      bankResponse,
    };
  }
  return empty;
}

/**
 * Internal: finalize a gateway row by updating all stage flags + the
 * final status + bank response. Wrapped in try/catch.
 */
async function finalizeGateway(
  row: BankSettlementGatewayRow,
  finalStatus: string,
  bankResponse: Record<string, any>,
  updates: Record<string, boolean>,
  extraUpdates?: Record<string, any>,
): Promise<void> {
  try {
    const data: any = {
      ...updates,
      status: finalStatus,
      bankResponse: JSON.stringify(bankResponse),
    };
    if (finalStatus === "EXECUTED") {
      data.submittedAt = new Date();
      data.bankConfirmedAt = new Date();
    } else if (finalStatus === "REJECTED" || finalStatus === "RETURNED") {
      data.submittedAt = new Date();
    }
    if (extraUpdates) Object.assign(data, extraUpdates);
    await db.bankSettlementGateway.update({
      where: { gatewayId: row.gatewayId },
      data,
    });
  } catch (err) {
    logger.error("[bank-settlement-gateway] finalizeGateway update failed", {
      error: String(err),
      gatewayId: row.gatewayId,
      finalStatus,
    });
  }
}

// ============ §38 getGatewayStatus ============

/**
 * Get the gateway instruction status. Returns the row, or null if not found.
 */
export async function getGatewayStatus(
  gatewayId: string,
): Promise<BankSettlementGatewayRow | null> {
  if (!gatewayId) return null;
  try {
    const row = await db.bankSettlementGateway.findUnique({
      where: { gatewayId },
    });
    return (row as BankSettlementGatewayRow) || null;
  } catch (err) {
    logger.error("[bank-settlement-gateway] getGatewayStatus failed", {
      error: String(err),
      gatewayId,
    });
    return null;
  }
}

// ============ §37.2 getGatewayByUstn ============

/**
 * Get all gateway instructions for a USTN, ordered by createdAt descending
 * (most recent first). Returns [] on error.
 */
export async function getGatewayByUstn(
  ustn: string,
): Promise<BankSettlementGatewayRow[]> {
  if (!ustn) return [];
  try {
    const rows = await db.bankSettlementGateway.findMany({
      where: { ustn },
      orderBy: { createdAt: "desc" },
    });
    return (rows as BankSettlementGatewayRow[]) || [];
  } catch (err) {
    logger.error("[bank-settlement-gateway] getGatewayByUstn failed", {
      error: String(err),
      ustn,
    });
    return [];
  }
}

/**
 * Update the status of a gateway instruction (manual override for
 * edge cases — e.g. operator marks UNKNOWN as EXECUTED after bank
 * confirmation arrives out-of-band).
 */
export async function updateGatewayStatus(
  gatewayId: string,
  newStatus: string,
  bankResponse?: Record<string, any>,
): Promise<BankSettlementGatewayRow | null> {
  if (!gatewayId || !newStatus) return null;
  if (!GATEWAY_STATES.includes(newStatus as GatewayState)) {
    logger.warn("[bank-settlement-gateway] unknown status", { newStatus });
    return null;
  }
  try {
    const data: any = { status: newStatus };
    if (bankResponse) data.bankResponse = JSON.stringify(bankResponse);
    if (newStatus === "EXECUTED") {
      data.bankConfirmedAt = new Date();
    }
    const updated = await db.bankSettlementGateway.update({
      where: { gatewayId },
      data,
    });
    logger.info("[bank-settlement-gateway] gateway status updated", {
      gatewayId,
      newStatus,
    });
    return updated as BankSettlementGatewayRow;
  } catch (err) {
    logger.error("[bank-settlement-gateway] updateGatewayStatus failed", {
      error: String(err),
      gatewayId,
      newStatus,
    });
    return null;
  }
}
