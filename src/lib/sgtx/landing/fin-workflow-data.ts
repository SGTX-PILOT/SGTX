// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #8: FIN Bank Workflow Data
// Creative implementation: Interactive risk simulator + GNN risk graph +
// portfolio impact + competitive bid ladder + AI bid optimizer
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Inbox, TrendingUp, BarChart3, DollarSign, ShieldAlert,
  Banknote, Clock, AlertTriangle, CheckCircle2, Gavel,
  Wallet, FileCheck, Scale, Eye, Percent,
  Building2, Landmark, Zap, Award,
} from "lucide-react";

// ── 9-STEP FIN BANK WORKFLOW (creative interactive form) ────────────────────
export interface FormField {
  key: string;
  label: string;
  type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle" | "slider";
  options?: string[];
  placeholder?: string;
  aiAssist?: string;
  defaultValue?: string;
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
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
  creativeFeature?: string;
}

export const FIN_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1,
    id: "opportunity-review",
    name: "Opportunity Review & Risk Assessment Simulator",
    specRef: "§16.8.6.8, §10",
    purpose: "Review auto-RFQ financing opportunity. Adjust loan parameters (amount, rate, term) and see real-time risk score recalculation. Evaluate borrower profile, collateral, and disclosure.",
    icon: Inbox,
    governorGate: "G2 (financing pre-clearance)",
    creativeFeature: "Interactive risk simulator with live gauge",
    aiSuggestion: "Sahara Exports: $420K, 6-month, collateral $105K CIF + bank guarantee $315K. Trust 91, 28 trades, 0 defaults. Adjust sliders to see risk score change. Current risk: 72 (low). Recommended rate: 6.5% (competitive vs 6.8–7.5% competitors).",
    fields: [
      { key: "borrower", label: "Borrower", type: "select", options: ["Sahara Exports (trust 91, 28 trades)", "Delta Agro (trust 68, risk alert)", "Nile Harvest Trading (trust 87)"], required: true, defaultValue: "Sahara Exports (trust 91, 28 trades)" },
      { key: "loan-amount", label: "Loan Amount (slider: $100K–$1M)", type: "slider", min: 100, max: 1000, step: 10, defaultValue: "420", required: true, aiAssist: "Live risk calc" },
      { key: "interest-rate", label: "Interest Rate (slider: 4%–12%)", type: "slider", min: 4, max: 12, step: 0.1, defaultValue: "6.5", required: true },
      { key: "term", label: "Term (months)", type: "select", options: ["3 months", "6 months", "9 months", "12 months"], defaultValue: "6 months", required: true },
      { key: "collateral", label: "Collateral", type: "text", defaultValue: "Frozen Strawberries ($105K CIF) + bank guarantee $315K" },
      { key: "exposure-check", label: "Exposure Limit Check", type: "toggle", options: ["Within limit ($8.4M + $420K = $8.82M, 73.5% of $12M)", "Exceeds limit"], defaultValue: "Within limit ($8.4M + $420K = $8.82M, 73.5% of $12M)", required: true },
    ],
  },
  {
    number: 2,
    id: "gnn-risk-graph",
    name: "GNN Risk Graph — Sanctions Proximity Analysis",
    specRef: "§22.2.1 (Add-On 1: GNN Risk Engine)",
    purpose: "Visualize borrower's position in the institutional trade graph. Check sanctions proximity (2-hop), trade relationships, trust connections. GNN scores sanctions risk + trust density.",
    icon: Eye,
    governorGate: "G1U3 (sanctions clear)",
    creativeFeature: "SVG GNN risk graph with sanctions proximity visualization",
    aiSuggestion: "GNN analysis: Sahara Exports is 3 hops from nearest sanctioned entity (safe, threshold is 2). Trade graph: 28 trades with Nile Harvest (buyer), 12 with Delta Logistics (LSP). Trust density: 91 (top 15% of corridor). No adversarial edges detected. Sanctions clear.",
    fields: [
      { key: "gnn-scan", label: "GNN Sanctions Scan Result", type: "toggle", options: ["Clear — 3 hops from nearest sanctioned (safe)", "Flagged — within 2 hops (review required)"], defaultValue: "Clear — 3 hops from nearest sanctioned (safe)", required: true },
      { key: "trust-density", label: "Trust Density Score", type: "text", defaultValue: "91 (top 15% of corridor, 28 verified trade relationships)" },
      { key: "adversarial", label: "Adversarial Edges", type: "toggle", options: ["None detected ✓", "1 edge flagged"], defaultValue: "None detected ✓" },
      { key: "hop-distance", label: "Sanctions Hop Distance", type: "text", defaultValue: "3 hops (safe — threshold is 2)" },
    ],
  },
  {
    number: 3,
    id: "portfolio-impact",
    name: "Portfolio Impact Simulator (What-If Analysis)",
    specRef: "§16.8.6.8, §4.9",
    purpose: "Before bidding, simulate how this loan impacts the overall portfolio. See exposure utilization, yield change, default rate shift, and Basel III capital adequacy impact. All in real-time.",
    icon: BarChart3,
    governorGate: "G1U6 (intent consistent — portfolio impact)",
    creativeFeature: "Before/after portfolio impact bars + Basel III capital ratio",
    aiSuggestion: "Portfolio impact: Exposure $8.4M → $8.82M (73.5% of $12M limit, +3.5%). Yield 6.8% → 6.81% (+0.01%, weighted by new rate 6.5% below avg). Default rate 1.2% → 1.18% (improves, borrower is low-risk). Basel III CAR: 14.2% → 14.1% (-0.1%, still well above 10.5% minimum). APPROVED — no limit breach.",
    fields: [
      { key: "exposure-impact", label: "Exposure Impact", type: "text", defaultValue: "$8.4M → $8.82M (+$420K, 73.5% of $12M limit)" },
      { key: "yield-impact", label: "Yield Impact", type: "text", defaultValue: "6.8% → 6.81% (+0.01%, new loan rate 6.5% below portfolio avg)" },
      { key: "default-impact", label: "Default Rate Impact", type: "text", defaultValue: "1.2% → 1.18% (improves — borrower risk 72 is below portfolio avg 75)" },
      { key: "basel-impact", label: "Basel III CAR Impact", type: "text", defaultValue: "14.2% → 14.1% (-0.1%, well above 10.5% minimum, compliant)" },
      { key: "verdict", label: "Portfolio Impact Verdict", type: "radio", options: ["APPROVED — no limit breach, improves default rate", "CAUTION — near exposure limit", "DENIED — exceeds exposure limit"], defaultValue: "APPROVED — no limit breach, improves default rate", required: true },
    ],
  },
  {
    number: 4,
    id: "competitive-bid",
    name: "Competitive Bid Positioning (Rate Spectrum)",
    specRef: "§16.8.6.8",
    purpose: "Visualize your bid rate position relative to competitors. See the rate spectrum — where your 6.5% sits vs competitors' 6.8–7.5%. Adjust rate to optimize win probability vs yield tradeoff.",
    icon: Percent,
    governorGate: "G1U6 (intent — bid positioning)",
    creativeFeature: "SVG rate spectrum with win probability gauge",
    aiSuggestion: "Your rate 6.5% is at the 15th percentile of the competitor range (6.8–7.5%). Win probability: 82% (aggressive but profitable). If you raise to 6.8%: win prob drops to 55%, yield +$1.4K. If you lower to 6.2%: win prob 95%, yield -$2.1K. Sweet spot: 6.5% (82% win, optimal risk-adjusted yield).",
    fields: [
      { key: "your-rate", label: "Your Bid Rate (slider: 4%–12%)", type: "slider", min: 4, max: 12, step: 0.1, defaultValue: "6.5", required: true },
      { key: "competitor-range", label: "Competitor Range", type: "text", defaultValue: "6.8%–7.5% (3 other banks bidding)" },
      { key: "win-probability", label: "Win Probability (auto-calculated)", type: "text", defaultValue: "82% (aggressive but profitable — 15th percentile of range)" },
      { key: "yield-tradeoff", label: "Yield Tradeoff Analysis", type: "textarea", defaultValue: "At 6.5%: yield $13.65K over 6 months, win prob 82%. At 6.8%: yield $14.28K (+$630), win prob 55%. At 6.2%: yield $13.02K (-$630), win prob 95%. Expected value: 6.5% = $11.2K, 6.8% = $7.9K, 6.2% = $12.4K. Sweet spot: 6.5%." },
    ],
  },
  {
    number: 5,
    id: "ai-bid-optimizer",
    name: "AI Bid Optimizer (Smart Rate Suggestion)",
    specRef: "§3.4 (AI Agent Registry), §22.2.1 (GNN)",
    purpose: "AI synthesizes risk score, portfolio impact, competitive landscape, and desired win probability to suggest the optimal bid rate. Shows full reasoning chain. Human makes final decision (A4 within bounds).",
    icon: Zap,
    governorGate: "A4 (execution within bounds)",
    creativeFeature: "AI reasoning chain + optimal rate recommendation with confidence",
    aiSuggestion: "AI OPTIMAL RATE: 6.5%. Reasoning: (1) Risk score 72 → base rate 7.0% (risk premium 2.0% over 5.0% base). (2) Portfolio impact approved → no adjustment. (3) Competitive: 15th percentile of 6.8–7.5% range → win prob 82%. (4) Yield tradeoff: 6.5% has highest expected value ($11.2K). (5) Borrower trust 91 → loyalty discount -0.5%. Final: 7.0% - 0.5% = 6.5%. Confidence: 89%.",
    fields: [
      { key: "ai-rate", label: "AI Suggested Rate", type: "text", defaultValue: "6.5% (confidence: 89%)" },
      { key: "reasoning", label: "AI Reasoning Chain", type: "textarea", defaultValue: "(1) Risk score 72 → base rate 7.0% (risk premium 2.0% over 5.0% base). (2) Portfolio impact approved → no adjustment. (3) Competitive: 15th percentile → win prob 82%. (4) Yield tradeoff: highest EV $11.2K. (5) Trust 91 → loyalty discount -0.5%. Final: 7.0% - 0.5% = 6.5%." },
      { key: "accept-ai", label: "Accept AI Recommendation?", type: "radio", options: ["Accept 6.5% (AI recommended, confidence 89%)", "Override — lower to 6.2% (aggressive, win prob 95%)", "Override — raise to 6.8% (conservative, yield +$630)"], defaultValue: "Accept 6.5% (AI recommended, confidence 89%)", required: true },
      { key: "human-override", label: "Human Override (A4 within bounds, A5 forbidden)", type: "toggle", options: ["No — accept AI", "Yes — override (reason required ≥10 chars)"], defaultValue: "No — accept AI" },
    ],
  },
  {
    number: 6,
    id: "bid-submission",
    name: "Bid Submission (Governor G2 Pre-Clearance)",
    specRef: "§10, §7 (CFR)",
    purpose: "Submit bid with all analysis attached (risk assessment, GNN scan, portfolio impact, competitive analysis, AI reasoning). Governor G2 validates financing pre-clearance. Borrower notified.",
    icon: DollarSign,
    governorGate: "G2 (financing pre-clearance — CFR)",
    creativeFeature: "Full evidence package attached to bid",
    aiSuggestion: "Bid submitted: $420K at 6.5% for 6 months. Evidence package attached: risk assessment (score 72), GNN sanctions scan (clear, 3 hops), portfolio impact (approved, CAR 14.1%), competitive analysis (15th percentile, win prob 82%), AI reasoning (6.5%, confidence 89%). Governor G2 validates. Borrower (Sahara Exports) notified via Smart Inbox.",
    fields: [
      { key: "bid-amount", label: "Bid Amount", type: "text", defaultValue: "$420K at 6.5% for 6 months" },
      { key: "evidence", label: "Evidence Package Attached", type: "textarea", defaultValue: "Risk assessment (score 72, low), GNN sanctions scan (clear, 3 hops), portfolio impact (approved, CAR 14.1%), competitive analysis (15th percentile, 82% win prob), AI reasoning chain (6.5%, 89% confidence)" },
      { key: "submit", label: "Submit Bid (triggers G2 validation)", type: "toggle", options: ["Submit — run G2 pre-clearance", "Draft (save for later)"], defaultValue: "Submit — run G2 pre-clearance", required: true },
      { key: "notify-borrower", label: "Notify Borrower (Smart Inbox)", type: "toggle", options: ["Yes (priority 75 + NATS)", "No"], defaultValue: "Yes (priority 75 + NATS)" },
    ],
  },
  {
    number: 7,
    id: "facility-setup-drawdown",
    name: "Facility Setup & Drawdown Authorization",
    specRef: "§10",
    purpose: "On bid acceptance: set up Trade Finance Line facility. Authorize drawdown. Collateral verified. ISO 20022 payment instruction ready. FeeLock instruction created.",
    icon: Banknote,
    governorGate: "G4 (fee & lock — FeeLock)",
    creativeFeature: "Facility lifecycle visualization (setup → drawdown → repayment)",
    aiSuggestion: "Bid accepted by Sahara Exports! Facility set up: Trade Finance Line, $420K, 6.5%, 6-month. Drawdown authorized. Collateral verified ($105K CIF + $315K bank guarantee). ISO 20022 pain.001 instruction ready. FeeLock instruction created. USTN minted at lock. Borrower can draw funds.",
    fields: [
      { key: "bid-status", label: "Bid Status", type: "toggle", options: ["Accepted by borrower ✓", "Pending", "Declined"], defaultValue: "Accepted by borrower ✓", required: true },
      { key: "facility", label: "Facility Setup", type: "text", defaultValue: "Trade Finance Line — $420K, 6.5%, 6-month, interest-only" },
      { key: "drawdown", label: "Drawdown Authorization", type: "toggle", options: ["Authorized ✓ (ISO 20022 pain.001 ready)", "Pending"], defaultValue: "Authorized ✓ (ISO 20022 pain.001 ready)", required: true },
      { key: "feelock", label: "FeeLock Instruction", type: "toggle", options: ["Created ✓ (instruction, not a holding — non-custodial)", "Pending"], defaultValue: "Created ✓ (instruction, not a holding — non-custodial)", required: true },
      { key: "ustn", label: "USTN (minted at lock)", type: "text", defaultValue: "SGTX-EG-26-NH3T-0042" },
    ],
  },
  {
    number: 8,
    id: "collateral-monitoring",
    name: "Collateral Monitoring (Live Value Tracker)",
    specRef: "§10, §16.8.6.8",
    purpose: "Real-time collateral value tracking. Sparkline shows collateral value over time. Margin call threshold indicator. Temperature excursion alerts. LTV ratio monitor. Auto-margin-call if LTV exceeds 85%.",
    icon: ShieldAlert,
    governorGate: "G5 (collateral monitoring — margin calls)",
    creativeFeature: "SVG live collateral sparkline with margin call threshold line",
    aiSuggestion: "Collateral: Frozen Strawberries ($105K CIF). Current value: $105K (stable). LTV: 400% (loan $420K / collateral $105K + bank guarantee $315K = $420K covered). Margin threshold: 85% LTV. No margin call. Sparkline: stable over 7 days. If collateral drops >8% → margin call triggered automatically.",
    fields: [
      { key: "collateral-value", label: "Current Collateral Value", type: "text", defaultValue: "$105K CIF (stable, +0% over 7 days)" },
      { key: "ltv", label: "Loan-to-Value Ratio", type: "text", defaultValue: "100% (collateral $105K + bank guarantee $315K = $420K = loan amount, fully covered)" },
      { key: "margin-threshold", label: "Margin Call Threshold", type: "text", defaultValue: "85% LTV (auto-trigger if collateral drops >8%)" },
      { key: "temp-excursion", label: "Temperature Excursion Alerts", type: "toggle", options: ["None (reefer -18°C stable ✓)", "1 excursion (auto-adjusted value)", "Critical (margin call triggered)"], defaultValue: "None (reefer -18°C stable ✓)" },
      { key: "auto-margin-call", label: "Auto Margin Call (if LTV >85%)", type: "toggle", options: ["Not triggered (LTV safe)", "Triggered — borrower notified"], defaultValue: "Not triggered (LTV safe)" },
    ],
  },
  {
    number: 9,
    id: "settlement-closure",
    name: "Settlement & Closure (ISO 20022 + Basel III)",
    specRef: "§13",
    purpose: "Interest payments received monthly via ISO 20022. Principal due at closure. Reconciliation ≥95%. Basel III capital adequacy maintained. Closure hash published. Loan closed, collateral released.",
    icon: CheckCircle2,
    governorGate: "G6 (settlement) + G7 (closure)",
    creativeFeature: "Full loan lifecycle summary with Basel III compliance check",
    aiSuggestion: "Loan settled: 6 monthly interest payments of $2,275 (total $13.65K) + principal $420K at closure. Reconciliation 100%. Basel III CAR maintained at 14.1% (above 10.5% minimum). Collateral released. Closure hash published. Loan closed successfully. Borrower trust score updated: 91 → 93 (on-time repayment).",
    fields: [
      { key: "interest-received", label: "Interest Received (6 months)", type: "text", defaultValue: "$2,275/month × 6 = $13.65K total (ISO 20022 monthly)" },
      { key: "principal", label: "Principal Received (at closure)", type: "text", defaultValue: "$420K (ISO 20022 pain.001 at trade closure)" },
      { key: "reconciliation", label: "Reconciliation Confidence", type: "text", defaultValue: "100% (≥95% threshold — passed)" },
      { key: "basel", label: "Basel III CAR (maintained)", type: "text", defaultValue: "14.1% (above 10.5% minimum, compliant throughout)" },
      { key: "collateral-released", label: "Collateral Released", type: "toggle", options: ["Released ✓ (bank guarantee returned, cargo released)", "Pending"], defaultValue: "Released ✓ (bank guarantee returned, cargo released)", required: true },
      { key: "trust-update", label: "Borrower Trust Score Updated", type: "text", defaultValue: "91 → 93 (+2, on-time repayment bonus)" },
      { key: "closure", label: "Closure Hash Published (Loom)", type: "toggle", options: ["Published", "Pending"], defaultValue: "Published", required: true },
    ],
  },
];

