// SGTX Phase 4 — Universal Trade Finance (Blueprint 3B.5)
// Non-custodial, full-disclosure financing with co-financing, DeFi risk oracles,
// 0.25% fee deducted via PSP split, automated repayment monitoring.

import { db } from "@/lib/db";
import crypto from "crypto";

export const FINANCING_FEE_RATE = 0.0025; // 0.25% flat
export const DEFAULT_BIDDING_WINDOW_HOURS = 48;
export const MIN_QUALIFIED_BIDS = 2;
export const APR_DEVIATION_WARN_PCT = 50; // warn if bid APR deviates > 50% from benchmark
export const DEFICIT_PROTOCOL_MIN_RISK_SCORE = 60;
export const STABLECOIN_DEPEG_WARN_PCT = 0.5;
export const STABLECOIN_DEPEG_FREEZE_PCT = 2.0;
export const LIQUIDATION_PREDICT_HF_THRESHOLD = 1.2;

export const FINANCING_TYPE_LABELS: Record<string, string> = {
  PRE_SHIPMENT: "Pre-Shipment",
  POST_SHIPMENT: "Post-Shipment",
  INVOICE_FINANCING: "Invoice Financing",
  STRUCTURED: "Structured",
};

export const SETTLEMENT_LABELS: Record<string, string> = {
  BANK_TRANSFER: "Bank Transfer",
  STABLECOIN: "Stablecoin (USDC/USDT)",
  DEFI_PROTOCOL: "DeFi Protocol",
};

export const COLLATERAL_LABELS: Record<string, string> = {
  GOODS: "Goods",
  WAREHOUSE_RECEIPT: "Warehouse Receipt",
  RECEIVABLES: "Receivables",
  NONE: "None",
};

export const WITNESS_CLAUSE = `The parties acknowledge that SGTX Platform has facilitated this financing arrangement as a non-custodial witness. The platform's financing service fee of 0.25% of the financed amount (calculated as [amount]) is payable exclusively by the borrower and shall be deducted from the disbursed principal. The platform's signature below serves as evidence of its role as witness and its right to collect the fee as specified. The platform does not guarantee repayment and holds no responsibility for the financier's or borrower's obligations.`;

// ============ 3B.5.1: Financing Request Validation (G4U1) ============
export function validateFinancingRequest(input: {
  trade: any;
  borrowerGtid: string;
  amountUsd: number;
  tenorDays: number;
  traderMode: string;
  financingType: string;
}): { ok: true } | { ok: false; reason: string; code: string } {
  // Trade must be LOCKED (or shipment locked for multiship)
  const allowedStatuses = ["LOCKED", "IN_EXECUTION", "SETTLED"];
  if (!allowedStatuses.includes(input.trade.status)) {
    return { ok: false, code: "G4U1_NOT_LOCKED", reason: `Trade status is ${input.trade.status}; must be LOCKED before financing.` };
  }
  // SGTX fee must be paid (use sgtxFeeUsd presence as proxy)
  if (!input.trade.sgtxFeeUsd || input.trade.sgtxFeeUsd <= 0) {
    return { ok: false, code: "G4U1_FEE_UNPAID", reason: "SGTX trade fee must be paid before financing." };
  }
  // Trader mode check (seller for pre-shipment, buyer for post-shipment)
  if (input.financingType === "PRE_SHIPMENT" && input.traderMode !== "SELL" && input.traderMode !== "DUAL") {
    return { ok: false, code: "G4U1_WRONG_MODE", reason: "Pre-shipment financing requires SELL or DUAL mode." };
  }
  if (input.financingType === "POST_SHIPMENT" && input.traderMode !== "BUY" && input.traderMode !== "DUAL") {
    return { ok: false, code: "G4U1_WRONG_MODE", reason: "Post-shipment financing requires BUY or DUAL mode." };
  }
  // Borrower must be either buyer or seller of trade
  if (input.borrowerGtid !== input.trade.sellerGtid && input.borrowerGtid !== input.trade.buyerGtid) {
    return { ok: false, code: "G4U1_NOT_PARTY", reason: "Borrower must be a party to the trade." };
  }
  // Amount must be positive
  if (!(input.amountUsd > 0)) {
    return { ok: false, code: "G4U1_AMOUNT", reason: "Requested amount must be positive." };
  }
  // Tenor at least 1 day
  if (!(input.tenorDays >= 1)) {
    return { ok: false, code: "G4U1_TENOR", reason: "Tenor must be at least 1 day." };
  }
  return { ok: true };
}

