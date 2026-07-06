/**
 * EUDR — EU Deforestation Regulation (Regulation (EU) 2023/1115) Engine
 * =====================================================================
 *
 * EUDR prohibits the placing and making available on the EU market, and the
 * export from the EU, of cattle, cocoa, coffee, oil palm, rubber, soy, wood
 * and their DERIVATIVES (Annex I HS code list) that are NOT:
 *   • deforestation-free (produced on land that was not subject to
 *     deforestation after 31 December 2020);
 *   • legally produced in the country of production (per that country's law);
 *   • covered by a Due Diligence Statement (DDS) submitted to the EU
 *     Information System.
 *
 * Operators must collect the geo-coordinates of all plots of land where the
 * relevant commodities were produced:
 *   • POLYGONS for plots > 4 ha;
 *   • POINTS (latitude/longitude) for plots ≤ 4 ha.
 *
 * The Regulation applies from 30 December 2025 for large operators and from
 * 30 June 2026 for micro & small enterprises. SGTX enforces the EARLIER
 * applicable date (2025-12-30) for actual trades, since the operator's due
 * diligence obligation crystallizes when the trade is dispatched. The
 * applicability date stored in `EUDR_APPLICABILITY_DEADLINE` is 2025-12-30
 * per the Regulation.
 *
 * This is a deterministic, self-contained rules engine. No external API
 * calls. The risk-level map is sourced from the EUDR Country Benchmarking
 * Annex (finalized 2025) plus NGO deforestation-risk assessments for the
 * high-risk country list mandated by the task brief.
 *
 * References:
 *  - Regulation (EU) 2023/1115 of the European Parliament and of the Council
 *    of 31 May 2023 — OJ L 150, 9.6.2023, p. 206.
 *  - Annex I (relevant commodities & products, HS 2022 nomenclature).
 *  - Implementing Regulation (EU) 2023/2830 (DDS template).
 *  - Commission Delegated Regulation (EU) 2024/1771 (benchmarking).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Country lists
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EU destination countries for EUDR applicability — identical to the CBAM
 * destination list (the 27 EU member states). Per the task brief, "EU
 * destination countries = same list as CBAM."
 */
export const EUDR_EU_DESTINATION_COUNTRIES: string[] = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
];

/**
 * Origin countries flagged HIGH deforestation-risk for EUDR due-diligence
 * purposes. Operators sourcing from these countries face a heightened
 * due-diligence obligation: full risk-mitigation, third-party verification,
 * and (in practice) audited geo-location polygons regardless of plot size.
 *
 * List per task brief (Brazil, Indonesia, DR Congo, Côte d'Ivoire, Ghana,
 * Cameroon, Nigeria, Madagascar, Vietnam) — the mandated high-risk seed
 * for SGTX. The Commission's Delegated Regulation (EU) 2024/1771 on country
 * benchmarking may supersede this — when its high-risk list is finalized,
 * replace this seed with the official list.
 */
export const EUDR_HIGH_RISK_ORIGIN_COUNTRIES: string[] = [
  "BR",  // Brazil — Amazon & Cerrado deforestation pressure (cattle, soy, coffee)
  "ID",  // Indonesia — palm oil & pulpwood deforestation
  "CD",  // DR Congo — Congo basin forest loss
  "CI",  // Côte d'Ivoire — cocoa-driven deforestation
  "GH",  // Ghana — cocoa-driven deforestation
  "CM",  // Cameroon — Congo basin + cocoa
  "NG",  // Nigeria — cocoa & timber deforestation pressure
  "MG",  // Madagascar — slash-and-burn (vanilla, cocoa, timber)
  "VN",  // Vietnam — Central Highlands coffee & Mekong rubber deforestation
];

// ─────────────────────────────────────────────────────────────────────────────
// Commodity & HS-code mapping (EUDR Annex I)
// ─────────────────────────────────────────────────────────────────────────────

export type EudrCommodity =
  | "cattle"
  | "cocoa"
  | "coffee"
  | "oil_palm"
  | "rubber"
  | "soy"
  | "wood";

/** Internal mapping rule: chapter-level (matches first 2 digits of HS) or
 *  heading-level (matches first 4 digits) or subheading-level (6 digits). */
