// @ts-nocheck
"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 — BUYER WORKFLOW — 13-Section Canonical Order + 33 Validation Gates
// ═══════════════════════════════════════════════════════════════════════════════
//
// Refactored from the 8-step wizard (P0c) to align with v17 Section 6 — the
// canonical 13-section order with 33 Phase 1 validation gates (G1U1–G1U33).
//
// Sections (canonical order — DO NOT REORDER):
//   1.  Seller Selection                     (GNN A2 sanctions pre-screen)
//   2.  Incoterm + Commercial Foundation     (with Buyer Financing Toggle)
//   3.  Transport Mode & Equipment           (mode BEFORE containers)
//   4.  Container/Unit & Commodity Config    (1–50, Acceptance Criteria Matrix)
//   5.  Lab Test Requirements                 (Mandatory/Recommended/Optional)
//   6.  QC Inspection Request                 (geography-aware, provider coverage)
//   7.  AI Container/Unit Advisor             (advisory-only, runs after Step 3)
//   8.  Documentation Requirements            (trigger-driven)
//   9.  Insurance Requirements
//   10. Delivery Window & Special Instructions
//   11. Trade Criticality                     (Routine/Priority/Critical + AI suggestion)
//   12. Feasibility Check                     (33 validation gates run here)
//   13. Trade Brief & Submit                  (final review + submit)
//
// Draft auto-save is automatic (30s debounce) — runs in the background, not a
// user-facing step.
//
// UX principles preserved from P0c:
//   • Progressive disclosure: only show what matters now
//   • Smart defaults: auto-populate where safe (marked "Suggested")
//   • Plain language: "Documents needed for this shipment" not "regulatory dependency"
//   • One-click actions: each blocking issue has a "Fix Now" button
//   • No false completion: "claimed" ≠ "confirmed" ≠ "final"
//   • Governor validation only after buyer review (Section 12)

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { CockpitShell, shouldShowAdmin } from "@/components/cockpit/CockpitShell";
import { useSession, fetchWithAuth } from "@/lib/cockpit/session";
import { useCockpitLocale } from "@/lib/cockpit/use-locale";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  ChevronLeft, ChevronRight, CheckCircle2, Loader2, Save, AlertTriangle,
  Package, Search, Truck, FileText, ShieldCheck, DollarSign, Sparkles,
  Thermometer, MapPin, Calendar, ArrowRight, Info, Lightbulb, Clock,
  FlaskConical, Microscope, Bot, Gauge, Zap, X, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ─── v17 validation gates (33 gates G1U1–G1U33) ─────────────────────────────
import {
  validatePhase1,
  suggestTradeCriticality,
  type WizardState as GateWizardState,
  type Phase1ValidationResult,
  type GateResult,
} from "@/lib/sgtx/trade-request/validation-gates";

// ───────────────────────────────────────────────────────────────────────────────
// Types — 13-section wizard state
// ───────────────────────────────────────────────────────────────────────────────

type StepId = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

interface WizardState {
  // ── Section 1 — Seller Selection (GNN sanctions pre-screen) ─────────────
  counterpartyGtid: string;
  counterpartyName: string;
  counterpartyVerified: boolean;
  counterpartyTrustScore: number | null;
  counterpartyKybTier: number;            // 0,1,2,3 — used by G1U2
  counterpartyCapacityUsd: number | null;

  // ── Section 2 — Incoterm + Commercial Foundation (with Buyer Financing Toggle)
  incoterm: string;
  currency: string;
  paymentTerms: string;
  paymentTiming: string;
  creditPeriod: string;
  settlementStructure: string;
  tolerance: string;
  // Buyer Financing Toggle — data-sovereign
  buyerFinancingRequired: boolean;        // "I need financing" — yes/no only
  buyerFinancingShared: boolean;           // MUST remain false per G1U29
  buyerFinancingCounterparty: boolean;     // MUST remain false per G1U29
  buyerFinancingEitherParty: boolean;      // MUST remain false per G1U29
  financingInterest: string;               // free-text buyer-side only

  // ── Section 3 — Transport Mode & Equipment ──────────────────────────────
  transportMode: string;                  // OCEAN|AIR|RAIL|TRUCK|RORO|MULTIMODAL
  equipmentType: string;
  transitTimeDays: number | null;

  // ── Section 4 — Container/Unit & Commodity Configuration ────────────────
  equipmentCount: string;                 // 1–50
  commodity: string;
  commodityHs: string;
  gradeSpec: string;
  quantity: string;
  quantityUnit: string;
  grossWeightKg: number;
  netWeightKg: number;
  packaging: string;
  partialShipment: boolean;
  transshipment: boolean;
  temperatureControlled: boolean;
  temperatureRange: string;
  shelfLife: string;
  acceptanceCriteria: {
    temperature?: string;
    humidity?: string;
    weightTolerance?: string;
    qualityGrade?: string;
  };

  // ── Section 5 — Lab Test Requirements ────────────────────────────────────
  labTestRequirements: {
    mandatory: string[];     // locked for perishables
    recommended: string[];
    optional: string[];
  };
  labTestsPriced: boolean;
  labTestsFeeUsd: number | null;

  // ── Section 6 — QC Inspection Request ───────────────────────────────────
  qcInspectionType: string | null;        // PRE_SHIPMENT|DURING_LOADING|DESTINATION|INDEPENDENT|NONE
  qcInspectionGeography: string | null;
  qcInspectionProviderCoverage: boolean;
  qcInspectionFeeUsd: number | null;
  qcInspectionPriceRange: string;          // anonymised historical range

  // ── Section 7 — AI Container/Unit Advisor ───────────────────────────────
  aiContainerAdvisorRun: boolean;
  aiContainerAdvisorResult: any;

  // ── Section 8 — Documentation Requirements ──────────────────────────────
  documentRequirements: any[];
  documentsTriggerResolved: boolean;

  // ── Section 9 — Insurance Requirements ──────────────────────────────────
  insuranceRequired: string;              // "yes" | "no" | "according_to_incoterm"
  insuranceType: string;
  insuranceCoveragePct: string;
  incotermRequiresInsurance: boolean;

  // ── Section 10 — Delivery Window & Special Instructions ─────────────────
  earliestDelivery: string;
  preferredDelivery: string;
  latestDelivery: string;
  requiredDeliveryDate: string;
  specialHandling: string;
  specialInstructions: string;

  // ── Section 11 — Trade Criticality ──────────────────────────────────────
  tradeCriticality: "Routine" | "Priority" | "Critical" | null;
  criticalitySuggested: string | null;
  criticalityConfidence: number | null;
  criticalityAdjustmentReason: string;
  criticalityReasons: string[];            // populated by AI suggestion

  // ── Section 12 — Feasibility Check (33 gates) ──────────────────────────
  validationResult: Phase1ValidationResult | null;

  // ── Section 13 — Trade Brief & Submit ───────────────────────────────────
  originCountry: string;
  originPort: string;
  destCountry: string;
  destPort: string;
  targetPrice: string;
  importantRequirements: string;
  marketplaceAttribution: boolean;
  marketplaceAttributionAcknowledged: boolean;

  // ── Metadata ────────────────────────────────────────────────────────────
  draftId: string | null;
  lastSaved: string | null;
  sessionStart: number;
}

const INITIAL_STATE: WizardState = {
  counterpartyGtid: "", counterpartyName: "", counterpartyVerified: false,
  counterpartyTrustScore: null, counterpartyKybTier: 0, counterpartyCapacityUsd: null,

  incoterm: "", currency: "USD", paymentTerms: "30_DAYS_NET", paymentTiming: "AGAINST_DOCUMENTS",
  creditPeriod: "30", settlementStructure: "DOCUMENTARY_CREDIT", tolerance: "",
  buyerFinancingRequired: false, buyerFinancingShared: false,
  buyerFinancingCounterparty: false, buyerFinancingEitherParty: false,
  financingInterest: "",

  transportMode: "OCEAN", equipmentType: "40DRY", transitTimeDays: null,

  equipmentCount: "1", commodity: "", commodityHs: "", gradeSpec: "",
  quantity: "", quantityUnit: "MT", grossWeightKg: 0, netWeightKg: 0,
  packaging: "", partialShipment: false, transshipment: false,
  temperatureControlled: false, temperatureRange: "", shelfLife: "",
  acceptanceCriteria: {},

  labTestRequirements: { mandatory: [], recommended: [], optional: [] },
  labTestsPriced: false, labTestsFeeUsd: null,

  qcInspectionType: null, qcInspectionGeography: null,
  qcInspectionProviderCoverage: false, qcInspectionFeeUsd: null,
  qcInspectionPriceRange: "$180–$420 per inspection",

  aiContainerAdvisorRun: false, aiContainerAdvisorResult: null,

  documentRequirements: [], documentsTriggerResolved: false,

  insuranceRequired: "according_to_incoterm", insuranceType: "",
  insuranceCoveragePct: "110", incotermRequiresInsurance: false,

  earliestDelivery: "", preferredDelivery: "", latestDelivery: "",
  requiredDeliveryDate: "", specialHandling: "", specialInstructions: "",

  tradeCriticality: null, criticalitySuggested: null,
  criticalityConfidence: null, criticalityAdjustmentReason: "",
  criticalityReasons: [],

  validationResult: null,

  originCountry: "", originPort: "", destCountry: "", destPort: "",
  targetPrice: "", importantRequirements: "",
  marketplaceAttribution: false, marketplaceAttributionAcknowledged: false,

  draftId: null, lastSaved: null, sessionStart: Date.now(),
};

// ───────────────────────────────────────────────────────────────────────────────
// Section definitions — buyer-friendly titles per v17 Section 6 canonical order
// ───────────────────────────────────────────────────────────────────────────────

const STEPS: { id: StepId; title: string; desc: string; icon: any }[] = [
  { id: 1,  title: "Seller",          desc: "Who are you buying from?", icon: Search },
  { id: 2,  title: "Commercial",      desc: "Incoterm + payment + financing", icon: FileText },
  { id: 3,  title: "Transport",       desc: "How should it arrive?", icon: Truck },
  { id: 4,  title: "Container",       desc: "Container & commodity details", icon: Package },
  { id: 5,  title: "Lab tests",       desc: "Quality & safety testing", icon: FlaskConical },
  { id: 6,  title: "QC inspection",   desc: "Geography-aware provider", icon: Microscope },
  { id: 7,  title: "AI advisor",      desc: "Optimise your containers", icon: Bot },
  { id: 8,  title: "Documents",      desc: "Auto-determined", icon: ShieldCheck },
  { id: 9,  title: "Insurance",       desc: "Cargo cover preferences", icon: ShieldCheck },
  { id: 10, title: "Delivery",        desc: "Window & special instructions", icon: Calendar },
  { id: 11, title: "Criticality",     desc: "Routine / Priority / Critical", icon: Gauge },
  { id: 12, title: "Feasibility",     desc: "33-gate validation run", icon: AlertTriangle },
  { id: 13, title: "Submit",          desc: "Review & send to seller", icon: CheckCircle2 },
];

const INCOTERMS = ["EXW", "FCA", "CPT", "CIP", "DAP", "DPU", "DDP", "FAS", "FOB", "CFR", "CIF"];

// Incoterms 2020 that are restricted to SEA / inland-waterway transport.
// Per Incoterms 2020 (ICC Publication 723): FAS, FOB, CFR, CIF can ONLY be
// used for sea or inland-waterway carriage. Containerised cargo should use
// FCA / CPT / CIP / DAP / DPU / DDP instead — these are mode-agnostic.
const SEA_ONLY_INCOTERMS = new Set(["FAS", "FOB", "CFR", "CIF"]);

const TRANSPORT_MODES = [
  { value: "OCEAN",     label: "Ocean" },
  { value: "AIR",       label: "Air" },
  { value: "RAIL",      label: "Rail" },
  { value: "TRUCK",     label: "Truck" },
  { value: "RORO",      label: "Ro-Ro" },
  { value: "MULTIMODAL", label: "Multimodal" },
];

