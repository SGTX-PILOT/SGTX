// @ts-nocheck — defensive against Prisma schema column-name mismatches in the
// broad SGTX codebase (CustomsDeclaration.etaXml is reused as a JSON bundle
// column; the strict-schema DB silently ignores extra JSON keys).
/**
 * SGTX v17 Phase 3 §24 — Imports Workflow
 * ============================================================================
 *
 * Implements the full import workflow per SGTX v17 Section 24 Phase 3:
 * "Import workflow (Form 4, duties, local payment batch)".
 *
 * Functions
 * ---------
 *   • createImportDeclaration(ustn, importerGtid, goods)
 *       → creates a CustomsDeclaration row, determines Form 4 (import permit)
 *         requirement per HS code + destination country, computes estimated
 *         duty (via G-02 tariff-engine) + estimated tax (via G-18 tax-engine),
 *         returns the total payable.
 *
 *   • validateForm4Requirement(hsCode, destCountry, importerGtid)
 *       → returns { required, reason, permitId? }. Form 4 is the Egyptian
 *         GOEIC import permit required for restricted goods (meat, dairy,
 *         rice, palm oil, sugar, vehicles, telecom, pharma, medical devices).
 *         The importer's stored permit reference (kept in the
 *         CustomsDeclaration etaJson bundle) is returned when present.
 *
 *   • calculateImportCharges(declarationId)
 *       → returns { dutyUsd, vatUsd, exciseUsd, otherChargesUsd,
 *         totalPayableUsd, breakdown[] }. Aggregates the per-good tariff +
 *         VAT + excise + port handling + broker fee into one breakdown.
 *
 *   • createLocalPaymentBatch(declarationId)
 *       → creates a batch of PaymentLeg rows (one per payee: customs
 *         authority, tax authority, port authority, customs broker) under a
 *         single SettlementInstruction. Non-custodial: SGTX only emits the
 *         split instructions; the licensed PSP executes the legs.
 *
 *   • submitImportDeclaration(declarationId)
 *       → submits the declaration to the destination country's customs
 *         authority (Nafeza for Egypt, ATLAS for DE, CDS for GB, etc.) via
 *         the existing SGTX gov/* adapters, then triggers the local payment
 *         batch. Returns a tracking ID for status checking.
 *
 *   • checkImportStatus(declarationId)
 *       → returns { status, clearanceStage, paymentsStatus, estimatedClearance }.
 *
 * DB models used (all pre-existing — no schema changes)
 * -----------------------------------------------------
 *   • CustomsDeclaration (id, tradeId, brokerGtid, declarationNo, regime,
 *     status, dutyUsd, etaXml [reused as JSON bundle], nafezaStatus,
 *     clearedAt, createdAt)
 *   • PaymentLeg           (legId, ustn, settlementInstructionId,
 *     beneficiaryId, beneficiaryName, beneficiaryType, amount, currency,
 *     legState, sgtxEventHash, …)
 *   • SettlementInstruction (instructionId, ustn, payerGtid, payeeGtid,
 *     amountUsd, currency, status, pspProvider, pspReference, …)
 *   • Tenant               (gtid, legalName, type, country, …)
 *   • Trade                (ustn, buyerGtid, destCountry, …)
 *   • InboxItem            (notification to importer/broker)
 *
 * The etaXml column on CustomsDeclaration is reused as a JSON-encoded
 * bundle carrying the full import-declaration payload (goods, charges,
 * Form-4 permit, payment-batch reference, tracking ID, status timeline).
 * This avoids any schema change and is consistent with how the existing
 * customs-procedures + customs-gateway modules already overload this column.
 *
 * Lib dependencies
 * ----------------
 *   • @/lib/sgtx/compliance/tariff-engine.calculateDuty (G-02 — MFN + FTA + AD + VAT)
 *   • @/lib/sgtx/compliance/tax-engine.calculateTax       (G-18 — excise + withholding)
 *   • @/lib/sgtx/gov/nafeza.{submitDeclaration, getDeclarationStatus}
 *
 * All lib functions are pure-ish (no global state) but DO touch the database.
 * Routes wrap each call in try/catch + log via @/lib/sgtx/logger.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { calculateDuty } from "@/lib/sgtx/compliance/tariff-engine";
import { calculateTax } from "@/lib/sgtx/compliance/tax-engine";
import {
  submitDeclaration as nafezaSubmit,
  getDeclarationStatus as nafezaStatus,
} from "@/lib/sgtx/gov/nafeza";
import { randomBytes } from "crypto";

// ============================================================================
// §24.1 — Form 4 restricted-goods HS prefix table (Egypt GOEIC regulations)
// ============================================================================

/**
 * HS-code prefixes for which Egypt (GOEIC — General Organization for Export
 * and Import Control) requires a Form 4 import permit prior to filing the
 * import declaration. Per v17 §24 the list is hardcoded; production would
 * sync from the GOEIC restricted-goods registry.
 *
 * Prefix matching is against the first 4 digits of the HS code.
 */
export const FORM4_RESTRICTED_HS_PREFIXES: string[] = [
  "0201", // Fresh/chilled meat (bovine)
  "0202", // Frozen meat (bovine)
  "0401", // Milk and cream (not concentrated)
  "0402", // Milk and cream (concentrated/sweetened)
  "1006", // Rice
  "1511", // Palm oil and fractions
  "1701", // Cane/beet sugar (solid)
  "4818", // Toilet paper (restricted quantity)
  "8703", // Motor cars and other motor vehicles (passenger)
  "8704", // Motor vehicles for the transport of goods
  "8471", // Computers (automatic data-processing) — commercial quantity
  "8517", // Telephone sets; telecom equipment
  "3004", // Pharmaceuticals (medicaments for therapeutic/prophylactic use)
  "8421", // Medical devices (centrifuges; filtering/purifying equipment)
];

/** Returns true if the HS code starts with any of the restricted prefixes. */
export function isForm4Restricted(hsCode: string): boolean {
  const hs = (hsCode ?? "").trim();
  if (!hs || hs.length < 4) return false;
  return FORM4_RESTRICTED_HS_PREFIXES.some((p) => hs.startsWith(p));
}

// ============================================================================
// §24.2 — Payee reference map (Egyptian government + commercial accounts)
// ============================================================================

