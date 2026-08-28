// @ts-nocheck
/**
 * G-15 — UN/EDIFACT Message Generation
 * ====================================================================
 *
 * Generates UN/EDIFACT messages per the D.96A directory (the most widely
 * deployed version in shipping/logistics). Five messages:
 *
 *   • IFTMIN  — Instruction for Multimodal/Transport (booking request)
 *   • IFTMBC  — Booking Confirmation
 *   • COPARN  — Container Announcement (gate-in / gate-out announcement)
 *   • CODECO  — Container Gate-in/Gate-out Report (actual movement)
 *   • COARRI  — Container Discharge/Loading Report (vessel operations)
 *
 * Output format
 * -------------
 *   UN/EDIFACT syntax (ISO 9735):
 *     • Service string advice:    UNA:+.? '
 *     • Interchange header:       UNB+UNOB:1+SENDER:ZZ+RECEIVER:ZZ+YYMMDD:HHMM+REF'
 *     • Message header:           UNH+ref+IFTMIN:D:96A:UN'
 *     • Segments:                 TAG+element:element:element+...'
 *     • Segment terminator:       ' (apostrophe)
 *     • Data element separator:   + (plus)
 *     • Component separator:      : (colon)
 *     • Escape character:         ? (releases +, :, ?, ')
 *
 * Standards reference
 * -------------------
 *   • UNECE UN/EDIFACT D.96A directory: https://unece.org/trade/uncefact/trade-facilitation
 *   • ISO 9735:2002 (EDIFACT application level syntax rules)
 *
 * No external API calls. Pure local generation.
 */

import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface EDIFACTParty {
  /** Party identification code (e.g. SCAC, DUNS, GLN). */
  id?: string;
  /** Code qualifier (e.g. "ZZZ" mutually defined, "160" party identification). */
  idQualifier?: string;
  /** Party name (free text, max 35). */
  name: string;
  /** Address (max 35). */
  address1?: string;
  /** City. */
  city?: string;
  /** Country code (ISO 2). */
  country?: string;
  /** Role qualifier (e.g. "MS" message sender, "MR" message recipient,
   * "CZ" consignor, "CN" consignee, "CA" carrier). */
  role: "MS" | "MR" | "CZ" | "CN" | "CA" | "FW" | "FF" | "N1" | "N2" | "N3";
}

export interface EDIFACTReference {
  /** Reference qualifier (e.g. "CN" container, "BM" bill of lading no,
   * "FF" freight forwarder ref, "AAE" proforma invoice). */
  qualifier: string;
  /** Reference value. */
  value: string;
}

export interface EDIFACTDateTime {
  date: string; // YYYYMMDD
  time?: string; // HHMM
  formatQualifier?: "102" | "203" | "201"; // 102=YYMMDD, 203=YYMMDDHHMM, 201=YYMMDDHHMMSS
}

export interface IFTMINData {
  sender: EDIFACTParty;
  recipient: EDIFACTParty;
  messageRef: string;
  interchangeRef?: string;
  /** Booking reference number(s). */
  bookingReferences?: EDIFACTReference[];
  /** Date/time of message preparation. */
  preparationDateTime?: EDIFACTDateTime;
  /** Planned pickup. */
  pickupDateTime?: EDIFACTDateTime;
  /** Planned delivery. */
  deliveryDateTime?: EDIFACTDateTime;
  /** Consignor (shipper). */
  consignor?: EDIFACTParty;
  /** Consignee. */
  consignee?: EDIFACTParty;
  /** Carrier. */
  carrier?: EDIFACTParty;
  /** Mode of transport code (e.g. "2" rail, "3" road, "4" air, "5" mail, "7" sea). */
  modeOfTransport?: string;
  /** Transport means (vessel name, truck plate, etc.). */
  transportIdentification?: string;
  /** Origin location. */
  originLocation?: string;
  /** Destination location. */
  destinationLocation?: string;
  /** Goods description. */
  goodsDescription?: string;
  /** Number of packages. */
  numberOfPackages?: number;
  /** Gross weight (kg). */
  grossWeight?: number;
  /** Volume (m3). */
  volume?: number;
  /** Container numbers (if applicable). */
  containerNumbers?: string[];
  /** Free-text remarks. */
  remarks?: string;
}

