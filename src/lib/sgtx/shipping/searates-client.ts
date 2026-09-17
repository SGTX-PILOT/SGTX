/**
 * Searates Port Congestion Client (freemium, public endpoints, defensive)
 * =============================================================================
 *
 * Source: https://api.searates.com/marine/v2/port-congestion?port={UNLOCODE}
 *
 *   Searates is a freemium maritime-data platform. The port-congestion
 *   endpoint is documented publicly but is gated by an API key for most
 *   callers — anonymous requests frequently 403. We handle that gracefully:
 *
 *     1. Try the live endpoint with our SGTX user-agent.
 *     2. If it 200/2xx: parse and cache for 6 hours (congestion shifts fast).
 *     3. If it 401/403/404: fall back to a berth-count heuristic.
 *     4. If it times out or 5xx: fall back to a berth-count heuristic.
 *
 *   The berth-count heuristic uses static knowledge of each top-20 port's
 *   container terminal capacity (in TEU/year) and berth count — a proxy
 *   for congestion. This is NOT real-time data; it's a stable best-effort
 *   approximation that the SGTX Brain can use when no live feed is available.
 *
 * What this gives SGTX:
 *   • Port congestion level (low/medium/high) per top-20 container port.
 *   • Average vessel wait time at anchorage (hours).
 *   • Vessel count currently in port / at berth / waiting.
 *   • Cached in-memory (6h TTL) — no Prisma model needed (per task spec).
 *
 * Exports:
 *   • getPortCongestion(unlocode)  — single port (live → heuristic fallback)
 *   • getTopPortCongestion()        — top-20 snapshot
 *   • syncPortCongestion()          — bulk refresh
 *
 * Public endpoints. API key optional (live data when provided via env).
 * Failures are non-fatal: every code path returns a best-effort result.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";

const SEARATES_BASE = "https://api.searates.com/marine/v2/port-congestion";

/** In-memory cache TTL — 6 hours (congestion shifts fast). */
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/** Polite gap between sequential fetches during bulk sync. */
const SYNC_DELAY_MS = 250;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type CongestionLevel = "low" | "medium" | "high";

export interface PortCongestion {
  unlocode: string;
  name: string;
  country: string;
  congestionLevel: CongestionLevel;
  avgWaitHours: number;
  vesselCount: number;
  /** When the data was fetched (ISO timestamp). */
  fetchedAt: string;
  /** Whether the data came from the live Searates API or the heuristic. */
  source: "searates-live" | "heuristic-bethcount";
}

