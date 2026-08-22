// @ts-nocheck
/**
 * SGTX Phase 8 — §8 Country Readiness
 * ===========================================================================
 *
 * Implements per-country integration readiness on top of the new
 * `CountryReadiness` Prisma model. For each country SGTX asks: across the
 * 15 readiness dimensions, is the integration CONNECTED, PARTIAL, MANUAL,
 * or MISSING?
 *
 * The 15 dimensions (§8):
 *
 *   CUSTOMS | TAX | SPS | TBT | LICENSES | PERMITS | CERTIFICATES |
 *   TRANSPORT | SECURITY | PAYMENT | INSURANCE | BROKER | ERP |
 *   ACCOUNTING | GOVERNMENT_APIS
 *
 * Readiness levels (§8):
 *
 *   CONNECTED — fully automated (at least one PRODUCTION/SANDBOX-connected
 *              catalog entry + no MISSING entries).
 *   PARTIAL   — some entries connected, some missing/in-progress.
 *   MANUAL    — no entries connected, but at least one PORTAL_ONLY/MANUAL_ONLY.
 *   MISSING   — no catalog entries exist at all for this dimension.
 *
 * Pure helpers (`mapAuthorityToDimension`, `computeReadinessLevel`,
 * `computeReadinessScore`) have no DB calls + no side effects.
 *
 * `assessCountryReadiness(countryCode)` is the main entry point — it loads
 * the IntegrationCatalog for the jurisdiction, groups entries by dimension,
 * counts per readiness level, computes the readinessScore, and upserts one
 * `CountryReadiness` row per dimension (composite @@unique on
 * (countryCode, dimension)).
 *
 * All DB calls are try/catch-wrapped with safe defaults — the engine never
 * throws synchronously into API routes.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  getCatalogByJurisdiction,
  isConnectorConnected,
  isConnectorUsable,
  type IntegrationCatalog,
} from "@/lib/sgtx/integration-catalog";

// ============ §8 Constants ============

/**
 * §8 — the 15 readiness dimensions. Each dimension is a category of
 * integration that a country needs to fully digitize cross-border trade.
 *
 * The first 12 dimensions map directly to IntegrationCatalog authorities
 * (CUSTOMS, TAX, SPS, TBT, TRANSPORT, SECURITY, BANK→PAYMENT, INSURANCE,
 * BROKER, ERP). The remaining 3 (LICENSES, PERMITS, CERTIFICATES,
 * ACCOUNTING, GOVERNMENT_APIS) are derived:
 *   - LICENSES/PERMITS/CERTIFICATES — Phase 3 ComplianceConnector data +
 *     catalog entries whose `procedure` mentions LICENSE/PERMIT/CERT.
 *   - ACCOUNTING — derived from connected ErpAdapter rows (Phase 6).
 *   - GOVERNMENT_APIS — count of PRODUCTION_CONNECTED catalog entries for
 *     the jurisdiction (any authority).
 */
export const DIMENSIONS = [
  "CUSTOMS",
  "TAX",
  "SPS",
  "TBT",
  "LICENSES",
  "PERMITS",
  "CERTIFICATES",
  "TRANSPORT",
  "SECURITY",
  "PAYMENT",
  "INSURANCE",
  "BROKER",
  "ERP",
  "ACCOUNTING",
  "GOVERNMENT_APIS",
] as const;

/**
 * §8 — the 4 readiness levels.
 */
export const READINESS_LEVELS = [
  "CONNECTED",
  "PARTIAL",
  "MANUAL",
  "MISSING",
] as const;

/**
 * Authority → dimension mapping. Used by `mapAuthorityToDimension`.
 *
 * AGRICULTURE + HEALTH both roll up to SPS (sanitary/phytosanitary).
 * STANDARDS rolls up to TBT (technical barriers to trade).
 * BANK rolls up to PAYMENT.
 *
 * Other authorities map 1:1 to dimensions of the same name.
 */