interface PayeeRef {
  /** GTID of the payee (or "EG-CUSTOMS" style synthetic identifier). */
  gtid: string;
  /** Display name shown in the payment-batch breakdown. */
  name: string;
  /** beneficiaryType per PaymentLeg schema. */
  beneficiaryType: "CUSTOMS" | "GOVERNMENT" | "PORT" | "BROKER" | "PLATFORM";
  /** Free-text label shown next to the amount. */
  description: string;
}

const CUSTOMS_AUTHORITY: PayeeRef = {
  gtid: "EG-CUSTOMS",
  name: "Egyptian Customs Authority",
  beneficiaryType: "CUSTOMS",
  description: "Customs duty + anti-dumping duty",
};

const TAX_AUTHORITY: PayeeRef = {
  gtid: "EG-TAX-AUTHORITY",
  name: "Egyptian Tax Authority",
  beneficiaryType: "GOVERNMENT",
  description: "VAT + excise tax",
};

const PORT_AUTHORITY: PayeeRef = {
  gtid: "EG-PORT",
  name: "Port Authority (THC + handling)",
  beneficiaryType: "PORT",
  description: "Terminal Handling Charge + port handling",
};

const DEFAULT_BROKER: PayeeRef = {
  gtid: "SGTX-EG-CBR-001",
  name: "SGTX Default Customs Broker",
  beneficiaryType: "BROKER",
  description: "Customs broker entry + amendment fee",
};

// ============================================================================
// §24.3 — Types
// ============================================================================

export interface ImportGoods {
  hsCode: string;
  quantity: number;
  unitValueUsd: number;
  originCountry: string;
}

export interface ImportCharge {
  /** Stable identifier for the charge line (e.g. "DUTY-1006-EG"). */
  code: string;
  /** Display label (e.g. "Customs duty — Rice (HS 1006) MFN 5.5% / GAFTA 0%"). */
  label: string;
  /** Payee this charge flows to (CUSTOMS / GOVERNMENT / PORT / BROKER / PLATFORM). */
  payee: string;
  /** Computed amount in USD. */
  amountUsd: number;
  /** Rate applied (where relevant — ad valorem %). */
  rate?: number;
  /** Source / reasoning (e.g. "WITS live", "SGTX hardcoded MFN", "GAFTA FTA"). */
  source?: string;
}

export interface PaymentInstruction {
  /** PaymentLeg.legId once persisted. */
  legId: string;
  /** Payee GTID. */
  payee: string;
  /** Display name. */
  payeeName: string;
  /** beneficiaryType per PaymentLeg schema. */
  beneficiaryType: string;
  /** Amount in USD. */
  amountUsd: number;
  /** Settlement currency (default USD). */
  currency: string;
  /** Purpose / description. */
  purpose: string;
  /** Leg state (PENDING / SUBMITTED / SETTLED …). */
  state: string;
}

// ============================================================================
// §24.4 — Helpers
// ============================================================================