// ── DOWNSTREAM PHASES (post-bid-submission) ───────────────────────────────
export interface DownstreamPhase {
  phase: string;
  name: string;
  specRef: string;
  status: "complete" | "active" | "pending" | "blocked";
  description: string;
  governorGate: string;
  icon: LucideIcon;
}

export const FIN_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  {
    phase: "Phase 1",
    name: "Opportunity Reviewed & Risk Assessed",
    specRef: "§16.8.6.8",
    status: "complete",
    description: "Auto-RFQ reviewed. Risk score 72 (low). Loan $420K, rate 6.5%, 6-month. Collateral verified. Exposure within limit.",
    governorGate: "G2",
    icon: Inbox,
  },
  {
    phase: "Phase 2",
    name: "GNN Risk Graph Analyzed",
    specRef: "§22.2.1",
    status: "complete",
    description: "Sanctions clear (3 hops, safe). Trust density 91 (top 15%). No adversarial edges. 28 verified trade relationships.",
    governorGate: "G1U3",
    icon: Eye,
  },
  {
    phase: "Phase 3",
    name: "Portfolio Impact Simulated",
    specRef: "§16.8.6.8",
    status: "complete",
    description: "Exposure $8.4M→$8.82M (73.5%). Yield 6.8%→6.81%. Default 1.2%→1.18%. Basel III 14.2%→14.1%. APPROVED.",
    governorGate: "G1U6",
    icon: BarChart3,
  },
  {
    phase: "Phase 4",
    name: "Competitive Bid Positioned",
    specRef: "§16.8.6.8",
    status: "complete",
    description: "Rate 6.5% at 15th percentile of 6.8–7.5% range. Win prob 82%. Expected value $11.2K (highest).",
    governorGate: "G1U6",
    icon: Percent,
  },
  {
    phase: "Phase 5",
    name: "AI Bid Optimized (6.5%, 89% confidence)",
    specRef: "§3.4, §22.2.1",
    status: "complete",
    description: "AI reasoning: base 7.0% → loyalty discount -0.5% → 6.5%. Confidence 89%. Accepted by human (no override).",
    governorGate: "A4",
    icon: Zap,
  },
  {
    phase: "Phase 6",
    name: "Bid Submitted (G2 Pre-Clearance)",
    specRef: "§10, §7",
    status: "active",
    description: "Bid submitted with full evidence package. G2 validates CFR pre-clearance. Borrower notified (p75). Awaiting acceptance.",
    governorGate: "G2",
    icon: DollarSign,
  },
  {
    phase: "Phase 7",
    name: "Facility Setup & Drawdown",
    specRef: "§10",
    status: "pending",
    description: "On acceptance: Trade Finance Line setup, drawdown authorized, FeeLock created, USTN minted. ISO 20022 ready.",
    governorGate: "G4",
    icon: Banknote,
  },
  {
    phase: "Phase 8",
    name: "Collateral Monitoring (Live)",
    specRef: "§10, §16.8.6.8",
    status: "pending",
    description: "Real-time collateral tracking. Margin call threshold 85% LTV. Temp excursion alerts. Auto-margin-call if breached.",
    governorGate: "G5",
    icon: ShieldAlert,
  },
  {
    phase: "Phase 9",
    name: "Settlement & Closure (ISO 20022)",
    specRef: "§13",
    status: "pending",
    description: "6 monthly interest $2,275 + principal $420K at closure. Reconciliation 100%. Basel III 14.1%. Collateral released. Trust 91→93.",
    governorGate: "G6 + G7",
    icon: CheckCircle2,
  },
];

