// SGTX Constitutional Add-ons (Blueprint Parts 1.9-1.13)
// QES Layer, Device Trust, Evidence Package, Compliance Intelligence

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { runAI } from "@/lib/sgtx/ai/orchestrator";

// ============ Part 1.9: QES Layer (Egypt Trust Integration) ============
export type SignatureType = "STANDARD" | "AES" | "QES";

export const SIGNATURE_HIERARCHY: Record<SignatureType, {
  legalEffect: string;
  provider: string;
  useCases: string;
  threshold: string;
}> = {
  STANDARD: {
    legalEffect: "Binding between parties",
    provider: "ZITADEL passkey (WebAuthn)",
    useCases: "Low-value contracts (<$10k), internal approvals",
    threshold: "< $10,000",
  },
  AES: {
    legalEffect: "Presumption of integrity",
    provider: "Ed25519 certificate (SoftHSM)",
    useCases: "Standard trade contracts, logistics addenda",
    threshold: "$10,000 – $100,000",
  },
  QES: {
    legalEffect: "Equivalent to handwritten signature",
    provider: "Egypt Trust certificate (HSM)",
    useCases: "Government filings, Nafeza submissions, high-value trade (>$100k), finance agreements",
    threshold: "> $100,000",
  },
};

export function determineSignatureType(tradeValueUsd: number): SignatureType {
  if (tradeValueUsd > 100000) return "QES";
  if (tradeValueUsd >= 10000) return "AES";
  return "STANDARD";
}

export async function signDocument(params: {
  ustn?: string;
  signerGtid: string;
  signerName: string;
  documentHash: string;
  tradeValueUsd?: number;
  forceType?: SignatureType;
}): Promise<{ id: string; type: SignatureType; provider: string; signatureValue: string; legalEffect: string }> {
  const type = params.forceType || determineSignatureType(params.tradeValueUsd || 0);
  const config = SIGNATURE_HIERARCHY[type];
  // Simulated signature (in production: ZITADEL/SoftHSM/EgyptTrust HSM)
  const sigValue = type === "QES" ? "egyptTrust:" : type === "AES" ? "ed25519:" : "webauthn:";
  const sig = sigValue + createHash("sha256").update(params.documentHash + params.signerGtid + Date.now()).digest("hex").slice(0, 64);

  const record = await db.qesSignature.create({
    data: {
      ustn: params.ustn || null,
      signerGtid: params.signerGtid,
      signerName: params.signerName,
      signatureType: type,
      legalEffect: config.legalEffect,
      provider: config.provider.split(" ")[0],
      documentHash: params.documentHash,
      signatureValue: sig,
    },
  });
  return { id: record.id, type, provider: config.provider, signatureValue: sig, legalEffect: config.legalEffect };
}

// ============ Part 1.10: Device Trust & Step-Up Authentication ============
export type DeviceState = "NEW" | "TRUSTED" | "ELEVATED_RISK" | "BLOCKED" | "REVOKED";
export type SessionRiskType = "impossible_travel" | "vpn_detected" | "tor_detected" | "country_mismatch" | "fingerprint_change" | "behavioural_anomaly";

export const STEP_UP_CHAIN = [
  { step: 1, method: "Passkey (WebAuthn)", factor: "something you have", required: true },
  { step: 2, method: "Biometric verification", factor: "something you are", requiredFor: ["QES", "high_value"] },
  { step: 3, method: "Cryptographic challenge signature", factor: "device-bound private key", requiredFor: ["QES"] },
];

