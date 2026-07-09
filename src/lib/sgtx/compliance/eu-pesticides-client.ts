// SGTX EU Pesticides Database Client
// Fetches MRL (Maximum Residue Limit) data from the official EU Pesticides Database API.
// Source: https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/
// API base: /backend/api (discovered from the SPA's env-json-config.json)
//
// Data model:
// - 679 pesticide residues (active substances + metabolites)
// - 381 products (food/feed categories, hierarchical)
// - ~258,599 MRL values (residue × product, in mg/kg)
// - 8 bulk XML publication files (updated periodically by EU)

import { db } from "@/lib/db";

const EU_API_BASE = "https://ec.europa.eu/food/plant/pesticides/eu-pesticides-database/backend/api";

// ============ Types ============
export interface EuProduct {
  product_id: number;
  product_parent_id: number | null;
  product_name: string;
  product_code: number | string; // API returns number (e.g. 100000), we pad to 7-digit string "0100000"
  type_id: number;
  lev?: number;
  synonyms: string | null;
  scientific_name: string | null;
}

/** Normalize product code to 7-digit zero-padded string (API returns numbers). */
function normalizeProductCode(code: number | string): string {
  return String(code).padStart(7, "0");
}

export interface EuPesticideResidue {
  pest_res_id: number;
  pest_res_name: string;
}

export interface EuMrlDetail {
  product_id: number;
  product_name: string;
  product_code: string;
  data: {
    mrls: (string | null)[]; // mg/kg values, e.g. "0.01*", "0.1", "0.5"
    lodFlags: (string | null)[];
    strongFlags: (boolean | null)[];
    meta: (string | null)[]; // regulation + applicable date
    footnotes: (string | null)[];
  };
}

export interface EuMrlDownloadFile {
  file: string; // e.g. "Publication7.xml"
  modified: string; // DD/MM/YYYY
}

export interface EuActiveSubstanceCategory {
  id: number;
  code: string; // e.g. "IN" (Insecticide)
  desc: string;
  func: string;
}

// ============ API Client ============

async function fetchJson<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json",
      "User-Agent": "SGTX-Brain-OS/1.0 (EU Pesticides Sync)",
      ...options?.headers,
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) {
    throw new Error(`EU API ${res.status}: ${url}`);
  }
  return res.json() as Promise<T>;
}

/** Fetch all 381 products (food/feed categories). */
export async function fetchProducts(lang = "en"): Promise<EuProduct[]> {
  const data = await fetchJson<{ success: boolean; payload: EuProduct[] }>(`${EU_API_BASE}/pr/get_products/${lang}`);
  if (!data.success) throw new Error("Failed to fetch products");
  return data.payload;
}

/** Search pesticide residues by name (empty string returns all 679). */
export async function searchPesticideResidues(name = ""): Promise<EuPesticideResidue[]> {
  const data = await fetchJson<{ success: boolean; payload: EuPesticideResidue[] }>(
    `${EU_API_BASE}/pr/searchPr?prNumber=${encodeURIComponent(name)}`,
  );
  if (!data.success) throw new Error("Failed to search residues");
  return data.payload;
}

/** Fetch full MRL details for a single pesticide residue across all 381 products. */
export async function fetchMrlDetails(pestResId: number): Promise<EuMrlDetail[]> {
  const data = await fetchJson<{ success: boolean; payload: EuMrlDetail[] }>(
    `${EU_API_BASE}/pr/get_details_single_pr?pest_res_id=${pestResId}`,
  );
  if (!data.success) throw new Error(`Failed to fetch MRL details for residue ${pestResId}`);
  return data.payload;
}

/** Fetch search lists (annexes, footnotes, regulations). */
export async function fetchSearchLists(lang = "en") {
  const data = await fetchJson<{ success: boolean; payload: any }>(`${EU_API_BASE}/pr/get_search_lists/${lang}`);
  if (!data.success) throw new Error("Failed to fetch search lists");
  return data.payload;
}

