// @ts-nocheck
/**
 * SGTX Tariff Engine — Real Duty / Tax Calculator (G-02)
 * ===========================================
 *
 * Calculates the full landed-duty stack for a given:
 *   (HS code, origin country, destination country, customs value)
 *
 * Pipeline:
 *   1. MFN rate — try WITS live API (https://wits.worldbank.org) via the
 *      existing wits-client. Falls back to a hardcoded MFN table covering
 *      the top 50 importing economies.
 *   2. Preferential rate — if an FTA applies (EG-EU, EVFTA, ChAFTA, USMCA,
 *      RCEP, GCC, Turkey-EU, etc.) look up the bilateral FTA rate from the
 *      hardcoded FTA table. Lower than MFN ⇒ use it.
 *   3. Anti-dumping duty — hardcoded AD table for known AD orders
 *      (e.g. EU AD on Chinese bicycle imports, US AD on Chinese wooden
 *      bedroom furniture, etc.).
 *   4. VAT/GST — destination country's standard VAT/GST rate (hardcoded).
 *   5. Totals — sum duty + tax, return grand total in destination currency.
 *
 * Sources:
 *   - WITS (free, public, no API key) for live MFN
 *   - WTO I-TIP Goods for AD (public, but no stable JSON API ⇒ hardcoded)
 *   - OECD Tax Database for VAT/GST (public CSV, but frozen here)
 *
 * All amounts returned in the destination country's currency.
 */

import { logger } from "@/lib/sgtx/logger";
import { queryWitsTariff } from "@/lib/sgtx/compliance/wits-client";

// ── Types ────────────────────────────────────────────────────────────────

export interface DutyCalculation {
  hsCode: string;
  originCountry: string;
  destinationCountry: string;
  customsValue: number;
  currency: string;
  mfnRate: number;
  mfnSource: string;
  preferentialRate: number | null;
  ftaName: string | null;
  appliedRate: number;
  antiDumpingDuty: number;
  antiDumpingRate: number;
  antiDumpingSource: string;
  vatRate: number;
  vatAmount: number;
  vatLabel: string;
  totalDuty: number;
  totalTax: number;
  grandTotal: number;
  calculationBreakdown: Array<{ label: string; rate: number; amount: number }>;
  source: string;
  screenedAt: string;
  notes: string;
}

// ── ISO2 → ISO3 mapping (for WITS) ──────────────────────────────────────

const ISO2_TO_ISO3: Record<string, string> = {
  EG: "EGY", DE: "DEU", FR: "FRA", NL: "NLD", IT: "ITA", ES: "ESP", GB: "GBR",
  US: "USA", CN: "CHN", JP: "JPN", KR: "KOR", IN: "IND", BR: "BRA", AU: "AUS",
  CA: "CAN", ZA: "ZAF", TR: "TUR", SA: "SAU", AE: "ARE", TH: "THA", VN: "VNM",
  MY: "MYS", ID: "IDN", PH: "PHL", SG: "SGP", MX: "MEX", AR: "ARG", CL: "CHL",
  KE: "KEN", MA: "MAR", NG: "NGA", PK: "PAK", BD: "BGD", RU: "RUS", UA: "UKR",
  PL: "POL", BE: "BEL", CH: "CHE", SE: "SWE", NO: "NOR", DK: "DNK", FI: "FIN",
  AT: "AUT", IE: "IRL", PT: "PRT", GR: "GRC", CZ: "CZE", HU: "HUN", RO: "ROU",
  CO: "COL", PE: "PER", EC: "ECU", GH: "GHA", CI: "CIV", TZ: "TZA", UG: "UGA",
};

// ── Hardcoded MFN fallback (top 50 economies, % ad valorem average) ─────

