"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #8 — FIN Bank Workflow (Creative: Risk Simulator + GNN Graph +
// Portfolio Impact + Bid Spectrum + AI Optimizer + Collateral Tracker)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, DollarSign,
} from "lucide-react";
import {
  FIN_WORKFLOW_STEPS, FIN_DOWNSTREAM_PHASES, FIN_VALIDATION_GATES,
  FIN_SETTLEMENT_SUMMARY, FIN_CLOSURE_CONDITIONS,
  GNN_GRAPH_NODES, GNN_GRAPH_EDGES, COLLATERAL_SPARKLINE,
  COMPETITOR_RATES, PORTFOLIO_IMPACT,
} from "@/lib/sgtx/landing/fin-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function FinPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = FIN_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / FIN_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(activeStep));
    if (activeStep < FIN_WORKFLOW_STEPS.length - 1) setActiveStep(activeStep + 1);
  };
  const handlePrev = () => { if (activeStep > 0) setActiveStep(activeStep - 1); };
  const handleSubmit = () => {
    setWizardState("submitting");
    setTimeout(() => setWizardState("validating"), 1200);
    setTimeout(() => setWizardState("completed"), 3500);
  };
  const reset = () => { setActiveStep(0); setCompletedSteps(new Set()); setWizardState("filling"); setFormValues({}); };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.8 · §22.2.1 · Portal #8 — FIN Bank Workflow (Creative Financial Modeling)"
          title="FIN Bank Workflow — Interactive Financing Journey"
          subtitle="Risk simulator → GNN sanctions graph → portfolio impact → competitive bid spectrum → AI-optimized rate → bid submission → facility setup → collateral tracker → settlement. Creative SVG visualizations."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullWorkflow(!showFullWorkflow)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-emerald-500/30"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)' }}>
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Creative features: Live risk gauge, GNN sanctions graph, portfolio impact bars, bid spectrum, AI optimizer, collateral sparkline.
          </span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">The 9 steps of the FIN Bank financing workflow — each with creative visualizations:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {FIN_WORKFLOW_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }}
                    className="p-3 rounded-lg border border-[rgba(16,185,129,0.1)] bg-[rgba(15,23,42,0.5)]">
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-md bg-emerald-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-emerald-300" /></div>
                      <span className="text-[9px] font-mono text-slate-500">§{s.number}</span>
                    </div>
                    <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name}</h4>
                    {s.creativeFeature && <p className="text-[10px] text-emerald-400 font-medium mb-1">✦ {s.creativeFeature}</p>}
                    <p className="text-[10px] text-slate-500">{s.specRef}</p>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div key="fin-wf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-green-600" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{FIN_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>

              <AnimatePresence>
                {wizardState === "filling" && (
                  <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <FinWizardStepView activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} currentStep={currentStep} formValues={formValues} setFormValues={setFormValues} handleNext={handleNext} handlePrev={handlePrev} handleSubmit={handleSubmit} />
                  </motion.div>
                )}
                {wizardState === "submitting" && (
                  <motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-emerald-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-sm font-semibold text-white mb-1">Submitting bid with evidence package…</h3>
                    <p className="text-[10px] text-slate-400">Running G2 pre-clearance validation + attaching risk + GNN + portfolio + competitive + AI reasoning…</p>
                  </motion.div>
                )}
                {wizardState === "validating" && (
                  <motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                    <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Governor G2 — Financing Pre-Clearance Validation</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {FIN_VALIDATION_GATES.map((g, i) => (
                        <motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }}
                          className="p-2.5 rounded-lg border bg-emerald-500/5 border-emerald-500/15">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[10px] font-mono font-bold text-emerald-300">{g.gate}</span>
                          </div>
                          <p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p>
                          <p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p>
                        </motion.div>
                      ))}
                    </div>
                    <p className="text-[10px] text-emerald-300 mt-3 font-semibold">✓ All gates passed — bid dispatched to borrower. Sahara Exports notified (priority 75). Win probability: 82%.</p>
                  </motion.div>
                )}
                {wizardState === "completed" && (
                  <motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <BidSubmittedBanner />
                    <FinDownstreamTracker />
                    <FinSettlementSummaryCard />
                    <FinClosureCard />
                    <div className="flex items-center justify-center pt-2">
                      <button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(16,185,129,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Start New Financing</button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// WIZARD STEP VIEW — with creative SVG visualizations per step
// ═══════════════════════════════════════════════════════════════════════════════
function FinWizardStepView({ activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues, handleNext, handlePrev, handleSubmit }: any) {
  const isLast = activeStep === FIN_WORKFLOW_STEPS.length - 1;
  return (
    <div className="rounded-2xl border border-[rgba(16,185,129,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(16,185,129,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {FIN_WORKFLOW_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === activeStep;
            const isComplete = completedSteps.has(i);
            return (
              <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30" : "text-slate-300 hover:bg-[rgba(16,185,129,0.06)] hover:text-white border-transparent"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-700/50 text-slate-500"}`}>{isComplete ? <Check className="w-3 h-3" /> : s.number}</div>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate text-[10px]">{s.name.split("—")[0].trim()}</span>
              </button>
            );
          })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(16,185,129,0.1)] flex items-center gap-1.5"><Database className="w-3 h-3 text-emerald-400 animate-pulse" /><span className="text-[9px] text-slate-300">Auto-saved 2s ago</span></div>
        </aside>

        <div className="flex-1 p-4 lg:p-5">
          {/* Step header */}
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(16,185,129,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-green-600/20 flex items-center justify-center shrink-0"><currentStep.icon className="w-5 h-5 text-emerald-300" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>
                {currentStep.governorGate && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>}
              </div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
              {currentStep.creativeFeature && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-medium">✦ {currentStep.creativeFeature}</span>}
            </div>
          </div>

          {/* AI Suggestion */}
          {currentStep.aiSuggestion && (
            <div className="p-3 rounded-lg border border-emerald-500/20 bg-emerald-950/15 mb-4 flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-emerald-500/20 flex items-center justify-center shrink-0"><span className="text-[9px] font-bold text-emerald-300">AI</span></div>
              <div className="flex-1"><p className="text-[9px] text-emerald-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2/A4 Suggestion</p><p className="text-[10px] text-slate-300 leading-relaxed">{currentStep.aiSuggestion}</p></div>
            </div>
          )}

          {/* Creative SVG visualization per step */}
          {activeStep === 0 && <RiskSimulatorViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {activeStep === 1 && <GnnRiskGraphViz />}
          {activeStep === 2 && <PortfolioImpactViz />}
          {activeStep === 3 && <CompetitiveBidSpectrumViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {activeStep === 4 && <AiOptimizerViz />}
          {activeStep === 7 && <CollateralTrackerViz />}

          {/* Form fields */}
          <div className="space-y-3">
            {currentStep.fields.map((field: any) => (
              <FinFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(16,185,129,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(16,185,129,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
            <div className="flex items-center gap-1">{FIN_WORKFLOW_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-emerald-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Step ${i + 1}`} />)}</div>
            {isLast ? (
              <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-lg hover:shadow-emerald-500/30 transition-all"><Shield className="w-3.5 h-3.5" /> Submit Bid — Run G2</button>
            ) : (
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-emerald-500 to-green-600 hover:shadow-lg hover:shadow-emerald-500/30 transition-all">Next <ChevronRight className="w-3.5 h-3.5" /></button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 1: Risk Simulator (live gauge + sliders)
// ═══════════════════════════════════════════════════════════════════════════════
function RiskSimulatorViz({ formValues, setFormValues, activeStep }: any) {
  const amount = parseInt(formValues[`${activeStep}-loan-amount`] || "420") || 420;
  const rate = parseFloat(formValues[`${activeStep}-interest-rate`] || "6.5") || 6.5;
  // Creative: live risk score calculation based on amount + rate
  const riskScore = Math.max(30, Math.min(95, Math.round(72 + (amount - 420) * 0.05 + (rate - 6.5) * -3)));
  const riskColor = riskScore >= 75 ? "#10b981" : riskScore >= 60 ? "#f59e0b" : "#ef4444";
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (riskScore / 100) * circumference;

  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <div className="flex items-center gap-4 flex-wrap">
        {/* Risk gauge */}
        <div className="relative w-24 h-24 shrink-0">
          <svg className="w-24 h-24 -rotate-90" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="36" fill="none" stroke="rgba(16,185,129,0.1)" strokeWidth="5" />
            <circle cx="40" cy="40" r="36" fill="none" stroke={riskColor} strokeWidth="5" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 0.5s ease, stroke 0.3s" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-xl font-bold text-white" style={{ transition: "color 0.3s" }}>{riskScore}</span>
            <span className="text-[10px] text-slate-500">RISK</span>
          </div>
        </div>
        {/* Sliders */}
        <div className="flex-1 min-w-[200px] space-y-3">
          <div>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400">Loan Amount</span>
              <span className="text-emerald-300 font-mono font-bold">${amount}K</span>
            </div>
            <input type="range" min={100} max={1000} step={10} value={amount}
              onChange={(e) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-loan-amount`]: e.target.value }))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-emerald-500" />
            <div className="flex justify-between text-[7px] text-slate-600"><span>$100K</span><span>$1M</span></div>
          </div>
          <div>
            <div className="flex justify-between text-[9px] mb-1">
              <span className="text-slate-400">Interest Rate</span>
              <span className="text-emerald-300 font-mono font-bold">{rate.toFixed(1)}%</span>
            </div>
            <input type="range" min={4} max={12} step={0.1} value={rate}
              onChange={(e) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-interest-rate`]: e.target.value }))}
              className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-700 accent-emerald-500" />
            <div className="flex justify-between text-[7px] text-slate-600"><span>4%</span><span>12%</span></div>
          </div>
        </div>
        {/* Risk interpretation */}
        <div className="shrink-0 text-center min-w-[100px]">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">Risk Level</p>
          <p className={`text-sm font-bold ${riskScore >= 75 ? "text-emerald-300" : riskScore >= 60 ? "text-amber-300" : "text-rose-300"}`}>
            {riskScore >= 80 ? "Very Low" : riskScore >= 70 ? "Low" : riskScore >= 60 ? "Medium" : "High"}
          </p>
          <p className="text-[10px] text-slate-500 mt-1">Exp. yield: ${(amount * rate / 100 / 2).toFixed(1)}K</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 2: GNN Risk Graph (SVG nodes + edges)
// ═══════════════════════════════════════════════════════════════════════════════
function GnnRiskGraphViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <p className="text-[10px] text-emerald-300 font-semibold mb-2 flex items-center gap-1">✦ GNN Institutional Trade Graph (SVG visualization)</p>
      <div className="relative w-full h-48 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
          {/* Edges */}
          {GNN_GRAPH_EDGES.map((e, i) => {
            const fromNode = GNN_GRAPH_NODES.find(n => n.id === e.from);
            const toNode = GNN_GRAPH_NODES.find(n => n.id === e.to);
            if (!fromNode || !toNode) return null;
            return (
              <line key={i} x1={fromNode.x} y1={fromNode.y} x2={toNode.x} y2={toNode.y}
                stroke={e.sanctions ? "#ef4444" : "#10b981"} strokeWidth={e.sanctions ? 0.3 : 0.5}
                strokeDasharray={e.sanctions ? "1,1" : "none"} opacity={e.sanctions ? 0.4 : 0.6} />
            );
          })}
          {/* Nodes */}
          {GNN_GRAPH_NODES.map((n) => {
            const isSanctioned = n.type === "sanctioned";
            const isBorrower = n.type === "borrower";
            const color = isSanctioned ? "#ef4444" : isBorrower ? "#10b981" : "#3b82f6";
            const r = isBorrower ? 4 : isSanctioned ? 3 : 2.5;
            return (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={r} fill={color} opacity={isSanctioned ? 0.5 : 1} />
                <text x={n.x} y={n.y - r - 1.5} textAnchor="middle" fill={isSanctioned ? "#fca5a5" : "#94a3b8"} fontSize="2.5" fontWeight={isBorrower ? "bold" : "normal"}>
                  {n.label.length > 15 ? n.label.substring(0, 13) + "…" : n.label}
                </text>
                {!isSanctioned && <text x={n.x} y={n.y + r + 2.5} textAnchor="middle" fill="#10b981" fontSize="2" opacity="0.7">T{n.trust}</text>}
              </g>
            );
          })}
          {/* Hop distance label */}
          <text x="50" y="92" textAnchor="middle" fill="#fca5a5" fontSize="2.5">← 3 hops (safe, threshold 2) →</text>
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px]">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" /> Borrower</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Trade Partner</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-rose-500 opacity-50" /> Sanctioned (3 hops)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 3: Portfolio Impact (before/after bars)
// ═══════════════════════════════════════════════════════════════════════════════
function PortfolioImpactViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <p className="text-[10px] text-emerald-300 font-semibold mb-3 flex items-center gap-1">✦ Portfolio Impact Simulator (Before → After)</p>
      <div className="space-y-3">
        {PORTFOLIO_IMPACT.map((m) => {
          const maxVal = Math.max(m.before, m.after, m.limit);
          const beforePct = (m.before / maxVal) * 100;
          const afterPct = (m.after / maxVal) * 100;
          const limitPct = (m.limit / maxVal) * 100;
          const improved = m.metric.includes("Default") ? m.after < m.before : m.after <= m.limit;
          return (
            <div key={m.metric}>
              <div className="flex justify-between text-[9px] mb-1">
                <span className="text-slate-300">{m.metric}</span>
                <span className={`font-mono font-bold ${improved ? "text-emerald-300" : "text-amber-300"}`}>
                  {m.before}{m.unit} → {m.after}{m.unit}
                </span>
              </div>
              <div className="relative h-4 rounded bg-slate-800/50 overflow-hidden">
                <div className="absolute inset-y-0 left-0 bg-slate-600/50 rounded" style={{ width: `${beforePct}%` }} />
                <motion.div className="absolute inset-y-0 left-0 rounded" style={{ background: improved ? "#10b981" : "#f59e0b" }} initial={{ width: 0 }} whileInView={{ width: `${afterPct}%` }} viewport={{ once: true }} transition={{ duration: 0.8 }} />
                {m.metric.includes("Exposure") && <div className="absolute inset-y-0 border-l-2 border-rose-500/50" style={{ left: `${limitPct}%` }} />}
              </div>
              {m.metric.includes("Exposure") && <p className="text-[7px] text-rose-400 mt-0.5">| = $12M limit (73.5% utilized)</p>}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-emerald-300 mt-3 font-semibold">✓ APPROVED — no limit breach, default rate improves, Basel III compliant</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 4: Competitive Bid Spectrum (rate positioning)
// ═══════════════════════════════════════════════════════════════════════════════
function CompetitiveBidSpectrumViz({ formValues, setFormValues, activeStep }: any) {
  const yourRate = parseFloat(formValues[`${activeStep}-your-rate`] || formValues[`${activeStep}-interest-rate`] || "6.5") || 6.5;
  const minRate = 5.5;
  const maxRate = 8.5;
  const range = maxRate - minRate;
  const winProb = Math.max(5, Math.min(99, Math.round(95 - ((yourRate - 5.5) / range) * 80)));

  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <p className="text-[10px] text-emerald-300 font-semibold mb-3 flex items-center gap-1">✦ Competitive Bid Spectrum (Rate Positioning)</p>
      {/* Rate spectrum bar */}
      <div className="relative h-10 bg-slate-800/50 rounded-lg overflow-hidden mb-2">
        {/* Your position */}
        <div className="absolute inset-y-0 flex items-center" style={{ left: `${((yourRate - minRate) / range) * 100}%` }}>
          <div className="w-0.5 h-full bg-emerald-400" />
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 whitespace-nowrap">
            <span className="text-[9px] font-bold text-emerald-300 bg-emerald-950 px-1.5 py-0.5 rounded">YOU: {yourRate.toFixed(1)}%</span>
          </div>
        </div>
        {/* Competitor positions */}
        {COMPETITOR_RATES.filter(c => !c.isYou).map((c, i) => (
          <div key={i} className="absolute inset-y-0 flex items-center" style={{ left: `${((c.rate - minRate) / range) * 100}%` }}>
            <div className="w-0.5 h-3/5 bg-slate-500" />
            <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 whitespace-nowrap">
              <span className="text-[7px] text-slate-400">{c.rate}%</span>
            </div>
          </div>
        ))}
        {/* Scale */}
        <div className="absolute inset-x-0 bottom-0 flex justify-between px-1 text-[7px] text-slate-600">
          <span>{minRate}%</span><span>{((minRate + maxRate) / 2).toFixed(1)}%</span><span>{maxRate}%</span>
        </div>
      </div>
      {/* Win probability gauge */}
      <div className="flex items-center gap-3 mt-4">
        <div className="flex-1 h-3 rounded-full bg-slate-800 overflow-hidden">
          <motion.div className="h-full rounded-full" style={{ background: winProb >= 70 ? "#10b981" : winProb >= 40 ? "#f59e0b" : "#ef4444" }} initial={{ width: 0 }} animate={{ width: `${winProb}%` }} transition={{ duration: 0.5 }} />
        </div>
        <div className="text-center shrink-0 min-w-[80px]">
          <span className="text-sm font-bold" style={{ color: winProb >= 70 ? "#10b981" : winProb >= 40 ? "#f59e0b" : "#ef4444" }}>{winProb}%</span>
          <p className="text-[10px] text-slate-500">win probability</p>
        </div>
      </div>
      <p className="text-[9px] text-slate-400 mt-2">Adjust rate slider to see win probability change. Lower rate = higher win prob but lower yield.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 5: AI Optimizer (reasoning chain)
// ═══════════════════════════════════════════════════════════════════════════════
function AiOptimizerViz() {
  const steps = [
    { label: "Risk Score 72", detail: "Base rate 7.0% (risk premium 2.0% over 5.0% base)", color: "#10b981" },
    { label: "Portfolio Approved", detail: "No adjustment (exposure 73.5%, CAR 14.1%)", color: "#3b82f6" },
    { label: "Competitive 15th %ile", detail: "Win prob 82% at 6.5%", color: "#8b5cf6" },
    { label: "Yield Optimization", detail: "6.5% has highest EV ($11.2K)", color: "#f59e0b" },
    { label: "Trust Loyalty -0.5%", detail: "Borrower trust 91 → discount applied", color: "#06b6d4" },
    { label: "Final: 6.5%", detail: "Confidence 89% (A4 within bounds)", color: "#10b981" },
  ];
  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <p className="text-[10px] text-emerald-300 font-semibold mb-3 flex items-center gap-1">✦ AI Bid Optimizer Reasoning Chain</p>
      <div className="space-y-1.5">
        {steps.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
            className="flex items-start gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(16,185,129,0.06)]">
            <div className="w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0" style={{ background: `${s.color}30`, color: s.color }}>{i + 1}</div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold text-white">{s.label}</p>
              <p className="text-[9px] text-slate-400">{s.detail}</p>
            </div>
            {i < steps.length - 1 && <ChevronRight className="w-3 h-3 text-slate-600 shrink-0 mt-1" />}
          </motion.div>
        ))}
      </div>
      <div className="mt-3 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-center">
        <p className="text-[10px] text-emerald-300 font-bold">AI OPTIMAL RATE: 6.5% <span className="text-[10px] font-normal text-slate-400">(confidence: 89%)</span></p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CREATIVE VISUALIZATION 6: Collateral Tracker (live sparkline + threshold)
// ═══════════════════════════════════════════════════════════════════════════════
function CollateralTrackerViz() {
  const values = COLLATERAL_SPARKLINE.map(d => d.value);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const range = max - min || 1;
  const points = COLLATERAL_SPARKLINE.map((d, i) => `${(i / (COLLATERAL_SPARKLINE.length - 1)) * 100},${30 - ((d.value - min) / range) * 22}`).join(" ");
  const marginThreshold = 96.6; // 8% drop from 105

  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/10">
      <p className="text-[10px] text-emerald-300 font-semibold mb-2 flex items-center gap-1">✦ Collateral Value Tracker (7-day sparkline + margin threshold)</p>
      <div className="relative h-16 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 30" preserveAspectRatio="none">
          {/* Margin threshold line */}
          <line x1="0" y1={30 - ((marginThreshold - min) / range) * 22} x2="100" y2={30 - ((marginThreshold - min) / range) * 22} stroke="#ef4444" strokeWidth="0.3" strokeDasharray="2,1" opacity="0.6" />
          {/* Sparkline */}
          <polyline points={points} fill="none" stroke="#10b981" strokeWidth="0.6" />
          <polyline points={`${points} 100,30 0,30`} fill="url(#collGrad)" opacity="0.2" />
          <defs>
            <linearGradient id="collGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>
        {/* Threshold label */}
        <span className="absolute right-1 text-[7px] text-rose-400">margin call threshold (-8%)</span>
      </div>
      <div className="flex items-center justify-between mt-2 text-[9px]">
        <span className="text-slate-400">Current: <span className="text-emerald-300 font-bold">$105K</span> (stable, +0%)</span>
        <span className="text-slate-400">LTV: <span className="text-emerald-300 font-bold">100%</span> (fully covered)</span>
        <span className="text-emerald-400">● No margin call</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function FinFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.type === "slider") return null; // Sliders are rendered in creative visualizations
  const label = (
    <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">
      {field.label}{field.required && <span className="text-red-400">*</span>}
      {field.aiAssist && <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono">{field.aiAssist}</span>}
    </label>
  );
  if (field.type === "select") return <div>{label}<select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(16,185,129,0.15)] rounded-lg focus:outline-none focus:border-emerald-400/40">{field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}</select></div>;
  if (field.type === "radio") return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(16,185,129,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>;
  if (field.type === "textarea") return <div>{label}<textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(16,185,129,0.15)] rounded-lg focus:outline-none focus:border-emerald-400/40 resize-y" /></div>;
  if (field.type === "toggle") { const current = value || field.options?.[0]; return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(16,185,129,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>; }
  return <div>{label}<input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(16,185,129,0.15)] rounded-lg focus:outline-none focus:border-emerald-400/40" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BID SUBMITTED BANNER
// ═══════════════════════════════════════════════════════════════════════════════
function BidSubmittedBanner() {
  return (
    <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap">
      <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><Check className="w-5 h-5 text-emerald-300" /></div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white">Bid Submitted — G2 Pre-Clearance Passed</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">$420K at 6.5% for 6 months. Full evidence package attached (risk + GNN + portfolio + competitive + AI). Borrower notified (p75). Win probability: 82%.</p>
      </div>
      <div className="text-right"><p className="text-[10px] text-slate-500 uppercase tracking-wider">USTN</p><p className="text-[11px] font-mono text-emerald-300">{FIN_SETTLEMENT_SUMMARY.ustn}</p></div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOWNSTREAM TRACKER
// ═══════════════════════════════════════════════════════════════════════════════
function FinDownstreamTracker() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(16,185,129,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Downstream Phase Progression<span className="text-[9px] text-slate-500 font-normal">§16.8.6.8 → §10 → §13</span></h3>
      <div className="space-y-2">
        {FIN_DOWNSTREAM_PHASES.map((p, i) => {
          const Icon = p.icon;
          const statusColor = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : p.status === "active" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/30" : "text-slate-400 bg-slate-500/5 border-slate-500/15";
          return (
            <div key={p.phase} className="flex items-stretch gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusColor}`}><Icon className="w-4 h-4" /></div>
                {i < FIN_DOWNSTREAM_PHASES.length - 1 && <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />}
              </div>
              <div className="flex-1 p-2.5 rounded-lg border border-[rgba(16,185,129,0.08)] bg-[rgba(2,6,23,0.4)] mb-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span>
                  <span className="text-[11px] font-semibold text-white">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold capitalize ${statusColor} border`}>{p.status}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTLEMENT SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════
function FinSettlementSummaryCard() {
  const s = FIN_SETTLEMENT_SUMMARY;
  const rows = [
    { label: "USTN", value: s.ustn }, { label: "Borrower", value: s.borrower }, { label: "Facility", value: s.facility },
    { label: "Loan Amount", value: s.loanAmount }, { label: "Interest Rate", value: s.interestRate }, { label: "Term", value: s.term },
    { label: "Risk Score", value: s.riskScore }, { label: "Collateral", value: s.collateral },
    { label: "GNN Sanctions", value: s.gnnSanctionsProximity }, { label: "Portfolio Impact", value: s.portfolioImpact },
    { label: "Competitive Position", value: s.competitivePosition },
    { label: "Interest Received", value: s.interestReceived }, { label: "Principal Received", value: s.principalReceived },
    { label: "Total Received", value: s.totalReceived }, { label: "Reconciliation", value: s.reconciliation },
    { label: "Basel III CAR", value: s.baselCar }, { label: "Collateral Released", value: s.collateralReleased },
    { label: "Trust Score Update", value: s.trustScoreUpdate }, { label: "Settlement Method", value: s.settlementMethod },
    { label: "Closure Hash", value: s.closureHash },
  ];
  return (
    <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><DollarSign className="w-4 h-4 text-emerald-300" />Settlement Summary — Full Loan Lifecycle<span className="text-[9px] text-slate-500 font-normal ml-1">§13 · ISO 20022</span></h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
        {rows.map(r => <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(16,185,129,0.06)]"><span className="text-slate-400 shrink-0">{r.label}</span><span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span></div>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSURE CONDITIONS
// ═══════════════════════════════════════════════════════════════════════════════
function FinClosureCard() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(16,185,129,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Closure Conditions (Earned Closure)<span className="text-[9px] text-slate-500 font-normal ml-1">§5.10 · G7 — all 7 must be true</span></h3>
      <div className="space-y-1.5">
        {FIN_CLOSURE_CONDITIONS.map((c, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(16,185,129,0.06)]">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" />
            <span className="text-[10px] text-slate-300 flex-1">{c.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(16,185,129,0.06)]">Closure is earned — never forced. All 7 conditions must evaluate true. Basel III CAR must remain above 10.5% minimum throughout loan lifecycle.</p>
    </div>
  );
}
