// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #9: PFI Workflow Data
// Creative: Niche detector matrix + risk appetite slider + bank-vs-PFI comparison +
// LP yield waterfall + distressed cargo lifecycle tracker
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Sparkles, TrendingUp, Scale, BarChart3, DollarSign,
  Banknote, ShieldAlert, CheckCircle2, RotateCcw,
  Clock, AlertTriangle, Eye, Target, Download,
  Zap, PieChart, FileText,
} from "lucide-react";

export interface FormField {
  key: string; label: string; type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle" | "slider";
  options?: string[]; placeholder?: string; aiAssist?: string; defaultValue?: string; required?: boolean;
  min?: number; max?: number; step?: number;
}
export interface WorkflowStep {
  number: number; id: string; name: string; specRef: string; purpose: string; icon: LucideIcon;
  fields: FormField[]; aiSuggestion?: string; governorGate?: string; creativeFeature?: string;
}

export const PFI_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1, id: "niche-detection", name: "Niche Opportunity Detection (AI Scan)",
    specRef: "§16.8.6.9, §22.2.1", purpose: "AI scans for niche opportunities: distressed cargo, high-risk borrowers, bank-declined trades. Visualizes on risk-yield matrix with PFI 'sweet spot' zone highlighted.",
    icon: Sparkles, governorGate: "G1U1 (identity verified)", creativeFeature: "SVG risk-yield matrix with PFI sweet spot zone",
    aiSuggestion: "Niche detector found 2 opportunities: (1) Distressed cargo — Frozen Mangoes, $50K, 12% yield, risk 55, bank-declined (quality dispute). (2) High-risk borrower — Delta Agro, $150K, 11% yield, risk 48, bank-declined (sanctions proximity). Both in PFI sweet spot (risk 40-60, yield 10-14%).",
    fields: [
      { key: "scan-result", label: "AI Niche Scan Result", type: "toggle", options: ["2 niche opportunities found (PFI sweet spot)", "0 niche opportunities (scan again later)"], defaultValue: "2 niche opportunities found (PFI sweet spot)", required: true },
      { key: "niche-1", label: "Niche #1: Distressed Cargo", type: "text", defaultValue: "Frozen Mangoes, $50K, 12% yield, risk 55, bank-declined (quality dispute)" },
      { key: "niche-2", label: "Niche #2: High-Risk Borrower", type: "text", defaultValue: "Delta Agro, $150K, 11% yield, risk 48, bank-declined (sanctions proximity 2-hop)" },
      { key: "select", label: "Select Niche Opportunity", type: "radio", options: ["Niche #1 — Distressed Cargo ($50K, 12%)", "Niche #2 — High-Risk ($150K, 11%)", "Standard auto-RFQ ($380K, 8%)"], defaultValue: "Niche #1 — Distressed Cargo ($50K, 12%)", required: true },
    ],
  },
  {
    number: 2, id: "risk-appetite", name: "Risk-Return Analysis (Interactive Appetite Slider)",
    specRef: "§4.9, §16.8.6.9", purpose: "Adjust your risk appetite (conservative → aggressive) and see which opportunities fall within your acceptance zone in real-time. PFI sweet spot visualized on the matrix.",
    icon: Target, governorGate: "A4 (execution within bounds)", creativeFeature: "Interactive risk appetite slider with live accept/reject zones",
    aiSuggestion: "Your current appetite: Aggressive (avg risk 72). Adjust slider to see acceptance zone change. At Aggressive: both niche opportunities accepted (risk 48-55 within zone). At Moderate: only Niche #1 accepted (risk 55). At Conservative: both rejected (risk <60 required).",
    fields: [
      { key: "appetite", label: "Risk Appetite (slider: Conservative → Aggressive)", type: "slider", min: 0, max: 100, step: 5, defaultValue: "75", required: true, aiAssist: "Live zone calc" },
      { key: "sweet-spot", label: "PFI Sweet Spot (auto)", type: "text", defaultValue: "Risk 40-60, Yield 10-14% (where banks won't go, PFI profit zone)" },
      { key: "acceptance", label: "Opportunities in Acceptance Zone", type: "text", defaultValue: "2/2 niche + 1 standard = 3 accepted (Aggressive mode)" },
      { key: "yield-projection", label: "Portfolio Yield Projection (if all accepted)", type: "text", defaultValue: "8.4% → 9.1% (+0.7%, weighted by 12% niche yield)" },
    ],
  },
  {
    number: 3, id: "bank-comparison", name: "Bank vs PFI Competitive Comparison Matrix",
    specRef: "§16.8.6.9", purpose: "Side-by-side comparison: why PFI wins (faster, flexible, niche expertise) vs why Bank wins (lower rate, regulatory cover). Decision matrix helps borrower choose.",
    icon: Scale, governorGate: "G1U6 (intent — competitive positioning)", creativeFeature: "SVG side-by-side comparison matrix with winner badges",
    aiSuggestion: "PFI wins on: approval speed (2.1h vs 48h), flexibility (custom terms), niche expertise (distressed cargo). Bank wins on: rate (6.5% vs 12%), regulatory cover (Basel III),规模 (larger loans). For distressed cargo: PFI is ONLY option (bank declined). Decision: PFI wins (no competition).",
    fields: [
      { key: "comparison", label: "Comparison Summary", type: "textarea", defaultValue: "PFI: 12% yield, 2.1h approval, distressed cargo expertise, no regulatory overhead. Bank: N/A (declined — quality dispute + collateral depreciation). PFI is sole financier. Borrower has no alternative." },
      { key: "pfi-advantages", label: "PFI Advantages", type: "textarea", defaultValue: "✓ Faster approval (2.1h vs 48h committee). ✓ Flexible terms (custom repayment). ✓ Niche expertise (distressed cargo bridge). ✓ No banking regulations. ✓ Non-custodial (FeeLock instruction)." },
      { key: "decision", label: "Competitive Decision", type: "radio", options: ["PFI wins (sole financier — bank declined)", "PFI wins (flexibility > rate)", "Bank wins (lower rate preferred)"], defaultValue: "PFI wins (sole financier — bank declined)", required: true },
    ],
  },
  {
    number: 4, id: "lp-yield", name: "LP Yield Projection (Waterfall Chart)",
    specRef: "§16.8.6.9", purpose: "Project yield distribution to Limited Partners (LPs). Waterfall: gross yield → expected defaults → operating expenses → net LP yield. Shows LP return on investment.",
    icon: PieChart, governorGate: "A1 (advisory — LP reporting)", creativeFeature: "SVG waterfall chart (gross → defaults → expenses → net LP)",
    aiSuggestion: "LP yield waterfall: Gross yield 12.0% → Expected defaults -1.2% (risk-adjusted) → Operating expenses -0.8% (GNN, monitoring, legal) → Net LP yield 10.0%. LP commitment: $50K. Projected LP return: $5,000 over 3 months (10% on $50K). Above LP hurdle rate (8%).",
    fields: [
      { key: "gross-yield", label: "Gross Yield", type: "text", defaultValue: "12.0% (distressed cargo premium)" },
      { key: "expected-defaults", label: "Expected Defaults (risk-adjusted)", type: "text", defaultValue: "-1.2% (probability-weighted, risk 55 → 2.1% default probability × 57% recovery)" },
      { key: "operating-expenses", label: "Operating Expenses", type: "text", defaultValue: "-0.8% (GNN risk engine, collateral monitoring, legal, LP reporting)" },
      { key: "net-lp-yield", label: "Net LP Yield", type: "text", defaultValue: "10.0% (above LP hurdle rate 8%)" },
      { key: "lp-return", label: "Projected LP Return", type: "text", defaultValue: "$5,000 on $50K over 3 months (10% net yield)" },
    ],
  },
  {
    number: 5, id: "bid-submission", name: "Bid Submission (PFI Rate, Fast Approval)",
    specRef: "§10, §7 (CFR)", purpose: "Submit bid at 12% (PFI premium). No banking committee — instant approval (2.1h vs bank 48h). Full evidence attached. Governor G2 validates. Borrower notified.",
    icon: DollarSign, governorGate: "G2 (financing pre-clearance — CFR)", creativeFeature: "Instant approval badge (no committee)",
    aiSuggestion: "Bid submitted: $50K at 12% for 3 months. No banking committee — instant approval (2.1h). Evidence: niche scan, risk appetite, bank comparison, LP waterfall. G2 validates. Borrower (Sahara Exports) notified. Non-custodial (FeeLock instruction, not a holding).",
    fields: [
      { key: "bid", label: "Bid Details", type: "text", defaultValue: "$50K at 12% for 3 months (distressed cargo bridge finance)" },
      { key: "approval", label: "Approval Method", type: "toggle", options: ["Instant (no committee, 2.1h vs bank 48h)", "Committee (if >$500K)"], defaultValue: "Instant (no committee, 2.1h vs bank 48h)", required: true },
      { key: "submit", label: "Submit Bid (triggers G2 validation)", type: "toggle", options: ["Submit — instant approval + G2", "Draft (save)"], defaultValue: "Submit — instant approval + G2", required: true },
    ],
  },
  {
    number: 6, id: "facility-setup", name: "Facility Setup & Drawdown (Non-Custodial FeeLock)",
    specRef: "§10, §9.27", purpose: "On bid acceptance: set up bridge finance facility. FeeLock instruction created (non-custodial — no funds table, §2 Pillar I). Drawdown authorized. Collateral verified.",
    icon: Banknote, governorGate: "G4 (fee & lock — FeeLock instruction)", creativeFeature: "Non-custodial badge (no funds table)",
    aiSuggestion: "Bid accepted instantly! Bridge finance facility set up: $50K, 12%, 3-month. FeeLock instruction created (NON-CUSTODIAL — no funds held, instruction only, §2 Pillar I). Drawdown authorized. Collateral: frozen mangoes ($44K) + cargo insurance ($50K). ISO 20022 ready.",
    fields: [
      { key: "bid-status", label: "Bid Status", type: "toggle", options: ["Accepted instantly ✓ (no committee)", "Pending"], defaultValue: "Accepted instantly ✓ (no committee)", required: true },
      { key: "facility", label: "Facility Setup", type: "text", defaultValue: "Bridge Finance — $50K, 12%, 3-month, interest-only" },
      { key: "feelock", label: "FeeLock (Non-Custodial)", type: "toggle", options: ["Created ✓ (instruction, NOT a holding — §2 Pillar I, no funds table)", "Pending"], defaultValue: "Created ✓ (instruction, NOT a holding — §2 Pillar I, no funds table)", required: true },
      { key: "drawdown", label: "Drawdown Authorization", type: "toggle", options: ["Authorized ✓ (ISO 20022 ready)", "Pending"], defaultValue: "Authorized ✓ (ISO 20022 ready)" },
    ],
  },
  {
    number: 7, id: "collateral-monitor", name: "Collateral Monitoring (Distressed Cargo Tracker)",
    specRef: "§10, §16.8.6.9", purpose: "Track distressed collateral value in real-time. SVG lifecycle: initial value → dispute → drop → bridge → recovery. Margin call threshold. Auto-alert if value drops below coverage.",
    icon: ShieldAlert, governorGate: "G5 (collateral monitoring)", creativeFeature: "SVG distressed cargo lifecycle tracker with value trajectory",
    aiSuggestion: "Collateral: Frozen Mangoes. Lifecycle: $50K (initial) → $44K (quality dispute, -12%) → $44K (bridge financed, stable) → projected $48K (re-routed to new buyer). Margin threshold: $42K (below = margin call). Current: $44K (above threshold, safe). Monitoring active.",
    fields: [
      { key: "current-value", label: "Current Collateral Value", type: "text", defaultValue: "$44K (was $50K, -12% from quality dispute)" },
      { key: "trajectory", label: "Value Trajectory", type: "text", defaultValue: "$50K → $44K (dispute) → $44K (stable, bridge) → $48K (projected, re-routed)" },
      { key: "threshold", label: "Margin Call Threshold", type: "text", defaultValue: "$42K (auto-margin-call if value drops below)" },
      { key: "monitoring", label: "Monitoring Status", type: "toggle", options: ["Active (above threshold, safe)", "Alert (near threshold)", "Margin call triggered"], defaultValue: "Active (above threshold, safe)", required: true },
    ],
  },
  {
    number: 8, id: "distressed-resolution", name: "Distressed Cargo Resolution (Re-Route / Liquidate / Settle)",
    specRef: "§14 (post-trade: distressed)", purpose: "Resolve distressed cargo: re-route to new buyer (recovery), liquidate at discount (loss), or settle with original buyer (renegotiation). AI recommends best path.",
    icon: RotateCcw, governorGate: "G5 (resolution enforcement)", creativeFeature: "SVG resolution path decision tree (3 branches: re-route/liquidate/settle)",
    aiSuggestion: "AI recommends: RE-ROUTE to new buyer. Reasoning: (1) Re-route: $48K recovery (96% of $50K), 3 days, new buyer found (Delta Foods, $48K). (2) Liquidate: $35K (70% discount), immediate. (3) Settle: $40K (renegotiate -20%), 7 days. RE-ROUTE has highest recovery + reasonable timeline.",
    fields: [
      { key: "ai-recommendation", label: "AI Resolution Recommendation", type: "radio", options: ["RE-ROUTE to new buyer ($48K, 96% recovery, 3 days) — recommended", "LIQUIDATE at discount ($35K, 70%, immediate)", "SETTLE with original buyer ($40K, -20%, 7 days)"], defaultValue: "RE-ROUTE to new buyer ($48K, 96% recovery, 3 days) — recommended", required: true },
      { key: "new-buyer", label: "New Buyer (if re-route)", type: "text", defaultValue: "Delta Foods Italia (GTID SGTX-IT-26-DF3A-0021, trust 85, $48K offer)" },
      { key: "recovery", label: "Projected Recovery", type: "text", defaultValue: "$48K (96% of $50K original, -4% loss = $2K, covered by cargo insurance)" },
      { key: "execute", label: "Execute Resolution", type: "toggle", options: ["Execute RE-ROUTE (new buyer, 3-day timeline)", "Execute LIQUIDATE", "Execute SETTLE"], defaultValue: "Execute RE-ROUTE (new buyer, 3-day timeline)", required: true },
    ],
  },
  {
    number: 9, id: "settlement-lp", name: "Settlement & LP Reporting (CSV Export + Closure)",
    specRef: "§13", purpose: "Interest received ($1.5K, 12% × 3 months on $50K). Principal recovered from re-route ($48K + insurance $2K = $50K). LP CSV report generated. Closure hash published. Distressed cargo resolved.",
    icon: CheckCircle2, governorGate: "G6 (settlement) + G7 (closure)", creativeFeature: "LP CSV report auto-generated + distressed resolution summary",
    aiSuggestion: "Settlement complete: Interest $1.5K (12% × 3mo on $50K) + principal $50K (re-route $48K + insurance $2K) = $51.5K total. LP yield: 10% net ($5K on $50K, above 8% hurdle). CSV report auto-generated for LP portal. Closure hash published. Distressed cargo resolved successfully.",
    fields: [
      { key: "interest", label: "Interest Received", type: "text", defaultValue: "$1.5K (12% × 3 months on $50K)" },
      { key: "principal", label: "Principal Recovered", type: "text", defaultValue: "$50K ($48K re-route + $2K cargo insurance)" },
      { key: "total", label: "Total Received", type: "text", defaultValue: "$51.5K ($1.5K interest + $50K principal)" },
      { key: "lp-yield", label: "Net LP Yield", type: "text", defaultValue: "10.0% ($5K on $50K, above 8% hurdle rate)" },
      { key: "csv", label: "LP CSV Report (auto-generated)", type: "toggle", options: ["Generated ✓ (ready for LP portal download)", "Pending"], defaultValue: "Generated ✓ (ready for LP portal download)", required: true },
      { key: "closure", label: "Closure Hash Published (Loom)", type: "toggle", options: ["Published", "Pending"], defaultValue: "Published", required: true },
    ],
  },
];

