// SGTX Trade Cost Engine — Part XI (CCL-009)
// ============================================================================
// Decomposes a trade's total landed cost into individual TradeCostObligation
// rows. Each obligation is tagged with:
//
//   • obligationType      — SGTX_FEE | CUSTOMS_DUTY | FREIGHT | THC | ... (15)
//   • recipientClass     — SGTX | GOVERNMENT | LABORATORY | CARRIER | ... (8)
//   • payer              — BUYER | SELLER (per Incoterm 2020 matrix)
//   • calculationMethod  — FIXED | PERCENTAGE_BASED | TIME_BASED | ...
//
// Cost lines produced for every trade:
//   1. SGTX fee              — 1.5% of declared trade value (blueprint §1.5)
//   2. Customs duty          — async lookup from GRiRE (HsTariffRate)
//   3. Logistics (freight)   — input.logisticsCostUSD or estimated
//   4. Reefer power          — only when coldChain = true
//   5. THC + port charges    — per Incoterm payer allocation
//   6. Insurance             — only when the incoterm requires it (CIF/CIP)
//
// The function is async because GRiRE's `getTariffRate()` is async (DB read).
// All DB writes are defensive (try/catch) and persisted separately by the
// API route via `persistObligations()` — the engine itself never throws.
//
// Payer allocation follows the Incoterm 2020 responsibility matrix from
// `@/lib/sgtx/incoterms/responsibility-engine`. For duties, DDP → SELLER
// pays; all other incoterms → BUYER pays.

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getTariffRate } from "@/lib/sgtx/grire";
import { getIncotermResponsibility } from "@/lib/sgtx/incoterms/responsibility-engine";

// ---------------------------------------------------------------------------
// Constants (blueprint §1.5 — Fees)
// ---------------------------------------------------------------------------
export const SGTX_FEE_RATE = 0.015; // 1.5% of declared trade value
export const DEFAULT_TARIFF_FALLBACK_RATE = 0.05; // 5% — used only if GRiRE has no data
export const DEFAULT_THC_PER_CONTAINER = 250; // USD — placeholder terminal handling
export const DEFAULT_PORT_CHARGES_PER_CONTAINER = 150; // USD
export const DEFAULT_REEFER_DAILY_TARIFF = 35; // USD/day
export const DEFAULT_INSURANCE_RATE = 0.0015; // 0.15% of declared value
// Mode-specific handling fees (Fix 1 — Task FIX-THC-DOCS-SURCHARGES)
export const DEFAULT_AIR_HANDLING_FEE_PER_CONTAINER = 175; // USD per air shipment
export const DEFAULT_SECURITY_FEE_PER_CONTAINER = 75; // USD per air shipment
export const DEFAULT_TOLL_CHARGES_PER_CONTAINER = 120; // USD per truck
export const DEFAULT_FUEL_SURCHARGE_PER_CONTAINER = 95; // USD per truck
export const DEFAULT_RAIL_HANDLING_FEE_PER_CONTAINER = 140; // USD per rail consignment

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type ObligationType =
  | "SGTX_FEE"
  | "CUSTOMS_DUTY"
  | "PHYTOSANITARY"
  | "LABORATORY"
  | "INSPECTION"
  | "CERTIFICATE"
  | "FREIGHT"
  | "PORT_CHARGES"
  | "THC"
  | "REEFER_POWER"
  | "STORAGE"
  | "DEMURRAGE"
  | "DETENTION"
  | "INSURANCE"
  | "TRADE_CONSIDERATION"
  // Mode-specific terminal/handling obligations (Fix 1 — Task FIX-THC-DOCS-SURCHARGES)
  // Air-freight handling & security screening
  | "AIR_HANDLING_FEE"
  | "SECURITY_FEE"
  // Truck / road
  | "TOLL_CHARGES"
  | "FUEL_SURCHARGE"
  // Rail terminal handling
  | "RAIL_HANDLING_FEE";

export type RecipientClass =
  | "SGTX"
  | "GOVERNMENT"
  | "LABORATORY"
  | "CERTIFICATION"
  | "CARRIER"
  | "PORT_TERMINAL"
  | "OTHER_SERVICE_PROVIDER"
  | "SELLER";

export type CalculationMethod =
  | "FIXED"
  | "VARIABLE"
  | "TIME_BASED"
  | "EVENT_BASED"
  | "QUANTITY_BASED"
  | "WEIGHT_BASED"
  | "VOLUME_BASED"
  | "CONTAINER_BASED"
  | "DISTANCE_BASED"
  | "PERCENTAGE_BASED";

export type Payer = "BUYER" | "SELLER";

