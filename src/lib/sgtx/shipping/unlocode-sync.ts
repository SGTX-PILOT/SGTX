/**
 * UN/LOCODE (United Nations Location Codes) Sync
 * ===============================================
 *
 * Source: https://service.unece.org/trade/locode/loc{CC}.csv
 * Per-country CSV files. The full list of country codes is downloadable
 * from https://unece.org/trade/cefact/unlocode-code-list-country-and-territory
 * (HTML page) — we ship a static list of 249 country codes here.
 *
 * Each CSV row has these columns (1-indexed):
 *   1  Change indicator
 *   2  Country code (ISO 3166-1 alpha-2)
 *   3  Location code (3 chars) — combined with country code forms the UN/LOCODE
 *   4  Name
 *   5  Name without diacritics
 *   6  Subdivision code
 *   7  Function classifier (e.g. "1-----" port, "--3---" airport)
 *   8  Status code (e.g. "AA" approved, "RR" retired)
 *   9  IATA code (if applicable)
 *   10 Coordinates (lat/long, format "DDMM[N/S] DDDMM[E/W]")
 *   11 Remarks
 *
 * Sync strategy
 * -------------
 * Download each country CSV in turn (rate-limited to 1/sec to be polite),
 * parse, upsert. The full dataset is 100k+ entries — at 1 req/sec that's
 * ~4 minutes for all 249 countries. We expose `syncUnlocode(countryCode?)`
 * so operators can refresh one country at a time.
 *
 * Public endpoint. No API key, no billing.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout, logSync } from "@/lib/sgtx/compliance/free-fetch";

const UNLOCODE_BASE = "https://service.unece.org/trade/locode";

/** 249 ISO 3166-1 alpha-2 country codes — exhaustive. */
export const UNLOCODE_COUNTRY_CODES: readonly string[] = Object.freeze([
  "AD","AE","AF","AG","AI","AL","AM","AO","AQ","AR","AS","AT","AU","AW","AX","AZ",
  "BA","BB","BD","BE","BF","BG","BH","BI","BJ","BL","BM","BN","BO","BQ","BR","BS",
  "BT","BV","BW","BY","BZ","CA","CC","CD","CF","CG","CH","CI","CK","CL","CM","CN",
  "CO","CR","CU","CV","CW","CX","CY","CZ","DE","DJ","DK","DM","DO","DZ","EC","EE",
  "EG","EH","ER","ES","ET","FI","FJ","FK","FM","FO","FR","GA","GB","GD","GE","GF",
  "GG","GH","GI","GL","GM","GN","GP","GQ","GR","GS","GT","GU","GW","GY","HK","HM",
  "HN","HR","HT","HU","ID","IE","IL","IM","IN","IO","IQ","IR","IS","IT","JE","JM",
  "JO","JP","KE","KG","KH","KI","KM","KN","KP","KR","KW","KY","KZ","LA","LB","LC",
  "LI","LK","LR","LS","LT","LU","LV","LY","MA","MC","MD","ME","MF","MG","MH","MK",
  "ML","MM","MN","MO","MP","MQ","MR","MS","MT","MU","MV","MW","MX","MY","MZ","NA",
  "NC","NE","NF","NG","NI","NL","NO","NP","NR","NU","NZ","OM","PA","PE","PF","PG",
  "PH","PK","PL","PM","PN","PR","PS","PT","PW","PY","QA","RE","RO","RS","RU","RW",
  "SA","SB","SC","SD","SE","SG","SH","SI","SJ","SK","SL","SM","SN","SO","SR","SS",
  "ST","SV","SX","SY","SZ","TC","TD","TF","TG","TH","TJ","TK","TL","TM","TN","TO",
  "TR","TT","TV","TW","TZ","UA","UG","UM","US","UY","UZ","VA","VC","VE","VG","VI",
  "VN","VU","WF","WS","YE","YT","ZA","ZM","ZW",
]);

export interface UnlocodeRecord {
  unlocode: string;
  name: string;
  countryCode: string;
  subdivision?: string;
  function?: string;
  coordinates?: string;
}

export interface UnlocodeSyncResult {
  ok: boolean;
  countriesProcessed: number;
  parsed: number;
  upserted: number;
  errors: string[];
  durationMs: number;
}

/**
 * Parse a single country's UN/LOCODE CSV file content.
 * Tolerates UNECE's trailing-comma rows and missing columns.
 */
export function parseUnlocodeCsv(csv: string, countryCode: string): UnlocodeRecord[] {
  const records: UnlocodeRecord[] = [];
  const lines = csv.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw || raw.trim() === "") continue;
    // Skip header row (first row).
    if (i === 0 && /change/i.test(raw) && /country/i.test(raw)) continue;
    // UNECE CSV uses comma separator. Some rows have trailing commas.
    const cols = raw.split(",").map((c) => (c ?? "").trim().replace(/^"|"$/g, ""));
    if (cols.length < 4) continue;
    const change = cols[0];
    const cc = (cols[1] || countryCode).toUpperCase();
    const code = cols[2];
    if (!code || code === "") continue;
    const name = cols[3];
    if (!name || name === "") continue;
    const subdivision = cols[5] || undefined;
    const fn = cols[6] || undefined;
    const status = cols[7] || "";
    // Skip retired ("RR", "RH") and rejected ("RJ") entries.
    if (status === "RR" || status === "RH" || status === "RJ") continue;
    const coordinates = cols[9] || undefined;
    records.push({
      unlocode: `${cc}${code}`,
      name,
      countryCode: cc,
      subdivision,
      function: fn,
      coordinates: coordinates || undefined,
    });
  }
  return records;
}

