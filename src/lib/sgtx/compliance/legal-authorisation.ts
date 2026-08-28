// @ts-nocheck
/**
 * G-17 — Legal Authorisation Report
 * ====================================================================
 *
 * Reports the regulatory licensing status and roadmap for SGTX
 * operations across all jurisdictions where the platform plans to
 * operate.
 *
 * Jurisdictions covered (per SGTX v15 blueprint §Legal — Annex D —
 * Jurisdictional Licensing Matrix):
 *
 *   • EG — Egypt: Central Bank of Egypt (CBE) registration + Nafeza
 *     customs integration credentials + ITIDA datacentre registration.
 *   • EU — European Union: PSD2 authorisation (payment services) +
 *     national DPAs for GDPR + EBA registration.
 *   • US — United States: Money Services Business (MSB) registration
 *     with FinCEN + state-level MTL (Money Transmitter Licences).
 *   • UK — United Kingdom: FCA registration (Payment Institutions
 *     Regulations 2017) + ICO data protection registration.
 *   • AE — United Arab Emirates: Central Bank of UAE registration +
 *     Emirates DPA filing + Dubai DIFC / Abu Dhabi ADGM licences.
 *   • SA — Saudi Arabia: Saudi Arabian Monetary Authority (SAMA)
 *     registration + SDAIA PDPL registration + CITC customs.
 *
 * No external API calls. All data is hardcoded based on the SGTX
 * regulatory onboarding plan and is updated by the compliance team.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type AuthStatus =
  | "OPERATIONAL"
  | "LIVE"
  | "IN-PROGRESS"
  | "APPLICATION-FILED"
  | "PRE-APPLICATION"
  | "BLOCKED"
  | "NOT-REQUIRED";

export interface AuthStatus {
  country: string;
  countryName: string;
  requiredLicences: string[];
  currentStatus: AuthStatus;
  estimatedTimeToApproval: string;
  nextSteps: string[];
  regulator: string;
  statute: string;
  applicationReference?: string;
  lastUpdated: string;
  notes?: string;
}

export interface AuthRoadmap {
  generatedAt: string;
  totalJurisdictions: number;
  operationalCount: number;
  inProgressCount: number;
  jurisdictions: AuthStatus[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded jurisdictional authorisation data
// ─────────────────────────────────────────────────────────────────────────────

const LAST_UPDATED = "2025-01-15"; // last compliance-team review

const JURISDICTION_AUTH: Record<string, AuthStatus> = {
  EG: {
    country: "EG",
    countryName: "Egypt",
    requiredLicences: [
      "Central Bank of Egypt (CBE) — Payment Service Provider registration",
      "Nafeza customs integration credentials (CargoX blockchain)",
      "ITIDA datacentre registration",
      "Egyptian DPA notification (PDPL 2020)",
      "Customs broker licence (per shipment type)",
    ],
    currentStatus: "OPERATIONAL",
    estimatedTimeToApproval: "Operational since Q1 2024",
    nextSteps: [
      "Renew CBE registration annually (April)",
      "Complete CargoX ACI integration audit (March 2025)",
      "File PDPL annual compliance report",
    ],
    regulator: "Central Bank of Egypt (CBE) + Egyptian Customs Authority",
    statute:
      "Banking Law No. 194 of 2020; Customs Law No. 207 of 2020; PDPL No. 151 of 2020",
    applicationReference: "CBE-PSP-2024-EG-0184",
    lastUpdated: LAST_UPDATED,
    notes:
      "SGTX is fully operational in Egypt. Nafeza/CargoX ACI integration is " +
      "live. The platform's primary customs broker licence is held via " +
      "SGTX Egypt LLC.",
  },
  EU: {
    country: "EU",
    countryName: "European Union",
    requiredLicences: [
      "PSD2 authorisation (Payment Services Directive 2) — Lead: Central Bank of Ireland",
      "National DPA registration per operating member state",
      "EBA (European Banking Authority) notification",
      "VIES registration for cross-border VAT",
      "EU Customs AES (Automated Export System) access",
    ],
    currentStatus: "IN-PROGRESS",
    estimatedTimeToApproval: "6-9 months from filing (filed Sep 2024)",
    nextSteps: [
      "Respond to Central Bank of Ireland RFI (information request)",
      "Complete passport notification to DE, FR, NL, IT, ES",
      "Submit GDPR Article 30 record-keeping to lead DPA",
      "Engage with EU Customs for AEO (Authorised Economic Operator) certification",
    ],
    regulator: "Central Bank of Ireland (lead) + EBA + national DPAs",
    statute:
      "PSD2 (Directive 2015/2366); GDPR (Regulation 2016/679); UCC (Regulation 952/2013)",
    applicationReference: "CBI-PSP-2024-EU-PSD2-0712",
    lastUpdated: LAST_UPDATED,
    notes:
      "PSD2 authorisation filed via Central Bank of Ireland (lead) with " +
      "passporting to all 27 EU member states. Expected to be operational " +
      "Q2 2025.",
  },
  US: {
    country: "US",
    countryName: "United States",
    requiredLicences: [
      "FinCEN MSB (Money Services Business) registration",
      "State-level Money Transmitter Licences (MTLs) — top-priority: CA, NY, TX, FL, IL",
      "OFAC sanctions compliance programme",
      "FCM (Forward Contract Merchant) registration with CFTC (if applicable)",
      "CBP (Customs and Border Protection) broker licence per port",
    ],
    currentStatus: "APPLICATION-FILED",
    estimatedTimeToApproval: "12-18 months for full MTL coverage",
    nextSteps: [
      "File FinCEN MSB registration renewal (biennial)",
      "Submit MTL applications to NYDFS, CA DBO, TX OCCC",
      "Engage surety bond provider for state MTL bonding requirements",
      "Complete CBP broker licence exam (March 2025)",
    ],
    regulator:
      "FinCEN + state financial regulators (NYDFS, CA DBO, etc.) + CBP + OFAC",
    statute:
      "Bank Secrecy Act (31 USC 5330); state money transmitter laws; Trade Sanctions Reform Act",
    applicationReference: "FinCEN-MSB-2024-US-0457",
    lastUpdated: LAST_UPDATED,
    notes:
      "FinCEN MSB registration completed. State MTLs in progress; SGTX " +
      "currently operates under temporary partner-bank arrangements in " +
      "non-licensed states.",
  },
  UK: {
    country: "UK",
    countryName: "United Kingdom",
    requiredLicences: [
      "FCA registration as a Small Payment Institution (SPI) or Authorised Payment Institution (API)",
      "ICO (Information Commissioner's Office) data protection registration",
      "HMRC Customs declaration service (CDS) registration",
      "AEO (Authorised Economic Operator) certification",
    ],
    currentStatus: "OPERATIONAL",
    estimatedTimeToApproval: "Operational since Q3 2024",
    nextSteps: [
      "Upgrade from SPI to API status once monthly payment volume exceeds €3M",
      "File ICO annual data protection fee",
      "Apply for UK AEO certification (estimated 6 months)",
    ],
    regulator: "Financial Conduct Authority (FCA) + ICO + HMRC",
    statute:
      "Payment Services Regulations 2017; UK GDPR (Data Protection Act 2018); Customs and Excise Management Act 1979",
    applicationReference: "FCA-SPI-2024-UK-0298",
    lastUpdated: LAST_UPDATED,
    notes:
      "Operating as FCA-registered Small Payment Institution. UK CDS " +
      "customs integration live.",
  },
  AE: {
    country: "AE",
    countryName: "United Arab Emirates",
    requiredLicences: [
      "Central Bank of UAE — Retail Payment Services and Card Schemes Regulation (RPSCS)",
      "UAE Data Office PDPL registration",
      "Dubai DIFC or Abu Dhabi ADGM fintech licence (sandbox or full)",
      "Federal Customs Authority registration + Dubai Customs portal access",
    ],
    currentStatus: "IN-PROGRESS",
    estimatedTimeToApproval: "4-6 months (filed Oct 2024)",
    nextSteps: [
      "Respond to Central Bank of UAE RFI (information request)",
      "Complete DIFC Innovation Token Licence application",
      "Integrate with Dubai Customs ROSHAN system",
      "File PDPL transfer impact assessment",
    ],
    regulator: "Central Bank of UAE + UAE Data Office + Federal Customs Authority",
    statute:
      "Federal Decree-Law No. 45 of 2021 (PDPL); CBUAE RPSCS Regulation 2023; Federal Customs Law",
    applicationReference: "CBUAE-RPSCS-2024-AE-0156",
    lastUpdated: LAST_UPDATED,
    notes:
      "Operating in DIFC fintech sandbox (Phase 3). Full RPSCS licence " +
      "expected Q2 2025.",
  },
  SA: {
    country: "SA",
    countryName: "Saudi Arabia",
    requiredLicences: [
      "Saudi Arabian Monetary Authority (SAMA) — Payment Service Provider licence",
      "SDAIA PDPL registration + cross-border transfer approval",
      "CITC (Communications & IT Commission) cloud services registration",
      "Saudi Customs (ZATCA) FASAH platform integration credentials",
    ],
    currentStatus: "PRE-APPLICATION",
    estimatedTimeToApproval: "12-18 months from filing (target filing Q2 2025)",
    nextSteps: [
      "Engage SAMA pre-application consultation",
      "Submit SAMA PSP licence application (target Q2 2025)",
      "File SDAIA PDPL registration + cross-border transfer request",
      "Obtain ZATCA FASAH integration credentials",
    ],
    regulator: "SAMA + SDAIA + ZATCA + CITC",
    statute:
      "SAMA PSP Rules (2020); PDPL (Royal Decree M/19, 2023); ZATCA Customs Unified Law",
    applicationReference: undefined,
    lastUpdated: LAST_UPDATED,
    notes:
      "Currently in pre-application engagement with SAMA. No live " +
      "operations in KSA yet — using partner-bank arrangement for " +
      "Saudi-routed payments.",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function now(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get authorisation status for a single jurisdiction.
 * Returns a structured record with required licences, current status,
 * estimated time to approval, and next steps.
 */