const AUTHORITY_TO_DIMENSION: Record<string, string> = {
  CUSTOMS: "CUSTOMS",
  TAX: "TAX",
  SPS: "SPS",
  TBT: "TBT",
  AGRICULTURE: "SPS",
  HEALTH: "SPS",
  STANDARDS: "TBT",
  SECURITY: "SECURITY",
  TRANSPORT: "TRANSPORT",
  BANK: "PAYMENT",
  INSURANCE: "INSURANCE",
  BROKER: "BROKER",
  ERP: "ERP",
};

// ============ Types ============

export interface CountryReadiness {
  id: string;
  countryCode: string;
  countryName?: string | null;
  dimension: string;
  readinessLevel: string;
  connectedCount: number;
  partialCount: number;
  manualCount: number;
  missingCount: number;
  readinessScore: number;
  lastAssessedAt?: Date | null;
  notes?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface DimensionResult {
  dimension: string;
  readinessLevel: string;
  connectedCount: number;
  partialCount: number;
  manualCount: number;
  missingCount: number;
  readinessScore: number;
}

export interface CountryReadinessResult {
  countryCode: string;
  countryName: string;
  dimensions: DimensionResult[];
  overallReadiness: number;
}

export interface CountryReadinessSummary {
  connected: number;
  partial: number;
  manual: number;
  missing: number;
  overallScore: number;
  dimensions: Array<{ dimension: string; level: string }>;
}

export interface ListReadinessFilters {
  countryCode?: string;
  dimension?: string;
  readinessLevel?: string;
}

export interface CountryReadinessOverview {
  countryCode: string;
  overallScore: number;
  connected: number;
  partial: number;
  manual: number;
  missing: number;
}

// ============ §8.0 Pure helpers ============

/**
 * Pure: map a catalog authority to a readiness dimension.
 *
 *   CUSTOMS → CUSTOMS, TAX → TAX, SPS → SPS, TBT → TBT
 *   AGRICULTURE → SPS, HEALTH → SPS (SPS family)
 *   STANDARDS → TBT (TBT family)
 *   SECURITY → SECURITY, TRANSPORT → TRANSPORT
 *   BANK → PAYMENT (banks handle payment connectivity)
 *   INSURANCE → INSURANCE, BROKER → BROKER, ERP → ERP
 *
 * Returns "GOVERNMENT_APIS" for unknown authorities (no direct dimension).
 * No DB, no side effects.
 */
export function mapAuthorityToDimension(authority: string): string {
  if (!authority) return "GOVERNMENT_APIS";
  const upper = String(authority).toUpperCase();
  return AUTHORITY_TO_DIMENSION[upper] || "GOVERNMENT_APIS";
}

/**
 * Pure: compute the readiness level given the 4 bucket counts.
 *
 *   CONNECTED if connected > 0 && missing == 0
 *   PARTIAL   if connected > 0 && missing > 0
 *   MANUAL    if connected == 0 && manual > 0
 *   MISSING   if all are 0 (or only missing > 0)
 *
 * No DB, no side effects.
 */
export function computeReadinessLevel(
  connected: number,
  partial: number,
  manual: number,
  missing: number,
): string {
  const c = Math.max(0, Math.floor(Number(connected) || 0));
  const p = Math.max(0, Math.floor(Number(partial) || 0));
  const m = Math.max(0, Math.floor(Number(manual) || 0));
  const x = Math.max(0, Math.floor(Number(missing) || 0));
  if (c > 0 && x === 0) return "CONNECTED";
  if (c > 0 && x > 0) return "PARTIAL";
  if (c === 0 && m > 0) return "MANUAL";
  return "MISSING";
}

/**
 * Pure: compute the readiness score (0..1) given the 4 bucket counts.
 *
 * Formula (§8): weighted average
 *   score = (1.0 * connected + 0.5 * partial + 0.2 * manual + 0 * missing) / total
 *
 * Returns 0 if total is 0 (no catalog entries → fully missing).
 * No DB, no side effects.
 */
export function computeReadinessScore(
  connected: number,
  partial: number,
  manual: number,
  missing: number,
): number {
  const c = Math.max(0, Number(connected) || 0);
  const p = Math.max(0, Number(partial) || 0);
  const m = Math.max(0, Number(manual) || 0);
  const x = Math.max(0, Number(missing) || 0);
  const total = c + p + m + x;
  if (total === 0) return 0;
  const score = (1.0 * c + 0.5 * p + 0.2 * m + 0.0 * x) / total;
  // Clamp to [0, 1] for safety.
  return Math.max(0, Math.min(1, score));
}

/**
 * Pure: bucket a catalog entry's status into one of the 4 readiness levels.
 *
 *   PRODUCTION_CONNECTED / SANDBOX_CONNECTED → CONNECTED
 *   PORTAL_ONLY / MANUAL_ONLY                → MANUAL
 *   NOT_DISCOVERED                          → MISSING
 *   DEPRECATED                              → MISSING (no longer usable)
 *   all others (DISCOVERED, ..., DEGRADED,
 *     OUTAGE)                               → PARTIAL
 *
 * No DB, no side effects.
 */
function bucketCatalogStatus(status: string): "connected" | "partial" | "manual" | "missing" {
  const s = String(status || "").toUpperCase();
  if (s === "PRODUCTION_CONNECTED" || s === "SANDBOX_CONNECTED") return "connected";
  if (s === "PORTAL_ONLY" || s === "MANUAL_ONLY") return "manual";
  if (s === "NOT_DISCOVERED" || s === "DEPRECATED") return "missing";
  return "partial";
}

/**
 * Pure: determine whether a catalog entry's procedure mentions LICENSE,
 * PERMIT, or CERT. Used to bucket entries into the LICENSES / PERMITS /
 * CERTIFICATES dimensions (which are document-driven, not authority-driven).
 *
 * Returns "LICENSES" | "PERMITS" | "CERTIFICATES" | null.
 */
function deriveDocDimension(catalogEntry: IntegrationCatalog): string | null {
  const proc = String(catalogEntry?.procedure || "").toUpperCase();
  const auth = String(catalogEntry?.authority || "").toUpperCase();
  const haystack = `${proc} ${auth}`;
  if (/LICENSE/.test(haystack)) return "LICENSES";
  if (/PERMIT/.test(haystack)) return "PERMITS";
  if (/CERT/.test(haystack)) return "CERTIFICATES";
  return null;
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

// ============ §8.1 assessCountryReadiness (main) ============

/**
 * THE MAIN FUNCTION — assess all 15 dimensions for a country.
 *
 * Flow:
 *   1. Load the IntegrationCatalog entries for this jurisdictionCode.
 *   2. For each entry, derive the dimension:
 *      - Use mapAuthorityToDimension for authority → dimension.
 *      - If the entry's procedure mentions LICENSE/PERMIT/CERT, additionally
 *        credit the LICENSES/PERMITS/CERTIFICATES dimension.
 *   3. For LICENSES/PERMITS/CERTIFICATES: also count Phase 3 doc models
 *      (ExportLicense, Certificate, etc.) for the jurisdiction.
 *   4. For ACCOUNTING: check if there is any connected ErpAdapter
 *      (Phase 6) worldwide.
 *   5. For GOVERNMENT_APIS: count of PRODUCTION_CONNECTED catalog entries
 *      for the jurisdiction (any authority).
 *   6. For each dimension, compute connected/partial/manual/missing counts +
 *      readinessLevel + readinessScore.
 *   7. Upsert one CountryReadiness row per dimension (composite @@unique on
 *      (countryCode, dimension)).
 *   8. Compute overallReadiness = average of dimension readinessScores.
 *
 * Returns the full CountryReadinessResult. Never throws — on internal
 * error returns an empty result with overallReadiness=0.
 */
export async function assessCountryReadiness(
  countryCode: string,
): Promise<CountryReadinessResult> {
  const empty: CountryReadinessResult = {
    countryCode: countryCode || "",
    countryName: countryCode || "",
    dimensions: [],
    overallReadiness: 0,
  };
  if (!countryCode) return empty;

  const code = countryCode.toUpperCase();

  // 1. Load catalog entries for the jurisdiction.
  let catalogEntries: IntegrationCatalog[] = [];
  try {
    catalogEntries = await getCatalogByJurisdiction(code);
  } catch (err) {
    logger.error("[country-readiness] catalog load failed", {
      error: String(err),
      countryCode: code,
    });
    catalogEntries = [];
  }

  // 2. Initialize dimension buckets: { connected, partial, manual, missing } per dimension.
  const buckets: Record<string, { connected: number; partial: number; manual: number; missing: number }> = {};
  for (const dim of DIMENSIONS) {
    buckets[dim] = { connected: 0, partial: 0, manual: 0, missing: 0 };
  }

  // 3. Bucket each catalog entry.
  for (const entry of catalogEntries) {
    if (!entry) continue;

    // Primary dimension: from authority.
    const dim = mapAuthorityToDimension(entry.authority || "");
    if (buckets[dim]) {
      const b = bucketCatalogStatus(entry.status);
      buckets[dim][b]++;
    }

    // Secondary dimension: from procedure (LICENSE/PERMIT/CERT).
    const docDim = deriveDocDimension(entry);
    if (docDim && buckets[docDim]) {
      const b = bucketCatalogStatus(entry.status);
      buckets[docDim][b]++;
    }
  }

  // 4. Phase 3 doc models for LICENSES / CERTIFICATES (best-effort).
  // LICENSES — ExportLicense rows with issuingAuthority matching the country.
  try {
    const licenses = await db.exportLicense.findMany({
      where: {
        OR: [
          { issuingAuthority: { contains: code } },
          { issuingAuthority: { contains: countryCode } },
        ],
        status: "ACTIVE",
      },
    });
    if (Array.isArray(licenses) && licenses.length > 0) {
      buckets["LICENSES"].connected += licenses.length;
    }
  } catch (err) {
    logger.warn("[country-readiness] ExportLicense lookup failed", {
      error: String(err),
      countryCode: code,
    });
  }

  // CERTIFICATES — Certificate rows with issuer referencing country (best-effort).
  try {
    const certs = await db.certificate.findMany({
      where: {
        status: "ACTIVE",
        OR: [
          { issuer: { contains: code } },
          { issuer: { contains: countryCode } },
        ],
      },
    });
    if (Array.isArray(certs) && certs.length > 0) {
      buckets["CERTIFICATES"].connected += certs.length;
    }
  } catch (err) {
    logger.warn("[country-readiness] Certificate lookup failed", {
      error: String(err),
      countryCode: code,
    });
  }

  // 5. ACCOUNTING — any connected ErpAdapter worldwide (Phase 6).
  try {
    const erpConnected = await db.erpAdapter.count({
      where: { status: "CONNECTED" },
    });
    if (erpConnected > 0) {
      buckets["ACCOUNTING"].connected += erpConnected;
    } else {
      buckets["ACCOUNTING"].missing += 1;
    }
  } catch (err) {
    logger.warn("[country-readiness] ErpAdapter lookup failed", {
      error: String(err),
      countryCode: code,
    });
    buckets["ACCOUNTING"].missing += 1;
  }

  // 6. GOVERNMENT_APIS — count of PRODUCTION_CONNECTED catalog entries for this jurisdiction.
  const govConnected = catalogEntries.filter(
    (e) => String(e.status || "").toUpperCase() === "PRODUCTION_CONNECTED",
  ).length;
  buckets["GOVERNMENT_APIS"].connected = govConnected;
  if (govConnected === 0) {
    // If there are any catalog entries (even non-connected), still mark MISSING
    // for the GOVERNMENT_APIS dimension — the country has no production API coverage.
    buckets["GOVERNMENT_APIS"].missing = Math.max(1, catalogEntries.length);
  }

  // For dimensions with NO catalog entries, mark as MISSING (1 missing).
  for (const dim of DIMENSIONS) {
    const b = buckets[dim];
    const total = b.connected + b.partial + b.manual + b.missing;
    if (total === 0) {
      b.missing = 1;
    }
  }

  // 7. Compute readinessLevel + score per dimension + upsert DB rows.
  const dimensions: DimensionResult[] = [];
  for (const dim of DIMENSIONS) {
    const b = buckets[dim];
    const level = computeReadinessLevel(b.connected, b.partial, b.manual, b.missing);
    const score = computeReadinessScore(b.connected, b.partial, b.manual, b.missing);
    dimensions.push({
      dimension: dim,
      readinessLevel: level,
      connectedCount: b.connected,
      partialCount: b.partial,
      manualCount: b.manual,
      missingCount: b.missing,
      readinessScore: score,
    });

    try {
      await db.countryReadiness.upsert({
        where: {
          countryCode_dimension: { countryCode: code, dimension: dim },
        },
        create: {
          countryCode: code,
          countryName: code,
          dimension: dim,
          readinessLevel: level,
          connectedCount: b.connected,
          partialCount: b.partial,
          manualCount: b.manual,
          missingCount: b.missing,
          readinessScore: score,
          lastAssessedAt: new Date(),
          notes: `auto-assessed on ${new Date().toISOString()}`,
        },
        update: {
          countryName: code,
          readinessLevel: level,
          connectedCount: b.connected,
          partialCount: b.partial,
          manualCount: b.manual,
          missingCount: b.missing,
          readinessScore: score,
          lastAssessedAt: new Date(),
          notes: `auto-assessed on ${new Date().toISOString()}`,
        },
      });
    } catch (err) {
      logger.error("[country-readiness] upsert failed", {
        error: String(err),
        countryCode: code,
        dimension: dim,
      });
    }
  }

  // 8. Overall readiness = average of dimension scores.
  const overall = dimensions.length > 0
    ? dimensions.reduce((sum, d) => sum + (Number(d.readinessScore) || 0), 0) / dimensions.length
    : 0;

  logger.info("[country-readiness] assessment complete", {
    countryCode: code,
    overallReadiness: overall,
    connected: dimensions.filter((d) => d.readinessLevel === "CONNECTED").length,
    partial: dimensions.filter((d) => d.readinessLevel === "PARTIAL").length,
    manual: dimensions.filter((d) => d.readinessLevel === "MANUAL").length,
    missing: dimensions.filter((d) => d.readinessLevel === "MISSING").length,
  });

  return {
    countryCode: code,
    countryName: code,
    dimensions,
    overallReadiness: overall,
  };
}

// ============ §8.2 getCountryReadiness ============

/**
 * Get ALL CountryReadiness rows for a country (all dimensions). Returns []
 * on DB error or if the country has never been assessed. Never throws.
 */
export async function getCountryReadiness(
  countryCode: string,
): Promise<CountryReadiness[]> {
  if (!countryCode) return [];
  try {
    const rows = await db.countryReadiness.findMany({
      where: { countryCode: countryCode.toUpperCase() },
      orderBy: [{ dimension: "asc" }],
    });
    return (rows as CountryReadiness[]) || [];
  } catch (err) {
    logger.error("[country-readiness] getCountryReadiness DB error", {
      error: String(err),
      countryCode,
    });
    return [];
  }
}

// ============ §8.3 getCountryReadinessByDimension ============

/**
 * Get a single CountryReadiness row by (countryCode, dimension). Returns
 * null if not found or on DB error. Never throws.
 */
export async function getCountryReadinessByDimension(
  countryCode: string,
  dimension: string,
): Promise<CountryReadiness | null> {
  if (!countryCode || !dimension) return null;
  try {
    const row = await db.countryReadiness.findUnique({
      where: {
        countryCode_dimension: {
          countryCode: countryCode.toUpperCase(),
          dimension: dimension.toUpperCase(),
        },
      },
    });
    return (row as CountryReadiness) || null;
  } catch (err) {
    logger.error("[country-readiness] getCountryReadinessByDimension DB error", {
      error: String(err),
      countryCode,
      dimension,
    });
    return null;
  }
}

// ============ §8.4 listCountryReadiness ============

/**
 * List CountryReadiness rows by filter. All filter fields are optional —
 * omit them to fetch all assessments worldwide. Returns [] on DB error.
 * Never throws.
 */
export async function listCountryReadiness(
  filters?: ListReadinessFilters,
): Promise<CountryReadiness[]> {
  const where: any = {};
  if (filters?.countryCode) where.countryCode = filters.countryCode.toUpperCase();
  if (filters?.dimension) where.dimension = filters.dimension.toUpperCase();
  if (filters?.readinessLevel) where.readinessLevel = filters.readinessLevel.toUpperCase();

  try {
    const rows = await db.countryReadiness.findMany({
      where,
      orderBy: [
        { countryCode: "asc" },
        { dimension: "asc" },
      ],
    });
    return (rows as CountryReadiness[]) || [];
  } catch (err) {
    logger.error("[country-readiness] listCountryReadiness DB error", {
      error: String(err),
      filters,
    });
    return [];
  }
}

// ============ §8.5 getCountryReadinessSummary ============

/**
 * Get a high-level readiness summary for a country:
 *   - counts of dimensions at each readiness level (CONNECTED/PARTIAL/MANUAL/MISSING)
 *   - overallScore (average of dimension readinessScores, 0..1)
 *   - per-dimension level list (for the readiness grid UI)
 *
 * Returns zeros + empty dimensions array if the country has never been
 * assessed. Never throws.
 */
export async function getCountryReadinessSummary(
  countryCode: string,
): Promise<CountryReadinessSummary> {
  const empty: CountryReadinessSummary = {
    connected: 0,
    partial: 0,
    manual: 0,
    missing: 0,
    overallScore: 0,
    dimensions: [],
  };
  if (!countryCode) return empty;

  const rows = await getCountryReadiness(countryCode);
  if (rows.length === 0) return empty;

  let connected = 0;
  let partial = 0;
  let manual = 0;
  let missing = 0;
  let scoreSum = 0;
  const dims: Array<{ dimension: string; level: string }> = [];

  for (const row of rows) {
    const level = String(row.readinessLevel || "MISSING").toUpperCase();
    if (level === "CONNECTED") connected++;
    else if (level === "PARTIAL") partial++;
    else if (level === "MANUAL") manual++;
    else missing++;
    scoreSum += Number(row.readinessScore) || 0;
    dims.push({ dimension: row.dimension, level });
  }

  return {
    connected,
    partial,
    manual,
    missing,
    overallScore: rows.length > 0 ? scoreSum / rows.length : 0,
    dimensions: dims,
  };
}

// ============ §8.6 getAllCountriesReadiness ============

/**
 * Get a worldwide readiness summary — one entry per assessed country with
 * its overallScore + per-level dimension counts. Used by the admin
 * dashboard's "country readiness map". Returns [] on DB error.
 * Never throws.
 */
export async function getAllCountriesReadiness(): Promise<CountryReadinessOverview[]> {
  let rows: CountryReadiness[] = [];
  try {
    rows = (await db.countryReadiness.findMany({
      orderBy: [{ countryCode: "asc" }],
    })) as CountryReadiness[];
  } catch (err) {
    logger.error("[country-readiness] getAllCountriesReadiness DB error", {
      error: String(err),
    });
    return [];
  }

  // Group by countryCode.
  const byCountry: Map<string, CountryReadiness[]> = new Map();
  for (const row of rows) {
    const arr = byCountry.get(row.countryCode) || [];
    arr.push(row);
    byCountry.set(row.countryCode, arr);
  }

  const out: CountryReadinessOverview[] = [];
  for (const [code, dimRows] of byCountry.entries()) {
    let connected = 0;
    let partial = 0;
    let manual = 0;
    let missing = 0;
    let scoreSum = 0;
    for (const r of dimRows) {
      const level = String(r.readinessLevel || "MISSING").toUpperCase();
      if (level === "CONNECTED") connected++;
      else if (level === "PARTIAL") partial++;
      else if (level === "MANUAL") manual++;
      else missing++;
      scoreSum += Number(r.readinessScore) || 0;
    }
    out.push({
      countryCode: code,
      overallScore: dimRows.length > 0 ? scoreSum / dimRows.length : 0,
      connected,
      partial,
      manual,
      missing,
    });
  }
  return out;
}
