// SGTX EU ICS2 ENS (Entry Summary Declaration) — Compliance Logic Module
// EU ICS2 mandatory since January 2025 for all goods entering EU by air/sea/road/rail.
// This module implements the data model, validation, and mock filing.
// Real EU ICS2 API integration is deferred — pluggable provider interface ready.

export interface EnsFiling {
  mrn: string; // Movement Reference Number (mock: ENS-{year}-{random10})
  ustn: string;
  hsCode: string;
  goodsDescription: string;
  consignorName: string;
  consignorCountry: string;
  consigneeName: string;
  consigneeCountry: string;
  transportMode: "AIR" | "SEA" | "ROAD" | "RAIL";
  loadingPort: string;
  dischargePort: string;
  grossWeightKg: number;
  numberOfItems: number;
  containerNumbers?: string[];
  status: "DRAFT" | "FILED" | "ACCEPTED" | "REJECTED";
  filedAt?: string;
  filingProvider: string; // "ICS2_MOCK" (real: "ICS2_EU")
}

export interface EnsResult {
  applicable: boolean;
  filing: EnsFiling | null;
  conditions: { condition_id: string; label: string; status: "met" | "unmet" }[];
  message: string;
}

// EU 27 Member States (ISO 3166-1 alpha-2)
export const EU_COUNTRIES = [
  "DE", "FR", "IT", "ES", "NL", "BE", "AT", "PL", "SE", "FI", "DK", "IE", "PT", "GR",
  "CZ", "RO", "BG", "HR", "SK", "LT", "SI", "LV", "EE", "LU", "MT", "CY", "HU",
];

export function isEuCountry(country: string): boolean {
  return EU_COUNTRIES.includes(country.toUpperCase());
}

interface EnsInput {
  ustn: string;
  destCountry: string;
  transportMode: string;
  hsCode: string;
  goodsDescription: string;
  consignorName: string;
  consignorCountry: string;
  consigneeName: string;
  consigneeCountry: string;
  loadingPort: string;
  dischargePort: string;
  grossWeightKg: number;
  numberOfItems: number;
  containerNumbers?: string[];
}

export function assessIcs2Ens(input: EnsInput): EnsResult {
  const dest = (input.destCountry || "").toUpperCase();
  const transport = (input.transportMode || "").toUpperCase();
  const applicable = isEuCountry(dest) && ["AIR", "SEA", "ROAD", "RAIL"].includes(transport);

  if (!applicable) {
    return {
      applicable: false,
      filing: null,
      conditions: [],
      message: `ICS2 ENS not applicable (dest=${dest}, transport=${transport}). ENS required for EU-bound AIR/SEA/ROAD/RAIL shipments.`,
    };
  }

  const conditions: { condition_id: string; label: string; status: "met" | "unmet" }[] = [];

  if (!input.hsCode) conditions.push({ condition_id: "ens_hs_code", label: "HS code required for ENS filing", status: "unmet" });
  if (!input.goodsDescription) conditions.push({ condition_id: "ens_goods_desc", label: "Goods description required for ENS filing", status: "unmet" });
  if (!input.consignorName) conditions.push({ condition_id: "ens_consignor", label: "Consignor name required for ENS filing", status: "unmet" });
  if (!input.consigneeName) conditions.push({ condition_id: "ens_consignee", label: "Consignee name required for ENS filing", status: "unmet" });
  if (input.grossWeightKg <= 0) conditions.push({ condition_id: "ens_weight", label: "Gross weight must be > 0 for ENS filing", status: "unmet" });
  if (input.numberOfItems <= 0) conditions.push({ condition_id: "ens_items", label: "Number of items must be > 0 for ENS filing", status: "unmet" });

  const filing = conditions.length === 0 ? generateEnsFiling(input) : null;

  return {
    applicable: true,
    filing,
    conditions,
    message: filing
      ? `ENS filing generated. MRN: ${filing.mrn}. Must be filed 24h before loading (SEA) or at departure (AIR).`
      : `ENS required but filing blocked by ${conditions.length} missing field(s).`,
  };
}

export function generateEnsFiling(input: EnsInput): EnsFiling {
  const year = new Date().getFullYear();
  const random = Math.random().toString().slice(2, 12).padEnd(10, "0");
  return {
    mrn: `ENS${year}${random}`,
    ustn: input.ustn,
    hsCode: input.hsCode,
    goodsDescription: input.goodsDescription,
    consignorName: input.consignorName,
    consignorCountry: input.consignorCountry,
    consigneeName: input.consigneeName,
    consigneeCountry: input.consigneeCountry,
    transportMode: (input.transportMode as "AIR" | "SEA" | "ROAD" | "RAIL") || "SEA",
    loadingPort: input.loadingPort,
    dischargePort: input.dischargePort,
    grossWeightKg: input.grossWeightKg,
    numberOfItems: input.numberOfItems,
    containerNumbers: input.containerNumbers,
    status: "FILED",
    filedAt: new Date().toISOString(),
    filingProvider: "ICS2_MOCK",
  };
}
