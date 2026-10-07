// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #2: Trader Portal — Seller Workflow Data
// §8 Seller Workflow (Phase 2 — Quote, Packing & Logistics) — 8 steps
// + downstream: Lab Selection → QC Booking → Document Finalisation →
//   Barcode Print → Execution → Settlement → Closure
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, MapPin, DollarSign, Boxes, Truck, Anchor,
  Layers, ArrowRight, FlaskConical, ClipboardCheck,
  FileSignature, Barcode, AlertTriangle, Wallet,
  CheckCircle2, Gavel, Package, Scale, ShieldCheck,
} from "lucide-react";

// ── §8 — 8-STEP SELLER WORKFLOW (form definition per step) ─────────────────
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

export const SELLER_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "receive-review",
    name: "Receive & Review Buyer Request",
    specRef: "§8.1",
    purpose: "Smart Inbox item priority 75. Seller reviews the buyer's 13-section structured trade request before responding.",
    icon: Inbox,
    governorGate: "G1U1–G1U8 (buyer-side, pre-screened)",
    aiSuggestion: "Buyer: Nile Harvest Trading Co. (GTID SGTX-EG-26-NH3T-0042, KYB T3, trust 87). 28 prior trades. Request: 20,000 kg Frozen Strawberries → Italy (Genoa). CIF requested.",
    fields: [
      { key: "buyer", label: "Buyer", type: "select", options: ["Nile Harvest Trading Co. (SGTX-EG-26-NH3T-0042)", "Delta Foods Italia (SGTX-IT-26-DF3A-0021)", "Najd Trading (SGTX-SA-26-NT4K-0009)"], required: true, defaultValue: "Nile Harvest Trading Co. (SGTX-EG-26-NH3T-0042)" },
      { key: "action", label: "Response", type: "radio", options: ["Accept & proceed to quote", "Decline (reason required)", "Counter-offer"], required: true, defaultValue: "Accept & proceed to quote" },
      { key: "review", label: "Request Summary (13 sections)", type: "textarea", defaultValue: "Commodity: Frozen Strawberries IQF, 20,000 kg. Incoterm: CIF (buyer). Transport: Ocean, 2× 40ft Reefer @ -18°C. Lab: 14 mandatory EU MRL. QC: Pre-shipment + Loading. Docs: 8 RIA-required. Criticality: Priority." },
    ],
  },
  {
    number: 2,
    id: "loading-origin",
    name: "Loading Origin",
    specRef: "§8.2",
    purpose: "Seller specifies EXW loading address + GPS coordinates for trucking pickup and geofence validation.",
    icon: MapPin,
    governorGate: "G3U1",
    aiSuggestion: "Detected warehouse: Sahara Cold Storage Facility 3, 6th of October City, GPS 29.9668°N, 30.9443°E. 12km from Cairo QC, 45km from Alexandria port.",
    fields: [
      { key: "warehouse", label: "Loading Warehouse", type: "select", options: ["Sahara Cold Storage #3 (6th of October)", "Sahara Cold Storage #1 (Nasr City)", "Custom address"], required: true, defaultValue: "Sahara Cold Storage #3 (6th of October)" },
      { key: "address", label: "Address", type: "text", defaultValue: "Plot 47, Industrial Zone, 6th of October City, Giza" },
      { key: "gps", label: "GPS Coordinates", type: "text", defaultValue: "29.9668°N, 30.9443°E" },
      { key: "contact", label: "Loading Contact", type: "text", defaultValue: "Mahmoud A. (Warehouse Manager)" },
    ],
  },
  {
    number: 3,
    id: "exw-price-lock",
    name: "EXW Price Lock",
    specRef: "§8.3",
    purpose: "Seller locks EXW price. Recorded in FeeLock instruction. Immutable post-lock. Fair price assessment (A2) validates against anonymised market range.",
    icon: DollarSign,
    governorGate: "G3U6",
    aiSuggestion: "Anonymised market range (90d): $4.10–$4.35/kg. Your $4.20/kg is at 45th percentile. Fair price confirmed (A2, 91% confidence). EXW value: $84,000 (20,000 kg × $4.20).",
    fields: [
      { key: "exw-price", label: "EXW Price (per kg)", type: "number", placeholder: "e.g. 4.20", defaultValue: "4.20", required: true, aiAssist: "A2 fair price" },
      { key: "currency", label: "Currency", type: "select", options: ["USD", "EUR", "EGP"], defaultValue: "USD" },
      { key: "lock", label: "Lock EXW Price (immutable post-lock)", type: "toggle", options: ["Lock now", "Lock later"], defaultValue: "Lock now", required: true },
    ],
  },
  {
    number: 4,
    id: "packing-containerisation",
    name: "Packing & Containerisation",
    specRef: "§8.4",
    purpose: "Packing plan designed; AI Container Advisor validates utilization and equipment compatibility. SSCC pallet labels generated. Non-uniform layer stacking supported.",
    icon: Boxes,
    governorGate: "G3U1",
    aiSuggestion: "Recommended: 2× 40ft Reefer @ -18°C. Stowage factor 1.4. Utilization 92% (optimal). 248 pallets × 80kg. Non-uniform layers validated — no overload. Saves $480 vs 3× 20ft Reefer.",
    fields: [
      { key: "equipment", label: "Equipment (from buyer request)", type: "select", options: ["2× 40ft Reefer @ -18°C (AI recommended)", "3× 20ft Reefer @ -18°C", "1× 40ft HC Reefer + 1× 20ft Reefer"], required: true, defaultValue: "2× 40ft Reefer @ -18°C (AI recommended)" },
      { key: "pallets", label: "Pallet Count", type: "number", defaultValue: "248", required: true },
      { key: "net-weight", label: "Net Weight per Pallet (kg)", type: "number", defaultValue: "80" },
      { key: "layers", label: "Non-Uniform Layer Stacking", type: "toggle", options: ["Enabled (AI validated)", "Disabled (uniform)"], defaultValue: "Enabled (AI validated)" },
      { key: "ssccc", label: "SSCC Label Generation", type: "toggle", options: ["Generate ZPL + PDF (248 labels)", "Generate ZPL only", "Skip"], defaultValue: "Generate ZPL + PDF (248 labels)" },
    ],
  },
  {
    number: 5,
    id: "logistics-builder",
    name: "Logistics Orchestration (3 Modes)",
    specRef: "§8.5",
    purpose: "Mode A: RFQ to 3 LSPs (anonymous comparison). Mode B: Direct to SHIP (contract rate). Mode C: Direct to SHIP seller-managed (max control).",
    icon: Truck,
    governorGate: "G3U1",
    aiSuggestion: "Mode A recommended for this corridor (Alexandria → Genoa). 3 LSPs quoted: Delta $8,200/14d, Cairo Freight $9,100/12d, Nile Transport $8,700/13d. Mode B (Maersk direct) $7,900/14d is cheaper but less flexible.",
    fields: [
      { key: "mode", label: "Logistics Mode", type: "radio", options: ["Mode A — RFQ to 3 LSPs (recommended)", "Mode B — Direct to SHIP (contract rate)", "Mode C — Direct to SHIP (seller-managed)"], required: true, defaultValue: "Mode A — RFQ to 3 LSPs (recommended)" },
      { key: "selected-quote", label: "Selected Quote", type: "select", options: ["Delta Logistics — $8,200 / 14 days", "Cairo Freight — $9,100 / 12 days", "Nile Transport — $8,700 / 13 days", "Maersk (Mode B) — $7,900 / 14 days"], defaultValue: "Delta Logistics — $8,200 / 14 days" },
      { key: "alt-ports", label: "Alternative Delivery Ports Proposed", type: "textarea", defaultValue: "Primary: Genoa (buyer requested). Alternative 1: Naples (+$350, -1 day transit). Alternative 2: La Spezia (-$200, +2 days). Reason: congestion at Genoa predicted Oct 15-20." },
    ],
  },
  {
    number: 6,
    id: "multi-shipment",
    name: "Multi-Shipment Response",
    specRef: "§8.6",
    purpose: "If buyer requested multi-shipment, seller responds per shipment with schedule. Each shipment gets its own USTN at FeeLock.",
    icon: Layers,
    governorGate: "G3U1",
    aiSuggestion: "Buyer requested single shipment (not multi-shipment). This step is N/A — proceed to fee calculation. (If multi-shipment: seller would define 2-6 shipment schedules with ETD/ETA per shipment.)",
    fields: [
      { key: "multi", label: "Multi-Shipment Requested by Buyer?", type: "toggle", options: ["No — single shipment", "Yes — 2 shipments", "Yes — 3-6 shipments"], defaultValue: "No — single shipment" },
      { key: "schedule", label: "Shipment Schedule (if multi)", type: "textarea", placeholder: "Define per-shipment schedule…" },
    ],
  },
  {
    number: 7,
    id: "fee-calculation",
    name: "SGTX Fee Calculation",
    specRef: "§8.8 / §9.27",
    purpose: "Dynamic Fee Engine computes bounded fee (0.03–1.50% of Canonical Fee Basis). Transparent breakdown attached to quote. Buyer sees the full breakdown.",
    icon: Scale,
    governorGate: "G3U6",
    aiSuggestion: "Canonical Fee Basis = $105,100 (EXW $84,000 + mandatory logistics $21,100). Effective rate: 0.144%. SGTX fee: $151.34. Within constitutional bounds. Institutional pricing: Standard (not bulk/essential/special-stock).",
    fields: [
      { key: "basis", label: "Canonical Fee Basis", type: "text", defaultValue: "$105,100 (EXW $84K + logistics $21.1K)", aiAssist: "A4 engine" },
      { key: "rate", label: "Effective Rate", type: "text", defaultValue: "0.144%" },
      { key: "fee", label: "SGTX Trade Fee", type: "text", defaultValue: "$151.34" },
      { key: "breakdown", label: "Fee Breakdown (attached to quote)", type: "textarea", defaultValue: "EXW value: $84,000. Mandatory logistics: $21,100. Canonical Fee Basis: $105,100. Rate: 0.144% (fairness-driven, §9.27). Fee: $151.34. No subscriptions, no per-seat, no infra licensing." },
    ],
  },
  {
    number: 8,
    id: "submit-quote",
    name: "Submit Quote to Buyer",
    specRef: "§8.8",
    purpose: "Quote dispatched to buyer Smart Inbox (priority 75). Buyer reviews: accept, counter, or decline. Governor gate G3 validates canonical workflow order.",
    icon: ArrowRight,
    governorGate: "G3 (Quote Submission)",
    aiSuggestion: "All sections complete. EXW locked ($4.20/kg). Packing validated (92% utilization). Logistics selected (Mode A, Delta $8,200). Fee calculated ($151.34, within bounds). Ready to submit — buyer has 48h to respond.",
    fields: [
      { key: "acknowledge", label: "Acknowledge: submission triggers Governor G3 validation and notifies buyer", type: "toggle", options: ["Acknowledge"], required: true },
      { key: "expiry", label: "Quote Expiry", type: "select", options: ["24 hours", "48 hours", "72 hours", "7 days"], defaultValue: "48 hours" },
      { key: "notify-buyer", label: "Notify buyer (Smart Inbox item, priority 75)", type: "toggle", options: ["Yes"], defaultValue: "Yes" },
    ],
  },
];