const MFN_FALLBACK: Record<string, number> = {
  EG: 5.5, DE: 4.2, FR: 4.2, NL: 4.2, IT: 4.2, ES: 4.2, BE: 4.2, GB: 4.0,
  US: 3.4, CN: 7.5, JP: 4.0, KR: 5.1, IN: 18.1, BR: 8.4, AU: 3.6, CA: 4.2,
  ZA: 7.7, TR: 5.4, SA: 5.0, AE: 5.0, TH: 6.2, VN: 9.4, MY: 6.1, ID: 8.3,
  PH: 7.1, SG: 0.2, MX: 5.3, AR: 7.3, CL: 6.0, KE: 12.5, MA: 5.5, NG: 12.0,
  PK: 12.8, BD: 14.0, RU: 7.5, UA: 4.8, PL: 4.2, CH: 4.5, SE: 4.2, NO: 4.0,
  DK: 4.2, FI: 4.2, AT: 4.2, IE: 4.2, PT: 4.2, GR: 4.2, CZ: 4.2, HU: 4.2,
  RO: 4.2, CO: 7.1, PE: 5.9, EC: 9.7, GH: 12.5, CI: 11.5,
};

// ── Destination VAT/GST rates ───────────────────────────────────────────

interface VatInfo { rate: number; label: string; currency: string; }

const VAT_TABLE: Record<string, VatInfo> = {
  EG: { rate: 14, label: "VAT", currency: "EGP" },
  DE: { rate: 19, label: "MwSt (VAT)", currency: "EUR" },
  FR: { rate: 20, label: "TVA", currency: "EUR" },
  NL: { rate: 21, label: "BTW (VAT)", currency: "EUR" },
  IT: { rate: 22, label: "IVA", currency: "EUR" },
  ES: { rate: 21, label: "IVA", currency: "EUR" },
  BE: { rate: 21, label: "BTW (VAT)", currency: "EUR" },
  GB: { rate: 20, label: "VAT", currency: "GBP" },
  US: { rate: 0, label: "No federal VAT (state sales tax applies)", currency: "USD" },
  CN: { rate: 13, label: "VAT", currency: "CNY" },
  JP: { rate: 10, label: "Consumption Tax", currency: "JPY" },
  KR: { rate: 10, label: "VAT", currency: "KRW" },
  IN: { rate: 18, label: "GST", currency: "INR" },
  BR: { rate: 17, label: "ICMS (state)", currency: "BRL" },
  AU: { rate: 10, label: "GST", currency: "AUD" },
  CA: { rate: 5, label: "GST (federal)", currency: "CAD" },
  ZA: { rate: 15, label: "VAT", currency: "ZAR" },
  TR: { rate: 20, label: "KDV (VAT)", currency: "TRY" },
  SA: { rate: 15, label: "VAT", currency: "SAR" },
  AE: { rate: 5, label: "VAT", currency: "AED" },
  TH: { rate: 7, label: "VAT", currency: "THB" },
  VN: { rate: 10, label: "VAT", currency: "VND" },
  MY: { rate: 6, label: "SST", currency: "MYR" },
  ID: { rate: 11, label: "PPN (VAT)", currency: "IDR" },
  PH: { rate: 12, label: "VAT", currency: "PHP" },
  SG: { rate: 9, label: "GST", currency: "SGD" },
  MX: { rate: 16, label: "IVA", currency: "MXN" },
  AR: { rate: 21, label: "IVA", currency: "ARS" },
  CL: { rate: 19, label: "IVA", currency: "CLP" },
  KE: { rate: 16, label: "VAT", currency: "KES" },
  MA: { rate: 20, label: "TVA", currency: "MAD" },
  PL: { rate: 23, label: "VAT", currency: "PLN" },
  CH: { rate: 8.1, label: "VAT", currency: "CHF" },
  SE: { rate: 25, label: "Moms (VAT)", currency: "SEK" },
  NO: { rate: 25, label: "MVA (VAT)", currency: "NOK" },
  RU: { rate: 20, label: "VAT", currency: "RUB" },
};

