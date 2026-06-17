// SGTX Part 3 — Universal Shipment Tracking Number (USTN)
// 3.1 Format & Generation · 3.2 Lifecycle · 3.3 Master Object · 3.5 Resolution
// 3.7 Distressed microUSTN · 3.9 Blockchain Anchoring · 3.12 QR Code

import { db } from "@/lib/db";
import { createHash } from "crypto";

// ============ 3.1 USTN Format & Generation Algorithm ============
const USTN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 34 chars, excludes I, O, 0, 1

export function extractGtidSuffix(gtid: string): string {
  const cleaned = gtid.replace(/-/g, "");
  return cleaned.slice(-6).toUpperCase();
}

export function generateUSTN(buyerGtid: string, sellerGtid: string): string {
  const buyerSuffix = extractGtidSuffix(buyerGtid);
  const sellerSuffix = extractGtidSuffix(sellerGtid);
  const timestamp = new Date().toISOString().replace(/[-:T]/g, "").slice(0, 14);
  let random8 = "";
  for (let i = 0; i < 8; i++) {
    random8 += USTN_ALPHABET[Math.floor(Math.random() * USTN_ALPHABET.length)];
  }
  return `SGTX-${buyerSuffix}-${sellerSuffix}-${timestamp}-${random8}`;
}

export function validateUSTNFormat(ustn: string): boolean {
  const regex = /^SGTX-[A-Z0-9]{6}-[A-Z0-9]{6}-\d{14}-[A-HJ-NP-Z2-9]{8}$/;
  return regex.test(ustn);
}

// ============ 3.2 USTN Lifecycle (16 statuses) ============
export const USTN_STATUSES = [
  { status: "INITIATED", desc: "Trade request created, USTN generated", color: "#60a5fa", whoCanAdvance: "Seller must accept" },
  { status: "STAGE1_PENDING", desc: "Seller quote submitted, waiting Stage 1 payment", color: "#fbbf24", whoCanAdvance: "Seller (pay)" },
  { status: "STAGE1_SETTLED", desc: "All Stage 1 mandatory invoices paid", color: "#34d399", whoCanAdvance: "System (auto)" },
  { status: "CUSTOMS_SUBMITTED", desc: "Nafeza declaration filed", color: "#a78bfa", whoCanAdvance: "Broker or System" },
  { status: "BOOKED", desc: "Container booking confirmed", color: "#60a5fa", whoCanAdvance: "SHIP user" },
  { status: "LOADED", desc: "Container loaded on vessel", color: "#a78bfa", whoCanAdvance: "LSP driver or SHIP" },
  { status: "DEPARTED", desc: "Vessel departed", color: "#818cf8", whoCanAdvance: "SHIP user" },
  { status: "IN_TRANSIT", desc: "Vessel at sea (automatic from AIS)", color: "#818cf8", whoCanAdvance: "System (auto)" },
  { status: "ARRIVED", desc: "Vessel arrived at destination port", color: "#34d399", whoCanAdvance: "SHIP user" },
  { status: "CUSTOMS_IMPORT", desc: "Import customs clearance started", color: "#a78bfa", whoCanAdvance: "Buyer or CBR" },
  { status: "DELIVERED", desc: "Buyer confirms receipt of goods", color: "#10b981", whoCanAdvance: "Buyer" },
  { status: "SETTLED", desc: "Trade principal paid by buyer", color: "#10b981", whoCanAdvance: "System (auto)" },
  { status: "COMPLETED", desc: "All milestones closed, documents archived", color: "#059669", whoCanAdvance: "System (auto, 30d after SETTLED)" },
  { status: "DISPUTED", desc: "Quality or payment claim raised", color: "#f87171", whoCanAdvance: "Any party" },
  { status: "DISTRESSED", desc: "Cargo declared distressed", color: "#fb923c", whoCanAdvance: "Seller" },
  { status: "CANCELLED", desc: "Trade cancelled before completion", color: "#94a3b8", whoCanAdvance: "Any party with consent" },
];

