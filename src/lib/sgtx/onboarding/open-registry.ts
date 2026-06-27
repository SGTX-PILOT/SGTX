// SGTX Open Registry Verification (Batch B / B9)
// Multi-source company verification using FREE open registries:
//   1. GLEIF (https://api.gleif.org/api/v1/lei-records) — REST/JSON, no API key
//      Search by name, jurisdiction, or registration number. Returns legal name,
//      LEI, address, jurisdiction, legal form, status.
//   2. EU VIES (https://ec.europa.eu/taxation_customs/vies/services/checkVatService)
//      SOAP API to validate EU VAT numbers. Returns company name + address.
//
// All HTTP calls use the standard `fetch` available in Next.js 16 runtimes.
// Timeouts are enforced via AbortController (8s per call) so a slow registry
// never blocks onboarding.

const GLEIF_BASE = "https://api.gleif.org/api/v1/lei-records";
const VIES_ENDPOINT = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";
const REGISTRY_TIMEOUT_MS = 8000;

// ============ Types ============

export interface RegistryVerifyInput {
  companyName?: string;
  registrationNumber?: string;
  country: string; // ISO 3166-1 alpha-2
  vatNumber?: string; // EU VAT (without country prefix if country provided separately)
  lei?: string; // 20-char LEI
}

export interface RegistryCompany {
  legalName: string | null;
  registeredAs: string | null; // CR / registration number from registry
  lei: string | null;
  jurisdiction: string | null;
  legalAddress: string | null;
  legalForm: string | null;
  status: string | null;
}

export interface RegistryVerifyResult {
  verified: boolean;
  source: "GLEIF" | "EU_VIES" | "NONE";
  confidence: number; // 0..1
  company: RegistryCompany;
  matchedFields: string[];
  mismatchedFields: string[];
  warnings: string[];
  checkedAt: string;
}

export interface RegistrySearchHit {
  lei: string;
  legalName: string;
  registeredAs: string | null;
  jurisdiction: string | null;
  city: string | null;
  status: string | null;
}

// ============ Helpers ============

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REGISTRY_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function normalize(s: string | null | undefined): string {
  return (s || "").trim().toLowerCase().replace(/[,\./]/g, " ").replace(/\s+/g, " ");
}

function jaccardSimilarity(a: string, b: string): number {
  const sa = new Set(normalize(a).split(" ").filter(Boolean));
  const sb = new Set(normalize(b).split(" ").filter(Boolean));
  if (sa.size === 0 || sb.size === 0) return 0;
  let inter = 0;
  for (const x of sa) if (sb.has(x)) inter++;
  return inter / (sa.size + sb.size - inter);
}

// ============ GLEIF ============

interface GleifRecord {
  lei?: string;
  status?: string;
  entity?: {
    legalName?: { name?: string };
    legalAddress?: {
      firstAddressLine?: string;
      city?: string;
      country?: string;
      postalCode?: string;
    };
    legalForm?: string;
    registeredAs?: string;
  };
  registration?: {
    jurisdiction?: string;
  };
}

interface GleifResponse {
  data?: GleifRecord | GleifRecord[];
}

async function gleifLookupByLei(lei: string): Promise<GleifRecord | null> {
  try {
    const r = await fetchWithTimeout(`${GLEIF_BASE}/${encodeURIComponent(lei)}`);
    if (!r.ok) return null;
    const j = (await r.json()) as GleifResponse;
    return Array.isArray(j.data) ? j.data[0] || null : j.data || null;
  } catch {
    return null;
  }
}