const UNITS = ["MT", "KG", "TON", "BOX", "PALLET", "CONTAINER"];
const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED", "CNY", "JPY"];
const PAYMENT_TERMS = [
  { value: "ADVANCE_PAYMENT",       label: "Advance payment" },
  { value: "PARTIAL_ADVANCE",       label: "Partial advance" },
  { value: "AGAINST_DOCUMENTS",     label: "Against documents" },
  { value: "AGAINST_SHIPMENT",       label: "Against shipment" },
  { value: "AGAINST_DELIVERY",       label: "Against delivery" },
  { value: "30_DAYS_NET",            label: "30 days net (deferred)" },
  { value: "60_DAYS_NET",            label: "60 days net (deferred)" },
  { value: "DOCUMENTARY_CREDIT",     label: "Letter of credit (L/C)" },
  { value: "DOCUMENTARY_COLLECTION", label: "Documentary collection" },
  { value: "BANK_TRANSFER",          label: "Bank transfer" },
  { value: "OPEN_ACCOUNT",           label: "Open account" },
  { value: "TO_BE_NEGOTIATED",       label: "To be negotiated" },
];
const SETTLEMENT_STRUCTURES = [
  { value: "DOCUMENTARY_CREDIT",      label: "Letter of Credit (L/C)" },
  { value: "DOCUMENTARY_COLLECTION",  label: "Documentary Collection" },
  { value: "BANK_TRANSFER",           label: "Bank Transfer" },
  { value: "OPEN_ACCOUNT",             label: "Open Account" },
];

const QC_INSPECTION_TYPES = [
  { value: "NONE",            label: "None — not required" },
  { value: "PRE_SHIPMENT",    label: "Pre-shipment (at origin)" },
  { value: "DURING_LOADING",  label: "During loading (origin port)" },
  { value: "DESTINATION",     label: "Destination (after arrival)" },
  { value: "INDEPENDENT",     label: "Independent third-party (any stage)" },
];

const LAB_TESTS_CATALOG = [
  { id: "PESTICIDE_RESIDUE", label: "Pesticide residue (MRL screen)", tier: "mandatory", perishable: true, feeUsd: 220 },
  { id: "MICROBIOLOGY",      label: "Microbiology (TPC, yeast, mould)", tier: "mandatory", perishable: true, feeUsd: 180 },
  { id: "HEAVY_METALS",      label: "Heavy metals (Pb, Cd, Hg, As)",    tier: "mandatory", perishable: true, feeUsd: 240 },
  { id: "MOISTURE",          label: "Moisture content",                 tier: "recommended", perishable: false, feeUsd: 90 },
  { id: "SUGAR_CONTENT",    label: "Sugar content (Brix)",             tier: "recommended", perishable: false, feeUsd: 70 },
  { id: "SIZE_GRADING",     label: "Size grading & calibration",       tier: "recommended", perishable: false, feeUsd: 60 },
  { id: "SHELF_LIFE",       label: "Shelf-life accelerated test",      tier: "recommended", perishable: true, feeUsd: 310 },
  { id: "GMO",              label: "GMO screen",                        tier: "optional",    perishable: false, feeUsd: 140 },
  { id: "ORGANIC_CERT",     label: "Organic certification verify",    tier: "optional",    perishable: false, feeUsd: 95 },
  { id: "ISO_22000",        label: "ISO 22000 facility audit",         tier: "optional",    perishable: false, feeUsd: 480 },
];

const CRITICALITY_OPTIONS = [
  { value: "Routine",  label: "Routine",  desc: "Standard processing. Normal SLA. No expedite fees.", icon: CheckCircle2, color: "emerald" },
  { value: "Priority", label: "Priority", desc: "Fast-tracked review. Within 24h SLA. May incur expedite fees.", icon: Zap, color: "amber" },
  { value: "Critical", label: "Critical", desc: "Immediate attention. Same-day SLA. Highest fees. Use only for time-critical cargo.", icon: AlertTriangle, color: "red" },
];

// Incoterm responsibility map — plain language
const INCOTERM_RESPONSIBILITIES: Record<string, { buyer: string[]; seller: string[] }> = {
  EXW: { buyer: ["Main carriage", "Export customs (often impractical)", "Import customs", "Insurance", "Loading at origin"], seller: ["Make goods available at premises"] },
  FCA: { buyer: ["Main carriage", "Import customs", "Insurance"], seller: ["Export clearance", "Deliver to carrier"] },
  CPT: { buyer: ["Import customs", "Insurance", "Destination charges"], seller: ["Export clearance", "Main carriage to named place"] },
  CIP: { buyer: ["Import customs", "Destination charges"], seller: ["Export clearance", "Main carriage", "Insurance (Clause A)"] },
  DAP: { buyer: ["Import customs", "Destination charges", "Unloading"], seller: ["Export clearance", "Main carriage", "Delivery to named place"] },
  DPU: { buyer: ["Import customs"], seller: ["Export clearance", "Main carriage", "Delivery & unloading at named place"] },
  DDP: { buyer: ["Receive goods at named place"], seller: ["Export clearance", "Main carriage", "Import customs", "Duties & taxes", "Delivery to named place"] },
  FAS: { buyer: ["Main carriage", "Import customs", "Insurance"], seller: ["Export clearance", "Place alongside vessel at port"] },
  FOB: { buyer: ["Main carriage", "Import customs", "Insurance"], seller: ["Export clearance", "Load on vessel"] },
  CFR: { buyer: ["Import customs", "Insurance", "Destination charges"], seller: ["Export clearance", "Main carriage to destination port"] },
  CIF: { buyer: ["Import customs", "Destination charges"], seller: ["Export clearance", "Main carriage", "Insurance (Clause C)"] },
};

// Plain-language "Why this incoterm?" explanations — shown in an expandable
// section below the responsibility map so the buyer can make an informed choice.
const INCOTERM_EXPLANATIONS: Record<string, string> = {
  EXW: "Ex Works is the MINIMUM seller obligation. The seller only makes goods available at their premises — the buyer handles ALL logistics, export clearance, and import clearance. NOT recommended for international trade because the buyer usually cannot obtain export clearance in the seller's country. Use FCA instead when you want the seller to handle export clearance.",
  FCA: "Free Carrier is the recommended Incoterm for containerised cargo. The seller clears export customs and delivers to a carrier named by the buyer at a named place. The buyer arranges main carriage and import clearance. Works with any transport mode (sea, air, rail, road, multimodal).",
  CPT: "Carriage Paid To — the seller pays main carriage to a named destination. Risk transfers when goods are handed to the FIRST carrier (often at origin), but cost transfers at destination. The buyer insures (optional) and clears import customs. Works with any transport mode.",
  CIP: "Carriage and Insurance Paid To — like CPT but the seller MUST procure cargo insurance with Institute Cargo Clauses (A) — maximum all-risks cover — and provide the certificate to the buyer. Recommended for high-value or fragile cargo. Works with any transport mode.",
  DAP: "Delivered at Place — the seller delivers the goods to a named destination, ready for unloading. The seller handles export clearance and main carriage. The buyer handles import clearance, duties, and unloading. Works with any transport mode.",
  DPU: "Delivered at Place Unloaded — the ONLY Incoterm where the seller unloads the goods at destination. Otherwise like DAP. Use DPU when the seller is responsible for unloading (e.g. heavy or oversized cargo where unloading requires special equipment). Works with any transport mode.",
  DDP: "Delivered Duty Paid is the MAXIMUM seller obligation. The seller handles everything: export clearance, main carriage, import clearance, duties, taxes, and delivery. Often requires a local fiscal representative in the destination country. Some jurisdictions disallow non-resident VAT registration — check with the seller before choosing DDP.",
  FAS: "Free Alongside Ship — the seller delivers goods alongside the vessel at the named port of loading. The buyer arranges main carriage, insurance, and import clearance. SEA / inland-waterway ONLY. Not recommended for containerised cargo (use FCA instead).",
  FOB: "Free On Board — the seller loads goods on board the vessel at the named port of loading and clears export. The buyer arranges main carriage, insurance, and import clearance. SEA / inland-waterway ONLY. NOT recommended for containerised cargo because risk transfer is unclear when goods are handed to the terminal before loading (use FCA instead).",
  CFR: "Cost and Freight — the seller pays freight to the destination port but risk transfers when goods are loaded on board at origin. The buyer insures (optional) and clears import. Classic 'cost at destination, risk at origin' split. SEA / inland-waterway ONLY.",
  CIF: "Cost, Insurance and Freight — like CFR but the seller MUST procure cargo insurance with Institute Cargo Clauses (C) — minimum cover — and provide the certificate to the buyer. The buyer may upgrade to all-risks cover separately. SEA / inland-waterway ONLY.",
};

// Incoterms that oblige the SELLER to insure cargo during main carriage
const SELLER_INSURANCE_INCOTERMS = new Set(["CIF", "CIP"]);

// ───────────────────────────────────────────────────────────────────────────────
// Main component
// ───────────────────────────────────────────────────────────────────────────────

