// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #6: QC (Quality Control Inspection)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.6.6 QC features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, ClipboardCheck, Camera, Clock, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, FileText, ShieldAlert,
  Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Smartphone, Microscope, Eye, ScanLine,
  DollarSign, Timer, Award, FileSignature, RotateCcw,
  BadgeCheck, Layers, Package, Boxes,
} from "lucide-react";

// ── Active tenant (the "logged-in" QC provider for the demo) ────────────────
export const QC_TENANT = {
  name: "Cairo QC Services",
  gtid: "SGTX-EG-26-CQ5A-0019",
  kybTier: 3,
  role: "QC" as const,
  avatarInitials: "CQ",
  trustScore: 82,
  tradeCount: 18,
  activeJobs: 5,
  pendingReports: 3,
  accreditation: "ISO 17020:2012",
  inspectors: 8,
  mobileAppInspectors: 6,
  overrideRate: 2.1,
  disputeRate: 1.8,
  onTimeRate: 95.6,
};

// ── §2.5.1 SMART INBOX — QC-specific items (4-part structure) ─────────────
export interface InboxItem {
  id: string;
  what: string;
  why: string;
  deadline: string;
  action: string;
  priority: number;
  band: "High" | "Medium" | "Low";
  category: string;
  icon: LucideIcon;
  ustn?: string;
}

