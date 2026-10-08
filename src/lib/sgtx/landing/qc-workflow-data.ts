// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #6: QC Workflow Data
// QC inspection journey: Job Received → AQL Plan → Inspector Assign →
// On-Site Inspection (AR + HF ViT) → Defect Analysis → Report Submission →
// Conditional Pass → Re-inspection → Settlement
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, Layers, Smartphone, Camera, Microscope,
  ClipboardCheck, ShieldAlert, RotateCcw, DollarSign,
  CheckCircle2, Clock, AlertTriangle, Gavel, Wallet,
  Award, Eye, ScanLine, FileText, FileSignature,
} from "lucide-react";

// ── 9-STEP QC WORKFLOW (form definition per step) ──────────────────────────
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

export const QC_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "job-received",
    name: "Inspection Job Received",
    specRef: "§16.8.6.6",
    purpose: "Seller/buyer requests inspection (pre-shipment, loading, or both). Lab reviews scope, confirms ISO 17020 accreditation covers requested inspection type.",
    icon: Inbox,
    governorGate: "G1U1 (identity verified)",
    aiSuggestion: "Inspection job from Sahara Exports: pre-shipment + loading supervision. 20,000 kg Frozen Strawberries (248 cartons). ISO 17020 covers all inspection types. Fee: $850. Inspector: Ahmed M. (rating 4.8). Coverage validated (2 QC providers within 50km).",
    fields: [
      { key: "job", label: "Inspection Job Source", type: "select", options: ["Sahara Exports (Mode B — seller selection)", "Nile Harvest Trading (buyer direct)", "Delta Agro (Mode B)"], required: true, defaultValue: "Sahara Exports (Mode B — seller selection)" },
      { key: "type", label: "Inspection Type", type: "select", options: ["Pre-shipment", "Loading supervision", "Pre-shipment + Loading", "Container stuffing"], required: true, defaultValue: "Pre-shipment + Loading" },
      { key: "commodity", label: "Commodity", type: "text", defaultValue: "Frozen Strawberries — 20,000 kg (248 cartons)" },
      { key: "accreditation", label: "Accreditation Scope Verified", type: "toggle", options: ["Yes — ISO 17020 covers pre-shipment + loading", "Partial — loading needs subcontracting"], defaultValue: "Yes — ISO 17020 covers pre-shipment + loading", required: true },
      { key: "fee", label: "Inspection Fee", type: "number", defaultValue: "850", required: true },
      { key: "accept", label: "Accept Inspection Job", type: "toggle", options: ["Accept & assign inspector", "Decline"], defaultValue: "Accept & assign inspector", required: true },
    ],
  },
  {
    number: 2,
    id: "aql-plan",
    name: "AQL Sampling Plan Generation",
    specRef: "§16.8.6.6",
    purpose: "AI generates AQL plan based on lot size (248 cartons), inspection level (II normal), and code letter (M). Calculates sample size, acceptance, and rejection numbers.",
    icon: Layers,
    governorGate: "G1U6 (intent consistent)",
    aiSuggestion: "AQL Level II (normal), single sampling. Lot size: 248 cartons → code letter M. Sample size: 125 cartons (50.4%). Acceptance: 5 major, 7 minor. Rejection: 6 major, 8 minor. 3 inspection points: pre-stuffing, loading, seal application.",
    fields: [
      { key: "aql-level", label: "AQL Level", type: "radio", options: ["Level I (reduced)", "Level II (normal) — recommended", "Level III (tightened)"], required: true, defaultValue: "Level II (normal) — recommended" },
      { key: "lot-size", label: "Lot Size", type: "number", defaultValue: "248 cartons", required: true },
      { key: "code-letter", label: "Code Letter (auto)", type: "text", defaultValue: "M (lot 248, Level II)" },
      { key: "sample-size", label: "Sample Size (auto)", type: "text", defaultValue: "125 cartons (50.4% of lot)" },
      { key: "acceptance", label: "Acceptance Numbers", type: "text", defaultValue: "5 major, 7 minor (pass if ≤)" },
      { key: "rejection", label: "Rejection Numbers", type: "text", defaultValue: "6 major, 8 minor (fail if ≥)" },
      { key: "inspection-points", label: "AI-Recommended Inspection Points", type: "textarea", defaultValue: "1. Pre-stuffing (warehouse — carton condition, labeling). 2. Container loading (port — stowage, dunnage). 3. Seal application (gate — seal number, GPS stamp)." },
    ],
  },
  {
    number: 3,
    id: "inspector-assign",
    name: "Inspector Assignment & Mobile App Sync",
    specRef: "§16.1.4.2",
    purpose: "Assign inspector with passkey + biometric. Pair QC Inspector App via QR. App downloads AQL plan, offline OSRM, SSCC manifest. AR overlay + HF ViT ready.",
    icon: Smartphone,
    governorGate: "G5U1 (milestone valid — inspector verified)",
    aiSuggestion: "Inspector: Ahmed M. (GTID SGTX-EG-26-DM3A-0101, rating 4.8, 18 jobs, 0 overrides). Paired via QR + passkey + biometric. App synced: AQL plan (125 cartons), offline OSRM, 248 SSCC labels, AR pallet overlay, HF ViT defect detection. Offline queue ready.",
    fields: [
      { key: "inspector", label: "Inspector Assignment", type: "select", options: ["Ahmed M. (rating 4.8, 18 jobs, 0 overrides) — recommended", "Mostafa R. (rating 4.7, 14 jobs)", "Khaled A. (rating 4.9, 22 jobs)"], required: true, defaultValue: "Ahmed M. (rating 4.8, 18 jobs, 0 overrides) — recommended" },
      { key: "pairing", label: "Mobile App Pairing", type: "toggle", options: ["Paired (QR + passkey + biometric)", "Pending"], defaultValue: "Paired (QR + passkey + biometric)", required: true },
      { key: "sync", label: "App Data Synced", type: "toggle", options: ["Synced (AQL plan + offline OSRM + 248 SSCC + AR overlay + HF ViT)", "Syncing..."], defaultValue: "Synced (AQL plan + offline OSRM + 248 SSCC + AR overlay + HF ViT)" },
      { key: "schedule", label: "Inspection Scheduled", type: "text", defaultValue: "2026-10-02 09:00 EET (Sahara Cold Storage #3)" },
      { key: "offline-ready", label: "Offline Queue Ready", type: "toggle", options: ["Yes (auto-retry 1s→60s, max 5)", "No"], defaultValue: "Yes (auto-retry 1s→60s, max 5)" },
    ],
  },
  {
    number: 4,
    id: "on-site-inspection",
    name: "On-Site Inspection (AR + HF ViT)",
    specRef: "§16.8.6.6, §16.1.4.2",
    purpose: "Inspector arrives on-site. Barcode scans SSCC labels (125 samples). AR overlay shows expected pallet positions. HF ViT scans for defects. Photos captured with AR annotations.",
    icon: Camera,
    governorGate: "G5U2 (document — scans + photos) + G5U3 (external fact — GPS)",
    aiSuggestion: "Ahmed M. arrived at Sahara Cold Storage #3 (geofence 09:02). Scanning 125 SSCC carton labels from 248... AR overlay active (pallet positions). HF ViT scanning: 2 minor defects flagged — label misalignment (3 cartons), carton damage (2 cartons). 4 photos captured (AR annotated). GPS stamped.",
    fields: [
      { key: "arrival", label: "Arrival at Site", type: "toggle", options: ["Arrived (geofence triggered 09:02)", "En route"], defaultValue: "Arrived (geofence triggered 09:02)", required: true },
      { key: "scanning", label: "SSCC Barcode Scanning", type: "toggle", options: ["All 125 samples scanned ✓", "Scanning in progress...", "Scan failed"], defaultValue: "All 125 samples scanned ✓", required: true },
      { key: "ar-overlay", label: "AR Overlay (Pallet Positions)", type: "toggle", options: ["Active (AR.js rendering)", "Inactive"], defaultValue: "Active (AR.js rendering)" },
      { key: "hf-vit", label: "HF ViT Defect Detection", type: "toggle", options: ["2 minor defects flagged (label + carton)", "No defects detected", "Critical defects detected"], defaultValue: "2 minor defects flagged (label + carton)", required: true },
      { key: "photos", label: "Photo Evidence", type: "text", defaultValue: "4 photos captured (AR annotated with defect markers)" },
      { key: "gps", label: "GPS Stamp", type: "text", defaultValue: "29.9668°N, 30.9443°E (within geofence)" },
    ],
  },
  {
    number: 5,
    id: "defect-analysis",
    name: "Defect Analysis & AQL Evaluation",
    specRef: "§16.8.6.6",
    purpose: "Compile defects found. Evaluate against AQL acceptance/rejection numbers. Determine verdict: PASS, FAIL, or CONDITIONAL. AI assists with classification (major vs minor).",
    icon: Microscope,
    governorGate: "G1U6 (intent consistent — AQL evaluation)",
    aiSuggestion: "Defects found: 3 minor (label misalignment), 2 minor (carton damage) = 5 total minor. 0 major. AQL Level II acceptance: 7 minor (pass if ≤7). 5 ≤ 7 → within acceptance. But 5 defects > 0 → CONDITIONAL pass (action plan required). Verdict: CONDITIONAL.",
    fields: [
      { key: "major-defects", label: "Major Defects", type: "number", defaultValue: "0", required: true },
      { key: "minor-defects", label: "Minor Defects", type: "number", defaultValue: "5 (3 label misalignment + 2 carton damage)", required: true },
      { key: "aql-evaluation", label: "AQL Evaluation", type: "textarea", defaultValue: "Acceptance: 5 major, 7 minor. Found: 0 major, 5 minor. 5 ≤ 7 minor acceptance → within acceptance. But defects > 0 → CONDITIONAL (not clean PASS)." },
      { key: "ai-classification", label: "AI Defect Classification (A2)", type: "textarea", defaultValue: "HF ViT classified: 3× label misalignment (minor — cosmetic,不影响 quality), 2× carton damage (minor — external, product intact). 0 major. Confidence: 94%." },
      { key: "verdict", label: "Verdict", type: "radio", options: ["PASS — 0 defects (clean)", "CONDITIONAL — defects within AQL but action plan required", "FAIL — defects exceed AQL rejection"], required: true, defaultValue: "CONDITIONAL — defects within AQL but action plan required" },
    ],
  },
  {
    number: 6,
    id: "report-submission",
    name: "Report Submission (PASS/FAIL/CONDITIONAL)",
    specRef: "§16.8.6.6",
    purpose: "Submit inspection report to Governor G5. Photo evidence + AR annotations attached. Conditional QC hold raised if applicable. Buyer + seller notified. Loom hash appended.",
    icon: ClipboardCheck,
    governorGate: "G5U2 (document — report) + G5 (conditional hold)",
    aiSuggestion: "Report RPT-2026-0042 submitted to Governor G5. Verdict: CONDITIONAL. Evidence: 4 AR-annotated photos, HF ViT scan log, AQL evaluation, GPS stamp. Conditional QC hold raised. Buyer + seller notified (p95). Shipment blocked until action plan approved. Loom hash appended.",
    fields: [
      { key: "report-id", label: "Report ID", type: "text", defaultValue: "RPT-2026-0042" },
      { key: "verdict", label: "Verdict", type: "text", defaultValue: "CONDITIONAL (2 minor defects, within AQL, action plan required)" },
      { key: "evidence", label: "Evidence Package", type: "textarea", defaultValue: "4 AR-annotated photos (defect markers), HF ViT scan log (94% confidence), AQL evaluation sheet, GPS stamp, SSCC scan log (125/125)" },
      { key: "qc-hold", label: "Conditional QC Hold", type: "toggle", options: ["Raised (G5 CONDITIONAL — shipment blocked until action plan)", "Not required (PASS)"], defaultValue: "Raised (G5 CONDITIONAL — shipment blocked until action plan)", required: true },
      { key: "notify", label: "Notify Buyer + Seller", type: "toggle", options: ["Yes (Smart Inbox p95 + NATS)", "No"], defaultValue: "Yes (Smart Inbox p95 + NATS)" },
      { key: "loom", label: "Loom Hash Appended", type: "toggle", options: ["Appended (immutable audit)", "Pending"], defaultValue: "Appended (immutable audit)" },
    ],
  },
  {
    number: 7,
    id: "conditional-pass",
    name: "Conditional Pass — Action Plan Workflow",
    specRef: "§16.8.6.6",
    purpose: "If CONDITIONAL: seller must submit action plan addressing defects. Hold flag active. QC reviews plan. If approved: hold released, shipment proceeds. If rejected: FAIL.",
    icon: ShieldAlert,
    governorGate: "G5 (hold flag enforcement)",
    aiSuggestion: "Conditional pass raised. Seller (Sahara Exports) must submit action plan within 48h addressing: 3 label misalignment (re-label), 2 carton damage (replace cartons). Hold flag ACTIVE — shipment blocked. If plan approved: release hold. If rejected or no response: escalate to FAIL.",
    fields: [
      { key: "hold-flag", label: "Hold Flag Status", type: "toggle", options: ["ACTIVE (shipment blocked until action plan approved)", "Released (plan approved)", "Escalated to FAIL (plan rejected)"], defaultValue: "ACTIVE (shipment blocked until action plan approved)", required: true },
      { key: "action-plan", label: "Seller Action Plan Required", type: "textarea", defaultValue: "Re-label 3 cartons (label misalignment). Replace 2 damaged cartons. Resubmit for re-inspection of affected cartons only." },
      { key: "deadline", label: "Action Plan Deadline", type: "text", defaultValue: "2026-09-20 06:00 EET (48h from report submission)" },
      { key: "review", label: "QC Review Status", type: "toggle", options: ["Pending seller response", "Plan submitted — under review", "Approved — hold released", "Rejected — escalated to FAIL"], defaultValue: "Pending seller response" },
    ],
  },
  {
    number: 8,
    id: "re-inspection",
    name: "Re-inspection (if disputed)",
    specRef: "§16.8.6.6",
    purpose: "If seller disputes verdict: re-inspection with Level III (tightened). Different inspector assigned. +50% surcharge. Original evidence preserved. Re-inspection verdict is final.",
    icon: RotateCcw,
    governorGate: "G5 (re-inspection enforcement)",
    aiSuggestion: "Not applicable for this inspection (CONDITIONAL accepted by seller). If disputed: Level III tightened (80 cartons from 248), different inspector (Mostafa R.), +50% surcharge ($1,275). Original evidence + HF ViT scans preserved. Re-inspection verdict is final — no further disputes.",
    fields: [
      { key: "dispute", label: "Verdict Disputed by Seller?", type: "toggle", options: ["No — conditional accepted (action plan in progress)", "Yes — re-inspection requested"], defaultValue: "No — conditional accepted (action plan in progress)" },
      { key: "re-inspection-level", label: "Re-inspection AQL Level", type: "text", defaultValue: "Level III (tightened) — if disputed" },
      { key: "new-inspector", label: "New Inspector (different from original)", type: "text", defaultValue: "Mostafa R. (if disputed — prevents bias)" },
      { key: "surcharge", label: "Re-inspection Surcharge", type: "text", defaultValue: "+50% ($1,275 total — if disputed)" },
      { key: "finality", label: "Re-inspection Verdict Finality", type: "toggle", options: ["Final (no further disputes allowed)", "Appealable"], defaultValue: "Final (no further disputes allowed)" },
    ],
  },
  {
    number: 9,
    id: "settlement",
    name: "Inspection Fee Settlement (ISO 20022)",
    specRef: "§13",
    purpose: "Inspection fee $850 settled via ISO 20022 (pain.001). Reconciliation ≥95%. SLA credit if turnaround breached. Closure hash published. Conditional hold tracked until resolved.",
    icon: DollarSign,
    governorGate: "G6 (settlement) + G7 (closure)",
    aiSuggestion: "Inspection fee $850 settled via pain.001 (CBE clearing). Reconciliation 100%. SLA credit: $0 (report submitted within 6h, well within 48h SLA). Conditional hold tracked separately — fee settled regardless. Closure hash published. Loom audit complete.",
    fields: [
      { key: "invoice", label: "Inspection Fee Invoice", type: "text", defaultValue: "INV-QC-2026-0042 ($850 — pre-shipment + loading, AQL Level II)" },
      { key: "settlement", label: "ISO 20022 Settlement", type: "toggle", options: ["Confirmed (pain.001, CBE clearing)", "Pending"], defaultValue: "Confirmed (pain.001, CBE clearing)", required: true },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "100% (≥95% threshold — passed)" },
      { key: "sla", label: "SLA Credit Applied", type: "toggle", options: ["$0 (report within 6h, well within 48h SLA)", "$425 (turnover breach, 50% refund)"], defaultValue: "$0 (report within 6h, well within 48h SLA)" },
      { key: "hold-tracking", label: "Conditional Hold Tracking", type: "text", defaultValue: "Tracked separately — fee settled, hold remains until action plan resolved" },
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

export const QC_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Inspection Job Received",
    specRef: "§16.8.6.6",
    status: "complete",
    description: "Job from Sahara Exports: pre-shipment + loading. 20,000 kg Frozen Strawberries (248 cartons). ISO 17020 verified. Fee $850.",
    governorGate: "G1U1",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "AQL Plan Generated",
    specRef: "§16.8.6.6",
    status: "complete",
    description: "Level II normal, code letter M, 125/248 cartons sampled. Acceptance: 5 major, 7 minor. 3 inspection points defined.",
    governorGate: "G1U6",
    icon: Layers,
  },
  {
    phase: "Phase 3",
    name: "Inspector Assigned & App Synced",
    specRef: "§16.1.4.2",
    status: "complete",
    description: "Ahmed M. assigned (rating 4.8). Paired via QR + passkey + biometric. AQL plan, OSRM, SSCC, AR, HF ViT synced. Offline ready.",
    governorGate: "G5U1",
    icon: Smartphone,
  },
  {
    phase: "Phase 4",
    name: "On-Site Inspection Complete",
    specRef: "§16.8.6.6",
    status: "complete",
    description: "Arrived 09:02 (geofence). 125 SSCC scanned. AR overlay active. HF ViT: 2 minor defects flagged. 4 AR-annotated photos. GPS stamped.",
    governorGate: "G5U2 + G5U3",
    icon: Camera,
  },
  {
    phase: "Phase 5",
    name: "Defect Analysis & AQL Evaluation",
    specRef: "§16.8.6.6",
    status: "complete",
    description: "5 minor defects (3 label, 2 carton). 0 major. 5 ≤ 7 acceptance → within AQL. Verdict: CONDITIONAL (defects > 0).",
    governorGate: "G1U6",
    icon: Microscope,
  },
  {
    phase: "Phase 6",
    name: "Report Submitted (CONDITIONAL)",
    specRef: "§16.8.6.6",
    status: "active",
    description: "RPT-2026-0042 submitted. Verdict: CONDITIONAL. Evidence attached. QC hold raised. Buyer + seller notified (p95). Loom appended.",
    governorGate: "G5U2 + G5",
    icon: ClipboardCheck,
  },
  {
    phase: "Phase 7",
    name: "Conditional Pass — Action Plan",
    specRef: "§16.8.6.6",
    status: "pending",
    description: "Hold flag ACTIVE. Seller must submit action plan within 48h. Re-label 3 cartons, replace 2 damaged. Hold released on approval.",
    governorGate: "G5",
    icon: ShieldAlert,
  },
  {
    phase: "Phase 8",
    name: "Re-inspection (if disputed)",
    specRef: "§16.8.6.6",
    status: "pending",
    description: "Not applicable (conditional accepted). If disputed: Level III tightened, different inspector, +50% surcharge, final verdict.",
    governorGate: "G5",
    icon: RotateCcw,
  },
  {
    phase: "Phase 9",
    name: "Inspection Fee Settlement (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "Fee $850 settled via pain.001 (CBE). Reconciliation 100%. SLA $0 (within 48h). Closure hash published. Hold tracked separately.",
    governorGate: "G6 + G7",
    icon: DollarSign,
  },
];