export interface DownstreamPhase {
  phase: string; name: string; specRef: string; status: "complete" | "active" | "pending" | "blocked";
  description: string; governorGate: string; icon: LucideIcon;
}

export const PFI_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  { phase: "Phase 1", name: "Niche Detected (AI Scan)", specRef: "§16.8.6.9", status: "complete", description: "2 niche opportunities found: distressed cargo ($50K, 12%) + high-risk ($150K, 11%). Both bank-declined, in PFI sweet spot.", governorGate: "G1U1", icon: Sparkles },
  { phase: "Phase 2", name: "Risk Appetite Set (Aggressive)", specRef: "§4.9", status: "complete", description: "Aggressive mode (75/100). Both niche opportunities accepted. Portfolio yield projection: 8.4% → 9.1%.", governorGate: "A4", icon: Target },
  { phase: "Phase 3", name: "Bank vs PFI Comparison", specRef: "§16.8.6.9", status: "complete", description: "PFI wins (sole financier — bank declined). Faster (2.1h vs 48h), flexible, niche expertise.", governorGate: "G1U6", icon: Scale },
  { phase: "Phase 4", name: "LP Yield Projected (10% net)", specRef: "§16.8.6.9", status: "complete", description: "Waterfall: 12% gross → -1.2% defaults → -0.8% expenses → 10% net LP yield. Above 8% hurdle.", governorGate: "A1", icon: PieChart },
  { phase: "Phase 5", name: "Bid Submitted (Instant Approval)", specRef: "§10", status: "active", description: "$50K at 12% for 3 months. Instant approval (2.1h, no committee). G2 validates. Borrower notified.", governorGate: "G2", icon: DollarSign },
  { phase: "Phase 6", name: "Facility Setup (Non-Custodial)", specRef: "§10, §9.27", status: "pending", description: "Bridge finance setup. FeeLock instruction (non-custodial, §2 Pillar I). Drawdown authorized. Collateral verified.", governorGate: "G4", icon: Banknote },
  { phase: "Phase 7", name: "Collateral Monitoring (Distressed)", specRef: "§10", status: "pending", description: "Track distressed cargo: $50K→$44K→$48K (projected). Margin threshold $42K. Monitoring active.", governorGate: "G5", icon: ShieldAlert },
  { phase: "Phase 8", name: "Distressed Resolution (Re-Route)", specRef: "§14", status: "pending", description: "AI recommends re-route to Delta Foods ($48K, 96% recovery, 3 days). Execute resolution.", governorGate: "G5", icon: RotateCcw },
  { phase: "Phase 9", name: "Settlement + LP CSV Report", specRef: "§13", status: "pending", description: "Interest $1.5K + principal $50K = $51.5K. LP yield 10% net. CSV auto-generated. Closure hash published.", governorGate: "G6 + G7", icon: CheckCircle2 },
];

