"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #11 — Admin Workflow (Creative: Constitutional impact blast radius +
// multisig signing ceremony + config diff viewer + WASM pipeline)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, CheckCircle2,
} from "lucide-react";
import {
  ADM_WORKFLOW_STEPS, ADM_DOWNSTREAM_PHASES, ADM_VALIDATION_GATES,
  ADM_SETTLEMENT_SUMMARY, ADM_CLOSURE_CONDITIONS,
  BLAST_RADIUS_PORTALS, MULTISIG_HOLDERS, CONFIG_DIFF, WASM_PIPELINE,
} from "@/lib/sgtx/landing/adm-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function AdmPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = ADM_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / ADM_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => { setCompletedSteps(prev => new Set(prev).add(activeStep)); if (activeStep < ADM_WORKFLOW_STEPS.length - 1) setActiveStep(activeStep + 1); };
  const handlePrev = () => { if (activeStep > 0) setActiveStep(activeStep - 1); };
  const handleSubmit = () => { setWizardState("submitting"); setTimeout(() => setWizardState("validating"), 1200); setTimeout(() => setWizardState("completed"), 3500); };
  const reset = () => { setActiveStep(0); setCompletedSteps(new Set()); setWizardState("filling"); setFormValues({}); };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading kicker="§3.6 · §3.5.9 · Portal #11 — Admin Workflow (Constitutional Governance)" title="Admin Workflow — Constitutional Amendment Journey"
          subtitle="Amendment proposal → impact blast radius → 30-day notice → multisig 3-of-5 ceremony → WASM compile → hot reload → impersonation → config diff → Loom seal." />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullWorkflow(!showFullWorkflow)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-purple-500/30" style={{ background: 'linear-gradient(135deg, #7c3aed, #94a3b8)' }}>
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: blast radius, multisig ceremony, config diff, WASM pipeline.</span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">The 9 steps of the Admin constitutional amendment workflow — each with creative visualizations:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {ADM_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)]">
                  <div className="flex items-center gap-2 mb-1.5"><div className="w-7 h-7 rounded-md bg-purple-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-purple-300" /></div><span className="text-[9px] font-mono text-slate-500">§{s.number}</span></div>
                  <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name.split("(")[0].trim()}</h4>
                  {s.creativeFeature && <p className="text-[8px] text-purple-400 font-medium mb-1">✦ {s.creativeFeature.split("(")[0].trim()}</p>}
                  <p className="text-[8px] text-slate-500">{s.specRef}</p>
                </motion.div>); })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div key="adm-wf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-purple-500 to-slate-400" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{ADM_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>
              <AnimatePresence>
                {wizardState === "filling" && (<motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><AdmWizardStepView activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} currentStep={currentStep} formValues={formValues} setFormValues={setFormValues} handleNext={handleNext} handlePrev={handlePrev} handleSubmit={handleSubmit} /></motion.div>)}
                {wizardState === "submitting" && (<motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center"><Loader2 className="w-10 h-10 text-purple-400 animate-spin mx-auto mb-4" /><h3 className="text-sm font-semibold text-white mb-1">Sealing constitutional amendment…</h3><p className="text-[10px] text-slate-400">Multisig verified + WASM compiled + hot reload + Loom seal…</p></motion.div>)}
                {wizardState === "validating" && (<motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                  <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> Constitutional Amendment Validation (8 gates)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{ADM_VALIDATION_GATES.map((g, i) => (<motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className="p-2.5 rounded-lg border bg-emerald-500/5 border-emerald-500/15"><div className="flex items-center gap-1.5 mb-1"><Check className="w-3.5 h-3.5 text-emerald-400" /><span className="text-[10px] font-mono font-bold text-emerald-300">{g.gate}</span></div><p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p><p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p></motion.div>))}</div>
                  <p className="text-[10px] text-emerald-300 mt-3 font-semibold">✓ All 8 gates passed. Constitutional amendment A5-expansion sealed on Loom. Immutable. Permanent.</p>
                </motion.div>)}
                {wizardState === "completed" && (<motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <AmendmentSealedBanner /><AdmDownstreamTracker /><AdmSettlementSummaryCard /><AdmClosureCard />
                  <div className="flex items-center justify-center pt-2"><button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(124,58,237,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Start New Amendment</button></div>
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
function AdmWizardStepView({ activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues, handleNext, handlePrev, handleSubmit }: any) {
  const isLast = activeStep === ADM_WORKFLOW_STEPS.length - 1;
  return (
    <div className="rounded-2xl border border-[rgba(124,58,237,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(124,58,237,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {ADM_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; const isActive = i === activeStep; const isComplete = completedSteps.has(i); return (
            <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-purple-500/15 text-purple-200 border-purple-400/30" : "text-slate-300 hover:bg-[rgba(124,58,237,0.06)] hover:text-white border-transparent"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-purple-500/20 text-purple-300" : "bg-slate-700/50 text-slate-500"}`}>{isComplete ? <Check className="w-3 h-3" /> : s.number}</div>
              <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate text-[10px]">{s.name.split("(")[0].trim()}</span>
            </button>); })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.1)] flex items-center gap-1.5"><Database className="w-3 h-3 text-emerald-400 animate-pulse" /><span className="text-[9px] text-slate-300">Auto-saved 2s ago</span></div>
        </aside>
        <div className="flex-1 p-4 lg:p-5">
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(124,58,237,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-500/20 to-slate-400/20 flex items-center justify-center shrink-0"><currentStep.icon className="w-5 h-5 text-purple-300" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>{currentStep.governorGate && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>}</div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
              {currentStep.creativeFeature && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-300 font-medium">✦ {currentStep.creativeFeature}</span>}
            </div>
          </div>
          {currentStep.aiSuggestion && (<div className="p-3 rounded-lg border border-purple-500/20 bg-purple-950/15 mb-4 flex items-start gap-2"><div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0"><span className="text-[9px] font-bold text-purple-300">AI</span></div><div className="flex-1"><p className="text-[9px] text-purple-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2/A4 Suggestion</p><p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-line">{currentStep.aiSuggestion}</p></div></div>)}
          {/* Creative SVG per step */}
          {activeStep === 1 && <BlastRadiusViz />}
          {activeStep === 2 && <PublicNoticeCountdownViz />}
          {activeStep === 3 && <MultisigCeremonyViz />}
          {activeStep === 4 && <WasmPipelineViz />}
          {activeStep === 5 && <HotReloadViz />}
          {activeStep === 6 && <TenantImpersonationViz />}
          {activeStep === 7 && <ConfigDiffViz />}
          {/* Form fields */}
          <div className="space-y-3">{currentStep.fields.map((field: any) => (<AdmFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />))}</div>
          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(124,58,237,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(124,58,237,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
            <div className="flex items-center gap-1">{ADM_WORKFLOW_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-purple-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Step ${i + 1}`} />)}</div>
            {isLast ? <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-purple-500 to-slate-400 hover:shadow-lg hover:shadow-purple-500/30 transition-all"><Shield className="w-3.5 h-3.5" /> Seal Amendment — L0</button> : <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-purple-500 to-slate-400 hover:shadow-lg hover:shadow-purple-500/30 transition-all">Next <ChevronRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Blast Radius Visualization (step 2)
// ═══════════════════════════════════════════════════════════════════════════════
function BlastRadiusViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
      <p className="text-[10px] text-purple-300 font-semibold mb-3">✦ Constitutional Impact Blast Radius (3/12 portals affected)</p>
      <div className="relative w-full h-44 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 80" preserveAspectRatio="xMidYMid meet">
          {/* Blast radius circle (centered on affected portals) */}
          <circle cx="50" cy="25" r="22" fill="rgba(124,58,237,0.06)" stroke="rgba(124,58,237,0.2)" strokeWidth="0.3" strokeDasharray="1,0.5" />
          <text x="50" y="8" textAnchor="middle" fill="#a78bfa" fontSize="2.5" fontWeight="bold" opacity="0.7">BLAST RADIUS</text>
          {/* Portal nodes */}
          {BLAST_RADIUS_PORTALS.map((p, i) => {
            const color = p.affected ? (p.severity === "medium" ? "#f59e0b" : "#a78bfa") : "#475569";
            const opacity = p.affected ? 1 : 0.3;
            return <g key={i}>
              <circle cx={p.x} cy={p.y} r={p.affected ? 3 : 2} fill={color} opacity={opacity} />
              <text x={p.x} y={p.y - 4} textAnchor="middle" fill={p.affected ? "#fff" : "#64748b"} fontSize="1.8" fontWeight={p.affected ? "bold" : "normal"} opacity={opacity}>{p.name}</text>
              {p.affected && <text x={p.x} y={p.y + 5} textAnchor="middle" fill={color} fontSize="1.5">{p.trades} trades</text>}
              {p.affected && <text x={p.x} y={p.y + 7.5} textAnchor="middle" fill={color} fontSize="1.2" opacity="0.6">{p.severity}</text>}
            </g>;
          })}
        </svg>
      </div>
      <div className="flex items-center gap-3 mt-2 text-[9px] flex-wrap">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Medium impact (FIN Bank, 8 trades)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-400" /> Low impact (FIN PFI + GOV, 6 trades)</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-slate-600 opacity-30" /> Not affected (8 portals)</span>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Public Notice Countdown (step 3)
// ═══════════════════════════════════════════════════════════════════════════════
function PublicNoticeCountdownViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-amber-500/15 bg-amber-950/5">
      <p className="text-[10px] text-amber-300 font-semibold mb-3">✦ 30-Day Public Notice Countdown + Comment Tracker</p>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(245,158,11,0.1)" strokeWidth="5" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="#f59e0b" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 32} strokeDashoffset={2 * Math.PI * 32 * 0.03} style={{ transition: "stroke-dashoffset 1s ease" }} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-amber-300">29d</span><span className="text-[8px] text-slate-500">remaining</span></div>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-3 gap-2 text-[9px]">
            <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10 text-center"><p className="text-[8px] text-slate-500">Supportive</p><p className="text-emerald-300 font-bold text-sm">2</p></div>
            <div className="p-1.5 rounded bg-amber-500/5 border border-amber-500/10 text-center"><p className="text-[8px] text-slate-500">Concern</p><p className="text-amber-300 font-bold text-sm">1</p></div>
            <div className="p-1.5 rounded bg-slate-700/20 text-center"><p className="text-[8px] text-slate-500">Total</p><p className="text-white font-bold text-sm">3</p></div>
          </div>
          <p className="text-[8px] text-slate-500 mt-2">PFI concern: restricting auto-liquidation may slow distressed cargo. A1 response: human approves within 2h (same as current avg). No material impact.</p>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Multisig Signing Ceremony (step 4)
// ═══════════════════════════════════════════════════════════════════════════════
function MultisigCeremonyViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
      <p className="text-[10px] text-purple-300 font-semibold mb-3">✦ Multisig Signing Ceremony (3-of-5 — Tipping Point Reached)</p>
      <div className="flex items-center justify-between gap-1">
        {MULTISIG_HOLDERS.map((m, i) => {
          const color = m.signed ? (m.tipping ? "#f59e0b" : "#10b981") : "#475569";
          return (
            <div key={m.id} className="flex flex-col items-center gap-1 shrink-0 min-w-[60px]">
              {/* Key icon */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center border-2" style={{ borderColor: color, background: `${color}15` }}>
                {m.signed ? <Check className="w-5 h-5" style={{ color }} /> : <span className="text-[8px] text-slate-500">PENDING</span>}
              </div>
              <p className="text-[8px] text-slate-300">{m.name}</p>
              {m.signed ? <p className="text-[7px]" style={{ color }}>{m.timestamp}</p> : <p className="text-[7px] text-slate-600">—</p>}
              {m.tipping && <span className="text-[7px] text-amber-400 font-bold animate-pulse">★ TIPPING</span>}
              {/* Connector */}
              {i < MULTISIG_HOLDERS.length - 1 && <div className="absolute" style={{ left: `calc(${(i + 1) * 20}% - 1px)`, top: "20px" }} />}
            </div>
          );
        })}
      </div>
      <div className="mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10 text-center">
        <p className="text-[10px] text-emerald-300 font-bold">✓ 3/5 SIGNED — TIPPING POINT REACHED. Amendment approved. WASM compilation triggered.</p>
      </div>
      <p className="text-[8px] text-rose-300 mt-1 text-center">⚠ A5 FORBIDDEN — no AI signing. Human passkey + biometric only.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: WASM Pipeline (step 5)
// ═══════════════════════════════════════════════════════════════════════════════
function WasmPipelineViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
      <p className="text-[10px] text-purple-300 font-semibold mb-3">✦ WASM Compilation Pipeline (7 stages, all complete)</p>
      <div className="space-y-1.5">
        {WASM_PIPELINE.map((s, i) => (
          <motion.div key={s.stage} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-emerald-500/10">
            <div className="w-5 h-5 rounded-full bg-emerald-500/20 flex items-center justify-center shrink-0"><Check className="w-3 h-3 text-emerald-400" /></div>
            <div className="flex-1"><p className="text-[10px] text-white">{s.stage}</p></div>
            <span className="text-[9px] text-slate-500 font-mono">{s.duration}</span>
          </motion.div>
        ))}
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ All 7 stages complete. Total: ~2h. Module signed + previous archived. Ready for hot reload.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 5: Hot Reload (step 6)
// ═══════════════════════════════════════════════════════════════════════════════
function HotReloadViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-emerald-500/15 bg-emerald-950/5">
      <p className="text-[10px] text-emerald-300 font-semibold mb-3">✦ Hot Reload Deployment (Zero Downtime)</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="p-2 rounded bg-slate-700/20 border border-slate-700/30 text-center"><p className="text-[8px] text-slate-500">Old Policy</p><p className="text-[9px] text-slate-400">14 trades (grandfathered)</p><p className="text-[8px] text-slate-500">continue until completion</p></div>
        <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/10 text-center"><p className="text-[8px] text-slate-500">New Policy</p><p className="text-[9px] text-emerald-300">All new trades</p><p className="text-[8px] text-emerald-400">A5 expanded ✓</p></div>
        <div className="p-2 rounded bg-blue-500/5 border border-blue-500/10 text-center"><p className="text-[8px] text-slate-500">Verified</p><p className="text-[9px] text-blue-300">Test: auto-liquidation</p><p className="text-[8px] text-rose-400">→ BLOCKED ✓</p></div>
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ Zero downtime. 8 platform services: healthy during reload. Rollback window: 24h.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 6: Tenant Impersonation (step 7)
// ═══════════════════════════════════════════════════════════════════════════════
function TenantImpersonationViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-slate-500/15 bg-slate-800/10">
      <p className="text-[10px] text-slate-300 font-semibold mb-3">✦ Tenant Impersonation Session (Readonly — 30-min Countdown)</p>
      <div className="flex items-center gap-4">
        <div className="relative w-20 h-20 shrink-0">
          <svg className="w-20 h-20" viewBox="0 0 80 80">
            <circle cx="40" cy="40" r="32" fill="none" stroke="rgba(148,163,184,0.1)" strokeWidth="5" />
            <circle cx="40" cy="40" r="32" fill="none" stroke="#94a3b8" strokeWidth="5" strokeLinecap="round" strokeDasharray={2 * Math.PI * 32} strokeDashoffset={0} />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-lg font-bold text-slate-300">30:00</span><span className="text-[8px] text-slate-500">remaining</span></div>
        </div>
        <div className="flex-1">
          <div className="grid grid-cols-2 gap-2 text-[9px]">
            <div className="p-1.5 rounded bg-emerald-500/5 border border-emerald-500/10"><p className="text-[8px] text-slate-500">Mode</p><p className="text-emerald-300 font-bold">READONLY</p></div>
            <div className="p-1.5 rounded bg-rose-500/5 border border-rose-500/10"><p className="text-[8px] text-slate-500">Writes</p><p className="text-rose-300 font-bold">BLOCKED (A5)</p></div>
            <div className="p-1.5 rounded bg-slate-700/20"><p className="text-[8px] text-slate-500">Audit</p><p className="text-slate-300">Every action → Loom</p></div>
            <div className="p-1.5 rounded bg-slate-700/20"><p className="text-[8px] text-slate-500">Notify</p><p className="text-slate-300">After session ends</p></div>
          </div>
        </div>
      </div>
      <p className="text-[8px] text-slate-500 mt-2 italic">Not needed for this amendment workflow. Included for completeness: readonly inspection with 30-min timeout, full audit, tenant notified after.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 7: Config Diff Viewer (step 8)
// ═══════════════════════════════════════════════════════════════════════════════
function ConfigDiffViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-purple-500/15 bg-purple-950/10">
      <p className="text-[10px] text-purple-300 font-semibold mb-3">✦ Configuration Diff Viewer (Side-by-Side — Before/After)</p>
      <div className="grid grid-cols-2 gap-2">
        {/* Before */}
        <div className="p-2 rounded-lg bg-slate-800/30 border border-slate-700/30">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider mb-1">Before (archived)</p>
          <div className="font-mono text-[9px] space-y-0.5">
            {CONFIG_DIFF.before.map((item, i) => <div key={i} className="text-slate-400">- {item}</div>)}
          </div>
          <p className="text-[8px] text-slate-600 mt-1">hash: 0xa3b2...c7d9</p>
        </div>
        {/* After */}
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
          <p className="text-[9px] text-emerald-500 uppercase tracking-wider mb-1">After (active)</p>
          <div className="font-mono text-[9px] space-y-0.5">
            {CONFIG_DIFF.after.map((item, i) => {
              const isNew = CONFIG_DIFF.added.includes(item);
              return <div key={i} className={isNew ? "text-emerald-300 font-bold" : "text-slate-400"}>{isNew ? "+ " : "  "}{item}</div>;
            })}
          </div>
          <p className="text-[8px] text-emerald-500 mt-1">hash: 0xf8e1...4b2c</p>
        </div>
      </div>
      <div className="flex items-center justify-between mt-2">
        <p className="text-[9px] text-emerald-300">✓ Rollback tested (swap → 8 services healthy). Diff sealed to Loom.</p>
        <button className="flex items-center gap-1 px-2 py-1 text-[9px] font-medium text-amber-300 rounded-md border border-amber-500/20 bg-amber-500/5 hover:bg-amber-500/10 transition-all"><RotateCcw className="w-3 h-3" /> Rollback (24h window)</button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function AdmFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.type === "slider") return null;
  const label = <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">{field.label}{field.required && <span className="text-red-400">*</span>}{field.aiAssist && <span className="text-[8px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">{field.aiAssist}</span>}</label>;
  if (field.type === "select") return <div>{label}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.15)] rounded-lg focus:outline-none focus:border-purple-400/40">{field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}</select></div>;
  if (field.type === "radio") return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-purple-500/20 border-purple-400/40 text-purple-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(124,58,237,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>;
  if (field.type === "textarea") return <div>{label}<textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.15)] rounded-lg focus:outline-none focus:border-purple-400/40 resize-y whitespace-pre-line" /></div>;
  if (field.type === "toggle") { const current = value || field.options?.[0]; return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(124,58,237,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>; }
  return <div>{label}<input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(124,58,237,0.15)] rounded-lg focus:outline-none focus:border-purple-400/40" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BANNER + DOWNSTREAM + SETTLEMENT + CLOSURE
// ═══════════════════════════════════════════════════════════════════════════════
function AmendmentSealedBanner() {
  return <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap"><div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-300" /></div><div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white">Constitutional Amendment Sealed — A5 Expansion (Immutable)</h3><p className="text-[10px] text-slate-400 mt-0.5">autonomous_collateral_liquidation added to forbidden list. 3 portals affected. 30-day notice completed. Multisig 3/5 signed. WASM deployed. Loom sealed. 247 tenants notified.</p></div><div className="text-right"><p className="text-[8px] text-slate-500 uppercase tracking-wider">Loom Hash</p><p className="text-[11px] font-mono text-purple-300">0xd4a9...e1f7</p></div></div>;
}
function AdmDownstreamTracker() {
  return <div className="p-4 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Downstream Phase Progression<span className="text-[9px] text-slate-500 font-normal">§3.6 → §3.5.9 → §3.5.5 → G7</span></h3><div className="space-y-2">{ADM_DOWNSTREAM_PHASES.map((p, i) => { const Icon = p.icon; const sc = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : p.status === "active" ? "text-purple-300 bg-purple-500/10 border-purple-500/30" : "text-slate-400 bg-slate-500/5 border-slate-500/15"; return <div key={p.phase} className="flex items-stretch gap-2"><div className="flex flex-col items-center"><div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${sc}`}><Icon className="w-4 h-4" /></div>{i < ADM_DOWNSTREAM_PHASES.length - 1 && <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />}</div><div className="flex-1 p-2.5 rounded-lg border border-[rgba(124,58,237,0.08)] bg-[rgba(2,6,23,0.4)] mb-2"><div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span><span className="text-[11px] font-semibold text-white">{p.name}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold capitalize ${sc} border`}>{p.status}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span></div><p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p></div></div>; })}</div></div>;
}
function AdmSettlementSummaryCard() {
  const s = ADM_SETTLEMENT_SUMMARY; const rows = [
    { label: "Amendment", value: s.amendment }, { label: "Layer", value: s.layer }, { label: "Portals Affected", value: s.portalsAffected }, { label: "Trades in Pipeline", value: s.tradesInPipeline }, { label: "WASM Modules", value: s.wasmModules }, { label: "Previous WASM", value: s.previousWasm }, { label: "Public Notice", value: s.publicNotice }, { label: "Multisig", value: s.multisigSignatures }, { label: "Deployment", value: s.deployment }, { label: "Enforcement", value: s.enforcementVerified }, { label: "Rollback Tested", value: s.rollbackTested }, { label: "Total Timeline", value: s.totalTimeline }, { label: "Loom Seal", value: s.loomSealHash }, { label: "Tenants Notified", value: s.tenantsNotified }, { label: "Public Verify", value: s.publicVerifyEndpoint },
  ];
  return <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-300" />Constitutional Amendment Summary<span className="text-[9px] text-slate-500 font-normal ml-1">§3.6 · L0 Immutable</span></h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">{rows.map(r => <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]"><span className="text-slate-400 shrink-0">{r.label}</span><span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span></div>)}</div></div>;
}
function AdmClosureCard() {
  return <div className="p-4 rounded-xl border border-[rgba(124,58,237,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Closure Conditions (Constitutional Seal)<span className="text-[9px] text-slate-500 font-normal ml-1">L0 + G7 — all 7</span></h3><div className="space-y-1.5">{ADM_CLOSURE_CONDITIONS.map((c, i) => <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(124,58,237,0.06)]"><div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" /><span className="text-[10px] text-slate-300 flex-1">{c.name}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span></div>)}</div><p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(124,58,237,0.06)]">Constitutional amendment sealed on Loom. Immutable. Permanent. Requires new amendment (30-day notice + 3/5 multisig) to reverse.</p></div>;
}
