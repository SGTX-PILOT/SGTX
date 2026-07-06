/**
 * Force Majeure Engine — Pluggable Event Detection & Trade Impact Assessment
 * ===========================================================================
 *
 * Detects active force-majeure events (war, pandemic, port closure, sanctions,
 * civil unrest, act of government, natural disaster) and flags trades whose
 * loading port, discharge port, origin country, destination country, or
 * corridor overlaps an active event.
 *
 * DESIGN — Pluggable feed registry:
 *   Real-world FM feeds (ICC Force Majeure Notices, Lloyd's List
 *   advisories, BIMCO maritime security bulletins, MAIB / IMO reports,
 *   government sanctions lists, etc.) will be plugged in later via
 *   `registerForceMajeureFeed`. Each feed implements `fetch()` returning an
 *   array of `ForceMajeureEvent`. The engine MERGES + DEDUPLICATES events
 *   from all registered feeds plus the SEEDED local feed (which carries
 *   well-known ongoing events: Red Sea / Suez Houthi disruption, the
 *   Russia–Ukraine war, and the Sudan conflict).
 *
 *   Until real feeds are wired, the engine operates correctly on the seeded
 *   events alone — `getActiveForceMajeureEvents()` is the public entry point
 *   and works today.
 *
 * The engine is a deterministic, self-contained logic module. No external
 * network calls. Feed `fetch()` implementations (when added) are responsible
 * for their own I/O, caching, and error handling — the engine treats a feed
 * that throws as returning an empty array (logged but not fatal).
 *
 * Decision policy:
 *   • No overlapping events              ⇒ recommendedAction = 'proceed'
 *   • Overlap with 'minor' events only   ⇒ recommendedAction = 'proceed' (with
 *     conditions surfaced; carrier/insurance confirmation still required)
 *   • Overlap with 'major' events        ⇒ recommendedAction = 'suspend'
 *                                         (autoSuspensionRecommended = false)
 *   • Overlap with 'catastrophic' events ⇒ recommendedAction = 'suspend'
 *                                         autoSuspensionRecommended = true
 *
 *   'cancel' is never auto-recommended — that decision is reserved for the
 *   human operator (or an upstream governor policy with additional context).
 */

// ─────────────────────────────────────────────────────────────────────────────
// EU country list (for 'EU' corridor-pattern expansion)
// ─────────────────────────────────────────────────────────────────────────────
// Local copy — kept here to avoid coupling the compliance module to the
// customs-pricing module's import graph.

const EU_COUNTRIES: ReadonlySet<string> = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
]);

// ─────────────────────────────────────────────────────────────────────────────
// Public types (per task spec)
// ─────────────────────────────────────────────────────────────────────────────

export type ForceMajeureEventType =
  | "war"
  | "pandemic"
  | "natural_disaster"
  | "port_closure"
  | "sanctions"
  | "civil_unrest"
  | "act_of_government";

export type ForceMajeureSeverity = "minor" | "major" | "catastrophic";

export interface ForceMajeureEvent {
  id: string;
  type: ForceMajeureEventType;
  title: string;
  description: string;
  /** ISO 3166-1 alpha-2 country codes (e.g., "UA", "RU"). A trade overlaps on
   *  `affectedRegions` if its origin/destination country is in the list, OR if
   *  its loading/discharge port starts with any entry (UN/LOCODE ports begin
   *  with the 2-letter country code, so country-code entries also act as
   *  port-code-prefix matchers). */
  affectedRegions: string[];
  /** Explicit UN/LOCODE port codes (e.g., "EGSUZ" for Suez, "EGPSD" for Port
   *  Said, "SAYDH" for Aden) that the event disrupts. Checked for exact match
   *  against the trade's loadingPort / dischargePort. */
  affectedPorts?: string[];
  /** Corridor patterns the event disrupts, in `ORIGIN-DEST` form. Each side
   *  may be a country code OR the special token 'EU' (matches any EU member
   *  state). Patterns are checked in BOTH directions (A-B matches both A→B
   *  and B→A). */
  affectedCorridors?: string[];
  severity: ForceMajeureSeverity;
  /** ISO 8601 datetime — when the event became active. */
  startsAt: string;
  /** ISO 8601 datetime — when the event ended. `undefined` if still ongoing. */
  endsAt?: string;
  /** Provenance label — e.g., 'ICC_FM_Notice', 'Lloyds_List', 'BIMCO',
   *  'manual'. */
  source: string;
  /** 0–1 confidence in the assessment. Seeded well-known events use 0.85;
   *  manually-entered events default to 0.5. */
  confidence: number;
}

