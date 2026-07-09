// SGTX Country-Specific Foreign Exchange Controls for Settlement Phase
// Determines FX repatriation/surrender requirements for a trade lane.

export interface FxControl {
  country: string;
  rule: "REPATRIATION_REQUIRED" | "SURRENDER_REQUIRED" | "CAPITAL_CONTROLS" | "FREE";
  description: string;
  repatriationPeriodDays?: number;
  surrenderRequirementPct?: number;
  documentationRequired: string[];
  authority: string;
}

export interface FxControlResult {
  ustn: string;
  originCountry: string;
  destCountry: string;
  settlementCurrency: string;
  controls: FxControl[];
  blockingIssues: string[];
  documentationRequired: string[];
}

interface FxInput {
  ustn: string;
  originCountry: string;
  destCountry: string;
  settlementCurrency: string;
  contractValueUsd: number;
}

export function assessFxControls(input: FxInput): FxControlResult {
  const origin = (input.originCountry || "").toUpperCase();
  const dest = (input.destCountry || "").toUpperCase();
  const controls: FxControl[] = [];
  const documentationRequired: string[] = [];
  const blockingIssues: string[] = [];

  // Origin country FX controls (export proceeds repatriation)
  const originControl = getOriginFxControl(origin);
  if (originControl) {
    controls.push(originControl);
    documentationRequired.push(...originControl.documentationRequired);
    if (originControl.rule === "REPATRIATION_REQUIRED") {
      blockingIssues.push(`${origin}: Export proceeds must be repatriated within ${originControl.repatriationPeriodDays} days (${originControl.authority})`);
    }
  }

  // Destination country FX controls (import payment)
  const destControl = getDestFxControl(dest);
  if (destControl) {
    controls.push(destControl);
    documentationRequired.push(...destControl.documentationRequired);
  }

  // Settlement currency restrictions
  if (origin === "EG" && !["USD", "EUR", "GBP", "AED", "SAR", "EGP"].includes(input.settlementCurrency)) {
    blockingIssues.push(`Egypt: Settlement currency ${input.settlementCurrency} not on CBE approved list`);
  }

  return {
    ustn: input.ustn,
    originCountry: origin,
    destCountry: dest,
    settlementCurrency: input.settlementCurrency,
    controls,
    blockingIssues,
    documentationRequired: [...new Set(documentationRequired)],
  };
}

function getOriginFxControl(country: string): FxControl | null {
  const controls: Record<string, FxControl> = {
    EG: {
      country: "EG", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated to Egypt within 180 days (CBE Law 194/2020). No mandatory surrender after 2022 float.",
      repatriationPeriodDays: 180, surrenderRequirementPct: 0,
      documentationRequired: ["CBE Form 4", "Commercial Invoice", "Bill of Lading", "Bank Realization Certificate"],
      authority: "Central Bank of Egypt (CBE)",
    },
    CN: {
      country: "CN", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated to China within 90 days. SAFE verification required.",
      repatriationPeriodDays: 90, surrenderRequirementPct: 0,
      documentationRequired: ["SAFE Verification", "Customs Declaration", "Commercial Invoice"],
      authority: "State Administration of Foreign Exchange (SAFE)",
    },
    IN: {
      country: "IN", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated within 9 months. e-BRC mandatory.",
      repatriationPeriodDays: 270, surrenderRequirementPct: 0,
      documentationRequired: ["e-BRC (Bank Realization Certificate)", "Shipping Bill", "Commercial Invoice"],
      authority: "Reserve Bank of India (RBI)",
    },
    BR: {
      country: "BR", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated within 360 days. Siscomex registration required.",
      repatriationPeriodDays: 360, surrenderRequirementPct: 0,
      documentationRequired: ["Siscomex Registration", "Commercial Invoice", "Bill of Lading"],
      authority: "Banco Central do Brasil (BACEN)",
    },
    KE: {
      country: "KE", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated within 90 days.",
      repatriationPeriodDays: 90, surrenderRequirementPct: 0,
      documentationRequired: ["CBK Export Receipt", "Commercial Invoice"],
      authority: "Central Bank of Kenya (CBK)",
    },
    GH: {
      country: "GH", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated within 120 days.",
      repatriationPeriodDays: 120, surrenderRequirementPct: 0,
      documentationRequired: ["BOG Exchange Form", "Commercial Invoice"],
      authority: "Bank of Ghana (BOG)",
    },
    MA: {
      country: "MA", rule: "REPATRIATION_REQUIRED",
      description: "Export proceeds must be repatriated within 120 days. Office des Changes approval.",
      repatriationPeriodDays: 120, surrenderRequirementPct: 0,
      documentationRequired: ["Office des Changes Declaration", "Customs Declaration"],
      authority: "Office des Changes",
    },
  };
  return controls[country] || null;
}

function getDestFxControl(country: string): FxControl | null {
  // Destination countries usually don't require repatriation (they're paying, not receiving)
  // But some have capital controls on outward payments
  const controls: Record<string, FxControl> = {
    CN: {
      country: "CN", rule: "CAPITAL_CONTROLS",
      description: "Import payments > $50,000 require SAFE verification. Capital controls on outward FX.",
      documentationRequired: ["SAFE Verification", "Customs Declaration", "Contract"],
      authority: "SAFE",
    },
    IN: {
      country: "IN", rule: "CAPITAL_CONTROLS",
      description: "Import payments require A2 form + customs documentation. LRS applies for certain transactions.",
      documentationRequired: ["A2 Form", "Bill of Entry", "Customs Declaration"],
      authority: "RBI",
    },
    EG: {
      country: "EG", rule: "CAPITAL_CONTROLS",
      description: "Import payments require CBE documentation + Form 4. Letters of Credit mandatory for imports > $100,000 (as of 2022).",
      documentationRequired: ["CBE Form 4", "Letter of Credit", "Customs Declaration"],
      authority: "CBE",
    },
  };
  return controls[country] || null;
}
