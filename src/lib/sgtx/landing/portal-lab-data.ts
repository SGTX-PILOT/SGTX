// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #5: LAB (Laboratory)
// Dashboard data per §2.5.1 Smart Inbox, §2.5.2 TCC, §16.8.7 / §16.8.6.5 LAB features.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, FlaskConical, ClipboardCheck, Clock, AlertTriangle,
  CheckCircle2, TrendingUp, TrendingDown, FileText, ShieldAlert,
  Landmark, Zap, Search, Bell, ChevronRight,
  Wallet, FileCheck, Gavel, Scale, MessageSquare,
  Users, Beaker, Award, Microscope, TestTube,
  DollarSign, Timer, BadgeCheck, FileSignature,
} from "lucide-react";

// ── Active tenant (the "logged-in" laboratory for the demo) ──────────────────
export const LAB_TENANT = {
  name: "Nile Laboratories",
  gtid: "SGTX-EG-26-NL8B-0044",
  kybTier: 3,
  role: "LAB" as const,
  avatarInitials: "NL",
  trustScore: 93,
  tradeCount: 47,
  activeJobs: 6,
  pendingResults: 4,
  accreditation: "ISO 17025:2017",
  accreditedTests: 142,
  avgTurnaround: "26h",
  onTimeRate: 97.8,
};

// ── §2.5.1 SMART INBOX — LAB-specific items (4-part structure) ─────────────
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

export const LAB_INBOX: InboxItem[] = [
  {
    id: "INB-2026-0947",
    what: "New testing job — 14 EU MRL pesticide panel (Frozen Strawberries, 20,000 kg)",
    why: "Seller (Sahara Exports) requested 14 mandatory EU MRL tests via Mode B (seller lab selection). Sample ready for pickup. Results due in 48h. $1,840 quotation accepted.",
    deadline: "2026-09-20 14:00 EET",
    action: "Accept Testing Job",
    priority: 85,
    band: "High",
    category: "NEW_OFFER",
    icon: FlaskConical,
    ustn: "pre-USTN (Request SGTX-EG-26-SX7K-0008-RQ)",
  },
  {
    id: "INB-2026-0945",
    what: "Result submission deadline — USTN ...0037-2 (2 non-compliant tests)",
    why: "2 of 14 mandatory pesticide tests returned non-compliant (Chlorpyrifos + Malathion exceed EU MRL). Conditional QC hold flagged. Submit results + evidence package within 12h.",
    deadline: "2026-09-19 06:00 EET",
    action: "Submit Results",
    priority: 95,
    band: "High",
    category: "COMPLIANCE",
    icon: AlertTriangle,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0943",
    what: "Certificate auto-trigger — Phytosanitary + Health Certificate ready",
    why: "Test results passed (12/14 compliant). Nafeza auto-trigger fired. Phytosanitary + Health Certificate generated from trade data. QES signature required to release.",
    deadline: "2026-09-19 18:00 EET",
    action: "Sign Certificate (QES)",
    priority: 80,
    band: "High",
    category: "NEEDS_SIGNATURE",
    icon: FileSignature,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0940",
    what: "Sample pickup scheduled — Sahara Cold Storage #3 (2026-09-19 09:00)",
    why: "Sample courier scheduled for pickup at Sahara Cold Storage #3. Chain-of-custody form ready. Sample must arrive at lab within 4h (temperature-controlled transport).",
    deadline: "2026-09-19 09:00 EET",
    action: "Confirm Sample Pickup",
    priority: 70,
    band: "Medium",
    category: "SHIPMENT_ALERT",
    icon: TestTube,
    ustn: "pre-USTN (Request ...0048-RQ)",
  },
  {
    id: "INB-2026-0938",
    what: "MRL validation pending — EU vs domestic standards comparison",
    why: "Destination is Italy (EU). RIA determined EU MRL standards apply (stricter than Egyptian). 14 analytes must comply with EU Regulation 396/2005. Domestic limits not applicable.",
    deadline: "—",
    action: "View MRL Comparison",
    priority: 60,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Scale,
  },
  {
    id: "INB-2026-0935",
    what: "Dispute alert — Seller disputes Chlorpyrifos result (methodology challenge)",
    why: "Seller (Sahara Exports) disputes the non-compliant Chlorpyrifos result (0.08 mg/kg vs EU MRL 0.01 mg/kg). Claims sampling error. Re-test requested. Evidence package available.",
    deadline: "2026-09-22 12:00 EET",
    action: "Review Dispute",
    priority: 65,
    band: "Medium",
    category: "COMPLIANCE",
    icon: Gavel,
    ustn: "SGTX-EG-26-NH3T-0037-2",
  },
  {
    id: "INB-2026-0930",
    what: "Payment received — Testing fee $1,840 (USTN ...0036-1)",
    why: "Testing fee settled (ISO 20022). $1,840 received for 14 MRL tests + microbial + nutritional. Reconciliation 100%. Certificate auto-triggered on result submission.",
    deadline: "—",
    action: "View Payment",
    priority: 20,
    band: "Low",
    category: "GENERAL",
    icon: Wallet,
    ustn: "SGTX-EG-26-NH3T-0036-1",
  },
  {
    id: "INB-2026-0928",
    what: "Accreditation renewal reminder — ISO 17025:2017 annual review",
    why: "Annual accreditation review due in 60 days. EOAC (Egyptian Organization for Accreditation) scheduled audit. 142 accredited tests/analytes must be re-verified.",
    deadline: "2026-11-18 23:59 EET",
    action: "Schedule Audit",
    priority: 35,
    band: "Low",
    category: "GENERAL",
    icon: Award,
  },
  {
    id: "INB-2026-0925",
    what: "Equipment calibration due — GC-MS (Gas Chromatography–Mass Spectrometry)",
    why: "GC-MS instrument calibration due in 7 days. Calibration required for MRL pesticide panel accuracy. EOAC audit will verify calibration logs.",
    deadline: "2026-09-25 18:00 EET",
    action: "Schedule Calibration",
    priority: 45,
    band: "Low",
    category: "GENERAL",
    icon: Microscope,
  },
];