// ============ 3B.5.2: AI Credit Intelligence (A2 — simulated XGBoost) ============
export interface CreditIntelligence {
  creditScore: number;       // 0-100
  defaultProbability: number; // 0-100%
  recommendedLtv: number;     // 0-100
  signals: {
    trade_performance: { on_time_payments: number; dispute_rate: number; doc_accuracy: number };
    corporate: { ubo_structure: string; sanctions_proximity: string; pep_exposure: string; news_sentiment: string };
    shipment_specific: { route_risk: string; carrier_reliability: string; perishability: string };
    market: { commodity_trend: string; country_risk: string };
    behavioural: { responsiveness: string; negotiation_style: string };
    multishipment?: { prior_shipments_in_contract: number; performance: string };
  };
  narrative: string;
  recommendation: string; // advisory note for borrower
}

export async function computeCreditIntelligence(borrowerGtid: string, trade: any): Promise<CreditIntelligence> {
  // Pull borrower historical performance from SGTX tables (200+ signals — sampled here)
  const [tradesAsBuyer, tradesAsSeller, financingHistory, disputeHistory] = await Promise.all([
    db.trade.findMany({ where: { buyerGtid: borrowerGtid }, select: { id: true, status: true, healthScore: true } }),
    db.trade.findMany({ where: { sellerGtid: borrowerGtid }, select: { id: true, status: true, healthScore: true } }),
    db.financingRequest.findMany({ where: { borrowerGtid: borrowerGtid }, include: { repayments: true } }),
    db.dispute.findMany({ where: { filedByGtid: borrowerGtid }, select: { id: true, status: true } }),
  ]);
  const tenant = await db.tenant.findUnique({ where: { gtid: borrowerGtid } });
  const allTrades = [...tradesAsBuyer, ...tradesAsSeller];
  const settledTrades = allTrades.filter((t) => t.status === "SETTLED").length;
  const onTimePayments = financingHistory.filter((f) => f.status === "REPAID").length;
  const disputeRate = allTrades.length > 0 ? disputeHistory.length / allTrades.length : 0;
  const avgHealth = allTrades.length > 0 ? allTrades.reduce((s, t) => s + (t.healthScore || 0), 0) / allTrades.length : 75;

  // Credit score formula (XGBoost-style blend)
  const trustScore = tenant?.trustScore ?? 70;
  const baseScore = Math.min(100, Math.round(
    0.35 * trustScore +
    0.20 * (settledTrades * 5) +
    0.15 * (onTimePayments * 8) +
    0.20 * avgHealth +
    0.10 * (1 - disputeRate) * 100
  ));
  const creditScore = Math.max(20, Math.min(100, baseScore));

  // Default probability (inverse of credit score with shipment-specific modifiers)
  let baseProb = (100 - creditScore) / 2;
  if (trade.coldChain) baseProb += 1.5; // perishable risk
  if (trade.multiShipment) baseProb -= 1.0; // diversified
  if ((tenant?.country || "") === "EG") baseProb += 0.5; // STANDARD tier country
  if ((tenant?.country || "") === "DE") baseProb -= 1.0; // FULL tier
  const defaultProbability = Math.max(0.5, Math.min(95, +(baseProb).toFixed(2)));

  // Recommended LTV (perishability + jurisdiction + default history)
  let recLtv = 75;
  if (trade.coldChain) recLtv -= 5;
  if (defaultProbability > 10) recLtv -= 5;
  if (defaultProbability > 15) recLtv -= 10;
  recLtv = Math.max(40, Math.min(85, recLtv));

  return {
    creditScore,
    defaultProbability,
    recommendedLtv: recLtv,
    signals: {
      trade_performance: {
        on_time_payments: onTimePayments,
        dispute_rate: +(disputeRate.toFixed(3)),
        doc_accuracy: avgHealth / 100,
      },
      corporate: {
        ubo_structure: tenant?.kybTier && tenant.kybTier >= 2 ? "Verified, clean" : "Single-tier",
        sanctions_proximity: tenant?.sanctionsCleared ? "LOW" : "ELEVATED",
        pep_exposure: "NONE",
        news_sentiment: "NEUTRAL-POSITIVE",
      },
      shipment_specific: {
        route_risk: trade.coldChain ? "MEDIUM (cold-chain)" : "LOW",
        carrier_reliability: "VERIFIED",
        perishability: trade.coldChain ? "HIGH" : "LOW",
      },
      market: {
        commodity_trend: "+1.8% YoY",
        country_risk: tenant?.country || "N/A",
      },
      behavioural: {
        responsiveness: "FAST",
        negotiation_style: "COOPERATIVE",
      },
      ...(trade.multiShipment ? {
        multishipment: {
          prior_shipments_in_contract: 0,
          performance: "INSUFFICIENT_HISTORY",
        }
      } : {}),
    },
    narrative: `Borrower ${tenant?.legalName} shows ${creditScore >= 80 ? "strong" : creditScore >= 60 ? "moderate" : "elevated-risk"} credit profile with ${onTimePayments} prior on-time repayments, ${(disputeRate * 100).toFixed(1)}% dispute rate, and average trade health ${avgHealth.toFixed(0)}/100. Recommended LTV ${recLtv}%.`,
    recommendation: defaultProbability > 15
      ? `Default probability ${defaultProbability}% exceeds 15% threshold. Advisory: reduce facility size or require additional collateral.`
      : `Credit profile supports financing up to ${recLtv}% LTV. Advisory only — borrower may override.`,
  };
}

