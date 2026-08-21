// SGTX Phase 3 — State-of-the-Art International Trade Contract Generator
// Court-ready contracts compliant with:
//   • CISG (UN Convention on Contracts for the International Sale of Goods, 1980)
//   • Incoterms® 2020 (ICC Publication 723)
//   • UCP 600 (Uniform Customs and Practice for Documentary Credits, ICC Publication 600)
//   • ISM Code (International Ship and Port Facility Security Code, SOLAS Chapter XI-2)
//   • Local laws: Egyptian Civil Code (No. 131/1948), German BGB/HGB, UAE Commercial
//     Transactions Law (No. 18/1993), English Sale of Goods Act 1979 / SGA 1979
//   • International arbitration rules: ICC (2021), LCIA (2020), CRCICA (2011),
//     DIFC-LCIA (2016), UNCITRAL Arbitration Rules (as revised 2013)
//   • ICC Model International Sale Contract (2020) and ICC Force Majeure &
//     Hardship Clauses (2020).
//
// Output: full contract as structured JSON + printable HTML + SHA-256 integrity hash.

import crypto from "crypto";
import { freshDb } from "@/lib/db-fresh";

// ===================== Types =====================

export type GoverningLaw =
  | "EGYPTIAN_LAW"
  | "ENGLISH_LAW"
  | "GERMAN_LAW"
  | "UAE_LAW"
  | "UNIDROIT"
  | "CISG";

export type ArbitrationRules =
  | "ICC"
  | "LCIA"
  | "CRCICA"
  | "DIFC"
  | "UNCITRAL";

export type ArbitrationSeat = "Cairo" | "London" | "Paris" | "Dubai" | "Singapore";

export type ContractLanguage = "en" | "ar" | "de" | "fr" | "dual";

export type ContractType =
  | "CIF_CONTRACT"
  | "FOB_CONTRACT"
  | "DAP_CONTRACT"
  | "DDP_CONTRACT"
  | "RORO_CONTRACT";

export interface GenerateContractInput {
  ustn: string;
  governingLaw?: GoverningLaw;
  arbitrationClause?: ArbitrationRules;
  arbitrationSeat?: ArbitrationSeat;
  language?: ContractLanguage;
}

export interface ContractClause {
  number: number;
  title: string;
  content: string;
}

export interface ContractMetadata {
  contractId: string;
  ustn: string;
  tradeId: string;
  contractVersion: number;
  contractType: ContractType;
  governingLaw: GoverningLaw;
  arbitrationClause: ArbitrationRules;
  arbitrationSeat: ArbitrationSeat;
  language: ContractLanguage;
  generatedAt: string;
  seller: { gtid: string; legalName: string; country: string; city?: string | null };
  buyer: { gtid: string; legalName: string; country: string; city?: string | null };
  commodity: string;
  incoterm: string;
  tradeValueUsd: number;
  currency: string;
  hashSha256: string;
}

export interface GeneratedContract {
  contractId: string;
  ustn: string;
  tradeId: string;
  contractVersion: number;
  contractType: ContractType;
  governingLaw: GoverningLaw;
  arbitrationClause: ArbitrationRules;
  arbitrationSeat: ArbitrationSeat;
  language: ContractLanguage;
  hashSha256: string;
  contractJson: string;
  contractHtml: string;
  clauses: ContractClause[];
  metadata: ContractMetadata;
}

// ===================== Constants =====================

export const GOVERNING_LAW_LABELS: Record<GoverningLaw, string> = {
  EGYPTIAN_LAW: "Egyptian Law (Civil Code No. 131 of 1948, Maritime Commerce Law No. 8 of 1990)",
  ENGLISH_LAW: "English Law (Sale of Goods Act 1979, as amended)",
  GERMAN_LAW: "German Law (Bürgerliches Gesetzbuch — BGB, Handelsgesetzbuch — HGB)",
  UAE_LAW: "UAE Law (Federal Law No. 18 of 1993 on Commercial Transactions)",
  UNIDROIT: "UNIDROIT Principles of International Commercial Contracts (2016)",
  CISG: "United Nations Convention on Contracts for the International Sale of Goods (CISG, 1980)",
};

export const ARBITRATION_LABELS: Record<ArbitrationRules, string> = {
  ICC: "ICC Rules of Arbitration (2021)",
  LCIA: "LCIA Arbitration Rules (2020)",
  CRCICA: "CRCICA Arbitration Rules (2011)",
  DIFC: "DIFC-LCIA Arbitration Rules (2016)",
  UNCITRAL: "UNCITRAL Arbitration Rules (as revised 2013)",
};

export const ARBITRATION_SEAT_LABELS: Record<ArbitrationSeat, string> = {
  Cairo: "Cairo, Arab Republic of Egypt (seat in accordance with the New York Convention, 1958)",
  London: "London, United Kingdom (seat under the English Arbitration Act 1996)",
  Paris: "Paris, French Republic (seat under the French Code of Civil Procedure)",
  Dubai: "Dubai, United Arab Emirates (seat under UAE Federal Law No. 6 of 2018 on Arbitration)",
  Singapore: "Singapore (seat under the International Arbitration Act 2002)",
};

export const CONTRACT_TYPE_LABELS: Record<ContractType, string> = {
  CIF_CONTRACT: "CIF International Sale Contract (Cost, Insurance and Freight — Incoterms® 2020)",
  FOB_CONTRACT: "FOB International Sale Contract (Free On Board — Incoterms® 2020)",
  DAP_CONTRACT: "DAP International Sale Contract (Delivered at Place — Incoterms® 2020)",
  DDP_CONTRACT: "DDP International Sale Contract (Delivered Duty Paid — Incoterms® 2020)",
  RORO_CONTRACT: "RoRo (Roll-on/Roll-off) Corridor Sale Contract — Multimodal",
};

export const LANGUAGE_LABELS: Record<ContractLanguage, string> = {
  en: "English",
  ar: "Arabic",
  de: "German",
  fr: "French",
  dual: "English and Arabic (dual-language; English prevailing in case of conflict)",
};

// ===================== Context =====================

interface ContractContext {
  trade: any;
  buyer: any;
  seller: any;
  shipments: any[];
  containers: any[];
  documents: any[];
  documentRequirements: any[];
  invoices: any[];
  labTests: any[];
  qcInspections: any[];
  customsDecls: any[];
  governingLaw: GoverningLaw;
  arbitrationClause: ArbitrationRules;
  arbitrationSeat: ArbitrationSeat;
  language: ContractLanguage;
  contractType: ContractType;
  contractId: string;
  contractVersion: number;
  generatedAt: string;
}

// ===================== Helpers =====================