// ── §2.5.2 EXECUTIVE SUMMARY CARDS (LAB-specific metrics) ─────────────────
export const LAB_SUMMARY_CARDS = [
  { label: "Active Jobs", value: "6", trend: "up" as const, delta: "+2 today", icon: FlaskConical, color: "text-violet-300" },
  { label: "Pending Results", value: "4", trend: "up" as const, delta: "+1 today", icon: Clock, color: "text-amber-300" },
  { label: "Certificates Issued (30d)", value: "38", trend: "up" as const, delta: "+6", icon: FileSignature, color: "text-emerald-300" },
  { label: "Avg Turnaround", value: "26h", trend: "down" as const, delta: "-4h faster", icon: Timer, color: "text-green-300" },
  { label: "Compliance Rate", value: "97.8%", trend: "up" as const, delta: "+0.5%", icon: CheckCircle2, color: "text-blue-300" },
  { label: "Dispute Rate", value: "1.8%", trend: "down" as const, delta: "-0.3%", icon: Gavel, color: "text-emerald-300" },
];

// ── §16.8.7 QUICK ACTIONS (LAB-specific, max 8) ───────────────────────────
export const LAB_QUICK_ACTIONS = [
  { key: "testing-jobs", label: "Testing Jobs", icon: FlaskConical, specRef: "§16.8.7", oneClick: false },
  { key: "result-submission", label: "Result Submission", icon: ClipboardCheck, specRef: "§16.8.7", oneClick: true },
  { key: "certificate-gen", label: "Certificate Generation", icon: FileSignature, specRef: "§16.8.7", oneClick: true },
  { key: "mrl-validation", label: "MRL Validation", icon: Scale, specRef: "§16.8.7", oneClick: false },
  { key: "sample-tracking", label: "Sample Tracking", icon: TestTube, specRef: "§16.8.7", oneClick: false },
  { key: "accreditations", label: "Accreditations", icon: Award, specRef: "§4.9", oneClick: false },
  { key: "equipment", label: "Equipment Calibration", icon: Microscope, specRef: "§16.8.7", oneClick: false },
  { key: "performance", label: "Performance Dashboard", icon: TrendingUp, specRef: "§16.8.7", oneClick: false },
];

