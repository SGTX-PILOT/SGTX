/**
 * UN Security Council Consolidated Sanctions List Sync
 * ====================================================
 *
 * Source: https://scsanctions.un.org/resources/xml/en/consolidated.xml
 * PUBLIC — no API key, no auth, no billing.
 *
 * The XML is a flat list of `<ENTITIES>` containing `<ENTITY>` records.
 * Each ENTITY has:
 *   - `<DATAITEM>` rows with `DATAITEM_ID` attributes describing fields
 *     (FIRST_NAME, SECOND_NAME, THIRD_NAME, FOURTH_NAME, ENTITY_TYPE, etc.)
 *   - `<ALIAS>` children (NameAlias) — alternate names / transliterations
 *
 * Sync strategy
 * -------------
 * Because the XML is ~5MB and uses a custom schema, we parse it lightly:
 * extract `<ENTITY>` blocks via regex and pull `<DATAITEM>` rows by ID.
 * The result is upserted to `UnSanctionsEntry`.
 *
 * Screening
 * ---------
 * `screenAgainstUnSanctions(name, aliases?)` performs Levenshtein fuzzy
 * matching exactly like the OFAC screener (threshold 0.85).
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  fetchWithTimeout,
  logSync,
  normalizeName,
  similarity,
} from "./free-fetch";

const UN_CONSOLIDATED_XML_URL =
  "https://scsanctions.un.org/resources/xml/en/consolidated.xml";

const MATCH_THRESHOLD = 0.85;

export interface UnSanctionsRecord {
  unId: string;
  name: string;
  entityType: string;
  program?: string;
  aliases?: string[];
}

export interface UnScreenResult {
  name: string;
  hits: Array<{
    unId: string;
    name: string;
    entityType: string;
    matchScore: number;
  }>;
  clear: boolean;
  checkedAt: string;
  recordsChecked: number;
}

/**
 * Extract UN sanctions records from the consolidated XML.
 *
 * The actual XML structure is:
 *   <CONSOLIDATED_LIST>
 *     <INDIVIDUALS>
 *       <INDIVIDUAL>
 *         <DATAID>6907993</DATAID>
 *         <FIRST_NAME>ERIC</FIRST_NAME>
 *         <SECOND_NAME>BADEGE</SECOND_NAME>
 *         <THIRD_NAME>...</THIRD_NAME>
 *         <FOURTH_NAME>...</FOURTH_NAME>
 *         <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
 *         <REFERENCE_NUMBER>CDi.001</REFERENCE_NUMBER>
 *         <LISTED_ON>2012-12-31</LISTED_ON>
 *         <COMMENTS1>...</COMMENTS1>
 *         <NATIONALITY><VALUE>...</VALUE></NATIONALITY>
 *         <NAME_ALIAS_LIST>
 *           <NAME_ALIAS><ALIAS_NAME>...</ALIAS_NAME><QUALIFICATION>...</QUALIFICATION></NAME_ALIAS>
 *         </NAME_ALIAS_LIST>
 *       </INDIVIDUAL>
 *     </INDIVIDUALS>
 *     <ENTITIES>
 *       <ENTITY>
 *         <DATAID>6908402</DATAID>
 *         <FIRST_NAME>ADF</FIRST_NAME>
 *         <UN_LIST_TYPE>DRC</UN_LIST_TYPE>
 *         ...
 *       </ENTITY>
 *     </ENTITIES>
 *   </CONSOLIDATED_LIST>
 *
 * We split on `<INDIVIDUAL>` and `<ENTITY>` blocks and pull the
 * direct-child tags via simple regex.
 */
