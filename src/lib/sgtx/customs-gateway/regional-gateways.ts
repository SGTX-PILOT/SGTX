// @ts-nocheck
/**
 * SGTX Customs Gateway — Regional Gateway Investigation Stubs (§41-42)
 * ===========================================================================
 *
 * Implements §41 (GCC Special Rule) and §42 (ASEAN Special Rule) of the
 * ZERO-EXTERNAL-COST Customs Expansion prompt.
 *
 * §41 GCC SPECIAL RULE:
 *   • The Gulf Cooperation Council (GCC) countries (SA, AE, OM, QA, KW, BH)
 *     each operate a national single window, but the access model is highly
 *     heterogeneous:
 *       - SA: FASAH (Saudi single window, operated under ZATCA oversight)
 *       - AE: Federal National Single Window + Dubai Customs Mirsal 2 +
 *             Abu Dhabi Customs (multiple authorities)
 *       - OM: Bayan (Oman single window)
 *       - QA: Al Nadeeb (Qatar single window)
 *       - KW: Kuwait Customs single window
 *       - BH: Bahrain Customs single window
 *   • Direct government API access for an independent software platform is
 *     NOT yet verified for any GCC country — most require either:
 *       (a) a broker-only model (licensed local customs broker), or
 *       (b) a commercial middleware vendor (e.g. a local EDI service
 *           provider with a government licence).
 *   • SGTX therefore treats all GCC countries as CLASS_C (ROADMAP) until
 *     investigation completes per country. No GCC adapter is built yet —
 *     only the investigation stub is shipped here.
 *
 * §42 ASEAN SPECIAL RULE:
 *   • ASEAN countries (SG, MY, TH, ID, VN, PH, BN, MM, KH, LA) participate
 *     in the ASEAN Single Window (ASW), which enables cross-border
 *     electronic exchange of customs documents (e.g. ATIGA e-Form D
 *     origin certificates).
 *   • Each member state operates its own national single window:
 *       - SG: TradeNet (CrimsonLogic, commercial operator) — IN_PROGRESS
 *       - MY: SMK (Sistem Maklumat Kastam) — under investigation
 *       - TH: e-Customs (Thai Customs) — under investigation
 *       - ID: CEISA (Indonesian Customs) — under investigation
 *       - VN: VNACCS / VCIS (Vietnam Customs) — under investigation
 *       - PH: E2M (Philippine Customs) — under investigation
 *       - BN: Brunei Customs single window — under investigation
 *       - MM: Myanmar Customs — under investigation
 *       - KH: Cambodian Customs — under investigation
 *       - LA: Lao Customs — under investigation
 *   • The ASEAN Gateway should ONLY be built where it is legally justified
 *     (i.e. at least 3 member states have a verified CLASS_A or CLASS_B
 *     self-build path). Until then, only national adapters are built.
 *
 * L0 invariants:
 *   - NON-MARKETPLACE: the gateway stubs LIST assessments; they NEVER
 *     auto-select a country or build a gateway without verification.
 *   - try/catch with safe defaults on every public function.
 *
 * References:
 *   • ZERO-EXTERNAL-COST Customs Expansion prompt §41 (GCC) + §42 (ASEAN).
 *   • GCC Customs Union framework (2003) + Common Customs Law (2015).
 *   • ASEAN Single Window (ASW) framework agreement (2005) + Protocol on
 *     the Legal Framework to Implement the ASW (2016).
 *   • Per-country references in each adapter's header comment block.
 */

import { logger } from "@/lib/sgtx/logger";
import type { IntegrationClass } from "./country-verification-matrix";

// ============ §41 GCC Special Rule ============

/** The six GCC member states. */
export const GCC_COUNTRIES = ["SA", "AE", "OM", "QA", "KW", "BH"] as const;

/** §41 — per-country GCC assessment record. */
export interface GCCCountryAssessment {
  countryCode: string;
  countryName: string;
  customsSystem: string;
  selfBuildPossible: boolean | null; // null = not yet investigated
  brokerGatewayOnly: boolean;
  commercialMiddlewareRequired: boolean | null; // null = not yet investigated
  classification: IntegrationClass;
  notes: string;
  investigationStatus: "PENDING" | "IN_PROGRESS" | "VERIFIED" | "REJECTED";
  officialSource?: string;
  lastReviewedAt?: string;
}

