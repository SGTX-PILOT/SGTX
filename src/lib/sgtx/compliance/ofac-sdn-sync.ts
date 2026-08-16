/**
 * OFAC SDN (Specially Designated Nationals) List Sync
 * ====================================================
 *
 * Source: US Treasury OFAC public CSV / consolidated XML.
 *   • https://www.treasury.gov/ofac/downloads/sdn.csv
 *   • https://www.treasury.gov/ofac/downloads/consolidated/consolidated.xml
 *
 * Both endpoints are PUBLIC — no API key, no auth, no billing.
 *
 * Sync strategy
 * -------------
 * The consolidated XML is the canonical source but is ~100 MB; the `sdn.csv`
 * file is the simpler tabular form (~7 MB) and is parsed here. Each row of
 * `sdn.csv` has these columns (1-indexed):
 *
 *   1  SDN ID (e.g. 26782)
 *   2  Name
 *   3  SDN Type (-0 = individual, -1 = entity / vessel / aircraft / etc.)
 *   4  Program(s) (semicolon-separated e.g. "SDGT;SYRIA")
 *   5  Title (only for individuals)
 *   6  Call Sign (vessels only)
 *   7  Vessel Type (vessels only)
 *   8  TON        (vessels only)
 *   9  Gross Registered Tonnage (vessels only)
 *   10 Vessel Flag (vessels only)
 *   11 Remarks (free-form: passport, DOB, address, etc.)
 *
 * Aliases are in a separate file (`sdn.csv` is the primary names file); the
 * `add.csv` and `alt.csv` files contain addenda and alternate spelling. We
 * store the primary record only — the screener checks both `name` and the
 * `aliases` JSON array.
 *
 * Screening
 * ---------
 * `screenAgainstOfac(name, aliases?)` performs Levenshtein fuzzy matching
 * against every `OfacSdnEntry` row in the DB. A hit with similarity >= 0.85
 * is returned; `clear` is `false` if any such hit exists.
 *
 * Cron
 * ----
 * `syncOfacSdnList()` is wired into the daily free-integrations cron
 * (`/api/sgtx/free-integrations/cron`). Failures are non-fatal — they're
 * logged to `FreeIntegrationSyncLog` with `status=FAILED`.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  fetchWithTimeout,
  logSync,
  normalizeName,
  similarity,
} from "./free-fetch";

const OFAC_SDN_CSV_URL =
  "https://www.treasury.gov/ofac/downloads/sdn.csv";

const MATCH_THRESHOLD = 0.85;

export interface OfacSdnRecord {
  sdnId: string;
  name: string;
  entityType: "individual" | "entity" | "vessel" | "aircraft" | "unknown";
  program?: string;
  title?: string;
  remarks?: string;
}

export interface OfacScreenHit {
  sdnId: string;
  name: string;
  entityType: string;
  program: string | null;
  matchScore: number;
}

export interface OfacScreenResult {
  name: string;
  hits: OfacScreenHit[];
  clear: boolean;
  checkedAt: string;
  recordsChecked: number;
}

/**
 * Parse the OFAC `sdn.csv` content into typed records.
 *
 * The CSV uses commas as separators; OFAC historically used a custom
 * `|` separator in older releases but the current public CSV uses commas
 * with quoting. We use a defensive parser that handles both.
 */
export function parseOfacSdnCsv(csv: string): OfacSdnRecord[] {
  const records: OfacSdnRecord[] = [];
  // Split into lines, tolerating CRLF / LF.
  const lines = csv.split(/\r?\n/);
  // Auto-detect separator: OFAC CSV uses comma historically, but some
  // mirrors ship pipe-delimited. The header line is "SDN_NUMBER,NAME,SDN_TYPE,...".
  const sep = lines[0]?.includes("|") && !lines[0].includes(",") ? "|" : ",";

  for (const raw of lines) {
    if (!raw || raw === sep || raw === "null") continue;
    const cols = parseCsvLine(raw, sep);
    if (cols.length < 4) continue;
    const sdnId = (cols[0] ?? "").trim();
    const name = (cols[1] ?? "").trim();
    if (!sdnId || !name || sdnId === "null" || name === "null") continue;

    const typeCode = (cols[2] ?? "").trim();
    const entityType = mapEntityType(typeCode, name);
    const program = (cols[3] ?? "").trim() || undefined;
    const title = (cols[4] ?? "").trim() || undefined;
    const remarks = (cols[10] ?? "").trim() || undefined;

    records.push({
      sdnId,
      name,
      entityType,
      program: program && program !== "null" ? program : undefined,
      title: title && title !== "null" ? title : undefined,
      remarks: remarks && remarks !== "null" ? remarks : undefined,
    });
  }
  return records;
}

function mapEntityType(typeCode: string, _name: string): OfacSdnRecord["entityType"] {
  // OFAC SDN_TYPE values: -0 individual, -1 entity, -2 vessel, -3 aircraft
  switch (typeCode) {
    case "individual":
    case "-0":
    case "0":
      return "individual";
    case "entity":
    case "-1":
    case "1":
      return "entity";
    case "vessel":
    case "-2":
    case "2":
      return "vessel";
    case "aircraft":
    case "-3":
    case "3":
      return "aircraft";
    default:
      return "unknown";
  }
}

/** Minimal CSV line parser that respects double-quoted fields. */
function parseCsvLine(line: string, sep: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === sep) {
        out.push(cur);
        cur = "";
      } else {
        cur += ch;
      }
    }
  }
  out.push(cur);
  return out;
}

