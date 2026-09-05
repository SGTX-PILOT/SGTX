"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 3: The Trade Request Wizard (/trades/new)
// ═══════════════════════════════════════════════════════════════════════════════
//
// The best-designed screen in the product. 6 steps, one idea per step:
//   1. TRADE NEED       — product, grade/spec, quantity, origin, destination, delivery date
//   2. COMMERCIAL TERMS — counterparty (GTID lookup), currency, price, Incoterm, payment terms
//   3. LOGISTICS        — mode (sea/air/road/rail/multimodal), temp-controlled?, packaging
//   4. COMPLIANCE       — auto-generated from jurisdiction rules (user does NOT pick)
//   5. FINANCE          — "Do you need financing?" [No → skip] [Yes → reveal options]
//   6. REVIEW           — human-readable summary → Create Trade Request
//
// Save-draft at every step (debounced 30s + on step change). Back/forward
// safe. Resumable from /trades?filter=drafts.
//
// On submit, calls the existing /api/sgtx/trade-request endpoint (no backend
// changes). The backend auto-generates USTN/TCC/obligations/document
// requirements — the user never constructs the machine.

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
  Package, FileText, Truck, ShieldCheck, DollarSign, Sparkles,
  Thermometer, MapPin, Calendar, Search, ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// ───────────────────────────────────────────────────────────────────────────────
// Types
// ───────────────────────────────────────────────────────────────────────────────

type StepId = 1 | 2 | 3 | 4 | 5 | 6;

interface WizardState {
  // Step 1 — Trade need
  commodity: string;
  commodityHs: string;
  gradeSpec: string;
  quantity: string;
  quantityUnit: string;
  originCountry: string;
  originPort: string;
  destCountry: string;
  destPort: string;
  requiredDeliveryDate: string;

  // Step 2 — Commercial terms
  counterpartyGtid: string;
  counterpartyName: string;
  currency: string;
  targetPrice: string;
  incoterm: string;
  paymentTerms: string;

  // Step 3 — Logistics
  transportMode: string;
  temperatureControlled: boolean;
  packaging: string;
  equipmentType: string;
  equipmentCount: string;

  // Step 5 — Finance
  needsFinancing: boolean;
  financingInterest: string;

  // Metadata
  draftId: string | null;
  lastSaved: string | null;
}

const INITIAL_STATE: WizardState = {
  commodity: "",
  commodityHs: "",
  gradeSpec: "",
  quantity: "",
  quantityUnit: "MT",
  originCountry: "",
  originPort: "",
  destCountry: "",
  destPort: "",
  requiredDeliveryDate: "",
  counterpartyGtid: "",
  counterpartyName: "",
  currency: "USD",
  targetPrice: "",
  incoterm: "",
  paymentTerms: "30_DAYS_NET",
  transportMode: "SEA",
  temperatureControlled: false,
  packaging: "",
  equipmentType: "20DRY",
  equipmentCount: "1",
  needsFinancing: false,
  financingInterest: "",
  draftId: null,
  lastSaved: null,
};

// Steps are defined with i18n keys; the title/desc are resolved via `t()`
// in the component. The icon is the only static part.
const STEP_ICONS = [Package, FileText, Truck, ShieldCheck, DollarSign, CheckCircle2] as const;
const STEP_TITLES = ["wizard.step1", "wizard.step2", "wizard.step3", "wizard.step4", "wizard.step5", "wizard.step6"] as const;
const STEP_DESCS = ["wizard.step1.desc", "wizard.step2.desc", "wizard.step3.desc", "wizard.step4.desc", "wizard.step5.desc", "wizard.step6.desc"] as const;