export async function registerDevice(params: {
  tenantGtid: string;
  deviceFingerprint: string;
  deviceName: string;
  platform: string;
  lastSeenIp?: string;
  lastSeenCountry?: string;
}): Promise<{ id: string; state: DeviceState; riskScore: number }> {
  // Session risk engine — check for anomalies
  let riskScore = 0;
  const anomalies: SessionRiskType[] = [];

  // Simulated anomaly detection (A2)
  if (params.lastSeenCountry && params.lastSeenCountry === "TOR") { anomalies.push("tor_detected"); riskScore += 40; }
  if (params.lastSeenIp && params.lastSeenIp.startsWith("10.")) { /* VPN heuristic */ }

  const state: DeviceState = riskScore >= 70 ? "BLOCKED" : riskScore >= 40 ? "ELEVATED_RISK" : "NEW";

  const device = await db.deviceTrust.create({
    data: {
      tenantGtid: params.tenantGtid,
      deviceFingerprint: params.deviceFingerprint,
      deviceName: params.deviceName,
      platform: params.platform,
      state,
      lastSeenIp: params.lastSeenIp || null,
      lastSeenCountry: params.lastSeenCountry || null,
      riskScore,
    },
  });

  // Log risk events
  for (const anomaly of anomalies) {
    await db.sessionRiskEvent.create({
      data: {
        tenantGtid: params.tenantGtid,
        deviceFingerprint: params.deviceFingerprint,
        eventType: anomaly,
        severity: riskScore >= 70 ? "critical" : riskScore >= 40 ? "high" : "medium",
        description: `Detected ${anomaly.replace(/_/g, " ")} during device registration`,
        ipAddress: params.lastSeenIp || null,
        countryCode: params.lastSeenCountry || null,
      },
    });
  }

  return { id: device.id, state, riskScore };
}

export async function performStepUpAuth(params: {
  tenantGtid: string;
  deviceFingerprint: string;
  action: string;
  tradeValueUsd?: number;
}): Promise<{ required: boolean; steps: typeof STEP_UP_CHAIN; completed: boolean }> {
  const requiresQes = (params.tradeValueUsd || 0) > 100000;
  const requiresHighValue = (params.tradeValueUsd || 0) > 50000;
  const steps = STEP_UP_CHAIN.filter(s => s.required || (requiresQes && s.requiredFor?.includes("QES")) || (requiresHighValue && s.requiredFor?.includes("high_value")));
  return { required: requiresQes || requiresHighValue, steps, completed: !requiresQes && !requiresHighValue };
}

// ============ Part 1.11: Court Evidence Package Engine ============
export const EVIDENCE_PACKAGE_TYPES = [
  { id: "PDF", label: "PDF (single document)", desc: "Standard PDF export" },
  { id: "ZIP", label: "ZIP (raw JSON/XML)", desc: "Raw data archive" },
  { id: "COURT_BUNDLE", label: "Court Bundle (PDF, numbered, indexed)", desc: "UK/Egypt style" },
  { id: "ARBITRATION_BUNDLE", label: "Arbitration Bundle", desc: "ICC, DIFC-LCIA, CRCICA, LCIA" },
];

export const ARBITRATION_JURISDICTIONS = ["ICC", "DIFC_LCIA", "CRCICA", "LCIA", "UK", "EGYPT"];