// ============ 3B.5.3: RFQ Broadcast — preference matching engine ============
export interface FinancierMatch {
  financierGtid: string;
  legalName: string;
  matchScore: number;       // 0-100
  matchReasons: string[];
  preferenceId: string;
}

export async function findMatchingFinanciers(request: {
  borrowerGtid: string;
  borrowerCountry: string;
  borrowerTrustScore: number;
  totalTradeValue: number;
  amountUsd: number;
  financingType: string;
  preferredSettlement: string;
  commodityHs: string;
}): Promise<FinancierMatch[]> {
  const preferences = await db.financierPreference.findMany();
  const financierGtids = preferences.map((p) => p.financierGtid);
  const financiers = await db.tenant.findMany({ where: { gtid: { in: financierGtids }, type: { in: ["BANK", "PFI"] }, lifecycleState: "VERIFIED" } });
  const financierMap = new Map(financiers.map((f) => [f.gtid, f]));

  const matches: FinancierMatch[] = [];
  for (const pref of preferences) {
    const financier = financierMap.get(pref.financierGtid);
    if (!financier) continue;

    const acceptedCountries: string[] = JSON.parse(pref.acceptedBorrowerCountries || "[]");
    const financingTypes: string[] = JSON.parse(pref.preferredFinancingTypes || "[]");
    const settlementMethods: string[] = JSON.parse(pref.preferredSettlementMethods || "[]");
    const excludedHs: string[] = JSON.parse(pref.excludedCommodities || "[]");
    const geoList: string[] = pref.geographicList ? JSON.parse(pref.geographicList) : [];

    const reasons: string[] = [];
    let score = 100;

    // Hard filters (block)
    if (!acceptedCountries.includes(request.borrowerCountry)) continue;
    if (request.borrowerTrustScore < pref.minTrustScore) continue;
    if (request.totalTradeValue < pref.minTradeValue) continue;
    if (request.amountUsd > pref.maxFinancedPerRequest) continue;
    if (!financingTypes.includes(request.financingType)) continue;
    if (excludedHs.some((h) => request.commodityHs.startsWith(h))) continue;
    if (pref.geographicMode === "ACCEPT_ONLY" && !geoList.includes(request.borrowerCountry)) continue;
    if (pref.geographicMode === "ALL_EXCEPT" && geoList.includes(request.borrowerCountry)) continue;

    // Settlement method: at least one of borrower's accepted must match financier's preferred
    if (!settlementMethods.includes(request.preferredSettlement)) {
      if (!settlementMethods.includes("BANK_TRANSFER")) continue;
      score -= 10;
      reasons.push("Settlement: partial match (bank transfer fallback)");
    } else {
      reasons.push(`Settlement ${request.preferredSettlement} matches preference`);
    }

    // Soft scoring
    if (request.borrowerTrustScore >= pref.minTrustScore + 15) { score += 4; reasons.push("Borrower trust exceeds min by 15+"); }
    if (request.amountUsd <= pref.maxFinancedPerRequest * 0.5) { score += 3; reasons.push("Amount within comfortable tranche size"); }
    if (financier.type === "BANK") { score += 2; reasons.push("Bank-tier financier"); }
    if (financier.kybTier === 3) { score += 2; reasons.push("Tier-3 KYB financier"); }

    score = Math.max(50, Math.min(100, score));
    if (reasons.length === 0) reasons.push("All base preferences match");

    matches.push({
      financierGtid: financier.gtid,
      legalName: financier.legalName,
      matchScore: score,
      matchReasons: reasons,
      preferenceId: pref.id,
    });
  }

  matches.sort((a, b) => b.matchScore - a.matchScore);
  return matches;
}

