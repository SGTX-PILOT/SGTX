// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #1: Trader Portal — Buyer Workflow Data
// §6 Buyer Workflow (Phase 1 — Trade Initiation) — 13 sections
// + downstream phases: Quote → Negotiation → Contract → Fee/Lock → USTN →
//   Execution → Settlement → Reconciliation → Closure
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Users, Handshake, Truck, Container, FlaskConical,
  ClipboardCheck, BrainCog, FileText, ShieldCheck, Timer,
  AlertTriangle, Database, ArrowRight, FileSignature,
  DollarSign, Package, Scale, CheckCircle2, Gavel,
} from "lucide-react";

// ── §6 — 13-SECTION TRADE REQUEST (form definition per section) ─────────────
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

export const BUYER_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "seller-selection",
    name: "Seller Selection",
    specRef: "§6.2.1",
    purpose: "Select a saved contact or enter an explicit GTID invitation. Non-marketplace — no provider suggestions, no rankings.",
    icon: Users,
    governorGate: "G1U1",
    aiSuggestion: "3 saved contacts match the commodity 'Frozen Strawberries' (Sahara Exports, Delta Agro, Mediterra Foods).",
    fields: [
      { key: "seller", label: "Seller", type: "select", options: ["Sahara Exports (SGTX-EG-26-SX7K-0008)", "Delta Agro (SGTX-EG-26-DA2F-0014)", "Mediterra Foods (SGTX-IT-26-MF19-0021)", "Enter explicit GTID…"], required: true, defaultValue: "Sahara Exports (SGTX-EG-26-SX7K-0008)" },
      { key: "relationship", label: "Existing Relationship", type: "toggle", options: ["Yes — 28 prior trades", "No — first trade"], defaultValue: "Yes — 28 prior trades" },
    ],
  },
  {
    number: 2,
    id: "incoterm",
    name: "Incoterm + Commercial Foundation",
    specRef: "§6.2.2",
    purpose: "Incoterm 2020 selection; settlement structure captured together. SGTX Fee is engine-determined on (EXW + Mandatory Logistics).",
    icon: Handshake,
    governorGate: "G1U6",
    aiSuggestion: "CFR recommended for this corridor (Alexandria → Genoa). Estimated Canonical Fee Basis: $105,100. Indicative fee (0.144%): $151.34.",
    fields: [
      { key: "incoterm", label: "Incoterm 2020", type: "select", options: ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"], required: true, defaultValue: "CFR" },
      { key: "settlement", label: "Settlement Structure", type: "radio", options: ["Single payment at closure", "Milestone-gated (deferred)", "Multi-shipment schedule"], required: true, defaultValue: "Milestone-gated (deferred)" },
      { key: "currency", label: "Settlement Currency", type: "select", options: ["USD", "EUR", "EGP", "SAR", "AED"], defaultValue: "USD" },
    ],
  },
  {
    number: 3,
    id: "transport-mode",
    name: "Transport Mode & Equipment",
    specRef: "§6.2.6",
    purpose: "Mode is selected BEFORE containers/units (canonical workflow order). Equipment types load dynamically based on mode.",
    icon: Truck,
    governorGate: "G1U6",
    aiSuggestion: "Ocean freight recommended for Alexandria → Genoa. Transit ~14 days. 3 vessels/week available.",
    fields: [
      { key: "mode", label: "Transport Mode", type: "radio", options: ["Ocean", "Air", "Rail", "Truck", "RoRo", "Multimodal"], required: true, defaultValue: "Ocean" },
      { key: "equipment", label: "Equipment Type (dynamic)", type: "select", options: ["20ft Standard", "40ft Standard", "40ft High-Cube", "20ft Reefer", "40ft Reefer", "40ft HC Reefer", "Open Top", "Flat Rack", "Tank"], required: true, defaultValue: "40ft Reefer" },
      { key: "count", label: "Equipment Count", type: "number", placeholder: "1–50", defaultValue: "2", required: true },
    ],
  },
  {
    number: 4,
    id: "commodity",
    name: "Container/Unit & Commodity Configuration",
    specRef: "§6.2.7",
    purpose: "Define physical units and goods with mode-aware configuration. HS code resolves two-way via A2 Product Form Agent.",
    icon: Container,
    governorGate: "G1U6",
    aiSuggestion: "HS Code 0811.10.00 (Frozen Strawberries) resolved. EU MRL panel mandatory for EU destination (§6.5).",
    fields: [
      { key: "origin", label: "Origin Country", type: "select", options: ["Egypt", "Italy", "Saudi Arabia", "UAE", "Turkey"], defaultValue: "Egypt", required: true },
      { key: "destination", label: "Destination Country", type: "select", options: ["Italy", "Egypt", "Saudi Arabia", "UAE", "Germany"], defaultValue: "Italy", required: true },
      { key: "port", label: "Port of Discharge", type: "select", options: ["Genoa", "Naples", "Hamburg", "Jebel Ali", "Jeddah"], defaultValue: "Genoa", required: true },
      { key: "hscode", label: "Product / HS Code", type: "smart", placeholder: "Search product name or HS code…", defaultValue: "0811.10.00 — Frozen Strawberries", aiAssist: "A2 Product Form Agent", required: true },
      { key: "quantity", label: "Quantity", type: "number", placeholder: "e.g. 20000", defaultValue: "20000", required: true },
      { key: "unit", label: "Unit", type: "select", options: ["MT", "KG", "LB", "Pieces", "Cartons"], defaultValue: "KG", required: true },
      { key: "tolerance", label: "Tolerance", type: "select", options: ["±2%", "±3%", "±5%", "±7%", "±10%", "Custom"], defaultValue: "±5%" },
      { key: "packaging", label: "Packaging", type: "select", options: ["Bulk", "Bagged", "Palletized", "Drummed", "IBC", "Custom"], defaultValue: "Palletized" },
    ],
  },
  {
    number: 5,
    id: "lab-tests",
    name: "Lab Test Requirements",
    specRef: "§6.2.8",
    purpose: "Mandatory, recommended, and optional tests are explicit, RIA-driven, and priced transparently at request time.",
    icon: FlaskConical,
    governorGate: "G1U6",
    aiSuggestion: "14 mandatory tests for EU destination (EU MRL pesticides + microbial + nutritional). 3 recommended (heavy metals, mycotoxins, GMO).",
    fields: [
      { key: "mandatory", label: "Mandatory Tests (RIA-driven)", type: "textarea", defaultValue: "EU MRL Pesticides Panel (14 analytes), Total Plate Count, Yeast & Mold, Coliforms, E. coli, Salmonella" },
      { key: "recommended", label: "Recommended Tests", type: "textarea", defaultValue: "Heavy Metals (Pb, Cd, Hg, As), Aflatoxins (B1, B2, G1, G2), GMO Screen" },
      { key: "lab", label: "Preferred Lab", type: "select", options: ["Nile Labs (SGTX-EG-26-NL8B-0044)", "Alexandria Testing Center", "Auto-select nearest accredited"], defaultValue: "Nile Labs (SGTX-EG-26-NL8B-0044)" },
    ],
  },
  {
    number: 6,
    id: "qc-inspection",
    name: "QC Inspection Request",
    specRef: "§6.2.9",
    purpose: "Geographically-aware: provider coverage validated before request accepted. Prevents inspection requests where no inspector exists.",
    icon: ClipboardCheck,
    governorGate: "G1U6",
    aiSuggestion: "Coverage validated: 2 QC providers within 50km of origin (Cairo). AQL Level II, single sampling.",
    fields: [
      { key: "inspection-type", label: "Inspection Type", type: "select", options: ["Pre-shipment", "Loading supervision", "Pre-shipment + Loading", "Container stuffing"], defaultValue: "Pre-shipment + Loading", required: true },
      { key: "aql", label: "AQL Sampling Level", type: "select", options: ["Level I (reduced)", "Level II (normal)", "Level III (tightened)"], defaultValue: "Level II (normal)", required: true },
      { key: "provider", label: "QC Provider", type: "select", options: ["Cairo QC Services", "Delta Inspection", "Auto-select nearest accredited"], defaultValue: "Auto-select nearest accredited" },
    ],
  },
  {
    number: 7,
    id: "ai-container-advisor",
    name: "AI Container Advisor",
    specRef: "§6.2.10",
    purpose: "Runs AFTER transport mode selection (canonical order). A2 validates packing efficiency and equipment compatibility.",
    icon: BrainCog,
    governorGate: "G1U6",
    aiSuggestion: "Recommended: 2× 40ft Reefer @ -18°C. Stowage factor 1.4. Utilization 92%. Saves $480 vs 3× 20ft Reefer.",
    fields: [
      { key: "advisor", label: "AI Recommendation", type: "textarea", defaultValue: "2× 40ft Reefer @ -18°C — utilization 92%, cost-optimal" },
      { key: "accept", label: "Accept AI Recommendation", type: "toggle", options: ["Accept", "Override (reason required)"], defaultValue: "Accept" },
    ],
  },
  {
    number: 8,
    id: "documentation",
    name: "Documentation Requirements",
    specRef: "§6.2.11",
    purpose: "Per-jurisdiction document list (commercial, transport, customs, certificates). RIA-driven for destination.",
    icon: FileText,
    governorGate: "G1U6",
    aiSuggestion: "EU destination requires: Phytosanitary Certificate, EUR.1 movement certificate, COO, Commercial Invoice, Packing List, BL, Health Certificate.",
    fields: [
      { key: "docs", label: "Required Documents (RIA-driven)", type: "textarea", defaultValue: "Commercial Invoice, Packing List, Bill of Lading, Certificate of Origin, Phytosanitary Certificate, EUR.1, Health Certificate, Freeze Certificate" },
      { key: "additional", label: "Additional Documents", type: "textarea", placeholder: "Add any buyer-specific documents…" },
    ],
  },
  {
    number: 9,
    id: "insurance",
    name: "Insurance Requirements",
    specRef: "§6.2.12",
    purpose: "Cargo, marine, brokerage insurance — provider relationships required.",
    icon: ShieldCheck,
    governorGate: "G1U6",
    aiSuggestion: "CFR requires buyer-side marine insurance. Optional cargo insurance recommended (110% CIF value).",
    fields: [
      { key: "cargo-insurance", label: "Cargo Insurance", type: "select", options: ["Required — buyer arranges", "Seller arranges (optional)", "Not required"], defaultValue: "Required — buyer arranges", required: true },
      { key: "marine-insurance", label: "Marine Insurance", type: "toggle", options: ["Yes", "No"], defaultValue: "Yes" },
      { key: "insurer", label: "Insurer", type: "select", options: ["Misr Insurance", "AXA", "Allianz", "Self-insured"], defaultValue: "Misr Insurance" },
    ],
  },
  {
    number: 10,
    id: "delivery-window",
    name: "Delivery Window & Special Instructions",
    specRef: "§6.2.13",
    purpose: "Earliest/latest shipment dates; handling instructions.",
    icon: Timer,
    governorGate: "G1U6",
    aiSuggestion: "Vessel schedule: MV Maersk Genoa, ETD Alexandria 2026-10-04, ETA Genoa 2026-10-18. Book within 5 days.",
    fields: [
      { key: "earliest", label: "Earliest Shipment Date", type: "text", placeholder: "YYYY-MM-DD", defaultValue: "2026-10-04", required: true },
      { key: "latest", label: "Latest Shipment Date", type: "text", placeholder: "YYYY-MM-DD", defaultValue: "2026-10-25", required: true },
      { key: "instructions", label: "Special Instructions", type: "textarea", placeholder: "Temperature, handling, stowage…" },
    ],
  },
  {
    number: 11,
    id: "trade-criticality",
    name: "Trade Criticality",
    specRef: "§6.11",
    purpose: "Classification drives fee engine and Governor scrutiny level.",
    icon: AlertTriangle,
    governorGate: "G1U6",
    aiSuggestion: "AI suggestion: PRIORITY (87% confidence) — perishable reefer cargo + EU MRL compliance + first multi-shipment.",
    fields: [
      { key: "criticality", label: "Trade Criticality", type: "radio", options: ["Routine", "Priority", "Critical"], defaultValue: "Priority", required: true },
      { key: "reason", label: "AI Reasoning", type: "textarea", defaultValue: "Perishable reefer cargo, EU MRL compliance required, multi-shipment schedule. Priority classification triggers enhanced Governor scrutiny (G1U6 + G3U6)." },
    ],
  },
  {
    number: 12,
    id: "draft-auto-save",
    name: "Draft Auto-Save",
    specRef: "§6.2.14",
    purpose: "Encrypted draft; recovers on re-login; Governor-stamped on submit. Auto-saves every 30 seconds.",
    icon: Database,
    fields: [
      { key: "autosave", label: "Auto-Save Status", type: "toggle", options: ["ON — saved 2s ago", "OFF"], defaultValue: "ON — saved 2s ago" },
      { key: "draft-id", label: "Draft ID", type: "text", defaultValue: "DRAFT-NH3T-2026-0942-A7C1 (encrypted)" },
    ],
  },
  {
    number: 13,
    id: "submit",
    name: "Submit (Governor Pre-Screening)",
    specRef: "§6.2.15",
    purpose: "G1U1–G1U8 pre-screening runs. Smart Inbox items generated for seller (priority 75).",
    icon: ArrowRight,
    governorGate: "G1U1–G1U8",
    aiSuggestion: "All 8 pre-screening gates ready to run: identity, KYB tier, sanctions, PEP, trader-mode, intent consistency, rate limit, step-up auth.",
    fields: [
      { key: "acknowledge", label: "Acknowledge: submission triggers G1U1–G1U8 Governor pre-screening", type: "toggle", options: ["Acknowledge"], required: true },
      { key: "notify-seller", label: "Notify seller (Smart Inbox item, priority 75)", type: "toggle", options: ["Yes"], defaultValue: "Yes" },
    ],
  },
];

