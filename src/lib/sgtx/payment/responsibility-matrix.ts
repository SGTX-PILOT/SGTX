// SGTX Part 6.11 — Licensed PSP Responsibility Matrix
// Explicitly separates SGTX's non-custodial role from the licensed PSP's regulated
// activities. Required for CBE compliance and legal clarity.
//
// Legal Disclaimer (Part 6.11.5):
//   "SGTX is not a bank or payment service provider. All funds are held and transferred
//    by licensed PSPs (e.g., Fawry, PayMob, CBE IPN). SGTX only provides instructions
//    and reconciliation data. Your relationship with the PSP is separate and governed
//    by their terms."
//
// Display location: during payment setup, in the PSP selection dropdown, and in the
// footer of every payment confirmation.

export interface ProhibitedActivity {
  activity: string;
  prohibited: boolean;
  legalBasis: string;
}

export interface PspResponsibility {
  activity: string;
  pspExamples: string[];
}

export interface ResponsibilityMatrixEntry {
  operation: string;
  sgtx: "✅" | "❌" | "—";
  psp: "✅" | "❌" | "—";
  cbe: "✅" | "❌" | "—";
  note?: string;
}

export interface ResponsibilityMatrixPayload {
  disclaimer: string;
  shortDisclaimer: string;
  displayLocations: string[];
  sgtxShallNot: ProhibitedActivity[];
  pspShall: PspResponsibility[];
  matrix: ResponsibilityMatrixEntry[];
  licensedEgyptPSPs: string[];
  legalReferences: { law: string; scope: string }[];
}

// ============ 6.11.5: Legal Disclaimer ============
export const LEGAL_DISCLAIMER =
  "SGTX is not a bank or payment service provider. All funds are held and transferred " +
  "by licensed PSPs (e.g., Fawry, PayMob, CBE IPN). SGTX only provides instructions and " +
  "reconciliation data. Your relationship with the PSP is separate and governed by their terms.";

export const SHORT_DISCLAIMER =
  "Non-custodial: SGTX never holds funds. All payments executed by licensed PSPs (CBE-regulated).";

// ============ 6.11.2: SGTX SHALL NOT (Non-Custodial Principle) ============
export const SGTX_SHALL_NOT: ProhibitedActivity[] = [
  { activity: "Hold customer funds", prohibited: true, legalBasis: "CBE regulations, Law 194/2020" },
  { activity: "Issue e-money", prohibited: true, legalBasis: "Central Bank Law" },
  { activity: "Accept deposits", prohibited: true, legalBasis: "Banking Law" },
  { activity: "Perform banking activities", prohibited: true, legalBasis: "Law 88/2003" },
  { activity: "Operate an escrow account", prohibited: true, legalBasis: "SGTX only instructs PSPs" },
  { activity: "Provide payment initiation services", prohibited: true, legalBasis: "PSD2 / CBE rules" },
  { activity: "Execute settlement without PSP/bank", prohibited: true, legalBasis: "Non-custodial principle" },
];

// ============ 6.11.3: Licensed PSP SHALL (Regulated Activities) ============
export const PSP_SHALL: PspResponsibility[] = [
  { activity: "Hold funds (customer and merchant)", pspExamples: ["Fawry", "PayMob", "CBE IPN"] },
  { activity: "Transfer funds between accounts", pspExamples: ["Fawry", "PayMob", "CBE IPN"] },
  { activity: "Issue receipts and confirmations", pspExamples: ["All PSPs"] },
  { activity: "Conduct AML/KYC on payers", pspExamples: ["All PSPs"] },
  { activity: "Report suspicious transactions to CBE", pspExamples: ["All PSPs"] },
  { activity: "Execute payment instructions from SGTX", pspExamples: ["All PSPs (via API)"] },
  { activity: "Provide settlement files (MT940, ISO 20022)", pspExamples: ["All PSPs (optional)"] },
];

// ============ 6.11.4: Responsibility Matrix ============
export const RESPONSIBILITY_MATRIX: ResponsibilityMatrixEntry[] = [
  { operation: "Fee calculation",                sgtx: "✅", psp: "❌", cbe: "❌", note: "SGTX calculates" },
  { operation: "Split instruction generation",   sgtx: "✅", psp: "❌", cbe: "❌", note: "SGTX creates JSON" },
  { operation: "Authentication of payer",        sgtx: "❌", psp: "✅", cbe: "❌", note: "PSP does 3DS/OTP; SGTX passes JWT" },
  { operation: "Fund holding",                   sgtx: "❌", psp: "✅", cbe: "❌" },
  { operation: "Fund transfer execution",        sgtx: "❌", psp: "✅", cbe: "❌", note: "SGTX instructs only" },
  { operation: "AML screening",                  sgtx: "❌", psp: "✅", cbe: "✅", note: "SGTX does initial KYB only; PSP transaction-level; CBE oversight" },
  { operation: "Reporting to CBE",               sgtx: "❌", psp: "✅", cbe: "✅", note: "PSP reports as PSP; CBE oversight" },
  { operation: "Dispute resolution (payment)",   sgtx: "❌", psp: "✅", cbe: "❌", note: "SGTX refers to PSP" },
];

export const LICENSED_EGYPT_PSPS = ["Fawry", "PayMob", "CBE IPN"];

export const LEGAL_REFERENCES = [
  { law: "CBE Law 194/2020",     scope: "Non-custodial principle; PSP licensing" },
  { law: "Banking Law 88/2003",  scope: "Prohibits SGTX from performing banking activities" },
  { law: "Central Bank Law",     scope: "Prohibits SGTX from issuing e-money" },
  { law: "PSD2 / CBE rules",     scope: "Payment initiation services restricted to licensed PSPs" },
];

// ============ 6.11: Full payload for the disclaimer endpoint ============
export function getResponsibilityMatrix(): ResponsibilityMatrixPayload {
  return {
    disclaimer: LEGAL_DISCLAIMER,
    shortDisclaimer: SHORT_DISCLAIMER,
    displayLocations: [
      "During payment setup (Stage 1 / Stage 2 confirmation screens)",
      "In the PSP selection dropdown (below the PSP list)",
      "In the footer of every payment confirmation receipt",
      "In the Terms of Service and CBE compliance filing",
    ],
    sgtxShallNot: SGTX_SHALL_NOT,
    pspShall: PSP_SHALL,
    matrix: RESPONSIBILITY_MATRIX,
    licensedEgyptPSPs: LICENSED_EGYPT_PSPS,
    legalReferences: LEGAL_REFERENCES,
  };
}

// ============ 6.11.2 Enforcement: Check that an action doesn't violate non-custodial principle ============
// Returns false if the action would cause SGTX to hold funds (Governor should block).
export function isNonCustodialViolation(action: string): { violation: boolean; reason?: string } {
  const violationKeywords = [
    { kw: "hold funds",       law: SGTX_SHALL_NOT[0].legalBasis },
    { kw: "hold customer",    law: SGTX_SHALL_NOT[0].legalBasis },
    { kw: "escrow",           law: SGTX_SHALL_NOT[4].legalBasis },
    { kw: "deposit",          law: SGTX_SHALL_NOT[2].legalBasis },
    { kw: "e-money",          law: SGTX_SHALL_NOT[1].legalBasis },
    { kw: "banking activity", law: SGTX_SHALL_NOT[3].legalBasis },
  ];
  const lower = action.toLowerCase();
  for (const v of violationKeywords) {
    if (lower.includes(v.kw)) {
      return { violation: true, reason: `Action "${action}" would violate non-custodial principle (${v.law}).` };
    }
  }
  return { violation: false };
}