export const PFI_VALIDATION_GATES = [
  { gate: "G2U1", name: "CFR Declared", description: "Borrower declared $50K financing need (data-sovereign, niche distressed cargo)", status: "pass" },
  { gate: "G2U2", name: "Data-Sovereign", description: "Buyer/seller declarations separate, no cross-contamination", status: "pass" },
  { gate: "G2U3", name: "Pre-Cleared", description: "PFI pre-clearance granted (non-binding, pre-contract lock)", status: "pass" },
  { gate: "G2U4", name: "Financier Matched", description: "Nile Capital Partners matched (niche specialist, bank declined → PFI sole option)", status: "pass" },
  { gate: "G2U5", name: "Capacity Verified", description: "Exposure $3.2M + $50K = $3.25M within $5M limit (65%), no Basel III (PFI exempt)", status: "pass" },
  { gate: "G1U3", name: "Sanctions Clear", description: "GNN scan: borrower Sahara Exports 3 hops (safe). Cargo origin clear.", status: "pass" },
  { gate: "A4", name: "AI Within Bounds", description: "AI suggested 12% (within 4%-12% constitutional bounds, A5 forbidden). Niche sweet spot.", status: "pass" },
  { gate: "A2", name: "Risk Score (GNN + Niche)", description: "Risk 55 (medium-high, distressed cargo). Niche detector: bank-declined, PFI sweet spot.", status: "pass" },
];