/** Fetch active substance filter categories (Acaricide, Insecticide, Fungicide, etc.). */
export async function fetchActiveSubstanceFilters(): Promise<{ categories: EuActiveSubstanceCategory[] }> {
  const data = await fetchJson<{ success: boolean; payload: { categories: EuActiveSubstanceCategory[] } }>(
    `${EU_API_BASE}/active_substance/filters`,
  );
  if (!data.success) throw new Error("Failed to fetch active substance filters");
  return data.payload;
}

/** List available bulk XML download files (8 publication files, periodically updated). */
export async function fetchMrlDownloadList(): Promise<EuMrlDownloadFile[]> {
  return fetchJson<EuMrlDownloadFile[]>(`${EU_API_BASE}/mrl/download`);
}

// ============ MRL Parsing ============

/**
 * Parse an MRL value string into a numeric mg/kg value.
 * MRL strings can be: "0.01", "0.01*", "0.1", "0.5", null
 * The "*" suffix means "at or about the limit of determination" (LOD).
 */
export function parseMrlValue(mrlStr: string | null): { value: number | null; isLod: boolean; isDefault: boolean } {
  if (mrlStr === null || mrlStr === undefined || mrlStr === "") return { value: null, isLod: false, isDefault: false };
  const str = typeof mrlStr === "string" ? mrlStr : String(mrlStr);
  const isLod = str.includes("*");
  const cleaned = str.replace("*", "").trim();
  const value = parseFloat(cleaned);
  if (isNaN(value)) return { value: null, isLod, isDefault: false };
  // EU default MRL is 0.01 mg/kg (Regulation (EC) No 396/2005, Article 18(1)(b))
  const isDefault = value === 0.01 && isLod;
  return { value, isLod, isDefault };
}

// ============ Full Sync ============

export interface SyncProgress {
  phase: "products" | "residues" | "mrls" | "complete";
  total: number;
  processed: number;
  errors: number;
  startedAt: string;
  lastUpdate: string;
}

export interface SyncResult {
  productsCount: number;
  residuesCount: number;
  mrlsCount: number;
  errors: string[];
  durationMs: number;
  syncedAt: string;
}

/**
 * Full sync: fetch all products + all residues + all MRL details from the EU API.
 * Stores everything in the SGTX database + pushes to the Brain OS.
 * This is the function called by the daily cron.
 */