// ── G5 VALIDATION GATES (report submission) ─────────────────────────────────
export const QC_VALIDATION_GATES = [
  { gate: "G5U1", name: "Milestone Valid", description: "Inspection job accepted, inspector assigned + verified (passkey + biometric), AQL plan generated", status: "pass" },
  { gate: "G5U2", name: "Document Uploaded", description: "Report + 4 AR-annotated photos + HF ViT scan log + AQL evaluation + SSCC scan log uploaded", status: "pass" },
  { gate: "G5U3", name: "External Fact Reconciled", description: "GPS geofence arrival confirmed at Sahara Cold Storage #3 (29.9668°N, 30.9443°E)", status: "pass" },
  { gate: "G5U4", name: "Payment Authorized", description: "Inspection fee FeeLock ACTIVE ($850, ISO 20022 pending)", status: "pass" },
  { gate: "G5U5", name: "Carrier Confirmed", description: "Cairo QC Services (SGTX-EG-26-CQ5A-0019) confirmed as QC provider; ISO 17020 verified", status: "pass" },
  { gate: "G5U6", name: "Customs Pre-Arrival", description: "N/A for QC (customs is buyer/SHIP responsibility)", status: "n/a" },
  { gate: "G5U7", name: "QC Inspection", description: "COMPLETE — 5 minor defects, CONDITIONAL verdict. This IS the QC inspection", status: "conditional" },
  { gate: "G5U8", name: "Lab Results In", description: "N/A for QC (lab tests are LAB portal responsibility)", status: "n/a" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const QC_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  inspectionJob: "INS-2026-0042",
  reportId: "RPT-2026-0042",
  seller: "Sahara Exports",
  commodity: "Frozen Strawberries — 20,000 kg (248 cartons)",
  inspectionType: "Pre-shipment + Loading supervision",
  aqlPlan: "Level II (normal), code letter M, 125/248 sampled",
  inspector: "Ahmed M. (GTID SGTX-EG-26-DM3A-0101, rating 4.8)",
  inspectionDate: "2026-10-02 09:02 EET (geofence arrival)",
  defects: "5 minor (3 label misalignment + 2 carton damage), 0 major",
  verdict: "CONDITIONAL (within AQL, action plan required)",
  holdFlag: "ACTIVE (shipment blocked until action plan approved)",
  photoEvidence: "4 AR-annotated photos (defect markers via HF ViT)",
  hfVitConfidence: "94% (defect classification)",
  inspectionFee: "$850",
  slaCredit: "$0 (report within 6h, well within 48h SLA)",
  netReceived: "$850",
  reconciliation: "100% (≥95% threshold — passed)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0x5d8b...c73f (published on Loom)",
};

// ── CLOSURE CONDITIONS (QC perspective) ───────────────────────────────────
export const QC_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (job accepted, AQL generated, inspection complete, report submitted)", status: "pending" as const },
  { name: "All documents verified (report, AR photos, HF ViT scan log, AQL evaluation, SSCC scan log)", status: "pending" as const },
  { name: "All payments settled (inspection fee $850 via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (100% achieved)", status: "pending" as const },
  { name: "No open disputes (seller may dispute CONDITIONAL verdict)", status: "pending" as const },
  { name: "No open exceptions (conditional QC hold must be resolved via action plan)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, QC subset: photos + HF ViT + AQL sheet)", status: "pending" as const },
];
