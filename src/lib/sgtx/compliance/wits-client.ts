/**
 * WITS (World Integrated Trade Solution) — FREE tariff + NTM queries
 * ===================================================================
 *
 * Source: https://wits.worldbank.org/API/V1/...
 *
 * WITS exposes REST endpoints for tariff data (applied MFN rates, bound
 * rates, preferential rates) and non-tariff measures (SPS, TBT). The
 * endpoints are PUBLIC for basic queries — no API key, no billing.
 *
 * Used by:
 *   - Customs duty calculator (look up MFN applied rate for an HS code)
 *   - SPS / TBT compliance gate (count of applicable non-tariff measures)
 *
 * Example endpoints:
 *   Tariff: /API/V1/wits/datasource/tradestats-tariff/reporter/{ISO}/year/{YYYY}/partner/{ISO}/product/{HS}/indicator/MPRT-TRF-VAR
 *   NTM:    /API/V1/wits/datasource/tradestats-ntm/reporter/{ISO}/partner/{ISO}/product/{HS}/indicator/NTM-COUNT
 *
 * Public endpoint. No API key, no billing. Returns JSON.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";

const WITS_API_BASE = "https://wits.worldbank.org/API/V1";

export interface WitsTariffRecord {
  reporterISO: string;
  reporterName: string;
  partnerISO: string;
  partnerName: string;
  productCode: string;
  productName: string;
  indicator: string;
  value: number;
  year: number;
  nomenCode: string;
}

export interface WitsTariffQueryResult {
  ok: boolean;
  records: WitsTariffRecord[];
  source: string;
  query: { reporter: string; partner: string; hsCode: string; year?: number };
  durationMs: number;
  errors: string[];
}

interface WitsApiResponse {
  // WITS returns either a JSON object or a flat array depending on the endpoint.
  Data?: Array<Record<string, unknown>>;
  records?: Array<Record<string, unknown>>;
  // Some endpoints return a top-level array.
  [key: string]: unknown;
}

/**
 * Query WITS for tariff data on an HS code between a reporter and partner.
 *
 * @param reporter ISO 3-letter code (e.g. "EGY", "USA", "DEU")
 * @param partner  ISO 3-letter code or "000" (World)
 * @param hsCode   HS code (6-digit recommended)
 * @param year     Year (defaults to last completed year)
 */
export async function queryWitsTariff(
  reporter: string,
  partner: string,
  hsCode: string,
  year?: number,
): Promise<WitsTariffQueryResult> {
  const start = Date.now();
  const errors: string[] = [];
  const yr = year ?? new Date().getFullYear() - 1;
  const query = { reporter, partner, hsCode, year: yr };

  try {
    // MFN Applied Rate (Simple Average) — indicator code MPRT-TRF-VAR
    const url =
      `${WITS_API_BASE}/wits/datasource/tradestats-tariff` +
      `/reporter/${reporter}/year/${yr}/partner/${partner}` +
      `/product/${hsCode}/indicator/MPRT-TRF-VAR?format=json`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      errors.push(`wits fetch ${res ? res.status : "network"}`);
      return {
        ok: false,
        records: [],
        source: "wits.worldbank.org",
        query,
        durationMs: Date.now() - start,
        errors,
      };
    }
    const data = (await res.json()) as WitsApiResponse;
    const raw = Array.isArray(data)
      ? data
      : (data.Data ?? data.records ?? []);
    const records: WitsTariffRecord[] = [];
    for (const row of raw) {
      if (!row || typeof row !== "object") continue;
      const rec = parseWitsRow(row);
      if (rec) records.push(rec);
    }
    return {
      ok: true,
      records,
      source: "wits.worldbank.org",
      query,
      durationMs: Date.now() - start,
      errors: [],
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    errors.push(msg);
    logger.warn("wits: caught exception", { error: msg });
    return {
      ok: false,
      records: [],
      source: "wits.worldbank.org",
      query,
      durationMs: Date.now() - start,
      errors,
    };
  }
}

function parseWitsRow(row: Record<string, unknown>): WitsTariffRecord | null {
  try {
    return {
      reporterISO: String(row["reporteriso3code"] ?? row["ReporterISO3Code"] ?? ""),
      reporterName: String(row["reportername"] ?? row["ReporterName"] ?? ""),
      partnerISO: String(row["partneriso3code"] ?? row["PartnerISO3Code"] ?? ""),
      partnerName: String(row["partnername"] ?? row["PartnerName"] ?? ""),
      productCode: String(row["productcode"] ?? row["ProductCode"] ?? ""),
      productName: String(row["productdescription"] ?? row["ProductDescription"] ?? ""),
      indicator: String(row["indicator"] ?? row["Indicator"] ?? "MPRT-TRF-VAR"),
      value: Number(row["value"] ?? row["Value"] ?? 0),
      year: Number(row["year"] ?? row["Year"] ?? 0),
      nomenCode: String(row["nomenclaturecode"] ?? row["NomenclatureCode"] ?? "HS6"),
    };
  } catch {
    return null;
  }
}