export default function NewTradeWizardPage() {
  const router = useRouter();
  const { payload, ready } = useSession();
  const { t } = useCockpitLocale();
  const [step, setStep] = useState<StepId>(1);
  const [state, setState] = useState<WizardState>(INITIAL_STATE);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draftRestored, setDraftRestored] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Restore draft on mount ─────────────────────────────────────────────
  useEffect(() => {
    if (!ready || !payload?.tenantGtid) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetchWithAuth(
          `/api/sgtx/trade-request/draft?buyerGtid=${encodeURIComponent(payload.tenantGtid!)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        if (cancelled || !data?.draft) return;
        const draft = data.draft;
        const parsed = draft.parsedSpecs ? JSON.parse(draft.parsedSpecs) : {};
        setState((s) => ({
          ...s,
          ...parsed,
          draftId: draft.draftId,
          lastSaved: draft.updatedAt,
          sessionStart: Date.now(),
        }));
        setDraftRestored(true);
        toast.info("Draft restored", { description: "Picking up where you left off." });
      } catch { /* No draft — start fresh */ }
    })();
    return () => { cancelled = true; };
  }, [ready, payload?.tenantGtid]);

  // ── Auto-save (debounced 30s — v17 Section 12 / G1U30) ──────────────────
  const saveDraft = useCallback(async (s: WizardState) => {
    if (!payload?.tenantGtid) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth("/api/sgtx/trade-request/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          draftId: s.draftId,
          buyerGtid: payload.tenantGtid,
          sellerGtid: s.counterpartyGtid || null,
          incoterm: s.incoterm || null,
          parsedSpecs: { ...s },
          globalNotes: null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.draftId) {
        setState((cur) => ({ ...cur, draftId: data.draftId, lastSaved: new Date().toISOString() }));
      }
    } catch { /* non-fatal */ } finally { setSaving(false); }
  }, [payload?.tenantGtid]);

  useEffect(() => {
    if (!ready || !payload?.tenantGtid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(state), 30000);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [state, ready, payload?.tenantGtid, saveDraft]);

  // ── Run AI criticality suggestion whenever relevant inputs change ──────
  // (Deterministic — not an LLM call. Per v17 Section 11.3.)
  useEffect(() => {
    const suggestion = suggestTradeCriticality(state as GateWizardState);
    setState((s) => {
      // Only update if the suggestion actually changed — prevents infinite loop
      if (s.criticalitySuggested === suggestion.suggested &&
          s.criticalityConfidence === suggestion.confidence &&
          JSON.stringify(s.criticalityReasons) === JSON.stringify(suggestion.reasons)) {
        return s;
      }
      return {
        ...s,
        criticalitySuggested: suggestion.suggested,
        criticalityConfidence: suggestion.confidence,
        criticalityReasons: suggestion.reasons,
      };
    });
  }, [
    state.temperatureControlled, state.commodityHs, state.destCountry,
    state.targetPrice, state.quantity, state.tradeValueUsd, state.preferredDelivery,
  ]);

  // ── Run 33-gate validation when entering Section 12 ────────────────────
  const runValidationGates = useCallback(() => {
    const result = validatePhase1({
      ...state,
      // Recompute derived fields the gates need
      counterpartyKybTier: state.counterpartyKybTier,
      incotermRequiresInsurance: SELLER_INSURANCE_INCOTERMS.has(state.incoterm),
      mandatoryFieldsComplete: isMandatoryComplete(state),
      readinessScore: computeReadinessScore(state),
      tradeValueUsd:
        state.tradeValueUsd ||
        (state.targetPrice && state.quantity ? parseFloat(state.targetPrice) * parseFloat(state.quantity) : 0),
    });
    setState((s) => ({ ...s, validationResult: result }));
    return result;
  }, [state]);

  const goToStep = useCallback((next: StepId) => {
    setStep(next);
    saveDraft(state);
    // Auto-run 33-gate validation when entering Step 12 (Feasibility Check)
    if (next === 12) {
      // Use setTimeout so state has time to settle before computing
      setTimeout(() => runValidationGates(), 50);
    }
  }, [state, saveDraft, runValidationGates]);

  // ── Step validation (for the Continue button) ─────────────────────────
  const stepValid = useMemo(() => {
    switch (step) {
      case 1:  return !!state.counterpartyGtid;
      case 2:  return !!state.incoterm && !!state.settlementStructure && !!state.paymentTiming;
      case 3:  return !!state.transportMode && !!state.equipmentType;
      case 4:  return !!state.commodity && !!state.quantity && parseInt(state.equipmentCount || "0", 10) >= 1;
      case 5:  return !state.temperatureControlled || state.labTestRequirements.mandatory.length > 0;
      case 6:  return state.qcInspectionType == null || state.qcInspectionType === "NONE" ||
                      state.qcInspectionProviderCoverage;
      case 7:  return true;    // advisory-only
      case 8:  return state.documentsTriggerResolved || (state.documentRequirements?.length || 0) > 0;
      case 9:  return state.insuranceRequired !== "yes" || !!state.insuranceType;
      case 10: return !state.earliestDelivery || !state.preferredDelivery || state.earliestDelivery <= state.preferredDelivery;
      case 11: return !!state.tradeCriticality &&
                      (state.criticalitySuggested === state.tradeCriticality ||
                       state.criticalityAdjustmentReason.trim().length >= 20);
      case 12: return !!state.validationResult?.passed;
      case 13: return true;
    }
  }, [step, state]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!payload?.tenantGtid) return;

    // Final validation gate run right before submit
    const result = state.validationResult ?? runValidationGates();
    if (!result.passed) {
      setError("Not all critical validation gates have passed. Please resolve the blocking issues in Section 12.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const body = {
        buyerGtid: payload.tenantGtid,
        sellerGtid: state.counterpartyGtid,
        commodity: state.commodity,
        commodityHs: state.commodityHs || undefined,
        incoterm: state.incoterm,
        originCountry: state.originCountry,
        originPort: state.originPort || undefined,
        destCountry: state.destCountry,
        destPort: state.destPort || undefined,
        grossWeightKg: state.grossWeightKg || (state.quantity ? parseFloat(state.quantity) * 1000 : undefined),
        netWeightKg: state.netWeightKg || (state.quantity ? parseFloat(state.quantity) * 1000 : undefined),
        tradeValueUsd: state.targetPrice && state.quantity ? parseFloat(state.targetPrice) * parseFloat(state.quantity) : undefined,
        currency: state.currency,
        coldChain: state.temperatureControlled,
        transportMode: state.transportMode,
        equipmentType: state.equipmentType,
        equipmentCount: parseInt(state.equipmentCount || "1", 10),
        packaging: state.packaging || undefined,
        paymentTerms: state.paymentTerms,
        paymentTiming: state.paymentTiming,
        settlementStructure: state.settlementStructure,
        creditPeriod: state.creditPeriod,
        earliestDeliveryDate: state.earliestDelivery || state.requiredDeliveryDate || undefined,
        preferredDeliveryDate: state.preferredDelivery || state.requiredDeliveryDate || undefined,
        latestDeliveryDate: state.latestDelivery || state.requiredDeliveryDate || undefined,
        buyerFinancingRequired: state.buyerFinancingRequired,
        financingInterest: state.buyerFinancingRequired ? state.financingInterest : undefined,
        insuranceRequirement: state.insuranceRequired,
        insuranceType: state.insuranceType || undefined,
        insuranceCoveragePct: state.insuranceCoveragePct ? parseInt(state.insuranceCoveragePct) : undefined,
        insuranceResponsibleParty: SELLER_INSURANCE_INCOTERMS.has(state.incoterm) ? "SELLER" : "BUYER",
        qcInspectionType: state.qcInspectionType,
        qcInspectionFeeUsd: state.qcInspectionFeeUsd,
        labTestsRequested: JSON.stringify(state.labTestRequirements),
        labTestsFeeUsd: state.labTestsFeeUsd,
        tradeCriticality: state.tradeCriticality,
        criticalitySuggested: state.criticalitySuggested,
        criticalityConfidence: state.criticalityConfidence,
        criticalityAdjustmentReason: state.criticalityAdjustmentReason || undefined,
        specialInstructions: state.specialInstructions || undefined,
        documentRequirements: state.documentRequirements,
        validationGatesResult: state.validationResult,
        marketplaceAttributionAcknowledged: state.marketplaceAttributionAcknowledged,
        containers: [{
          sequence: 1,
          equipmentType: state.equipmentType,
          grossWeightKg: state.grossWeightKg || (state.quantity ? parseFloat(state.quantity) * 1000 : 0),
        }],
      };
      const res = await fetchWithAuth("/api/sgtx/trade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something needs your attention before this request can be sent.");
        return;
      }
      const ustn = data.ustn || data.trade?.ustn;
      if (ustn) {
        toast.success("Trade request submitted", { description: "USTN will be generated at contract lock." });
        router.push(`/trades/${ustn}`);
      } else {
        toast.success("Trade request submitted");
        router.push("/trades");
      }
    } catch (e: any) {
      setError(e?.message || "Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!ready) return <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">{t("common.loadingSession")}</div>;
  if (!payload) return null;

  return (
    <CockpitShell roleLabel={payload.role} showAdmin={shouldShowAdmin()}>
      <div className="max-w-3xl mx-auto space-y-6">
        {/* Back link + header */}
        <Link href="/trades" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <ChevronLeft className="w-3.5 h-3.5" /> All trades
        </Link>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">New Trade Request</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tell us what you need. We&apos;ll handle the complexity.
          </p>
        </header>

        {/* Progress bar — 13 sections */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1">
          {STEPS.map((s, idx) => {
            const completed = step > s.id;
            const current = step === s.id;
            return (
              <div key={s.id} className="flex items-center gap-1 flex-shrink-0">
                <button
                  onClick={() => s.id < step && goToStep(s.id)}
                  disabled={s.id > step}
                  className={cn(
                    "flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs font-medium border transition",
                    completed && "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                    current && "bg-primary/10 border-primary/30 text-primary",
                    !completed && !current && "bg-muted/30 border-border text-muted-foreground/70",
                    s.id < step && "cursor-pointer hover:bg-muted",
                  )}
                >
                  {completed ? <CheckCircle2 className="w-3 h-3" /> : <span className="w-3 h-3 rounded-full border border-current inline-flex items-center justify-center text-[0.5rem]">{s.id}</span>}
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {idx < STEPS.length - 1 && <div className={cn("w-3 h-px", completed ? "bg-emerald-500/40" : "bg-border")} />}
              </div>
            );
          })}
        </div>

        {/* Draft restored banner */}
        {draftRestored && (
          <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" /> Draft restored — {state.lastSaved ? new Date(state.lastSaved).toLocaleString() : "earlier"}.
          </div>
        )}

        {/* Step content */}
        <Card className="p-5">
          {step === 1  && <Section1Seller state={state} setState={setState} />}
          {step === 2  && <Section2Commercial state={state} setState={setState} />}
          {step === 3  && <Section3Transport state={state} setState={setState} />}
          {step === 4  && <Section4Container state={state} setState={setState} />}
          {step === 5  && <Section5LabTests state={state} setState={setState} />}
          {step === 6  && <Section6QcInspection state={state} setState={setState} />}
          {step === 7  && <Section7AiAdvisor state={state} setState={setState} />}
          {step === 8  && <Section8Documents state={state} setState={setState} />}
          {step === 9  && <Section9Insurance state={state} setState={setState} />}
          {step === 10 && <Section10Delivery state={state} setState={setState} />}
          {step === 11 && <Section11Criticality state={state} setState={setState} />}
          {step === 12 && <Section12Feasibility state={state} onReRun={runValidationGates} />}
          {step === 13 && <Section13Brief state={state} setState={setState} />}
        </Card>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p>{error}</p>
              <p className="text-xs mt-1 text-muted-foreground">Resolve the issues in the relevant section, then return to Section 12 to re-run the validation gates.</p>
            </div>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving ? <><Loader2 className="w-3 h-3 animate-spin" /> Saving…</>
              : state.lastSaved ? <><Save className="w-3 h-3" /> Saved {new Date(state.lastSaved).toLocaleTimeString()}</> : null}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => goToStep((step - 1) as StepId)} disabled={submitting}>
                <ChevronLeft className="w-3.5 h-3.5 me-1" /> Back
              </Button>
            )}
            {step < 13 ? (
              <Button size="sm" onClick={() => goToStep((step + 1) as StepId)} disabled={!stepValid || submitting}>
                Continue <ChevronRight className="w-3.5 h-3.5 ms-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={submitting || !state.validationResult?.passed}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 me-1" />}
                Submit Trade Request
              </Button>
            )}
          </div>
        </div>
      </div>
    </CockpitShell>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 1 — Seller Selection (GNN A2 sanctions pre-screen) — G1U1, G1U2
// ───────────────────────────────────────────────────────────────────────────────

function Section1Seller({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const [query, setQuery] = useState(state.counterpartyName || "");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!query || query.length < 2) { setResults([]); return; }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchWithAuth(`/api/sgtx/gtid/autocomplete?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          setResults(data.suggestions || data.results || []);
        }
      } catch { /* non-fatal */ } finally { setSearching(false); }
    }, 300);
  }, [query]);

  // Verify counterparty when selected — runs sanctions pre-screen (GNN A2)
  async function verifyCounterparty(gtid: string) {
    try {
      const res = await fetchWithAuth(`/api/sgtx/trust-passport/verify?gtid=${encodeURIComponent(gtid)}`);
      if (res.ok) {
        const data = await res.json();
        setState((s) => ({
          ...s,
          counterpartyVerified: data.sanctions_cleared && data.kyb_status === "VERIFIED",
          counterpartyTrustScore: data.trust_score || null,
          counterpartyKybTier: data.kyb_tier || 0,
          counterpartyCapacityUsd: data.capacity_usd ?? null,
        }));
      }
    } catch { /* non-fatal */ }
  }

  return (
    <div className="space-y-4">
      <StepHeader icon={Search} title="Who are you buying from?" desc="Select a saved contact or enter a GTID. We'll verify them automatically through the GNN A2 sanctions pre-screen." />
      <Field label="Seller" required full>
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setState((s) => ({
                ...s,
                counterpartyGtid: "", counterpartyName: e.target.value,
                counterpartyVerified: false, counterpartyKybTier: 0,
              }));
            }}
            placeholder="Type a company name or GTID (SGTX-…)"
            className="pl-8"
          />
          {searching && <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
        </div>
        {results.length > 0 && (
          <ul className="mt-1 border border-border rounded-md bg-background shadow-sm max-h-60 overflow-auto">
            {results.map((r: any, i: number) => (
              <li key={i}>
                <button
                  onClick={() => {
                    setState((s) => ({ ...s, counterpartyGtid: r.gtid, counterpartyName: r.legalName || r.gtid }));
                    setQuery(r.legalName || r.gtid);
                    setResults([]);
                    verifyCounterparty(r.gtid);
                  }}
                  className="w-full text-left p-2.5 hover:bg-muted text-sm flex items-center justify-between"
                >
                  <span>{r.legalName || r.gtid}</span>
                  <code className="text-[0.65rem] text-muted-foreground font-mono">{r.gtid}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Field>

      {/* Verification result — plain language */}
      {state.counterpartyGtid && (
        <div className={cn(
          "p-3 rounded-md border text-sm flex items-start gap-2",
          state.counterpartyVerified
            ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
            : "bg-amber-50 dark:bg-amber-950/20 border-amber-500/30 text-amber-700 dark:text-amber-300"
        )}>
          {state.counterpartyVerified ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />}
          <div>
            <p className="font-medium">{state.counterpartyVerified ? "Seller verified" : "Additional verification is required before this trade can proceed."}</p>
            {state.counterpartyTrustScore !== null && (
              <p className="text-xs mt-0.5 text-muted-foreground">Trust score: {state.counterpartyTrustScore}/100 · KYB tier: {state.counterpartyKybTier}</p>
            )}
            {state.counterpartyCapacityUsd !== null && state.counterpartyCapacityUsd > 0 && (
              <p className="text-xs mt-0.5 text-muted-foreground">Known capacity: ${state.counterpartyCapacityUsd.toLocaleString()}</p>
            )}
            <p className="text-xs mt-0.5 text-muted-foreground font-mono">{state.counterpartyGtid}</p>
          </div>
        </div>
      )}

      <SuggestedHint>SGTX never recommends unknown sellers. You can only select saved contacts or enter a known GTID.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 2 — Incoterm + Commercial Foundation (with Buyer Financing Toggle)
// G1U3, G1U4, G1U5, G1U6, G1U29 (data-sovereign)
// ───────────────────────────────────────────────────────────────────────────────

function Section2Commercial({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const incotermResp = state.incoterm ? INCOTERM_RESPONSIBILITIES[state.incoterm] : null;
  const incotermExplanation = state.incoterm ? INCOTERM_EXPLANATIONS[state.incoterm] : null;
  const needsInsurance = SELLER_INSURANCE_INCOTERMS.has(state.incoterm);
  const isSeaOnly = state.incoterm && SEA_ONLY_INCOTERMS.has(state.incoterm);
  const [whyOpen, setWhyOpen] = useState(false);
  const [feePreview, setFeePreview] = useState<any>(null);
  const [feeLoading, setFeeLoading] = useState(false);

  // Update incotermRequiresInsurance when incoterm changes
  useEffect(() => {
    setState((s) => ({
      ...s,
      incotermRequiresInsurance: SELLER_INSURANCE_INCOTERMS.has(s.incoterm),
    }));
  }, [state.incoterm]);

  // If the incoterm is sea-only and the user has chosen a non-sea transport mode,
  // auto-correct the transport mode to OCEAN so the wizard doesn't strand them.
  useEffect(() => {
    if (isSeaOnly && state.transportMode && !["OCEAN", "RORO"].includes(state.transportMode)) {
      setState((s) => ({ ...s, transportMode: "OCEAN" }));
      toast.info(`Incoterm ${state.incoterm} is sea-only`, {
        description: "Transport mode switched to Ocean. FAS/FOB/CFR/CIF can only be used for sea or Ro-Ro.",
      });
    }
  }, [isSeaOnly, state.incoterm, state.transportMode]);

  // Live fee breakdown preview — fetch from the incoterm-engine fees API
  // whenever the incoterm + trade value change. Uses the target price × quantity
  // as the EXW value (consistent with the rest of the wizard).
  useEffect(() => {
    if (!state.incoterm) {
      setFeePreview(null);
      return;
    }
    const exwValue =
      state.targetPrice && state.quantity
        ? parseFloat(state.targetPrice) * parseFloat(state.quantity)
        : 0;
    if (exwValue <= 0) {
      setFeePreview(null);
      return;
    }
    let cancelled = false;
    setFeeLoading(true);
    (async () => {
      try {
        const url = `/api/sgtx/incoterm-engine/fees?incoterm=${encodeURIComponent(state.incoterm)}&trade_value=${encodeURIComponent(String(exwValue))}`;
        const res = await fetch(url);
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (cancelled) return;
        setFeePreview(data);
      } catch {
        /* non-fatal — fee preview is advisory */
      } finally {
        if (!cancelled) setFeeLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [state.incoterm, state.targetPrice, state.quantity]);

  return (
    <div className="space-y-4">
      <StepHeader icon={FileText} title="Commercial foundation" desc="Choose your Incoterm and payment structure. We'll show you who's responsible for what." />

      {/* Incoterm selector */}
      <Field label="Incoterm 2020" required>
        <SelectBox value={state.incoterm} onChange={(v) => setState((s) => ({ ...s, incoterm: v }))} options={INCOTERMS.map((i) => ({ value: i, label: i }))} placeholder="Select Incoterm…" />
      </Field>

      {/* Responsibility map — plain language, auto-generated */}
      {incotermResp && (
        <div className="grid sm:grid-cols-2 gap-3">
          <Card className="p-3 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
            <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">Your responsibilities</p>
            <ul className="space-y-1">
              {incotermResp.buyer.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-emerald-500 mt-1.5 flex-shrink-0" /> {r}
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-3 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
            <p className="text-xs font-semibold text-amber-700 dark:text-amber-300 mb-2">Seller responsibilities</p>
            <ul className="space-y-1">
              {incotermResp.seller.map((r, i) => (
                <li key={i} className="text-xs flex items-start gap-1.5">
                  <span className="w-1 h-1 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" /> {r}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}

      {/* Mode-compatibility callout (sea-only incoterms) */}
      {isSeaOnly && (
        <div className="p-2.5 rounded-md bg-blue-50/50 dark:bg-blue-950/10 border border-blue-500/30 text-xs text-blue-700 dark:text-blue-300 flex items-start gap-2">
          <Truck className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <strong>{state.incoterm} is sea / inland-waterway only.</strong> Ocean or Ro-Ro transport is
            required. For containerised cargo by air, rail, road, or multimodal, use FCA / CPT / CIP / DAP
            instead. The Transport step will restrict your mode picker accordingly.
          </span>
        </div>
      )}

      {/* Why this incoterm? — expandable plain-language explanation */}
      {incotermExplanation && (
        <div className="border border-border rounded-md bg-muted/20">
          <button
            onClick={() => setWhyOpen((o) => !o)}
            className="w-full flex items-center justify-between p-3 text-sm text-left"
          >
            <span className="flex items-center gap-2 font-medium">
              <Info className="w-3.5 h-3.5 text-muted-foreground" />
              Why this Incoterm?
            </span>
            <ChevronRight className={cn("w-4 h-4 text-muted-foreground transition", whyOpen && "rotate-90")} />
          </button>
          {whyOpen && (
            <div className="px-3 pb-3 text-xs text-muted-foreground leading-relaxed">
              {incotermExplanation}
            </div>
          )}
        </div>
      )}

      {/* Fee breakdown preview — buyer pays X, seller pays Y, SGTX fee Z */}
      {feePreview && feePreview.ok && (
        <Card className="p-3 bg-muted/20">
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Fee preview</p>
            {feeLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <p className="text-muted-foreground">Total Trade Value</p>
              <p className="font-semibold">${feePreview.total_trade_value_usd?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">EXW + mandatory logistics</p>
            </div>
            <div>
              <p className="text-muted-foreground">SGTX fee (1.5%)</p>
              <p className="font-semibold">${feePreview.sgtx_fee_usd?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Split 50/50 buyer + seller</p>
            </div>
            <div>
              <p className="text-muted-foreground">You pay (buyer)</p>
              <p className="font-semibold text-emerald-700 dark:text-emerald-300">${feePreview.buyer_pays_usd?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Seller pays</p>
              <p className="font-semibold text-amber-700 dark:text-amber-300">${feePreview.seller_pays_usd?.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
            </div>
          </div>
          <p className="text-[0.65rem] text-muted-foreground mt-2">
            Preview assumes no logistics cost lines yet — final figures update as you add logistics in
            later steps. The SGTX fee is 1.5% of Total Trade Value (per SGTX §9 / §1.5).
          </p>
        </Card>
      )}

      {/* Commercial terms */}
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Currency" required>
          <SelectBox value={state.currency} onChange={(v) => setState((s) => ({ ...s, currency: v }))} options={CURRENCIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Settlement structure" required>
          <SelectBox value={state.settlementStructure} onChange={(v) => setState((s) => ({ ...s, settlementStructure: v }))} options={SETTLEMENT_STRUCTURES} />
        </Field>
        <Field label="Payment timing" required>
          <SelectBox value={state.paymentTiming} onChange={(v) => setState((s) => ({ ...s, paymentTiming: v }))} options={PAYMENT_TERMS} />
        </Field>
        <Field label="Credit period (days)">
          <Input type="number" value={state.creditPeriod} onChange={(e) => setState((s) => ({ ...s, creditPeriod: e.target.value }))} placeholder="30" />
        </Field>
        <Field label="Tolerance (optional)">
          <Input type="number" value={state.tolerance} onChange={(e) => setState((s) => ({ ...s, tolerance: e.target.value }))} placeholder="e.g. 5 (%)" />
        </Field>
      </div>

      {/* ── Buyer Financing Toggle — DATA-SOVEREIGN (per v17 Section 7.6) ── */}
      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium mb-2">Do you need financing for this trade?</p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => setState((s) => ({
              ...s,
              buyerFinancingRequired: true,
              // Data-sovereign: NO shared/counterparty/either-party flags
              buyerFinancingShared: false,
              buyerFinancingCounterparty: false,
              buyerFinancingEitherParty: false,
            }))}
            className={cn(
              "p-3 rounded-md border text-sm font-medium",
              state.buyerFinancingRequired ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            )}
          >
            Yes — I need financing
          </button>
          <button
            onClick={() => setState((s) => ({ ...s, buyerFinancingRequired: false, financingInterest: "" }))}
            className={cn(
              "p-3 rounded-md border text-sm font-medium",
              !state.buyerFinancingRequired ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
            )}
          >
            No — I&apos;ll pay directly
          </button>
        </div>
        {state.buyerFinancingRequired && (
          <div className="mt-3 pl-2 border-l-2 border-primary/20 space-y-2">
            <Field label="Financing details (free text, buyer-side only)">
              <Textarea
                value={state.financingInterest}
                onChange={(e) => setState((s) => ({ ...s, financingInterest: e.target.value }))}
                placeholder="e.g. We need 60% of trade value, prefer 90-day tenor"
                className="min-h-[60px]"
              />
            </Field>
            <div className="p-2.5 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground flex items-start gap-2">
              <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              <span>
                <strong>Your financing request is private.</strong> The seller does not see it. A financier
                will be notified to issue a <strong>Conditional Financing Reference (CFR)</strong>, and you choose
                whether to disclose your financing needs to the seller via CFR pre-clearance.
                Per v17 Section 7.6 — buyer financing is <em>data-sovereign</em>: no shared/counterparty/either-party flags are set.
              </span>
            </div>
          </div>
        )}
      </div>

      {needsInsurance && (
        <div className="p-2.5 rounded-md bg-amber-50/50 dark:bg-amber-950/10 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>This Incoterm ({state.incoterm}) obliges the seller to insure cargo during main carriage. You&apos;ll review insurance details in Section 9.</span>
        </div>
      )}

      <SuggestedHint>These are your preferences, not final contract terms. They&apos;ll be part of the negotiation with the seller.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 3 — Transport Mode & Equipment (mode BEFORE containers) — G1U7, G1U8
// ───────────────────────────────────────────────────────────────────────────────

function Section3Transport({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const modeAwareEquipment: Record<string, { value: string; label: string }[]> = {
    OCEAN: [
      { value: "20DRY", label: "20' Dry Container" }, { value: "40DRY", label: "40' Dry Container" },
      { value: "40HC", label: "40' High Cube" }, { value: "20REF", label: "20' Reefer" }, { value: "40REF", label: "40' Reefer" },
      { value: "20TK", label: "20' Tank" }, { value: "40TK", label: "40' Tank" },
      { value: "20OT", label: "20' Open Top" }, { value: "40OT", label: "40' Open Top" },
      { value: "20FR", label: "20' Flat Rack" }, { value: "40FR", label: "40' Flat Rack" },
    ],
    AIR: [
      { value: "ULD_AKE", label: "LD3 AKE ULD" }, { value: "ULD_LD6", label: "LD6 ULD" },
      { value: "ULD_PAG", label: "LD7 PAG ULD" }, { value: "BULK_PALLET", label: "Bulk / Pallet" },
    ],
    RAIL: [{ value: "WAGON_DRY", label: "Dry Wagon" }, { value: "WAGON_REEFER", label: "Reefer Wagon" }, { value: "WAGON_TANK", label: "Tank Wagon" }],
    TRUCK: [{ value: "TRAILER_DRY", label: "Dry Trailer" }, { value: "TRAILER_REEFER", label: "Reefer Trailer" }, { value: "TRAILER_TANK", label: "Tank Trailer" }, { value: "TRAILER_FLATBED", label: "Flatbed" }],
    RORO: [{ value: "ROLLTRAILER", label: "Roll-trailer (MAFI)" }, { value: "MAFI", label: "MAFI trailer" }, { value: "VEHICLE_DECK", label: "Vehicle on deck" }],
    MULTIMODAL: [{ value: "CONTAINER_20", label: "20' Container" }, { value: "CONTAINER_40", label: "40' Container" }, { value: "CONTAINER_40HC", label: "40' HC" }, { value: "CONTAINER_40REF", label: "40' Reefer" }],
  };
  const equipmentOptions = modeAwareEquipment[state.transportMode] || [];
  // Estimated transit time by mode (per v17 reference data)
  const transitEstimate: Record<string, number> = { OCEAN: 21, AIR: 3, RAIL: 12, TRUCK: 5, RORO: 14, MULTIMODAL: 18 };
  // Sea-only incoterms (FAS, FOB, CFR, CIF) restrict the mode picker to Ocean / Ro-Ro.
  const isSeaOnlyIncoterm = state.incoterm && SEA_ONLY_INCOTERMS.has(state.incoterm);
  const isModeAllowed = (mode: string) =>
    !isSeaOnlyIncoterm || mode === "OCEAN" || mode === "RORO";

  return (
    <div className="space-y-4">
      <StepHeader icon={Truck} title="How should your goods arrive?" desc="Choose transport mode FIRST, then equipment. Per v17 canonical order, the mode determines what equipment is available." />
      <div className="space-y-4">
        <Field label="Transport mode" required>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {TRANSPORT_MODES.map((m) => {
              const allowed = isModeAllowed(m.value);
              return (
                <button
                  key={m.value}
                  disabled={!allowed}
                  onClick={() => allowed && setState((s) => ({
                    ...s,
                    transportMode: m.value,
                    equipmentType: (modeAwareEquipment[m.value]?.[0] || { value: "40DRY" }).value,
                    transitTimeDays: transitEstimate[m.value] ?? null,
                    // Reset AI advisor — it must re-run after a mode change
                    aiContainerAdvisorRun: false,
                    aiContainerAdvisorResult: null,
                  }))}
                  className={cn(
                    "p-2.5 rounded-md border text-sm font-medium transition",
                    state.transportMode === m.value ? "border-primary bg-primary/10 text-primary" : allowed ? "border-border hover:bg-muted" : "border-border bg-muted/20 text-muted-foreground/40 cursor-not-allowed",
                  )}
                  title={allowed ? m.label : `${m.label} is not allowed for Incoterm ${state.incoterm} (sea-only)`}
                >
                  {m.label}
                </button>
              );
            })}
          </div>
          {isSeaOnlyIncoterm && (
            <p className="text-[0.7rem] text-muted-foreground mt-1.5 flex items-center gap-1.5">
              <Info className="w-3 h-3" />
              Incoterm {state.incoterm} is sea / inland-waterway only — air, rail, truck, and multimodal are disabled.
              Use FCA / CPT / CIP / DAP for containerised cargo by other modes.
            </p>
          )}
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Equipment type">
            <SelectBox value={state.equipmentType} onChange={(v) => setState((s) => ({ ...s, equipmentType: v }))} options={equipmentOptions} />
          </Field>
          <Field label="Estimated transit time (days)">
            <Input
              type="number"
              value={state.transitTimeDays ?? ""}
              onChange={(e) => setState((s) => ({ ...s, transitTimeDays: e.target.value ? parseInt(e.target.value, 10) : null }))}
              placeholder="e.g. 21"
            />
          </Field>
        </div>

        {state.transitTimeDays && (
          <div className="p-2.5 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground flex items-start gap-2">
            <Clock className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Suggested transit time: {state.transitTimeDays} days. Used by Gate G1U24 to validate the delivery window.</span>
          </div>
        )}
      </div>
      <SuggestedHint>Container configuration is the next section — choose your mode and equipment here first.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 4 — Container/Unit & Commodity Configuration (1–50, Acceptance Matrix)
// G1U9, G1U10, G1U11, G1U12, G1U13, G1U14
// ───────────────────────────────────────────────────────────────────────────────

function Section4Container({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  // Real-time weight: gross = quantity * 1000 (kg), net = gross * 0.95 (default 5% loss)
  const qtyNum = parseFloat(state.quantity || "0") || 0;
  const unitIsKg = state.quantityUnit === "KG";
  const computedGross = unitIsKg ? qtyNum : qtyNum * 1000;
  const computedNet = Math.round(computedGross * 0.95);

  // Sync computed weights back into state when quantity changes
  useEffect(() => {
    setState((s) => ({
      ...s,
      grossWeightKg: s.quantity ? (s.quantityUnit === "KG" ? parseFloat(s.quantity) : parseFloat(s.quantity) * 1000) : 0,
      netWeightKg: s.quantity ? Math.round((s.quantityUnit === "KG" ? parseFloat(s.quantity) : parseFloat(s.quantity) * 1000) * 0.95) : 0,
    }));
  }, [state.quantity, state.quantityUnit]);

  const equipCount = parseInt(state.equipmentCount || "0", 10);
  const over50 = equipCount > 50;
  const perUnitWeight = equipCount > 0 ? Math.round(computedGross / equipCount) : 0;
  const overweightPerUnit = state.transportMode === "OCEAN" && perUnitWeight > (state.equipmentType?.includes("40") ? 26000 : 13000);

  return (
    <div className="space-y-4">
      <StepHeader icon={Package} title="Container & commodity configuration" desc="Tell us about the goods and how they're packed. We'll show you the total weight in real time." />

      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Commodity / product" required full>
          <Input value={state.commodity} onChange={(e) => setState((s) => ({ ...s, commodity: e.target.value }))} placeholder="e.g. Egyptian Valencia oranges" />
        </Field>
        <Field label="HS code (optional)">
          <Input value={state.commodityHs} onChange={(e) => setState((s) => ({ ...s, commodityHs: e.target.value }))} placeholder="e.g. 0805.10" className="font-mono" />
        </Field>
        <Field label="Grade / specification">
          <Input value={state.gradeSpec} onChange={(e) => setState((s) => ({ ...s, gradeSpec: e.target.value }))} placeholder="e.g. Grade A, 56-64mm, class I" />
        </Field>
        <Field label="Quantity" required>
          <Input type="number" value={state.quantity} onChange={(e) => setState((s) => ({ ...s, quantity: e.target.value }))} placeholder="e.g. 500" />
        </Field>
        <Field label="Unit">
          <SelectBox value={state.quantityUnit} onChange={(v) => setState((s) => ({ ...s, quantityUnit: v }))} options={UNITS.map((u) => ({ value: u, label: u }))} />
        </Field>
        <Field label="Number of containers / units (1–50)" required>
          <Input
            type="number"
            value={state.equipmentCount}
            onChange={(e) => setState((s) => ({ ...s, equipmentCount: e.target.value }))}
            placeholder="1"
            className={over50 ? "border-red-500" : ""}
          />
        </Field>
        <Field label="Packaging (optional)">
          <Input value={state.packaging} onChange={(e) => setState((s) => ({ ...s, packaging: e.target.value }))} placeholder="e.g. 400g bags on pallets" />
        </Field>
      </div>

      {/* Real-time weight display (G1U13 — net ≤ gross) */}
      <div className="grid sm:grid-cols-3 gap-3">
        <Card className="p-3 bg-muted/20">
          <p className="text-xs text-muted-foreground">Gross weight (computed)</p>
          <p className="text-lg font-semibold">{computedGross.toLocaleString()} kg</p>
        </Card>
        <Card className="p-3 bg-muted/20">
          <p className="text-xs text-muted-foreground">Net weight (95%)</p>
          <p className="text-lg font-semibold">{computedNet.toLocaleString()} kg</p>
        </Card>
        <Card className="p-3 bg-muted/20">
          <p className="text-xs text-muted-foreground">Per unit</p>
          <p className="text-lg font-semibold">{perUnitWeight.toLocaleString()} kg</p>
        </Card>
      </div>

      {over50 && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Maximum 50 containers / units per trade request (Gate G1U10). For larger shipments use multi-shipment mode.</span>
        </div>
      )}
      {overweightPerUnit && !over50 && (
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>This shipment may exceed the selected container&apos;s permitted weight ({perUnitWeight.toLocaleString()} kg / unit). Recommended: increase the number of containers or reduce quantity.</span>
        </div>
      )}

      {/* Acceptance Criteria Matrix — G1U14 */}
      <div className="border-t border-border pt-3 space-y-3">
        <p className="text-sm font-medium flex items-center gap-2">
          <ShieldCheck className="w-4 h-4" /> Acceptance Criteria Matrix
          <Badge variant="outline" className="text-[0.6rem] text-amber-700 dark:text-amber-300 border-amber-500/40">Required for perishables</Badge>
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Quality grade">
            <Input value={state.acceptanceCriteria.qualityGrade || ""} onChange={(e) => setState((s) => ({ ...s, acceptanceCriteria: { ...s.acceptanceCriteria, qualityGrade: e.target.value } }))} placeholder="e.g. Grade A, Class I" />
          </Field>
          <Field label="Temperature range">
            <Input value={state.acceptanceCriteria.temperature || ""} onChange={(e) => setState((s) => ({ ...s, acceptanceCriteria: { ...s.acceptanceCriteria, temperature: e.target.value } }))} placeholder="e.g. 2-4°C" />
          </Field>
          <Field label="Humidity range (optional)">
            <Input value={state.acceptanceCriteria.humidity || ""} onChange={(e) => setState((s) => ({ ...s, acceptanceCriteria: { ...s.acceptanceCriteria, humidity: e.target.value } }))} placeholder="e.g. 85-90% RH" />
          </Field>
          <Field label="Weight tolerance (optional)">
            <Input value={state.acceptanceCriteria.weightTolerance || ""} onChange={(e) => setState((s) => ({ ...s, acceptanceCriteria: { ...s.acceptanceCriteria, weightTolerance: e.target.value } }))} placeholder="e.g. ±2%" />
          </Field>
        </div>
      </div>

      {/* Cold chain — progressive disclosure */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setState((s) => ({ ...s, temperatureControlled: !s.temperatureControlled }))}
          className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <Thermometer className="w-4 h-4" />
          {state.temperatureControlled ? "Cold chain: Yes (click to remove)" : "Does this shipment need temperature control? (click to add)"}
        </button>
        {state.temperatureControlled && (
          <div className="mt-3 grid sm:grid-cols-2 gap-4">
            <Field label="Temperature range">
              <Input value={state.temperatureRange} onChange={(e) => setState((s) => ({ ...s, temperatureRange: e.target.value }))} placeholder="e.g. 2-4°C" />
            </Field>
            <Field label="Shelf life (optional)">
              <Input value={state.shelfLife} onChange={(e) => setState((s) => ({ ...s, shelfLife: e.target.value }))} placeholder="e.g. 21 days" />
            </Field>
          </div>
        )}
      </div>

      {/* Advanced: partial shipment / transshipment */}
      <details className="border-t border-border pt-3">
        <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">Advanced: shipment options</summary>
        <div className="mt-3 grid sm:grid-cols-2 gap-4">
          <Field label="Allow partial shipment?">
            <button onClick={() => setState((s) => ({ ...s, partialShipment: !s.partialShipment }))} className={cn("px-4 h-9 rounded-md border text-sm font-medium", state.partialShipment ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {state.partialShipment ? "Yes" : "No"}
            </button>
          </Field>
          <Field label="Allow transshipment?">
            <button onClick={() => setState((s) => ({ ...s, transshipment: !s.transshipment }))} className={cn("px-4 h-9 rounded-md border text-sm font-medium", state.transshipment ? "border-primary bg-primary/10 text-primary" : "border-border")}>
              {state.transshipment ? "Yes" : "No"}
            </button>
          </Field>
        </div>
      </details>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 5 — Lab Test Requirements (Mandatory/Recommended/Optional, RIA-driven)
// G1U15, G1U16
// ───────────────────────────────────────────────────────────────────────────────

function Section5LabTests({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  // Per v17 — perishables lock mandatory tests
  const isPerishable = state.temperatureControlled ||
    (state.commodityHs && ["0805", "0806", "0810", "0811", "0901", "0904", "0906", "2005", "2006", "2007", "2008", "2009"].some(p => state.commodityHs.startsWith(p)));

  // On mount / when perishable flag changes, lock mandatory tests
  useEffect(() => {
    if (!isPerishable) return;
    setState((s) => {
      const mandatoryTests = LAB_TESTS_CATALOG.filter(t => t.perishable && t.tier === "mandatory").map(t => t.id);
      if (JSON.stringify(s.labTestRequirements.mandatory) === JSON.stringify(mandatoryTests)) return s;
      const totalFee = mandatoryTests
        .map(id => LAB_TESTS_CATALOG.find(t => t.id === id)?.feeUsd || 0)
        .reduce((a, b) => a + b, 0);
      return {
        ...s,
        labTestRequirements: { ...s.labTestRequirements, mandatory: mandatoryTests },
        labTestsPriced: true,
        labTestsFeeUsd: totalFee,
      };
    });
  }, [isPerishable, state.commodityHs, state.temperatureControlled]);

  const toggleTest = (test: typeof LAB_TESTS_CATALOG[number]) => {
    setState((s) => {
      const reqs = { ...s.labTestRequirements };
      const list = (reqs as any)[test.tier] as string[];
      const idx = list.indexOf(test.id);
      if (test.tier === "mandatory" && isPerishable) {
        // Locked — cannot unselect
        return s;
      }
      if (idx >= 0) list.splice(idx, 1);
      else list.push(test.id);
      (reqs as any)[test.tier] = list;
      // Recompute fee
      const allSelected = [...reqs.mandatory, ...reqs.recommended, ...reqs.optional];
      const totalFee = allSelected
        .map(id => LAB_TESTS_CATALOG.find(t => t.id === id)?.feeUsd || 0)
        .reduce((a, b) => a + b, 0);
      return { ...s, labTestRequirements: reqs, labTestsFeeUsd: totalFee, labTestsPriced: true };
    });
  };

  const totalFee = state.labTestsFeeUsd || 0;

  return (
    <div className="space-y-4">
      <StepHeader icon={FlaskConical} title="Lab test requirements" desc="Choose which quality and safety tests you need. Mandatory tests are locked for perishable goods. Each test shows its explicit price." />

      {isPerishable && (
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <ShieldCheck className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Perishable goods require mandatory lab tests (pesticide residue, microbiology, heavy metals). These tests are locked and cannot be deselected.</span>
        </div>
      )}

      <div className="space-y-4">
        {(["mandatory", "recommended", "optional"] as const).map(tier => {
          const tierLabel = tier === "mandatory" ? "Mandatory" : tier === "recommended" ? "Recommended" : "Optional";
          const tierTests = LAB_TESTS_CATALOG.filter(t => t.tier === tier);
          const selected = (state.labTestRequirements as any)[tier] as string[];
          return (
            <div key={tier} className="space-y-2">
              <p className="text-sm font-medium">{tierLabel} tests
                {tier === "mandatory" && isPerishable && <Badge variant="outline" className="text-[0.6rem] ms-2 text-amber-700 dark:text-amber-300 border-amber-500/40">Locked</Badge>}
              </p>
              <div className="space-y-1.5">
                {tierTests.map(test => {
                  const isSelected = selected.includes(test.id);
                  const isLocked = tier === "mandatory" && isPerishable;
                  return (
                    <button
                      key={test.id}
                      onClick={() => !isLocked && toggleTest(test)}
                      disabled={isLocked}
                      className={cn(
                        "w-full text-left p-2.5 rounded-md border text-sm flex items-start justify-between gap-2 transition",
                        isSelected ? "border-primary/40 bg-primary/5" : "border-border hover:bg-muted",
                        isLocked && "opacity-90 cursor-not-allowed",
                      )}
                    >
                      <div className="flex items-start gap-2">
                        {isSelected ? <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" /> :
                          isLocked ? <CheckCircle2 className="w-4 h-4 text-primary/70 mt-0.5 flex-shrink-0" /> :
                          <div className="w-4 h-4 rounded border border-border mt-0.5 flex-shrink-0" />}
                        <div>
                          <p className="font-medium">{test.label}</p>
                          {test.perishable && <p className="text-[0.65rem] text-muted-foreground">Recommended for perishable goods</p>}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">${test.feeUsd}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <div className="p-3 rounded-md bg-muted/20 border border-border flex items-center justify-between">
        <p className="text-sm font-medium">Total lab test fee</p>
        <p className="text-sm font-semibold font-mono">${totalFee.toLocaleString()} USD</p>
      </div>

      <SuggestedHint>Each test is explicitly priced. Mandatory tests for perishables are required by importing-country regulators (EU MRL, FDA FSMA, etc.).</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 6 — QC Inspection Request (geography-aware, provider coverage, price ranges)
// G1U17, G1U18
// ───────────────────────────────────────────────────────────────────────────────

function Section6QcInspection({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  // Check provider coverage when dest country or type changes
  useEffect(() => {
    if (!state.qcInspectionType || state.qcInspectionType === "NONE" || !state.destCountry) {
      setState((s) => ({ ...s, qcInspectionProviderCoverage: false }));
      return;
    }
    // Mock coverage check — in production this would call /api/sgtx/providers/check-coverage
    // For now we deterministically return coverage=true for common destinations
    const coveredCountries = new Set(["EG", "NL", "DE", "GB", "FR", "IT", "ES", "SA", "AE", "US", "CN", "JP", "BR", "IN"]);
    const hasCoverage = coveredCountries.has(state.destCountry.toUpperCase());
    setState((s) => ({
      ...s,
      qcInspectionGeography: s.destCountry,
      qcInspectionProviderCoverage: hasCoverage,
      qcInspectionFeeUsd: hasCoverage ? (s.qcInspectionType === "DESTINATION" ? 420 : s.qcInspectionType === "INDEPENDENT" ? 580 : 280) : null,
    }));
  }, [state.qcInspectionType, state.destCountry]);

  return (
    <div className="space-y-4">
      <StepHeader icon={Microscope} title="QC inspection request" desc="Choose your inspection type. We'll validate the provider has coverage in your destination country and show anonymised historical price ranges." />
      <Field label="Inspection type" required>
        <SelectBox
          value={state.qcInspectionType || ""}
          onChange={(v) => setState((s) => ({ ...s, qcInspectionType: v || null }))}
          options={QC_INSPECTION_TYPES}
          placeholder="Select inspection type…"
        />
      </Field>

      {state.qcInspectionType && state.qcInspectionType !== "NONE" && (
        <div className="space-y-3">
          {/* Geography check */}
          <Card className={cn(
            "p-3 border",
            state.qcInspectionProviderCoverage
              ? "border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10"
              : "border-red-500/30 bg-red-50/30 dark:bg-red-950/10"
          )}>
            <div className="flex items-start gap-2">
              {state.qcInspectionProviderCoverage ?
                <CheckCircle2 className="w-4 h-4 text-emerald-600 mt-0.5 flex-shrink-0" /> :
                <AlertTriangle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="text-sm font-medium">
                  {state.qcInspectionProviderCoverage
                    ? `Provider has coverage in ${state.destCountry || "destination"}`
                    : `No provider coverage in ${state.destCountry || "destination"}`}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {state.qcInspectionProviderCoverage
                    ? `Estimated fee: $${state.qcInspectionFeeUsd?.toLocaleString() || "—"} USD`
                    : "Choose a different inspection type or remove the inspection request."}
                </p>
              </div>
            </div>
          </Card>

          {/* Anonymised historical price range */}
          <div className="p-3 rounded-md bg-muted/20 border border-border">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5" />
              Anonymised historical price range for {state.qcInspectionType.toLowerCase()} inspections: {state.qcInspectionPriceRange}
            </p>
          </div>
        </div>
      )}

      {state.qcInspectionType === "NONE" && (
        <div className="p-3 rounded-md bg-muted/20 border border-border text-xs text-muted-foreground">
          No QC inspection requested. The seller will not be required to provide independent quality verification.
        </div>
      )}

      <SuggestedHint>QC inspections protect you against quality disputes. We never reveal which specific provider you choose — only the type and geography are matched.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 7 — AI Container/Unit Advisor (advisory-only, mode-dependent) — G1U19
// ───────────────────────────────────────────────────────────────────────────────

function Section7AiAdvisor({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const [running, setRunning] = useState(false);

  const runAdvisor = useCallback(async () => {
    setRunning(true);
    try {
      const res = await fetchWithAuth("/api/sgtx/ai/container-advisor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transportMode: state.transportMode,
          equipmentType: state.equipmentType,
          equipmentCount: parseInt(state.equipmentCount || "1", 10),
          quantity: parseFloat(state.quantity || "0"),
          quantityUnit: state.quantityUnit,
          commodity: state.commodity,
          temperatureControlled: state.temperatureControlled,
        }),
      });
      let result: any;
      if (res.ok) {
        result = await res.json();
      } else {
        // Local deterministic fallback when the AI endpoint is unavailable
        const qty = parseFloat(state.quantity || "0") || 0;
        const grossKg = state.quantityUnit === "KG" ? qty : qty * 1000;
        const perUnit = grossKg / Math.max(parseInt(state.equipmentCount || "1", 10), 1);
        const maxPerUnit = state.equipmentType?.includes("40") ? 26000 : 13000;
        const recommendedContainers = Math.max(1, Math.ceil(grossKg / maxPerUnit));
        result = {
          advisor: "fallback",
          summary: `Based on your total weight (${grossKg.toLocaleString()} kg) and equipment type (${state.equipmentType}), we recommend ${recommendedContainers} unit(s).`,
          recommendations: [
            {
              type: "container_count",
              current: parseInt(state.equipmentCount || "1", 10),
              recommended: recommendedContainers,
              reason: `At ${perUnit.toLocaleString()} kg/unit, you're ${perUnit > maxPerUnit ? "OVER" : "near"} the safe payload (${maxPerUnit.toLocaleString()} kg/unit).`,
            },
            state.temperatureControlled && {
              type: "equipment",
              current: state.equipmentType,
              recommended: state.equipmentType?.includes("REF") ? state.equipmentType : state.equipmentType?.replace("DRY", "REF"),
              reason: "Cold chain selected — reefer container required.",
            },
          ].filter(Boolean),
        };
      }
      setState((s) => ({
        ...s,
        aiContainerAdvisorRun: true,
        aiContainerAdvisorResult: result,
      }));
    } catch (e: any) {
      setState((s) => ({
        ...s,
        aiContainerAdvisorRun: true,
        aiContainerAdvisorResult: { error: e?.message || "Advisor unavailable" },
      }));
    } finally {
      setRunning(false);
    }
  }, [state, setState]);

  const advisorRan = state.aiContainerAdvisorRun;
  const advisorResult = state.aiContainerAdvisorResult;

  return (
    <div className="space-y-4">
      <StepHeader icon={Bot} title="AI container advisor" desc="Advisory-only. The AI suggests the optimal container configuration based on your transport mode (Section 3) and commodity (Section 4). It runs after the mode is selected." />
      <div className="p-2.5 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground flex items-start gap-2">
        <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
        <span><strong>Advisory only.</strong> The advisor suggests improvements; it never modifies your configuration without your action. Per v17 Section 11 — AI suggestions are non-binding.</span>
      </div>

      {!advisorRan ? (
        <div className="text-center py-6">
          <Bot className="w-10 h-10 mx-auto text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground mt-2">Click below to run the advisor.</p>
          <Button className="mt-3" size="sm" onClick={runAdvisor} disabled={running || !state.transportMode}>
            {running ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <Sparkles className="w-3.5 h-3.5 me-1" />}
            {running ? "Running advisor…" : "Run AI advisor"}
          </Button>
          {!state.transportMode && <p className="text-xs text-muted-foreground mt-2">Choose a transport mode in Section 3 first.</p>}
        </div>
      ) : advisorResult?.error ? (
        <Card className="p-3 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300">Advisor unavailable</p>
          <p className="text-xs text-muted-foreground mt-1">{advisorResult.error}</p>
          <Button variant="outline" size="sm" className="mt-2" onClick={runAdvisor} disabled={running}>Retry</Button>
        </Card>
      ) : (
        <div className="space-y-3">
          <Card className="p-3 border-primary/30 bg-primary/5">
            <div className="flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium">Advisor summary</p>
                <p className="text-sm text-muted-foreground mt-1">{advisorResult?.summary}</p>
              </div>
            </div>
          </Card>
          {(advisorResult?.recommendations || []).map((rec: any, i: number) => (
            <Card key={i} className="p-3 border-border">
              <p className="text-xs text-muted-foreground mb-1 font-mono uppercase tracking-wide">{rec.type.replace(/_/g, " ")}</p>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs"><span className="text-muted-foreground">Current:</span> <span className="font-mono">{String(rec.current)}</span></p>
                  <p className="text-xs"><span className="text-muted-foreground">Recommended:</span> <span className="font-mono font-semibold text-primary">{String(rec.recommended)}</span></p>
                  <p className="text-xs text-muted-foreground mt-1">{rec.reason}</p>
                </div>
                {String(rec.recommended) !== String(rec.current) && (
                  <Button variant="outline" size="sm" onClick={() => {
                    setState((s) => {
                      if (rec.type === "container_count") return { ...s, equipmentCount: String(rec.recommended) };
                      if (rec.type === "equipment") return { ...s, equipmentType: String(rec.recommended) };
                      return s;
                    });
                  }}>
                    Apply
                  </Button>
                )}
              </div>
            </Card>
          ))}
          <Button variant="outline" size="sm" onClick={runAdvisor} disabled={running}>
            {running ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : null}
            Re-run advisor
          </Button>
        </div>
      )}

      <SuggestedHint>You can accept, ignore, or override any advisor recommendation. The advisor runs only after Section 3 (transport mode) is complete.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 8 — Documentation Requirements (trigger-driven) — G1U20
// ───────────────────────────────────────────────────────────────────────────────

function Section8Documents({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const { data, isLoading } = useQuery({
    queryKey: ["compliance-reqs", state.commodityHs, state.originCountry, state.destCountry, state.incoterm, state.transportMode, state.temperatureControlled],
    queryFn: async () => {
      const res = await fetchWithAuth("/api/sgtx/trade-request/documentation-requirements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCode: state.commodityHs || undefined,
          originCountry: state.originCountry,
          destCountry: state.destCountry,
          incoterm: state.incoterm,
          transportMode: state.transportMode,
          coldChain: state.temperatureControlled,
        }),
      });
      if (!res.ok) return { requirements: [] };
      return res.json();
    },
    enabled: !!(state.destCountry && state.incoterm),
  });

  // Mark documents as trigger-resolved once they arrive
  useEffect(() => {
    const reqs: any[] = data?.requirements || [];
    if (reqs.length > 0 && !state.documentsTriggerResolved) {
      setState((s) => ({ ...s, documentsTriggerResolved: true, documentRequirements: reqs }));
    }
  }, [data, state.documentsTriggerResolved]);

  const reqs: any[] = data?.requirements || [];

  // Trigger categories per v17 Section 6.8
  const triggerCategories: Record<string, any[]> = reqs.reduce((acc, r) => {
    const trigger = r.triggerCategory || r.trigger || "General";
    if (!acc[trigger]) acc[trigger] = [];
    acc[trigger].push(r);
    return acc;
  }, {} as Record<string, any[]>);

  return (
    <div className="space-y-4">
      <StepHeader icon={ShieldCheck} title="Documents needed for this shipment" desc="Automatically determined based on your product, destination, and transport mode. Trigger-driven (Shipment/Settlement/Customs/Financing)." />

      {!state.destCountry || !state.incoterm ? (
        <p className="text-sm text-muted-foreground">Complete the previous sections first — documents are generated from your trade details (Incoterm, destination, transport mode).</p>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Determining required documents…</div>
      ) : reqs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No specific document requirements detected. Baseline checks (sanctions, KYB) always apply.</p>
      ) : (
        <div className="space-y-3">
          {Object.entries(triggerCategories).map(([trigger, docs]) => (
            <div key={trigger}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{trigger}</p>
              <div className="space-y-2">
                {docs.map((r: any, i: number) => (
                  <div key={i} className="p-3 rounded-md border border-border bg-card/40">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{r.docName || r.docType}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{r.trigger || "Required for import clearance"}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Who provides it: {r.docType?.includes("PHYTO") || r.docType?.includes("ORIGIN") ? "Seller" : "Buyer/Broker"}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {r.mandatory && <Badge variant="outline" className="text-[0.6rem] text-amber-700 dark:text-amber-300 border-amber-500/40">Mandatory</Badge>}
                        <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">Pending</Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <SuggestedHint>Document requirements update automatically when you change the product, destination, or transport mode. Trigger categories follow v17 Section 6.8.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 9 — Insurance Requirements — G1U21, G1U22
// ───────────────────────────────────────────────────────────────────────────────

function Section9Insurance({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const sellerObligated = SELLER_INSURANCE_INCOTERMS.has(state.incoterm);

  return (
    <div className="space-y-4">
      <StepHeader icon={ShieldCheck} title="Insurance requirements" desc="Choose your cargo insurance preference. The Incoterm may already oblige the seller to insure during main carriage." />

      {sellerObligated && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span><strong>Incoterm {state.incoterm}</strong> obliges the seller to arrange and pay for cargo insurance during main carriage. You can still request additional coverage for the destination leg.</span>
        </div>
      )}

      <div className="space-y-3">
        <p className="text-sm font-medium">Do you need cargo insurance?</p>
        <div className="grid grid-cols-3 gap-2">
          <button onClick={() => setState((s) => ({ ...s, insuranceRequired: "yes" }))} className={cn("p-3 rounded-md border text-sm font-medium", state.insuranceRequired === "yes" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>Yes</button>
          <button onClick={() => setState((s) => ({ ...s, insuranceRequired: "no" }))} className={cn("p-3 rounded-md border text-sm font-medium", state.insuranceRequired === "no" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>No</button>
          <button onClick={() => setState((s) => ({ ...s, insuranceRequired: "according_to_incoterm" }))} className={cn("p-3 rounded-md border text-sm font-medium", state.insuranceRequired === "according_to_incoterm" ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted")}>Per Incoterm</button>
        </div>
        {state.insuranceRequired === "yes" && (
          <div className="grid sm:grid-cols-3 gap-4 pl-2 border-l-2 border-primary/20">
            <Field label="Coverage type">
              <SelectBox
                value={state.insuranceType}
                onChange={(v) => setState((s) => ({ ...s, insuranceType: v }))}
                options={[
                  { value: "ALL_RISK", label: "All Risk" },
                  { value: "FPA", label: "Free Particular Average" },
                  { value: "WA", label: "With Average" },
                  { value: "TLO", label: "Total Loss Only" },
                ]}
              />
            </Field>
            <Field label="Coverage %">
              <Input type="number" value={state.insuranceCoveragePct} onChange={(e) => setState((s) => ({ ...s, insuranceCoveragePct: e.target.value }))} placeholder="110" />
            </Field>
          </div>
        )}
      </div>

      <SuggestedHint>If you select &quot;Per Incoterm&quot; the insurance responsibility follows the Incoterm responsibility map shown in Section 2.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 10 — Delivery Window & Special Instructions — G1U23, G1U24, G1U25
// ───────────────────────────────────────────────────────────────────────────────

function Section10Delivery({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const e = state.earliestDelivery, p = state.preferredDelivery, l = state.latestDelivery;
  const orderOk = !(e && p && e > p) && !(p && l && p > l) && !(e && l && e > l);
  const transitOk = !state.transitTimeDays || !e || !l ||
    ((new Date(l).getTime() - new Date(e).getTime()) / 86_400_000) >= state.transitTimeDays;
  const siLen = (state.specialInstructions || "").length;

  return (
    <div className="space-y-4">
      <StepHeader icon={Calendar} title="Delivery window & special instructions" desc="Tell us when you need it delivered and any special handling instructions." />
      <div className="grid sm:grid-cols-3 gap-4">
        <Field label="Earliest (optional)">
          <Input type="date" value={state.earliestDelivery} onChange={(e) => setState((s) => ({ ...s, earliestDelivery: e.target.value }))} />
        </Field>
        <Field label="Preferred">
          <Input type="date" value={state.preferredDelivery || state.requiredDeliveryDate} onChange={(e) => setState((s) => ({ ...s, preferredDelivery: e.target.value }))} />
        </Field>
        <Field label="Latest (optional)">
          <Input type="date" value={state.latestDelivery} onChange={(e) => setState((s) => ({ ...s, latestDelivery: e.target.value }))} />
        </Field>
      </div>

      {!orderOk && (
        <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-xs text-red-700 dark:text-red-300 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Dates are out of order. Earliest must be before preferred, which must be before latest (Gate G1U23).</span>
        </div>
      )}
      {orderOk && !transitOk && (
        <div className="p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-start gap-2">
          <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>Delivery window is shorter than the carrier&apos;s transit time ({state.transitTimeDays} days). Extend the latest acceptable date (Gate G1U24).</span>
        </div>
      )}

      {/* Special handling — progressive disclosure */}
      <details className="border-t border-border pt-3">
        <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">Special handling requirements (optional)</summary>
        <div className="mt-3">
          <Textarea value={state.specialHandling} onChange={(e) => setState((s) => ({ ...s, specialHandling: e.target.value }))} placeholder="e.g. Fragile cargo, keep upright, avoid moisture" className="min-h-[60px]" />
        </div>
      </details>

      {/* Special instructions — G1U25 (≤2000 chars) */}
      <div className="border-t border-border pt-3 space-y-2">
        <Field label="Special instructions (optional, max 2000 chars)" full>
          <Textarea
            value={state.specialInstructions}
            onChange={(e) => setState((s) => ({ ...s, specialInstructions: e.target.value.substring(0, 2000) }))}
            placeholder="Any additional instructions for this trade"
            className="min-h-[80px]"
          />
        </Field>
        <p className={cn("text-xs text-right", siLen > 1900 ? "text-red-500" : "text-muted-foreground")}>
          {siLen}/2000
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 11 — Trade Criticality (Routine/Priority/Critical with AI suggestion) — G1U26
// ───────────────────────────────────────────────────────────────────────────────

function Section11Criticality({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const suggestion = state.criticalitySuggested;
  const confidence = state.criticalityConfidence ?? 0;
  const reasons = state.criticalityReasons ?? [];
  const isOverride = state.tradeCriticality && suggestion && state.tradeCriticality !== suggestion;
  const reasonTooShort = state.criticalityAdjustmentReason.trim().length < 20;

  return (
    <div className="space-y-4">
      <StepHeader icon={Gauge} title="Trade criticality" desc="Tell us how urgent this trade is. The AI suggests a criticality based on your trade details — you can accept or override it." />

      {/* AI suggestion badge */}
      {suggestion && (
        <Card className="p-3 border-primary/30 bg-primary/5">
          <div className="flex items-start gap-2">
            <Sparkles className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">AI suggestion: <span className="text-primary">{suggestion}</span></p>
              <p className="text-xs text-muted-foreground mt-1">Confidence: {(confidence * 100).toFixed(0)}%</p>
              <ul className="mt-2 space-y-1">
                {reasons.map((r, i) => (
                  <li key={i} className="text-xs flex items-start gap-1.5">
                    <span className="w-1 h-1 rounded-full bg-primary mt-1.5 flex-shrink-0" /> {r}
                  </li>
                ))}
              </ul>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onClick={() => setState((s) => ({
                  ...s,
                  tradeCriticality: suggestion as any,
                  criticalityAdjustmentReason: "",
                }))}
                disabled={state.tradeCriticality === suggestion}
              >
                Accept AI suggestion
              </Button>
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Choose criticality</p>
        <div className="grid sm:grid-cols-3 gap-3">
          {CRITICALITY_OPTIONS.map(opt => {
            const Icon = opt.icon;
            const selected = state.tradeCriticality === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setState((s) => ({ ...s, tradeCriticality: opt.value as any }))}
                className={cn(
                  "p-3 rounded-md border text-left transition",
                  selected
                    ? `border-${opt.color}-500/40 bg-${opt.color}-50 dark:bg-${opt.color}-950/20`
                    : "border-border hover:bg-muted",
                )}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Icon className={cn("w-4 h-4", selected && `text-${opt.color}-600`)} />
                  <span className="text-sm font-medium">{opt.label}</span>
                </div>
                <p className="text-xs text-muted-foreground">{opt.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Mandatory adjustment reason if user overrides AI suggestion */}
      {isOverride && (
        <div className="space-y-2">
          <Field label="Reason for overriding the AI suggestion (required, ≥20 chars)" required full>
            <Textarea
              value={state.criticalityAdjustmentReason}
              onChange={(e) => setState((s) => ({ ...s, criticalityAdjustmentReason: e.target.value }))}
              placeholder="e.g. Customer has a hard deadline of [date] and cannot accept delay; contractually bound to Critical handling."
              className="min-h-[60px]"
            />
          </Field>
          {reasonTooShort && (
            <p className="text-xs text-red-500">Reason must be at least 20 characters (currently {state.criticalityAdjustmentReason.trim().length}).</p>
          )}
        </div>
      )}

      <SuggestedHint>Criticality affects SLA, expedite fees, and Governor routing. Perishable goods, high-risk destinations, and high-value trades are auto-elevated to Priority or higher.</SuggestedHint>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 12 — Feasibility Check (runs 33 validation gates G1U1–G1U33)
// ───────────────────────────────────────────────────────────────────────────────

function Section12Feasibility({ state, onReRun }: { state: WizardState; onReRun: () => void }) {
  const result = state.validationResult;
  if (!result) {
    return (
      <div className="space-y-4">
        <StepHeader icon={AlertTriangle} title="Feasibility check" desc="Running the 33 Phase 1 validation gates (G1U1–G1U33)…" />
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Validating…
        </div>
        <Button variant="outline" size="sm" onClick={onReRun}>Re-run validation</Button>
      </div>
    );
  }

  const criticalGates = result.gates.filter(g => g.severity === "CRITICAL");
  const warningGates = result.gates.filter(g => g.severity === "WARNING");
  const criticalFails = criticalGates.filter(g => !g.passed);
  const warningFails = warningGates.filter(g => !g.passed);

  return (
    <div className="space-y-4">
      <StepHeader icon={AlertTriangle} title="Feasibility check" desc="All 33 Phase 1 validation gates have been evaluated. CRITICAL gates must pass before submission." />

      {/* Headline verdict */}
      {result.passed ? (
        <Card className="p-4 border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-950/10">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <p className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
              Trade appears feasible — {result.criticalPassed}/{result.criticalTotal} critical gates passed
            </p>
          </div>
          {warningFails.length > 0 && (
            <p className="text-xs text-muted-foreground mt-2">
              {warningFails.length} warning{warningFails.length === 1 ? "" : "s"} to consider — they won&apos;t block submission but you may want to address them.
            </p>
          )}
        </Card>
      ) : (
        <Card className="p-4 border-red-500/30 bg-red-50/30 dark:bg-red-950/10">
          <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">
            {criticalFails.length} critical {criticalFails.length === 1 ? "gate" : "gates"} need{criticalFails.length === 1 ? "s" : ""} your attention before this request can be sent.
          </p>
          <ul className="space-y-2">
            {criticalFails.map(g => (
              <li key={g.gateId} className="text-xs flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{g.gateId}: {g.message}</p>
                  {g.remediation && <p className="text-muted-foreground mt-0.5">{g.remediation}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Warnings */}
      {warningFails.length > 0 && (
        <Card className="p-4 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
          <p className="text-sm font-medium text-amber-700 dark:text-amber-300 mb-2">
            {warningFails.length} warning{warningFails.length === 1 ? "" : "s"} (non-blocking)
          </p>
          <ul className="space-y-2">
            {warningFails.map(g => (
              <li key={g.gateId} className="text-xs flex items-start gap-2">
                <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">{g.gateId}: {g.message}</p>
                  {g.remediation && <p className="text-muted-foreground mt-0.5">{g.remediation}</p>}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* All 33 gates — expandable */}
      <details className="border-t border-border pt-3">
        <summary className="text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground">
          View all 33 validation gates ({result.criticalPassed}/{result.criticalTotal} critical passed)
        </summary>
        <div className="mt-3 max-h-96 overflow-y-auto custom-scroll space-y-1">
          {result.gates.map(g => (
            <div key={g.gateId} className={cn(
              "p-2 rounded border flex items-start gap-2 text-xs",
              g.passed ? "border-emerald-500/20 bg-emerald-50/20 dark:bg-emerald-950/10" :
                g.severity === "CRITICAL" ? "border-red-500/30 bg-red-50/20 dark:bg-red-950/10" :
                "border-amber-500/30 bg-amber-50/20 dark:bg-amber-950/10",
            )}>
              {g.passed ?
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mt-0.5 flex-shrink-0" /> :
                g.severity === "CRITICAL" ?
                  <AlertTriangle className="w-3.5 h-3.5 text-red-500 mt-0.5 flex-shrink-0" /> :
                  <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />}
              <div>
                <p className="font-mono font-semibold">{g.gateId}</p>
                <p className="text-muted-foreground">{g.message}</p>
                {!g.passed && g.remediation && <p className="text-foreground mt-0.5">{g.remediation}</p>}
              </div>
            </div>
          ))}
        </div>
      </details>

      <Button variant="outline" size="sm" onClick={onReRun}>
        <Loader2 className="w-3.5 h-3.5 me-1" />
        Re-run validation
      </Button>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// SECTION 13 — Trade Brief & Submit
// ───────────────────────────────────────────────────────────────────────────────

function Section13Brief({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const incotermResp = state.incoterm ? INCOTERM_RESPONSIBILITIES[state.incoterm] : null;
  const result = state.validationResult;

  return (
    <div className="space-y-4">
      <StepHeader icon={CheckCircle2} title="Your trade brief" desc="Review everything before submitting. This is what the seller will see." />

      {/* Human-readable summary */}
      <Card className="p-4 bg-muted/20">
        <p className="text-sm leading-relaxed">
          <strong>{state.quantity ? `${state.quantity} ${state.quantityUnit}` : "—"} {state.commodity || "(product)"}</strong>{" "}
          from <strong>{state.originCountry || "—"}</strong> to <strong>{state.destCountry || "—"}</strong>
          {state.destPort && ` (${state.destPort})`},
          {" "}<strong>{state.incoterm || "—"}</strong>, <strong>{state.currency}</strong>
          {state.targetPrice && ` ${state.targetPrice}/${state.quantityUnit}`},
          {" "}delivery <strong>{state.preferredDelivery || state.requiredDeliveryDate || "—"}</strong>
          {state.temperatureControlled && ", temperature-controlled"}
          {state.transportMode && `, ${state.transportMode.toLowerCase()} transport`}
          {state.counterpartyGtid && <> from <strong>{state.counterpartyName}</strong></>}.
          {" "}<strong className="text-primary">Criticality: {state.tradeCriticality || "—"}</strong>
        </p>
      </Card>

      {/* Structured brief */}
      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <BriefRow label="Product" value={state.commodity} />
        <BriefRow label="Quantity" value={`${state.quantity || "—"} ${state.quantityUnit}`} />
        <BriefRow label="Origin" value={[state.originCountry, state.originPort].filter(Boolean).join(", ") || "—"} />
        <BriefRow label="Destination" value={[state.destCountry, state.destPort].filter(Boolean).join(", ") || "—"} />
        <BriefRow label="Incoterm" value={state.incoterm || "—"} />
        <BriefRow label="Transport" value={TRANSPORT_MODES.find(m => m.value === state.transportMode)?.label || state.transportMode} />
        <BriefRow label="Equipment" value={`${state.equipmentCount || 1} × ${state.equipmentType}`} />
        <BriefRow label="Delivery" value={state.preferredDelivery || state.requiredDeliveryDate || "—"} />
        <BriefRow label="Currency" value={state.currency} />
        <BriefRow label="Target price" value={state.targetPrice ? `${state.currency} ${state.targetPrice}` : "—"} />
        <BriefRow label="Payment" value={PAYMENT_TERMS.find((p) => p.value === state.paymentTerms)?.label || state.paymentTerms} />
        <BriefRow label="Insurance" value={state.insuranceRequired === "yes" ? "Required" : state.insuranceRequired === "no" ? "Not required" : "Per Incoterm"} />
        <BriefRow label="Financing" value={state.buyerFinancingRequired ? "Requested (private — data-sovereign)" : "Not required"} />
        <BriefRow label="QC inspection" value={state.qcInspectionType && state.qcInspectionType !== "NONE" ? state.qcInspectionType : "None"} />
        <BriefRow label="Lab tests" value={`${state.labTestRequirements.mandatory.length} mandatory, ${state.labTestRequirements.recommended.length} recommended, ${state.labTestRequirements.optional.length} optional`} />
        <BriefRow label="Criticality" value={state.tradeCriticality || "—"} />
        <BriefRow label="Criticality (AI)" value={state.criticalitySuggested ? `${state.criticalitySuggested} (${((state.criticalityConfidence ?? 0) * 100).toFixed(0)}%)` : "—"} />
        <BriefRow label="Cold chain" value={state.temperatureControlled ? `Yes (${state.temperatureRange})` : "No"} />
      </div>

      {/* Validation summary */}
      {result && (
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium mb-2">Validation gates (Section 12)</p>
          <p className={cn("text-xs", result.passed ? "text-emerald-700 dark:text-emerald-300" : "text-red-700 dark:text-red-300")}>
            {result.criticalPassed}/{result.criticalTotal} critical gates passed · {result.warnings} warning{result.warnings === 1 ? "" : "s"}
          </p>
        </div>
      )}

      {/* Buyer responsibilities */}
      {incotermResp && (
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium mb-2">Your responsibilities</p>
          <ul className="space-y-1">
            {incotermResp.buyer.map((r, i) => (
              <li key={i} className="text-xs flex items-start gap-2">
                <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5 flex-shrink-0" /> {r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Unknowns */}
      <div className="border-t border-border pt-3">
        <p className="text-sm font-medium mb-2">Not yet confirmed</p>
        <ul className="space-y-1">
          <li className="text-xs text-muted-foreground flex items-start gap-2"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> Final price (to be negotiated with seller)</li>
          <li className="text-xs text-muted-foreground flex items-start gap-2"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> USTN (generated at contract lock, not at request submission)</li>
          <li className="text-xs text-muted-foreground flex items-start gap-2"><Info className="w-3 h-3 mt-0.5 flex-shrink-0" /> Final settlement terms (your preferences are not binding contract terms)</li>
        </ul>
      </div>

      {/* Marketplace attribution acknowledgment — G1U33 */}
      <div className="border-t border-border pt-3 space-y-2">
        <label className="text-xs flex items-start gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={state.marketplaceAttributionAcknowledged}
            onChange={(e) => setState((s) => ({
              ...s,
              marketplaceAttribution: true,
              marketplaceAttributionAcknowledged: e.target.checked,
            }))}
            className="mt-0.5"
          />
          <span>
            I acknowledge this trade may be attributed to the SGTX marketplace and understand the 72-hour dispute window applies.
          </span>
        </label>
      </div>

      <div className="p-3 rounded-md bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
        <p className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          On submit, the Governor runs validation gates. If approved, the trade request is sent to the seller. USTN is generated when the contract is locked — not at submission.
        </p>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════════

// Compute a simple readiness score (0–100) — used by G1U32 (warning only)
function computeReadinessScore(state: WizardState): number {
  let score = 0;
  if (state.counterpartyGtid) score += 10;
  if (state.counterpartyVerified) score += 5;
  if (state.incoterm) score += 10;
  if (state.settlementStructure) score += 5;
  if (state.paymentTiming || state.paymentTerms) score += 5;
  if (state.currency) score += 3;
  if (state.transportMode) score += 10;
  if (state.equipmentType) score += 5;
  if (state.commodity) score += 10;
  if (state.quantity) score += 5;
  if (state.commodityHs) score += 3;
  if (state.acceptanceCriteria && (state.acceptanceCriteria.qualityGrade || state.acceptanceCriteria.temperature)) score += 5;
  if (!state.temperatureControlled || state.labTestRequirements.mandatory.length > 0) score += 5;
  if (state.qcInspectionType !== undefined) score += 2;
  if (state.aiContainerAdvisorRun) score += 3;
  if (state.documentRequirements?.length || state.documentsTriggerResolved) score += 5;
  if (state.insuranceRequired !== "yes" || state.insuranceType) score += 3;
  if (state.preferredDelivery) score += 3;
  if (state.tradeCriticality) score += 5;
  if (state.targetPrice) score += 3;
  if (state.marketplaceAttributionAcknowledged) score += 3;
  return Math.min(100, score);
}

// Mandatory field check — used by G1U31
function isMandatoryComplete(state: WizardState): boolean {
  return !!(
    state.counterpartyGtid &&
    state.counterpartyVerified &&
    state.incoterm &&
    state.settlementStructure &&
    (state.paymentTiming || state.paymentTerms) &&
    state.currency &&
    state.transportMode &&
    state.equipmentType &&
    state.commodity &&
    state.quantity &&
    parseInt(state.equipmentCount || "0", 10) >= 1 &&
    parseInt(state.equipmentCount || "0", 10) <= 50 &&
    (!state.temperatureControlled || state.labTestRequirements.mandatory.length > 0) &&
    (state.qcInspectionType === null || state.qcInspectionType === "NONE" || state.qcInspectionProviderCoverage) &&
    (state.documentRequirements?.length || 0) > 0 &&
    state.tradeCriticality &&
    (state.targetPrice || state.quantity) &&
    (!state.marketplaceAttribution || state.marketplaceAttributionAcknowledged)
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shared components
// ═══════════════════════════════════════════════════════════════════════════════

function StepHeader({ icon: Icon, title, desc }: { icon: any; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4 text-primary" />
      </div>
      <div>
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground mt-0.5">{desc}</p>
      </div>
    </div>
  );
}

function Field({ label, required, full, children }: { label: string; required?: boolean; full?: boolean; children: React.ReactNode }) {
  return (
    <div className={cn(full && "sm:col-span-2")}>
      <Label className="text-xs">{label} {required && <span className="text-red-500">*</span>}</Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SelectBox({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  );
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 p-2 rounded border border-border bg-card/40">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className="text-foreground text-right break-all">{value || "—"}</span>
    </div>
  );
}

function SuggestedHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 p-2.5 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground">
      <Lightbulb className="w-3.5 h-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
      <span>{children}</span>
    </div>
  );
}