export function getJurisdictionAuthorisationStatus(
  countryCode: string,
): AuthStatus {
  try {
    const cc = (countryCode || "").toUpperCase();
    const status = JURISDICTION_AUTH[cc];
    if (status) return status;
    return {
      country: cc,
      countryName: cc,
      requiredLicences: [],
      currentStatus: "NOT-REQUIRED",
      estimatedTimeToApproval: "n/a",
      nextSteps: [
        "Jurisdiction not in SGTX operational roadmap. Contact compliance team if operations are planned.",
      ],
      regulator: "Unknown",
      statute: "None identified",
      lastUpdated: LAST_UPDATED,
      notes:
        "SGTX has no current or planned operations in this jurisdiction. " +
        "If business requires a presence here, a regulatory assessment is required.",
    };
  } catch (err: any) {
    logger.error("legal-authorisation.getJurisdictionAuthorisationStatus failed", {
      error: err?.message,
      countryCode,
    });
    return {
      country: countryCode || "",
      countryName: countryCode || "",
      requiredLicences: [],
      currentStatus: "BLOCKED",
      estimatedTimeToApproval: "n/a",
      nextSteps: ["contact platform administrator — internal error"],
      regulator: "Unknown",
      statute: "Error",
      lastUpdated: LAST_UPDATED,
      notes: `internal error: ${err?.message ?? "unknown"}`,
    };
  }
}