// ── DOWNSTREAM PHASES (post-quote submission) ───────────────────────────────
export interface DownstreamPhase {
  phase: string;
  name: string;
  specRef: string;
  status: "complete" | "active" | "pending" | "blocked";
  description: string;
  governorGate: string;
  icon: LucideIcon;
}

export const SELLER_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 2a",
    name: "Quote Submitted to Buyer",
    specRef: "§8.8",
    status: "complete",
    description: "G3 validated canonical workflow order. Quote dispatched to buyer Smart Inbox (priority 75). Buyer has 48h to respond (accept/counter/decline).",
    governorGate: "G3",
    icon: CheckCircle2,
  },
  {
    phase: "Phase 2b",
    name: "Buyer Reviews Quote",
    specRef: "§8.8",
    status: "active",
    description: "Buyer reviewing quote comparison (11-line table: EXW, Incoterm, quantity, equipment, lab tests, QC, docs, delivery, fee, settlement). 1 field differs (Incoterm CFR vs CIF). Clause Forge can draft side-by-side.",
    governorGate: "G3",
    icon: Inbox,
  },
  {
    phase: "Phase 2c",
    name: "Negotiation (Clause Forge)",
    specRef: "§9.1",
    status: "pending",
    description: "If buyer counters on Incoterm (CFR vs CIF), Clause Forge drafts side-by-side comparison. AI-assisted clause drafting. Both parties converge.",
    governorGate: "G3",
    icon: Scale,
  },
  {
    phase: "Phase 3",
    name: "Contract Signing (QES)",
    specRef: "§9.2",
    status: "pending",
    description: "Both parties sign with Qualified Electronic Signature (Egypt Trust). Contract immutable post-signature. SGTX Witness Clause embedded.",
    governorGate: "G3",
    icon: FileSignature,
  },
  {
    phase: "Phase 3d",
    name: "Fee & Lock (USTN Mint)",
    specRef: "§9.27",
    status: "pending",
    description: "Buyer pays fee. Dynamic Fee Engine confirms $151.34 within bounds. FeeLock instruction created. USTN minted (SGTX-EG-26-NH3T-0042). Loom hash appended.",
    governorGate: "G4",
    icon: DollarSign,
  },
  {
    phase: "Phase 4a",
    name: "Laboratory Selection & Testing",
    specRef: "§8.6",
    status: "pending",
    description: "Seller selects ISO 17025 lab (Nile Labs). 14 mandatory EU MRL tests + microbial + nutritional. Results submitted. Certificate auto-triggered via Nafeza on completion.",
    governorGate: "G5U2",
    icon: FlaskConical,
  },
  {
    phase: "Phase 4b",
    name: "QC Inspection",
    specRef: "§8.7",
    status: "pending",
    description: "Cairo QC Services inspects (AQL Level II, 3 AI-recommended points: pre-stuffing, loading, seal). On-device HF ViT defect detection. PASS/FAIL/CONDITIONAL.",
    governorGate: "G5U7",
    icon: ClipboardCheck,
  },
  {
    phase: "Phase 4c",
    name: "Document Finalisation",
    specRef: "§8.8.3",
    status: "pending",
    description: "8 documents generated from trade data. Phytosanitary, COO, EUR.1, Health Cert, Freeze Cert signed with QES. ETA/Nafeza auto-submission triggered.",
    governorGate: "G5U2",
    icon: FileSignature,
  },
  {
    phase: "Phase 4d",
    name: "Barcode Print (SSCC)",
    specRef: "§8.4.3",
    status: "pending",
    description: "248 SSCC pallet labels generated (ZPL + PDF). Printed to Zebra ZT610. Labels required before container stuffing (G5U2).",
    governorGate: "G5U2",
    icon: Barcode,
  },
  {
    phase: "Phase 5",
    name: "Execution (Physical)",
    specRef: "§12",
    status: "pending",
    description: "LSP pickup (Delta Logistics). Ocean freight (Maersk, Alexandria → Genoa). Milestone-gated payments. Geofence + barcode scanning. eBL via CargoX webhook.",
    governorGate: "G5",
    icon: Truck,
  },
  {
    phase: "Phase 6",
    name: "Settlement & Reconciliation",
    specRef: "§13",
    status: "pending",
    description: "ISO 20022 bank settlement (pain.001). Buyer pays $105,100. Reconciliation ≥95% confidence. Funds reflected in seller cash position.",
    governorGate: "G6",
    icon: Wallet,
  },
  {
    phase: "Phase 7-8",
    name: "Closure (Earned)",
    specRef: "§5.10, §14",
    status: "pending",
    description: "All 7 closure conditions true. 26-category evidence package sealed. Loom closure hash published. Distressed cargo & dispute handling available post-closure.",
    governorGate: "G7",
    icon: Gavel,
  },
];

