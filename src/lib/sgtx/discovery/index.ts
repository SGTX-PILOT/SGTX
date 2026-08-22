// @ts-nocheck
/**
 * SGTX Phase 8 — §5 Automatic Integration Discovery
 * ===========================================================================
 *
 * Implements the automatic integration discovery engine. When a new trade
 * is created, SGTX must determine ALL required integrations across the
 * origin + transit + destination countries — customs, SPS, TBT, tax,
 * transport, insurance, security, broker — and surface any MISSING gaps
 * to the onboarding team.
 *
 * Discovery flow (§5):
 *
 *   1. From the trade's (origin, destination, mode, hs6, specialCargo):
 *      - Determine transit countries (e.g. Egypt → UAE by road → transit
 *        = [Jordan, Saudi Arabia]).
 *      - Determine the integration families required (CUSTOMS, SPS, TBT,
 *        TAX, TRANSPORT, INSURANCE, SECURITY, BROKER) based on HS chapter
 *        + mode + special cargo.
 *
 *   2. For each country (origin + each transit + destination):
 *      - For each integration family:
 *        - Determine the procedure (EXPORT, IMPORT, TRANSIT based on the
 *          country's role).
 *        - Look up the IntegrationCatalog for a matching entry.
 *        - If found + PRODUCTION_CONNECTED → status=CONNECTED.
 *        - If found + PORTAL_ONLY/MANUAL_ONLY → status=MANUAL.
 *        - If found + other status → status=PARTIAL.
 *        - If not found → status=MISSING.
 *
 *   3. For reefer cargo: annotate the TRANSPORT entries with reefer-specific
 *      notes (temperature monitoring, genset, reefer plug).
 *   4. For DG cargo: add DG-specific SECURITY entries (DG transport permit,
 *      DG declaration).
 *
 *   5. Summarize: total + connected + partial + manual + missing.
 *
 * §6 example — Egypt → UAE, agricultural, reefer, road:
 *   - transit = [JO, SA] (Jordan + Saudi Arabia — the land route)
 *   - isAgricultural = true (HS chapter 07 = edible vegetables)
 *   - isReefer = true (specialCargo.temperatureControlled)
 *   - required integrations include: Egypt customs + Egypt SPS + Egypt
 *     tax + Egypt transport (trucking) + Egypt insurance + Egypt broker +
 *     Jordan customs (transit) + Jordan transport + Jordan broker +
 *     Saudi customs (transit) + Saudi transport + Saudi broker + UAE
 *     customs + UAE SPS + UAE tax + UAE transport (final delivery) +
 *     UAE insurance + UAE broker.
 *
 * All DB calls are try/catch-wrapped with safe defaults. Pure helpers
 * (`determineIntegrationFamilies`, `isAgricultural`, `isPharma`,
 * `isChemical`, `isElectrical`, `isReefer`, `isDg`, `computeTransitCountries`)
 * have no side effects.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  findCatalogEntries,
  isConnectorConnected,
  type IntegrationCatalog,
} from "@/lib/sgtx/integration-catalog";
import { createGapRecord, type IntegrationGapRecord } from "@/lib/sgtx/gap-analysis";

// ============ §5 Constants ============

/**
 * The 8 integration families that the discovery engine considers. Each
 * family maps to an `authority` in the IntegrationCatalog. For each
 * (country, family) tuple the discovery engine decides whether an
 * integration is required + what its status is.
 */
export const INTEGRATION_FAMILIES = [
  "CUSTOMS",
  "SPS",
  "TBT",
  "TAX",
  "TRANSPORT",
  "INSURANCE",
  "SECURITY",
  "BROKER",
] as const;

/**
 * Country role for a trade.
 */
export const COUNTRY_ROLES = ["ORIGIN", "DESTINATION", "TRANSIT"] as const;

/**
 * Canonical transport-mode → transport authority procedure mapping.
 */
export const TRANSPORT_PROCEDURES: Record<string, string> = {
  ROAD: "TRUCKING",
  AIR: "AIRLINE",
  OCEAN: "SHIPPING_LINE",
  RAIL: "RAIL_OPERATOR",
  MULTIMODAL: "MULTIMODAL",
  INLAND_WATER: "BARGE",
  FERRY: "FERRY_OPERATOR",
};

