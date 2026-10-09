// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #10: GOV Workflow Data
// Creative: Fraud/AML Detection Engine + Money Laundering Flow Diagram +
// Payment Settlement Verification + Fraud Alert Network + SAR Auto-Generation
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  CheckCircle2, Eye, ShieldAlert, Users, Stamp,
  FileCheck, DollarSign, Clock, AlertTriangle,
  Gavel, TrendingUp, Crosshair, Activity, Landmark,
  Send, Scale, Radar, RotateCcw,
} from "lucide-react";

export interface FormField {
  key: string; label: string; type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle" | "slider";
  options?: string[]; placeholder?: string; aiAssist?: string; defaultValue?: string; required?: boolean;
  min?: number; max?: number; step?: number;
}
export interface WorkflowStep {
  number: number; id: string; name: string; specRef: string; purpose: string; icon: LucideIcon;
  fields: FormField[]; aiSuggestion?: string; governorGate?: string; creativeFeature?: string;
}

export const GOV_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1, id: "clearance-decision", name: "Clearance Decision (AI Auto-Clearance Recommendation)",
    specRef: "§16.8.6.10", purpose: "AI (A2) evaluates trade for auto-clearance. Risk score, sanctions, HS code, documents, duty all checked. 92% confidence → recommend auto-clear. Or flag for manual review.",
    icon: CheckCircle2, governorGate: "G5U6 (customs clearance)", creativeFeature: "AI clearance confidence gauge",
    aiSuggestion: "USTN ...0042: Risk 72 (low). Sanctions clear. HS 0811.10.00 verified. Duty $5,255. All 8 documents verified. AI confidence: 92% → RECOMMEND AUTO-CLEAR. Government approval (sovereign) required to execute.",
    fields: [
      { key: "ai-recommendation", label: "AI Auto-Clearance (A2)", type: "radio", options: ["RECOMMEND AUTO-CLEAR (92% confidence) — all checks passed", "FLAG FOR MANUAL REVIEW (risk factors detected)", "DENY (critical non-compliance)"], defaultValue: "RECOMMEND AUTO-CLEAR (92% confidence) — all checks passed", required: true },
      { key: "risk-score", label: "Risk Score", type: "text", defaultValue: "72 (low — sanctions clear, compliance good, trade verified)" },
      { key: "government-approval", label: "Government Approval (Sovereign)", type: "toggle", options: ["Approve auto-clearance", "Require manual review", "Deny clearance"], defaultValue: "Approve auto-clearance", required: true },
    ],
  },
  {
    number: 2, id: "document-verification", name: "Document Verification (AI Discrepancy Detection)",
    specRef: "§16.8.6.10", purpose: "AI (A2 HF ViT) cross-checks all documents against trade data. Detects: HS code mismatch, value discrepancy, origin fraud, sanctions evasion, forged certificates.",
    icon: Eye, governorGate: "G5U2 (document verified)", creativeFeature: "AI discrepancy radar with confidence scores",
    aiSuggestion: "Document verification: 8/8 documents submitted. AI cross-check: (1) HS code 0811.10.00 matches product ✓, (2) declared value $105,100 matches CIF calc ✓, (3) origin Egypt verified ✓, (4) sanctions clear ✓, (5) phytosanitary certificate Ed25519 verified ✓. 0 discrepancies. Confidence: 96%.",
    fields: [
      { key: "documents", label: "Documents Verified", type: "text", defaultValue: "8/8 verified (Commercial Invoice, Packing List, BL, COO, Phytosanitary, EUR.1, Health Cert, Freeze Cert)" },
      { key: "discrepancies", label: "AI Discrepancy Detection (A2 HF ViT)", type: "toggle", options: ["0 discrepancies detected ✓ (confidence 96%)", "1 discrepancy: HS code mismatch (flagged)", "2+ discrepancies: manual review required"], defaultValue: "0 discrepancies detected ✓ (confidence 96%)", required: true },
      { key: "origin-verify", label: "Origin Verification", type: "toggle", options: ["Verified ✓ (Egypt origin confirmed, GPS + Loom hash)", "Flagged — origin fraud suspected"], defaultValue: "Verified ✓ (Egypt origin confirmed, GPS + Loom hash)" },
    ],
  },
  {
    number: 3, id: "fraud-aml-detection", name: "Fraud/AML Detection Engine (Money Laundering Scan)",
    specRef: "§3.5.14, §21.1, §22.2.1", purpose: "Detect money laundering: (1) buyer receives goods but never pays, (2) seller ships but never receives payment, (3) circular trades A→B→C→A, (4) velocity anomalies, (5) price manipulation (over/under-invoicing). Notify affected parties of scams.",
    icon: Radar, governorGate: "G1U3 (sanctions) + G5 (fraud)", creativeFeature: "SVG fraud radar + money laundering flow diagram + payment settlement verification",
    aiSuggestion: "FRAUD/AML SCAN COMPLETE. 5 indicators checked:\n(1) NON-PAYMENT: Buyer (Nile Harvest) has 0 unpaid trades. CLEAN.\n(2) UNPAID SHIPMENT: Seller (Sahara Exports) has 0 shipments without payment. CLEAN.\n(3) CIRCULAR TRADES: A→B→C→A loop scan — 0 circular patterns detected in last 90 days. CLEAN.\n(4) VELOCITY: Trade frequency within normal range (28 trades/yr, avg 2.3/month). CLEAN.\n(5) PRICE MANIPULATION: Declared value $105,100 within market range ($98K-$112K). No over/under-invoicing. CLEAN.\n\n⚠ ALERT: Separate entity 'Delta Agro' flagged: 2 unpaid shipments in 30 days (seller not paid $5.6K). SAR draft recommended. Buyer 'Nile Harvest' also involved in circular pattern with Delta Agro (A→B→C→A loop of $420K). NOTIFICATION sent to affected sellers.",
    fields: [
      { key: "fraud-scan", label: "Fraud/AML Scan Result", type: "toggle", options: ["5/5 indicators CLEAN for this trade (Nile Harvest + Sahara Exports)", "1 ALERT: Delta Agro — 2 unpaid shipments + circular trade pattern detected"], defaultValue: "5/5 indicators CLEAN for this trade (Nile Harvest + Sahara Exports)", required: true },
      { key: "non-payment", label: "Indicator 1: Non-Payment (buyer takes goods, doesn't pay)", type: "text", defaultValue: "CLEAN — Buyer Nile Harvest has 0 unpaid trades (28 trades, all settled)" },
      { key: "unpaid-shipment", label: "Indicator 2: Unpaid Shipment (seller ships, doesn't get money)", type: "text", defaultValue: "CLEAN — Seller Sahara Exports has 0 unpaid shipments (all 28 trades settled)" },
      { key: "circular", label: "Indicator 3: Circular Trades (A→B→C→A money washing)", type: "text", defaultValue: "CLEAN for this trade. ⚠ SEPARATE ALERT: Delta Agro → Nile Harvest → Mediterra → Delta Agro ($420K loop detected)" },
      { key: "velocity", label: "Indicator 4: Velocity Anomaly (unusual trade frequency)", type: "text", defaultValue: "CLEAN — 2.3 trades/month (within normal range for trust score 91)" },
      { key: "price-manipulation", label: "Indicator 5: Price Manipulation (over/under-invoicing)", type: "text", defaultValue: "CLEAN — $105,100 CIF within market range ($98K-$112K), no capital flight detected" },
    ],
  },
  {
    number: 4, id: "fraud-alert-network", name: "Fraud Alert Network (Notify Affected Parties)",
    specRef: "§3.5.14, §21.1", purpose: "If fraud detected: notify affected sellers and buyers of scamming. Send Smart Inbox alerts. Prevent further trades with fraudulent entities. Freeze suspicious accounts pending investigation.",
    icon: Send, governorGate: "A3 (escalation — fraud alert)", creativeFeature: "SVG fraud alert network diagram (who gets notified)",
    aiSuggestion: "FRAUD ALERT DISPATCHED:\n• Seller (Sahara Exports): notified that Delta Agro has 2 unpaid shipments. Smart Inbox p95. Warning: do not extend credit to Delta Agro.\n• Buyer (Nile Harvest): notified about circular trade pattern with Delta Agro. Smart Inbox p85. Warning: verify payment routes.\n• Delta Agro: account flagged for investigation. New trades blocked pending SAR review.\n• Bank (Cairo Amman): notified of potential money laundering. SAR draft auto-generated.\n• Government (sovereign): declassification request sent to EU partner (cross-border investigation).\n\nThis trade (Nile Harvest + Sahara Exports) is CLEAN. No alert for these parties.",
    fields: [
      { key: "this-trade", label: "This Trade (Nile Harvest + Sahara Exports)", type: "toggle", options: ["CLEAN — no alert needed ✓", "FLAGGED — alert sent"], defaultValue: "CLEAN — no alert needed ✓", required: true },
      { key: "delta-agro-alert", label: "Separate Alert: Delta Agro (fraud detected)", type: "toggle", options: ["ALERT DISPATCHED — sellers notified, account flagged, trades blocked", "No alert (clean)"], defaultValue: "ALERT DISPATCHED — sellers notified, account flagged, trades blocked" },
      { key: "notifications", label: "Notifications Sent (Smart Inbox)", type: "textarea", defaultValue: "1. Sahara Exports (seller): 'Delta Agro has 2 unpaid shipments. Do not extend credit.' (p95)\n2. Nile Harvest (buyer): 'Circular trade pattern detected with Delta Agro. Verify payment routes.' (p85)\n3. Delta Agro: 'Account flagged for SAR investigation. New trades blocked.' (p99)\n4. Cairo Amman Bank: 'SAR draft auto-generated for Delta Agro.' (p90)\n5. EU Customs Partner: 'Declassification request for cross-border investigation.' (sovereign)" },
      { key: "account-freeze", label: "Account Action (Delta Agro)", type: "toggle", options: ["FLAGGED — new trades blocked pending SAR review (not frozen — due process)", "Frozen — all trades blocked", "No action"], defaultValue: "FLAGGED — new trades blocked pending SAR review (not frozen — due process)" },
    ],
  },
  {
    number: 5, id: "sar-generation", name: "SAR Auto-Generation (Suspicious Activity Report)",
    specRef: "§3.5.14", purpose: "If fraud/AML detected: auto-generate SAR draft. A1 generates narrative. A2 compiles evidence. Human compliance officer reviews + approves before filing. Not autonomous (A5 forbidden).",
    icon: Gavel, governorGate: "A3 (escalation — SAR)", creativeFeature: "SAR evidence package summary with confidence",
    aiSuggestion: "SAR DRAFT AUTO-GENERATED for Delta Agro:\n• Suspicious pattern: 2 unpaid shipments ($5.6K) + circular trade A→B→C→A ($420K loop)\n• Evidence: 8 documents, 3 trade records, GNN sanctions scan (2-hop proximity), payment history (2 late + 2 unpaid), bank settlement gaps\n• A1 narrative: 'Delta Agro engaged in circular trade pattern with Nile Harvest and Mediterra Foods, creating a $420K loop suggestive of money laundering. Additionally, 2 shipments were delivered without seller receiving payment ($5.6K total), indicating potential non-payment fraud.'\n• Confidence: 87%\n• Status: DRAFT — requires human compliance officer approval before filing",
    fields: [
      { key: "sar-status", label: "SAR Generation", type: "toggle", options: ["DRAFT AUTO-GENERATED ✓ (awaiting human approval)", "Not required (this trade is clean)", "FILED (human approved + submitted)"], defaultValue: "DRAFT AUTO-GENERATED ✓ (awaiting human approval)", required: true },
      { key: "sar-narrative", label: "A1 Narrative (plain language)", type: "textarea", defaultValue: "'Delta Agro engaged in circular trade pattern with Nile Harvest and Mediterra Foods, creating a $420K loop suggestive of money laundering. Additionally, 2 shipments were delivered without seller receiving payment ($5.6K total), indicating potential non-payment fraud. GNN risk engine flagged 2-hop sanctions proximity. Recommend account investigation and cross-border intelligence sharing.'" },
      { key: "confidence", label: "AI Confidence", type: "text", defaultValue: "87% (high — 5 indicators, 3 confirmed, 2 suspected)" },
      { key: "human-approval", label: "Human Compliance Officer Approval (A5 forbidden — human only)", type: "toggle", options: ["PENDING — human review required before filing", "APPROVED — SAR filed with FIU", "REJECTED — false positive"], defaultValue: "PENDING — human review required before filing", required: true },
    ],
  },
  {
    number: 6, id: "multi-agency", name: "Multi-Agency Approval Workflow",
    specRef: "§16.8.6.10", purpose: "For large/complex trades: multi-agency sign-off. Customs → Port Authority → Trade Ministry → CBE. Visual stepper. Auto-clearance blocked until all required agencies approve.",
    icon: Users, governorGate: "G5U6 (customs cleared — multi-agency)", creativeFeature: "Visual multi-agency stepper with approval tracking",
    aiSuggestion: "Multi-agency for USTN ...0042: (1) Customs (Nafeza): APPROVED ✓. (2) Port Authority: PENDING — Alexandria port congestion check. (3) Trade Ministry: PENDING — export license verification. (4) CBE: NOT REQUIRED (under $500K threshold). 1/3 approved. Deadline: 2026-09-19 18:00. Auto-clearance blocked until 2/3 approve.",
    fields: [
      { key: "customs", label: "Customs (Nafeza)", type: "toggle", options: ["Approved ✓", "Pending", "Rejected"], defaultValue: "Approved ✓", required: true },
      { key: "port", label: "Port Authority", type: "toggle", options: ["Approved ✓", "Pending — congestion check", "Rejected"], defaultValue: "Pending — congestion check" },
      { key: "ministry", label: "Trade Ministry", type: "toggle", options: ["Approved ✓", "Pending — export license verify", "Rejected"], defaultValue: "Pending — export license verify" },
      { key: "cbe", label: "CBE (Central Bank)", type: "toggle", options: ["Not required (under $500K)", "Approved ✓", "Pending"], defaultValue: "Not required (under $500K)" },
    ],
  },
  {
    number: 7, id: "permit-issuance", name: "Permit Issuance (Government Digital Seal)",
    specRef: "§16.8.6.10", purpose: "All clearance conditions met. Issue permits (Phytosanitary, EUR.1). Apply government digital seal (Ed25519, registered with Nafeza). Auto-propagate to destination country. Loom hash appended.",
    icon: Stamp, governorGate: "G5U2 (document — permit sealed)", creativeFeature: "Digital seal verification chain",
    aiSuggestion: "Permit issuance: Phytosanitary Certificate (PHY-2026-0042) + EUR.1 Movement Certificate. Government digital seal applied: Ed25519 (GOV-SEAL-EG-01, registered with Nafeza). Seal verifies: sovereign authority (Egypt), permit content, timestamp. Auto-propagated to Italy customs. Loom hash appended.",
    fields: [
      { key: "permits", label: "Permits Issued", type: "text", defaultValue: "Phytosanitary (PHY-2026-0042) + EUR.1 (EUR-2026-0042)" },
      { key: "seal", label: "Government Digital Seal (Ed25519)", type: "toggle", options: ["Applied ✓ (GOV-SEAL-EG-01, Nafeza registered)", "Failed", "Pending"], defaultValue: "Applied ✓ (GOV-SEAL-EG-01, Nafeza registered)", required: true },
      { key: "propagate", label: "Auto-Propagate to Destination", type: "toggle", options: ["Propagated ✓ (Italy customs notified)", "Pending"], defaultValue: "Propagated ✓ (Italy customs notified)" },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Appended ✓ (immutable sovereign record)", "Pending"], defaultValue: "Appended ✓ (immutable sovereign record)" },
    ],
  },
  {
    number: 8, id: "loom-audit", name: "Loom Chain Verification (Sovereign Audit)",
    specRef: "§3.5.13, §16.8.6.10", purpose: "Verify Loom hash chain integrity. All trades in chain verified. 0 tampering. Sovereign audit report generated. Public verification endpoint available for partner governments.",
    icon: FileCheck, governorGate: "G5 (audit complete)", creativeFeature: "Loom chain integrity verification summary",
    aiSuggestion: "Loom chain verification: 142 trades in current chain. All hashes verified (SHA-256 chained). 0 tampering detected. 0 gaps. Chain integrity: 100%. Sovereign audit report auto-generated. Public verification endpoint (§3.5.15) available for Italy customs to verify this trade's Loom hash.",
    fields: [
      { key: "chain-verify", label: "Loom Chain Verification", type: "toggle", options: ["VERIFIED ✓ — 142 trades, 0 tampering, 100% integrity", "FAILED — tampering detected"], defaultValue: "VERIFIED ✓ — 142 trades, 0 tampering, 100% integrity", required: true },
      { key: "audit-report", label: "Sovereign Audit Report", type: "text", defaultValue: "Auto-generated (142 trades, 0 tampering, 0 gaps, SHA-256 chained, 100% integrity)" },
      { key: "public-verify", label: "Public Verification Endpoint (§3.5.15)", type: "toggle", options: ["Available ✓ (Italy customs can verify Loom hash)", "Disabled"], defaultValue: "Available ✓ (Italy customs can verify Loom hash)" },
    ],
  },
  {
    number: 9, id: "clearance-complete", name: "Clearance Complete (Trade Released + Records Sealed)",
    specRef: "§16.8.6.10, §13", purpose: "Trade cleared. Permits issued. Digital seal applied. Loom verified. Sovereign records sealed. Trade released for export. All parties notified. Closure hash published.",
    icon: CheckCircle2, governorGate: "G5U6 (cleared) + G7 (closure)", creativeFeature: "Full clearance lifecycle summary with fraud scan result",
    aiSuggestion: "CLEARANCE COMPLETE. Trade USTN ...0042 released for export. All conditions met: AI auto-clearance (92%), documents verified (0 discrepancies), fraud/AML CLEAN (5/5 indicators), multi-agency approved (3/3), permits sealed (Ed25519), Loom verified (100%). Sovereign records sealed. Italy customs notified. Closure hash published.\n\nNOTE: Separate SAR for Delta Agro remains pending (human compliance officer review). This trade is clean.",
    fields: [
      { key: "clearance", label: "Clearance Status", type: "toggle", options: ["CLEARED ✓ — trade released for export", "BLOCKED — review required"], defaultValue: "CLEARED ✓ — trade released for export", required: true },
      { key: "fraud-result", label: "Fraud/AML Result (this trade)", type: "text", defaultValue: "CLEAN — 5/5 indicators passed. No money laundering detected for Nile Harvest + Sahara Exports." },
      { key: "sar-note", label: "SAR Status (separate — Delta Ago)", type: "text", defaultValue: "PENDING — SAR draft auto-generated for Delta Ago (unpaid shipments + circular trades). Awaiting human compliance officer approval. This trade is not affected." },
      { key: "parties-notified", label: "All Parties Notified", type: "toggle", options: ["Yes ✓ (buyer, seller, CBR, SHIP, Italy customs)", "No"], defaultValue: "Yes ✓ (buyer, seller, CBR, SHIP, Italy customs)" },
      { key: "closure", label: "Closure Hash Published (Loom)", type: "toggle", options: ["Published", "Pending"], defaultValue: "Published", required: true },
    ],
  },
];