export function generateContractId(): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate(),
  ).padStart(2, "0")}`;
  const seq = Math.floor(1000 + Math.random() * 9000);
  return `SC-${ymd}-${seq}`;
}

function fmtMoney(n: number, currency = "USD"): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${currency} ${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "as mutually agreed in the Shipment Schedule";
  const dt = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return "as mutually agreed";
  return dt.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function safe(v: any, fallback: string | number = "—"): string {
  if (v === null || v === undefined || v === "") return String(fallback);
  return String(v);
}

function countryName(code: string): string {
  const map: Record<string, string> = {
    EG: "the Arab Republic of Egypt",
    DE: "the Federal Republic of Germany",
    AE: "the United Arab Emirates",
    GB: "the United Kingdom of Great Britain and Northern Ireland",
    FR: "the French Republic",
    SG: "the Republic of Singapore",
    SA: "the Kingdom of Saudi Arabia",
    US: "the United States of America",
    NL: "the Kingdom of the Netherlands",
    IT: "the Italian Republic",
    ES: "the Kingdom of Spain",
    TR: "the Republic of Türkiye",
    CN: "the People's Republic of China",
    IN: "the Republic of India",
  };
  return map[code?.toUpperCase()] || safe(code, "the seller's jurisdiction");
}

function inferContractType(trade: any): ContractType {
  const inc = (trade?.incoterm || "").toUpperCase();
  const mode = (trade?.transportMode || "").toUpperCase();
  if (mode === "RORO" || /roro/i.test(safe(trade?.equipmentType, ""))) return "RORO_CONTRACT";
  if (inc === "CIF" || inc === "CIP") return "CIF_CONTRACT";
  if (inc === "FOB" || inc === "FAS" || inc === "EXW" || inc === "FCA") return "FOB_CONTRACT";
  if (inc === "DDP" || inc === "DPU") return "DDP_CONTRACT";
  if (inc === "DAP") return "DAP_CONTRACT";
  return "CIF_CONTRACT";
}

// ===================== Clause builders =====================
// Each builder is a pure function over the contract context. Returns the
// clause title and a multi-paragraph legally-precise body.

function clauseParties(ctx: ContractContext): { title: string; content: string } {
  const { buyer, seller, trade } = ctx;
  const lines: string[] = [];
  lines.push(
    `This International Sale Contract (the "Contract") is made and entered into on ${ctx.generatedAt} by and between:`,
  );
  lines.push(
    `(1) SELLER: ${seller.legalName}, a legal person organised under the laws of ${countryName(
      seller.country,
    )}, holding Sovereign Trade Identity ${seller.gtid}, with principal place of business at ${safe(
      seller.city,
      "the registered address on file",
    )}, ${countryName(seller.country)} (the "Seller"); and`,
  );
  lines.push(
    `(2) BUYER: ${buyer.legalName}, a legal person organised under the laws of ${countryName(
      buyer.country,
    )}, holding Sovereign Trade Identity ${buyer.gtid}, with principal place of business at ${safe(
      buyer.city,
      "the registered address on file",
    )}, ${countryName(buyer.country)} (the "Buyer").`,
  );
  lines.push(
    `The Seller and the Buyer are hereinafter referred to individually as a "Party" and collectively as the "Parties". The transaction between the Parties is uniquely identified by the SGTX Universal Shipment Tracking Number (USTN) ${trade.ustn}, which shall be referenced on every shipment, document, invoice, payment instruction and communication relating to this Contract.`,
  );
  lines.push(
    `Each Party represents and warrants that it has full corporate power, authority and legal capacity to enter into and perform this Contract, that the execution and performance of this Contract have been duly authorised by all necessary corporate action, and that the individual signing on its behalf is duly empowered to do so.`,
  );
  return { title: "Parties", content: lines.join("\n\n") };
}

function clauseDefinitions(ctx: ContractContext): { title: string; content: string } {
  const { trade } = ctx;
  const lines: string[] = [];
  lines.push(`In this Contract, unless the context otherwise requires, the following terms shall have the meanings set out below:`);
  const defs: [string, string][] = [
    [
      "USTN",
      `means the SGTX Universal Shipment Tracking Number ${trade.ustn}, a sovereign, immutable identifier linking all shipments, documents, payments and signatures relating to this Contract.`,
    ],
    [
      "GTID",
      "means the SGTX Global Trade Identity (SGTX-{COUNTRY}-{TYPE}-{SEQ}-{CHECKSUM}), a cryptographically verifiable trade identity issued by the SGTX Governor to each Party.",
    ],
    [
      "Incoterms® 2020",
      "means the International Commercial Terms, version 2020, published by the International Chamber of Commerce (ICC Publication 723), as in force at the date of this Contract.",
    ],
    [
      "CISG",
      "means the United Nations Convention on Contracts for the International Sale of Goods, adopted at Vienna on 11 April 1980.",
    ],
    [
      "UCP 600",
      "means the Uniform Customs and Practice for Documentary Credits, ICC Publication 600, revision 2007.",
    ],
    [
      "ISM Code",
      "means the International Ship and Port Facility Security Code, as adopted by SOLAS Chapter XI-2.",
    ],
    [
      "Goods",
      `means the commodity described in Clause 3 (Sale and Purchase), namely ${safe(trade.commodity, "the goods described in the trade record")}.`,
    ],
    [
      "HS Code",
      "means the Harmonized Commodity Description and Coding System code as defined by the World Customs Organization.",
    ],
    [
      "B/L",
      "means a Bill of Lading issued by the carrier or its agent, evidencing receipt of the Goods for shipment, the contract of carriage and (where negotiable) title to the Goods.",
    ],
    [
      "LC",
      "means a Documentary Letter of Credit issued under UCP 600 by a recognised bank in favour of the Seller.",
    ],
    [
      "Force Majeure",
      "has the meaning given in Clause 12 (Force Majeure) and shall be interpreted in accordance with the ICC Force Majeure Clause 2020.",
    ],
    [
      "SGTX Platform",
      "means the non-custodial, AI-governed sovereign trade execution platform that has facilitated the formation of this Contract and which acts solely as a witness and not as a party.",
    ],
    [
      "QES",
      "means a Qualified Electronic Signature as defined in eIDAS Regulation (EU) No 910/2014 or its equivalent under the applicable Egyptian, German, Emirati or English electronic signature legislation.",
    ],
    [
      "Governor",
      "means the SGTX constitutional decision engine that verifies the legality of each transaction step against jurisdictional rules, fee bounds and the SGTX Constitution.",
    ],
  ];
  for (const [t, d] of defs) lines.push(`• "${t}" ${d}`);
  return { title: "Definitions", content: lines.join("\n\n") };
}

function clauseSalePurchase(ctx: ContractContext): { title: string; content: string } {
  const { trade } = ctx;
  const lines: string[] = [];
  lines.push(
    `Subject to the terms and conditions of this Contract, the Seller agrees to sell, and the Buyer agrees to purchase, the following Goods:`,
  );
  lines.push(
    `• Commodity: ${safe(trade.commodity, "as per trade record")}\n• HS Code: ${safe(
      trade.commodityHs,
      "to be confirmed by the Customs Broker",
    )}\n• Quantity (Net Weight): ${safe(trade.netWeightKg, "—")} kg\n• Quantity (Gross Weight): ${safe(
      trade.grossWeightKg,
      "—",
    )} kg\n• Number of Containers / Units: ${safe(trade.containerCount, 1)}\n• Multi-Shipment: ${
      trade.multiShipment ? "Yes — multiple shipments under one master USTN" : "No — single shipment"
    }\n• Cold Chain: ${trade.coldChain ? "Required — refrigerated/temperature-controlled transport" : "Not required"}`,
  );
  lines.push(
    `The Goods shall conform in all respects with the description, quality, specifications, sample or model agreed between the Parties, and shall be fit for the purposes for which goods of the same description would ordinarily be used, in accordance with Article 35 of CISG and the implied terms of merchantable quality and fitness for purpose under the applicable law specified in Clause 20.`,
  );
  lines.push(
    `The Seller warrants that the Goods shall be free from any defects in design, materials or workmanship at the time of passing of risk, and shall remain conforming for the agreed shelf-life or, in the absence of an agreed period, for a period of twelve (12) months from the date of delivery.`,
  );
  return { title: "Sale and Purchase", content: lines.join("\n\n") };
}

function clausePricePayment(ctx: ContractContext): { title: string; content: string } {
  const { trade } = ctx;
  const total = fmtMoney(trade.tradeValueUsd, trade.currency || "USD");
  const method = (trade.paymentTerms || "TT").toUpperCase();
  const lines: string[] = [];
  lines.push(
    `The total contract price for the Goods shall be ${total} (the "Contract Price"), payable in ${safe(
      trade.currency,
      "USD",
    )}. The Contract Price is inclusive of all export duties, taxes and charges properly chargeable under the chosen Incoterm but exclusive of any value-added tax, goods and services tax, or similar turnover tax that may be lawfully recoverable by the Seller as an input credit.`,
  );
  lines.push(
    `Payment shall be made by the method selected by the Parties: ${safe(
      trade.paymentTerms,
      "TT",
    )} (${method === "LC" ? "Irrevocable Documentary Letter of Credit" : method === "CAD" ? "Cash Against Documents" : "Telegraphic Transfer / Bank Wire"}). ${
      trade.paymentTermsDetails ? `Payment instructions and bank/LC details: ${trade.paymentTermsDetails}.` : "Banking instructions shall be exchanged separately in writing under the SGTX secure channel."
    }`,
  );
  if (method === "LC") {
    lines.push(
      `Where payment is by Letter of Credit, the LC shall be issued by a first-class international bank, shall be irrevocable and unconditional, shall be subject to UCP 600, shall be available at sight against presentation of the documents listed in Clause 10 (Documentation Requirements), shall be valid for a period of not less than thirty (30) days after the latest shipment date, and shall allow partial shipments and transhipment in accordance with UCP 600 Articles 31 and 32. The Buyer shall ensure that the LC is opened within seven (7) banking days of the Contract date.`,
    );
  }
  if (trade.paymentTiming) {
    lines.push(
      `Payment timing: ${trade.paymentTiming.replace(/_/g, " ").toLowerCase()}${
        trade.creditPeriod ? ` (${trade.creditPeriod.replace(/_/g, " ").toLowerCase()})` : ""
      }.`,
    );
  }
  lines.push(
    `All bank charges, commissions and SWIFT fees outside the country of the issuing bank shall be for the account of the Buyer; charges inside the country of the issuing bank shall be for the account of the Seller. Time shall be of the essence in respect of payment.`,
  );
  return { title: "Price and Payment Terms", content: lines.join("\n\n") };
}

function clauseIncoterms(ctx: ContractContext): { title: string; content: string } {
  const inc = (ctx.trade.incoterm || "CIF").toUpperCase();
  const lines: string[] = [];
  lines.push(
    `This Contract is concluded on the basis of Incoterms® 2020 — ${inc} (${fullIncotermName(
      inc,
    )}). In the event of any conflict between this Contract and Incoterms® 2020, this Contract shall prevail to the extent of the conflict.`,
  );
  lines.push(incotermObligations(inc));
  lines.push(
    `The Parties expressly acknowledge that the choice of Incoterm® 2020 governs only the allocation of costs, risks and delivery obligations between them and does not displace the application of the mandatory provisions of the governing law chosen in Clause 20, including any mandatory consumer-protection or public-policy rules.`,
  );
  return { title: "Incoterms® 2020", content: lines.join("\n\n") };
}

function fullIncotermName(inc: string): string {
  const m: Record<string, string> = {
    EXW: "Ex Works",
    FCA: "Free Carrier",
    FAS: "Free Alongside Ship",
    FOB: "Free On Board",
    CFR: "Cost and Freight",
    CIF: "Cost, Insurance and Freight",
    DAP: "Delivered at Place",
    DPU: "Delivered at Place Unloaded",
    DDP: "Delivered Duty Paid",
  };
  return m[inc] || inc;
}

function incotermObligations(inc: string): string {
  const common = `Each Party shall, at its own cost, perform the obligations allocated to it by Incoterms® 2020 — ${inc} (ICC Publication 723, 2020 edition), including the obligations relating to: (a) provision of goods in conformity with the contract; (b) licences, authorisations, security clearances and other formalities; (c) contracts of carriage and insurance; (d) delivery and taking delivery; (e) transfer of risks; (f) allocation of costs; (g) notice to the other Party; (h) proof of delivery, transport document and packing; and (i) checking, inspection and pre-shipment inspection.`;
  const specific: Record<string, string> = {
    CIF: `Under CIF, the Seller must deliver the Goods on board the vessel or procure the Goods so delivered at the named port of shipment, contract and pay for the costs of carriage necessary to bring the Goods to the named port of destination, and obtain cargo insurance complying at minimum with the Institute Cargo Clauses (A) (ICC A) covering a minimum of 110% of the CIF value. Risk passes when the Goods are placed on board the vessel at the port of shipment.`,
    FOB: `Under FOB, the Seller must deliver the Goods on board the vessel nominated by the Buyer at the named port of shipment, and the Buyer must contract and pay for carriage and insurance from that point. Risk passes when the Goods are placed on board the vessel at the port of shipment. The Parties expressly adopt the Incoterms® 2020 variant "FOB on board the vessel" (not the "FOB stowed" or "FOB trimmed" variants).`,
    DAP: `Under DAP, the Seller must deliver the Goods by placing them at the disposal of the Buyer on the arriving means of transport ready for unloading at the named place of destination. The Seller bears all risks involved in bringing the Goods to the named place. The Buyer is responsible for import clearance and any import duties.`,
    DDP: `Under DDP, the Seller must deliver the Goods at the named place of destination, cleared for import and not unloaded from the arriving means of transport. The Seller bears all costs and risks up to and including import clearance, including any VAT or other import taxes. The Seller is not obliged to the Buyer to clear the Goods for import through payment of VAT if the Parties so agree or if the applicable law so provides.`,
    DPU: `Under DPU, the Seller must deliver the Goods by unloading them at the named place of destination. The Seller bears all costs and risks up to and including unloading. The Buyer is responsible for import clearance.`,
    EXW: `Under EXW, the Seller makes the Goods available at its premises. The Buyer bears all costs and risks from the Seller's premises onwards, including loading, export clearance, carriage, insurance, import clearance and duties.`,
    FCA: `Under FCA, the Seller delivers the Goods to the carrier or another person nominated by the Buyer at the Seller's premises or another named place. Risk passes upon delivery to the carrier.`,
    CFR: `Under CFR, the Seller must deliver the Goods on board the vessel or procure the Goods so delivered and contract for the costs of carriage to the named port of destination. Risk passes when the Goods are placed on board the vessel at the port of shipment.`,
    FAS: `Under FAS, the Seller must deliver the Goods alongside the vessel nominated by the Buyer at the named port of shipment. Risk passes when the Goods are alongside the vessel.`,
    CIP: `Under CIP, the Seller must deliver the Goods to the carrier, contract for carriage to the named place of destination, and obtain cargo insurance complying at minimum with the Institute Cargo Clauses (A) (ICC A) covering a minimum of 110% of the CIP value. Risk passes when the Goods are handed over to the first carrier.`,
  };
  return `${common}\n\n${specific[inc] || specific.CIF}`;
}