// ── §2.5.2 TRADE HEALTH SCORE (LAB perspective) ───────────────────────────
export const LAB_HEALTH_SCORE = {
  total: 87,
  components: [
    { name: "Compliance", weight: 20, score: 94, icon: ShieldAlert },
    { name: "Documentation", weight: 20, score: 92, icon: FileCheck },
    { name: "Logistics", weight: 15, score: 78, icon: TestTube },
    { name: "Payment", weight: 15, score: 88, icon: DollarSign },
    { name: "Risk", weight: 20, score: 82, icon: AlertTriangle },
    { name: "Timeline", weight: 10, score: 90, icon: Clock },
  ],
};

// ── ACTIVE TESTING JOBS (LAB-filtered columns) ───────────────────────────────
export const LAB_ACTIVE_JOBS = [
  {
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg",
    testPanel: "14 EU MRL Pesticides + Microbial",
    sample: "SMP-2026-0042-A",
    result: "— (in progress)",
    certificate: "— (pending results)",
    status: "testing",
    health: 0,
    deadline: "2026-09-20 14:00",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    commodity: "Frozen Mangoes — 12,000 kg",
    testPanel: "14 EU MRL Pesticides + Microbial",
    sample: "SMP-2026-0037-B",
    result: "12/14 compliant (2 non-compliant)",
    certificate: "Conditional (QC hold)",
    status: "conditional",
    health: 65,
    deadline: "2026-09-19 06:00",
  },
  {
    ustn: "SGTX-EG-26-NH3T-0036-1",
    seller: "Sahara Exports",
    commodity: "Sun-Dried Tomatoes — 8,500 kg",
    testPanel: "EU MRL + Mycotoxins + Nutritional",
    sample: "SMP-2026-0036-A",
    result: "All compliant ✓",
    certificate: "Issued (PHY-2026-0036)",
    status: "completed",
    health: 95,
    deadline: "2026-09-18 14:00",
  },
  {
    ustn: "SGTX-EG-26-DA2F-0021",
    seller: "Delta Agro",
    commodity: "Frozen Mangoes — 8,000 kg",
    testPanel: "EU MRL + Heavy Metals",
    sample: "SMP-2026-0021-A",
    result: "— (sample in transit)",
    certificate: "—",
    status: "pending",
    health: 0,
    deadline: "2026-09-22 14:00",
  },
  {
    ustn: "SGTX-SA-26-NT4K-0009",
    seller: "Najd Trading",
    commodity: "Frozen Dates — 15,000 kg",
    testPanel: "Microbial + Pesticides (Gulf standards)",
    sample: "SMP-2026-0009-A",
    result: "All compliant ✓",
    certificate: "Issued (PHY-2026-0009)",
    status: "completed",
    health: 92,
    deadline: "2026-09-15 14:00",
  },
];

// ── §16.8.7 TESTING JOBS (sample tracking) ───────────────────────────────────
export interface TestingJob {
  id: string;
  ustn: string;
  seller: string;
  commodity: string;
  testPanel: string;
  analytes: number;
  fee: string;
  sampleStatus: string;
  receivedAt: string;
  deadline: string;
  priority: number;
}