export interface DownstreamPhase {
  phase: string; name: string; specRef: string; status: "complete" | "active" | "pending" | "blocked";
  description: string; governorGate: string; icon: LucideIcon;
}

export const GOV_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  { phase: "Phase 1", name: "Clearance Decision (AI Auto-Clear)", specRef: "§16.8.6.10", status: "complete", description: "AI recommends auto-clear (92% confidence). Risk 72 (low). Sovereign approved.", governorGate: "G5U6", icon: CheckCircle2 },
  { phase: "Phase 2", name: "Document Verification (AI)", specRef: "§16.8.6.10", status: "complete", description: "8/8 documents verified. 0 discrepancies. Confidence 96%. Origin verified.", governorGate: "G5U2", icon: Eye },
  { phase: "Phase 3", name: "Fraud/AML Scan (5/5 CLEAN)", specRef: "§3.5.14, §21.1", status: "complete", description: "5 indicators checked: non-payment CLEAN, unpaid shipment CLEAN, circular CLEAN, velocity CLEAN, price CLEAN. Delta Ago separately flagged.", governorGate: "G1U3 + G5", icon: Radar },
  { phase: "Phase 4", name: "Fraud Alert Network (Delta Ago)", specRef: "§3.5.14", status: "complete", description: "Sellers/buyers notified of Delta Ago scam. Account flagged. Trades blocked. SAR draft generated.", governorGate: "A3", icon: Send },
  { phase: "Phase 5", name: "SAR Auto-Generated (Delta Ago)", specRef: "§3.5.14", status: "active", description: "SAR draft for Delta Ago (unpaid + circular). A1 narrative. 87% confidence. Awaiting human approval.", governorGate: "A3", icon: Gavel },
  { phase: "Phase 6", name: "Multi-Agency Approval", specRef: "§16.8.6.10", status: "pending", description: "Customs approved. Port + Ministry pending. CBE not required. 1/3 approved.", governorGate: "G5U6", icon: Users },
  { phase: "Phase 7", name: "Permit Issuance + Digital Seal", specRef: "§16.8.6.10", status: "pending", description: "Phytosanitary + EUR.1. Ed25519 government seal. Auto-propagated to Italy. Loom appended.", governorGate: "G5U2", icon: Stamp },
  { phase: "Phase 8", name: "Loom Chain Verification", specRef: "§3.5.13", status: "pending", description: "142 trades, 0 tampering, 100% integrity. Sovereign audit report. Public verify endpoint.", governorGate: "G5", icon: FileCheck },
  { phase: "Phase 9", name: "Clearance Complete + Records Sealed", specRef: "§16.8.6.10", status: "pending", description: "Trade released for export. All parties notified. Closure hash published. SAR for Delta Ago separate.", governorGate: "G5U6 + G7", icon: CheckCircle2 },
];

