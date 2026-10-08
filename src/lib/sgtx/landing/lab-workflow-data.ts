// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #5: LAB Workflow Data
// Laboratory journey: Job Received → Sample Receipt → Preparation →
// Instrument Analysis → MRL Validation → Result Submission →
// Certificate Auto-Trigger → QES Signature → Settlement
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, TestTube, FlaskConical, Microscope, Scale,
  ClipboardCheck, FileSignature, DollarSign, CheckCircle2,
  Clock, AlertTriangle, ShieldAlert, Gavel, Wallet,
  Award, Beaker, FileCheck,
} from "lucide-react";

// ── 9-STEP LAB WORKFLOW (form definition per step) ──────────────────────────
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

export const LAB_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "job-received",
    name: "Testing Job Received & Quoted",
    specRef: "§16.8.7",
    purpose: "Seller/buyer requests testing via Mode B (seller lab selection). Lab reviews test panel, quotes fee, confirms accreditation scope covers requested analytes.",
    icon: Inbox,
    governorGate: "G1U1 (identity verified)",
    aiSuggestion: "Testing job from Sahara Exports: 14 EU MRL pesticides + microbial + nutritional (20 analytes). Accreditation scope verified (ISO 17025 covers all 20). Fee: $1,840. Turnaround: 48h. Sample ready for pickup at Sahara Cold Storage #3.",
    fields: [
      { key: "job", label: "Testing Job Source", type: "select", options: ["Sahara Exports (Mode B — seller lab selection)", "Nile Harvest Trading (buyer direct)", "Delta Agro (Mode B)"], required: true, defaultValue: "Sahara Exports (Mode B — seller lab selection)" },
      { key: "test-panel", label: "Test Panel", type: "text", defaultValue: "14 EU MRL Pesticides + Microbial + Nutritional (20 analytes)" },
      { key: "accreditation-check", label: "Accreditation Scope Verified", type: "toggle", options: ["Yes — ISO 17025 covers all 20 analytes", "Partial — 3 analytes need subcontracting"], defaultValue: "Yes — ISO 17025 covers all 20 analytes", required: true },
      { key: "fee", label: "Quoted Fee", type: "number", defaultValue: "1840", required: true, aiAssist: "A2 fair price" },
      { key: "turnaround", label: "Turnaround Time", type: "select", options: ["24h (rush, +50% surcharge)", "48h (standard)", "72h (economy)"], defaultValue: "48h (standard)", required: true },
      { key: "accept", label: "Accept Testing Job", type: "toggle", options: ["Accept & schedule sample pickup", "Decline"], defaultValue: "Accept & schedule sample pickup", required: true },
    ],
  },
  {
    number: 2,
    id: "sample-receipt",
    name: "Sample Receipt & Chain-of-Custody",
    specRef: "§16.8.7",
    purpose: "Sample courier delivers temperature-controlled sample. Chain-of-custody form verified. Temperature logged. Sample registered in LIMS with unique ID.",
    icon: TestTube,
    governorGate: "G5U3 (external fact — sample arrival)",
    aiSuggestion: "Sample SMP-2026-0042-A delivered by courier (temp -18.2°C, within ±0.5°C). Chain-of-custody form signed by courier + lab receiving. Registered in LIMS. 500g frozen strawberry homogenate. Storage: -20°C freezer, slot B-14.",
    fields: [
      { key: "sample-id", label: "Sample ID (LIMS)", type: "text", defaultValue: "SMP-2026-0042-A" },
      { key: "arrival-temp", label: "Arrival Temperature", type: "text", defaultValue: "-18.2°C (within ±0.5°C target)" },
      { key: "weight", label: "Sample Weight", type: "text", defaultValue: "500g (frozen strawberry homogenate)" },
      { key: "coc", label: "Chain-of-Custody", type: "toggle", options: ["Verified (courier + lab dual signature)", "Pending"], defaultValue: "Verified (courier + lab dual signature)", required: true },
      { key: "storage", label: "Storage Assignment", type: "text", defaultValue: "Freezer B-14, -20°C, 24/7 monitoring" },
      { key: "lims", label: "LIMS Registration", type: "toggle", options: ["Registered (SMP-2026-0042-A)", "Pending"], defaultValue: "Registered (SMP-2026-0042-A)" },
    ],
  },
  {
    number: 3,
    id: "sample-preparation",
    name: "Sample Preparation & Internal QC",
    specRef: "§16.8.7",
    purpose: "Homogenization, aliquoting, spiking with internal standards. Internal QC samples (blank, matrix spike, duplicate) prepared per ISO 17025 method requirements.",
    icon: Beaker,
    governorGate: "G1U6 (intent consistent)",
    aiSuggestion: "Sample homogenized (500g → 5× 100g aliquots). Internal QC prepared: method blank, matrix spike (2× MRL), matrix spike duplicate. Solvent extraction (QuEChERS method) for pesticide panel. Microbial aliquots plated.",
    fields: [
      { key: "homogenization", label: "Homogenization", type: "toggle", options: ["Complete (500g → 5× 100g aliquots)", "Pending"], defaultValue: "Complete (500g → 5× 100g aliquots)", required: true },
      { key: "method", label: "Extraction Method", type: "select", options: ["QuEChERS (pesticide multi-residue)", "Solvent extraction (mycotoxins)", "Acid digestion (heavy metals)"], defaultValue: "QuEChERS (pesticide multi-residue)" },
      { key: "qc-samples", label: "Internal QC Samples", type: "textarea", defaultValue: "Method blank (negative control), Matrix spike at 2× MRL, Matrix spike duplicate (RPD <20%), Solvent blank" },
      { key: "aliquots", label: "Aliquots Prepared", type: "text", defaultValue: "5× 100g (3 for pesticide, 1 for microbial, 1 reserve)" },
    ],
  },
  {
    number: 4,
    id: "instrument-analysis",
    name: "Instrument Analysis (GC-MS / HPLC / ICP-MS)",
    specRef: "§16.8.7",
    purpose: "Pesticide residues via GC-MS. Mycotoxins/nutritional via HPLC. Heavy metals via ICP-MS. Microbiology via culture/plating. Calibration verified before each run.",
    icon: Microscope,
    governorGate: "G5U2 (document — analysis data)",
    aiSuggestion: "GC-MS run complete (Agilent 7890B/5977B). 14 pesticide analytes + 6 microbial + 4 nutritional = 20 total. Internal QC passed (matrix spike recovery 92-108%, RPD 8%). 2 analytes flagged: Chlorpyrifos 0.08 mg/kg, Malathion 0.05 mg/kg.",
    fields: [
      { key: "gc-ms", label: "GC-MS Analysis (Pesticides)", type: "toggle", options: ["Complete — 14 analytes, 2 flagged", "In progress", "Pending"], defaultValue: "Complete — 14 analytes, 2 flagged", required: true },
      { key: "hplc", label: "HPLC Analysis (Mycotoxins + Nutritional)", type: "toggle", options: ["Complete — all compliant", "In progress", "Pending"], defaultValue: "Complete — all compliant" },
      { key: "micro", label: "Microbiology (Culture/Plating)", type: "toggle", options: ["Complete — all compliant", "In progress", "Pending"], defaultValue: "Complete — all compliant" },
      { key: "calibration", label: "Pre-run Calibration Verified", type: "toggle", options: ["Verified (GC-MS last cal 2026-08-25)", "Failed"], defaultValue: "Verified (GC-MS last cal 2026-08-25)", required: true },
      { key: "qc-pass", label: "Internal QC Passed", type: "toggle", options: ["Yes (spike recovery 92-108%, RPD 8%)", "Failed — re-run required"], defaultValue: "Yes (spike recovery 92-108%, RPD 8%)", required: true },
    ],
  },
  {
    number: 5,
    id: "mrl-validation",
    name: "MRL Validation (EU vs Domestic Standards)",
    specRef: "§16.8.7",
    purpose: "RIA determines applicable jurisdiction (EU for Italy destination). Compare detected values against EU MRL (Regulation 396/2005). Strictest rule applies (§3 Pillar III).",
    icon: Scale,
    governorGate: "G1U6 (intent consistent)",
    aiSuggestion: "Destination: Italy (EU). EU MRL applies (stricter than Egyptian domestic). 2 non-compliant: Chlorpyrifos 0.08 mg/kg vs EU MRL 0.01 (8× exceedance), Malathion 0.05 vs 0.02 (2.5× exceedance). Conditional QC hold will be raised on result submission.",
    fields: [
      { key: "jurisdiction", label: "Applicable Jurisdiction (RIA)", type: "text", defaultValue: "EU (Italy destination) — strictest applies (§3 Pillar III)" },
      { key: "eu-mrl", label: "EU MRL Standard", type: "text", defaultValue: "Regulation 396/2005 (14 pesticide MRLs + microbial limits)" },
      { key: "comparison", label: "Detected vs MRL Comparison", type: "textarea", defaultValue: "Chlorpyrifos: 0.08 mg/kg vs EU MRL 0.01 → NON-COMPLIANT (8× exceedance). Malathion: 0.05 vs 0.02 → NON-COMPLIANT (2.5×). 12/14 compliant. All microbial compliant." },
      { key: "verdict", label: "Overall Verdict", type: "radio", options: ["PASS — all compliant", "CONDITIONAL — 2 non-compliant (QC hold required)", "FAIL — critical non-compliance"], defaultValue: "CONDITIONAL — 2 non-compliant (QC hold required)", required: true },
    ],
  },
  {
    number: 6,
    id: "result-submission",
    name: "Result Submission & Evidence Package",
    specRef: "§16.8.7",
    purpose: "Submit results to Governor G5. Evidence package attached (chromatograms, calibration, QC data). Conditional QC hold raised if non-compliant. Loom hash appended.",
    icon: ClipboardCheck,
    governorGate: "G5U2 (document — results) + G5 (conditional hold)",
    aiSuggestion: "Results submitted to Governor G5. Evidence package attached: GC-MS chromatograms, calibration logs, QC spike recovery, RPD calculations. 2/14 non-compliant → CONDITIONAL QC hold raised. Buyer + seller notified. Loom hash appended.",
    fields: [
      { key: "results", label: "Results Summary", type: "textarea", defaultValue: "12/14 MRL compliant. 2 non-compliant (Chlorpyrifos 8× MRL, Malathion 2.5× MRL). All microbial compliant. Verdict: CONDITIONAL." },
      { key: "evidence", label: "Evidence Package", type: "textarea", defaultValue: "GC-MS chromatograms (14 analytes), calibration verification, matrix spike recovery (92-108%), RPD (8%), method blank (negative), LIMS raw data export" },
      { key: "qc-hold", label: "Conditional QC Hold", type: "toggle", options: ["Raised (G5 CONDITIONAL — action plan required)", "Not required (all compliant)"], defaultValue: "Raised (G5 CONDITIONAL — action plan required)", required: true },
      { key: "notify", label: "Notify Buyer + Seller", type: "toggle", options: ["Yes (Smart Inbox p95 + NATS)", "No"], defaultValue: "Yes (Smart Inbox p95 + NATS)" },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Appended (immutable audit)", "Pending"], defaultValue: "Appended (immutable audit)" },
    ],
  },
  {
    number: 7,
    id: "certificate-auto-trigger",
    name: "Certificate Auto-Trigger (Nafeza)",
    specRef: "§16.8.7",
    purpose: "If results pass: Nafeza auto-triggers certificate generation. Phytosanitary + Health Certificate generated from trade data. If conditional: certificates pending until action plan resolved.",
    icon: FileCheck,
    governorGate: "G5U2 (document — certificate)",
    aiSuggestion: "Conditional result → certificates PENDING until action plan resolved. If all compliant: Nafeza would auto-trigger Phytosanitary (PHY-2026-0042) + Health Certificate (HLT-2026-0042). QES signature required to release. Auto-propagated to customs.",
    fields: [
      { key: "trigger-status", label: "Nafeza Auto-Trigger", type: "toggle", options: ["Pending (conditional result — awaiting action plan)", "Fired (all compliant)", "Not applicable"], defaultValue: "Pending (conditional result — awaiting action plan)", required: true },
      { key: "cert-types", label: "Certificates Queued", type: "textarea", defaultValue: "Phytosanitary Certificate (PHY-2026-0042), Health Certificate (HLT-2026-0042) — will auto-generate when result becomes PASS" },
      { key: "action-plan", label: "Action Plan Required", type: "toggle", options: ["Yes — seller must resolve non-compliance before cert release", "No — all compliant"], defaultValue: "Yes — seller must resolve non-compliance before cert release" },
      { key: "nafeza-propagation", label: "Nafeza Auto-Propagation", type: "text", defaultValue: "Will auto-propagate to Egyptian customs single window on QES signature" },
    ],
  },
  {
    number: 8,
    id: "qes-signature",
    name: "QES Signature (Certificate Release)",
    specRef: "§16.8.7",
    purpose: "If certificates generated: sign with Qualified Electronic Signature (Egypt Trust). Releases certificate to buyer/seller. Auto-propagated to Nafeza. Webhook delivered.",
    icon: FileSignature,
    governorGate: "G5U2 (document — QES signed)",
    aiSuggestion: "Conditional result → QES pending until action plan resolved and result becomes PASS. When ready: Phytosanitary + Health Certificate signed via Egypt Trust QES (Ed25519). Auto-propagated to Nafeza. Webhook delivered to buyer, seller, LSP, customs broker.",
    fields: [
      { key: "qes-status", label: "QES Signature", type: "toggle", options: ["Pending (conditional — awaiting action plan resolution)", "Signed (Ed25519 via Egypt Trust)", "Not applicable"], defaultValue: "Pending (conditional — awaiting action plan resolution)", required: true },
      { key: "certificate-release", label: "Certificate Release", type: "toggle", options: ["Pending (conditional result blocks release)", "Released to buyer + seller"], defaultValue: "Pending (conditional result blocks release)" },
      { key: "webhook", label: "Webhook Delivery", type: "toggle", options: ["Pending (cert not yet released)", "Delivered (buyer, seller, LSP, CBR)"], defaultValue: "Pending (cert not yet released)" },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Pending", "Appended (on QES signature)"], defaultValue: "Pending" },
    ],
  },
  {
    number: 9,
    id: "settlement",
    name: "Testing Fee Settlement (ISO 20022)",
    specRef: "§13",
    purpose: "Testing fee $1,840 settled via ISO 20022 (pain.001). Reconciliation ≥95%. SLA credit if turnaround breached. Closure hash published. Funds in cash position.",
    icon: DollarSign,
    governorGate: "G6 (settlement) + G7 (closure)",
    aiSuggestion: "Testing fee $1,840 settled via pain.001 (CBE clearing). Reconciliation 100%. SLA credit: $0 (26h turnaround, within 48h SLA). Net received: $1,840. Certificate auto-triggered on result submission (pending conditional resolution). Closure hash published.",
    fields: [
      { key: "invoice", label: "Testing Fee Invoice", type: "text", defaultValue: "INV-LAB-2026-0042 ($1,840 — 20 analytes, 48h standard)" },
      { key: "settlement", label: "ISO 20022 Settlement", type: "toggle", options: ["Confirmed (pain.001, CBE clearing)", "Pending"], defaultValue: "Confirmed (pain.001, CBE clearing)", required: true },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "100% (≥95% threshold — passed)" },
      { key: "sla", label: "SLA Credit Applied", type: "toggle", options: ["$0 (26h turnaround, within 48h SLA)", "$920 (turnaround breach, 50% refund)"], defaultValue: "$0 (26h turnaround, within 48h SLA)" },
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

export const LAB_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Testing Job Received & Quoted",
    specRef: "§16.8.7",
    status: "complete",
    description: "Job from Sahara Exports: 14 EU MRL + microbial + nutritional (20 analytes). Accreditation verified. Fee $1,840. Turnaround 48h.",
    governorGate: "G1U1",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "Sample Receipt & Chain-of-Custody",
    specRef: "§16.8.7",
    status: "complete",
    description: "Sample SMP-2026-0042-A delivered (-18.2°C). Chain-of-custody verified. LIMS registered. Storage: Freezer B-14, -20°C.",
    governorGate: "G5U3",
    icon: TestTube,
  },
  {
    phase: "Phase 3",
    name: "Sample Preparation & Internal QC",
    specRef: "§16.8.7",
    status: "complete",
    description: "Homogenized (500g → 5× 100g aliquots). QuEChERS extraction. Internal QC: blank, matrix spike, duplicate.",
    governorGate: "G1U6",
    icon: Beaker,
  },
  {
    phase: "Phase 4",
    name: "Instrument Analysis (GC-MS / HPLC / Micro)",
    specRef: "§16.8.7",
    status: "complete",
    description: "GC-MS complete (14 pesticides, 2 flagged). HPLC complete (mycotoxins, all compliant). Microbiology complete (all compliant). QC passed.",
    governorGate: "G5U2",
    icon: Microscope,
  },
  {
    phase: "Phase 5",
    name: "MRL Validation (EU Standards)",
    specRef: "§16.8.7",
    status: "complete",
    description: "EU MRL applies (Italy destination). 2/14 non-compliant: Chlorpyrifos (8× MRL), Malathion (2.5× MRL). Verdict: CONDITIONAL.",
    governorGate: "G1U6",
    icon: Scale,
  },
  {
    phase: "Phase 6",
    name: "Result Submission (Conditional QC Hold)",
    specRef: "§16.8.7",
    status: "active",
    description: "Results submitted to G5. Evidence package attached. CONDITIONAL QC hold raised. Buyer + seller notified (p95). Loom hash appended.",
    governorGate: "G5U2 + G5",
    icon: ClipboardCheck,
  },
  {
    phase: "Phase 7",
    name: "Certificate Auto-Trigger (Pending)",
    specRef: "§16.8.7",
    status: "pending",
    description: "Nafeza auto-trigger PENDING (conditional result blocks). Phytosanitary + Health Certificate queued. Will fire when result becomes PASS.",
    governorGate: "G5U2",
    icon: FileCheck,
  },
  {
    phase: "Phase 8",
    name: "QES Signature (Pending)",
    specRef: "§16.8.7",
    status: "pending",
    description: "QES pending (conditional result blocks). When resolved: sign via Egypt Trust (Ed25519). Release to buyer/seller. Nafeza propagated. Webhook delivered.",
    governorGate: "G5U2",
    icon: FileSignature,
  },
  {
    phase: "Phase 9",
    name: "Testing Fee Settlement (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "Fee $1,840 settled via pain.001 (CBE). Reconciliation 100%. SLA $0 (26h within 48h). Closure hash published.",
    governorGate: "G6 + G7",
    icon: DollarSign,
  },
];