export const LAB_TESTING_JOBS: TestingJob[] = [
  {
    id: "JOB-2026-0042",
    ustn: "SGTX-EG-26-NH3T-0042",
    seller: "Sahara Exports",
    commodity: "Frozen Strawberries — 20,000 kg",
    testPanel: "14 EU MRL Pesticides + Microbial + Nutritional",
    analytes: 20,
    fee: "$1,840",
    sampleStatus: "Sample received (SMP-2026-0042-A, -18°C preserved)",
    receivedAt: "2 hours ago",
    deadline: "2026-09-20 14:00 EET (46h remaining)",
    priority: 85,
  },
  {
    id: "JOB-2026-0041",
    ustn: "SGTX-EG-26-DA2F-0021",
    seller: "Delta Agro",
    commodity: "Frozen Mangoes — 8,000 kg",
    testPanel: "EU MRL + Heavy Metals (Pb, Cd, Hg, As)",
    analytes: 18,
    fee: "$1,560",
    sampleStatus: "Sample in transit (courier, ETA 3h)",
    receivedAt: "— (pending arrival)",
    deadline: "2026-09-22 14:00 EET (72h remaining)",
    priority: 60,
  },
  {
    id: "JOB-2026-0037",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    seller: "Sahara Exports",
    commodity: "Frozen Mangoes — 12,000 kg",
    testPanel: "14 EU MRL Pesticides + Microbial",
    analytes: 17,
    fee: "$1,720",
    sampleStatus: "Testing complete — 2 non-compliant (Chlorpyrifos, Malathion)",
    receivedAt: "1 day ago",
    deadline: "2026-09-19 06:00 EET (11h remaining — URGENT)",
    priority: 95,
  },
];

// ── §16.8.7 RESULT SUBMISSION (MRL validation) ──────────────────────────────
export const TEST_RESULTS = [
  { analyte: "Chlorpyrifos", euMrl: "0.01 mg/kg", detected: "0.08 mg/kg", status: "non_compliant", exceeds: "8× EU MRL" },
  { analyte: "Malathion", euMrl: "0.02 mg/kg", detected: "0.05 mg/kg", status: "non_compliant", exceeds: "2.5× EU MRL" },
  { analyte: "Total Plate Count", euMrl: "100,000 CFU/g", detected: "12,000 CFU/g", status: "compliant", exceeds: "—" },
  { analyte: "E. coli", euMrl: "Absent (25g)", detected: "Absent", status: "compliant", exceeds: "—" },
  { analyte: "Salmonella", euMrl: "Absent (25g)", detected: "Absent", status: "compliant", exceeds: "—" },
  { analyte: "Yeast & Mold", euMrl: "10,000 CFU/g", detected: "3,200 CFU/g", status: "compliant", exceeds: "—" },
  { analyte: "Lambda-cyhalothrin", euMrl: "0.3 mg/kg", detected: "0.12 mg/kg", status: "compliant", exceeds: "—" },
  { analyte: "Cypermethrin", euMrl: "0.5 mg/kg", detected: "0.18 mg/kg", status: "compliant", exceeds: "—" },
];

// ── §16.8.7 CERTIFICATES (auto-trigger via Nafeza) ──────────────────────────
export const CERTIFICATES = [
  { id: "PHY-2026-0036", ustn: "SGTX-EG-26-NH3T-0036-1", type: "Phytosanitary Certificate", seller: "Sahara Exports", buyer: "Mediterra Foods", status: "issued", nafeza: "auto-propagated", trigger: "Result submission (12/14 compliant)", timestamp: "3 hours ago" },
  { id: "HLT-2026-0036", ustn: "SGTX-EG-26-NH3T-0036-1", type: "Health Certificate", seller: "Sahara Exports", buyer: "Mediterra Foods", status: "issued", nafeza: "auto-propagated", trigger: "Microbial panel passed", timestamp: "3 hours ago" },
  { id: "PHY-2026-0009", ustn: "SGTX-SA-26-NT4K-0009", type: "Phytosanitary Certificate", seller: "Najd Trading", buyer: "—", status: "issued", nafeza: "auto-propagated", trigger: "All tests compliant", timestamp: "3 days ago" },
  { id: "PHY-2026-0042", ustn: "SGTX-EG-26-NH3T-0042", type: "Phytosanitary Certificate", seller: "Sahara Exports", buyer: "Nile Harvest", status: "pending", nafeza: "— (pending results)", trigger: "— (awaiting result submission)", timestamp: "— (not yet triggered)" },
  { id: "HLT-2026-0042", ustn: "SGTX-EG-26-NH3T-0042", type: "Health Certificate", seller: "Sahara Exports", buyer: "Nile Harvest", status: "pending", nafeza: "— (pending results)", trigger: "— (awaiting result submission)", timestamp: "— (not yet triggered)" },
];