export const GOV_VALIDATION_GATES = [
  { gate: "G5U6", name: "Customs Clearance", description: "AI auto-clearance 92% confidence. Sovereign approved. All checks passed.", status: "pass" },
  { gate: "G5U2", name: "Documents Verified", description: "8/8 documents verified. 0 AI discrepancies. Origin GPS + Loom confirmed.", status: "pass" },
  { gate: "G1U3", name: "Sanctions Clear", description: "GNN scan: Nile Harvest + Sahara Exports 3 hops (safe). Delta Ago flagged (2-hop).", status: "pass" },
  { gate: "G5", name: "Fraud/AML CLEAN", description: "5/5 indicators passed. No money laundering for this trade. Delta Ago separate SAR.", status: "pass" },
  { gate: "A3", name: "SAR Escalation (Delta Ago)", description: "SAR draft auto-generated. A5 forbidden — human compliance officer must approve.", status: "conditional" },
  { gate: "A2", name: "AI Document Check", description: "HF ViT + GNN: 96% document confidence, 87% fraud detection confidence", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "Egyptian Customs Authority (sovereign) confirmed as GOV node", status: "pass" },
  { gate: "§3.5.15", name: "Public Loom Verify", description: "Verification endpoint available for Italy customs to verify this trade's Loom hash", status: "pass" },
];