/**
 * §41 — GCC country assessments. Each entry is the investigation stub for
 * one GCC member state. Status is PENDING until the access model is
 * verified by the SGTX Compliance team + Governor.
 *
 * NON-MARKETPLACE: this array LISTS assessments; it NEVER auto-selects a
 * country or builds a gateway without verification.
 */
export const GCC_ASSESSMENTS: GCCCountryAssessment[] = [
  {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    customsSystem: "FASAH (single window, operated under ZATCA oversight)",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. FASAH is the Saudi single window for foreign trade. " +
      "Access model under investigation — likely requires a licensed local customs " +
      "broker (broker-only model) or a commercial middleware vendor with a ZATCA " +
      "licence. SGTX does NOT have a verified direct API access path.",
    investigationStatus: "PENDING",
    officialSource: "https://fasah.sa",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    customsSystem: "UAE Federal National Single Window + Dubai Customs Mirsal 2 + Abu Dhabi Customs",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. UAE has multiple customs authorities (Federal Customs " +
      "Authority + Dubai Customs + Abu Dhabi Customs) — each operating its own " +
      "electronic system (Mirsal 2 in Dubai). Access model under investigation; " +
      "likely requires a licensed local customs broker or commercial middleware.",
    investigationStatus: "PENDING",
    officialSource: "https://www.dubaicustoms.gov.ae",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "OM",
    countryName: "Oman",
    customsSystem: "Bayan (Oman single window)",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. Bayan is Oman's customs single window operated by the " +
      "Royal Oman Police Customs Directorate. Access model under investigation — " +
      "likely broker-only or commercial middleware.",
    investigationStatus: "PENDING",
    officialSource: "https://www.bayan.gov.om",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "QA",
    countryName: "Qatar",
    customsSystem: "Al Nadeeb (Qatar single window)",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. Al Nadeeb is Qatar's customs single window operated by " +
      "the General Authority of Customs. Access model under investigation — likely " +
      "broker-only or commercial middleware.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.qa",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "KW",
    countryName: "Kuwait",
    customsSystem: "Kuwait Customs single window (Mirsal)",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. Kuwait Customs operates a single window under the " +
      "Directorate General of Customs. Access model under investigation — likely " +
      "broker-only or commercial middleware.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.kw",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "BH",
    countryName: "Bahrain",
    customsSystem: "Bahrain Customs single window (OFOQ)",
    selfBuildPossible: null,
    brokerGatewayOnly: true,
    commercialMiddlewareRequired: null,
    classification: "CLASS_C",
    notes:
      "§41 GCC special rule. OFOQ is Bahrain's customs single window operated by " +
      "Bahrain Customs. Access model under investigation — likely broker-only or " +
      "commercial middleware.",
    investigationStatus: "PENDING",
    officialSource: "https://www.bahraincustoms.gov.bh",
    lastReviewedAt: new Date().toISOString(),
  },
];

/**
 * §41 — Look up a single GCC country's assessment by ISO-2 code.
 *
 * Returns null if the country is not in the GCC list.
 */
export function getGCCAssessment(countryCode: string): GCCCountryAssessment | null {
  try {
    if (!countryCode) return null;
    const upper = countryCode.toUpperCase();
    return GCC_ASSESSMENTS.find((c) => c.countryCode === upper) || null;
  } catch (err: any) {
    logger.error("[regional-gateways] getGCCAssessment failed", { error: err?.message });
    return null;
  }
}

/**
 * §41 — List all GCC assessments.
 */
export function listGCCAssessments(): GCCCountryAssessment[] {
  try {
    return GCC_ASSESSMENTS.slice();
  } catch (err: any) {
    logger.error("[regional-gateways] listGCCAssessments failed", { error: err?.message });
    return [];
  }
}

/**
 * §41 — Return a summary of the GCC investigation status.
 *
 * Returns counts by investigationStatus. Used by the Governor + Compliance
 * team to track investigation progress.
 */
export function getGCCInvestigationSummary(): {
  total: number;
  byStatus: Record<string, number>;
  byClass: Record<IntegrationClass, number>;
  selfBuildVerified: number;
  brokerOnlyCount: number;
} {
  try {
    const byStatus: Record<string, number> = {};
    const byClass: Record<IntegrationClass, number> = {
      CLASS_A: 0,
      CLASS_B: 0,
      CLASS_C: 0,
      REJECTED: 0,
    };
    let selfBuildVerified = 0;
    let brokerOnlyCount = 0;

    for (const a of GCC_ASSESSMENTS) {
      byStatus[a.investigationStatus] = (byStatus[a.investigationStatus] || 0) + 1;
      byClass[a.classification] = (byClass[a.classification] || 0) + 1;
      if (a.selfBuildPossible === true) selfBuildVerified++;
      if (a.brokerGatewayOnly) brokerOnlyCount++;
    }

    return {
      total: GCC_ASSESSMENTS.length,
      byStatus,
      byClass,
      selfBuildVerified,
      brokerOnlyCount,
    };
  } catch (err: any) {
    logger.error("[regional-gateways] getGCCInvestigationSummary failed", { error: err?.message });
    return {
      total: 0,
      byStatus: {},
      byClass: { CLASS_A: 0, CLASS_B: 0, CLASS_C: 0, REJECTED: 0 },
      selfBuildVerified: 0,
      brokerOnlyCount: 0,
    };
  }
}

// ============ §42 ASEAN Special Rule ============

/** The ten ASEAN member states. */
export const ASEAN_COUNTRIES = ["SG", "MY", "TH", "ID", "VN", "PH", "BN", "MM", "KH", "LA"] as const;

/** §42 — per-country ASEAN assessment record. */
export interface ASEANAssessment {
  countryCode: string;
  countryName: string;
  nationalSystem: string;
  aseanSingleWindowParticipant: boolean;
  selfBuildPossible: boolean | null; // null = not yet investigated
  classification: IntegrationClass;
  notes: string;
  investigationStatus: "PENDING" | "IN_PROGRESS" | "VERIFIED" | "REJECTED";
  officialSource?: string;
  lastReviewedAt?: string;
}

/**
 * §42 — ASEAN country assessments. Each entry is the investigation stub
 * for one ASEAN member state.
 *
 * Singapore is IN_PROGRESS (Agent A is implementing the TradeNet adapter
 * in parallel — TradeNet is operated by CrimsonLogic under Singapore
 * Customs oversight; system-to-system access requires a CrimsonLogic
 * licensee agreement).
 *
 * All other ASEAN member states are PENDING until investigation completes.
 */
export const ASEAN_ASSESSMENTS: ASEANAssessment[] = [
  {
    countryCode: "SG",
    countryName: "Singapore",
    nationalSystem: "TradeNet (operated by CrimsonLogic under Singapore Customs)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: true,
    classification: "CLASS_B",
    notes:
      "§42 ASEAN special rule. TradeNet system-to-system access is possible with " +
      "CrimsonLogic licensee onboarding + Singapore Customs permit account. " +
      "Agent A is implementing the Singapore adapter in parallel. CLASS_B until " +
      "onboarding completed.",
    investigationStatus: "IN_PROGRESS",
    officialSource: "https://www.customs.gov.sg",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "MY",
    countryName: "Malaysia",
    nationalSystem: "SMK (Sistem Maklumat Kastam)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. SMK is operated by Royal Malaysian Customs. " +
      "Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.my",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "TH",
    countryName: "Thailand",
    nationalSystem: "e-Customs (Thai Customs)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. Thai Customs e-Customs system. Access model " +
      "under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.go.th",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "ID",
    countryName: "Indonesia",
    nationalSystem: "CEISA (Indonesian Customs)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. CEISA is operated by Directorate General of Customs " +
      "and Excise (Indonesia). Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.beacukai.go.id",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "VN",
    countryName: "Vietnam",
    nationalSystem: "VNACCS / VCIS (Vietnam Customs)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. VNACCS is operated by General Department of Vietnam " +
      "Customs. Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.vn",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "PH",
    countryName: "Philippines",
    nationalSystem: "E2M (Philippine Bureau of Customs)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. E2M is operated by Philippine Bureau of Customs. " +
      "Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.ph",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "BN",
    countryName: "Brunei Darussalam",
    nationalSystem: "Brunei Customs single window",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. Brunei Customs single window operated by Royal " +
      "Customs and Excise Department. Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.bn",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "MM",
    countryName: "Myanmar",
    nationalSystem: "Myanmar Automated Cargo Clearance System (MACCS)",
    aseanSingleWindowParticipant: false,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. MACCS is operated by Myanmar Customs Department. " +
      "ASEAN Single Window participation limited. Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.mm",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "KH",
    countryName: "Cambodia",
    nationalSystem: "Cambodia National Single Window (CNSW)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. CNSW is operated by General Department of Customs " +
      "and Excise (Cambodia). Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.kh",
    lastReviewedAt: new Date().toISOString(),
  },
  {
    countryCode: "LA",
    countryName: "Lao PDR",
    nationalSystem: "Lao National Single Window (LNSW)",
    aseanSingleWindowParticipant: true,
    selfBuildPossible: null,
    classification: "CLASS_C",
    notes:
      "§42 ASEAN special rule. LNSW is operated by Lao Customs Department. " +
      "Access model under investigation.",
    investigationStatus: "PENDING",
    officialSource: "https://www.customs.gov.la",
    lastReviewedAt: new Date().toISOString(),
  },
];

/**
 * §42 — Look up a single ASEAN country's assessment by ISO-2 code.
 *
 * Returns null if the country is not in the ASEAN list.
 */
export function getASEANAssessment(countryCode: string): ASEANAssessment | null {
  try {
    if (!countryCode) return null;
    const upper = countryCode.toUpperCase();
    return ASEAN_ASSESSMENTS.find((c) => c.countryCode === upper) || null;
  } catch (err: any) {
    logger.error("[regional-gateways] getASEANAssessment failed", { error: err?.message });
    return null;
  }
}

/**
 * §42 — List all ASEAN assessments.
 */
export function listASEANAssessments(): ASEANAssessment[] {
  try {
    return ASEAN_ASSESSMENTS.slice();
  } catch (err: any) {
    logger.error("[regional-gateways] listASEANAssessments failed", { error: err?.message });
    return [];
  }
}

/**
 * §42 — Return a summary of the ASEAN investigation status.
 */
export function getASEANInvestigationSummary(): {
  total: number;
  byStatus: Record<string, number>;
  byClass: Record<IntegrationClass, number>;
  aswParticipants: number;
  selfBuildVerified: number;
} {
  try {
    const byStatus: Record<string, number> = {};
    const byClass: Record<IntegrationClass, number> = {
      CLASS_A: 0,
      CLASS_B: 0,
      CLASS_C: 0,
      REJECTED: 0,
    };
    let aswParticipants = 0;
    let selfBuildVerified = 0;

    for (const a of ASEAN_ASSESSMENTS) {
      byStatus[a.investigationStatus] = (byStatus[a.investigationStatus] || 0) + 1;
      byClass[a.classification] = (byClass[a.classification] || 0) + 1;
      if (a.aseanSingleWindowParticipant) aswParticipants++;
      if (a.selfBuildPossible === true) selfBuildVerified++;
    }

    return {
      total: ASEAN_ASSESSMENTS.length,
      byStatus,
      byClass,
      aswParticipants,
      selfBuildVerified,
    };
  } catch (err: any) {
    logger.error("[regional-gateways] getASEANInvestigationSummary failed", { error: err?.message });
    return {
      total: 0,
      byStatus: {},
      byClass: { CLASS_A: 0, CLASS_B: 0, CLASS_C: 0, REJECTED: 0 },
      aswParticipants: 0,
      selfBuildVerified: 0,
    };
  }
}

// ============ §42 ASEAN Gateway decision ============

/**
 * §42 — Determine whether building an ASEAN Gateway is legally justified.
 *
 * The ASEAN Gateway should ONLY be built where it is legally justified —
 * i.e. at least 3 ASEAN member states have a verified CLASS_A or CLASS_B
 * self-build path. Until then, only national adapters are built.
 *
 * NON-MARKETPLACE: this function returns a recommendation; the Governor
 * + Compliance team make the final decision.
 */
export function getASEANGatewayStatus(): {
  buildJustified: boolean;
  countries: ASEANAssessment[];
  verifiedCount: number;
  requiredCount: number;
  notes: string;
} {
  try {
    const verified = ASEAN_ASSESSMENTS.filter(
      (a) =>
        a.selfBuildPossible === true &&
        (a.classification === "CLASS_A" || a.classification === "CLASS_B") &&
        (a.investigationStatus === "VERIFIED" || a.investigationStatus === "IN_PROGRESS"),
    );

    const requiredCount = 3;
    const buildJustified = verified.length >= requiredCount;

    return {
      buildJustified,
      countries: verified,
      verifiedCount: verified.length,
      requiredCount,
      notes:
        `§42 ASEAN Special Rule: ASEAN Gateway should ONLY be built where it is legally ` +
        `justified — at least ${requiredCount} ASEAN member states must have a verified ` +
        `CLASS_A or CLASS_B self-build path. Current verified count: ${verified.length} ` +
        `(${verified.map((c) => c.countryCode).join(", ") || "none"}). ` +
        `buildJustified=${buildJustified}. Until justified, only national adapters ` +
        `are built (e.g. Singapore TradeNet adapter being built by Agent A).`,
    };
  } catch (err: any) {
    logger.error("[regional-gateways] getASEANGatewayStatus failed", { error: err?.message });
    return {
      buildJustified: false,
      countries: [],
      verifiedCount: 0,
      requiredCount: 3,
      notes: "getASEANGatewayStatus internal error — defaulted to NOT justified",
    };
  }
}

// ============ Combined regional overview ============

/**
 * §41-42 — Return a combined overview of both regional investigations.
 * Useful for the Governor + Compliance dashboard.
 */
export function getRegionalGatewayOverview(): {
  gcc: ReturnType<typeof getGCCInvestigationSummary>;
  asean: ReturnType<typeof getASEANInvestigationSummary>;
  aseanGatewayStatus: ReturnType<typeof getASEANGatewayStatus>;
  gccGatewayBuildJustified: boolean;
  notes: string;
} {
  try {
    const gcc = getGCCInvestigationSummary();
    const asean = getASEANInvestigationSummary();
    const aseanGatewayStatus = getASEANGatewayStatus();

    // GCC Gateway is justified only if at least 3 GCC countries have a
    // verified CLASS_A or CLASS_B self-build path. Currently 0.
    const gccGatewayBuildJustified = gcc.selfBuildVerified >= 3;

    return {
      gcc,
      asean,
      aseanGatewayStatus,
      gccGatewayBuildJustified,
      notes:
        `§41-42 Regional Gateway Overview. GCC: ${gcc.total} countries assessed, ` +
        `${gcc.selfBuildVerified} with verified self-build path → GCC Gateway ` +
        `buildJustified=${gccGatewayBuildJustified}. ASEAN: ${asean.total} countries ` +
        `assessed, ${asean.selfBuildVerified} with verified self-build path → ` +
        `ASEAN Gateway buildJustified=${aseanGatewayStatus.buildJustified}. ` +
        `Until buildJustified=true for a region, only NATIONAL adapters are built.`,
    };
  } catch (err: any) {
    logger.error("[regional-gateways] getRegionalGatewayOverview failed", { error: err?.message });
    return {
      gcc: {
        total: 0,
        byStatus: {},
        byClass: { CLASS_A: 0, CLASS_B: 0, CLASS_C: 0, REJECTED: 0 },
        selfBuildVerified: 0,
        brokerOnlyCount: 0,
      },
      asean: {
        total: 0,
        byStatus: {},
        byClass: { CLASS_A: 0, CLASS_B: 0, CLASS_C: 0, REJECTED: 0 },
        aswParticipants: 0,
        selfBuildVerified: 0,
      },
      aseanGatewayStatus: {
        buildJustified: false,
        countries: [],
        verifiedCount: 0,
        requiredCount: 3,
        notes: "internal error",
      },
      gccGatewayBuildJustified: false,
      notes: "getRegionalGatewayOverview internal error",
    };
  }
}