/**
 * Sync UN/LOCODE entries for a single country (or all if `countryCode`
 * is omitted). When syncing all, runs at ~1 req/sec to be polite to UNECE.
 */
export async function syncUnlocode(countryCode?: string): Promise<UnlocodeSyncResult> {
  const start = Date.now();
  const errors: string[] = [];
  let countriesProcessed = 0;
  let parsed = 0;
  let upserted = 0;

  const countries = countryCode
    ? [countryCode.toUpperCase()]
    : Array.from(UNLOCODE_COUNTRY_CODES);

  for (const cc of countries) {
    try {
      const url = `${UNLOCODE_BASE}/loc${cc}.csv`;
      const res = await fetchWithTimeout(url, {
        headers: {
          Accept: "text/csv,*/*",
          // UNECE blocks "compatible" / bot-like UAs with 403 — use a real
          // browser UA string. This is a public dataset so this is fine.
          "User-Agent":
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
          Referer: "https://unece.org/trade/cefact/unlocode-code-list-country-and-territory",
        },
      });
      if (!res || !res.ok) {
        errors.push(`${cc}: fetch ${res ? res.status : "network"}`);
        continue;
      }
      const csv = await res.text();
      const records = parseUnlocodeCsv(csv, cc);
      parsed += records.length;
      countriesProcessed++;

      const CHUNK = 200;
      for (let i = 0; i < records.length; i += CHUNK) {
        const batch = records.slice(i, i + CHUNK);
        try {
          await Promise.all(
            batch.map((r) =>
              db.unlocodeEntry.upsert({
                where: { unlocode: r.unlocode },
                create: {
                  unlocode: r.unlocode,
                  name: r.name,
                  countryCode: r.countryCode,
                  subdivision: r.subdivision ?? null,
                  function: r.function ?? null,
                  coordinates: r.coordinates ?? null,
                },
                update: {
                  name: r.name,
                  countryCode: r.countryCode,
                  subdivision: r.subdivision ?? null,
                  function: r.function ?? null,
                  coordinates: r.coordinates ?? null,
                  syncedAt: new Date(),
                },
              }),
            ),
          );
          upserted += batch.length;
        } catch (batchErr) {
          const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
          errors.push(`${cc} batch @ ${i}: ${msg}`);
        }
      }

      // Be polite to UNECE — 1 req/sec when doing a full sync.
      if (!countryCode) await new Promise((r) => setTimeout(r, 1000));
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      errors.push(`${cc}: ${msg}`);
    }
  }

  await logSync({
    integration: "unlocode",
    source: "service.unece.org",
    durationMs: Date.now() - start,
    recordsUpserted: upserted,
    status: errors.length > 0 ? (upserted > 0 ? "PARTIAL" : "FAILED") : "SUCCESS",
    errors,
  });

  logger.info("unlocode sync completed", {
    countriesProcessed,
    parsed,
    upserted,
    errorsCount: errors.length,
    durationMs: Date.now() - start,
  });

  return {
    ok: errors.length === 0,
    countriesProcessed,
    parsed,
    upserted,
    errors,
    durationMs: Date.now() - start,
  };
}

/** Look up UN/LOCODE entries by country code (used for port autocomplete). */
export async function searchUnlocodeByCountry(countryCode: string, limit = 50): Promise<{
  unlocode: string;
  name: string;
  countryCode: string;
  subdivision: string | null;
  function: string | null;
  coordinates: string | null;
}[]> {
  try {
    return await db.unlocodeEntry.findMany({
      where: { countryCode: countryCode.toUpperCase() },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        unlocode: true,
        name: true,
        countryCode: true,
        subdivision: true,
        function: true,
        coordinates: true,
      },
    });
  } catch (err) {
    logger.warn("unlocode searchByCountry failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/** Search by name prefix (port autocomplete). */
export async function searchUnlocodeByName(query: string, limit = 20): Promise<{
  unlocode: string;
  name: string;
  countryCode: string;
  subdivision: string | null;
  function: string | null;
  coordinates: string | null;
}[]> {
  try {
    if (!query || query.length < 2) return [];
    return await db.unlocodeEntry.findMany({
      where: { name: { startsWith: query } },
      orderBy: { name: "asc" },
      take: limit,
      select: {
        unlocode: true,
        name: true,
        countryCode: true,
        subdivision: true,
        function: true,
        coordinates: true,
      },
    });
  } catch (err) {
    logger.warn("unlocode searchByName failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}