export interface IFTMBCData extends IFTMINData {
  /** Confirmation status code (e.g. "1" accepted, "2" conditionally, "3" refused). */
  confirmationStatus?: string;
  /** Confirmed carrier booking reference. */
  confirmedBookingRef?: string;
  /** Estimated departure. */
  estimatedDeparture?: EDIFACTDateTime;
  /** Estimated arrival. */
  estimatedArrival?: EDIFACTDateTime;
}

export interface COPARNData {
  sender: EDIFACTParty;
  recipient: EDIFACTParty;
  messageRef: string;
  /** Container announcement type: "1" gate-in planned, "2" gate-out planned,
   * "3" arrival notice, "4" release order. */
  announcementType?: string;
  /** Containers in this announcement. */
  containers: Array<{
    containerNumber: string;
    sizeType?: string; // e.g. "22G1" (ISO 6346 size/type code)
    fullEmpty?: "F" | "E";
    grossWeight?: number;
    sealNumber?: string;
    shippingLine?: string;
    operator?: string;
    releaseReference?: string;
  }>;
  /** Vessel / voyage info (optional). */
  vesselName?: string;
  voyageNumber?: string;
  /** Port code where announcement applies. */
  port?: string;
  /** Planned date/time. */
  plannedDateTime?: EDIFACTDateTime;
  /** Remarks. */
  remarks?: string;
}

export interface CODECOData {
  sender: EDIFACTParty;
  recipient: EDIFACTParty;
  messageRef: string;
  /** Gate action: "1" gate-in (full), "2" gate-out (full),
   * "3" gate-in (empty), "4" gate-out (empty). */
  gateAction?: "1" | "2" | "3" | "4";
  containers: Array<{
    containerNumber: string;
    sizeType?: string;
    fullEmpty?: "F" | "E";
    grossWeight?: number;
    sealNumber?: string;
    vehicleId?: string;
    driverName?: string;
  }>;
  /** Actual date/time of gate move. */
  actualDateTime?: EDIFACTDateTime;
  /** Terminal / depot code. */
  terminalCode?: string;
  remarks?: string;
}