function clauseDeliveryTerms(ctx: ContractContext): { title: string; content: string } {
  const { trade } = ctx;
  const lines: string[] = [];
  lines.push(
    `The Goods shall be delivered in accordance with the Incoterm® 2020 specified in Clause 5, at the following locations:`,
  );
  lines.push(
    `• Port / Place of Loading (Origin): ${safe(trade.originPort)} (${countryName(trade.originCountry)})\n• Port / Place of Discharge (Destination): ${safe(trade.destPort)} (${countryName(
      trade.destCountry,
    )})\n• Transport Mode: ${safe(trade.transportMode, "Ocean — FCL")}\n• Equipment Type: ${safe(trade.equipmentType, "Standard Dry Container")}\n• Container Count: ${safe(trade.containerCount, 1)}\n• Transit Time (estimated): ${safe(trade.transitTimeDays, "—")} days`,
  );
  if (trade.earliestDeliveryDate || trade.preferredDeliveryDate || trade.latestDeliveryDate) {
    lines.push(
      `Delivery Window:\n• Earliest Delivery Date: ${fmtDate(trade.earliestDeliveryDate)}\n• Preferred Delivery Date: ${fmtDate(trade.preferredDeliveryDate)}\n• Latest Delivery Date: ${fmtDate(trade.latestDeliveryDate)}`,
    );
    lines.push(
      `Time shall be of the essence in respect of the delivery window. If the Seller anticipates that it will be unable to deliver within the agreed window, the Seller shall notify the Buyer in writing without undue delay and in any event within seventy-two (72) hours of becoming aware of the prospective delay, and the Parties shall negotiate in good faith an extension of the delivery window.`,
    );
  }
  if (trade.multiShipment && ctx.shipments?.length) {
    lines.push(
      `This Contract is a multi-shipment contract. The Parties acknowledge that the Goods shall be shipped in ${ctx.shipments.length} shipment(s), each identified by a shipment sequence number and tracked under the master USTN. Each shipment shall constitute a separate delivery for the purposes of risk transfer, inspection and payment, but shall be governed by the terms of this Contract.`,
    );
  }
  return { title: "Delivery Terms", content: lines.join("\n\n") };
}

function clauseInspection(ctx: ContractContext): { title: string; content: string } {
  const { trade, labTests, qcInspections } = ctx;
  const lines: string[] = [];
  lines.push(
    `The Buyer (or its appointed inspection agent) shall have the right, at its own cost and in cooperation with the Seller, to inspect the Goods prior to shipment (the "Pre-Shipment Inspection" or "PSI"). The PSI shall be conducted in accordance with ISO 2859-1 (Acceptance sampling by attributes) or, where applicable, ISO 3951-1 (Acceptance sampling by variables), at a sampling level agreed between the Parties (default: General Inspection Level II, AQL 2.5 for major defects, AQL 4.0 for minor defects).`,
  );
  if (labTests?.length) {
    lines.push(
      `Laboratory testing shall be performed by an SGTX-registered laboratory holding valid ISO/IEC 17025 accreditation. The following parameters shall be tested: ${labTests
        .map((l: any) => safe(l.parameter || l.testType, "laboratory test"))
        .slice(0, 12)
        .join(", ") || "as specified in the trade record"}. Maximum Residue Limits (MRLs) shall not exceed the levels set by the Codex Alimentarius Commission or, where stricter, by the destination jurisdiction.`,
    );
  } else {
    lines.push(
      `Laboratory testing shall be performed by an SGTX-registered laboratory holding valid ISO/IEC 17025 accreditation. The parameters tested shall include, where applicable to the Goods: pesticide residues (Codex MRLs), heavy metals (Pb, Cd, As, Hg), microbiological parameters (Salmonella, E. coli, Listeria), moisture content, and sensory evaluation. Maximum Residue Limits (MRLs) shall not exceed the levels set by the Codex Alimentarius Commission or, where stricter, by the destination jurisdiction.`,
    );
  }
  if (qcInspections?.length) {
    lines.push(
      `Quality Control inspection shall be carried out by an SGTX-registered QC inspector at the place of loading. The inspection report shall be issued prior to release of the Goods and shall constitute a condition for the issuance of the clean on-board B/L. Conditional passes shall be permitted only where the deviation does not affect the essential character or merchantability of the Goods and the Buyer has accepted the deviation in writing.`,
    );
  } else {
    lines.push(
      `Quality Control inspection shall be carried out by an SGTX-registered QC inspector at the place of loading. The inspection report shall be issued prior to release of the Goods and shall constitute a condition for the issuance of the clean on-board B/L. Conditional passes shall be permitted only where the deviation does not affect the essential character or merchantability of the Goods and the Buyer has accepted the deviation in writing.`,
    );
  }
  lines.push(
    `The Buyer shall be entitled to reject any Goods that fail to conform to the contractual specifications or that fail the PSI or laboratory tests. Notice of rejection, accompanied by the inspection report and laboratory test results, shall be given to the Seller within seven (7) calendar days of the inspection. The Seller shall, at its option and at its own cost, replace the rejected Goods within a period agreed between the Parties or refund the corresponding portion of the Contract Price.`,
  );
  void trade;
  return { title: "Inspection and Testing", content: lines.join("\n\n") };
}

function clausePackagingMarking(ctx: ContractContext): { title: string; content: string } {
  const { trade, containers } = ctx;
  const lines: string[] = [];
  lines.push(
    `The Goods shall be packed in a manner adequate to withstand the rigours of the chosen mode of transport, to preserve the Goods in good condition during transit and storage, and to permit the Goods to be handled with ordinary care without loss or damage. Packaging shall comply with ISO 780 (pictorial marking symbols for handling of goods) and, where wooden packaging materials are used, with ISPM-15 (International Standards for Phytosanitary Measures No. 15 — Regulation of Wood Packaging Material in International Trade), including mandatory heat treatment or fumigation with methyl bromide and the application of the IPPC mark.`,
  );
  if (trade.coldChain) {
    lines.push(
      `Cold-chain Goods shall be packed in temperature-controlled packaging (e.g., insulated cartons with gel packs or active reefer containers) capable of maintaining the Goods within the specified temperature range of ${safe(
        trade.coldChainTemp ? `${trade.coldChainTemp}°C` : "−18°C to +4°C",
        "the agreed temperature range",
      )} throughout the transit time, with continuous temperature logging in accordance with IATA Perishable Cargo Regulations or, for ocean transport, the ATP Agreement.`,
    );
  }
  if (containers?.length) {
    lines.push(
      `Palletisation and packing shall comply with the per-container manifest provided by the Seller and acknowledged by the Buyer. Each container shall be sealed with a high-security bolt seal (ISO 17712:2013) bearing a unique serial number recorded in the SGTX Shipment Vault. The packing list shall be issued per container and shall itemise, at minimum: product description, HS code, quantity, net weight, gross weight, batch/lot number, production date, expiry date, and SSCC-18 (Serial Shipping Container Code) barcode.`,
    );
  } else {
    lines.push(
      `Each shipping unit shall be marked with: the Seller's and Buyer's names and addresses, the USTN, the contract number, the HS code, the country of origin, the gross and net weight, the batch/lot number, and any handling symbols required by ISO 780. Each pallet shall bear a Serial Shipping Container Code (SSCC-18) barcode in accordance with GS1 General Specifications.`,
    );
  }
  return { title: "Packaging and Marking", content: lines.join("\n\n") };
}

function clauseTitleRisk(ctx: ContractContext): { title: string; content: string } {
  const inc = (ctx.trade.incoterm || "CIF").toUpperCase();
  const riskText: Record<string, string> = {
    CIF: "when the Goods are placed on board the vessel at the named port of shipment",
    CFR: "when the Goods are placed on board the vessel at the named port of shipment",
    FOB: "when the Goods are placed on board the vessel at the named port of shipment",
    FAS: "when the Goods are placed alongside the vessel at the named port of shipment",
    EXW: "when the Goods are placed at the disposal of the Buyer at the Seller's premises",
    FCA: "when the Goods are handed over to the carrier nominated by the Buyer",
    DAP: "when the Goods are placed at the disposal of the Buyer on the arriving means of transport at the named place of destination, ready for unloading",
    DPU: "when the Goods are unloaded at the named place of destination and placed at the disposal of the Buyer",
    DDP: "when the Goods are placed at the disposal of the Buyer at the named place of destination, cleared for import and not unloaded",
    CIP: "when the Goods are handed over to the first carrier",
  };
  const when = riskText[inc] || riskText.CIF;
  const lines: string[] = [];
  lines.push(
    `Risk in the Goods shall pass from the Seller to the Buyer ${when}, in accordance with Incoterms® 2020 — ${inc} and Article 67 of CISG. From the moment of passing of risk, the Buyer shall bear all risks of loss of or damage to the Goods howsoever arising, save in respect of any loss or damage caused by the Seller's failure to perform its obligations under this Contract.`,
  );
  lines.push(
    `Notwithstanding the passing of risk, title to (i.e., property in) the Goods shall pass from the Seller to the Buyer only upon the later of (a) the passing of risk as provided above, and (b) the receipt by the Seller of full payment of the Contract Price in cleared funds. Until title has passed, the Seller reserves a retention-of-title (Romalpa) clause over the Goods and shall be entitled to require the Buyer to store the Goods separately and to identify them as the Seller's property.`,
  );
  lines.push(
    `If the Goods are subject to a documentary sale (e.g., under a Letter of Credit), title shall be deemed to pass with the endorsement and delivery of the negotiable transport document (e.g., the original negotiable B/L) in accordance with Article 30 of the Hamburg Rules and/or Article 51 of the Rotterdam Rules, as applicable.`,
  );
  return { title: "Title and Risk Transfer", content: lines.join("\n\n") };
}