export interface ForceMajeureFeed {
  name: string;
  fetch(): Promise<ForceMajeureEvent[]>;
}

export interface TradeForceMajeureAssessment {
  ustn: string;
  affected: boolean;
  events: ForceMajeureEvent[];
  recommendedAction: "proceed" | "suspend" | "cancel";
  autoSuspensionRecommended: boolean;
  conditions: {
    condition_id: string;
    label: string;
    status: "unmet" | "met";
  }[];
}

export interface AssessTradeForceMajeureInput {
  ustn: string;
  loadingPort?: string;
  dischargePort?: string;
  originCountry: string;
  destCountry: string;
  /** ISO 8601 datetime the cargo is ready for loading. Used to scope events
   *  (events that ended BEFORE cargo was ready are excluded). */
  cargoReadyAt?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pluggable feed registry
// ─────────────────────────────────────────────────────────────────────────────

const feeds: ForceMajeureFeed[] = [];

/**
 * Register a Force Majeure feed. Real implementations (ICC FM Notices,
 * Lloyd's List, BIMCO maritime security bulletins, sanctions feeds) will be
 * registered here when their APIs become available. Until then the engine
 * operates on the seeded events.
 */
export function registerForceMajeureFeed(feed: ForceMajeureFeed): void {
  if (!feed || typeof feed.fetch !== "function") return;
  feeds.push(feed);
}

/** Test-only helper — clears the registry. NOT for production use. */
export function _clearForceMajeureFeedsForTest(): void {
  feeds.length = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seeded current events (replace with real feed data when APIs available)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seed list of well-known ongoing force-majeure events relevant to
 * Egypt-centered trade. These are replaced/augmented by registered feed
 * data when feeds are wired in.
 *
 * `startsAt` is in the past; `endsAt` is omitted (ongoing).
 */
const SEEDED_EVENTS: ForceMajeureEvent[] = [
  {
    id: "FM-REDSEA-HOUTHI-202311",
    type: "war",
    title: "Red Sea / Bab-el-Mandeb — Houthi attacks on commercial shipping",
    description:
      "Since November 2023, Houthi forces in Yemen have attacked commercial vessels transiting the Bab-el-Mandeb Strait and southern Red Sea. Major carriers have rerouted via the Cape of Good Hope; Suez Canal transits are significantly reduced. War-risk insurance premiums for the Red Sea corridor have spiked. Vessels calling at Egyptian Red Sea ports (Ain Sukhna, Suez, Port Said) and Saudi/UAE/Yemeni ports (Aden, Jeddah) face elevated risk.",
    affectedRegions: ["EG", "SA", "AE", "YE", "JO", "IL", "DJ", "SD"],
    affectedPorts: ["EGPSD", "SAYDH"],
    affectedCorridors: [
      "EG-EU", "EU-EG",
      "EG-SA", "SA-EG",
      "EG-AE", "AE-EG",
      "SA-EU", "EU-SA",
      "AE-EU", "EU-AE",
      "IN-EU", "EU-IN",
      "CN-EU", "EU-CN",
      "JP-EU", "EU-JP",
      "KR-EU", "EU-KR",
    ],
    severity: "major",
    startsAt: "2023-11-19T00:00:00Z",
    source: "BIMCO_Maritime_Security_Bulletin",
    confidence: 0.95,
  },
  {
    id: "FM-RUSSIA-UKRAINE-WAR-202202",
    type: "war",
    title: "Russia–Ukraine war — active hostilities & sanctions",
    description:
      "Active armed conflict since 24 February 2022. Russian, Ukrainian, and Belarusian ports in the Black Sea and Sea of Azov are subject to closure, mining risk, and sanctions. Extensive sanctions on RU/BY entities (US OFAC, EU, UK). Trade with UA, RU, BY requires sanctions screening and may invoke FM clauses in contracts, LCs, and insurance (Institute War & Strikes Clauses).",
    affectedRegions: ["UA", "RU", "BY"],
    affectedCorridors: [
      "UA-RU", "RU-UA",
      "UA-BY", "BY-UA",
      "RU-BY", "BY-RU",
      "UA-EU", "EU-UA",
      "RU-EU", "EU-RU",
      "BY-EU", "EU-BY",
    ],
    severity: "catastrophic",
    startsAt: "2022-02-24T00:00:00Z",
    source: "ICC_FM_Notice",
    confidence: 0.95,
  },
  {
    id: "FM-SUDAN-CONFLICT-202304",
    type: "civil_unrest",
    title: "Sudan — armed conflict between SAF and RSF (since 15 April 2023)",
    description:
      "Open armed conflict between the Sudanese Armed Forces (SAF) and the Rapid Support Forces (RSF) since 15 April 2023. Port Sudan operations are periodically disrupted; overland corridors to Egypt and South Sudan are subject to closure and ambush risk. Khartoum airport closed to commercial traffic. Sudan trade subject to FM clauses; evacuations and humanitarian corridors intermittently active.",
    affectedRegions: ["SD"],
    affectedPorts: ["SDPSD"],
    affectedCorridors: [
      "SD-EG", "EG-SD",
      "SD-SA", "SA-SD",
      "SD-ET", "ET-SD",
      "SD-SS", "SS-SD",
      "SD-EU", "EU-SD",
    ],
    severity: "major",
    startsAt: "2023-04-15T00:00:00Z",
    source: "Lloyds_List",
    confidence: 0.9,
  },
  {
    id: "FM-MYANMAR-CIVIL-UNREST-202102",
    type: "civil_unrest",
    title: "Myanmar — civil unrest & armed conflict following Feb 2021 coup",
    description:
      "Following the military coup of 1 February 2021, Myanmar has experienced escalating civil unrest and armed conflict between the State Administration Council (SAC) and various People's Defence Forces (PDFs) and ethnic armed organisations (EAOs). Yangon port operations are periodically disrupted; overland corridors to Thailand, China, and India are subject to intermittent closure and security incidents. Multiple Western sanctions target SAC-affiliated entities. Trade with Myanmar invokes FM clauses and requires sanctions screening.",
    affectedRegions: ["MM"],
    affectedPorts: ["MMRGN"],
    affectedCorridors: [
      "MM-TH", "TH-MM",
      "MM-CN", "CN-MM",
      "MM-IN", "IN-MM",
      "MM-EU", "EU-MM",
      "MM-US", "US-MM",
    ],
    severity: "major",
    startsAt: "2021-02-01T00:00:00Z",
    source: "ICC_FM_Notice",
    confidence: 0.9,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Matching helpers
// ─────────────────────────────────────────────────────────────────────────────

/** Parse a corridor pattern of the form 'XX-YY' where each side may be a
 *  country code or the special token 'EU'. Returns the two sides or `null`
 *  if malformed. */
function parseCorridorPattern(pattern: string): [string, string] | null {
  const parts = (pattern || "").split("-");
  if (parts.length !== 2) return null;
  const [from, to] = parts.map((p) => p.trim().toUpperCase());
  if (!from || !to) return null;
  return [from, to];
}

/** True if `country` satisfies the corridor-pattern side `side`, where 'EU'
 *  matches any EU member state. */
function countryMatchesSide(country: string, side: string): boolean {
  if (!country) return false;
  if (side === "EU") return EU_COUNTRIES.has(country);
  return side === country;
}

/** True if a corridor pattern matches the trade's origin→destination or
 *  destination→origin direction (patterns are bidirectional). */
function corridorPatternMatches(
  pattern: string,
  origin: string,
  dest: string,
): boolean {
  const parsed = parseCorridorPattern(pattern);
  if (!parsed) return false;
  const [from, to] = parsed;
  // Pattern matches if origin matches `from` AND dest matches `to`, OR the
  // reverse (bidirectional).
  return (
    (countryMatchesSide(origin, from) && countryMatchesSide(dest, to)) ||
    (countryMatchesSide(origin, to) && countryMatchesSide(dest, from))
  );
}

/** True if a trade's port or country overlaps the event's `affectedRegions`
 *  list. Country-code entries double as port-code prefixes (UN/LOCODE ports
 *  begin with the 2-letter country code). */
function regionsOverlap(
  regions: string[],
  origin: string,
  dest: string,
  loadingPort: string,
  dischargePort: string,
): boolean {
  for (const r of regions) {
    if (!r) continue;
    if (origin && r.toUpperCase() === origin) return true;
    if (dest && r.toUpperCase() === dest) return true;
    // Port-code prefix match (covers both country-code entries and explicit
    // UN/LOCODE prefixes like 'EGSUZ').
    const ru = r.toUpperCase();
    if (loadingPort && loadingPort.toUpperCase().startsWith(ru)) return true;
    if (dischargePort && dischargePort.toUpperCase().startsWith(ru)) return true;
  }
  return false;
}

/** True if a trade's loading or discharge port exactly matches any UN/LOCODE
 *  in the event's explicit `affectedPorts` list. */
function portsOverlap(
  ports: string[] | undefined,
  loadingPort: string,
  dischargePort: string,
): boolean {
  if (!ports || ports.length === 0) return false;
  const set = new Set(ports.map((p) => p.toUpperCase()));
  if (loadingPort && set.has(loadingPort)) return true;
  if (dischargePort && set.has(dischargePort)) return true;
  return false;
}

/** True if any corridor pattern in the event overlaps the trade. */
function corridorsOverlap(
  patterns: string[] | undefined,
  origin: string,
  dest: string,
): boolean {
  if (!patterns || patterns.length === 0) return false;
  return patterns.some((p) => corridorPatternMatches(p, origin, dest));
}

/** True if the event is "active" relative to the trade's cargo-ready date.
 *  An event with `endsAt` before `cargoReadyAt` is excluded (it ended before
 *  the cargo was ready). Events without `endsAt` are always active (ongoing). */
function eventIsActiveRelativeTo(
  event: ForceMajeureEvent,
  cargoReadyAt?: string,
): boolean {
  if (!cargoReadyAt) return true;
  const cargoTime = Date.parse(cargoReadyAt);
  if (Number.isNaN(cargoTime)) return true;
  if (event.endsAt) {
    const endTime = Date.parse(event.endsAt);
    if (!Number.isNaN(endTime) && endTime < cargoTime) return false;
  }
  return true;
}

/** Deduplicate events by id (feeds may overlap; seeded events take priority). */
function dedupeEvents(events: ForceMajeureEvent[]): ForceMajeureEvent[] {
  const seen = new Map<string, ForceMajeureEvent>();
  for (const e of events) {
    if (!e || !e.id) continue;
    if (!seen.has(e.id)) seen.set(e.id, e);
  }
  return Array.from(seen.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns all currently active force-majeure events from (a) the seeded list
 * of well-known ongoing events, and (b) every registered feed. Events are
 * deduplicated by id; seeded events take precedence.
 *
 * "Active" means `startsAt` is in the past AND (`endsAt` is undefined OR
 * `endsAt` is in the future).
 */
export async function getActiveForceMajeureEvents(): Promise<ForceMajeureEvent[]> {
  const now = Date.now();

  // Collect from registered feeds, isolating each feed's failure.
  const feedResults: ForceMajeureEvent[][] = [];
  for (const feed of feeds) {
    try {
      const result = await feed.fetch();
      if (Array.isArray(result)) feedResults.push(result);
    } catch {
      // Swallow feed errors — a failing feed must not break the engine.
      // Real implementations should log via the SGTX logger when wired.
      feedResults.push([]);
    }
  }

  const all = dedupeEvents([...SEEDED_EVENTS, ...feedResults.flat()]);

  return all.filter((e) => {
    const startMs = Date.parse(e.startsAt);
    if (!Number.isNaN(startMs) && startMs > now) return false; // starts in the future
    if (e.endsAt) {
      const endMs = Date.parse(e.endsAt);
      if (!Number.isNaN(endMs) && endMs < now) return false; // already ended
    }
    return true;
  });
}

/**
 * Assess a single trade against all active force-majeure events.
 *
 * Overlap is determined by:
 *   • Country overlap — origin or destination country appears in the event's
 *     `affectedRegions` (exact match).
 *   • Port overlap (prefix) — loadingPort or dischargePort starts with any
 *     entry in `affectedRegions` (UN/LOCODE ports begin with the 2-letter
 *     country code, so country entries also match ports).
 *   • Port overlap (exact) — loadingPort or dischargePort exactly matches an
 *     entry in `affectedPorts` (explicit UN/LOCODE port codes like EGSUZ,
 *     EGPSD, SAYDH).
 *   • Corridor overlap — the origin→destination pair matches any pattern in
 *     `affectedCorridors` (patterns are bidirectional; 'EU' is a wildcard
 *     matching any EU member state).
 *
 * Decision policy:
 *   • No overlapping events              → proceed, no auto-suspension.
 *   • Only 'minor' events overlap        → proceed (with conditions surfaced).
 *   • Any 'major' event overlaps         → suspend (no auto-suspension).
 *   • Any 'catastrophic' event overlaps  → suspend + autoSuspensionRecommended.
 *
 * `cargoReadyAt` is used to exclude events that ended before the cargo was
 * ready (e.g., a port closure that was lifted before the trade was booked).
 */
export async function assessTradeForceMajeure(
  input: AssessTradeForceMajeureInput,
): Promise<TradeForceMajeureAssessment> {
  const ustn = (input.ustn || "").trim();
  const loadingPort = (input.loadingPort || "").toUpperCase().trim();
  const dischargePort = (input.dischargePort || "").toUpperCase().trim();
  const origin = (input.originCountry || "").toUpperCase().trim();
  const dest = (input.destCountry || "").toUpperCase().trim();

  const activeEvents = await getActiveForceMajeureEvents();
  const relevantEvents = activeEvents.filter(
    (e) => eventIsActiveRelativeTo(e, input.cargoReadyAt),
  );

  const overlapping: ForceMajeureEvent[] = [];
  for (const e of relevantEvents) {
    const regionHit = regionsOverlap(e.affectedRegions, origin, dest, loadingPort, dischargePort);
    const portHit = portsOverlap(e.affectedPorts, loadingPort, dischargePort);
    const corridorHit = corridorsOverlap(e.affectedCorridors, origin, dest);
    if (regionHit || portHit || corridorHit) {
      overlapping.push(e);
    }
  }

  // Sort overlapping events: catastrophic → major → minor, then most-recent first.
  const severityRank: Record<ForceMajeureSeverity, number> = {
    catastrophic: 0,
    major: 1,
    minor: 2,
  };
  overlapping.sort((a, b) => {
    const sevDiff = severityRank[a.severity] - severityRank[b.severity];
    if (sevDiff !== 0) return sevDiff;
    return Date.parse(b.startsAt) - Date.parse(a.startsAt);
  });

  const affected = overlapping.length > 0;
  const hasMajorOrCatastrophic = overlapping.some(
    (e) => e.severity === "major" || e.severity === "catastrophic",
  );
  const hasCatastrophic = overlapping.some(
    (e) => e.severity === "catastrophic",
  );

  let recommendedAction: TradeForceMajeureAssessment["recommendedAction"];
  if (!affected) {
    recommendedAction = "proceed";
  } else if (hasMajorOrCatastrophic) {
    recommendedAction = "suspend";
  } else {
    recommendedAction = "proceed";
  }

  // Build conditions list.
  const conditions: TradeForceMajeureAssessment["conditions"] = [];
  conditions.push({
    condition_id: "FM-CORRIDOR-CLEAR",
    label: `No active force majeure event on the ${origin || "?"}→${dest || "?"} corridor`,
    status: affected ? "unmet" : "met",
  });
  if (affected) {
    const topEvent = overlapping[0];
    conditions.push({
      condition_id: "FM-INSURANCE-CONFIRMED",
      label: `War-risk / FM insurance rider confirmed for ${topEvent.title}`,
      status: "unmet",
    });
    conditions.push({
      condition_id: "FM-CARRIER-CONFIRMATION",
      label: `Carrier / freight forwarder confirmed sailing schedule for the affected corridor`,
      status: "unmet",
    });
    if (hasMajorOrCatastrophic) {
      conditions.push({
        condition_id: "FM-EXECUTIVE-OVERRIDE",
        label: hasCatastrophic
          ? "Executive override approved to proceed despite catastrophic force majeure event (auto-suspension will trigger otherwise)"
          : "Executive override approved to proceed despite major force majeure event",
        status: "unmet",
      });
    }
  }

  return {
    ustn,
    affected,
    events: overlapping,
    recommendedAction,
    autoSuspensionRecommended: hasCatastrophic,
    conditions,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience exports for callers that want the seed data directly (testing,
// UI seeds, etc.) — real feed data is preferred once available.
// ─────────────────────────────────────────────────────────────────────────────

export const SEEDED_FORCE_MAJEURE_EVENTS: readonly ForceMajeureEvent[] = SEEDED_EVENTS;