// ── DOWNSTREAM PHASE PROGRESSION (post-submit) ───────────────────────────────
export interface DownstreamPhase {
  phase: string;
  name: string;
  specRef: string;
  status: "complete" | "active" | "pending" | "blocked";
  description: string;
  governorGate: string;
  icon: LucideIcon;
}

export const DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Trade Request Submitted",
    specRef: "§6",
    status: "complete",
    description: "G1U1–G1U8 pre-screening passed. Request Reference generated. Seller notified (Smart Inbox priority 75).",
    governorGate: "G1U1–G1U8",
    icon: CheckCircle2,
  },
  {
    phase: "Phase 2",
    name: "Financing Pre-Clearance (CFR)",
    specRef: "§7",
    status: "complete",
    description: "Buyer declared $420K need (data-sovereign). Cairo Amman Bank pre-cleared. Non-binding pre-lock.",
    governorGate: "G2",
    icon: DollarSign,
  },
  {
    phase: "Phase 3a",
    name: "Quote Received from Seller",
    specRef: "§8",
    status: "active",
    description: "Seller locked EXW $4.20/kg. Fee breakdown attached. Buyer reviewing (accept / counter / decline).",
    governorGate: "G3",
    icon: Package,
  },
  {
    phase: "Phase 3b",
    name: "Negotiation (Clause Forge)",
    specRef: "§9.1",
    status: "pending",
    description: "Seller proposed CFR (vs buyer's CIF). Clause Forge drafting side-by-side comparison. Counter-offer possible.",
    governorGate: "G3",
    icon: Scale,
  },
  {
    phase: "Phase 3c",
    name: "Contract Signing (QES)",
    specRef: "§9.2",
    status: "pending",
    description: "Both parties sign with Qualified Electronic Signature (Egypt Trust). Contract immutable post-signature.",
    governorGate: "G3",
    icon: FileSignature,
  },
  {
    phase: "Phase 3d",
    name: "Fee & Lock",
    specRef: "§9.27",
    status: "pending",
    description: "Dynamic Fee Engine computes bounded fee (0.03–1.50%). FeeLock instruction created. USTN minted at authoritative lock.",
    governorGate: "G4",
    icon: Lock,
  },
  {
    phase: "Phase 5",
    name: "Execution (Physical)",
    specRef: "§12",
    status: "pending",
    description: "LSP/SHIP/LAB/QC/CBR portals active. Milestone-gated payments. Geofence + barcode scanning.",
    governorGate: "G5",
    icon: Truck,
  },
  {
    phase: "Phase 6",
    name: "Settlement & Reconciliation",
    specRef: "§13",
    status: "pending",
    description: "ISO 20022 bank settlement. Reconciliation at ≥95% confidence. Deferred payment guarantees honored.",
    governorGate: "G6",
    icon: DollarSign,
  },
  {
    phase: "Phase 7-8",
    name: "Closure (Earned)",
    specRef: "§5.10, §14",
    status: "pending",
    description: "All 7 closure conditions true. 26-category evidence package sealed. Loom closure hash published. Post-closure reclaim eligible.",
    governorGate: "G7",
    icon: Gavel,
  },
];