function clauseDocumentation(ctx: ContractContext): { title: string; content: string } {
  const { trade, documentRequirements } = ctx;
  const lines: string[] = [];
  lines.push(
    `The Seller shall, at its own cost, provide the Buyer with the following shipping and commercial documents, each duly signed, stamped and (where required) legalised, and each bearing the USTN ${trade.ustn}:`,
  );
  const docList =
    documentRequirements && documentRequirements.length > 0
      ? documentRequirements.map((d: any) => `• ${d.docName} (${d.docType}) — ${d.format || "ELECTRONIC"} format, trigger: ${d.trigger}${d.mandatory ? " [MANDATORY]" : ""}`)
      : [
          "• Commercial Invoice (3 originals + 3 copies)",
          "• Packing List (3 originals + 3 copies)",
          "• Clean on-board Bill of Lading (3 originals, negotiable)",
          "• Certificate of Origin (chamberised, 1 original + 2 copies)",
          "• Phytosanitary Certificate (where applicable)",
          "• Health Certificate (where applicable)",
          "• Fumigation Certificate (ISPM-15)",
          "• Pre-Shipment Inspection Report",
          "• Laboratory Test Report (ISO/IEC 17025 accredited)",
          "• Insurance Certificate (where applicable under CIF/CIP)",
          "• Cold-Chain Temperature Log (where applicable)",
        ];
  lines.push(docList.join("\n"));
  if (trade.originalDocsRequired === false) {
    lines.push(
      `Originals not required — the Parties expressly agree that electronic documents (ePDF / eCO / eB/L) issued through the SGTX Documents Vault or an equivalent recognised electronic trade document platform shall have the same legal effect as paper originals, in accordance with the UNCITRAL Model Law on Electronic Transferable Records (2017).`,
    );
  } else {
    lines.push(
      `Original paper documents are required and shall be dispatched by an internationally recognised courier to the Buyer's address within seven (7) calendar days of the on-board date. The Seller shall provide tracking information to the Buyer.`,
    );
  }
  lines.push(
    `The language of all documents shall be ${safe(trade.documentLanguage, "English")}. The currency of all monetary documents shall be ${safe(trade.currency, "USD")}.`,
  );
  return { title: "Documentation Requirements", content: lines.join("\n\n") };
}

function clauseInsurance(ctx: ContractContext): { title: string; content: string } {
  const inc = (ctx.trade.incoterm || "CIF").toUpperCase();
  const sellerInsures = ["CIF", "CIP"].includes(inc);
  const lines: string[] = [];
  if (sellerInsures) {
    lines.push(
      `Under Incoterms® 2020 — ${inc}, the Seller shall, at its own cost, obtain cargo insurance on terms no less favourable than the Institute Cargo Clauses (A) (ICC A) or an equivalent "all-risks" clause, covering a minimum of one hundred and ten per cent (110%) of the CIF/CIP value of the Goods from the warehouse at the place of origin to the warehouse at the place of destination (warehouse-to-warehouse cover).`,
    );
    lines.push(
      `The insurance shall be effected in the currency of the Contract, shall name the Buyer (or its assigns) as the beneficiary, and shall allow for claims to be payable at the port of destination. The Seller shall provide the Buyer with the insurance policy or certificate prior to shipment. War-risk and strikes-riots-civil-commotion (SRCC) cover shall be obtained if requested by the Buyer at the Buyer's cost.`,
    );
  } else {
    lines.push(
      `Under Incoterms® 2020 — ${inc}, the Buyer is responsible for obtaining cargo insurance from the point of passing of risk. The Parties nevertheless recommend that the Buyer obtain all-risks cargo insurance on terms no less favourable than the Institute Cargo Clauses (A) (ICC A), covering a minimum of one hundred and ten per cent (110%) of the CIP/CIF-equivalent value of the Goods, on a warehouse-to-warehouse basis, naming the Buyer (or its assigns) as beneficiary.`,
    );
  }
  if (ctx.trade.coldChain) {
    lines.push(
      `For cold-chain Goods, the insuring Party shall additionally obtain reefer-cargo deterioration cover (e.g., the Institute Cargo Clauses (Refrigerated Goods)) covering loss of or damage to the Goods caused by breakdown of refrigerating machinery, deviation of the carrying vessel, or failure of the cold chain.`,
    );
  }
  lines.push(
    `Where a claim is made under the insurance, the Party in possession of the Goods shall take all reasonable measures to mitigate the loss and shall promptly notify the other Party and the insurer.`,
  );
  return { title: "Insurance", content: lines.join("\n\n") };
}

function clauseForceMajeure(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `A Party shall not be liable for any failure to perform or delay in performance of its obligations under this Contract to the extent that such failure or delay is caused by an event of Force Majeure, as defined below and interpreted in accordance with the ICC Force Majeure Clause 2020 (ICC Publication 740 E).`,
  );
  lines.push(
    `"Force Majeure" means the occurrence of an event or circumstance that is beyond the reasonable control of the affected Party, that could not reasonably have been foreseen at the time of conclusion of the Contract, and the consequences of which could not reasonably have been avoided or overcome by the affected Party. Force Majeure shall include, without limitation: (a) natural catastrophes (earthquake, flood, hurricane, typhoon, volcanic eruption); (b) acts of God; (c) war, armed conflict, terrorism, piracy or civil unrest; (d) epidemic, pandemic or public-health emergency (including quarantine measures); (e) strike, lockout or other industrial action not specific to the affected Party's undertaking; (f) governmental act, embargo, sanction, or sudden change of law; (g) closure of ports, canals, or straits; and (h) failure of essential public utilities.`,
  );
  lines.push(
    `The affected Party shall: (i) notify the other Party in writing without undue delay, and in any event within seven (7) calendar days of becoming aware of the Force Majeure event, providing reasonable particulars of the event and its expected consequences; (ii) use reasonable efforts to mitigate the effects of the event; and (iii) upon cessation of the event, promptly notify the other Party and resume performance.`,
  );
  lines.push(
    `If the Force Majeure event prevents performance of a material obligation for a continuous period of more than sixty (60) calendar days, either Party shall be entitled to terminate this Contract in respect of the unperformed portion by written notice to the other Party, without liability except in respect of obligations accrued prior to the date of termination. Any prepaid sums for Goods not delivered shall be refunded, less any reasonable costs properly incurred by the Seller up to the date of termination.`,
  );
  lines.push(
    `If the Force Majeure event causes a substantial change in the equilibrium of the Contract that renders performance excessively onerous, the Parties shall negotiate in good faith an adaptation of the Contract in accordance with the ICC Hardship Clause 2020 (ICC Publication 740 E).`,
  );
  return { title: "Force Majeure", content: lines.join("\n\n") };
}

function clauseWarranties(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `The Seller warrants to the Buyer that, at the time of passing of risk and for the duration of the warranty period specified in Clause 3:`,
  );
  lines.push(
    `(a) the Goods shall conform in all respects with the contractual specifications, descriptions, samples and models, and shall be of merchantable quality and fit for the purpose for which goods of that description are ordinarily used, in accordance with Article 35 of CISG and the applicable mandatory law;\n(b) the Goods shall be free from any defect in design, materials or workmanship that would render them unmerchantable or unfit for their intended purpose;\n(c) the Seller has good and marketable title to the Goods, free and clear of all liens, security interests, encumbrances, retention-of-title claims, and third-party rights of any kind;\n(d) the Goods do not infringe any patent, trademark, copyright, trade secret or other intellectual-property right of any third party in any jurisdiction;\n(e) the Goods have been produced, packed, labelled and stored in compliance with all applicable laws and regulations, including food-safety, phyto-sanitary, environmental and labour laws;\n(f) the Goods are not subject to any recall, seizure, embargo or other restriction by any competent authority; and\n(g) all information furnished by the Seller in respect of the Goods is true, accurate and not misleading.`,
  );
  lines.push(
    `The Buyer warrants to the Seller that: (a) it has provided accurate and complete information regarding the intended use of the Goods and the import requirements of the destination jurisdiction; (b) it holds all permits, licences and authorisations necessary for the importation, distribution and sale of the Goods in the destination jurisdiction; and (c) it will not re-export the Goods to any jurisdiction subject to a trade embargo or sanction applicable to the Seller.`,
  );
  return { title: "Warranties", content: lines.join("\n\n") };
}

function clauseIntellectualProperty(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `Each Party represents and warrants that the performance of its obligations under this Contract does not and will not infringe any patent, trademark, service mark, trade name, copyright, design right, database right, trade secret, know-how or other intellectual-property right of any third party.`,
  );
  lines.push(
    `The Seller retains all right, title and interest in and to any trademark, brand, get-up, design, technical documentation, recipe, formulation or know-how supplied or disclosed in connection with the Goods. No licence, assignment or other transfer of any intellectual-property right is granted by this Contract, whether express or implied, except for the limited right of the Buyer to resell the Goods in their original or repackaged form under the Seller's trademark, provided that the Buyer complies with the Seller's brand-guidance and applicable law.`,
  );
  lines.push(
    `If any claim is made by a third party that the Goods infringe any intellectual-property right, the Party receiving notice shall promptly notify the other Party, and the Seller shall, at its option and at its own cost: (a) procure for the Buyer the right to continue using the Goods; (b) modify the Goods so that they become non-infringing while retaining substantially equivalent functionality; or (c) replace the Goods with non-infringing equivalent Goods; or, failing any of the foregoing within a reasonable period, (d) refund the Contract Price (or the relevant portion thereof) against return of the Goods.`,
  );
  return { title: "Intellectual Property", content: lines.join("\n\n") };
}

function clauseCompliance(ctx: ContractContext): { title: string; content: string } {
  const { buyer, seller } = ctx;
  const lines: string[] = [];
  lines.push(
    `Each Party shall comply, at its own cost, with all applicable laws, regulations, orders and conventions, including without limitation: (a) export and import controls, including the Wassenaar Arrangement, the EU Dual-Use Regulation (Regulation (EU) 2021/821), the US Export Administration Regulations (EAR) and the International Traffic in Arms Regulations (ITAR) where applicable; (b) economic sanctions administered by the United Nations Security Council, the European Union, the United Kingdom Office of Financial Sanctions Implementation (OFSI), and the United States Office of Foreign Assets Control (OFAC); (c) anti-money-laundering and counter-terrorism-financing laws, including the FATF Recommendations and the Bank Secrecy Act (where applicable); (d) anti-bribery and anti-corruption laws, including the OECD Anti-Bribery Convention, the US Foreign Corrupt Practices Act (FCPA), the UK Bribery Act 2010, and the Egyptian Anti-Corruption Law (Law No. 62 of 1975); (e) data-protection laws, including the EU General Data Protection Regulation (GDPR, Regulation (EU) 2016/679) and the Egyptian Personal Data Protection Law (PDPL, Law No. 151 of 2020); and (f) product-safety, food-safety, phyto-sanitary and consumer-protection laws.`,
  );
  lines.push(
    `Each Party represents and warrants that neither it nor any of its directors, officers, beneficial owners or agents is the subject of any sanction or designation by any of the sanctions authorities listed above, nor is it located, organised or resident in any jurisdiction subject to comprehensive sanctions (including, without limitation, Crimea, Cuba, Iran, the Democratic People's Republic of Korea, Syria, and the so-called Luhansk and Donetsk regions of Ukraine). Each Party further represents that it has implemented a risk-based AML/CFT compliance programme and know-your-customer (KYC) procedures consistent with FATF Recommendation 10.`,
  );
  lines.push(
    `Each Party shall promptly notify the other Party in writing upon becoming aware of any actual or suspected breach of this Clause, including any designation of itself or any of its officers on a sanctions list, and the other Party shall thereupon be entitled, without prejudice to any other remedy, to suspend performance or terminate this Contract immediately on written notice, in accordance with Clause 19.`,
  );
  lines.push(
    `The Buyer represents that the Goods are not being acquired for any end-use prohibited by the export-control laws of the Seller's jurisdiction or the destination jurisdiction, including use in weapons of mass destruction programmes, military end-uses, or unsafeguarded nuclear-fuel-cycle activities.`,
  );
  lines.push(
    `Each Party shall provide the other Party with such reasonable cooperation and information as may be required to enable the other Party to comply with its compliance obligations, including (without limitation) provision of end-user certificates, sanctions-screening attestations and beneficial-ownership disclosures. The SGTX Governor performs an automated sanctions and jurisdictional screen of both Parties at the formation of this Contract, and the Parties acknowledge that the GTIDs of ${seller.gtid} (Seller) and ${buyer.gtid} (Buyer) have been so screened.`,
  );
  return { title: "Compliance (Sanctions, AML, Export Controls, PDPL/GDPR)", content: lines.join("\n\n") };
}

