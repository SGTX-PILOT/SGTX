"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #12 — MP Workflow (FINAL WORKFLOW — completes ALL 12 PORTALS!)
// Creative: Lead pipeline + attribution flow + webhook delivery + API key lifecycle + sandbox checklist + agreement comparison
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, CheckCircle2,
} from "lucide-react";
import {
  MP_WORKFLOW_STEPS, MP_DOWNSTREAM_PHASES, MP_VALIDATION_GATES,
  MP_SETTLEMENT_SUMMARY, MP_CLOSURE_CONDITIONS,
  LEAD_PIPELINE, ATTRIBUTION_FLOW, WEBHOOK_FLOW,
} from "@/lib/sgtx/landing/mp-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function MpPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = MP_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / MP_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => { setCompletedSteps(prev => new Set(prev).add(activeStep)); if (activeStep < MP_WORKFLOW_STEPS.length - 1) setActiveStep(activeStep + 1); };
  const handlePrev = () => { if (activeStep > 0) setActiveStep(activeStep - 1); };
  const handleSubmit = () => { setWizardState("submitting"); setTimeout(() => setWizardState("validating"), 1200); setTimeout(() => setWizardState("completed"), 3500); };
  const reset = () => { setActiveStep(0); setCompletedSteps(new Set()); setWizardState("filling"); setFormValues({}); };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading kicker="§16.8.6.12 · Portal #12 — MP Workflow (FINAL WORKFLOW — completes ALL 12 PORTALS!)" title="Marketplace Partner Workflow — Lead to Revenue Journey"
          subtitle="Lead submission → qualification tracking → attribution verification → dispute (if any) → webhook config → API keys → sandbox testing → agreement renewal → revenue settlement." />
        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button onClick={() => setShowFullWorkflow(!showFullWorkflow)} className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-cyan-500/30" style={{ background: 'linear-gradient(135deg, #06b6d4, #c026d3)' }}>
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">Creative: lead pipeline, attribution flow, webhook delivery, API key lifecycle, sandbox checklist, agreement comparison.</span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">The 9 steps of the Marketplace Partner lead-to-revenue workflow — each with creative visualizations:</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {MP_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; return (
                <motion.div key={s.id} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.03 }} className="p-3 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)]">
                  <div className="flex items-center gap-2 mb-1.5"><div className="w-7 h-7 rounded-md bg-cyan-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-cyan-300" /></div><span className="text-[9px] font-mono text-slate-500">§{s.number}</span></div>
                  <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name.split("(")[0].trim()}</h4>
                  {s.creativeFeature && <p className="text-[8px] text-cyan-400 font-medium mb-1">✦ {s.creativeFeature.split("(")[0].trim()}</p>}
                  <p className="text-[8px] text-slate-500">{s.specRef}</p>
                </motion.div>); })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div key="mp-wf" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.4 }} className="overflow-hidden">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden"><motion.div className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-fuchsia-500" initial={{ width: 0 }} animate={{ width: `${progress}%` }} transition={{ duration: 0.5 }} /></div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{MP_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>
              <AnimatePresence>
                {wizardState === "filling" && (<motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><MpWizardStepView activeStep={activeStep} setActiveStep={setActiveStep} completedSteps={completedSteps} currentStep={currentStep} formValues={formValues} setFormValues={setFormValues} handleNext={handleNext} handlePrev={handlePrev} handleSubmit={handleSubmit} /></motion.div>)}
                {wizardState === "submitting" && (<motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center"><Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" /><h3 className="text-sm font-semibold text-white mb-1">Settling revenue + sealing Loom…</h3><p className="text-[10px] text-slate-400">ISO 20022 payment + attribution verification + Loom closure…</p></motion.div>)}
                {wizardState === "validating" && (<motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                  <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2"><Shield className="w-4 h-4" /> MP Revenue Settlement Validation (8 gates)</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">{MP_VALIDATION_GATES.map((g, i) => (<motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.1 }} className={`p-2.5 rounded-lg border ${g.status === "pass" ? "bg-emerald-500/5 border-emerald-500/15" : "bg-amber-500/5 border-amber-500/15"}`}><div className="flex items-center gap-1.5 mb-1">{g.status === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Shield className="w-3.5 h-3.5 text-amber-400" />}<span className={`text-[10px] font-mono font-bold ${g.status === "pass" ? "text-emerald-300" : "text-amber-300"}`}>{g.gate}</span></div><p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p><p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p></motion.div>))}</div>
                  <p className="text-[10px] text-emerald-300 mt-3 font-semibold">✓ Revenue $22.75 (15% of $151.34) settled. Attribution verified. All 8 gates passed. Loom sealed.</p>
                </motion.div>)}
                {wizardState === "completed" && (<motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                  <RevenueSettledBanner /><MpDownstreamTracker /><MpSettlementSummaryCard /><MpClosureCard />
                  <div className="flex items-center justify-center pt-2"><button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(6,182,212,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"><RotateCcw className="w-3.5 h-3.5" /> Start New Lead</button></div>
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
function MpWizardStepView({ activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues, handleNext, handlePrev, handleSubmit }: any) {
  const isLast = activeStep === MP_WORKFLOW_STEPS.length - 1;
  return (
    <div className="rounded-2xl border border-[rgba(6,182,212,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(6,182,212,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {MP_WORKFLOW_STEPS.map((s, i) => { const Icon = s.icon; const isActive = i === activeStep; const isComplete = completedSteps.has(i); return (
            <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "text-slate-300 hover:bg-[rgba(6,182,212,0.06)] hover:text-white border-transparent"}`}>
              <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-700/50 text-slate-500"}`}>{isComplete ? <Check className="w-3 h-3" /> : s.number}</div>
              <Icon className="w-3.5 h-3.5 shrink-0" /><span className="flex-1 truncate text-[10px]">{s.name.split("(")[0].trim()}</span>
            </button>); })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.1)] flex items-center gap-1.5"><Database className="w-3 h-3 text-emerald-400 animate-pulse" /><span className="text-[9px] text-slate-300">Auto-saved 2s ago</span></div>
        </aside>
        <div className="flex-1 p-4 lg:p-5">
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(6,182,212,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 flex items-center justify-center shrink-0"><currentStep.icon className="w-5 h-5 text-cyan-300" /></div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>{currentStep.governorGate && <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>}</div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
              {currentStep.creativeFeature && <span className="inline-block mt-1 text-[9px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-300 font-medium">✦ {currentStep.creativeFeature}</span>}
            </div>
          </div>
          {currentStep.aiSuggestion && (<div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-950/15 mb-4 flex items-start gap-2"><div className="w-6 h-6 rounded-md bg-cyan-500/20 flex items-center justify-center shrink-0"><span className="text-[9px] font-bold text-cyan-300">AI</span></div><div className="flex-1"><p className="text-[9px] text-cyan-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2 Suggestion</p><p className="text-[10px] text-slate-300 leading-relaxed whitespace-pre-line">{currentStep.aiSuggestion}</p></div></div>)}
          {/* Creative SVG per step */}
          {activeStep === 0 && <LeadPipelineViz />}
          {activeStep === 2 && <AttributionFlowViz />}
          {activeStep === 4 && <WebhookDeliveryFlowViz />}
          {activeStep === 5 && <ApiKeyLifecycleViz />}
          {activeStep === 6 && <SandboxChecklistViz />}
          {activeStep === 7 && <AgreementComparisonViz />}
          {/* Form fields */}
          <div className="space-y-3">{currentStep.fields.map((field: any) => (<MpFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />))}</div>
          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(6,182,212,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"><ChevronLeft className="w-3.5 h-3.5" /> Previous</button>
            <div className="flex items-center gap-1">{MP_WORKFLOW_STEPS.map((_, i) => <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-cyan-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Step ${i + 1}`} />)}</div>
            {isLast ? <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all"><Shield className="w-3.5 h-3.5" /> Settle Revenue — G6</button> : <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-cyan-500 to-fuchsia-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">Next <ChevronRight className="w-3.5 h-3.5" /></button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 1: Lead Pipeline (step 1)
// ═══════════════════════════════════════════════════════════════════════════════
function LeadPipelineViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ Lead Submission Pipeline (7 stages, 6 complete)</p>
      <div className="flex items-center justify-between gap-1 overflow-x-auto">
        {LEAD_PIPELINE.map((s, i) => {
          const color = s.status === "complete" ? "#10b981" : "#f59e0b";
          return (
            <div key={i} className="flex flex-col items-center gap-1 shrink-0 min-w-[60px]">
              <div className="w-8 h-8 rounded-full flex items-center justify-center border-2" style={{ borderColor: color, background: `${color}15` }}>
                {s.status === "complete" ? <Check className="w-4 h-4" style={{ color }} /> : <span className="text-[8px]" style={{ color }}>⏳</span>}
              </div>
              <p className="text-[8px] text-slate-300 text-center leading-tight">{s.stage}</p>
              {i < LEAD_PIPELINE.length - 1 && <div className="absolute" />}
            </div>
          );
        })}
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ 6/7 stages complete. Lead converted to USTN. Revenue pending (trade in execution).</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 2: Attribution Flow (step 3)
// ═══════════════════════════════════════════════════════════════════════════════
function AttributionFlowViz() {
  const nodeColor = (t: string) => t === "source" ? "#06b6d4" : t === "action" ? "#8b5cf6" : t === "platform" ? "#3b82f6" : t === "verify" ? "#f59e0b" : "#10b981";
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ Attribution Flow (Marketplace → SGTX → Revenue)</p>
      <div className="relative w-full h-20 bg-[rgba(2,6,23,0.4)] rounded-lg overflow-hidden">
        <svg className="w-full h-full" viewBox="0 0 100 40" preserveAspectRatio="xMidYMid meet">
          {/* Connecting lines */}
          {ATTRIBUTION_FLOW.slice(0, -1).map((n, i) => {
            const next = ATTRIBUTION_FLOW[i + 1];
            return <line key={i} x1={n.x + 8} y1={n.y} x2={next.x - 3} y2={next.y} stroke="#475569" strokeWidth="0.3" strokeDasharray="0.5,0.3" opacity="0.4" />;
          })}
          {/* Nodes */}
          {ATTRIBUTION_FLOW.map((n, i) => {
            const color = nodeColor(n.type);
            return <g key={i}>
              <circle cx={n.x} cy={n.y} r="3" fill={color} opacity="0.85" />
              <text x={n.x} y={n.y - 5} textAnchor="middle" fill={color} fontSize="2" fontWeight="bold">{n.label}</text>
              <text x={n.x} y={n.y + 7} textAnchor="middle" fill="#64748b" fontSize="1.5" opacity="0.6">{n.node}</text>
            </g>;
          })}
        </svg>
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ Attribution verified: referral cookie + IP whitelist + timestamp confirmed. Revenue $22.75 (15%).</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 3: Webhook Delivery Flow (step 5)
// ═══════════════════════════════════════════════════════════════════════════════
function WebhookDeliveryFlowViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ Webhook Delivery Flow (6 events, 4 delivered, 2 failed)</p>
      <div className="space-y-1.5">
        {WEBHOOK_FLOW.map((w, i) => {
          const delivered = w.status === "delivered";
          const color = delivered ? "#10b981" : "#ef4444";
          return (
            <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.06 }}
              className="flex items-center gap-2 p-2 rounded-lg" style={{ background: `${color}08`, border: `1px solid ${color}20` }}>
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] text-white font-mono">{w.event}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {delivered ? <span className="text-[9px] text-emerald-300">✓ {w.latency}ms</span> : <span className="text-[9px] text-rose-300">✗ timeout (5s)</span>}
                {!delivered && <span className="text-[8px] text-amber-300">retry ×3</span>}
              </div>
            </motion.div>
          );
        })}
      </div>
      <p className="text-[9px] text-rose-300 mt-2">⚠ 2/6 failed (timeout). Auto-retry: 3 attempts (1s, 2s, 4s). Endpoint degraded — check server.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 4: API Key Lifecycle (step 6)
// ═══════════════════════════════════════════════════════════════════════════════
function ApiKeyLifecycleViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ API Key Lifecycle (Production + Sandbox)</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
          <p className="text-[9px] text-emerald-400 uppercase font-bold mb-1">Production</p>
          <p className="text-[9px] text-slate-300 font-mono">MP-PROD-2026-0042</p>
          <div className="mt-1.5 space-y-0.5 text-[8px] text-slate-400">
            <p>Ed25519 signed ✓</p>
            <p>5000/day (1240 today, 24.8%)</p>
            <p>Scopes: lead, webhook, revenue</p>
            <p>Rotation: 90 days</p>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
          <p className="text-[9px] text-amber-400 uppercase font-bold mb-1">Sandbox</p>
          <p className="text-[9px] text-slate-300 font-mono">MP-SANDBOX-2026-0042</p>
          <div className="mt-1.5 space-y-0.5 text-[8px] text-slate-400">
            <p>Synthetic data only</p>
            <p>1000/day (45 today, 4.5%)</p>
            <p>Scopes: lead (synth), webhook:test</p>
            <p>No real trades</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 5: Sandbox Checklist (step 7)
// ═══════════════════════════════════════════════════════════════════════════════
function SandboxChecklistViz() {
  const tests = [
    { name: "Lead submit (synthetic)", passed: true },
    { name: "Webhook receive", passed: true },
    { name: "Revenue calc (mock)", passed: true },
    { name: "API auth (Ed25519)", passed: true },
    { name: "IP whitelist check", passed: true },
  ];
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ Sandbox Testing Checklist (5/5 passed — ready for production)</p>
      <div className="space-y-1.5">
        {tests.map((t, i) => (
          <motion.div key={i} initial={{ opacity: 0, x: -10 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.1 }}
            className="flex items-center gap-2 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            <p className="text-[10px] text-slate-300">{t.name}</p>
            <span className="text-[8px] text-emerald-300 ml-auto">✓ PASSED</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ✦ CREATIVE 6: Agreement Comparison (step 8)
// ═══════════════════════════════════════════════════════════════════════════════
function AgreementComparisonViz() {
  return (
    <div className="mb-4 p-4 rounded-xl border border-cyan-500/15 bg-cyan-950/10">
      <p className="text-[10px] text-cyan-300 font-semibold mb-3">✦ Agreement Terms Comparison (Current vs Proposed)</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="p-2 rounded-lg bg-slate-700/20 border border-slate-700/30">
          <p className="text-[9px] text-slate-500 uppercase font-bold mb-1">Current (expires Oct 19)</p>
          <div className="space-y-0.5 text-[8px] text-slate-400">
            <p>Revenue: 15%</p>
            <p>API: v1 (REST)</p>
            <p>Webhooks: 6 events</p>
            <p>Sandbox: None</p>
            <p>Key rotation: Manual</p>
          </div>
        </div>
        <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/15">
          <p className="text-[9px] text-emerald-400 uppercase font-bold mb-1">Proposed (renewed)</p>
          <div className="space-y-0.5 text-[8px]">
            <p className="text-slate-300">Revenue: 15% (no change)</p>
            <p className="text-emerald-300">API: v2 (GraphQL) +</p>
            <p className="text-emerald-300">Webhooks: 14 events (+8) +</p>
            <p className="text-emerald-300">Sandbox: Synthetic data +</p>
            <p className="text-emerald-300">Key rotation: 90-day auto +</p>
          </div>
        </div>
      </div>
      <p className="text-[9px] text-emerald-300 mt-2">✓ Revenue share maintained (15%). 4 improvements added. QES signed.</p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function MpFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  if (field.type === "slider") return null;
  const label = <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">{field.label}{field.required && <span className="text-red-400">*</span>}{field.aiAssist && <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono">{field.aiAssist}</span>}</label>;
  if (field.type === "select") return <div>{label}<select value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40">{field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}</select></div>;
  if (field.type === "radio") return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(6,182,212,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>;
  if (field.type === "textarea") return <div>{label}<textarea value={value} onChange={e => onChange(e.target.value)} rows={3} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40 resize-y whitespace-pre-line" /></div>;
  if (field.type === "toggle") { const current = value || field.options?.[0]; return <div>{label}<div className="flex flex-wrap gap-1.5">{field.options?.map((o: string) => <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(6,182,212,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>)}</div></div>; }
  return <div>{label}<input type="text" value={value} onChange={e => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40" /></div>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// BANNER + DOWNSTREAM + SETTLEMENT + CLOSURE
// ═══════════════════════════════════════════════════════════════════════════════
function RevenueSettledBanner() {
  return <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap"><div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-emerald-300" /></div><div className="flex-1 min-w-0"><h3 className="text-sm font-semibold text-white">Revenue Settled — $22.75 (15% of $151.34 SGTX Fee)</h3><p className="text-[10px] text-slate-400 mt-0.5">Attribution verified (referral cookie + IP + timestamp). ISO 20022 settled. Reconciliation 100%. Loom sealed. YTD: $12.6K (42 leads).</p></div><div className="text-right"><p className="text-[8px] text-slate-500 uppercase tracking-wider">Lead ID</p><p className="text-[11px] font-mono text-cyan-300">{MP_SETTLEMENT_SUMMARY.leadId}</p></div></div>;
}
function MpDownstreamTracker() {
  return <div className="p-4 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Downstream Phase Progression<span className="text-[9px] text-slate-500 font-normal">§16.8.6.12 → §13</span></h3><div className="space-y-2">{MP_DOWNSTREAM_PHASES.map((p, i) => { const Icon = p.icon; const sc = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" : p.status === "active" ? "text-cyan-300 bg-cyan-500/10 border-cyan-500/30" : "text-slate-400 bg-slate-500/5 border-slate-500/15"; return <div key={p.phase} className="flex items-stretch gap-2"><div className="flex flex-col items-center"><div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${sc}`}><Icon className="w-4 h-4" /></div>{i < MP_DOWNSTREAM_PHASES.length - 1 && <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />}</div><div className="flex-1 p-2.5 rounded-lg border border-[rgba(6,182,212,0.08)] bg-[rgba(2,6,23,0.4)] mb-2"><div className="flex items-center gap-2 mb-1 flex-wrap"><span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span><span className="text-[11px] font-semibold text-white">{p.name}</span><span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold capitalize ${sc} border`}>{p.status}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span></div><p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p></div></div>; })}</div></div>;
}
function MpSettlementSummaryCard() {
  const s = MP_SETTLEMENT_SUMMARY; const rows = [
    { label: "Lead ID", value: s.leadId }, { label: "USTN", value: s.ustn }, { label: "Buyer", value: s.buyer }, { label: "Commodity", value: s.commodity }, { label: "Route", value: s.route }, { label: "SGTX Fee", value: s.sgtxFee }, { label: "Revenue Share", value: s.revenueShare }, { label: "Revenue Received", value: s.revenueReceived }, { label: "Attribution Method", value: s.attributionMethod }, { label: "Settlement", value: s.settlementMethod }, { label: "Reconciliation", value: s.reconciliation }, { label: "YTD Revenue", value: s.ytdRevenue }, { label: "Agreement", value: s.agreementStatus }, { label: "Webhook Health", value: s.webhookHealth }, { label: "API Keys", value: s.apiKeys }, { label: "Sandbox Tests", value: s.sandboxTests }, { label: "Closure Hash", value: s.closureHash },
  ];
  return <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-emerald-300" />Marketplace Partner Settlement Summary<span className="text-[9px] text-slate-500 font-normal ml-1">§16.8.6.12 · §13</span></h3><div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">{rows.map(r => <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]"><span className="text-slate-400 shrink-0">{r.label}</span><span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span></div>)}</div></div>;
}
function MpClosureCard() {
  return <div className="p-4 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]"><h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">Closure Conditions (Revenue Settlement)<span className="text-[9px] text-slate-500 font-normal ml-1">G6 + G7 — all 7</span></h3><div className="space-y-1.5">{MP_CLOSURE_CONDITIONS.map((c, i) => <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]"><div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" /><span className="text-[10px] text-slate-300 flex-1">{c.name}</span><span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span></div>)}</div><p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(6,182,212,0.06)]">Revenue settlement complete when all 7 conditions true. Attribution verified. ISO 20022 settled. Loom sealed.</p></div>;
}