export const PFI_SETTLEMENT_SUMMARY = {
  ustn: "SGTX-EG-26-NH3T-0037-2",
  borrower: "Sahara Exports",
  facility: "Distressed Cargo Bridge Finance",
  loanAmount: "$50K",
  interestRate: "12.0% (PFI niche premium, bank would charge 6.5% but declined)",
  term: "3-month (bridge to re-route distressed cargo)",
  riskScore: "55 (medium-high, distressed cargo, bank-declined)",
  collateral: "$44K (frozen mangoes, was $50K) + cargo insurance $50K = $94K coverage",
  nicheType: "Distressed cargo (buyer rejected, quality dispute, bank declined)",
  bankComparison: "Bank: declined (too risky). PFI: sole financier, 12% yield, 2.1h approval.",
  lpYield: "10.0% net (12% gross → -1.2% defaults → -0.8% expenses → 10% net, above 8% hurdle)",
  distressedResolution: "RE-ROUTED to Delta Foods ($48K, 96% recovery, 3 days)",
  interestReceived: "$1.5K (12% × 3 months on $50K)",
  principalRecovered: "$50K ($48K re-route + $2K cargo insurance)",
  totalReceived: "$51.5K",
  lpCsvReport: "Auto-generated (8 loan rows including this niche trade, ready for LP portal)",
  settlementMethod: "ISO 20022 pain.001 (CBE clearing)",
  closureHash: "0xb3e8...f2a1 (published on Loom)",
};