interface HsMapping {
  /** HS prefix; the engine tests whether the cleaned HS code starts with this. */
  prefix: string;
  commodity: EudrCommodity;
  /** Human-readable description of the covered product group. */
  description: string;
}

/**
 * EUDR Annex I mapping — commodities & their derivatives. The list below is a
 * pragmatic subset covering the headline headings; for the full Annex I list
 * consult Implementing Regulation (EU) 2023/2830 and its amendments.
 */
const HS_CODE_MAPPING: HsMapping[] = [
  // Cattle — live animals, meat, hides, leather (Annex I §§ 1–4)
  { prefix: "0102", commodity: "cattle", description: "Live bovine animals" },
  { prefix: "0201", commodity: "cattle", description: "Meat of bovine animals, fresh or chilled" },
  { prefix: "0202", commodity: "cattle", description: "Meat of bovine animals, frozen" },
  { prefix: "020610", commodity: "cattle", description: "Edible offal of bovine animals, fresh/chilled" },
  { prefix: "020622", commodity: "cattle", description: "Edible offal of bovine animals, frozen" },
  { prefix: "021020", commodity: "cattle", description: "Preserved meat of bovine animals" },
  { prefix: "4101", commodity: "cattle", description: "Raw hides & skins of bovine/equine animals" },
  { prefix: "4102", commodity: "cattle", description: "Raw skins of sheep/lambs" },
  { prefix: "4103", commodity: "cattle", description: "Other raw hides & skins" },
  { prefix: "4104", commodity: "cattle", description: "Tanned/crust bovine leather" },
  { prefix: "4107", commodity: "cattle", description: "Leather further prepared after tanning/crusting" },
  // Cocoa — beans, paste, butter, powder, chocolate (Annex I § 5)
  { prefix: "1801", commodity: "cocoa", description: "Cocoa beans, whole or broken, raw or roasted" },
  { prefix: "1802", commodity: "cocoa", description: "Cocoa shells, husks, skins & other cocoa waste" },
  { prefix: "1803", commodity: "cocoa", description: "Cocoa paste, whether or not defatted" },
  { prefix: "1804", commodity: "cocoa", description: "Cocoa butter, fat & oil" },
  { prefix: "1805", commodity: "cocoa", description: "Cocoa powder, not containing added sugar" },
  { prefix: "1806", commodity: "cocoa", description: "Chocolate & other food preparations containing cocoa" },
  // Coffee — beans, husks, extracts (Annex I § 6)
  { prefix: "0901", commodity: "coffee", description: "Coffee, whether or not roasted/decaffeinated; husks & skins" },
  { prefix: "2101", commodity: "coffee", description: "Extracts, essences & concentrates of coffee" },
  // Oil palm — palm oil & fractions, palm kernel oil, residues (Annex I § 7)
  { prefix: "1511", commodity: "oil_palm", description: "Palm oil & its fractions, crude or refined" },
  { prefix: "151321", commodity: "oil_palm", description: "Palm kernel oil, crude" },
  { prefix: "151329", commodity: "oil_palm", description: "Palm kernel oil, refined" },
  { prefix: "1522", commodity: "oil_palm", description: "Degras & other residues resulting from palm oil processing" },
  { prefix: "230660", commodity: "oil_palm", description: "Palm nuts & kernels, oilcake & other solid residues" },
  // Rubber — natural rubber, balata, gutta-percha (Annex I § 8)
  { prefix: "4001", commodity: "rubber", description: "Natural rubber, balata, gutta-percha & similar natural gums" },
  { prefix: "4002", commodity: "rubber", description: "Synthetic rubber & factice derived from oils (in scope only where blended with ≥ natural rubber; verify origin of natural component)" },
  // Soy — beans, flour, oilcake, oil (Annex I § 9)
  { prefix: "1201", commodity: "soy", description: "Soya beans, whether or not broken" },
  { prefix: "120810", commodity: "soy", description: "Soya bean flour & meal" },
  { prefix: "1507", commodity: "soy", description: "Soya-bean oil & its fractions" },
  { prefix: "230400", commodity: "soy", description: "Soya-bean oilcake & other solid residues" },
  // Wood — logs, sawn wood, panels, pulp, paper, furniture (Annex I § 10)
  { prefix: "4401", commodity: "wood", description: "Fuel wood, in logs, billets, twigs, faggots or similar forms" },
  { prefix: "4402", commodity: "wood", description: "Wood charcoal (including palm nut shells)" },
  { prefix: "4403", commodity: "wood", description: "Wood in the rough, whether or not stripped of bark" },
  { prefix: "4404", commodity: "wood", description: "Hoopwood; split poles; piles, pickets & stakes of wood" },
  { prefix: "4405", commodity: "wood", description: "Wood wool; wood flour" },
  { prefix: "4406", commodity: "wood", description: "Railway or tramway sleepers of wood" },
  { prefix: "4407", commodity: "wood", description: "Wood sawn or chipped lengthwise, sliced or peeled" },
  { prefix: "4408", commodity: "wood", description: "Veneer sheets & sheets for plywood" },
  { prefix: "4409", commodity: "wood", description: "Wood continuously shaped along any edge/end" },
  { prefix: "4410", commodity: "wood", description: "Particle board, OSB & similar board of wood or other ligneous materials" },
  { prefix: "4411", commodity: "wood", description: "Fibreboard of wood or other ligneous materials" },
  { prefix: "4412", commodity: "wood", description: "Plywood, veneered panels & similar laminated wood" },
  { prefix: "4413", commodity: "wood", description: "Densified wood, in blocks, plates, strips or profile shapes" },
  { prefix: "4414", commodity: "wood", description: "Wooden frames for paintings, photographs, mirrors" },
  { prefix: "4415", commodity: "wood", description: "Packing cases, boxes, crates, drums & similar packings of wood" },
  { prefix: "4416", commodity: "wood", description: "Casks, barrels, vats, tubs & other coopers' products of wood" },
  { prefix: "4417", commodity: "wood", description: "Tools, tool bodies, tool handles, broom/boot handles of wood" },
  { prefix: "4418", commodity: "wood", description: "Builders' joinery & carpentry of wood, incl. cellular wood panels" },
  { prefix: "4419", commodity: "wood", description: "Tableware & kitchenware of wood" },
  { prefix: "4420", commodity: "wood", description: "Wood marquetry & inlaid wood; caskets & cases for jewellery/cutlery" },
  { prefix: "4421", commodity: "wood", description: "Other articles of wood" },
  { prefix: "4701", commodity: "wood", description: "Mechanical wood pulp" },
  { prefix: "4702", commodity: "wood", description: "Chemical wood pulp, dissolving grades" },
  { prefix: "4703", commodity: "wood", description: "Chemical wood pulp, soda or sulphate" },
  { prefix: "4704", commodity: "wood", description: "Chemical wood pulp, sulphite, other than dissolving grades" },
  { prefix: "4705", commodity: "wood", description: "Wood pulp obtained by a combination of mechanical & chemical processes" },
  { prefix: "4706", commodity: "wood", description: "Pulps of fibres derived from recovered waste paper & paperboard" },
  { prefix: "940350", commodity: "wood", description: "Wooden furniture of a kind used in the bedroom" },
  { prefix: "940360", commodity: "wood", description: "Other wooden furniture" },
];

