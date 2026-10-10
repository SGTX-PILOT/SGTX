// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Finance Approval Matrix (per-jurisdiction)
// ═══════════════════════════════════════════════════════════════════════════════
//
// §7 CFR Financing + §19 Settlement + §20 Jurisdiction Fabric
//
// When a Bank (FIN/BANK) or Private Financier (FIN/PRIVATE) evaluates a
// financing request, the checklist of requirements varies by the borrower's
// jurisdiction AND the trade corridor. This matrix answers:
//
//   "Given a borrower in country X financing a trade to country Y,
//    what must the financier verify before approval?"
//
// It produces a structured checklist of:
//   • KYB tier required (1-4)
//   • Sanctions / PEP / UBO checks
//   • Collateral + guarantee requirements
//   • Documentation (invoice, BL, certificate of origin, insurance)
//   • Regulatory disclosures (central bank, tax, customs)
//   • FX + capital controls
//   • Import/export licences
//   • Deferred payment guarantee rules
//
// The matrix COMPLEMENTS the existing §19 Settlement + §20 Jurisdiction Fabric.
// It does NOT replace the Financier Portal data (fin-workflow-data.ts); it adds
// the jurisdiction-aware lens that the FIN/PFI portals can query.
// ═══════════════════════════════════════════════════════════════════════════════

import { COUNTRY_BY_CODE, type CountryPaymentProfile } from "./country-payment-profiles";

// ─────────────────────────────────────────────────────────────────────────────
// TYPES
// ─────────────────────────────────────────────────────────────────────────────

export type FinanceApprovalCategory =
  | "KYB"
  | "SANCTIONS"
  | "COLLATERAL"
  | "DOCUMENTATION"
  | "REGULATORY"
  | "FX_CONTROLS"
  | "LICENCES"
  | "DEFERRED_PAYMENT";

export type RequirementSeverity = "MANDATORY" | "RECOMMENDED" | "OPTIONAL";
export type RequirementStatus = "PASS" | "FAIL" | "PENDING" | "N/A";

export interface FinanceRequirement {
  category: FinanceApprovalCategory;
  severity: RequirementSeverity;
  title: string;
  description: string;
  evidenceField: string;       // e.g. "sanctions_screening_result"
  status: RequirementStatus;
  jurisdictionNote?: string;   // country-specific nuance
}