// ── FTA preferential rates (origin→dest) ────────────────────────────────
// Format: `${origin}->${dest}` → { ftaName, rate }
// The rate is the *preferential* ad valorem rate (%); when 0, fully liberalised.

interface FtaPref { ftaName: string; rate: number; }

const FTA_TABLE: Record<string, FtaPref> = {
  // Egypt → EU (Association Agreement, in force since 2004)
  "EG->DE": { ftaName: "EG-EU Association Agreement", rate: 0 },
  "EG->FR": { ftaName: "EG-EU Association Agreement", rate: 0 },
  "EG->NL": { ftaName: "EG-EU Association Agreement", rate: 0 },
  "EG->IT": { ftaName: "EG-EU Association Agreement", rate: 0 },
  "EG->ES": { ftaName: "EG-EU Association Agreement", rate: 0 },
  // Egypt → UK (UK-Egypt Association Agreement post-Brexit)
  "EG->GB": { ftaName: "UK-Egypt Association Agreement", rate: 0 },
  // Egypt → GCC (Greater Arab Free Trade Area)
  "EG->SA": { ftaName: "GAFTA", rate: 0 },
  "EG->AE": { ftaName: "GAFTA", rate: 0 },
  // Vietnam → EU (EVFTA, since Aug 2020)
  "VN->DE": { ftaName: "EVFTA", rate: 0 },
  "VN->FR": { ftaName: "EVFTA", rate: 0 },
  "VN->NL": { ftaName: "EVFTA", rate: 0 },
  // Turkey → EU (Customs Union for industrial goods)
  "TR->DE": { ftaName: "EU-Turkey Customs Union", rate: 0 },
  "TR->FR": { ftaName: "EU-Turkey Customs Union", rate: 0 },
  "TR->NL": { ftaName: "EU-Turkey Customs Union", rate: 0 },
  // South Africa → EU (SADC EPA)
  "ZA->DE": { ftaName: "SADC-EU EPA", rate: 0 },
  "ZA->FR": { ftaName: "SADC-EU EPA", rate: 0 },
  // Kenya → EU (EU-Kenya EPA, 2024)
  "KE->DE": { ftaName: "EU-Kenya EPA", rate: 0 },
  "KE->NL": { ftaName: "EU-Kenya EPA", rate: 0 },
  // Morocco → EU (Association Agreement)
  "MA->DE": { ftaName: "EU-Morocco Association Agreement", rate: 0 },
  "MA->FR": { ftaName: "EU-Morocco Association Agreement", rate: 0 },
  "MA->ES": { ftaName: "EU-Morocco Association Agreement", rate: 0 },
  // Australia → China (ChAFTA)
  "AU->CN": { ftaName: "ChAFTA", rate: 0 },
  // ASEAN → China (ACFTA)
  "VN->CN": { ftaName: "ACFTA", rate: 0 },
  "TH->CN": { ftaName: "ACFTA", rate: 0 },
  "MY->CN": { ftaName: "ACFTA", rate: 0 },
  "ID->CN": { ftaName: "ACFTA", rate: 0 },
  // USMCA
  "US->CA": { ftaName: "USMCA", rate: 0 },
  "US->MX": { ftaName: "USMCA", rate: 0 },
  "CA->US": { ftaName: "USMCA", rate: 0 },
  "MX->US": { ftaName: "USMCA", rate: 0 },
  // ASEAN → India (AIFTA — partial)
  "VN->IN": { ftaName: "AIFTA", rate: 5 },
  "TH->IN": { ftaName: "AIFTA", rate: 5 },
  // GCC internal (fully liberalised)
  "SA->AE": { ftaName: "GCC", rate: 0 },
  "AE->SA": { ftaName: "GCC", rate: 0 },
};

// ── Anti-dumping orders (hardcoded — top 10 most-cited AD cases) ────────
// Key: `${origin}->${dest}|${hsPrefix}` (HS prefix = chapter or 4-digit)