function clauseConfidentiality(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `Each Party shall keep confidential, and shall not disclose to any third party (other than its professional advisers, auditors, financing parties, insurers and competent authorities on a need-to-know basis), any information of a confidential nature disclosed by the other Party in connection with this Contract, including trade secrets, pricing, technical specifications, customer lists, and the existence and terms of this Contract.`,
  );
  lines.push(
    `The obligation of confidentiality shall not apply to information that: (a) is or becomes publicly available other than as a result of a breach of this Clause; (b) was lawfully in the receiving Party's possession prior to disclosure by the disclosing Party; (c) is independently developed by the receiving Party without use of or reference to the disclosing Party's information; or (d) is required to be disclosed by law, regulation, or order of a court or competent authority, provided that the receiving Party gives the disclosing Party prompt written notice and reasonable cooperation to enable the disclosing Party to seek a protective order or other appropriate remedy.`,
  );
  lines.push(
    `The obligations of confidentiality shall survive the expiry or termination of this Contract for a period of five (5) years, save in respect of trade secrets, which shall remain confidential for as long as they retain their character as trade secrets under the applicable law.`,
  );
  return { title: "Confidentiality", content: lines.join("\n\n") };
}

function clauseLiability(ctx: ContractContext): { title: string; content: string } {
  const cap = fmtMoney((ctx.trade.tradeValueUsd || 0) * 1.1, ctx.trade.currency || "USD");
  const lines: string[] = [];
  lines.push(
    `Subject to Clause 12 (Force Majeure) and to any liability that may not be limited or excluded under the applicable mandatory law, the aggregate liability of each Party to the other under or in connection with this Contract, whether in contract, tort (including negligence), breach of statutory duty, or otherwise, shall in no event exceed one hundred and ten per cent (110%) of the Contract Price, namely ${cap}.`,
  );
  lines.push(
    `In no event shall either Party be liable to the other for any indirect, incidental, special, consequential, exemplary or punitive damages, including loss of profits, loss of business, loss of anticipated savings, loss of goodwill, loss of use, or business interruption, howsoever arising and whether or not foreseeable, even if that Party has been advised of the possibility of such damages.`,
  );
  lines.push(
    `The limitations and exclusions of liability in this Clause shall not apply to: (a) liability for death or personal injury caused by negligence; (b) liability for fraud or fraudulent misrepresentation; (c) liability for breach of Clause 13 (Warranties of title); (d) liability for breach of Clause 14 (Intellectual Property); (e) liability for breach of Clause 15 (Compliance); (f) liability for wilful misconduct or gross negligence; or (g) the Seller's liability for product liability under the applicable mandatory law.`,
  );
  lines.push(
    `Subject to the foregoing, no claim shall be brought under this Contract unless the claiming Party has given written notice of the claim to the other Party within twelve (12) months of the date on which the claiming Party became aware (or ought reasonably to have become aware) of the event giving rise to the claim.`,
  );
  return { title: "Limitation of Liability", content: lines.join("\n\n") };
}

function clauseIndemnification(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `The Seller shall indemnify, defend and hold harmless the Buyer, its officers, directors, employees and agents (the "Buyer Indemnitees") from and against any and all third-party claims, actions, suits, proceedings, losses, damages, fines, penalties, costs and expenses (including reasonable legal fees) arising out of or in connection with: (a) any breach by the Seller of the warranties in Clause 13; (b) any actual or alleged infringement of a third party's intellectual-property rights by the Goods; (c) any product-liability claim relating to the Goods; (d) any breach by the Seller of Clause 15 (Compliance); or (e) any negligence, fraud or wilful misconduct of the Seller.`,
  );
  lines.push(
    `The Buyer shall indemnify, defend and hold harmless the Seller, its officers, directors, employees and agents (the "Seller Indemnitees") from and against any and all third-party claims, actions, suits, proceedings, losses, damages, fines, penalties, costs and expenses (including reasonable legal fees) arising out of or in connection with: (a) any breach by the Buyer of this Contract, including failure to pay the Contract Price when due; (b) any breach by the Buyer of Clause 15 (Compliance); (c) any re-export, diversion, or unauthorised end-use of the Goods by the Buyer or any downstream party; (d) any claim arising from the Buyer's product-handling, repackaging, or further processing of the Goods after passing of risk; or (e) any negligence, fraud or wilful misconduct of the Buyer.`,
  );
  lines.push(
    `The indemnifying Party shall: (i) be given prompt written notice of the claim; (ii) be entitled to assume conduct of the defence and settlement of the claim (provided that it may not settle any claim that imposes a non-indemnifiable liability or admission of fault on the indemnified Party without the indemnified Party's prior written consent, not to be unreasonably withheld); and (iii) provide reasonable cooperation to the indemnified Party at the indemnifying Party's cost.`,
  );
  return { title: "Indemnification", content: lines.join("\n\n") };
}

function clauseTermination(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `Either Party may terminate this Contract for cause with immediate effect by written notice to the other Party if: (a) the other Party commits a material breach of this Contract that is incapable of remedy and (where capable of remedy) fails to remedy that breach within thirty (30) calendar days of receipt of written notice requiring it to do so (the "Cure Period"); (b) the other Party becomes insolvent, enters into liquidation (otherwise than for the purposes of solvent amalgamation or reconstruction), has a receiver, administrator or similar officer appointed over any of its assets, makes a composition or arrangement with its creditors, or is the subject of any analogous insolvency proceedings; (c) the other Party commits a breach of Clause 15 (Compliance); or (d) the other Party ceases or threatens to cease to carry on business.`,
  );
  lines.push(
    `Either Party may terminate this Contract for convenience by giving not less than thirty (30) calendar days' prior written notice to the other Party, provided that: (a) such termination shall not affect any obligation accrued prior to the date of termination; (b) the terminating Party shall reimburse the other Party for any reasonable, genuine and substantiated sunk costs properly incurred in performance of this Contract up to the date of termination, against delivery of supporting documentation; and (c) the terminating Party shall not be entitled to recover any anticipated profits.`,
  );
  lines.push(
    `Upon termination, each Party shall: (i) return or, at the other Party's option, destroy all confidential information of the other Party in its possession; (ii) pay all sums accrued and due to the other Party up to the date of termination; and (iii) make reasonable arrangements for the orderly handover of any Goods in transit, documents, and intellectual property.`,
  );
  lines.push(
    `Termination shall be without prejudice to any right or remedy that has accrued, or may accrue, to either Party prior to the date of termination. Clauses that by their nature are intended to survive termination (including Clauses 13 (Warranties), 14 (Intellectual Property), 15 (Compliance), 16 (Confidentiality), 17 (Limitation of Liability), 18 (Indemnification), 20 (Dispute Resolution), 22 (Notices), 25 (Severability) and 30 (SGTX Platform Terms)) shall so survive.`,
  );
  return { title: "Termination", content: lines.join("\n\n") };
}

function clauseDisputeResolution(ctx: ContractContext): { title: string; content: string } {
  const lawLabel = GOVERNING_LAW_LABELS[ctx.governingLaw];
  const arbLabel = ARBITRATION_LABELS[ctx.arbitrationClause];
  const seatLabel = ARBITRATION_SEAT_LABELS[ctx.arbitrationSeat];
  const lines: string[] = [];
  lines.push(
    `Stage 1 — Amicable Negotiation. In the event of any dispute, controversy or claim arising out of or in connection with this Contract, including the existence, validity, interpretation, performance, breach or termination thereof, the Parties shall first attempt to settle the dispute amicably by good-faith negotiation between senior representatives of each Party. Either Party may initiate negotiation by written notice to the other Party. If the dispute is not resolved within thirty (30) calendar days of such notice, the Parties shall proceed to Stage 2.`,
  );
  lines.push(
    `Stage 2 — Mediation. If the dispute is not resolved by negotiation, the Parties shall submit the dispute to mediation under the ICC Mediation Rules (in force at the time of submission). The mediation shall be conducted in ${safe(
      ctx.arbitrationSeat,
      "London",
    )}, in the English language, by a single mediator appointed under the ICC Mediation Rules. If the dispute is not resolved within sixty (60) calendar days of the appointment of the mediator (or such longer period as the Parties may agree), the Parties shall be released from the obligation to mediate and shall proceed to Stage 3.`,
  );
  lines.push(
    `Stage 3 — Arbitration. Any dispute, controversy or claim not resolved under Stages 1 and 2 shall be finally resolved by arbitration administered in accordance with the ${arbLabel}, by: ${
      ctx.arbitrationClause === "UNCITRAL" ? "an arbitral tribunal appointed in accordance with the UNCITRAL Rules" : "a sole arbitrator if the amount in dispute does not exceed USD 5,000,000, or three (3) arbitrators if the amount in dispute exceeds USD 5,000,000"
    }. The seat of arbitration shall be ${seatLabel}. The language of the arbitration shall be English. The arbitration shall be confidential. The award shall be final and binding on the Parties, and judgment thereon may be entered in any court of competent jurisdiction.`,
  );
  lines.push(
    `Governing Law. This Contract, and any non-contractual obligations arising out of or in connection with it, shall be governed by ${lawLabel}. ${
      ctx.governingLaw === "CISG"
        ? "The Parties expressly opt out of any reservations concerning the application of CISG Article 1(1)(b) and confirm that CISG shall apply regardless of whether the forum State is a Contracting State."
        : ctx.governingLaw === "UNIDROIT"
          ? "The UNIDROIT Principles of International Commercial Contracts (2016) shall apply as the rules of law chosen by the Parties, supplementing any mandatory rules of the otherwise applicable law."
          : "The Parties expressly agree that, where both Parties have their places of business in Contracting States to the United Nations Convention on Contracts for the International Sale of Goods (CISG), CISG shall not apply, the Parties having exercised their right to exclude CISG under Article 6 thereof in favour of the chosen national law."
    }`,
  );
  lines.push(
    `Notwithstanding the foregoing, either Party may apply to a court of competent jurisdiction for interim or injunctive relief, including the preservation of evidence, the appointment of an emergency arbitrator, or the enforcement of an arbitral award, without prejudice to the foregoing dispute-resolution mechanism. The Parties waive any right to a trial by jury to the extent permitted by the applicable law.`,
  );
  return { title: "Dispute Resolution and Governing Law", content: lines.join("\n\n") };
}