export interface FinanceApprovalChecklist {
  borrowerCountry: string;
  destinationCountry?: string;
  kybTierRequired: number;
  maxTradeValue: string;
  requirements: FinanceRequirement[];
  financierType: "BANK" | "PFI" | "BOTH";
  approvalPath: string;        // e.g. "Auto-approve if all MANDATORY pass + Tier ≥3"
  estimatedTime: string;      // e.g. "24-48h", "3-5 business days"
  notes?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// BASE REQUIREMENTS (applied to all jurisdictions)
// ─────────────────────────────────────────────────────────────────────────────

const BASE_REQUIREMENTS: FinanceRequirement[] = [
  // KYB
  { category: "KYB", severity: "MANDATORY", title: "KYB Tier Verification", description: "Verify borrower's KYB tier meets minimum for trade value", evidenceField: "kyb_tier", status: "PENDING" },
  { category: "KYB", severity: "MANDATORY", title: "UBO Declaration", description: "Ultimate Beneficial Owner declaration (≥25% ownership)", evidenceField: "ubo_declaration", status: "PENDING" },
  { category: "KYB", severity: "MANDATORY", title: "Two Authorised Signatories", description: "Two authorised signatories on file (Tier 3+)", evidenceField: "signatories", status: "PENDING" },
  // SANCTIONS
  { category: "SANCTIONS", severity: "MANDATORY", title: "OFAC Sanctions Screening", description: "US Treasury OFAC SDN list check", evidenceField: "ofac_result", status: "PENDING" },
  { category: "SANCTIONS", severity: "MANDATORY", title: "UN Sanctions Screening", description: "UN Security Council consolidated list", evidenceField: "un_result", status: "PENDING" },
  { category: "SANCTIONS", severity: "MANDATORY", title: "EU Sanctions Screening", description: "EU consolidated financial sanctions list", evidenceField: "eu_result", status: "PENDING" },
  { category: "SANCTIONS", severity: "MANDATORY", title: "UK HM Treasury Sanctions", description: "UK HMT OFSI consolidated list", evidenceField: "hmt_result", status: "PENDING" },
  { category: "SANCTIONS", severity: "MANDATORY", title: "PEP Screening", description: "Politically Exposed Person check", evidenceField: "pep_result", status: "PENDING" },
  // COLLATERAL
  { category: "COLLATERAL", severity: "RECOMMENDED", title: "Trade Receivable Assignment", description: "Assignment of trade receivables as security", evidenceField: "receivable_assignment", status: "PENDING" },
  // DOCUMENTATION
  { category: "DOCUMENTATION", severity: "MANDATORY", title: "Commercial Invoice", description: "Valid commercial invoice (GST/VAT-compliant)", evidenceField: "commercial_invoice", status: "PENDING" },
  { category: "DOCUMENTATION", severity: "MANDATORY", title: "Bill of Lading / Transport Doc", description: "B/L, AWB or CMR consignment note", evidenceField: "bl_document", status: "PENDING" },
  { category: "DOCUMENTATION", severity: "MANDATORY", title: "Certificate of Origin", description: "Chamber-of-commerce verified origin certificate", evidenceField: "coo_document", status: "PENDING" },
  { category: "DOCUMENTATION", severity: "RECOMMENDED", title: "Cargo Insurance Certificate", description: "Marine / cargo insurance (CIC clauses)", evidenceField: "insurance_cert", status: "PENDING" },
  { category: "DOCUMENTATION", severity: "MANDATORY", title: "Packing List", description: "Detailed packing list with HS codes", evidenceField: "packing_list", status: "PENDING" },
  // REGULATORY
  { category: "REGULATORY", severity: "MANDATORY", title: "Tax Registration Verification", description: "Valid tax registration (VAT/GST/TIN) in borrower country", evidenceField: "tax_registration", status: "PENDING" },
  { category: "REGULATORY", severity: "MANDATORY", title: "Bank Account Verification", description: "Micro-deposit bank account verification", evidenceField: "bank_verified", status: "PENDING" },
];

// ─────────────────────────────────────────────────────────────────────────────
// JURISDICTION-SPECIFIC REQUIREMENT OVERRIDES
// ─────────────────────────────────────────────────────────────────────────────

interface JurisdictionOverride {
  kybTierRequired?: number;
  maxTradeValue?: string;
  addRequirements?: FinanceRequirement[];
  approvalPath?: string;
  estimatedTime?: string;
}

const JURISDICTION_OVERRIDES: Record<string, JurisdictionOverride> = {
  // ── EUROPE — high bar, but straightforward
  DE: {
    kybTierRequired: 3,
    maxTradeValue: "€10,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "MiCA Compliance (if crypto)", description: "If crypto-asset settlement: MiCA Title V compliance", evidenceField: "mica_compliance", status: "PENDING", jurisdictionNote: "BaFin enforcement strict" },
      { category: "REGULATORY", severity: "MANDATORY", title: "VAT Reverse Charge Check", description: "Verify intra-EU VAT reverse charge mechanics", evidenceField: "vat_reverse_charge", status: "PENDING" },
      { category: "DEFERRED_PAYMENT", severity: "OPTIONAL", title: "Avalista Guarantee", description: "Forfaiting aval (guarantee) accepted in DE", evidenceField: "aval_guarantee", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + all MANDATORY pass + sanctions clear",
    estimatedTime: "24-48h",
  },
  FR: {
    kybTierRequired: 3,
    maxTradeValue: "€10,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "PSAN Registration (if crypto)", description: "If crypto: AMF PSAN registration check", evidenceField: "psan_registration", status: "PENDING" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "Douane (DGDDI) Declaration", description: "French customs DGDDI declaration", evidenceField: "dgddi_declaration", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + MANDATORY pass",
    estimatedTime: "24-48h",
  },
  GB: {
    kybTierRequired: 3,
    maxTradeValue: "£10,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "FCA Crypto Registration (if crypto)", description: "If crypto: FCA MLR 2017 registration", evidenceField: "fca_crypto_reg", status: "PENDING", jurisdictionNote: "UK post-Brexit standalone regime" },
      { category: "REGULATORY", severity: "MANDATORY", title: "HMRC VAT Check", description: "UK VAT registration + post-Brexit EORI number", evidenceField: "eori_number", status: "PENDING" },
      { category: "COLLATERAL", severity: "RECOMMENDED", title: "Debenture Registration", description: "Floating charge debenture at Companies House", evidenceField: "debenture_registration", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + FCA compliant + sanctions clear",
    estimatedTime: "24-48h",
  },

  // ── NORTH AMERICA
  US: {
    kybTierRequired: 3,
    maxTradeValue: "$25,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "FinCEN MSB Check (if crypto)", description: "If crypto: FinCEN MSB registration + state MTL", evidenceField: "fincen_msb", status: "PENDING", jurisdictionNote: "State-by-state MTL is complex" },
      { category: "REGULATORY", severity: "MANDATORY", title: "SEC/CFBP Check (if tokenized)", description: "If tokenized security: SEC registration or exemption", evidenceField: "sec_registration", status: "PENDING" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "AES/ITN Filing", description: "Automated Export System filing (if export >$2,500)", evidenceField: "aes_filing", status: "PENDING" },
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "OFAC 50% Rule", description: "Aggregate ownership check for sanctioned parties", evidenceField: "ofac_50pct", status: "PENDING" },
      { category: "COLLATERAL", severity: "MANDATORY", title: "UCC-1 Filing", description: "Uniform Commercial Code filing for secured interest", evidenceField: "ucc1_filing", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + OFAC clear + UCC-1 filed + MANDATORY pass",
    estimatedTime: "1-3 business days",
  },

  // ── MENA — controlled FX
  EG: {
    kybTierRequired: 4,
    maxTradeValue: "EGP 100,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "CBE FX Approval", description: "Central Bank of Egypt foreign-exchange approval for >USD 100k", evidenceField: "cbe_fx_approval", status: "PENDING", jurisdictionNote: "Critical — CBE controls FX allocation" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "Customs Form 13", description: "Egyptian Customs Form 13 (import declaration)", evidenceField: "customs_form_13", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "Import Registration (GOEIC)", description: "General Organization for Import & Export Control registration", evidenceField: "goeic_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "Tax Authority (ETA) Registration", description: "Egyptian Tax Authority registration + VAT", evidenceField: "eta_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "Crypto Prohibition Declaration", description: "Borrower confirms no crypto settlement (CBE ban)", evidenceField: "crypto_prohibition", status: "PENDING", jurisdictionNote: "CBE bans crypto; must affirm non-use" },
      { category: "DEFERRED_PAYMENT", severity: "MANDATORY", title: "Bank Guarantee (LOC)", description: "Letter of Guarantee required for deferred payment", evidenceField: "loc_guarantee", status: "PENDING" },
    ],
    approvalPath: "Manual review — CBE FX + GOEIC + Tier 4 + collateral required",
    estimatedTime: "5-10 business days",
    notes: "Egypt has strict FX controls; all financing >USD 100k requires CBE approval",
  },
  SA: {
    kybTierRequired: 3,
    maxTradeValue: "SAR 50,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "SAMA Compliance", description: "Saudi Arabian Monetary Authority compliance check", evidenceField: "sama_compliance", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "SASO Certification", description: "Saudi Standards Organization product conformity", evidenceField: "saso_cert", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "ZATCA e-Invoicing", description: "Zakat, Tax and Customs Authority e-invoice (Phase 2)", evidenceField: "zatca_einvoice", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "Crypto Prohibition (SAMA)", description: "SAMA bans crypto; must affirm non-use", evidenceField: "crypto_prohibition", status: "PENDING" },
      { category: "DEFERRED_PAYMENT", severity: "RECOMMENDED", title: "SAMA-Compliant LC", description: "SAMA-compliant Letter of Credit for deferred", evidenceField: "sama_lc", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + SAMA + ZATCA + SASO + sanctions clear",
    estimatedTime: "2-4 business days",
  },
  AE: {
    kybTierRequired: 3,
    maxTradeValue: "AED 50,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "CB UAE Compliance", description: "Central Bank of UAE compliance for financing", evidenceField: "cbuae_compliance", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "ESMA / MoIAT Registration", description: "Emirates Authority for Standardization or MoIAT registration", evidenceField: "esma_cert", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "FTA VAT Registration", description: "Federal Tax Authority VAT registration", evidenceField: "fta_vat", status: "PENDING" },
      { category: "REGULATORY", severity: "OPTIONAL", title: "VARA Licence (if crypto)", description: "If crypto: Virtual Assets Regulatory Authority licence", evidenceField: "vara_licence", status: "PENDING", jurisdictionNote: "Only for crypto-settled trades" },
      { category: "DEFERRED_PAYMENT", severity: "RECOMMENDED", title: "UCC-like Guarantee (CB UAE)", description: "Bank guarantee per CB UAE rules", evidenceField: "cbuae_guarantee", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + CB UAE + FTA + sanctions clear; crypto requires VARA",
    estimatedTime: "2-5 business days",
  },

  // ── ASIA-PACIFIC
  SG: {
    kybTierRequired: 3,
    maxTradeValue: "S$20,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "MAS DPT Licence (if crypto)", description: "If crypto: MAS Digital Payment Token licence", evidenceField: "mas_dpt", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "ACRA BizFile", description: "Accounting and Corporate Regulatory Authority bizfile", evidenceField: "acra_bizfile", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "IRAS GST Registration", description: "Inland Revenue Authority GST registration", evidenceField: "iras_gst", status: "PENDING" },
      { category: "DEFERRED_PAYMENT", severity: "RECOMMENDED", title: "MAS-Compliant Guarantee", description: "MAS-compliant bank guarantee / standby LC", evidenceField: "mas_guarantee", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + MAS + ACRA + sanctions clear",
    estimatedTime: "1-3 business days",
  },
  IN: {
    kybTierRequired: 4,
    maxTradeValue: "₹500,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "RBI/FEMA Approval", description: "Reserve Bank of India / FEMA approval for external commercial borrowing", evidenceField: "rbi_fema", status: "PENDING", jurisdictionNote: "ECB framework — strict borrowing limits" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "A2 Form + FIRC", description: "A2 form + Foreign Inward Remittance Certificate", evidenceField: "a2_firc", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "IEC (DGFT)", description: "Import Export Code from Directorate General of Foreign Trade", evidenceField: "iec_code", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "GST Registration", description: "GST registration + GSTIN verification", evidenceField: "gst_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "PAN + TAN", description: "Permanent Account Number + Tax Deduction Account Number", evidenceField: "pan_tan", status: "PENDING" },
      { category: "DEFERRED_PAYMENT", severity: "MANDATORY", title: "RBI Trade Credit", description: "RBI trade credit registration (up to 5 years)", evidenceField: "rbi_trade_credit", status: "PENDING" },
    ],
    approvalPath: "Manual review — RBI/FEMA + ECB + IEC + Tier 4",
    estimatedTime: "7-14 business days",
    notes: "India has strict ECB framework; all external financing requires FEMA compliance",
  },
  CN: {
    kybTierRequired: 4,
    maxTradeValue: "¥100,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "SAFE Registration", description: "State Administration of Foreign Exchange registration", evidenceField: "safe_registration", status: "PENDING", jurisdictionNote: "Critical — SAFE controls all FX flows" },
      { category: "REGULATORY", severity: "MANDATORY", title: "PBoC Compliance", description: "People's Bank of China compliance", evidenceField: "pboc_compliance", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "MOFCOM Approval", description: "Ministry of Commerce approval for foreign financing", evidenceField: "mofcom_approval", status: "PENDING" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "Customs Declaration (单一窗口)", description: "Single-window customs declaration", evidenceField: "single_window", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "Crypto Prohibition (PBoC)", description: "PBoC bans crypto; must affirm non-use", evidenceField: "crypto_prohibition", status: "PENDING" },
    ],
    approvalPath: "Manual review — SAFE + PBoC + MOFCOM + Tier 4",
    estimatedTime: "10-20 business days",
    notes: "China has the strictest FX controls; all external financing requires SAFE registration",
  },

  // ── AFRICA
  NG: {
    kybTierRequired: 4,
    maxTradeValue: "NGN 5,000,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "CBN Form A/M Approval", description: "Central Bank of Nigeria Form A (services) or M (goods) approval", evidenceField: "cbn_form", status: "PENDING", jurisdictionNote: "Critical — CBN controls FX allocation" },
      { category: "LICENCES", severity: "MANDATORY", title: "CAC Registration", description: "Corporate Affairs Commission registration", evidenceField: "cac_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "FIRS TIN + VAT", description: "Federal Inland Revenue Service TIN + VAT", evidenceField: "firs_tin", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "NAFDAC Reg (if pharma/food)", description: "National Agency for Food & Drug Admin Control", evidenceField: "nafdac_reg", status: "PENDING" },
      { category: "REGULATORY", severity: "OPTIONAL", title: "SEC Nigeria (if crypto)", description: "If crypto: SEC Nigeria RRSP registration", evidenceField: "sec_nigeria", status: "PENDING" },
    ],
    approvalPath: "Manual review — CBN Form + CAC + Tier 4 + sanctions",
    estimatedTime: "7-14 business days",
    notes: "Nigeria has FX controls; CBN Form A/M is mandatory for external payments",
  },
  ZA: {
    kybTierRequired: 3,
    maxTradeValue: "R 200,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "SARB Approval (>R10M)", description: "South African Reserve Bank approval for >R10M external financing", evidenceField: "sarb_approval", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "CIPC Registration", description: "Companies and Intellectual Property Commission registration", evidenceField: "cipc_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "MANDATORY", title: "SARS VAT + Income Tax", description: "South African Revenue Service VAT + income tax", evidenceField: "sars_tax", status: "PENDING" },
      { category: "REGULATORY", severity: "OPTIONAL", title: "FSCA Crypto (if crypto)", description: "If crypto: FSCA Crypto Asset SP licence (CARA 21)", evidenceField: "fsca_crypto", status: "PENDING" },
    ],
    approvalPath: "Manual review for >R10M; auto-approve if Tier ≥3 + SARS + sanctions clear",
    estimatedTime: "3-7 business days",
  },

