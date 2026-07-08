/**
 * Product Compliance Assessment Module
 * ====================================
 *
 * Determines which product-level compliance regimes apply to a given trade
 * (defined by HS code, commodity description, origin & destination country)
 * and emits a structured per-regime verdict suitable for UI rendering and
 * gating of the trade workflow.
 *
 * Compliance regimes covered:
 *
 *   • REACH           — EC 1907/2006 (EU chemicals regulation). Applies to
 *                       chemicals & plastics (HS chapters 28–39) destined for
 *                       the EU. Requires SVHC declaration & (above 1 t/yr)
 *                       registration with ECHA.
 *   • CE_MARKING      — EU conformity-assessment regime for machinery,
 *                       electronics, vehicles, construction products, medical
 *                       devices, toys (per task spec HS chapters 84–85, 87,
 *                       68, 94, 95). Requires Declaration of Conformity +
 *                       CE mark affixed by the manufacturer (or an EU
 *                       Notified Body for higher-risk classes).
 *   • HALAL           — Islamic dietary / slaughter law. Applies to live
 *                       animals (HS 01–02), fresh/chilled/frozen meat
 *                       (0201–0210), and prepared meat products (1601–1605)
 *                       destined for GCC and major Islamic countries.
 *                       Requires Halal slaughter certificate issued by a
 *                       recognized local authority.
 *   • PHYTOSANITARY   — IPPC / WTO SPS. Applies to live plants and agri
 *                       products (HS chapters 01–14) in any international
 *                       trade. Requires a phytosanitary certificate from the
 *                       origin country's plant-protection organization.
 *   • FSC_WOOD        — EU Timber Regulation (EUTR, EU 995/2010) + FSC chain
 *                       of custody. Applies to wood (HS 44), pulp (HS 47),
 *                       paper (HS 48) destined for the EU. Requires FSC CoC
 *                       certificate OR EUTR due-diligence statement.
 *   • ORGANIC         — EU 2018/848 (organic production) + USDA NOP.
 *                       Applies when the commodity description contains
 *                       "organic" AND destination is EU/US. Requires organic
 *                       certification from an accredited certifier.
 *   • TEXTILE_LABELING— EU 1007/2011 (fiber composition & labeling) +
 *                       US FTC Textile Fiber Products Identification Act.
 *                       Applies to textiles (HS 50–63) destined for EU/US.
 *                       Requires fiber-composition label + country-of-origin
 *                       label affixed to the product.
 *
 * The module is a deterministic, self-contained rules engine. NO external
 * API calls. Certificate numbers are mock-generated for UI display —
 * production deployments would replace `mockCertificateNumber` with a lookup
 * against the tenant's uploaded-certificate registry.
 *
 * References:
 *  - REACH: Regulation (EC) No 1907/2006, OJ L 396, 30.12.2006.
 *  - CE Marking: Decision No 768/2008/EC; sectoral directives (LVD 2014/35/EU,
 *    EMC 2014/30/EU, Machinery 2006/42/EC, etc.).
 *  - Halal: GAC / SMIIC standards; national halal authorities.
 *  - Phytosanitary: IPPC (FAO, 1997); ISPM No. 12 (Phytosanitary certificates).
 *  - EUTR: Regulation (EU) No 995/2010, OJ L 295, 12.11.2010.
 *  - Organic: Regulation (EU) 2018/848; USDA NOP (7 CFR Part 205).
 *  - Textile Labeling: Regulation (EU) No 1007/2011; US FTC 16 CFR Part 303.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export type ProductComplianceCheckType =
  | "REACH"
  | "CE_MARKING"
  | "HALAL"
  | "PHYTOSANITARY"
  | "FSC_WOOD"
  | "ORGANIC"
  | "TEXTILE_LABELING";

export interface ProductComplianceCheck {
  check: ProductComplianceCheckType;
  applicable: boolean;
  required: boolean;
  status: "PASS" | "CONDITIONAL" | "FAIL" | "NOT_APPLICABLE";
  /** Mock certificate number — `{CHECK}{random8}`. Present when `applicable`
   *  is true (represents the certificate slot to be filled). */
  certificateNumber?: string;
  authority?: string;
  conditions: {
    condition_id: string;
    label: string;
    status: "met" | "unmet";
  }[];
  notes: string;
}