export const GOV_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  trade: "Frozen Strawberries — 20,000 kg (Egypt → Italy)",
  clearanceStatus: "CLEARED ✓ (auto-clearance 92% confidence, sovereign approved)",
  aiDocumentConfidence: "96% (8/8 verified, 0 discrepancies)",
  fraudAmlResult: "5/5 CLEAN — no money laundering detected for this trade",
  fraudAlertSeparate: "Delta Ago flagged (unpaid shipments + circular trades) — SAR draft pending, sellers/buyers notified",
  sarStatus: "DRAFT auto-generated for Delta Ago (87% confidence, awaiting human approval)",
  multiAgency: "Customs approved, Port + Ministry pending, CBE not required",
  permitsIssued: "Phytosanitary (PHY-2026-0042) + EUR.1 (EUR-2026-0042)",
  digitalSeal: "Ed25519 GOV-SEAL-EG-01 (Nafeza registered, sovereign authority)",
  loomVerified: "142 trades, 0 tampering, 100% integrity",
  partiesNotified: "Buyer (Nile Harvest), Seller (Sahara Exports), CBR (Cairo Customs), SHIP (Maersk), Italy customs",
  publicVerifyEndpoint: "Available (§3.5.15) — Italy customs can verify Loom hash",
  closureHash: "0xd5f1...a7c3 (published on Loom, sovereign record sealed)",
};