// ── G3 QUOTE SUBMISSION VALIDATION GATES ─────────────────────────────────────
export const QUOTE_VALIDATION_GATES = [
  { gate: "G3U1", name: "Workflow Order Valid", description: "Transport mode selected before containers; Incoterm + settlement captured together; AI Container Advisor ran after mode selection", status: "pass" },
  { gate: "G3U2", name: "Clause Forge Valid", description: "Contract drafted via Clause Forge; SGTX Witness Clause embedded; no conflicting clauses", status: "pass" },
  { gate: "G3U3", name: "QES Valid", description: "Seller QES certificate (Egypt Trust) verified; signature key not revoked", status: "pass" },
  { gate: "G3U4", name: "Both Parties Identified", description: "Buyer GTID + seller GTID verified; KYB tiers sufficient for trade value", status: "pass" },
  { gate: "G3U5", name: "Contract Immutable Ready", description: "Contract will be immutable post-signature; hash chain prepared", status: "pass" },
  { gate: "G3U6", name: "Fee Within Bounds", description: "Dynamic Fee Engine output $151.34 (0.144%) within 0.03–1.50% constitutional bounds", status: "pass" },
  { gate: "G3U7", name: "Lock Authorized", description: "Seller authorized EXW lock; buyer pre-screened (G1U1–G1U8) and pre-cleared (G2)", status: "pass" },
];