/**
 * Small in-file route map of common land/rail transit corridors. Maps
 * `${origin}-${destination}-${mode}` → ordered list of ISO alpha-2 transit
 * countries. Routes not in this map return [] (assume direct).
 *
 * Key corridors:
 *   - Egypt → UAE by ROAD: transit = [JO, SA] (ferry to Aqaba → Saudi → UAE)
 *   - Egypt → Saudi by ROAD: transit = [JO] (ferry to Aqaba → Saudi)
 *   - Egypt → Jordan by ROAD: transit = [] (direct ferry Nuweiba/Aqaba)
 *   - China → Europe by RAIL: transit = [KZ, RU, BY, PL]
 *   - India → Pakistan by ROAD: transit = [] (direct border)
 *   - US ↔ Canada/Mexico by ROAD: transit = [] (direct border)
 */
const TRANSIT_ROUTES: Record<string, Record<string, string[]>> = {
  ROAD: {
    "EG-AE": ["JO", "SA"],
    "EG-SA": ["JO"],
    "EG-JO": [],
    "EG-LY": [],
    "EG-SD": [],
    "EG-IL": [],
    "SA-AE": [],
    "SA-QA": [],
    "QA-AE": ["SA"],
    "SA-KW": [],
    "KW-IQ": [],
    "SA-IQ": ["KW"],
    "SA-OM": ["AE"],
    "AE-OM": [],
    "OM-AE": [],
    "KW-SA": ["KW"],
    "QA-SA": [],
    "US-CA": [],
    "CA-US": [],
    "US-MX": [],
    "MX-US": [],
    "IN-PK": [],
    "PK-IN": [],
    "IN-NP": [],
    "IN-BD": [],
    "BD-IN": [],
    "IN-LK": [],
    "EG-BH": ["SA"],
    "TR-IR": [],
    "IR-TR": [],
    "FR-DE": [],
    "DE-FR": [],
    "DE-AT": [],
    "AT-DE": [],
    "DE-CH": [],
    "CH-DE": [],
    "FR-ES": [],
    "ES-FR": [],
    "FR-IT": ["CH"],
    "IT-FR": ["CH"],
    "DE-PL": [],
    "PL-DE": [],
  },
  RAIL: {
    "CN-DE": ["KZ", "RU", "BY", "PL"],
    "DE-CN": ["PL", "BY", "RU", "KZ"],
    "CN-PL": ["KZ", "RU", "BY"],
    "CN-RU": ["KZ", "MN"],
    "RU-CN": ["MN", "KZ"],
    "DE-PL": [],
    "PL-DE": [],
    "PL-BY": [],
    "BY-RU": [],
    "RU-BY": [],
    "RU-KZ": [],
    "KZ-RU": [],
  },
  OCEAN: {},
  AIR: {},
  MULTIMODAL: {},
  INLAND_WATER: {},
  FERRY: {
    "EG-JO": [],
    "EG-SA": ["JO"],
    "EG-AE": ["JO", "SA"],
    "EG-LY": [],
    "TR-GR": [],
    "GR-TR": [],
    "IT-GR": [],
    "GR-IT": [],
    "ES-MA": [],
    "MA-ES": [],
  },
};

// ============ Types ============

export interface DiscoverInput {
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  commodity?: string;
  hs6?: string;
  mode: string;
  incoterm?: string;
  specialCargo?: any;
}

export interface TradeContext {
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  commodity?: string;
  hs6?: string;
  mode: string;
  incoterm?: string;
  specialCargo?: any;
}

export interface RequiredIntegration {
  countryCode: string;
  role: string; // ORIGIN | DESTINATION | TRANSIT
  authority: string;
  procedure?: string;
  transportMode?: string;
  systemName?: string;
  integrationType?: string;
  required: boolean;
  status: string; // CONNECTED | PARTIAL | MANUAL | MISSING
  catalogConnectorId?: string;
  priority: number;
  notes?: string;
}

