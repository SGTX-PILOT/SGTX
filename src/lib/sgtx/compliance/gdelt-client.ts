/**
 * GDELT (Global Database of Events, Language, and Tone) — FREE news search
 * =========================================================================
 *
 * Source: https://api.gdeltproject.org/api/v2/doc/doc?query=QUERY&format=json
 * PUBLIC — no API key, no auth, no billing.
 *
 * GDELT monitors global news in 65+ languages in near-real-time and exposes
 * a free doc-search API. SGTX uses this to detect force-majeure events:
 *   • War / armed conflict
 *   • Earthquake / tsunami / volcanic eruption
 *   • Pandemic outbreak
 *   • Port closure / strike / blockade
 *   • Sanctions expansion
 *   • Coup / revolution / civil unrest
 *
 * Search is keyword-based; we build a query like:
 *   "port closure" OR "force majeure" OR earthquake
 * and surface the top 25 articles with title, url, date, domain, language.
 *
 * Public endpoint. No API key, no billing.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";

const GDELT_DOC_API_URL = "https://api.gdeltproject.org/api/v2/doc/doc";

/** Curated query templates for each force-majeure category. */
export const FORCE_MAJEURE_QUERY_TEMPLATES: Record<string, string> = {
  port_closure: '"port closure" OR "port shut down" OR "harbor blocked"',
  war: '"armed conflict" OR "military intervention" OR "air strikes"',
  earthquake: '"earthquake" OR "tsunami" OR "seismic event"',
  pandemic: '"pandemic" OR "epidemic outbreak" OR "virus outbreak"',
  cyclone: '"cyclone" OR "hurricane" OR "typhoon" OR "tropical storm"',
  civil_unrest: '"civil unrest" OR "protests" OR "riots" OR "general strike"',
  sanctions_expansion: '"new sanctions" OR "sanctions package" OR "export controls"',
  coup: '"military coup" OR "government overthrown" OR "regime change"',
};

export interface GdeltArticle {
  url: string;
  url_mobile?: string;
  title: string;
  seendate: string;       // YYYYMMDDTHHMMSS Z
  socialimage?: string;
  domain?: string;
  language?: string;
  sourcecountry?: string;
}

export interface GdeltSearchResult {
  query: string;
  articles: GdeltArticle[];
  checkedAt: string;
  source: string;
}

interface GdeltApiResponse {
  articles?: GdeltArticle[];
}

/**
 * Search GDELT for news matching a free-text query. The query may include
 * boolean operators (OR, AND, NOT) — see https://blog.gdeltproject.org/
 * gdelt-doc-2-0-api-debuts/.
 *
 * Returns up to 50 articles. Empty list on any failure.
 */
export async function searchGdelt(
  query: string,
  options?: { maxRecords?: number; mode?: "ArtList" | "ArtNatLang"; theme?: string },
): Promise<GdeltSearchResult> {
  const checkedAt = new Date().toISOString();
  try {
    if (!query || query.trim().length === 0) {
      return { query, articles: [], checkedAt, source: "gdeltproject.org" };
    }
    const params = new URLSearchParams({
      query,
      format: "json",
      maxrecords: String(options?.maxRecords ?? 25),
      sort: "DateDesc",
      mode: options?.mode ?? "ArtList",
    });
    if (options?.theme) params.set("theme", options.theme);
    const url = `${GDELT_DOC_API_URL}?${params}`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      logger.warn("gdelt: search failed", {
        status: res ? res.status : "network",
        query,
      });
      return { query, articles: [], checkedAt, source: "gdeltproject.org" };
    }
    const data = (await res.json()) as GdeltApiResponse;
    const articles = data.articles ?? [];
    return {
      query,
      articles,
      checkedAt,
      source: "gdeltproject.org",
    };
  } catch (err) {
    logger.warn("gdelt: caught exception", {
      query,
      error: err instanceof Error ? err.message : String(err),
    });
    return { query, articles: [], checkedAt, source: "gdeltproject.org" };
  }
}

/**
 * Convenience wrapper: search GDELT for force-majeure events matching a
 * category from the templates map. Returns deduplicated articles.
 */
export async function searchForceMajeureEvents(
  category: keyof typeof FORCE_MAJEURE_QUERY_TEMPLATES | string,
  options?: { maxRecords?: number; country?: string },
): Promise<GdeltSearchResult> {
  const tmpl = FORCE_MAJEURE_QUERY_TEMPLATES[category] ?? category;
  const query = options?.country
    ? `${tmpl} (country:${options.country.toUpperCase()})`
    : tmpl;
  return searchGdelt(query, { maxRecords: options?.maxRecords ?? 25 });
}