export function parseUnSanctionsXml(xml: string): UnSanctionsRecord[] {
  const records: UnSanctionsRecord[] = [];
  // Match each <INDIVIDUAL> or <ENTITY> block.
  const entityRegex = /<(INDIVIDUAL|ENTITY)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  let m: RegExpExecArray | null;
  while ((m = entityRegex.exec(xml)) !== null) {
    const block = m[2] ?? "";
    if (!block) continue;
    const tagType = (m[1] ?? "").toUpperCase();

    // Pull DATAID as the unId.
    let unId = "";
    const idMatch = /<DATAID>([^<]+)<\/DATAID>/i.exec(block);
    if (idMatch && idMatch[1]) unId = idMatch[1].trim();
    else {
      const refMatch = /<REFERENCE_NUMBER>([^<]+)<\/REFERENCE_NUMBER>/i.exec(block);
      unId = refMatch && refMatch[1] ? refMatch[1].trim() : `UN-${records.length + 1}`;
    }

    // Concatenate FIRST_NAME + SECOND_NAME + THIRD_NAME + FOURTH_NAME.
    const nameParts: string[] = [];
    for (const tag of ["FIRST_NAME", "SECOND_NAME", "THIRD_NAME", "FOURTH_NAME"]) {
      const re = new RegExp(`<${tag}>([^<]+)<\/${tag}>`, "i");
      const nm = re.exec(block);
      if (nm && nm[1]) {
        const v = nm[1].trim();
        if (v && v.toLowerCase() !== "null") nameParts.push(v);
      }
    }
    const name = nameParts.join(" ").trim();
    if (!name) continue;

    // Entity type — INDIVIDUAL tag → individual; ENTITY tag → entity.
    const entityType = tagType === "INDIVIDUAL" ? "individual" : "entity";

    // Program / list type (UN_LIST_TYPE — e.g. DRC, IRAQ, LIB, etc.).
    let program: string | undefined;
    const ulMatch = /<UN_LIST_TYPE>([^<]+)<\/UN_LIST_TYPE>/i.exec(block);
    if (ulMatch && ulMatch[1]) {
      const v = ulMatch[1].trim();
      if (v && v.toLowerCase() !== "null") program = v;
    }

    // Aliases — <NAME_ALIAS><ALIAS_NAME>...</ALIAS_NAME> children.
    const aliases: string[] = [];
    const aliasRegex = /<ALIAS_NAME>([^<]+)<\/ALIAS_NAME>/gi;
    let am: RegExpExecArray | null;
    while ((am = aliasRegex.exec(block)) !== null) {
      const alias = am[1]?.trim();
      if (alias && alias.toLowerCase() !== "null" && alias !== name) {
        aliases.push(alias);
      }
    }

    records.push({
      unId,
      name,
      entityType,
      program,
      aliases: aliases.length > 0 ? aliases : undefined,
    });
  }
  return records;
}

/** Download and persist the UN consolidated sanctions list. */
export async function syncUnSanctionsList(): Promise<{
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
    const res = await fetchWithTimeout(UN_CONSOLIDATED_XML_URL, {
      headers: { Accept: "application/xml,text/xml" },
    });
    if (!res || !res.ok) {
      errors.push(
        `Fetch failed (${res ? res.status : "network-error"}) for ${UN_CONSOLIDATED_XML_URL}`,
      );
      await logSync({
        integration: "un-sanctions",
        source: "scsanctions.un.org",
        durationMs: Date.now() - start,
        recordsUpserted: 0,
        status: "FAILED",
        errors,
      });
      return { ok: false, parsed: 0, upserted: 0, errors, durationMs: Date.now() - start };
    }
    const xml = await res.text();
    const records = parseUnSanctionsXml(xml);
    parsed = records.length;

    const CHUNK = 200;
    for (let i = 0; i < records.length; i += CHUNK) {
      const batch = records.slice(i, i + CHUNK);
      try {
        await Promise.all(
          batch.map((r) =>
            db.unSanctionsEntry.upsert({
              where: { unId: r.unId },
              create: {
                unId: r.unId,
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
                aliases: r.aliases ? JSON.stringify(r.aliases) : null,
              },
              update: {
                name: r.name,
                entityType: r.entityType,
                program: r.program ?? null,
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
      integration: "un-sanctions",
      source: "scsanctions.un.org",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: errors.length > 0 ? "PARTIAL" : "SUCCESS",
      errors,
    });

    logger.info("un-sanctions sync completed", {
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
      integration: "un-sanctions",
      source: "scsanctions.un.org",
      durationMs: Date.now() - start,
      recordsUpserted: upserted,
      status: "FAILED",
      errors,
    });
    logger.error("un-sanctions sync failed", { error: msg });
    return { ok: false, parsed, upserted, errors, durationMs: Date.now() - start };
  }
}

/** Screen a name (+ optional aliases) against the persisted UN sanctions list. */
export async function screenAgainstUnSanctions(
  name: string,
  aliases?: string[],
): Promise<UnScreenResult> {
  const checkedAt = new Date().toISOString();
  try {
    const total = await db.unSanctionsEntry.count();
    if (total === 0) {
      return { name, hits: [], clear: true, checkedAt, recordsChecked: 0 };
    }
    const aliasNorm = (aliases ?? []).map(normalizeName).filter(Boolean);
    const all = await db.unSanctionsEntry.findMany({
      select: { unId: true, name: true, entityType: true, aliases: true },
    });

    const hits: UnScreenResult["hits"] = [];
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
          unId: row.unId,
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
    logger.error("un-sanctions screen failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return { name, hits: [], clear: true, checkedAt, recordsChecked: 0 };
  }
}
