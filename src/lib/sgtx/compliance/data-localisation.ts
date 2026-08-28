// @ts-nocheck
/**
 * G-16 — Data Localisation Enforcement
 * ====================================================================
 *
 * Classifies data elements per jurisdictional residency rules and checks
 * whether a data transfer between two jurisdictions is compliant.
 *
 * Supported jurisdictions (hardcoded rules; aligned with the SGTX v15
 * blueprint §Legal — Annex C — Data Localisation Matrix):
 *
 *   • EG  — Egypt PDPL (2020): citizen data + customs data must reside
 *           in Egypt. Cross-border requires DPA approval.
 *   • RU  — Russia Federal Law 242-FZ: ALL personal data of Russian
 *           citizens must be stored in Russia.
 *   • CN  — China PIPL (2021) + DSL (2021): PII must be stored in China;
 *           "important data" + cross-border transfer requires CAC security
 *           assessment.
 *   • SA  — Saudi PDPL (2023): health + government data must reside in KSA.
 *   • EU  — GDPR (2016/679): cross-border transfers require adequacy
 *           decision / SCCs / BCRs.
 *
 * Classification tiers
 * --------------------
 *   • EGYPT_ONLY             — must remain physically in Egypt.
 *   • COUNTRY_ONLY           — must remain in the source country.
 *   • REGIONAL               — must remain within a region (e.g. EU, GCC).
 *   • APPROVED_CROSS_BORDER  — may cross borders under specific agreements.
 *   • GLOBAL_ALLOWED         — no residency restriction.
 *
 * No external API calls. Pure rule-based classification.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type DataClassification =
  | "EGYPT_ONLY"
  | "COUNTRY_ONLY"
  | "REGIONAL"
  | "APPROVED_CROSS_BORDER"
  | "GLOBAL_ALLOWED";

export interface LocalisationRules {
  countryCode: string;
  countryName: string;
  /** Default classification for unspecified data in this jurisdiction. */
  defaultClassification: DataClassification;
  /** Fields that must remain in this country. */
  countryOnlyFields: string[];
  /** Fields restricted to this region (e.g. EU, GCC, MENA). */
  regionalFields: string[];
  /** Fields that may cross borders with approved transfer mechanisms. */
  approvedCrossBorderFields: string[];
  /** Region this country belongs to. */
  region: "EU" | "GCC" | "MENA" | "ASEAN" | "AFRICA" | "NAFTA" | "OTHER";
  /** Regulator + key statute. */
  regulator: string;
  statute: string;
  /** Required transfer mechanisms for cross-border flow. */
  requiredTransferMechanisms: string[];
  /** Notes for compliance teams. */
  notes: string;
}