export interface PortCongestionSyncResult {
  ok: boolean;
  portsProcessed: number;
  liveCount: number;
  heuristicCount: number;
  errors: string[];
  durationMs: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Top 20 global container ports (UN/LOCODE + berth capacity metadata)
// ─────────────────────────────────────────────────────────────────────────────

interface TopPortMeta {
  unlocode: string;
  name: string;
  country: string;
  /** Approximate annual TEU throughput (millions). Used by the heuristic. */
  teuMillions: number;
  /** Approximate berth count. Used by the heuristic. */
  berths: number;
}

/**
 * The top 20 global container ports by TEU throughput (2023 figures).
 * Used by the Brain OS to rank trade corridors + estimate port delays.
 */
export const TOP_20_PORTS: readonly TopPortMeta[] = Object.freeze([
  { unlocode: "CNSHA", name: "Shanghai",     country: "CN", teuMillions: 49.2, berths: 125 },
  { unlocode: "SGSIN", name: "Singapore",    country: "SG", teuMillions: 38.6, berths: 67  },
  { unlocode: "CNNGB", name: "Ningbo",      country: "CN", teuMillions: 33.5, berths: 109 },
  { unlocode: "CNSZX", name: "Shenzhen",    country: "CN", teuMillions: 30.4, berths: 100 },
  { unlocode: "CNCAN", name: "Guangzhou",   country: "CN", teuMillions: 23.5, berths: 78  },
  { unlocode: "KRPUS", name: "Busan",       country: "KR", teuMillions: 22.0, berths: 56  },
  { unlocode: "CNTAO", name: "Qingdao",     country: "CN", teuMillions: 24.8, berths: 91  },
  { unlocode: "HKHKG", name: "Hong Kong",   country: "HK", teuMillions: 16.5, berths: 24  },
  { unlocode: "CNTSN", name: "Tianjin",     country: "CN", teuMillions: 18.5, berths: 65  },
  { unlocode: "NLRTM", name: "Rotterdam",   country: "NL", teuMillions: 13.5, berths: 47  },
  { unlocode: "BEANR", name: "Antwerp",     country: "BE", teuMillions: 13.0, berths: 60  },
  { unlocode: "DEHAM", name: "Hamburg",     country: "DE", teuMillions: 8.5,  berths: 30  },
  { unlocode: "USLAX", name: "Los Angeles", country: "US", teuMillions: 8.4,  berths: 22  },
  { unlocode: "USLGB", name: "Long Beach",  country: "US", teuMillions: 8.1,  berths: 22  },
  { unlocode: "USNYC", name: "New York",    country: "US", teuMillions: 7.6,  berths: 35  },
  { unlocode: "AEJEA", name: "Jebel Ali",   country: "AE", teuMillions: 13.9, berths: 23  },
  { unlocode: "LKCOL", name: "Colombo",     country: "LK", teuMillions: 7.2,  berths: 14  },
  { unlocode: "VNSGN", name: "Ho Chi Minh", country: "VN", teuMillions: 7.0,  berths: 24  },
  { unlocode: "THLCH", name: "Laem Chabang",country: "TH", teuMillions: 7.7,  berths: 21  },
  { unlocode: "EGALY", name: "Alexandria",  country: "EG", teuMillions: 3.5,  berths: 17  },
]);

// ─────────────────────────────────────────────────────────────────────────────
// In-memory cache — `Map<unlocode, { value, expiresAt }>` with 6h TTL
// ─────────────────────────────────────────────────────────────────────────────

interface CacheEntry {
  value: PortCongestion;
  expiresAt: number;
}

const congestionCache = new Map<string, CacheEntry>();

function getCached(unlocode: string): PortCongestion | undefined {
  const key = unlocode.toUpperCase();
  const entry = congestionCache.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    congestionCache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(value: PortCongestion, ttlMs: number = CACHE_TTL_MS): void {
  congestionCache.set(value.unlocode.toUpperCase(), {
    value,
    expiresAt: Date.now() + ttlMs,
  });
}

/** Clear the in-memory cache — exposed for tests + ops. */
export function clearPortCongestionCache(): void {
  congestionCache.clear();
}

/** Returns the current cache size — used by the status route. */
export function portCongestionCacheSize(): number {
  return congestionCache.size;
}

// ─────────────────────────────────────────────────────────────────────────────
// Heuristic fallback — used when Searates 403s / times out / errors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Best-effort congestion estimate derived from a port's berth count + TEU
 * throughput. Larger ports with proportionally more berths are less likely
 * to be congested; smaller ports with high throughput tend to be backed up.
 *
 * Formula (deterministic + per-port stable):
 *   utilization ≈ teuMillions / max(berths, 1)
 *   congestionLevel = low if utilization < 0.35, medium < 0.55, else high
 *   avgWaitHours   = clamp(utilization * 30, 6, 72) hours
 *   vesselCount    = ceil(berths * (0.6 + utilization * 0.8))
 *
 * This is NOT real-time. It's a sensible default when the live API fails.
 */
function heuristicCongestion(meta: TopPortMeta): PortCongestion {
  const berths = Math.max(1, meta.berths);
  const utilization = meta.teuMillions / berths; // TEU per berth (millions)
  let level: CongestionLevel;
  if (utilization < 0.35) level = "low";
  else if (utilization < 0.55) level = "medium";
  else level = "high";

  const avgWaitHours = Math.round(Math.min(72, Math.max(6, utilization * 30)));
  const vesselCount = Math.ceil(berths * (0.6 + utilization * 0.8));

  return {
    unlocode: meta.unlocode,
    name: meta.name,
    country: meta.country,
    congestionLevel: level,
    avgWaitHours,
    vesselCount,
    fetchedAt: new Date().toISOString(),
    source: "heuristic-bethcount",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Live fetch — try Searates public endpoint, fall back to heuristic on failure
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Searates API response shape (defensive — only the fields we use).
 * The actual payload is much richer; we extract only the key signals.
 */
interface SearatesPortCongestionResponse {
  status?: string;
  data?: {
    port?: {
      unlocode?: string;
      name?: string;
      country?: string;
    };
    congestion?: {
      level?: string;          // "low" | "medium" | "high" | numeric
      avg_wait_time?: number;  // hours
      vessels_in_port?: number;
      vessels_at_berth?: number;
      vessels_waiting?: number;
    };
  };
  // Some Searates endpoints return a top-level array instead.
  message?: string;
}

function normalizeCongestionLevel(raw: unknown): CongestionLevel {
  if (typeof raw === "string") {
    const v = raw.toLowerCase().trim();
    if (v === "low" || v === "medium" || v === "high") return v;
    if (v.includes("low")) return "low";
    if (v.includes("high")) return "high";
    return "medium";
  }
  if (typeof raw === "number") {
    if (raw < 33) return "low";
    if (raw < 66) return "medium";
    return "high";
  }
  return "medium";
}

function metaForUnlocode(unlocode: string): TopPortMeta | null {
  const key = unlocode.toUpperCase();
  for (const p of TOP_20_PORTS) {
    if (p.unlocode === key) return p;
  }
  return null;
}

/**
 * Fetch live congestion for a single port from Searates.
 * If the API 403s / times out / returns garbage, fall back to the
 * berth-count heuristic — NEVER throw.
 */
export async function getPortCongestion(unlocode: string): Promise<PortCongestion> {
  const cc = (unlocode ?? "").toUpperCase().trim();
  const meta = metaForUnlocode(cc);

  if (!/^[A-Z]{2}[A-Z0-9]{3}$/.test(cc) || !meta) {
    // Unknown UN/LOCODE — return a low-confidence heuristic with placeholder
    // values so the caller still gets a structurally valid result.
    return {
      unlocode: cc || "UNKNOWN",
      name: meta?.name ?? "Unknown",
      country: meta?.country ?? "??",
      congestionLevel: "medium",
      avgWaitHours: 24,
      vesselCount: 10,
      fetchedAt: new Date().toISOString(),
      source: "heuristic-bethcount",
    };
  }

  const cached = getCached(cc);
  if (cached) return cached;

  // Try the live Searates endpoint.
  try {
    const url = `${SEARATES_BASE}?port=${encodeURIComponent(cc)}`;
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    // Searates accepts an API key via the `Api-Key` header or query param.
    // The endpoint is documented as public but in practice frequently 403s
    // for anonymous callers. If a key is present in env, use it.
    const apiKey = process.env.SEARATES_API_KEY;
    if (apiKey) {
      headers["Api-Key"] = apiKey;
    }

    const res = await fetchWithTimeout(url, { headers });

    if (res && res.ok) {
      try {
        const body = (await res.json()) as SearatesPortCongestionResponse;
        const port = body?.data?.port ?? {};
        const cong = body?.data?.congestion ?? {};
        const vesselsInPort = typeof cong.vessels_in_port === "number" ? cong.vessels_in_port : 0;
        const vesselsAtBerth = typeof cong.vessels_at_berth === "number" ? cong.vessels_at_berth : 0;
        const vesselsWaiting = typeof cong.vessels_waiting === "number" ? cong.vessels_waiting : 0;

        const result: PortCongestion = {
          unlocode: cc,
          name: port.name ?? meta.name,
          country: port.country ?? meta.country,
          congestionLevel: normalizeCongestionLevel(cong.level),
          avgWaitHours:
            typeof cong.avg_wait_time === "number" && cong.avg_wait_time > 0
              ? Math.round(cong.avg_wait_time)
              : Math.round(meta.teuMillions / Math.max(meta.berths, 1) * 30),
          vesselCount: Math.max(
            vesselsInPort,
            vesselsAtBerth + vesselsWaiting,
            1,
          ),
          fetchedAt: new Date().toISOString(),
          source: "searates-live",
        };
        setCached(result);
        return result;
      } catch (parseErr) {
        // Body wasn't JSON or was malformed — fall back to heuristic.
        logger.warn("searates: JSON parse failed, using heuristic", {
          unlocode: cc,
          error: parseErr instanceof Error ? parseErr.message : String(parseErr),
        });
      }
    } else {
      // 401/403/404/5xx — fall back silently. This is the expected path for
      // freemium callers without an API key.
      if (res) {
        logger.debug("searates: non-200, using heuristic", {
          unlocode: cc,
          status: res.status,
        });
      }
    }
  } catch (err) {
    // Network / timeout — fall back silently.
    logger.warn("searates: fetch failed, using heuristic", {
      unlocode: cc,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // Heuristic fallback (cached for 6h, same TTL as live data).
  const heuristic = heuristicCongestion(meta);
  setCached(heuristic);
  return heuristic;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bulk sync — refresh all top-20 ports sequentially (polite gap between calls)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Refresh congestion data for all top-20 global container ports. Sequential
 * with a polite delay between calls to avoid tripping Searates' rate limit.
 *
 * Always returns successfully — failures are recorded in `errors[]` and the
 * corresponding port falls back to the heuristic.
 */
export async function syncPortCongestion(): Promise<PortCongestionSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let liveCount = 0;
  let heuristicCount = 0;

  for (const meta of TOP_20_PORTS) {
    try {
      const result = await getPortCongestion(meta.unlocode);
      if (result.source === "searates-live") liveCount++;
      else heuristicCount++;
    } catch (err) {
      // getPortCongestion never throws, but defensive — if it ever does,
      // record the error and move on.
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${meta.unlocode}: ${msg}`);
      heuristicCount++;
    }
    // Polite gap between fetches to be a good citizen.
    await new Promise((r) => setTimeout(r, SYNC_DELAY_MS));
  }

  logger.info("searates port-congestion sync completed", {
    portsProcessed: TOP_20_PORTS.length,
    liveCount,
    heuristicCount,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    portsProcessed: TOP_20_PORTS.length,
    liveCount,
    heuristicCount,
    errors,
    durationMs: Date.now() - start,
  };
}

/**
 * Snapshot of all top-20 ports' congestion. Returns cached data when
 * available; otherwise fetches fresh (which will silently fall back to the
 * heuristic if Searates is unavailable).
 */
export async function getTopPortCongestion(): Promise<PortCongestion[]> {
  return Promise.all(TOP_20_PORTS.map((p) => getPortCongestion(p.unlocode)));
}