// ── G2 VALIDATION GATES (financing pre-clearance) ────────────────────────────
export const FIN_VALIDATION_GATES = [
  { gate: "G2U1", name: "CFR Declared", description: "Borrower declared $420K financing need (data-sovereign)", status: "pass" },
  { gate: "G2U2", name: "Data-Sovereign", description: "Buyer-side and seller-side declarations separate, no cross-contamination", status: "pass" },
  { gate: "G2U3", name: "Pre-Cleared", description: "Financing pre-clearance granted (non-binding, pre-contract lock)", status: "pass" },
  { gate: "G2U4", name: "Financier Matched", description: "Cairo Amman Bank matched to opportunity (auto-RFQ, full disclosure)", status: "pass" },
  { gate: "G2U5", name: "Capacity Verified", description: "Exposure $8.82M within $12M limit (73.5%), Basel III CAR 14.1% (above 10.5%)", status: "pass" },
  { gate: "G1U3", name: "Sanctions Clear", description: "GNN scan: 3 hops from nearest sanctioned entity (safe, threshold 2)", status: "pass" },
  { gate: "A4", name: "AI Within Bounds", description: "AI suggested 6.5% (within 4%–12% constitutional bounds, A5 forbidden)", status: "pass" },
  { gate: "A2", name: "Risk Score (GNN)", description: "Risk score 72 (low) — sanctions + trust density + default prediction", status: "pass" },
];

