// @ts-nocheck
/**
 * G-14 — IATA ONE Record & Cargo-XML
 * ====================================================================
 *
 * Implements two complementary IATA air-cargo data standards:
 *
 *   1. ONE Record — the JSON-LD linked-data object model that IATA
 *      rolled out to replace legacy Cargo-XML messages. Each business
 *      object (Shipment, Piece, ULD, Location, Actor, Event, Document,
 *      Dimensions, Weight) is a JSON-LD node with a stable URI (`@id`)
 *      and a `@type` from the ONE Record ontology (v2.0 schema, 2024).
 *
 *   2. Cargo-XML — the XML schema family that preceded ONE Record and is
 *      still widely used by ground handlers and customs. Generates:
 *        • XAWB — Air Waybill (CCS2/XAWB 4.0)
 *        • XFFR — Flight Manifest
 *        • XRCT — Consignment Status Report
 *
 * Reference standards
 * -------------------
 *   • IATA ONE Record Data Model v2.0.0 (May 2024)
 *     https://github.com/IATA-Cargo/ONE-Record
 *   • IATA Cargo-XML Toolkit v5.0
 *     https://www.iata.org/en/programs/cargo/cargo-xml/
 *   • W3C JSON-LD 1.1 — https://www.w3.org/TR/json-ld11/
 *
 * No external API calls. Pure local generation.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// ONE Record namespace + context
// ─────────────────────────────────────────────────────────────────────────────

const ONE_RECORD_BASE_IRI = "https://onerecord.iata.org/ns/cargo#";
const ONE_RECORD_VOCAB_IRI = "https://onerecord.iata.org/ns/coreCodeLists#";
const CARGO_XML_NS_XAWB = "http://www.iata.org/CargoXML/XAWB";
const CARGO_XML_NS_XFFR = "http://www.iata.org/CargoXML/XFFR";
const CARGO_XML_NS_XRCT = "http://www.iata.org/CargoXML/XRCT";

/** JSON-LD @context for ONE Record objects. */
const ONE_RECORD_CONTEXT = {
  "@vocab": ONE_RECORD_BASE_IRI,
  codeLists: ONE_RECORD_VOCAB_IRI,
  xsd: "http://www.w3.org/2001/XMLSchema#",
};

// ─────────────────────────────────────────────────────────────────────────────
// Types (subset of ONE Record Data Model v2.0)
// ─────────────────────────────────────────────────────────────────────────────

export interface OneRecordDimensions {
  length?: number;
  width?: number;
  height?: number;
  unit?: "CMT" | "MTR" | "INH" | "FOT";
}

export interface OneRecordWeight {
  grossWeight?: number;
  netWeight?: number;
  tareWeight?: number;
  unit?: "KGM" | "LBR" | "TON";
}

export interface OneRecordLocation {
  /** UN/LOCODE or IATA airport code. */
  code: string;
  name?: string;
  country?: string;
  /** Free-form address (optional). */
  address?: string;
}

export interface OneRecordActor {
  /** Company name. */
  name: string;
  /** IATA CASS / ACID code, or DUNS. */
  identifier?: string;
  role?: "Shipper" | "Consignee" | "Carrier" | "FreightForwarder" | "GroundHandler" | "Customs" | "Other";
  contact?: {
    email?: string;
    phone?: string;
  };
}

export interface OneRecordEvent {
  eventType: string; // e.g. "Departed", "Arrived", "Received", "Loaded"
  eventTimestamp: string; // ISO 8601
  location?: OneRecordLocation;
  actor?: OneRecordActor;
  remark?: string;
}

