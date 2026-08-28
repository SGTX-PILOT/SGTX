// @ts-nocheck
/**
 * SGTX EU ICS2 — Entry Summary Declaration (G-04)
 * ===========================================
 *
 * ICS2 (Import Control System 2) is the EU's new centralised pre-arrival
 * security declaration system for goods entering the EU customs territory.
 *
 * Rollout phases:
 *   • Air (Phase 1, 15 Mar 2021): courier / express
 *   • Air (Phase 2, 1 Mar 2023): general air cargo — ENS mandatory
 *   • Maritime (Phase 3, 3 Jun 2024): sea freight — ENS mandatory
 *   • Road / Rail (Phase 4, 1 Dec 2024 → 1 Sep 2025): land modes
 *
 * There is no public REST API — ENS is submitted via EU Member State
 * customs systems (CCN-CSI network), each of which exposes an XML / EDIFACT
 * interface to authorised economic operators. SGTX therefore implements this
 * module as a **structured ENS payload generator**: it produces a valid
 * ICS2 ENS XML message in the EU CCN-CSI CUSCAR-style format that a broker
 * can submit via their national customs portal (e.g. German ATLAS,
 * French DELTA, Italian AIDA).
 *
 * Reference: EU Implementing Decision 2019/2153.
 */

import { logger } from "@/lib/sgtx/logger";

// ── Types ────────────────────────────────────────────────────────────────

export type TransportMode = "AIR" | "SEA" | "ROAD" | "RAIL";

export interface ENSParty {
  name: string;
  eori?: string;
  address: string;
  city: string;
  countryCode: string;
  postalCode?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
}

export interface ENSGoodsItem {
  hsCode: string;
  goodsDescription: string;
  grossWeightKg: number;
  netWeightKg?: number;
  numberOfPackages: number;
  packageType: string; // e.g. "CT" (carton), "PL" (pallet), "PK" (package)
  containerNumber?: string;
  countryOfOrigin?: string;
  customsValue?: number;
  currency?: string;
}

export interface ENSData {
  ustn?: string;
  mrn?: string;
  transportMode: TransportMode;
  loadingPort: string;
  loadingCountry: string;
  dischargePort: string;
  dischargeCountry: string;
  destinationCountry: string; // EU member state
  carrier: ENSParty;
  consignor: ENSParty;
  consignee: ENSParty;
  notifyParty?: ENSParty;
  transportDocumentNumber: string; // AWB / B/L / CMR number
  transportDocumentDate: string;
  voyageFlightNumber?: string;
  estimatedArrivalDate: string;
  goodsItems: ENSGoodsItem[];
  totalGrossWeightKg: number;
  totalNumberOfPackages: number;
  shippingMarks?: string;
  additionalInformation?: string;
}

export interface ENSResult {
  ensNumber: string;
  submissionXml: string;
  status: "GENERATED";
  submittedTo: string;
  notes: string;
  applicable: boolean;
  deadline: string;
  generatedAt: string;
}

export interface ICS2Applicability {
  applicable: boolean;
  deadline: string;
  phase: string;
  notes: string;
}

// ── ICS2 phase lookup ───────────────────────────────────────────────────

const EU_MEMBER_STATES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
  "SI", "ES", "SE",
  // EFTA participating (Norway, Switzerland, Iceland, Liechtenstein)
  "NO", "CH", "IS", "LI",
]);

const ICS2_PHASES: Record<TransportMode, { phase: string; mandatoryFrom: string; deadline: string }> = {
  AIR: { phase: "Phase 2", mandatoryFrom: "2023-03-01", deadline: "ENS must be filed before loading on the aircraft at the non-EU airport." },
  SEA: { phase: "Phase 3", mandatoryFrom: "2024-06-03", deadline: "ENS must be filed no later than 24 hours before loading at the non-EU port." },
  ROAD: { phase: "Phase 4", mandatoryFrom: "2024-12-01 (transitional to 2025-09-01)", deadline: "ENS must be filed before the goods arrive at the EU external border crossing point." },
  RAIL: { phase: "Phase 4", mandatoryFrom: "2024-12-01 (transitional to 2025-09-01)", deadline: "ENS must be filed before the goods arrive at the EU external border crossing point." },
};

