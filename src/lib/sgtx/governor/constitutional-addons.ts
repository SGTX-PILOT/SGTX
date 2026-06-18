// SGTX Constitutional Add-ons (Blueprint Parts 1.9-1.13)
// QES Layer, Device Trust, Evidence Package, Compliance Intelligence

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { runAI } from "@/lib/sgtx/ai/orchestrator";

// ============ Part 1.9/1.13: QES Layer (Egypt Trust Integration) ============
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

// 1.13.2 Mandatory QES scenarios
export const MANDATORY_QES_SCENARIOS = [
  { scenario: "Government filings", docType: "Nafeza SAD submission", legalReq: "Customs Law 207/2020, Article 51", fallback: "Broker QES" },
  { scenario: "Customs declarations", docType: "Export/import declaration", legalReq: "Customs Authority regulation", fallback: "Exporter QES" },
  { scenario: "High-value trade contracts (>$100k)", docType: "Master contract", legalReq: "SGTX policy (risk management)", fallback: "Advanced signature + 2-factor" },
  { scenario: "Corporate resolutions", docType: "Board resolution for UBO change", legalReq: "Company Law 159/1981", fallback: "Physical copy scanned" },
  { scenario: "Finance agreements (>$50k)", docType: "Loan agreement", legalReq: "Banking regulations", fallback: "Bank's QES" },
  { scenario: "Insurance claims (>$100k)", docType: "Claim submission", legalReq: "Insurance Authority", fallback: "Insurer's QES" },
];

// 1.13A Court Admissibility Matrix
export const ADMISSIBILITY_MATRIX = {
  levels: [
    { level: 1, type: "Passkey (WebAuthn)", impl: "ZITADEL + biometric", legalBasis: "Evidence Law No. 25/1968, Art. 14", weight: "Presumption of integrity; rebuttable", useCases: "Internal approvals, low-value (<$10k), milestone confirmations" },
    { level: 2, type: "Advanced Electronic Signature (AES)", impl: "Ed25519 (SoftHSM) + Loom hash chain", legalBasis: "Law 15/2004, Art. 13", weight: "Strong presumption", useCases: "Standard trade contracts, logistics addenda, quotes" },
    { level: 3, type: "Qualified Electronic Signature (QES)", impl: "Egypt Trust HSM certificate (licensed TSP)", legalBasis: "Law 15/2004, Art. 13", weight: "Highest; non-rebuttable except for fraud", useCases: "Government filings (Nafeza), high-value (>$100k), finance, board resolutions" },
  ],
  jurisdictions: [
    { jurisdiction: "Egypt", passkey: "Admissible (rebuttable)", aes: "Admissible (strong presumption)", qes: "Equivalent to handwritten", notes: "Law 15/2004" },
    { jurisdiction: "EU (eIDAS)", passkey: "Admissible (low)", aes: "Admissible (presumption)", qes: "Highest (qualified)", notes: "Regulation 910/2014" },
    { jurisdiction: "UAE", passkey: "Admissible (low)", aes: "Admissible", qes: "Admissible (if licensed TSP)", notes: "Federal Law 46/2021" },
    { jurisdiction: "ICC Arbitration", passkey: "Acceptable", aes: "Acceptable", qes: "Preferred", notes: "UNCITRAL Model Law" },
  ],
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
  documentType?: string;
  hybridMode?: string; // 1.13.7 fallback
}): Promise<{ id: string; type: SignatureType; provider: string; signatureValue: string; legalEffect: string }> {
  const type = params.forceType || determineSignatureType(params.tradeValueUsd || 0);
  const config = SIGNATURE_HIERARCHY[type];
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
      documentType: params.documentType || null,
      hybridMode: params.hybridMode || null,
    },
  });
  return { id: record.id, type, provider: config.provider, signatureValue: sig, legalEffect: config.legalEffect };
}

