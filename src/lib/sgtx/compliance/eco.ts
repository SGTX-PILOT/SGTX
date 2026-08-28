// @ts-nocheck
/**
 * SGTX ICC WCF eCO Integration (G-09)
 * ===========================================
 *
 * The ICC World Chambers Federation (WCF) eCertificate of Origin (eCO)
 * system (https://certification.iccwbo.org/) enables chambers of commerce
 * to issue and exchange electronic Certificates of Origin (COs) globally.
 *
 * Supported certificate types:
 *   • EUR.1 — EU preferential origin (to FTA partners)
 *   • Form A — GSP origin (developing-country exporters → developed-country importers)
 *   • Form E — ASEAN-China FTA origin
 *   • GSP   — Generalised System of Preferences (umbrella term, often used for Form A)
 *   • Regular (non-preferential) Certificate of Origin
 *
 * The eCO system has a REST API but requires:
 *   1. Chamber of commerce registration (the chamber — not the exporter — holds the account)
 *   2. API key issued by ICC WCF
 *   3. Bilateral eCO network agreement between issuing + receiving chambers
 *
 * SGTX therefore implements this module as:
 *   • A document generator that produces the CO payload in the ICC eCO
 *     XML format (compatible with the WCF eCO network).
 *   • A verification stub that documents the requirements for live
 *     verification — calling the ICC eCO Hub's GET /api/v1/certificates/{number}.
 *
 * References:
 *   • ICC WCF eCO Network — Technical Specifications v3.0
 *   • WTO Annex D (Rules of Origin)
 *   • ICC Publication 850 (Guidelines for COs)
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type CertificateOriginType = "EUR1" | "FormA" | "FormE" | "GSP" | "regular";

export interface COOParty {
  name: string;
  address: string;
  country: string;
}

export interface COOGoodsItem {
  hsCode: string;
  goodsDescription: string;
  quantity: number;
  unit: string;
  invoiceValue: number;
  currency: string;
  grossWeightKg?: number;
  packageType?: string;
  numberOfPackages?: number;
  marksAndNumbers?: string;
}

export interface COOData {
  ustn?: string;
  certificateNumber?: string;
  certificateType: CertificateOriginType;
  // Issuing chamber
  issuingChamber: COOParty;
  chamberContact?: { name: string; email: string; phone: string };
  // Exporter / consignee / importer
  exporter: COOParty;
  consignee: COOParty;
  importer?: COOParty;
  // Transport
  transportMode: string;
  loadingPort: string;
  dischargePort: string;
  billOfLadingNumber?: string;
  invoiceNumber: string;
  invoiceDate: string;
  // Goods
  goodsItems: COOGoodsItem[];
  totalValue: number;
  currency: string;
  // Origin criteria
  originCriterion: string; // e.g. "P" (wholly obtained) for Form A, or letter (a/b/c) for EUR.1
  countryOfOrigin: string;
  countryOfDestination: string;
  // For preferential COs only
  thirdPartyInvoicing?: boolean;
  thirdPartyCountry?: string;
  // Remarks
  remarks?: string;
}

export interface COOResult {
  certificateNumber: string;
  certificateXml: string;
  certificateData: any;
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

function generateCertificateNumber(type: CertificateOriginType): string {
  const year = new Date().getFullYear();
  const rand = Math.floor(100000 + Math.random() * 900000);
  return `${type}-${year}-${rand}`;
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

function partyXml(p: COOParty, label: string): string {
  if (!p) return `    <${label}/>`;
  return `    <${label}>
      <Name>${escapeXml(p.name)}</Name>
      <Address>${escapeXml(p.address)}</Address>
      <Country>${escapeXml(p.country)}</Country>
    </${label}>`;
}

// ── eCO XML generator ───────────────────────────────────────────────────

function buildCOOXml(certificateNumber: string, data: COOData): string {
  const generatedAt = new Date().toISOString();
  const itemsXml = (data.goodsItems ?? [])
    .map(
      (g, i) => `      <GoodsItem sequence="${i + 1}">
        <HSCode>${escapeXml(g.hsCode)}</HSCode>
        <Description>${escapeXml(g.goodsDescription)}</Description>
        <Quantity>${Number(g.quantity || 0)}</Quantity>
        <Unit>${escapeXml(g.unit)}</Unit>
        <InvoiceValue currency="${escapeXml(g.currency)}">${Number(g.invoiceValue || 0).toFixed(2)}</InvoiceValue>
        ${g.grossWeightKg ? `<GrossWeightKg>${Number(g.grossWeightKg).toFixed(2)}</GrossWeightKg>` : ""}
        ${g.packageType ? `<PackageType>${escapeXml(g.packageType)}</PackageType>` : ""}
        ${g.numberOfPackages ? `<NumberOfPackages>${Number(g.numberOfPackages)}</NumberOfPackages>` : ""}
        ${g.marksAndNumbers ? `<MarksAndNumbers>${escapeXml(g.marksAndNumbers)}</MarksAndNumbers>` : ""}
      </GoodsItem>`,
    )
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SGTX-generated ICC WCF eCertificate of Origin (eCO) -->
<!-- Compatible with the WCF eCO Network Technical Specifications v3.0 -->
<!-- Generated: ${generatedAt} -->
<!-- Submit via: the issuing chamber of commerce's eCO platform -->
<!-- (requires ICC WCF eCO network registration + API key) -->
<CertificateOfOrigin xmlns="urn:icc:wcf:eco:v3" type="${escapeXml(data.certificateType)}">
  <CertificateNumber>${escapeXml(certificateNumber)}</CertificateNumber>
  <CertificateType>${escapeXml(data.certificateType)}</CertificateType>
  <GenerationTimestamp>${generatedAt}</GenerationTimestamp>
  <IssuingChamber>
${partyXml(data.issuingChamber, "Chamber")}
    ${data.chamberContact ? `<Contact>
      <Name>${escapeXml(data.chamberContact.name)}</Name>
      <Email>${escapeXml(data.chamberContact.email)}</Email>
      <Phone>${escapeXml(data.chamberContact.phone)}</Phone>
    </Contact>` : ""}
  </IssuingChamber>
  <Parties>
${partyXml(data.exporter, "Exporter")}
${partyXml(data.consignee, "Consignee")}
${data.importer ? partyXml(data.importer, "Importer") : ""}
  </Parties>
  <Transport>
    <Mode>${escapeXml(data.transportMode)}</Mode>
    <LoadingPort>${escapeXml(data.loadingPort)}</LoadingPort>
    <DischargePort>${escapeXml(data.dischargePort)}</DischargePort>
    ${data.billOfLadingNumber ? `<BillOfLadingNumber>${escapeXml(data.billOfLadingNumber)}</BillOfLadingNumber>` : ""}
    <InvoiceNumber>${escapeXml(data.invoiceNumber)}</InvoiceNumber>
    <InvoiceDate>${escapeXml(data.invoiceDate)}</InvoiceDate>
  </Transport>
  <GoodsItems>
${itemsXml}
  </GoodsItems>
  <Totals>
    <TotalValue currency="${escapeXml(data.currency)}">${Number(data.totalValue || 0).toFixed(2)}</TotalValue>
  </Totals>
  <Origin>
    <Criterion>${escapeXml(data.originCriterion)}</Criterion>
    <CountryOfOrigin>${escapeXml(data.countryOfOrigin)}</CountryOfOrigin>
    <CountryOfDestination>${escapeXml(data.countryOfDestination)}</CountryOfDestination>
    ${data.thirdPartyInvoicing != null ? `<ThirdPartyInvoicing>${data.thirdPartyInvoicing}</ThirdPartyInvoicing>` : ""}
    ${data.thirdPartyCountry ? `<ThirdPartyCountry>${escapeXml(data.thirdPartyCountry)}</ThirdPartyCountry>` : ""}
  </Origin>
  ${data.remarks ? `<Remarks>${escapeXml(data.remarks)}</Remarks>` : ""}
</CertificateOfOrigin>`;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function generateCertificateOfOrigin(
  data: COOData,
  type: CertificateOriginType,
): Promise<COOResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data?.issuingChamber?.name) {
      throw new Error("issuingChamber.name is required");
    }
    if (!data?.exporter?.name || !data?.consignee?.name) {
      throw new Error("exporter.name and consignee.name are required");
    }
    if (!data.goodsItems || data.goodsItems.length === 0) {
      throw new Error("At least one goods item is required");
    }
    const certNumber = data.certificateNumber || generateCertificateNumber(type);
    const certType = type || data.certificateType || "regular";
    const xml = buildCOOXml(certNumber, { ...data, certificateType: certType });

    const certificateData = {
      certificateNumber: certNumber,
      ustn: data.ustn ?? null,
      certificateType: certType,
      issuingChamber: data.issuingChamber,
      chamberContact: data.chamberContact ?? null,
      exporter: data.exporter,
      consignee: data.consignee,
      importer: data.importer ?? null,
      transport: {
        mode: data.transportMode,
        loadingPort: data.loadingPort,
        dischargePort: data.dischargePort,
        billOfLadingNumber: data.billOfLadingNumber,
        invoiceNumber: data.invoiceNumber,
        invoiceDate: data.invoiceDate,
      },
      goodsItems: data.goodsItems,
      totals: {
        totalValue: data.totalValue,
        currency: data.currency,
      },
      origin: {
        criterion: data.originCriterion,
        countryOfOrigin: data.countryOfOrigin,
        countryOfDestination: data.countryOfDestination,
        thirdPartyInvoicing: data.thirdPartyInvoicing ?? null,
        thirdPartyCountry: data.thirdPartyCountry ?? null,
      },
      remarks: data.remarks ?? null,
      generatedAt,
      regulation: "ICC WCF eCO Network Technical Specifications v3.0",
    };

    logger.info("eco: certificate of origin generated", {
      certNumber,
      type: certType,
      origin: data.countryOfOrigin,
      destination: data.countryOfDestination,
    });

    return {
      certificateNumber: certNumber,
      certificateXml: xml,
      certificateData,
      status: "GENERATED",
      notes:
        `Certificate of Origin (${certType}) generated in ICC WCF eCO v3 XML format. Submit via the ` +
        `issuing chamber of commerce's eCO platform (https://certification.iccwbo.org). The chamber ` +
        `must be registered with the ICC WCF eCO network.`,
      submittedTo: `ICC WCF eCO via ${data.issuingChamber.name}`,
      generatedAt,
    };
  } catch (err: any) {
    logger.error("eco: generateCertificateOfOrigin failed", { error: err?.message });
    return {
      certificateNumber: "",
      certificateXml: "",
      certificateData: null,
      status: "GENERATED",
      notes: `Certificate of Origin generation failed: ${err?.message ?? String(err)}`,
      submittedTo: "",
      generatedAt,
    };
  }
}

/**
 * Verify a Certificate of Origin against the ICC WCF eCO network.
 *
 * STUB: real verification requires:
 *   • Chamber of commerce API key
 *   • Endpoint: GET https://certification.iccwbo.org/api/v1/certificates/{number}
 *   • Headers: Authorization: Bearer {CHAMBER_API_KEY}
 *
 * Until the chamber credentials are configured, this function returns
 * `status: UNVERIFIED` with `verified: false`.
 */