interface AdOrder { rate: number; source: string; }

const ANTI_DUMPING_TABLE: Record<string, AdOrder> = {
  // EU AD on Chinese bicycle imports (HS 8712)
  "CN->DE|8712": { rate: 48.5, source: "EU Council Reg 2018/88" },
  "CN->FR|8712": { rate: 48.5, source: "EU Council Reg 2018/88" },
  "CN->NL|8712": { rate: 48.5, source: "EU Council Reg 2018/88" },
  // EU AD on Chinese solar panels (HS 8541/8542)
  "CN->DE|8541": { rate: 29.0, source: "EU Reg 2018/1285" },
  "CN->FR|8541": { rate: 29.0, source: "EU Reg 2018/1285" },
  "CN->NL|8541": { rate: 29.0, source: "EU Reg 2018/1285" },
  // US AD on Chinese wooden bedroom furniture (HS 9403)
  "CN->US|9403": { rate: 198.0, source: "US DOC AD Order C-570-898" },
  // US AD on Chinese warmwater shrimp (HS 0306)
  "CN->US|0306": { rate: 113.0, source: "US DOC AD Order A-570-822" },
  "VN->US|0306": { rate: 25.8, source: "US DOC AD Order A-552-802" },
  // US AD on Vietnamese honey (HS 0409)
  "VN->US|0409": { rate: 61.0, source: "US DOC AD Order A-552-803" },
  // EU AD on Chinese ceramic tableware (HS 6911/6912)
  "CN->DE|6911": { rate: 22.9, source: "EU Reg 2019/1441" },
  "CN->FR|6911": { rate: 22.9, source: "EU Reg 2019/1441" },
  // EU AD on Indonesian biodiesel (HS 3826)
  "ID->DE|3826": { rate: 8.0, source: "EU Reg 2019/2148" },
  // US AD on Indian shrimp (HS 0306)
  "IN->US|0306": { rate: 4.7, source: "US DOC AD Order A-533-848" },
};

function findAntiDumping(origin: string, dest: string, hsCode: string): AdOrder | null {
  // Try chapter (2-digit), then 4-digit
  const chapter = (hsCode ?? "").slice(0, 2);
  const fourDigit = (hsCode ?? "").slice(0, 4);
  return (
    ANTI_DUMPING_TABLE[`${origin}->${dest}|${chapter}`] ??
    ANTI_DUMPING_TABLE[`${origin}->${dest}|${fourDigit}`] ??
    null
  );
}

// ── Live MFN lookup via WITS ────────────────────────────────────────────

async function lookupMfnViaWits(hsCode: string, destinationCountry: string): Promise<{ rate: number; source: string } | null> {
  try {
    const reporterIso3 = ISO2_TO_ISO3[destinationCountry];
    if (!reporterIso3) return null;
    const hs6 = (hsCode ?? "").slice(0, 6);
    if (hs6.length < 2) return null;
    const result = await queryWitsTariff(reporterIso3, "000", hs6);
    if (!result.ok || result.records.length === 0) return null;
    const rec = result.records[0];
    const rate = Number(rec.value);
    if (!Number.isFinite(rate) || rate < 0) return null;
    return { rate: Number(rate.toFixed(2)), source: `wits.worldbank.org (${result.query.year})` };
  } catch (err: any) {
    logger.warn("tariff-engine: wits lookup failed", { error: err?.message, destinationCountry, hsCode });
    return null;
  }
}

// ── Public API ──────────────────────────────────────────────────────────

