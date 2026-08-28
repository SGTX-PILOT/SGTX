// @ts-nocheck
/**
 * SGTX ePhyto Hub Integration (G-08)
 * ===========================================
 *
 * The IPPC ePhyto Hub (https://ephyto.epit.biz/) is the UN-IPPC's central
 * electronic phytosanitary certificate exchange. It enables NPPOs to issue
 * and exchange phytosanitary certificates in the ISPM 12 XML format.
 *
 * The Hub has a REST API but access requires:
 *   1. Country NPPO registration (each country has one NPPO = one account)
 *   2. API key issued by the IPPC Secretariat
 *   3. Production environment access (sandbox at https://ephyto-sandbox.epit.biz)
 *
 * SGTX therefore implements this module as:
 *   • A document generator that produces an ePhyto XML in the ISPM 12
 *     IPPC2018 schema. NPPOs that have integrated with the Hub can submit
 *     this XML directly via the IPPC ePhyto GeNZ client or their own NPPO
 *     system.
 *   • A verification stub that documents the requirements for live
 *     verification — calling the ePhyto Hub's GET
 *     /api/v1/phytos/{certificateNumber} endpoint with an API key.
 *
 * References:
 *   • IPPC ISPM 12 (Phytosanitary Certificates)
 *   • IPPC ePhyto Solution — Hub API Spec v1.5
 *   • IPPC2018 XML schema (https://ephyto.epit.biz/schema)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export interface PhytoParty {
  name: string;
  address: string;
  country: string;
}

export interface PhytoTreatment {
  treatmentType: string; // e.g. "COLD_TREATMENT", "FUMIGATION", "HEAT_TREATMENT", "IRRADIATION"
  chemical?: string;
  concentration?: string;
  duration?: string;
  temperature?: string;
  treatmentDate?: string;
}

export interface PhytoInspection {
  inspectionDate: string;
  inspectionLocation: string;
  inspectedBy: string; // NPPO officer name / licence
  result: "PASS" | "FAIL" | "PASS_WITH_TREATMENT";
  findings?: string;
}

export interface PhytoData {
  ustn?: string;
  certificateNumber?: string; // If left blank, one will be generated
  // Issuing NPPO
  issuingNppo: PhytoParty; // National Plant Protection Organisation
  // Exporter / importer
  exporter: PhytoParty;
  importer: PhytoParty;
  consignee?: PhytoParty;
  // Goods
  botanicalName: string; // Latin binomial (e.g. "Fragaria × ananassa")
  commonName: string;
  hsCode: string;
  goodsDescription: string;
  quantity: number;
  unit: string; // e.g. "KG", "CT", "BX"
  packageType: string;
  numberOfPackages: number;
  containerNumbers?: string[];
  distinguishingMarks?: string;
  // Origin & destination
  countryOfOrigin: string;
  countryOfDestination: string;
  loadingPort: string;
  dischargePort: string;
  transportMode: string;
  // Phytosanitary
  declaredTreatment?: PhytoTreatment;
  inspection: PhytoInspection;
  // Additional declarations
  additionalDeclarations?: string[];
  // Disinfestation / disinfection
  disinfestationDone?: boolean;
  disinfectionDone?: boolean;
}

export interface PhytoResult {
  certificateNumber: string;
  certificateXml: string;
  status: "GENERATED";
  notes: string;
  submittedTo: string;
  generatedAt: string;
}

export interface VerifyResult {
  certificateNumber: string;
  verified: boolean;
  status: "UNVERIFIED" | "VALID" | "INVALID" | "EXPIRED" | "REVOKED";
  source: string;
  notes: string;
  verifiedAt: string;
}

// ── Certificate number generator ────────────────────────────────────────

function generatePhytoCertificateNumber(countryOfOrigin: string): string {
  const year = new Date().getFullYear();
  const country = (countryOfOrigin ?? "XX").toUpperCase().trim().slice(0, 2);
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${country}-${year}-${rand}`;
}

// ── XML escape ──────────────────────────────────────────────────────────

function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function partyXml(p: PhytoParty, label: string): string {
  if (!p) return `    <${label}/>`;
  return `    <${label}>
      <Name>${escapeXml(p.name)}</Name>
      <Address>${escapeXml(p.address)}</Address>
      <Country>${escapeXml(p.country)}</Country>
    </${label}>`;
}

// ── ISPM 12 ePhyto XML generator ────────────────────────────────────────

function buildPhytoXml(certificateNumber: string, data: PhytoData): string {
  const generatedAt = new Date().toISOString();
  let treatmentXml = "";
  if (data.declaredTreatment) {
    const t = data.declaredTreatment;
    treatmentXml = `    <Treatment>
      <Type>${escapeXml(t.treatmentType)}</Type>
      ${t.chemical ? `<Chemical>${escapeXml(t.chemical)}</Chemical>` : ""}
      ${t.concentration ? `<Concentration>${escapeXml(t.concentration)}</Concentration>` : ""}
      ${t.duration ? `<Duration>${escapeXml(t.duration)}</Duration>` : ""}
      ${t.temperature ? `<Temperature>${escapeXml(t.temperature)}</Temperature>` : ""}
      ${t.treatmentDate ? `<TreatmentDate>${escapeXml(t.treatmentDate)}</TreatmentDate>` : ""}
    </Treatment>`;
  }
  const addDeclXml = (data.additionalDeclarations ?? [])
    .map((d) => `      <AdditionalDeclaration>${escapeXml(d)}</AdditionalDeclaration>`)
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SGTX-generated ePhyto Certificate (IPPC ISPM 12 — IPPC2018 schema) -->
<!-- Generated: ${generatedAt} -->
<!-- Submit via: NPPO's ePhyto GeNZ client OR the IPPC ePhyto Hub REST API -->
<!-- (requires NPPO registration + API key issued by IPPC Secretariat) -->
<PhytosanitaryCertificate xmlns="urn:ippc:phyto:2018">
  <CertificateNumber>${escapeXml(certificateNumber)}</CertificateNumber>
  <GenerationTimestamp>${generatedAt}</GenerationTimestamp>
  <IssuingNppo>
${partyXml(data.issuingNppo, "Nppo")}
  </IssuingNppo>
  <Parties>
${partyXml(data.exporter, "Exporter")}
${partyXml(data.importer, "Importer")}
${data.consignee ? partyXml(data.consignee, "Consignee") : ""}
  </Parties>
  <Goods>
    <BotanicalName>${escapeXml(data.botanicalName)}</BotanicalName>
    <CommonName>${escapeXml(data.commonName)}</CommonName>
    <HsCode>${escapeXml(data.hsCode)}</HsCode>
    <Description>${escapeXml(data.goodsDescription)}</Description>
    <Quantity>${Number(data.quantity || 0)}</Quantity>
    <Unit>${escapeXml(data.unit)}</Unit>
    <PackageType>${escapeXml(data.packageType)}</PackageType>
    <NumberOfPackages>${Number(data.numberOfPackages || 0)}</NumberOfPackages>
    ${(data.containerNumbers ?? []).map((c) => `<Container>${escapeXml(c)}</Container>`).join("\n    ")}
    ${data.distinguishingMarks ? `<DistinguishingMarks>${escapeXml(data.distinguishingMarks)}</DistinguishingMarks>` : ""}
  </Goods>
  <Movement>
    <CountryOfOrigin>${escapeXml(data.countryOfOrigin)}</CountryOfOrigin>
    <CountryOfDestination>${escapeXml(data.countryOfDestination)}</CountryOfDestination>
    <LoadingPort>${escapeXml(data.loadingPort)}</LoadingPort>
    <DischargePort>${escapeXml(data.dischargePort)}</DischargePort>
    <TransportMode>${escapeXml(data.transportMode)}</TransportMode>
  </Movement>
  ${treatmentXml}
  <Inspection>
    <InspectionDate>${escapeXml(data.inspection.inspectionDate)}</InspectionDate>
    <InspectionLocation>${escapeXml(data.inspection.inspectionLocation)}</InspectionLocation>
    <InspectedBy>${escapeXml(data.inspection.inspectedBy)}</InspectedBy>
    <Result>${escapeXml(data.inspection.result)}</Result>
    ${data.inspection.findings ? `<Findings>${escapeXml(data.inspection.findings)}</Findings>` : ""}
  </Inspection>
  ${addDeclXml ? `<AdditionalDeclarations>\n${addDeclXml}\n    </AdditionalDeclarations>` : ""}
  ${data.disinfestationDone != null ? `<DisinfestationDone>${data.disinfestationDone}</DisinfestationDone>` : ""}
  ${data.disinfectionDone != null ? `<DisinfectionDone>${data.disinfectionDone}</DisinfectionDone>` : ""}
</PhytosanitaryCertificate>`;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function generatePhytosanitaryCertificate(data: PhytoData): Promise<PhytoResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.issuingNppo?.name) {
      throw new Error("issuingNppo.name is required");
    }
    if (!data?.botanicalName || !data?.commonName) {
      throw new Error("botanicalName and commonName are required");
    }
    const certNumber = data.certificateNumber || generatePhytoCertificateNumber(data.countryOfOrigin);
    const xml = buildPhytoXml(certNumber, data);

    logger.info("ephyto: phytosanitary certificate generated", {
      certNumber,
      botanical: data.botanicalName,
      origin: data.countryOfOrigin,
      destination: data.countryOfDestination,
    });

    return {
      certificateNumber: certNumber,
      certificateXml: xml,
      status: "GENERATED",
      notes:
        "ePhyto XML generated in IPPC ISPM 12 (IPPC2018) format. Submit via the NPPO's ePhyto GeNZ " +
        "client OR the IPPC ePhyto Hub REST API (requires NPPO registration + API key).",
      submittedTo: `IPPC ePhyto Hub via ${data.issuingNppo.name}`,
      generatedAt,
    };
  } catch (err: any) {
    logger.error("ephyto: generatePhytosanitaryCertificate failed", { error: err?.message });
    return {
      certificateNumber: "",
      certificateXml: "",
      status: "GENERATED",
      notes: `Phytosanitary certificate generation failed: ${err?.message ?? String(err)}`,
      submittedTo: "",
      generatedAt,
    };
  }
}

/**
 * Verify a phytosanitary certificate against the IPPC ePhyto Hub.
 *
 * STUB: real verification requires:
 *   • Country NPPO registration + API key
 *   • Endpoint: GET https://ephyto.epit.biz/api/v1/phytos/{certificateNumber}
 *   • Headers: Authorization: Bearer {NPPO_API_KEY}
 *
 * Until the NPPO credentials are configured, this function returns
 * `status: UNVERIFIED` with `verified: false`. Callers must NOT treat the
 * certificate as valid based solely on this stub.
 */
