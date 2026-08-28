// @ts-nocheck
/**
 * SGTX Halal Certificate Verification (G-10)
 * ===========================================
 *
 * Halal certification is fragmented across dozens of national Islamic
 * authorities. Each country maintains its own list of recognised bodies,
 * and verification APIs are largely absent — most bodies require manual
 * lookup via their public certificate registry.
 *
 * Recognised bodies (top 6):
 *   • JAKIM (Malaysia) — Department of Islamic Development Malaysia
 *   • MUI / BPJPH (Indonesia) — Indonesian Ulema Council / Halal Product
 *     Assurance Agency (BPJPH took over from MUI in 2021)
 *   • GAC (GCC) — Gulf Cooperation Council Standardization Organization
 *     Halal Certificate (recognised across all 6 GCC states)
 *   • MUIS (Singapore) — Islamic Religious Council of Singapore
 *   • HCF (Australia) — Halal Certification Forum (now part of AHA)
 *   • ISWA (USA) — Islamic Services of America
 *
 * SGTX therefore implements this module as:
 *   • A structured verification stub that documents the API requirements
 *     for each body.
 *   • A recognised-bodies registry keyed by country.
 *
 * References:
 *   • OIC/SMIIC Halal conformity assessment framework
 *   • GSO 2055-1:2021 (GCC Halal standard)
 *   • JAKIM Manual Prosedur Pensijilan Halal Malaysia (MPPHM) 2020
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface HalalBody {
  code: string;
  name: string;
  fullName: string;
  country: string;
  region: string; // GCC, ASEAN, etc.
  recognisedByCountries: string[];
  verificationUrl: string;
  hasPublicApi: boolean;
  apiDocumentationUrl?: string;
  notes: string;
}

export interface HalalVerifyResult {
  certificateNumber: string;
  body: string;
  verified: boolean;
  status: "UNVERIFIED" | "VALID" | "INVALID" | "EXPIRED" | "REVOKED" | "UNKNOWN_BODY";
  source: string;
  certificateDetails?: any;
  notes: string;
  verifiedAt: string;
}

// ── Recognised halal certification bodies registry ──────────────────────

const HALAL_BODIES: HalalBody[] = [
  {
    code: "JAKIM",
    name: "JAKIM",
    fullName: "Department of Islamic Development Malaysia (Jabatan Kemajuan Islam Malaysia)",
    country: "MY",
    region: "ASEAN",
    recognisedByCountries: ["MY", "SG", "ID", "TH", "PH", "AE", "SA", "KW", "QA", "BH", "OM"],
    verificationUrl: "https://www.halal.gov.my/v4/index.php/terminal/senarai-sijil",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "Malaysian halal certification authority. Public web registry at halal.gov.my — no REST API. " +
      "Manual certificate verification via the e-SIHAT portal.",
  },
  {
    code: "BPJPH",
    name: "BPJPH (formerly MUI)",
    fullName: "Halal Product Assurance Organizing Agency (Badan Penyelenggara Jaminan Produk Halal)",
    country: "ID",
    region: "ASEAN",
    recognisedByCountries: ["ID", "MY", "SG", "AE", "SA", "KW", "QA", "BH", "OM"],
    verificationUrl: "https://ptsp.halal.go.id/",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "Indonesian halal authority (succeeded MUI in 2021). Public registry at ptsp.halal.go.id — " +
      "no REST API. MUI still issues fatwas; BPJPH issues the certificates.",
  },
  {
    code: "GAC",
    name: "GAC (GSO)",
    fullName: "GCC Accreditation Center (GAC) — Gulf Halal Certificate",
    country: "SA",
    region: "GCC",
    recognisedByCountries: ["SA", "AE", "KW", "QA", "BH", "OM"],
    verificationUrl: "https://www.gso.org.sa/GSO-Halal",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "GCC-wide halal standard (GSO 2055-1). Each GCC member state has a national halal body that " +
      "issues certificates under the GAC umbrella. Verification via national body portals.",
  },
  {
    code: "MUIS",
    name: "MUIS",
    fullName: "Islamic Religious Council of Singapore (Majlis Ugama Islam Singapura)",
    country: "SG",
    region: "ASEAN",
    recognisedByCountries: ["SG", "MY", "ID", "AE", "SA", "KW", "QA", "BH", "OM"],
    verificationUrl: "https://www.muis.gov.sg/Halal/Check-Halal-Certificates",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "Singapore halal authority (HQ in MUIS Building). Public web registry at muis.gov.sg — " +
      "no REST API. Certificate search by certificate number + company name.",
  },
  {
    code: "HCF",
    name: "HCF / AHA",
    fullName: "Halal Certification Forum (now Australian Halal Authority)",
    country: "AU",
    region: "OCEANIA",
    recognisedByCountries: ["AU", "NZ", "AE", "SA", "ID", "MY", "SG"],
    verificationUrl: "https://halalaustralia.org.au/verify-certificate/",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "Australian halal certification body. Public web registry at halalaustralia.org.au — no REST API.",
  },
  {
    code: "ISWA",
    name: "ISWA",
    fullName: "Islamic Services of America",
    country: "US",
    region: "AMERICAS",
    recognisedByCountries: ["US", "CA", "AE", "SA", "KW", "QA", "BH", "OM", "ID", "MY", "SG"],
    verificationUrl: "https://www.islahalal.com/verify-certificate/",
    hasPublicApi: false,
    apiDocumentationUrl: undefined,
    notes:
      "US-based halal certifier (recognised by GAC and JAKIM). Public web registry — no REST API.",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

function findBody(code: string): HalalBody | null {
  const c = (code ?? "").toUpperCase().trim();
  return HALAL_BODIES.find((b) => b.code === c) ?? null;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function verifyHalalCertificate(
  certificateNumber: string,
  body: string,
): Promise<HalalVerifyResult> {
  const verifiedAt = new Date().toISOString();
  try {
    const cn = (certificateNumber ?? "").trim();
    const bodyCode = (body ?? "").toUpperCase().trim();
    if (!cn || !bodyCode) {
      return {
        certificateNumber: cn,
        body: bodyCode,
        verified: false,
        status: "UNVERIFIED",
        source: "halal (stub)",
        notes: "Certificate number and body code are both required.",
        verifiedAt,
      };
    }

    const entry = findBody(bodyCode);
    if (!entry) {
      return {
        certificateNumber: cn,
        body: bodyCode,
        verified: false,
        status: "UNKNOWN_BODY",
        source: "halal (stub)",
        notes: `Body ${bodyCode} not in SGTX recognised-body registry. Valid codes: ${HALAL_BODIES.map((b) => b.code).join(", ")}.`,
        verifiedAt,
      };
    }

    // STUB: real verification requires calling each body's public registry.
    // None of the recognised bodies offer a public REST API. Manual
    // verification is required via the body's web portal.
    logger.info("halal: verify — returning UNVERIFIED stub", { cert: cn, body: bodyCode });

    return {
      certificateNumber: cn,
      body: bodyCode,
      verified: false,
      status: "UNVERIFIED",
      source: `${entry.name} (stub)`,
      certificateDetails: {
        bodyCode: entry.code,
        bodyFullName: entry.fullName,
        bodyCountry: entry.country,
        bodyRegion: entry.region,
        recognisedByCountries: entry.recognisedByCountries,
        verificationUrl: entry.verificationUrl,
        hasPublicApi: entry.hasPublicApi,
        apiDocumentationUrl: entry.apiDocumentationUrl,
      },
      notes:
        `Live verification requires manual lookup at ${entry.verificationUrl}. ` +
        `${entry.notes} SGTX has structured this stub so a real API integration ` +
        `can be dropped in once the body exposes one.`,
      verifiedAt,
    };
  } catch (err: any) {
    logger.error("halal: verifyHalalCertificate failed", { error: err?.message });
    return {
      certificateNumber,
      body,
      verified: false,
      status: "UNVERIFIED",
      source: "halal (stub)",
      notes: `Verification failed: ${err?.message ?? String(err)}`,
      verifiedAt,
    };
  }
}

/** Lists recognised halal certification bodies, optionally filtered by country. */
export async function listRecognisedBodies(country?: string): Promise<HalalBody[]> {
  try {
    if (!country) return HALAL_BODIES;
    const c = country.toUpperCase().trim();
    return HALAL_BODIES.filter((b) => b.recognisedByCountries.includes(c));
  } catch (err: any) {
    logger.error("halal: listRecognisedBodies failed", { error: err?.message });
    return HALAL_BODIES;
  }
}