// Helper import
import { Lock } from "lucide-react";

// ── G1U1–G1U8 PRE-SCREENING GATES (run on submit) ───────────────────────────
export const PRESREENING_GATES = [
  { gate: "G1U1", name: "Identity Verified", description: "Passkey + biometric + device-bound key", status: "pass" },
  { gate: "G1U2", name: "KYB Tier Sufficient", description: "T3 required for $50K+ trades — buyer is T3", status: "pass" },
  { gate: "G1U3", name: "Sanctions Clear", description: "Buyer + seller + UBO screened (OFAC, EU, UK, UN)", status: "pass" },
  { gate: "G1U4", name: "PEP Screened", description: "No politically exposed persons in ownership chain", status: "pass" },
  { gate: "G1U5", name: "Trader-Mode Valid", description: "BUY mode active — request is buyer-side", status: "pass" },
  { gate: "G1U6", name: "Intent Consistent", description: "All 13 sections internally consistent (A4 validation)", status: "pass" },
  { gate: "G1U7", name: "Rate Limit OK", description: "No rate-limit breach (5 trades/hour max)", status: "pass" },
  { gate: "G1U8", name: "Step-Up Auth Passed", description: "Step-up auth completed for irreversible action", status: "pass" },
];

// ── FEE ENGINE BREAKDOWN (shown after lock) ──────────────────────────────────
export const FEE_BREAKDOWN = {
  canonicalFeeBasis: "$105,100",
  exwValue: "$84,000 (20,000 kg × $4.20/kg)",
  mandatoryLogistics: "$21,100 (ocean freight + insurance + handling)",
  effectiveRate: "0.144%",
  tradeFee: "$151.34",
  institutionalPricing: "Standard (not bulk/essential/special-stock)",
  feeBounds: "Within constitutional bounds (0.03%–1.50%)",
  feelockInstruction: "FeeLock-2026-NH3T-0042 (instruction, not a holding)",
};