// ============ 3B.5.5: Bid Validation (G4U4, G4U5) ============
export function validateBid(input: {
  amountOffered: number;
  apr: number;
  benchmarkApr: number;
  settlementMethod: string;
  borrowerSettlement: string;
  isDeFi: boolean;
  protocolRiskScore?: number;
  defiRiskAcknowledgedAt?: Date | null;
  minTrancheSize: number;
  requestedAmount: number;
}): { ok: true } | { ok: false; reason: string; code: string; warning?: boolean } {
  if (input.amountOffered < input.minTrancheSize) {
    return { ok: false, code: "BID_TRANCHE", reason: `Amount offered below minimum tranche size $${input.minTrancheSize}.` };
  }
  if (input.amountOffered > input.requestedAmount) {
    return { ok: false, code: "BID_OVER", reason: "Amount offered exceeds requested amount P." };
  }
  const acceptable = input.settlementMethod === input.borrowerSettlement || input.settlementMethod === "BANK_TRANSFER";
  if (!acceptable) {
    return { ok: false, code: "BID_SETTLE", reason: "Settlement method must match borrower's preferred or be bank transfer." };
  }
  if (input.isDeFi) {
    if (!input.defiRiskAcknowledgedAt) {
      return { ok: false, code: "BID_DEFI_ACK", reason: "DeFi Plain-Language Risk Summary must be acknowledged before bid submission." };
    }
    if ((input.protocolRiskScore ?? 0) < DEFICIT_PROTOCOL_MIN_RISK_SCORE) {
      return { ok: false, code: "BID_DEFI_RISK", reason: `DeFi protocol risk score must be ≥ ${DEFICIT_PROTOCOL_MIN_RISK_SCORE}.` };
    }
  }
  return { ok: true };
}

// ============ 3B.5.8: Co-Financing Acceptance (G4U4a) ============
export function validateAcceptedBids(input: {
  requestedAmount: number;
  selectedBids: { bidId: string; amountOffered: number }[];
  existingBids: { bidId: string; amountOffered: number; status: string }[];
}): { ok: true; totalAccepted: number } | { ok: false; reason: string; code: string } {
  const totalSelected = input.selectedBids.reduce((s, b) => s + b.amountOffered, 0);
  if (totalSelected > input.requestedAmount) {
    return { ok: false, code: "G4U4A_OVER", reason: `Sum of accepted bids ($${totalSelected.toFixed(2)}) exceeds requested amount P ($${input.requestedAmount}).` };
  }
  for (const sel of input.selectedBids) {
    const found = input.existingBids.find((b) => b.bidId === sel.bidId);
    if (!found) return { ok: false, code: "G4U4A_NOT_FOUND", reason: `Bid ${sel.bidId} not found.` };
    if (found.status !== "SUBMITTED") return { ok: false, code: "G4U4A_STATUS", reason: `Bid ${sel.bidId} is not in SUBMITTED state.` };
  }
  return { ok: true, totalAccepted: totalSelected };
}