/** Deadline: EUDR applies from 30 December 2025 (large operators).
 *  Micro & small enterprises follow from 30 June 2026 — but SGTX enforces
 *  the EARLIER applicable date (2025-12-30) for actual trades, since the
 *  operator's due diligence obligation crystallizes when the trade is
 *  dispatched. */
export const EUDR_APPLICABILITY_DEADLINE = "2025-12-30";

/** Cut-off date: deforestation occurring AFTER this date renders the product
 *  non-compliant, regardless of when the trade occurs. */
export const EUDR_DEFORESTATION_CUTOFF = "2020-12-31";

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export interface EudrDueDiligence {
  ustn: string;
  applicable: boolean;
  commodity: string;
  hsCodesCovered: string[];
  geoLocationsRequired: boolean;
  dueDiligenceStatementRequired: boolean;
  riskLevel: "low" | "medium" | "high";
  conditions: {
    condition_id: string;
    label: string;
    status: "unmet" | "met";
    action_url?: string;
  }[];
  deadline: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Strip any non-digit characters from an HS code (handles "1801.10.00" etc). */
function normalizeHsCode(hsCode: string): string {
  return (hsCode || "").replace(/\D/g, "");
}

/**
 * Resolve the EUDR commodity (and the list of HS prefixes that triggered the
 * match) for a given HS code. Returns `null` if the HS code is not within
 * EUDR scope.
 */
function resolveCommodity(hsCode: string): { commodity: EudrCommodity; matchedPrefixes: string[] } | null {
  const cleaned = normalizeHsCode(hsCode);
  if (cleaned.length < 4) return null;
  const matchedPrefixes: string[] = [];
  let resolvedCommodity: EudrCommodity | null = null;
  for (const mapping of HS_CODE_MAPPING) {
    if (cleaned.startsWith(mapping.prefix)) {
      matchedPrefixes.push(mapping.prefix);
      if (resolvedCommodity === null) {
        resolvedCommodity = mapping.commodity;
      } else if (resolvedCommodity !== mapping.commodity) {
        // Annex I is constructed so each HS heading maps to exactly one
        // commodity; if we hit a conflict, prefer the longer prefix (more
        // specific match).
        const existingIdx = HS_CODE_MAPPING.findIndex((m) => m.commodity === resolvedCommodity && cleaned.startsWith(m.prefix));
        const newIdx = HS_CODE_MAPPING.indexOf(mapping);
        if (mapping.prefix.length > (HS_CODE_MAPPING[existingIdx]?.prefix.length ?? 0)) {
          resolvedCommodity = mapping.commodity;
        }
        void newIdx;
      }
    }
  }
  if (resolvedCommodity === null || matchedPrefixes.length === 0) return null;
  return { commodity: resolvedCommodity, matchedPrefixes };
}

/** Compute the EUDR risk level for an origin country. */
function riskLevelForOrigin(originCountry: string, destCountry: string): "low" | "medium" | "high" {
  const origin = (originCountry || "").toUpperCase().trim();
  if (EUDR_HIGH_RISK_ORIGIN_COUNTRIES.includes(origin)) return "high";
  // EU-domestic origin (intra-EU trade is technically out of EUDR scope, but
  // if the operator re-imports EU-produced commodity for re-export, the risk
  // profile is treated as low).
  if (EUDR_EU_DESTINATION_COUNTRIES.includes(origin) && EUDR_EU_DESTINATION_COUNTRIES.includes(destCountry)) {
    return "low";
  }
  return "medium";
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface EudrAssessmentInput {
  ustn: string;
  hsCode: string;
  destCountry: string;
  originCountry: string;
  /** Operator has collected geo-location data (polygons for plots >4ha;
   *  points for smaller plots) for the production plots. */
  hasGeoLocationData?: boolean;
  /** Operator has submitted the Due Diligence Statement to the EU
   *  Information System and obtained the DDS reference number. */
  hasDueDiligenceStatement?: boolean;
}

/**
 * Assess EUDR (Regulation (EU) 2023/1115) due-diligence obligations for a
 * single trade.
 *
 * The function returns a `EudrDueDiligence` object whose `applicable` flag is
 * `true` iff ALL of:
 *   • destination is an EU member state (the EUDR_EU_DESTINATION_COUNTRIES
 *     list);
 *   • the HS code falls within EUDR Annex I (cattle/cocoa/coffee/oil_palm/
 *     rubber/soy/wood & their derivatives);
 *   • the trade is not intra-EU (intra-EU is out of scope, but flagged with
 *     riskLevel='low' when both origin and destination are EU).
 *
 * When NOT applicable, the returned object still carries the resolved
 * commodity (or `"none"`), risk level, deadline, and an empty conditions list
 * — callers can render the assessment card regardless.
 *
 * Conditions are returned in `status: 'unmet'|'met'` form so they can be
 * surfaced directly in the SGTX compliance UI. The standard conditions are:
 *   • EUDR-GEO  — geo-location data on file for the production plots
 *   • EUDR-DDS  — Due Diligence Statement submitted to EU Information System
 *   • EUDR-DEFOREST — deforestation-free after 2020-12-31 (declared)
 *   • EUDR-LEGALITY — production legal in country of origin (declared)
 * When the trade is not applicable, no conditions are emitted.
 */
export function assessEudr(input: EudrAssessmentInput): EudrDueDiligence {
  const ustn = (input.ustn || "").trim();
  const dest = (input.destCountry || "").toUpperCase().trim();
  const origin = (input.originCountry || "").toUpperCase().trim();
  const hasGeo = input.hasGeoLocationData === true;
  const hasDds = input.hasDueDiligenceStatement === true;

  const resolved = resolveCommodity(input.hsCode);
  const euDestination = EUDR_EU_DESTINATION_COUNTRIES.includes(dest);
  const intraEu = euDestination && EUDR_EU_DESTINATION_COUNTRIES.includes(origin);
  // EUDR applies to imports INTO the EU and exports FROM the EU. Intra-EU
  // trade is out of scope (the placing-on-the-market obligation is at the EU
  // external border). For SGTX purposes we treat intra-EU trades as
  // non-applicable.
  const applicable = euDestination && resolved !== null && !intraEu;

  const riskLevel = riskLevelForOrigin(origin, dest);

  const conditions: EudrDueDiligence["conditions"] = [];
  if (applicable && resolved) {
    // Geo-location data
    conditions.push({
      condition_id: "EUDR-GEO",
      label:
        riskLevel === "high"
          ? "Geo-location polygons on file for ALL production plots (high-risk origin — polygons required regardless of plot size)"
          : "Geo-location data on file (polygons for plots >4 ha; points for plots ≤4 ha)",
      status: hasGeo ? "met" : "unmet",
      action_url: "/portal/seller/compliance/eudr/geo-locations",
    });
    // Due Diligence Statement
    conditions.push({
      condition_id: "EUDR-DDS",
      label: "Due Diligence Statement submitted to the EU Information System (DDS reference obtained)",
      status: hasDds ? "met" : "unmet",
      action_url: "/portal/seller/compliance/eudr/dds",
    });
    // Deforestation-free declaration
    conditions.push({
      condition_id: "EUDR-DEFOREST",
      label: `Production plots deforestation-free after ${EUDR_DEFORESTATION_CUTOFF} (operator declaration + verifiable evidence)`,
      status: "unmet",
      action_url: "/portal/seller/compliance/eudr/deforestation",
    });
    // Legality in country of origin
    conditions.push({
      condition_id: "EUDR-LEGALITY",
      label: `Production legally compliant in country of origin (${origin || "—"}) under applicable land-use, environmental & forest law`,
      status: "unmet",
      action_url: "/portal/seller/compliance/eudr/legality",
    });
    // Heightened due diligence for high-risk origins
    if (riskLevel === "high") {
      conditions.push({
        condition_id: "EUDR-RISK-MITIGATION",
        label: `Heightened due-diligence: third-party risk-mitigation verification required for high-risk origin (${origin})`,
        status: "unmet",
        action_url: "/portal/seller/compliance/eudr/risk-mitigation",
      });
    }
  }

  return {
    ustn,
    applicable,
    commodity: resolved ? resolved.commodity : "none",
    hsCodesCovered: resolved ? resolved.matchedPrefixes : [],
    geoLocationsRequired: applicable,
    dueDiligenceStatementRequired: applicable,
    riskLevel,
    conditions,
    deadline: EUDR_APPLICABILITY_DEADLINE,
  };
}

/**
 * Convenience predicate — does the HS code fall within EUDR Annex I?
 * Useful for upstream trade-validation gates that need a fast boolean check
 * without materializing the full assessment object.
 */
export function isEudrControlledHsCode(hsCode: string): boolean {
  return resolveCommodity(hsCode) !== null;
}

/** Return the list of HS-code prefixes that map to a given EUDR commodity.
 *  Useful for surfacing "products in scope" in UIs. */
export function hsCodesForCommodity(commodity: EudrCommodity): string[] {
  return HS_CODE_MAPPING.filter((m) => m.commodity === commodity).map((m) => m.prefix);
}
