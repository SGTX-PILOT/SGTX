// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #4: SHIP Workflow Data
// Shipping line journey: Booking Received → Confirm → Vessel Assign →
// Gate-In → Reefer Power → Loading → Departure → In-Transit (AIS) →
// Arrival → eBL Issuance → Freight Invoice → Settlement
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, CheckCircle2, Ship, Anchor, TrendingUp,
  Package, FileSignature, DollarSign, Clock,
  Navigation, MapPin, Container, ShieldAlert,
  FileCheck, AlertTriangle, Gavel, Wallet,
  Landmark, Barcode,
} from "lucide-react";

// ── 9-STEP SHIP WORKFLOW (form definition per step) ────────────────────────
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

export const SHIP_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "booking-received",
    name: "Booking Request Received",
    specRef: "§16.8.6.4",
    purpose: "Seller/LSP submits booking request. Contract rate auto-applied (no manual rate lookup). Review route, equipment, voyage availability.",
    icon: Inbox,
    governorGate: "G1U1 (identity verified)",
    aiSuggestion: "Booking from Sahara Exports via LSP Delta Logistics. Route: Alexandria → Genoa. 2× 40ft Reefer @ -18°C. Contract rate: $7,900/container (vs spot $8,500, -7.1%). Voyage MXG-2610-04 available, ETD 2026-10-04. 80% booking acceptance probability.",
    fields: [
      { key: "booking", label: "Booking Source", type: "select", options: ["Sahara Exports via Delta Logistics (directed)", "Anonymous broadcast", "Delta Agro via Cairo Freight (directed)"], required: true, defaultValue: "Sahara Exports via Delta Logistics (directed)" },
      { key: "route", label: "Route", type: "text", defaultValue: "Alexandria → Genoa" },
      { key: "equipment", label: "Equipment", type: "text", defaultValue: "2× 40ft Reefer @ -18°C" },
      { key: "contract-rate", label: "Contract Rate (auto-applied)", type: "text", defaultValue: "$7,900 / container (contract, -7.1% vs spot)" },
      { key: "voyage", label: "Available Voyage", type: "select", options: ["MXG-2610-04 (MV Maersk Genoa, ETD 2026-10-04)", "MXG-2610-11 (MV Maersk Genoa, ETD 2026-10-11)"], required: true, defaultValue: "MXG-2610-04 (MV Maersk Genoa, ETD 2026-10-04)" },
    ],
  },
  {
    number: 2,
    id: "booking-confirm",
    name: "Booking Confirmation",
    specRef: "§16.8.6.4",
    purpose: "Confirm or decline booking. Assign container(s) to voyage. Confirm reefer power availability at terminal. Notify seller/LSP of confirmation.",
    icon: CheckCircle2,
    governorGate: "G3U7 (lock authorized)",
    aiSuggestion: "Booking confirmed. 2× 40ft Reefer slots reserved on MXG-2610-04. Reefer power available at Terminal C-12 (20 slots, 18 active). Seller (Sahara Exports) and LSP (Delta Logistics) notified. Contract rate locked: $7,900 × 2 = $15,800 total.",
    fields: [
      { key: "confirm", label: "Booking Decision", type: "radio", options: ["Confirm booking", "Decline (reason required)", "Counter-offer (different voyage)"], required: true, defaultValue: "Confirm booking" },
      { key: "slots", label: "Container Slots Reserved", type: "number", defaultValue: "2", required: true },
      { key: "reefer-power", label: "Reefer Power Available", type: "toggle", options: ["Yes — Terminal C-12 (2 slots)", "No — waitlist"], defaultValue: "Yes — Terminal C-12 (2 slots)", required: true },
      { key: "notify", label: "Notify Seller + LSP", type: "toggle", options: ["Yes (Smart Inbox + NATS)", "No"], defaultValue: "Yes (Smart Inbox + NATS)" },
    ],
  },
  {
    number: 3,
    id: "gate-in",
    name: "Gate-In Confirmation & Reefer Power",
    specRef: "§12, §16.8.6.4",
    purpose: "LSP delivers container to terminal. Gate-in timestamp captured. Reefer power connected. Temperature monitoring active. Container assigned to voyage.",
    icon: Anchor,
    governorGate: "G5U2 (document uploaded) + G5U3 (external fact)",
    aiSuggestion: "Container EGIU-7721340 gate-in at Terminal C-12 (16:45 EET, geofence exit from LSP truck). Reefer power connected: -18°C ±0.5°C. Monitoring active (alarm if ±1°C for >5min). Assigned to voyage MXG-2610-04. LSP released from land leg.",
    fields: [
      { key: "container", label: "Container", type: "text", defaultValue: "EGIU-7721340 (40ft Reefer)" },
      { key: "gate-in-time", label: "Gate-In Timestamp", type: "text", defaultValue: "2026-09-18 16:45 EET (geofence captured)" },
      { key: "reefer-temp", label: "Reefer Temperature Set", type: "text", defaultValue: "-18°C ±0.5°C (monitoring active)" },
      { key: "terminal-slot", label: "Terminal Slot", type: "text", defaultValue: "C-12-07 (reefer power connected)" },
      { key: "voyage-assign", label: "Voyage Assignment", type: "toggle", options: ["Assigned (MXG-2610-04)", "Pending"], defaultValue: "Assigned (MXG-2610-04)", required: true },
    ],
  },
  {
    number: 4,
    id: "vessel-loading",
    name: "Vessel Loading",
    specRef: "§12",
    purpose: "Container loaded onto vessel. Bay/row/tier position recorded. Container sealed. Loading confirmed by terminal operations and vessel master.",
    icon: Package,
    governorGate: "G5U5 (carrier confirmed)",
    aiSuggestion: "Container EGIU-7721340 loaded onto MV Maersk Genoa. Position: Bay 14, Row 06, Tier 02 (under-deck reefer slot). Container sealed (seal ML-2026-7721). Loading confirmed by terminal ops + vessel master. Ready for departure.",
    fields: [
      { key: "loading", label: "Loading Status", type: "toggle", options: ["Loaded (Bay 14-06-02, under-deck reefer)", "Pending"], defaultValue: "Loaded (Bay 14-06-02, under-deck reefer)", required: true },
      { key: "seal", label: "Container Seal", type: "text", defaultValue: "ML-2026-7721 (high-security bolt seal)" },
      { key: "position", label: "Bay/Row/Tier Position", type: "text", defaultValue: "14 / 06 / 02 (under-deck, reefer power)" },
      { key: "confirm", label: "Terminal + Vessel Master Confirmation", type: "toggle", options: ["Confirmed (dual signature)", "Pending"], defaultValue: "Confirmed (dual signature)", required: true },
    ],
  },
  {
    number: 5,
    id: "departure",
    name: "Vessel Departure (Gate-Out)",
    specRef: "§12",
    purpose: "Vessel departs Alexandria. ETD confirmed. AIS tracking begins. All affected USTNs auto-updated. Buyers/LSPs notified of departure + ETA.",
    icon: Ship,
    governorGate: "G5U5 (carrier confirmed — departure)",
    aiSuggestion: "MV Maersk Genoa departed Alexandria at 2026-10-04 08:15 EET (ETD 08:00, +15min). AIS tracking active. ETA Genoa: 2026-10-18 14:00 CEST (14 days). 42 containers onboard (18 reefer). All USTNs auto-updated. 5 buyers + 3 LSPs notified.",
    fields: [
      { key: "etd", label: "Actual ETD", type: "text", defaultValue: "2026-10-04 08:15 EET (+15min from scheduled 08:00)" },
      { key: "eta", label: "ETA (propagated)", type: "text", defaultValue: "2026-10-18 14:00 CEST (14 days transit)" },
      { key: "ais", label: "AIS Tracking", type: "toggle", options: ["Active (vessel ID 219000000, IMO 9770000)", "Pending"], defaultValue: "Active (vessel ID 219000000, IMO 9770000)", required: true },
      { key: "containers-onboard", label: "Containers Onboard", type: "text", defaultValue: "42 (18 reefer, 24 dry)" },
      { key: "notify", label: "Auto-notify All Affected Parties", type: "toggle", options: ["Yes (5 buyers + 3 LSPs via NATS)", "No"], defaultValue: "Yes (5 buyers + 3 LSPs via NATS)" },
    ],
  },
  {
    number: 6,
    id: "in-transit",
    name: "In-Transit — AIS Tracking & Reefer Monitoring",
    specRef: "§12",
    purpose: "Real-time vessel position via AIS. Reefer temperature telemetry (continuous). ETA updates propagated. Exception alerts (congestion, weather, temperature excursion).",
    icon: Navigation,
    governorGate: "G5U5 (carrier confirmed — in transit)",
    aiSuggestion: "In transit: MV Maersk Genoa at 34.5°N, 18.2°E (Mediterranean). Speed 21.5 kn. ETA stable: 2026-10-18 14:00. Reefer temps: all 18 containers within ±0.3°C. No exceptions. AIS polling every 30min. Next waypoint: Strait of Messina.",
    fields: [
      { key: "position", label: "Current Position (AIS)", type: "text", defaultValue: "34.5°N, 18.2°E (Mediterranean Sea)" },
      { key: "speed", label: "Vessel Speed", type: "text", defaultValue: "21.5 knots (service speed)" },
      { key: "reefer-monitor", label: "Reefer Temperature Monitoring", type: "toggle", options: ["All 18 containers within ±0.3°C ✓", "Exception detected"], defaultValue: "All 18 containers within ±0.3°C ✓", required: true },
      { key: "exceptions", label: "Exception Alerts", type: "toggle", options: ["None (clear transit)", "Port congestion ahead", "Weather deviation"], defaultValue: "None (clear transit)" },
      { key: "eta-updates", label: "ETA Update Propagation", type: "toggle", options: ["Auto-propagated to all USTNs", "Manual"], defaultValue: "Auto-propagated to all USTNs" },
    ],
  },
  {
    number: 7,
    id: "arrival",
    name: "Vessel Arrival & Discharge",
    specRef: "§12",
    purpose: "Vessel arrives at destination port. Container discharged. Gate-out from terminal. Buyer/consignee notified. Customs pre-arrival notification transmitted.",
    icon: MapPin,
    governorGate: "G5U3 (external fact — arrival) + G5U6 (customs)",
    aiSuggestion: "MV Maersk Genoa arrived Genoa at 2026-10-18 13:52 CEST (ETA 14:00, -8min early). Container EGIU-7721340 discharged at 15:30. Gate-out to consignee (Mediterra Foods) pending customs clearance. Pre-arrival notification transmitted to Genoa Customs 48h prior.",
    fields: [
      { key: "ata", label: "Actual Arrival (ATA)", type: "text", defaultValue: "2026-10-18 13:52 CEST (-8min from ETA)" },
      { key: "discharge", label: "Container Discharge", type: "toggle", options: ["Discharged (15:30, Terminal 4)", "Pending"], defaultValue: "Discharged (15:30, Terminal 4)", required: true },
      { key: "customs", label: "Customs Pre-Arrival (48h)", type: "toggle", options: ["Transmitted (Genoa Customs)", "Pending"], defaultValue: "Transmitted (Genoa Customs)", required: true },
      { key: "consignee-notify", label: "Consignee Notified", type: "toggle", options: ["Yes (Mediterra Foods, Smart Inbox p85)", "No"], defaultValue: "Yes (Mediterra Foods, Smart Inbox p85)" },
    ],
  },
  {
    number: 8,
    id: "ebl-issuance",
    name: "eBL Issuance (CargoX Webhook)",
    specRef: "§16.8.6.4",
    purpose: "Electronic Bill of Lading issued via CargoX platform. Ed25519 signed. Auto-propagated to Nafeza. Buyer can claim cargo. Webhook delivered to all parties.",
    icon: FileSignature,
    governorGate: "G5U2 (document — eBL)",
    aiSuggestion: "eBL MAEU-2026-0042 issued via CargoX. Ed25519 signature verified. Auto-propagated to Nafeza (Egyptian customs single window). Buyer (Mediterra Foods) can now claim cargo. Webhook delivered to buyer, seller, LSP, customs broker. Loom hash appended.",
    fields: [
      { key: "ebl-number", label: "eBL Number", type: "text", defaultValue: "MAEU-2026-0042" },
      { key: "sign", label: "Ed25519 Signature", type: "toggle", options: ["Signed (CargoX platform)", "Pending"], defaultValue: "Signed (CargoX platform)", required: true },
      { key: "nafeza", label: "Auto-Propagate to Nafeza", type: "toggle", options: ["Propagated (Egyptian customs)", "Pending"], defaultValue: "Propagated (Egyptian customs)" },
      { key: "webhook", label: "Webhook Delivery", type: "toggle", options: ["Delivered (buyer, seller, LSP, CBR)", "Pending"], defaultValue: "Delivered (buyer, seller, LSP, CBR)", required: true },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Appended (immutable audit)", "Pending"], defaultValue: "Appended (immutable audit)" },
    ],
  },
  {
    number: 9,
    id: "freight-invoice-settlement",
    name: "Freight Invoice & Settlement (ISO 20022)",
    specRef: "§13",
    purpose: "Freight invoice issued (30-day net terms). ISO 20022 settlement via CBE clearing. Reconciliation ≥95%. SLA credit if applicable. Closure hash published.",
    icon: DollarSign,
    governorGate: "G6 (settlement) + G7 (closure)",
    aiSuggestion: "Freight invoice INV-2026-0042 issued: $15,800 (2× $7,900 contract rate). 30-day net terms. ISO 20022 pain.001 submitted to CBE clearing. Reconciliation 99.1% (≥95% threshold). SLA credit: $0 (on-time departure, -8min early arrival). Net received: $15,800. Closure hash published.",
    fields: [
      { key: "invoice", label: "Freight Invoice", type: "text", defaultValue: "INV-2026-0042 ($15,800 = 2× $7,900 contract rate)" },
      { key: "terms", label: "Payment Terms", type: "select", options: ["30-day net (standard)", "15-day net", "Prepaid"], defaultValue: "30-day net (standard)" },
      { key: "settlement", label: "ISO 20022 Settlement", type: "toggle", options: ["Confirmed (pain.001, CBE clearing)", "Pending"], defaultValue: "Confirmed (pain.001, CBE clearing)", required: true },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "99.1% (≥95% threshold — passed)" },
      { key: "sla", label: "SLA Credit Applied", type: "toggle", options: ["$0 (on-time departure, early arrival)", "$250 (departure delay)"], defaultValue: "$0 (on-time departure, early arrival)" },
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

export const SHIP_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Booking Received",
    specRef: "§16.8.6.4",
    status: "complete",
    description: "Booking from Sahara Exports via LSP Delta Logistics. Contract rate $7,900 auto-applied. Voyage MXG-2610-04 selected.",
    governorGate: "G1U1",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "Booking Confirmed",
    specRef: "§16.8.6.4",
    status: "complete",
    description: "2× 40ft Reefer slots reserved on MXG-2610-04. Reefer power available at Terminal C-12. Seller + LSP notified.",
    governorGate: "G3U7",
    icon: CheckCircle2,
  },
  {
    phase: "Phase 3",
    name: "Gate-In & Reefer Power",
    specRef: "§12",
    status: "complete",
    description: "Container EGIU-7721340 gate-in at Terminal C-12. Reefer power connected (-18°C ±0.5°C). Assigned to voyage.",
    governorGate: "G5U2 + G5U3",
    icon: Anchor,
  },
  {
    phase: "Phase 4",
    name: "Vessel Loading",
    specRef: "§12",
    status: "complete",
    description: "Container loaded onto MV Maersk Genoa. Position Bay 14-06-02 (under-deck reefer). Sealed ML-2026-7721.",
    governorGate: "G5U5",
    icon: Package,
  },
  {
    phase: "Phase 5a",
    name: "Departure (Gate-Out)",
    specRef: "§12",
    status: "complete",
    description: "MV Maersk Genoa departed Alexandria 2026-10-04 08:15. AIS tracking active. ETA Genoa 2026-10-18 14:00. All parties notified.",
    governorGate: "G5U5",
    icon: Ship,
  },
  {
    phase: "Phase 5b",
    name: "In-Transit (AIS + Reefer Monitor)",
    specRef: "§12",
    status: "active",
    description: "Vessel at 34.5°N, 18.2°E. Speed 21.5kn. All 18 reefer containers within ±0.3°C. No exceptions. ETA stable.",
    governorGate: "G5U5",
    icon: Navigation,
  },
  {
    phase: "Phase 5c",
    name: "Arrival & Discharge",
    specRef: "§12",
    status: "pending",
    description: "MV Maersk Genoa arrives Genoa. Container discharged. Customs pre-arrival transmitted (48h prior). Consignee notified.",
    governorGate: "G5U3 + G5U6",
    icon: MapPin,
  },
  {
    phase: "Phase 5d",
    name: "eBL Issuance (CargoX)",
    specRef: "§16.8.6.4",
    status: "pending",
    description: "eBL MAEU-2026-0042 issued. Ed25519 signed. Auto-propagated to Nafeza. Webhook delivered to all parties.",
    governorGate: "G5U2",
    icon: FileSignature,
  },
  {
    phase: "Phase 6",
    name: "Freight Settlement (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "Freight invoice $15,800 settled via pain.001 (CBE). Reconciliation 99.1%. SLA credit $0. Closure hash published.",
    governorGate: "G6 + G7",
    icon: DollarSign,
  },
];

