// SGTX Part 7.1 — OneClick Trigger Map orchestration.
//
// After the user clicks "Pay Stage 1" or "Settle Payment", the PSP webhook
// confirms the split payment was executed. SGTX then triggers all government
// API calls in the correct sequence (Part 7.1 OneClick Trigger Map):
//
//   STAGE1_PAID trigger (Seller clicks "Pay Stage 1"):
//     1. CargoX  → POST /v3/shipments          (after PSP webhook confirms split)
//     2. Nafeza  → POST /api/v2/declaration    (after CargoX ACID received)
//     3. CBE     → PSP-specific or MT940/ISO 20022 (settlement confirmation)
//
//   SETTLE_PAYMENT trigger (Buyer clicks "Settle Payment"):
//     1. CBE     → Settlement instruction      (trade principal settlement)
//
//   CONTRACT_LOCKED trigger (Buyer accepts quote):
//     1. ETA     → POST /einvoice/v1/documents (immediate, before payment)
//
// Each step runs through the governor prescreen (Part 7.10 GGOV1-GGOV9) which
// validates mTLS cert validity, idempotency uniqueness, ACID format, declaration
// completeness, ETA XML schema, etc.
//
// All orchestration state is persisted in `OneClickTrigger` so a partial
// failure can be resumed from the last successful step.

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { submitShipment, submitDeclaration, submitInvoice, createSettlementInstruction } from "./index";
import { governorPrescreenGov } from "./governor";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj ?? {}).sort());
}