export interface DiscoveryResult {
  requiredIntegrations: RequiredIntegration[];
  originCountry: string;
  destinationCountry: string;
  transitCountries: string[];
  isReefer: boolean;
  isDg: boolean;
  isAgricultural: boolean;
  isPharma: boolean;
  isChemical: boolean;
  summary: {
    total: number;
    connected: number;
    partial: number;
    manual: number;
    missing: number;
  };
}

export interface DiscoveryReport extends DiscoveryResult {
  ustn: string;
  gapRecordsCreated: number;
}

// ============ §5.0 Pure helpers ============

/**
 * Pure: extract the HS chapter (first 2 digits) from a 6-digit HS code.
 * Returns -1 on invalid input.
 */
function hsChapter(hs6?: string | null): number {
  if (!hs6 || typeof hs6 !== "string") return -1;
  const cleaned = hs6.replace(/[^0-9]/g, "").substring(0, 2);
  if (cleaned.length < 2) return -1;
  const n = parseInt(cleaned, 10);
  return Number.isNaN(n) ? -1 : n;
}

/**
 * Pure: HS chapters 01-24 (live animals, meat, dairy, vegetables, fruits,
 * coffee, tea, cereals, oilseeds, animal/vegetable fats, prep. food,
 * beverages, tobacco) — agricultural + food products.
 */
export function isAgricultural(hs6?: string | null): boolean {
  const c = hsChapter(hs6);
  return c >= 1 && c <= 24;
}

/**
 * Pure: HS chapter 30 (pharmaceutical products). Triggers SPS + HEALTH
 * requirements.
 */
export function isPharma(hs6?: string | null): boolean {
  return hsChapter(hs6) === 30;
}

/**
 * Pure: HS chapters 28-39 (chemicals — inorganic, organic, pharmaceutical
 * chem, fertilizers, tanning/dye extracts, essential oils, soaps, albuminoidal
 * products, explosives, photographic, miscellaneous chemical). Triggers TBT +
 * SECURITY requirements.
 */
export function isChemical(hs6?: string | null): boolean {
  const c = hsChapter(hs6);
  return c >= 28 && c <= 39;
}

/**
 * Pure: HS chapter 85 (electrical machinery + equipment + parts; sound
 * recorders/reproducers; TV image/sound recorders/reproducers; parts +
 * accessories of such articles). Triggers TBT requirements.
 */
export function isElectrical(hs6?: string | null): boolean {
  return hsChapter(hs6) === 85;
}

/**
 * Pure: check specialCargo for reefer / temperature-controlled cargo.
 * Accepts both `temperatureControlled` and `reefer` keys (different
 * upstream systems use either name). Returns false on missing/null input.
 */
export function isReefer(specialCargo?: any): boolean {
  if (!specialCargo) return false;
  if (typeof specialCargo !== "object") return false;
  if (specialCargo.temperatureControlled === true) return true;
  if (specialCargo.reefer === true) return true;
  if (specialCargo.perishable === true) return true;
  return false;
}

/**
 * Pure: check specialCargo for dangerous goods (DG). Accepts both
 * `dangerousGoods` and `dg` keys. Returns false on missing/null input.
 */
export function isDg(specialCargo?: any): boolean {
  if (!specialCargo) return false;
  if (typeof specialCargo !== "object") return false;
  if (specialCargo.dangerousGoods === true) return true;
  if (specialCargo.dg === true) return true;
  if (specialCargo.hazardous === true) return true;
  return false;
}

/**
 * Pure: compute the transit countries for a given (origin, destination, mode)
 * tuple. Uses a small in-file route map of common corridors — routes not
 * in the map return [] (assume direct).
 *
 * For OCEAN + AIR modes the transit is always [] (vessels + flights
 * are point-to-point — transshipments are not transit countries).
 *
 * For ROAD + RAIL + FERRY the route map is consulted.
 *
 * No DB, no side effects.
 */
