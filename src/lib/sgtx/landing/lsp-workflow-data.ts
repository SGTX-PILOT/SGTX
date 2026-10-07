// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #3: LSP Workflow Data
// LSP operational journey: RFQ Response → Clarification → Dispatch Planning →
// Driver Assignment → Pickup → In-Transit → Port Delivery → Settlement
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, MessageSquare, CheckCircle2, Route, Users,
  Truck, MapPin, Anchor, DollarSign, Package,
  Boxes, Navigation, QrCode, ShieldAlert, FileCheck,
  Clock, AlertTriangle, Gavel, Wallet,
} from "lucide-react";

// ── 9-STEP LSP WORKFLOW (form definition per step) ─────────────────────────
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

export const LSP_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "rfq-response",
    name: "RFQ Response — Quote Submission",
    specRef: "§16.8.6.3",
    purpose: "Receive RFQ from seller (directed or anonymous broadcast). Review route, equipment, pickup/delivery windows. Submit competitive quote within expiry.",
    icon: Inbox,
    governorGate: "G1U1 (identity verified)",
    aiSuggestion: "Directed RFQ from Sahara Exports: 6th of October → Alexandria → Genoa, 2× 40ft Reefer @ -18°C, 14 days. Market range $7,900–$9,100. Your competitive quote: $8,200 (45th percentile). 80% win probability based on corridor history.",
    fields: [
      { key: "rfq", label: "RFQ Source", type: "select", options: ["Directed — Sahara Exports (SGTX-EG-26-SX7K-0008)", "Anonymous broadcast (5 LSPs)", "Directed — Delta Agro (SGTX-EG-26-DA2F-0014)"], required: true, defaultValue: "Directed — Sahara Exports (SGTX-EG-26-SX7K-0008)" },
      { key: "route", label: "Route", type: "text", defaultValue: "6th of October City → Alexandria → Genoa" },
      { key: "equipment", label: "Equipment", type: "text", defaultValue: "2× 40ft Reefer @ -18°C" },
      { key: "quote", label: "Your Quote (USD)", type: "number", placeholder: "e.g. 8200", defaultValue: "8200", required: true, aiAssist: "A2 fair price" },
      { key: "transit", label: "Transit Time (days)", type: "number", defaultValue: "14", required: true },
      { key: "submit", label: "Submit Quote", type: "toggle", options: ["Submit before expiry", "Decline RFQ"], defaultValue: "Submit before expiry", required: true },
    ],
  },
  {
    number: 2,
    id: "clarification",
    name: "Clarification Q&A",
    specRef: "§16.8.6.3",
    purpose: "Structured Q&A with the seller. Your answers affect RFQ award. All Q&A is logged immutably on the Loom chain.",
    icon: MessageSquare,
    governorGate: "G1U6 (intent consistent)",
    aiSuggestion: "Seller asks: 'Can you guarantee -18°C ±0.5°C continuous?' Your reefer fleet (8 trucks) maintains -18°C ±0.3°C. Confirm yes. Also asked about: weekend pickup availability (yes, +$150 surcharge), insurance coverage (cargo insurance included).",
    fields: [
      { key: "q1", label: "Q: Reefer temperature guarantee (-18°C ±0.5°C)?", type: "radio", options: ["Yes — guaranteed (±0.3°C)", "Yes — with surcharge", "No — cannot guarantee"], defaultValue: "Yes — guaranteed (±0.3°C)", required: true },
      { key: "q2", label: "Q: Weekend pickup available?", type: "radio", options: ["Yes — no surcharge", "Yes — +$150 surcharge", "No — weekdays only"], defaultValue: "Yes — +$150 surcharge" },
      { key: "q3", label: "Q: Insurance coverage?", type: "radio", options: ["Cargo insurance included", "Marine + cargo included", "Not included"], defaultValue: "Marine + cargo included" },
      { key: "additional", label: "Additional Notes", type: "textarea", placeholder: "Add any clarifications..." },
    ],
  },
  {
    number: 3,
    id: "quote-awarded",
    name: "Quote Awarded — Contract Signed",
    specRef: "§9.2",
    purpose: "Seller/buyer accepts your quote. Contract signed with QES. FeeLock instruction created. USTN minted at lock. You are now the contracted LSP.",
    icon: CheckCircle2,
    governorGate: "G3 (contract) + G4 (fee & lock)",
    aiSuggestion: "Quote accepted! Contract signed (QES by Sahara Exports + Nile Harvest Trading). USTN minted: SGTX-EG-26-NH3T-0042. FeeLock ACTIVE. Your logistics fee $8,200 locked. Loom hash appended. Ready for dispatch planning.",
    fields: [
      { key: "ustn", label: "USTN (minted)", type: "text", defaultValue: "SGTX-EG-26-NH3T-0042" },
      { key: "contract", label: "Contract Status", type: "toggle", options: ["Signed (QES)", "Pending"], defaultValue: "Signed (QES)" },
      { key: "feelock", label: "FeeLock Status", type: "toggle", options: ["ACTIVE ($8,200 locked)", "Pending"], defaultValue: "ACTIVE ($8,200 locked)" },
      { key: "acknowledge", label: "Acknowledge: you are now the contracted LSP for this USTN", type: "toggle", options: ["Acknowledge"], required: true },
    ],
  },
  {
    number: 4,
    id: "dispatch-planning",
    name: "Dispatch Planning — ORTools VRP",
    specRef: "§16.8.6.3",
    purpose: "Google ORTools VRP optimizes the route: minimize distance, respect time windows, optimize reefer fuel cost. Driver + truck assignment.",
    icon: Route,
    governorGate: "G5U1 (milestone valid)",
    aiSuggestion: "VRP optimized: ROUTE-001. 3 stops (Sahara Cold Storage #3 → Alexandria Port Gate 4 → Terminal C-12). 62 km, 2h 15m. Truck EGY-7721 (Reefer 40ft). Driver Ahmed K. (rating 4.8). Departure 13:45 for 14:00 pickup window.",
    fields: [
      { key: "algorithm", label: "Optimization Algorithm", type: "text", defaultValue: "Google ORTools VRP (min distance + time windows + reefer fuel)" },
      { key: "route", label: "Optimized Route", type: "textarea", defaultValue: "ROUTE-001: 3 stops. Sahara Cold Storage #3 (pickup) → Alexandria Port Gate 4 (checkpoint) → Terminal C-12 (delivery). 62 km, 2h 15m." },
      { key: "driver", label: "Driver Assignment", type: "select", options: ["Ahmed K. (EGY-7721, Reefer 40ft, rating 4.8) — recommended", "Mohamed S. (EGY-5543, Dry 40ft) — wrong equipment", "Khaled A. (EGY-3388, Dry 40ft) — wrong equipment"], required: true, defaultValue: "Ahmed K. (EGY-7721, Reefer 40ft, rating 4.8) — recommended" },
      { key: "departure", label: "Planned Departure", type: "text", defaultValue: "2026-09-18 13:45 EET" },
      { key: "accept", label: "Accept VRP Optimization", type: "toggle", options: ["Accept", "Override (manual route)"], defaultValue: "Accept", required: true },
    ],
  },
  {
    number: 5,
    id: "driver-pairing",
    name: "Driver QR Pairing & App Sync",
    specRef: "§16.1.4.1",
    purpose: "Driver pairs mobile app with dispatch via QR code. App downloads route, offline map (OSRM), SSCC label manifest. Geofence armed at origin.",
    icon: QrCode,
    governorGate: "G5U1 (driver verified)",
    aiSuggestion: "Ahmed K. paired via QR scan (passkey + biometric). App synced: route, offline OSRM map, 248 SSCC pallet labels, geofence at Sahara Cold Storage #3. Offline queue ready. Auto-retry configured (1s→60s, max 5).",
    fields: [
      { key: "pairing", label: "Driver App Pairing", type: "toggle", options: ["Paired (QR + passkey + biometric)", "Pending"], defaultValue: "Paired (QR + passkey + biometric)", required: true },
      { key: "sync", label: "Route Data Synced", type: "toggle", options: ["Synced (route + offline map + SSCC manifest)", "Syncing..."], defaultValue: "Synced (route + offline map + SSCC manifest)" },
      { key: "geofence", label: "Geofence Armed", type: "toggle", options: ["Armed at Sahara Cold Storage #3", "Not armed"], defaultValue: "Armed at Sahara Cold Storage #3", required: true },
      { key: "offline", label: "Offline Queue Ready", type: "toggle", options: ["Ready (auto-retry 1s→60s, max 5)", "Not ready"], defaultValue: "Ready (auto-retry 1s→60s, max 5)" },
    ],
  },
  {
    number: 6,
    id: "pickup-execution",
    name: "Pickup Execution — SSCC Scanning",
    specRef: "§12 (physical execution)",
    purpose: "Driver arrives at origin. Scans SSCC pallet labels (barcode). GPS geofence triggers arrival. Pickup milestone confirmed. Governor G5 validates.",
    icon: MapPin,
    governorGate: "G5U2 (document uploaded) + G5U3 (external fact)",
    aiSuggestion: "Ahmed K. arrived at Sahara Cold Storage #3 (geofence triggered 14:02). Scanning 248 SSCC pallet labels... All 248 scanned ✓. Pickup milestone confirmed. Governor G5 validated: identity verified, SSCC matches packing plan, GPS within geofence. Per-shipment fee payment authorized.",
    fields: [
      { key: "arrival", label: "Arrival at Origin", type: "toggle", options: ["Arrived (geofence triggered 14:02)", "En route"], defaultValue: "Arrived (geofence triggered 14:02)" },
      { key: "scan", label: "SSCC Pallet Scanning", type: "toggle", options: ["All 248 scanned ✓", "Scanning in progress...", "Scan failed"], defaultValue: "All 248 scanned ✓", required: true },
      { key: "milestone", label: "Pickup Milestone", type: "toggle", options: ["Confirmed (G5 validated)", "Pending"], defaultValue: "Confirmed (G5 validated)", required: true },
      { key: "gps", label: "GPS Stamp", type: "text", defaultValue: "29.9668°N, 30.9443°E (within geofence)" },
    ],
  },
  {
    number: 7,
    id: "in-transit",
    name: "In-Transit Tracking — Milestones",
    specRef: "§12",
    purpose: "Real-time GPS tracking via NATS. Milestone scanning at checkpoints. Offline queue if signal lost. Customs broker notified on gate-out.",
    icon: Truck,
    governorGate: "G5U5 (carrier confirmed)",
    aiSuggestion: "In transit: Ahmed K. en route to Alexandria Port (62 km, ETA 16:15). NATS WebSocket live (latency 12ms). 2 checkpoint milestones pending. If signal lost, app queues scans offline and syncs on reconnect. Customs broker (Cairo Customs) will be auto-notified on gate-out.",
    fields: [
      { key: "tracking", label: "GPS Tracking", type: "toggle", options: ["Live (NATS WebSocket, 12ms)", "Offline (queued)"], defaultValue: "Live (NATS WebSocket, 12ms)" },
      { key: "checkpoints", label: "Checkpoint Milestones", type: "textarea", defaultValue: "1. Alexandria Port Gate 4 (arrival scan) — pending. 2. Terminal C-12 (delivery scan) — pending." },
      { key: "offline-ready", label: "Offline Queue Ready", type: "toggle", options: ["Yes (auto-retry 1s→60s)", "No"], defaultValue: "Yes (auto-retry 1s→60s)" },
      { key: "customs-notify", label: "Auto-notify customs broker on gate-out", type: "toggle", options: ["Yes (Cairo Customs Brokers)", "No"], defaultValue: "Yes (Cairo Customs Brokers)" },
    ],
  },
  {
    number: 8,
    id: "port-delivery",
    name: "Port Delivery — Gate-Out Confirmation",
    specRef: "§12, §16.8.6.3",
    purpose: "Driver arrives at port terminal. Gate-out timestamp captured from geofence exit. Customs broker confirms. Container handed to shipping line. eBL webhook dispatched.",
    icon: Anchor,
    governorGate: "G5U3 (external fact reconciled) + G5U6 (customs cleared)",
    aiSuggestion: "Container EGIU-7721340 delivered to Terminal C-12. Gate-out timestamp: 16:18 EET (geofence exit). Cairo Customs Brokers confirmed for declaration. Maersk eBL webhook dispatched to CargoX. Milestone: container released to shipping line. Ocean leg begins.",
    fields: [
      { key: "delivery", label: "Terminal Delivery", type: "toggle", options: ["Delivered (Terminal C-12)", "En route"], defaultValue: "Delivered (Terminal C-12)", required: true },
      { key: "gateout", label: "Gate-Out Timestamp", type: "text", defaultValue: "2026-09-18 16:18 EET (geofence exit)" },
      { key: "customs", label: "Customs Broker Confirmation", type: "toggle", options: ["Confirmed (Cairo Customs Brokers)", "Pending"], defaultValue: "Confirmed (Cairo Customs Brokers)" },
      { key: "ebl", label: "eBL Webhook (CargoX)", type: "toggle", options: ["Dispatched", "Pending"], defaultValue: "Dispatched" },
      { key: "release", label: "Container Released to Shipping Line", type: "toggle", options: ["Released (ocean leg begins)", "Pending"], defaultValue: "Released (ocean leg begins)", required: true },
    ],
  },
  {
    number: 9,
    id: "settlement",
    name: "Settlement — Logistics Fee (ISO 20022)",
    specRef: "§13",
    purpose: "Logistics fee $8,200 settled via ISO 20022 (pain.001). Reconciliation ≥95% confidence. SLA credit applied if applicable. Funds in cash position. Closure hash published.",
    icon: DollarSign,
    governorGate: "G6 (settlement) + G7 (closure)",
    aiSuggestion: "Logistics fee $8,200 settled via pain.001 (CBE clearing). Reconciliation 98.2% (≥95% threshold). SLA credit: $0 (on-time pickup, no incident). Net received: $8,200. Funds in cash position ($1.24M → $1.248M). Closure hash published on Loom.",
    fields: [
      { key: "settlement", label: "Settlement Status", type: "toggle", options: ["Confirmed (ISO 20022 pain.001)", "Pending"], defaultValue: "Confirmed (ISO 20022 pain.001)", required: true },
      { key: "amount", label: "Amount Received", type: "text", defaultValue: "$8,200 (full, no SLA deduction)" },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "98.2% (≥95% threshold — passed)" },
      { key: "sla", label: "SLA Credit Applied", type: "toggle", options: ["$0 (on-time, no incident)", "$120 (12 min late, USTN ...0034-1)"], defaultValue: "$0 (on-time, no incident)" },
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

export const LSP_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "RFQ Received & Reviewed",
    specRef: "§16.8.6.3",
    status: "complete",
    description: "Directed RFQ from Sahara Exports received. Route, equipment, windows reviewed. Quote drafted ($8,200).",
    governorGate: "G1U1",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "Clarification Q&A Completed",
    specRef: "§16.8.6.3",
    status: "complete",
    description: "All 3 seller questions answered (reefer temp, weekend pickup, insurance). Q&A logged on Loom.",
    governorGate: "G1U6",
    icon: MessageSquare,
  },
  {
    phase: "Phase 3",
    name: "Quote Awarded — Contract Signed",
    specRef: "§9.2, §9.27",
    status: "complete",
    description: "Quote accepted. Contract signed (QES). USTN minted (SGTX-EG-26-NH3T-0042). FeeLock ACTIVE ($8,200).",
    governorGate: "G3 + G4",
    icon: CheckCircle2,
  },
  {
    phase: "Phase 4",
    name: "Dispatch Planned (VRP)",
    specRef: "§16.8.6.3",
    status: "complete",
    description: "ORTools VRP optimized: ROUTE-001, 3 stops, 62km, 2h15m. Driver Ahmed K. + Truck EGY-7721 assigned.",
    governorGate: "G5U1",
    icon: Route,
  },
  {
    phase: "Phase 5a",
    name: "Driver Paired & App Synced",
    specRef: "§16.1.4.1",
    status: "complete",
    description: "Ahmed K. paired via QR + passkey + biometric. Route, offline OSRM, 248 SSCC labels synced. Geofence armed.",
    governorGate: "G5U1",
    icon: QrCode,
  },
  {
    phase: "Phase 5b",
    name: "Pickup Executed",
    specRef: "§12",
    status: "active",
    description: "Arrived at Sahara Cold Storage #3 (geofence 14:02). 248 SSCC pallets scanned. Pickup milestone confirmed (G5).",
    governorGate: "G5U2 + G5U3",
    icon: MapPin,
  },
  {
    phase: "Phase 5c",
    name: "In-Transit to Port",
    specRef: "§12",
    status: "pending",
    description: "GPS tracking live (NATS, 12ms). En route to Alexandria Port. 2 checkpoint milestones pending.",
    governorGate: "G5U5",
    icon: Truck,
  },
  {
    phase: "Phase 5d",
    name: "Port Delivery & Gate-Out",
    specRef: "§12, §16.8.6.3",
    status: "pending",
    description: "Terminal C-12 delivery. Gate-out captured. Customs broker confirmed. eBL dispatched. Container released to Maersk.",
    governorGate: "G5U3 + G5U6",
    icon: Anchor,
  },
  {
    phase: "Phase 6",
    name: "Settlement (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "Logistics fee $8,200 settled via pain.001. Reconciliation 98.2%. SLA credit $0. Closure hash published.",
    governorGate: "G6 + G7",
    icon: DollarSign,
  },
];