export const GOV_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (clearance, documents, fraud scan, multi-agency, permit, Loom, release)", status: "pending" as const },
  { name: "All documents verified (8/8 permits, certificates, declarations, AI-checked)", status: "pending" as const },
  { name: "Fraud/AML scan complete (5/5 indicators passed, no money laundering)", status: "pending" as const },
  { name: "Multi-agency approval complete (all required agencies approved)", status: "pending" as const },
  { name: "Permit sealed with government digital seal (Ed25519, Nafeza registered)", status: "pending" as const },
  { name: "Loom chain verified (142 trades, 0 tampering, 100% integrity)", status: "pending" as const },
  { name: "Sovereign records sealed (closure hash published, public verify endpoint available)", status: "pending" as const },
];

// SVG DATA: Fraud detection radar (5 indicators)
export const FRAUD_RADAR = [
  { indicator: "Non-Payment", score: 95, threshold: 60, status: "clean" },
  { indicator: "Unpaid Shipment", score: 92, threshold: 60, status: "clean" },
  { indicator: "Circular Trades", score: 88, threshold: 60, status: "clean" },
  { indicator: "Velocity", score: 90, threshold: 60, status: "clean" },
  { indicator: "Price Manipulation", score: 94, threshold: 60, status: "clean" },
];

// SVG DATA: Money laundering flow (circular trade detection)
export const ML_FLOW_NODES = [
  { id: "delta", label: "Delta Agro", x: 20, y: 30, type: "flagged", role: "Seller/Buyer (circular)" },
  { id: "nile", label: "Nile Harvest", x: 50, y: 15, type: "involved", role: "Buyer (loop participant)" },
  { id: "mediterra", label: "Mediterra", x: 80, y: 30, type: "involved", role: "Buyer (loop participant)" },
  { id: "payment", label: "Payment Gap", x: 50, y: 55, type: "alert", role: "$5.6K unpaid" },
];