export function computeTransitCountries(
  originCountry: string,
  destinationCountry: string,
  mode: string,
): string[] {
  if (!originCountry || !destinationCountry || !mode) return [];
  const modeKey = (mode || "").toUpperCase();
  const routeMap = TRANSIT_ROUTES[modeKey];
  if (!routeMap) return [];
  const key = `${originCountry.toUpperCase()}-${destinationCountry.toUpperCase()}`;
  const transit = routeMap[key];
  return Array.isArray(transit) ? [...transit] : [];
}

/**
 * Pure: determine the integration families required for a (hs6, mode,
 * specialCargo) combination. Always includes CUSTOMS, TAX, TRANSPORT,
 * INSURANCE, BROKER (every cross-border trade needs these). Adds SPS for
 * agricultural + pharma cargo, TBT for electrical + chemical cargo,
 * SECURITY for DG cargo.
 *
 * Returns the families in CANONICAL ORDER (matches `INTEGRATION_FAMILIES`).
 *
 * No DB, no side effects.
 */
export function determineIntegrationFamilies(
  hs6?: string,
  mode?: string,
  specialCargo?: any,
): string[] {
  const out: string[] = [];
  // Always-required families (every cross-border trade).
  out.push("CUSTOMS");

  // SPS — agricultural + pharma + food + animal.
  if (isAgricultural(hs6) || isPharma(hs6)) {
    out.push("SPS");
  }

  // TBT — electrical + chemical + toys.
  if (isElectrical(hs6) || isChemical(hs6)) {
    out.push("TBT");
  }

  // TAX — always (invoice / e-invoicing / VAT).
  out.push("TAX");

  // TRANSPORT — always (mode-based: trucking, airline, shipping line, rail).
  out.push("TRANSPORT");

  // INSURANCE — always (cross-border cargo insurance).
  out.push("INSURANCE");

  // SECURITY — DG cargo OR high-risk lane (DG is the explicit trigger).
  if (isDg(specialCargo)) {
    out.push("SECURITY");
  }

  // BROKER — always (customs broker for clearance at each border).
  out.push("BROKER");

  return out;
}

/**
 * Pure: derive the procedure for a (family, role, mode) combination.
 * Returns undefined if the family is not applicable to the role.
 *
 *   CUSTOMS   ORIGIN → EXPORT, DESTINATION → IMPORT, TRANSIT → TRANSIT
 *   TAX       ORIGIN → EXPORT_INVOICE, DESTINATION → IMPORT_VAT, TRANSIT → null
 *   SPS       ORIGIN → EXPORT_CERT, DESTINATION → IMPORT_CERT, TRANSIT → null
 *   TBT       ORIGIN → EXPORT_CERT, DESTINATION → IMPORT_CERT, TRANSIT → null
 *   TRANSPORT mode-based (TRUCKING/AIRLINE/SHIPPING_LINE/RAIL_OPERATOR)
 *   INSURANCE mode-based
 *   SECURITY  → SECURITY_SCREEN (DG screening)
 *   BROKER    ORIGIN → EXPORT_BROKER, DESTINATION → IMPORT_BROKER, TRANSIT → TRANSIT_BROKER
 *
 * No DB, no side effects.
 */
function deriveProcedure(
  family: string,
  role: string,
  mode: string,
): string | undefined {
  const r = (role || "").toUpperCase();
  const m = (mode || "").toUpperCase();
  switch (family) {
    case "CUSTOMS":
      if (r === "ORIGIN") return "EXPORT";
      if (r === "DESTINATION") return "IMPORT";
      if (r === "TRANSIT") return "TRANSIT";
      return undefined;
    case "TAX":
      if (r === "ORIGIN") return "EXPORT_INVOICE";
      if (r === "DESTINATION") return "IMPORT_VAT";
      return undefined;
    case "SPS":
      if (r === "ORIGIN") return "EXPORT_CERT";
      if (r === "DESTINATION") return "IMPORT_CERT";
      return undefined;
    case "TBT":
      if (r === "ORIGIN") return "EXPORT_CERT";
      if (r === "DESTINATION") return "IMPORT_CERT";
      return undefined;
    case "TRANSPORT":
      return TRANSPORT_PROCEDURES[m] || "TRANSPORT";
    case "INSURANCE":
      return "CARGO_INSURANCE";
    case "SECURITY":
      return "SECURITY_SCREEN";
    case "BROKER":
      if (r === "ORIGIN") return "EXPORT_BROKER";
      if (r === "DESTINATION") return "IMPORT_BROKER";
      if (r === "TRANSIT") return "TRANSIT_BROKER";
      return undefined;
    default:
      return undefined;
  }
}

