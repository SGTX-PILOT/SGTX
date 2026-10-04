// @ts-nocheck
// =============================================================================
// SGTX v18 §12 — Physical Execution & Multiparty Tracking (Phase 5)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for Phase 5 physical cargo
// movement, multiparty tracking, milestone-triggered payments, and the
// container/pallet identity model.
//
// Consumed by:
//   • /api/v1/workflow/physical-execution   — public canonical mirror
//   • /api/sgtx/workflow/physical-execution — internal mirror
// =============================================================================

// ============ v18 §12.1 — Purpose & Physical Execution Model ============

export const PHYSICAL_EXECUTION_PRINCIPLES = [
  "Phase 5 Start Condition — begins only after USTN generation + FeeLock ACTIVE (STAGE1_SETTLED) + contract lock",
  "Multi-Dimensional Execution — physical, documentary, financial, regulatory, and informational dimensions all tracked",
  "Multi-Shipment Independence — each shipment in a multi-shipment contract executes independently with its own USTN",
  "USTN-Centric Execution — every event, milestone, and document references the USTN",
  "Container Identity — each container has its own sub-identity bound to the USTN (MEDU1234567 bound to SGTX-EG-26-F3A-1)",
  "Pallet/Handling Unit Identity — each pallet has an SSCC barcode (GS1 standard) bound to the USTN",
  "Multi-Clock View — each party has their own clock (seller's clock, trucking's clock, port's clock, customs' clock)",
  "Transaction Twin — every physical event has a digital twin recorded in the Loom chain",
  "No Silent Overwrite — when an authoritative external system contradicts internal state, both are recorded and reconciled",
] as const;

// ============ v18 §12.2 — Complete Workflow Steps ============

export const PHYSICAL_EXECUTION_STEPS = [
  {
    step: 1,
    name: "Pre-Execution Setup (Automatic)",
    substeps: [
      "1A — Loading Window Selection (A2 Schedule Optimiser suggests optimal slots based on port cutoffs, traffic, weather)",
      "1B — Booking Confirmation Upload (shipping line uploads PDF/email/EDI; A2 HF Donut extracts vessel/IMO/voyage/ETD/ETA/container numbers)",
      "1C — Booking Reconciliation (compare against agreed shipment; flag unexpected carrier/port/sailing/equipment/container count)",
      "1D — Dynamic Document Requirements (RIA-driven checklist — phytosanitary, health, CoO, etc.; missing critical documents block loading)",
      "1E — Container Release Pre-Advice (webhook to terminal 2-4 hours before truck arrival for pre-staging gate resources)",
    ],
  },
  {
    step: 2,
    name: "Container Release & Loading",
    substeps: [
      "2A — Container Release Pre-Advice (sent to terminal; LSP acknowledges with token)",
      "2B — Container Release Token (terminal issues release token; LSP presents at gate)",
      "2C — Warehouse Loading (barcode scanning of pallets; each scan Loom-logged)",
      "2D — Loaded Milestone (when last pallet loaded, system auto-confirms LOADED milestone via consensus)",
    ],
  },
  {
    step: 3,
    name: "QC Inspection (Conditional Pass Support)",
    description: "If buyer requested QC inspection at loading: A2 (Quality Assessment) runs. Outcomes: PASS, CONDITIONAL_PASS (with action plan), FAIL. CONDITIONAL_PASS freezes payment legs until action plan completed and verified.",
  },
  {
    step: 4,
    name: "Vessel Departure",
    description: "DEPARTED milestone set by SHIP (or auto from AIS vessel tracking). Triggers freight payment leg (if terms = 'prepaid').",
  },
  {
    step: 5,
    name: "In-Transit Tracking",
    description: "IN_TRANSIT milestone auto-set by AIS vessel tracking (system auto). Multi-clock view shows vessel position, ETA, weather, and any deviations.",
  },
  {
    step: 6,
    name: "Arrival",
    description: "ARRIVED milestone set by SHIP (or auto from AIS). Triggers import customs clearance workflow.",
  },
  {
    step: 7,
    name: "Import Customs Clearance",
    description: "CUSTOMS_IMPORT milestone set when customs broker (CBR) submits import declaration + duties paid. Triggers customs duty payment leg.",
  },
  {
    step: 8,
    name: "Delivery",
    description: "DELIVERED milestone set when buyer confirms receipt of goods (one click or voice). Triggers seller balance payment leg.",
  },
  {
    step: 9,
    name: "Settlement",
    description: "SETTLED milestone set when all payment legs settled + bank confirms. Phase 5 ends; Phase 6 (Settlement) begins.",
  },
];

// ============ v18 §12.1.5 — Container Identity ============

export const CONTAINER_IDENTITY = {
  format: "ISO 6346 — 11-character alphanumeric (4 letters owner code + 7 digits including check digit)",
  example: "MEDU1234567",
  binding: "Each container is bound to the USTN at lock (Container.MEDU1234567 → USTN SGTX-EG-26-F3A-1)",
  status: "PLANNED → RELEASED → LOADED → DEPARTED → IN_TRANSIT → ARRIVED → DELIVERED",
  sub_identity: true,
  sub_identity_description: "Container has its own sub-identity within the trade; multiple containers per USTN supported",
} as const;

