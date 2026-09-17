/**
 * Country Data Sync — World Bank + flagcdn (TRULY FREE, no API key)
 * ===================================================================
 *
 * Sources (both PUBLIC, no API key, no auth, no billing):
 *
 *   6a. https://api.worldbank.org/v2/country?format=json&per_page=400
 *       Returns 297 country + aggregate records with: iso2Code, name,
 *       capitalCity, region, incomeLevel, longitude, latitude.
 *
 *   6b. https://flagcdn.com/{size}/{iso2}.png
 *       flagcdn.com is a free CDN serving flag images for every ISO 3166-1
 *       alpha-2 country code. No API key. Used to populate `flagUrl`.
 *
 * NOTE on REST Countries: the v3.1 endpoint was deprecated in 2025 and the
 * successor v5 API now requires an auth key. We've therefore removed the
 * dependency on restcountries.com and use the World Bank as the primary
 * source. The existing 195-country in-memory table in
 * `onboarding/countries.ts` (with currencies + dial codes) remains the
 * authoritative source for KYB forms; this module enriches it with live
 * income level + region metadata + flag URLs from flagcdn.
 *
 * Both feeds are persisted to the `CountryData` table keyed by ISO 3166-1
 * alpha-2 country code.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "@/lib/sgtx/compliance/free-fetch";

const WORLDBANK_COUNTRIES_URL =
  "https://api.worldbank.org/v2/country?format=json&per_page=400";

const FLAGCDN_BASE = "https://flagcdn.com/w320"; // 320px-wide PNG

export interface CountrySyncResult {
  ok: boolean;
  parsed: number;
  upserted: number;
  errors: string[];
  durationMs: number;
}

interface WorldBankCountriesApiResponse {
  // World Bank wraps the payload: `[ [meta], [country1, country2, ...] ]`.
  0?: unknown;
  1?: Array<{
    id?: string;
    iso2Code?: string;
    name?: string;
    capitalCity?: string;
    region?: { id?: string; iso2code?: string; value?: string };
    incomeLevel?: { id?: string; iso2code?: string; value?: string };
    longitude?: string;
    latitude?: string;
  }>;
}

/**
 * Sync country metadata from the World Bank. Each record is upserted to
 * `CountryData` keyed by ISO 3166-1 alpha-2 code.
 *
 * Aggregates (iso2 codes like "ZH", "ZJ", "Z4") are filtered out — only
 * 2-letter country codes are persisted.
 *
 * Flag URLs are constructed deterministically from the iso2 code via
 * flagcdn.com (`https://flagcdn.com/w320/{iso2_lower}.png`). No fetch
 * required — the URL is computed, not looked up.
 */
export async function syncCountries(): Promise<CountrySyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let parsed = 0;
  let upserted = 0;

  try {
    const res = await fetchWithTimeout(WORLDBANK_COUNTRIES_URL, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      errors.push(`worldbank fetch ${res ? res.status : "network"}`);
      await logSync({
        integration: "rest-countries",
        source: "api.worldbank.org/country+flagcdn.com",
        durationMs: Date.now() - start,
        recordsUpserted: 0,
        status: "FAILED",
        errors,
      });
      return { ok: false, parsed: 0, upserted: 0, errors, durationMs: Date.now() - start };
    }
    const data = (await res.json()) as WorldBankCountriesApiResponse;
    const rows = Array.isArray(data) ? data[1] : data["1"];
    if (!Array.isArray(rows)) {
      errors.push("worldbank: unexpected response shape");
      await logSync({
        integration: "rest-countries",
        source: "api.worldbank.org/country+flagcdn.com",
        durationMs: Date.now() - start,
        recordsUpserted: 0,
        status: "FAILED",
        errors,
      });
      return { ok: false, parsed: 0, upserted: 0, errors, durationMs: Date.now() - start };
    }
    parsed = rows.length;

    const CHUNK = 100;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const batch = rows.slice(i, i + CHUNK);
      try {
        await Promise.all(
          batch.map(async (r) => {
            if (!r || !r.iso2Code) return;
            const cc = r.iso2Code.toUpperCase();
            // Skip aggregates (World Bank returns region codes like "1A", "8S", "Z4").
            if (!/^[A-Z]{2}$/.test(cc)) return;
            const name = r.name ?? "";
            if (!name) return;
            const region = r.region?.value?.trim() || null;
            const incomeLevel = r.incomeLevel?.value?.trim() || null;
            const capital = r.capitalCity?.trim() || null;
            // Region "Aggregates" rows are skipped explicitly.
            if (region && region.toLowerCase() === "aggregates") return;
            const lat = r.latitude ? parseFloat(r.latitude) : NaN;
            const lng = r.longitude ? parseFloat(r.longitude) : NaN;
            const coordinates =
              Number.isFinite(lat) && Number.isFinite(lng)
                ? `${lat},${lng}`
                : null;
            const flagUrl = `${FLAGCDN_BASE}/${cc.toLowerCase()}.png`;

            await db.countryData.upsert({
              where: { countryCode: cc },
              create: {
                countryCode: cc,
                name,
                region,
                capital,
                incomeLevel,
                coordinates,
                flagUrl,
              },
              update: {
                name,
                region,
                capital,
                incomeLevel,
                coordinates,
                flagUrl,
                syncedAt: new Date(),
              },
            });
            upserted++;
          }),
        );
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        errors.push(`worldbank batch @ ${i}: ${msg}`);
      }
    }

    await logSync({
      integration: "rest-countries",
      source: "api.worldbank.org/country+flagcdn.com",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errors,
    });

    logger.info("countries sync completed", {
      parsed,
      upserted,
      errorsCount: errors.length,
      durationMs: Date.now() - start,
    });
    return { ok: errors.length === 0, parsed, upserted, errors, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await logSync({
      integration: "rest-countries",
      source: "api.worldbank.org/country+flagcdn.com",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: "FAILED",
      errors,
    });
    logger.error("countries sync failed", { error: msg });
    return { ok: false, parsed, upserted, errors, durationMs: Date.now() - start };
  }
}

/** Look up a country by ISO 3166-1 alpha-2 code (used for autocomplete). */
export async function getCountryData(countryCode: string): Promise<{
  countryCode: string;
  name: string;
  officialName: string | null;
  region: string | null;
  subregion: string | null;
  capital: string | null;
  currencies: string | null;
  languages: string | null;
  flagUrl: string | null;
  callingCode: string | null;
  coordinates: string | null;
  incomeLevel: string | null;
} | null> {
  try {
    const row = await db.countryData.findUnique({
      where: { countryCode: countryCode.toUpperCase() },
    });
    return row ?? null;
  } catch (err) {
    logger.warn("countries getCountryData failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}