export const QC_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0948",
    what: "New inspection job — Pre-shipment + Loading (Frozen Strawberries, 20,000 kg)",
    why: "Seller (Sahara Exports) requested pre-shipment + loading supervision. AQL Level II, single sampling. 3 AI-recommended inspection points. Inspector: Ahmed M. Schedule: 2026-10-02 09:00.",
    deadline: "2026-09-19 18:00 EET",
    action: "Accept Inspection Job",
    priority: 80,
    band: "High",
    category: "NEW_OFFER",
    icon: ClipboardCheck,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0946",
    what: "Report submission deadline — USTN ...0037-2 (conditional pass)",
    why: "Inspection complete. 2 minor defects found (label misalignment, carton damage). Conditional pass — action plan required. Submit report with photo evidence within 6h.",
    deadline: "2026-09-19 06:00 EET",
    action: "Submit Report",
    priority: 90,
    band: "High",
    category: "COMPLIANCE",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0944",
    what: "Conditional pass action plan — seller must respond within 48h",
    why: "Conditional pass raised on USTN ...0037-2. Seller (Sahara Exports) must submit action plan addressing 2 minor defects (label + carton). Hold flag active until plan approved.",
    deadline: "2026-09-20 06:00 EET",
    action: "Track Action Plan",
    priority: 75,
    band: "High",
    category: "NEEDS_APPROVAL",
    icon: ShieldAlert,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0941",
    what: "Re-inspection request — seller disputes FAIL verdict (USTN ...0035-1)",
    why: "Seller (Delta Agro) disputes FAIL verdict on 3 critical defects. Claims sampling error. Re-inspection approved. Inspector: Mostafa R. Schedule: 2026-09-21 09:00.",
    deadline: "2026-09-21 09:00 EET",
    action: "Schedule Re-inspection",
    priority: 70,
    band: "High",
    category: "COMPLIANCE",
    icon: RotateCcw,
    ustn: "SGTX-EG-26-DA2F-0035-1",
  },
  {
    id: "INB-2026-0939",
    what: "Dispute fast-track — buyer disputes CONDITIONAL (USTN ...0036-1)",
    why: "Buyer (Mediterra Foods) disputes conditional pass. Claims defects are cosmetic, not quality-affecting. Override flag required. Override reason mandatory (≥10 chars).",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Override Request",
    priority: 65,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Gavel,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0936",
    what: "Mobile app offline — inspector Ahmed M. (queue: 4 items)",
    why: "QC Inspector App offline for 15 min. 4 queued actions (2 defect photos, 1 AQL scan, 1 GPS stamp). Auto-retry in progress. Will sync when connection resumes.",
    deadline: "—",
    action: "View Inspector Status",
    priority: 55,
    band: "Medium",
    category: "SHIPMENT_ALERT",
    icon: Smartphone,
  },
  {
    id: "INB-2026-0933",
    what: "AQL sampling plan generated — Level II, single sampling (20,000 kg)",
    why: "AI generated AQL plan: 125 cartons sampled from 248 (code letter M). Acceptance: 5 major, 7 minor. Rejection: 6 major, 8 minor. Inspection points: pre-stuffing, loading, seal.",
    deadline: "—",
    action: "View AQL Plan",
    priority: 50,
    band: "Medium",
    category: "GENERAL",
    icon: Layers,
    ustn: "pre-USTN (Request ...0048-RQ)",
  },
  {
    id: "INB-2026-0930",
    what: "Payment received — Inspection fee $850 (USTN ...0034-1)",
    why: "Inspection fee settled (ISO 20022). $850 received for pre-shipment + loading. Reconciliation 100%. Report auto-submitted on completion.",
    deadline: "—",
    action: "View Payment",
    priority: 18,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0034-1",
  },
  {
    id: "INB-2026-0927",
    what: "Accreditation renewal reminder — ISO 17020:2012 annual review",
    why: "Annual accreditation review due in 45 days. EOAC scheduled audit. Inspection methods + inspector qualifications must be re-verified. 8 inspectors need re-certification.",
    deadline: "2026-11-03 23:59 EET",
    action: "Schedule Audit",
    priority: 40,
    band: "Low",
    category: "GENERAL",
    icon: Award,
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (QC-specific metrics) ─────────────────
export const QC_SUMMARY_CARDS = [
  { label: "Active Jobs", value: "5", trend: "up" as const, delta: "+2 today", icon: ClipboardCheck, color: "text-teal-300" },
  { label: "Pending Reports", value: "3", trend: "up" as const, delta: "+1 today", icon: Clock, color: "text-amber-300" },
  { label: "PASS Rate (30d)", value: "78.5%", trend: "up" as const, delta: "+2.1%", icon: CheckCircle2, color: "text-emerald-300" },
  { label: "Override Rate", value: "2.1%", trend: "down" as const, delta: "-0.5%", icon: AlertTriangle, color: "text-green-300" },
  { label: "Dispute Rate", value: "1.8%", trend: "down" as const, delta: "-0.3%", icon: Gavel, color: "text-green-300" },
  { label: "On-Time Reports", value: "95.6%", trend: "up" as const, delta: "+1.2%", icon: TrendingUp, color: "text-blue-300" },
];

// ── §16.8.6.6 QUICK ACTIONS (QC-specific, max 8) ───────────────────────────
export const QC_QUICK_ACTIONS = [
  { key: "inspection-jobs", label: "Inspection Jobs", icon: ClipboardCheck, specRef: "§16.8.6.6", oneClick: false },
  { key: "report-submission", label: "Report Submission", icon: FileText, specRef: "§16.8.6.6", oneClick: true },
  { key: "conditional-pass", label: "Conditional Pass", icon: ShieldAlert, specRef: "§16.8.6.6", oneClick: false },
  { key: "re-inspection", label: "Re-inspection Request", icon: RotateCcw, specRef: "§16.8.6.6", oneClick: true },
  { key: "dispute-fast-track", label: "Dispute Fast-Track", icon: Gavel, specRef: "§16.8.6.6", oneClick: false },
  { key: "aql-plan", label: "AQL Sampling Plan", icon: Layers, specRef: "§16.8.6.6", oneClick: false },
  { key: "mobile-app", label: "Mobile App Status", icon: Smartphone, specRef: "§16.1.4.2", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: TrendingUp, specRef: "§16.8.6.6", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (QC perspective) ─────────────────────────────
export const QC_HEALTH_SCORE = {
  total: 84,
  components: [
    { name: "Compliance", weight: 20, score: 90, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 85, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 80, icon: ClipboardCheck },
    { name: "Payment", weight: 15, score: 86, icon: DollarSign },
    { name: "Risk", weight: 20, score: 78, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 88, icon: Clock },
  ],
};

// ── ACTIVE INSPECTIONS (QC-filtered columns) ────────────────────────────────
export const QC_ACTIVE_INSPECTIONS = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg",
    inspectionType: "Pre-shipment + Loading",
    aqlPlan: "Level II, single (125/248 cartons)",
    inspector: "Ahmed M.",
    result: "— (scheduled 2026-10-02)",
    defects: "—",
    photoEvidence: "—",
    status: "scheduled",
    health: 0,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    commodity: "Frozen Mangoes — 12,000 kg",
    inspectionType: "Pre-shipment + Loading",
    aqlPlan: "Level II, single (96/186 cartons)",
    inspector: "Ahmed M.",
    result: "CONDITIONAL — 2 minor defects",
    defects: "Label misalignment (3), Carton damage (2)",
    photoEvidence: "4 photos (AR annotated)",
    status: "conditional",
    health: 65,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    commodity: "Sun-Dried Tomatoes — 8,500 kg",
    inspectionType: "Pre-shipment",
    aqlPlan: "Level II, single (80/160 cartons)",
    inspector: "Mostafa R.",
    result: "CONDITIONAL — 1 minor (disputed by buyer)",
    defects: "Cosmetic packaging (1)",
    photoEvidence: "2 photos",
    status: "disputed",
    health: 72,
  },
  {
    ustn: "SGTX-EG-26-DA2F-0035-1",
    seller: "Delta Agro",
    commodity: "Frozen Mangoes — 8,000 kg",
    inspectionType: "Pre-shipment + Loading",
    aqlPlan: "Level II, single (64/128 cartons)",
    inspector: "Mostafa R.",
    result: "FAIL — 3 critical defects (disputed)",
    defects: "Mold growth (3), Off-odor (2), Discoloration (1)",
    photoEvidence: "6 photos (HF ViT flagged)",
    status: "re_inspection",
    health: 45,
  },
  {
    ustn: "SGTX-EG-26-NH3T-0034-1",
    seller: "Sahara Exports",
    commodity: "Dates — 25,000 kg",
    inspectionType: "Pre-shipment + Loading",
    aqlPlan: "Level II, single (125/250 cartons)",
    inspector: "Khaled A.",
    result: "PASS — all compliant",
    defects: "0 (clean)",
    photoEvidence: "3 photos",
    status: "completed",
    health: 95,
  },
];

// ── §16.8.6.6 INSPECTION JOBS (AQL sampling enforcement) ───────────────────
export interface InspectionJob {
  id: string;
  ustn: string;
  seller: string;
  commodity: string;
  inspectionType: string;
  aqlLevel: string;
  sampleSize: string;
  inspectionPoints: string[];
  inspector: string;
  scheduledDate: string;
  fee: string;
  status: string;
  priority: number;
}

export const QC_INSPECTION_JOBS: InspectionJob[] = [
  {
    id: "INS-2026-0042",
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg (248 cartons)",
    inspectionType: "Pre-shipment + Loading supervision",
    aqlLevel: "Level II (normal) — single sampling",
    sampleSize: "125 cartons from 248 (code letter M)",
    inspectionPoints: ["Pre-stuffing (warehouse)", "Container loading (port)", "Seal application (gate)"],
    inspector: "Ahmed M. (GTID SGTX-EG-26-DM3A-0101, rating 4.8)",
    scheduledDate: "2026-10-02 09:00 EET",
    fee: "$850",
    status: "scheduled",
    priority: 80,
  },
  {
    id: "INS-2026-0041",
    ustn: "SGTX-EG-26-DA2F-0035-1",
    seller: "Delta Agro",
    commodity: "Frozen Mangoes — 8,000 kg (128 cartons)",
    inspectionType: "Pre-shipment + Loading (re-inspection)",
    aqlLevel: "Level III (tightened) — single sampling",
    sampleSize: "80 cartons from 128 (code letter L, tightened)",
    inspectionPoints: ["Pre-stuffing", "Container loading", "Seal application", "Temperature verification"],
    inspector: "Mostafa R. (GTID SGTX-EG-26-DM3A-0104, rating 4.7)",
    scheduledDate: "2026-09-21 09:00 EET",
    fee: "$1,020 (re-inspection +50% surcharge)",
    status: "re_inspection",
    priority: 70,
  },
  {
    id: "INS-2026-0037",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    commodity: "Frozen Mangoes — 12,000 kg (186 cartons)",
    inspectionType: "Pre-shipment + Loading",
    aqlLevel: "Level II (normal) — single sampling",
    sampleSize: "96 cartons from 186 (code letter L)",
    inspectionPoints: ["Pre-stuffing", "Container loading", "Seal application"],
    inspector: "Ahmed M. (completed, 2 minor defects found)",
    scheduledDate: "2026-09-18 09:00 EET (completed)",
    fee: "$780",
    status: "completed",
    priority: 90,
  },
];

// ── §16.8.6.6 REPORT SUBMISSION (PASS/FAIL/CONDITIONAL) ───────────────────
export const INSPECTION_REPORTS = [
  {
    id: "RPT-2026-0042",
    ustn: "SGTX-EG-26-NH3T-0042",
    verdict: "PENDING" as const,
    defects: "— (inspection scheduled)",
    photos: 0,
    aiAssist: "A2 HF ViT — will scan on inspection",
    submittedAt: "— (not yet submitted)",
    inspector: "Ahmed M.",
  },
  {
    id: "RPT-2026-0037",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "CONDITIONAL" as const,
    defects: "2 minor (label misalignment, carton damage)",
    photos: 4,
    aiAssist: "A2 HF ViT flagged label + carton anomalies (AR annotated)",
    submittedAt: "1 hour ago",
    inspector: "Ahmed M.",
  },
  {
    id: "RPT-2026-0036",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "CONDITIONAL" as const,
    defects: "1 minor (cosmetic packaging, disputed by buyer)",
    photos: 2,
    aiAssist: "A2 HF ViT — cosmetic only, no quality impact",
    submittedAt: "5 hours ago",
    inspector: "Mostafa R.",
  },
  {
    id: "RPT-2026-0035",
    ustn: "SGTX-EG-26-DA2F-0035-1",
    verdict: "FAIL" as const,
    defects: "3 critical (mold, off-odor, discoloration — disputed)",
    photos: 6,
    aiAssist: "A2 HF ViT flagged mold + discoloration (high confidence 94%)",
    submittedAt: "1 day ago",
    inspector: "Mostafa R.",
  },
  {
    id: "RPT-2026-0034",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "PASS" as const,
    defects: "0 (clean inspection)",
    photos: 3,
    aiAssist: "A2 HF ViT — no anomalies detected",
    submittedAt: "3 days ago",
    inspector: "Khaled A.",
  },
];

// ── §16.8.6.6 CONDITIONAL PASS WORKFLOW ──────────────────────────────────────
export const CONDITIONAL_PASSES = [
  {
    id: "CP-2026-0037",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    defects: "Label misalignment (3 cartons), Carton damage (2 cartons)",
    actionPlan: "Seller will re-label 3 cartons + replace 2 damaged cartons before loading",
    actionPlanStatus: "pending_seller_response",
    holdFlag: "ACTIVE (shipment blocked until plan approved)",
    deadline: "2026-09-20 06:00 EET (48h)",
    inspector: "Ahmed M.",
  },
  {
    id: "CP-2026-0036",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    defects: "Cosmetic packaging (1 carton, buyer disputes as non-quality)",
    actionPlan: "Buyer requests override (claims cosmetic, not quality-affecting)",
    actionPlanStatus: "disputed_by_buyer",
    holdFlag: "ACTIVE (dispute fast-track in progress)",
    deadline: "2026-09-22 12:00 EET",
    inspector: "Mostafa R.",
  },
];

// ── §16.8.6.6 RE-INSPECTION REQUESTS ────────────────────────────────────────
export const RE_INSPECTION_REQUESTS = [
  {
    id: "REI-2026-0035",
    ustn: "SGTX-EG-26-DA2F-0035-1",
    seller: "Delta Agro",
    originalVerdict: "FAIL (3 critical defects: mold, off-odor, discoloration)",
    disputeReason: "Seller claims sampling error (inspector sampled from bottom tier with humidity exposure). Requests re-inspection from middle tier.",
    approved: true,
    newInspector: "Mostafa R. (different from original inspector)",
    scheduledDate: "2026-09-21 09:00 EET",
    aqlLevel: "Level III (tightened)",
    fee: "$1,020 (+50% re-inspection surcharge)",
  },
];

// ── §16.8.6.6 DISPUTE FAST-TRACK ────────────────────────────────────────────
export const DISPUTE_FAST_TRACKS = [
  {
    id: "DFT-2026-0036",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    disputant: "Mediterra Foods (buyer)",
    originalVerdict: "CONDITIONAL (1 minor: cosmetic packaging)",
    disputeReason: "Buyer claims defect is cosmetic, not quality-affecting. Requests override to PASS.",
    overrideRequested: true,
    overrideReasonRequired: "≥10 chars mandatory (A5 forbidden — human decision only)",
    overrideReviewer: "QC Manager (multisig 2-of-3 required for override)",
    status: "pending_review",
    deadline: "2026-09-22 12:00 EET",
  },
];

// ── §16.8.6.6 PERFORMANCE DASHBOARD ──────────────────────────────────────────
export const QC_PERFORMANCE = {
  metrics: [
    { name: "PASS Rate (30d)", value: "78.5%", benchmark: "74.2%", status: "above", icon: CheckCircle2 },
    { name: "Override Rate", value: "2.1%", benchmark: "3.5%", status: "above", icon: AlertTriangle },
    { name: "Dispute Rate", value: "1.8%", benchmark: "2.8%", status: "above", icon: Gavel },
    { name: "On-Time Reports", value: "95.6%", benchmark: "93.1%", status: "above", icon: Clock },
    { name: "Defect Detection Accuracy", value: "96.8%", benchmark: "94.5%", status: "above", icon: Eye },
    { name: "Re-inspection Rate", value: "4.2%", benchmark: "6.1%", status: "above", icon: RotateCcw },
  ],
  trend: "+1.5% (vs last month)",
  percentile: "Top 18% of corridor QC providers (ISO 17020 accredited)",
};

// ── §16.8.6.6 PORTAL FEATURE LIST (QC) ──────────────────────────────────────
export const QC_PORTAL_FEATURES = [
  { name: "Inspection Jobs", desc: "AQL sampling enforcement (Level I/II/III), code letters, sample size calculation", section: "§16.8.6.6" },
  { name: "Mobile App Integration", desc: "Offline-first, AR overlay (AR.js), on-device HF ViT defect detection", section: "§16.1.4.2" },
  { name: "Report Submission", desc: "PASS/FAIL/CONDITIONAL with photo evidence + AI defect annotations", section: "§16.8.6.6" },
  { name: "Conditional Pass", desc: "Action plan required + hold flag; shipment blocked until plan approved", section: "§16.8.6.6" },
  { name: "Re-inspection Request", desc: "Workflow for disputed verdicts; tightened AQL; +50% surcharge", section: "§16.8.6.6" },
  { name: "Dispute Fast-Track", desc: "Override flagging; override reason ≥10 chars mandatory; A5 forbidden", section: "§16.8.6.6" },
  { name: "Performance Dashboard", desc: "Override rate, dispute rate, defect detection accuracy, re-inspection rate", section: "§16.8.6.6" },
  { name: "Company Admin", desc: "Service catalogue (inspection types), methods (AQL levels), inspector management", section: "§4.9" },
];

// ── §16.1.4.2 QC INSPECTOR APP (mobile app specs) ───────────────────────────
export const QC_INSPECTOR_APP = {
  name: "QC Inspector App",
  stack: "React Native + Expo, WatermelonDB, HF ViT (on-device), ZXingC++, Vosk, AR.js",
  features: [
    "Offline sync indicator (persistent banner: 'Offline mode — inspection data saved locally')",
    "On-device defect detection (HF ViT) with mandatory override accountability (reason ≥10 chars)",
    "AQL sampling plan enforcement on device (code letters, sample size)",
    "AR overlay of expected pallet positions (AR.js)",
    "Batch scan mode for high-volume inspections",
    "Photo capture with AR annotations",
    "GPS location stamping",
    "Voice commands (Vosk offline speech-to-text)",
  ],
  inspectors: [
    { name: "Ahmed M.", status: "online", queue: 0, lastSync: "2 min ago", location: "Sahara Cold Storage #3", rating: 4.8, jobs: 18 },
    { name: "Mostafa R.", status: "online", queue: 1, lastSync: "5 min ago", location: "Delta Agro Warehouse", rating: 4.7, jobs: 14 },
    { name: "Khaled A.", status: "online", queue: 0, lastSync: "1 min ago", location: "Cairo (returning)", rating: 4.9, jobs: 22 },
    { name: "Tarek M.", status: "offline", queue: 2, lastSync: "15 min ago", location: "— (offline)", rating: 4.5, jobs: 9 },
  ],
};

// ── RECENT ACTIVITY FEED (QC perspective) ──────────────────────────────────
export const QC_RECENT_ACTIVITY = [
  { time: "1 h ago", actor: "Ahmed M. (Inspector)", action: "Inspection complete — 2 minor defects (CONDITIONAL)", target: "USTN ...0037-2", type: "warning" as const },
  { time: "2 h ago", actor: "HF ViT (A2)", action: "Defect detected — label misalignment (AR annotated)", target: "USTN ...0037-2", type: "warning" as const },
  { time: "3 h ago", actor: "Seller (Delta Agro)", action: "Disputed FAIL verdict — requests re-inspection", target: "USTN ...0035-1", type: "error" as const },
  { time: "5 h ago", actor: "Buyer (Mediterra Foods)", action: "Disputed CONDITIONAL — override to PASS requested", target: "USTN ...0036-1", type: "error" as const },
  { time: "6 h ago", actor: "Governor (G5)", action: "Report accepted — PASS (0 defects)", target: "USTN ...0034-1", type: "success" as const },
  { time: "8 h ago", actor: "You", action: "Scheduled inspection — Ahmed M. for 2026-10-02 09:00", target: "USTN ...0042", type: "info" as const },
  { time: "1 d ago", actor: "Governor (G6)", action: "Inspection fee settled — $850 (ISO 20022)", target: "USTN ...0034-1", type: "success" as const },
];

// ── EXTERNAL INTEGRATIONS (QC-specific) ─────────────────────────────────────
export const QC_INTEGRATIONS = [
  { name: "AR.js (AR Overlay)", status: "operational", latency: "—", icon: Eye },
  { name: "HF ViT (On-device Defect Detection)", status: "operational", latency: "—", icon: Microscope },
  { name: "ZXingC++ (Barcode Scanning)", status: "operational", latency: "—", icon: ScanLine },
  { name: "Vosk (Offline Speech-to-Text)", status: "operational", latency: "—", icon: MessageSquare },
  { name: "WatermelonDB (Offline Queue)", status: "operational", latency: "—", icon: Smartphone },
  { name: "ISO 20022 Bank Gateway", status: "operational", latency: "410ms", icon: DollarSign },
];

// ── RECENT GOVERNOR DECISIONS (QC perspective) ──────────────────────────────
export const QC_RECENT_DECISIONS = [
  {
    gate: "G5",
    type: "Inspection Report (CONDITIONAL)",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "CONDITIONAL" as const,
    reason: "2 minor defects found (label misalignment 3 cartons, carton damage 2). AQL Level II: within acceptance for minor (7 max), but conditional pass raised. Action plan required. Hold flag active. HF ViT evidence attached.",
    timestamp: "1 h ago",
  },
  {
    gate: "G5",
    type: "Inspection Report (FAIL, disputed)",
    ustn: "SGTX-EG-26-DA2F-0035-1",
    verdict: "DENY" as const,
    reason: "3 critical defects (mold growth, off-odor, discoloration). AQL Level II: exceeds acceptance (5 major). FAIL verdict. Seller disputes (sampling error claim). Re-inspection approved with Level III tightened.",
    timestamp: "1 day ago",
  },
  {
    gate: "G6",
    type: "Inspection Fee Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0034-1",
    verdict: "ALLOW" as const,
    reason: "Inspection fee $850 settled via pain.001 (CBE clearing). Reconciliation 100%. Report auto-submitted on completion. Funds in cash position. Closure hash published.",
    timestamp: "1 d ago",
  },
];

// ── §16.1.6 SIDEBAR (QC-specific role tabs) ────────────────────────────────
export const QC_SIDEBAR_ROLE = [
  { label: "Inspection Jobs", icon: ClipboardCheck, desc: "AQL sampling enforcement" },
  { label: "Report Submission", icon: FileText, desc: "PASS/FAIL/CONDITIONAL" },
  { label: "Conditional Pass", icon: ShieldAlert, desc: "Action plan + hold flag" },
  { label: "Re-inspection", icon: RotateCcw, desc: "Disputed verdict workflow" },
  { label: "Mobile App", icon: Smartphone, desc: "Inspector offline-first + AR" },
];