function clauseAssignment(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `Neither Party shall assign, transfer, charge, or otherwise deal with all or any of its rights or obligations under this Contract, or subcontract any of its material obligations, without the prior written consent of the other Party, such consent not to be unreasonably withheld, conditioned or delayed.`,
  );
  lines.push(
    `Notwithstanding the foregoing, either Party may, without consent, assign or transfer any of its rights (but not its obligations) under this Contract to a financing party providing receivables-financing, factoring, or forfaiting facilities in respect of the Contract Price, or to an affiliate within the same corporate group, provided that: (a) the assigning Party gives the other Party not less than fifteen (15) calendar days' prior written notice; (b) the assignee undertakes in writing to be bound by the obligations of confidentiality and compliance set out in this Contract; and (c) the assigning Party remains liable for the performance of its obligations under this Contract.`,
  );
  lines.push(
    `The Seller shall not subcontract the production of the Goods without the Buyer's prior written consent, except for standard commercial sub-components and packaging materials that comply with the contractual specifications.`,
  );
  return { title: "Assignment and Subcontracting", content: lines.join("\n\n") };
}

function clauseNotices(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `All notices and other communications under this Contract shall be in writing and shall be delivered: (a) by hand against signed acknowledgement of receipt; (b) by internationally recognised courier with proof of delivery; (c) by registered mail with return receipt; or (d) by electronic mail to the email address registered on the SGTX Platform, with an electronic delivery confirmation and a Qualified Electronic Signature (QES) where required.`,
  );
  lines.push(
    `Notices shall be addressed to each Party at the address, email and GTID registered on the SGTX Platform. The Parties acknowledge that notices delivered through the SGTX secure channel, signed with a QES and timestamped by the SGTX Loom hash chain, shall constitute valid and enforceable notices for all purposes of this Contract.`,
  );
  lines.push(
    `A notice shall be deemed received: (i) if delivered by hand, on the date of acknowledgement; (ii) if delivered by courier, on the third (3rd) business day after dispatch; (iii) if delivered by registered mail, on the seventh (7th) business day after posting; and (iv) if delivered by electronic mail, on the date of successful electronic delivery confirmation, provided that no error message has been received.`,
  );
  lines.push(
    `Notices in respect of operational matters (e.g., shipment scheduling, document availability, minor queries) may be exchanged through the SGTX Trade Room chat; provided that formal notices (e.g., notices of breach, termination, dispute, or Force Majeure) shall be delivered by one of the methods listed above.`,
  );
  return { title: "Notices", content: lines.join("\n\n") };
}

function clauseEntireAgreement(ctx: ContractContext): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `This Contract, together with any schedules, appendices, and the documents referenced herein (including the SGTX Trade record identified by USTN ${ctx.trade.ustn}, the Shipment Schedule, the Packing List, the Inspection Report and the Documentation Requirements), constitutes the entire agreement between the Parties in respect of the subject matter hereof and supersedes all prior negotiations, representations, understandings and agreements, whether written or oral, between the Parties in respect of that subject matter.`,
  );
  lines.push(
    `Each Party acknowledges that, in entering into this Contract, it has not relied on any representation, undertaking or promise, save to the extent expressly set out in this Contract. Nothing in this Clause shall, however, limit or exclude either Party's liability for fraud or fraudulent misrepresentation.`,
  );
  return { title: "Entire Agreement", content: lines.join("\n\n") };
}

function clauseAmendments(): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `No variation, amendment, modification or supplement to this Contract shall be effective unless it is in writing, refers expressly to this Contract, and is signed by an authorised representative of each Party. Electronic amendments signed with a Qualified Electronic Signature (QES) through the SGTX Platform shall have the same legal effect as paper amendments.`,
  );
  lines.push(
    `Each amendment shall be issued as a new numbered version (v2, v3, etc.) of this Contract, with the previous version retained for audit purposes. The contract version shall be incremented automatically by the SGTX Platform upon the creation of an amendment, and the SHA-256 hash of the amended Contract shall be recomputed and recorded on the SGTX Loom hash chain.`,
  );
  lines.push(
    `Amendments relating to price, quantity, delivery window, Incoterm, or governing law shall require the explicit consent of both Parties. The Governor shall verify the constitutional validity of each amendment before it becomes effective.`,
  );
  return { title: "Amendments", content: lines.join("\n\n") };
}

function clauseSeverability(): { title: string; content: string } {
  return {
    title: "Severability",
    content: `If any provision of this Contract is held by a court, arbitral tribunal or other competent authority to be invalid, illegal or unenforceable, in whole or in part, the remaining provisions of this Contract shall continue in full force and effect, and the Parties shall negotiate in good faith to replace the invalid, illegal or unenforceable provision with a valid, legal and enforceable provision that achieves, to the greatest extent permitted by law, the original commercial intent of the Parties.\n\nThe invalidity or unenforceability of any provision under the law of one jurisdiction shall not affect the validity or enforceability of that provision under the law of any other jurisdiction.`,
  };
}

function clauseWaiver(): { title: string; content: string } {
  return {
    title: "Waiver",
    content: `No failure or delay by either Party in exercising any right, power or remedy under this Contract or at law shall operate as a waiver thereof, nor shall any single or partial exercise of any such right, power or remedy preclude any other or further exercise thereof or the exercise of any other right, power or remedy. A waiver shall be effective only if given in writing and signed by the waiving Party, and shall apply only to the specific instance and purpose for which it is given.\n\nThe rights and remedies provided in this Contract are cumulative and not exclusive of any rights or remedies provided by law.`,
  };
}

function clauseCounterparts(ctx: ContractContext): { title: string; content: string } {
  return {
    title: "Counterparts and Electronic Signatures",
    content: `This Contract may be executed in any number of counterparts, each of which when executed shall constitute an original, and all of which together shall constitute one and the same instrument. The Parties expressly agree that this Contract may be executed by Qualified Electronic Signature (QES) in accordance with the eIDAS Regulation (EU) No 910/2014 or its equivalent under the applicable Egyptian (ITIDA Law), German (Vertrauensdienstegesetz), Emirati (Federal Law No. 1 of 2006 on e-Transactions) or English (Electronic Communications Act 2000) electronic-signature legislation.\n\nEach Party signing this Contract by QES through the SGTX Platform acknowledges that such signature has the same legal effect as a handwritten signature, and that the SHA-256 document hash recorded by the SGTX Platform shall constitute prima facie evidence of the integrity of the signed Contract. As of ${ctx.generatedAt}, the SHA-256 hash of this Contract is recorded by the SGTX Loom hash chain.`,
  };
}

function clauseThirdPartyRights(): { title: string; content: string } {
  return {
    title: "Third-Party Rights",
    content: `Save for any financing party that has taken an assignment of rights under Clause 21 (Assignment) and is expressly named in writing as a beneficiary by the assigning Party, no person who is not a Party to this Contract shall have any right to enforce any term of it, whether under the Contracts (Rights of Third Parties) Act 1999 (UK), section 328 of the German BGB, Article 153 of the Egyptian Civil Code, or otherwise. The Parties may rescind or vary this Contract without the consent of any such third party.\n\nNothing in this Contract shall confer, or be construed as conferring, any rights or remedies on any third party, including any downstream purchaser, end-consumer, sub-buyer, carrier, financing party, or insurer, save as expressly provided herein or required by mandatory law.`,
  };
}

// Returns true if any container on this trade is flagged as dangerous goods
// (TradeContainer.isDangerous). Used to gate ADR / IMDG corridor clauses.
function isHazardousShipment(ctx: ContractContext): boolean {
  const containers = ctx.containers || [];
  if (containers.length === 0) return false;
  return containers.some((c: any) => c?.isDangerous === true);
}

// Normalise the various transport-mode spellings used across the platform
// (SEA / OCEAN, AIR / AIR_FREIGHT, TRUCK / ROAD, RORO / RO_RO, RAIL, etc.)
function normaliseTransportMode(mode: string | null | undefined): string {
  const m = String(mode || "").toUpperCase().replace(/[\s-]/g, "_");
  if (m === "OCEAN" || m === "SEA" || m === "INLAND_WATER") return "SEA";
  if (m === "AIR_FREIGHT" || m === "AIR") return "AIR";
  if (m === "ROAD" || m === "TRUCK") return "TRUCK";
  if (m === "RORO" || m === "RO_RO") return "RORO";
  if (m === "RAIL") return "RAIL";
  if (m === "MULTIMODAL") return "MULTIMODAL";
  return m;
}