// ── G5 VALIDATION GATES (result submission) ──────────────────────────────────
export const LAB_VALIDATION_GATES = [
  { gate: "G5U1", name: "Milestone Valid", description: "Testing job accepted, sample received, LIMS registered, accreditation verified", status: "pass" },
  { gate: "G5U2", name: "Document Uploaded", description: "Results + evidence package uploaded (chromatograms, calibration, QC data, LIMS export)", status: "pass" },
  { gate: "G5U3", name: "External Fact Reconciled", description: "Sample arrival temperature (-18.2°C) reconciled with chain-of-custody log", status: "pass" },
  { gate: "G5U4", name: "Payment Authorized", description: "Testing fee FeeLock ACTIVE ($1,840, ISO 20022 pending)", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "Nile Laboratories (SGTX-EG-26-NL8B-0044) confirmed as testing provider; ISO 17025 verified", status: "pass" },
  { gate: "G5U6", name: "Customs Pre-Arrival", description: "N/A for LAB (customs is buyer/SHIP responsibility)", status: "n/a" },
  { gate: "G5U7", name: "QC Inspection", description: "N/A for LAB (this IS the QC/testing provider)", status: "n/a" },
  { gate: "G5U8", name: "Lab Results In", description: "COMPLETE — 2/14 non-compliant (Chlorpyrifos, Malathion). CONDITIONAL QC hold raised", status: "conditional" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const LAB_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  testingJob: "JOB-2026-0042",
  sampleId: "SMP-2026-0042-A",
  seller: "Sahara Exports",
  testPanel: "14 EU MRL Pesticides + Microbial + Nutritional (20 analytes)",
  instruments: "GC-MS (Agilent 7890B/5977B) + HPLC (Waters e2695) + Microbiology",
  result: "12/14 compliant — 2 non-compliant (Chlorpyrifos 8× MRL, Malathion 2.5× MRL)",
  verdict: "CONDITIONAL (QC hold raised, action plan required)",
  certificate: "PENDING (Nafeza auto-trigger blocked by conditional result)",
  turnaround: "26h (within 48h SLA)",
  testingFee: "$1,840",
  slaCredit: "$0 (within SLA)",
  netReceived: "$1,840",
  reconciliation: "100% (≥95% threshold — passed)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0xc4f7...a82e (published on Loom)",
};

// ── CLOSURE CONDITIONS (LAB perspective) ───────────────────────────────────
export const LAB_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (job accepted, sample received, analysis complete, results submitted)", status: "pending" as const },
  { name: "All documents verified (chromatograms, calibration, QC data, LIMS export, certificate)", status: "pending" as const },
  { name: "All payments settled (testing fee $1,840 via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (100% achieved)", status: "pending" as const },
  { name: "No open disputes (seller may dispute Chlorpyrifos methodology)", status: "pending" as const },
  { name: "No open exceptions (conditional QC hold must be resolved)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, LAB subset: chromatograms + QC data)", status: "pending" as const },
];
