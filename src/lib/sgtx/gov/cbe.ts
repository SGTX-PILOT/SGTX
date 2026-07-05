// @ts-nocheck
// SGTX Part 7 — Central Bank of Egypt (CBE) FX & settlement client stub.
//
// CBE publishes daily FX reference rates and operates the RTGS settlement rail
// (RECS — Real-Time Electronic Clearing System). SGTX uses CBE for:
//   - FX rate conversion between trade currencies (USD/EUR/GBP → EGP) so that
//     the non-custodial FeeLock split + customs duties are computed in EGP
//   - Settlement instructions: bank-to-bank credit transfers for trade
//     disbursements (Stage 1 mandatory + Stage 2 credit)
//
// This module is a STUB. Real integration would use the CBE participant API
// (SWIFT MT103 / ISO 20022 pacs.008) over an IP-VPN + HSM-signed channel.
//
// All interactions are logged to `IntegrationConnectorLog`. Persistent
// settlement instructions are stored in the `BankSettlementInstruction` table.

import { createHash } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Internal helpers (consistent with nafeza.ts / cargox.ts / eta.ts)
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
  const logId = `LOG-${params.connectorName}-${Date.now()}-${sha256Hex(bodyStr).slice(0, 6)}`;
  try {
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey: sha256Hex(bodyStr).slice(0, 32),
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (e) {
    logger.error(`[cbe/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. getFxRate — return CBE reference FX rate for a currency pair
// ---------------------------------------------------------------------------

/**
 * Static CBE reference FX rates (EGP per unit of foreign currency).
 *
 * In production these would be fetched from the CBE daily reference rate feed
 * (published each business day at 09:30 Cairo time). The stub returns static
 * mid-market rates so downstream FeeLock / customs duty / settlement
 * calculations are deterministic.
 */
const CBE_FX_RATES: Record<string, number> = {
  "USD-EGP": 48.5,
  "EUR-EGP": 52.3,
  "GBP-EGP": 61.4,
  "SAR-EGP": 12.95,
  "AED-EGP": 13.21,
  "CNY-EGP": 6.72,
  "JPY-EGP": 0.31,
  "CHF-EGP": 54.6,
};

export async function getFxRate(
  from: string,
  to: string
): Promise<{ rate: number; timestamp: string; source: string }> {
  const fromU = from.toUpperCase();
  const toU = to.toUpperCase();

  let rate: number;
  if (fromU === toU) {
    rate = 1;
  } else if (CBE_FX_RATES[`${fromU}-${toU}`] != null) {
    rate = CBE_FX_RATES[`${fromU}-${toU}`];
  } else if (CBE_FX_RATES[`${toU}-${fromU}`] != null) {
    // Invert the rate for the reverse pair.
    rate = 1 / CBE_FX_RATES[`${toU}-${fromU}`];
  } else {
    // Cross-rate via USD if both legs have a USD rate.
    const fromUsd = fromU === "USD" ? 1 : CBE_FX_RATES[`${fromU}-USD`];
    const toUsd = toU === "USD" ? 1 : CBE_FX_RATES[`${toU}-USD`];
    if (fromUsd == null || toUsd == null) {
      throw new Error(`No FX rate available for pair ${fromU}-${toU}`);
    }
    rate = fromUsd / toUsd;
  }

  // Round to 4 decimal places (CBE publishes 4 dp).
  rate = Math.round(rate * 10_000) / 10_000;

  const response = {
    from: fromU,
    to: toU,
    rate,
    timestamp: new Date().toISOString(),
    source: "CBE_DAILY_REFERENCE_RATE" as const,
  };

  await logOutbound({
    connectorName: "CBE_FX_RATE",
    endpoint: `GET /v1/cbe/fx-rates/${fromU}/${toU}`,
    payload: { from: fromU, to: toU },
    response,
    statusCode: 200,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 2. createSettlementInstruction — submit an RTGS / credit-transfer instruction
// ---------------------------------------------------------------------------

export async function createSettlementInstruction(
  ustn: string,
  amount: number,
  currency: string,
  beneficiaryIban: string
): Promise<{ instructionId: string; status: string }> {
  if (!ustn) throw new Error("ustn is required");
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("amount must be a positive number");
  if (!currency) throw new Error("currency is required");
  if (!beneficiaryIban) throw new Error("beneficiaryIban is required");

  const instructionId = `CBE-SI-${Date.now()}-${sha256Hex(`${ustn}|${amount}|${currency}|${beneficiaryIban}`).slice(0, 8).toUpperCase()}`;

  // Persist the settlement instruction in the platform's own DB. SGTX is
  // non-custodial — this row is the platform's record of the instruction sent
  // to CBE; the actual money movement is initiated by the PSP / bank, not by
  // SGTX directly.
  await db.bankSettlementInstruction.create({
    data: {
      instructionId,
      ustn,
      fromIban: "PLATFORM_NOSTRO", // SGTX omnibus / funding IBAN (per PSP)
      toIban: beneficiaryIban,
      amountUsd: currency === "USD" ? amount : 0, // store original-currency amount below
      currency,
      reference: `SGTX settlement for ${ustn}`,
      status: "PENDING",
    },
  });

  const response = {
    instructionId,
    status: "PENDING" as const,
    amount,
    currency,
    beneficiaryIban,
    submittedAt: new Date().toISOString(),
  };

  await logOutbound({
    connectorName: "CBE_SETTLEMENT_INSTRUCTION",
    endpoint: "POST /v1/cbe/settlement/instructions",
    ustn,
    payload: { ustn, amount, currency, beneficiaryIban },
    response,
    statusCode: 202,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 3. getSettlementStatus — poll the RTGS settlement lifecycle
// ---------------------------------------------------------------------------

export async function getSettlementStatus(
  instructionId: string
): Promise<{ status: string; settledAt?: string }> {
  // In production this would call GET /v1/cbe/settlement/instructions/{id}.
  // Stub: look up the persisted row and return its status. If not found, fall
  // back to a simulated SETTLED response so downstream workflows can proceed.
  let status = "SETTLED";
  let settledAt: string | undefined = new Date().toISOString();

  try {
    const row = await db.bankSettlementInstruction.findUnique({
      where: { instructionId },
    });
    if (row) {
      status = row.status;
      settledAt = row.settledAt?.toISOString();
    }
  } catch (e) {
    // ignore DB lookup failures and fall back to simulated SETTLED
    logger.warn(`[cbe/getSettlementStatus] DB lookup failed for ${instructionId}:`, e);
  }

  const response = { instructionId, status, settledAt };

  await logOutbound({
    connectorName: "CBE_SETTLEMENT_STATUS",
    endpoint: `GET /v1/cbe/settlement/instructions/${instructionId}/status`,
    payload: { instructionId },
    response,
    statusCode: 200,
    status: "SUCCESS",
  });

  return response;
}
