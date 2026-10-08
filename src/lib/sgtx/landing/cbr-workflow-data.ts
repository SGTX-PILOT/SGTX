// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #7: CBR Workflow Data
// Customs broker journey: Cert Request → Declaration Prep → Physical Docs →
// Digital Seal → Nafeza Filing → Customs Clearance → Audit → Storage → Settlement
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, FileText, ScanLine, Stamp, Landmark,
  CheckCircle2, Gavel, Archive, DollarSign,
  Clock, AlertTriangle, ShieldAlert, Wallet,
  Award, FileSignature, Package, Scale, Eye,
} from "lucide-react";

// ── 9-STEP CBR WORKFLOW (form definition per step) ──────────────────────────
export interface FormField {
  key: string;
  label: string;
  type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle";
  options?: string[];
  placeholder?: string;
  aiAssist?: string;
  defaultValue?: string;
  required?: boolean;
}

export interface WorkflowStep {
  number: number;
  id: string;
  name: string;
  specRef: string;
  purpose: string;
  icon: LucideIcon;
  fields: FormField[];
  aiSuggestion?: string;
  governorGate?: string;
}

export const CBR_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "cert-request-received",
    name: "Certification Request Received",
    specRef: "§16.8.6.7",
    purpose: "Seller/buyer requests customs declaration filing. Review trade data, HS code, origin/destination, declared value. Confirm CBR license covers the corridor.",
    icon: Inbox,
    governorGate: "G1U1 (identity verified)",
    aiSuggestion: "Cert request from Sahara Exports: Frozen Strawberries 20,000 kg → Italy (EU). HS 0811.10.00 (5% EU duty). Value: $84,000 EXW → $105,100 CIF. License verified (Egypt→EU corridor). 8 documents required. Fee: $420.",
    fields: [
      { key: "request", label: "Certification Request Source", type: "select", options: ["Sahara Exports (Mode B — seller selection)", "Nile Harvest Trading (buyer direct)", "Delta Agro (Mode B)"], required: true, defaultValue: "Sahara Exports (Mode B — seller selection)" },
      { key: "commodity", label: "Commodity", type: "text", defaultValue: "Frozen Strawberries — 20,000 kg" },
      { key: "hs-code", label: "HS Code (preliminary)", type: "text", defaultValue: "0811.10.00 (Frozen Strawberries)" },
      { key: "origin-dest", label: "Origin → Destination", type: "text", defaultValue: "Egypt → Italy (EU)" },
      { key: "value", label: "Declared Value", type: "text", defaultValue: "$84,000 EXW → $105,100 CIF" },
      { key: "license-check", label: "CBR License Verified", type: "toggle", options: ["Yes — Egypt→EU corridor covered", "No — corridor not covered"], defaultValue: "Yes — Egypt→EU corridor covered", required: true },
      { key: "accept", label: "Accept Certification Request", type: "toggle", options: ["Accept & start declaration", "Decline"], defaultValue: "Accept & start declaration", required: true },
    ],
  },
  {
    number: 2,
    id: "declaration-prep",
    name: "Declaration Preparation (HS + Duty + Documents)",
    specRef: "§16.8.6.7",
    purpose: "Verify HS code via RIA (strictest jurisdiction rule). Calculate duty (EU preferential with EUR.1). Compile document checklist (8 documents required for EU destination).",
    icon: FileText,
    governorGate: "G1U6 (intent consistent)",
    aiSuggestion: "HS code verified: 0811.10.00 (Frozen Strawberries, EU duty 5.4%, preferential 5% with EUR.1). Duty: $5,255 (5% of $105,100 CIF). 8 documents required: Commercial Invoice, Packing List, BL, COO, Phytosanitary, EUR.1, Health Cert, Freeze Cert.",
    fields: [
      { key: "hs-verified", label: "HS Code Verification (RIA)", type: "toggle", options: ["Verified — 0811.10.00 (Frozen Strawberries)", "Disputed — seller claims 0811.90.00 (other, 3%)"], defaultValue: "Verified — 0811.10.00 (Frozen Strawberries)", required: true },
      { key: "duty-calc", label: "Duty Calculation", type: "text", defaultValue: "$5,255 (5% EU preferential rate, EUR.1 applied, CIF basis $105,100)" },
      { key: "documents", label: "Document Checklist (8 required)", type: "textarea", defaultValue: "1. Commercial Invoice (signed), 2. Packing List, 3. Bill of Lading (eBL MAEU-2026-0042), 4. Certificate of Origin, 5. Phytosanitary Certificate, 6. EUR.1 Movement Certificate, 7. Health Certificate, 8. Freeze Certificate" },
      { key: "ria-jurisdiction", label: "Applicable Jurisdiction (RIA)", type: "text", defaultValue: "EU (Italy destination) — strictest rule applies (§3 Pillar III)" },
      { key: "ready", label: "Declaration Ready for Filing", type: "toggle", options: ["Ready — all documents verified", "Pending — 2 documents missing"], defaultValue: "Ready — all documents verified", required: true },
    ],
  },
  {
    number: 3,
    id: "physical-docs",
    name: "Physical Document Processing (QR + GPS)",
    specRef: "§16.8.6.7",
    purpose: "Physical courier package arrives with original documents. QR scan each document, GPS stamp the receipt location, capture photos. Chain-of-custody preserved.",
    icon: ScanLine,
    governorGate: "G5U2 (document — physical) + G5U3 (external fact — GPS)",
    aiSuggestion: "DHL courier delivered 4 original documents (Phytosanitary, Health Cert, Commercial Invoice, Packing List). QR scanned all 4 ✓. GPS stamped at Cairo office (30.0444°N, 31.2357°E). 4 photos captured. Chain-of-custody: courier → CBR office. Dispatch to Nafeza within 24h.",
    fields: [
      { key: "courier", label: "Courier", type: "select", options: ["DHL Egypt", "Aramex", "FedEx", "Internal collection"], defaultValue: "DHL Egypt", required: true },
      { key: "documents-received", label: "Documents Received", type: "text", defaultValue: "4 originals (Phytosanitary, Health Cert, Commercial Invoice, Packing List)" },
      { key: "qr-scan", label: "QR Scanning", type: "toggle", options: ["All 4 scanned ✓", "Scanning in progress...", "Failed"], defaultValue: "All 4 scanned ✓", required: true },
      { key: "gps-stamp", label: "GPS Stamp", type: "text", defaultValue: "30.0444°N, 31.2357°E (Cairo CBR office)" },
      { key: "photos", label: "Photo Capture", type: "text", defaultValue: "4 photos (one per document, AR-annotated)" },
      { key: "chain-of-custody", label: "Chain-of-Custody", type: "toggle", options: ["Verified (courier + CBR dual signature)", "Pending"], defaultValue: "Verified (courier + CBR dual signature)", required: true },
    ],
  },
  {
    number: 4,
    id: "digital-seal",
    name: "Digital Seal Application (Ed25519 + Nafeza)",
    specRef: "§16.8.6.7",
    purpose: "Apply Ed25519 digital seal to declaration. Seal registered with Nafeza. Seal verifies CBR identity + license + timestamp. Seal expires 2026-10-01 (12 days remaining).",
    icon: Stamp,
    governorGate: "G5U2 (document — digitally sealed)",
    aiSuggestion: "Digital seal applied: Ed25519 (key ID CBR-2026-0052-SEAL-02). Registered with Nafeza. Seal verifies: CBR identity (Cairo Customs Brokers, GTID SGTX-EG-26-CC3A-0052), license #CBR-2026-0052, timestamp 2026-09-18 15:30 EET. Seal expires 2026-10-01 (12 days remaining). 3 pending declarations need re-sign before expiry.",
    fields: [
      { key: "seal-type", label: "Seal Type", type: "text", defaultValue: "Ed25519 (registered with Nafeza)" },
      { key: "key-id", label: "Key ID", type: "text", defaultValue: "CBR-2026-0052-SEAL-02" },
      { key: "apply", label: "Apply Digital Seal", type: "toggle", options: ["Applied ✓ (identity + license + timestamp verified)", "Failed — seal expired", "Pending"], defaultValue: "Applied ✓ (identity + license + timestamp verified)", required: true },
      { key: "expiry", label: "Seal Expiry", type: "text", defaultValue: "2026-10-01 (12 days remaining — re-sign required before expiry)" },
      { key: "nafeza-registered", label: "Nafeza Registration", type: "toggle", options: ["Registered ✓", "Pending"], defaultValue: "Registered ✓", required: true },
    ],
  },
  {
    number: 5,
    id: "nafeza-filing",
    name: "Nafeza Filing (Customs Declaration + ACI)",
    specRef: "§16.8.6.7",
    purpose: "File customs declaration on Nafeza (Egyptian Single Window). Auto-trigger ACI pre-arrival for destination. Filing timestamp recorded. Tracking number issued.",
    icon: Landmark,
    governorGate: "G5U2 (document — filed) + G5U6 (customs)",
    aiSuggestion: "Declaration DEC-2026-0042 filed on Nafeza at 2026-09-18 15:35 EET. Tracking: NAZE-2026-0042. HS 0811.10.00. Value $105,100 CIF. Duty $5,255. Digital seal verified. ACI pre-arrival auto-triggered for Italy (Genoa). Filing acknowledged by Egyptian Customs Authority.",
    fields: [
      { key: "declaration-id", label: "Declaration ID", type: "text", defaultValue: "DEC-2026-0042" },
      { key: "tracking", label: "Nafeza Tracking Number", type: "text", defaultValue: "NAZE-2026-0042" },
      { key: "file", label: "File Declaration on Nafeza", type: "toggle", options: ["Filed ✓ (acknowledged by Egyptian Customs)", "Filing in progress...", "Rejected — errors found"], defaultValue: "Filed ✓ (acknowledged by Egyptian Customs)", required: true },
      { key: "aci", label: "ACI Pre-Arrival (Auto-Triggered)", type: "toggle", options: ["Filed ✓ (for Italy/Genoa destination, 24h before arrival)", "Pending"], defaultValue: "Filed ✓ (for Italy/Genoa destination, 24h before arrival)" },
      { key: "filing-timestamp", label: "Filing Timestamp", type: "text", defaultValue: "2026-09-18 15:35 EET" },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Appended ✓ (immutable audit)", "Pending"], defaultValue: "Appended ✓ (immutable audit)" },
    ],
  },
  {
    number: 6,
    id: "customs-clearance",
    name: "Customs Clearance Tracking",
    specRef: "§16.8.6.7",
    purpose: "Track clearance status on Nafeza. Auto-clearance recommendation via AI (A2). Exception handling if flagged. Clearance timeline: filed → under review → cleared or audit.",
    icon: CheckCircle2,
    governorGate: "G5U6 (customs cleared)",
    aiSuggestion: "Clearance status: under review. Nafeza AI (A2) recommends auto-clearance (92% confidence — no risk flags, clean sanctions, compliant HS, correct duty). Expected clearance: 2026-09-19 06:00 EET. If flagged: audit triggered (see Step 7).",
    fields: [
      { key: "status", label: "Clearance Status", type: "select", options: ["Filed (under review)", "Auto-cleared ✓ (A2 recommended, 92% confidence)", "Flagged for audit", "Cleared (manual review passed)"], defaultValue: "Filed (under review)", required: true },
      { key: "ai-recommendation", label: "AI Auto-Clearance (A2)", type: "text", defaultValue: "Recommend auto-clearance (92% confidence — no risk flags)" },
      { key: "timeline", label: "Expected Clearance Timeline", type: "text", defaultValue: "Filed 15:35 → Under review → Expected cleared 2026-09-19 06:00 (14h)" },
      { key: "exceptions", label: "Exception Handling", type: "toggle", options: ["None (clean filing)", "Flagged — audit triggered", "HS code disputed"], defaultValue: "None (clean filing)" },
    ],
  },
  {
    number: 7,
    id: "audit-representation",
    name: "Audit Representation (if flagged)",
    specRef: "§16.8.6.7",
    purpose: "If customs flags for audit: represent client as legal point of contact. Prepare defense (valuation, HS code, origin). Attend hearing. Defend declared value and classification.",
    icon: Gavel,
    governorGate: "G5 (audit flag enforcement)",
    aiSuggestion: "Not applicable for this declaration (clean filing, auto-clearance recommended). If flagged: you are the legal point of contact. Prepare defense using: comparable trade invoices, market analysis, HS code RIA verification. Hearing at Customs House. Previous audit case: USTN ...0028-3 (valuation audit, hearing 2026-09-25).",
    fields: [
      { key: "audit-triggered", label: "Customs Audit Triggered?", type: "toggle", options: ["No — clean filing, auto-clearance recommended", "Yes — valuation audit", "Yes — HS code audit", "Yes — origin audit"], defaultValue: "No — clean filing, auto-clearance recommended" },
      { key: "role", label: "Your Role", type: "text", defaultValue: "Legal point of contact (licensed CBR, license #CBR-2026-0052)" },
      { key: "defense-prep", label: "Defense Preparation (if audited)", type: "textarea", defaultValue: "If flagged: prepare using comparable trade invoices (3+), market analysis, HS code RIA verification, origin documentation. Attend hearing at Customs House." },
      { key: "hearing", label: "Hearing Date (if audited)", type: "text", defaultValue: "— (not applicable — clean filing)" },
    ],
  },
  {
    number: 8,
    id: "storage-management",
    name: "Storage Management (5-Year Retention)",
    specRef: "§16.8.6.7",
    purpose: "File physical + digital documents in storage. 5-year retention per Egyptian customs law. Expiry tracking. Document count logged. Archive or destroy at expiry.",
    icon: Archive,
    governorGate: "G5U2 (document — stored)",
    aiSuggestion: "Documents stored: 4 physical originals + 8 digital copies (declaration, eBL, certificates, invoices, packing list). Storage location: Cairo CBR office, Cabinet B-07. Retention expiry: 2031-09-18 (5 years). 12 documents total. Expiry alert will trigger 90 days before.",
    fields: [
      { key: "physical-storage", label: "Physical Storage", type: "text", defaultValue: "Cairo CBR office, Cabinet B-07 (4 originals)" },
      { key: "digital-storage", label: "Digital Storage", type: "text", defaultValue: "SGTX Loom + Nafeza digital vault (8 digital copies)" },
      { key: "document-count", label: "Document Count", type: "number", defaultValue: "12", required: true },
      { key: "retention", label: "Retention Period", type: "text", defaultValue: "5 years per Egyptian customs law (expires 2031-09-18)" },
      { key: "expiry-alert", label: "Expiry Alert Setup", type: "toggle", options: ["Yes — alert 90 days before expiry", "No"], defaultValue: "Yes — alert 90 days before expiry" },
    ],
  },
  {
    number: 9,
    id: "settlement",
    name: "Brokerage Fee Settlement (ISO 20022)",
    specRef: "§13",
    purpose: "Brokerage fee $420 settled via ISO 20022 (pain.001). Reconciliation ≥95%. SLA credit if filing late. Closure hash published. Documents retained for 5 years.",
    icon: DollarSign,
    governorGate: "G6 (settlement) + G7 (closure)",
    aiSuggestion: "Brokerage fee $420 settled via pain.001 (CBE clearing). Reconciliation 100%. SLA credit: $0 (filed within 2h, well within 24h SLA). Declaration filed on Nafeza, cleared, documents stored. Closure hash published. Loom audit complete. 5-year retention active.",
    fields: [
      { key: "invoice", label: "Brokerage Fee Invoice", type: "text", defaultValue: "INV-CBR-2026-0042 ($420 — declaration filing + clearance processing)" },
      { key: "settlement", label: "ISO 20022 Settlement", type: "toggle", options: ["Confirmed (pain.001, CBE clearing)", "Pending"], defaultValue: "Confirmed (pain.001, CBE clearing)", required: true },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "100% (≥95% threshold — passed)" },
      { key: "sla", label: "SLA Credit Applied", type: "toggle", options: ["$0 (filed within 2h, well within 24h SLA)", "$210 (filing late, 50% refund)"], defaultValue: "$0 (filed within 2h, well within 24h SLA)" },
      { key: "retention-active", label: "5-Year Retention Active", type: "toggle", options: ["Active (expires 2031-09-18)", "N/A"], defaultValue: "Active (expires 2031-09-18)" },
      { key: "closure", label: "Closure Hash Published (Loom)", type: "toggle", options: ["Published", "Pending"], defaultValue: "Published", required: true },
    ],
  },
];

