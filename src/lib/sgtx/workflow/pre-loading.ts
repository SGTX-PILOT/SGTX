/**
 * Pre-Loading Requirements Engine — Country-Specific Mandatory Filings
 * ====================================================================
 *
 * Most customs jurisdictions require the carrier / importer / freight
 * forwarder to file a cargo declaration BEFORE the goods are loaded onto the
 * outbound conveyance (or, in some jurisdictions, before the conveyance
 * arrives at the destination port/airport). These are known as
 * "pre-loading" (or "pre-arrival") declarations and are a hard blocker for
 * loading / vessel departure if not filed by their statutory deadline.
 *
 * SGTX is NOT a marketplace and does NOT submit these declarations on behalf
 * of the trader. This module is a LOGIC module that, given a lane (origin +
 * destination + transport mode), determines WHICH pre-loading steps are
 * mandatory, against WHICH authority they must be filed, by WHEN, and tracks
 * the requirement status. The actual filing is performed via a pluggable
 * provider interface (see `PreLoadingFilingProvider` below) that the SGTX
 * governor / workflow engine can invoke in a later phase — never inline, and
 * never with a real external API call from this module.
 *
 * Country rules implemented (per task brief):
 *   • Egypt origin        — ACID via Nafeza (Advance Cargo Information
 *                            Declaration), mandatory before loading.
 *   • EU destination      — ENS (Entry Summary Declaration) via EU ICS2,
 *                            mandatory 24h before loading for SEA.
 *   • US destination      — ISF 10+2 (Importer Security Filing) via CBP,
 *                            mandatory 24h before vessel loading (SEA only).
 *   • China destination   — Pre-declaration via China Single Window (GACC),
 *                            mandatory before arrival.
 *   • Saudi destination   — FASAH pre-arrival, mandatory 48h before arrival.
 *   • UAE destination     — Dubai Trade pre-arrival, mandatory 24h before
 *                            arrival.
 *   • Japan destination   — AFAX (Advance Filing rules for Air eXpress),
 *                            mandatory for AIR freight.
 *   • Australia dest.     — AEP (Advanced Electronic Presentation /
 *                            biosecurity pre-arrival), mandatory.
 *   • Brazil destination  — Siscomex pre-shipment, mandatory.
 *   • India destination   — ICEGATE pre-arrival, mandatory.
 *   • Turkey destination  — TekSig pre-arrival, mandatory.
 *
 * Each applicable step is returned with `status = "REQUIRED"` and a mock
 * filing reference (e.g. `ACID8392017465`) so downstream workflow phases can
 * track the requirement without performing a real filing. The mock reference
 * is replaced by the actual authority's transaction ID once a pluggable
 * provider files the declaration.
 *
 * This module is deterministic & self-contained. No external network calls.
 *
 * References:
 *  - Egyptian Customs Law 207/2020 + Nafeza ACID operational manual.
 *  - EU Regulation (EU) 2019/647 (ICS2) — Entry Summary Declaration.
 *  - US SAFE Port Act of 2006 + 19 CFR § 149 (ISF 10+2).
 *  - China Customs Law art. 24 — pre-declaration via Single Window.
 *  - Saudi Zakat, Tax & Customs Authority — FASAH platform.
 *  - Dubai Customs — Dubai Trade portal.
 *  - Japan Customs — Act on Customs (AFAX / AFR for AIR & SEA).
 *  - Australian Border Force — Department of Agriculture, Fisheries &
 *    Forestry (DAFF) biosecurity pre-arrival.
 *  - Brazil Siscomex — integrated foreign-trade system.
 *  - India Customs — ICEGATE (Indian Customs EDI System).
 *  - Turkey Ministry of Trade — TekSig (Single Window).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Country sets
// ─────────────────────────────────────────────────────────────────────────────

/**
 * EU member states — used to test the ENS (Entry Summary Declaration) rule on
 * import into any EU country. Local copy (same list used by EUDR/CBAM) so the
 * pre-loading module does not pull in unrelated dependencies.
 */
export const PRE_LOADING_EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

/** Arab League member states — informational; used for future expansion of
 *  mutual-recognition pre-loading rules (e.g., GAFTA Arab Free Trade Area). */