// ============ 3B.5.9: Financing Agreement Assembly (Witness Clause) ============
export async function assembleFinancingAgreement(requestId: string, acceptedBids: any[]): Promise<{
  agreementId: string;
  masterContractHash: string;
  witnessClauseText: string;
  totalAcceptedAmount: number;
  blendedApr: number;
}> {
  const totalAcceptedAmount = acceptedBids.reduce((s, b) => s + b.amountOffered, 0);
  const blendedApr = acceptedBids.reduce((s, b) => s + b.apr * b.amountOffered, 0) / totalAcceptedAmount;
  const agreementId = `FA-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 9000 + 1000)}`;
  const witnessClause = WITNESS_CLAUSE.replace("[amount]", `$${(totalAcceptedAmount * FINANCING_FEE_RATE).toFixed(2)}`);
  const masterText = JSON.stringify({ agreementId, requestId, acceptedBids, witnessClause, totalAcceptedAmount, blendedApr });
  const masterContractHash = "sha256:" + crypto.createHash("sha256").update(masterText).digest("hex");
  return { agreementId, masterContractHash, witnessClauseText: witnessClause, totalAcceptedAmount, blendedApr: +blendedApr.toFixed(4) };
}

// ============ 3B.5.10: Fee Calculation + PSP Split ============
export function computeFinancingFee(amount: number): { fee: number; borrowerNet: number } {
  const fee = +(amount * FINANCING_FEE_RATE).toFixed(2);
  const borrowerNet = +(amount - fee).toFixed(2);
  return { fee, borrowerNet };
}