export interface ResidencyCheck {
  /** Source jurisdiction (ISO 2). */
  sourceJurisdiction: string;
  /** Target jurisdiction (ISO 2). */
  targetJurisdiction: string;
  /** Overall compliant (true if no violations). */
  compliant: boolean;
  /** List of violations (one per non-compliant field). */
  violations: string[];
  /** Required corrective actions. */
  requiredActions: string[];
  /** Per-field classification breakdown. */
  fieldBreakdown: Array<{
    field: string;
    classification: DataClassification;
    allowed: boolean;
    reason: string;
  }>;
  /** Verdict timestamp. */
  checkedAt: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hardcoded jurisdictional rules
// ─────────────────────────────────────────────────────────────────────────────

const RULES: Record<string, LocalisationRules> = {
  EG: {
    countryCode: "EG",
    countryName: "Egypt",
    defaultClassification: "COUNTRY_ONLY",
    countryOnlyFields: [
      "nationalId",
      "passportNumber",
      "taxId",
      "customsDeclarationNumber",
      "nafezaCredentials",
      "aciManifest",
      "cbeRegistration",
      "citizenHealthRecord",
      "employeeRecords",
      "biometricData",
    ],
    regionalFields: ["tradeInvoice", "packingList", "billOfLading"],
    approvedCrossBorderFields: ["hsCode", "incoterms", "currency", "ustn"],
    region: "MENA",
    regulator: "Egyptian DPA (Personal Data Protection Center)",
    statute: "Personal Data Protection Law No. 151 of 2020",
    requiredTransferMechanisms: [
      "DPA written approval",
      "Standard Contractual Clauses",
      "Adequacy decision by Egyptian DPA",
    ],
    notes:
      "Customs data (Nafeza / ACI) MUST be stored in Egypt; transfer " +
      "requires Egyptian Customs Authority approval.",
  },
  RU: {
    countryCode: "RU",
    countryName: "Russia",
    defaultClassification: "COUNTRY_ONLY",
    countryOnlyFields: [
      "fullName",
      "passportNumber",
      "innNumber",
      "snilsNumber",
      "address",
      "email",
      "phoneNumber",
      "ipAddress",
      "cookieData",
      "anyPersonalData",
    ],
    regionalFields: [],
    approvedCrossBorderFields: ["hsCode", "incoterms", "tradeStatistics"],
    region: "OTHER",
    regulator: "Roskomnadzor",
    statute: "Federal Law No. 242-FZ (personal data localisation)",
    requiredTransferMechanisms: [
      "Roskomnadzor notification",
      "Subject consent for cross-border transfer",
      "Adequacy determination by Roskomnadzor",
    ],
    notes:
      "ALL personal data of Russian subjects must be initially stored " +
      "in Russia. Cross-border transfer requires subject consent.",
  },
  CN: {
    countryCode: "CN",
    countryName: "China",
    defaultClassification: "COUNTRY_ONLY",
    countryOnlyFields: [
      "nationalId",
      "residentId",
      "phone",
      "address",
      "biometric",
      "healthRecord",
      "financialAccount",
      "paymentData",
      "minorsData",
      "sensitivePersonalInformation",
    ],
    regionalFields: [],
    approvedCrossBorderFields: ["hsCode", "tradeInvoice", "billOfLading"],
    region: "OTHER",
    regulator: "Cyberspace Administration of China (CAC)",
    statute: "PIPL (2021) + DSL (2021) + CSL (2017)",
    requiredTransferMechanisms: [
      "CAC security assessment",
      "CAC standard contract filing",
      "PIPL Article 38 certification",
    ],
    notes:
      "Important data + sensitive PI must undergo CAC security assessment " +
      "before any cross-border transfer.",
  },
  SA: {
    countryCode: "SA",
    countryName: "Saudi Arabia",
    defaultClassification: "COUNTRY_ONLY",
    countryOnlyFields: [
      "nationalId",
      "iqamaNumber",
      "healthRecord",
      "medicalRecords",
      "governmentData",
      "saudiCitizenPII",
      "biometric",
    ],
    regionalFields: ["tradeInvoice", "billOfLading"],
    approvedCrossBorderFields: ["hsCode", "incoterms"],
    region: "GCC",
    regulator: "Saudi Data & AI Authority (SDAIA)",
    statute: "Personal Data Protection Law (PDPL, 2023)",
    requiredTransferMechanisms: [
      "SDAIA approval",
      "Standard Contractual Clauses",
      "Adequacy decision by SDAIA",
    ],
    notes:
      "Health data + government data MUST reside in KSA. Cross-border " +
      "transfer of citizen PII requires SDAIA approval.",
  },
  EU: {
    countryCode: "EU",
    countryName: "European Union",
    defaultClassification: "REGIONAL",
    countryOnlyFields: [],
    regionalFields: [
      "fullName",
      "email",
      "ipAddress",
      "cookieData",
      "taxId",
      "vatNumber",
      "personalData",
      "specialCategoryData",
      "biometric",
      "locationData",
    ],
    approvedCrossBorderFields: ["hsCode", "tradeInvoice", "billOfLading"],
    region: "EU",
    regulator: "National DPAs (lead: Irish DPC)",
    statute: "GDPR (Regulation 2016/679)",
    requiredTransferMechanisms: [
      "Adequacy decision",
      "Standard Contractual Clauses (SCCs)",
      "Binding Corporate Rules (BCRs)",
      "Derogation under Article 49",
    ],
    notes:
      "Transfers to non-adequate countries require SCCs or BCRs. " +
      "Schrems II requires Transfer Impact Assessment.",
  },
  // Common non-restricted jurisdictions (default: GLOBAL_ALLOWED)
  US: {
    countryCode: "US",
    countryName: "United States",
    defaultClassification: "GLOBAL_ALLOWED",
    countryOnlyFields: [],
    regionalFields: [],
    approvedCrossBorderFields: [
      "fullName",
      "email",
      "phone",
      "tradeInvoice",
      "billOfLading",
      "hsCode",
    ],
    region: "NAFTA",
    regulator: "FTC + state AGs (CCPA/CPRA in California)",
    statute: "Sectoral (HIPAA, GLBA, CCPA/CPRA)",
    requiredTransferMechanisms: ["Notice + opt-out (CCPA)"],
    notes:
      "No general federal residency requirement; sectoral rules apply " +
      "(health = HIPAA, financial = GLBA).",
  },
  AE: {
    countryCode: "AE",
    countryName: "United Arab Emirates",
    defaultClassification: "GLOBAL_ALLOWED",
    countryOnlyFields: ["emiratesId", "healthRecord"],
    regionalFields: ["tradeInvoice", "billOfLading"],
    approvedCrossBorderFields: ["hsCode", "incoterms", "vatNumber"],
    region: "GCC",
    regulator: "UAE Data Office",
    statute: "Federal Decree-Law No. 45 of 2021 (PDPL)",
    requiredTransferMechanisms: [
      "Adequacy decision",
      "Standard Contractual Clauses",
      "UAE Data Office approval",
    ],
    notes: "Emirates ID + health data must remain in UAE.",
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

/** Match a field name against a list (case-insensitive, allows partial). */
function matchesField(fieldName: string, list: string[]): boolean {
  try {
    const f = (fieldName || "").toLowerCase();
    return list.some((x) => {
      const y = x.toLowerCase();
      return f === y || f.includes(y) || y.includes(f);
    });
  } catch {
    return false;
  }
}

/** Detect PII fields by name heuristics (global default — overridden by rules). */
function looksLikePII(fieldName: string): boolean {
  const f = (fieldName || "").toLowerCase();
  return [
    "name",
    "email",
    "phone",
    "address",
    "passport",
    "national",
    "id",
    "ssn",
    "tax",
    "vat",
    "biometric",
    "health",
    "medical",
    "passport",
    "ip",
    "cookie",
  ].some((kw) => f.includes(kw));
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: classifyDataElement
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a single data element based on its name + value + jurisdiction.
 *
 * Algorithm:
 *   1. If the field is in countryOnlyFields[] for the jurisdiction → COUNTRY_ONLY
 *   2. If the field is in regionalFields[] → REGIONAL
 *   3. If the field is in approvedCrossBorderFields[] → APPROVED_CROSS_BORDER
 *   4. If the value contains PII signals (name pattern) → COUNTRY_ONLY (default
 *      for jurisdictions with default = COUNTRY_ONLY) else REGIONAL.
 *   5. Otherwise → default classification for jurisdiction, or GLOBAL_ALLOWED.
 *
 * Special: if jurisdiction is EG and field looks like citizen/customs data
 * the classification is EGYPT_ONLY (override).
 */
export function classifyDataElement(
  elementName: string,
  elementValue: any,
  jurisdiction: string,
): DataClassification {
  try {
    const jc = (jurisdiction || "").toUpperCase();
    const rules = RULES[jc];
    if (!rules) {
      // Unknown jurisdiction — apply conservative default
      return looksLikePII(elementName) ? "REGIONAL" : "GLOBAL_ALLOWED";
    }
    // 1. Country-only list
    if (matchesField(elementName, rules.countryOnlyFields)) {
      // EG-specific override
      if (jc === "EG") return "EGYPT_ONLY";
      return "COUNTRY_ONLY";
    }
    // 2. Regional list
    if (matchesField(elementName, rules.regionalFields)) {
      return "REGIONAL";
    }
    // 3. Approved cross-border list
    if (matchesField(elementName, rules.approvedCrossBorderFields)) {
      return "APPROVED_CROSS_BORDER";
    }
    // 4. PII heuristic
    if (looksLikePII(elementName)) {
      // Heuristic: if value looks like a national ID pattern (digits+letters)
      const v = String(elementValue ?? "");
      if (/^[A-Z0-9]{6,20}$/i.test(v) && v.length >= 8) {
        // Likely a structured ID — apply strict rule
        if (jc === "EG") return "EGYPT_ONLY";
        return "COUNTRY_ONLY";
      }
      return rules.defaultClassification === "COUNTRY_ONLY"
        ? "COUNTRY_ONLY"
        : "REGIONAL";
    }
    // 5. Fall back to default
    return rules.defaultClassification;
  } catch (err: any) {
    logger.error("data-localisation.classifyDataElement failed", {
      error: err?.message,
      elementName,
      jurisdiction,
    });
    return "GLOBAL_ALLOWED"; // safe default — never block business ops
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: checkDataResidency
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Check whether transferring a data object from source to target
 * jurisdiction is compliant.
 *
 * A field is in violation if:
 *   • Its classification is EGYPT_ONLY or COUNTRY_ONLY and target != source.
 *   • Its classification is REGIONAL and source/target are in different
 *     regions.
 *   • Its classification is APPROVED_CROSS_BORDER and no transfer
 *     mechanism is in place (caller can flag via the rule).
 */
export function checkDataResidency(
  data: any,
  sourceJurisdiction: string,
  targetJurisdiction: string,
): ResidencyCheck {
  try {
    const source = (sourceJurisdiction || "").toUpperCase();
    const target = (targetJurisdiction || "").toUpperCase();
    const violations: string[] = [];
    const requiredActions: string[] = [];
    const fieldBreakdown: ResidencyCheck["fieldBreakdown"] = [];
    const sourceRules = RULES[source];
    const targetRules = RULES[target];

    // Same jurisdiction — always compliant (no transfer occurs)
    if (source === target) {
      return {
        sourceJurisdiction: source,
        targetJurisdiction: target,
        compliant: true,
        violations: [],
        requiredActions: [],
        fieldBreakdown: [],
        checkedAt: now(),
      };
    }

    // Iterate over data fields
    const fields = data && typeof data === "object" ? Object.keys(data) : [];
    for (const field of fields) {
      const classification = classifyDataElement(
        field,
        data[field],
        source,
      );
      let allowed = true;
      let reason = "no residency restriction";
      switch (classification) {
        case "EGYPT_ONLY":
          allowed = target === "EG";
          reason = allowed
            ? "field restricted to Egypt; transfer within Egypt permitted"
            : "field restricted to Egypt; transfer outside Egypt is prohibited";
          break;
        case "COUNTRY_ONLY":
          allowed = target === source;
          reason = allowed
            ? "field restricted to source country; intra-country transfer permitted"
            : `field restricted to ${source}; cross-border transfer prohibited`;
          break;
        case "REGIONAL": {
          const srcRegion = sourceRules?.region ?? "OTHER";
          const tgtRegion = targetRules?.region ?? "OTHER";
          allowed = srcRegion === tgtRegion;
          reason = allowed
            ? `field restricted to region ${srcRegion}; transfer within region permitted`
            : `field restricted to region ${srcRegion}; transfer to ${tgtRegion} requires adequacy decision or SCCs`;
          break;
        }
        case "APPROVED_CROSS_BORDER":
          allowed = true;
          reason =
            "cross-border transfer permitted subject to approved mechanism (SCCs / BCRs / adequacy)";
          break;
        case "GLOBAL_ALLOWED":
          allowed = true;
          reason = "no residency restriction";
          break;
      }
      fieldBreakdown.push({
        field,
        classification,
        allowed,
        reason,
      });
      if (!allowed) {
        violations.push(
          `field '${field}' (${classification}) cannot be transferred from ${source} to ${target}: ${reason}`,
        );
      }
    }

    // Compute required actions
    if (violations.length > 0) {
      requiredActions.push(
        `Block transfer of ${violations.length} field(s) from ${source} to ${target}`,
      );
      if (sourceRules?.requiredTransferMechanisms?.length) {
        requiredActions.push(
          `If transfer is required, obtain one of: ${sourceRules.requiredTransferMechanisms.join(", ")}`,
        );
      }
      requiredActions.push(
        "Consider pseudonymisation or anonymisation of restricted fields before transfer",
      );
      requiredActions.push(
        `Document a Transfer Impact Assessment per ${sourceRules?.statute ?? "applicable law"}`,
      );
    } else {
      // No violations — but if cross-border, flag transfer mechanism requirement
      if (source !== target && sourceRules?.requiredTransferMechanisms?.length) {
        requiredActions.push(
          `Ensure transfer mechanism in place: ${sourceRules.requiredTransferMechanisms.join(" / ")}`,
        );
      }
    }

    return {
      sourceJurisdiction: source,
      targetJurisdiction: target,
      compliant: violations.length === 0,
      violations,
      requiredActions,
      fieldBreakdown,
      checkedAt: now(),
    };
  } catch (err: any) {
    logger.error("data-localisation.checkDataResidency failed", {
      error: err?.message,
      sourceJurisdiction,
      targetJurisdiction,
    });
    return {
      sourceJurisdiction,
      targetJurisdiction,
      compliant: false,
      violations: [`internal error: ${err?.message ?? "unknown"}`],
      requiredActions: ["contact platform administrator"],
      fieldBreakdown: [],
      checkedAt: now(),
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: getDataLocalisationRules
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get the localisation rules for a specific country. Returns a generic
 * GLOBAL_ALLOWED rule for unknown jurisdictions (fail-open by default
 * to avoid blocking legitimate business; the caller should explicitly
 * check for known restricted jurisdictions).
 */
export function getDataLocalisationRules(
  countryCode: string,
): LocalisationRules {
  try {
    const cc = (countryCode || "").toUpperCase();
    const rules = RULES[cc];
    if (rules) return rules;
    return {
      countryCode: cc,
      countryName: cc,
      defaultClassification: "GLOBAL_ALLOWED",
      countryOnlyFields: [],
      regionalFields: [],
      approvedCrossBorderFields: [],
      region: "OTHER",
      regulator: "Unknown",
      statute: "No specific statute identified",
      requiredTransferMechanisms: [],
      notes:
        "Jurisdiction not in SGTX data-localisation matrix. Apply GDPR " +
        "equivalent protections as a conservative default.",
    };
  } catch (err: any) {
    logger.error("data-localisation.getDataLocalisationRules failed", {
      error: err?.message,
      countryCode,
    });
    return {
      countryCode: countryCode || "",
      countryName: countryCode || "",
      defaultClassification: "GLOBAL_ALLOWED",
      countryOnlyFields: [],
      regionalFields: [],
      approvedCrossBorderFields: [],
      region: "OTHER",
      regulator: "Unknown",
      statute: "Error",
      requiredTransferMechanisms: [],
      notes: "internal error — apply conservative default",
    };
  }
}

/** List all jurisdictions with explicit rules (used by the API route GET). */
export function listSupportedJurisdictions(): string[] {
  try {
    return Object.keys(RULES);
  } catch {
    return [];
  }
}