export const PFI_CLOSURE_CONDITIONS = [
  { name: "All milestones confirmed (niche detected, appetite set, bid submitted, facility setup, collateral monitored, distressed resolved)", status: "pending" as const },
  { name: "All documents verified (niche scan, risk appetite, bank comparison, LP waterfall, facility agreement, resolution report)", status: "pending" as const },
  { name: "All payments settled (interest $1.5K + principal $50K via ISO 20022)", status: "pending" as const },
  { name: "Reconciliation ≥95% confidence (100% achieved)", status: "pending" as const },
  { name: "No open disputes (borrower accepted 12%, no default)", status: "pending" as const },
  { name: "No open exceptions (distressed cargo resolved via re-route, no margin calls)", status: "pending" as const },
  { name: "Evidence package sealed (26 categories, PFI subset: niche scan + LP waterfall + distressed resolution)", status: "pending" as const },
];

// SVG data: Niche opportunity matrix (risk vs yield with PFI sweet spot)
export const NICHE_MATRIX_OPPS = [
  { id: "niche-1", label: "Distressed Cargo", risk: 55, yield: 12.0, amount: 50, isNiche: true, bankDeclined: true },
  { id: "niche-2", label: "High-Risk Borrower", risk: 48, yield: 11.0, amount: 150, isNiche: true, bankDeclined: true },
  { id: "standard", label: "Standard RFQ", risk: 74, yield: 8.0, amount: 380, isNiche: false, bankDeclined: false },
  { id: "co-fin", label: "Co-Financing", risk: 80, yield: 7.5, amount: 200, isNiche: false, bankDeclined: false },
];