async function gleifSearch(params: {
  name?: string;
  country?: string;
  registrationNumber?: string;
  limit?: number;
}): Promise<GleifRecord[]> {
  const filters: string[] = [];
  if (params.name) filters.push(`entity.legalName.name="${params.name.replace(/"/g, "")}"`);
  if (params.country) filters.push(`entity.legalAddress.country=${params.country.toUpperCase()}`);
  if (params.registrationNumber) filters.push(`entity.registeredAs="${params.registrationNumber.replace(/"/g, "")}"`);
  const q = new URLSearchParams({
    "filter[entity.legalName]": "true",
    "page[size]": String(params.limit || 10),
  });
  if (filters.length > 0) q.set("filter", filters.join(" and "));
  try {
    const r = await fetchWithTimeout(`${GLEIF_BASE}?${q.toString()}`);
    if (!r.ok) return [];
    const j = (await r.json()) as GleifResponse;
    const data = j.data;
    if (!data) return [];
    return Array.isArray(data) ? data : [data];
  } catch {
    return [];
  }
}

function gleifToCompany(rec: GleifRecord): RegistryCompany {
  const addr = rec.entity?.legalAddress;
  const addrStr = [addr?.firstAddressLine, addr?.postalCode, addr?.city, addr?.country]
    .filter(Boolean).join(", ") || null;
  return {
    legalName: rec.entity?.legalName?.name || null,
    registeredAs: rec.entity?.registeredAs || null,
    lei: rec.lei || null,
    jurisdiction: rec.registration?.jurisdiction || addr?.country || null,
    legalAddress: addrStr,
    legalForm: rec.entity?.legalForm || null,
    status: rec.status || null,
  };
}

// ============ EU VIES (SOAP) ============

function buildViesSoapEnvelope(country: string, vatNumber: string): string {
  // Strip the country prefix if the caller included it.
  const cc = country.toUpperCase().slice(0, 2);
  const vn = vatNumber.toUpperCase().startsWith(cc) ? vatNumber.slice(2) : vatNumber;
  return `<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <checkVat xmlns="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
      <countryCode>${cc}</countryCode>
      <vatNumber>${vn.replace(/[^A-Z0-9]/g, "")}</vatNumber>
    </checkVat>
  </soap:Body>
</soap:Envelope>`;
}

interface ViesResult {
  valid: boolean;
  name: string | null;
  address: string | null;
}

async function viesCheckVat(country: string, vatNumber: string): Promise<ViesResult | null> {
  if (!country || !vatNumber) return null;
  const soap = buildViesSoapEnvelope(country, vatNumber);
  try {
    const r = await fetchWithTimeout(VIES_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8", SOAPAction: "" },
      body: soap,
    });
    if (!r.ok) return null;
    const text = await r.text();
    // Minimal SOAP response parse — pull out <valid>, <name>, <address>
    const valid = /<valid>([^<]+)<\/valid>/.exec(text)?.[1]?.trim() === "true";
    const name = /<name>([^<]*)<\/name>/.exec(text)?.[1]?.trim() || null;
    const address = /<address>([^<]*)<\/address>/.exec(text)?.[1]?.trim() || null;
    return { valid, name: name || null, address: address || null };
  } catch {
    return null;
  }
}

// ============ Public API ============