function clauseCorridor(ctx: ContractContext): { title: string; content: string } {
  const mode = normaliseTransportMode(ctx.trade?.transportMode);
  const hazardous = isHazardousShipment(ctx);

  // ---------- RoRo corridor (preserved existing behaviour) ----------
  if (ctx.contractType === "RORO_CONTRACT" || mode === "RORO") {
    const lines: string[] = [];
    lines.push(
      `This Contract is concluded on a Roll-on/Roll-off (RoRo) multimodal corridor. The Goods (typically self-propelled vehicles, heavy equipment, or roll-trailers) shall be loaded and discharged by rolling on and off the carrying vessel under their own power, or by means of a roll-trailer.`,
    );
    lines.push(
      `The Seller shall ensure that: (a) the Goods are presented at the RoRo terminal in a rollable condition, with functioning brakes, steering and immobilisation systems; (b) the Goods carry sufficient fuel for loading, discharge and any onward movement (typically not less than one-quarter tank and not more than one-half tank, in accordance with the IMDG Code and the vessel's terminal-handling requirements); (c) the battery is securely fastened, disconnected where required, and protected against short-circuit; (d) the Goods comply with the IMO IMDG Code (special provision 962) for vehicles powered by flammable-liquid fuel; and (e) the Goods are accompanied by a RoRo cargo ticket, a vehicle master receipt and, where applicable, a TIR Carnet.`,
    );
    lines.push(
      `Where the corridor includes a land leg under the TIR Convention (1975), the Seller (or its carrier) shall ensure that the Goods travel under a valid TIR Carnet, that the vehicle is plated in accordance with the TIR procedure, and that the customs offices of departure, transit and destination are notified through the SGTX-Nafeza / SGTX-CargoX integration. Risk on the land leg shall pass in accordance with the chosen Incoterm®, and the RoRo sea-leg risk shall pass on roll-on at the port of loading, in accordance with the Hamburg Rules Article III.`,
    );
    lines.push(
      `The carriage of the Goods by sea shall additionally be governed by the Hague-Visby Rules as enacted in the country of the carrier, and the carrier's Bill of Lading shall so state. Where the carrier is a member of the International Maritime Organization (IMO), the vessel shall comply with the ISM Code (SOLAS Chapter IX) and the ISPS Code (SOLAS Chapter XI-2).`,
    );
    return { title: "Corridor-Specific Clauses (RoRo)", content: lines.join("\n\n") };
  }

  // ---------- Air corridor (Montreal Convention 1999 + IATA) ----------
  if (mode === "AIR") {
    const lines: string[] = [];
    lines.push(
      `Carriage of goods by air is subject to the Montreal Convention 1999. Carrier liability is limited to 22 SDR per kilogram unless a special declaration of interest has been made.`,
    );
    lines.push(
      `The Air Waybill (AWB) is issued subject to IATA Conditions of Carriage and the carrier's Conditions of Contract printed on the AWB.`,
    );
    if (hazardous) {
      lines.push(
        `Where the Goods are classified as dangerous goods, the carriage shall additionally comply with the IATA Dangerous Goods Regulations (DGR) and ICAO Technical Instructions for the Safe Transport of Dangerous Goods by Air. The Shipper's Declaration for Dangerous Goods must accompany the AWB.`,
      );
    }
    return { title: "Corridor-Specific Clauses (Air)", content: lines.join("\n\n") };
  }

  // ---------- Truck / Road corridor (CMR + ADR for hazardous) ----------
  if (mode === "TRUCK") {
    const lines: string[] = [];
    lines.push(
      `International road transport is subject to the CMR Convention (Geneva 1956). The CMR Consignment Note is the transport document. Carrier liability is limited to 8.33 SDR per kilogram.`,
    );
    if (hazardous) {
      lines.push(
        `Transport of dangerous goods by road is subject to ADR (Accord européen relatif au transport international des marchandises Dangereuses par Route).`,
      );
    }
    return { title: "Corridor-Specific Clauses (Road)", content: lines.join("\n\n") };
  }

  // ---------- Rail corridor (COTIF/CIM) ----------
  if (mode === "RAIL") {
    const lines: string[] = [];
    lines.push(
      `International rail transport is subject to the COTIF/CIM Convention 1999. The CIM Consignment Note is the transport document.`,
    );
    if (hazardous) {
      lines.push(
        `Where the Goods are classified as dangerous goods, the carriage shall additionally comply with RID (Reglement concernant le transport International ferroviaire des marchandises Dangereuses).`,
      );
    }
    return { title: "Corridor-Specific Clauses (Rail)", content: lines.join("\n\n") };
  }

  // ---------- SEA / OCEAN / Multimodal / default: no corridor-specific clauses ----------
  return {
    title: "Corridor-Specific Clauses",
    content: `No corridor-specific clauses apply to this Contract. The Parties have selected the standard ${ctx.trade.incoterm} corridor, and the standard Incoterms® 2020 obligations set out in Clause 5 shall apply without modification.`,
  };
}

function clauseSGTXPlatform(ctx: ContractContext): { title: string; content: string } {
  const lines: string[] = [];
  lines.push(
    `The Parties acknowledge that this Contract has been formed and is administered through the SGTX Platform, a non-custodial, AI-governed sovereign trade execution platform. The SGTX Platform is not a party to this Contract, does not take custody of the Goods, the Contract Price, or any payment instrument, and assumes no liability for the performance of either Party. The SGTX Platform acts solely as a witness to the formation, signature, and execution of this Contract.`,
  );
  lines.push(
    `USTN Tracking. The Universal Shipment Tracking Number ${ctx.trade.ustn} shall be referenced on every shipment, document, invoice, payment instruction, customs declaration, and communication relating to this Contract. The USTN is immutable and shall remain the unique identifier of this Contract for the duration of its lifecycle, including any amendments, distress events, and dispute resolution proceedings.`,
  );
  lines.push(
    `FeeLock. The SGTX fee of one and one-half per cent (1.5%) per country side (3% total where both Buyer and Seller are on the SGTX Platform) shall be payable in accordance with the SGTX Fee Model and shall be collected via the non-custodial PSP FeeLock split at the moment of payment. The fee is non-refundable except in the case of an SGTX-verified fraud event. The Parties expressly acknowledge that the SGTX fee is calculated automatically by the Governor and is not negotiable save as permitted by the platform's Special Rate mechanism.`,
  );
  lines.push(
    `Non-Custodial Principle. The SGTX Platform does not hold, control, or otherwise have custody of the Contract Price, the Goods, the Letter of Credit, or any collateral. All payments are settled directly between the Parties' banks or PSPs, with the SGTX fee deducted at source via the PSP split. The Parties waive any claim against the SGTX Platform for the insolvency, fraud, or non-performance of any bank, PSP, carrier, customs broker, laboratory, QC inspector, or other service provider.`,
  );
  lines.push(
    `Governor Verification. The Parties acknowledge that the SGTX Governor has verified the constitutional validity of this Contract, including: (a) jurisdictional clearance of both Parties; (b) sanctions screening of both Parties; (c) fee-bound verification (fee within 0.1%–2.5% per side); (d) Incoterm consistency with the trade record; and (e) reserve-rules compliance (where applicable). The Governor's decision is recorded on the SGTX Loom hash chain and may be tendered as evidence in any dispute-resolution proceeding.`,
  );
  lines.push(
    `Evidence Package. The SGTX Platform shall, upon request, generate an Evidence Package containing the full Contract, all signatures, all amendments, all USTN-tracked events, the Loom hash chain, and the Governor decision logs. The Evidence Package shall be admissible as evidence in any court or arbitral tribunal to the extent permitted by the applicable law, including under Article 9 of the UNCITRAL Model Law on Electronic Commerce and Article 9 of the UNCITRAL Model Law on Electronic Signatures.`,
  );
  return { title: "SGTX Platform Terms", content: lines.join("\n\n") };
}

// ===================== Clause ordering =====================

const CLAUSE_BUILDERS: Array<(ctx: ContractContext) => { title: string; content: string }> = [
  clauseParties,
  clauseDefinitions,
  clauseSalePurchase,
  clausePricePayment,
  clauseIncoterms,
  clauseDeliveryTerms,
  clauseInspection,
  clausePackagingMarking,
  clauseTitleRisk,
  clauseDocumentation,
  clauseInsurance,
  clauseForceMajeure,
  clauseWarranties,
  clauseIntellectualProperty,
  clauseCompliance,
  clauseConfidentiality,
  clauseLiability,
  clauseIndemnification,
  clauseTermination,
  clauseDisputeResolution,
  clauseAssignment,
  clauseNotices,
  clauseEntireAgreement,
  clauseAmendments,
  clauseSeverability,
  clauseWaiver,
  clauseCounterparts,
  clauseThirdPartyRights,
  clauseCorridor,
  clauseSGTXPlatform,
];

// ===================== HTML rendering =====================

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function paragraphsToHtml(text: string): string {
  return text
    .split(/\n\n+/)
    .map((p) => {
      const trimmed = p.trim();
      if (!trimmed) return "";
      // Bullet list (lines starting with • or -)
      if (/^[•\-]\s/m.test(trimmed) && trimmed.split(/\n/).every((l) => /^([•\-]\s|.*)$/.test(l.trim()))) {
        const items = trimmed
          .split(/\n/)
          .map((l) => l.trim())
          .filter((l) => l)
          .map((l) => {
            const m = l.match(/^[•\-]\s+(.*)$/);
            return m ? `<li>${escapeHtml(m[1])}</li>` : `<li>${escapeHtml(l)}</li>`;
          });
        return `<ul>${items.join("")}</ul>`;
      }
      // Multi-line within a paragraph (e.g., party listing)
      const inner = trimmed
        .split(/\n/)
        .map((l) => l.trim())
        .filter((l) => l)
        .join("<br/>");
      return `<p>${escapeHtml(inner).replace(/&lt;br\/&gt;/g, "<br/>")}</p>`;
    })
    .join("");
}