// ── SETTLEMENT SUMMARY (shown after completion) ──────────────────────────────
export const FIN_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0042",
  borrower: "Sahara Exports",
  borrowerGtid: "SGTX-EG-26-SX7K-0008",
  facility: "Trade Finance Line",
  loanAmount: "$420K",
  interestRate: "6.5% (AI-optimized, 89% confidence)",
  term: "6-month (interest-only, principal at closure)",
  riskScore: "72 (low — GNN + sanctions clear + trust 91)",
  collateral: "$105K CIF (Frozen Strawberries) + $315K bank guarantee = $420K (100% covered)",
  gnnSanctionsProximity: "3 hops (safe — threshold 2)",
  portfolioImpact: "Exposure 73.5%, yield +0.01%, default -0.02%, Basel III 14.1%",
  competitivePosition: "15th percentile of 6.8–7.5% range, win prob 82%",
  interestReceived: "$2,275/month × 6 = $13.65K",
  principalReceived: "$420K (at closure)",
  totalReceived: "$433.65K ($13.65K interest + $420K principal)",
  reconciliation: "100% (≥95% threshold — passed)",
  baselCar: "14.1% (above 10.5% minimum, compliant throughout)",
  collateralReleased: "Released (bank guarantee returned, cargo released)",
  trustScoreUpdate: "91 → 93 (+2, on-time repayment bonus)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0xa1f7...e9c4 (published on Loom)",
};