export interface OneRecordPiece {
  /** Piece identifier (UPU/JLSC or carrier-assigned). */
  pieceId: string;
  /** Goods description. */
  goodsDescription?: string;
  /** Number of units in the piece (slipsheet/pallet). */
  unitCount?: number;
  /** Package type (BOX/PAL/CTN/etc). */
  packageType?: string;
  dimensions?: OneRecordDimensions;
  weight?: OneRecordWeight;
  /** HS code if known. */
  hsCode?: string;
  /** Dangerous goods flag. */
  isDangerousGoods?: boolean;
  /** Slac (Shipper's Load And Count). */
  slac?: number;
}

export interface OneRecordUld {
  uldId: string; // e.g. "AKE12345AA"
  uldType: string; // e.g. "AKE", "PMC", "PAJ"
  ownerCode: string;
  tareWeight?: number;
  loadedPieces?: string[]; // @ids of Piece objects
}

export interface OneRecordDocument {
  documentType: "AWB" | "FWB" | "FHL" | "CMA" | "NWB" | "DGD" | "OTH";
  documentNumber: string;
  documentVersion?: string;
  issuedBy?: OneRecordActor;
  issuedAt?: string;
}

export interface OneRecordShipment {
  shipmentId: string;
  totalGrossWeight: number;
  totalVolume?: number;
  pieceCount: number;
  origin: OneRecordLocation;
  destination: OneRecordLocation;
  shipper: OneRecordActor;
  consignee: OneRecordActor;
  pieces: OneRecordPiece[];
  ulds?: OneRecordUld[];
  incoterms?: string;
  goodsDescription?: string;
  serviceLevel?: "STD" | "EXP" | "PRIO";
  documents?: OneRecordDocument[];
  events?: OneRecordEvent[];
}