export interface TradeCostObligation {
  ustn: string | null;
  obligationType: ObligationType;
  recipientClass: RecipientClass;
  amount: number;
  currency: string;
  payer: Payer | null;
  payee?: string | null;
  dueDate?: Date | null;
  calculationMethod: CalculationMethod | null;
  tariffSource?: string | null;
  costState: string; // ESTIMATED | CONFIRMED | ACCRUING | FINALIZED | PAID | RECONCILED
  incotermDriven: boolean;
}

export interface TradeCostInput {
  ustn: string;
  origin: string;
  destination: string;
  hsCode: string;
  declaredValue: number;
  incoterm: string;
  transportMode: string;
  currency: string;
  coldChain?: boolean;
  containerCount?: number;
  logisticsCostUSD?: number;
}

export interface TradeCostBreakdown {
  ustn: string;
  currency: string;
  declaredValue: number;
  totalCost: number;
  obligations: TradeCostObligation[];
  byRecipientClass: Record<string, number>;
  byPayer: { BUYER: number; SELLER: number };
  explanation: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function round(n: number, dp = 2): number {
  const f = Math.pow(10, dp);
  return Math.round((n + Number.EPSILON) * f) / f;
}

const RECIPIENT_BY_OBLIGATION: Record<ObligationType, RecipientClass> = {
  SGTX_FEE: "SGTX",
  CUSTOMS_DUTY: "GOVERNMENT",
  PHYTOSANITARY: "GOVERNMENT",
  LABORATORY: "LABORATORY",
  INSPECTION: "LABORATORY",
  CERTIFICATE: "CERTIFICATION",
  FREIGHT: "CARRIER",
  PORT_CHARGES: "PORT_TERMINAL",
  THC: "PORT_TERMINAL",
  REEFER_POWER: "PORT_TERMINAL",
  STORAGE: "PORT_TERMINAL",
  DEMURRAGE: "PORT_TERMINAL",
  DETENTION: "PORT_TERMINAL",
  INSURANCE: "OTHER_SERVICE_PROVIDER",
  TRADE_CONSIDERATION: "SELLER",
  // Mode-specific (Fix 1 — Task FIX-THC-DOCS-SURCHARGES)
  AIR_HANDLING_FEE: "CARRIER",
  SECURITY_FEE: "CARRIER",
  TOLL_CHARGES: "CARRIER",
  FUEL_SURCHARGE: "CARRIER",
  RAIL_HANDLING_FEE: "OTHER_SERVICE_PROVIDER",
};

// ---------------------------------------------------------------------------
// Main calculation
// ---------------------------------------------------------------------------
export async function calculateTradeCosts(input: TradeCostInput): Promise<TradeCostBreakdown> {
  const {
    ustn,
    destination,
    hsCode,
    declaredValue,
    incoterm,
    currency,
    coldChain = false,
    containerCount = 1,
    logisticsCostUSD,
    transportMode,
  } = input;

  const obligations: TradeCostObligation[] = [];
  const inc = safeGetIncoterm(incoterm);
  // DDP → seller pays duties; everything else → buyer pays (default)
  const dutyPayer: Payer = inc.sellerDuties ? "SELLER" : "BUYER";
  // THC payer per incoterm matrix
  const thcPayer: Payer = (inc.thcResponsible as Payer) ?? "BUYER";
  // Freight payer — seller if sellerFreight true, else buyer
  const freightPayer: Payer = inc.sellerFreight ? "SELLER" : "BUYER";

  // 1. SGTX fee — 1.5% of declared value, payer = BUYER
  obligations.push({
    ustn,
    obligationType: "SGTX_FEE",
    recipientClass: "SGTX",
    amount: round(declaredValue * SGTX_FEE_RATE),
    currency,
    payer: "BUYER",
    payee: "SGTX",
    calculationMethod: "PERCENTAGE_BASED",
    tariffSource: "SGTX_BLUEPRINT_1.5",
    costState: "ESTIMATED",
    incotermDriven: false,
  });

  // 2. Customs duty — async GRiRE lookup
  const tariff = await safeGetTariff(hsCode, destination);
  const tariffRate = tariff?.tariffRate ?? DEFAULT_TARIFF_FALLBACK_RATE;
  const tariffSource = tariff ? `GRiRE:${tariff.hsCode}` : "FALLBACK_5PCT";
  obligations.push({
    ustn,
    obligationType: "CUSTOMS_DUTY",
    recipientClass: "GOVERNMENT",
    amount: round(declaredValue * tariffRate),
    currency,
    payer: dutyPayer,
    payee: destination.toUpperCase() + "_CUSTOMS",
    calculationMethod: "PERCENTAGE_BASED",
    tariffSource,
    costState: "ESTIMATED",
    incotermDriven: true,
  });

  // 3. Logistics (freight)
  const freightCost =
    typeof logisticsCostUSD === "number" ? logisticsCostUSD : estimateFreight(transportMode, declaredValue);
  if (freightCost > 0) {
    obligations.push({
      ustn,
      obligationType: "FREIGHT",
      recipientClass: "CARRIER",
      amount: round(freightCost),
      currency,
      payer: freightPayer,
      payee: null,
      calculationMethod: "VARIABLE",
      tariffSource: "LOGISTICS_BUNDLE",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  }

  // 4. Reefer power (only if cold chain)
  if (coldChain) {
    // Default estimate: 7 days of reefer power per container
    const reeferDays = 7;
    const reeferAmount = containerCount * reeferDays * DEFAULT_REEFER_DAILY_TARIFF;
    obligations.push({
      ustn,
      obligationType: "REEFER_POWER",
      recipientClass: "PORT_TERMINAL",
      amount: round(reeferAmount),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "TIME_BASED",
      tariffSource: "REEFER_DEFAULT_TARIFF",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  }

  // 5. Mode-specific terminal / handling obligations
  //    Fix 1 — Task FIX-THC-DOCS-SURCHARGES:
  //    THC + PORT_CHARGES are gated to ocean-style modes (OCEAN / SEA / RO_RO /
  //    MULTIMODAL). Air, truck and rail get their own mode-appropriate
  //    handling fees instead of incorrectly inheriting ocean THC.
  const modeUpper = (transportMode || "").toUpperCase();
  const isOceanLikeMode =
    modeUpper === "OCEAN" ||
    modeUpper === "SEA" ||
    modeUpper === "RO_RO" ||
    modeUpper === "RORO" ||
    modeUpper === "MULTIMODAL";

  if (isOceanLikeMode) {
    obligations.push({
      ustn,
      obligationType: "THC",
      recipientClass: "PORT_TERMINAL",
      amount: round(containerCount * DEFAULT_THC_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_THC",
      costState: "ESTIMATED",
      incotermDriven: true,
    });

    obligations.push({
      ustn,
      obligationType: "PORT_CHARGES",
      recipientClass: "PORT_TERMINAL",
      amount: round(containerCount * DEFAULT_PORT_CHARGES_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_PORT_CHARGES",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  } else if (modeUpper === "AIR") {
    obligations.push({
      ustn,
      obligationType: "AIR_HANDLING_FEE",
      recipientClass: "CARRIER",
      amount: round(containerCount * DEFAULT_AIR_HANDLING_FEE_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_AIR_HANDLING_FEE",
      costState: "ESTIMATED",
      incotermDriven: true,
    });

    obligations.push({
      ustn,
      obligationType: "SECURITY_FEE",
      recipientClass: "CARRIER",
      amount: round(containerCount * DEFAULT_SECURITY_FEE_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_SECURITY_FEE",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  } else if (modeUpper === "TRUCK" || modeUpper === "ROAD") {
    obligations.push({
      ustn,
      obligationType: "TOLL_CHARGES",
      recipientClass: "CARRIER",
      amount: round(containerCount * DEFAULT_TOLL_CHARGES_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_TOLL_CHARGES",
      costState: "ESTIMATED",
      incotermDriven: true,
    });

    obligations.push({
      ustn,
      obligationType: "FUEL_SURCHARGE",
      recipientClass: "CARRIER",
      amount: round(containerCount * DEFAULT_FUEL_SURCHARGE_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_FUEL_SURCHARGE",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  } else if (modeUpper === "RAIL") {
    obligations.push({
      ustn,
      obligationType: "RAIL_HANDLING_FEE",
      recipientClass: "OTHER_SERVICE_PROVIDER",
      amount: round(containerCount * DEFAULT_RAIL_HANDLING_FEE_PER_CONTAINER),
      currency,
      payer: thcPayer,
      payee: null,
      calculationMethod: "CONTAINER_BASED",
      tariffSource: "DEFAULT_RAIL_HANDLING_FEE",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  }
  // Unknown / unrecognised transport modes receive no terminal-handling
  // obligation rather than incorrectly inheriting ocean THC. This is the
  // safe default — ocean-like fallback already happens at the freight
  // estimation layer (estimateFreight).

  // 6. Insurance (mandatory under CIF/CIP)
  if (inc.insuranceRequired) {
    obligations.push({
      ustn,
      obligationType: "INSURANCE",
      recipientClass: "OTHER_SERVICE_PROVIDER",
      amount: round(declaredValue * DEFAULT_INSURANCE_RATE),
      currency,
      payer: inc.insuranceResponsibleParty as Payer,
      payee: null,
      calculationMethod: "PERCENTAGE_BASED",
      tariffSource: "DEFAULT_INSURANCE_0.15PCT",
      costState: "ESTIMATED",
      incotermDriven: true,
    });
  }

  // Roll up
  const byRecipientClass: Record<string, number> = {};
  const byPayer = { BUYER: 0, SELLER: 0 };
  let totalCost = 0;
  for (const ob of obligations) {
    byRecipientClass[ob.recipientClass] = (byRecipientClass[ob.recipientClass] ?? 0) + ob.amount;
    if (ob.payer === "BUYER") byPayer.BUYER += ob.amount;
    else if (ob.payer === "SELLER") byPayer.SELLER += ob.amount;
    totalCost += ob.amount;
  }

  const explanation = buildExplanation(input, obligations, tariffRate);

  return {
    ustn,
    currency,
    declaredValue,
    totalCost: round(totalCost),
    obligations,
    byRecipientClass,
    byPayer,
    explanation,
  };
}

// ---------------------------------------------------------------------------
// Persistence (called by API route, not the engine itself)
// ---------------------------------------------------------------------------
export async function persistObligations(
  breakdown: TradeCostBreakdown,
): Promise<{ persisted: number; ids: string[] }> {
  const ids: string[] = [];
  let persisted = 0;
  for (const ob of breakdown.obligations) {
    try {
      const created = await db.tradeCostObligation.create({
        data: {
          ustn: ob.ustn,
          obligationType: ob.obligationType,
          recipientClass: ob.recipientClass,
          amount: ob.amount,
          currency: ob.currency,
          payer: ob.payer,
          payee: ob.payee ?? null,
          calculationMethod: ob.calculationMethod,
          tariffSource: ob.tariffSource ?? null,
          costState: ob.costState,
          incotermDriven: ob.incotermDriven,
        },
      });
      ids.push(created.id);
      persisted++;
    } catch (e: any) {
      logger.error("[trade-cost] persistObligations failed", {
        ustn: ob.ustn,
        obligationType: ob.obligationType,
        error: e?.message,
      });
    }
  }
  return { persisted, ids };
}

// ---------------------------------------------------------------------------
// Lookup helpers (defensive — never throw)
// ---------------------------------------------------------------------------
function safeGetIncoterm(incoterm: string) {
  try {
    return getIncotermResponsibility(incoterm);
  } catch {
    // Fall back to a minimal CPT-like responsibility if incoterm is unknown
    return {
      incoterm,
      sellerLogisticsTo: "destination",
      sellerFreight: false,
      sellerDestCharges: false,
      sellerDuties: false,
      mandatoryServices: [] as { service: string; payer: "BUYER" | "SELLER" }[],
      optionalServices: [] as { service: string; payer: "BUYER" | "SELLER" }[],
      insuranceRequired: false,
      insuranceResponsibleParty: "BUYER" as const,
      customsExportResponsible: "SELLER" as const,
      customsImportResponsible: "BUYER" as const,
      thcResponsible: "BUYER" as const,
    };
  }
}

async function safeGetTariff(hsCode: string, countryCode: string) {
  try {
    return await getTariffRate(hsCode, countryCode);
  } catch (e: any) {
    logger.warn("[trade-cost] GRiRE tariff lookup failed; using fallback", {
      hsCode,
      countryCode,
      error: e?.message,
    });
    return null;
  }
}

function estimateFreight(transportMode: string, declaredValue: number): number {
  // Crude fallback: 8% of declared value for ocean, 12% air, 5% road
  switch ((transportMode || "").toUpperCase()) {
    case "AIR":
      return declaredValue * 0.12;
    case "ROAD":
    case "TRUCK":
      return declaredValue * 0.05;
    case "RAIL":
      return declaredValue * 0.06;
    case "OCEAN":
    case "SEA":
    default:
      return declaredValue * 0.08;
  }
}

function buildExplanation(
  input: TradeCostInput,
  obligations: TradeCostObligation[],
  tariffRate: number,
): string {
  const total = obligations.reduce((s, o) => s + o.amount, 0);
  const buyerTotal = obligations.filter((o) => o.payer === "BUYER").reduce((s, o) => s + o.amount, 0);
  const sellerTotal = obligations.filter((o) => o.payer === "SELLER").reduce((s, o) => s + o.amount, 0);
  return (
    `Trade ${input.ustn}: declared ${input.currency} ${input.declaredValue.toFixed(2)} ` +
    `(${input.incoterm}, ${input.transportMode}). ` +
    `Duty ${tariffRate}% × declared value. ` +
    `${obligations.length} obligations totaling ${input.currency} ${total.toFixed(2)} ` +
    `(BUYER ${buyerTotal.toFixed(2)} / SELLER ${sellerTotal.toFixed(2)}). ` +
    `${input.coldChain ? "Cold-chain reefer power included. " : ""}` +
    `Source: GRiRE tariff + Incoterm 2020 responsibility matrix.`
  );
}

// Suppress unused-symbol lint for the lookup table (kept for external use)
export { RECIPIENT_BY_OBLIGATION };
