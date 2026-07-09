/**
 * Customs Milestones Engine — Country-Specific Execution-Phase Milestones
 * =======================================================================
 *
 * Every cross-border trade flows through a sequence of customs milestones —
 * filings, status changes, and authority interactions that the SGTX
 * execution engine must track in order. This module produces the FULL,
 * country-specific milestone list for a given lane (origin + destination +
 * transport mode + HS code) so the execution engine can render the
 * milestone tracker, schedule ETA/ETD, and detect blocked or stalled
 * trades.
 *
 * The milestone list includes:
 *   • ORIGIN-side pre-loading milestones (e.g. EG_ACID_ISSUED via Nafeza);
 *   • UNIVERSAL milestones (DEPARTURE, IN_TRANSIT, ARRIVAL, RELEASED,
 *     DELIVERY) — present on every lane, with ETA tuned by transport mode;
 *   • DESTINATION-side pre-arrival milestones (e.g. EU_ENS_FILED,
 *     US_ISF_FILED, JP_AFAX_FILED, AU_AEP_FILED);
 *   • DESTINATION-side clearance milestones (e.g. EU_CUSTOMS_DECLARATION,
 *     US_CUSTOMS_ENTRY, CN_CUSTOMS_DECLARATION);
 *   • DESTINATION-side post-clearance milestones (e.g. EU_CBAM_REPORT for
 *     carbon-intensive imports into the EU).
 *
 * Example (per task spec):
 *   EG → DE, SEA, any HS:
 *     1. EG_ACID_ISSUED        (PRE_LOADING, Nafeza)
 *     2. DEPARTURE             (PRE_LOADING)
 *     3. IN_TRANSIT            (IN_TRANSIT)
 *     4. EU_ENS_FILED_24H_BEFORE_ARRIVAL  (IN_TRANSIT, EU ICS2)
 *     5. ARRIVAL               (PRE_ARRIVAL)
 *     6. EU_CUSTOMS_DECLARATION (CLEARANCE, German Zoll)
 *     7. EU_CBAM_REPORT        (CLEARANCE, EU CBAM authority)
 *     8. RELEASED              (CLEARANCE)
 *     9. DELIVERY              (POST_CLEARANCE)
 *
 * This is a deterministic LOGIC module. No external API calls. Estimated
 * durations are heuristic defaults — actual clearance times vary by port,
 * commodity, and customs broker throughput.
 *
 * SGTX is not a marketplace; this module only describes the milestone
 * sequence. Actual filings are performed via pluggable provider interfaces
 * invoked by the workflow engine in a later phase.
 *
 * References:
 *  - Egyptian Customs Law 207/2020 (ACID via Nafeza).
 *  - EU Regulation (EU) 2019/647 (ICS2 / ENS).
 *  - EU Regulation (EU) 2023/956 (CBAM — Carbon Border Adjustment Mechanism).
 *  - US SAFE Port Act of 2006 + 19 CFR § 149 (ISF 10+2 via CBP).
 *  - China Customs Law art. 24 (Single Window pre-declaration via GACC).
 *  - Saudi ZATCA — FASAH platform.
 *  - Dubai Customs — Dubai Trade portal.
 *  - Japan Customs — AFAX for air freight.
 *  - Australian Border Force + DAFF — biosecurity pre-arrival (AEP).
 *  - Brazil Siscomex.
 *  - India Customs — ICEGATE.
 *  - Turkey Ministry of Trade — TekSig Single Window.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Country sets
// ─────────────────────────────────────────────────────────────────────────────

/** EU member states — for ENS (Entry Summary Declaration) and CBAM milestones. */
const EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Transport modes (canonical tokens)
// ─────────────────────────────────────────────────────────────────────────────

export type CustomsTransportMode =
  | "SEA"
  | "AIR"
  | "ROAD"
  | "RAIL"
  | "INLAND_WATER"
  | "MULTIMODAL";