export async function verifyCertificateOfOrigin(
  certificateNumber: string,
  type: string,
): Promise<VerifyResult> {
  const verifiedAt = new Date().toISOString();
  try {
    const cn = (certificateNumber ?? "").trim();
    if (!cn) {
      return {
        certificateNumber: "",
        verified: false,
        status: "UNVERIFIED",
        source: "icc-wcf-eco (stub)",
        notes: "Empty certificate number.",
        verifiedAt,
      };
    }

    const chamberApiKey = process.env.ICC_WCF_ECO_API_KEY;
    const ecoEndpoint = process.env.ICC_WCF_ECO_ENDPOINT || "https://certification.iccwbo.org";

    if (!chamberApiKey) {
      logger.info("eco: verify — no API key configured, returning UNVERIFIED stub", { cert: cn, type });
      return {
        certificateNumber: cn,
        verified: false,
        status: "UNVERIFIED",
        source: "icc-wcf-eco (stub)",
        notes:
          `Live verification requires ICC WCF eCO API access. Set ICC_WCF_ECO_API_KEY env var. ` +
          `Endpoint: GET ${ecoEndpoint}/api/v1/certificates/${encodeURIComponent(cn)}. ` +
          `Contact the issuing chamber of commerce to obtain API credentials.`,
        verifiedAt,
      };
    }

    try {
      const res = await fetch(`${ecoEndpoint}/api/v1/certificates/${encodeURIComponent(cn)}`, {
        headers: {
          Authorization: `Bearer ${chamberApiKey}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15_000),
        cache: "no-store",
      });
      if (!res.ok) {
        logger.warn("eco: verify fetch failed", { status: res.status, cert: cn });
        return {
          certificateNumber: cn,
          verified: false,
          status: "UNVERIFIED",
          source: "icc-wcf-eco",
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
        source: "icc-wcf-eco",
        notes: data?.notes ?? "Verified live against ICC WCF eCO network.",
        verifiedAt,
      };
    } catch (fetchErr: any) {
      logger.warn("eco: verify fetch threw", { error: fetchErr?.message, cert: cn });
      return {
        certificateNumber: cn,
        verified: false,
        status: "UNVERIFIED",
        source: "icc-wcf-eco",
        notes: `Hub unreachable: ${fetchErr?.message ?? String(fetchErr)}`,
        verifiedAt,
      };
    }
  } catch (err: any) {
    logger.error("eco: verifyCertificateOfOrigin failed", { error: err?.message });
    return {
      certificateNumber,
      verified: false,
      status: "UNVERIFIED",
      source: "icc-wcf-eco (stub)",
      notes: `Verification failed: ${err?.message ?? String(err)}`,
      verifiedAt,
    };
  }
}