export async function syncEuPesticides(
  onProgress?: (p: SyncProgress) => void,
): Promise<SyncResult> {
  const startedAt = Date.now();
  const errors: string[] = [];
  let productsCount = 0;
  let residuesCount = 0;
  let mrlsCount = 0;

  // Phase 1: Products
  onProgress?.({ phase: "products", total: 0, processed: 0, errors: 0, startedAt: new Date(startedAt).toISOString(), lastUpdate: new Date().toISOString() });
  try {
    const products = await fetchProducts("en");
    productsCount = products.length;
    // Upsert products
    for (const p of products) {
      const code = normalizeProductCode(p.product_code);
      const parentId = (p.product_parent_id && p.product_parent_id > 0) ? p.product_parent_id : null;
      await db.euPesticideProduct.upsert({
        where: { productCode: code },
        create: {
          productId: p.product_id,
          productCode: code,
          productName: p.product_name,
          parentId,
          typeId: p.type_id,
          synonyms: p.synonyms,
          scientificName: p.scientific_name,
        },
        update: {
          productId: p.product_id,
          productName: p.product_name,
          parentId,
          typeId: p.type_id,
          synonyms: p.synonyms,
          scientificName: p.scientific_name,
          updatedAt: new Date(),
        },
      });
    }
  } catch (e: any) {
    errors.push(`Products sync failed: ${e.message}`);
  }

  // Phase 2: Residues (all 679)
  onProgress?.({ phase: "residues", total: 0, processed: 0, errors: errors.length, startedAt: new Date(startedAt).toISOString(), lastUpdate: new Date().toISOString() });
  let residues: EuPesticideResidue[] = [];
  try {
    residues = await searchPesticideResidues("");
    residuesCount = residues.length;
    // Upsert residues
    for (const r of residues) {
      await db.euPesticideResidue.upsert({
        where: { pestResId: r.pest_res_id },
        create: {
          pestResId: r.pest_res_id,
          pestResName: r.pest_res_name.trim(),
        },
        update: {
          pestResName: r.pest_res_name.trim(),
          updatedAt: new Date(),
        },
      });
    }
  } catch (e: any) {
    errors.push(`Residues sync failed: ${e.message}`);
  }

  // Phase 3: MRL details (fetch each residue's MRLs across all 381 products)
  // This is 679 API calls — rate-limited (50ms delay between calls ≈ 34s total)
  onProgress?.({ phase: "mrls", total: residues.length, processed: 0, errors: errors.length, startedAt: new Date(startedAt).toISOString(), lastUpdate: new Date().toISOString() });

  for (let i = 0; i < residues.length; i++) {
    const residue = residues[i];
    try {
      const details = await fetchMrlDetails(residue.pest_res_id);
      for (const detail of details) {
        const productCode = normalizeProductCode(detail.product_code);
        const mrls = detail.data?.mrls || [];
        const metas = detail.data?.meta || [];
        const lodFlags = detail.data?.lodFlags || [];
        const strongFlags = detail.data?.strongFlags || [];
        const footnotes = detail.data?.footnotes || [];

        // Each residue can have multiple MRL entries (mrls is an array — usually 1, but can be more for split/merge)
        for (let j = 0; j < mrls.length; j++) {
          const mrlStr = mrls[j];
          if (mrlStr === null || mrlStr === undefined) continue;
          const parsed = parseMrlValue(mrlStr as string | null);
          if (parsed.value === null) continue;

          const metaStr = metas[j] || "";
          const metaMatch = metaStr.match(/Applicable from (\d{2}\/\d{2}\/\d{4})\s*-\s*(.+)/);
          const applicableFrom = metaMatch ? metaMatch[1] : null;
          const regulation = metaMatch ? metaMatch[2].trim() : metaStr;

          await db.euPesticideMrl.upsert({
            where: {
              pestResId_productCode_entryIndex: {
                pestResId: residue.pest_res_id,
                productCode,
                entryIndex: j,
              },
            },
            create: {
              pestResId: residue.pest_res_id,
              productCode,
              entryIndex: j,
              mrlValue: parsed.value,
              mrlUnit: "mg/kg",
              isLod: parsed.isLod,
              isDefault: parsed.isDefault,
              lodFlag: lodFlags[j] || null,
              strongFlag: strongFlags[j] || false,
              footnote: footnotes[j] || null,
              applicableFrom,
              regulation,
              rawMrlString: typeof mrlStr === "string" ? mrlStr : String(mrlStr),
            },
            update: {
              mrlValue: parsed.value,
              isLod: parsed.isLod,
              isDefault: parsed.isDefault,
              lodFlag: lodFlags[j] || null,
              strongFlag: strongFlags[j] || false,
              footnote: footnotes[j] || null,
              applicableFrom,
              regulation,
              rawMrlString: typeof mrlStr === "string" ? mrlStr : String(mrlStr),
              updatedAt: new Date(),
            },
          });
          mrlsCount++;
        }
      }
    } catch (e: any) {
      // Non-fatal: continue with next residue
      if (errors.length < 20) errors.push(`Residue ${residue.pest_res_id} (${residue.pest_res_name}): ${e.message}`);
    }

    // Rate limit: 50ms between API calls
    await new Promise(r => setTimeout(r, 50));

    // Progress update every 10 residues
    if (i % 10 === 0) {
      onProgress?.({
        phase: "mrls",
        total: residues.length,
        processed: i + 1,
        errors: errors.length,
        startedAt: new Date(startedAt).toISOString(),
        lastUpdate: new Date().toISOString(),
      });
    }
  }

  // Update sync metadata
  await db.euPesticideSyncLog.create({
    data: {
      syncedAt: new Date(),
      productsCount,
      residuesCount,
      mrlsCount,
      errorCount: errors.length,
      errors: JSON.stringify(errors.slice(0, 50)),
      durationMs: Date.now() - startedAt,
    },
  });

  onProgress?.({
    phase: "complete",
    total: residues.length,
    processed: residues.length,
    errors: errors.length,
    startedAt: new Date(startedAt).toISOString(),
    lastUpdate: new Date().toISOString(),
  });

  return {
    productsCount,
    residuesCount,
    mrlsCount,
    errors,
    durationMs: Date.now() - startedAt,
    syncedAt: new Date().toISOString(),
  };
}

