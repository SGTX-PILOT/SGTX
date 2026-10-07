"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #3 — LSP Workflow (9-step: RFQ → Clarification → Dispatch →
// Driver Pairing → Pickup → In-Transit → Port Delivery → Settlement)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, DollarSign,
} from "lucide-react";
import {
  LSP_WORKFLOW_STEPS, LSP_DOWNSTREAM_PHASES, LSP_VALIDATION_GATES,
  LSP_SETTLEMENT_SUMMARY, LSP_CLOSURE_CONDITIONS,
} from "@/lib/sgtx/landing/lsp-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "validating" | "completed";

export function LspPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = LSP_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / LSP_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(activeStep));
    if (activeStep < LSP_WORKFLOW_STEPS.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleSubmit = () => {
    setWizardState("submitting");
    setTimeout(() => setWizardState("validating"), 1200);
    setTimeout(() => setWizardState("completed"), 3500);
  };

  const reset = () => {
    setActiveStep(0);
    setCompletedSteps(new Set());
    setWizardState("filling");
    setFormValues({});
  };

  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.8.6.3 · Portal #3 — LSP Workflow (Logistics Operations)"
          title="LSP Workflow — 9-Step Logistics Journey"
          subtitle="RFQ response → clarification Q&A → quote awarded → dispatch planning (VRP) → driver pairing → pickup → in-transit → port delivery → settlement. Governor G5 validates milestones."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullWorkflow(!showFullWorkflow)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-cyan-500/30"
            style={{ background: 'linear-gradient(135deg, #06b6d4, #10b981)' }}
          >
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Walk through all 9 steps → submit → G5 validation → pickup confirmed → downstream: in-transit, port delivery, settlement, closure.
          </span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">
              The 9 steps of the LSP logistics workflow, each with form fields, AI assistance, and Governor gate:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-2">
              {LSP_WORKFLOW_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.03 }}
                    className="p-3 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-md bg-cyan-500/15 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-cyan-300" />
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">§{s.number}</span>
                    </div>
                    <h4 className="text-[10px] font-semibold text-white leading-tight mb-1">{s.name}</h4>
                    <p className="text-[8px] text-slate-500 mb-1">{s.specRef}</p>
                    {s.governorGate && (
                      <span className="text-[7px] px-1 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono break-all">
                        {s.governorGate}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence>
          {showFullWorkflow && (
            <motion.div
              key="lsp-workflow"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.4 }}
              className="overflow-hidden"
            >
              {/* Progress bar */}
              <div className="mb-4 flex items-center gap-3">
                <div className="flex-1 h-2 rounded-full bg-slate-800 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-emerald-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{LSP_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>

              <AnimatePresence>
                {wizardState === "filling" && (
                  <motion.div key="wizard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    <LspWizardStepView
                      activeStep={activeStep}
                      setActiveStep={setActiveStep}
                      completedSteps={completedSteps}
                      currentStep={currentStep}
                      formValues={formValues}
                      setFormValues={setFormValues}
                      handleNext={handleNext}
                      handlePrev={handlePrev}
                      handleSubmit={handleSubmit}
                    />
                  </motion.div>
                )}

                {wizardState === "submitting" && (
                  <motion.div key="submitting" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} className="p-12 text-center">
                    <Loader2 className="w-10 h-10 text-cyan-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-sm font-semibold text-white mb-1">Confirming pickup milestone…</h3>
                    <p className="text-[10px] text-slate-400">Validating 248 SSCC scans, GPS geofence arrival, driver identity…</p>
                  </motion.div>
                )}

                {wizardState === "validating" && (
                  <motion.div key="validating" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10">
                    <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Governor G5 — Pickup Milestone Validation
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {LSP_VALIDATION_GATES.map((g, i) => (
                        <motion.div key={g.gate} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.12 }} className={`p-2.5 rounded-lg border ${g.status === "pass" ? "bg-emerald-500/5 border-emerald-500/15" : g.status === "pending" ? "bg-amber-500/5 border-amber-500/15" : "bg-slate-700/20 border-slate-600/20"}`}>
                          <div className="flex items-center gap-1.5 mb-1">
                            {g.status === "pass" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : g.status === "pending" ? <Loader2 className="w-3.5 h-3.5 text-amber-400 animate-spin" /> : <span className="w-3.5 h-3.5 text-slate-500 text-[10px] text-center">—</span>}
                            <span className={`text-[10px] font-mono font-bold ${g.status === "pass" ? "text-emerald-300" : g.status === "pending" ? "text-amber-300" : "text-slate-500"}`}>{g.gate}</span>
                          </div>
                          <p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p>
                          <p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {wizardState === "completed" && (
                  <motion.div key="completed" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
                    <PickupConfirmedBanner />
                    <LspDownstreamTracker />
                    <SettlementSummaryCard />
                    <LspClosureCard />
                    <div className="flex items-center justify-center pt-2">
                      <button onClick={reset} className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(6,182,212,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors">
                        <RotateCcw className="w-3.5 h-3.5" /> Start New Dispatch
                      </button>
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
// WIZARD STEP VIEW
// ═══════════════════════════════════════════════════════════════════════════════
function LspWizardStepView({
  activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues,
  handleNext, handlePrev, handleSubmit,
}: any) {
  const isLast = activeStep === LSP_WORKFLOW_STEPS.length - 1;

  return (
    <div className="rounded-2xl border border-[rgba(6,182,212,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        {/* Step navigator */}
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(6,182,212,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[8px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">9 Steps</p>
          {LSP_WORKFLOW_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === activeStep;
            const isComplete = completedSteps.has(i);
            return (
              <button key={s.id} onClick={() => setActiveStep(i)} className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${isActive ? "bg-cyan-500/15 text-cyan-200 border-cyan-400/30" : "text-slate-300 hover:bg-[rgba(6,182,212,0.06)] hover:text-white border-transparent"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-cyan-500/20 text-cyan-300" : "bg-slate-700/50 text-slate-500"}`}>
                  {isComplete ? <Check className="w-3 h-3" /> : s.number}
                </div>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate text-[10px]">{s.name}</span>
              </button>
            );
          })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.1)] flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[9px] text-slate-300">Auto-saved 2s ago</span>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-4 lg:p-5">
          {/* Step header */}
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(6,182,212,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-emerald-500/20 flex items-center justify-center shrink-0">
              <currentStep.icon className="w-5 h-5 text-cyan-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 9 · {currentStep.specRef}</span>
                {currentStep.governorGate && (
                  <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">{currentStep.governorGate}</span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
            </div>
          </div>

          {/* AI Suggestion */}
          {currentStep.aiSuggestion && (
            <div className="p-3 rounded-lg border border-cyan-500/20 bg-cyan-950/15 mb-4 flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-cyan-500/20 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-cyan-300">AI</span>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-cyan-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2 Suggestion</p>
                <p className="text-[10px] text-slate-300 leading-relaxed">{currentStep.aiSuggestion}</p>
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3">
            {currentStep.fields.map((field: any) => (
              <LspFormField key={field.key} field={field} value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""} onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))} />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(6,182,212,0.08)]">
            <button onClick={handlePrev} disabled={activeStep === 0} className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(6,182,212,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed">
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>
            <div className="flex items-center gap-1">
              {LSP_WORKFLOW_STEPS.map((_, i) => (
                <button key={i} onClick={() => setActiveStep(i)} className={`w-1.5 h-1.5 rounded-full transition-all ${i === activeStep ? "bg-cyan-400 w-4" : completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"}`} aria-label={`Go to step ${i + 1}`} />
              ))}
            </div>
            {isLast ? (
              <button onClick={handleSubmit} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">
                <Shield className="w-3.5 h-3.5" /> Confirm Pickup — Run G5
              </button>
            ) : (
              <button onClick={handleNext} className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-cyan-500 to-emerald-500 hover:shadow-lg hover:shadow-cyan-500/30 transition-all">
                Next <ChevronRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FORM FIELD
// ═══════════════════════════════════════════════════════════════════════════════
function LspFormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  const label = (
    <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">
      {field.label}
      {field.required && <span className="text-red-400">*</span>}
      {field.aiAssist && (
        <span className="text-[8px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-300 font-mono">{field.aiAssist}</span>
      )}
    </label>
  );

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40">
          {field.options?.map((o: string) => <option key={o} value={o} className="bg-slate-900">{o}</option>)}
        </select>
      </div>
    );
  }

  if (field.type === "radio") {
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map((o: string) => (
            <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${value === o ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(6,182,212,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea value={value} onChange={(e) => onChange(e.target.value)} rows={3} placeholder={field.placeholder} className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40 resize-y" />
      </div>
    );
  }

  if (field.type === "toggle") {
    const current = value || field.options?.[0];
    return (
      <div>
        {label}
        <div className="flex flex-wrap gap-1.5">
          {field.options?.map((o: string) => (
            <button key={o} onClick={() => onChange(o)} className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${current === o ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200" : "bg-[rgba(15,23,42,0.5)] border-[rgba(6,182,212,0.1)] text-slate-400 hover:text-slate-200"}`}>{o}</button>
          ))}
        </div>
      </div>
    );
  }

  // text / number
  return (
    <div>
      {label}
      <input type={field.type === "number" ? "number" : "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(6,182,212,0.15)] rounded-lg focus:outline-none focus:border-cyan-400/40" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PICKUP CONFIRMED BANNER
// ═══════════════════════════════════════════════════════════════════════════════
function PickupConfirmedBanner() {
  return (
    <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap">
      <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Check className="w-5 h-5 text-emerald-300" />
      </div>
      <div className="flex-1 min-w-0">
        <h3 className="text-sm font-semibold text-white">Pickup Milestone Confirmed — G5 Validation Passed</h3>
        <p className="text-[10px] text-slate-400 mt-0.5">All G5 gates passed (G5U1–G5U5). 248 SSCC pallets scanned. GPS geofence arrival confirmed. Per-shipment fee payment authorized to seller.</p>
      </div>
      <div className="text-right">
        <p className="text-[8px] text-slate-500 uppercase tracking-wider">USTN</p>
        <p className="text-[11px] font-mono text-cyan-300">{LSP_SETTLEMENT_SUMMARY.ustn}</p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// LSP DOWNSTREAM PHASES TRACKER
// ═══════════════════════════════════════════════════════════════════════════════
function LspDownstreamTracker() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        Downstream Phase Progression
        <span className="text-[9px] text-slate-500 font-normal">§16.8.6.3 → §12 → §13 → §14</span>
      </h3>
      <div className="space-y-2">
        {LSP_DOWNSTREAM_PHASES.map((p, i) => {
          const Icon = p.icon;
          const statusColor = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
            : p.status === "active" ? "text-cyan-300 bg-cyan-500/10 border-cyan-500/30"
            : p.status === "blocked" ? "text-rose-300 bg-rose-500/10 border-rose-500/20"
            : "text-slate-400 bg-slate-500/5 border-slate-500/15";
          return (
            <div key={p.phase} className="flex items-stretch gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {i < LSP_DOWNSTREAM_PHASES.length - 1 && (
                  <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />
                )}
              </div>
              <div className="flex-1 p-2.5 rounded-lg border border-[rgba(6,182,212,0.08)] bg-[rgba(2,6,23,0.4)] mb-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span>
                  <span className="text-[11px] font-semibold text-white">{p.name}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold capitalize ${statusColor} border`}>{p.status}</span>
                  <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p>
                <p className="text-[8px] text-slate-500 mt-0.5">{p.specRef}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTLEMENT SUMMARY CARD
// ═══════════════════════════════════════════════════════════════════════════════
function SettlementSummaryCard() {
  const s = LSP_SETTLEMENT_SUMMARY;
  const rows = [
    { label: "USTN", value: s.ustn },
    { label: "Route", value: s.route },
    { label: "Equipment", value: s.equipment },
    { label: "Driver", value: s.driver },
    { label: "Distance", value: s.distance },
    { label: "Duration", value: s.duration },
    { label: "Pickup Time", value: s.pickupTime },
    { label: "Gate-Out Time", value: s.gateOutTime },
    { label: "Pallets Scanned", value: s.palletsScanned },
    { label: "Logistics Fee", value: s.logisticsFee },
    { label: "SLA Credit", value: s.slaCredit },
    { label: "Net Received", value: s.netReceived },
    { label: "Reconciliation", value: s.reconciliation },
    { label: "Settlement Method", value: s.settlementMethod },
    { label: "Closure Hash", value: s.closureHash },
  ];
  return (
    <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <DollarSign className="w-4 h-4 text-emerald-300" />
        Settlement Summary — Logistics Fee
        <span className="text-[9px] text-slate-500 font-normal ml-1">§13 · ISO 20022</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
        {rows.map(r => (
          <div key={r.label} className="flex items-start justify-between gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]">
            <span className="text-slate-400 shrink-0">{r.label}</span>
            <span className="text-slate-200 text-right leading-relaxed font-mono text-[9px]">{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSURE CONDITIONS CARD
// ═══════════════════════════════════════════════════════════════════════════════
function LspClosureCard() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(6,182,212,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        Closure Conditions (Earned Closure)
        <span className="text-[9px] text-slate-500 font-normal ml-1">§5.10 · G7 — all 7 must be true</span>
      </h3>
      <div className="space-y-1.5">
        {LSP_CLOSURE_CONDITIONS.map((c, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(6,182,212,0.06)]">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" />
            <span className="text-[10px] text-slate-300 flex-1">{c.name}</span>
            <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(6,182,212,0.06)]">
        Closure is earned — never forced. All 7 conditions must evaluate true. The 26-category evidence package (LSP subset) is sealed and can be extended but never modified.
      </p>
    </div>
  );
}
