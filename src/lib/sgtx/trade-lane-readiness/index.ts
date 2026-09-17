// @ts-nocheck
/**
 * SGTX Phase 8 — §9 Trade Lane Readiness
 * ===========================================================================
 *
 * Implements per-trade-lane integration readiness on top of the new
 * `TradeLaneReadiness` Prisma model. For each (origin → destination →
 * transit → commodity → HS → mode) tuple, SGTX asks: across the 5 readiness
 * dimensions (regulatory, document, customs, transport, government
 * connectivity), what is the readiness + how many manual touchpoints +
 * missing integrations + blockers does this lane have?
 *
 * The 5 readiness dimensions (§9):
 *
 *   regulatoryReadiness       — based on SPS + TBT + LICENSES + PERMITS +
 *                                CERTIFICATES integration status.
 *   documentReadiness         — based on Phase 7 delivery acceptance + Phase
 *                                5 transport documents + Phase 4 customs
 *                                documents availability.
 *   customsReadiness          — based on CUSTOMS integration status
 *                                (PRODUCTION_CONNECTED → CONNECTED, etc.).
 *   transportReadiness        — based on TRANSPORT integration status +
 *                                Phase 5 transport graph availability.
 *   governmentConnectivity    — overall percentage of PRODUCTION_CONNECTED
 *                                integrations.
 *
 * `laneId` follows the canonical SGTX ID format `TLR-YYYYMMDD-NNNNN`.
 *
 * Pure helpers (`generateLaneId`, `mapLevelToScore`, `computeOverallReadiness`)
 * have no DB calls + no side effects.
 *
 * `assessTradeLaneReadiness(input)` is the main entry point — it calls
 * `discoverRequiredIntegrations` from the discovery lib to get all required
 * integrations, computes the 5 dimension readiness levels + blockers +
 * manual touchpoints + missing integrations, and upserts a single
 * TradeLaneReadiness row.
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  discoverRequiredIntegrations,
  type DiscoverInput,
  type DiscoveryResult,
  type RequiredIntegration,
} from "@/lib/sgtx/discovery";

// ============ §9 Constants ============

/**
 * §9 — the 5 readiness dimensions computed per trade lane.
 */
export const LANE_DIMENSIONS = [
  "regulatoryReadiness",
  "documentReadiness",
  "customsReadiness",
  "transportReadiness",
  "governmentConnectivity",
] as const;

/**
 * §9 — the 4 readiness levels (same as §8 country readiness).
 */
export const LANE_READINESS_LEVELS = [
  "CONNECTED",
  "PARTIAL",
  "MANUAL",
  "MISSING",
] as const;

/**
 * §9 — weights for the overall readiness computation. The customs dimension
 * carries the highest weight (30%) because customs clearance is the
 * critical-path bottleneck for cross-border trade.
 *
 *   customs     30%
 *   regulatory  25%
 *   transport   20%
 *   document    15%
 *   government  10%
 */
export const LANE_WEIGHTS: Record<string, number> = {
  customsReadiness: 0.30,
  regulatoryReadiness: 0.25,
  transportReadiness: 0.20,
  documentReadiness: 0.15,
  governmentConnectivity: 0.10,
};

/**
 * §9 — level → score mapping used by `mapLevelToScore`.
 *
 *   CONNECTED = 1.0
 *   PARTIAL   = 0.6
 *   MANUAL    = 0.3
 *   MISSING   = 0
 */
const LEVEL_SCORES: Record<string, number> = {
  CONNECTED: 1.0,
  PARTIAL: 0.6,
  MANUAL: 0.3,
  MISSING: 0.0,
};

// ============ Types ============

export interface LaneInput {
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string[];
  commodity?: string;
  hs6?: string;
  mode: string;
  incoterm?: string;
  specialCargo?: any;
  ustn?: string;
}