// ── QUOTE COMPARISON (received from seller — §8) ─────────────────────────────
export interface QuoteLine {
  label: string;
  sellerValue: string;
  buyerRequest: string;
  match: "match" | "differs" | "n/a";
}

export const QUOTE_COMPARISON: QuoteLine[] = [
  { label: "EXW Price", sellerValue: "$4.20/kg", buyerRequest: "Open (market)", match: "n/a" },
  { label: "Incoterm", sellerValue: "CFR (proposed)", buyerRequest: "CIF (requested)", match: "differs" },
  { label: "Total Quantity", sellerValue: "20,000 kg", buyerRequest: "20,000 kg", match: "match" },
  { label: "Equipment", sellerValue: "2× 40ft Reefer @ -18°C", buyerRequest: "2× 40ft Reefer @ -18°C", match: "match" },
  { label: "Lab Tests", sellerValue: "14 mandatory (EU MRL)", buyerRequest: "14 mandatory (EU MRL)", match: "match" },
  { label: "QC Inspection", sellerValue: "Pre-shipment + Loading", buyerRequest: "Pre-shipment + Loading", match: "match" },
  { label: "Documents", sellerValue: "8 documents (all RIA-required)", buyerRequest: "8 documents", match: "match" },
  { label: "Delivery Window", sellerValue: "2026-10-04 to 2026-10-25", buyerRequest: "2026-10-04 to 2026-10-25", match: "match" },
  { label: "SGTX Fee (indicative)", sellerValue: "$151.34 (0.144%)", buyerRequest: "Engine-determined", match: "n/a" },
  { label: "Settlement", sellerValue: "Milestone-gated (deferred)", buyerRequest: "Milestone-gated (deferred)", match: "match" },
];

// ── CLOSURE CONDITIONS (§5.10 — 7 conditions) ───────────────────────────────
export const CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed", status: "pending" as const },
  { name: "All documents verified", status: "pending" as const },
  { name: "All payments settled", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence", status: "pending" as const },
  { name: "No open disputes", status: "pending" as const },
  { name: "No open exceptions", status: "pending" as const },
  { name: "Evidence package sealed (26 categories)", status: "pending" as const },
];