// ── CLOSURE CONDITIONS (FIN Bank perspective) ─────────────────────────────
export const FIN_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (bid accepted, facility setup, drawdown, repayments, closure)", status: "pending" as const },
  { name: "All documents verified (bid evidence, GNN scan, portfolio impact, AI reasoning, facility agreement)", status: "pending" as const },
  { name: "All payments settled (6× $2,275 interest + $420K principal via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (100% achieved)", status: "pending" as const },
  { name: "No open disputes (borrower accepted rate, no default)", status: "pending" as const },
  { name: "No open exceptions (no margin calls, no collateral issues, Basel III compliant)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, FIN subset: bid + GNN + portfolio + collateral)", status: "pending" as const },
];

// ── SVG DATA: GNN Risk Graph nodes ──────────────────────────────────────────
export const GNN_GRAPH_NODES = [
  { id: "borrower", label: "Sahara Exports", x: 50, y: 50, type: "borrower", trust: 91 },
  { id: "buyer", label: "Nile Harvest (buyer)", x: 20, y: 25, type: "trade_partner", trust: 87 },
  { id: "lsp", label: "Delta Logistics (LSP)", x: 80, y: 25, type: "trade_partner", trust: 76 },
  { id: "lab", label: "Nile Labs", x: 15, y: 75, type: "service_provider", trust: 93 },
  { id: "qc", label: "Cairo QC", x: 85, y: 75, type: "service_provider", trust: 82 },
  { id: "sanctioned", label: "Sanctioned Entity (3 hops)", x: 50, y: 95, type: "sanctioned", trust: 0 },
];

