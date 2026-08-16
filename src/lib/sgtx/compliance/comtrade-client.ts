/**
 * UN Comtrade Client — FREE tier (registration optional)
 * ========================================================
 *
 * Source: https://comtradeapi.un.org/data/v1/get/{typeCode}/{freqCode}/{clCode}
 *
 * UN Comtrade publishes global bilateral trade statistics (imports/exports
 * by country pair × HS code). The new v1 API requires a FREE registration
 * to obtain a subscription key (`Ocp-Apim-Subscription-Key` header), but
 * the key is FREE — no billing, no credit card. Users can register at
 * https://comtradeapi.un.org/.
 *
 * Without a key the legacy preview endpoint
 *   https://comtrade.un.org/api/get?...
 * still works for limited volume (no auth).
 *
 * Configuration
 * -------------
 *   COMTRADE_API_KEY (env) — optional. When set, the v1 API is used with
 *   the subscription key. When unset, the legacy preview API is used.
 *
 * Public endpoint (legacy preview). Free API key (modern v1). No billing.
 */

import { logger } from "@/lib/sgtx/logger";
import { fetchWithTimeout } from "@/lib/sgtx/compliance/free-fetch";

const COMTRADE_API_KEY = process.env.COMTRADE_API_KEY ?? "";
const COMTRADE_V1_BASE = "https://comtradeapi.un.org/data/v1/get";
const COMTRADE_LEGACY_BASE = "https://comtrade.un.org/api/get";

export interface ComtradeTradeFlow {
  reporterCode: number;
  reporterISO: string;
  reporterDesc: string;
  partnerCode: number;
  partnerISO: string;
  partnerDesc: string;
  flow: "imports" | "exports" | "re-exports";
  hsCode: string;
  tradeValueUsd: number;
  netWeightKg: number | null;
  qty: number | null;
  refYear: number;
  refPeriodId: number;
}

export interface ComtradeQueryResult {
  ok: boolean;
  flows: ComtradeTradeFlow[];
  source: string;
  query: {
    reporter?: string;
    partner?: string;
    hsCode?: string;
    flow?: "imports" | "exports";
    year?: number;
  };
  durationMs: number;
  errors: string[];
}

interface ComtradeV1Response {
  data?: Array<Record<string, unknown>>;
  message?: unknown;
}

interface ComtradeLegacyResponse {
  dataset?: Array<Record<string, unknown>>;
}

/**
 * Query bilateral trade statistics between a reporter and partner country
 * for a given HS code. Falls back to the legacy preview API when no API
 * key is configured.
 *
 * @param reporter ISO 3-letter code (e.g. "EGY") or numeric M49 code
 * @param partner  ISO 3-letter code, "ALL" for all partners, or numeric M49
 * @param hsCode   HS code (2/4/6 digit) or "AG2"/"AG4"/"AG6" for aggregates
 * @param options  flow + year (defaults to last completed year)
 */