// ============ v18 §12.1.6 — Pallet / Handling Unit Identity ============

export const PALLET_IDENTITY = {
  format: "SSCC (Serial Shipping Container Code) — GS1 standard, 18-digit numeric with check digit",
  example: "106141411234567890",
  binding: "Each pallet is bound to the USTN + container at packing lock",
  status: "PLANNED → LOADED → DEPARTED → ARRIVED → DELIVERED",
  barcodeType: "GS1-128 barcode",
  scanEvents: ["pallet.loaded", "pallet.departed", "pallet.arrived", "pallet.delivered"],
  governorGate: "G1U35 — pallet_details.status updates validated",
} as const;

// ============ v18 §12.1.7 — Multi-Clock View & Transaction Twin ============

export const MULTI_CLOCK_VIEW = {
  principle: "Each party has their own clock; the platform reconciles across all clocks",
  clocks: [
    "Seller's clock (when ready for shipment)",
    "Trucking's clock (when vehicle dispatched)",
    "Port's clock (when container gated in/out)",
    "Customs' clock (when declaration filed/cleared)",
    "Shipping line's clock (when vessel sailed/arrived)",
    "Buyer's clock (when delivery confirmed)",
    "Financier's clock (when payment milestones triggered)",
  ],
  transactionTwin: "Every physical event (container scan, vessel AIS ping, customs declaration, payment) creates a digital twin recorded in the Loom chain",
  reconciliationRule: "When authoritative external systems contradict internal state, both are recorded; the Loom chain shows the divergence + reconciliation path",
} as const;

// ============ v18 §12.7 — Milestone-Triggered Payment Execution ============

export const MILESTONE_PAYMENT_TRIGGERS = [
  { milestone: "CONTAINER_RELEASE", payment_leg: "Container release fee (if applicable)", payer: "Seller or Buyer per Incoterm", terms: "immediate" },
  { milestone: "LOADED", payment_leg: "Loading charges (if applicable)", payer: "Seller or Buyer per Incoterm", terms: "immediate" },
  { milestone: "CUSTOMS_SUBMITTED", payment_leg: "Lab testing fees + Phytosanitary cert fees", payer: "Seller (pre-shipment) or Buyer (post-shipment per Incoterm)", terms: "immediate or deferred" },
  { milestone: "DEPARTED", payment_leg: "Ocean freight (if prepaid) OR Air freight", payer: "Seller (prepaid) or Buyer (collect)", terms: "immediate or credit terms (e.g., 30 days)" },
  { milestone: "ARRIVED", payment_leg: "Destination port charges + Demurrage start (if applicable)", payer: "Buyer typically", terms: "immediate" },
  { milestone: "CUSTOMS_IMPORT", payment_leg: "Customs duties + VAT + import clearance fees", payer: "Buyer", terms: "immediate" },
  { milestone: "DELIVERED", payment_leg: "Seller balance (trade principal) + remaining fees", payer: "Buyer", terms: "immediate or per agreed settlement structure" },
  { milestone: "SETTLED", payment_leg: "All Stage 2 fees + deferred payments", payer: "Per agreement", terms: "per deferred schedule" },
];

// ============ v18 §12.8 — Deferred Payment (Credit Terms) Handling ============

export const DEFERRED_PAYMENT_HANDLING = {
  rule: "When a payment leg has credit terms (e.g., 30 days), the leg is registered at the bank as a future-dated instruction",
  bankRole: "Bank holds the instruction until the due date; on due date, bank executes + confirms to SGTX",
  feeLockState: "FeeLock shows the leg as 'CREDIT — due [date]'",
  reminderSchedule: ["7 days before expiry (reminder)", "On due date (urgent)", "1 day after (overdue)", "7 days after (escalation A3)", "30 days after (default trigger)"],
  qcHoldImpact: "If QC returns CONDITIONAL_PASS, payment legs are frozen until action plan completed + verified",
} as const;

// ============ v18 §12.9 — Conditional QC Hold Impact on Payments ============

export const QC_HOLD_IMPACT = {
  trigger: "QC inspection returns CONDITIONAL_PASS with action plan",
  immediateActions: [
    "1. Payment legs frozen (no payments execute)",
    "2. System displays hold status on all payment legs in the FeeLock",
    "3. Smart Inbox alerts all parties (priority 85 — SLA incident)",
  ],
  resolutionFlow: [
    "1. Action plan completed + verified",
    "2. QC re-inspection (CONDITIONAL → PASS)",
    "3. Payment legs unfrozen",
    "4. Frozen legs execute (immediate payment)",
  ],
  governorGate: "G1U36 — QC hold release validated",
} as const;

// ============ v18 §12.5 — Mobile App & Barcode Scanning ============