// ── G5 VALIDATION GATES (pickup milestone) ───────────────────────────────────
export const LSP_VALIDATION_GATES = [
  { gate: "G5U1", name: "Milestone Valid", description: "Driver identity verified, truck assigned, route optimized (VRP)", status: "pass" },
  { gate: "G5U2", name: "Document Uploaded", description: "248 SSCC pallet labels scanned and matched to packing plan", status: "pass" },
  { gate: "G5U3", name: "External Fact Reconciled", description: "GPS geofence arrival confirmed at Sahara Cold Storage #3 (29.9668°N, 30.9443°E)", status: "pass" },
  { gate: "G5U4", name: "Payment Authorized", description: "Per-shipment fee payment authorized to seller (FeeLock ACTIVE)", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "LSP (Delta Logistics) confirmed as carrier; driver Ahmed K. verified", status: "pass" },
  { gate: "G5U6", name: "Customs Cleared", description: "Pending — customs clearance at Alexandria Port (gate-out)", status: "pending" },
  { gate: "G5U7", name: "QC Passed", description: "N/A for LSP (QC is seller/buyer responsibility)", status: "n/a" },
  { gate: "G5U8", name: "Lab Results In", description: "N/A for LSP (lab tests are seller/buyer responsibility)", status: "n/a" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const LSP_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  route: "6th of October City → Alexandria → Genoa",
  equipment: "2× 40ft Reefer @ -18°C",
  driver: "Ahmed K. (EGY-7721)",
  distance: "62 km (land leg) + ocean (Alexandria → Genoa)",
  duration: "2h 15m (land) + 14 days (ocean)",
  pickupTime: "14:02 EET (on-time)",
  gateOutTime: "16:18 EET",
  palletsScanned: "248 / 248 ✓",
  logisticsFee: "$8,200",
  slaCredit: "$0 (on-time, no incident)",
  netReceived: "$8,200",
  reconciliation: "98.2% (≥95% threshold — passed)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0x7f3a...b29c (published on Loom)",
};

// ── CLOSURE CONDITIONS (LSP perspective) ───────────────────────────────────
export const LSP_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (pickup, checkpoints, gate-out, delivery)", status: "pending" as const },
  { name: "All documents verified (SSCC manifest, eBL, customs declaration)", status: "pending" as const },
  { name: "All payments settled (logistics fee $8,200 via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (98.2% achieved)", status: "pending" as const },
  { name: "No open disputes (invoice accuracy 97.1%)", status: "pending" as const },
  { name: "No open exceptions (SLA, customs, logistics)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, LSP subset)", status: "pending" as const },
];