export async function queryComtrade(
  reporter: string,
  partner: string,
  hsCode: string,
  options?: { flow?: "imports" | "exports"; year?: number; maxRecords?: number },
): Promise<ComtradeQueryResult> {
  const start = Date.now();
  const errors: string[] = [];
  const flow = options?.flow ?? "imports";
  const year = options?.year ?? new Date().getFullYear() - 1;
  const maxRecords = options?.maxRecords ?? 100;

  const query = { reporter, partner, hsCode, flow, year };

  // ── V1 (with key) ────────────────────────────────────────────────────
  if (COMTRADE_API_KEY) {
    try {
      // typeCode=C (goods), freqCode=A (annual), clCode=HS
      const url = `${COMTRADE_V1_BASE}/C/A/HS?reporterCode=${reporter}&partnerCode=${partner}&cmdCode=${hsCode}&flowCode=${flow === "imports" ? "M" : "X"}&period=${year}`;
      const res = await fetchWithTimeout(url, {
        headers: {
          Accept: "application/json",
          "Ocp-Apim-Subscription-Key": COMTRADE_API_KEY,
        },
      });
      if (res && res.ok) {
        const data = (await res.json()) as ComtradeV1Response;
        const flows = (data.data ?? []).map(parseV1Row).filter((f): f is ComtradeTradeFlow => f != null);
        return {
          ok: true,
          flows,
          source: "comtradeapi.un.org/v1",
          query,
          durationMs: Date.now() - start,
          errors: [],
        };
      }
      errors.push(`v1 fetch ${res ? res.status : "network"}`);
    } catch (err) {
      errors.push(`v1: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Legacy preview (no key) ──────────────────────────────────────────
  try {
    const params = new URLSearchParams({
      type: "C",
      freq: "A",
      r: reporter,
      p: partner,
      ps: String(year),
      px: "HS",
      rg: flow === "imports" ? "1" : "2",
      cc: hsCode,
      fmt: "json",
      max: String(maxRecords),
    });
    const url = `${COMTRADE_LEGACY_BASE}?${params}`;
    const res = await fetchWithTimeout(url, {
      headers: { Accept: "application/json" },
    });
    if (!res || !res.ok) {
      errors.push(`legacy fetch ${res ? res.status : "network"}`);
      return {
        ok: false,
        flows: [],
        source: "comtrade.un.org/legacy",
        query,
        durationMs: Date.now() - start,
        errors,
      };
    }
    const data = (await res.json()) as ComtradeLegacyResponse;
    const flows = (data.dataset ?? []).map(parseLegacyRow).filter((f): f is ComtradeTradeFlow => f != null);
    return {
      ok: true,
      flows,
      source: "comtrade.un.org/legacy",
      query,
      durationMs: Date.now() - start,
      errors: [],
    };
  } catch (err) {
    errors.push(`legacy: ${err instanceof Error ? err.message : String(err)}`);
    return {
      ok: false,
      flows: [],
      source: "comtrade.un.org/legacy",
      query,
      durationMs: Date.now() - start,
      errors,
    };
  }
}

/** Parse a v1 API row into a typed ComtradeTradeFlow. */
function parseV1Row(row: Record<string, unknown>): ComtradeTradeFlow | null {
  try {
    return {
      reporterCode: Number(row["reporterCode"] ?? 0),
      reporterISO: String(row["reporterISO"] ?? ""),
      reporterDesc: String(row["reporterDesc"] ?? ""),
      partnerCode: Number(row["partnerCode"] ?? 0),
      partnerISO: String(row["partnerISO"] ?? ""),
      partnerDesc: String(row["partnerDesc"] ?? ""),
      flow: (String(row["flowDesc"] ?? "").toLowerCase().includes("import")
        ? "imports"
        : "exports") as "imports" | "exports",
      hsCode: String(row["cmdCode"] ?? ""),
      tradeValueUsd: Number(row["primaryValue"] ?? 0),
      netWeightKg: row["netWgt"] != null ? Number(row["netWgt"]) : null,
      qty: row["qty"] != null ? Number(row["qty"]) : null,
      refYear: Number(row["period"] ?? 0),
      refPeriodId: Number(row["refPeriodId"] ?? 0),
    };
  } catch {
    return null;
  }
}

/** Parse a legacy API row into a typed ComtradeTradeFlow. */
function parseLegacyRow(row: Record<string, unknown>): ComtradeTradeFlow | null {
  try {
    return {
      reporterCode: Number(row["rtCode"] ?? 0),
      reporterISO: String(row["rt3ISO"] ?? ""),
      reporterDesc: String(row["rtTitle"] ?? ""),
      partnerCode: Number(row["ptCode"] ?? 0),
      partnerISO: String(row["pt3ISO"] ?? ""),
      partnerDesc: String(row["ptTitle"] ?? ""),
      flow: (String(row["rgDesc"] ?? "").toLowerCase().includes("import")
        ? "imports"
        : "exports") as "imports" | "exports",
      hsCode: String(row["cmdCode"] ?? ""),
      tradeValueUsd: Number(row["TradeValue"] ?? row["primaryValue"] ?? 0),
      netWeightKg: row["NetWeight"] != null ? Number(row["NetWeight"]) : null,
      qty: row["Qty"] != null ? Number(row["Qty"]) : null,
      refYear: Number(row["yr"] ?? 0),
      refPeriodId: Number(row["period"] ?? 0),
    };
  } catch {
    return null;
  }
}
