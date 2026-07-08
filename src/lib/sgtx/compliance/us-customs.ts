// SGTX US Customs Compliance — ACE / ISF 10+2 / FDA Prior Notice / BIS Export Control
// Logic module with mock filings. Real CBP/FDA/BIS API integration deferred.

export interface IsfFiling {
  isfNumber: string;
  ustn: string;
  sellerName: string;
  buyerName: string;
  containerNumbers: string[];
  vesselName?: string;
  voyageNumber?: string;
  loadingPort: string;
  dischargePort: string;
  harmonizedCode: string;
  countryOfOrigin: string;
  status: "DRAFT" | "FILED" | "ACCEPTED" | "REJECTED";
  filedAt?: string;
}

export interface FdaPriorNotice {
  confirmationNumber: string;
  ustn: string;
  foodCategory: string;
  manufacturerName: string;
  manufacturerCountry: string;
  importerName: string;
  quantity: number;
  unit: string;
  status: "PENDING" | "CONFIRMED" | "REJECTED";
}

export interface AceFiling {
  entryNumber: string;
  ustn: string;
  importerOfRecord: string;
  entryType: "CONSUMPTION" | "INFORMAL";
  harmonizedCode: string;
  valueUsd: number;
  dutyUsd: number;
  status: "PENDING" | "LIQUIDATED" | "REJECTED";
}

export interface UsComplianceResult {
  isfRequired: boolean;
  isfFiling?: IsfFiling;
  fdaPriorNoticeRequired: boolean;
  fdaNotice?: FdaPriorNotice;
  aceRequired: boolean;
  aceFiling?: AceFiling;
  bisExportControlRequired: boolean;
  bisStatus?: "APPROVED" | "DENIED" | "LICENSE_REQUIRED";
  conditions: { condition_id: string; label: string; status: "met" | "unmet" }[];
  overallVerdict: "PASS" | "CONDITIONAL" | "DENY";
}

// Dual-use HS codes requiring BIS export control review
const DUAL_USE_HS_CHAPTERS = ["9013", "8471", "8525", "9300", "2844", "3822", "8802", "8803"];

// Food HS chapters (01-23) for FDA Prior Notice
function isFoodHsCode(hsCode: string): boolean {
  const chapter = parseInt((hsCode || "").substring(0, 2), 10);
  return chapter >= 1 && chapter <= 23;
}

function isDualUse(hsCode: string): boolean {
  const heading = (hsCode || "").substring(0, 4);
  return DUAL_USE_HS_CHAPTERS.includes(heading);
}

function mockNum(prefix: string): string {
  return `${prefix}${Math.random().toString().slice(2, 12).padEnd(10, "0")}`;
}

interface UsInput {
  ustn: string;
  destCountry: string;
  hsCode: string;
  commodity: string;
  sellerName: string;
  buyerName: string;
  loadingPort: string;
  dischargePort: string;
  containerNumbers?: string[];
  grossWeightKg: number;
  transportMode?: string;
}

export function assessUsCompliance(input: UsInput): UsComplianceResult {
  const dest = (input.destCountry || "").toUpperCase();
  const transport = (input.transportMode || "SEA").toUpperCase();
  const isUs = dest === "US";

  const conditions: { condition_id: string; label: string; status: "met" | "unmet" }[] = [];
  let verdict: "PASS" | "CONDITIONAL" | "DENY" = "PASS";

  if (!isUs) {
    return {
      isfRequired: false, fdaPriorNoticeRequired: false, aceRequired: false,
      bisExportControlRequired: false, conditions: [], overallVerdict: "PASS",
    };
  }

  // ISF 10+2 — required for SEA shipments to US, 24h before vessel loading
  const isfRequired = transport === "SEA";
  let isfFiling: IsfFiling | undefined;
  if (isfRequired) {
    if (input.containerNumbers && input.containerNumbers.length === 0) {
      conditions.push({ condition_id: "isf_containers", label: "ISF requires container numbers (24h before loading)", status: "unmet" });
      verdict = "CONDITIONAL";
    } else {
      isfFiling = {
        isfNumber: mockNum("ISF"),
        ustn: input.ustn, sellerName: input.sellerName, buyerName: input.buyerName,
        containerNumbers: input.containerNumbers || [], loadingPort: input.loadingPort,
        dischargePort: input.dischargePort, harmonizedCode: input.hsCode,
        countryOfOrigin: input.sellerName, status: "FILED", filedAt: new Date().toISOString(),
      };
    }
  }

  // FDA Prior Notice — required for food
  const fdaRequired = isFoodHsCode(input.hsCode);
  let fdaNotice: FdaPriorNotice | undefined;
  if (fdaRequired) {
    fdaNotice = {
      confirmationNumber: mockNum("FDA"),
      ustn: input.ustn, foodCategory: input.commodity || "Food product",
      manufacturerName: input.sellerName, manufacturerCountry: "—",
      importerName: input.buyerName, quantity: input.grossWeightKg, unit: "kg",
      status: "CONFIRMED",
    };
  }

  // ACE — always required for US imports
  const aceRequired = true;
  const aceFiling: AceFiling = {
    entryNumber: mockNum("CBP"),
    ustn: input.ustn, importerOfRecord: input.buyerName,
    entryType: input.grossWeightKg > 2500 ? "CONSUMPTION" : "INFORMAL",
    harmonizedCode: input.hsCode, valueUsd: 0, dutyUsd: 0, status: "PENDING",
  };

  // BIS Export Control — dual-use goods
  const bisRequired = isDualUse(input.hsCode);
  let bisStatus: "APPROVED" | "DENIED" | "LICENSE_REQUIRED" | undefined;
  if (bisRequired) {
    bisStatus = "LICENSE_REQUIRED";
    conditions.push({ condition_id: "bis_license", label: `BIS export license required for dual-use HS ${input.hsCode.substring(0, 4)}`, status: "unmet" });
    verdict = "DENY";
  }

  if (conditions.length > 0 && verdict !== "DENY") verdict = "CONDITIONAL";

  return {
    isfRequired, isfFiling,
    fdaPriorNoticeRequired: fdaRequired, fdaNotice,
    aceRequired, aceFiling,
    bisExportControlRequired: bisRequired, bisStatus,
    conditions, overallVerdict: verdict,
  };
}
