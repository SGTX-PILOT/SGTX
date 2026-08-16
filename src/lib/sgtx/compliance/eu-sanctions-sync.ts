/**
 * EU Consolidated Sanctions List Sync
 * ==================================
 *
 * Source: https://webgate.ec.europa.eu/fsd/fsf/public/exportXML?type=full
 * PUBLIC — no API key, no auth, no billing.
 *
 * The EU FSD (Financial Sanctions Database) publishes an XML export containing
 * `<sanctionEntity>` records. Each entity has:
 *   - `<subjectType>` (e.g. "person", "entity")
 *   - `<nameAlias>` children (firstName + lastName or wholeName)
 *   - `<address>` children
 *   - `<regulation>` programme references (publicationDate, regulationType)
 *
 * Sync strategy
 * -------------
 * We extract `<sanctionEntity>` blocks via regex, pull the primary name
 * from the first `<nameAlias>` and concatenate any additional aliases.
 * Result is upserted to `EuSanctionsEntry`.
 *
 * Screening
 * ---------
 * `screenAgainstEuSanctions(name, aliases?)` mirrors the OFAC/UN screeners
 * with a 0.85 Levenshtein threshold.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  fetchWithTimeout,
  logSync,
  normalizeName,
  similarity,
} from "./free-fetch";

const EU_CONSOLIDATED_XML_URL =
  "https://webgate.ec.europa.eu/fsd/fsf/public/exportXML?type=full";

const MATCH_THRESHOLD = 0.85;

export interface EuSanctionsRecord {
  euId: string;
  name: string;
  entityType: string;
  program?: string;
  remarks?: string;
  aliases?: string[];
}

export interface EuScreenResult {
  name: string;
  hits: Array<{
    euId: string;
    name: string;
    entityType: string;
    matchScore: number;
  }>;
  clear: boolean;
  checkedAt: string;
  recordsChecked: number;
}

/**
 * Parse the EU FSD export XML into typed records.
 *
 * The XML uses namespaces (`xmlns="https://webgate.ec.europa.eu/fsd/fsd"`),
 * so we deliberately parse with regex rather than DOM to keep this module
 * dependency-free and resilient to namespace changes.
 */
export function parseEuSanctionsXml(xml: string): EuSanctionsRecord[] {
  const records: EuSanctionsRecord[] = [];
  const entityRegex = /<sanctionEntity\b[^>]*>([\s\S]*?)<\/sanctionEntity>/gi;
  let m: RegExpExecArray | null;
  while ((m = entityRegex.exec(xml)) !== null) {
    const block = m[1] ?? "";
    if (!block) continue;

    // Extract euId from a `<euEntityId>` child or fall back to ordinal.
    let euId = "";
    const idMatch = /<euEntityId>([^<]+)<\/euEntityId>/i.exec(block);
    if (idMatch && idMatch[1]) {
      euId = idMatch[1].trim();
    } else {
      const ordMatch = /<sanctionEntity\b[^>]*\besnId="([^"]+)"/i.exec(m[0]);
      euId = ordMatch && ordMatch[1] ? ordMatch[1].trim() : `EU-${records.length + 1}`;
    }

    // subjectType
    let entityType = "unknown";
    const stMatch = /<subjectType>([^<]+)<\/subjectType>/i.exec(block);
    if (stMatch && stMatch[1]) {
      const v = stMatch[1].trim().toLowerCase();
      if (v.includes("person")) entityType = "individual";
      else if (v.includes("entity")) entityType = "entity";
      else if (v.includes("vessel")) entityType = "vessel";
      else if (v.includes("aircraft")) entityType = "aircraft";
      else entityType = v;
    }

    // nameAlias — may be wholeName OR firstName+lastName
    const aliases: string[] = [];
    const aliasRegex = /<nameAlias\b[^>]*?(?:wholeName|firstName|lastName)\s*=\s*"([^"]+)"/gi;
    let am: RegExpExecArray | null;
    while ((am = aliasRegex.exec(block)) !== null) {
      const a = am[1]?.trim();
      if (a && a.toLowerCase() !== "null") aliases.push(a);
    }
    // Some EU XML variants use child elements instead of attributes.
    if (aliases.length === 0) {
      const whole = /<wholeName>([^<]+)<\/wholeName>/i.exec(block);
      if (whole && whole[1]) aliases.push(whole[1].trim());
    }
    const name = aliases.shift() ?? "";

    // regulation program (publicationDate + regulationType)
    let program: string | undefined;
    const regMatch = /<regulation\b[^>]*?>[\s\S]*?<regulationType>([^<]+)<\/regulationType>[\s\S]*?<publicationDate>([^<]+)<\/publicationDate>/i.exec(block);
    if (regMatch && regMatch[1] && regMatch[2]) {
      program = `${regMatch[1].trim()} ${regMatch[2].trim()}`.trim();
    }

    // remarks — `<comment>` is the EU's free-text remarks field
    let remarks: string | undefined;
    const remMatch = /<comment>([^<]+)<\/comment>/i.exec(block);
    if (remMatch && remMatch[1]) {
      const v = remMatch[1].trim();
      if (v && v.toLowerCase() !== "null") remarks = v;
    }

    if (name) {
      records.push({
        euId,
        name,
        entityType,
        program,
        remarks,
        aliases: aliases.length > 0 ? aliases : undefined,
      });
    }
  }
  return records;
}