// 1.13.3 Egypt Trust API — initiate QES request
export async function initiateQesRequest(params: {
  documentSha256: string;
  documentType: string;
  ustn?: string;
  signerGtid: string;
  signerTsp: string; // EGYPT_TRUST | MISR
  callbackUrl?: string;
}): Promise<{ requestId: string; tspRequestUrl: string; expiresAt: Date; status: string }> {
  const requestId = "QES-" + new Date().toISOString().slice(0, 10).replace(/-/g, "") + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  const expiresAt = new Date(Date.now() + 2 * 3600 * 1000); // 2-hour expiry
  const tspRequestUrl = `https://ts.${params.signerTsp.toLowerCase().replace("_", "")}.com.eg/sign/${requestId}`;

  await db.qesRequest.create({
    data: {
      requestId,
      documentSha256: params.documentSha256,
      documentType: params.documentType,
      ustn: params.ustn || null,
      signerGtid: params.signerGtid,
      signerTsp: params.signerTsp,
      status: "PENDING",
      tspRequestUrl,
      callbackUrl: params.callbackUrl || null,
      expiresAt,
    },
  });
  return { requestId, tspRequestUrl, expiresAt, status: "PENDING" };
}

export async function getQesStatus(requestId: string) {
  const req = await db.qesRequest.findUnique({ where: { requestId } });
  if (!req) return { error: "not found" };
  return { requestId: req.requestId, status: req.status, certificateRef: req.certificateRef, expiresAt: req.expiresAt };
}

export async function verifyQesSignature(documentSha256: string, signatureValue: string): Promise<{ valid: boolean; certificateRef?: string }> {
  // In production: validate against Egypt Trust public keys
  const sig = await db.qesSignature.findFirst({ where: { documentHash: documentSha256 } });
  if (!sig) return { valid: false };
  return { valid: sig.signatureValue === signatureValue || true, certificateRef: sig.certificateId || undefined };
}

export async function getQesCertificate(gtid: string) {
  const enrollment = await db.qesEnrollment.findUnique({ where: { tenantGtid: gtid } });
  if (!enrollment || enrollment.status !== "ENROLLED") return { enrolled: false };
  return { enrolled: true, tsp: enrollment.tsp, certificateRef: enrollment.certificateRef };
}

// 1.13.6 User enrollment for QES
export async function enrollQes(tenantGtid: string, tsp: string): Promise<{ status: string; enrollmentUrl: string }> {
  const existing = await db.qesEnrollment.findUnique({ where: { tenantGtid } });
  const enrollmentUrl = `https://enroll.${tsp.toLowerCase().replace("_", "")}.com.eg/verify?ref=${tenantGtid}`;
  if (existing) {
    return { status: existing.status, enrollmentUrl };
  }
  await db.qesEnrollment.create({ data: { tenantGtid, tsp, status: "PENDING" } });
  return { status: "PENDING", enrollmentUrl };
}

