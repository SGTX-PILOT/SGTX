"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #9 — PFI Workflow (Creative: Niche matrix + appetite slider + bank-vs-PFI +
// LP waterfall + distressed lifecycle + resolution decision tree)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, DollarSign,
} from "lucide-react";
import {
  PFI_WORKFLOW_STEPS, PFI_DOWNSTREAM_PHASES, PFI_VALIDATION_GATES,
  PFI_SETTLEMENT_SUMMARY, PFI_CLOSURE_CONDITIONS,
  NICHE_MATRIX_OPPS, LP_WATERFALL, BANK_PFI_COMPARISON, DISTRESSED_TRAJECTORY,
} from "@/lib/sgtx/landing/pfi-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function PfiPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = PFI_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / PFI_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => { setCompletedSteps(prev => new Set(prev).add(activeStep)); if (activeStep < PFI_WORKFLOW_STEPS.length - 1) setActiveStep(activeStep + 1); };
  const handlePrev = () => { if (activeStep > 0) setActiveStep(activeStep - 1); };
  const handleSubmit = () => { setWizardState("submitting"); setTimeout(() => setWizardState("validating"), 1200); setTimeout(() => setWizardState("completed"), 3500); };
  const reset = () => { setActiveStep(0); setCompletedSteps(new Set()); setWizardState("filling"); setFormValues({}); };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading kicker="§16.8.6.9 · Portal #9 — PFI Workflow (Creative Niche Financing)" title="PFI Workflow — Interactive Niche Financing Journey"
          subtitle="Niche detection (AI scan) → risk appetite slider → bank-vs-PFI matrix → LP yield waterfall → bid (instant approval) → facility (non-custodial) → distressed tracker → resolution (re-route) → settlement + LP CSV." />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullWorkflow(!showFullWorkflow)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-amber-500/30" style={{ background: 'linear-gradient(135deg, #f59e0b, #f43f5e)' }}>
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: niche matrix, appetite slider, bank comparison, LP waterfall, distressed tracker, resolution tree.</span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">The 9 steps of the PFI niche financing workflow — each with creative visualizations:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {PFI_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(245,158,11,0.1)] bg-[rgba(15,23,42,0.5)]">
                  <div className="flex items-center gap-2 mb-1.5"><div className="w-7 h-7 rounded-md bg-amber-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-amber-300" /></div><span className="text-[9px] font-mono text-slate-500">§{s.number}</span></div>
                  <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name.split("(")[0].trim()}</h4>
                  {s.creativeFeature && <p className="text-[8px] text-amber-400 font-medium mb-1">✦ {s.creativeFeature.split("(")[0].trim()}</p>}
                  <p className="text-[8px] text-slate-500">{s.specRef}</p>
                </motion.div>); })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div key="pfi-wf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-amber-500 to-rose-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{PFI_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>
              <AnimatePresence>
                {wizardState === "filling" && (<motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><PfiWizardStepView activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} currentStep={currentStep} formValues={formValues} setFormValues={setFormValues} handleNext={handleNext} handlePrev={handlePrev} handleSubmit={handleSubmit} /></motion.div>)}
                {wizardState === "submitting" && (<motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center"><Loader2 className="w-10 h-10 text-amber-400 animate-spin mx-auto mb-4" /><h3 className="text-sm font-semibold text-white mb-1">Submitting bid (instant approval)…</h3><p className="text-[10px] text-slate-400">No banking committee — G2 validation + niche evidence package attached…</p></motion.div>)}
                {wizardState === "validating" && (<motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                  <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Governor G2 — PFI Pre-Clearance Validation (Instant)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{PFI_VALIDATION_GATES.map((g, i) => (<motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className="p-2.5 rounded-lg border bg-emerald-500/5 border-emerald-500/15"><div className="flex items-center gap-1.5 mb-1"><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] font-mono font-bold text-emerald-300">{g.gate}</span></div><p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p><p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p></motion.div>))}</div>
                  <p className="text-[10px] text-emerald-300 mt-3 font-semibold">✓ All gates passed — INSTANT approval (2.1h, no committee). Bid dispatched. Borrower notified. Win probability: 100% (sole financier).</p>
                </motion.div>)}
                {wizardState === "completed" && (<motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <BidSubmittedBanner /><PfiDownstreamTracker /><PfiSettlementSummaryCard /><PfiClosureCard />
                  <div className="flex items-center justify-center pt-2"><button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(245,158,11,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Start New Niche Financing</button></div>
                </motion.div>)}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIZARD STEP VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function PfiWizardStepView({ activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues, handleNext, handlePrev, handleSubmit }: any) {
  const isLast = activeStep === PFI_WORKFLOW_STEPS.length - 1;
  return (
    <div className="rounded-2xl border border-[rgba(245,158,11,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(245,158,11,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {PFI_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; const isActive = i === activeStep; const isComplete = completedSteps.has(i); return (
            <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-amber-500/15 text-amber-200 border-amber-400/30" : "text-slate-300 hover:bg-[rgba(245,158,11,0.06)] hover:text-white border-transparent"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-amber-500/20 text-amber-300" : "bg-slate-700/50 text-slate-500"}`}>{isComplete ? <Check className="w-3 h-3" /> : s.number}</div>
              <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate text-[10px]">{s.name.split("(")[0].trim()}</span>
            </button>); })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.1)] flex items-center gap-1.5"><Database className="w-3 h-3 text-emerald-400 animate-pulse" /><span className="text-[9px] text-slate-300">Auto-saved 2s ago</span></div>
        </aside>
        <div className="flex-1 p-4 lg:p-5">
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(245,158,11,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500/20 to-rose-500/20 flex items-center justify-center shrink-0"><currentStep.icon className="w-5 h-5 text-amber-300" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>{currentStep.governorGate && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>}</div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
              {currentStep.creativeFeature && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300 font-medium">✦ {currentStep.creativeFeature}</span>}
            </div>
          </div>
          {currentStep.aiSuggestion && (<div className="p-3 rounded-lg border border-amber-500/20 bg-amber-950/15 mb-4 flex items-start gap-2"><div className="w-6 h-6 rounded-md bg-amber-500/20 flex items-center justify-center shrink-0"><span className="text-[9px] font-bold text-amber-300">AI</span></div><div className="flex-1"><p className="text-[9px] text-amber-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2/A4 Suggestion</p><p className="text-[10px] text-slate-300 leading-relaxed">{currentStep.aiSuggestion}</p></div></div>)}
          {/* Creative SVG per step */}
          {activeStep === 0 && <NicheMatrixViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {activeStep === 1 && <RiskAppetiteSliderViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {activeStep === 2 && <BankPfiComparisonViz />}
          {activeStep === 3 && <LpYieldWaterfallViz />}
          {activeStep === 6 && <DistressedLifecycleViz />}
          {activeStep === 7 && <ResolutionDecisionTreeViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {/* Form fields */}
          <div className="space-y-3">{currentStep.fields.map((field: any) => (<PfiFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />))}</div>
          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(245,158,11,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(245,158,11,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
            <div className="flex items-center gap-1">{PFI_WORKFLOW_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-amber-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Step ${i + 1}`} />)}</div>
            {isLast ? <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:shadow-lg hover:shadow-amber-500/30 transition-all"><Shield className="w-3.5 h-3.5" /> Submit Bid — Instant G2</button> : <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-amber-500 to-rose-500 hover:shadow-lg hover:shadow-amber-500/30 transition-all">Next <ChevronRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Niche Matrix (risk-yield scatter with PFI sweet spot)
// ═══════════════════════════════════════════════════════════════════════════════
function NicheMatrixViz({ formValues, setFormValues, activeStep }: any) {
  const minRisk = 40, maxRisk = 90, minYield = 6, maxYield = 14;
  const riskRange = maxRisk - minRisk, yieldRange = maxYield - minYield;
  const maxAmount = Math.max(...NICHE_MATRIX_OPPS.map(o => o.amount));
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ Niche Opportunity Matrix (Risk vs Yield — PFI Sweet Spot Highlighted)</p>
      <div className="relative w-full h-52 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
          {/* PFI Sweet Spot zone (risk 40-60, yield 10-14%) */}
          <rect x={0} y={60 - ((10 - minYield) / yieldRange) * 50} width={((60 - 40) / riskRange) * 100} height={50 - ((10 - minYield) / yieldRange) * 50 + ((14 - minYield) / yieldRange) * 50 - 50} fill="rgba(245,158,11,0.08)" stroke="rgba(245,158,11,0.3)" strokeWidth="0.2" strokeDasharray="1,0.5" />
          <text x={((50 - 40) / riskRange) * 100 / 2 + 2} y={8} fill="#f59e0b" fontSize="2.5" fontWeight="bold" opacity="0.7">PFI SWEET SPOT</text>
          {/* Bank zone (risk >70, yield <8%) */}
          <rect x={((70 - 40) / riskRange) * 100} y={55} width={100 - ((70 - 40) / riskRange) * 100} height={5} fill="rgba(16,185,129,0.06)" />
          <text x={85} y={59} fill="#10b981" fontSize="2" opacity="0.5">Bank zone</text>
          {/* Grid */}
          {[0, 25, 50, 75, 100].map(pct => <line key={`v${pct}`} x1={pct} y1="0" x2={pct} y2="55" stroke="rgba(148,163,184,0.04)" strokeWidth="0.15" />)}
          {/* Opportunity dots */}
          {NICHE_MATRIX_OPPS.map((o, i) => {
            const x = ((o.risk - minRisk) / riskRange) * 100;
            const y = 55 - ((o.yield - minYield) / yieldRange) * 50;
            const r = 2 + (o.amount / maxAmount) * 2.5;
            const color = o.isNiche ? (o.bankDeclined ? "#f43f5e" : "#f59e0b") : "#10b981";
            return <g key={i}><circle cx={x} cy={y} r={r} fill={color} opacity="0.85" stroke={color} strokeWidth="0.3" /><text x={x} y={y - r - 1.5} textAnchor="middle" fill="#94a3b8" fontSize="1.8">{o.label.length > 10 ? o.label.substring(0, 9) + "…" : o.label}</text>{o.bankDeclined && <text x={x} y={y + r + 3} textAnchor="middle" fill="#f43f5e" fontSize="1.5" opacity="0.7">bank ✗</text>}</g>;
          })}
          <text x="50" y="59" textAnchor="middle" fill="#64748b" fontSize="2.5">Risk Score →</text>
          <text x="2" y="28" textAnchor="middle" fill="#64748b" fontSize="2.5" transform="rotate(-90 2 28)">Yield %</text>
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500" /> Niche (bank-declined)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Niche</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Standard</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded border border-amber-500/30 bg-amber-500/10" /> PFI Sweet Spot</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Risk Appetite Slider (interactive with live zones)
// ═══════════════════════════════════════════════════════════════════════════════
function RiskAppetiteSliderViz({ formValues, setFormValues, activeStep }: any) {
  const appetite = parseInt(formValues[`${activeStep}-appetite`] || "75") || 75;
  const maxAcceptRisk = 40 + (appetite / 100) * 50; // 40 (conservative) → 90 (aggressive)
  const label = appetite >= 75 ? "Aggressive" : appetite >= 50 ? "Moderate" : "Conservative";
  const color = appetite >= 75 ? "#f43f5e" : appetite >= 50 ? "#f59e0b" : "#10b981";
  const accepted = NICHE_MATRIX_OPPS.filter(o => o.risk <= maxAcceptRisk);

  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ Interactive Risk Appetite Slider (Live Accept/Reject Zones)</p>
      {/* Slider */}
      <div className="mb-4">
        <div className="flex justify-between text-[9px] mb-1"><span className="text-slate-400">Risk Appetite</span><span className="font-bold" style={{ color }}>{label} ({appetite})</span></div>
        <input type="range" min={0} max={100} step={5} value={appetite} onChange={(e) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-appetite`]: e.target.value }))} className="w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-700 accent-amber-500" />
        <div className="flex justify-between text-[7px] text-slate-600 mt-1"><span>Conservative (risk ≤50)</span><span>Moderate (50-75)</span><span>Aggressive (75+)</span></div>
      </div>
      {/* Acceptance zone visualization */}
      <div className="relative w-full h-16 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 20" preserveAspectRatio="xMidYMid meet">
          {/* Accept zone (left of threshold) */}
          <rect x="0" y="0" width={((maxAcceptRisk - 40) / 50) * 100} height="20" fill={`${color}15`} />
          {/* Reject zone (right of threshold) */}
          <rect x={((maxAcceptRisk - 40) / 50) * 100} y="0" width={100 - ((maxAcceptRisk - 40) / 50) * 100} height="20" fill="rgba(244,63,94,0.08)" />
          {/* Threshold line */}
          <line x1={((maxAcceptRisk - 40) / 50) * 100} y1="0" x2={((maxAcceptRisk - 40) / 50) * 100} y2="20" stroke={color} strokeWidth="0.4" strokeDasharray="2,1" />
          <text x={((maxAcceptRisk - 40) / 50) * 100} y="3" textAnchor="middle" fill={color} fontSize="2.5" fontWeight="bold">↑ max risk {maxAcceptRisk}</text>
          {/* Opportunity markers */}
          {NICHE_MATRIX_OPPS.map((o, i) => {
            const x = ((o.risk - 40) / 50) * 100;
            const accepted = o.risk <= maxAcceptRisk;
            return <g key={i}><circle cx={x} cy={15} r={1.5 + (o.amount / 150) * 1.5} fill={accepted ? color : "#475569"} opacity={accepted ? 0.8 : 0.4} /><text x={x} y={12} textAnchor="middle" fill={accepted ? "#fff" : "#64748b"} fontSize="1.8">{o.label.split(" ")[0]}</text>{accepted ? <text x={x} y={19} textAnchor="middle" fill="#10b981" fontSize="1.5">✓</text> : <text x={x} y={19} textAnchor="middle" fill="#ef4444" fontSize="1.5">✗</text>}</g>;
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-2 text-[9px]">
        <span className="text-slate-400">Accepted: <span className="font-bold" style={{ color }}>{accepted.length}/{NICHE_MATRIX_OPPS.length}</span></span>
        <span className="text-slate-400">Max risk: <span className="font-mono" style={{ color }}>{maxAcceptRisk}</span></span>
        <span className="text-slate-400">Portfolio yield: <span className="font-mono text-emerald-300">+{accepted.reduce((a, o) => a + o.yield, 0).toFixed(1)}% (sum)</span></span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Bank vs PFI Comparison Matrix
// ═══════════════════════════════════════════════════════════════════════════════
function BankPfiComparisonViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ Bank vs PFI Competitive Comparison Matrix</p>
      <div className="overflow-x-auto rounded-lg border border-[rgba(245,158,11,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="bg-[rgba(2,6,23,0.6)]"><tr className="text-left text-slate-400"><th className="px-2 py-1.5 font-medium">Metric</th><th className="px-2 py-1.5 font-medium text-blue-300">🏦 Bank</th><th className="px-2 py-1.5 font-medium text-amber-300">💼 PFI</th><th className="px-2 py-1.5 font-medium">Winner</th></tr></thead>
          <tbody>{BANK_PFI_COMPARISON.map((c, i) => (<tr key={i} className="border-t border-[rgba(245,158,11,0.06)]"><td className="px-2 py-1.5 text-slate-300">{c.metric}</td><td className="px-2 py-1.5 text-slate-400">{c.bank}</td><td className="px-2 py-1.5 text-white font-medium">{c.pfi}</td><td className="px-2 py-1.5">{c.winner === "pfi" ? <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 font-bold">PFI ✓</span> : <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 font-bold">Bank ✓</span>}</td></tr>))}</tbody>
        </table>
      </div>
      <p className="text-[9px] text-amber-300 mt-2 font-semibold">✓ PFI wins 5/7 metrics. For distressed cargo: PFI is SOLE financier (bank declined). No competition.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: LP Yield Waterfall Chart
// ═══════════════════════════════════════════════════════════════════════════════
function LpYieldWaterfallViz() {
  // Precompute cumulative values using reduce (no mutation inside map)
  const computed = LP_WATERFALL.reduce<Record<string, any>[]>((acc, item, i) => {
    const start = i === 0 ? 0 : acc[i - 1].end;
    const end = item.type === "result" ? item.value : start + item.value;
    acc.push({ ...item, start, end, barStart: Math.min(start, end), barHeight: Math.abs(item.value), maxVal: 14, index: i });
    return acc;
  }, []);
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ LP Yield Waterfall (Gross → Defaults → Expenses → Net LP)</p>
      <div className="relative w-full h-40 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 50" preserveAspectRatio="xMidYMid meet">
          {computed.map((b, i) => {
            const x = 5 + i * 23;
            const barW = 16;
            const yTop = 45 - (b.end / b.maxVal) * 40;
            const yBot = 45 - (b.barStart / b.maxVal) * 40;
            const color = b.type === "positive" ? "#10b981" : b.type === "negative" ? "#ef4444" : "#f59e0b";
            return <g key={i}>
              <rect x={x} y={Math.min(yTop, yBot)} width={barW} height={Math.abs(yBot - yTop)} fill={color} opacity="0.8" rx="0.5" />
              <text x={x + barW / 2} y={Math.min(yTop, yBot) - 1.5} textAnchor="middle" fill={color} fontSize="2.5" fontWeight="bold">{b.value > 0 ? "+" : ""}{b.value.toFixed(1)}%</text>
              <text x={x + barW / 2} y={48} textAnchor="middle" fill="#94a3b8" fontSize="1.8">{b.label.length > 12 ? b.label.substring(0, 10) + "…" : b.label}</text>
              {i > 0 && <line x1={x - 7} y1={45 - (b.barStart / b.maxVal) * 40} x2={x} y2={45 - (b.barStart / b.maxVal) * 40} stroke="#64748b" strokeWidth="0.2" strokeDasharray="0.5,0.5" />}
            </g>;
          })}
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-emerald-500" /> Positive</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-rose-500" /> Negative</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-500" /> Result</span>
        <span className="text-slate-400">LP return: <span className="text-amber-300 font-bold">$5K on $50K (10% net, above 8% hurdle)</span></span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 5: Distressed Cargo Lifecycle Tracker
// ═══════════════════════════════════════════════════════════════════════════════
function DistressedLifecycleViz() {
  const values = DISTRESSED_TRAJECTORY.map(d => d.value);
  const min = 35, max = 55, range = max - min;
  const points = DISTRESSED_TRAJECTORY.map((d, i) => `${(i / (DISTRESSED_TRAJECTORY.length - 1)) * 100},${40 - ((d.value - min) / range) * 30}`).join(" ");
  const threshold = 42;
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ Distressed Cargo Lifecycle Tracker (Value Trajectory + Margin Threshold)</p>
      <div className="relative w-full h-40 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 45" preserveAspectRatio="xMidYMid meet">
          {/* Margin threshold line */}
          <line x1="0" y1={40 - ((threshold - min) / range) * 30} x2="100" y2={40 - ((threshold - min) / range) * 30} stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2,1" opacity="0.5" />
          <text x="98" y={40 - ((threshold - min) / range) * 30 - 1} textAnchor="end" fill="#ef4444" fontSize="2" opacity="0.6">margin call threshold ($42K)</text>
          {/* Trajectory line */}
          <polyline points={points} fill="none" stroke="#f59e0b" strokeWidth="0.6" />
          <polyline points={`${points} 100,40 0,40`} fill="url(#distGrad)" opacity="0.15" />
          <defs><linearGradient id="distGrad" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#f59e0b" stopOpacity="0.4" /><stop offset="100%" stopColor="#f59e0b" stopOpacity="0" /></linearGradient></defs>
          {/* Data points + labels */}
          {DISTRESSED_TRAJECTORY.map((d, i) => {
            const x = (i / (DISTRESSED_TRAJECTORY.length - 1)) * 100;
            const y = 40 - ((d.value - min) / range) * 30;
            const color = d.value >= threshold ? "#f59e0b" : "#ef4444";
            return <g key={i}><circle cx={x} cy={y} r="1.5" fill={color} /><text x={x} y={y - 2.5} textAnchor="middle" fill="#94a3b8" fontSize="1.8">{d.label}</text></g>;
          })}
        </svg>
      </div>
      <div className="flex items-center justify-between mt-2 text-[9px]">
        <span className="text-slate-400">Current: <span className="text-amber-300 font-bold">$44K</span> (above threshold)</span>
        <span className="text-slate-400">Projected: <span className="text-emerald-300 font-bold">$48K</span> (re-route recovery)</span>
        <span className="text-emerald-400">● Safe (no margin call)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 6: Resolution Decision Tree (3 branches)
// ═══════════════════════════════════════════════════════════════════════════════
function ResolutionDecisionTreeViz({ formValues, setFormValues, activeStep }: any) {
  const branches = [
    { id: "re-route", label: "RE-ROUTE", recovery: "$48K", pct: "96%", time: "3 days", recommended: true, color: "#10b981" },
    { id: "liquidate", label: "LIQUIDATE", recovery: "$35K", pct: "70%", time: "immediate", recommended: false, color: "#ef4444" },
    { id: "settle", label: "SETTLE", recovery: "$40K", pct: "80%", time: "7 days", recommended: false, color: "#f59e0b" },
  ];
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/10">
      <p className="text-[10px] text-amber-300 font-semibold mb-3 flex items-center gap-1">✦ Distressed Cargo Resolution Decision Tree (AI Recommended: RE-ROUTE)</p>
      <div className="relative w-full h-32 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
          {/* Root node */}
          <circle cx="15" cy="20" r="4" fill="#f59e0b" opacity="0.8" />
          <text x="15" y="14" textAnchor="middle" fill="#f59e0b" fontSize="2" fontWeight="bold">Distressed</text>
          <text x="15" y="28" textAnchor="middle" fill="#f59e0b" fontSize="2" fontWeight="bold">Cargo $44K</text>
          {/* Branches */}
          {branches.map((b, i) => {
            const x = 40 + i * 22;
            const y = 20;
            return <g key={b.id}>
              <line x1="19" y1="20" x2={x - 4} y2={y} stroke={b.color} strokeWidth={b.recommended ? "0.5" : "0.3"} strokeDasharray={b.recommended ? "none" : "1,0.5"} opacity="0.6" />
              <rect x={x - 7} y={y - 8} width="14" height="16" rx="1.5" fill={`${b.color}20`} stroke={b.color} strokeWidth="0.3" opacity={b.recommended ? 1 : 0.6} />
              <text x={x} y={y - 4} textAnchor="middle" fill={b.color} fontSize="2.5" fontWeight="bold">{b.label}</text>
              <text x={x} y={y} textAnchor="middle" fill="#fff" fontSize="2">{b.recovery}</text>
              <text x={x} y={y + 3} textAnchor="middle" fill="#94a3b8" fontSize="1.8">{b.pct} · {b.time}</text>
              {b.recommended && <text x={x} y={y - 10} textAnchor="middle" fill="#10b981" fontSize="2" fontWeight="bold">★ AI REC</text>}
            </g>;
          })}
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {branches.map(b => <div key={b.id} className={`p-2 rounded-lg border ${b.recommended ? "border-emerald-500/20 bg-emerald-500/5" : "border-slate-700/30 bg-[rgba(255,255,255,0.02)]"}`}><p className="text-[9px] font-bold" style={{ color: b.color }}>{b.label}</p><p className="text-[8px] text-slate-400">{b.recovery} ({b.pct})</p><p className="text-[8px] text-slate-500">{b.time}</p></div>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function PfiFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.type === "slider") return null;
  const label = <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">{field.label}{field.required && <span className="text-red-400">*</span>}{field.aiAssist && <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 font-mono">{field.aiAssist}</span>}</label>;
  if (field.type === "select") return <div>{label}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.15)] rounded-lg focus:outline-none focus:border-amber-400/40">{field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}</select></div>;
  if (field.type === "radio") return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-amber-500/20 border-amber-400/40 text-amber-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(245,158,11,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>;
  if (field.type === "textarea") return <div>{label}<textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.15)] rounded-lg focus:outline-none focus:border-amber-400/40 resize-y" /></div>;
  if (field.type === "toggle") { const current = value || field.options?.[0]; return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(245,158,11,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>; }
  return <div>{label}<input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(245,158,11,0.15)] rounded-lg focus:outline-none focus:border-amber-400/40" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BID SUBMITTED BANNER + DOWNSTREAM + SETTLEMENT + CLOSURE
// ═══════════════════════════════════════════════════════════════════════════════
function BidSubmittedBanner() {
  return <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap"><div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-300" /></div><div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white">Bid Submitted — G2 Pre-Clearance Passed (INSTANT Approval, 2.1h)</h3><p className="text-[10px] text-slate-400 mt-0.5">$50K at 12% for 3 months. Niche: distressed cargo bridge. Non-custodial (FeeLock instruction). No banking committee. Win prob: 100% (sole financier — bank declined).</p></div><div className="text-right"><p className="text-[8px] text-slate-500 uppercase tracking-wider">USTN</p><p className="text-[11px] font-mono text-amber-300">{PFI_SETTLEMENT_SUMMARY.ustn}</p></div></div>;
}
function PfiDownstreamTracker() {
  return <div className="p-4 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Downstream Phase Progression<span className="text-[9px] text-slate-500 font-normal">§16.8.6.9 → §10 → §13 → §14</span></h3><div className="space-y-2">{PFI_DOWNSTREAM_PHASES.map((p, i) => { const Icon = p.icon; const sc = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : p.status === "active" ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-slate-400 bg-slate-500/5 border-slate-500/15"; return <div key={p.phase} className="flex items-stretch gap-2"><div className="flex flex-col items-center"><div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${sc}`}><Icon className="w-4 h-4" /></div>{i < PFI_DOWNSTREAM_PHASES.length - 1 && <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />}</div><div className="flex-1 p-2.5 rounded-lg border border-[rgba(245,158,11,0.08)] bg-[rgba(2,6,23,0.4)] mb-2"><div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span><span className="text-[11px] font-semibold text-white">{p.name}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold capitalize ${sc} border`}>{p.status}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span></div><p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p></div></div>; })}</div></div>;
}
function PfiSettlementSummaryCard() {
  const s = PFI_SETTLEMENT_SUMMARY; const rows = [
    { label: "USTN", value: s.ustn }, { label: "Borrower", value: s.borrower }, { label: "Facility", value: s.facility }, { label: "Loan Amount", value: s.loanAmount }, { label: "Interest Rate", value: s.interestRate }, { label: "Term", value: s.term }, { label: "Risk Score", value: s.riskScore }, { label: "Collateral", value: s.collateral }, { label: "Niche Type", value: s.nicheType }, { label: "Bank Comparison", value: s.bankComparison }, { label: "LP Yield", value: s.lpYield }, { label: "Distressed Resolution", value: s.distressedResolution }, { label: "Interest Received", value: s.interestReceived }, { label: "Principal Recovered", value: s.principalRecovered }, { label: "Total Received", value: s.totalReceived }, { label: "LP CSV Report", value: s.lpCsvReport }, { label: "Settlement Method", value: s.settlementMethod }, { label: "Closure Hash", value: s.closureHash },
  ];
  return <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-300" />Settlement Summary — Niche Distressed Cargo Bridge<span className="text-[9px] text-slate-500 font-normal ml-1">§13 · ISO 20022</span></h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">{rows.map(r => <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(245,158,11,0.06)]"><span className="text-slate-400 shrink-0">{r.label}</span><span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span></div>)}</div></div>;
}
function PfiClosureCard() {
  return <div className="p-4 rounded-xl border border-[rgba(245,158,11,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Closure Conditions (Earned Closure)<span className="text-[9px] text-slate-500 font-normal ml-1">§5.10 · G7 — all 7 must be true</span></h3><div className="space-y-1.5">{PFI_CLOSURE_CONDITIONS.map((c, i) => <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(245,158,11,0.06)]"><div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" /><span className="text-[10px] text-slate-300 flex-1">{c.name}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span></div>)}</div><p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(245,158,11,0.06)]">Closure is earned — never forced. Distressed cargo must be resolved (re-route/liquidate/settle). LP CSV report must be generated. All 7 conditions must evaluate true.</p></div>;
}