export interface OneRecordObject {
  "@context": any;
  "@graph": any[];
  generatedAt: string;
  shipmentCount: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function now(): string {
  try {
    return new Date().toISOString();
  } catch {
    return "1970-01-01T00:00:00Z";
  }
}

function uuid(): string {
  try {
    if (
      typeof globalThis !== "undefined" &&
      (globalThis as any).crypto?.randomUUID
    ) {
      return (globalThis as any).crypto.randomUUID();
    }
  } catch {
    /* ignore */
  }
  return "urn:uuid:" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

function iri(base: string, id: string): string {
  return `${base}${encodeURIComponent(id || uuid())}`;
}

/** XML-escape text. */
function esc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// ─────────────────────────────────────────────────────────────────────────────
// ONE Record linked-data builder
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build a ONE Record JSON-LD object graph from booking data.
 *
 * The graph contains nodes for: Shipment, Piece[], ULD[], Location[],
 * Actor[], Event[], Document[], Dimensions[], Weight[].
 */
export async function generateOneRecordObject(
  bookingData: any,
): Promise<OneRecordObject> {
  try {
    if (!bookingData) throw new Error("bookingData required");
    const graph: any[] = [];
    const shipmentsInput: OneRecordShipment[] =
      bookingData.shipments ?? (bookingData.shipment ? [bookingData.shipment] : []);
    if (!shipmentsInput.length) {
      throw new Error("at least one shipment is required in bookingData");
    }

    // Helper: emit a node and return its @id
    const emit = (node: any): string => {
      if (!node["@id"]) node["@id"] = iri(ONE_RECORD_BASE_IRI, uuid());
      graph.push(node);
      return node["@id"];
    };

    for (const s of shipmentsInput) {
      // 1) Locations (origin + destination)
      const originNode = {
        "@type": "Location",
        "@id": iri(ONE_RECORD_BASE_IRI, `loc-${s.shipmentId}-origin`),
        code: s.origin.code,
        name: s.origin.name,
        country: s.origin.country,
        address: s.origin.address,
      };
      const destNode = {
        "@type": "Location",
        "@id": iri(ONE_RECORD_BASE_IRI, `loc-${s.shipmentId}-dest`),
        code: s.destination.code,
        name: s.destination.name,
        country: s.destination.country,
        address: s.destination.address,
      };
      emit(originNode);
      emit(destNode);

      // 2) Actors (shipper + consignee)
      const shipperNode = {
        "@type": "Actor",
        "@id": iri(ONE_RECORD_BASE_IRI, `act-${s.shipmentId}-shipper`),
        name: s.shipper.name,
        identifier: s.shipper.identifier,
        role: s.shipper.role ?? "Shipper",
        contact: s.shipper.contact,
      };
      const consigneeNode = {
        "@type": "Actor",
        "@id": iri(ONE_RECORD_BASE_IRI, `act-${s.shipmentId}-consignee`),
        name: s.consignee.name,
        identifier: s.consignee.identifier,
        role: s.consignee.role ?? "Consignee",
        contact: s.consignee.contact,
      };
      emit(shipperNode);
      emit(consigneeNode);

      // 3) Pieces (with dimensions + weight as nested objects)
      const pieceIds: string[] = [];
      for (const p of s.pieces ?? []) {
        let dimId: string | undefined;
        if (p.dimensions) {
          dimId = emit({
            "@type": "Dimensions",
            "@id": iri(ONE_RECORD_BASE_IRI, `dim-${p.pieceId}`),
            length: p.dimensions.length,
            width: p.dimensions.width,
            height: p.dimensions.height,
            unit: p.dimensions.unit ?? "CMT",
          });
        }
        let wtId: string | undefined;
        if (p.weight) {
          wtId = emit({
            "@type": "Weight",
            "@id": iri(ONE_RECORD_BASE_IRI, `wt-${p.pieceId}`),
            grossWeight: p.weight.grossWeight,
            netWeight: p.weight.netWeight,
            tareWeight: p.weight.tareWeight,
            unit: p.weight.unit ?? "KGM",
          });
        }
        const pieceId = emit({
          "@type": "Piece",
          "@id": iri(ONE_RECORD_BASE_IRI, `pc-${p.pieceId}`),
          pieceId: p.pieceId,
          goodsDescription: p.goodsDescription,
          unitCount: p.unitCount,
          packageType: p.packageType,
          dimensions: dimId ? { "@id": dimId } : undefined,
          weight: wtId ? { "@id": wtId } : undefined,
          hsCode: p.hsCode,
          isDangerousGoods: !!p.isDangerousGoods,
          slac: p.slac,
        });
        pieceIds.push(pieceId);
      }

      // 4) ULDs (optional)
      const uldIds: string[] = [];
      for (const u of s.ulds ?? []) {
        const uldId = emit({
          "@type": "ULD",
          "@id": iri(ONE_RECORD_BASE_IRI, `uld-${u.uldId}`),
          uldId: u.uldId,
          uldType: u.uldType,
          ownerCode: u.ownerCode,
          tareWeight: u.tareWeight,
          loadedPieces: (u.loadedPieces ?? []).map((pid) => ({
            "@id": iri(ONE_RECORD_BASE_IRI, `pc-${pid}`),
          })),
        });
        uldIds.push(uldId);
      }

      // 5) Documents (optional)
      const docIds: string[] = [];
      for (const d of s.documents ?? []) {
        let issuerId: string | undefined;
        if (d.issuedBy) {
          issuerId = emit({
            "@type": "Actor",
            "@id": iri(ONE_RECORD_BASE_IRI, `act-doc-${d.documentNumber}`),
            name: d.issuedBy.name,
            identifier: d.issuedBy.identifier,
            role: d.issuedBy.role ?? "Carrier",
          });
        }
        const docId = emit({
          "@type": "Document",
          "@id": iri(ONE_RECORD_BASE_IRI, `doc-${d.documentNumber}`),
          documentType: d.documentType,
          documentNumber: d.documentNumber,
          documentVersion: d.documentVersion,
          issuedBy: issuerId ? { "@id": issuerId } : undefined,
          issuedAt: d.issuedAt,
        });
        docIds.push(docId);
      }

      // 6) Events (optional)
      const eventIds: string[] = [];
      for (const e of s.events ?? []) {
        let locId: string | undefined;
        if (e.location) {
          locId = emit({
            "@type": "Location",
            "@id": iri(ONE_RECORD_BASE_IRI, `loc-evt-${uuid()}`),
            code: e.location.code,
            name: e.location.name,
            country: e.location.country,
          });
        }
        const evtId = emit({
          "@type": "Event",
          "@id": iri(ONE_RECORD_BASE_IRI, `evt-${uuid()}`),
          eventType: e.eventType,
          eventTimestamp: e.eventTimestamp,
          location: locId ? { "@id": locId } : undefined,
          remark: e.remark,
        });
        eventIds.push(evtId);
      }

      // 7) Shipment node — references all sub-objects via @id links
      emit({
        "@type": "Shipment",
        "@id": iri(ONE_RECORD_BASE_IRI, `shp-${s.shipmentId}`),
        shipmentId: s.shipmentId,
        totalGrossWeight: s.totalGrossWeight,
        totalVolume: s.totalVolume,
        pieceCount: s.pieceCount ?? (s.pieces?.length ?? 0),
        origin: { "@id": originNode["@id"] },
        destination: { "@id": destNode["@id"] },
        shipper: { "@id": shipperNode["@id"] },
        consignee: { "@id": consigneeNode["@id"] },
        pieces: pieceIds.map((id) => ({ "@id": id })),
        ulds: uldIds.length ? uldIds.map((id) => ({ "@id": id })) : undefined,
        documents: docIds.length ? docIds.map((id) => ({ "@id": id })) : undefined,
        events: eventIds.length ? eventIds.map((id) => ({ "@id": id })) : undefined,
        incoterms: s.incoterms,
        goodsDescription: s.goodsDescription,
        serviceLevel: s.serviceLevel ?? "STD",
      });
    }

    return {
      "@context": ONE_RECORD_CONTEXT,
      "@graph": graph,
      generatedAt: now(),
      shipmentCount: shipmentsInput.length,
    };
  } catch (err: any) {
    logger.error("one-record.generateOneRecordObject failed", {
      error: err?.message,
    });
    return {
      "@context": ONE_RECORD_CONTEXT,
      "@graph": [],
      generatedAt: now(),
      shipmentCount: 0,
      error: err?.message ?? "unknown error",
    };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Cargo-XML generators (XAWB, XFFR, XRCT)
// ─────────────────────────────────────────────────────────────────────────────

/** Build the AWB serial number (8 digits + check digit). */
function awbCheckDigit(awbSerial7: string): number {
  try {
    const s = awbSerial7.replace(/[^0-9]/g, "").padStart(7, "0").slice(-7);
    const weights = [8, 6, 4, 2, 3, 5, 9];
    let sum = 0;
    for (let i = 0; i < 7; i++) sum += parseInt(s[i], 10) * weights[i];
    const remainder = sum % 11;
    const checkDigit = remainder === 10 ? 0 : remainder;
    return checkDigit;
  } catch {
    return 0;
  }
}

/** Format an amount per IATA Cargo-XML (decimal with 2 places, no thousand sep). */
function formatWeight(w: number): string {
  try {
    return (Number.isFinite(w) ? w : 0).toFixed(2);
  } catch {
    return "0.00";
  }
}

/** Generate XAWB (Air Waybill) Cargo-XML. */
async function generateXAWB(data: any): Promise<string> {
  try {
    if (!data) throw new Error("XAWB data required");
    const awbNumber = data.awbNumber || "000-00000000";
    const awbPrefix = awbNumber.split("-")[0] || "000";
    const awbSerial7 = (awbNumber.split("-")[1] || "0000000").padStart(7, "0").slice(0, 7);
    const checkDigit = awbCheckDigit(awbSerial7);
    const fullSerial = awbSerial7 + String(checkDigit);
    const shipper = data.shipper || {};
    const consignee = data.consignee || {};
    const issuingCarrier = data.issuingCarrier || {};
    const origin = data.origin || {};
    const destination = data.destination || {};
    const accountingInfo = data.accountingInfo || "GEN";
    const currency = data.currency || "USD";
    const wtValCharges = data.weightValuationCharges || "PP";
    const otherCharges = data.otherCharges || "PP";
    const declaredValueCarriage =
      data.declaredValueForCarriage ?? "NVD";
    const declaredValueCustoms =
      data.declaredValueForCustoms ?? "NCV";
    const amountOfInsurance = data.amountOfInsurance ?? "XXX";
    const handlingInfo = data.handlingInformation ?? "";
    const totalGrossWeight = formatWeight(data.totalGrossWeight || 0);
    const totalPieces = data.totalPieces || 0;
    const rateCharge = data.rateCharge || 0;
    const totalCharge = formatWeight(data.totalCharge || 0);
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<CargoXMLXAWB xmlns="${CARGO_XML_NS_XAWB}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="4.0">`);
    xml.push("  <MessageHeader>");
    xml.push(`    <MessageIdentifier>XAWB</MessageIdentifier>`);
    xml.push(`    <MessageFunction>9</MessageFunction>`);
    xml.push(`    <Sender>${esc(issuingCarrier.identifier || issuingCarrier.name || "SGTX")}</Sender>`);
    xml.push(`    <Receiver>${esc(data.receiver || "IATA-CARGO-XML-GATEWAY")}</Receiver>`);
    xml.push(`    <MessageCreationDateTime>${now()}</MessageCreationDateTime>`);
    xml.push("  </MessageHeader>");
    xml.push("  <AirWaybill>");
    xml.push(`    <AWBNumber><Prefix>${esc(awbPrefix)}</Prefix><SerialNumber>${esc(fullSerial)}</SerialNumber></AWBNumber>`);
    xml.push(`    <IssuingCarrierAgent><Identifier>${esc(issuingCarrier.identifier || "SGTX-AGENT")}</Identifier></IssuingCarrierAgent>`);
    xml.push(`    <AccountingInformation>${esc(accountingInfo)}</AccountingInformation>`);
    xml.push(`    <ReferenceNumber>${esc(data.referenceNumber || awbNumber)}</ReferenceNumber>`);
    xml.push("    <Shipper>");
    xml.push(`      <Name>${esc(shipper.name)}</Name>`);
    xml.push(`      <Street>${esc(shipper.address)}</Street>`);
    xml.push(`      <City>${esc(shipper.city)}</City>`);
    xml.push(`      <StateProvince>${esc(shipper.state)}</StateProvince>`);
    xml.push(`      <PostalCode>${esc(shipper.postalCode)}</PostalCode>`);
    xml.push(`      <CountryCode>${esc(shipper.country)}</CountryCode>`);
    xml.push("    </Shipper>");
    xml.push("    <Consignee>");
    xml.push(`      <Name>${esc(consignee.name)}</Name>`);
    xml.push(`      <Street>${esc(consignee.address)}</Street>`);
    xml.push(`      <City>${esc(consignee.city)}</City>`);
    xml.push(`      <StateProvince>${esc(consignee.state)}</StateProvince>`);
    xml.push(`      <PostalCode>${esc(consignee.postalCode)}</PostalCode>`);
    xml.push(`      <CountryCode>${esc(consignee.country)}</CountryCode>`);
    xml.push("    </Consignee>");
    xml.push("    <IssuingCarrier>");
    xml.push(`      <Name>${esc(issuingCarrier.name)}</Name>`);
    xml.push(`      <Identifier>${esc(issuingCarrier.identifier)}</Identifier>`);
    xml.push("    </IssuingCarrier>");
    xml.push("    <Routing>");
    xml.push(`      <AirportOfDeparture>${esc(origin.code)}</AirportOfDeparture>`);
    xml.push(`      <AirportOfDestination>${esc(destination.code)}</AirportOfDestination>`);
    if (data.byFirstCarrier)
      xml.push(`      <ByFirstCarrier>${esc(data.byFirstCarrier)}</ByFirstCarrier>`);
    if (data.toByFirstCarrier)
      xml.push(`      <ToByFirstCarrier>${esc(data.toByFirstCarrier)}</ToByFirstCarrier>`);
    xml.push("    </Routing>");
    xml.push("    <AccountingInfo>");
    xml.push(`      <CurrencyCode>${esc(currency)}</CurrencyCode>`);
    xml.push(`      <WeightValuationChargesCode>${esc(wtValCharges)}</WeightValuationChargesCode>`);
    xml.push(`      <OtherChargesCode>${esc(otherCharges)}</OtherChargesCode>`);
    xml.push("    </AccountingInfo>");
    xml.push("    <ChargeDescriptions>");
    xml.push(`      <DeclaredValueForCarriage>${esc(declaredValueCarriage)}</DeclaredValueForCarriage>`);
    xml.push(`      <DeclaredValueForCustoms>${esc(declaredValueCustoms)}</DeclaredValueForCustoms>`);
    xml.push(`      <AmountOfInsurance>${esc(amountOfInsurance)}</AmountOfInsurance>`);
    xml.push(`      <HandlingInformation>${esc(handlingInfo)}</HandlingInformation>`);
    xml.push("    </ChargeDescriptions>");
    if (data.rateDescriptions?.length) {
      xml.push("    <RateDescriptions>");
      for (const r of data.rateDescriptions) {
        xml.push("      <RateDescription>");
        xml.push(`        <NumberOfPieces>${esc(r.numberOfPieces || 1)}</NumberOfPieces>`);
        xml.push(`        <GrossWeight><Value>${formatWeight(r.grossWeight || 0)}</Value><Unit>${esc(r.weightUnit || "K")}</Unit></GrossWeight>`);
        xml.push(`        <RateClassCode>${esc(r.rateClassCode || "Q")}</RateClassCode>`);
        xml.push(`        <CommodityItemNumber>${esc(r.commodityItemNumber || "")}</CommodityItemNumber>`);
        xml.push(`        <ChargeableWeight><Value>${formatWeight(r.chargeableWeight || 0)}</Value><Unit>${esc(r.weightUnit || "K")}</Unit></ChargeableWeight>`);
        xml.push(`        <RateCharge>${esc(r.rateCharge || 0)}</RateCharge>`);
        xml.push(`        <TotalCharge>${esc(r.totalCharge || 0)}</TotalCharge>`);
        xml.push(`        <NatureAndQuantityOfGoods>${esc(r.goodsDescription || "")}</NatureAndQuantityOfGoods>`);
        xml.push("      </RateDescription>");
      }
      xml.push("    </RateDescriptions>");
    }
    xml.push("    <Totals>");
    xml.push(`      <TotalPieces>${esc(totalPieces)}</TotalPieces>`);
    xml.push(`      <TotalGrossWeight><Value>${totalGrossWeight}</Value><Unit>K</Unit></TotalGrossWeight>`);
    xml.push(`      <TotalCharge>${esc(totalCharge)}</TotalCharge>`);
    xml.push("    </Totals>");
    xml.push("  </AirWaybill>");
    xml.push("</CargoXMLXAWB>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("one-record.generateXAWB failed", { error: err?.message });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<CargoXMLXAWB xmlns="${CARGO_XML_NS_XAWB}"><MessageHeader><MessageIdentifier>XAWB</MessageIdentifier><MessageCreationDateTime>${now()}</MessageCreationDateTime><!-- ${esc(err?.message ?? "unknown error")} --></MessageHeader></CargoXMLXAWB>`;
  }
}

/** Generate XFFR (Flight Manifest) Cargo-XML. */
async function generateXFFR(data: any): Promise<string> {
  try {
    if (!data) throw new Error("XFFR data required");
    const flightNumber = data.flightNumber || "XX0000";
    const flightDate = data.flightDate || now().slice(0, 10);
    const aircraftRegistration = data.aircraftRegistration || "";
    const airportOfLoading = data.airportOfLoading || "";
    const airportOfUnloading = data.airportOfUnloading || "";
    const consignments: any[] = data.consignments || [];
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<CargoXMLXFFR xmlns="${CARGO_XML_NS_XFFR}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="3.0">`);
    xml.push("  <MessageHeader>");
    xml.push("    <MessageIdentifier>XFFR</MessageIdentifier>");
    xml.push("    <MessageFunction>9</MessageFunction>");
    xml.push(`    <Sender>${esc(data.sender || "SGTX")}</Sender>`);
    xml.push(`    <Receiver>${esc(data.receiver || "IATA-CARGO-XML-GATEWAY")}</Receiver>`);
    xml.push(`    <MessageCreationDateTime>${now()}</MessageCreationDateTime>`);
    xml.push("  </MessageHeader>");
    xml.push("  <FlightManifest>");
    xml.push("    <FlightInfo>");
    xml.push(`      <FlightNumber>${esc(flightNumber)}</FlightNumber>`);
    xml.push(`      <FlightDate>${esc(flightDate)}</FlightDate>`);
    xml.push(`      <AircraftRegistration>${esc(aircraftRegistration)}</AircraftRegistration>`);
    xml.push(`      <AirportOfLoading>${esc(airportOfLoading)}</AirportOfLoading>`);
    xml.push(`      <AirportOfUnloading>${esc(airportOfUnloading)}</AirportOfUnloading>`);
    xml.push("    </FlightInfo>");
    xml.push("    <ConsignmentSummary>");
    let totalPieces = 0;
    let totalWeight = 0;
    for (const c of consignments) {
      totalPieces += c.pieces || 0;
      totalWeight += c.weight || 0;
    }
    xml.push(`      <TotalNumberOfPieces>${esc(totalPieces)}</TotalNumberOfPieces>`);
    xml.push(`      <TotalGrossWeight><Value>${formatWeight(totalWeight)}</Value><Unit>K</Unit></TotalGrossWeight>`);
    xml.push("    </ConsignmentSummary>");
    for (const c of consignments) {
      xml.push("    <Consignment>");
      xml.push(`      <AWBNumber><Prefix>${esc((c.awbNumber || "000-00000000").split("-")[0])}</Prefix><SerialNumber>${esc((c.awbNumber || "000-00000000").split("-")[1] || "00000000")}</SerialNumber></AWBNumber>`);
      xml.push(`      <AirportOfOrigin>${esc(c.origin)}</AirportOfOrigin>`);
      xml.push(`      <AirportOfDestination>${esc(c.destination)}</AirportOfDestination>`);
      xml.push(`      <NumberOfPieces>${esc(c.pieces || 0)}</NumberOfPieces>`);
      xml.push(`      <Weight><Value>${formatWeight(c.weight || 0)}</Value><Unit>K</Unit></Weight>`);
      if (c.uldNumbers?.length) {
        xml.push("      <ULDList>");
        for (const u of c.uldNumbers) {
          xml.push(`        <ULDNumber>${esc(u)}</ULDNumber>`);
        }
        xml.push("      </ULDList>");
      }
      xml.push("    </Consignment>");
    }
    xml.push("  </FlightManifest>");
    xml.push("</CargoXMLXFFR>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("one-record.generateXFFR failed", { error: err?.message });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<CargoXMLXFFR xmlns="${CARGO_XML_NS_XFFR}"><MessageHeader><MessageIdentifier>XFFR</MessageIdentifier><MessageCreationDateTime>${now()}</MessageCreationDateTime><!-- ${esc(err?.message ?? "unknown error")} --></MessageHeader></CargoXMLXFFR>`;
  }
}

/** Generate XRCT (Consignment Status Report) Cargo-XML. */
async function generateXRCT(data: any): Promise<string> {
  try {
    if (!data) throw new Error("XRCT data required");
    const awbNumber = data.awbNumber || "000-00000000";
    const movements: any[] = data.movements || [];
    const xml: string[] = [];
    xml.push('<?xml version="1.0" encoding="UTF-8"?>');
    xml.push(`<CargoXMLXRCT xmlns="${CARGO_XML_NS_XRCT}" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" version="3.0">`);
    xml.push("  <MessageHeader>");
    xml.push("    <MessageIdentifier>XRCT</MessageIdentifier>");
    xml.push("    <MessageFunction>9</MessageFunction>");
    xml.push(`    <Sender>${esc(data.sender || "SGTX")}</Sender>`);
    xml.push(`    <Receiver>${esc(data.receiver || "IATA-CARGO-XML-GATEWAY")}</Receiver>`);
    xml.push(`    <MessageCreationDateTime>${now()}</MessageCreationDateTime>`);
    xml.push("  </MessageHeader>");
    xml.push("  <ConsignmentStatus>");
    xml.push("    <Consignment>");
    xml.push(`      <AWBNumber><Prefix>${esc(awbNumber.split("-")[0])}</Prefix><SerialNumber>${esc(awbNumber.split("-")[1] || "00000000")}</SerialNumber></AWBNumber>`);
    xml.push(`      <Status>${esc(data.status || "BOOK")}</Status>`);
    xml.push("    </Consignment>");
    for (const m of movements) {
      xml.push("    <Movement>");
      xml.push(`      <MovementCode>${esc(m.movementCode)}</MovementCode>`);
      xml.push(`      <MovementTime>${esc(m.movementTime || now())}</MovementTime>`);
      xml.push(`      <Airport>${esc(m.airport)}</Airport>`);
      if (m.quantity) xml.push(`      <Quantity>${esc(m.quantity)}</Quantity>`);
      if (m.weight)
        xml.push(`      <Weight><Value>${formatWeight(m.weight)}</Value><Unit>K</Unit></Weight>`);
      if (m.remark) xml.push(`      <Remark>${esc(m.remark)}</Remark>`);
      xml.push("    </Movement>");
    }
    xml.push("  </ConsignmentStatus>");
    xml.push("</CargoXMLXRCT>");
    return xml.join("\n");
  } catch (err: any) {
    logger.error("one-record.generateXRCT failed", { error: err?.message });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<CargoXMLXRCT xmlns="${CARGO_XML_NS_XRCT}"><MessageHeader><MessageIdentifier>XRCT</MessageIdentifier><MessageCreationDateTime>${now()}</MessageCreationDateTime><!-- ${esc(err?.message ?? "unknown error")} --></MessageHeader></CargoXMLXRCT>`;
  }
}

/**
 * Dispatcher — generate a Cargo-XML message by type.
 * @param type One of "XAWB", "XFFR", "XRCT".
 * @param data Message-specific payload (matches IATA Cargo-XML schema).
 */
export async function generateCargoXML(type: string, data: any): Promise<string> {
  try {
    const t = (type || "").toUpperCase();
    switch (t) {
      case "XAWB":
        return await generateXAWB(data);
      case "XFFR":
        return await generateXFFR(data);
      case "XRCT":
        return await generateXRCT(data);
      default:
        throw new Error(`Unsupported Cargo-XML type: ${type}`);
    }
  } catch (err: any) {
    logger.error("one-record.generateCargoXML failed", {
      type,
      error: err?.message,
    });
    return `<?xml version="1.0" encoding="UTF-8"?>\n<Error><!-- ${esc(err?.message ?? "unknown error")} --></Error>`;
  }
}