export const ML_FLOW_EDGES = [
  { from: "delta", to: "nile", label: "$420K goods", type: "trade", flagged: false },
  { from: "nile", to: "mediterra", label: "$420K goods", type: "trade", flagged: false },
  { from: "mediterra", to: "delta", label: "$420K (CIRCULAR)", type: "circular", flagged: true },
  { from: "delta", to: "payment", label: "$5.6K unpaid", type: "unpaid", flagged: true },
];

// SVG DATA: Payment settlement verification (buyer pays vs seller receives)
export const PAYMENT_SETTLEMENT = [
  { trade: "...0042", buyer: "Nile Harvest", seller: "Sahara Exports", amount: "$105K", buyerPaid: true, sellerReceived: true, status: "settled" },
  { trade: "...0037", buyer: "Nile Harvest", seller: "Sahara Exports", amount: "$63K", buyerPaid: true, sellerReceived: true, status: "settled" },
  { trade: "...0034", buyer: "Najd Trading", seller: "Sahara Exports", amount: "$88K", buyerPaid: true, sellerReceived: true, status: "settled" },
  { trade: "...0021", buyer: "Delta Foods", seller: "Delta Agro", amount: "$56K", buyerPaid: true, sellerReceived: false, status: "unpaid" },
  { trade: "...0018", buyer: "Mediterra", seller: "Delta Agro", amount: "$42K", buyerPaid: true, sellerReceived: false, status: "unpaid" },
];

// SVG DATA: Fraud alert network (who gets notified)
export const FRAUD_ALERT_NETWORK = [
  { party: "Sahara Exports (Seller)", role: "Warned: Delta Agro has unpaid shipments. Do not extend credit.", priority: 95, notified: true },
  { party: "Nile Harvest (Buyer)", role: "Warned: Circular trade pattern with Delta Agro. Verify payment routes.", priority: 85, notified: true },
  { party: "Delta Agro (Flagged)", role: "Account flagged. New trades blocked pending SAR review.", priority: 99, notified: true },
  { party: "Cairo Amman Bank", role: "SAR draft auto-generated. Monitor settlements.", priority: 90, notified: true },
  { party: "EU Customs Partner", role: "Declassification request for cross-border investigation.", priority: 75, notified: true },
  { party: "Egyptian Customs (Sovereign)", role: "Sovereign records updated. Investigation authorized.", priority: 99, notified: true },
];