/**
 * Pure: derive the default integration type for a family.
 *   CUSTOMS, TAX, SPS, TBT, INSURANCE → API (modern) or PORTAL (fallback)
 *   TRANSPORT                         → API (carrier APIs / EDI)
 *   SECURITY                          → API
 *   BROKER                            → BROKER (manual / portal-based)
 *
 * No DB, no side effects.
 */
function deriveIntegrationType(family: string): string {
  if (family === "BROKER") return "BROKER";
  if (family === "TRANSPORT") return "API";
  return "API";
}

/**
 * Pure: derive the priority for a RequiredIntegration from its status.
 * Matches the GAP_PRIORITY_BASE so the discovery engine + the gap engine
 * are consistent.
 *
 *   CONNECTED = 20, PARTIAL = 60, MANUAL = 40, MISSING = 80, DEPRECATED = 10
 *
 * No DB, no side effects.
 */
function priorityFromStatus(status: string): number {
  switch (status) {
    case "CONNECTED":
      return 20;
    case "PARTIAL":
      return 60;
    case "MANUAL":
      return 40;
    case "MISSING":
      return 80;
    case "DEPRECATED":
      return 10;
    default:
      return 50;
  }
}

// ============ §5.1 getRequiredIntegrationsForCountry ============

/**
 * For a single country + role, compute the required integrations. Returns
 * one RequiredIntegration per (family, role, procedure) combination — the
 * discovery engine then aggregates these across origin + transit +
 * destination.
 *
 * For each integration the IntegrationCatalog is queried for a matching
 * entry (by jurisdictionCode + authority + procedure + transportMode).
 * If a matching entry is found, the status is derived from its connector
 * status; otherwise the status is MISSING.
 *
 * Returns [] on DB error. Never throws.
 */
export async function getRequiredIntegrationsForCountry(
  countryCode: string,
  role: string,
  trade: TradeContext,
): Promise<RequiredIntegration[]> {
  if (!countryCode || !role || !trade) return [];

  const mode = trade.mode || "ROAD";
  const families = determineIntegrationFamilies(trade.hs6, mode, trade.specialCargo);
  const reefer = isReefer(trade.specialCargo);
  const dg = isDg(trade.specialCargo);
  const out: RequiredIntegration[] = [];

  for (const family of families) {
    const procedure = deriveProcedure(family, role, mode);
    if (!procedure) continue; // family not applicable to this role (e.g. TAX for transit).

    // Look up the catalog for a matching entry.
    let catalogEntries: IntegrationCatalog[] = [];
    try {
      catalogEntries = await findCatalogEntries({
        jurisdictionCode: countryCode,
        authority: family,
        procedure,
        transportMode: mode,
      });
    } catch (err) {
      logger.warn("[discovery] catalog lookup failed", {
        error: String(err),
        countryCode,
        family,
        procedure,
      });
      catalogEntries = [];
    }

    const best = pickBestCatalogEntry(catalogEntries);
    const status = deriveStatusFromCatalog(best);
    const integrationType = deriveIntegrationType(family);

    const req: RequiredIntegration = {
      countryCode,
      role,
      authority: family,
      procedure,
      transportMode: mode,
      systemName: best?.systemName,
      integrationType,
      required: true,
      status,
      catalogConnectorId: best?.connectorId,
      priority: priorityFromStatus(status),
      notes: buildNotes(family, role, reefer, dg),
    };
    out.push(req);
  }

  return out;
}

/**
 * Pure: pick the best catalog entry from a list (highest priority first,
 * then PRODUCTION_CONNECTED > SANDBOX_CONNECTED > other). Returns undefined
 * if the list is empty.
 */
