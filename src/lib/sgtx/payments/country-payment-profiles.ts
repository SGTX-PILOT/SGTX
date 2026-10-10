// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Country Payment Profiles Registry
// ═══════════════════════════════════════════════════════════════════════════════
//
// §19 Settlement Architecture + §20 Jurisdiction Fabric — extended.
//
// Maps each jurisdiction to:
//   • ALLOWED payment rails (SEPA, ACH, FedNow, PIX, UPI, FPS, SWIFT, etc.)
//   • Open-banking framework + provider + status (PSD2, CFPB 1033, SGFinDex…)
//   • Crypto legal status (LEGAL / RESTRICTED / BANNED) + which assets
//   • FX + capital controls
//
// This is the SINGLE SOURCE OF TRUTH that the Payment Engine + Finance
// Approval Matrix + the cinematic Payments Section all read from.
//
// COMPLEMENTS (does NOT replace) the existing §1 Payment Engine (12 methods)
// and the §20.6 Jurisdiction Fabric (16 jurisdiction types). It adds the
// country-specific lens on top.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Banknote, Building2, Bitcoin, Globe2, Zap, ShieldCheck, ShieldOff,
  ShieldAlert, Wallet, Landmark, Coins, ArrowLeftRight,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// TYPE DEFINITIONS
// ─────────────────────────────────────────────────────────────────────────────

export type CryptoStatus = "LEGAL" | "RESTRICTED" | "BANNED" | "LEGAL_TENDER";
export type OpenBankingStatus = "MANDATED" | "OPTIONAL" | "EMERGING" | "NONE";
export type PaymentSpeed = "INSTANT" | "SAME_DAY" | "T_PLUS_1" | "T_PLUS_2" | "MULTI_DAY";

export interface PaymentRail {
  code: string;            // e.g. "SEPA", "ACH", "FEDNOW"
  name: string;            // e.g. "SEPA Credit Transfer"
  type: "DOMESTIC" | "CROSS_BORDER" | "INSTANT" | "CARD" | "WALLET" | "CRYPTO";
  speed: PaymentSpeed;
  currency: string;        // e.g. "EUR", "USD", "EGP"
  maxAmount?: string;      // e.g. "€100,000" or "unlimited"
  settlementSystem: string; // e.g. "TARGET2", "Fedwire", "NIBSS"
  notes?: string;
}

export interface OpenBankingProfile {
  status: OpenBankingStatus;
  framework: string;        // e.g. "PSD2", "CFPB Rule 1033", "SAMA OBF"
  providers: string[];     // e.g. ["Plaid", "Tink", "TrueLayer", "Yapily"]
  regulator: string;        // e.g. "ECB", "CFPB", "FCA", "CBE"
  liveSince?: string;       // e.g. "2018" or "2024-Q1"
  scope: "ACCOUNT_INFO" | "PAYMENTS" | "BOTH";
  notes?: string;
}

export interface CryptoProfile {
  status: CryptoStatus;
  legalAssets: string[];    // e.g. ["BTC", "ETH", "USDC", "USDT"]
  regulator: string;        // e.g. "FinCEN", "MAS", "FINMA", "CBE"
  licenseRequired: string;  // e.g. "MSB + state MTL", "MAS DPT", "VARA"
  vatTreatment?: string;    // e.g. "VAT-exempt exchange", "GST on services"
  amlKyc: string;           // e.g. "Travel Rule (FATF)", "enhanced due diligence"
  onRampAllowed: boolean;
  offRampAllowed: boolean;
  notes?: string;
}

export interface FXControls {
  convertibility: "FREE" | "PARTIALLY_CONVERTIBLE" | "CONTROLLED";
  repatriation: "FREE" | "PERMITTED_WITH_DOCS" | "RESTRICTED";
  capitalControls: boolean;
  documentaryRequirements: string[]; // e.g. ["Commercial invoice", "Customs declaration"]
}