const INCOTERMS = ["EXW", "FCA", "FOB", "CFR", "CIF", "CPT", "CIP", "DAP", "DPU", "DDP"];
const TRANSPORT_MODES = [
  { value: "SEA", label: "Sea" },
  { value: "AIR", label: "Air" },
  { value: "ROAD", label: "Road" },
  { value: "RAIL", label: "Rail" },
  { value: "MULTIMODAL", label: "Multimodal" },
];
const UNITS = ["MT", "KG", "TON", "BOX", "PALLET", "CONTAINER"];
const CURRENCIES = ["USD", "EUR", "GBP", "EGP", "SAR", "AED", "CNY", "JPY"];
const PAYMENT_TERMS = [
  { value: "ADVANCE_PAYMENT", label: "Advance payment" },
  { value: "30_DAYS_NET", label: "30 days net" },
  { value: "60_DAYS_NET", label: "60 days net" },
  { value: "DOCUMENTARY_CREDIT", label: "Letter of credit (L/C)" },
  { value: "DOCUMENTARY_COLLECTION", label: "Documentary collection" },
];

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

  // Build the STEPS array with translated titles + descriptions.
  const STEPS = STEP_TITLES.map((titleKey, i) => ({
    id: (i + 1) as StepId,
    title: t(titleKey),
    desc: t(STEP_DESCS[i]),
    icon: STEP_ICONS[i],
  }));

  // ── Restore draft on mount ─────────────────────────────────────────────
  // The wizard is resumable from /trades?filter=drafts. On mount, we check
  // for an existing draft via /api/sgtx/trade-request/draft?buyerGtid=...
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
        // Hydrate state from the draft's parsedSpecs (if any).
        const parsed = draft.parsedSpecs ? JSON.parse(draft.parsedSpecs) : {};
        setState((s) => ({
          ...s,
          ...parsed,
          draftId: draft.draftId,
          lastSaved: draft.updatedAt,
        }));
        setDraftRestored(true);
        toast.info("Draft restored", { description: "Picking up where you left off." });
      } catch {
        // No draft — start fresh.
      }
    })();
    return () => { cancelled = true; };
  }, [ready, payload?.tenantGtid]);

  // ── Auto-save (debounced 30s + on step change) ─────────────────────────
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
          parsedSpecs: {
            commodity: s.commodity,
            commodityHs: s.commodityHs,
            gradeSpec: s.gradeSpec,
            quantity: s.quantity,
            quantityUnit: s.quantityUnit,
            originCountry: s.originCountry,
            originPort: s.originPort,
            destCountry: s.destCountry,
            destPort: s.destPort,
            requiredDeliveryDate: s.requiredDeliveryDate,
            counterpartyGtid: s.counterpartyGtid,
            counterpartyName: s.counterpartyName,
            currency: s.currency,
            targetPrice: s.targetPrice,
            paymentTerms: s.paymentTerms,
            transportMode: s.transportMode,
            temperatureControlled: s.temperatureControlled,
            packaging: s.packaging,
            equipmentType: s.equipmentType,
            equipmentCount: s.equipmentCount,
            needsFinancing: s.needsFinancing,
            financingInterest: s.financingInterest,
          },
          globalNotes: null,
        }),
      });
      const data = await res.json();
      if (res.ok && data.draftId) {
        setState((cur) => ({ ...cur, draftId: data.draftId, lastSaved: new Date().toISOString() }));
      }
    } catch {
      // Non-fatal — draft save failure should not block the user.
    } finally {
      setSaving(false);
    }
  }, [payload?.tenantGtid]);

  // Debounced save when state changes.
  useEffect(() => {
    if (!ready || !payload?.tenantGtid) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveDraft(state), 30000);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [state, ready, payload?.tenantGtid, saveDraft]);

  // Save on step change.
  const goToStep = useCallback((next: StepId) => {
    setStep(next);
    saveDraft(state);
  }, [state, saveDraft]);

  // ── Step validation ─────────────────────────────────────────────────────
  const stepValid = useMemo(() => {
    switch (step) {
      case 1:
        return !!(state.commodity && state.quantity && state.originCountry && state.destCountry);
      case 2:
        return !!(state.counterpartyGtid && state.incoterm);
      case 3:
        return !!state.transportMode;
      case 4:
        return true; // auto-generated, always valid
      case 5:
        return true; // optional
      case 6:
        return true;
    }
  }, [step, state]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function submit() {
    if (!payload?.tenantGtid) return;
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
        grossWeightKg: state.quantity ? parseFloat(state.quantity) * 1000 : undefined,
        netWeightKg: state.quantity ? parseFloat(state.quantity) * 1000 : undefined,
        tradeValueUsd: state.targetPrice ? parseFloat(state.targetPrice) : undefined,
        currency: state.currency,
        coldChain: state.temperatureControlled,
        transportMode: state.transportMode,
        equipmentType: state.equipmentType,
        equipmentCount: parseInt(state.equipmentCount || "1", 10),
        packaging: state.packaging || undefined,
        paymentTerms: state.paymentTerms,
        earliestDeliveryDate: state.requiredDeliveryDate || undefined,
        preferredDeliveryDate: state.requiredDeliveryDate || undefined,
        latestDeliveryDate: state.requiredDeliveryDate || undefined,
        financingInterest: state.needsFinancing ? state.financingInterest : undefined,
        containers: [
          {
            sequence: 1,
            equipmentType: state.equipmentType,
            grossWeightKg: state.quantity ? parseFloat(state.quantity) * 1000 : 0,
          },
        ],
      };
      const res = await fetchWithAuth("/api/sgtx/trade-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Failed to create trade request.");
        return;
      }
      // Success — redirect to the new trade workspace.
      const ustn = data.ustn || data.trade?.ustn;
      if (ustn) {
        toast.success("Trade request created", { description: `USTN: ${ustn.substring(0, 22)}…` });
        router.push(`/trades/${ustn}`);
      } else {
        toast.success("Trade request created");
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
          <ChevronLeft className="w-3.5 h-3.5" /> {t("trade.backToTrades")}
        </Link>
        <header>
          <h1 className="text-2xl font-semibold tracking-tight">{t("wizard.title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("wizard.subtitle")}{" "}
            <Link href="/trades?filter=drafts" className="text-primary hover:underline">{t("login.drafts")}</Link>
          </p>
        </header>

        {/* Progress bar */}
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
                  {completed ? (
                    <CheckCircle2 className="w-3 h-3" />
                  ) : (
                    <span className="w-3 h-3 rounded-full border border-current inline-flex items-center justify-center text-[0.5rem]">
                      {s.id}
                    </span>
                  )}
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sm:hidden">{s.id}</span>
                </button>
                {idx < STEPS.length - 1 && (
                  <div className={cn("w-3 h-px", completed ? "bg-emerald-500/40" : "bg-border")} />
                )}
              </div>
            );
          })}
        </div>

        {/* Draft restored banner */}
        {draftRestored && (
          <div className="p-2.5 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5" />
            {t("wizard.draftRestored")} — {state.lastSaved ? new Date(state.lastSaved).toLocaleString() : "earlier"}.
          </div>
        )}

        {/* Step content */}
        <Card className="p-5">
          {step === 1 && <Step1TradeNeed state={state} setState={setState} />}
          {step === 2 && <Step2CommercialTerms state={state} setState={setState} />}
          {step === 3 && <Step3Logistics state={state} setState={setState} />}
          {step === 4 && <Step4Compliance state={state} />}
          {step === 5 && <Step5Finance state={state} setState={setState} />}
          {step === 6 && <Step6Review state={state} />}
        </Card>

        {/* Error */}
        {error && (
          <div className="p-3 rounded-md bg-red-50 dark:bg-red-950/20 border border-red-500/30 text-sm text-red-700 dark:text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Footer nav */}
        <div className="flex items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            {saving ? (
              <><Loader2 className="w-3 h-3 animate-spin" /> {t("common.saving")}</>
            ) : state.lastSaved ? (
              <><Save className="w-3 h-3" /> {t("common.saved")} {new Date(state.lastSaved).toLocaleTimeString()}</>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            {step > 1 && (
              <Button variant="outline" size="sm" onClick={() => goToStep((step - 1) as StepId)} disabled={submitting}>
                <ChevronLeft className="w-3.5 h-3.5 me-1" /> {t("common.back")}
              </Button>
            )}
            {step < 6 ? (
              <Button size="sm" onClick={() => goToStep((step + 1) as StepId)} disabled={!stepValid || submitting}>
                {t("common.continue")} <ChevronRight className="w-3.5 h-3.5 ms-1" />
              </Button>
            ) : (
              <Button size="sm" onClick={submit} disabled={submitting || !stepValid}>
                {submitting ? <Loader2 className="w-3.5 h-3.5 me-1 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5 me-1" />}
                {t("wizard.submit")}
              </Button>
            )}
          </div>
        </div>
      </div>
    </CockpitShell>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 1 — Trade Need
// ───────────────────────────────────────────────────────────────────────────────

function Step1TradeNeed({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  return (
    <div className="space-y-4">
      <StepHeader icon={Package} title="What are you trading?" desc="Tell us the product, quantity, and where it needs to go." />
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Product / commodity" required>
          <Input
            value={state.commodity}
            onChange={(e) => setState((s) => ({ ...s, commodity: e.target.value }))}
            placeholder="e.g. Egyptian Valencia oranges"
          />
        </Field>
        <Field label="HS code (optional)">
          <Input
            value={state.commodityHs}
            onChange={(e) => setState((s) => ({ ...s, commodityHs: e.target.value }))}
            placeholder="e.g. 0805.10"
            className="font-mono"
          />
        </Field>
        <Field label="Grade / spec" full>
          <Input
            value={state.gradeSpec}
            onChange={(e) => setState((s) => ({ ...s, gradeSpec: e.target.value }))}
            placeholder="e.g. Grade A, 56-64mm, class I"
          />
        </Field>
        <Field label="Quantity">
          <Input
            type="number"
            value={state.quantity}
            onChange={(e) => setState((s) => ({ ...s, quantity: e.target.value }))}
            placeholder="e.g. 500"
          />
        </Field>
        <Field label="Unit">
          <SelectBox
            value={state.quantityUnit}
            onChange={(v) => setState((s) => ({ ...s, quantityUnit: v }))}
            options={UNITS.map((u) => ({ value: u, label: u }))}
          />
        </Field>
        <Field label="Origin country" required>
          <CountryInput
            value={state.originCountry}
            onChange={(v) => setState((s) => ({ ...s, originCountry: v }))}
            placeholder="e.g. EG"
          />
        </Field>
        <Field label="Origin port / city (optional)">
          <Input
            value={state.originPort}
            onChange={(e) => setState((s) => ({ ...s, originPort: e.target.value }))}
            placeholder="e.g. Alexandria"
          />
        </Field>
        <Field label="Destination country" required>
          <CountryInput
            value={state.destCountry}
            onChange={(v) => setState((s) => ({ ...s, destCountry: v }))}
            placeholder="e.g. NL"
          />
        </Field>
        <Field label="Destination port / city (optional)">
          <Input
            value={state.destPort}
            onChange={(e) => setState((s) => ({ ...s, destPort: e.target.value }))}
            placeholder="e.g. Rotterdam"
          />
        </Field>
        <Field label="Required delivery date" full>
          <Input
            type="date"
            value={state.requiredDeliveryDate}
            onChange={(e) => setState((s) => ({ ...s, requiredDeliveryDate: e.target.value }))}
          />
        </Field>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 2 — Commercial Terms
// ───────────────────────────────────────────────────────────────────────────────

function Step2CommercialTerms({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  const [query, setQuery] = useState(state.counterpartyName || "");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced GTID autocomplete via the existing /api/sgtx/gtid/autocomplete endpoint.
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults([]);
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetchWithAuth(
          `/api/sgtx/gtid/autocomplete?q=${encodeURIComponent(query)}`,
        );
        if (res.ok) {
          const data = await res.json();
          setResults(data.suggestions || data.results || []);
        }
      } catch {
        // non-fatal
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [query]);

  return (
    <div className="space-y-4">
      <StepHeader icon={FileText} title="Commercial terms" desc="Who is the counterparty? What are the price, Incoterm, and payment terms?" />
      <div className="space-y-4">
        <Field label="Counterparty (seller / buyer)" required>
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setState((s) => ({ ...s, counterpartyGtid: "", counterpartyName: e.target.value }));
              }}
              placeholder="Type a company name or GTID (SGTX-…)"
              className="pl-8"
            />
            {searching && (
              <Loader2 className="w-3.5 h-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
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
          {state.counterpartyGtid && (
            <p className="mt-1.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Selected: {state.counterpartyName} ·{" "}
              <code className="font-mono">{state.counterpartyGtid}</code>
            </p>
          )}
        </Field>

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Currency">
            <SelectBox
              value={state.currency}
              onChange={(v) => setState((s) => ({ ...s, currency: v }))}
              options={CURRENCIES.map((c) => ({ value: c, label: c }))}
            />
          </Field>
          <Field label="Target price (per unit)">
            <Input
              type="number"
              value={state.targetPrice}
              onChange={(e) => setState((s) => ({ ...s, targetPrice: e.target.value }))}
              placeholder="e.g. 850"
            />
          </Field>
          <Field label="Incoterm 2020" required>
            <SelectBox
              value={state.incoterm}
              onChange={(v) => setState((s) => ({ ...s, incoterm: v }))}
              options={INCOTERMS.map((i) => ({ value: i, label: i }))}
              placeholder="Select Incoterm…"
            />
          </Field>
          <Field label="Payment terms">
            <SelectBox
              value={state.paymentTerms}
              onChange={(v) => setState((s) => ({ ...s, paymentTerms: v }))}
              options={PAYMENT_TERMS}
            />
          </Field>
        </div>

        {state.incoterm && (
          <div className="p-3 rounded-md bg-muted/30 border border-border text-xs text-muted-foreground">
            <p><strong className="text-foreground">{state.incoterm}</strong> — {INCOTERM_DESC[state.incoterm] || "See the Incoterms 2020 reference."}</p>
          </div>
        )}
      </div>
    </div>
  );
}

const INCOTERM_DESC: Record<string, string> = {
  EXW: "Ex Works — the buyer handles all transport from the seller's premises.",
  FCA: "Free Carrier — the seller delivers to a named place; buyer arranges main carriage.",
  FOB: "Free On Board — the seller loads goods on the vessel; risk passes at the ship's rail.",
  CFR: "Cost and Freight — seller pays transport to the destination port; risk passes at origin.",
  CIF: "Cost, Insurance, Freight — seller pays transport + insurance to destination port.",
  CPT: "Carriage Paid To — seller pays transport to named place; risk passes at handover.",
  CIP: "Carriage and Insurance Paid To — seller pays transport + insurance to named place.",
  DAP: "Delivered At Place — seller delivers to a named place; buyer clears import.",
  DPU: "Delivered At Place Unloaded — seller delivers and unloads at named place.",
  DDP: "Delivered Duty Paid — seller handles everything including import duties.",
};

// ───────────────────────────────────────────────────────────────────────────────
// Step 3 — Logistics
// ───────────────────────────────────────────────────────────────────────────────

function Step3Logistics({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  return (
    <div className="space-y-4">
      <StepHeader icon={Truck} title="Logistics" desc="How will the goods be transported?" />
      <div className="space-y-4">
        <Field label="Transport mode">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            {TRANSPORT_MODES.map((m) => (
              <button
                key={m.value}
                onClick={() => setState((s) => ({ ...s, transportMode: m.value }))}
                className={cn(
                  "p-2.5 rounded-md border text-sm font-medium transition",
                  state.transportMode === m.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        </Field>

        {/* Progressive disclosure: temperature-controlled reveal reefer fields */}
        <Field label="Temperature-controlled (cold chain)?">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setState((s) => ({ ...s, temperatureControlled: false }))}
              className={cn(
                "px-4 h-9 rounded-md border text-sm font-medium",
                !state.temperatureControlled ? "border-primary bg-primary/10 text-primary" : "border-border",
              )}
            >
              No
            </button>
            <button
              onClick={() => setState((s) => ({ ...s, temperatureControlled: true }))}
              className={cn(
                "px-4 h-9 rounded-md border text-sm font-medium",
                state.temperatureControlled ? "border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300" : "border-border",
              )}
            >
              Yes
            </button>
          </div>
        </Field>

        {/* Conditional reefer fields (progressive disclosure) */}
        {state.temperatureControlled && (
          <Card className="p-3 border-amber-500/30 bg-amber-50/30 dark:bg-amber-950/10">
            <div className="flex items-start gap-2">
              <Thermometer className="w-4 h-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <div className="text-xs">
                <p className="font-medium text-amber-700 dark:text-amber-300">Cold chain requirements</p>
                <p className="text-muted-foreground mt-1">
                  The platform will auto-require a reefer container, temperature logs, and a
                  phytosanitary certificate based on the destination jurisdiction.
                </p>
              </div>
            </div>
          </Card>
        )}

        <div className="grid sm:grid-cols-2 gap-4">
          <Field label="Packaging">
            <Input
              value={state.packaging}
              onChange={(e) => setState((s) => ({ ...s, packaging: e.target.value }))}
              placeholder="e.g. 400g bags on pallets"
            />
          </Field>
          <Field label="Equipment type">
            <SelectBox
              value={state.equipmentType}
              onChange={(v) => setState((s) => ({ ...s, equipmentType: v }))}
              options={[
                { value: "20DRY", label: "20' Dry" },
                { value: "40DRY", label: "40' Dry" },
                { value: "20REF", label: "20' Reefer" },
                { value: "40REF", label: "40' Reefer" },
                { value: "20TK", label: "20' Tank" },
                { value: "40FL", label: "40' Flat" },
              ]}
            />
          </Field>
          <Field label="Equipment count">
            <Input
              type="number"
              value={state.equipmentCount}
              onChange={(e) => setState((s) => ({ ...s, equipmentCount: e.target.value }))}
              placeholder="1"
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 4 — Compliance (auto-generated)
// ───────────────────────────────────────────────────────────────────────────────

function Step4Compliance({ state }: { state: WizardState }) {
  // Fetch the auto-generated compliance requirements from the existing
  // /api/sgtx/trade-request/documentation-requirements endpoint.
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
      if (!res.ok) throw new Error("Failed to load compliance requirements");
      return res.json();
    },
    enabled: !!(state.destCountry && state.incoterm),
  });

  const reqs: any[] = data?.requirements || [];

  return (
    <div className="space-y-4">
      <StepHeader
        icon={ShieldCheck}
        title="Compliance (auto-generated)"
        desc="The platform determines the required documents based on the destination jurisdiction. You do not need to pick from regulatory lists."
      />

      {!state.destCountry || !state.incoterm ? (
        <div className="p-3 rounded-md bg-muted/30 border border-border text-sm text-muted-foreground">
          Complete steps 1–2 first — the compliance requirements are generated from the destination country and Incoterm.
        </div>
      ) : isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Generating compliance requirements…
        </div>
      ) : reqs.length === 0 ? (
        <div className="p-3 rounded-md bg-muted/30 border border-border text-sm text-muted-foreground">
          No specific compliance requirements detected for this route. The platform will still apply baseline checks (sanctions, KYB).
        </div>
      ) : (
        <ul className="space-y-2">
          {reqs.map((r: any, i: number) => (
            <li key={i} className="p-3 rounded-md border border-border bg-card/40">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-medium">{r.docName || r.docType}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.trigger || "Required by destination jurisdiction"}</p>
                </div>
                {r.mandatory && (
                  <Badge variant="outline" className="text-[0.6rem] text-amber-700 dark:text-amber-300 border-amber-500/40">
                    Mandatory
                  </Badge>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="p-3 rounded-md bg-muted/20 border border-border text-xs text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-500" />
          These requirements are generated from the SGTX jurisdiction rules engine. The full evidence package is assembled automatically when the trade moves to the preparation phase.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 5 — Finance (optional)
// ───────────────────────────────────────────────────────────────────────────────

function Step5Finance({ state, setState }: { state: WizardState; setState: React.Dispatch<React.SetStateAction<WizardState>> }) {
  return (
    <div className="space-y-4">
      <StepHeader
        icon={DollarSign}
        title="Finance (optional)"
        desc="Do you need financing for this trade? If yes, the platform will broadcast a financing RFQ to registered banks and private financiers."
      />

      <div className="grid grid-cols-2 gap-3">
        <button
          onClick={() => setState((s) => ({ ...s, needsFinancing: false, financingInterest: "" }))}
          className={cn(
            "p-4 rounded-md border text-sm font-medium text-left transition",
            !state.needsFinancing ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
          )}
        >
          <p className="font-medium">No, I'll self-fund</p>
          <p className="text-xs text-muted-foreground mt-1">Skip this step and continue to review.</p>
        </button>
        <button
          onClick={() => setState((s) => ({ ...s, needsFinancing: true }))}
          className={cn(
            "p-4 rounded-md border text-sm font-medium text-left transition",
            state.needsFinancing ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted",
          )}
        >
          <p className="font-medium">Yes, I need financing</p>
          <p className="text-xs text-muted-foreground mt-1">Reveal financing options and broadcast an RFQ.</p>
        </button>
      </div>

      {state.needsFinancing && (
        <Card className="p-4 space-y-3">
          <Field label="Financing interest (free text)">
            <Textarea
              value={state.financingInterest}
              onChange={(e) => setState((s) => ({ ...s, financingInterest: e.target.value }))}
              placeholder="e.g. We need 60% of trade value as working capital, prefer Sharia-compliant financing, 90-day tenor."
              className="min-h-[80px]"
            />
          </Field>
          <p className="text-xs text-muted-foreground">
            The platform will broadcast a financing RFQ to registered banks and private financiers. You'll receive bids on the trade workspace.
          </p>
        </Card>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Step 6 — Review
// ───────────────────────────────────────────────────────────────────────────────

function Step6Review({ state }: { state: WizardState }) {
  return (
    <div className="space-y-4">
      <StepHeader
        icon={CheckCircle2}
        title="Review and submit"
        desc="Read the summary below. When you submit, the platform generates the USTN, contract, and document requirements automatically."
      />

      <Card className="p-4 bg-muted/20">
        <p className="text-sm leading-relaxed">
          <strong className="font-medium">
            {state.quantity ? `${state.quantity} ${state.quantityUnit}` : "—"} {state.commodity || "(product)"}
          </strong>{" "}
          from <strong>{state.originCountry || "—"}</strong> to <strong>{state.destCountry || "—"}</strong>
          {state.destPort && ` (${state.destPort})`},
          {" "}<strong>{state.incoterm || "—"}</strong>, <strong>{state.currency}</strong>
          {state.targetPrice && ` ${state.targetPrice}/${state.quantityUnit}`},
          {" "}delivery <strong>{state.requiredDeliveryDate || "—"}</strong>
          {state.temperatureControlled && ", temperature-controlled"}
          {state.transportMode && `, ${state.transportMode.toLowerCase()} transport`}
          {state.counterpartyGtid && (
            <>
              , counterparty <strong>{state.counterpartyName}</strong>
            </>
          )}
          {state.needsFinancing && ", financing requested"}.
        </p>
      </Card>

      <div className="grid sm:grid-cols-2 gap-3 text-xs">
        <ReviewRow label="Commodity" value={state.commodity} />
        <ReviewRow label="HS code" value={state.commodityHs} />
        <ReviewRow label="Grade / spec" value={state.gradeSpec} />
        <ReviewRow label="Quantity" value={`${state.quantity} ${state.quantityUnit}`} />
        <ReviewRow label="Origin" value={[state.originCountry, state.originPort].filter(Boolean).join(", ")} />
        <ReviewRow label="Destination" value={[state.destCountry, state.destPort].filter(Boolean).join(", ")} />
        <ReviewRow label="Delivery date" value={state.requiredDeliveryDate} />
        <ReviewRow label="Counterparty" value={`${state.counterpartyName} (${state.counterpartyGtid})`} />
        <ReviewRow label="Incoterm" value={state.incoterm} />
        <ReviewRow label="Payment terms" value={PAYMENT_TERMS.find((p) => p.value === state.paymentTerms)?.label || state.paymentTerms} />
        <ReviewRow label="Transport mode" value={state.transportMode} />
        <ReviewRow label="Cold chain" value={state.temperatureControlled ? "Yes" : "No"} />
        <ReviewRow label="Packaging" value={state.packaging} />
        <ReviewRow label="Equipment" value={`${state.equipmentCount} × ${state.equipmentType}`} />
        <ReviewRow label="Currency" value={state.currency} />
        <ReviewRow label="Target price" value={state.targetPrice ? `${state.currency} ${state.targetPrice}` : "—"} />
        <ReviewRow label="Financing" value={state.needsFinancing ? "Yes — RFQ will be broadcast" : "No"} />
      </div>

      <div className="p-3 rounded-md bg-emerald-50/30 dark:bg-emerald-950/10 border border-emerald-500/30 text-xs text-emerald-700 dark:text-emerald-300">
        <p className="flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" />
          On submit, the platform auto-generates: USTN, Trade Context Contract, document requirements, and (if financing requested) an RFQ broadcast.
        </p>
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────────────────
// Shared field components
// ───────────────────────────────────────────────────────────────────────────────

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
      <Label className="text-xs">
        {label} {required && <span className="text-red-500">*</span>}
      </Label>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

function SelectBox({ value, onChange, options, placeholder }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function CountryInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <Input
      value={value}
      onChange={(e) => onChange(e.target.value.toUpperCase().substring(0, 2))}
      placeholder={placeholder}
      className="font-mono uppercase"
    />
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-2 p-2 rounded border border-border bg-card/40">
      <span className="text-muted-foreground flex-shrink-0">{label}:</span>
      <span className="text-foreground text-right break-all">{value || "—"}</span>
    </div>
  );
}