export interface ProductComplianceResult {
  ustn: string;
  hsCode: string;
  commodity: string;
  originCountry: string;
  destCountry: string;
  checks: ProductComplianceCheck[];
  overallVerdict: "PASS" | "CONDITIONAL" | "FAIL";
}

export interface AssessProductComplianceInput {
  ustn: string;
  hsCode: string;
  commodity: string;
  originCountry: string;
  destCountry: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Country group lists (local copies to avoid coupling)
// ─────────────────────────────────────────────────────────────────────────────

/** EU member states (ISO 3166-1 alpha-2). */
const EU_MEMBER_STATES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** GCC + major Islamic destination countries for HALAL applicability. */
const GCC_ISLAMIC_DEST: ReadonlySet<string> = new Set([
  "SA", "AE", "KW", "BH", "QA", "OM", "MY", "ID", "BN", "PK", "EG",
]);

// ─────────────────────────────────────────────────────────────────────────────
// HS-code helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip any non-digit characters from an HS code (handles "8471.30.00"). */
function normalizeHsCode(hsCode: string): string {
  return (hsCode || "").replace(/\D/g, "");
}

/** Extract the 2-digit HS chapter (1–99) from an HS code. Returns 0 if
 *  unparseable. */
function hsChapter(hsCode: string): number {
  const digits = normalizeHsCode(hsCode);
  if (digits.length < 2) return 0;
  return parseInt(digits.slice(0, 2), 10);
}

/** Extract the 4-digit HS heading from an HS code (e.g. 1602 from 1602.10.00).
 *  Returns 0 if unparseable. */
function hsHeading(hsCode: string): number {
  const digits = normalizeHsCode(hsCode);
  if (digits.length < 4) return 0;
  return parseInt(digits.slice(0, 4), 10);
}

/** True if the HS chapter is within [low, high] (inclusive). */
function chapterIn(chapter: number, low: number, high: number): boolean {
  return chapter >= low && chapter <= high;
}

/** True if the HS heading falls within [low, high] (inclusive). */
function headingIn(heading: number, low: number, high: number): boolean {
  return heading >= low && heading <= high;
}

// ─────────────────────────────────────────────────────────────────────────────
// Random helpers (mock-only)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 8-character alphanumeric mock serial. Uses `crypto.getRandomValues` when
 * available (Node 19+/browser/Bun), falls back to `Math.random`. Sufficient
 * for mock certificate numbers — NOT a security primitive.
 */
function random8(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I)
  const out = new Array<string>(8);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    const buf = new Uint8Array(8);
    globalThis.crypto.getRandomValues(buf);
    for (let i = 0; i < 8; i++) out[i] = chars[buf[i] % chars.length];
  } else {
    for (let i = 0; i < 8; i++) out[i] = chars[Math.floor(Math.random() * chars.length)];
  }
  return out.join("");
}