// ── §16.8.7 PERFORMANCE DASHBOARD ────────────────────────────────────────────
export const LAB_PERFORMANCE = {
  metrics: [
    { name: "Avg Turnaround (30d)", value: "26h", benchmark: "32h", status: "above", icon: Timer },
    { name: "Result Accuracy", value: "98.2%", benchmark: "96.5%", status: "above", icon: CheckCircle2 },
    { name: "Compliance Rate", value: "97.8%", benchmark: "95.1%", status: "above", icon: ShieldAlert },
    { name: "Dispute Rate", value: "1.8%", benchmark: "3.2%", status: "above", icon: Gavel },
    { name: "Certificate On-Time", value: "99.1%", benchmark: "97.3%", status: "above", icon: FileSignature },
    { name: "Equipment Uptime", value: "99.7%", benchmark: "98.5%", status: "above", icon: Microscope },
  ],
  trend: "+1.8% (vs last month)",
  percentile: "Top 8% of corridor laboratories (ISO 17025 accredited)",
};

// ── §16.8.7 ACCREDITATIONS ───────────────────────────────────────────────────
export const ACCREDITATIONS = [
  { name: "ISO 17025:2017", issuer: "EOAC (Egyptian Organization for Accreditation)", scope: "142 tests/analytes (pesticides, microbial, heavy metals, nutritional)", valid: "2026-11-18", status: "active", renewal: "60 days" },
  { name: "GMP (Good Manufacturing Practice)", issuer: "Ministry of Health", scope: "Food safety testing (frozen, perishable)", valid: "2027-03-01", status: "active", renewal: "180 days" },
  { name: "AOAC International", issuer: "AOAC", scope: "Official methods of analysis (pesticide residues)", valid: "2026-12-31", status: "active", renewal: "90 days" },
];

// ── §16.8.7 EQUIPMENT CALIBRATION ───────────────────────────────────────────
export const EQUIPMENT = [
  { name: "GC-MS (Agilent 7890B/5977B)", purpose: "Pesticide residue (MRL panel)", lastCal: "2026-08-25", nextCal: "2026-09-25", status: "calibration_due" },
  { name: "HPLC (Waters Alliance e2695)", purpose: "Mycotoxins, nutritional", lastCal: "2026-08-30", nextCal: "2026-11-30", status: "calibrated" },
  { name: "ICP-MS (Agilent 7900)", purpose: "Heavy metals (Pb, Cd, Hg, As)", lastCal: "2026-09-01", nextCal: "2026-12-01", status: "calibrated" },
  { name: "Microbiology Lab (BioMerieux)", purpose: "Total plate count, E. coli, Salmonella", lastCal: "2026-09-10", nextCal: "2026-10-10", status: "calibrated" },
];

// ── §16.8.6.5 PORTAL FEATURE LIST (LAB) ──────────────────────────────────────
export const LAB_PORTAL_FEATURES = [
  { name: "Testing Jobs", desc: "Sample tracking, test panel, deadline, chain-of-custody", section: "§16.8.7" },
  { name: "Result Submission", desc: "MRL validation (EU/domestic), pass/fail/conditional, evidence package", section: "§16.8.7" },
  { name: "Certificates", desc: "Auto-trigger via Nafeza on result submission; QES signature required", section: "§16.8.7" },
  { name: "MRL Validation", desc: "RIA-driven jurisdiction check (EU vs domestic, strictest applies)", section: "§16.8.7" },
  { name: "Sample Tracking", desc: "Temperature-controlled transport, chain-of-custody, arrival confirmation", section: "§16.8.7" },
  { name: "Performance Dashboard", desc: "Turnaround time, accuracy, compliance rate, dispute rate", section: "§16.8.7" },
  { name: "Accreditations", desc: "ISO 17025 + GMP + AOAC; annual renewal tracking", section: "§4.9" },
  { name: "Equipment Calibration", desc: "GC-MS, HPLC, ICP-MS, microbiology — calibration schedule", section: "§16.8.7" },
];