export interface COARRIData {
  sender: EDIFACTParty;
  recipient: EDIFACTParty;
  messageRef: string;
  /** Operation: "1" discharge, "2" loading, "3" restow, "4" shift. */
  operation?: "1" | "2" | "3" | "4";
  vesselName: string;
  vesselCallSign?: string;
  voyageNumber: string;
  /** Port where operation took place. */
  port: string;
  /** Berth. */
  berth?: string;
  containers: Array<{
    containerNumber: string;
    sizeType?: string;
    fullEmpty?: "F" | "E";
    grossWeight?: number;
    /** Stowage position (bay-row-tier, e.g. "0101861"). */
    stowagePosition?: string;
    /** Operation time. */
    operationTime?: EDIFACTDateTime;
    /** Damage flag. */
    damaged?: boolean;
  }>;
  remarks?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// EDIFACT syntax helpers
// ─────────────────────────────────────────────────────────────────────────────

const SEG_TERM = "'";
const ELEM_SEP = "+";
const COMP_SEP = ":";
const ESC = "?";

/** EDIFACT-escape a string (release +, :, ?, '). */
function edEsc(s: any): string {
  if (s === null || s === undefined) return "";
  return String(s)
    .replace(/[+:'?]/g, (c) => ESC + c)
    .replace(/\r?\n/g, " ");
}

/** Truncate to max length (EDIFACT data elements have strict lengths). */
function edTrunc(s: any, max: number): string {
  const v = edEsc(s);
  return v.length > max ? v.slice(0, max) : v;
}

/** Format an EDIFACT date element. */
function fmtDT(d: EDIFACTDateTime | undefined): string {
  try {
    if (!d || !d.date) return "";
    const cleaned = String(d.date).replace(/[^0-9]/g, "");
    let yy, mm, dd;
    if (cleaned.length === 8) {
      // YYYYMMDD
      yy = cleaned.slice(2, 4);
      mm = cleaned.slice(4, 6);
      dd = cleaned.slice(6, 8);
    } else if (cleaned.length === 6) {
      // YYMMDD
      yy = cleaned.slice(0, 2);
      mm = cleaned.slice(2, 4);
      dd = cleaned.slice(4, 6);
    } else {
      return "";
    }
    const time = d.time
      ? String(d.time).replace(/[^0-9]/g, "").slice(0, 4).padEnd(4, "0")
      : "";
    if (time && (d.formatQualifier === "203" || d.formatQualifier === "201")) {
      return `${yy}${mm}${dd}:${time}`;
    }
    return `${yy}${mm}${dd}`;
  } catch {
    return "";
  }
}

/** Format current date for the interchange header (YYMMDD:HHMM). */
function nowInterchangeStamp(): string {
  try {
    const d = new Date();
    const yy = String(d.getUTCFullYear()).slice(2);
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const hh = String(d.getUTCHours()).padStart(2, "0");
    const mi = String(d.getUTCMinutes()).padStart(2, "0");
    return `${yy}${mm}${dd}:${hh}${mi}`;
  } catch {
    return "700101:0000";
  }
}

/** Build the UNB interchange header. */
function buildUNB(sender: EDIFACTParty, recipient: EDIFACTParty, ref: string): string {
  const senderId = sender.id || sender.name;
  const recipId = recipient.id || recipient.name;
  const senderQual = sender.idQualifier || "ZZ";
  const recipQual = recipient.idQualifier || "ZZ";
  return (
    `UNB+UNOB:1+${edTrunc(senderId, 35)}:${senderQual}+` +
    `${edTrunc(recipId, 35)}:${recipQual}+` +
    `${nowInterchangeStamp()}+${edTrunc(ref, 14)}+SGTX'`
  );
}

/** Build the UNH message header (per-message identifier + version). */
function buildUNH(ref: string, msgType: string): string {
  return `UNH+${edTrunc(ref, 14)}+${msgType}:D:96A:UN'`;
}

/** Build the BGM segment (Beginning of message). */
function buildBGM(code: string, ref: string, functionCode: string = "9"): string {
  return `BGM+${code}+${edTrunc(ref, 35)}+${functionCode}'`;
}

/** Build the DTM segment. */
function buildDTM(qualifier: string, dt: EDIFACTDateTime | undefined): string {
  if (!dt) return "";
  const v = fmtDT(dt);
  if (!v) return "";
  const fmt = dt.formatQualifier || (v.includes(":") ? "203" : "102");
  return `DTM+${qualifier}:${v}:${fmt}'`;
}

/** Build a party segment (NAD — name and address). */
function buildNAD(party: EDIFACTParty): string {
  const parts: string[] = ["NAD", party.role];
  const idParts: string[] = [];
  if (party.id) {
    idParts.push(edTrunc(party.id, 35));
    idParts.push("");
    idParts.push(party.idQualifier || "ZZZ");
  }
  // If no id, place name in plain name field
  if (idParts.length) {
    parts.push(idParts.join(COMP_SEP));
    parts.push(""); // name absent when id present
  } else {
    parts.push("");
    parts.push(edTrunc(party.name, 35));
  }
  // Address lines (CTA1 / street / city / region / postcode / country)
  parts.push(""); // street
  parts.push(""); // city
  parts.push(""); // region
  parts.push(""); // postcode
  if (party.country) parts.push(edTrunc(party.country, 3));
  let seg = parts.join(ELEM_SEP);
  // Add party name in plain name field if not already set
  if (party.name && !party.id) {
    // Already in slot 2
  } else if (party.name) {
    seg += ELEM_SEP + edTrunc(party.name, 35);
  }
  return seg + SEG_TERM;
}

/** Build an RFF segment (Reference). */
function buildRFF(ref: EDIFACTReference): string {
  return `RFF+${ref.qualifier}:${edTrunc(ref.value, 35)}'`;
}

/** Build an LOC segment (Place/location identification). */
function buildLOC(qualifier: string, location: string, nameFor139?: string): string {
  if (!location && !nameFor139) return "";
  if (qualifier === "139" && nameFor139) {
    return `LOC+139:${edTrunc(nameFor139, 70)}:ZZZ'`;
  }
  return `LOC+${qualifier}:${edTrunc(location, 25)}:139'`;
}

/** Build a TDT segment (Transport details). */
function buildTDT(
  stage: string,
  mode: string,
  carrier?: EDIFACTParty,
  transportId?: string,
): string {
  const parts: string[] = ["TDT", stage];
  if (mode) parts.push(mode);
  else parts.push("");
  if (carrier?.id) {
    parts.push(carrier.id);
    parts.push("");
    parts.push("");
    parts.push("");
    if (carrier.name) parts.push(edTrunc(carrier.name, 35));
  } else if (transportId) {
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push("");
    parts.push(edTrunc(transportId, 17));
    parts.push("ZZZ");
  }
  return parts.join(ELEM_SEP) + SEG_TERM;
}

/** Build a CNI segment (Consignment information). */
function buildCNI(seq: number, consignRef: string): string {
  return `CNI+${seq}+${edTrunc(consignRef, 35)}'`;
}

/** Build a GID segment (Goods item details). */
function buildGID(seq: number, packages: number): string {
  return `GID+${seq}+${packages || 1}:CNT'`;
}

/** Build an FTX segment (Free text). */
function buildFTX(qualifier: string, text: string): string {
  if (!text) return "";
  // Truncate to 70 chars per line; EDIFACT allows up to 5 lines.
  const line = edTrunc(text, 70);
  return `FTX+${qualifier}+++${line}'`;
}

/** Build an MEA segment (Measurements). */
function buildMEA(qualifier: string, aspect: string, value: number, unit: string): string {
  if (value === undefined || value === null || !Number.isFinite(value)) return "";
  return `MEA+${qualifier}+${aspect}+${unit}:${value.toFixed(2)}'`;
}

/** Build an EQD segment (Equipment details — container info). */
function buildEQD(
  containerNumber: string,
  sizeType: string | undefined,
  fullEmpty: "F" | "E" | undefined,
): string {
  const parts: string[] = ["EQD", "CN", edTrunc(containerNumber, 17)];
  if (sizeType) parts.push(edTrunc(sizeType, 4));
  else parts.push("");
  if (fullEmpty) parts.push(fullEmpty);
  else parts.push("");
  return parts.join(ELEM_SEP) + SEG_TERM;
}

/** Build an EQN segment (Equipment number). */
function buildEQN(count: number): string {
  return `EQN+${count}'`;
}

/** Build a TMD segment (Transport movement details). */
function buildTMD(type: string): string {
  return `TMD+${type}'`;
}

/** Build an SEG-style generic segment (TDT, LOC, etc. with a separator-prefixed list). */
function seg(tag: string, ...elements: (string | number | undefined)[]): string {
  return (
    tag +
    ELEM_SEP +
    elements
      .map((e) => (e === undefined || e === null ? "" : String(e)))
      .join(ELEM_SEP) +
    SEG_TERM
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: IFTMIN — Instruction for Multimodal/Transport (booking request)
// ─────────────────────────────────────────────────────────────────────────────

export async function generateIFTMIN(data: IFTMINData): Promise<string> {
  try {
    if (!data) throw new Error("IFTMINData required");
    const interchangeRef = data.interchangeRef || `SGTX${Date.now().toString().slice(-8)}`;
    const parts: string[] = [];
    // Service string advice + interchange header
    parts.push(`UNA:+.? '`);
    parts.push(buildUNB(data.sender, data.recipient, interchangeRef));
    parts.push(buildUNH(data.messageRef, "IFTMIN"));
    parts.push(buildBGM("740", data.messageRef, "9")); // 740 = booking instruction
    parts.push(buildDTM("137", data.preparationDateTime));
    // References
    for (const r of data.bookingReferences ?? []) {
      parts.push(buildRFF(r));
    }
    // Parties
    parts.push(buildNAD({ ...data.sender, role: "MS" }));
    parts.push(buildNAD({ ...data.recipient, role: "MR" }));
    if (data.consignor) parts.push(buildNAD({ ...data.consignor, role: "CZ" }));
    if (data.consignee) parts.push(buildNAD({ ...data.consignee, role: "CN" }));
    if (data.carrier) parts.push(buildNAD({ ...data.carrier, role: "CA" }));
    // Routing
    if (data.originLocation) parts.push(buildLOC("5", data.originLocation));
    if (data.destinationLocation) parts.push(buildLOC("8", data.destinationLocation));
    // Transport details
    if (data.modeOfTransport || data.transportIdentification) {
      parts.push(
        buildTDT("20", data.modeOfTransport || "3", data.carrier, data.transportIdentification),
      );
    }
    // Timing
    if (data.pickupDateTime) parts.push(buildDTM("133", data.pickupDateTime));
    if (data.deliveryDateTime) parts.push(buildDTM("137", data.deliveryDateTime));
    // Goods
    parts.push(buildCNI(1, data.messageRef));
    if (data.numberOfPackages !== undefined) parts.push(buildGID(1, data.numberOfPackages));
    if (data.grossWeight !== undefined) parts.push(buildMEA("AAE", "WT", data.grossWeight, "KGM"));
    if (data.volume !== undefined) parts.push(buildMEA("AAE", "VOL", data.volume, "MTQ"));
    if (data.goodsDescription) parts.push(buildFTX("AAA", data.goodsDescription));
    if (data.containerNumbers?.length) {
      for (const cn of data.containerNumbers) {
        parts.push(buildEQD(cn, undefined, "F"));
      }
    }
    if (data.remarks) parts.push(buildFTX("AAI", data.remarks));
    parts.push(buildCNT(1));
    parts.push("UNT+" + (parts.length - 2) + "+" + edTrunc(data.messageRef, 14) + "'");
    parts.push("UNZ+1+" + edTrunc(interchangeRef, 14) + "'");
    return parts.join("\n");
  } catch (err: any) {
    logger.error("edifact.generateIFTMIN failed", { error: err?.message });
    return `UNA:+.? '\nUNB+UNOB:1+SGTX:ZZ+SGTX:ZZ+${nowInterchangeStamp()}+ERR'\nUNH+ERR+IFTMIN:D:96A:UN'\nFTX+AAO+++${edTrunc(err?.message ?? "unknown error", 70)}'\nUNT+3+ERR'\nUNZ+1+ERR'`;
  }
}

// Helper for CNT segment (Control total)
function buildCNT(count: number): string {
  return `CNT+2:${count}'`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: IFTMBC — Booking Confirmation
// ─────────────────────────────────────────────────────────────────────────────

export async function generate_IFTMBC(data: IFTMBCData): Promise<string> {
  try {
    if (!data) throw new Error("IFTMBCData required");
    const interchangeRef = data.interchangeRef || `SGTX${Date.now().toString().slice(-8)}`;
    const parts: string[] = [];
    parts.push(`UNA:+.? '`);
    parts.push(buildUNB(data.sender, data.recipient, interchangeRef));
    parts.push(buildUNH(data.messageRef, "IFTMBC"));
    parts.push(buildBGM("640", data.messageRef, data.confirmationStatus || "9"));
    parts.push(buildDTM("137", data.preparationDateTime));
    if (data.confirmedBookingRef) {
      parts.push(buildRFF({ qualifier: "BN", value: data.confirmedBookingRef }));
    }
    for (const r of data.bookingReferences ?? []) {
      parts.push(buildRFF(r));
    }
    parts.push(buildNAD({ ...data.sender, role: "MS" }));
    parts.push(buildNAD({ ...data.recipient, role: "MR" }));
    if (data.consignor) parts.push(buildNAD({ ...data.consignor, role: "CZ" }));
    if (data.consignee) parts.push(buildNAD({ ...data.consignee, role: "CN" }));
    if (data.carrier) parts.push(buildNAD({ ...data.carrier, role: "CA" }));
    if (data.originLocation) parts.push(buildLOC("5", data.originLocation));
    if (data.destinationLocation) parts.push(buildLOC("8", data.destinationLocation));
    if (data.modeOfTransport || data.transportIdentification) {
      parts.push(
        buildTDT("20", data.modeOfTransport || "3", data.carrier, data.transportIdentification),
      );
    }
    if (data.estimatedDeparture) parts.push(buildDTM("133", data.estimatedDeparture));
    if (data.estimatedArrival) parts.push(buildDTM("137", data.estimatedArrival));
    parts.push(buildCNI(1, data.confirmedBookingRef || data.messageRef));
    if (data.numberOfPackages !== undefined) parts.push(buildGID(1, data.numberOfPackages));
    if (data.grossWeight !== undefined) parts.push(buildMEA("AAE", "WT", data.grossWeight, "KGM"));
    if (data.volume !== undefined) parts.push(buildMEA("AAE", "VOL", data.volume, "MTQ"));
    if (data.goodsDescription) parts.push(buildFTX("AAA", data.goodsDescription));
    if (data.containerNumbers?.length) {
      for (const cn of data.containerNumbers) {
        parts.push(buildEQD(cn, undefined, "F"));
      }
    }
    if (data.remarks) parts.push(buildFTX("AAI", data.remarks));
    parts.push(buildCNT(1));
    parts.push("UNT+" + (parts.length - 2) + "+" + edTrunc(data.messageRef, 14) + "'");
    parts.push("UNZ+1+" + edTrunc(interchangeRef, 14) + "'");
    return parts.join("\n");
  } catch (err: any) {
    logger.error("edifact.generate_IFTMBC failed", { error: err?.message });
    return `UNA:+.? '\nUNB+UNOB:1+SGTX:ZZ+SGTX:ZZ+${nowInterchangeStamp()}+ERR'\nUNH+ERR+IFTMBC:D:96A:UN'\nFTX+AAO+++${edTrunc(err?.message ?? "unknown error", 70)}'\nUNT+3+ERR'\nUNZ+1+ERR'`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: COPARN — Container Announcement
// ─────────────────────────────────────────────────────────────────────────────

export async function generate_COPARN(data: COPARNData): Promise<string> {
  try {
    if (!data) throw new Error("COPARNData required");
    if (!data.containers?.length) throw new Error("at least one container is required");
    const interchangeRef = `SGTX${Date.now().toString().slice(-8)}`;
    const parts: string[] = [];
    parts.push(`UNA:+.? '`);
    parts.push(buildUNB(data.sender, data.recipient, interchangeRef));
    parts.push(buildUNH(data.messageRef, "COPARN"));
    parts.push(buildBGM("85", data.messageRef, data.announcementType || "9"));
    parts.push(buildDTM("137", data.plannedDateTime));
    if (data.vesselName) {
      parts.push(buildTDT("20", "7", undefined, data.vesselName));
    }
    if (data.voyageNumber) parts.push(buildRFF({ qualifier: "VON", value: data.voyageNumber }));
    if (data.port) parts.push(buildLOC("9", data.port));
    parts.push(buildNAD({ ...data.sender, role: "MS" }));
    parts.push(buildNAD({ ...data.recipient, role: "MR" }));
    // Group of containers (EQD loop)
    for (const c of data.containers) {
      parts.push(buildEQD(c.containerNumber, c.sizeType, c.fullEmpty));
      if (c.grossWeight !== undefined) parts.push(buildMEA("AAE", "WT", c.grossWeight, "KGM"));
      if (c.sealNumber) parts.push(buildRFF({ qualifier: "SE", value: c.sealNumber }));
      if (c.shippingLine) parts.push(buildNAD({ role: "CA", name: c.shippingLine }));
      if (c.releaseReference) parts.push(buildRFF({ qualifier: "CN", value: c.releaseReference }));
    }
    parts.push(buildEQN(data.containers.length));
    if (data.remarks) parts.push(buildFTX("AAI", data.remarks));
    parts.push(buildCNT(data.containers.length));
    parts.push("UNT+" + (parts.length - 2) + "+" + edTrunc(data.messageRef, 14) + "'");
    parts.push("UNZ+1+" + edTrunc(interchangeRef, 14) + "'");
    return parts.join("\n");
  } catch (err: any) {
    logger.error("edifact.generate_COPARN failed", { error: err?.message });
    return `UNA:+.? '\nUNB+UNOB:1+SGTX:ZZ+SGTX:ZZ+${nowInterchangeStamp()}+ERR'\nUNH+ERR+COPARN:D:96A:UN'\nFTX+AAO+++${edTrunc(err?.message ?? "unknown error", 70)}'\nUNT+3+ERR'\nUNZ+1+ERR'`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: CODECO — Container Gate-in/Gate-out Report
// ─────────────────────────────────────────────────────────────────────────────

export async function generate_CODECO(data: CODECOData): Promise<string> {
  try {
    if (!data) throw new Error("CODECOData required");
    if (!data.containers?.length) throw new Error("at least one container is required");
    const interchangeRef = `SGTX${Date.now().toString().slice(-8)}`;
    const parts: string[] = [];
    parts.push(`UNA:+.? '`);
    parts.push(buildUNB(data.sender, data.recipient, interchangeRef));
    parts.push(buildUNH(data.messageRef, "CODECO"));
    parts.push(buildBGM("34", data.messageRef, data.gateAction || "9"));
    parts.push(buildDTM("137", data.actualDateTime));
    if (data.terminalCode) parts.push(buildLOC("9", data.terminalCode));
    parts.push(buildNAD({ ...data.sender, role: "MS" }));
    parts.push(buildNAD({ ...data.recipient, role: "MR" }));
    for (const c of data.containers) {
      parts.push(buildEQD(c.containerNumber, c.sizeType, c.fullEmpty));
      if (c.grossWeight !== undefined) parts.push(buildMEA("AAE", "WT", c.grossWeight, "KGM"));
      if (c.sealNumber) parts.push(buildRFF({ qualifier: "SE", value: c.sealNumber }));
      if (c.vehicleId) parts.push(buildRFF({ qualifier: "VN", value: c.vehicleId }));
      if (c.driverName) parts.push(buildFTX("CN", c.driverName));
    }
    parts.push(buildEQN(data.containers.length));
    if (data.remarks) parts.push(buildFTX("AAI", data.remarks));
    parts.push(buildCNT(data.containers.length));
    parts.push("UNT+" + (parts.length - 2) + "+" + edTrunc(data.messageRef, 14) + "'");
    parts.push("UNZ+1+" + edTrunc(interchangeRef, 14) + "'");
    return parts.join("\n");
  } catch (err: any) {
    logger.error("edifact.generate_CODECO failed", { error: err?.message });
    return `UNA:+.? '\nUNB+UNOB:1+SGTX:ZZ+SGTX:ZZ+${nowInterchangeStamp()}+ERR'\nUNH+ERR+CODECO:D:96A:UN'\nFTX+AAO+++${edTrunc(err?.message ?? "unknown error", 70)}'\nUNT+3+ERR'\nUNZ+1+ERR'`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: COARRI — Container Discharge/Loading Report
// ─────────────────────────────────────────────────────────────────────────────

export async function generate_COARRI(data: COARRIData): Promise<string> {
  try {
    if (!data) throw new Error("COARRIData required");
    if (!data.containers?.length) throw new Error("at least one container is required");
    const interchangeRef = `SGTX${Date.now().toString().slice(-8)}`;
    const parts: string[] = [];
    parts.push(`UNA:+.? '`);
    parts.push(buildUNB(data.sender, data.recipient, interchangeRef));
    parts.push(buildUNH(data.messageRef, "COARRI"));
    parts.push(buildBGM("73", data.messageRef, data.operation || "9"));
    // Vessel / voyage / port / berth
    parts.push(buildTDT("20", "7", undefined, data.vesselName));
    if (data.vesselCallSign) parts.push(buildRFF({ qualifier: "CS", value: data.vesselCallSign }));
    if (data.voyageNumber) parts.push(buildRFF({ qualifier: "VON", value: data.voyageNumber }));
    if (data.port) parts.push(buildLOC("9", data.port));
    if (data.berth) parts.push(buildLOC("11", data.berth));
    parts.push(buildNAD({ ...data.sender, role: "MS" }));
    parts.push(buildNAD({ ...data.recipient, role: "MR" }));
    for (const c of data.containers) {
      parts.push(buildEQD(c.containerNumber, c.sizeType, c.fullEmpty));
      if (c.grossWeight !== undefined) parts.push(buildMEA("AAE", "WT", c.grossWeight, "KGM"));
      if (c.stowagePosition) parts.push(buildLOC("147", c.stowagePosition));
      if (c.operationTime) parts.push(buildDTM("137", c.operationTime));
      if (c.damaged) parts.push(buildFTX("DIN", "container damaged on operation"));
    }
    parts.push(buildEQN(data.containers.length));
    if (data.remarks) parts.push(buildFTX("AAI", data.remarks));
    parts.push(buildCNT(data.containers.length));
    parts.push("UNT+" + (parts.length - 2) + "+" + edTrunc(data.messageRef, 14) + "'");
    parts.push("UNZ+1+" + edTrunc(interchangeRef, 14) + "'");
    return parts.join("\n");
  } catch (err: any) {
    logger.error("edifact.generate_COARRI failed", { error: err?.message });
    return `UNA:+.? '\nUNB+UNOB:1+SGTX:ZZ+SGTX:ZZ+${nowInterchangeStamp()}+ERR'\nUNH+ERR+COARRI:D:96A:UN'\nFTX+AAO+++${edTrunc(err?.message ?? "unknown error", 70)}'\nUNT+3+ERR'\nUNZ+1+ERR'`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Dispatcher
// ─────────────────────────────────────────────────────────────────────────────

export type EdifactMessageType =
  | "IFTMIN"
  | "IFTMBC"
  | "COPARN"
  | "CODECO"
  | "COARRI";

export async function generateEdifactMessage(
  messageType: EdifactMessageType,
  data: any,
): Promise<{ text: string; messageType: string; generatedAt: string }> {
  const generatedAt = new Date().toISOString();
  let text: string;
  switch (messageType) {
    case "IFTMIN":
      text = await generateIFTMIN(data as IFTMINData);
      break;
    case "IFTMBC":
      text = await generate_IFTMBC(data as IFTMBCData);
      break;
    case "COPARN":
      text = await generate_COPARN(data as COPARNData);
      break;
    case "CODECO":
      text = await generate_CODECO(data as CODECOData);
      break;
    case "COARRI":
      text = await generate_COARRI(data as COARRIData);
      break;
    default:
      throw new Error(`Unsupported EDIFACT message type: ${messageType}`);
  }
  return { text, messageType, generatedAt };
}