// SVG data: LP yield waterfall
export const LP_WATERFALL = [
  { label: "Gross Yield", value: 12.0, type: "positive" },
  { label: "Expected Defaults", value: -1.2, type: "negative" },
  { label: "Operating Expenses", value: -0.8, type: "negative" },
  { label: "Net LP Yield", value: 10.0, type: "result" },
];

// SVG data: Bank vs PFI comparison
export const BANK_PFI_COMPARISON = [
  { metric: "Interest Rate", bank: "6.5%", pfi: "12.0%", winner: "bank" },
  { metric: "Approval Speed", bank: "48h (committee)", pfi: "2.1h (instant)", winner: "pfi" },
  { metric: "Flexibility", bank: "Standard terms", pfi: "Custom terms", winner: "pfi" },
  { metric: "Niche Expertise", bank: "None (declined)", pfi: "Distressed cargo specialist", winner: "pfi" },
  { metric: "Regulatory Cover", bank: "Basel III, CBE", pfi: "None (PFI exempt)", winner: "bank" },
  { metric: "Max Loan Size", bank: "$500K+", pfi: "$400K avg", winner: "bank" },
  { metric: "Distressed Cargo", bank: "DECLINED", pfi: "ACCEPTED (sole)", winner: "pfi" },
];

// SVG data: Distressed cargo lifecycle trajectory
export const DISTRESSED_TRAJECTORY = [
  { phase: "Initial", value: 50, label: "$50K (cargo value)" },
  { phase: "Dispute", value: 44, label: "$44K (-12% quality dispute)" },
  { phase: "Bridge", value: 44, label: "$44K (stable, bridge financed)" },
  { phase: "Re-Route", value: 48, label: "$48K (projected, new buyer)" },
];