export interface CountryPaymentProfile {
  code: string;               // ISO 3166-1 alpha-2
  name: string;
  flag: string;               // emoji
  currency: string;           // ISO 4217
  region: string;             // e.g. "Europe", "MENA", "Asia-Pacific"
  paymentRails: PaymentRail[];
  openBanking: OpenBankingProfile;
  crypto: CryptoProfile;
  fx: FXControls;
  swiftConnected: boolean;
  iso20022Ready: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// PAYMENT RAILS — reusable definitions
// ─────────────────────────────────────────────────────────────────────────────

const SEPA_CT: PaymentRail = { code: "SEPA", name: "SEPA Credit Transfer", type: "DOMESTIC", speed: "T_PLUS_1", currency: "EUR", settlementSystem: "STEP2/EBA", maxAmount: "€999,999,999.99", notes: "Single Euro Payments Area — 36 countries" };
const SEPA_INST: PaymentRail = { code: "SCT_INST", name: "SEPA Instant Credit Transfer", type: "INSTANT", speed: "INSTANT", currency: "EUR", settlementSystem: "TIPS / RT1", maxAmount: "€100,000", notes: "10s settlement, 24/7/365" };
const TARGET2: PaymentRail = { code: "TARGET2", name: "TARGET2 RTGS", type: "DOMESTIC", speed: "SAME_DAY", currency: "EUR", settlementSystem: "TARGET2 (ECB)", maxAmount: "unlimited", notes: "EU central-bank RTGS" };
const SWIFT: PaymentRail = { code: "SWIFT", name: "SWIFT MT/CBP", type: "CROSS_BORDER", speed: "T_PLUS_1", currency: "MULTI", settlementSystem: "SWIFT gpi", maxAmount: "unlimited", notes: "ISO 20022 CBPR+ since Nov-2025" };

const ACH: PaymentRail = { code: "ACH", name: "ACH Credit/Debit", type: "DOMESTIC", speed: "T_PLUS_1", currency: "USD", settlementSystem: "FedACH / EPN", maxAmount: "$1,000,000/file", notes: "Same-day ACH available" };
const FEDNOW: PaymentRail = { code: "FEDNOW", name: "FedNow Service", type: "INSTANT", speed: "INSTANT", currency: "USD", settlementSystem: "FedNow (Federal Reserve)", maxAmount: "$500,000", notes: "24/7/365 instant, launched Jul-2023" };
const FEDWIRE: PaymentRail = { code: "FEDWIRE", name: "Fedwire Funds", type: "DOMESTIC", speed: "INSTANT", currency: "USD", settlementSystem: "Fedwire (Federal Reserve)", maxAmount: "unlimited", notes: "Real-time gross settlement" };
const RTP: PaymentRail = { code: "RTP", name: "RTP Network", type: "INSTANT", speed: "INSTANT", currency: "USD", settlementSystem: "The Clearing House", maxAmount: "$1,000,000", notes: "24/7/365 instant" };

const FPS: PaymentRail = { code: "FPS", name: "Faster Payments", type: "INSTANT", speed: "INSTANT", currency: "GBP", settlementSystem: "FPS (Pay.UK)", maxAmount: "£250,000", notes: "24/7 since 2008" };
const CHAPS: PaymentRail = { code: "CHAPS", name: "CHAPS RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "GBP", settlementSystem: "CHAPS (BoE)", maxAmount: "unlimited", notes: "Same-day gross settlement" };
const BACS: PaymentRail = { code: "BACS", name: "Bacs Credit", type: "DOMESTIC", speed: "T_PLUS_2", currency: "GBP", settlementSystem: "Bacs (Pay.UK)", maxAmount: "£20,000,000" };

const SIC: PaymentRail = { code: "SIC", name: "Swiss Interbank Clearing", type: "DOMESTIC", speed: "INSTANT", currency: "CHF", settlementSystem: "SIC (SNB)", maxAmount: "unlimited" };
const FAST_SG: PaymentRail = { code: "FAST", name: "FAST Singapore", type: "INSTANT", speed: "INSTANT", currency: "SGD", settlementSystem: "MAS FAST", maxAmount: "S$1,000,000" };
const PAYNOW: PaymentRail = { code: "PAYNOW", name: "PayNow", type: "WALLET", speed: "INSTANT", currency: "SGD", settlementSystem: "PayNow (MAS)", maxAmount: "S$200,000" };
const UPI: PaymentRail = { code: "UPI", name: "Unified Payments Interface", type: "INSTANT", speed: "INSTANT", currency: "INR", settlementSystem: "NPCI UPI", maxAmount: "₹500,000", notes: "World's largest instant rail, 24/7" };
const NEFT: PaymentRail = { code: "NEFT", name: "NEFT", type: "DOMESTIC", speed: "T_PLUS_1", currency: "INR", settlementSystem: "RBI NEFT", maxAmount: "unlimited" };
const RTGS_IN: PaymentRail = { code: "RTGS_IN", name: "RTGS India", type: "DOMESTIC", speed: "INSTANT", currency: "INR", settlementSystem: "RBI RTGS", maxAmount: "₹200,000+" };
const PIX: PaymentRail = { code: "PIX", name: "PIX", type: "INSTANT", speed: "INSTANT", currency: "BRL", settlementSystem: "Drex / BCB", maxAmount: "R$200,000", notes: "24/7 instant, 150M+ users" };
const TED: PaymentRail = { code: "TED", name: "TED", type: "DOMESTIC", speed: "SAME_DAY", currency: "BRL", settlementSystem: "BCB TED", maxAmount: "unlimited" };
const NPP: PaymentRail = { code: "NPP", name: "New Payments Platform", type: "INSTANT", speed: "INSTANT", currency: "AUD", settlementSystem: "NPP Australia", maxAmount: "A$1,000,000", notes: "PayID + Osko 24/7" };
const FXT_JP: PaymentRail = { code: "FXT", name: "Furikomi", type: "DOMESTIC", speed: "T_PLUS_1", currency: "JPY", settlementSystem: "Zengin", maxAmount: "unlimited" };
const BOJ_NET: PaymentRail = { code: "BOJ_NET", name: "BOJ-NET RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "JPY", settlementSystem: "BOJ-NET", maxAmount: "unlimited" };
const INSTAPAY_EG: PaymentRail = { code: "INSTAPAY", name: "InstaPay", type: "INSTANT", speed: "INSTANT", currency: "EGP", settlementSystem: "EBC InstaPay", maxAmount: "EGP 200,000", notes: "24/7 instant, launched 2022" };
const EGP_ACH: PaymentRail = { code: "EGP_ACH", name: "EGP ACH", type: "DOMESTIC", speed: "T_PLUS_1", currency: "EGP", settlementSystem: "EBC ACH", maxAmount: "EGP 5,000,000" };
const SARIE: PaymentRail = { code: "SARIE", name: "SARIE", type: "DOMESTIC", speed: "SAME_DAY", currency: "SAR", settlementSystem: "SAMA SARIE", maxAmount: "unlimited" };
const STC_PAY: PaymentRail = { code: "STC_PAY", name: "STC Pay", type: "WALLET", speed: "INSTANT", currency: "SAR", settlementSystem: "STC Pay", maxAmount: "SAR 20,000" };
const MADA: PaymentRail = { code: "MADA", name: "mada", type: "CARD", speed: "INSTANT", currency: "SAR", settlementSystem: "mada (NPS)" };
const AANI: PaymentRail = { code: "AANI", name: "Aani Instant", type: "INSTANT", speed: "INSTANT", currency: "AED", settlementSystem: "Al Etihad Payments", maxAmount: "AED 250,000", notes: "Launched 2023" };
const UAEFTS: PaymentRail = { code: "UAEFTS", name: "UAEFTS", type: "DOMESTIC", speed: "T_PLUS_1", currency: "AED", settlementSystem: "CB UAEFTS", maxAmount: "unlimited" };
const NIBSS: PaymentRail = { code: "NIBSS", name: "NIBSS NIP", type: "INSTANT", speed: "INSTANT", currency: "NGN", settlementSystem: "NIBSS NIP", maxAmount: "NGN 5,000,000" };
const CNAPS: PaymentRail = { code: "CNAPS", name: "CNAPS", type: "DOMESTIC", speed: "T_PLUS_1", currency: "CNY", settlementSystem: "PBoC CNAPS", maxAmount: "unlimited" };
const CIPS: PaymentRail = { code: "CIPS", name: "CIPS Cross-Border", type: "CROSS_BORDER", speed: "T_PLUS_1", currency: "CNY", settlementSystem: "CIPS", maxAmount: "unlimited" };
const IMPS: PaymentRail = { code: "IMPS", name: "IMPS", type: "INSTANT", speed: "INSTANT", currency: "INR", settlementSystem: "NPCI IMPS", maxAmount: "₹500,000" };

// ─────────────────────────────────────────────────────────────────────────────
// CRYPTO ASSET SETS (per regulatory clarity tier)
// ─────────────────────────────────────────────────────────────────────────────
const MAJOR_CRYPTO = ["BTC", "ETH", "USDC", "USDT"];
const STABLECOINS = ["USDC", "USDT", "USDS"];
const BTC_ONLY = ["BTC"];

// ─────────────────────────────────────────────────────────────────────────────
// THE REGISTRY — 32 JURISDICTIONS
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRY_PAYMENT_PROFILES: CountryPaymentProfile[] = [
  // ── EUROPE ──────────────────────────────────────────────────────────────
  {
    code: "DE", name: "Germany", flag: "🇩🇪", currency: "EUR", region: "Europe",
    paymentRails: [SEPA_CT, SEPA_INST, TARGET2, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2 / FintechZulassungsverordnung", providers: ["Tink", "Nordigen", "TrueLayer"], regulator: "BaFin", liveSince: "2018", scope: "BOTH", notes: "Strongest PSD2 enforcement in EU" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "BaFin", licenseRequired: "Kryptoverwahrprovider (KWG §64y)", amlKyc: "Travel Rule (BaFin AT)", onRampAllowed: true, offRampAllowed: true, notes: "MiCA-fully harmonized since Dec-2024" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "FR", name: "France", flag: "🇫🇷", currency: "EUR", region: "Europe",
    paymentRails: [SEPA_CT, SEPA_INST, TARGET2, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2 / DSP2", providers: ["Tink", "Nordigen", "Matera"], regulator: "ACPR", liveSince: "2018", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "AMF", licenseRequired: "PSAN (Pacte Law)", amlKyc: "Travel Rule (TRF)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "IT", name: "Italy", flag: "🇮🇹", currency: "EUR", region: "Europe",
    paymentRails: [SEPA_CT, SEPA_INST, TARGET2, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2", providers: ["Tink", "Nordigen"], regulator: "Banca d'Italia / Consob", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "Consob", licenseRequired: "VASP registration (OAM)", amlKyc: "Travel Rule", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "NL", name: "Netherlands", flag: "🇳🇱", currency: "EUR", region: "Europe",
    paymentRails: [SEPA_CT, SEPA_INST, TARGET2, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2", providers: ["Tink", "Nordigen", "Bunq API"], regulator: "DNB / AFM", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "DNB", licenseRequired: "Crypto service provider registration", amlKyc: "Travel Rule", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "GB", name: "United Kingdom", flag: "🇬🇧", currency: "GBP", region: "Europe",
    paymentRails: [FPS, CHAPS, BACS, SWIFT],
    openBanking: { status: "MANDATED", framework: "Open Banking Standard (PSD2+)", providers: ["TrueLayer", "Yapily", "Plaid UK", "GoCardless"], regulator: "FCA + OBIE", liveSince: "2018", scope: "BOTH", notes: "Most mature open-banking ecosystem globally" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FCA", licenseRequired: "FCA Crypto-asset registration (MLR 2017)", amlKyc: "Travel Rule (MLR 2017)", onRampAllowed: true, offRampAllowed: true, notes: "Staking regulated as activity, not security" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "CH", name: "Switzerland", flag: "🇨🇭", currency: "CHF", region: "Europe",
    paymentRails: [SIC, SWIFT],
    openBanking: { status: "OPTIONAL", framework: "Swiss FinSA + CFTO-Open-Banking voluntary", providers: ["Tink", "Nordigen (voluntary)"], regulator: "FINMA", liveSince: "2022", scope: "ACCOUNT_INFO", notes: "Not mandated; banks opt in" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FINMA", licenseRequired: "FINMA fintech licence / SRO membership", amlKyc: "Travel Rule (AMLA)", onRampAllowed: true, offRampAllowed: true, notes: "Crypto Valley Zug — most crypto-friendly in Europe" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },

  // ── NORTH AMERICA ───────────────────────────────────────────────────────
  {
    code: "US", name: "United States", flag: "🇺🇸", currency: "USD", region: "North America",
    paymentRails: [ACH, FEDNOW, FEDWIRE, RTP, SWIFT],
    openBanking: { status: "EMERGING", framework: "CFPB Rule 1033 (phase-in 2024-2026)", providers: ["Plaid", "MX", "Finicity (Mastercard)", "Yodlee"], regulator: "CFPB", liveSince: "2024-Q4", scope: "BOTH", notes: "Rule 1033 finalized Oct-2024; personal financial data rights phased 2025-2026" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FinCEN + SEC + CFTC", licenseRequired: "MSB (FinCEN) + state MTL + SEC broker-dealer if securities", amlKyc: "Travel Rule (FinCEN 31 CFR 1010)", onRampAllowed: true, offRampAllowed: true, notes: "SEC treats most tokens as securities; spot BTC/ETH ETFs approved 2024" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "CA", name: "Canada", flag: "🇨🇦", currency: "CAD", region: "North America",
    paymentRails: [{ code: "ACSS", name: "ACSS/EFT", type: "DOMESTIC", speed: "T_PLUS_1", currency: "CAD", settlementSystem: "Payments Canada" }, { code: "Lynx", name: "Lynx RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "CAD", settlementSystem: "Payments Canada Lynx" }, SWIFT],
    openBanking: { status: "EMERGING", framework: "Consumer-Driven Banking Framework", providers: ["Flinks", "Plaid CA"], regulator: "Finance Canada", liveSince: "2025", scope: "BOTH", notes: "Bill C-21 framework; phased rollout 2025-2026" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FINTRAC + CIRO", licenseRequired: "MSB (FINTRAC) + provincial securities", amlKyc: "Travel Rule (PCMLTFA)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "MX", name: "Mexico", flag: "🇲🇽", currency: "MXN", region: "North America",
    paymentRails: [{ code: "SPEI", name: "SPEI", type: "INSTANT", speed: "INSTANT", currency: "MXN", settlementSystem: "Banxico SPEI", maxAmount: "unlimited" }, SWIFT],
    openBanking: { status: "OPTIONAL", framework: "Banxico Open Banking standard (Ley Fintech)", providers: ["Belvo", "Plaid MX"], regulator: "CNBV / Banxico", liveSince: "2018", scope: "BOTH" },
    crypto: { status: "RESTRICTED", legalAssets: MAJOR_CRYPTO, regulator: "CNBV / SHCP", licenseRequired: "IFIE registration (Ley Fintech)", amlKyc: "Travel Rule", onRampAllowed: true, offRampAllowed: true, notes: "Not legal tender; exchanges must register" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: ["Commercial invoice"] },
    swiftConnected: true, iso20022Ready: true,
  },

  // ── MENA ─────────────────────────────────────────────────────────────────
  {
    code: "EG", name: "Egypt", flag: "🇪🇬", currency: "EGP", region: "MENA",
    paymentRails: [INSTAPAY_EG, EGP_ACH, SWIFT],
    openBanking: { status: "EMERGING", framework: "CBE Open Banking Framework", providers: ["EBC Open Banking APIs"], regulator: "CBE", liveSince: "2023-Q3", scope: "ACCOUNT_INFO", notes: "Phase 1 (read-only) live; payments phase 2025" },
    crypto: { status: "BANNED", legalAssets: [], regulator: "CBE / EFSA", licenseRequired: "None — prohibited", amlKyc: "N/A", onRampAllowed: false, offRampAllowed: false, notes: "CBE bans crypto issuance/trading; Hacking Law 151/2020 criminalizes" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Commercial invoice", "Customs Form 13", "Bank transfer request", "Tax registration"] },
    swiftConnected: true, iso20022Ready: false,
  },
  {
    code: "SA", name: "Saudi Arabia", flag: "🇸🇦", currency: "SAR", region: "MENA",
    paymentRails: [SARIE, STC_PAY, MADA, SWIFT],
    openBanking: { status: "MANDATED", framework: "SAMA Open Banking Framework", providers: ["Tarabut", "Lean", "Tink SA"], regulator: "SAMA", liveSince: "2023-Q1", scope: "BOTH", notes: "First MENA country with mandated open banking; phase 2 (payments) live 2024" },
    crypto: { status: "BANNED", legalAssets: [], regulator: "SAMA / CMA", licenseRequired: "None — prohibited", amlKyc: "N/A", onRampAllowed: false, offRampAllowed: false, notes: "SAMA circular 2018 bans crypto as payment; trading prohibited" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "AE", name: "United Arab Emirates", flag: "🇦🇪", currency: "AED", region: "MENA",
    paymentRails: [AANI, UAEFTS, SWIFT],
    openBanking: { status: "EMERGING", framework: "ADGM + DIFC Open Banking", providers: ["Tarabut UAE", "Lean"], regulator: "CB UAE / VARA", liveSince: "2024", scope: "BOTH", notes: "Mainland CB-UAE framework phased 2024-2025" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "VARA / ADGM / SCA", licenseRequired: "VARA category licence (VA, VASP, FM, ME)", amlKyc: "Travel Rule (Cabinet Decision 74/2020)", onRampAllowed: true, offRampAllowed: true, notes: "VARA (Dubai) world's first independent crypto regulator; ADGM most crypto-friendly" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "TR", name: "Türkiye", flag: "🇹🇷", currency: "TRY", region: "MENA",
    paymentRails: [{ code: "FAST_TR", name: "FAST", type: "INSTANT", speed: "INSTANT", currency: "TRY", settlementSystem: "BKM FAST", maxAmount: "TRY 50,000" }, { code: "EFT", name: "EFT", type: "DOMESTIC", speed: "SAME_DAY", currency: "TRY", settlementSystem: "TCMB EFT", maxAmount: "unlimited" }, SWIFT],
    openBanking: { status: "OPTIONAL", framework: "BDDK Open Banking", providers: ["Param, Matriks"], regulator: "BDDK", liveSince: "2021", scope: "BOTH" },
    crypto: { status: "RESTRICTED", legalAssets: MAJOR_CRYPTO, regulator: "MASAK / SPK", licenseRequired: "No licencing; AML/CTF compliance only", amlKyc: "MASAK reporting", onRampAllowed: true, offRampAllowed: true, notes: "Not legal tender; trading allowed but not as payment" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "RESTRICTED", capitalControls: true, documentaryRequirements: ["Commercial invoice", "Customs declaration"] },
    swiftConnected: true, iso20022Ready: false,
  },

  // ── ASIA-PACIFIC ─────────────────────────────────────────────────────────
  {
    code: "SG", name: "Singapore", flag: "🇸🇬", currency: "SGD", region: "Asia-Pacific",
    paymentRails: [FAST_SG, PAYNOW, SWIFT],
    openBanking: { status: "MANDATED", framework: "SGFinDex + API Exchange (MAS)", providers: ["SGFinDex (MAS)", "MyInfo", "Plaid SG"], regulator: "MAS", liveSince: "2020", scope: "BOTH", notes: "SGFinDex = world-first national open-finance data exchange" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "MAS", licenseRequired: "MAS DPT licence (PSA)", amlKyc: "Travel Rule (MAS PSN02)", onRampAllowed: true, offRampAllowed: true, notes: "Most crypto-friendly in APAC; DPT licence required for custodial" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "HK", name: "Hong Kong SAR", flag: "🇭🇰", currency: "HKD", region: "Asia-Pacific",
    paymentRails: [{ code: "FPS_HK", name: "FPS", type: "INSTANT", speed: "INSTANT", currency: "HKD/CNY", settlementSystem: "HKMA FPS", maxAmount: "HKD 10,000" }, { code: "CHATS", name: "CHATS RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "HKD", settlementSystem: "HKMA CHATS", maxAmount: "unlimited" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "HKMA Open API Framework", providers: ["HSBC, StanChart, DBS HK"], regulator: "HKMA", liveSince: "2018", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "SFC", licenseRequired: "SFC VATP licence (new regime 2023)", amlKyc: "Travel Rule (AMLO)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "JP", name: "Japan", flag: "🇯🇵", currency: "JPY", region: "Asia-Pacific",
    paymentRails: [FXT_JP, BOJ_NET, SWIFT],
    openBanking: { status: "MANDATED", framework: "Bank Act (Pay Act) Open API", providers: ["Paid, FinCode"], regulator: "FSA", liveSince: "2020", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FSA", licenseRequired: "Crypto-asset exchange registration (PSRPA)", amlKyc: "Travel Rule (PPSTA 2023)", onRampAllowed: true, offRampAllowed: true, notes: "Recognized as property, not legal tender; stablecoins legal since 2023" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "AU", name: "Australia", flag: "🇦🇺", currency: "AUD", region: "Asia-Pacific",
    paymentRails: [NPP, { code: "BPAY", name: "BPAY", type: "DOMESTIC", speed: "T_PLUS_1", currency: "AUD", settlementSystem: "BPAY" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "Consumer Data Right (CDR)", providers: ["Adatree, Frollo, Basiq"], regulator: "ACCC + Treasury", liveSince: "2020", scope: "BOTH", notes: "CDR is sector-agnostic; banking first sector rolled out" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "AUSTRAC + ASIC", licenseRequired: "AUSTRAC DCE registration", amlKyc: "Travel Rule (AML/CTF Act)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "IN", name: "India", flag: "🇮🇳", currency: "INR", region: "Asia-Pacific",
    paymentRails: [UPI, NEFT, RTGS_IN, IMPS, SWIFT],
    openBanking: { status: "MANDATED", framework: "Account Aggregator (AA) Framework", providers: ["OneMoney, FinSync, Sahamati"], regulator: "RBI (ReBIT)", liveSince: "2021", scope: "ACCOUNT_INFO", notes: "AA framework = consent-driven data sharing; 1.5B+ AA accounts" },
    crypto: { status: "RESTRICTED", legalAssets: [], regulator: "RBI / Ministry of Finance", licenseRequired: "None — trading not formally banned but 1% TDS applies", amlKyc: "PMLA reporting", onRampAllowed: true, offRampAllowed: true, notes: "Not legal tender; 30% tax + 1% TDS; RBI CBDC (e-Rupee) pilot active" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["A2 form", "FIRC", "Commercial invoice", "Bill of Entry"] },
    swiftConnected: true, iso20022Ready: false,
  },
  {
    code: "CN", name: "China", flag: "🇨🇳", currency: "CNY", region: "Asia-Pacific",
    paymentRails: [CNAPS, CIPS, SWIFT],
    openBanking: { status: "NONE", framework: "Bank-dominated (no consumer open banking)", providers: [], regulator: "PBoC / NFRA", liveSince: "N/A", scope: "ACCOUNT_INFO", notes: "No mandated consumer data right" },
    crypto: { status: "BANNED", legalAssets: [], regulator: "PBoC / CSRC", licenseRequired: "None — prohibited", amlKyc: "N/A", onRampAllowed: false, offRampAllowed: false, notes: "PBoC banned crypto exchanges + mining Sep-2021; e-CNY CBDC active" },
    fx: { convertibility: "CONTROLLED", repatriation: "RESTRICTED", capitalControls: true, documentaryRequirements: ["Commercial invoice", "Customs declaration", "SAFE registration", "Tax certificate"] },
    swiftConnected: true, iso20022Ready: true,
  },

  // ── AFRICA ───────────────────────────────────────────────────────────────
  {
    code: "NG", name: "Nigeria", flag: "🇳🇬", currency: "NGN", region: "Africa",
    paymentRails: [NIBSS, { code: "NAPS", name: "NAPS", type: "DOMESTIC", speed: "T_PLUS_1", currency: "NGN", settlementSystem: "NIBSS NAPS" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "CBN Open Banking Framework", providers: ["Okra, Onebrick, Pngme"], regulator: "CBN", liveSince: "2024", scope: "BOTH", notes: "First African country with mandated open banking; 2024 CBN guidelines" },
    crypto: { status: "RESTRICTED", legalAssets: MAJOR_CRYPTO, regulator: "SEC Nigeria / CBN", licenseRequired: "SEC Nigeria RRSP registration", amlKyc: "AML reporting (NDLEA)", onRampAllowed: true, offRampAllowed: true, notes: "CBN reversed banking ban Dec-2023; SEC Nigeria regulates digital assets" },
    fx: { convertibility: "CONTROLLED", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Form A/M", "Commercial invoice", "Customs Form N", "CAC registration"] },
    swiftConnected: true, iso20022Ready: false,
  },
  {
    code: "ZA", name: "South Africa", flag: "🇿🇦", currency: "ZAR", region: "Africa",
    paymentRails: [{ code: "SAMOS", name: "SAMOS RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "ZAR", settlementSystem: "SARB SAMOS", maxAmount: "unlimited" }, { code: "EFT_ZA", name: "EFT", type: "DOMESTIC", speed: "T_PLUS_2", currency: "ZAR", settlementSystem: "BankservAfrica" }, SWIFT],
    openBanking: { status: "OPTIONAL", framework: "SARB Prudential + voluntary", providers: ["BankservAfrica, Yoco, Stitch"], regulator: "SARB + FSCA", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FSCA", licenseRequired: "FSCA Crypto Asset SP licence (Cara 21)", amlKyc: "FIC Act", onRampAllowed: true, offRampAllowed: true, notes: "Crypto Asset Declaration Statement; CARA 21 phased 2024-2025" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["SARB approval >R10M", "Commercial invoice", "Customs SAD"] },
    swiftConnected: true, iso20022Ready: false,
  },
  {
    code: "KE", name: "Kenya", flag: "🇰🇪", currency: "KES", region: "Africa",
    paymentRails: [{ code: "PESALINK", name: "PesaLink", type: "INSTANT", speed: "INSTANT", currency: "KES", settlementSystem: "KBA PesaLink", maxAmount: "KES 999,999" }, { code: "EFT_KE", name: "RTGS KE", type: "DOMESTIC", speed: "SAME_DAY", currency: "KES", settlementSystem: "CBK KEPSS" }, SWIFT],
    openBanking: { status: "EMERGING", framework: "CBK Open Finance guidelines (2024)", providers: ["Hmm, BRQ"], regulator: "CBK", liveSince: "2024", scope: "ACCOUNT_INFO" },
    crypto: { status: "RESTRICTED", legalAssets: [], regulator: "CBK / CMA", licenseRequired: "CMA licence (proposed)", amlKyc: "Proceeds of Crime Act", onRampAllowed: true, offRampAllowed: true, notes: "Not legal tender; CBK exploring Digital Monetary Authority 2025" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Commercial invoice", "CBK approval >USD 10k"] },
    swiftConnected: true, iso20022Ready: false,
  },

  // ── SOUTH AMERICA ───────────────────────────────────────────────────────
  {
    code: "BR", name: "Brazil", flag: "🇧🇷", currency: "BRL", region: "South America",
    paymentRails: [PIX, TED, SWIFT],
    openBanking: { status: "MANDATED", framework: "Open Finance Brazil", providers: ["Belvo, Plugg, Linker"], regulator: "BCB", liveSince: "2022-Q2", scope: "BOTH", notes: "4-phase rollout complete; PIX + Open Finance convergence" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "CVM", licenseRequired: "CVM PSD-SP registration", amlKyc: "COAF reporting", onRampAllowed: true, offRampAllowed: true, notes: "Most crypto-active in LATAM; real estate + tax accepted in crypto" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Commercial invoice", "SISCOMEX declaration"] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "SV", name: "El Salvador", flag: "🇸🇻", currency: "USD", region: "South America",
    paymentRails: [ACH, SWIFT],
    openBanking: { status: "NONE", framework: "No formal framework", providers: [], regulator: "Banco Central de Reserva", liveSince: "N/A", scope: "ACCOUNT_INFO" },
    crypto: { status: "LEGAL_TENDER", legalAssets: BTC_ONLY, regulator: "BCR + Ministry of Finance", licenseRequired: "None — BTC is legal tender (Ley Bitcoin)", amlKyc: "CCD", onRampAllowed: true, offRampAllowed: true, notes: "First country to adopt BTC as legal tender (Sep-2021); government holds 5,700+ BTC" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: false,
  },

  // ── GCC ADDITIONAL ──────────────────────────────────────────────────────
  {
    code: "BH", name: "Bahrain", flag: "🇧🇭", currency: "BHD", region: "MENA",
    paymentRails: [{ code: "BENEFIT", name: "BENEFIT", type: "INSTANT", speed: "INSTANT", currency: "BHD", settlementSystem: "BENEFIT Pay", maxAmount: "BHD 5,000" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "CBB Open Banking Rulebook", providers: ["Tarabut BH", "BENEFIT Pay APIs"], regulator: "CBB", liveSince: "2018", scope: "BOTH", notes: "First GCC country to mandate open banking (2018)" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "CBB", licenseRequired: "CBB Category 4 / Category 2 licence", amlKyc: "CDD/EDD per CBB", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "QA", name: "Qatar", flag: "🇶🇦", currency: "QAR", region: "MENA",
    paymentRails: [{ code: "QPAY", name: "Q-Pay", type: "INSTANT", speed: "INSTANT", currency: "QAR", settlementSystem: "QCB Q-Pay" }, { code: "RTGS_QA", name: "RTGS QA", type: "DOMESTIC", speed: "INSTANT", currency: "QAR", settlementSystem: "QCB RTGS" }, SWIFT],
    openBanking: { status: "EMERGING", framework: "QCB Open Banking guidelines", providers: ["Tarabut QA"], regulator: "QCB", liveSince: "2024", scope: "ACCOUNT_INFO" },
    crypto: { status: "RESTRICTED", legalAssets: [], regulator: "QCB / QFCRA", licenseRequired: "QFCRA DLT sandbox", amlKyc: "AML Law 20/2019", onRampAllowed: true, offRampAllowed: true, notes: "QFC sandbox; mainland ban on crypto as payment" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: false,
  },
  {
    code: "KW", name: "Kuwait", flag: "🇰🇼", currency: "KWD", region: "MENA",
    paymentRails: [{ code: "KNET", name: "KNET", type: "CARD", speed: "INSTANT", currency: "KWD", settlementSystem: "KNET" }, { code: "RTGS_KW", name: "RTGS KW", type: "DOMESTIC", speed: "INSTANT", currency: "KWD", settlementSystem: "CBK" }, SWIFT],
    openBanking: { status: "OPTIONAL", framework: "CBK Open Banking framework", providers: ["Tarabut KW"], regulator: "CBK", liveSince: "2024", scope: "ACCOUNT_INFO" },
    crypto: { status: "RESTRICTED", legalAssets: [], regulator: "CBK / CMA", licenseRequired: "None — trading not prohibited but regulated", amlKyc: "AML 106/2013", onRampAllowed: true, offRampAllowed: true, notes: "Not legal tender; CBK warning issued 2014, 2018" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: false,
  },

  // ── SCANDINAVIA ─────────────────────────────────────────────────────────
  {
    code: "SE", name: "Sweden", flag: "🇸🇪", currency: "SEK", region: "Europe",
    paymentRails: [{ code: "RIX", name: "RIX-RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "SEK", settlementSystem: "Riksbank RIX" }, SEPA_CT, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2", providers: ["Tink", "Nordigen"], regulator: "Finansinspektionen", liveSince: "2018", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "Finansinspektionen", licenseRequired: "FI financial institution registration", amlKyc: "Travel Rule", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "NO", name: "Norway", flag: "🇳🇴", currency: "NOK", region: "Europe",
    paymentRails: [{ code: "NICS", name: "NICS RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "NOK", settlementSystem: "Norges Bank NICS" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2 (EEA) + Norwegian Financial Agreement Act", providers: ["Tink", "Nordigen"], regulator: "Finanstilsynet", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "Finanstilsynet", licenseRequired: "VASP registration", amlKyc: "Travel Rule (AML Act)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },

  // ── ADDITIONAL KEY JURISDICTIONS ─────────────────────────────────────────
  {
    code: "ES", name: "Spain", flag: "🇪🇸", currency: "EUR", region: "Europe",
    paymentRails: [SEPA_CT, SEPA_INST, TARGET2, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2 / Ley 19/2009", providers: ["Tink, Nordigen, Belvo"], regulator: "Banco de España / CNMV", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "CNMV / Banco de España", licenseRequired: "Banco de España VASP registration", amlKyc: "Travel Rule", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "PL", name: "Poland", flag: "🇵🇱", currency: "PLN", region: "Europe",
    paymentRails: [SEPA_CT, { code: "ELIXIR", name: "Elixir RTGS", type: "DOMESTIC", speed: "SAME_DAY", currency: "PLN", settlementSystem: "NBP Elixir" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "PSD2 / Polish Payment Services Act", providers: ["Tink, Nordigen"], regulator: "KNF", liveSince: "2018", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "KNF", licenseRequired: "VASP virtual currency activity registration", amlKyc: "Travel Rule (AML Act)", onRampAllowed: true, offRampAllowed: true },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "AE2", name: "Abu Dhabi (ADGM)", flag: "🇦🇪", currency: "USD", region: "MENA",
    paymentRails: [AANI, UAEFTS, SWIFT],
    openBanking: { status: "MANDATED", framework: "ADGM Open Finance framework", providers: ["Tarabut, Lean"], regulator: "FSRA (ADGM)", liveSince: "2022", scope: "BOTH", notes: "ADGM has its own regulator (FSRA); crypto via RegLab" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FSRA (ADGM)", licenseRequired: "FSRA FSP licence + RegLab approval", amlKyc: "FATF Travel Rule", onRampAllowed: true, offRampAllowed: true, notes: "ADGM Recognised Virtual Asset Activities; most crypto-friendly GCC" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "SG2", name: "DIFC Dubai", flag: "🇦🇪", currency: "USD", region: "MENA",
    paymentRails: [AANI, SWIFT],
    openBanking: { status: "MANDATED", framework: "DIFC Open Finance framework", providers: ["Tarabut DIFC"], regulator: "DFSA", liveSince: "2022", scope: "BOTH" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "DFSA", licenseRequired: "DFSA Crypto Token licence", amlKyc: "Travel Rule (DIFC AML)", onRampAllowed: true, offRampAllowed: true, notes: "DIFC is a separate financial freezone with DFSA crypto regime" },
    fx: { convertibility: "FREE", repatriation: "FREE", capitalControls: false, documentaryRequirements: [] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "TH", name: "Thailand", flag: "🇹🇭", currency: "THB", region: "Asia-Pacific",
    paymentRails: [{ code: "PROMPTPAY", name: "PromptPay", type: "INSTANT", speed: "INSTANT", currency: "THB", settlementSystem: "BOT PromptPay" }, { code: "BAHTNET", name: "Bahtnet RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "THB", settlementSystem: "BOT BAHTNET" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "BOT Open Banking API", providers: ["SCB, Kasikornbank APIs"], regulator: "BOT", liveSince: "2019", scope: "BOTH" },
    crypto: { status: "RESTRICTED", legalAssets: MAJOR_CRYPTO, regulator: "SEC Thailand", licenseRequired: "SEC Thailand Digital Asset Exchange licence", amlKyc: "AMLO reporting", onRampAllowed: true, offRampAllowed: true, notes: "SEC Thailand regulates crypto; BOT developing CBDC (CBDC Project)" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Commercial invoice", "BOT approval >USD 50k"] },
    swiftConnected: true, iso20022Ready: true,
  },
  {
    code: "KR", name: "South Korea", flag: "🇰🇷", currency: "KRW", region: "Asia-Pacific",
    paymentRails: [{ code: "CODI", name: "CODI", type: "INSTANT", speed: "INSTANT", currency: "KRW", settlementSystem: "BOK CODI" }, { code: "BOK_WIN", name: "BOK Wire RTGS", type: "DOMESTIC", speed: "INSTANT", currency: "KRW", settlementSystem: "Bank of Korea BOK-Wire" }, SWIFT],
    openBanking: { status: "MANDATED", framework: "Electronic Financial Transactions Act + MyData", providers: ["KFTC, MyData"], regulator: "FSC + FSS", liveSince: "2020", scope: "BOTH", notes: "MyData = consumer data rights (2022 rollout)" },
    crypto: { status: "LEGAL", legalAssets: MAJOR_CRYPTO, regulator: "FSC + FSS + KFTC", licenseRequired: "Virtual Asset Service Provider registration", amlKyc: "Travel Rule (Spec-FI Act 2023)", onRampAllowed: true, offRampAllowed: true, notes: "Travel Rule enforced since 2023; strictest in APAC" },
    fx: { convertibility: "PARTIALLY_CONVERTIBLE", repatriation: "PERMITTED_WITH_DOCS", capitalControls: true, documentaryRequirements: ["Commercial invoice", "BOK approval >USD 50k"] },
    swiftConnected: true, iso20022Ready: true,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// HELPER LOOKUPS
// ─────────────────────────────────────────────────────────────────────────────

export const COUNTRY_BY_CODE: Record<string, CountryPaymentProfile> =
  Object.fromEntries(COUNTRY_PAYMENT_PROFILES.map(p => [p.code, p]));

export function getCountryProfile(code: string): CountryPaymentProfile | undefined {
  return COUNTRY_BY_CODE[code.toUpperCase()];
}

export function getCountriesByRegion(): Record<string, CountryPaymentProfile[]> {
  const groups: Record<string, CountryPaymentProfile[]> = {};
  for (const c of COUNTRY_PAYMENT_PROFILES) {
    (groups[c.region] ||= []).push(c);
  }
  return groups;
}

export function getCryptoLegalCountries(): CountryPaymentProfile[] {
  return COUNTRY_PAYMENT_PROFILES.filter(c =>
    c.crypto.status === "LEGAL" || c.crypto.status === "LEGAL_TENDER"
  );
}

export function getOpenBankingMandatedCountries(): CountryPaymentProfile[] {
  return COUNTRY_PAYMENT_PROFILES.filter(c => c.openBanking.status === "MANDATED");
}

export function getInstantPaymentCountries(): CountryPaymentProfile[] {
  return COUNTRY_PAYMENT_PROFILES.filter(c =>
    c.paymentRails.some(r => r.type === "INSTANT")
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// SUMMARY METRICS (for the cinematic section)
// ─────────────────────────────────────────────────────────────────────────────

export const PAYMENT_SUMMARY = {
  totalCountries: COUNTRY_PAYMENT_PROFILES.length,
  cryptoLegal: getCryptoLegalCountries().length,
  cryptoBanned: COUNTRY_PAYMENT_PROFILES.filter(c => c.crypto.status === "BANNED").length,
  openBankingMandated: getOpenBankingMandatedCountries().length,
  openBankingEmerging: COUNTRY_PAYMENT_PROFILES.filter(c => c.openBanking.status === "EMERGING").length,
  instantRails: getInstantPaymentCountries().length,
  iso20022Ready: COUNTRY_PAYMENT_PROFILES.filter(c => c.iso20022Ready).length,
  swiftConnected: COUNTRY_PAYMENT_PROFILES.filter(c => c.swiftConnected).length,
  freeConvertibility: COUNTRY_PAYMENT_PROFILES.filter(c => c.fx.convertibility === "FREE").length,
  capitalControls: COUNTRY_PAYMENT_PROFILES.filter(c => c.fx.capitalControls).length,
};

// ─────────────────────────────────────────────────────────────────────────────
// ICON MAP for crypto status
// ─────────────────────────────────────────────────────────────────────────────
export const CRYPTO_STATUS_META: Record<CryptoStatus, { label: string; color: string; icon: LucideIcon }> = {
  LEGAL:        { label: "Legal",        color: "#34d399", icon: ShieldCheck },
  LEGAL_TENDER: { label: "Legal Tender", color: "#22d3ee", icon: Bitcoin },
  RESTRICTED:   { label: "Restricted",   color: "#fbbf24", icon: ShieldAlert },
  BANNED:       { label: "Banned",        color: "#f87171", icon: ShieldOff },
};

export const OPEN_BANKING_STATUS_META: Record<OpenBankingStatus, { label: string; color: string }> = {
  MANDATED: { label: "Mandated", color: "#34d399" },
  OPTIONAL: { label: "Optional", color: "#60a5fa" },
  EMERGING: { label: "Emerging", color: "#fbbf24" },
  NONE:     { label: "None",     color: "#94a3b8" },
};