/** Build a mock certificate number — `{CHECK}{random8}`. Example: `REACHK7P3M9XQ`. */
function mockCertificateNumber(check: ProductComplianceCheckType): string {
  return `${check}${random8()}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-regime applicability rules
// ─────────────────────────────────────────────────────────────────────────────

/** REACH — EU chemicals (HS 28–39) + EU destination. */
function assessReach(
  chapter: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  const applicable =
    chapterIn(chapter, 28, 39) &&
    EU_MEMBER_STATES.has(dest) &&
    origin !== dest;

  if (!applicable) {
    return {
      check: "REACH",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "REACH (EC 1907/2006) is applicable only to chemicals, polymers & plastics " +
        "(HS chapters 28–39) destined for the EU market.",
    };
  }

  return {
    check: "REACH",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("REACH"),
    authority: "European Chemicals Agency (ECHA)",
    conditions: [
      {
        condition_id: "REACH-SVHC-DECL",
        label: "SVHC declaration on file (Substances of Very High Concern per latest Candidate List)",
        status: "unmet",
      },
      {
        condition_id: "REACH-REGISTRATION",
        label: "REACH registration number (for substances ≥ 1 t/yr per manufacturer/importer)",
        status: "unmet",
      },
      {
        condition_id: "REACH-SDS",
        label: "Safety Data Sheet (SDS) in EU official language of the destination member state",
        status: "unmet",
      },
      {
        condition_id: "REACH-AUTHORIZATION",
        label: "Authorization status confirmed (if substance is on Annex XIV) OR Annex XVII restriction respected",
        status: "unmet",
      },
    ],
    notes:
      "REACH applies to chemicals, polymers & plastics entering the EU. " +
      "SVHC declaration is mandatory; registration is required above 1 t/yr. " +
      "ECHA is the competent authority.",
  };
}

/** CE Marking — machinery, electronics, vehicles, construction, medical, toys
 *  (HS chapters 84–85, 87, 68, 94, 95 per task spec) + EU destination. */
function assessCeMarking(
  chapter: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  // Per task spec: chapters 84–85, 87, 68, 94, 95.
  // (Note: HS chapter 90 — optical/medical instruments — is also commonly
  // CE-marked under the Medical Devices Regulation; we follow the task spec
  // list verbatim here. Add 90 if/when the spec is extended.)
  const CE_CHAPTERS: ReadonlySet<number> = new Set([84, 85, 87, 68, 94, 95]);
  const applicable =
    CE_CHAPTERS.has(chapter) &&
    EU_MEMBER_STATES.has(dest) &&
    origin !== dest;

  if (!applicable) {
    return {
      check: "CE_MARKING",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "CE Marking is applicable to machinery, electronics, vehicles, construction " +
        "products, medical devices & toys (HS chapters 84–85, 87, 68, 94, 95) " +
        "destined for the EU market.",
    };
  }

  return {
    check: "CE_MARKING",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("CE_MARKING"),
    authority: "EU Notified Body (sector-specific)",
    conditions: [
      {
        condition_id: "CE-DOC",
        label: "EU Declaration of Conformity (DoC) signed by the manufacturer or authorized representative",
        status: "unmet",
      },
      {
        condition_id: "CE-MARK",
        label: "CE mark affixed to the product, packaging, and/or accompanying documentation per the relevant directive",
        status: "unmet",
      },
      {
        condition_id: "CE-TECHNICAL-FILE",
        label: "Technical construction file on file (drawings, risk assessment, test reports, operating manual)",
        status: "unmet",
      },
      {
        condition_id: "CE-NOTIFIED-BODY",
        label: "Notified Body assessment (required for higher-risk classes: ATEX, MDR Class IIb/III, PPE Cat III, etc.)",
        status: "unmet",
      },
    ],
    notes:
      "CE Marking is mandatory for the listed product categories placed on the EU market. " +
      "Manufacturer self-certifies for lower-risk classes; Notified Body involvement is required " +
      "for higher-risk classes.",
  };
}

/** HALAL — live animals, meat, prepared meat (HS 01–02, 0201–0210, 1601–1605)
 *  + GCC / Islamic destination. */
function assessHalal(
  chapter: number,
  heading: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  // Applicable if: (chapter 1 or 2) OR (chapter 16 with heading in 1601–1605)
  // AND dest is GCC/Islamic.
  const isMeatProduct =
    chapter === 1 ||
    chapter === 2 ||
    (chapter === 16 && headingIn(heading, 1601, 1605));
  const applicable =
    isMeatProduct &&
    GCC_ISLAMIC_DEST.has(dest) &&
    origin !== dest;

  if (!applicable) {
    return {
      check: "HALAL",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "Halal certification is applicable to live animals (HS 01–02), fresh/chilled/frozen " +
        "meat (0201–0210) and prepared meat products (1601–1605) destined for GCC & major " +
        "Islamic countries (SA, AE, KW, BH, QA, OM, MY, ID, BN, PK, EG).",
    };
  }

  return {
    check: "HALAL",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("HALAL"),
    authority: "Local Halal certification authority (destination country recognized)",
    conditions: [
      {
        condition_id: "HALAL-SLAUGHTER-CERT",
        label: "Halal slaughter certificate issued by a recognized Islamic authority (e.g. GAC, MUI, JAKIM, ESMA)",
        status: "unmet",
      },
      {
        condition_id: "HALAL-SLAUGHTERER",
        label: "Slaughter performed by a Muslim slaughterer who has recited the Tasmiyah at the time of slaughter",
        status: "unmet",
      },
      {
        condition_id: "HALAL-SEPARATION",
        label: "Complete separation from non-Halal products throughout production, packaging, transport & storage",
        status: "unmet",
      },
      {
        condition_id: "HALAL-LABEL",
        label: "Halal logo/label affixed to packaging per destination country's labeling rules",
        status: "unmet",
      },
    ],
    notes:
      "Halal certification is mandatory for meat products entering GCC & major Islamic markets. " +
      "Recognized certifiers vary by destination (e.g. GAC for KSA, MUI for Indonesia, JAKIM for Malaysia).",
  };
}

/** PHYTOSANITARY — live plants & agri (HS 01–14) + any international trade. */
function assessPhytosanitary(
  chapter: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  const applicable =
    chapterIn(chapter, 1, 14) &&
    origin !== dest &&
    origin.length > 0 &&
    dest.length > 0;

  if (!applicable) {
    return {
      check: "PHYTOSANITARY",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "A phytosanitary certificate (IPPC / ISPM No. 12) is required for live plants, plant " +
        "products, and certain agricultural goods (HS chapters 01–14) in any international trade.",
    };
  }

  return {
    check: "PHYTOSANITARY",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("PHYTOSANITARY"),
    authority: "National Plant Protection Organization (NPPO) of origin — EPPO region for EU",
    conditions: [
      {
        condition_id: "PHYTO-CERT",
        label: "Phytosanitary certificate issued by the origin country's NPPO (per IPPC / ISPM No. 12)",
        status: "unmet",
      },
      {
        condition_id: "PHYTO-INSPECTION",
        label: "Pre-export inspection performed & free from quarantine pests (per destination country's import list)",
        status: "unmet",
      },
      {
        condition_id: "PHYTO-TREATMENT",
        label: "Required phytosanitary treatment (fumigation, cold treatment, hot water dip, irradiation) applied & documented",
        status: "unmet",
      },
      {
        condition_id: "PHYTO-IMPORT-PERMIT",
        label: "Destination country's import permit on file (where required — e.g. US APHIS, EU TRACES)",
        status: "unmet",
      },
    ],
    notes:
      "Phytosanitary certificates are mandatory for live plants & agri goods in international trade. " +
      "Issued by the origin country's NPPO; verified at destination by the importing NPPO.",
  };
}

/** FSC_WOOD — wood / pulp / paper (HS 44, 47, 48) + EU destination (EUTR). */
function assessFscWood(
  chapter: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  const FSC_CHAPTERS: ReadonlySet<number> = new Set([44, 47, 48]);
  const applicable =
    FSC_CHAPTERS.has(chapter) &&
    EU_MEMBER_STATES.has(dest) &&
    origin !== dest;

  if (!applicable) {
    return {
      check: "FSC_WOOD",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "FSC chain-of-custody / EUTR (EU 995/2010) due diligence is applicable to wood (HS 44), " +
        "pulp (HS 47) & paper (HS 48) destined for the EU market.",
    };
  }

  return {
    check: "FSC_WOOD",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("FSC_WOOD"),
    authority: "Forest Stewardship Council (FSC) / EU competent authority (EUTR)",
    conditions: [
      {
        condition_id: "FSC-COC",
        label: "FSC chain-of-custody (CoC) certificate OR PEFC CoC certificate covering the consignment",
        status: "unmet",
      },
      {
        condition_id: "EUTR-DDS",
        label: "EUTR due-diligence statement on file (supplier info, species, country of harvest, legality verification)",
        status: "unmet",
      },
      {
        condition_id: "EUTR-RISK",
        label: "Risk-assessment completed & risk-mitigation applied (where origin carries elevated illegality risk)",
        status: "unmet",
      },
      {
        condition_id: "EUTR-TRACEABILITY",
        label: "Traceability from the forest of harvest to the EU importer maintained throughout the supply chain",
        status: "unmet",
      },
    ],
    notes:
      "EUTR (EU 995/2010) prohibits placing illegally harvested timber on the EU market. Operators " +
      "must run due diligence; FSC/PEFC CoC provides strong evidence of legality & sustainability.",
  };
}

/** ORGANIC — commodity description contains "organic" + EU / US destination. */
function assessOrganic(
  commodity: string,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  const commodityLower = (commodity || "").toLowerCase();
  const isOrganicClaim =
    commodityLower.includes("organic") ||
    commodityLower.includes("bio-") || // German/French "bio" organic prefix
    commodityLower.includes("biologique");
  const isOrganicDest = EU_MEMBER_STATES.has(dest) || dest === "US";
  const applicable = isOrganicClaim && isOrganicDest && origin !== dest;

  if (!applicable) {
    return {
      check: "ORGANIC",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "Organic certification is applicable when the commodity description contains an 'organic' " +
        "claim AND destination is EU (Regulation (EU) 2018/848) or US (USDA NOP, 7 CFR 205).",
    };
  }

  const authority =
    dest === "US"
      ? "USDA-accredited organic certifier (NOP)"
      : "EU-recognized control body / authority (per Regulation (EU) 2018/848)";

  return {
    check: "ORGANIC",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("ORGANIC"),
    authority,
    conditions: [
      {
        condition_id: "ORGANIC-CERT",
        label: `Organic certification issued by an accredited certifier (${authority})`,
        status: "unmet",
      },
      {
        condition_id: "ORGANIC-TRACEABILITY",
        label: "Organic traceability maintained from farm to packer (lot-level audit trail)",
        status: "unmet",
      },
      {
        condition_id: "ORGANIC-EQUIVALENCE",
        label: dest === "US"
          ? "US-EU organic equivalence arrangement respected (no prohibited substances per NOP National List)"
          : "EU organic equivalence recognized (third-country list per Annex to Reg. (EU) 2021/2328)",
        status: "unmet",
      },
      {
        condition_id: "ORGANIC-LABEL",
        label: "Organic logo & certification number affixed to packaging (EU organic logo / USDA organic seal)",
        status: "unmet",
      },
    ],
    notes:
      "An 'organic' claim triggers mandatory certification. EU & US each maintain their own organic " +
      "regimes with a bilateral equivalence arrangement for most plant products.",
  };
}

/** TEXTILE_LABELING — textiles (HS 50–63) + EU / US destination. */
function assessTextileLabeling(
  chapter: number,
  origin: string,
  dest: string,
): ProductComplianceCheck {
  const applicable =
    chapterIn(chapter, 50, 63) &&
    (EU_MEMBER_STATES.has(dest) || dest === "US") &&
    origin !== dest;

  if (!applicable) {
    return {
      check: "TEXTILE_LABELING",
      applicable: false,
      required: false,
      status: "NOT_APPLICABLE",
      conditions: [],
      notes:
        "Textile fiber composition & country-of-origin labeling is applicable to textile products " +
        "(HS chapters 50–63) destined for the EU (Reg. (EU) 1007/2011) or US (FTC 16 CFR 303).",
    };
  }

  const authority =
    dest === "US"
      ? "US Federal Trade Commission (FTC)"
      : "EU member-state market-surveillance authority";

  return {
    check: "TEXTILE_LABELING",
    applicable: true,
    required: true,
    status: "CONDITIONAL",
    certificateNumber: mockCertificateNumber("TEXTILE_LABELING"),
    authority,
    conditions: [
      {
        condition_id: "TEXTILE-FIBER-LABEL",
        label: "Fiber-composition label affixed (percentages per fiber, in descending order)",
        status: "unmet",
      },
      {
        condition_id: "TEXTILE-COO-LABEL",
        label: "Country-of-origin label affixed (e.g. 'Made in Egypt')",
        status: "unmet",
      },
      {
        condition_id: "TEXTILE-SIZE-CARE",
        label: "Size & care-instruction label affixed (washing, drying, ironing symbols)",
        status: "unmet",
      },
      {
        condition_id: "TEXTILE-REACH-SVHC",
        label: "REACH SVHC screening completed for any textile chemical treatments (dyes, finishes, coatings)",
        status: "unmet",
      },
    ],
    notes:
      "Textile labeling is mandatory in EU & US. Fiber composition + country of origin are non-negotiable; " +
      "size/care labeling is required for consumer-facing products.",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Overall verdict aggregation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Aggregate the per-check verdicts into an overall trade verdict.
 *
 *   - Any FAIL            → FAIL
 *   - Else any CONDITIONAL → CONDITIONAL
 *   - Else                → PASS
 *
 * NOT_APPLICABLE checks do not affect the overall verdict.
 */
function aggregateVerdict(checks: ProductComplianceCheck[]): "PASS" | "CONDITIONAL" | "FAIL" {
  let anyConditional = false;
  for (const c of checks) {
    if (c.status === "FAIL") return "FAIL";
    if (c.status === "CONDITIONAL") anyConditional = true;
  }
  return anyConditional ? "CONDITIONAL" : "PASS";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Assess product-level compliance for a single trade.
 *
 * Runs ALL seven compliance-regime assessors (REACH, CE_MARKING, HALAL,
 * PHYTOSANITARY, FSC_WOOD, ORGANIC, TEXTILE_LABELING). Each assessor returns
 * `applicable = false` + `status = NOT_APPLICABLE` when its regime does not
 * apply to the given (HS code, commodity, origin, destination) tuple.
 *
 * When applicable, each assessor emits a structured condition set (all
 * conditions start as `unmet` since no certificate-on-file input is provided
 * to `assessProductCompliance` — the SGTX UI / workflow collects that
 * evidence separately and flips conditions to `met` as uploads are verified).
 *
 * Mock certificate numbers are generated for every applicable check
 * (`{CHECK}{random8}`), representing the certificate slot that must be
 * filled before the trade can be released.
 */
export function assessProductCompliance(
  input: AssessProductComplianceInput,
): ProductComplianceResult {
  const ustn = (input.ustn || "").trim();
  const hsCode = (input.hsCode || "").trim();
  const commodity = (input.commodity || "").trim();
  const origin = (input.originCountry || "").toUpperCase().trim();
  const dest = (input.destCountry || "").toUpperCase().trim();

  const chapter = hsChapter(hsCode);
  const heading = hsHeading(hsCode);

  const checks: ProductComplianceCheck[] = [
    assessReach(chapter, origin, dest),
    assessCeMarking(chapter, origin, dest),
    assessHalal(chapter, heading, origin, dest),
    assessPhytosanitary(chapter, origin, dest),
    assessFscWood(chapter, origin, dest),
    assessOrganic(commodity, origin, dest),
    assessTextileLabeling(chapter, origin, dest),
  ];

  return {
    ustn,
    hsCode,
    commodity,
    originCountry: origin,
    destCountry: dest,
    checks,
    overallVerdict: aggregateVerdict(checks),
  };
}