export async function verifyPhytosanitaryCertificate(
  certificateNumber: string,
): Promise<VerifyResult> {
  const verifiedAt = new Date().toISOString();
  try {
    const cn = (certificateNumber ?? "").trim();
    if (!cn) {
      return {
        certificateNumber: "",
        verified: false,
        status: "UNVERIFIED",
        source: "iphyto hub (stub)",
        notes: "Empty certificate number.",
        verifiedAt,
      };
    }

    const nppoApiKey = process.env.IPPC_EPHYTO_API_KEY;
    const ephytoEndpoint = process.env.IPPC_EPHYTO_ENDPOINT || "https://ephyto.epit.biz";

    if (!nppoApiKey) {
      // STUB: document the API requirements and return UNVERIFIED
      logger.info("ephyto: verify — no API key configured, returning UNVERIFIED stub", { cert: cn });
      return {
        certificateNumber: cn,
        verified: false,
        status: "UNVERIFIED",
        source: "iphyto hub (stub)",
        notes:
          `Live verification requires IPPC ePhyto Hub API access. Set IPPC_EPHYTO_API_KEY env var. ` +
          `Endpoint: GET ${ephytoEndpoint}/api/v1/phytos/${encodeURIComponent(cn)}. ` +
          `Contact the IPPC Secretariat to obtain NPPO credentials.`,
        verifiedAt,
      };
    }

    // Live verification (requires API key — not bundled with SGTX deployment)
    try {
      const res = await fetch(`${ephytoEndpoint}/api/v1/phytos/${encodeURIComponent(cn)}`, {
        headers: {
          Authorization: `Bearer ${nppoApiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!res.ok) {
        logger.warn("ephyto: verify fetch failed", { status: res.status, cert: cn });
        return {
          certificateNumber: cn,
          verified: false,
          status: "UNVERIFIED",
          source: "iphyto hub",
          notes: `Hub returned HTTP ${res.status}.`,
          verifiedAt,
        };
      }
      const data: any = await res.json();
      const status: string = String(data?.status ?? "VALID").toUpperCase();
      const mappedStatus = (["VALID", "INVALID", "EXPIRED", "REVOKED"].includes(status) ? status : "UNVERIFIED") as VerifyResult["status"];
      return {
        certificateNumber: cn,
        verified: mappedStatus === "VALID",
        status: mappedStatus,
        source: "iphyto hub",
        notes: data?.notes ?? "Verified live against IPPC ePhyto Hub.",
        verifiedAt,
      };
    } catch (fetchErr: any) {
      logger.warn("ephyto: verify fetch threw", { error: fetchErr?.message, cert: cn });
      return {
        certificateNumber: cn,
        verified: false,
        status: "UNVERIFIED",
        source: "iphyto hub",
        notes: `Hub unreachable: ${fetchErr?.message ?? String(fetchErr)}`,
        verifiedAt,
      };
    }
  } catch (err: any) {
    logger.error("ephyto: verifyPhytosanitaryCertificate failed", { error: err?.message });
    return {
      certificateNumber,
      verified: false,
      status: "UNVERIFIED",
      source: "iphyto hub (stub)",
      notes: `Verification failed: ${err?.message ?? String(err)}`,
      verifiedAt,
    };
  }
}