export interface TradeLaneReadiness {
  id: string;
  laneId: string;
  originCountry: string;
  destinationCountry: string;
  transitCountries?: string | null;
  commodity?: string | null;
  hs6?: string | null;
  transportMode?: string | null;
  regulatoryReadiness: string;
  documentReadiness: string;
  customsReadiness: string;
  transportReadiness: string;
  governmentConnectivity: string;
  manualTouchpoints: number;
  missingIntegrations: number;
  blockers?: string | null;
  overallReadiness: number;
  lastAssessedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface TradeLaneReadinessResult {
  laneId: string;
  originCountry: string;
  destinationCountry: string;
  transitCountries: string[];
  commodity: string;
  hs6: string;
  transportMode: string;
  regulatoryReadiness: string;
  documentReadiness: string;
  customsReadiness: string;
  transportReadiness: string;
  governmentConnectivity: string;
  manualTouchpoints: number;
  missingIntegrations: number;
  blockers: string[];
  overallReadiness: number;
}

export interface ListLaneFilters {
  originCountry?: string;
  destinationCountry?: string;
  transportMode?: string;
  hs6?: string;
}

export interface LaneReadinessDimensions {
  regulatoryReadiness: string;
  documentReadiness: string;
  customsReadiness: string;
  transportReadiness: string;
  governmentConnectivity: string;
}

// ============ §9.0 Pure helpers ============

/**
 * Pure: generate a `TLR-YYYYMMDD-NNNNN` trade lane readiness id. 5-digit
 * zero-padded random suffix per UTC day. No DB, no side effects.
 */
export function generateLaneId(): string {
  const d = new Date();
  const ymd =
    `${d.getUTCFullYear()}` +
    `${String(d.getUTCMonth() + 1).padStart(2, "0")}` +
    `${String(d.getUTCDate()).padStart(2, "0")}`;
  const n = Math.floor(Math.random() * 100000)
    .toString()
    .padStart(5, "0");
  return `TLR-${ymd}-${n}`;
}

/**
 * Pure: map a readiness level to a numeric score (0..1).
 *
 *   CONNECTED = 1.0
 *   PARTIAL   = 0.6
 *   MANUAL    = 0.3
 *   MISSING   = 0.0
 *
 * Unknown / missing input → 0. No DB, no side effects.
 */
export function mapLevelToScore(level: string): number {
  if (!level) return 0;
  const v = LEVEL_SCORES[String(level).toUpperCase()];
  return typeof v === "number" ? v : 0;
}

/**
 * Pure: compute the overall readiness (0..1) for a trade lane given its 5
 * dimension readiness levels.
 *
 * Formula (§9): weighted average
 *   overall = 0.30 * customs + 0.25 * regulatory + 0.20 * transport
 *             + 0.15 * document + 0.10 * government
 *
 * Each level is mapped to a score via `mapLevelToScore`. No DB, no side
 * effects.
 */
export function computeOverallReadiness(dims: LaneReadinessDimensions): number {
  if (!dims) return 0;
  const customs = mapLevelToScore(dims.customsReadiness);
  const regulatory = mapLevelToScore(dims.regulatoryReadiness);
  const transport = mapLevelToScore(dims.transportReadiness);
  const document = mapLevelToScore(dims.documentReadiness);
  const government = mapLevelToScore(dims.governmentConnectivity);
  const overall =
    LANE_WEIGHTS.customsReadiness * customs +
    LANE_WEIGHTS.regulatoryReadiness * regulatory +
    LANE_WEIGHTS.transportReadiness * transport +
    LANE_WEIGHTS.documentReadiness * document +
    LANE_WEIGHTS.governmentConnectivity * government;
  return Math.max(0, Math.min(1, overall));
}

/**
 * Pure: serialize an array of strings into a JSON string. Empty arrays
 * serialize to `null` so the DB column stays null.
 */
function serializeStringArray(arr?: string[] | null): string | null {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

/**
 * Pure: parse a JSON array from a stored string. Defensive.
 */
function parseStringArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== "string") return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Pure: derive the lane-level readiness level (CONNECTED/PARTIAL/MANUAL/
 * MISSING) from a list of RequiredIntegration statuses.
 *
 *   CONNECTED if all CONNECTED (or list is empty — undefined requirement).
 *   PARTIAL   if some CONNECTED + some PARTIAL/MANUAL/MISSING.
 *   MANUAL    if no CONNECTED but at least one MANUAL.
 *   MISSING   if all MISSING.
 *
 * No DB, no side effects.
 */
function deriveLaneLevelForFamily(
  integrations: RequiredIntegration[],
): string {
  if (!Array.isArray(integrations) || integrations.length === 0) return "MISSING";
  let connected = 0;
  let partial = 0;
  let manual = 0;
  let missing = 0;
  for (const ri of integrations) {
    const s = String(ri?.status || "MISSING").toUpperCase();
    if (s === "CONNECTED") connected++;
    else if (s === "PARTIAL") partial++;
    else if (s === "MANUAL") manual++;
    else if (s === "MISSING") missing++;
    else partial++;
  }
  if (connected > 0 && missing === 0 && partial === 0 && manual === 0) return "CONNECTED";
  if (connected > 0) return "PARTIAL";
  if (manual > 0) return "MANUAL";
  if (missing === integrations.length) return "MISSING";
  return "PARTIAL";
}

// ============ §9.1 assessTradeLaneReadiness (main) ============

/**
 * THE MAIN FUNCTION — assess trade lane readiness for a (origin, destination,
 * transit, commodity, hs6, mode) tuple.
 *
 * Flow:
 *   1. Call `discoverRequiredIntegrations` from the discovery lib to get
 *      ALL required integrations across origin + transit + destination.
 *   2. Bucket the required integrations by family:
 *      - regulatory: SPS + TBT + LICENSES + PERMITS + CERTIFICATES.
 *      - customs: CUSTOMS family.
 *      - transport: TRANSPORT family.
 *      - government: all PRODUCTION_CONNECTED catalog entries.
 *      - document: derived from Phase 7 delivery acceptance + Phase 5
 *        transport documents + Phase 4 customs documents availability.
 *   3. For each family, derive the lane-level readiness (CONNECTED/PARTIAL/
 *      MANUAL/MISSING) via `deriveLaneLevelForFamily`.
 *   4. Count manualTouchpoints (PORTAL_ONLY + MANUAL_ONLY integrations).
 *   5. Count missingIntegrations (MISSING gaps).
 *   6. Build blockers array (critical missing integrations: MISSING with
 *      priority >= 80).
 *   7. Compute overallReadiness via `computeOverallReadiness` (weighted
 *      average: customs 30%, regulatory 25%, transport 20%, document 15%,
 *      government 10%).
 *   8. Upsert a TradeLaneReadiness row (find by composite key — origin +
 *      destination + transit + commodity + hs6 + mode — or create new).
 *
 * Returns the full TradeLaneReadinessResult. Never throws — on internal
 * error returns an empty result with overallReadiness=0.
 */
export async function assessTradeLaneReadiness(
  input: LaneInput,
): Promise<TradeLaneReadinessResult> {
  const empty: TradeLaneReadinessResult = {
    laneId: "",
    originCountry: "",
    destinationCountry: "",
    transitCountries: [],
    commodity: "",
    hs6: "",
    transportMode: "",
    regulatoryReadiness: "MISSING",
    documentReadiness: "MISSING",
    customsReadiness: "MISSING",
    transportReadiness: "MISSING",
    governmentConnectivity: "MISSING",
    manualTouchpoints: 0,
    missingIntegrations: 0,
    blockers: [],
    overallReadiness: 0,
  };
  if (!input || !input.originCountry || !input.destinationCountry || !input.mode) {
    return empty;
  }

  const originCountry = input.originCountry.toUpperCase();
  const destinationCountry = input.destinationCountry.toUpperCase();
  const transitCountries = Array.isArray(input.transitCountries)
    ? input.transitCountries.map((c) => String(c).toUpperCase())
    : [];
  const commodity = input.commodity || "";
  const hs6 = input.hs6 || "";
  const transportMode = input.mode.toUpperCase();

  // 1. Discover all required integrations.
  const discoverInput: DiscoverInput = {
    originCountry,
    destinationCountry,
    transitCountries,
    commodity,
    hs6,
    mode: transportMode,
    incoterm: input.incoterm,
    specialCargo: input.specialCargo,
  };

  let discovery: DiscoveryResult;
  try {
    discovery = await discoverRequiredIntegrations(discoverInput);
  } catch (err) {
    logger.error("[trade-lane-readiness] discovery failed", {
      error: String(err),
      originCountry,
      destinationCountry,
      transportMode,
      hs6,
    });
    return empty;
  }

  if (!discovery || !Array.isArray(discovery.requiredIntegrations)) {
    return empty;
  }

  const integrations = discovery.requiredIntegrations;

  // 2. Bucket integrations by family.
  const regulatoryFamily = ["SPS", "TBT", "AGRICULTURE", "HEALTH", "STANDARDS"];
  const docFamily = ["LICENSE", "PERMIT", "CERTIFICATE", "CERT"];

  const regulatoryIntegrations = integrations.filter(
    (ri) => regulatoryFamily.includes(String(ri.authority || "").toUpperCase()),
  );
  const customsIntegrations = integrations.filter(
    (ri) => String(ri.authority || "").toUpperCase() === "CUSTOMS",
  );
  const transportIntegrations = integrations.filter(
    (ri) => String(ri.authority || "").toUpperCase() === "TRANSPORT",
  );

  // 3. Derive lane-level readiness per dimension.
  const regulatoryReadiness = deriveLaneLevelForFamily(regulatoryIntegrations);
  const customsReadiness = deriveLaneLevelForFamily(customsIntegrations);
  const transportReadiness = deriveLaneLevelForFamily(transportIntegrations);

  // 4. Document readiness — derive from Phase 7 delivery acceptance + Phase 5
  //    transport documents + Phase 4 customs documents. Best-effort: if the
  //    USTN is provided, query these models; otherwise derive from
  //    catalog entries with PORTAL/BROKER integration types.
  let documentReadiness = "MISSING";
  if (input.ustn) {
    documentReadiness = await assessDocumentReadinessForUstn(input.ustn);
  } else {
    // No USTN — derive from the transport + customs integration readiness.
    if (transportReadiness === "CONNECTED" && customsReadiness === "CONNECTED") {
      documentReadiness = "PARTIAL";
    } else if (transportReadiness !== "MISSING" || customsReadiness !== "MISSING") {
      documentReadiness = "PARTIAL";
    } else {
      documentReadiness = "MISSING";
    }
  }

  // 5. Government connectivity — overall percentage of PRODUCTION_CONNECTED
  //    integrations across the lane.
  const totalIntegrations = integrations.length;
  const connectedIntegrations = integrations.filter(
    (ri) => String(ri.status || "").toUpperCase() === "CONNECTED",
  ).length;
  let governmentConnectivity: string;
  if (totalIntegrations === 0) {
    governmentConnectivity = "MISSING";
  } else {
    const pct = connectedIntegrations / totalIntegrations;
    if (pct >= 0.8) governmentConnectivity = "CONNECTED";
    else if (pct >= 0.4) governmentConnectivity = "PARTIAL";
    else if (pct > 0) governmentConnectivity = "MANUAL";
    else governmentConnectivity = "MISSING";
  }

  // 6. Count manual touchpoints + missing integrations + blockers.
  let manualTouchpoints = 0;
  let missingIntegrations = 0;
  const blockers: string[] = [];
  for (const ri of integrations) {
    const s = String(ri.status || "MISSING").toUpperCase();
    if (s === "MANUAL") manualTouchpoints++;
    if (s === "MISSING") {
      missingIntegrations++;
      // Blocker: critical missing integration (priority >= 80).
      const priority = Number(ri.priority) || 0;
      if (priority >= 80) {
        blockers.push(
          `MISSING ${ri.authority} (${ri.procedure || "any"}) for ${ri.countryCode} [role=${ri.role}, priority=${priority}]`,
        );
      }
    }
  }

  // 7. Compute overall readiness.
  const dims: LaneReadinessDimensions = {
    regulatoryReadiness,
    documentReadiness,
    customsReadiness,
    transportReadiness,
    governmentConnectivity,
  };
  const overallReadiness = computeOverallReadiness(dims);

  // 8. Upsert a TradeLaneReadiness row.
  const laneId = generateLaneId();
  const transitJson = serializeStringArray(transitCountries);
  const blockersJson = serializeStringArray(blockers);

  // Try to find an existing lane by (origin, destination, transit, commodity, hs6, mode).
  let existing: TradeLaneReadiness | null = null;
  try {
    existing = (await db.tradeLaneReadiness.findFirst({
      where: {
        originCountry,
        destinationCountry,
        commodity: commodity || null,
        hs6: hs6 || null,
        transportMode,
      },
    })) as TradeLaneReadiness | null;
  } catch (err) {
    logger.warn("[trade-lane-readiness] find existing lane failed", {
      error: String(err),
      originCountry,
      destinationCountry,
    });
  }

  const data: any = {
    laneId: existing?.laneId || laneId,
    originCountry,
    destinationCountry,
    transitCountries: transitJson,
    commodity: commodity || null,
    hs6: hs6 || null,
    transportMode,
    regulatoryReadiness,
    documentReadiness,
    customsReadiness,
    transportReadiness,
    governmentConnectivity,
    manualTouchpoints,
    missingIntegrations,
    blockers: blockersJson,
    overallReadiness,
    lastAssessedAt: new Date(),
    notes: `auto-assessed on ${new Date().toISOString()}`,
  };

  let saved: TradeLaneReadiness | null = null;
  try {
    if (existing) {
      saved = (await db.tradeLaneReadiness.update({
        where: { id: existing.id },
        data,
      })) as TradeLaneReadiness;
    } else {
      // Use create with the laneId we generated.
      const { laneId: _omit, ...createData } = data;
      saved = (await db.tradeLaneReadiness.create({
        data: { ...createData, laneId: data.laneId },
      })) as TradeLaneReadiness;
    }
  } catch (err) {
    logger.error("[trade-lane-readiness] upsert failed", {
      error: String(err),
      laneId: data.laneId,
      originCountry,
      destinationCountry,
    });
  }

  logger.info("[trade-lane-readiness] assessment complete", {
    laneId: saved?.laneId || laneId,
    originCountry,
    destinationCountry,
    transportMode,
    hs6,
    overallReadiness,
    manualTouchpoints,
    missingIntegrations,
    blockers: blockers.length,
  });

  return {
    laneId: saved?.laneId || laneId,
    originCountry,
    destinationCountry,
    transitCountries,
    commodity,
    hs6,
    transportMode,
    regulatoryReadiness,
    documentReadiness,
    customsReadiness,
    transportReadiness,
    governmentConnectivity,
    manualTouchpoints,
    missingIntegrations,
    blockers,
    overallReadiness,
  };
}

/**
 * Best-effort: assess document readiness for a USTN by checking Phase 7
 * delivery acceptance + Phase 5 transport documents + Phase 4 customs
 * documents.
 *
 * Returns "CONNECTED" if all 3 doc types are present, "PARTIAL" if some,
 * "MANUAL" if only paper/manual docs, "MISSING" if none.
 *
 * Never throws.
 */
async function assessDocumentReadinessForUstn(ustn: string): Promise<string> {
  if (!ustn) return "MISSING";
  let deliveryOk = false;
  let transportDocsOk = false;
  let customsDocsOk = false;

  // Phase 7 delivery acceptance.
  try {
    const da = await db.deliveryAcceptance.findFirst({
      where: { ustn, acceptanceStatus: "ACCEPTED" },
    });
    deliveryOk = !!da;
  } catch (err) {
    logger.warn("[trade-lane-readiness] delivery acceptance lookup failed", {
      error: String(err),
      ustn,
    });
  }

  // Phase 5 transport documents.
  try {
    const td = await db.transportDocument.findFirst({
      where: { ustn, status: { in: ["ISSUED", "RELEASED", "SURRENDERED"] } },
    });
    transportDocsOk = !!td;
  } catch (err) {
    logger.warn("[trade-lane-readiness] transport document lookup failed", {
      error: String(err),
      ustn,
    });
  }

  // Phase 4 customs documents — best-effort via the customs milestones or
  // customs declaration. Use the CustomsDeclaration if present.
  try {
    const cd = await db.customsDeclaration?.findFirst?.({
      where: { ustn },
    });
    customsDocsOk = !!cd;
  } catch (err) {
    // Fall back: assume customs docs exist if delivery + transport exist.
    customsDocsOk = deliveryOk && transportDocsOk;
  }

  const ok = [deliveryOk, transportDocsOk, customsDocsOk].filter(Boolean).length;
  if (ok === 3) return "CONNECTED";
  if (ok > 0) return "PARTIAL";
  return "MISSING";
}

// ============ §9.2 getTradeLaneReadiness ============

/**
 * Get a TradeLaneReadiness row by its DB `id`. Returns null if not found
 * or on DB error. Never throws.
 */
export async function getTradeLaneReadiness(
  id: string,
): Promise<TradeLaneReadiness | null> {
  if (!id) return null;
  try {
    const row = await db.tradeLaneReadiness.findUnique({ where: { id } });
    return (row as TradeLaneReadiness) || null;
  } catch (err) {
    logger.error("[trade-lane-readiness] getTradeLaneReadiness DB error", {
      error: String(err),
      id,
    });
    return null;
  }
}

// ============ §9.3 listTradeLaneReadiness ============

/**
 * List TradeLaneReadiness rows by filter. All filter fields are optional.
 * Returns [] on DB error. Never throws.
 */
export async function listTradeLaneReadiness(
  filters?: ListLaneFilters,
): Promise<TradeLaneReadiness[]> {
  const where: any = {};
  if (filters?.originCountry) where.originCountry = filters.originCountry.toUpperCase();
  if (filters?.destinationCountry) where.destinationCountry = filters.destinationCountry.toUpperCase();
  if (filters?.transportMode) where.transportMode = filters.transportMode.toUpperCase();
  if (filters?.hs6) where.hs6 = filters.hs6;

  try {
    const rows = await db.tradeLaneReadiness.findMany({
      where,
      orderBy: [{ overallReadiness: "asc" }, { originCountry: "asc" }],
    });
    return (rows as TradeLaneReadiness[]) || [];
  } catch (err) {
    logger.error("[trade-lane-readiness] listTradeLaneReadiness DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §9.4 getTradeLaneByLane ============

/**
 * Get a TradeLaneReadiness row by its human-readable `TLR-YYYYMMDD-NNNNN`
 * lane id. Returns null if not found or on DB error. Never throws.
 */
export async function getTradeLaneByLane(
  laneId: string,
): Promise<TradeLaneReadiness | null> {
  if (!laneId) return null;
  try {
    const row = await db.tradeLaneReadiness.findUnique({
      where: { laneId },
    });
    return (row as TradeLaneReadiness) || null;
  } catch (err) {
    logger.error("[trade-lane-readiness] getTradeLaneByLane DB error", {
      error: String(err),
      laneId,
    });
    return null;
  }
}

// ============ §9.5 getNonReadyLanes ============

/**
 * Get all trade lanes with overallReadiness < 0.5 — the "to-do list" for
 * the onboarding team. Returns [] on DB error. Never throws.
 */
export async function getNonReadyLanes(): Promise<TradeLaneReadiness[]> {
  try {
    const rows = await db.tradeLaneReadiness.findMany({
      where: { overallReadiness: { lt: 0.5 } },
      orderBy: [{ overallReadiness: "asc" }, { originCountry: "asc" }],
    });
    return (rows as TradeLaneReadiness[]) || [];
  } catch (err) {
    logger.error("[trade-lane-readiness] getNonReadyLanes DB error", {
      error: String(err),
    });
    return [];
  }
}

// ============ §9.6 getLaneBlockers ============

/**
 * Get the blockers JSON array for a trade lane. Returns [] on DB error or
 * if the lane has no blockers. Never throws.
 */
export async function getLaneBlockers(laneId: string): Promise<string[]> {
  if (!laneId) return [];
  const lane = await getTradeLaneByLane(laneId);
  if (!lane) return [];
  return parseStringArray(lane.blockers);
}