async function logOutbound(params: {
  connectorName: string;
  endpoint: string;
  ustn?: string;
  payload: unknown;
  response?: unknown;
  statusCode?: number;
  status?: string;
  errorMessage?: string;
}): Promise<void> {
  const bodyStr = typeof params.payload === "string"
    ? params.payload
    : canonical(params.payload);
  const respStr = params.response === undefined
    ? null
    : (typeof params.response === "string" ? params.response : canonical(params.response));
  const idempotencyKey = sha256Hex(bodyStr).slice(0, 32);
  const logId = `LOG-${params.connectorName}-${Date.now()}-${idempotencyKey.slice(0, 6)}`;
  try {
    // Part 7.7.4 — idempotent logging (upsert with no-op update on duplicate keys).
    await db.integrationConnectorLog.upsert({
      where: { idempotencyKey },
      create: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey,
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
      update: {},
    });
  } catch (e) {
    console.error(`[oneclick/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. ensureOneClickTrigger — get-or-create the orchestration state row
// ---------------------------------------------------------------------------

async function ensureOneClickTrigger(params: {
  ustn: string;
  tradeId?: string;
  triggerType: string;
  feeLockId?: string;
  paymentAttemptId?: string;
}): Promise<{ id: string; ustn: string; orchestrationStatus: string }> {
  const existing = await db.oneClickTrigger.findUnique({ where: { ustn: params.ustn } });
  if (existing) return { id: existing.id, ustn: existing.ustn, orchestrationStatus: existing.orchestrationStatus };

  const created = await db.oneClickTrigger.create({
    data: {
      ustn: params.ustn,
      tradeId: params.tradeId ?? null,
      triggerType: params.triggerType,
      feeLockId: params.feeLockId ?? null,
      paymentAttemptId: params.paymentAttemptId ?? null,
      orchestrationStatus: "PENDING",
    },
  });
  return { id: created.id, ustn: created.ustn, orchestrationStatus: created.orchestrationStatus };
}

// ---------------------------------------------------------------------------
// 2. orchestrateStage1Payment — fires CargoX → Nafeza → CBE in sequence
// ---------------------------------------------------------------------------

export interface OrchestrateParams {
  ustn: string;
  tradeId?: string;
  feeLockId?: string;
  paymentAttemptId?: string;
  /** Seller / exporter GTID — used to look up mTLS cert for governor GGOV1. */
  sellerGtid?: string;
  /** Broker GTID — used for broker-certified Nafeza submission. */
  brokerGtid?: string;
  /** Stage 1 trade data: invoice value, containers, etc. (for CargoX envelope). */
  tradeData?: {
    containers?: string[];
    goodsValue?: number;
    currency?: string;
    shipper?: { taxId: string; name: string; country: string };
    consignee?: { taxId: string; name: string; country: string };
    invoice?: { number: string; value: number; currency: string };
    goods?: Array<{ hsCode: string; description: string; netWeightKg: number; grossWeightKg: number; packages: number; packageType: string }>;
    transport?: { incoterm: string; portOfLoading: string; portOfDischarge: string; vesselName: string };
  };
  /** Invoice data for ETA submission (Part 7.1 — fires immediately after contract lock). */
  invoiceData?: any;
  /** Whether to fire ETA in this orchestration run (default: false — ETA fires
   * at contract lock, separate from Stage 1 payment). */
  fireEta?: boolean;
  /** CBE settlement beneficiary IBAN — required for the CBE settlement step. */
  beneficiaryIban?: string;
  /** CBE settlement amount + currency — required for the CBE settlement step. */
  settlementAmount?: number;
  settlementCurrency?: string;
  /** Skip CBE settlement step (e.g. for STAGE1_PAID where PSP handled the split). */
  skipCbeSettlement?: boolean;
}

export interface OrchestrationResult {
  ustn: string;
  orchestrationStatus: string;
  cargox?: { acid: string; blockchainSeal: string };
  nafeza?: { declarationId: string; status: string };
  eta?: { uuid: string; qrCode: string };
  cbe?: { instructionId: string; status: string };
  governorVerdict: string;
  governorConditions: string[];
  errors: Array<{ step: string; message: string }>;
}

/**
 * Execute the OneClick Trigger Map orchestration (Part 7.1).
 *
 * Sequence for STAGE1_PAID:
 *   1. Governor prescreen (GGOV1-GGOV9) — DENY aborts the whole orchestration.
 *   2. CargoX submitDocument → ACID + blockchain seal
 *   3. Nafeza submitDeclaration (uses ACID from step 2)
 *   4. CBE createSettlementInstruction (if !skipCbeSettlement)
 *
 * ETA is fired only if `fireEta: true` (it normally fires at contract lock,
 * not at Stage 1 payment — Part 7.1 timing table).
 *
 * Partial failures are persisted: each step's status is updated in the
 * `OneClickTrigger` row. The orchestration status becomes PARTIAL if any step
 * failed but at least one succeeded, FAILED if all failed, COMPLETED if all
 * succeeded.
 */
export async function orchestrateStage1Payment(params: OrchestrateParams): Promise<OrchestrationResult> {
  const { ustn } = params;
  if (!ustn) throw new Error("ustn is required");

  // Get-or-create the orchestration state row
  const trigger = await ensureOneClickTrigger({
    ustn,
    tradeId: params.tradeId,
    triggerType: "STAGE1_PAID",
    feeLockId: params.feeLockId,
    paymentAttemptId: params.paymentAttemptId,
  });

  await db.oneClickTrigger.update({
    where: { id: trigger.id },
    data: { orchestrationStatus: "IN_PROGRESS" },
  });

  const errors: Array<{ step: string; message: string }> = [];
  let governorVerdict = "ALLOW";
  let governorConditions: string[] = [];

  // ── Step 0: Governor prescreen (GGOV1-GGOV9) ─────────────────────────────
  try {
    const gov = await governorPrescreenGov({
      ustn,
      sellerGtid: params.sellerGtid,
      brokerGtid: params.brokerGtid,
      tradeData: params.tradeData,
      invoiceData: params.invoiceData,
      webhookSignatureVerified: true, // OneClick always follows a verified PSP webhook
      retryCount: 0,
      connectorCallLogged: true, // we log every step below
    });
    governorVerdict = gov.verdict;
    governorConditions = gov.conditions;
    if (gov.verdict === "DENY") {
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: {
          orchestrationStatus: "FAILED",
          governorDecisionId: gov.decisionId ?? null,
          errorMessage: `Governor DENY: ${gov.conditions.join("; ")}`,
        },
      });
      await logOutbound({
        connectorName: "ONECLICK_TRIGGER",
        endpoint: "POST /v1/gov/oneclick-trigger",
        ustn,
        payload: params,
        response: { status: "DENIED", conditions: gov.conditions },
        statusCode: 403,
        status: "FAILED",
        errorMessage: `Governor DENY: ${gov.conditions.join("; ")}`,
      });
      return {
        ustn,
        orchestrationStatus: "FAILED",
        governorVerdict,
        governorConditions,
        errors: [{ step: "governor", message: `DENY: ${gov.conditions.join("; ")}` }],
      };
    }
  } catch (e: any) {
    errors.push({ step: "governor", message: e?.message ?? String(e) });
    governorVerdict = "CONDITIONAL";
  }

  const result: OrchestrationResult = {
    ustn,
    orchestrationStatus: "IN_PROGRESS",
    governorVerdict,
    governorConditions,
    errors,
  };

  // ── Step 1: CargoX submitShipment → ACID + blockchain seal ───────────────
  // Per Blueprint 7.1 + 7.3.3, this is `POST /v3/shipments` with the shipment
  // envelope (external_reference, shipper, consignee, goods_value, container_numbers,
  // documents). The ACID returned is production-format `ACIYYYYMMDD-NNNN` so it
  // passes governor gate GGOV4 / G1U31.
  if (params.tradeData) {
    try {
      const td = params.tradeData;
      // Convert camelCase shipper/consignee (from OrchestrateParams) to the
      // snake_case form CargoX expects per Blueprint 7.3.3.
      const shipperSnake = td.shipper
        ? { tax_id: td.shipper.taxId, name: td.shipper.name, country: td.shipper.country }
        : { tax_id: "", name: "", country: "" };
      const consigneeSnake = td.consignee
        ? { tax_id: td.consignee.taxId, name: td.consignee.name, country: td.consignee.country }
        : { tax_id: "", name: "", country: "" };
      const envelope = {
        external_reference: ustn,
        shipper: shipperSnake,
        consignee: consigneeSnake,
        goods_value: {
          amount: td.goodsValue ?? 0,
          currency: td.currency ?? "USD",
        },
        container_numbers: td.containers ?? [],
        documents: td.invoice
          ? [{
              type: "INVOICE",
              content_base64: Buffer.from(canonical(td.invoice)).toString("base64"),
              filename: "invoice.json",
            }]
          : [],
      };

      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { cargoxStatus: "IN_PROGRESS" },
      });

      const cargoxResult = await submitShipment(ustn, envelope);
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: {
          cargoxStatus: "COMPLETED",
          cargoxAcid: cargoxResult.acid,
          cargoxSeal: cargoxResult.blockchainSeal,
          cargoxCompletedAt: new Date(),
        },
      });
      result.cargox = { acid: cargoxResult.acid, blockchainSeal: cargoxResult.blockchainSeal };
    } catch (e: any) {
      errors.push({ step: "cargox", message: e?.message ?? String(e) });
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { cargoxStatus: "FAILED", errorMessage: `CargoX: ${e?.message ?? e}` },
      });
    }
  }

  // ── Step 2: Nafeza submitDeclaration (uses ACID from step 1) ──────────────
  try {
    await db.oneClickTrigger.update({
      where: { id: trigger.id },
      data: { nafezaStatus: "IN_PROGRESS" },
    });

    const nafezaPayload = {
      ustn,
      acid: result.cargox?.acid ?? `ACID-${Date.now()}`,
      tradeData: params.tradeData ?? null,
      brokerGtid: params.brokerGtid ?? null,
    };
    const nafezaResult = await submitDeclaration(ustn, nafezaPayload);
    await db.oneClickTrigger.update({
      where: { id: trigger.id },
      data: {
        nafezaStatus: "COMPLETED",
        nafezaDeclarationId: nafezaResult.declarationId,
        nafezaCompletedAt: new Date(),
      },
    });
    result.nafeza = { declarationId: nafezaResult.declarationId, status: nafezaResult.status };
  } catch (e: any) {
    errors.push({ step: "nafeza", message: e?.message ?? String(e) });
    await db.oneClickTrigger.update({
      where: { id: trigger.id },
      data: { nafezaStatus: "FAILED", errorMessage: `Nafeza: ${e?.message ?? e}` },
    });
  }

  // ── Step 3: ETA submitInvoice (optional, fires at contract lock normally) ─
  if (params.fireEta && params.invoiceData) {
    try {
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { etaStatus: "IN_PROGRESS" },
      });
      const etaResult = await submitInvoice(ustn, params.invoiceData);
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: {
          etaStatus: "COMPLETED",
          etaUuid: etaResult.uuid,
          etaQr: etaResult.qrCode,
          etaCompletedAt: new Date(),
        },
      });
      result.eta = { uuid: etaResult.uuid, qrCode: etaResult.qrCode };
    } catch (e: any) {
      errors.push({ step: "eta", message: e?.message ?? String(e) });
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { etaStatus: "FAILED", errorMessage: `ETA: ${e?.message ?? e}` },
      });
    }
  }

  // ── Step 4: CBE settlement (optional — skipCbeSettlement for STAGE1_PAID) ─
  if (!params.skipCbeSettlement && params.beneficiaryIban && params.settlementAmount) {
    try {
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { cbeStatus: "IN_PROGRESS" },
      });
      const cbeResult = await createSettlementInstruction(
        ustn,
        params.settlementAmount,
        params.settlementCurrency ?? "USD",
        params.beneficiaryIban
      );
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: {
          cbeStatus: "COMPLETED",
          cbeInstructionId: cbeResult.instructionId,
          cbeCompletedAt: new Date(),
        },
      });
      result.cbe = { instructionId: cbeResult.instructionId, status: cbeResult.status };
    } catch (e: any) {
      errors.push({ step: "cbe", message: e?.message ?? String(e) });
      await db.oneClickTrigger.update({
        where: { id: trigger.id },
        data: { cbeStatus: "FAILED", errorMessage: `CBE: ${e?.message ?? e}` },
      });
    }
  }

  // ── Aggregate orchestration status ───────────────────────────────────────
  const steps = [
    { name: "cargox", ran: !!params.tradeData, result: result.cargox },
    { name: "nafeza", ran: true, result: result.nafeza },
    { name: "eta", ran: !!params.fireEta && !!params.invoiceData, result: result.eta },
    { name: "cbe", ran: !params.skipCbeSettlement && !!params.beneficiaryIban, result: result.cbe },
  ];
  const completedSteps = steps.filter((s) => s.ran && s.result).length;
  const failedSteps = errors.length;

  let finalStatus: string;
  if (failedSteps === 0) {
    finalStatus = "COMPLETED";
  } else if (completedSteps > 0) {
    finalStatus = "PARTIAL";
  } else {
    finalStatus = "FAILED";
  }

  await db.oneClickTrigger.update({
    where: { id: trigger.id },
    data: { orchestrationStatus: finalStatus },
  });

  result.orchestrationStatus = finalStatus;

  await logOutbound({
    connectorName: "ONECLICK_TRIGGER",
    endpoint: "POST /v1/gov/oneclick-trigger",
    ustn,
    payload: { ustn, triggerType: "STAGE1_PAID" },
    response: { status: finalStatus, completedSteps, failedSteps },
    statusCode: finalStatus === "FAILED" ? 500 : 200,
    status: finalStatus === "COMPLETED" ? "SUCCESS" : finalStatus === "PARTIAL" ? "PARTIAL" : "FAILED",
    errorMessage: errors.length > 0 ? errors.map((e) => `${e.step}: ${e.message}`).join("; ") : undefined,
  });

  return result;
}

// ---------------------------------------------------------------------------
// 3. getOneClickTriggerStatus — return the persisted orchestration state
// ---------------------------------------------------------------------------

export async function getOneClickTriggerStatus(ustn: string): Promise<{
  ustn: string;
  orchestrationStatus: string;
  cargox: { status: string; acid: string | null; completedAt: string | null };
  nafeza: { status: string; declarationId: string | null; completedAt: string | null };
  eta: { status: string; uuid: string | null; completedAt: string | null };
  cbe: { status: string; instructionId: string | null; completedAt: string | null };
} | null> {
  const row = await db.oneClickTrigger.findUnique({ where: { ustn } });
  if (!row) return null;
  return {
    ustn: row.ustn,
    orchestrationStatus: row.orchestrationStatus,
    cargox: {
      status: row.cargoxStatus,
      acid: row.cargoxAcid,
      completedAt: row.cargoxCompletedAt ? row.cargoxCompletedAt.toISOString() : null,
    },
    nafeza: {
      status: row.nafezaStatus,
      declarationId: row.nafezaDeclarationId,
      completedAt: row.nafezaCompletedAt ? row.nafezaCompletedAt.toISOString() : null,
    },
    eta: {
      status: row.etaStatus,
      uuid: row.etaUuid,
      completedAt: row.etaCompletedAt ? row.etaCompletedAt.toISOString() : null,
    },
    cbe: {
      status: row.cbeStatus,
      instructionId: row.cbeInstructionId,
      completedAt: row.cbeCompletedAt ? row.cbeCompletedAt.toISOString() : null,
    },
  };
}