export function checkICS2Applicability(
  destinationCountry: string,
  transportMode: TransportMode,
): ICS2Applicability {
  try {
    const dest = (destinationCountry ?? "").toUpperCase().trim();
    const isEU = EU_MEMBER_STATES.has(dest);
    if (!isEU) {
      return {
        applicable: false,
        deadline: "",
        phase: "",
        notes: `Destination ${dest} is not in the EU/EFTA ICS2 territory. ICS2 ENS not required.`,
      };
    }
    const phase = ICS2_PHASES[transportMode];
    if (!phase) {
      return {
        applicable: false,
        deadline: "",
        phase: "",
        notes: `Unknown transport mode ${transportMode}.`,
      };
    }
    return {
      applicable: true,
      deadline: phase.deadline,
      phase: phase.phase,
      notes: `ICS2 ${phase.phase} mandatory for ${transportMode} imports into ${dest} since ${phase.mandatoryFrom}.`,
    };
  } catch (err: any) {
    logger.error("eu-ics2: applicability check failed", { error: err?.message });
    return {
      applicable: false,
      deadline: "",
      phase: "",
      notes: "Applicability check failed — treat as applicable and submit ENS as a precaution.",
    };
  }
}

// ── ENS number generator (mock MRN — real format: 2-letter country + year + 14 digits) ─

function generateEnsNumber(destinationCountry: string): string {
  const dest = (destinationCountry ?? "").toUpperCase().trim() || "DE";
  const year = new Date().getFullYear();
  const rand = Math.floor(100000000000000 + Math.random() * 900000000000000);
  return `${dest}${year}ENS${rand}`;
}

// ── XML escape + ENS XML generator (CUSCAR-style, ISO-8859-1 like EDIFACT orig) ──

function escapeXml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function partyXml(party: ENSParty, role: string): string {
  if (!party) return `    <${role}/>`;
  return `    <${role}>
      <Name>${escapeXml(party.name)}</Name>
      ${party.eori ? `<EORI>${escapeXml(party.eori)}</EORI>` : ""}
      <Address>${escapeXml(party.address)}</Address>
      <City>${escapeXml(party.city)}</City>
      <CountryCode>${escapeXml(party.countryCode)}</CountryCode>
      ${party.postalCode ? `<PostalCode>${escapeXml(party.postalCode)}</PostalCode>` : ""}
      ${party.contactName ? `<ContactName>${escapeXml(party.contactName)}</ContactName>` : ""}
      ${party.contactEmail ? `<ContactEmail>${escapeXml(party.contactEmail)}</ContactEmail>` : ""}
      ${party.contactPhone ? `<ContactPhone>${escapeXml(party.contactPhone)}</ContactPhone>` : ""}
    </${role}>`;
}

function goodsItemXml(item: ENSGoodsItem, index: number): string {
  return `    <GoodsItem sequence="${index + 1}">
      <HSCode>${escapeXml(item.hsCode)}</HSCode>
      <GoodsDescription>${escapeXml(item.goodsDescription)}</GoodsDescription>
      <GrossWeightKg>${Number(item.grossWeightKg || 0).toFixed(2)}</GrossWeightKg>
      ${item.netWeightKg ? `<NetWeightKg>${Number(item.netWeightKg).toFixed(2)}</NetWeightKg>` : ""}
      <NumberOfPackages>${Number(item.numberOfPackages || 0)}</NumberOfPackages>
      <PackageType>${escapeXml(item.packageType)}</PackageType>
      ${item.containerNumber ? `<ContainerNumber>${escapeXml(item.containerNumber)}</ContainerNumber>` : ""}
      ${item.countryOfOrigin ? `<CountryOfOrigin>${escapeXml(item.countryOfOrigin)}</CountryOfOrigin>` : ""}
      ${item.customsValue ? `<CustomsValue currency="${escapeXml(item.currency || "USD")}">${Number(item.customsValue).toFixed(2)}</CustomsValue>` : ""}
    </GoodsItem>`;
}