export const MOBILE_APP_BARCODE = {
  appTypes: ["LSP driver app (loading + delivery)", "QC inspector app (field inspection with AR + voice)", "Buyer app (delivery confirmation)"],
  barcodeFormats: ["SSCC (GS1-128) for pallets", "ISO 6346 for containers", "USTN QR code for trade lookup"],
  scanEvents: ["pallet.loaded (LSP driver app, voice or scan)", "container.released (terminal gate)", "container.loaded (warehouse)", "pallet.delivered (buyer app)", "ustn.scanned (any app, opens TCC)"],
  voiceConfirmation: "All scan events support voice confirmation (Vosk offline transcription) for hands-free operation",
  offlineSupport: "Mobile apps support offline operation with sync when back online (Yjs document sync)",
} as const;

// ============ v18 §12.6 — USTN QR Code ============

export const USTN_QR_CODE = {
  format: "QR code (ISO/IEC 18004) encoding the USTN string",
  content: "USTN string (e.g., 'SGTX-EG-26-F3A-1')",
  scanWorkflow: [
    "1. User opens SGTX mobile app",
    "2. User taps 'Scan QR Code'",
    "3. App scans the QR code",
    "4. App extracts the USTN",
    "5. App validates USTN format (v18 §5.1)",
    "6. App displays USTN info + offers to open TCC",
    "7. User taps 'Open TCC' → app navigates to /trades/{ustn}",
  ],
  verifiableCredentialEmbed: "The QR code may also embed a W3C Verifiable Credential (Trust Passport) for offline verification",
  nonMarketplaceRule: "Scanning a USTN never surfaces unsolicited counterparties or trades",
} as const;

// ============ v18 §12.8 — AI Authority Summary (Phase 5) ============

export const PHASE_5_AI_AUTHORITY = [
  { agent: "A1 (Groq)", role: "Plain-language milestone explanations + tenant messages" },
  { agent: "A2 (HF Donut)", role: "Booking confirmation extraction (vessel/IMO/voyage/ETD/ETA/container numbers)" },
  { agent: "A2 (Schedule Optimiser)", role: "Loading window suggestions based on cutoffs, traffic, weather, historical performance" },
  { agent: "A2 (Quality Assessment)", role: "QC inspection + CONDITIONAL_PASS detection" },
  { agent: "A2 (Port Congestion Detection)", role: "Real-time port congestion flags + ETA adjustments" },
  { agent: "A2 (Fraud Detection)", role: "Anomaly detection on scan events (e.g., same pallet scanned at two ports simultaneously)" },
  { agent: "A4 (OPA + WasmEdge)", role: "Governor gates G1U35 (pallet_details.status), G1U36 (QC hold release), G1U37 (milestone-triggered payment validation)" },
] as const;

// ============ Convenience: full canonical Phase 5 payload ============

export function getPhysicalExecutionPayload() {
  return {
    principles: PHYSICAL_EXECUTION_PRINCIPLES,
    workflow_steps: PHYSICAL_EXECUTION_STEPS,
    container_identity: CONTAINER_IDENTITY,
    pallet_identity: PALLET_IDENTITY,
    multi_clock_view: MULTI_CLOCK_VIEW,
    milestone_payment_triggers: MILESTONE_PAYMENT_TRIGGERS,
    deferred_payment_handling: DEFERRED_PAYMENT_HANDLING,
    qc_hold_impact: QC_HOLD_IMPACT,
    mobile_app_barcode: MOBILE_APP_BARCODE,
    ustn_qr_code: USTN_QR_CODE,
    ai_authority: PHASE_5_AI_AUTHORITY,
    counts: {
      principles: PHYSICAL_EXECUTION_PRINCIPLES.length, // 9
      workflow_steps: PHYSICAL_EXECUTION_STEPS.length, // 9
      pre_execution_substeps: PHYSICAL_EXECUTION_STEPS[0].substeps.length, // 5
      container_release_substeps: PHYSICAL_EXECUTION_STEPS[1].substeps.length, // 4
      multi_clocks: MULTI_CLOCK_VIEW.clocks.length, // 7
      milestone_payment_triggers: MILESTONE_PAYMENT_TRIGGERS.length, // 8
      qc_hold_immediate_actions: QC_HOLD_IMPACT.immediateActions.length, // 3
      qc_hold_resolution_steps: QC_HOLD_IMPACT.resolutionFlow.length, // 4
      mobile_app_types: MOBILE_APP_BARCODE.appTypes.length, // 3
      barcode_formats: MOBILE_APP_BARCODE.barcodeFormats.length, // 3
      scan_events: MOBILE_APP_BARCODE.scanEvents.length, // 5
      qr_scan_workflow_steps: USTN_QR_CODE.scanWorkflow.length, // 7
      ai_authority_entries: PHASE_5_AI_AUTHORITY.length, // 7
    },
    layer: "L1 — Architectural",
    amendment_path: "Versioned change control; changes must not violate L0 (§3.6)",
  };
}