function pickBestCatalogEntry(
  entries: IntegrationCatalog[],
): IntegrationCatalog | undefined {
  if (!Array.isArray(entries) || entries.length === 0) return undefined;
  const sorted = [...entries].sort((a, b) => {
    // First: prefer connected entries.
    const aConn = isConnectorConnected(a) ? 1 : 0;
    const bConn = isConnectorConnected(b) ? 1 : 0;
    if (aConn !== bConn) return bConn - aConn;
    // Then: higher priority wins.
    const aP = Number(a.priority) || 0;
    const bP = Number(b.priority) || 0;
    if (aP !== bP) return bP - aP;
    // Then: alphabetical systemName for stable ordering.
    return String(a.systemName || "").localeCompare(String(b.systemName || ""));
  });
  return sorted[0];
}

/**
 * Pure: derive the gap status (CONNECTED/PARTIAL/MANUAL/MISSING) from a
 * catalog entry. Returns MISSING if no entry is provided.
 */
function deriveStatusFromCatalog(entry?: IntegrationCatalog | null): string {
  if (!entry) return "MISSING";
  const s = entry.status;
  if (s === "PRODUCTION_CONNECTED" || s === "SANDBOX_CONNECTED") return "CONNECTED";
  if (s === "PORTAL_ONLY" || s === "MANUAL_ONLY") return "MANUAL";
  if (s === "DEPRECATED") return "DEPRECATED";
  if (s === "NOT_DISCOVERED") return "MISSING";
  // DISCOVERED, DOCUMENTED, CONTACT_REQUIRED, CREDENTIALS_REQUIRED,
  // SANDBOX_AVAILABLE, CERTIFICATION_REQUIRED, CERTIFICATION_PENDING,
  // PRODUCTION_READY, DEGRADED, OUTAGE
  return "PARTIAL";
}

/**
 * Pure: build human-readable notes for a required integration. Includes
 * reefer + DG annotations where applicable.
 */
function buildNotes(
  family: string,
  role: string,
  reefer: boolean,
  dg: boolean,
): string | undefined {
  const notes: string[] = [];
  if (family === "TRANSPORT" && reefer) {
    notes.push("reefer cargo — temperature monitoring + genset required");
  }
  if (family === "SECURITY" && dg) {
    notes.push("DG cargo — DG transport permit + DG declaration required");
  }
  if (family === "TRANSPORT" && role === "DESTINATION") {
    notes.push("final delivery leg");
  }
  if (family === "CUSTOMS" && role === "TRANSIT") {
    notes.push("transit guarantee required (T1 / TIR carnets)");
  }
  return notes.length > 0 ? notes.join(" | ") : undefined;
}

// ============ §5.2 discoverRequiredIntegrations (main) ============

/**
 * THE MAIN FUNCTION — given a trade's (origin, destination, transit,
 * commodity, hs6, mode, incoterm, specialCargo), determine ALL required
 * integrations across origin + transit + destination.
 *
 * Flow:
 *   1. Determine transit countries (if not provided).
 *   2. Determine integration families (based on HS chapter + mode + specialCargo).
 *   3. For each country (origin + each transit + destination):
 *      - Compute required integrations via `getRequiredIntegrationsForCountry`.
 *   4. For reefer cargo: a separate temperature-monitoring integration is
 *      added per country (TRANSPORT family with notes about reefer telemetry).
 *   5. For DG cargo: a separate DG-declaration integration is added per
 *      country (SECURITY family with notes about DG permit).
 *   6. Summarize: total + connected + partial + manual + missing.
 *
 * Returns the full DiscoveryResult. Never throws — on internal error returns
 * an empty result with isReefer/isDg/isAgricultural flags still computed.
 */