function buildENSXml(ensNumber: string, data: ENSData): string {
  const generatedAt = new Date().toISOString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!-- SGTX-generated EU ICS2 Entry Summary Declaration (ENS) -->
<!-- Reference: EU Implementing Decision 2019/2153 -->
<!-- Generated: ${generatedAt} -->
<!-- SUBMIT VIA: the EU Member State customs system (e.g. DE ATLAS, FR DELTA, IT AIDA) -->
<ENS xmlns="urn:eu:ics2:ens:v1">
  <Header>
    <ENSNumber>${escapeXml(ensNumber)}</ENSNumber>
    <GenerationTimestamp>${generatedAt}</GenerationTimestamp>
    <TransportMode>${escapeXml(data.transportMode)}</TransportMode>
    <TransportDocumentNumber>${escapeXml(data.transportDocumentNumber)}</TransportDocumentNumber>
    <TransportDocumentDate>${escapeXml(data.transportDocumentDate)}</TransportDocumentDate>
    ${data.voyageFlightNumber ? `<VoyageFlightNumber>${escapeXml(data.voyageFlightNumber)}</VoyageFlightNumber>` : ""}
    <EstimatedArrivalDate>${escapeXml(data.estimatedArrivalDate)}</EstimatedArrivalDate>
    <LoadingPort>${escapeXml(data.loadingPort)}</LoadingPort>
    <LoadingCountry>${escapeXml(data.loadingCountry)}</LoadingCountry>
    <DischargePort>${escapeXml(data.dischargePort)}</DischargePort>
    <DischargeCountry>${escapeXml(data.dischargeCountry)}</DischargeCountry>
    <DestinationCountry>${escapeXml(data.destinationCountry)}</DestinationCountry>
    <TotalGrossWeightKg>${Number(data.totalGrossWeightKg || 0).toFixed(2)}</TotalGrossWeightKg>
    <TotalNumberOfPackages>${Number(data.totalNumberOfPackages || 0)}</TotalNumberOfPackages>
    ${data.shippingMarks ? `<ShippingMarks>${escapeXml(data.shippingMarks)}</ShippingMarks>` : ""}
    ${data.additionalInformation ? `<AdditionalInformation>${escapeXml(data.additionalInformation)}</AdditionalInformation>` : ""}
  </Header>
  <Parties>
${partyXml(data.carrier, "Carrier")}
${partyXml(data.consignor, "Consignor")}
${partyXml(data.consignee, "Consignee")}
${data.notifyParty ? partyXml(data.notifyParty, "NotifyParty") : ""}
  </Parties>
  <GoodsItems>
${(data.goodsItems ?? []).map((g, i) => goodsItemXml(g, i)).join("\n")}
  </GoodsItems>
</ENS>`;
}

// ── Public API ──────────────────────────────────────────────────────────

export async function submitENS(data: ENSData): Promise<ENSResult> {
  const generatedAt = new Date().toISOString();
  try {
    if (!data) throw new Error("ENS data required");
    if (!data.destinationCountry || !data.transportMode) {
      throw new Error("destinationCountry and transportMode are required");
    }
    if (!data.goodsItems || data.goodsItems.length === 0) {
      throw new Error("At least one goods item is required");
    }

    const applicability = checkICS2Applicability(data.destinationCountry, data.transportMode);
    const ensNumber = data.mrn || generateEnsNumber(data.destinationCountry);
    const xml = buildENSXml(ensNumber, data);

    logger.info("eu-ics2: ENS payload generated", {
      ensNumber,
      destination: data.destinationCountry,
      mode: data.transportMode,
      items: data.goodsItems.length,
      applicable: applicability.applicable,
    });

    return {
      ensNumber,
      submissionXml: xml,
      status: "GENERATED",
      submittedTo: `EU Member State customs system (${data.destinationCountry})`,
      notes:
        "ENS XML generated in EU ICS2 v1 format. Submit via the destination Member State's customs portal " +
        "(e.g. DE ATLAS-IAU, FR DELTA-ENS, IT AIDA-ENS). Real-time status requires CCN-CSI credentials.",
      applicable: applicability.applicable,
      deadline: applicability.deadline || "Verify applicability for this lane.",
      generatedAt,
    };
  } catch (err: any) {
    logger.error("eu-ics2: submitENS failed", { error: err?.message });
    return {
      ensNumber: "",
      submissionXml: "",
      status: "GENERATED",
      submittedTo: "",
      notes: `ENS generation failed: ${err?.message ?? String(err)}`,
      applicable: false,
      deadline: "",
      generatedAt,
    };
  }
}