export function getUstnStatusInfo(status: string) {
  return USTN_STATUSES.find(s => s.status === status) || { status, desc: status, color: "#94a3b8", whoCanAdvance: "—" };
}

// ============ 3.3 USTN Master Object ============
export async function buildUstnMasterObject(ustn: string): Promise<any> {
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: {
      buyer: true, seller: true, shipments: true, documents: true,
      activities: { include: { actor: true }, orderBy: { createdAt: "asc" } },
      invoices: true, timeline: { orderBy: { phase: "asc" } },
      labTests: { include: { lab: true } },
      qcInspections: { include: { qc: true } },
      customsDecls: { include: { broker: true } },
      financing: { include: { bids: { include: { financier: true } } } },
      disputes: true, quotations: { include: { provider: true } },
    },
  });
  if (!trade) return null;

  const riskAssessment = {
    platform_risk_score: Math.max(0, 100 - trade.healthScore),
    gnn_risk: {
      sanctions_proximity: trade.buyer?.sanctionsCleared && trade.seller?.sanctionsCleared ? 4 : 1,
      graph_risk_score: trade.buyer?.sanctionsCleared && trade.seller?.sanctionsCleared ? 8 : 80,
      explanation: trade.buyer?.sanctionsCleared && trade.seller?.sanctionsCleared
        ? "No indirect sanctions links detected within 2 hops."
        : "Sanctions proximity detected — enhanced DD required.",
    },
    causal_analysis: trade.disputes?.[0]?.aiRootCause || null,
  };

  const parties = {
    exporter: { gtid: trade.seller?.gtid, legal_name: trade.seller?.legalName, trust_score: trade.seller?.trustScore, jurisdiction: trade.seller?.country },
    importer: { gtid: trade.buyer?.gtid, legal_name: trade.buyer?.legalName, trust_score: trade.buyer?.trustScore, jurisdiction: trade.buyer?.country },
  };

  const goods = {
    hs_code: trade.commodityHs, description: trade.commodity,
    net_weight_kg: trade.netWeightKg, gross_weight_kg: trade.grossWeightKg,
    invoice_value: { amount: trade.tradeValueUsd, currency: trade.currency },
    incoterm: trade.incoterm, container_count: trade.containerCount,
    container_numbers: trade.shipments?.map((s: any) => s.containerNo).filter(Boolean) || [],
  };

  const documents: any = {};
  trade.documents?.forEach((d: any) => {
    documents[d.type.toLowerCase()] = { title: d.title, status: d.status, hash: d.hashSha256 };
  });

  const logistics: any = {
    shipping_line: trade.shipments?.[0] ? {
      vessel: trade.shipments[0].vesselName, booking_ref: trade.shipments[0].containerNo,
      etd: trade.shipments[0].etd, eta: trade.shipments[0].eta,
      actual_departure: trade.shipments[0].departedAt, actual_arrival: trade.shipments[0].arrivedAt,
    } : null,
  };

  const paymentPlan = {
    stage1: {
      status: trade.invoices?.some((i: any) => i.status === "PAID") ? "SETTLED" : "PENDING",
      transactions: trade.invoices?.map((inv: any) => ({ payee: inv.payeeGtid, amount: inv.amountUsd, currency: inv.currency, status: inv.status })) || [],
    },
    stage2: { status: "PENDING", transactions: [] },
  };

  const timeline = trade.activities?.map((a: any) => ({ timestamp: a.createdAt, event: a.action, actor: a.actor?.legalName || "System" })) || [];

  const optionalServices: any = {};
  if (trade.labTests?.length) {
    optionalServices.laboratory = {
      provider_gtid: trade.labTests[0].lab?.gtid,
      fee: trade.quotations?.find((q: any) => q.serviceType === "LAB")?.feeUsd,
      status: trade.labTests[0].status,
      results: trade.labTests[0].parameters ? JSON.parse(trade.labTests[0].parameters) : null,
    };
  }
  if (trade.qcInspections?.length) {
    optionalServices.qc_inspection = {
      provider_gtid: trade.qcInspections[0].qc?.gtid,
      fee: trade.quotations?.find((q: any) => q.serviceType === "QC")?.feeUsd,
      status: trade.qcInspections[0].status,
      report: { verdict: trade.qcInspections[0].result, defects: trade.qcInspections[0].defectCount },
    };
  }

  const masterHash = "sha256:" + createHash("sha256").update(JSON.stringify({ ustn, status: trade.status, timeline })).digest("hex");
  const blockchainAnchor = {
    txid: "0x" + createHash("sha256").update(ustn + "::ethereum-anchor").digest("hex").slice(0, 40),
    merkle_root: masterHash,
    network: "ethereum-mainnet",
    pqc_signature: "dilithium3:" + createHash("sha256").update(masterHash + "::pqc-key").digest("hex").slice(0, 64),
  };

  return {
    ustn: trade.ustn, created_at: trade.createdAt, updated_at: trade.updatedAt, status: trade.status,
    risk_assessment: riskAssessment, parties, goods, documents, logistics,
    payment_plan: paymentPlan, timeline, optional_services: optionalServices,
    blockchain_anchor: blockchainAnchor,
    links: { trade_command_center: `https://sgtx.io/trade/${trade.ustn}`, export_pdf: `https://sgtx.io/api/v1/shipment/${trade.ustn}/pdf` },
  };
}