/** Download and persist the EU consolidated sanctions list. */
export async function syncEuSanctionsList(): Promise<{
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
    const res = await fetchWithTimeout(EU_CONSOLIDATED_XML_URL, {
      headers: { Accept: "application/xml,text/xml" },
    });
    if (!res || !res.ok) {
      errors.push(
        `Fetch failed (${res ? res.status : "network-error"}) for ${EU_CONSOLIDATED_XML_URL}`,
      );
      await logSync({
        integration: "eu-sanctions",
        source: "webgate.ec.europa.eu/fsd",
        durationMs: Date.now() - start,
        recordsUpserted: 0,
        status: "FAILED",
        errors,
      });
      return { ok: false, parsed: 0, upserted: 0, errors, durationMs: Date.now() - start };
    }
    const xml = await res.text();
    const records = parseEuSanctionsXml(xml);
    parsed = records.length;

    const CHUNK = 200;
    for (let i = 0; i < records.length; i += CHUNK) {
      const batch = records.slice(i, i + CHUNK);
      try {
        await Promise.all(
          batch.map((r) =>
            db.euSanctionsEntry.upsert({
              where: { euId: r.euId },
              create: {
                euId: r.euId,
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
                remarks: r.remarks ?? null,
                aliases: r.aliases ? JSON.stringify(r.aliases) : null,
              },
              update: {
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
                remarks: r.remarks ?? null,
                aliases: r.aliases ? JSON.stringify(r.aliases) : null,
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
      integration: "eu-sanctions",
      source: "webgate.ec.europa.eu/fsd",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errors,
    });

    logger.info("eu-sanctions sync completed", {
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
      integration: "eu-sanctions",
      source: "webgate.ec.europa.eu/fsd",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: "FAILED",
      errors,
    });
    logger.error("eu-sanctions sync failed", { error: msg });
    return { ok: false, parsed, upserted, errors, durationMs: Date.now() - start };
  }
}

/** Screen a name (+ optional aliases) against the persisted EU sanctions list. */
export async function screenAgainstEuSanctions(
  name: string,
  aliases?: string[],
): Promise<EuScreenResult> {
  const checkedAt = new Date().toISOString();
  try {
    const total = await db.euSanctionsEntry.count();
    if (total === 0) {
      return { name, hits: [], clear: true, checkedAt, recordsChecked: 0 };
    }
    const aliasNorm = (aliases ?? []).map(normalizeName).filter(Boolean);
    const all = await db.euSanctionsEntry.findMany({
      select: { euId: true, name: true, entityType: true, aliases: true },
    });

    const hits: EuScreenResult["hits"] = [];
    for (const row of all) {
      let bestScore = similarity(name, row.name);
      let rowAliases: string[] = [];
      if (row.aliases) {
        try {
          const parsed = JSON.parse(row.aliases);
          if (Array.isArray(parsed)) {
            rowAliases = parsed.filter((x): x is string => typeof x === "string");
          }
        } catch {
          /* ignore */
        }
      }
      for (const alias of rowAliases) {
        bestScore = Math.max(bestScore, similarity(name, alias));
      }
      for (const q of aliasNorm) {
        bestScore = Math.max(bestScore, similarity(q, row.name));
        for (const alias of rowAliases) {
          bestScore = Math.max(bestScore, similarity(q, alias));
        }
      }
      if (bestScore >= MATCH_THRESHOLD) {
        hits.push({
          euId: row.euId,
          name: row.name,
          entityType: row.entityType,
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
    logger.error("eu-sanctions screen failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { name, hits: [], clear: true, checkedAt, recordsChecked: 0 };
  }
}