/**
 * Get the full authorisation roadmap across all jurisdictions.
 */
export function getAuthorisationRoadmap(): AuthRoadmap {
  try {
    const jurisdictions = Object.values(JURISDICTION_AUTH);
    const operationalCount = jurisdictions.filter(
      (j) => j.currentStatus === "OPERATIONAL" || j.currentStatus === "LIVE",
    ).length;
    const inProgressCount = jurisdictions.filter(
      (j) =>
        j.currentStatus === "IN-PROGRESS" ||
        j.currentStatus === "APPLICATION-FILED" ||
        j.currentStatus === "PRE-APPLICATION",
    ).length;
    return {
      generatedAt: now(),
      totalJurisdictions: jurisdictions.length,
      operationalCount,
      inProgressCount,
      jurisdictions,
    };
  } catch (err: any) {
    logger.error("legal-authorisation.getAuthorisationRoadmap failed", {
      error: err?.message,
    });
    return {
      generatedAt: now(),
      totalJurisdictions: 0,
      operationalCount: 0,
      inProgressCount: 0,
      jurisdictions: [],
      error: err?.message ?? "unknown error",
    };
  }
}

/** List supported jurisdictions (sync helper for callers that don't need the full status). */
export function listSupportedJurisdictions(): string[] {
  try {
    return Object.keys(JURISDICTION_AUTH);
  } catch {
    return [];
  }
}