// ── DOWNSTREAM PHASES (post-settlement) ─────────────────────────────────────
export interface DownstreamPhase {
  phase: string;
  name: string;
  specRef: string;
  status: "complete" | "active" | "pending" | "blocked";
  description: string;
  governorGate: string;
  icon: LucideIcon;
}

export const CBR_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Certification Request Received",
    specRef: "§16.8.6.7",
    status: "complete",
    description: "Request from Sahara Exports: Frozen Strawberries → Italy. HS 0811.10.00. Value $105,100 CIF. License verified. Fee $420.",
    governorGate: "G1U1",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "Declaration Prepared",
    specRef: "§16.8.6.7",
    status: "complete",
    description: "HS verified, duty $5,255 (5% EU preferential, EUR.1), 8 documents compiled, RIA jurisdiction EU confirmed.",
    governorGate: "G1U6",
    icon: FileText,
  },
  {
    phase: "Phase 3",
    name: "Physical Documents Processed (QR+GPS)",
    specRef: "§16.8.6.7",
    status: "complete",
    description: "4 originals QR-scanned + GPS-stamped at Cairo office. 4 photos. Chain-of-custody verified.",
    governorGate: "G5U2 + G5U3",
    icon: ScanLine,
  },
  {
    phase: "Phase 4",
    name: "Digital Seal Applied (Ed25519+Nafeza)",
    specRef: "§16.8.6.7",
    status: "complete",
    description: "Ed25519 seal applied. Identity + license + timestamp verified. Nafeza registered. Expires 2026-10-01 (12 days).",
    governorGate: "G5U2",
    icon: Stamp,
  },
  {
    phase: "Phase 5",
    name: "Nafeza Filing (Declaration + ACI)",
    specRef: "§16.8.6.7",
    status: "complete",
    description: "DEC-2026-0042 filed on Nafeza. Tracking NAZE-2026-0042. ACI pre-arrival filed for Italy. Loom hash appended.",
    governorGate: "G5U2 + G5U6",
    icon: Landmark,
  },
  {
    phase: "Phase 6",
    name: "Customs Clearance (Under Review)",
    specRef: "§16.8.6.7",
    status: "active",
    description: "Under review on Nafeza. AI recommends auto-clearance (92% confidence). Expected cleared 2026-09-19 06:00 (14h).",
    governorGate: "G5U6",
    icon: CheckCircle2,
  },
  {
    phase: "Phase 7",
    name: "Audit Representation (if flagged)",
    specRef: "§16.8.6.7",
    status: "pending",
    description: "Not applicable (clean filing). If flagged: legal point of contact, defense preparation, hearing at Customs House.",
    governorGate: "G5",
    icon: Gavel,
  },
  {
    phase: "Phase 8",
    name: "Storage Management (5-Year Retention)",
    specRef: "§16.8.6.7",
    status: "pending",
    description: "4 physical + 8 digital documents stored. Cabinet B-07. Retention expires 2031-09-18. Expiry alert 90 days before.",
    governorGate: "G5U2",
    icon: Archive,
  },
  {
    phase: "Phase 9",
    name: "Brokerage Fee Settlement (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "Fee $420 settled via pain.001 (CBE). Reconciliation 100%. SLA $0 (filed within 2h). Closure hash published. 5-year retention active.",
    governorGate: "G6 + G7",
    icon: DollarSign,
  },
];