/** Normalize a free-form transport-mode string to a canonical token. */
function normalizeTransportMode(mode: string): CustomsTransportMode {
  const m = (mode || "").toUpperCase().trim().replace(/[\s-]+/g, "_");
  switch (m) {
    case "SEA":
    case "OCEAN":
    case "VESSEL":
    case "MARITIME":
      return "SEA";
    case "AIR":
    case "AIR_FREIGHT":
    case "AIRFREIGHT":
      return "AIR";
    case "ROAD":
    case "TRUCK":
    case "ROAD_FREIGHT":
      return "ROAD";
    case "RAIL":
    case "TRAIN":
      return "RAIL";
    case "INLAND_WATER":
    case "BARGE":
    case "RIVER":
      return "INLAND_WATER";
    case "MULTIMODAL":
    case "MULTI":
      return "MULTIMODAL";
    default:
      return "SEA";
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export type CustomsMilestonePhase =
  | "PRE_LOADING"
  | "IN_TRANSIT"
  | "PRE_ARRIVAL"
  | "CLEARANCE"
  | "POST_CLEARANCE";

export interface CustomsMilestone {
  /** Canonical milestone code, e.g. "EG_ACID_ISSUED" | "EU_ENS_FILED" |
   *  "US_ISF_FILED" | "DEPARTURE" | "IN_TRANSIT" | "ARRIVAL" |
   *  "EU_CUSTOMS_DECLARATION" | "EU_CBAM_REPORT" | "RELEASED" |
   *  "DELIVERY" | etc. */
  milestone: string;
  /** Human-readable name, e.g. "ACID Issued by Nafeza". */
  name: string;
  /** Country that owns the milestone (ISO 3166-1 alpha-2). For universal
   *  milestones (DEPARTURE/IN_TRANSIT/ARRIVAL/RELEASED/DELIVERY) the country
   *  is set to the origin or destination country as appropriate. */
  country: string;
  /** Workflow phase in which the milestone occurs. */
  phase: CustomsMilestonePhase;
  /** Whether the milestone is mandatory for the trade to proceed. */
  mandatory: boolean;
  /** Heuristic estimated duration, in hours, that the milestone typically
   *  takes from the time the preceding milestone is completed. */
  estimatedDurationHours: number;
  /** Regulatory authority that owns the milestone, e.g. "Nafeza", "CBP". */
  authority: string;
}

export interface CustomsMilestoneResult {
  ustn: string;
  originCountry: string;
  destCountry: string;
  milestones: CustomsMilestone[];
}

// ─────────────────────────────────────────────────────────────────────────────
// CBAM HS-code detection (Regulation (EU) 2023/956 — Annex I)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * CBAM covers imports into the EU of:
 *   • cement (HS 2523);
 *   • iron & steel (HS 72, 73 — selected headings);
 *   • aluminium (HS 76);
 *   • fertilisers (HS 28, 31 — selected headings);
 *   • electricity (HS 2716);
 *   • hydrogen (HS 2804 10).
 *
 * During the transitional period (2023-10-01 to 2025-12-31), importers must
 * file quarterly CBAM reports. From 2026, CBAM certificates must be
 * surrendered before release.
 */
const CBAM_HS_PREFIXES: ReadonlyArray<string> = [
  "2523",       // cement
  "7201", "7202", "7203", "7204", "7205", "7206", "7207", "7208", "7209",
  "7210", "7211", "7212", "7213", "7214", "7215", "7216", "7217", "7218",
  "7219", "7220", "7221", "7222", "7223", "7224", "7225", "7226", "7227",
  "7228", "7229", // iron & steel (HS 72)
  "7301", "7302", "7303", "7304", "7305", "7306", "7307", "7308", "7309",
  "7310", "7311", "7312", "7313", "7314", "7315", "7316", "7317", "7318",
  "7319", "7320", "7321", "7322", "7323", "7324", "7325", "7326", // HS 73
  "280410",     // hydrogen
  "2716",       // electricity
  "2814",       // ammonia (fertiliser precursor)
  "3102", "3103", "3104", "3105", // fertilisers (HS 31)
  "7601", "7602", "7603", "7604", "7605", "7606", "7607", "7608", "7609",
  "7610", "7611", "7612", "7613", "7614", "7615", "7616", // aluminium (HS 76)
];

/** Returns true if the HS code falls within the CBAM scope. */
export function isCbamHsCode(hsCode: string): boolean {
  const cleaned = (hsCode || "").replace(/\D/g, "");
  if (cleaned.length < 4) return false;
  return CBAM_HS_PREFIXES.some((p) => cleaned.startsWith(p));
}

// ─────────────────────────────────────────────────────────────────────────────
// Universal milestones (present on every lane)
// ─────────────────────────────────────────────────────────────────────────────

/** Estimated transit duration (hours) by transport mode. Heuristic. */
function transitDurationHours(mode: CustomsTransportMode): number {
  switch (mode) {
    case "AIR":
      return 48;            // 2 days (incl. ground handling)
    case "ROAD":
      return 96;            // 4 days
    case "RAIL":
      return 168;           // 7 days
    case "INLAND_WATER":
      return 240;           // 10 days
    case "SEA":
    case "MULTIMODAL":
    default:
      return 336;           // 14 days (typical short-to-medium SEA lane)
  }
}

interface UniversalMilestoneSpec {
  code: string;
  name: string;
  phase: CustomsMilestonePhase;
  durationHours: number;
  /** Position within the phase. Used to place the universal milestone
   *  relative to country-specific milestones within the same phase.
   *  - Universal PRE_LOADING boundary (DEPARTURE)        → 90 (after origin-side filings at 10)
   *  - Universal IN_TRANSIT marker                       → 10 (before ENS at 20)
   *  - Universal PRE_ARRIVAL boundary (ARRIVAL)          → 90 (after pre-arrival filings at 10)
   *  - Universal CLEARANCE marker (RELEASED)             → 90 (after customs declarations at 10–50)
   *  - Universal POST_CLEARANCE boundary (DELIVERY)      → 90 (after post-clearance filings at 10) */
  position: number;
  /** Resolver: given origin/dest/transport mode, return the country + authority
   *  to attach to this milestone. */
  resolve: (ctx: { origin: string; dest: string; mode: CustomsTransportMode }) =>
    { country: string; authority: string };
}

const UNIVERSAL_MILESTONES: UniversalMilestoneSpec[] = [
  {
    code: "DEPARTURE",
    name: "Vessel / conveyance departed origin port",
    phase: "PRE_LOADING",
    durationHours: 2,
    position: 90,
    resolve: (ctx) => ({ country: ctx.origin, authority: "Carrier" }),
  },
  {
    code: "IN_TRANSIT",
    name: "Conveyance in transit",
    phase: "IN_TRANSIT",
    durationHours: 0, // overridden per-call with transitDurationHours(mode)
    position: 10,
    resolve: (ctx) => ({ country: ctx.origin, authority: "Carrier" }),
  },
  {
    code: "ARRIVAL",
    name: "Conveyance arrived at destination port",
    phase: "PRE_ARRIVAL",
    durationHours: 4,
    position: 90,
    resolve: (ctx) => ({ country: ctx.dest, authority: "Terminal operator" }),
  },
  {
    code: "RELEASED",
    name: "Customs release — goods free to circulate",
    phase: "CLEARANCE",
    durationHours: 24,
    position: 90,
    resolve: (ctx) => ({ country: ctx.dest, authority: "Destination customs" }),
  },
  {
    code: "DELIVERY",
    name: "Final delivery to consignee",
    phase: "POST_CLEARANCE",
    durationHours: 4,
    position: 90,
    resolve: (ctx) => ({ country: ctx.dest, authority: "Last-mile carrier" }),
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Country-specific milestone builders
// ─────────────────────────────────────────────────────────────────────────────

interface CountryMilestoneSpec {
  code: string;
  name: string;
  phase: CustomsMilestonePhase;
  durationHours: number;
  authority: string;
  /** Position within the phase. Origin-side PRE_LOADING filings use 10;
   *  destination-side IN_TRANSIT filings (e.g. ENS) use 20 (after the
   *  universal IN_TRANSIT marker at 10); PRE_ARRIVAL filings use 10 (before
   *  the universal ARRIVAL at 90); CLEARANCE filings use 10–50 (before the
   *  universal RELEASED at 90); POST_CLEARANCE filings use 10 (before the
   *  universal DELIVERY at 90). */
  position: number;
  /** Predicate — does this milestone apply to the lane? */
  applies: (ctx: {
    origin: string;
    dest: string;
    mode: CustomsTransportMode;
    hsCode: string;
  }) => boolean;
  /** Which country this milestone attaches to (origin or dest). */
  countryFor: (ctx: {
    origin: string;
    dest: string;
  }) => string;
}

const COUNTRY_MILESTONES: CountryMilestoneSpec[] = [
  // ── Egypt origin (ACID) ─────────────────────────────────────────────────
  {
    code: "EG_ACID_ISSUED",
    name: "ACID issued by Nafeza",
    phase: "PRE_LOADING",
    durationHours: 4,
    authority: "Nafeza",
    position: 10,
    applies: (ctx) => ctx.origin === "EG",
    countryFor: (ctx) => ctx.origin,
  },

  // ── EU destination (ENS + CBAM) ─────────────────────────────────────────
  {
    code: "EU_ENS_FILED_24H_BEFORE_ARRIVAL",
    name: "ENS filed via EU ICS2 (24h before arrival)",
    phase: "IN_TRANSIT",
    durationHours: 1,
    authority: "EU ICS2",
    position: 20,
    applies: (ctx) => EU_COUNTRIES.has(ctx.dest),
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "EU_CUSTOMS_DECLARATION",
    name: "EU customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 8,
    authority: "National customs authority",
    position: 10,
    applies: (ctx) => EU_COUNTRIES.has(ctx.dest),
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "EU_CBAM_REPORT",
    name: "CBAM report filed (carbon-intensive goods)",
    phase: "CLEARANCE",
    durationHours: 4,
    authority: "EU CBAM authority",
    position: 20,
    applies: (ctx) => EU_COUNTRIES.has(ctx.dest) && isCbamHsCode(ctx.hsCode),
    countryFor: (ctx) => ctx.dest,
  },

  // ── US destination (ISF + customs entry) ────────────────────────────────
  {
    code: "US_ISF_FILED",
    name: "ISF 10+2 filed with CBP",
    phase: "IN_TRANSIT",
    durationHours: 1,
    authority: "CBP",
    position: 20,
    applies: (ctx) => ctx.dest === "US" && ctx.mode === "SEA",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "US_CUSTOMS_ENTRY",
    name: "CBP customs entry filed",
    phase: "CLEARANCE",
    durationHours: 8,
    authority: "CBP",
    position: 10,
    applies: (ctx) => ctx.dest === "US",
    countryFor: (ctx) => ctx.dest,
  },

  // ── China destination (pre-declaration + clearance) ──────────────────────
  {
    code: "CN_PRE_DECLARATION",
    name: "China Single Window pre-declaration filed (GACC)",
    phase: "PRE_ARRIVAL",
    durationHours: 2,
    authority: "GACC",
    position: 10,
    applies: (ctx) => ctx.dest === "CN",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "CN_CUSTOMS_DECLARATION",
    name: "China customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 8,
    authority: "GACC",
    position: 10,
    applies: (ctx) => ctx.dest === "CN",
    countryFor: (ctx) => ctx.dest,
  },

  // ── Saudi destination (FASAH + ZATCA clearance) ─────────────────────────
  {
    code: "SA_FASAH_PRE_ARRIVAL",
    name: "FASAH pre-arrival declaration filed",
    phase: "PRE_ARRIVAL",
    durationHours: 2,
    authority: "FASAH / ZATCA",
    position: 10,
    applies: (ctx) => ctx.dest === "SA",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "SA_CUSTOMS_DECLARATION",
    name: "ZATCA customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 6,
    authority: "ZATCA",
    position: 10,
    applies: (ctx) => ctx.dest === "SA",
    countryFor: (ctx) => ctx.dest,
  },

  // ── UAE destination (Dubai Trade + FCA clearance) ────────────────────────
  {
    code: "AE_DUBAI_TRADE_PRE_ARRIVAL",
    name: "Dubai Trade pre-arrival declaration filed",
    phase: "PRE_ARRIVAL",
    durationHours: 2,
    authority: "Dubai Customs",
    position: 10,
    applies: (ctx) => ctx.dest === "AE",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "AE_CUSTOMS_DECLARATION",
    name: "UAE Federal Customs Authority declaration lodged",
    phase: "CLEARANCE",
    durationHours: 6,
    authority: "UAE FCA / Dubai Customs",
    position: 10,
    applies: (ctx) => ctx.dest === "AE",
    countryFor: (ctx) => ctx.dest,
  },

  // ── Japan destination (AFAX for air freight) ────────────────────────────
  {
    code: "JP_AFAX_FILED",
    name: "AFAX filed with Japan Customs (air freight)",
    phase: "PRE_ARRIVAL",
    durationHours: 1,
    authority: "Japan Customs",
    position: 10,
    applies: (ctx) => ctx.dest === "JP" && ctx.mode === "AIR",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "JP_AFR_FILED",
    name: "AFR (Advance Filing Rules) filed with Japan Customs (sea freight)",
    phase: "IN_TRANSIT",
    durationHours: 1,
    authority: "Japan Customs",
    position: 20,
    applies: (ctx) => ctx.dest === "JP" && ctx.mode === "SEA",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "JP_CUSTOMS_DECLARATION",
    name: "Japan customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 6,
    authority: "Japan Customs",
    position: 10,
    applies: (ctx) => ctx.dest === "JP",
    countryFor: (ctx) => ctx.dest,
  },

  // ── Australia destination (biosecurity + ABF clearance) ──────────────────
  {
    code: "AU_AEP_FILED",
    name: "Biosecurity pre-arrival (AEP) filed with DAFF",
    phase: "PRE_ARRIVAL",
    durationHours: 1,
    authority: "DAFF",
    position: 10,
    applies: (ctx) => ctx.dest === "AU",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "AU_BIOSECURITY_INSPECTION",
    name: "DAFF biosecurity inspection completed",
    phase: "CLEARANCE",
    durationHours: 4,
    authority: "DAFF",
    position: 10,
    applies: (ctx) => ctx.dest === "AU",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "AU_CUSTOMS_DECLARATION",
    name: "ABF customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 6,
    authority: "ABF",
    position: 20,
    applies: (ctx) => ctx.dest === "AU",
    countryFor: (ctx) => ctx.dest,
  },

  // ── Brazil destination (Siscomex) ───────────────────────────────────────
  {
    code: "BR_SISCOMEX_PRE_SHIPMENT",
    name: "Siscomex pre-shipment declaration filed",
    phase: "PRE_LOADING",
    durationHours: 2,
    authority: "Siscomex / Receita Federal",
    position: 80, // destination-side PRE_LOADING, just before DEPARTURE (90)
    applies: (ctx) => ctx.dest === "BR",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "BR_CUSTOMS_DECLARATION",
    name: "Siscomex customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 8,
    authority: "Siscomex / Receita Federal",
    position: 10,
    applies: (ctx) => ctx.dest === "BR",
    countryFor: (ctx) => ctx.dest,
  },

  // ── India destination (ICEGATE) ─────────────────────────────────────────
  {
    code: "IN_ICEGATE_PRE_ARRIVAL",
    name: "ICEGATE pre-arrival declaration filed",
    phase: "PRE_ARRIVAL",
    durationHours: 2,
    authority: "ICEGATE / CBIC",
    position: 10,
    applies: (ctx) => ctx.dest === "IN",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "IN_CUSTOMS_DECLARATION",
    name: "ICEGATE customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 8,
    authority: "ICEGATE / CBIC",
    position: 10,
    applies: (ctx) => ctx.dest === "IN",
    countryFor: (ctx) => ctx.dest,
  },

  // ── Turkey destination (TekSig) ─────────────────────────────────────────
  {
    code: "TR_TEKSIG_PRE_ARRIVAL",
    name: "TekSig (Turkey Single Window) pre-arrival filed",
    phase: "PRE_ARRIVAL",
    durationHours: 2,
    authority: "Turkey Ministry of Trade",
    position: 10,
    applies: (ctx) => ctx.dest === "TR",
    countryFor: (ctx) => ctx.dest,
  },
  {
    code: "TR_CUSTOMS_DECLARATION",
    name: "Turkey customs declaration lodged",
    phase: "CLEARANCE",
    durationHours: 6,
    authority: "Turkey Customs",
    position: 10,
    applies: (ctx) => ctx.dest === "TR",
    countryFor: (ctx) => ctx.dest,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Milestone ordering — phase order, with intra-phase ordering preserved by
// the order in which the milestones were added to the list.
// ─────────────────────────────────────────────────────────────────────────────

const PHASE_ORDER: Record<CustomsMilestonePhase, number> = {
  PRE_LOADING: 0,
  IN_TRANSIT: 1,
  PRE_ARRIVAL: 2,
  CLEARANCE: 3,
  POST_CLEARANCE: 4,
};

/**
 * Lookup: milestone code → within-phase position. Built at module init from
 * the UNIVERSAL_MILESTONES and COUNTRY_MILESTONES specs. Used to stable-sort
 * the milestone list so that country-specific filings land at the correct
 * position relative to the universal phase-boundary markers within the same
 * phase.
 */
const MILESTONE_POSITION: ReadonlyMap<string, number> = (() => {
  const map = new Map<string, number>();
  for (const spec of UNIVERSAL_MILESTONES) map.set(spec.code, spec.position);
  for (const spec of COUNTRY_MILESTONES) map.set(spec.code, spec.position);
  return map;
})();

/** Resolve the within-phase position for a milestone code (defaults to 50 if
 *  not registered — placed in the middle of the phase). */
function milestonePosition(code: string): number {
  return MILESTONE_POSITION.get(code) ?? 50;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface CustomsMilestoneInput {
  originCountry: string;
  destCountry: string;
  transportMode: string;
  hsCode: string;
  ustn?: string;
}

/**
 * Generate the full, country-specific customs milestone list for the given
 * lane.
 *
 * The list is composed of:
 *   1. ORIGIN-side country-specific milestones (e.g. EG_ACID_ISSUED);
 *   2. UNIVERSAL milestones (DEPARTURE, IN_TRANSIT, ARRIVAL, RELEASED,
 *      DELIVERY) with ETA tuned by transport mode;
 *   3. DESTINATION-side country-specific milestones (pre-arrival filings,
 *      customs declarations, post-clearance filings like EU CBAM).
 *
 * The list is ordered by phase (PRE_LOADING → IN_TRANSIT → PRE_ARRIVAL →
 * CLEARANCE → POST_CLEARANCE) and within each phase the milestones preserve
 * their natural insertion order (origin-side → universal → destination-side).
 *
 * Universal milestones are always present; country-specific milestones are
 * included only when the rule's `applies()` predicate returns true.
 */
export function getCustomsMilestones(input: CustomsMilestoneInput): CustomsMilestoneResult {
  const origin = (input.originCountry || "").toUpperCase().trim();
  const dest = (input.destCountry || "").toUpperCase().trim();
  const mode = normalizeTransportMode(input.transportMode);
  const hsCode = (input.hsCode || "").trim();
  const ustn = (input.ustn || "").trim();

  const ctx = { origin, dest, mode, hsCode };

  const milestones: CustomsMilestone[] = [];

  // ── 1. Origin-side country-specific milestones (PRE_LOADING phase) ──────
  for (const spec of COUNTRY_MILESTONES) {
    if (spec.countryFor(ctx) !== origin) continue;
    if (!spec.applies(ctx)) continue;
    milestones.push({
      milestone: spec.code,
      name: spec.name,
      country: spec.countryFor(ctx),
      phase: spec.phase,
      mandatory: true,
      estimatedDurationHours: spec.durationHours,
      authority: spec.authority,
    });
  }

  // ── 2. Universal milestones ────────────────────────────────────────────
  for (const spec of UNIVERSAL_MILESTONES) {
    const { country, authority } = spec.resolve({ origin, dest, mode });
    const duration =
      spec.code === "IN_TRANSIT" ? transitDurationHours(mode) : spec.durationHours;
    milestones.push({
      milestone: spec.code,
      name: spec.name,
      country,
      phase: spec.phase,
      mandatory: true,
      estimatedDurationHours: duration,
      authority,
    });
  }

  // ── 3. Destination-side country-specific milestones ────────────────────
  // Insert each destination milestone at the position that preserves phase
  // order. We sort the final list by phase + insertion order at the end, so
  // we just append here and let the sort fix the order.
  for (const spec of COUNTRY_MILESTONES) {
    if (spec.countryFor(ctx) === origin) continue;   // skip origin-side (already added)
    if (!spec.applies(ctx)) continue;
    milestones.push({
      milestone: spec.code,
      name: spec.name,
      country: spec.countryFor(ctx),
      phase: spec.phase,
      mandatory: true,
      estimatedDurationHours: spec.durationHours,
      authority: spec.authority,
    });
  }

  // Stable-sort by (phase, position, insertion index).
  //
  // The `position` field (defined per spec above) gives each milestone a
  // within-phase ordinal that places country-specific filings at the
  // correct position relative to the universal phase-boundary markers:
  //   • Origin-side PRE_LOADING filings (position=10) → before DEPARTURE (90)
  //   • Destination-side IN_TRANSIT filings like EU_ENS (position=20)
  //     → after the universal IN_TRANSIT marker (10)
  //   • PRE_ARRIVAL filings (position=10) → before ARRIVAL (90)
  //   • CLEARANCE filings (positions 10–50) → before RELEASED (90)
  //   • POST_CLEARANCE filings (position=10) → before DELIVERY (90)
  //
  // This reproduces the example in the task brief:
  //   EG→DE SEA: EG_ACID_ISSUED → DEPARTURE → IN_TRANSIT →
  //              EU_ENS_FILED_24H_BEFORE_ARRIVAL → ARRIVAL →
  //              EU_CUSTOMS_DECLARATION → EU_CBAM_REPORT → RELEASED → DELIVERY
  const indexed = milestones.map((m) => ({ m, pos: milestonePosition(m.milestone), i: 0 }));
  // Re-derive insertion index AFTER mapping so it reflects the final order
  // in the milestones array (otherwise the insertion index is the same for
  // every milestone, which defeats the stable-sort tiebreaker).
  for (let i = 0; i < indexed.length; i++) indexed[i].i = i;
  indexed.sort((a, b) => {
    const pa = PHASE_ORDER[a.m.phase];
    const pb = PHASE_ORDER[b.m.phase];
    if (pa !== pb) return pa - pb;
    if (a.pos !== b.pos) return a.pos - b.pos;
    return a.i - b.i;
  });

  return {
    ustn,
    originCountry: origin,
    destCountry: dest,
    milestones: indexed.map((x) => x.m),
  };
}

/**
 * Convenience: total estimated end-to-end duration (hours) for the lane,
 * computed as the sum of all milestone estimated durations. Useful for
 * ETA computation in the execution engine.
 */
export function totalEstimatedDurationHours(input: CustomsMilestoneInput): number {
  return getCustomsMilestones(input).milestones.reduce(
    (sum, m) => sum + m.estimatedDurationHours,
    0,
  );
}