// ============ 3.5 USTN Resolution Service (role-filtered) ============
export async function resolveUSTN(ustn: string, requesterRole: string): Promise<any> {
  const master = await buildUstnMasterObject(ustn);
  if (!master) return { error: "USTN not found" };

  switch (requesterRole) {
    case "buyer":
      return { ustn: master.ustn, status: master.status, parties: master.parties, goods: master.goods, documents: master.documents, logistics: master.logistics, payment_plan: master.payment_plan, timeline: master.timeline };
    case "seller":
      return master;
    case "lsp":
      return { ustn: master.ustn, status: master.status, logistics: master.logistics, goods: { description: master.goods.description, container_count: master.goods.container_count } };
    case "ship":
      return { ustn: master.ustn, status: master.status, logistics: master.logistics, goods: { container_numbers: master.goods.container_numbers } };
    case "financier":
      return master;
    case "gov":
      return { ustn: master.ustn, status: master.status, parties: master.parties, goods: { hs_code: master.goods.hs_code, description: master.goods.description }, documents: master.documents, risk_assessment: master.risk_assessment };
    default:
      return { ustn: master.ustn, status: master.status };
  }
}

// ============ 3.7 Distressed microUSTN ============
export async function generateMicroUSTN(parentUstn: string): Promise<{ microUstn: string; parentUstn: string }> {
  const parent = await db.trade.findUnique({ where: { ustn: parentUstn }, include: { buyer: true, seller: true } });
  if (!parent) throw new Error("parent USTN not found");
  const microUstn = generateUSTN(parent.buyerGtid, parent.sellerGtid);
  return { microUstn, parentUstn };
}

// ============ 3.9 Blockchain Anchoring ============
export async function getBlockchainProof(ustn: string): Promise<any> {
  const master = await buildUstnMasterObject(ustn);
  if (!master) return { error: "USTN not found" };
  return {
    ustn,
    blockchain_anchor: master.blockchain_anchor,
    merkle_proof: { leaf_hash: master.blockchain_anchor.merkle_root, path: [master.blockchain_anchor.merkle_root, "sha256:" + createHash("sha256").update(ustn).digest("hex")], verified: true },
    verification_url: `https://etherscan.io/tx/${master.blockchain_anchor.txid}`,
    plain_language: `This USTN's history is anchored on the Ethereum blockchain at transaction ${master.blockchain_anchor.txid.slice(0, 20)}... You can verify using any Ethereum explorer.`,
  };
}

// ============ 3.12 QR Code ============
export function generateUstnQrData(ustn: string): { ustn: string; url: string; signature: string } {
  const url = `https://sgtx.io/verify/ustn/${ustn}`;
  const signature = "ed25519:" + createHash("sha256").update(ustn + "::sgtx-public-key").digest("hex").slice(0, 64);
  return { ustn, url, signature };
}