export function renderContractHtml(meta: ContractMetadata, clauses: ContractClause[]): string {
  const css = `
  body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; background: #ffffff; max-width: 850px; margin: 0 auto; padding: 48px 56px; font-size: 11.5pt; line-height: 1.55; }
  .sgtx-header { border-bottom: 3px solid #d4af37; padding-bottom: 18px; margin-bottom: 28px; }
  .sgtx-mark { font-family: 'Helvetica Neue', Arial, sans-serif; letter-spacing: 4px; font-weight: 700; color: #d4af37; font-size: 14pt; }
  .sgtx-tagline { font-family: 'Helvetica Neue', Arial, sans-serif; letter-spacing: 1px; color: #6b6b6b; font-size: 8pt; text-transform: uppercase; margin-top: 4px; }
  h1 { font-size: 19pt; color: #1a1a1a; margin: 28px 0 6px 0; }
  .sub { color: #6b6b6b; font-size: 10pt; margin-bottom: 28px; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 32px; font-size: 9.5pt; font-family: 'Helvetica Neue', Arial, sans-serif; }
  .meta-table td { padding: 6px 10px; border-bottom: 1px solid #e8e8e8; vertical-align: top; }
  .meta-table td.k { color: #6b6b6b; width: 35%; text-transform: uppercase; letter-spacing: 0.5px; font-size: 8.5pt; }
  .meta-table td.v { color: #1a1a1a; font-weight: 600; }
  h2 { font-size: 12pt; color: #1a1a1a; border-left: 4px solid #d4af37; padding-left: 10px; margin-top: 28px; margin-bottom: 10px; }
  h2 .num { color: #d4af37; margin-right: 8px; font-family: 'Helvetica Neue', Arial, sans-serif; }
  p { margin: 8px 0; text-align: justify; }
  ul { margin: 8px 0 8px 0; padding-left: 22px; }
  li { margin: 4px 0; }
  .signature-block { margin-top: 48px; page-break-inside: avoid; }
  .signature-row { display: flex; justify-content: space-between; gap: 48px; margin-top: 24px; }
  .signature-box { flex: 1; border: 1px solid #cccccc; padding: 14px 16px; border-radius: 4px; font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; }
  .signature-box .role { color: #d4af37; text-transform: uppercase; letter-spacing: 1px; font-weight: 700; font-size: 9pt; }
  .signature-box .name { color: #1a1a1a; font-weight: 600; margin-top: 6px; }
  .signature-box .line { margin-top: 36px; border-top: 1px dashed #999999; padding-top: 6px; color: #6b6b6b; font-size: 8pt; }
  .hash-box { margin-top: 36px; background: #f7f5ef; border: 1px solid #e0d9c0; padding: 12px 14px; border-radius: 4px; font-family: 'Courier New', monospace; font-size: 8.5pt; color: #4a4a4a; word-break: break-all; }
  .hash-label { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 8pt; color: #6b6b6b; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px; }
  .footer { margin-top: 48px; border-top: 1px solid #e8e8e8; padding-top: 12px; font-size: 8pt; color: #888; font-family: 'Helvetica Neue', Arial, sans-serif; text-align: center; }
  @media print { body { padding: 24px 28px; } }
  `.trim();

  const metaRows: [string, string][] = [
    ["Contract ID", meta.contractId],
    ["Version", `v${meta.contractVersion}`],
    ["USTN", meta.ustn],
    ["Contract Type", CONTRACT_TYPE_LABELS[meta.contractType]],
    ["Governing Law", GOVERNING_LAW_LABELS[meta.governingLaw]],
    ["Arbitration Rules", ARBITRATION_LABELS[meta.arbitrationClause]],
    ["Seat of Arbitration", ARBITRATION_SEAT_LABELS[meta.arbitrationSeat]],
    ["Language", LANGUAGE_LABELS[meta.language]],
    ["Seller", `${meta.seller.legalName} — ${meta.seller.gtid} (${meta.seller.country})`],
    ["Buyer", `${meta.buyer.legalName} — ${meta.buyer.gtid} (${meta.buyer.country})`],
    ["Commodity", meta.commodity],
    ["Incoterm", meta.incoterm],
    ["Contract Price", fmtMoney(meta.tradeValueUsd, meta.currency)],
    ["Generated At", meta.generatedAt],
  ];

  const metaHtml = `<table class="meta-table">${metaRows
    .map(
      ([k, v]) =>
        `<tr><td class="k">${escapeHtml(k)}</td><td class="v">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;

  const clausesHtml = clauses
    .map(
      (c) =>
        `<h2><span class="num">${String(c.number).padStart(2, "0")}</span>${escapeHtml(
          c.title,
        )}</h2>${paragraphsToHtml(c.content)}`,
    )
    .join("");

  const sigHtml = `
  <div class="signature-block">
    <h2 style="border-left:none;padding-left:0;">Execution by the Parties</h2>
    <p>This Contract is executed by the Parties by Qualified Electronic Signature (QES) through the SGTX Platform. The electronic signatures below have the same legal effect as handwritten signatures.</p>
    <div class="signature-row">
      <div class="signature-box">
        <div class="role">Seller</div>
        <div class="name">${escapeHtml(meta.seller.legalName)}</div>
        <div>GTID: ${escapeHtml(meta.seller.gtid)}</div>
        <div class="line">Signature: ___________________________</div>
        <div>Date: ___________________________</div>
      </div>
      <div class="signature-box">
        <div class="role">Buyer</div>
        <div class="name">${escapeHtml(meta.buyer.legalName)}</div>
        <div>GTID: ${escapeHtml(meta.buyer.gtid)}</div>
        <div class="line">Signature: ___________________________</div>
        <div>Date: ___________________________</div>
      </div>
    </div>
    <div class="hash-box">
      <div class="hash-label">SHA-256 Document Integrity Hash (recorded on SGTX Loom hash chain)</div>
      ${escapeHtml(meta.hashSha256)}
    </div>
  </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${escapeHtml(meta.contractId)} — SGTX International Trade Contract</title>
<style>${css}</style>
</head>
<body>
  <div class="sgtx-header">
    <div class="sgtx-mark">SGTX</div>
    <div class="sgtx-tagline">Sovereign Governed Trade Execution</div>
  </div>
  <h1>International Sale Contract</h1>
  <div class="sub">${escapeHtml(CONTRACT_TYPE_LABELS[meta.contractType])}</div>
  ${metaHtml}
  ${clausesHtml}
  ${sigHtml}
  <div class="footer">This Contract was generated by the SGTX Contract Engine on ${escapeHtml(
    meta.generatedAt,
  )}. SGTX is a non-custodial, AI-governed sovereign trade execution platform and acts solely as a witness to this Contract. The SHA-256 hash above is recorded on the SGTX Loom hash chain and may be tendered as evidence of integrity in any competent forum.</div>
</body>
</html>`;
}

// ===================== Main entry: generateContract =====================

export async function generateContract(input: GenerateContractInput): Promise<GeneratedContract> {
  const { ustn } = input;
  if (!ustn) throw new Error("ustn is required");

  const trade = await freshDb.trade.findUnique({
    where: { ustn },
    include: {
      buyer: true,
      seller: true,
      shipments: true,
      containers: true,
      documents: true,
      documentRequirements: true,
      invoices: true,
      labTests: true,
      qcInspections: true,
      customsDecls: true,
    },
  });
  if (!trade) throw new Error(`Trade ${ustn} not found`);
  if (!trade.buyer) throw new Error(`Buyer tenant not resolved for trade ${ustn}`);
  if (!trade.seller) throw new Error(`Seller tenant not resolved for trade ${ustn}`);

  const governingLaw: GoverningLaw = (input.governingLaw as GoverningLaw) || "EGYPTIAN_LAW";
  const arbitrationClause: ArbitrationRules = (input.arbitrationClause as ArbitrationRules) || "CRCICA";
  const arbitrationSeat: ArbitrationSeat = (input.arbitrationSeat as ArbitrationSeat) || "Cairo";
  const language: ContractLanguage = (input.language as ContractLanguage) || "en";
  const contractType: ContractType = inferContractType(trade);

  // Determine next contractId (today's first contract = SC-YYYYMMDD-NNN)
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(
    today.getDate(),
  ).padStart(2, "0")}`;
  const existingToday = await freshDb.tradeContract.findMany({
    where: { contractId: { startsWith: `SC-${ymd}-` } },
    select: { contractId: true },
  });
  const seq = String(existingToday.length + 1).padStart(3, "0");
  const contractId = `SC-${ymd}-${seq}`;

  // Version: count existing contracts for this trade
  const existingForTrade = await freshDb.tradeContract.findMany({
    where: { tradeId: trade.id },
    select: { contractVersion: true },
  });
  const contractVersion = existingForTrade.length + 1;

  const ctx: ContractContext = {
    trade,
    buyer: trade.buyer,
    seller: trade.seller,
    shipments: trade.shipments || [],
    containers: trade.containers || [],
    documents: trade.documents || [],
    documentRequirements: trade.documentRequirements || [],
    invoices: trade.invoices || [],
    labTests: trade.labTests || [],
    qcInspections: trade.qcInspections || [],
    customsDecls: trade.customsDecls || [],
    governingLaw,
    arbitrationClause,
    arbitrationSeat,
    language,
    contractType,
    contractId,
    contractVersion,
    generatedAt: today.toLocaleString("en-GB", { dateStyle: "long", timeStyle: "short" }),
  };

  // Build all 30 clauses
  const clauses: ContractClause[] = CLAUSE_BUILDERS.map((builder, idx) => {
    const built = builder(ctx);
    return { number: idx + 1, title: built.title, content: built.content };
  });

  // Build metadata
  const metadata: ContractMetadata = {
    contractId,
    ustn: trade.ustn,
    tradeId: trade.id,
    contractVersion,
    contractType,
    governingLaw,
    arbitrationClause,
    arbitrationSeat,
    language,
    generatedAt: ctx.generatedAt,
    seller: {
      gtid: trade.seller.gtid,
      legalName: trade.seller.legalName,
      country: trade.seller.country,
      city: trade.seller.city,
    },
    buyer: {
      gtid: trade.buyer.gtid,
      legalName: trade.buyer.legalName,
      country: trade.buyer.country,
      city: trade.buyer.city,
    },
    commodity: trade.commodity,
    incoterm: trade.incoterm,
    tradeValueUsd: trade.tradeValueUsd,
    currency: trade.currency,
    hashSha256: "", // filled after hash computed
  };

  // Build JSON representation
  const contractJsonObj = {
    schema: "sgtx.trade-contract.v1",
    contractId,
    ustn: trade.ustn,
    tradeId: trade.id,
    contractVersion,
    contractType,
    governingLaw,
    arbitrationClause,
    arbitrationSeat,
    language,
    generatedAt: ctx.generatedAt,
    parties: {
      seller: metadata.seller,
      buyer: metadata.buyer,
    },
    commodity: {
      description: trade.commodity,
      hsCode: trade.commodityHs,
      netWeightKg: trade.netWeightKg,
      grossWeightKg: trade.grossWeightKg,
      containerCount: trade.containerCount,
      multiShipment: trade.multiShipment,
      coldChain: trade.coldChain,
    },
    commercial: {
      tradeValueUsd: trade.tradeValueUsd,
      currency: trade.currency,
      incoterm: trade.incoterm,
      paymentTerms: trade.paymentTerms,
      paymentTermsDetails: trade.paymentTermsDetails,
      paymentTiming: trade.paymentTiming,
      creditPeriod: trade.creditPeriod,
      bankInstrument: trade.bankInstrument,
    },
    logistics: {
      originPort: trade.originPort,
      destPort: trade.destPort,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      transportMode: trade.transportMode,
      equipmentType: trade.equipmentType,
      transitTimeDays: trade.transitTimeDays,
      earliestDeliveryDate: trade.earliestDeliveryDate,
      preferredDeliveryDate: trade.preferredDeliveryDate,
      latestDeliveryDate: trade.latestDeliveryDate,
    },
    insurance: {
      requirement: trade.insuranceRequirement,
      type: trade.insuranceType,
      responsibleParty: trade.insuranceResponsibleParty,
      coveragePct: trade.insuranceCoveragePct,
      currency: trade.insuranceCurrency,
    },
    clauses,
    compliance: {
      cisgApplicable: governingLaw === "CISG",
      incoterms2020: true,
      ucp600: (trade.paymentTerms || "").toUpperCase() === "LC",
      ismCode: contractType === "RORO_CONTRACT",
      iccForceMajeureClause2020: true,
      iccHardshipClause2020: true,
      uncitralModelLawETrustRecords: trade.originalDocsRequired === false,
      sanctionsScreening: true,
      amlCft: true,
      pdplOrGdpr: true,
    },
  };

  const contractJsonStr = JSON.stringify(contractJsonObj, null, 2);
  const hashSha256 = "sha256:" + crypto.createHash("sha256").update(contractJsonStr).digest("hex");
  metadata.hashSha256 = hashSha256;

  const contractHtml = renderContractHtml(metadata, clauses);

  return {
    contractId,
    ustn: trade.ustn,
    tradeId: trade.id,
    contractVersion,
    contractType,
    governingLaw,
    arbitrationClause,
    arbitrationSeat,
    language,
    hashSha256,
    contractJson: contractJsonStr,
    contractHtml,
    clauses,
    metadata,
  };
}

// ===================== Amend helper =====================

export async function amendContract(
  contractId: string,
  overrides: {
    governingLaw?: GoverningLaw;
    arbitrationClause?: ArbitrationRules;
    arbitrationSeat?: ArbitrationSeat;
    language?: ContractLanguage;
  },
): Promise<GeneratedContract> {
  const existing = await freshDb.tradeContract.findUnique({
    where: { contractId },
  });
  if (!existing) throw new Error(`Contract ${contractId} not found`);
  return generateContract({
    ustn: existing.ustn,
    governingLaw: overrides.governingLaw ?? (existing.governingLaw as GoverningLaw),
    arbitrationClause: overrides.arbitrationClause ?? (existing.arbitrationClause as ArbitrationRules),
    arbitrationSeat: overrides.arbitrationSeat ?? (existing.arbitrationSeat as ArbitrationSeat),
    language: overrides.language ?? (existing.language as ContractLanguage),
  });
}