export async function verifyCompany(input: RegistryVerifyInput): Promise<RegistryVerifyResult> {
  const checkedAt = new Date().toISOString();
  const base: RegistryVerifyResult = {
    verified: false,
    source: "NONE",
    confidence: 0,
    company: {
      legalName: null, registeredAs: null, lei: null,
      jurisdiction: null, legalAddress: null, legalForm: null, status: null,
    },
    matchedFields: [],
    mismatchedFields: [],
    warnings: [],
    checkedAt,
  };

  // 1. GLEIF first — preferred for LEI / registered name.
  let gleifCompany: RegistryCompany | null = null;
  let gleifSource = "";
  if (input.lei && input.lei.length === 20) {
    const rec = await gleifLookupByLei(input.lei);
    if (rec) { gleifCompany = gleifToCompany(rec); gleifSource = "GLEIF (by LEI)"; }
  }
  if (!gleifCompany) {
    const hits = await gleifSearch({
      name: input.companyName,
      country: input.country,
      registrationNumber: input.registrationNumber,
      limit: 5,
    });
    if (hits.length > 0) {
      // Pick the best name match if a name was supplied, else first hit.
      let best = hits[0];
      if (input.companyName) {
        let bestScore = -1;
        for (const h of hits) {
          const score = jaccardSimilarity(input.companyName, h.entity?.legalName?.name || "");
          if (score > bestScore) { bestScore = score; best = h; }
        }
      }
      gleifCompany = gleifToCompany(best);
      gleifSource = "GLEIF (by search)";
    }
  }

  if (gleifCompany) {
    const matched: string[] = [];
    const mismatched: string[] = [];
    if (input.companyName && gleifCompany.legalName) {
      const sim = jaccardSimilarity(input.companyName, gleifCompany.legalName);
      if (sim >= 0.6) matched.push("companyName");
      else mismatched.push("companyName");
    }
    if (input.registrationNumber && gleifCompany.registeredAs) {
      if (normalize(input.registrationNumber) === normalize(gleifCompany.registeredAs)) matched.push("registrationNumber");
      else mismatched.push("registrationNumber");
    }
    if (input.lei && gleifCompany.lei && input.lei.toUpperCase() === gleifCompany.lei.toUpperCase()) {
      matched.push("lei");
    }
    if (input.country && gleifCompany.jurisdiction &&
        input.country.toUpperCase() === gleifCompany.jurisdiction.toUpperCase().slice(0, 2)) {
      matched.push("country");
    } else if (input.country && gleifCompany.jurisdiction) {
      mismatched.push("country");
    }
    const verified = matched.length >= 1 && (mismatched.length === 0 || matched.length > mismatched.length);
    return {
      verified,
      source: "GLEIF",
      confidence: Math.min(1, 0.5 + matched.length * 0.15 - mismatched.length * 0.1),
      company: gleifCompany,
      matchedFields: matched,
      mismatchedFields: mismatched,
      warnings: gleifCompany.status && gleifCompany.status !== "ISSUED"
        ? [`GLEIF status is ${gleifCompany.status}`]
        : [],
      checkedAt,
    };
  }

  // 2. Fall back to EU VIES if a VAT number was supplied.
  if (input.vatNumber && input.country) {
    const v = await viesCheckVat(input.country, input.vatNumber);
    if (v) {
      const company: RegistryCompany = {
        legalName: v.name,
        registeredAs: input.vatNumber,
        lei: null,
        jurisdiction: input.country.toUpperCase(),
        legalAddress: v.address,
        legalForm: null,
        status: v.valid ? "VAT_VALID" : "VAT_INVALID",
      };
      const matched: string[] = [];
      const mismatched: string[] = [];
      if (!v.valid) {
        mismatched.push("vatNumber");
        return { ...base, source: "EU_VIES", company, verified: false, confidence: 0, mismatchedFields: mismatched, warnings: ["VAT number failed VIES validation"] };
      }
      if (input.companyName && v.name) {
        const sim = jaccardSimilarity(input.companyName, v.name);
        if (sim >= 0.5) matched.push("companyName"); else mismatched.push("companyName");
      }
      matched.push("vatNumber");
      return {
        verified: true,
        source: "EU_VIES",
        confidence: 0.7 + (matched.length - 1) * 0.1,
        company,
        matchedFields: matched,
        mismatchedFields: mismatched,
        warnings: [],
        checkedAt,
      };
    }
  }

  // 3. Nothing found.
  return {
    ...base,
    warnings: ["No GLEIF record matched and no EU VIES response (non-EU country or unreachable registry)."],
  };
}

export async function searchCompanyByRegistry(
  query: string,
  jurisdiction?: string,
  limit = 10,
): Promise<RegistrySearchHit[]> {
  if (!query || query.trim().length < 2) return [];
  const hits = await gleifSearch({ name: query, country: jurisdiction, limit });
  return hits.map((h) => ({
    lei: h.lei || "",
    legalName: h.entity?.legalName?.name || "",
    registeredAs: h.entity?.registeredAs || null,
    jurisdiction: h.registration?.jurisdiction || h.entity?.legalAddress?.country || null,
    city: h.entity?.legalAddress?.city || null,
    status: h.status || null,
  }));
}