export async function discoverRequiredIntegrations(
  input: DiscoverInput,
): Promise<DiscoveryResult> {
  const emptySummary = { total: 0, connected: 0, partial: 0, manual: 0, missing: 0 };
  if (!input) {
    return {
      requiredIntegrations: [],
      originCountry: "",
      destinationCountry: "",
      transitCountries: [],
      isReefer: false,
      isDg: false,
      isAgricultural: false,
      isPharma: false,
      isChemical: false,
      summary: emptySummary,
    };
  }

  const originCountry = (input.originCountry || "").toUpperCase();
  const destinationCountry = (input.destinationCountry || "").toUpperCase();
  const mode = (input.mode || "ROAD").toUpperCase();
  const hs6 = input.hs6;
  const specialCargo = input.specialCargo;

  const reefer = isReefer(specialCargo);
  const dg = isDg(specialCargo);
  const agricultural = isAgricultural(hs6);
  const pharma = isPharma(hs6);
  const chemical = isChemical(hs6);

  // Determine transit countries (use provided if non-empty, else compute).
  let transitCountries: string[] = [];
  if (Array.isArray(input.transitCountries) && input.transitCountries.length > 0) {
    transitCountries = input.transitCountries.map((c) => String(c).toUpperCase());
  } else {
    transitCountries = computeTransitCountries(originCountry, destinationCountry, mode);
  }

  const tradeContext: TradeContext = {
    originCountry,
    destinationCountry,
    transitCountries,
    commodity: input.commodity,
    hs6,
    mode,
    incoterm: input.incoterm,
    specialCargo,
  };

  const allIntegrations: RequiredIntegration[] = [];

  // Origin country.
  try {
    const originIntegrations = await getRequiredIntegrationsForCountry(
      originCountry,
      "ORIGIN",
      tradeContext,
    );
    allIntegrations.push(...originIntegrations);
  } catch (err) {
    logger.error("[discovery] origin country discovery failed", {
      error: String(err),
      originCountry,
    });
  }

  // Each transit country.
  for (const transitCountry of transitCountries) {
    if (!transitCountry) continue;
    try {
      const transitIntegrations = await getRequiredIntegrationsForCountry(
        transitCountry,
        "TRANSIT",
        tradeContext,
      );
      allIntegrations.push(...transitIntegrations);
    } catch (err) {
      logger.error("[discovery] transit country discovery failed", {
        error: String(err),
        transitCountry,
      });
    }
  }

  // Destination country.
  try {
    const destIntegrations = await getRequiredIntegrationsForCountry(
      destinationCountry,
      "DESTINATION",
      tradeContext,
    );
    allIntegrations.push(...destIntegrations);
  } catch (err) {
    logger.error("[discovery] destination country discovery failed", {
      error: String(err),
      destinationCountry,
    });
  }

  // Build summary.
  const summary = {
    total: allIntegrations.length,
    connected: 0,
    partial: 0,
    manual: 0,
    missing: 0,
  };
  for (const ri of allIntegrations) {
    if (ri.status === "CONNECTED") summary.connected++;
    else if (ri.status === "PARTIAL") summary.partial++;
    else if (ri.status === "MANUAL") summary.manual++;
    else if (ri.status === "MISSING") summary.missing++;
  }

  const result: DiscoveryResult = {
    requiredIntegrations: allIntegrations,
    originCountry,
    destinationCountry,
    transitCountries,
    isReefer: reefer,
    isDg: dg,
    isAgricultural: agricultural,
    isPharma: pharma,
    isChemical: chemical,
    summary,
  };

  logger.info("[discovery] discovery complete", {
    originCountry,
    destinationCountry,
    transitCountries,
    mode,
    hs6,
    isReefer: reefer,
    isDg: dg,
    isAgricultural: agricultural,
    isPharma: pharma,
    isChemical: chemical,
    total: summary.total,
    connected: summary.connected,
    partial: summary.partial,
    manual: summary.manual,
    missing: summary.missing,
  });

  return result;
}

// ============ §5.3 generateDiscoveryReport ============