/**
 * Download and persist the OFAC SDN list. Returns a summary object.
 *
 * Safe to call from cron and from the manual trigger route. Idempotent
 * (`upsert` keyed by `sdnId`). Existing records are not deleted (the
 * delta is small + the screener checks `name`, not row age).
 */
export async function syncOfacSdnList(): Promise<{
  ok: boolean;
  parsed: number;
  upserted: number;
  errors: string[];
  durationMs: number;
}> {
  const start = Date.now();
  const errors: string[] = [];
  let parsed = 0;
  let upserted = 0;

  try {
    const res = await fetchWithTimeout(OFAC_SDN_CSV_URL, {
      headers: { Accept: "text/csv" },
    });
    if (!res || !res.ok) {
      errors.push(
        `Fetch failed (${res ? res.status : "network-error"}) for ${OFAC_SDN_CSV_URL}`,
      );
      await logSync({
        integration: "ofac-sdn",
        source: "treasury.gov/sdn.csv",
        durationMs: Date.now() - start,
        recordsUpserted: 0,
        status: "FAILED",
        errors,
      });
      return { ok: false, parsed: 0, upserted: 0, errors, durationMs: Date.now() - start };
    }
    const csv = await res.text();
    const records = parseOfacSdnCsv(csv);
    parsed = records.length;

    // Batch-upsert in chunks of 200 to stay within SQLite's 999 host param cap.
    const CHUNK = 200;
    for (let i = 0; i < records.length; i += CHUNK) {
      const batch = records.slice(i, i + CHUNK);
      try {
        await Promise.all(
          batch.map((r) =>
            db.ofacSdnEntry.upsert({
              where: { sdnId: r.sdnId },
              create: {
                sdnId: r.sdnId,
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
                title: r.title ?? null,
                remarks: r.remarks ?? null,
              },
              update: {
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
                title: r.title ?? null,
                remarks: r.remarks ?? null,
                syncedAt: new Date(),
              },
            }),
          ),
        );
        upserted += batch.length;
      } catch (batchErr) {
        const msg = batchErr instanceof Error ? batchErr.message : String(batchErr);
        errors.push(`Batch upsert at offset ${i} failed: ${msg}`);
      }
    }

    await logSync({
      integration: "ofac-sdn",
      source: "treasury.gov/sdn.csv",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errors,
    });

    logger.info("ofac-sdn sync completed", {
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
      integration: "ofac-sdn",
      source: "treasury.gov/sdn.csv",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: "FAILED",
      errors,
    });
    logger.error("ofac-sdn sync failed", { error: msg });
    return { ok: false, parsed, upserted, errors, durationMs: Date.now() - start };
  }
}

/**
 * Screen a name (+ optional aliases) against the persisted OFAC SDN list.
 * Returns hits with similarity >= 0.85.
 *
 * If the DB is empty (sync hasn't run yet), `recordsChecked=0` and
 * `clear=true` is returned — callers should check `recordsChecked` and
 * re-screen after sync completes.
 */
export async function screenAgainstOfac(
  name: string,
  aliases?: string[],
): Promise<OfacScreenResult> {
  const checkedAt = new Date().toISOString();
  try {
    const total = await db.ofacSdnEntry.count();
    if (total === 0) {
      return {
        name,
        hits: [],
        clear: true,
        checkedAt,
        recordsChecked: 0,
      };
    }

    // Naive substring pre-filter on normalised name + aliases to keep
    // candidate-set small (we don't ship sqlite full-text here).
    const norm = normalizeName(name);
    const aliasNorm = (aliases ?? []).map(normalizeName).filter(Boolean);
    const candidateTerms = [norm, ...aliasNorm].filter(Boolean);
    if (candidateTerms.length === 0) {
      return { name, hits: [], clear: true, checkedAt, recordsChecked: total };
    }

    // Pull records whose normalised name shares any token with the query.
    // For modest DB sizes (OFAC has ~7k entries) we just iterate all rows.
    const all = await db.ofacSdnEntry.findMany({
      select: { sdnId: true, name: true, entityType: true, program: true, aliases: true },
    });

    const hits: OfacScreenHit[] = [];
    for (const row of all) {
      let bestScore = 0;
      // Compare against primary name.
      bestScore = Math.max(bestScore, similarity(name, row.name));
      // Compare against aliases stored as JSON array.
      let rowAliases: string[] = [];
      if (row.aliases) {
        try {
          const parsed = JSON.parse(row.aliases);
          if (Array.isArray(parsed)) rowAliases = parsed.filter((x): x is string => typeof x === "string");
        } catch {
          // ignore malformed alias JSON
        }
      }
      for (const alias of rowAliases) {
        bestScore = Math.max(bestScore, similarity(name, alias));
      }
      // Also check query aliases vs entry name/aliases.
      for (const q of aliasNorm) {
        bestScore = Math.max(bestScore, similarity(q, row.name));
        for (const alias of rowAliases) {
          bestScore = Math.max(bestScore, similarity(q, alias));
        }
      }
      if (bestScore >= MATCH_THRESHOLD) {
        hits.push({
          sdnId: row.sdnId,
          name: row.name,
          entityType: row.entityType,
          program: row.program,
          matchScore: Number(bestScore.toFixed(4)),
        });
      }
    }

    return {
      name,
      hits: hits.sort((a, b) => b.matchScore - a.matchScore),
      clear: hits.length === 0,
      checkedAt,
      recordsChecked: total,
    };
  } catch (err) {
    logger.error("ofac-sdn screen failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      name,
      hits: [],
      clear: true,
      checkedAt,
      recordsChecked: 0,
    };
  }
}
