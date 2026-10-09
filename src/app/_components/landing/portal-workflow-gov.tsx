"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #10 — GOV Workflow (Creative: Fraud/AML Detection Engine +
// Money Laundering Flow Diagram + Payment Settlement Verification + Fraud Alert Network)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, CheckCircle2,
} from "lucide-react";
import {
  GOV_WORKFLOW_STEPS, GOV_DOWNSTREAM_PHASES, GOV_VALIDATION_GATES,
  GOV_SETTLEMENT_SUMMARY, GOV_CLOSURE_CONDITIONS,
  FRAUD_RADAR, ML_FLOW_NODES, ML_FLOW_EDGES, PAYMENT_SETTLEMENT, FRAUD_ALERT_NETWORK,
} from "@/lib/sgtx/landing/gov-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function GovPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = GOV_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / GOV_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => { setCompletedSteps(prev => new Set(prev).add(activeStep)); if (activeStep < GOV_WORKFLOW_STEPS.length - 1) setActiveStep(activeStep + 1); };
  const handlePrev = () => { if (activeStep > 0) setActiveStep(activeStep - 1); };
  const handleSubmit = () => { setWizardState("submitting"); setTimeout(() => setWizardState("validating"), 1200); setTimeout(() => setWizardState("completed"), 3500); };
  const reset = () => { setActiveStep(0); setCompletedSteps(new Set()); setWizardState("filling"); setFormValues({}); };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading kicker="§16.8.6.10 · §3.5.14 · Portal #10 — GOV Workflow (Fraud/AML Detection)" title="GOV Workflow — Clearance + Fraud Detection Journey"
          subtitle="Clearance decision → document verification → FRAUD/AML detection (money laundering, non-payment, circular trades) → alert network → SAR → multi-agency → permit → Loom audit → clearance complete." />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullWorkflow(!showFullWorkflow)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-indigo-500/30" style={{ background: 'linear-gradient(135deg, #4f46e5, #f59e0b)' }}>
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: fraud radar, money laundering flow diagram, payment settlement verification, fraud alert network.</span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">The 9 steps of the GOV clearance + fraud detection workflow — each with creative visualizations:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {GOV_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(79,70,229,0.1)] bg-[rgba(15,23,42,0.5)]">
                  <div className="flex items-center gap-2 mb-1.5"><div className="w-7 h-7 rounded-md bg-indigo-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-indigo-300" /></div><span className="text-[9px] font-mono text-slate-500">§{s.number}</span></div>
                  <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name.split("(")[0].trim()}</h4>
                  {s.creativeFeature && <p className="text-[8px] text-indigo-400 font-medium mb-1">✦ {s.creativeFeature.split("(")[0].trim()}</p>}
                  <p className="text-[8px] text-slate-500">{s.specRef}</p>
                </motion.div>); })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div key="gov-wf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-amber-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{GOV_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>
              <AnimatePresence>
                {wizardState === "filling" && (<motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><GovWizardStepView activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} currentStep={currentStep} formValues={formValues} setFormValues={setFormValues} handleNext={handleNext} handlePrev={handlePrev} handleSubmit={handleSubmit} /></motion.div>)}
                {wizardState === "submitting" && (<motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center"><Loader2 className="w-10 h-10 text-indigo-400 animate-spin mx-auto mb-4" /><h3 className="text-sm font-semibold text-white mb-1">Processing clearance + fraud scan…</h3><p className="text-[10px] text-slate-400">AI auto-clearance + AML detection + SAR generation + permit sealing…</p></motion.div>)}
                {wizardState === "validating" && (<motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                  <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Governor G5 — Clearance + Fraud/AML Validation</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{GOV_VALIDATION_GATES.map((g, i) => (<motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className={`p-2.5 rounded-lg border ${g.status === "pass" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15"}`}><div className="flex items-center gap-1.5 mb-1">{g.status === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Shield className="w-3.5 h-3.5 text-amber-400" />}<span className="text-[10px] font-mono font-bold ${g.status === 'pass' ? 'text-emerald-300' : 'text-amber-300'}">${g.gate}</span></div><p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p><p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p></motion.div>))}</div>
                  <p className="text-[10px] text-emerald-300 mt-3 font-semibold">✓ This trade CLEAN (5/5 fraud indicators). Trade cleared. ⚠ Delta Ago separately flagged — SAR draft pending human approval.</p>
                </motion.div>)}
                {wizardState === "completed" && (<motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <ClearanceCompleteBanner /><GovDownstreamTracker /><GovSettlementSummaryCard /><GovClosureCard />
                  <div className="flex items-center justify-center pt-2"><button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(79,70,229,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Start New Clearance</button></div>
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
function GovWizardStepView({ activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues, handleNext, handlePrev, handleSubmit }: any) {
  const isLast = activeStep === GOV_WORKFLOW_STEPS.length - 1;
  return (
    <div className="rounded-2xl border border-[rgba(79,70,229,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(79,70,229,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {GOV_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; const isActive = i === activeStep; const isComplete = completedSteps.has(i); return (
            <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-indigo-500/15 text-indigo-200 border-indigo-400/30" : "text-slate-300 hover:bg-[rgba(79,70,229,0.06)] hover:text-white border-transparent"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-700/50 text-slate-500"}`}>{isComplete ? <Check className="w-3 h-3" /> : s.number}</div>
              <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate text-[10px]">{s.name.split("(")[0].trim()}</span>
            </button>); })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.1)] flex items-center gap-1.5"><Database className="w-3 h-3 text-emerald-400 animate-pulse" /><span className="text-[9px] text-slate-300">Auto-saved 2s ago</span></div>
        </aside>
        <div className="flex-1 p-4 lg:p-5">
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(79,70,229,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-amber-500/20 flex items-center justify-center shrink-0"><currentStep.icon className="w-5 h-5 text-indigo-300" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>{currentStep.governorGate && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>}</div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
              {currentStep.creativeFeature && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 font-medium">✦ {currentStep.creativeFeature}</span>}
            </div>
          </div>
          {currentStep.aiSuggestion && (<div className="p-3 rounded-lg border border-indigo-500/20 bg-indigo-950/15 mb-4 flex items-start gap-2"><div className="w-6 h-6 rounded-md bg-indigo-500/20 flex items-center justify-center shrink-0"><span className="text-[9px] font-bold text-indigo-300">AI</span></div><div className="flex-1"><p className="text-[9px] text-indigo-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2/A3 Suggestion</p><p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-line">{currentStep.aiSuggestion}</p></div></div>)}
          {/* Creative SVG visualizations per step */}
          {activeStep === 0 && <ClearanceGaugeViz formValues={formValues} setFormValues={setFormValues} activeStep={activeStep} />}
          {activeStep === 1 && <DiscrepancyRadarViz />}
          {activeStep === 2 && <><FraudRadarViz /><MoneyLaunderingFlowViz /><PaymentSettlementViz /></>}
          {activeStep === 3 && <FraudAlertNetworkViz />}
          {activeStep === 4 && <SarEvidenceViz />}
          {activeStep === 5 && <MultiAgencyStepperViz />}
          {activeStep === 6 && <DigitalSealViz />}
          {/* Form fields */}
          <div className="space-y-3">{currentStep.fields.map((field: any) => (<GovFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />))}</div>
          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(79,70,229,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(79,70,229,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
            <div className="flex items-center gap-1">{GOV_WORKFLOW_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-indigo-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Step ${i + 1}`} />)}</div>
            {isLast ? <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-indigo-500 to-amber-500 hover:shadow-lg hover:shadow-indigo-500/30 transition-all"><Shield className="w-3.5 h-3.5" /> Complete Clearance — G5</button> : <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-indigo-500 to-amber-500 hover:shadow-lg hover:shadow-indigo-500/30 transition-all">Next <ChevronRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Clearance Confidence Gauge (step 0)
// ═══════════════════════════════════════════════════════════════════════════════
function ClearanceGaugeViz({ formValues, setFormValues, activeStep }: any) {
  const confidence = 92;
  const circumference = 2 * Math.PI * 36;
  const offset = circumference - (confidence / 100) * circumference * 0.75;
  return (
    <div className="mb-4 p-4 rounded-xl border border-indigo-500/15 bg-indigo-950/10 flex items-center gap-4">
      <div className="relative w-24 h-24 shrink-0">
        <svg className="w-24 h-24" viewBox="0 0 80 80">
          <path d="M 20 60 A 36 36 0 1 1 60 60" fill="none" stroke="rgba(79,70,229,0.1)" strokeWidth="6" strokeLinecap="round" />
          <path d="M 20 60 A 36 36 0 1 1 60 60" fill="none" stroke="#4f46e5" strokeWidth="6" strokeLinecap="round" strokeDasharray={circumference * 0.75} strokeDashoffset={offset} style={{ transition: "stroke-dashoffset 1s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-2"><span className="text-xl font-bold text-indigo-300">{confidence}%</span><span className="text-[8px] text-slate-500">CONFIDENCE</span></div>
      </div>
      <div className="flex-1">
        <p className="text-[10px] text-indigo-300 font-semibold mb-1">✦ AI Auto-Clearance Confidence</p>
        <div className="space-y-1 text-[9px]">
          <div className="flex justify-between"><span className="text-slate-400">Risk score</span><span className="text-emerald-300 font-mono">72 (low)</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Sanctions</span><span className="text-emerald-300">Clear (3 hops)</span></div>
          <div className="flex justify-between"><span className="text-slate-400">HS code</span><span className="text-emerald-300">Verified ✓</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Documents</span><span className="text-emerald-300">8/8 ✓</span></div>
          <div className="flex justify-between"><span className="text-slate-400">Duty</span><span className="text-emerald-300 font-mono">$5,255 calculated</span></div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Discrepancy Radar (step 1)
// ═══════════════════════════════════════════════════════════════════════════════
function DiscrepancyRadarViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-indigo-500/15 bg-indigo-950/10">
      <p className="text-[10px] text-indigo-300 font-semibold mb-3">✦ AI Document Discrepancy Detection (5 checks, all passed)</p>
      <div className="grid grid-cols-5 gap-2">
        {[{ label: "HS Code", status: "✓", color: "#10b981" }, { label: "Value", status: "✓", color: "#10b981" }, { label: "Origin", status: "✓", color: "#10b981" }, { label: "Sanctions", status: "✓", color: "#10b981" }, { label: "Signature", status: "✓", color: "#10b981" }].map((c, i) => (
          <motion.div key={i} initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }} className="p-2 rounded-lg border text-center" style={{ background: `${c.color}10`, borderColor: `${c.color}30` }}>
            <p className="text-sm font-bold" style={{ color: c.color }}>{c.status}</p>
            <p className="text-[8px] text-slate-400 mt-0.5">{c.label}</p>
          </motion.div>
        ))}
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ 0 discrepancies. AI confidence: 96%. All documents verified.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Fraud Radar (5 indicators, step 2)
// ═══════════════════════════════════════════════════════════════════════════════
function FraudRadarViz() {
  const indicators = FRAUD_RADAR;
  const numAxes = indicators.length;
  const center = 50; const maxR = 40;
  const angle = (i: number) => (Math.PI * 2 * i) / numAxes - Math.PI / 2;
  const point = (i: number, r: number) => `${center + Math.cos(angle(i)) * r},${30 + Math.sin(angle(i)) * r}`;
  const dataPoints = indicators.map((ind, i) => point(i, (ind.score / 100) * maxR)).join(" ");
  const thresholdPoints = indicators.map((ind, i) => point(i, (ind.threshold / 100) * maxR)).join(" ");
  return (
    <div className="mb-4 p-4 rounded-xl border border-indigo-500/15 bg-indigo-950/10">
      <p className="text-[10px] text-indigo-300 font-semibold mb-2">✦ Fraud Detection Radar (5 AML Indicators — all CLEAN for this trade)</p>
      <div className="relative w-full h-40 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
          {/* Grid circles */}
          {[20, 40, 60, 80, 100].map(pct => <circle key={pct} cx={center} cy={30} r={(pct / 100) * maxR} fill="none" stroke="rgba(148,163,184,0.06)" strokeWidth="0.2" />)}
          {/* Axes */}
          {indicators.map((_, i) => <line key={i} x1={center} y1={30} x2={center + Math.cos(angle(i)) * maxR} y2={30 + Math.sin(angle(i)) * maxR} stroke="rgba(148,163,184,0.08)" strokeWidth="0.15" />)}
          {/* Threshold polygon (red dashed) */}
          <polygon points={thresholdPoints} fill="none" stroke="#ef4444" strokeWidth="0.3" strokeDasharray="1,0.5" opacity="0.4" />
          {/* Data polygon (green filled) */}
          <polygon points={dataPoints} fill="rgba(16,185,129,0.15)" stroke="#10b981" strokeWidth="0.4" />
          {/* Data points */}
          {indicators.map((ind, i) => { const p = point(i, (ind.score / 100) * maxR).split(","); return <circle key={i} cx={parseFloat(p[0])} cy={parseFloat(p[1])} r="1.2" fill="#10b981" />; })}
          {/* Labels */}
          {indicators.map((ind, i) => { const lx = center + Math.cos(angle(i)) * (maxR + 5); const ly = 30 + Math.sin(angle(i)) * (maxR + 5); return <text key={i} x={lx} y={ly} textAnchor="middle" fill={ind.score >= ind.threshold ? "#10b981" : "#ef4444"} fontSize="1.8" fontWeight="bold">{ind.indicator.split(" ")[0]}</text>; })}
        </svg>
      </div>
      <div className="grid grid-cols-5 gap-1 mt-2">
        {indicators.map((ind, i) => <div key={i} className="text-center p-1 rounded bg-emerald-500/5 border border-emerald-500/10"><p className="text-[8px] text-slate-400">{ind.indicator}</p><p className="text-[9px] font-bold text-emerald-300">{ind.score}</p></div>)}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: Money Laundering Flow Diagram (step 2)
// ═══════════════════════════════════════════════════════════════════════════════
function MoneyLaunderingFlowViz() {
  const nodeColor = (t: string) => t === "flagged" ? "#ef4444" : t === "alert" ? "#f59e0b" : "#3b82f6";
  return (
    <div className="mb-4 p-4 rounded-xl border border-rose-500/15 bg-rose-950/5">
      <p className="text-[10px] text-rose-300 font-semibold mb-2">✦ Money Laundering Flow Diagram (Delta Ago — SEPARATE ALERT, circular $420K loop detected)</p>
      <div className="relative w-full h-36 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet">
          {/* Edges */}
          {ML_FLOW_EDGES.map((e, i) => {
            const from = ML_FLOW_NODES.find(n => n.id === e.from);
            const to = ML_FLOW_NODES.find(n => n.id === e.to);
            if (!from || !to) return null;
            const midX = (from.x + to.x) / 2; const midY = (from.y + to.y) / 2 - 3;
            return <g key={i}>
              <path d={`M ${from.x} ${from.y} Q ${midX} ${midY} ${to.x} ${to.y}`} fill="none" stroke={e.flagged ? "#ef4444" : "#64748b"} strokeWidth="0.4" strokeDasharray={e.flagged ? "1,0.5" : "none"} opacity="0.6" />
              <text x={midX} y={midY} textAnchor="middle" fill={e.flagged ? "#fca5a5" : "#94a3b8"} fontSize="1.5" opacity="0.7">{e.label}</text>
              {e.flagged && <text x={midX} y={midY - 2} textAnchor="middle" fill="#ef4444" fontSize="1.8" fontWeight="bold">⚠</text>}
            </g>;
          })}
          {/* Nodes */}
          {ML_FLOW_NODES.map(n => { const color = nodeColor(n.type); const r = n.type === "flagged" ? 3 : 2.5; return <g key={n.id}><circle cx={n.x} cy={n.y} r={r} fill={color} opacity="0.85" /><text x={n.x} y={n.y - r - 1.5} textAnchor="middle" fill={color} fontSize="2" fontWeight="bold">{n.label}</text><text x={n.x} y={n.y + r + 2.5} textAnchor="middle" fill="#94a3b8" fontSize="1.5" opacity="0.6">{n.role}</text></g>; })}
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Flagged (Delta Ago)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> Involved</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Payment Gap</span>
        <span className="text-rose-300">⚠ Circular: Delta → Nile → Mediterra → Delta ($420K loop)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 5: Payment Settlement Verification (step 2)
// ═══════════════════════════════════════════════════════════════════════════════
function PaymentSettlementViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-indigo-500/15 bg-indigo-950/10">
      <p className="text-[10px] text-indigo-300 font-semibold mb-2">✦ Payment Settlement Verification (Buyer Paid vs Seller Received — 2 UNPAID detected)</p>
      <div className="overflow-x-auto rounded-lg border border-[rgba(79,70,229,0.08)]">
        <table className="w-full text-[9px]">
          <thead className="bg-[rgba(2,6,23,0.6)]"><tr className="text-left text-slate-400"><th className="px-2 py-1 font-medium">Trade</th><th className="px-2 py-1 font-medium">Buyer</th><th className="px-2 py-1 font-medium">Seller</th><th className="px-2 py-1 font-medium">Amount</th><th className="px-2 py-1 font-medium">Buyer Paid</th><th className="px-2 py-1 font-medium">Seller Received</th><th className="px-2 py-1 font-medium">Status</th></tr></thead>
          <tbody>{PAYMENT_SETTLEMENT.map((p, i) => (
            <tr key={i} className={`border-t ${p.status === "unpaid" ? "border-rose-500/20 bg-rose-500/5" : "border-[rgba(79,70,229,0.06)]"}`}>
              <td className="px-2 py-1 font-mono text-indigo-300 text-[8px]">{p.trade}</td><td className="px-2 py-1 text-slate-300 text-[8px]">{p.buyer}</td><td className="px-2 py-1 text-slate-300 text-[8px]">{p.seller}</td><td className="px-2 py-1 text-amber-300 font-mono text-[8px]">{p.amount}</td>
              <td className="px-2 py-1 text-center">{p.buyerPaid ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗</span>}</td>
              <td className="px-2 py-1 text-center">{p.sellerReceived ? <span className="text-emerald-400">✓</span> : <span className="text-rose-400">✗ UNPAID</span>}</td>
              <td className="px-2 py-1"><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-medium ${p.status === "settled" ? "bg-emerald-500/15 text-emerald-300" : "bg-rose-500/15 text-rose-300"}`}>{p.status}</span></td>
            </tr>))}</tbody>
        </table>
      </div>
      <p className="text-[9px] text-rose-300 mt-2">⚠ 2 trades where buyer paid but seller didn't receive money — Delta Ago is the seller in both. $5.6K total unpaid. Non-payment fraud indicator triggered.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 6: Fraud Alert Network (step 3)
// ═══════════════════════════════════════════════════════════════════════════════
function FraudAlertNetworkViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-rose-500/15 bg-rose-950/5">
      <p className="text-[10px] text-rose-300 font-semibold mb-3">✦ Fraud Alert Network (Affected Parties Notified of Delta Ago Scam)</p>
      <div className="space-y-1.5">
        {FRAUD_ALERT_NETWORK.map((p, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className={`flex items-start gap-2 p-2 rounded-lg border ${p.priority >= 90 ? "border-rose-500/20 bg-rose-500/5" : "border-amber-500/15 bg-amber-500/3"}`}>
            <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${p.priority >= 90 ? "bg-rose-400" : "bg-amber-400"} animate-pulse`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-[10px] font-semibold text-white">{p.party}</p>
                <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold ${p.priority >= 90 ? "bg-rose-500/15 text-rose-300" : "bg-amber-500/15 text-amber-300"}`}>p{p.priority}</span>
                {p.notified && <span className="text-[8px] text-emerald-400">✓ NOTIFIED</span>}
              </div>
              <p className="text-[9px] text-slate-400 mt-0.5">{p.role}</p>
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 7: SAR Evidence Package (step 4)
// ═══════════════════════════════════════════════════════════════════════════════
function SarEvidenceViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/5">
      <p className="text-[10px] text-amber-300 font-semibold mb-3">✦ SAR Evidence Package (Delta Ago — Auto-Generated Draft)</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[{ label: "Unpaid Shipments", value: "2 ($5.6K)", color: "#ef4444" }, { label: "Circular Trades", value: "$420K loop", color: "#ef4444" }, { label: "GNN Sanctions", value: "2-hop proximity", color: "#f59e0b" }, { label: "AI Confidence", value: "87%", color: "#f59e0b" }].map((s, i) => (
          <div key={i} className="p-2 rounded-lg text-center" style={{ background: `${s.color}10`, border: `1px solid ${s.color}30` }}>
            <p className="text-[8px] text-slate-500 uppercase">{s.label}</p>
            <p className="text-[10px] font-bold" style={{ color: s.color }}>{s.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-400 mt-2">Status: DRAFT — A1 narrative generated. A5 FORBIDDEN (human compliance officer must approve before filing).</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 8-10: Multi-Agency + Digital Seal (steps 5-6)
// ═══════════════════════════════════════════════════════════════════════════════
function MultiAgencyStepperViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-indigo-500/15 bg-indigo-950/10">
      <p className="text-[10px] text-indigo-300 font-semibold mb-3">✦ Multi-Agency Approval Stepper</p>
      <div className="flex items-center justify-between gap-1">
        {[{ name: "Customs", status: "Approved ✓", color: "#10b981" }, { name: "Port Authority", status: "Pending", color: "#f59e0b" }, { name: "Trade Ministry", status: "Pending", color: "#f59e0b" }, { name: "CBE", status: "Not Required", color: "#64748b" }].map((a, i) => (
          <div key={i} className="flex flex-col items-center gap-1 shrink-0 min-w-[70px]">
            <div className="w-8 h-8 rounded-full flex items-center justify-center border-2" style={{ borderColor: a.color, background: `${a.color}20` }}>
              {a.status.includes("Approved") ? <Check className="w-4 h-4" style={{ color: a.color }} /> : a.status.includes("Pending") ? <span className="text-[8px]">⏳</span> : <span className="text-[7px]">N/A</span>}
            </div>
            <p className="text-[8px] text-slate-300 text-center">{a.name}</p>
            <p className="text-[7px] text-center" style={{ color: a.color }}>{a.status}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function DigitalSealViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/5">
      <p className="text-[10px] text-amber-300 font-semibold mb-3">✦ Government Digital Seal (Ed25519 — Sovereign Authority)</p>
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border-4 border-amber-500/30 flex items-center justify-center shrink-0">
          <svg className="w-10 h-10" viewBox="0 0 40 40">
            <polygon points="20,5 35,12 35,28 20,35 5,28 5,12" fill="none" stroke="#f59e0b" strokeWidth="1.5" />
            <text x="20" y="24" textAnchor="middle" fill="#f59e0b" fontSize="6" fontWeight="bold">EG</text>
          </svg>
        </div>
        <div className="flex-1">
          <p className="text-[10px] text-amber-300 font-bold">GOV-SEAL-EG-01</p>
          <p className="text-[9px] text-slate-400">Ed25519 signature · Nafeza registered</p>
          <p className="text-[9px] text-slate-400">Verifies: sovereign authority (Egypt) + permit content + timestamp</p>
          <p className="text-[9px] text-emerald-300 mt-1">✓ Applied · Auto-propagated to Italy customs</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function GovFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.type === "slider") return null;
  const label = <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">{field.label}{field.required && <span className="text-red-400">*</span>}{field.aiAssist && <span className="text-[8px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-300 font-mono">{field.aiAssist}</span>}</label>;
  if (field.type === "select") return <div>{label}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.15)] rounded-lg focus:outline-none focus:border-indigo-400/40">{field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}</select></div>;
  if (field.type === "radio") return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-indigo-500/20 border-indigo-400/40 text-indigo-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(79,70,229,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>;
  if (field.type === "textarea") return <div>{label}<textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.15)] rounded-lg focus:outline-none focus:border-indigo-400/40 resize-y whitespace-pre-line" /></div>;
  if (field.type === "toggle") { const current = value || field.options?.[0]; return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(79,70,229,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>; }
  return <div>{label}<input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(79,70,229,0.15)] rounded-lg focus:outline-none focus:border-indigo-400/40" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BANNER + DOWNSTREAM + SETTLEMENT + CLOSURE
// ═══════════════════════════════════════════════════════════════════════════════
function ClearanceCompleteBanner() {
  return <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap"><div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-300" /></div><div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white">Clearance Complete — Trade Released (Fraud/AML CLEAN 5/5)</h3><p className="text-[10px] text-slate-400 mt-0.5">Auto-clearance 92% confidence. Documents verified 96%. Fraud scan 5/5 CLEAN. Multi-agency approved. Permit sealed (Ed25517). Loom 100%. ⚠ Delta Ago SAR separately pending.</p></div><div className="text-right"><p className="text-[8px] text-slate-500 uppercase tracking-wider">USTN</p><p className="text-[11px] font-mono text-indigo-300">{GOV_SETTLEMENT_SUMMARY.ustn}</p></div></div>;
}
function GovDownstreamTracker() {
  return <div className="p-4 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Downstream Phase Progression<span className="text-[9px] text-slate-500 font-normal">§16.8.6.10 → §3.5.14 → §13</span></h3><div className="space-y-2">{GOV_DOWNSTREAM_PHASES.map((p, i) => { const Icon = p.icon; const sc = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : p.status === "active" ? "text-amber-300 bg-amber-500/10 border-amber-500/30" : "text-slate-400 bg-slate-500/5 border-slate-500/15"; return <div key={p.phase} className="flex items-stretch gap-2"><div className="flex flex-col items-center"><div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${sc}`}><Icon className="w-4 h-4" /></div>{i < GOV_DOWNSTREAM_PHASES.length - 1 && <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />}</div><div className="flex-1 p-2.5 rounded-lg border border-[rgba(79,70,229,0.08)] bg-[rgba(2,6,23,0.4)] mb-2"><div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span><span className="text-[11px] font-semibold text-white">{p.name}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold capitalize ${sc} border`}>{p.status}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span></div><p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p></div></div>; })}</div></div>;
}
function GovSettlementSummaryCard() {
  const s = GOV_SETTLEMENT_SUMMARY; const rows = [
    { label: "USTN", value: s.ustn }, { label: "Trade", value: s.trade }, { label: "Clearance", value: s.clearanceStatus }, { label: "AI Confidence (docs)", value: s.aiDocumentConfidence }, { label: "Fraud/AML Result", value: s.fraudAmlResult }, { label: "Fraud Alert (separate)", value: s.fraudAlertSeparate }, { label: "SAR Status", value: s.sarStatus }, { label: "Multi-Agency", value: s.multiAgency }, { label: "Permits", value: s.permitsIssued }, { label: "Digital Seal", value: s.digitalSeal }, { label: "Loom Verified", value: s.loomVerified }, { label: "Parties Notified", value: s.partiesNotified }, { label: "Public Verify", value: s.publicVerifyEndpoint }, { label: "Closure Hash", value: s.closureHash },
  ];
  return <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-300" />Clearance Summary — Sovereign Audit Complete<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.10</span></h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">{rows.map(r => <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(79,70,229,0.06)]"><span className="text-slate-400 shrink-0">{r.label}</span><span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span></div>)}</div></div>;
}
function GovClosureCard() {
  return <div className="p-4 rounded-xl border border-[rgba(79,70,229,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Closure Conditions (Sovereign Seal)<span className="text-[9px] text-slate-500 font-normal ml-1">§5.10 · G7 — all 7</span></h3><div className="space-y-1.5">{GOV_CLOSURE_CONDITIONS.map((c, i) => <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(79,70,229,0.06)]"><div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" /><span className="text-[10px] text-slate-300 flex-1">{c.name}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span></div>)}</div><p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(79,70,229,0.06)]">Sovereign records sealed. Public Loom verification endpoint available for partner governments. SAR for Delta Ago pending human approval (separate).</p></div>;
}