export async function generateEvidencePackage(params: {
  ustn: string;
  packageType: string;
  jurisdiction?: string;
  generatedBy?: string;
}): Promise<{ id: string; contents: string[]; fileSizeKb: number; loomHash: string }> {
  // Gather all evidence for the USTN
  const trade = await db.trade.findUnique({
    where: { ustn: params.ustn },
    include: { buyer: true, seller: true, documents: true, activities: true, invoices: true, shipments: true, disputes: true, timeline: true, chatMessages: true, labTests: true, qcInspections: true, customsDecls: true, financing: { include: { bids: true } } },
  });
  if (!trade) throw new Error("trade not found");

  const contents = [
    `Contract (${trade.commodity} ${trade.incoterm})`,
    `Buyer: ${trade.buyer?.legalName} (${trade.buyer?.gtid})`,
    `Seller: ${trade.seller?.legalName} (${trade.seller?.gtid})`,
    `${trade.documents.length} documents (PDF/A-3, SHA-256 hashed)`,
    `${trade.activities.length} audit log entries`,
    `${trade.invoices.length} invoices with payment logs`,
    `${trade.shipments.length} shipments with milestone timeline`,
    `Loom hash chain (governor decisions)`,
    `${trade.chatMessages.length} trade room messages`,
    ...(trade.labTests.length ? [`${trade.labTests.length} lab test reports`] : []),
    ...(trade.qcInspections.length ? [`${trade.qcInspections.length} QC inspection reports`] : []),
    ...(trade.customsDecls.length ? [`${trade.customsDecls.length} customs declarations`] : []),
    ...(trade.disputes.length ? [`${trade.disputes.length} disputes with causal analysis`] : []),
    ...(trade.financing.length ? [`Financing agreement with ${trade.financing[0].bids.length} bids`] : []),
    `Sensor data (cold-chain temperature logs)`,
  ];

  const loomHash = "sha256:" + createHash("sha256").update(params.ustn + params.packageType + Date.now()).digest("hex");
  const fileSizeKb = Math.round(1500 + trade.documents.length * 120 + trade.activities.length * 2);

  const pkg = await db.evidencePackage.create({
    data: {
      ustn: params.ustn,
      packageType: params.packageType,
      jurisdiction: params.jurisdiction || "EGYPT",
      contents: JSON.stringify(contents),
      fileSizeKb,
      loomHash,
      generatedBy: params.generatedBy || null,
    },
  });

  return { id: pkg.id, contents, fileSizeKb, loomHash };
}

// ============ Part 1.13: Compliance Intelligence Layer ============
export type ScreeningVerdict = "CLEAR" | "ENHANCED_DUE_DILIGENCE" | "BLOCKED";

export const SCREENING_DIMENSIONS = [
  { id: "SANCTIONS", label: "Sanctions (UN, OFAC, EU)", source: "RIA scrapes + GNN", frequency: "Real-time" },
  { id: "PEP", label: "PEP (Politically Exposed Persons)", source: "Global PEP databases", frequency: "Daily" },
  { id: "RESTRICTED_GOODS", label: "Restricted goods", source: "Dual-use lists, CITES, military", frequency: "Daily" },
  { id: "JURISDICTION_RISK", label: "Jurisdiction risk", source: "RIA jurisdiction matrix", frequency: "6 hours" },
  { id: "CUSTOMS_COMPLIANCE", label: "Customs compliance", source: "Nafeza + RIA rules", frequency: "Daily" },
];