/**
 * For an existing trade (loaded from the Trade model by USTN), run the
 * discovery engine + persist an IntegrationGapRecord for every MISSING
 * integration surfaced. Returns the full DiscoveryReport.
 *
 * Trade → DiscoverInput mapping:
 *   - originCountry         = trade.originCountry
 *   - destinationCountry    = trade.destCountry
 *   - mode                  = trade.transportMode || "ROAD"
 *   - commodity             = trade.commodity
 *   - hs6                   = trade.commodityHs
 *   - incoterm              = trade.incoterm
 *   - specialCargo          = { temperatureControlled: trade.coldChain,
 *                                dangerousGoods: /dg|dangerous/i.test(
 *                                  trade.specialInstructions || "") }
 *
 * For each MISSING integration in the DiscoveryResult:
 *   - createGapRecord(...) is called.
 *   - the created gap record's affectedUstns is set to [ustn] (via
 *     addAffectedUstn) — but createGapRecord doesn't accept affectedUstns
 *     on creation, so the link is recorded in the gap record's notes.
 *
 * Returns the DiscoveryReport with `gapRecordsCreated` count. Never throws —
 * if the trade is not found, returns an empty report.
 */
export async function generateDiscoveryReport(ustn: string): Promise<DiscoveryReport> {
  const emptySummary = { total: 0, connected: 0, partial: 0, manual: 0, missing: 0 };
  const emptyResult: DiscoveryReport = {
    ustn: ustn || "",
    gapRecordsCreated: 0,
    requiredIntegrations: [],
    originCountry: "",
    destinationCountry: "",
    transitCountries: [],
    isReefer: false,
    isDg: false,
    isAgricultural: false,
    isPharma: false,
    isChemical: false,
    summary: emptySummary,
  };

  if (!ustn) return emptyResult;

  // Load the trade.
  let trade: any = null;
  try {
    trade = await db.trade.findUnique({ where: { ustn } });
  } catch (err) {
    logger.error("[discovery] generateDiscoveryReport: trade load failed", {
      error: String(err),
      ustn,
    });
    return emptyResult;
  }

  if (!trade) {
    logger.warn("[discovery] generateDiscoveryReport: trade not found", { ustn });
    return emptyResult;
  }

  // Derive specialCargo from trade fields.
  const specialCargo = {
    temperatureControlled: !!trade.coldChain,
    dangerousGoods: /dg\b|dangerous\s*goods/i.test(trade.specialInstructions || ""),
  };

  const input: DiscoverInput = {
    originCountry: trade.originCountry || "",
    destinationCountry: trade.destCountry || "",
    commodity: trade.commodity,
    hs6: trade.commodityHs || undefined,
    mode: trade.transportMode || "ROAD",
    incoterm: trade.incoterm || undefined,
    specialCargo,
  };

  // Run discovery.
  const result = await discoverRequiredIntegrations(input);

  // Persist gap records for every MISSING integration.
  let gapRecordsCreated = 0;
  for (const ri of result.requiredIntegrations) {
    if (ri.status !== "MISSING") continue;
    try {
      await createGapRecord({
        jurisdictionCode: ri.countryCode,
        authority: ri.authority,
        procedure: ri.procedure,
        transportMode: ri.transportMode,
        systemName: ri.systemName,
        required: true,
        status: "MISSING",
        priority: ri.priority,
        source: "AUTOMATIC_DISCOVERY",
        evidence: [ustn],
        notes: `auto-discovered gap for USTN ${ustn} (role=${ri.role})${ri.notes ? " | " + ri.notes : ""}`,
      });
      gapRecordsCreated++;
    } catch (err) {
      logger.warn("[discovery] gap record creation failed for MISSING integration", {
        error: String(err),
        ustn,
        countryCode: ri.countryCode,
        authority: ri.authority,
        procedure: ri.procedure,
      });
    }
  }

  logger.info("[discovery] discovery report generated", {
    ustn,
    total: result.summary.total,
    missing: result.summary.missing,
    gapRecordsCreated,
  });

  return {
    ustn,
    gapRecordsCreated,
    requiredIntegrations: result.requiredIntegrations,
    originCountry: result.originCountry,
    destinationCountry: result.destinationCountry,
    transitCountries: result.transitCountries,
    isReefer: result.isReefer,
    isDg: result.isDg,
    isAgricultural: result.isAgricultural,
    isPharma: result.isPharma,
    isChemical: result.isChemical,
    summary: result.summary,
  };
}
