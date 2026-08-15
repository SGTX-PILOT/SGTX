/**
 * Vessel Finder — FREE public endpoint (best-effort)
 * ====================================================
 *
 * Source: https://www.vesselfinder.com/api/pub/clickmap/shiplist
 *
 * Vessel Finder's public clickmap endpoint returns a JSON list of vessels
 * currently visible in a bounding box. The endpoint is unauthenticated
 * but heavily rate-limited and tends to return 403 if the User-Agent
 * doesn't look like a real browser. We attempt a real fetch and fall
 * back to the existing mock vessel tracker in `ai/vessel-tracking.ts`
 * if the request fails.
 *
 * Public endpoint. No API key, no billing. Treated as best-effort.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";

const VF_SHIP_LIST_URL = "https://www.vesselfinder.com/api/pub/clickmap/shiplist";

export interface VesselFinderVessel {
  mmsi?: number;
  imo?: number;
  shipname?: string;
  shiptype?: number;
  lat?: number;
  lng?: number;
  speed?: number;
  course?: number;
  heading?: number;
  status?: number;
  length?: number;
  width?: number;
  draught?: number;
  flag?: string;
  destination?: string;
  eta?: number;
  ts?: number;
  source?: string;
}

export interface VesselFinderQuery {
  /** Bounding-box top-left / bottom-right coordinates. */
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
  /** Optional ship-type filter (0 = all, 1 = cargo, 2 = tanker, etc.). */
  shipType?: number;
}

/**
 * Query the public Vessel Finder clickmap endpoint for the current vessel
 * list inside a bounding box. Returns `[]` on any failure (rate limit,
 * 403, network error). Callers should treat this as a real-but-best-effort
 * feed and gracefully degrade to the existing mock tracker.
 */
export async function fetchVesselFinderShipList(
  q: VesselFinderQuery,
): Promise<VesselFinderVessel[]> {
  try {
    const params = new URLSearchParams({
      bbox: `${q.minLng},${q.minLat},${q.maxLng},${q.maxLat}`,
    });
    if (q.shipType != null) params.set("type", String(q.shipType));
    const url = `${VF_SHIP_LIST_URL}?${params}`;
    const res = await fetchWithTimeout(url, {
      headers: {
        Accept: "application/json",
        // VF tends to 403 if the UA is empty or looks bot-like.
        "User-Agent":
          "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Referer: "https://www.vesselfinder.com/",
      },
    });
    if (!res || !res.ok) {
      logger.warn("vesselfinder: fetch failed", {
        status: res ? res.status : "network",
      });
      return [];
    }
    const data = (await res.json()) as VesselFinderVessel[] | { shiplist?: VesselFinderVessel[] };
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray(data.shiplist)) {
      return data.shiplist;
    }
    return [];
  } catch (err) {
    logger.warn("vesselfinder: caught exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