// ── QUOTE SUBMITTED SUMMARY (shown after submit) ─────────────────────────────
export const QUOTE_SUMMARY = {
  requestRef: "SGTX-EG-26-NH3T-0042-RQ",
  buyer: "Nile Harvest Trading Co.",
  commodity: "Frozen Strawberries IQF — 20,000 kg",
  exwPrice: "$4.20/kg ($84,000 total)",
  incoterm: "CFR (seller proposed, buyer requested CIF — Clause Forge will resolve)",
  equipment: "2× 40ft Reefer @ -18°C (utilization 92%)",
  logistics: "Mode A — Delta Logistics ($8,200 / 14 days)",
  labTests: "14 mandatory EU MRL + microbial + nutritional (Nile Labs, $1,840)",
  qcInspection: "Pre-shipment + Loading (AQL Level II, Cairo QC Services)",
  documents: "8 documents (Commercial Invoice, Packing List, BL, COO, Phytosanitary, EUR.1, Health Cert, Freeze Cert)",
  deliveryWindow: "2026-10-04 to 2026-10-25",
  sgtxFee: "$151.34 (0.144% of $105,100 Canonical Fee Basis)",
  quoteExpiry: "48 hours from submission",
};

// ── CLOSURE CONDITIONS (§5.10 — 7 conditions, seller perspective) ───────────
export const SELLER_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (pickup, departure, arrival, delivery)", status: "pending" as const },
  { name: "All documents verified (8 RIA-required + QES signed)", status: "pending" as const },
  { name: "All payments settled (fee + ISO 20022 settlement $105,100)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence", status: "pending" as const },
  { name: "No open disputes", status: "pending" as const },
  { name: "No open exceptions (lab QC, customs, logistics)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories)", status: "pending" as const },
];