// ============ Query Helpers ============

/**
 * Lookup the MRL for a specific pesticide + product.
 * Returns the MRL value in mg/kg, or null if no specific MRL is set (default 0.01* mg/kg applies).
 */
export async function lookupMrl(pestResName: string, productCode: string): Promise<{
  mrlValue: number | null;
  mrlUnit: string;
  isLod: boolean;
  isDefault: boolean;
  regulation: string | null;
  applicableFrom: string | null;
  source: string;
}> {
  // Find the residue by name (case-insensitive, partial match)
  const residue = await db.euPesticideResidue.findFirst({
    where: { pestResName: { contains: pestResName } },
  });
  if (!residue) {
    return { mrlValue: null, mrlUnit: "mg/kg", isLod: false, isDefault: false, regulation: null, applicableFrom: null, source: "Residue not found" };
  }

  // Find the MRL for this residue + product
  const mrl = await db.euPesticideMrl.findFirst({
    where: { pestResId: residue.pestResId, productCode },
    orderBy: { entryIndex: "asc" },
  });

  if (!mrl) {
    // EU default MRL is 0.01 mg/kg (Regulation (EC) No 396/2005, Article 18(1)(b))
    return {
      mrlValue: 0.01,
      mrlUnit: "mg/kg",
      isLod: true,
      isDefault: true,
      regulation: "Reg. (EC) No 396/2005 Art. 18(1)(b) — default MRL",
      applicableFrom: null,
      source: "EU default (no specific MRL set)",
    };
  }

  return {
    mrlValue: mrl.mrlValue,
    mrlUnit: mrl.mrlUnit,
    isLod: mrl.isLod,
    isDefault: mrl.isDefault,
    regulation: mrl.regulation,
    applicableFrom: mrl.applicableFrom,
    source: "EU Pesticides Database",
  };
}

/**
 * Check if a detected residue level exceeds the EU MRL.
 */
export async function checkMrlCompliance(
  pestResName: string,
  productCode: string,
  detectedLevelMgKg: number,
): Promise<{
  compliant: boolean;
  mrlValue: number | null;
  detectedLevel: number;
  exceedanceFactor: number | null;
  verdict: "COMPLIANT" | "NON_COMPLIANT" | "AT_LIMIT" | "UNKNOWN";
  details: string;
}> {
  const mrl = await lookupMrl(pestResName, productCode);
  if (mrl.mrlValue === null) {
    return {
      compliant: false,
      mrlValue: null,
      detectedLevel: detectedLevelMgKg,
      exceedanceFactor: null,
      verdict: "UNKNOWN",
      details: `No MRL found for ${pestResName} on product ${productCode}. Default 0.01* mg/kg applies.`,
    };
  }

  const exceedanceFactor = detectedLevelMgKg / mrl.mrlValue;
  const compliant = detectedLevelMgKg <= mrl.mrlValue;
  const atLimit = !compliant && detectedLevelMgKg <= mrl.mrlValue * 1.1; // within 10% of limit

  return {
    compliant,
    mrlValue: mrl.mrlValue,
    detectedLevel: detectedLevelMgKg,
    exceedanceFactor,
    verdict: compliant ? "COMPLIANT" : atLimit ? "AT_LIMIT" : "NON_COMPLIANT",
    details: compliant
      ? `Detected ${detectedLevelMgKg} mg/kg is within MRL of ${mrl.mrlValue} mg/kg (${mrl.source})`
      : `Detected ${detectedLevelMgKg} mg/kg EXCEEDS MRL of ${mrl.mrlValue} mg/kg by ${(exceedanceFactor * 100).toFixed(0)}% (${mrl.source})`,
  };
}