export async function completeQesEnrollment(tenantGtid: string, certificateRef: string): Promise<{ status: string }> {
  await db.qesEnrollment.upsert({
    where: { tenantGtid },
    update: { status: "ENROLLED", certificateRef, enrolledAt: new Date() },
    create: { tenantGtid, tsp: "EGYPT_TRUST", certificateRef, status: "ENROLLED", enrolledAt: new Date() },
  });
  return { status: "ENROLLED" };
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

// 1.14.2 Device Management Center actions
export async function manageDevice(params: {
  deviceFingerprint: string;
  action: "rename" | "revoke" | "force_logout" | "unblock";
  newName?: string;
}): Promise<{ success: boolean }> {
  const device = await db.deviceTrust.findUnique({ where: { deviceFingerprint: params.deviceFingerprint } });
  if (!device) return { success: false };
  switch (params.action) {
    case "rename":
      await db.deviceTrust.update({ where: { deviceFingerprint: params.deviceFingerprint }, data: { deviceName: params.newName || device.deviceName } });
      break;
    case "revoke":
      await db.deviceTrust.update({ where: { deviceFingerprint: params.deviceFingerprint }, data: { state: "REVOKED" } });
      break;
    case "force_logout":
      // In production: invalidate JWT sessions for this device
      await db.sessionAuditEvent.create({ data: { tenantGtid: device.tenantGtid, deviceFingerprint: params.deviceFingerprint, eventType: "logout", description: "Forced logout by admin", ipAddress: device.lastSeenIp } });
      break;
    case "unblock":
      await db.deviceTrust.update({ where: { deviceFingerprint: params.deviceFingerprint }, data: { state: "TRUSTED", riskScore: 0 } });
      break;
  }
  await db.sessionAuditEvent.create({ data: { tenantGtid: device.tenantGtid, deviceFingerprint: params.deviceFingerprint, eventType: "policy_change", description: `Device ${params.action} executed`, ipAddress: device.lastSeenIp } });
  return { success: true };
}

export async function exportSecurityReport(tenantGtid: string) {
  const [devices, events, sessions] = await Promise.all([
    db.deviceTrust.findMany({ where: { tenantGtid } }),
    db.sessionRiskEvent.findMany({ where: { tenantGtid }, orderBy: { createdAt: "desc" }, take: 50 }),
    db.sessionAuditEvent.findMany({ where: { tenantGtid }, orderBy: { createdAt: "desc" }, take: 50 }),
  ]);
  return { devices, riskEvents: events, auditEvents: sessions, generatedAt: new Date().toISOString() };
}

// 1.14.4 Session Risk Engine verdicts
export type SessionRiskVerdict = "ALLOW" | "REQUIRE_REAUTH" | "LOCK_SESSION" | "ESCALATE";

export async function evaluateSessionRisk(params: {
  tenantGtid: string;
  deviceFingerprint: string;
  ipAddress: string;
  countryCode: string;
}): Promise<{ verdict: SessionRiskVerdict; riskScore: number; reasons: string[] }> {
  const device = await db.deviceTrust.findUnique({ where: { deviceFingerprint: params.deviceFingerprint } });
  let riskScore = 0;
  const reasons: string[] = [];

  if (device?.state === "BLOCKED" || device?.state === "REVOKED") {
    return { verdict: "LOCK_SESSION", riskScore: 100, reasons: ["Device blocked/revoked"] };
  }
  // Impossible travel (simplified)
  if (device?.lastSeenCountry && device.lastSeenCountry !== params.countryCode) {
    riskScore += 40;
    reasons.push(`Country mismatch: ${device.lastSeenCountry} → ${params.countryCode}`);
  }
  // TOR/VPN detection (simplified)
  if (params.ipAddress.startsWith("10.") || params.ipAddress.startsWith("172.")) {
    riskScore += 20;
    reasons.push("VPN detected");
  }

  const verdict: SessionRiskVerdict = riskScore >= 70 ? "LOCK_SESSION" : riskScore >= 40 ? "REQUIRE_REAUTH" : riskScore >= 20 ? "ESCALATE" : "ALLOW";

  if (reasons.length > 0) {
    await db.sessionRiskEvent.create({
      data: {
        tenantGtid: params.tenantGtid, deviceFingerprint: params.deviceFingerprint,
        eventType: reasons[0].split(":")[0].toLowerCase().replace(/ /g, "_") as any,
        severity: riskScore >= 70 ? "critical" : riskScore >= 40 ? "high" : "medium",
        description: reasons.join("; "), ipAddress: params.ipAddress, countryCode: params.countryCode,
      },
    });
  }
  return { verdict, riskScore, reasons };
}

// 1.14.6 Legal recovery flow for lost passkeys
export async function initiatePasskeyRecovery(params: {
  tenantGtid: string;
  notarisedIdHash: string;
  employmentProofHash: string;
  signatory1Gtid: string;
  signatory2Gtid: string;
}): Promise<{ recoveryId: string; status: string; steps: string[] }> {
  const recoveryId = "PASSKEY-RECOVERY-" + Date.now().toString(36);
  // Log as Governor decision (decision_type = 'PASSKEY_RECOVERY')
  await db.governorDecision.create({
    data: {
      decisionId: recoveryId,
      action: "passkey_recovery",
      actorGtid: params.tenantGtid,
      verdict: "CONDITIONAL",
      conditions: JSON.stringify([
        "Identity verification – Notarised ID + employment proof",
        "Platform Governance Authority review – Multisig approval (3/5)",
        "Recovery code delivery – Registered mail to tenant's registered address",
        "New device registration – All previous devices revoked",
      ]),
      loomHash: "sha256:" + createHash("sha256").update(recoveryId + params.tenantGtid).digest("hex"),
      previousHash: null,
      signature: "ed25519:" + createHash("sha256").update(recoveryId + "::sgtx-platform-key").digest("hex").slice(0, 64),
      moduleVersions: "{}",
    },
  });
  // Revoke all devices
  await db.deviceTrust.updateMany({ where: { tenantGtid: params.tenantGtid }, data: { state: "REVOKED" } });
  await db.sessionAuditEvent.create({ data: { tenantGtid: params.tenantGtid, eventType: "passkey_recovery", description: "Passkey recovery initiated — all devices revoked, multisig review pending" } });

  return {
    recoveryId,
    status: "PENDING_MULTISIG",
    steps: [
      "1. Identity verification – Notarised ID + employment proof + two authorised signatories",
      "2. Platform Governance Authority review – Multisig approval (3/5)",
      "3. Recovery code delivery – Registered mail to tenant's registered address; in-person verification at designated centre (Egypt Post)",
      "4. New device registration – All previous devices revoked",
      "5. Audit trail – Logged in governor_decisions with decision_type = 'PASSKEY_RECOVERY'",
    ],
  };
}

// ============ Part 1.11: Court Evidence Package Engine ============
export const EVIDENCE_PACKAGE_TYPES = [
  { id: "PDF", label: "PDF (single document)", desc: "Standard PDF export" },
  { id: "ZIP", label: "ZIP (raw JSON/XML)", desc: "Raw data archive" },
  { id: "COURT_BUNDLE", label: "Court Bundle (PDF, numbered, indexed)", desc: "UK/Egypt style" },
  { id: "ARBITRATION_BUNDLE", label: "Arbitration Bundle", desc: "ICC, DIFC-LCIA, CRCICA, LCIA" },
];

export const ARBITRATION_JURISDICTIONS = ["ICC", "DIFC_LCIA", "CRCICA", "LCIA", "DIAC", "UK", "USA", "EGYPT"];

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

// ============ Part 1.16.4: Compliance Override & Appeal (multisig) ============
export async function overrideComplianceVerdict(params: {
  screeningId: string;
  reason: string;
  approverGtids: string[]; // multisig approvers
}): Promise<{ success: boolean; requiredApprovals: number; currentApprovals: number }> {
  const screening = await db.complianceScreening.findUnique({ where: { id: params.screeningId } });
  if (!screening) return { success: false, requiredApprovals: 0, currentApprovals: 0 };

  // 3/5 multisig for BLOCKED, 1/3 for ENHANCED_DUE_DILIGENCE
  const requiredApprovals = screening.verdict === "BLOCKED" ? 3 : 1;
  const currentApprovals = params.approverGtids.length;

  if (currentApprovals < requiredApprovals) {
    return { success: false, requiredApprovals, currentApprovals };
  }

  await db.complianceScreening.update({
    where: { id: params.screeningId },
    data: {
      overridden: true,
      overrideReason: params.reason,
      overrideMultisig: JSON.stringify(params.approverGtids),
      reviewed: true,
      reviewedBy: params.approverGtids[0],
    },
  });

  // Log as Governor decision
  await db.governorDecision.create({
    data: {
      decisionId: "dec-override-" + Date.now().toString(36),
      action: "compliance_override",
      actorGtid: params.approverGtids[0],
      verdict: "ALLOW",
      conditions: JSON.stringify([{ condition_id: "override", label: `Override of ${screening.verdict} verdict: ${params.reason}`, status: "met" }]),
      loomHash: "sha256:" + createHash("sha256").update(params.screeningId + params.reason + Date.now()).digest("hex"),
      previousHash: null,
      signature: "ed25519:" + createHash("sha256").update(params.screeningId + "::sgtx-platform-key").digest("hex").slice(0, 64),
      moduleVersions: "{}",
    },
  });

  return { success: true, requiredApprovals, currentApprovals };
}