export function generatePspSplitReference(annexId: string): string {
  return `PSP-SPLIT-${annexId.slice(-8).toUpperCase()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

// ============ 3B.5.11: Repayment Monitoring ============
export interface RepaymentScheduleEntry {
  dueDate: string;
  principal: number;
  interest: number;
  total: number;
}

export function buildRepaymentSchedule(amountFinanced: number, aprPct: number, tenorDays: number, startDate = new Date()): RepaymentScheduleEntry[] {
  const monthlyRate = aprPct / 100 / 12;
  const months = Math.max(1, Math.ceil(tenorDays / 30));
  const monthlyPayment = monthlyRate > 0
    ? (amountFinanced * monthlyRate * Math.pow(1 + monthlyRate, months)) / (Math.pow(1 + monthlyRate, months) - 1)
    : amountFinanced / months;
  const schedule: RepaymentScheduleEntry[] = [];
  let balance = amountFinanced;
  for (let i = 1; i <= months; i++) {
    const interest = balance * monthlyRate;
    const principal = monthlyPayment - interest;
    balance -= principal;
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    schedule.push({
      dueDate: due.toISOString().slice(0, 10),
      principal: +principal.toFixed(2),
      interest: +interest.toFixed(2),
      total: +monthlyPayment.toFixed(2),
    });
  }
  if (schedule.length > 0) {
    schedule[schedule.length - 1].principal = +(schedule[schedule.length - 1].principal + balance).toFixed(2);
    schedule[schedule.length - 1].total = +(schedule[schedule.length - 1].principal + schedule[schedule.length - 1].interest).toFixed(2);
  }
  return schedule;
}

// ============ 3B.5.12.1: DeFi Protocol Risk Oracle ============
export function defiProtocolActionability(riskScore: number): {
  color: string;
  newPositionsAllowed: boolean;
  existingPositionFlag: string;
  gracePeriodDays?: number;
  notice: string;
} {
  if (riskScore >= 85) {
    return { color: "GREEN", newPositionsAllowed: true, existingPositionFlag: "OK", notice: "All operations allowed." };
  }
  if (riskScore >= 60) {
    return { color: "YELLOW", newPositionsAllowed: true, existingPositionFlag: "WARNING", notice: "Warning shown; financier must acknowledge before new positions." };
  }
  if (riskScore >= 40) {
    return { color: "ORANGE", newPositionsAllowed: false, existingPositionFlag: "FLAGGED", notice: "New positions blocked; existing positions flagged for review." };
  }
  return { color: "RED", newPositionsAllowed: false, existingPositionFlag: "SUSPENDED", gracePeriodDays: 14, notice: "Protocol suspended. Existing debt must be refinanced within 14 days." };
}

// ============ 3B.5.12.2: Stablecoin Depeg Detection ============
export function stablecoinAction(deviationPct: number): {
  freezeNewPositions: boolean;
  alertLevel: "OK" | "WARNING" | "FREEZE";
  notice: string;
} {
  if (deviationPct > STABLECOIN_DEPEG_FREEZE_PCT) {
    return { freezeNewPositions: true, alertLevel: "FREEZE", notice: `Deviation ${deviationPct}% > ${STABLECOIN_DEPEG_FREEZE_PCT}%. Governor froze new stablecoin positions.` };
  }
  if (deviationPct > STABLECOIN_DEPEG_WARN_PCT) {
    return { freezeNewPositions: false, alertLevel: "WARNING", notice: `Deviation ${deviationPct}% > ${STABLECOIN_DEPEG_WARN_PCT}%. Warning issued to active position holders.` };
  }
  return { freezeNewPositions: false, alertLevel: "OK", notice: "Stablecoin peg within tolerance." };
}

// ============ 3B.5.12.3: Liquidation Early Warning (LSTM-style) ============
export function liquidationRiskAssessment(position: {
  healthFactor: number;
  collateralUsd: number;
  debtUsd: number;
  predictedHealth24h?: number;
}): { status: "ACTIVE" | "WARNING" | "LIQUIDATION_RISK"; advice: string } {
  const predicted = position.predictedHealth24h ?? position.healthFactor;
  if (predicted < LIQUIDATION_PREDICT_HF_THRESHOLD && predicted > 1.0) {
    const cushion = position.collateralUsd - position.debtUsd;
    const advice = `Your health factor may drop below 1.0 in 24h. Consider repaying $${Math.ceil(position.debtUsd * 0.05).toLocaleString()} or adding $${Math.ceil(cushion * 0.05 / 100) * 100} in collateral to avoid liquidation.`;
    return { status: "LIQUIDATION_RISK", advice };
  }
  if (position.healthFactor < 1.5) {
    return { status: "WARNING", advice: `Health factor ${position.healthFactor.toFixed(2)} is approaching liquidation threshold. Monitor closely.` };
  }
  return { status: "ACTIVE", advice: "Position healthy." };
}

// ============ Helpers ============
export function generateRequestId(): string {
  const d = new Date();
  return `FR-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 900 + 100)}`;
}

export function generateBidId(): string {
  const d = new Date();
  return `BID-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}-${Math.floor(Math.random() * 900 + 100)}`;
}

// Stub client-side encryption (in production this would use borrower's public key via libsodium-wrappers)
export function encryptBidPayload(payload: object, borrowerPublicKey: string): string {
  const text = JSON.stringify(payload);
  const cipher = crypto.createHash("sha256").update(text + borrowerPublicKey).digest("hex");
  return `enc:${cipher.slice(0, 32)}:${Buffer.from(text).toString("base64").slice(0, 48)}…`;
}

export function decryptBidPayload(encrypted: string, _borrowerPrivateKey: string): string {
  if (encrypted.startsWith("enc:")) {
    const parts = encrypted.split(":");
    return Buffer.from(parts[2].replace(/…$/, ""), "base64").toString("utf-8");
  }
  return encrypted;
}
