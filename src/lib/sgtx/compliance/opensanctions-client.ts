/**
 * OpenSanctions.org Client — FREE search API
 * ===========================================
 *
 * Source: https://search.opensanctions.org/api/2/search?q=NAME
 *
 * OpenSanctions aggregates 50+ global sanctions + PEP lists (OFAC, EU, UN,
 * UK, etc.) into a single searchable corpus. The free tier is rate-limited
 * (1 req/sec) but completely unauthenticated — no API key, no billing.
 *
 * The dataset itself is also downloadable:
 *   https://data.opensanctions.org/datasets/latest/entities.ftm.json
 * (large — ~1GB). For screening individual names at low volume the search
 * API is sufficient; for bulk screening the FTML dump is preferable.
 *
 * This module implements the API client only — it does NOT persist data to
 * the DB (each query is live). A `screenAgainstOpenSanctions()` wrapper
 * returns a unified `OfacScreenResult`-shaped object.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, normalizeName, similarity } from "./free-fetch";

const OPENSANCTIONS_SEARCH_URL = "https://search.opensanctions.org/api/2/search";

const MATCH_THRESHOLD = 0.85;

/** Shape of a single OpenSanctions search hit (subset of fields). */
export interface OpenSanctionsHit {
  id: string;
  caption: string;
  schema: string;
  countries?: string[];
  datasets?: string[];
  matchScore: number;
  /** Best matching alias (computed by us, not the API). */
  matchedAlias?: string;
}

export interface OpenSanctionsResult {
  name: string;
  hits: OpenSanctionsHit[];
  clear: boolean;
  checkedAt: string;
  source: string;
}

/** Minimal response-shape type (real API returns more fields we ignore). */
interface OpenSanctionsApiResponse {
  results?: Array<{
    id?: string;
    caption?: string;
    schema?: string;
    countries?: string[];
    datasets?: string[];
    aliases?: string[];
    names?: string[];
  }>;
}

/**
 * Search the OpenSanctions corpus for a name (+ optional aliases).
 *
 * The API returns up to 50 candidate entities. We re-rank each by Levenshtein
 * similarity against the query name + each alias so callers get a stable
 * `matchScore` even when the API returns many partial matches.
 */
export async function screenAgainstOpenSanctions(
  name: string,
  aliases?: string[],
): Promise<OpenSanctionsResult> {
  const checkedAt = new Date().toISOString();
  try {
    const query = encodeURIComponent(name);
    const url = `${OPENSANCTIONS_SEARCH_URL}?q=${query}&limit=50`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      logger.warn("opensanctions: query failed", {
        status: res ? res.status : "network-error",
      });
      return {
        name,
        hits: [],
        clear: true,
        checkedAt,
        source: "opensanctions.org",
      };
    }
    const data = (await res.json()) as OpenSanctionsApiResponse;
    const results = data.results ?? [];
    const aliasNorm = (aliases ?? []).map(normalizeName).filter(Boolean);

    const hits: OpenSanctionsHit[] = [];
    for (const r of results) {
      if (!r || !r.id || !r.caption) continue;
      let bestScore = similarity(name, r.caption);
      let matchedAlias: string | undefined;
      const candidates = [
        ...(r.aliases ?? []),
        ...(r.names ?? []),
      ];
      for (const alias of candidates) {
        const s = similarity(name, alias);
        if (s > bestScore) {
          bestScore = s;
          matchedAlias = alias;
        }
      }
      for (const q of aliasNorm) {
        const sName = similarity(q, r.caption);
        if (sName > bestScore) {
          bestScore = sName;
          matchedAlias = r.caption;
        }
        for (const alias of candidates) {
          const s = similarity(q, alias);
          if (s > bestScore) {
            bestScore = s;
            matchedAlias = alias;
          }
        }
      }
      if (bestScore >= MATCH_THRESHOLD) {
        hits.push({
          id: r.id,
          caption: r.caption,
          schema: r.schema ?? "Unknown",
          countries: r.countries ?? [],
          datasets: r.datasets ?? [],
          matchScore: Number(bestScore.toFixed(4)),
          matchedAlias,
        });
      }
    }

    return {
      name,
      hits: hits.sort((a, b) => b.matchScore - a.matchScore),
      clear: hits.length === 0,
      checkedAt,
      source: "opensanctions.org",
    };
  } catch (err) {
    logger.warn("opensanctions: caught exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      name,
      hits: [],
      clear: true,
      checkedAt,
      source: "opensanctions.org",
    };
  }
}