// ── G5 VALIDATION GATES (Nafeza filing) ──────────────────────────────────────
export const CBR_VALIDATION_GATES = [
  { gate: "G5U1", name: "Milestone Valid", description: "Cert request accepted, CBR license verified, HS code prelim verified, corridor covered", status: "pass" },
  { gate: "G5U2", name: "Document Uploaded", description: "Declaration + 8 supporting documents + QR scans + GPS stamp + digital seal applied", status: "pass" },
  { gate: "G5U3", name: "External Fact Reconciled", description: "GPS stamp at Cairo office (30.0444°N, 31.2357°E) reconciled with courier delivery", status: "pass" },
  { gate: "G5U4", name: "Payment Authorized", description: "Brokerage fee FeeLock ACTIVE ($420, ISO 20022 pending)", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "Cairo Customs Brokers (SGTX-EG-26-CC3A-0052) confirmed as CBR; license #CBR-2026-0052 verified", status: "pass" },
  { gate: "G5U6", name: "Customs Clearance", description: "PENDING — declaration filed on Nafeza, under review, auto-clearance recommended (92%)", status: "pending" },
  { gate: "G5U7", name: "QC Inspection", description: "N/A for CBR (QC is QC portal responsibility)", status: "n/a" },
  { gate: "G5U8", name: "Lab Results In", description: "N/A for CBR (lab tests are LAB portal responsibility)", status: "n/a" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const CBR_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  certRequest: "CERT-2026-0042",
  declarationId: "DEC-2026-0042",
  nafezaTracking: "NAZE-2026-0042",
  seller: "Sahara Exports",
  commodity: "Frozen Strawberries — 20,000 kg",
  hsCode: "0811.10.00 (Frozen Strawberries)",
  origin: "Egypt",
  destination: "Italy (EU)",
  declaredValue: "$84,000 EXW → $105,100 CIF",
  duty: "$5,255 (5% EU preferential, EUR.1 applied)",
  documentsProcessed: "4 physical (QR+GPS) + 8 digital = 12 total",
  digitalSeal: "Ed25519 (CBR-2026-0052-SEAL-02, expires 2026-10-01)",
  filingTimestamp: "2026-09-18 15:35 EET",
  clearanceStatus: "Under review (auto-clearance recommended 92%)",
  auditRequired: "No (clean filing)",
  storageLocation: "Cairo CBR office, Cabinet B-07 + Nafeza digital vault",
  retentionExpiry: "2031-09-18 (5 years per Egyptian customs law)",
  brokerageFee: "$420",
  slaCredit: "$0 (filed within 2h of 24h SLA)",
  netReceived: "$420",
  reconciliation: "100% (≥95% threshold — passed)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0xe2c9...4b61 (published on Loom)",
};

// ── CLOSURE CONDITIONS (CBR perspective) ───────────────────────────────────
export const CBR_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (cert request, declaration, physical docs, seal, filing, clearance)", status: "pending" as const },
  { name: "All documents verified (declaration, 8 supporting, QR scans, GPS, digital seal)", status: "pending" as const },
  { name: "All payments settled (brokerage fee $420 via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (100% achieved)", status: "pending" as const },
  { name: "No open disputes (HS code may be disputed by seller)", status: "pending" as const },
  { name: "No open exceptions (customs clearance must complete, no audit flag)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, CBR subset: declaration + QR + GPS + seal)", status: "pending" as const },
];