export const ARAB_LEAGUE_COUNTRIES: ReadonlySet<string> = new Set([
  "EG", "DZ", "BH", "KM", "DJ", "IQ", "JO", "KW", "LB", "LY", "MR", "MA",
  "OM", "PS", "QA", "SA", "SO", "SD", "SY", "TN", "AE", "YE",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Transport modes (canonical tokens used across the SGTX workflow engine)
// ─────────────────────────────────────────────────────────────────────────────

export type PreLoadingTransportMode =
  | "SEA"
  | "AIR"
  | "ROAD"
  | "RAIL"
  | "INLAND_WATER"
  | "MULTIMODAL";

/** Normalize a free-form transport-mode string to a canonical token. */
function normalizeTransportMode(mode: string): PreLoadingTransportMode {
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
      return "SEA"; // default to the most common mode for cross-border freight
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export type PreLoadingStepKind =
  | "ACID"
  | "ENS"
  | "ISF"
  | "PRE_DECLARATION"
  | "SAD"
  | "FASAH"
  | "DUBAI_TRADE"
  | "AFAX"
  | "AEP"
  | "SISCOMEX"
  | "ICEGATE"
  | "TEKSIG";

export interface PreLoadingStep {
  /** Canonical step kind, e.g. "ACID" | "ENS" | "ISF" | "PRE_DECLARATION" |
   *  "SAD" | etc. */
  step: string;
  /** Human-readable name, e.g. "Advance Cargo Information Declaration". */
  name: string;
  /** Country that requires the step (origin or destination, depending on
   *  which authority the filing is made with). ISO 3166-1 alpha-2. */
  country: string;
  /** Whether this step is mandatory for the given lane. (Almost always true;
   *  exposed so callers can override for special regimes like FTZ / in-transit
   *  moves where some steps are waived.) */
  mandatory: boolean;
  /** Human-readable deadline description, e.g. "24h before loading". */
  deadline: string;
  /** Current status of the step. */
  status: "REQUIRED" | "COMPLETED" | "WAIVED" | "NOT_APPLICABLE";
  /** Mock filing reference assigned by this engine, replaced by the real
   *  authority transaction ID when a pluggable provider actually files. */
  filingReference?: string;
  /** Regulatory authority that owns the filing, e.g. "Nafeza", "CBP". */
  authority: string;
}

export interface PreLoadingResult {
  ustn: string;
  originCountry: string;
  destCountry: string;
  transportMode: string;
  steps: PreLoadingStep[];
  /** True iff every mandatory step is COMPLETED or WAIVED. */
  allCompleted: boolean;
  /** Mandatory steps that are NOT yet COMPLETED/WAIVED — i.e. they block
   *  loading. Empty when the trade is ready to load. */
  blockingSteps: PreLoadingStep[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pluggable provider interface (NOT used by assessPreLoading — wired by the
// workflow engine in a later phase)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A `PreLoadingFilingProvider` knows how to actually file a single
 * pre-loading declaration against the relevant authority (Nafeza, CBP, EU
 * ICS2, etc.). Implementations are responsible for their own I/O, retries,
 * idempotency, and rate-limiting. SGTX is not a marketplace — this provider
 * is invoked by the workflow engine in a controlled, sandboxed phase, never
 * inline from the rules module.
 *
 * Until a provider is wired, the engine records the requirement with a mock
 * filing reference (`filingReference`) and `status = "REQUIRED"`.
 */
export interface PreLoadingFilingProvider {
  /** Step kinds this provider can file, e.g. ["ACID"] or ["ENS","SAD"]. */
  readonly supportedSteps: ReadonlyArray<PreLoadingStepKind>;
  /**
   * File the declaration. Implementations MUST be idempotent on
   * `filingReference` (re-filing with the same ref returns the existing
   * authority transaction ID). Returns the authority's transaction ID on
   * success.
   */
  file(input: {
    ustn: string;
    step: PreLoadingStepKind;
    country: string;
    filingReference: string;
    transportMode: PreLoadingTransportMode;
    hsCode: string;
  }): Promise<{ authorityTransactionId: string; filedAt: string }>;
}

/** Provider registry — keyed by step kind. The workflow engine calls
 *  `registerPreLoadingProvider` at boot to inject provider implementations. */
const PROVIDER_REGISTRY: Partial<Record<PreLoadingStepKind, PreLoadingFilingProvider>> = {};

export function registerPreLoadingProvider(provider: PreLoadingFilingProvider): void {
  for (const step of provider.supportedSteps) {
    PROVIDER_REGISTRY[step] = provider;
  }
}

/** Test-only: clear the provider registry between unit tests. */
export function __clearPreLoadingProvidersForTest(): void {
  for (const k of Object.keys(PROVIDER_REGISTRY)) {
    delete PROVIDER_REGISTRY[k as PreLoadingStepKind];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock reference generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a mock filing reference of the form `<PREFIX><random10>`.
 *
 * The reference is consumed by downstream workflow phases as a stable
 * identifier for the requirement (so the same step on the same USTN always
 * resolves to the same mock ref within a single `assessPreLoading` call).
 * When a real provider is wired, the provider replaces this mock ref with
 * the authority's actual transaction ID.
 *
 * The 10-digit random suffix is generated with `Math.random()` — this is a
 * mock, not a security primitive.
 */
export function mockFilingReference(prefix: string): string {
  let n = "";
  for (let i = 0; i < 10; i++) {
    n += Math.floor(Math.random() * 10).toString();
  }
  return `${prefix}${n}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rule definitions — each rule is a pure function from lane context to an
// optional PreLoadingStep (or null if the rule does not apply).
// ─────────────────────────────────────────────────────────────────────────────

interface RuleContext {
  ustn: string;
  originCountry: string;
  destCountry: string;
  transportMode: PreLoadingTransportMode;
  hsCode: string;
}

interface PreLoadingRule {
  /** Canonical step kind that this rule emits. */
  kind: PreLoadingStepKind;
  /** Human-readable name of the declaration. */
  name: string;
  /** The authority that owns the filing. */
  authority: string;
  /** The default deadline description. Rules may override per-context. */
  deadline: string;
  /** Predicate — does this rule apply to the given lane? */
  applies(ctx: RuleContext): boolean;
  /** Resolve the country that the filing is made with (origin or dest). */
  country(ctx: RuleContext): string;
  /** Optional override for the deadline based on lane context. */
  resolveDeadline?(ctx: RuleContext): string;
}

/** Helper — convert a RuleContext + rule into a fully-populated PreLoadingStep. */
function buildStep(rule: PreLoadingRule, ctx: RuleContext): PreLoadingStep {
  const deadline = rule.resolveDeadline ? rule.resolveDeadline(ctx) : rule.deadline;
  return {
    step: rule.kind,
    name: rule.name,
    country: rule.country(ctx),
    mandatory: true,
    deadline,
    status: "REQUIRED",
    filingReference: mockFilingReference(rule.kind),
    authority: rule.authority,
  };
}

const RULES: PreLoadingRule[] = [
  // ── Egypt origin ──────────────────────────────────────────────────────────
  {
    kind: "ACID",
    name: "Advance Cargo Information Declaration (ACID)",
    authority: "Nafeza",
    deadline: "before loading",
    applies: (ctx) => ctx.originCountry === "EG",
    country: (ctx) => ctx.originCountry,
  },
  // ── EU destination ────────────────────────────────────────────────────────
  {
    kind: "ENS",
    name: "Entry Summary Declaration (ENS) — EU ICS2",
    authority: "EU ICS2",
    deadline: "24h before loading (SEA)",
    applies: (ctx) => PRE_LOADING_EU_COUNTRIES.has(ctx.destCountry),
    country: (ctx) => ctx.destCountry,
    resolveDeadline: (ctx) => {
      // ICS2 phasing: SEA → 24h before loading; AIR → ENS on the AWB at
      // departure; ROAD/RAIL → at entry. We surface the SEA default per
      // the task spec but specialise the copy for non-SEA modes.
      switch (ctx.transportMode) {
        case "AIR":
          return "at departure (AIR — ICS2 Phase 3, freight forwarder filing)";
        case "ROAD":
        case "RAIL":
        case "INLAND_WATER":
          return "at entry into EU customs territory";
        default:
          return "24h before loading (SEA)";
      }
    },
  },
  // ── US destination ────────────────────────────────────────────────────────
  {
    kind: "ISF",
    name: "Importer Security Filing (ISF 10+2)",
    authority: "CBP",
    deadline: "24h before vessel loading (SEA only)",
    applies: (ctx) =>
      ctx.destCountry === "US" && ctx.transportMode === "SEA",
    country: () => "US",
  },
  // ── China destination ─────────────────────────────────────────────────────
  {
    kind: "PRE_DECLARATION",
    name: "China Single Window pre-declaration (GACC)",
    authority: "GACC",
    deadline: "before arrival",
    applies: (ctx) => ctx.destCountry === "CN",
    country: () => "CN",
  },
  // ── Saudi destination ─────────────────────────────────────────────────────
  {
    kind: "FASAH",
    name: "FASAH pre-arrival declaration",
    authority: "FASAH",
    deadline: "48h before arrival",
    applies: (ctx) => ctx.destCountry === "SA",
    country: () => "SA",
  },
  // ── UAE destination ───────────────────────────────────────────────────────
  {
    kind: "DUBAI_TRADE",
    name: "Dubai Trade pre-arrival declaration",
    authority: "Dubai Customs",
    deadline: "24h before arrival",
    applies: (ctx) => ctx.destCountry === "AE",
    country: () => "AE",
  },
  // ── Japan destination (AIR only) ──────────────────────────────────────────
  {
    kind: "AFAX",
    name: "Advance Filing rules for Air eXpress (AFAX)",
    authority: "Japan Customs",
    deadline: "before aircraft departure (AIR)",
    applies: (ctx) =>
      ctx.destCountry === "JP" && ctx.transportMode === "AIR",
    country: () => "JP",
  },
  // ── Australia destination (biosecurity pre-arrival) ───────────────────────
  {
    kind: "AEP",
    name: "Advanced Electronic Presentation / Biosecurity pre-arrival (AEP)",
    authority: "DAFF / ABF",
    deadline: "before arrival (biosecurity)",
    applies: (ctx) => ctx.destCountry === "AU",
    country: () => "AU",
  },
  // ── Brazil destination ────────────────────────────────────────────────────
  {
    kind: "SISCOMEX",
    name: "Siscomex pre-shipment declaration",
    authority: "Siscomex (Receita Federal)",
    deadline: "before shipment",
    applies: (ctx) => ctx.destCountry === "BR",
    country: () => "BR",
  },
  // ── India destination ─────────────────────────────────────────────────────
  {
    kind: "ICEGATE",
    name: "ICEGATE pre-arrival declaration",
    authority: "ICEGATE (Indian Customs EDI)",
    deadline: "before arrival",
    applies: (ctx) => ctx.destCountry === "IN",
    country: () => "IN",
  },
  // ── Turkey destination ────────────────────────────────────────────────────
  {
    kind: "TEKSIG",
    name: "TekSig (Turkey Single Window) pre-arrival",
    authority: "Turkey Ministry of Trade",
    deadline: "before arrival",
    applies: (ctx) => ctx.destCountry === "TR",
    country: () => "TR",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

export interface PreLoadingAssessmentInput {
  ustn: string;
  originCountry: string;
  destCountry: string;
  transportMode: string;
  hsCode: string;
}

/**
 * Assess which country-specific pre-loading filings are required for the
 * given lane.
 *
 * Returns a `PreLoadingResult` with:
 *   • `steps`           — every applicable pre-loading step, each with
 *                         `status = "REQUIRED"`, a mock `filingReference`,
 *                         the responsible authority, and the statutory
 *                         deadline;
 *   • `allCompleted`    — false if any mandatory step is still REQUIRED
 *                         (the trade cannot be loaded until they are filed);
 *   • `blockingSteps`   — the mandatory REQUIRED steps that block loading
 *                         (empty iff the trade is ready to load).
 *
 * The mock filing reference assigned to each step is replaced by the real
 * authority transaction ID when the workflow engine invokes a registered
 * `PreLoadingFilingProvider` in a later phase. This function performs no
 * external API calls.
 */
export function assessPreLoading(input: PreLoadingAssessmentInput): PreLoadingResult {
  const ustn = (input.ustn || "").trim();
  const originCountry = (input.originCountry || "").toUpperCase().trim();
  const destCountry = (input.destCountry || "").toUpperCase().trim();
  const transportMode = normalizeTransportMode(input.transportMode);
  const hsCode = (input.hsCode || "").trim();

  const ctx: RuleContext = {
    ustn,
    originCountry,
    destCountry,
    transportMode,
    hsCode,
  };

  // Apply each rule in registry order. The first matching rule for a given
  // step kind wins (rules are unique by kind, so no de-duplication is
  // needed — but we de-dup defensively in case future rules collide).
  const seenKinds = new Set<PreLoadingStepKind>();
  const steps: PreLoadingStep[] = [];
  for (const rule of RULES) {
    if (seenKinds.has(rule.kind)) continue;
    if (!rule.applies(ctx)) continue;
    seenKinds.add(rule.kind);
    steps.push(buildStep(rule, ctx));
  }

  // Determine blocking steps: mandatory steps that are not yet COMPLETED or
  // WAIVED. Since `assessPreLoading` always sets status = "REQUIRED", every
  // mandatory step is blocking until a real provider files the declaration
  // and the workflow engine re-runs the assessment with the COMPLETED status.
  const blockingSteps = steps.filter(
    (s) => s.mandatory && s.status !== "COMPLETED" && s.status !== "WAIVED",
  );

  const allCompleted = blockingSteps.length === 0;

  return {
    ustn,
    originCountry,
    destCountry,
    transportMode,
    steps,
    allCompleted,
    blockingSteps,
  };
}

/**
 * Convenience predicate — does the given lane have ANY mandatory pre-loading
 * requirement? Useful for upstream trade-validation gates that need a fast
 * boolean check without materializing the full assessment object.
 */
export function hasPreLoadingRequirements(input: PreLoadingAssessmentInput): boolean {
  return assessPreLoading(input).steps.some((s) => s.mandatory);
}

/**
 * Convenience predicate — is the given step kind applicable to the lane?
 * Used by the workflow engine to decide whether to invoke a particular
 * provider.
 */
export function isPreLoadingStepApplicable(
  stepKind: PreLoadingStepKind,
  input: PreLoadingAssessmentInput,
): boolean {
  return assessPreLoading(input).steps.some((s) => s.step === stepKind);
}