// ── G5 VALIDATION GATES (gate-in confirmation) ───────────────────────────────
export const SHIP_VALIDATION_GATES = [
  { gate: "G5U1", name: "Milestone Valid", description: "Booking confirmed, voyage assigned, container identity verified (BIC code EGIU)", status: "pass" },
  { gate: "G5U2", name: "Document Uploaded", description: "Container manifest + SSCC labels matched; eBL draft prepared for issuance on arrival", status: "pass" },
  { gate: "G5U3", name: "External Fact Reconciled", description: "Gate-in timestamp captured from terminal geofence (Terminal C-12, 16:45 EET)", status: "pass" },
  { gate: "G5U4", name: "Payment Authorized", description: "Freight invoice FeeLock ACTIVE ($15,800 for 2 containers, contract rate)", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "Maersk Line Egypt (SGTX-EG-26-ML1A-0003) confirmed as ocean carrier; vessel MV Maersk Genoa assigned", status: "pass" },
  { gate: "G5U6", name: "Customs Pre-Arrival", description: "Pending — Genoa Customs pre-arrival notification (48h before ETA)", status: "pending" },
  { gate: "G5U7", name: "QC Passed", description: "N/A for SHIP (QC is seller/buyer responsibility at origin/destination)", status: "n/a" },
  { gate: "G5U8", name: "Lab Results In", description: "N/A for SHIP (lab tests are seller/buyer responsibility)", status: "n/a" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const SHIP_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  vessel: "MV Maersk Genoa",
  voyage: "MXG-2610-04",
  route: "Alexandria → Genoa",
  containers: "2× 40ft Reefer @ -18°C (EGIU-7721340, EGIU-7721341)",
  etd: "2026-10-04 08:15 EET (+15min from scheduled)",
  ata: "2026-10-18 13:52 CEST (-8min from ETA, early arrival)",
  transitDays: "14 days 5h 37m",
  reeferCompliance: "18/18 containers within ±0.3°C (100%)",
  eblNumber: "MAEU-2026-0042 (Ed25519 signed, CargoX)",
  freightInvoice: "INV-2026-0042 ($15,800 = 2× $7,900 contract rate)",
  paymentTerms: "30-day net (standard)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  reconciliation: "99.1% (≥95% threshold — passed)",
  slaCredit: "$0 (on-time departure, early arrival)",
  netReceived: "$15,800",
  closureHash: "0x9b2e...f41a (published on Loom)",
};

// ── CLOSURE CONDITIONS (SHIP perspective) ───────────────────────────────────
export const SHIP_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (gate-in, loading, departure, arrival, discharge)", status: "pending" as const },
  { name: "All documents verified (eBL, container manifest, customs pre-arrival)", status: "pending" as const },
  { name: "All payments settled (freight $15,800 via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (99.1% achieved)", status: "pending" as const },
  { name: "No open disputes (invoice dispute rate 1.2%)", status: "pending" as const },
  { name: "No open exceptions (reefer temp, customs, AIS)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, SHIP subset)", status: "pending" as const },
];