export async function calculateDuty(
  hsCode: string,
  originCountry: string,
  destinationCountry: string,
  customsValue: number,
): Promise<DutyCalculation> {
  const screenedAt = new Date().toISOString();
  const origin = (originCountry ?? "").toUpperCase().trim();
  const dest = (destinationCountry ?? "").toUpperCase().trim();
  const hs = (hsCode ?? "").trim();
  const value = Math.max(0, Number(customsValue) || 0);
  const vatInfo = VAT_TABLE[dest] ?? { rate: 0, label: "VAT (assumed 0)", currency: "USD" };
  const currency = vatInfo.currency;

  // 1. MFN rate — try WITS live, then fallback table
  let mfnRate = 0;
  let mfnSource = "fallback (unknown destination)";
  const fallbackRate = MFN_FALLBACK[dest];
  if (Number.isFinite(fallbackRate)) {
    mfnRate = fallbackRate;
    mfnSource = "SGTX hardcoded MFN table";
  }
  const wits = await lookupMfnViaWits(hs, dest);
  if (wits) {
    mfnRate = wits.rate;
    mfnSource = wits.source;
  }

  // 2. Preferential rate (FTA)
  const fta = FTA_TABLE[`${origin}->${dest}`] ?? null;
  const preferentialRate = fta ? fta.rate : null;
  const appliedRate = preferentialRate != null ? Math.min(mfnRate, preferentialRate) : mfnRate;
  const ftaName = fta?.ftaName ?? null;

  // 3. Anti-dumping duty
  const ad = findAntiDumping(origin, dest, hs);
  const antiDumpingRate = ad?.rate ?? 0;
  const antiDumpingSource = ad?.source ?? "no AD order";
  const antiDumpingDuty = Number(((value * antiDumpingRate) / 100).toFixed(2));

  // 4. Customs duty (ad valorem on customs value)
  const customsDuty = Number(((value * appliedRate) / 100).toFixed(2));

  // 5. VAT/GST — typically charged on (customs value + customs duty + excise + AD)
  const vatBase = value + customsDuty + antiDumpingDuty;
  const vatRate = vatInfo.rate;
  const vatAmount = Number(((vatBase * vatRate) / 100).toFixed(2));

  // 6. Totals
  const totalDuty = Number((customsDuty + antiDumpingDuty).toFixed(2));
  const totalTax = vatAmount;
  const grandTotal = Number((totalDuty + totalTax).toFixed(2));

  const breakdown: Array<{ label: string; rate: number; amount: number }> = [
    { label: `Customs duty (MFN ${mfnRate}%${preferentialRate != null ? ` / FTA ${preferentialRate}%` : ""})`, rate: appliedRate, amount: customsDuty },
  ];
  if (ad) {
    breakdown.push({ label: `Anti-dumping (${ad.source})`, rate: antiDumpingRate, amount: antiDumpingDuty });
  }
  breakdown.push({ label: `${vatInfo.label} (${vatRate}%)`, rate: vatRate, amount: vatAmount });

  return {
    hsCode: hs,
    originCountry: origin,
    destinationCountry: dest,
    customsValue: value,
    currency,
    mfnRate,
    mfnSource,
    preferentialRate,
    ftaName,
    appliedRate,
    antiDumpingDuty,
    antiDumpingRate,
    antiDumpingSource,
    vatRate,
    vatAmount,
    vatLabel: vatInfo.label,
    totalDuty,
    totalTax,
    grandTotal,
    calculationBreakdown: breakdown,
    source: wits ? "WITS_LIVE" : "SGTX_HARDCODED",
    screenedAt,
    notes: fta
      ? `FTA ${fta.ftaName} applies — preferential rate ${preferentialRate}%. Verify certificate of origin is filed.`
      : "No FTA preference identified for this lane. MFN rate applied.",
  };
}

// Convenience: list supported destination countries (for UI)
export function listSupportedDestinations(): string[] {
  return Object.keys(VAT_TABLE).sort();
}

// Convenience: list FTA lanes (for UI / debugging)
export function listFtaLanes(): Array<{ lane: string; ftaName: string; rate: number }> {
  return Object.entries(FTA_TABLE).map(([lane, p]) => ({ lane, ftaName: p.ftaName, rate: p.rate }));
}