// ── RECENT ACTIVITY FEED (LAB perspective) ──────────────────────────────────
export const LAB_RECENT_ACTIVITY = [
  { time: "2 min ago", actor: "Seller (Sahara Exports)", action: "Submitted testing job — 14 EU MRL panel", target: "JOB-2026-0042", type: "info" as const },
  { time: "1 h ago", actor: "GC-MS Instrument", action: "Analysis complete — 2 non-compliant (Chlorpyrifos, Malathion)", target: "JOB-2026-0037", type: "warning" as const },
  { time: "3 h ago", actor: "Nafeza (Auto-trigger)", action: "Certificate generated — PHY-2026-0036", target: "USTN ...0036-1", type: "success" as const },
  { time: "5 h ago", actor: "You", action: "Signed certificate (QES) — HLT-2026-0036", target: "USTN ...0036-1", type: "success" as const },
  { time: "6 h ago", actor: "Governor (G6)", action: "Testing fee settled — $1,840 (ISO 20022)", target: "USTN ...0036-1", type: "success" as const },
  { time: "8 h ago", actor: "Seller (Sahara Exports)", action: "Disputed result — Chlorpyrifos methodology challenge", target: "USTN ...0037-2", type: "error" as const },
  { time: "1 d ago", actor: "Sample Courier", action: "Sample delivered — SMP-2026-0036-A (temp-controlled)", target: "JOB-2026-0036", type: "info" as const },
];

// ── EXTERNAL INTEGRATIONS (LAB-specific) ─────────────────────────────────────
export const LAB_INTEGRATIONS = [
  { name: "Nafeza (Certificate Auto-Trigger)", status: "operational", latency: "180ms", icon: Landmark },
  { name: "Egypt Trust (QES Signing)", status: "operational", latency: "150ms", icon: FileSignature },
  { name: "EOAC (Accreditation Registry)", status: "operational", latency: "—", icon: Award },
  { name: "LIMS (Lab Info System)", status: "operational", latency: "—", icon: FlaskConical },
  { name: "GC-MS / HPLC / ICP-MS", status: "operational", latency: "—", icon: Microscope },
  { name: "ISO 20022 Bank Gateway", status: "operational", latency: "410ms", icon: DollarSign },
];

// ── RECENT GOVERNOR DECISIONS (LAB perspective) ──────────────────────────────
export const LAB_RECENT_DECISIONS = [
  {
    gate: "G5",
    type: "Lab Results Submitted (conditional QC hold)",
    ustn: "SGTX-EG-26-NH3T-0037-2",
    verdict: "CONDITIONAL" as const,
    reason: "2 of 14 mandatory pesticide tests non-compliant (Chlorpyrifos 0.08 mg/kg vs EU MRL 0.01; Malathion 0.05 vs 0.02). Conditional QC hold raised. Action plan required before shipment proceeds. Evidence package available.",
    timestamp: "1 h ago",
  },
  {
    gate: "G5",
    type: "Certificate Issued (Nafeza auto-trigger)",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "ALLOW" as const,
    reason: "All tests compliant (12/14 MRL + microbial passed). Nafeza auto-trigger fired. Phytosanitary + Health Certificate generated. QES signed. Auto-propagated to customs. Loom hash appended.",
    timestamp: "3 h ago",
  },
  {
    gate: "G6",
    type: "Testing Fee Settlement (ISO 20022)",
    ustn: "SGTX-EG-26-NH3T-0036-1",
    verdict: "ALLOW" as const,
    reason: "Testing fee $1,840 settled via pain.001 (CBE clearing). Reconciliation 100%. Certificate auto-triggered on result submission. Funds in cash position.",
    timestamp: "6 h ago",
  },
];

// ── §16.1.6 SIDEBAR (LAB-specific role tabs) ────────────────────────────────
export const LAB_SIDEBAR_ROLE = [
  { label: "Testing Jobs", icon: FlaskConical, desc: "Sample tracking + test panels" },
  { label: "Result Submission", icon: ClipboardCheck, desc: "MRL validation + evidence" },
  { label: "Certificates", icon: FileSignature, desc: "Nafeza auto-trigger + QES" },
  { label: "Accreditations", icon: Award, desc: "ISO 17025 + GMP + AOAC" },
  { label: "Equipment", icon: Microscope, desc: "Calibration schedule" },
];
