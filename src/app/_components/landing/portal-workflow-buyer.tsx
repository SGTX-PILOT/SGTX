"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Portal #1 — Trader Portal: Buyer Workflow (§6 — 13-Section Trade Request)
// + downstream phases: Quote → Negotiation → Contract → Fee/Lock → USTN →
//   Execution → Settlement → Closure
// ═══════════════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ChevronLeft, Check, Loader2, Shield,
  Database, Zap, RotateCcw, Lock,
} from "lucide-react";
import {
  BUYER_WORKFLOW_STEPS, DOWNSTREAM_PHASES, PRESREENING_GATES,
  FEE_BREAKDOWN, QUOTE_COMPARISON, CLOSURE_CONDITIONS,
} from "@/lib/sgtx/landing/buyer-workflow-data";
import { SectionHeading } from "./sections-foundation";

type WizardState = "filling" | "submitting" | "prescreening" | "submitted" | "quote-received";

export function BuyerPortalWorkflow() {
  const [activeStep, setActiveStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [wizardState, setWizardState] = useState<WizardState>("filling");
  const [showFullWorkflow, setShowFullWorkflow] = useState(false);
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const currentStep = BUYER_WORKFLOW_STEPS[activeStep];
  const progress = Math.round((completedSteps.size / BUYER_WORKFLOW_STEPS.length) * 100);

  const handleNext = () => {
    setCompletedSteps(prev => new Set(prev).add(activeStep));
    if (activeStep < BUYER_WORKFLOW_STEPS.length - 1) {
      setActiveStep(activeStep + 1);
    }
  };

  const handlePrev = () => {
    if (activeStep > 0) setActiveStep(activeStep - 1);
  };

  const handleSubmit = () => {
    setWizardState("submitting");
    setTimeout(() => setWizardState("prescreening"), 1200);
    setTimeout(() => setWizardState("submitted"), 3500);
    setTimeout(() => setWizardState("quote-received"), 5000);
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
          kicker="§6 · Portal #1 — Buyer Workflow (Phase 1 — Trade Initiation)"
          title="Buyer Workflow — 13-Section Trade Request Wizard"
          subtitle="A structured, machine-readable, regulation-aware execution graph. Every section is mandatory. Governor pre-screens G1U1–G1U8 on submit."
        />

        <div className="mt-4 mb-6 flex flex-wrap items-center gap-3">
          <button
            onClick={() => setShowFullWorkflow(!showFullWorkflow)}
            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            {showFullWorkflow ? <>Collapse Workflow</> : <><Zap className="w-3.5 h-3.5" /> Open Interactive Workflow</>}
          </button>
          <span className="text-[10px] text-slate-500">
            Walk through all 13 sections → submit → pre-screening → quote → contract → fee/lock → USTN → execution → settlement → closure.
          </span>
        </div>

        {!showFullWorkflow && (
          <div className="mt-6">
            <p className="text-[11px] text-slate-400 mb-3">
              The 13 sections of the buyer trade request (§6), each with form fields, AI assistance, and Governor gate:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
              {BUYER_WORKFLOW_STEPS.map((s, i) => {
                const Icon = s.icon;
                return (
                  <motion.div
                    key={s.id}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.03 }}
                    className="p-3 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)]"
                  >
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className="w-7 h-7 rounded-md bg-blue-500/15 flex items-center justify-center shrink-0">
                        <Icon className="w-3.5 h-3.5 text-blue-300" />
                      </div>
                      <span className="text-[9px] font-mono text-slate-500">§{s.number}</span>
                    </div>
                    <h4 className="text-[11px] font-semibold text-white leading-tight mb-1">{s.name}</h4>
                    <p className="text-[9px] text-slate-500 mb-1">{s.specRef}</p>
                    {s.governorGate && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono">
                        {s.governorGate}
                      </span>
                    )}
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}

        <AnimatePresence mode="wait">
          {showFullWorkflow && (
            <motion.div
              key="workflow"
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
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.5 }}
                  />
                </div>
                <span className="text-[10px] font-mono text-slate-400">{completedSteps.size}/{BUYER_WORKFLOW_STEPS.length} · {progress}%</span>
              </div>

              <AnimatePresence>
                {/* WIZARD — filling state */}
                {wizardState === "filling" && (
                  <motion.div
                    key="wizard"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <WizardStepView
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

                {/* SUBMITTING — spinner */}
                {wizardState === "submitting" && (
                  <motion.div
                    key="submitting"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-12 text-center"
                  >
                    <Loader2 className="w-10 h-10 text-blue-400 animate-spin mx-auto mb-4" />
                    <h3 className="text-sm font-semibold text-white mb-1">Submitting trade request…</h3>
                    <p className="text-[10px] text-slate-400">Sealing 13-section structured form with QES stamp…</p>
                  </motion.div>
                )}

                {/* PRE-SCREENING — G1U1–G1U8 */}
                {wizardState === "prescreening" && (
                  <motion.div
                    key="prescreening"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="p-5 rounded-xl border border-emerald-500/25 bg-emerald-950/10"
                  >
                    <h3 className="text-sm font-semibold text-emerald-200 mb-3 flex items-center gap-2">
                      <Shield className="w-4 h-4" />
                      Governor Pre-Screening — G1U1–G1U8
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                      {PRESREENING_GATES.map((g, i) => (
                        <motion.div
                          key={g.gate}
                          initial={{ opacity: 0, scale: 0.9 }}
                          animate={{ opacity: 1, scale: 1 }}
                          transition={{ delay: i * 0.15 }}
                          className="p-2.5 rounded-lg bg-emerald-500/5 border border-emerald-500/15"
                        >
                          <div className="flex items-center gap-1.5 mb-1">
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span className="text-[10px] font-mono font-bold text-emerald-300">{g.gate}</span>
                          </div>
                          <p className="text-[10px] text-white font-medium mb-0.5">{g.name}</p>
                          <p className="text-[9px] text-slate-400 leading-relaxed">{g.description}</p>
                        </motion.div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {/* SUBMITTED — request reference + downstream phases */}
                {(wizardState === "submitted" || wizardState === "quote-received") && (
                  <motion.div
                    key="submitted"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="space-y-4"
                  >
                    {/* Success banner */}
                    <div className="p-4 rounded-xl border border-emerald-500/25 bg-gradient-to-r from-emerald-950/20 to-[rgba(2,6,23,0.6)] flex items-center gap-3 flex-wrap">
                      <div className="w-9 h-9 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-white">Trade Request Submitted — Pre-Screening Passed</h3>
                        <p className="text-[10px] text-slate-400 mt-0.5">All 8 Governor gates (G1U1–G1U8) passed. Seller notified via Smart Inbox (priority 75).</p>
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] text-slate-500 uppercase tracking-wider">Request Reference</p>
                        <p className="text-[11px] font-mono text-blue-300">SGTX-EG-26-NH3T-0042-RQ</p>
                      </div>
                    </div>

                    {/* Quote received */}
                    {wizardState === "quote-received" && <QuoteReceivedCard />}

                    {/* Downstream phases tracker */}
                    <DownstreamPhasesTracker />

                    {/* Fee breakdown */}
                    <FeeBreakdownCard />

                    {/* Closure conditions */}
                    <ClosureConditionsCard />

                    {/* Reset */}
                    <div className="flex items-center justify-center pt-2">
                      <button
                        onClick={reset}
                        className="flex items-center gap-2 px-4 py-2 text-[11px] font-medium text-slate-300 rounded-full border border-[rgba(56,189,248,0.15)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Start New Trade Request
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
// WIZARD STEP VIEW — step navigator + form fields
// ═══════════════════════════════════════════════════════════════════════════════
function WizardStepView({
  activeStep, setActiveStep, completedSteps, currentStep, formValues, setFormValues,
  handleNext, handlePrev, handleSubmit,
}: any) {
  const isLast = activeStep === BUYER_WORKFLOW_STEPS.length - 1;

  return (
    <div className="rounded-2xl border border-[rgba(56,189,248,0.2)] bg-[rgba(2,6,23,0.9)] backdrop-blur-xl overflow-hidden shadow-2xl">
      <div className="flex">
        {/* Step navigator (left) */}
        <aside className="hidden md:flex flex-col w-48 lg:w-56 border-r border-[rgba(56,189,248,0.12)] bg-[rgba(2,6,23,0.6)] p-2 gap-0.5 max-h-[700px] overflow-y-auto">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider px-2 py-1.5 font-semibold">13 Sections</p>
          {BUYER_WORKFLOW_STEPS.map((s, i) => {
            const Icon = s.icon;
            const isActive = i === activeStep;
            const isComplete = completedSteps.has(i);
            return (
              <button
                key={s.id}
                onClick={() => setActiveStep(i)}
                className={`flex items-center gap-2 px-2.5 py-1.5 text-[11px] rounded-lg transition-all text-left border ${
                  isActive
                    ? "bg-blue-500/15 text-blue-200 border-blue-400/30"
                    : "text-slate-300 hover:bg-[rgba(59,130,246,0.06)] hover:text-white border-transparent"
                }`}
              >
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0 ${
                  isComplete ? "bg-emerald-500/20 text-emerald-300" : isActive ? "bg-blue-500/20 text-blue-300" : "bg-slate-700/50 text-slate-500"
                }`}>
                  {isComplete ? <Check className="w-3 h-3" /> : s.number}
                </div>
                <Icon className="w-3.5 h-3.5 shrink-0" />
                <span className="flex-1 truncate text-[10px]">{s.name}</span>
              </button>
            );
          })}
          <div className="mt-auto p-2 rounded-lg bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.1)] flex items-center gap-1.5">
            <Database className="w-3 h-3 text-emerald-400 animate-pulse" />
            <span className="text-[9px] text-slate-300">Auto-saved 2s ago</span>
          </div>
        </aside>

        {/* Main content */}
        <div className="flex-1 p-4 lg:p-5">
          {/* Step header */}
          <div className="flex items-start gap-3 mb-4 pb-4 border-b border-[rgba(56,189,248,0.08)]">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center shrink-0">
              <currentStep.icon className="w-5 h-5 text-blue-300" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-[9px] font-mono text-slate-500">Step {currentStep.number} of 13 · {currentStep.specRef}</span>
                {currentStep.governorGate && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 font-mono">
                    {currentStep.governorGate}
                  </span>
                )}
              </div>
              <h3 className="text-sm font-bold text-white">{currentStep.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed">{currentStep.purpose}</p>
            </div>
          </div>

          {/* AI Suggestion */}
          {currentStep.aiSuggestion && (
            <div className="p-3 rounded-lg border border-purple-500/20 bg-purple-950/15 mb-4 flex items-start gap-2">
              <div className="w-6 h-6 rounded-md bg-purple-500/20 flex items-center justify-center shrink-0">
                <span className="text-[9px] font-bold text-purple-300">AI</span>
              </div>
              <div className="flex-1">
                <p className="text-[9px] text-purple-300 uppercase tracking-wider font-semibold mb-0.5">A1/A2 Suggestion</p>
                <p className="text-[10px] text-slate-300 leading-relaxed">{currentStep.aiSuggestion}</p>
              </div>
            </div>
          )}

          {/* Form fields */}
          <div className="space-y-3">
            {currentStep.fields.map((field: any) => (
              <FormField
                key={field.key}
                field={field}
                value={formValues[`${activeStep}-${field.key}`] || field.defaultValue || ""}
                onChange={(v: string) => setFormValues((prev: any) => ({ ...prev, [`${activeStep}-${field.key}`]: v }))}
              />
            ))}
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-[rgba(56,189,248,0.08)]">
            <button
              onClick={handlePrev}
              disabled={activeStep === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-[11px] font-medium text-slate-300 rounded-lg border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.5)] hover:bg-[rgba(30,41,59,0.6)] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
            </button>

            {/* Step dots */}
            <div className="flex items-center gap-1">
              {BUYER_WORKFLOW_STEPS.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveStep(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-all ${
                    i === activeStep ? "bg-blue-400 w-4" :
                    completedSteps.has(i) ? "bg-emerald-400" : "bg-slate-700"
                  }`}
                  aria-label={`Go to step ${i + 1}`}
                />
              ))}
            </div>

            {isLast ? (
              <button
                onClick={handleSubmit}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-bold text-white rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all"
              >
                <Shield className="w-3.5 h-3.5" /> Submit — Run G1U1–G1U8
              </button>
            ) : (
              <button
                onClick={handleNext}
                className="flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-semibold text-white rounded-lg bg-gradient-to-r from-blue-500 to-purple-500 hover:shadow-lg hover:shadow-blue-500/30 transition-all"
              >
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
// FORM FIELD — renders text, select, radio, textarea, toggle, smart input
// ═══════════════════════════════════════════════════════════════════════════════
function FormField({ field, value, onChange }: { field: any; value: string; onChange: (v: string) => void }) {
  const label = (
    <label className="text-[10px] text-slate-300 font-medium mb-1 flex items-center gap-1.5">
      {field.label}
      {field.required && <span className="text-red-400">*</span>}
      {field.aiAssist && (
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-300 font-mono">
          {field.aiAssist}
        </span>
      )}
    </label>
  );

  if (field.type === "select") {
    return (
      <div>
        {label}
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.15)] rounded-lg focus:outline-none focus:border-blue-400/40"
        >
          {field.options?.map((o: string) => (
            <option key={o} value={o} className="bg-slate-900">{o}</option>
          ))}
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
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${
                value === o
                  ? "bg-blue-500/20 border-blue-400/40 text-blue-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "textarea") {
    return (
      <div>
        {label}
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={3}
          placeholder={field.placeholder}
          className="w-full px-3 py-2 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.15)] rounded-lg focus:outline-none focus:border-blue-400/40 resize-y"
        />
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
            <button
              key={o}
              onClick={() => onChange(o)}
              className={`px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all ${
                current === o
                  ? "bg-emerald-500/20 border-emerald-400/40 text-emerald-200"
                  : "bg-[rgba(15,23,42,0.5)] border-[rgba(56,189,248,0.1)] text-slate-400 hover:text-slate-200"
              }`}
            >
              {o}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (field.type === "smart") {
    return (
      <div>
        {label}
        <div className="relative">
          <input
            type="text"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-1.5 pr-8 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-purple-500/25 rounded-lg focus:outline-none focus:border-purple-400/50"
          />
          <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-purple-300">AI</span>
        </div>
      </div>
    );
  }

  // text / number
  return (
    <div>
      {label}
      <input
        type={field.type === "number" ? "number" : "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={field.placeholder}
        className="w-full px-3 py-1.5 text-[11px] text-slate-200 bg-[rgba(15,23,42,0.6)] border border-[rgba(56,189,248,0.15)] rounded-lg focus:outline-none focus:border-blue-400/40"
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// QUOTE RECEIVED CARD (seller responds — §8)
// ═══════════════════════════════════════════════════════════════════════════════
function QuoteReceivedCard() {
  return (
    <div className="p-4 rounded-xl border border-amber-500/25 bg-amber-950/10">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-amber-200 flex items-center gap-2">
          <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-pulse" />
          Quote Received from Seller (Sahara Exports)
          <span className="text-[9px] text-slate-500 font-normal ml-1">§8 · Phase 2</span>
        </h3>
        <div className="flex items-center gap-1.5">
          <button className="px-3 py-1 text-[10px] font-semibold text-white rounded-lg bg-emerald-500/20 border border-emerald-400/30 text-emerald-200 hover:bg-emerald-500/30 transition-all">Accept</button>
          <button className="px-3 py-1 text-[10px] font-semibold text-white rounded-lg bg-amber-500/20 border border-amber-400/30 text-amber-200 hover:bg-amber-500/30 transition-all">Counter</button>
          <button className="px-3 py-1 text-[10px] font-semibold text-white rounded-lg bg-rose-500/20 border border-rose-400/30 text-rose-200 hover:bg-rose-500/30 transition-all">Decline</button>
        </div>
      </div>
      <p className="text-[10px] text-slate-400 mb-3">Seller locked EXW price at $4.20/kg (within anonymised historical range). Fee breakdown attached. 1 field differs (Incoterm: CFR vs CIF) — Clause Forge can draft a side-by-side comparison.</p>

      {/* Quote comparison table */}
      <div className="overflow-x-auto max-h-64 overflow-y-auto rounded-lg border border-[rgba(56,189,248,0.1)]">
        <table className="w-full text-[10px]">
          <thead className="sticky top-0 bg-[rgba(2,6,23,0.95)]">
            <tr className="text-left text-slate-400">
              <th className="px-3 py-1.5 font-medium">Field</th>
              <th className="px-3 py-1.5 font-medium">Seller Quote</th>
              <th className="px-3 py-1.5 font-medium">Your Request</th>
              <th className="px-3 py-1.5 font-medium">Match</th>
            </tr>
          </thead>
          <tbody>
            {QUOTE_COMPARISON.map((q) => (
              <tr key={q.label} className="border-t border-[rgba(56,189,248,0.06)]">
                <td className="px-3 py-1.5 text-slate-300">{q.label}</td>
                <td className="px-3 py-1.5 text-white font-medium">{q.sellerValue}</td>
                <td className="px-3 py-1.5 text-slate-400">{q.buyerRequest}</td>
                <td className="px-3 py-1.5">
                  {q.match === "match" ? (
                    <span className="text-emerald-400 text-[9px] font-bold">✓ MATCH</span>
                  ) : q.match === "differs" ? (
                    <span className="text-amber-400 text-[9px] font-bold">⚠ DIFFERS</span>
                  ) : (
                    <span className="text-slate-500 text-[9px]">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// DOWNSTREAM PHASES TRACKER
// ═══════════════════════════════════════════════════════════════════════════════
function DownstreamPhasesTracker() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        Downstream Phase Progression
        <span className="text-[9px] text-slate-500 font-normal">§6 → §7 → §9 → §9.27 → §12 → §13 → §14</span>
      </h3>
      <div className="space-y-2">
        {DOWNSTREAM_PHASES.map((p, i) => {
          const Icon = p.icon;
          const statusColor = p.status === "complete" ? "text-emerald-300 bg-emerald-500/10 border-emerald-500/20"
            : p.status === "active" ? "text-blue-300 bg-blue-500/10 border-blue-500/30"
            : p.status === "blocked" ? "text-rose-300 bg-rose-500/10 border-rose-500/20"
            : "text-slate-400 bg-slate-500/5 border-slate-500/15";
          return (
            <div key={p.phase} className="flex items-stretch gap-2">
              <div className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center border ${statusColor}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {i < DOWNSTREAM_PHASES.length - 1 && (
                  <div className={`w-px flex-1 my-0.5 ${p.status === "complete" ? "bg-emerald-500/30" : "bg-slate-700/50"}`} />
                )}
              </div>
              <div className="flex-1 p-2.5 rounded-lg border border-[rgba(56,189,248,0.08)] bg-[rgba(2,6,23,0.4)] mb-2">
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[10px] font-mono font-bold text-slate-300">{p.phase}</span>
                  <span className="text-[11px] font-semibold text-white">{p.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold capitalize ${statusColor} border`}>{p.status}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 font-mono ml-auto">{p.governorGate}</span>
                </div>
                <p className="text-[10px] text-slate-400 leading-relaxed">{p.description}</p>
                <p className="text-[10px] text-slate-500 mt-0.5">{p.specRef}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// FEE BREAKDOWN CARD (§9.27 — Dynamic Fee Engine)
// ═══════════════════════════════════════════════════════════════════════════════
function FeeBreakdownCard() {
  const f = FEE_BREAKDOWN;
  return (
    <div className="p-4 rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-950/15 to-[rgba(2,6,23,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        <Lock className="w-4 h-4 text-emerald-300" />
        Fee & Lock — Dynamic Fee Engine
        <span className="text-[9px] text-slate-500 font-normal ml-1">§9.27 · G4</span>
      </h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px]">
        <FeeRow label="Canonical Fee Basis" value={f.canonicalFeeBasis} />
        <FeeRow label="EXW Value" value={f.exwValue} />
        <FeeRow label="Mandatory Logistics" value={f.mandatoryLogistics} />
        <FeeRow label="Effective Rate" value={f.effectiveRate} highlight />
        <FeeRow label="SGTX Trade Fee" value={f.tradeFee} highlight />
        <FeeRow label="Institutional Pricing" value={f.institutionalPricing} />
      </div>
      <div className="mt-3 pt-2 border-t border-emerald-500/10 flex items-center justify-between flex-wrap gap-2">
        <p className="text-[10px] text-emerald-300 font-semibold">✓ {f.feeBounds}</p>
        <p className="text-[9px] font-mono text-slate-400">{f.feelockInstruction}</p>
      </div>
    </div>
  );
}

function FeeRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex items-center justify-between p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(56,189,248,0.06)]">
      <span className="text-slate-400">{label}</span>
      <span className={`font-mono ${highlight ? "text-emerald-300 font-bold" : "text-slate-200"}`}>{value}</span>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CLOSURE CONDITIONS CARD (§5.10 — Earned Closure)
// ═══════════════════════════════════════════════════════════════════════════════
function ClosureConditionsCard() {
  return (
    <div className="p-4 rounded-xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)]">
      <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
        Closure Conditions (Earned Closure)
        <span className="text-[9px] text-slate-500 font-normal ml-1">§5.10 · G7 — all 7 must be true</span>
      </h3>
      <div className="space-y-1.5">
        {CLOSURE_CONDITIONS.map((c, i) => (
          <div key={i} className="flex items-center gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)] border border-[rgba(56,189,248,0.06)]">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 flex items-center justify-center shrink-0" />
            <span className="text-[10px] text-slate-300 flex-1">{c.name}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-700/50 text-slate-400 font-mono">PENDING</span>
          </div>
        ))}
      </div>
      <p className="text-[9px] text-slate-500 italic mt-2 pt-2 border-t border-[rgba(56,189,248,0.06)]">
        Closure is earned — never forced. All 7 conditions must evaluate true. The 26-category evidence package is sealed and can be extended but never modified.
      </p>
    </div>
  );
}