export const GNN_GRAPH_EDGES = [
  { from: "borrower", to: "buyer", type: "trade", weight: 28, sanctions: false },
  { from: "borrower", to: "lsp", type: "trade", weight: 12, sanctions: false },
  { from: "borrower", to: "lab", type: "service", weight: 47, sanctions: false },
  { from: "borrower", to: "qc", type: "service", weight: 18, sanctions: false },
  { from: "lab", to: "sanctioned", type: "indirect", weight: 1, sanctions: true, hopDistance: 3 },
];

// ── SVG DATA: Collateral sparkline (7-day value history) ───────────────────
export const COLLATERAL_SPARKLINE = [
  { day: "Sep 12", value: 105 },
  { day: "Sep 13", value: 105 },
  { day: "Sep 14", value: 104 },
  { day: "Sep 15", value: 105 },
  { day: "Sep 16", value: 106 },
  { day: "Sep 17", value: 105 },
  { day: "Sep 18", value: 105 },
];

// ── SVG DATA: Competitive bid spectrum ──────────────────────────────────────
export const COMPETITOR_RATES = [
  { bank: "You (Cairo Amman)", rate: 6.5, isYou: true },
  { bank: "Competitor A", rate: 6.8, isYou: false },
  { bank: "Competitor B", rate: 7.2, isYou: false },
  { bank: "Competitor C", rate: 7.5, isYou: false },
];

// ── SVG DATA: Portfolio impact before/after ──────────────────────────────────
export const PORTFOLIO_IMPACT = [
  { metric: "Exposure ($M)", before: 8.4, after: 8.82, limit: 12, unit: "M" },
  { metric: "Yield (%)", before: 6.8, after: 6.81, limit: 100, unit: "%" },
  { metric: "Default (%)", before: 1.2, after: 1.18, limit: 100, unit: "%" },
  { metric: "Basel CAR (%)", before: 14.2, after: 14.1, limit: 100, unit: "%" },
];