  // ── SOUTH AMERICA
  BR: {
    kybTierRequired: 3,
    maxTradeValue: "R$ 100,000,000",
    addRequirements: [
      { category: "FX_CONTROLS", severity: "MANDATORY", title: "BCB FX Registration", description: "Banco Central do Brasil foreign-exchange registration", evidenceField: "bcb_fx", status: "PENDING" },
      { category: "LICENCES", severity: "MANDATORY", title: "RFB (CNPJ) Registration", description: "Receita Federal CNPJ tax registration", evidenceField: "cnpj", status: "PENDING" },
      { category: "DOCUMENTATION", severity: "MANDATORY", title: "SISCOMEX Declaration", description: "SISCOMEX import/export declaration", evidenceField: "siscomex", status: "PENDING" },
      { category: "REGULATORY", severity: "OPTIONAL", title: "CVM PSD-SP (if crypto)", description: "If crypto: CVM PSD-SP registration", evidenceField: "cvm_crypto", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥3 + BCB + RFB + SISCOMEX + sanctions clear",
    estimatedTime: "2-5 business days",
  },
  SV: {
    kybTierRequired: 2,
    maxTradeValue: "$5,000,000",
    addRequirements: [
      { category: "REGULATORY", severity: "MANDATORY", title: "BCR Registration", description: "Banco Central de Reserva registration", evidenceField: "bcr_registration", status: "PENDING" },
      { category: "REGULATORY", severity: "OPTIONAL", title: "Ley Bitcoin Declaration", description: "If crypto: BTC legal tender — no licence required", evidenceField: "btc_legal_tender", status: "PENDING", jurisdictionNote: "BTC is legal tender since 2021" },
      { category: "LICENCES", severity: "MANDATORY", title: "Ministry of Finance (Hacienda)", description: "Ministry of Finance tax registration (NIT)", evidenceField: "hacienda_nit", status: "PENDING" },
    ],
    approvalPath: "Auto-approve if Tier ≥2 + BCR + sanctions clear",
    estimatedTime: "1-3 business days",
    notes: "El Salvador: most crypto-permissive (BTC legal tender)",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// BUILDER — assembles the full checklist for a borrower+destination pair
// ─────────────────────────────────────────────────────────────────────────────

export function buildFinanceApprovalChecklist(
  borrowerCountry: string,
  destinationCountry?: string,
  financierType: "BANK" | "PFI" | "BOTH" = "BOTH"
): FinanceApprovalChecklist | null {
  const borrowerProfile = COUNTRY_BY_CODE[borrowerCountry.toUpperCase()];
  const destProfile = destinationCountry ? COUNTRY_BY_CODE[destinationCountry.toUpperCase()] : undefined;

  if (!borrowerProfile) return null;

  const override = JURISDICTION_OVERRIDES[borrowerCountry.toUpperCase()] || {};

  // Start with base requirements (clone to avoid mutation)
  const requirements: FinanceRequirement[] = BASE_REQUIREMENTS.map(r => ({ ...r }));

  // Add jurisdiction-specific
  if (override.addRequirements) {
    requirements.push(...override.addRequirements);
  }

  // If destination has FX controls, add destination-specific note
  if (destProfile && destProfile.fx.capitalControls) {
    requirements.push({
      category: "FX_CONTROLS",
      severity: "MANDATORY",
      title: `Destination FX (${destProfile.name})`,
      description: `${destProfile.name} has capital controls; verify destination-jurisdiction FX approval`,
      evidenceField: "destination_fx_approval",
      status: "PENDING",
      jurisdictionNote: destProfile.fx.documentaryRequirements.join(", "),
    });
  }

  // If destination bans crypto, add crypto-ban affirmation
  if (destProfile && destProfile.crypto.status === "BANNED") {
    requirements.push({
      category: "REGULATORY",
      severity: "MANDATORY",
      title: `Destination Crypto Ban (${destProfile.name})`,
      description: `${destProfile.name} bans crypto; borrower must affirm non-use in destination settlement`,
      evidenceField: "destination_crypto_ban",
      status: "PENDING",
    });
  }

  return {
    borrowerCountry: borrowerCountry.toUpperCase(),
    destinationCountry: destinationCountry?.toUpperCase(),
    kybTierRequired: override.kybTierRequired || 3,
    maxTradeValue: override.maxTradeValue || "$5,000,000",
    requirements,
    financierType,
    approvalPath: override.approvalPath || "Auto-approve if Tier ≥3 + all MANDATORY pass + sanctions clear",
    estimatedTime: override.estimatedTime || "2-5 business days",
    notes: override.notes,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY — for quick stats
// ─────────────────────────────────────────────────────────────────────────────

export function getFinanceApprovalSummary() {
  const countries = Object.keys(JURISDICTION_OVERRIDES);
  const tier4 = countries.filter(c => JURISDICTION_OVERRIDES[c].kybTierRequired === 4).length;
  const tier3 = countries.filter(c => JURISDICTION_OVERRIDES[c].kybTierRequired === 3).length;
  const tier2 = countries.filter(c => JURISDICTION_OVERRIDES[c].kybTierRequired === 2).length;

  return {
    totalJurisdictionsWithOverrides: countries.length,
    tier4Required: tier4,
    tier3Required: tier3,
    tier2Required: tier2,
    autoApproveEligible: countries.filter(c =>
      (JURISDICTION_OVERRIDES[c].approvalPath || "").toLowerCase().includes("auto-approve")
    ).length,
    manualReviewRequired: countries.filter(c =>
      (JURISDICTION_OVERRIDES[c].approvalPath || "").toLowerCase().includes("manual")
    ).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// CATEGORY METADATA (for UI)
// ─────────────────────────────────────────────────────────────────────────────
export const CATEGORY_META: Record<FinanceApprovalCategory, { label: string; color: string }> = {
  KYB:              { label: "KYB & Identity",     color: "#60a5fa" },
  SANCTIONS:        { label: "Sanctions & AML",     color: "#f87171" },
  COLLATERAL:       { label: "Collateral",         color: "#a78bfa" },
  DOCUMENTATION:    { label: "Documentation",      color: "#22d3ee" },
  REGULATORY:       { label: "Regulatory",         color: "#34d399" },
  FX_CONTROLS:      { label: "FX Controls",        color: "#fbbf24" },
  LICENCES:         { label: "Licences",           color: "#fb923c" },
  DEFERRED_PAYMENT: { label: "Deferred Payment",   color: "#e879f9" },
};

export const SEVERITY_META: Record<RequirementSeverity, { label: string; color: string }> = {
  MANDATORY:  { label: "Mandatory", color: "#f87171" },
  RECOMMENDED: { label: "Recommended", color: "#fbbf24" },
  OPTIONAL:   { label: "Optional", color: "#94a3b8" },
};
