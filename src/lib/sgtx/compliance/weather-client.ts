/**
 * Open-Meteo — FREE port weather client (no API key)
 * ===================================================
 *
 * Source: https://api.open-meteo.com/v1/forecast?latitude=X&longitude=Y
 *
 * Open-Meteo is the free, no-auth weather API operated by the Open-Meteo
 * Foundation. It provides:
 *   - Current weather (temperature, wind, weather code)
 *   - Hourly + daily forecast (up to 16 days)
 *   - Marine data (wave height, swell direction) — beta
 *
 * Used by:
 *   - Vessel ETA prediction (wind speed affects pilot boarding)
 *   - Force-majeure detection (cyclones / storms ≥ Beaufort 10)
 *   - Port condition dashboards
 *
 * Public endpoint. No API key, no billing. CC BY 4.0 attribution required.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "@/lib/sgtx/compliance/free-fetch";

const OPEN_METEO_FORECAST_URL = "https://api.open-meteo.com/v1/forecast";

/** WMO weather interpretation codes — abbreviated mapping. */
const WMO_DESCRIPTIONS: Record<number, string> = {
  0: "Clear sky",
  1: "Mainly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Fog",
  48: "Depositing rime fog",
  51: "Light drizzle",
  53: "Moderate drizzle",
  55: "Dense drizzle",
  56: "Light freezing drizzle",
  57: "Dense freezing drizzle",
  61: "Slight rain",
  63: "Moderate rain",
  65: "Heavy rain",
  66: "Light freezing rain",
  67: "Heavy freezing rain",
  71: "Slight snow fall",
  73: "Moderate snow fall",
  75: "Heavy snow fall",
  77: "Snow grains",
  80: "Slight rain showers",
  81: "Moderate rain showers",
  82: "Violent rain showers",
  85: "Slight snow showers",
  86: "Heavy snow showers",
  95: "Thunderstorm",
  96: "Thunderstorm with slight hail",
  99: "Thunderstorm with heavy hail",
};

export interface PortWeather {
  lat: number;
  lng: number;
  temperature: number;        // °C
  windSpeed: number;           // km/h
  weatherCode: number;         // WMO code
  description: string;
  syncedAt: string;
  source: string;
}

interface OpenMeteoApiResponse {
  current?: {
    temperature_2m?: number;
    wind_speed_10m?: number;
    weather_code?: number;
    time?: string;
  };
}

/** Convert a WMO weather code to a human-readable description. */
export function describeWeatherCode(code: number): string {
  return WMO_DESCRIPTIONS[code] ?? `Weather code ${code}`;
}

/**
 * Fetch the current weather at a coordinate. Optionally persists the result
 * to `WeatherData` keyed by `portUnlocode` (when supplied).
 *
 * Returns `null` if the request fails. Callers should fall back to the
 * existing vessel ETA model without weather adjustment.
 */
export async function getPortWeather(
  lat: number,
  lng: number,
  portUnlocode?: string,
): Promise<PortWeather | null> {
  try {
    const params = new URLSearchParams({
      latitude: lat.toFixed(4),
      longitude: lng.toFixed(4),
      current: "temperature_2m,wind_speed_10m,weather_code",
      timezone: "auto",
    });
    const url = `${OPEN_METEO_FORECAST_URL}?${params}`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      logger.warn("weather: open-meteo fetch failed", {
        status: res ? res.status : "network",
        lat,
        lng,
      });
      return null;
    }
    const data = (await res.json()) as OpenMeteoApiResponse;
    const cur = data.current;
    if (!cur || cur.temperature_2m == null || cur.wind_speed_10m == null || cur.weather_code == null) {
      return null;
    }
    const weatherCode = cur.weather_code;
    const weather: PortWeather = {
      lat,
      lng,
      temperature: cur.temperature_2m,
      windSpeed: cur.wind_speed_10m,
      weatherCode,
      description: describeWeatherCode(weatherCode),
      syncedAt: new Date().toISOString(),
      source: "open-meteo.com",
    };

    // Persist (non-fatal).
    try {
      await db.weatherData.create({
        data: {
          portUnlocode: portUnlocode ?? null,
          lat,
          lng,
          temperature: weather.temperature,
          windSpeed: weather.windSpeed,
          weatherCode: weather.weatherCode,
          description: weather.description,
        },
      });
    } catch (persistErr) {
      logger.warn("weather: persist failed", {
        error: persistErr instanceof Error ? persistErr.message : String(persistErr),
      });
    }

    return weather;
  } catch (err) {
    logger.warn("weather: caught exception", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Convenience: get the latest persisted weather snapshot for a port.
 * Returns `null` if no snapshot exists.
 */
export async function getLatestPortWeather(portUnlocode: string): Promise<{
  lat: number;
  lng: number;
  temperature: number;
  windSpeed: number;
  weatherCode: number;
  description: string | null;
  syncedAt: string;
} | null> {
  try {
    const row = await db.weatherData.findFirst({
      where: { portUnlocode },
      orderBy: { syncedAt: "desc" },
    });
    if (!row) return null;
    return {
      lat: row.lat,
      lng: row.lng,
      temperature: row.temperature,
      windSpeed: row.windSpeed,
      weatherCode: row.weatherCode,
      description: row.description,
      syncedAt: row.syncedAt.toISOString(),
    };
  } catch (err) {
    logger.warn("weather: getLatestPortWeather failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Sync weather snapshots for the top-N ports we care about (used by the
 * daily cron). Pulls port coordinates from `UnlocodeEntry` where the row
 * has coordinates AND looks like a port (function starts with "1").
 *
 * This is best-effort — failures are logged but not fatal.
 */
export async function syncPortWeatherBatch(limit = 50): Promise<{
  ok: boolean;
  fetched: number;
  errors: string[];
  durationMs: number;
}> {
  const start = Date.now();
  const errors: string[] = [];
  let fetched = 0;

  try {
    const ports = await db.unlocodeEntry.findMany({
      where: {
        function: { startsWith: "1" },
        coordinates: { not: null },
      },
      take: limit,
      orderBy: { unlocode: "asc" },
    });

    for (const p of ports) {
      try {
        // Coordinates stored as "lat,lng" — but UN/LOCODE format is
        // "DDMM[N/S] DDDMM[E/W]". The UN/LOCODE sync stores raw, so we
        // need to parse. For now we only fetch if we can parse as decimal.
        if (!p.coordinates) continue;
        const parts = p.coordinates.split(/[ ,]+/).filter(Boolean);
        if (parts.length < 2) continue;
        const lat = parseFloat(parts[0]);
        const lng = parseFloat(parts[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
        // Open-Meteo allows max 60 requests/minute for free tier.
        await new Promise((r) => setTimeout(r, 1100));
        const w = await getPortWeather(lat, lng, p.unlocode);
        if (w) fetched++;
      } catch (e) {
        errors.push(`${p.unlocode}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    await logSync({
      integration: "weather",
      source: "open-meteo.com",
      durationMs: Date.now() - start,
      recordsUpserted: fetched,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errors,
    });
    return { ok: errors.length === 0, fetched, errors, durationMs: Date.now() - start };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    await logSync({
      integration: "weather",
      source: "open-meteo.com",
      durationMs: Date.now() - start,
      recordsUpserted: 0,
      status: "FAILED",
      errors,
    });
    return { ok: false, fetched: 0, errors, durationMs: Date.now() - start };
  }
}