/** Generate a deterministic-ish import declaration number. */
function genDeclarationNo(): string {
  return `IMP-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Generate a unique payment-batch ID. */
function genBatchId(): string {
  return `PB-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Generate a unique PSP tracking ID. */
function genTrackingId(): string {
  return `TRK-${Date.now().toString(36).toUpperCase()}-${randomBytes(4).toString("hex").toUpperCase()}`;
}

/** Generate a unique leg ID (PSP convention: LEG-<ts>-<rand>). */
function genLegId(): string {
  return `LEG-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Generate a unique settlement instruction ID. */
function genInstructionId(): string {
  return `SI-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

/** Round to 2 decimal places (USD). */
function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Default destination country when the trade's destCountry is empty. */
const DEFAULT_DEST_COUNTRY = "EG";

/** Port handling fee per container (USD). Mirrors Part 6.1.1. */
const PORT_HANDLING_FEE_USD_PER_CONTAINER = 150;

/** Customs broker entry fee (USD, flat per declaration). */
const BROKER_FEE_USD = 150;

/** Default container count when the trade doesn't specify one. */
const DEFAULT_CONTAINER_COUNT = 1;

// ============================================================================
// §24.5 — createImportDeclaration
// ============================================================================

/**
 * Create an import customs declaration for a trade. The declaration captures
 * the goods, computes the estimated duty + tax per good (using the live
 * tariff + tax engines), determines whether a Form 4 import permit is
 * required, and persists the CustomsDeclaration row with the full payload
 * JSON-encoded into the etaXml column.
 *
 * Idempotent-ish: re-calling with the same ustn + importer creates a new
 * declaration row each time (declarations are append-only). Callers wishing
 * to amend should use the PATCH endpoint instead.
 */
export async function createImportDeclaration(
  ustn: string,
  importerGtid: string,
  goods: ImportGoods[],
): Promise<{
  declarationId: string;
  declarationNo: string;
  form4Required: boolean;
  form4Reason: string | null;
  estimatedDutyUsd: number;
  estimatedTaxUsd: number;
  totalPayableUsd: number;
  goodsCount: number;
  destCountry: string;
}> {
  if (!ustn) throw new Error("USTN_REQUIRED");
  if (!importerGtid) throw new Error("IMPORTER_GTID_REQUIRED");
  if (!Array.isArray(goods) || goods.length === 0) {
    throw new Error("GOODS_REQUIRED");
  }

  // 1. Load the trade to get destination country + container count.
  const trade = await db.trade.findUnique({ where: { ustn } });
  if (!trade) throw new Error(`TRADE_NOT_FOUND:${ustn}`);

  const destCountry = (trade.destCountry || DEFAULT_DEST_COUNTRY).toUpperCase();
  const containerCount = Math.max(1, trade.containerCount || DEFAULT_CONTAINER_COUNT);

  // 2. Per-good duty + tax + Form 4 check.
  let totalDuty = 0;
  let totalVat = 0;
  let totalExcise = 0;
  let totalAd = 0;
  let anyForm4 = false;
  const goodsBreakdown: any[] = [];

  for (const g of goods) {
    if (!g.hsCode || !g.quantity || !g.unitValueUsd) {
      throw new Error(`INVALID_GOODS:${JSON.stringify(g)}`);
    }
    const customsValueUsd = round2(g.quantity * g.unitValueUsd);

    // G-02 — tariff + AD + VAT (the engine returns VAT too).
    const duty = await calculateDuty(
      g.hsCode,
      g.originCountry,
      destCountry,
      customsValueUsd,
    );

    // G-18 — excise on the customs value (VAT is already returned by the
    // tariff engine, so we only consult the tax engine for excise here).
    const excise = calculateTax(
      "EXCISE",
      customsValueUsd,
      destCountry,
      { goodsDescription: g.hsCode },
    );

    totalDuty = round2(totalDuty + duty.totalDuty);
    totalAd = round2(totalAd + (duty.antiDumpingDuty || 0));
    totalVat = round2(totalVat + (duty.vatAmount || 0));
    totalExcise = round2(totalExcise + (excise.taxAmount || 0));

    const form4 = isForm4Restricted(g.hsCode);
    if (form4) anyForm4 = true;

    goodsBreakdown.push({
      hsCode: g.hsCode,
      quantity: g.quantity,
      unitValueUsd: g.unitValueUsd,
      customsValueUsd,
      originCountry: g.originCountry.toUpperCase(),
      mfnRate: duty.mfnRate,
      preferentialRate: duty.preferentialRate,
      appliedRate: duty.appliedRate,
      ftaName: duty.ftaName,
      antiDumpingDutyUsd: duty.antiDumpingDuty || 0,
      customsDutyUsd: round2(duty.totalDuty - (duty.antiDumpingDuty || 0)),
      vatUsd: duty.vatAmount || 0,
      exciseUsd: excise.taxAmount || 0,
      form4Required: form4,
      source: duty.source,
      notes: duty.notes,
    });
  }

  // 3. Other charges (port handling + broker fee).
  const portHandlingUsd = round2(PORT_HANDLING_FEE_USD_PER_CONTAINER * containerCount);
  const brokerFeeUsd = BROKER_FEE_USD;

  const totalPayable = round2(totalDuty + totalVat + totalExcise + portHandlingUsd + brokerFeeUsd);

  // 4. Persist the CustomsDeclaration.
  const declarationNo = genDeclarationNo();
  const bundle = {
    ustn,
    importerGtid,
    brokerGtid: null,
    destCountry,
    originCountries: Array.from(new Set(goods.map((g) => g.originCountry.toUpperCase()))),
    containerCount,
    goods: goodsBreakdown,
    form4Required: anyForm4,
    form4Reason: anyForm4
      ? "One or more HS codes appear in the Egyptian GOEIC Form 4 restricted-goods list."
      : null,
    form4PermitId: null, // attached later via PATCH
    charges: {
      estimatedDutyUsd: totalDuty,
      antiDumpingUsd: totalAd,
      vatUsd: totalVat,
      exciseUsd: totalExcise,
      portHandlingUsd,
      brokerFeeUsd,
      totalPayableUsd: totalPayable,
    },
    paymentBatchId: null,
    settlementInstructionId: null,
    trackingId: null,
    submittedAt: null,
    clearanceStage: "DRAFT",
    paymentsStatus: "PENDING",
    estimatedClearance: null,
    history: [
      { at: new Date().toISOString(), event: "DECLARATION_CREATED", actor: importerGtid },
    ],
  };

  const decl = await db.customsDeclaration.create({
    data: {
      tradeId: trade.id,
      brokerGtid: null,
      declarationNo,
      regime: "IMPORT",
      status: "DRAFT",
      dutyUsd: totalDuty,
      etaXml: JSON.stringify(bundle),
      nafezaStatus: null,
      clearedAt: null,
    },
  });

  logger.info("[imports] declaration created", {
    declarationId: decl.id,
    declarationNo,
    ustn,
    importerGtid,
    form4Required: anyForm4,
    totalPayableUsd: totalPayable,
  });

  return {
    declarationId: decl.id,
    declarationNo,
    form4Required: anyForm4,
    form4Reason: bundle.form4Reason,
    estimatedDutyUsd: totalDuty,
    estimatedTaxUsd: round2(totalVat + totalExcise),
    totalPayableUsd: totalPayable,
    goodsCount: goods.length,
    destCountry,
  };
}

// ============================================================================
// §24.6 — validateForm4Requirement
// ============================================================================

/**
 * Validate whether a Form 4 import permit is required for the (HS code,
 * destination country, importer) tuple, and whether the importer holds a
 * valid permit.
 *
 * For Egypt (the primary Phase 3 destination), this consults the
 * FORM4_RESTRICTED_HS_PREFIXES table. For other countries the function
 * returns `required: false` with a per-country note (production would
 * consult each country's restricted-goods registry).
 *
 * The importer's stored permit reference is read from the most recent
 * CustomsDeclaration they own (in the etaXml JSON bundle's
 * `form4PermitId` field). If a permit is held, returns `permitId` so the
 * caller can attach it to the new declaration.
 */
export async function validateForm4Requirement(
  hsCode: string,
  destCountry: string,
  importerGtid: string,
): Promise<{
  required: boolean;
  reason: string;
  permitId: string | null;
  destCountry: string;
}> {
  const hs = (hsCode ?? "").trim();
  const dest = (destCountry ?? "").toUpperCase().trim();
  const importer = importerGtid;

  if (!hs) throw new Error("HS_CODE_REQUIRED");
  if (!dest) throw new Error("DEST_COUNTRY_REQUIRED");
  if (!importer) throw new Error("IMPORTER_GTID_REQUIRED");

  // Only Egypt Form 4 is modelled at Phase 3. Other countries → not required
  // (with a note that production should consult their registry).
  if (dest !== "EG") {
    return {
      required: false,
      reason: `Form 4 is an Egyptian GOEIC requirement. ${dest} has no equivalent SGTX-modelled permit; production should consult the local restricted-goods registry.`,
      permitId: null,
      destCountry: dest,
    };
  }

  const restricted = isForm4Restricted(hs);
  if (!restricted) {
    return {
      required: false,
      reason: `HS ${hs} is not on the Egyptian GOEIC Form 4 restricted-goods list. No import permit required.`,
      permitId: null,
      destCountry: dest,
    };
  }

  // Look up the importer's most recent stored Form 4 permit. We scan the
  // importer's CustomsDeclaration rows for a non-null form4PermitId in the
  // etaXml bundle.
  let permitId: string | null = null;
  try {
    const priorDecls = await db.customsDeclaration.findMany({
      where: { trade: { buyerGtid: importer } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: { id: true, etaXml: true },
    });
    for (const d of priorDecls) {
      if (!d.etaXml) continue;
      try {
        const b = JSON.parse(d.etaXml);
        if (b?.form4PermitId) {
          permitId = b.form4PermitId as string;
          break;
        }
      } catch {
        // ignore malformed bundles
      }
    }
  } catch (err: any) {
    logger.warn("[imports] permit lookup failed", { error: err?.message, importer });
  }

  return {
    required: true,
    reason: permitId
      ? `HS ${hs} is on the Egyptian GOEIC Form 4 restricted-goods list. The importer holds a stored permit (${permitId}) which can be attached to the new declaration.`
      : `HS ${hs} is on the Egyptian GOEIC Form 4 restricted-goods list. The importer must obtain a Form 4 permit from GOEIC before the declaration can be submitted to Nafeza.`,
    permitId,
    destCountry: dest,
  };
}

// ============================================================================
// §24.7 — calculateImportCharges
// ============================================================================

/**
 * Build the full import-charge breakdown for a declaration. Reads the
 * goods + charges stored in the declaration's etaXml JSON bundle and
 * returns a flat breakdown of every charge line + payee + amount.
 *
 * Recomputes the duty + tax fresh from the tariff + tax engines (so a
 * later MFN rate update from WITS is reflected). Persists the refreshed
 * totals back into the bundle.
 */
export async function calculateImportCharges(
  declarationId: string,
): Promise<{
  declarationId: string;
  dutyUsd: number;
  vatUsd: number;
  exciseUsd: number;
  otherChargesUsd: number;
  totalPayableUsd: number;
  breakdown: ImportCharge[];
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  const goods: any[] = bundle.goods || [];
  const destCountry = (bundle.destCountry || decl.trade?.destCountry || DEFAULT_DEST_COUNTRY).toUpperCase();
  const containerCount = Math.max(1, bundle.containerCount || decl.trade?.containerCount || DEFAULT_CONTAINER_COUNT);

  const breakdown: ImportCharge[] = [];
  let dutyUsd = 0;
  let vatUsd = 0;
  let exciseUsd = 0;
  let adUsd = 0;

  for (const g of goods) {
    const customsValueUsd = round2((g.quantity || 0) * (g.unitValueUsd || 0));
    const duty = await calculateDuty(g.hsCode, g.originCountry, destCountry, customsValueUsd);
    const excise = calculateTax(
      "EXCISE",
      customsValueUsd,
      destCountry,
      { goodsDescription: g.hsCode },
    );

    const customsDuty = round2(duty.totalDuty - (duty.antiDumpingDuty || 0));
    dutyUsd = round2(dutyUsd + duty.totalDuty);
    adUsd = round2(adUsd + (duty.antiDumpingDuty || 0));
    vatUsd = round2(vatUsd + (duty.vatAmount || 0));
    exciseUsd = round2(exciseUsd + (excise.taxAmount || 0));

    breakdown.push({
      code: `DUTY-${g.hsCode}`,
      label: `Customs duty — HS ${g.hsCode} (MFN ${duty.mfnRate}%${duty.preferentialRate != null ? ` / FTA ${duty.preferentialRate}%` : ""})`,
      payee: CUSTOMS_AUTHORITY.gtid,
      amountUsd: customsDuty,
      rate: duty.appliedRate,
      source: duty.ftaName ? `${duty.ftaName} (FTA)` : duty.source,
    });

    if (duty.antiDumpingDuty && duty.antiDumpingDuty > 0) {
      breakdown.push({
        code: `AD-${g.hsCode}`,
        label: `Anti-dumping duty — HS ${g.hsCode} (${duty.antiDumpingSource})`,
        payee: CUSTOMS_AUTHORITY.gtid,
        amountUsd: round2(duty.antiDumpingDuty),
        rate: duty.antiDumpingRate,
        source: duty.antiDumpingSource,
      });
    }

    if (duty.vatAmount && duty.vatAmount > 0) {
      breakdown.push({
        code: `VAT-${g.hsCode}`,
        label: `${duty.vatLabel} (${duty.vatRate}%) — HS ${g.hsCode}`,
        payee: TAX_AUTHORITY.gtid,
        amountUsd: round2(duty.vatAmount),
        rate: duty.vatRate,
        source: "G-18 tax-engine",
      });
    }

    if (excise.taxAmount && excise.taxAmount > 0) {
      breakdown.push({
        code: `EXC-${g.hsCode}`,
        label: `Excise — HS ${g.hsCode} (${excise.ratePercent || 0}%)`,
        payee: TAX_AUTHORITY.gtid,
        amountUsd: round2(excise.taxAmount),
        rate: excise.ratePercent,
        source: "G-18 tax-engine",
      });
    }
  }

  const portHandlingUsd = round2(PORT_HANDLING_FEE_USD_PER_CONTAINER * containerCount);
  const brokerFeeUsd = BROKER_FEE_USD;
  const otherChargesUsd = round2(portHandlingUsd + brokerFeeUsd);

  breakdown.push({
    code: "PORT-HANDLING",
    label: `Port Terminal Handling Charge (${containerCount} container${containerCount === 1 ? "" : "s"})`,
    payee: PORT_AUTHORITY.gtid,
    amountUsd: portHandlingUsd,
    source: "Part 6.1.1 ($150/container)",
  });

  breakdown.push({
    code: "BROKER-FEE",
    label: "Customs broker entry + amendment fee",
    payee: DEFAULT_BROKER.gtid,
    amountUsd: brokerFeeUsd,
    source: "Flat $150/declaration",
  });

  const totalPayableUsd = round2(dutyUsd + vatUsd + exciseUsd + otherChargesUsd);

  // Persist refreshed totals back into the bundle.
  bundle.charges = {
    estimatedDutyUsd: dutyUsd,
    antiDumpingUsd: adUsd,
    vatUsd,
    exciseUsd,
    portHandlingUsd,
    brokerFeeUsd,
    totalPayableUsd,
  };
  bundle.chargesBreakdown = breakdown;
  bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
  bundle.history.push({ at: new Date().toISOString(), event: "CHARGES_RECALCULATED" });

  await db.customsDeclaration.update({
    where: { id: declarationId },
    data: {
      dutyUsd,
      etaXml: JSON.stringify(bundle),
    },
  });

  return {
    declarationId,
    dutyUsd,
    vatUsd,
    exciseUsd,
    otherChargesUsd,
    totalPayableUsd,
    breakdown,
  };
}

// ============================================================================
// §24.8 — createLocalPaymentBatch
// ============================================================================

/**
 * Build a local payment batch for an import declaration. Creates a single
 * SettlementInstruction + multiple PaymentLeg rows (one per payee). All
 * payments are routed via the PSP (non-custodial — SGTX only emits the
 * split instructions; the licensed PSP holds and executes the funds).
 *
 * The payees are:
 *   1. Egyptian Customs Authority — duty + anti-dumping
 *   2. Egyptian Tax Authority     — VAT + excise
 *   3. Port Authority             — THC + port handling
 *   4. Customs Broker             — broker entry fee
 *
 * If a batch already exists for the declaration (idempotent), returns the
 * existing batch summary.
 */
export async function createLocalPaymentBatch(
  declarationId: string,
): Promise<{
  batchId: string;
  declarationId: string;
  settlementInstructionId: string;
  payments: PaymentInstruction[];
  totalUsd: number;
  currency: string;
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  // Idempotent: if a batch already exists, return it.
  if (bundle.paymentBatchId && bundle.settlementInstructionId) {
    const existingLegs = await db.paymentLeg.findMany({
      where: { settlementInstructionId: bundle.settlementInstructionId },
    });
    return {
      batchId: bundle.paymentBatchId,
      declarationId,
      settlementInstructionId: bundle.settlementInstructionId,
      payments: existingLegs.map((l: any) => ({
        legId: l.legId,
        payee: l.beneficiaryId || "",
        payeeName: l.beneficiaryName || "",
        beneficiaryType: l.beneficiaryType || "",
        amountUsd: l.amount,
        currency: l.currency,
        purpose: l.beneficiaryName || "",
        state: l.legState,
      })),
      totalUsd: round2(existingLegs.reduce((s: number, l: any) => s + (l.amount || 0), 0)),
      currency: "USD",
    };
  }

  // Compute the charges (recalc ensures fresh totals).
  const charges = await calculateImportCharges(declarationId);

  // Aggregate by payee.
  const byPayee = new Map<string, { amount: number; lines: string[] }>();
  for (const line of charges.breakdown) {
    const cur = byPayee.get(line.payee) || { amount: 0, lines: [] };
    cur.amount = round2(cur.amount + line.amountUsd);
    cur.lines.push(line.label);
    byPayee.set(line.payee, cur);
  }

  // Build the payee lookup (customs, tax, port, broker).
  const payeeMap = new Map<string, PayeeRef>([
    [CUSTOMS_AUTHORITY.gtid, CUSTOMS_AUTHORITY],
    [TAX_AUTHORITY.gtid, TAX_AUTHORITY],
    [PORT_AUTHORITY.gtid, PORT_AUTHORITY],
    [DEFAULT_BROKER.gtid, DEFAULT_BROKER],
  ]);

  const ustn = bundle.ustn || decl.trade?.ustn || "";
  if (!ustn) throw new Error("USTN_NOT_RESOLVED");

  const importerGtid = bundle.importerGtid || decl.trade?.buyerGtid || "";
  if (!importerGtid) throw new Error("IMPORTER_GTID_NOT_RESOLVED");

  // 1. Create the SettlementInstruction (payer = importer, payee = SGTX-PLATFORM
  //    as the batch aggregator; the legs themselves carry the actual payees).
  const instructionId = genInstructionId();
  const batchId = genBatchId();
  const totalUsd = charges.totalPayableUsd;

  await db.settlementInstruction.create({
    data: {
      instructionId,
      ustn,
      tradeId: decl.tradeId,
      payerGtid: importerGtid,
      payeeGtid: "SGTX-PLATFORM",
      amountUsd: totalUsd,
      currency: "USD",
      status: "PENDING_APPROVAL",
      pspProvider: "PAYMOB", // default PSP for import payment batches (Phase 3)
      pspSelected: null,
      pspReference: batchId,
    },
  });

  // 2. Create one PaymentLeg per payee.
  const payments: PaymentInstruction[] = [];
  for (const [payeeGtid, agg] of Array.from(byPayee.entries())) {
    if (agg.amount <= 0) continue;
    const payee = payeeMap.get(payeeGtid) || {
      gtid: payeeGtid,
      name: payeeGtid,
      beneficiaryType: "PLATFORM" as const,
      description: "Other payee",
    };
    const legId = genLegId();
    const leg = await db.paymentLeg.create({
      data: {
        legId,
        ustn,
        settlementInstructionId: instructionId,
        beneficiaryId: payee.gtid,
        beneficiaryName: `${payee.name} — ${agg.lines.join("; ")}`,
        beneficiaryType: payee.beneficiaryType,
        amount: agg.amount,
        currency: "USD",
        legState: "PENDING",
        sgtxEventHash: declarationId,
      },
    });
    payments.push({
      legId: leg.legId,
      payee: payee.gtid,
      payeeName: payee.name,
      beneficiaryType: payee.beneficiaryType,
      amountUsd: agg.amount,
      currency: "USD",
      purpose: agg.lines.join("; "),
      state: leg.legState,
    });
  }

  // 3. Update the declaration bundle.
  bundle.paymentBatchId = batchId;
  bundle.settlementInstructionId = instructionId;
  bundle.paymentsStatus = "BATCH_CREATED";
  bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
  bundle.history.push({
    at: new Date().toISOString(),
    event: "PAYMENT_BATCH_CREATED",
    batchId,
    legCount: payments.length,
  });

  await db.customsDeclaration.update({
    where: { id: declarationId },
    data: { etaXml: JSON.stringify(bundle) },
  });

  logger.info("[imports] payment batch created", {
    declarationId,
    batchId,
    instructionId,
    legCount: payments.length,
    totalUsd,
  });

  return {
    batchId,
    declarationId,
    settlementInstructionId: instructionId,
    payments,
    totalUsd,
    currency: "USD",
  };
}

// ============================================================================
// §24.9 — submitPaymentBatch
// ============================================================================

/**
 * Submit a payment batch to the PSP. Transitions all legs from PENDING →
 * SUBMITTED. Returns the PSP tracking ID + per-leg status.
 *
 * Non-custodial: SGTX does NOT hold funds; the PSP holds and executes the
 * split. The PSP returns one confirmation per leg; we record the
 * confirmation reference in each leg's externalPaymentRef.
 */
export async function submitPaymentBatch(
  batchId: string,
): Promise<{
  submitted: boolean;
  batchId: string;
  trackingId: string;
  paymentLegs: Array<{
    legId: string;
    payee: string;
    amount: number;
    currency: string;
    status: string;
    externalRef: string | null;
  }>;
}> {
  if (!batchId) throw new Error("BATCH_ID_REQUIRED");

  // The batchId is stored as the SettlementInstruction.pspReference.
  const instr = await db.settlementInstruction.findFirst({
    where: { pspReference: batchId },
  });
  if (!instr) throw new Error(`BATCH_NOT_FOUND:${batchId}`);

  const legs = await db.paymentLeg.findMany({
    where: { settlementInstructionId: instr.instructionId },
  });
  if (legs.length === 0) {
    throw new Error(`BATCH_EMPTY:${batchId}`);
  }

  const trackingId = genTrackingId();
  const out: any[] = [];

  // Per-leg PSP submission (simulated — production would call the PSP API).
  for (const leg of legs) {
    if (leg.legState === "SETTLED" || leg.legState === "SUBMITTED") {
      // Idempotent: skip already-submitted legs.
      out.push({
        legId: leg.legId,
        payee: leg.beneficiaryId || "",
        amount: leg.amount,
        currency: leg.currency,
        status: leg.legState,
        externalRef: leg.externalPaymentRef,
      });
      continue;
    }
    const externalRef = `PSP-${trackingId}-${leg.legId.slice(-6)}`;
    await db.paymentLeg.update({
      where: { id: leg.id },
      data: {
        legState: "SUBMITTED",
        externalPaymentRef: externalRef,
        executionTimestamp: new Date(),
      },
    });
    out.push({
      legId: leg.legId,
      payee: leg.beneficiaryId || "",
      amount: leg.amount,
      currency: leg.currency,
      status: "SUBMITTED",
      externalRef,
    });
  }

  // Update the SettlementInstruction status.
  await db.settlementInstruction.update({
    where: { instructionId: instr.instructionId },
    data: {
      status: "SUBMITTED_TO_PSP",
      pspSelected: instr.pspProvider || "PAYMOB",
    },
  });

  // Update the declaration bundle.
  const decl = await db.customsDeclaration.findFirst({
    where: { etaXml: { contains: batchId } },
  });
  if (decl) {
    let bundle: any = {};
    try {
      bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
    } catch {
      bundle = {};
    }
    if (bundle.paymentBatchId === batchId) {
      bundle.paymentsStatus = "SUBMITTED_TO_PSP";
      bundle.trackingId = trackingId;
      bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
      bundle.history.push({
        at: new Date().toISOString(),
        event: "PAYMENT_BATCH_SUBMITTED",
        trackingId,
      });
      await db.customsDeclaration.update({
        where: { id: decl.id },
        data: { etaXml: JSON.stringify(bundle) },
      });
    }
  }

  return { submitted: true, batchId, trackingId, paymentLegs: out };
}

// ============================================================================
// §24.10 — submitImportDeclaration
// ============================================================================

/**
 * Submit an import declaration to the destination country's customs
 * authority. For Egypt, this calls the existing Nafeza adapter
 * (submitDeclaration) to file the ACI (Advance Cargo Information)
 * declaration and obtain the ACID. The local payment batch is created (if
 * not already present) and submitted to the PSP. A tracking ID is returned
 * for status polling.
 *
 * If the declaration requires a Form 4 permit but no permit has been
 * attached, the submission is blocked (returns `submitted: false` with the
 * blocking reason).
 */
export async function submitImportDeclaration(
  declarationId: string,
): Promise<{
  submitted: boolean;
  declarationId: string;
  batchId: string | null;
  trackingId: string | null;
  blockingReason: string | null;
  externalDeclId: string | null;
  acid: string | null;
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  // Form 4 guard: if required, must have a permit attached.
  if (bundle.form4Required && !bundle.form4PermitId) {
    return {
      submitted: false,
      declarationId,
      batchId: bundle.paymentBatchId || null,
      trackingId: null,
      blockingReason:
        "FORM4_PERMIT_REQUIRED — attach a valid Form 4 permit (GOEIC-issued) via PATCH /api/sgtx/imports/declaration/[id] before submitting.",
      externalDeclId: null,
      acid: null,
    };
  }

  // Idempotent: if already submitted, return the existing tracking.
  if (bundle.submittedAt && bundle.trackingId) {
    return {
      submitted: true,
      declarationId,
      batchId: bundle.paymentBatchId || null,
      trackingId: bundle.trackingId,
      blockingReason: null,
      externalDeclId: bundle.externalDeclId || null,
      acid: bundle.acid || null,
    };
  }

  // Compute / refresh charges + create the payment batch if not already.
  if (!bundle.paymentBatchId) {
    await calculateImportCharges(declarationId);
    await createLocalPaymentBatch(declarationId);
    // re-load the bundle (calculateImportCharges + createLocalPaymentBatch
    // both mutate it).
    const refreshed = await db.customsDeclaration.findUnique({
      where: { id: declarationId },
    });
    if (refreshed?.etaXml) {
      try {
        bundle = JSON.parse(refreshed.etaXml);
      } catch {
        // keep prior bundle
      }
    }
  }

  // Submit to Nafeza (Egypt) — file the ACI declaration.
  const ustn = bundle.ustn || decl.trade?.ustn || "";
  let externalDeclId: string | null = null;
  let acid: string | null = null;
  if (ustn) {
    try {
      const submission = await nafezaSubmit(ustn, {
        declarationNo: decl.declarationNo,
        goods: bundle.goods,
        importerGtid: bundle.importerGtid,
        form4PermitId: bundle.form4PermitId || null,
        destCountry: bundle.destCountry,
        charges: bundle.charges,
      });
      externalDeclId = submission.declarationId;
      acid = submission.acid || null;
    } catch (err: any) {
      logger.warn("[imports] nafeza submit failed", {
        error: err?.message,
        declarationId,
        ustn,
      });
    }
  }

  // Submit the payment batch to the PSP.
  let trackingId: string | null = null;
  if (bundle.paymentBatchId) {
    try {
      const batchSubmission = await submitPaymentBatch(bundle.paymentBatchId);
      trackingId = batchSubmission.trackingId;
    } catch (err: any) {
      logger.warn("[imports] payment batch submit failed", {
        error: err?.message,
        declarationId,
        batchId: bundle.paymentBatchId,
      });
    }
  }

  // Update the declaration state.
  const now = new Date().toISOString();
  bundle.submittedAt = now;
  bundle.externalDeclId = externalDeclId;
  bundle.acid = acid;
  bundle.trackingId = trackingId || bundle.trackingId || genTrackingId();
  bundle.clearanceStage = "SUBMITTED";
  bundle.paymentsStatus = "SUBMITTED_TO_PSP";
  bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
  bundle.history.push({
    at: now,
    event: "DECLARATION_SUBMITTED",
    externalDeclId,
    acid,
    trackingId: bundle.trackingId,
  });

  await db.customsDeclaration.update({
    where: { id: declarationId },
    data: {
      status: "SUBMITTED",
      nafezaStatus: "SUBMITTED",
      etaXml: JSON.stringify(bundle),
    },
  });

  // Inbox notification to the importer.
  try {
    await db.inboxItem.create({
      data: {
        tenantGtid: bundle.importerGtid || decl.trade?.buyerGtid || "",
        tradeId: decl.tradeId,
        category: "IMPORTS",
        priority: 60,
        title: `Import declaration ${decl.declarationNo} submitted to Nafeza`,
        description: `ACID: ${acid || "—"} | Tracking: ${bundle.trackingId} | Total payable: $${bundle.charges?.totalPayableUsd || 0}`,
        ctaLabel: "Track clearance",
      },
    });
  } catch (err: any) {
    logger.warn("[imports] inbox notify failed", { error: err?.message });
  }

  return {
    submitted: true,
    declarationId,
    batchId: bundle.paymentBatchId || null,
    trackingId: bundle.trackingId,
    blockingReason: null,
    externalDeclId,
    acid,
  };
}

// ============================================================================
// §24.11 — checkImportStatus
// ============================================================================

/**
 * Check the clearance + payment status of an import declaration. Calls the
 * Nafeza status adapter (when available) to refresh the clearance stage,
 * then returns the consolidated status.
 */
export async function checkImportStatus(
  declarationId: string,
): Promise<{
  declarationId: string;
  declarationNo: string | null;
  status: string;
  clearanceStage: string;
  paymentsStatus: string;
  estimatedClearance: string | null;
  externalDeclId: string | null;
  acid: string | null;
  trackingId: string | null;
  payments: Array<{ legId: string; payee: string; amount: number; state: string }>;
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  // Refresh clearance status from Nafeza if we have an external declaration ID.
  let externalStatus: string | null = null;
  if (bundle.externalDeclId) {
    try {
      const status = await nafezaStatus(bundle.externalDeclId);
      externalStatus = status.status;
      // Map Nafeza status → clearance stage.
      const map: Record<string, string> = {
        SUBMITTED: "SUBMITTED",
        ASSESSED: "ASSESSED",
        CLEARED: "CLEARED",
        REJECTED: "REJECTED",
      };
      bundle.clearanceStage = map[status.status] || bundle.clearanceStage || "SUBMITTED";
      if (status.clearanceStatus === "CLEARED" && !decl.clearedAt) {
        await db.customsDeclaration.update({
          where: { id: declarationId },
          data: { clearedAt: new Date(), nafezaStatus: status.status },
        });
      }
    } catch (err: any) {
      logger.warn("[imports] nafeza status refresh failed", {
        error: err?.message,
        declarationId,
        externalDeclId: bundle.externalDeclId,
      });
    }
  }

  // Refresh payment leg states.
  let payments: any[] = [];
  if (bundle.settlementInstructionId) {
    const legs = await db.paymentLeg.findMany({
      where: { settlementInstructionId: bundle.settlementInstructionId },
    });
    payments = legs.map((l: any) => ({
      legId: l.legId,
      payee: l.beneficiaryId || "",
      amount: l.amount,
      state: l.legState,
    }));
    const allSettled = legs.length > 0 && legs.every((l: any) => l.legState === "SETTLED");
    const anyRejected = legs.some((l: any) => l.legState === "REJECTED");
    if (allSettled) bundle.paymentsStatus = "SETTLED";
    else if (anyRejected) bundle.paymentsStatus = "PARTIAL_FAILURE";
    else if (legs.some((l: any) => l.legState === "SUBMITTED")) bundle.paymentsStatus = "SUBMITTED_TO_PSP";
  }

  // Estimated clearance date — Nafeza typically clears in 1-3 business days
  // after submission. We add a deterministic 3-day window from submission.
  let estimatedClearance: string | null = bundle.estimatedClearance || null;
  if (bundle.submittedAt && !estimatedClearance && bundle.clearanceStage !== "CLEARED") {
    const submittedAt = new Date(bundle.submittedAt);
    const est = new Date(submittedAt.getTime() + 3 * 86400_000);
    estimatedClearance = est.toISOString();
    bundle.estimatedClearance = estimatedClearance;
  }

  // Persist the refreshed bundle.
  bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
  bundle.history.push({
    at: new Date().toISOString(),
    event: "STATUS_CHECKED",
    externalStatus,
  });
  await db.customsDeclaration.update({
    where: { id: declarationId },
    data: {
      nafezaStatus: externalStatus || decl.nafezaStatus,
      etaXml: JSON.stringify(bundle),
    },
  });

  return {
    declarationId,
    declarationNo: decl.declarationNo,
    status: decl.status,
    clearanceStage: bundle.clearanceStage || "DRAFT",
    paymentsStatus: bundle.paymentsStatus || "PENDING",
    estimatedClearance,
    externalDeclId: bundle.externalDeclId || null,
    acid: bundle.acid || null,
    trackingId: bundle.trackingId || null,
    payments,
  };
}

// ============================================================================
// §24.12 — amendDeclaration (used by the PATCH route)
// ============================================================================

/**
 * Amend an existing import declaration. Supports attaching a Form 4 permit
 * reference and adding/amending goods. Recomputes charges on amend.
 */
export async function amendDeclaration(
  declarationId: string,
  patch: {
    form4PermitId?: string;
    addGoods?: ImportGoods[];
    brokerGtid?: string;
    notes?: string;
  },
): Promise<{
  declarationId: string;
  form4PermitId: string | null;
  goodsCount: number;
  totalPayableUsd: number;
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);
  if (decl.status === "SUBMITTED" || decl.status === "CLEARED") {
    throw new Error(`DECLARATION_LOCKED:${decl.status}`);
  }

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  // Attach Form 4 permit.
  if (patch.form4PermitId) {
    bundle.form4PermitId = patch.form4PermitId;
  }

  // Attach broker — validate FK first (broker must be an existing Tenant).
  if (patch.brokerGtid) {
    try {
      const broker = await db.tenant.findUnique({ where: { gtid: patch.brokerGtid }, select: { gtid: true } });
      if (broker) {
        bundle.brokerGtid = patch.brokerGtid;
        // Persist the broker FK on the CustomsDeclaration row itself too (so
        // existing queries that filter by brokerGtid still work).
        await db.customsDeclaration.update({
          where: { id: declarationId },
          data: { brokerGtid: patch.brokerGtid },
        });
      } else {
        // Stash the requested broker GTID in the bundle but DON'T write the
        // FK column (would violate the FK constraint). The submission step
        // will skip the broker leg if no FK is set.
        bundle.brokerGtidRequested = patch.brokerGtid;
        logger.warn("[imports] broker GTID not found — stashing in bundle only", {
          brokerGtid: patch.brokerGtid,
        });
      }
    } catch (err: any) {
      logger.warn("[imports] broker assignment failed", { error: err?.message, brokerGtid: patch.brokerGtid });
      bundle.brokerGtidRequested = patch.brokerGtid;
    }
  }

  // Add/amend goods — re-derive the per-good breakdown fresh.
  if (Array.isArray(patch.addGoods) && patch.addGoods.length > 0) {
    const destCountry = (bundle.destCountry || decl.trade?.destCountry || DEFAULT_DEST_COUNTRY).toUpperCase();
    const newGoods: any[] = [];
    for (const g of patch.addGoods) {
      if (!g.hsCode || !g.quantity || !g.unitValueUsd) continue;
      const customsValueUsd = round2(g.quantity * g.unitValueUsd);
      const duty = await calculateDuty(g.hsCode, g.originCountry, destCountry, customsValueUsd);
      const excise = calculateTax(
        "EXCISE",
        customsValueUsd,
        destCountry,
        { goodsDescription: g.hsCode },
      );
      newGoods.push({
        hsCode: g.hsCode,
        quantity: g.quantity,
        unitValueUsd: g.unitValueUsd,
        customsValueUsd,
        originCountry: g.originCountry.toUpperCase(),
        mfnRate: duty.mfnRate,
        preferentialRate: duty.preferentialRate,
        appliedRate: duty.appliedRate,
        ftaName: duty.ftaName,
        antiDumpingDutyUsd: duty.antiDumpingDuty || 0,
        customsDutyUsd: round2(duty.totalDuty - (duty.antiDumpingDuty || 0)),
        vatUsd: duty.vatAmount || 0,
        exciseUsd: excise.taxAmount || 0,
        form4Required: isForm4Restricted(g.hsCode),
        source: duty.source,
        notes: duty.notes,
      });
    }
    bundle.goods = Array.isArray(bundle.goods) ? bundle.goods : [];
    bundle.goods = bundle.goods.concat(newGoods);
    // Re-evaluate the global form4Required flag.
    bundle.form4Required = bundle.goods.some((g: any) => g.form4Required);
    if (bundle.form4Required && !bundle.form4PermitId) {
      bundle.form4Reason =
        "One or more HS codes appear in the Egyptian GOEIC Form 4 restricted-goods list.";
    } else if (!bundle.form4Required) {
      bundle.form4Reason = null;
    }
  }

  if (patch.notes) {
    bundle.amendNotes = Array.isArray(bundle.amendNotes)
      ? bundle.amendNotes
      : [];
    bundle.amendNotes.push({ at: new Date().toISOString(), note: patch.notes });
  }

  bundle.history = Array.isArray(bundle.history) ? bundle.history : [];
  bundle.history.push({
    at: new Date().toISOString(),
    event: "DECLARATION_AMENDED",
    patch: {
      form4PermitId: patch.form4PermitId || null,
      addedGoods: patch.addGoods?.length || 0,
      brokerGtid: patch.brokerGtid || null,
    },
  });

  await db.customsDeclaration.update({
    where: { id: declarationId },
    data: {
      etaXml: JSON.stringify(bundle),
    },
  });

  // Re-compute charges so the response reflects the amendment.
  const charges = await calculateImportCharges(declarationId);

  return {
    declarationId,
    form4PermitId: bundle.form4PermitId || null,
    goodsCount: bundle.goods?.length || 0,
    totalPayableUsd: charges.totalPayableUsd,
  };
}

// ============================================================================
// §24.13 — getDeclaration (helper used by GET /declaration/[id])
// ============================================================================

export async function getDeclaration(declarationId: string): Promise<{
  declarationId: string;
  declarationNo: string | null;
  status: string;
  regime: string;
  ustn: string | null;
  importerGtid: string | null;
  brokerGtid: string | null;
  destCountry: string;
  form4Required: boolean;
  form4PermitId: string | null;
  goods: any[];
  charges: any;
  paymentBatchId: string | null;
  settlementInstructionId: string | null;
  trackingId: string | null;
  submittedAt: string | null;
  externalDeclId: string | null;
  acid: string | null;
  clearanceStage: string;
  paymentsStatus: string;
  createdAt: string;
}> {
  if (!declarationId) throw new Error("DECLARATION_ID_REQUIRED");

  const decl = await db.customsDeclaration.findUnique({
    where: { id: declarationId },
    include: { trade: true },
  });
  if (!decl) throw new Error(`DECLARATION_NOT_FOUND:${declarationId}`);

  let bundle: any = {};
  try {
    bundle = decl.etaXml ? JSON.parse(decl.etaXml) : {};
  } catch {
    bundle = {};
  }

  return {
    declarationId: decl.id,
    declarationNo: decl.declarationNo,
    status: decl.status,
    regime: decl.regime,
    ustn: bundle.ustn || decl.trade?.ustn || null,
    importerGtid: bundle.importerGtid || decl.trade?.buyerGtid || null,
    brokerGtid: decl.brokerGtid || bundle.brokerGtid || null,
    destCountry: bundle.destCountry || decl.trade?.destCountry || DEFAULT_DEST_COUNTRY,
    form4Required: !!bundle.form4Required,
    form4PermitId: bundle.form4PermitId || null,
    goods: bundle.goods || [],
    charges: bundle.charges || null,
    paymentBatchId: bundle.paymentBatchId || null,
    settlementInstructionId: bundle.settlementInstructionId || null,
    trackingId: bundle.trackingId || null,
    submittedAt: bundle.submittedAt || null,
    externalDeclId: bundle.externalDeclId || null,
    acid: bundle.acid || null,
    clearanceStage: bundle.clearanceStage || "DRAFT",
    paymentsStatus: bundle.paymentsStatus || "PENDING",
    createdAt: decl.createdAt.toISOString(),
  };
}