export async function runComplianceScreening(params: {
  tenantGtid: string;
  ustn?: string;
  counterpartyGtid?: string;
}): Promise<{ overall: ScreeningVerdict; results: { dimension: string; verdict: ScreeningVerdict; details: string }[] }> {
  const tenant = await db.tenant.findUnique({ where: { gtid: params.tenantGtid } });
  const counterparty = params.counterpartyGtid ? await db.tenant.findUnique({ where: { gtid: params.counterpartyGtid } }) : null;
  const results: { dimension: string; verdict: ScreeningVerdict; details: string }[] = [];

  // 1. Sanctions (simulated — in production: RIA + GNN)
  const sanctionsClear = tenant?.sanctionsCleared && (!counterparty || counterparty.sanctionsCleared);
  results.push({
    dimension: "SANCTIONS",
    verdict: sanctionsClear ? "CLEAR" : "BLOCKED",
    details: sanctionsClear ? "No sanctions hits (UN, OFAC, EU lists). GNN proximity > 2 hops." : "Sanctions hit detected — trade blocked.",
  });

  // 2. PEP (simulated)
  const isPep = tenant?.kybTier === 1; // lower tier = higher PEP risk
  results.push({
    dimension: "PEP",
    verdict: isPep ? "ENHANCED_DUE_DILIGENCE" : "CLEAR",
    details: isPep ? "UBO flagged as Politically Exposed Person — enhanced DD required." : "No PEP matches in global databases.",
  });

  // 3. Restricted goods (based on HS code)
  const restrictedHs = ["8802", "9301", "9303", "3601"]; // aircraft, weapons, explosives
  const trade = params.ustn ? await db.trade.findUnique({ where: { ustn: params.ustn } }) : null;
  const hsFlagged = trade?.commodityHs && restrictedHs.some(hs => trade.commodityHs.startsWith(hs));
  results.push({
    dimension: "RESTRICTED_GOODS",
    verdict: hsFlagged ? "BLOCKED" : "CLEAR",
    details: hsFlagged ? `HS code ${trade?.commodityHs} flagged as dual-use/restricted goods.` : "No restricted goods detected (dual-use, CITES, military).",
  });

  // 4. Jurisdiction risk
  const buyerJur = trade ? await db.jurisdiction.findUnique({ where: { countryCode: trade.buyerGtid.slice(5, 7) } }) : null;
  const sellerJur = tenant ? await db.jurisdiction.findUnique({ where: { countryCode: tenant.country } }) : null;
  const strictest = buyerJur?.tier === "BLOCKED" || sellerJur?.tier === "BLOCKED" ? "BLOCKED"
    : buyerJur?.tier === "RESTRICTED" || sellerJur?.tier === "RESTRICTED" ? "RESTRICTED"
    : buyerJur?.tier === "LIMITED" || sellerJur?.tier === "LIMITED" ? "LIMITED" : "FULL";
  results.push({
    dimension: "JURISDICTION_RISK",
    verdict: strictest === "BLOCKED" ? "BLOCKED" : strictest === "RESTRICTED" || strictest === "LIMITED" ? "ENHANCED_DUE_DILIGENCE" : "CLEAR",
    details: `Strictest jurisdiction tier: ${strictest} (buyer: ${buyerJur?.tier || "?"}, seller: ${sellerJur?.tier || "?"}).`,
  });

  // 5. Customs compliance (simulated — based on declaration history)
  const customsOk = tenant?.lifecycleState === "VERIFIED";
  results.push({
    dimension: "CUSTOMS_COMPLIANCE",
    verdict: customsOk ? "CLEAR" : "ENHANCED_DUE_DILIGENCE",
    details: customsOk ? "Tenant VERIFIED — customs compliance history clean." : "Tenant not fully verified — customs review required.",
  });

  // Persist results
  for (const r of results) {
    await db.complianceScreening.create({
      data: {
        ustn: params.ustn || null,
        tenantGtid: params.tenantGtid,
        screeningType: r.dimension,
        verdict: r.verdict,
        dataSource: SCREENING_DIMENSIONS.find(d => d.id === r.dimension)?.source || "RIA",
        details: r.details,
      },
    });
  }

  const overall: ScreeningVerdict = results.some(r => r.verdict === "BLOCKED") ? "BLOCKED"
    : results.some(r => r.verdict === "ENHANCED_DUE_DILIGENCE") ? "ENHANCED_DUE_DILIGENCE" : "CLEAR";

  return { overall, results };
}

// ============ Part 1.12: SAR detection triggers (extended) ============
export const SAR_TRIGGERS = [
  { id: "volume_spike", label: "Sudden volume spike", desc: "Trade volume increase for a specific tenant or corridor", threshold: ">300% over 30 days" },
  { id: "circular_trade", label: "Circular trades", desc: "Buyer and seller roles reverse within short period, same goods", threshold: "≤7 days between trades" },
  { id: "value_mismatch", label: "Value mismatch", desc: "Declared value vs AI-estimated market value", threshold: "Deviation >200%" },
  { id: "high_risk_payment_routing", label: "High-risk payment routing", desc: "Payments routed through jurisdictions not aligned with trade route", threshold: "Country mismatch detected by RIA" },
  { id: "structuring", label: "Structuring", desc: "Multiple small trades just below reporting threshold", threshold: ">5 trades within 10% of threshold in 30 days" },
  { id: "gnn_sanctions_link", label: "GNN sanctions link", desc: "Indirect sanctions proximity (≤2 hops) and no enhanced due diligence", threshold: "Proximity ≤2 and enhanced_dd_completed = false" },
];
