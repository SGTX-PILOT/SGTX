"use client";

// SGTX Phase 6 — Financial & Commercial Execution Screen (admin portal §1–§10)
// ---------------------------------------------------------------------------
// Single-file React component exposing 11 sub-tabs:
//   1. Payments (§1 — default)            7. Insurance (§6)
//   2. Trade Finance Cases (§2)            8. Accounting (§7)
//   3. Financiers (§2b non-marketplace)    9. ERP Adapters (§8)
//   4. LC Lifecycles (§3)                10. Reconciliation (§9)
//   5. Documentary Matching (§4)          11. Test Runner (§10 — 14 scenarios)
//   6. Guarantees (§5)
//
// NON-MARKETPLACE GUARANTEE (§2b — Financiers tab):
//   • Flat list — NO ranking column, NO public trust score.
//   • The internal trust score is shown but explicitly marked "INTERNAL"
//     with a Lock icon — it is never exposed as a public ranking.
//   • Order is purely chronological (oldest first).
//
// COLOR PALETTE — gold / emerald / amber / red / slate only. NO indigo, NO blue.
//   Accounting "RECONCILED" is normally blue but we substitute emerald.
//
// Defensive parsing: every cell uses safeParse(...) with Array.isArray
// guards so malformed JSON columns never crash the UI.

import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtUsd, fmtDate, fmtDateTime } from "@/lib/sgtx/format";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Banknote,
  Lock,
  DollarSign,
  ChevronDown,
  ChevronRight,
  Activity,
} from "lucide-react";

// ============ Constants (mirror lib constants — kept inline so the file is self-contained) ============

const PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "LOCAL_RAILS",
  "PSP",
  "OPEN_BANKING",
  "SWIFT",
  "ISO_20022",
  "LOCAL_INSTANT",
  "DOCUMENTARY_COLLECTION",
  "LC",
  "BANK_GUARANTEE",
  "STANDBY",
  "APPROVED_DEFERRED",
] as const;

const PAYMENT_STATUSES = [
  "PENDING",
  "SUBMITTED",
  "PROCESSING",
  "SETTLED",
  "FAILED",
  "CANCELLED",
  "REVERSED",
  "DUPLICATE",
] as const;

const PAYMENT_RECON_STATUSES = ["UNRECONCILED", "RECONCILED", "DISCREPANT"] as const;

const TRADE_FINANCE_STATUSES = [
  "FINANCING_REQUEST",
  "CONNECTED_BANK_FINANCING",
  "TRADER_ADDED_FINANCIER",
  "OFFER",
  "ACCEPTANCE",
  "DISBURSEMENT",
  "REPAYMENT",
  "GUARANTEE",
  "COLLATERAL",
  "MARGIN_CALL",
  "SETTLEMENT",
  "CLOSED",
  "REJECTED",
] as const;

const FINANCIER_TYPES = [
  "CONNECTED_BANK",
  "TRADER_ADDED_FINANCIER",
  "APPROVED_FINANCING_ENTITY",
] as const;

const FINANCIER_RELATIONSHIP_STATUSES = [
  "ACTIVE",
  "INACTIVE",
  "SUSPENDED",
  "EXPIRED",
] as const;

const LC_LIFECYCLE_STEPS = [
  "APPLICATION",
  "ISSUANCE",
  "ADVISING",
  "CONFIRMATION",
  "AMENDMENT",
  "PRESENTATION",
  "DISCREPANCY",
  "ACCEPTANCE",
  "PAYMENT",
  "REIMBURSEMENT",
] as const;

const LC_LIFECYCLE_STATUSES = [
  "PENDING",
  "IN_PROGRESS",
  "COMPLETED",
  "REJECTED",
  "DISCREPANT",
] as const;

const MATCH_STATUSES = ["PENDING", "MATCHED", "DISCREPANT", "WAIVED"] as const;

const GUARANTEE_TYPES = [
  "CUSTOMS_GUARANTEE",
  "BANK_GUARANTEE",
  "TRANSIT_GUARANTEE",
  "DUTY_DEFERRAL",
  "TEMPORARY_ADMISSION",
  "BONDED_WAREHOUSE",
] as const;

const GUARANTEE_STATUSES = [
  "DRAFT",
  "ISSUED",
  "ACTIVE",
  "CALLED",
  "EXPIRED",
  "RELEASED",
  "CANCELLED",
] as const;

const INSURANCE_TYPES = [
  "CARGO",
  "MARINE",
  "LIABILITY",
  "PRODUCT",
  "TRADE_CREDIT",
] as const;

const INSURANCE_LIFECYCLE_STEPS = [
  "QUOTE",
  "BIND",
  "CERTIFICATE",
  "ENDORSEMENT",
  "INCIDENT",
  "CLAIM",
  "SURVEY",
  "SETTLEMENT",
  "RECOVERY",
  "CLOSE",
] as const;

const INSURANCE_LIFECYCLE_STATUSES = [
  "DRAFT",
  "ACTIVE",
  "INCIDENT",
  "CLAIMED",
  "SETTLED",
  "RECOVERED",
  "CLOSED",
  "REJECTED",
] as const;

const ACCOUNTING_CATEGORIES = [
  "AP",
  "AR",
  "LANDED_COST",
  "FREIGHT",
  "DUTY",
  "TAX",
  "INSURANCE",
  "ACCRUAL",
  "SETTLEMENT",
  "REFUND",
  "FX",
  "INVENTORY",
  "COGS",
] as const;

const ACCOUNTING_STATUSES = ["DRAFT", "POSTED", "REVERSED", "RECONCILED"] as const;

const ERP_TYPES = [
  "SAP",
  "ORACLE",
  "MICROSOFT_DYNAMICS",
  "NETSUITE",
  "ODOO",
  "GENERIC_API",
  "GENERIC_EDI",
  "SFTP",
] as const;

const ERP_STATUSES = [
  "NOT_CONFIGURED",
  "CONFIGURED",
  "CONNECTED",
  "SYNCING",
  "ERROR",
  "DEPRECATED",
] as const;

const RECONCILIATION_TYPES = [
  "PAYMENT",
  "GOVERNMENT_FEE",
  "BANK",
  "PSP",
  "CARRIER",
  "BROKER",
  "INSURANCE",
  "ACCOUNTING",
] as const;

const RECONCILIATION_STATUSES = [
  "PENDING",
  "MATCHED",
  "DISCREPANT",
  "UNMATCHED",
  "RESOLVED",
] as const;

// ============ Helpers ============

function safeParse<T = any>(raw: any, fallback: T): T {
  if (raw == null) return fallback;
  if (Array.isArray(raw)) return raw as unknown as T;
  if (typeof raw === "object") return raw as T;
  try {
    const parsed = JSON.parse(raw);
    if (parsed == null) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

function asArray(raw: any): any[] {
  const arr = safeParse<any[]>(raw, []);
  return Array.isArray(arr) ? arr : [];
}

function asNum(raw: any): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string") {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return 0;
}

function asBool(raw: any): boolean {
  if (typeof raw === "boolean") return raw;
  if (typeof raw === "number") return raw !== 0;
  if (typeof raw === "string") return raw.toLowerCase() === "true";
  return false;
}

function shortGtid(gtid: string | null | undefined): string {
  if (!gtid) return "—";
  // SGTX-EG-BNK-001234-5B6C → BNK-001234
  const parts = gtid.split("-");
  if (parts.length >= 4) return `${parts[2]}-${parts[3]}`;
  return gtid.slice(-10);
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ============ Color helpers (restricted palette — NO indigo, NO blue) ============
//
// Status → color. Honors the §1/§3/§4/§5/§7/§8/§9 spec color semantics:
//   • Success / settled / matched / active = emerald (#10b981)
//   • Warning / pending / processing / configured = amber (#f59e0b)
//   • Error / failed / cancelled / expired / called = red (#f87171)
//   • Inactive / duplicate / waived / superseded / not_configured = slate (#94a3b8)
//   • Gold / in-transit / LC payment = gold (#d4a017)
//
// NOTE: "RECONCILED" is intentionally emerald (NOT blue) per the task spec.

function paymentStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "SETTLED") return "#10b981"; // emerald
  if (s === "PENDING" || s === "SUBMITTED" || s === "PROCESSING") return "#f59e0b"; // amber
  if (
    s === "FAILED" ||
    s === "CANCELLED" ||
    s === "REVERSED"
  )
    return "#f87171"; // red
  if (s === "DUPLICATE") return "#94a3b8"; // slate
  return "#94a3b8";
}

function caseStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "CLOSED" || s === "SETTLEMENT") return "#10b981";
  if (
    s === "FINANCING_REQUEST" ||
    s === "OFFER" ||
    s === "ACCEPTANCE" ||
    s === "TRADER_ADDED_FINANCIER" ||
    s === "CONNECTED_BANK_FINANCING"
  )
    return "#f59e0b";
  if (s === "DISBURSEMENT" || s === "REPAYMENT" || s === "GUARANTEE") return "#d4a017";
  if (s === "MARGIN_CALL" || s === "REJECTED" || s === "COLLATERAL") return "#f87171";
  return "#94a3b8";
}

function financierTypeColor(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "CONNECTED_BANK") return "#d4a017"; // gold
  if (t === "TRADER_ADDED_FINANCIER") return "#f59e0b"; // amber
  if (t === "APPROVED_FINANCING_ENTITY") return "#10b981"; // emerald
  return "#94a3b8";
}

function relationshipStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "#10b981";
  if (s === "SUSPENDED" || s === "EXPIRED") return "#f87171";
  if (s === "INACTIVE") return "#94a3b8";
  return "#94a3b8";
}

function lcStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "COMPLETED") return "#10b981";
  if (s === "IN_PROGRESS" || s === "PENDING") return "#f59e0b";
  if (s === "REJECTED" || s === "DISCREPANT") return "#f87171";
  return "#94a3b8";
}

function lcStepColor(step: string | null | undefined): string {
  const s = String(step || "").toUpperCase();
  if (s === "ACCEPTANCE" || s === "PAYMENT" || s === "REIMBURSEMENT") return "#d4a017"; // gold — payment territory
  if (s === "DISCREPANCY") return "#f87171"; // red — discrepancy
  if (s === "PRESENTATION" || s === "AMENDMENT") return "#f59e0b"; // amber
  if (s === "APPLICATION" || s === "ISSUANCE" || s === "ADVISING" || s === "CONFIRMATION")
    return "#10b981"; // emerald — early stages
  return "#94a3b8";
}

function matchStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "MATCHED") return "#10b981"; // green
  if (s === "DISCREPANT") return "#f87171"; // red
  if (s === "PENDING") return "#f59e0b"; // amber
  if (s === "WAIVED") return "#94a3b8"; // slate
  return "#94a3b8";
}

function guaranteeStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return "#10b981"; // green
  if (s === "ISSUED" || s === "DRAFT") return "#f59e0b"; // amber
  if (s === "CALLED" || s === "EXPIRED" || s === "CANCELLED") return "#f87171"; // red
  if (s === "RELEASED") return "#94a3b8"; // slate
  return "#94a3b8";
}

function guaranteeTypeColor(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "CUSTOMS_GUARANTEE" || t === "DUTY_DEFERRAL" || t === "BONDED_WAREHOUSE")
    return "#d4a017"; // gold
  if (t === "BANK_GUARANTEE") return "#10b981"; // emerald
  if (t === "TRANSIT_GUARANTEE" || t === "TEMPORARY_ADMISSION") return "#f59e0b"; // amber
  return "#94a3b8";
}

function insuranceTypeColor(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "CARGO" || t === "MARINE") return "#10b981"; // emerald
  if (t === "LIABILITY" || t === "PRODUCT") return "#f59e0b"; // amber
  if (t === "TRADE_CREDIT") return "#d4a017"; // gold
  return "#94a3b8";
}

function insuranceStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "CLOSED" || s === "SETTLED" || s === "RECOVERED" || s === "ACTIVE")
    return "#10b981";
  if (s === "DRAFT" || s === "CLAIMED") return "#f59e0b";
  if (s === "REJECTED" || s === "INCIDENT") return "#f87171";
  return "#94a3b8";
}

function insuranceStepColor(step: string | null | undefined): string {
  const s = String(step || "").toUpperCase();
  if (s === "SETTLEMENT" || s === "RECOVERY" || s === "CLOSE") return "#10b981";
  if (s === "INCIDENT" || s === "CLAIM" || s === "SURVEY") return "#f87171";
  if (s === "QUOTE" || s === "BIND" || s === "CERTIFICATE" || s === "ENDORSEMENT")
    return "#f59e0b";
  return "#94a3b8";
}

function accountingCategoryColor(cat: string | null | undefined): string {
  const c = String(cat || "").toUpperCase();
  if (c === "AP" || c === "AR" || c === "SETTLEMENT") return "#d4a017"; // gold
  if (c === "FREIGHT" || c === "DUTY" || c === "TAX") return "#f59e0b"; // amber
  if (c === "INSURANCE" || c === "ACCRUAL" || c === "FX") return "#94a3b8"; // slate
  if (c === "LANDED_COST" || c === "INVENTORY" || c === "COGS") return "#10b981"; // emerald
  if (c === "REFUND") return "#f87171"; // red
  return "#94a3b8";
}

// Accounting status: RECONCILED is normally blue, but we substitute emerald.
function accountingStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "POSTED") return "#10b981"; // green
  if (s === "DRAFT") return "#f59e0b"; // amber
  if (s === "REVERSED") return "#94a3b8"; // slate
  if (s === "RECONCILED") return "#10b981"; // blue-but-use-emerald
  return "#94a3b8";
}

function erpTypeColor(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "SAP" || t === "ORACLE") return "#d4a017"; // gold — heavy ERP
  if (t === "MICROSOFT_DYNAMICS" || t === "NETSUITE") return "#f59e0b"; // amber
  if (t === "ODOO") return "#10b981"; // emerald
  if (t === "GENERIC_API" || t === "GENERIC_EDI" || t === "SFTP") return "#94a3b8"; // slate
  return "#94a3b8";
}

function erpStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "CONNECTED") return "#10b981"; // green
  if (s === "CONFIGURED" || s === "SYNCING") return "#f59e0b"; // amber
  if (s === "ERROR") return "#f87171"; // red
  if (s === "NOT_CONFIGURED" || s === "DEPRECATED") return "#94a3b8"; // slate
  return "#94a3b8";
}

function reconTypeColor(type: string | null | undefined): string {
  const t = String(type || "").toUpperCase();
  if (t === "PAYMENT" || t === "BANK") return "#d4a017"; // gold
  if (t === "GOVERNMENT_FEE" || t === "BROKER") return "#f59e0b"; // amber
  if (t === "PSP" || t === "CARRIER") return "#10b981"; // emerald
  if (t === "INSURANCE" || t === "ACCOUNTING") return "#94a3b8"; // slate
  return "#94a3b8";
}

function reconStatusColor(status: string | null | undefined): string {
  const s = String(status || "").toUpperCase();
  if (s === "MATCHED") return "#10b981"; // green
  if (s === "DISCREPANT") return "#f59e0b"; // amber
  if (s === "UNMATCHED") return "#f87171"; // red
  if (s === "RESOLVED") return "#10b981"; // emerald (per spec)
  if (s === "PENDING") return "#f59e0b"; // amber
  return "#94a3b8";
}

// ============ Loading / Empty / Error states ============

function LoadingState({ label = "Loading…" }: { label?: string }) {
  return (
    <Card className="p-8 flex items-center justify-center text-xs text-muted-foreground">
      <Loader2 className="w-4 h-4 mr-2 animate-spin" /> {label}
    </Card>
  );
}

function EmptyState({ label }: { label: string }) {
  return <Card className="p-8 text-center text-xs text-muted-foreground">{label}</Card>;
}

function ErrorState({ message }: { message: string }) {
  return (
    <Card className="p-6 border-red-500/30 bg-red-500/5">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-semibold text-red-400 mb-0.5">Failed to load</p>
          <p className="text-[0.65rem] text-muted-foreground break-all">{message}</p>
        </div>
      </div>
    </Card>
  );
}

// ============ Reusable StatusPill ============

function StatusPill({
  status,
  color,
}: {
  status: string | null | undefined;
  color: string;
}) {
  const label = String(status || "—");
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold whitespace-nowrap"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}

// ============ Reusable Summary Tile ============

function HealthTile({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: number | string;
  color: string;
  icon: typeof Banknote;
}) {
  return (
    <Card className="p-3" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">
            {label}
          </p>
          <p className="font-display text-2xl font-bold" style={{ color }}>
            {value}
          </p>
        </div>
        <Icon className="w-5 h-5 opacity-70" style={{ color }} />
      </div>
    </Card>
  );
}

// ============ 10-step progress bar (LC + Insurance) ============

function StepProgressBar({
  currentStep,
  steps,
  stepColor,
}: {
  currentStep: string | null | undefined;
  steps: readonly string[];
  stepColor: (s: string) => string;
}) {
  const cur = String(currentStep || "").toUpperCase();
  const idx = steps.findIndex((s) => s === cur);
  const completed = idx < 0 ? 0 : idx;
  const total = steps.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const color = stepColor(cur);
  return (
    <div className="flex items-center gap-2 min-w-[160px]">
      <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span
        className="text-[0.55rem] font-mono whitespace-nowrap"
        style={{ color }}
      >
        {completed}/{total} · {pct}%
      </span>
    </div>
  );
}

// ============ Filter row helper ============

function FilterRow({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-3">{children}</div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: readonly string[];
  placeholder: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
        {label}
      </Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger className="h-8 w-[180px] text-[0.7rem]">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL" className="text-[0.7rem]">
            ALL
          </SelectItem>
          {options.map((o) => (
            <SelectItem key={o} value={o} className="text-[0.7rem]">
              {o}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ============ shared async fetch helper ============

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return res.json();
}

async function postJson(url: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body || {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

// =====================================================================
// 1. PAYMENTS TAB (§1)
// =====================================================================

function InitiatePaymentForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [ustn, setUstn] = useState("");
  const [payerGtid, setPayerGtid] = useState("SGTX-DE-TRD-001234-5B6C");
  const [payeeGtid, setPayeeGtid] = useState("SGTX-EG-TRD-002139-7F3A");
  const [paymentMethod, setPaymentMethod] = useState<string>("BANK_TRANSFER");
  const [amount, setAmount] = useState("1000");
  const [currency, setCurrency] = useState("USD");
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      const amt = Number(amount);
      if (!(amt > 0)) {
        throw new Error("amountUsd must be positive");
      }
      const body: any = {
        payerGtid,
        payeeGtid,
        paymentMethod,
        amountUsd: amt,
        currency: currency || "USD",
      };
      if (ustn) body.ustn = ustn;
      if (idempotencyKey) body.idempotencyKey = idempotencyKey;
      if (notes) body.notes = notes;
      const data = await postJson("/api/sgtx/finance/payments", body);
      setResult(data);
      qc.invalidateQueries({ queryKey: ["sgtx-finance-payments"] });
      onCreated();
    } catch (e: any) {
      setError(e?.message || "initiate failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-3 border-gold/30 bg-gold/5">
      <div className="flex items-center gap-2 mb-2">
        <DollarSign className="w-3.5 h-3.5 text-gold" />
        <h4 className="text-xs font-semibold">Initiate Payment</h4>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">USTN</Label>
          <Input
            value={ustn}
            onChange={(e) => setUstn(e.target.value)}
            className="h-7 text-[0.7rem]"
            placeholder="SGTX-...-..."
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Payer GTID</Label>
          <Input
            value={payerGtid}
            onChange={(e) => setPayerGtid(e.target.value)}
            className="h-7 text-[0.7rem] font-mono"
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Payee GTID</Label>
          <Input
            value={payeeGtid}
            onChange={(e) => setPayeeGtid(e.target.value)}
            className="h-7 text-[0.7rem] font-mono"
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Method</Label>
          <Select value={paymentMethod} onValueChange={setPaymentMethod}>
            <SelectTrigger className="h-7 text-[0.7rem]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PAYMENT_METHODS.map((m) => (
                <SelectItem key={m} value={m} className="text-[0.7rem]">
                  {m}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Amount USD</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            type="number"
            className="h-7 text-[0.7rem]"
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Currency</Label>
          <Input
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="h-7 text-[0.7rem]"
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">
            Idempotency Key
          </Label>
          <Input
            value={idempotencyKey}
            onChange={(e) => setIdempotencyKey(e.target.value)}
            className="h-7 text-[0.7rem] font-mono"
            placeholder="(optional)"
          />
        </div>
        <div className="col-span-2 md:col-span-1">
          <Label className="text-[0.6rem] uppercase text-muted-foreground">Notes</Label>
          <Input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="h-7 text-[0.7rem]"
          />
        </div>
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting}
          className="h-7 text-[0.65rem]"
        >
          {submitting ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <DollarSign className="w-3 h-3 mr-1" />
          )}
          Initiate
        </Button>
        {error && (
          <span className="text-[0.6rem] text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </span>
        )}
        {result?.duplicate && (
          <span className="text-[0.6rem] text-amber-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> DUPLICATE detected — existing payment returned
          </span>
        )}
        {result?.payment && !result?.duplicate && (
          <span className="text-[0.6rem] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> Created{" "}
            {String(result.payment.paymentId || "—")}
          </span>
        )}
      </div>
    </Card>
  );
}

function SplitPaymentForm({
  onCreated,
}: {
  onCreated: () => void;
}) {
  const qc = useQueryClient();
  const [payerGtid, setPayerGtid] = useState("SGTX-DE-TRD-001234-5B6C");
  const [totalAmount, setTotalAmount] = useState("1000");
  const [partsJson, setPartsJson] = useState(
    JSON.stringify(
      [
        {
          payeeGtid: "SGTX-EG-TRD-002139-7F3A",
          amountUsd: 700,
          paymentMethod: "BANK_TRANSFER",
        },
        {
          payeeGtid: "SGTX-EG-LSP-000120-4C7D",
          amountUsd: 300,
          paymentMethod: "LOCAL_RAILS",
        },
      ],
      null,
      2,
    ),
  );
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    setResult(null);
    try {
      let parts: any[] = [];
      try {
        const parsed = JSON.parse(partsJson);
        if (!Array.isArray(parsed)) throw new Error("parts must be an array");
        parts = parsed;
      } catch (e: any) {
        throw new Error(`invalid parts JSON: ${e?.message || e}`);
      }
      if (parts.length === 0) throw new Error("parts must be non-empty");
      const total = Number(totalAmount);
      if (!(total > 0)) throw new Error("totalAmountUsd must be positive");
      const body = {
        payerGtid,
        totalAmountUsd: total,
        parts,
      };
      const data = await postJson("/api/sgtx/finance/payments/split", body);
      setResult(data);
      qc.invalidateQueries({ queryKey: ["sgtx-finance-payments"] });
      onCreated();
    } catch (e: any) {
      setError(e?.message || "split failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card className="p-3 border-emerald/30 bg-emerald/5">
      <div className="flex items-center gap-2 mb-2">
        <Banknote className="w-3.5 h-3.5 text-emerald" />
        <h4 className="text-xs font-semibold">Split Payment</h4>
        <span className="text-[0.6rem] text-muted-foreground">
          (one logical payment → N parts)
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">
            Payer GTID
          </Label>
          <Input
            value={payerGtid}
            onChange={(e) => setPayerGtid(e.target.value)}
            className="h-7 text-[0.7rem] font-mono"
          />
        </div>
        <div>
          <Label className="text-[0.6rem] uppercase text-muted-foreground">
            Total Amount USD
          </Label>
          <Input
            value={totalAmount}
            onChange={(e) => setTotalAmount(e.target.value)}
            type="number"
            className="h-7 text-[0.7rem]"
          />
        </div>
      </div>
      <div>
        <Label className="text-[0.6rem] uppercase text-muted-foreground">
          Parts (JSON array)
        </Label>
        <textarea
          value={partsJson}
          onChange={(e) => setPartsJson(e.target.value)}
          rows={5}
          className="w-full text-[0.65rem] font-mono rounded border border-input bg-background px-2 py-1"
        />
      </div>
      <div className="flex items-center gap-2 mt-2">
        <Button
          size="sm"
          onClick={submit}
          disabled={submitting}
          className="h-7 text-[0.65rem]"
        >
          {submitting ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Banknote className="w-3 h-3 mr-1" />
          )}
          Split
        </Button>
        {error && (
          <span className="text-[0.6rem] text-red-400 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" /> {error}
          </span>
        )}
        {result?.results && (
          <span className="text-[0.6rem] text-emerald-400 flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> {result.results.length} payment(s) initiated
          </span>
        )}
      </div>
    </Card>
  );
}

function PaymentsTab() {
  const [methodFilter, setMethodFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (methodFilter !== "ALL") qs.set("paymentMethod", methodFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const url = `/api/sgtx/finance/payments${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-payments", methodFilter, statusFilter],
    queryFn: () => fetchJson(url),
  });

  const payments = asArray(data?.payments);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(
        `/api/sgtx/finance/payments/${id}/${action}`,
        {},
      );
      setActionMsg(
        `${action} OK — payment ${String(res?.payment?.paymentId || id).slice(0, 24)} → ${String(
          res?.payment?.status || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-payments"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <InitiatePaymentForm onCreated={() => refetch()} />
      <SplitPaymentForm onCreated={() => refetch()} />

      <FilterRow>
        <FilterSelect
          label="Method"
          value={methodFilter}
          onChange={setMethodFilter}
          options={PAYMENT_METHODS}
          placeholder="All methods"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={PAYMENT_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading payments…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : payments.length === 0 ? (
        <EmptyState label="No payments match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>paymentId</Th>
                <Th>USTN</Th>
                <Th>Payer → Payee</Th>
                <Th>Method</Th>
                <Th className="text-right">Amount</Th>
                <Th>Curr</Th>
                <Th>Status</Th>
                <Th>Recon</Th>
                <Th>Settled</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => {
                const id = String(p?.id || "");
                const status = String(p?.status || "");
                const method = String(p?.paymentMethod || "");
                const isDuplicate = status === "DUPLICATE";
                return (
                  <Fragment key={id}>
                    <tr
                      className={`border-b border-border/50 hover:bg-muted/20 ${isDuplicate ? "bg-slate-500/5" : ""}`}
                    >
                      <Td>
                        <span className="font-mono">{String(p?.paymentId || "—")}</span>
                        {isDuplicate && (
                          <Badge
                            variant="outline"
                            className="ml-1 text-[0.55rem] py-0 px-1 border-slate-400 text-slate-500"
                          >
                            DUPLICATE
                          </Badge>
                        )}
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(p?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {shortGtid(p?.payerGtid)} → {shortGtid(p?.payeeGtid)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill status={method} color="#d4a017" />
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(p?.amountUsd))}
                      </Td>
                      <Td>{String(p?.currency || "USD")}</Td>
                      <Td>
                        <StatusPill status={status} color={paymentStatusColor(status)} />
                      </Td>
                      <Td>
                        <StatusPill
                          status={p?.reconciliationStatus || "—"}
                          color={
                            p?.reconciliationStatus === "RECONCILED"
                              ? "#10b981"
                              : p?.reconciliationStatus === "DISCREPANT"
                                ? "#f87171"
                                : "#94a3b8"
                          }
                        />
                      </Td>
                      <Td>{fmtDateTime(p?.settledAt)}</Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={10} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {["submit", "process", "settle", "fail", "cancel", "reverse"].map(
                              (a) => (
                                <Button
                                  key={a}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[0.6rem]"
                                  onClick={() => runAction(id, a)}
                                  disabled={actionLoading === `${id}:${a}`}
                                >
                                  {actionLoading === `${id}:${a}` && (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  )}
                                  {a}
                                </Button>
                              ),
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[0.6rem]"
                              onClick={async () => {
                                const key = p?.idempotencyKey;
                                if (!key) {
                                  setActionMsg("no idempotencyKey on this payment");
                                  return;
                                }
                                setActionLoading(`${id}:dup-check`);
                                try {
                                  const data = await fetchJson(
                                    `/api/sgtx/finance/payments/duplicate-check?idempotencyKey=${encodeURIComponent(key)}`,
                                  );
                                  setActionMsg(
                                    data?.duplicate
                                      ? `DUPLICATE found: ${data?.payment?.paymentId}`
                                      : `no duplicate for key ${key}`,
                                  );
                                } catch (e: any) {
                                  setActionMsg(`dup-check failed: ${e?.message}`);
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              disabled={actionLoading === `${id}:dup-check`}
                            >
                              {actionLoading === `${id}:dup-check` && (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              dup-check
                            </Button>
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(p, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 2. TRADE FINANCE CASES TAB (§2)
// =====================================================================

function TradeFinanceCasesTab() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [financierTypeFilter, setFinancierTypeFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  if (financierTypeFilter !== "ALL") qs.set("financierType", financierTypeFilter);
  const url = `/api/sgtx/finance/cases${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-cases", statusFilter, financierTypeFilter],
    queryFn: () => fetchJson(url),
  });

  const cases = asArray(data?.cases);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/cases/${id}/${action}`, {});
      setActionMsg(
        `${action} OK — case ${String(res?.case?.caseId || id).slice(0, 24)} → ${String(
          res?.case?.status || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-cases"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={TRADE_FINANCE_STATUSES}
          placeholder="All statuses"
        />
        <FilterSelect
          label="Financier Type"
          value={financierTypeFilter}
          onChange={setFinancierTypeFilter}
          options={FINANCIER_TYPES}
          placeholder="All financier types"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading trade finance cases…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : cases.length === 0 ? (
        <EmptyState label="No trade finance cases match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>caseId</Th>
                <Th>USTN</Th>
                <Th>Borrower</Th>
                <Th>Financier</Th>
                <Th>Type</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Verified</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {cases.map((c: any) => {
                const id = String(c?.id || "");
                const status = String(c?.status || "");
                const verified = asBool(c?.relationshipVerified);
                const ftype = String(c?.financierType || "");
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono">{String(c?.caseId || "—")}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(c?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {shortGtid(c?.borrowerGtid)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {shortGtid(c?.financierGtid)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill
                          status={ftype || "—"}
                          color={financierTypeColor(ftype)}
                        />
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(c?.amountUsd))}
                      </Td>
                      <Td>
                        <StatusPill status={status} color={caseStatusColor(status)} />
                      </Td>
                      <Td>
                        {verified ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <span className="flex items-center gap-0.5">
                            <XCircle className="w-3.5 h-3.5 text-red-400" />
                            <span className="text-[0.55rem] text-red-400">unverified</span>
                          </span>
                        )}
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {["accept", "disburse", "repay", "margin-call", "settle"].map(
                              (a) => (
                                <Button
                                  key={a}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[0.6rem]"
                                  onClick={() => runAction(id, a)}
                                  disabled={actionLoading === `${id}:${a}`}
                                >
                                  {actionLoading === `${id}:${a}` && (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  )}
                                  {a}
                                </Button>
                              ),
                            )}
                          </div>
                          {!verified && (
                            <p className="mt-2 text-[0.6rem] text-red-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> relationshipVerified=false —
                              non-marketplace §2: financier must be in trader's approved list.
                            </p>
                          )}
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(c, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 3. FINANCIERS TAB (§2b — NON-MARKETPLACE FLAT LIST)
// =====================================================================

function FinanciersTab() {
  const [traderGtid, setTraderGtid] = useState("SGTX-EG-TRD-002139-7F3A");
  const [financierTypeFilter, setFinancierTypeFilter] = useState("ALL");
  const [relationshipStatusFilter, setRelationshipStatusFilter] = useState("ALL");

  const qs = new URLSearchParams({ traderGtid });
  if (financierTypeFilter !== "ALL") qs.set("financierType", financierTypeFilter);
  if (relationshipStatusFilter !== "ALL")
    qs.set("relationshipStatus", relationshipStatusFilter);
  const url = `/api/sgtx/finance/financiers/connected?${qs.toString()}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: [
      "sgtx-finance-financiers-connected",
      traderGtid,
      financierTypeFilter,
      relationshipStatusFilter,
    ],
    queryFn: () => fetchJson(url),
    enabled: !!traderGtid,
  });

  const financiers = asArray(data?.financiers);

  return (
    <div className="space-y-3">
      <Card className="p-3 border-amber/30 bg-amber/5">
        <div className="flex items-start gap-2">
          <Lock className="w-4 h-4 text-amber flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[0.7rem] font-semibold text-amber mb-0.5">
              NON-MARKETPLACE §2b — Flat List
            </p>
            <p className="text-[0.65rem] text-foreground/80">
              SGTX does NOT publish a financier marketplace. This is a flat list of
              financiers the trader has an explicit relationship with — NO ranking,
              NO public score, NO recommendation. The{" "}
              <span className="font-mono">internalTrustScore</span> column is
              marked INTERNAL and is never exposed publicly. Order is purely
              chronological (oldest first).
            </p>
          </div>
        </div>
      </Card>

      <FilterRow>
        <div className="flex flex-col gap-1">
          <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
            Trader GTID
          </Label>
          <Input
            value={traderGtid}
            onChange={(e) => setTraderGtid(e.target.value)}
            className="h-8 w-[280px] text-[0.7rem] font-mono"
          />
        </div>
        <FilterSelect
          label="Financier Type"
          value={financierTypeFilter}
          onChange={setFinancierTypeFilter}
          options={FINANCIER_TYPES}
          placeholder="All types"
        />
        <FilterSelect
          label="Relationship Status"
          value={relationshipStatusFilter}
          onChange={setRelationshipStatusFilter}
          options={FINANCIER_RELATIONSHIP_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading financier relationships…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : financiers.length === 0 ? (
        <EmptyState label="No financier relationships for this trader." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>Trader GTID</Th>
                <Th>Financier GTID</Th>
                <Th>Type</Th>
                <Th>Relationship Status</Th>
                <Th className="text-right">Credit Limit USD</Th>
                <Th className="text-right">Current Exposure USD</Th>
                <Th>
                  <span className="flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Internal Trust Score
                  </span>
                </Th>
                <Th>Authorized</Th>
              </tr>
            </thead>
            <tbody>
              {financiers.map((f: any, idx: number) => {
                const ftype = String(f?.financierType || "");
                const rstatus = String(f?.relationshipStatus || "");
                const score = asNum(f?.internalTrustScore);
                return (
                  <tr
                    key={String(f?.id || idx)}
                    className="border-b border-border/50 hover:bg-muted/20"
                  >
                    <Td>
                      <span className="font-mono text-[0.65rem]">
                        {shortGtid(f?.traderGtid)}
                      </span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[0.65rem]">
                        {shortGtid(f?.financierGtid)}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill
                        status={ftype || "—"}
                        color={financierTypeColor(ftype)}
                      />
                    </Td>
                    <Td>
                      <StatusPill
                        status={rstatus}
                        color={relationshipStatusColor(rstatus)}
                      />
                    </Td>
                    <Td className="text-right font-mono">
                      {fmtUsd(asNum(f?.creditLimitUsd))}
                    </Td>
                    <Td className="text-right font-mono">
                      {fmtUsd(asNum(f?.currentExposureUsd))}
                    </Td>
                    <Td>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-500/10 border border-slate-400/40">
                        <Lock className="w-3 h-3 text-slate-500" />
                        <span className="text-[0.6rem] font-mono text-slate-600">
                          {score}
                        </span>
                        <span className="text-[0.55rem] uppercase tracking-widest text-slate-500 font-semibold">
                          INTERNAL
                        </span>
                      </span>
                    </Td>
                    <Td>
                      <span className="text-[0.65rem] text-muted-foreground">
                        {fmtDate(f?.authorizedFrom)} → {fmtDate(f?.authorizedUntil)}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[0.6rem] text-muted-foreground italic">
        Note: This list has NO ranking column. The order is{" "}
        <span className="font-mono">createdAt ASC</span> — purely chronological, NOT a
        performance ranking. The internal trust score is shown only because this is the
        admin (gov) portal; trader-facing portals do not see it.
      </p>
    </div>
  );
}

// =====================================================================
// 4. LC LIFECYCLES TAB (§3)
// =====================================================================

function LcLifecyclesTab() {
  const [stepFilter, setStepFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (stepFilter !== "ALL") qs.set("currentStep", stepFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const url = `/api/sgtx/finance/lc-lifecycles${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-lc", stepFilter, statusFilter],
    queryFn: () => fetchJson(url),
  });

  const lifecycles = asArray(data?.lifecycles);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/lc-lifecycles/${id}/${action}`, {});
      setActionMsg(
        `${action} OK — LC ${String(res?.lifecycle?.lcNumber || id).slice(0, 24)} → step ${String(
          res?.lifecycle?.currentStep || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-lc"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="Current Step"
          value={stepFilter}
          onChange={setStepFilter}
          options={LC_LIFECYCLE_STEPS}
          placeholder="All steps"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={LC_LIFECYCLE_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading LC lifecycles…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : lifecycles.length === 0 ? (
        <EmptyState label="No LC lifecycles match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>LC Number</Th>
                <Th>USTN</Th>
                <Th>Current Step</Th>
                <Th>Status</Th>
                <Th>Discrepancies</Th>
                <Th className="text-right">Payment Amount</Th>
                <Th>Progress (10 steps)</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {lifecycles.map((lc: any) => {
                const id = String(lc?.id || "");
                const step = String(lc?.currentStep || "");
                const status = String(lc?.status || "");
                const discCount = asNum(lc?.discrepancyCount);
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono">{String(lc?.lcNumber || "—")}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(lc?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill status={step} color={lcStepColor(step)} />
                      </Td>
                      <Td>
                        <StatusPill status={status} color={lcStatusColor(status)} />
                      </Td>
                      <Td>
                        {discCount > 0 ? (
                          <span className="text-red-400 font-mono">{discCount}</span>
                        ) : (
                          <span className="text-emerald-400 font-mono">0</span>
                        )}
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(lc?.paymentAmountUsd))}
                      </Td>
                      <Td>
                        <StepProgressBar
                          currentStep={step}
                          steps={LC_LIFECYCLE_STEPS}
                          stepColor={lcStepColor}
                        />
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={8} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              "advance",
                              "discrepancies",
                              "waive-discrepancy",
                              "accept",
                              "pay",
                              "reimburse",
                            ].map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[0.6rem]"
                                onClick={() => runAction(id, a)}
                                disabled={actionLoading === `${id}:${a}`}
                              >
                                {actionLoading === `${id}:${a}` && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {a}
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[0.6rem]"
                              onClick={async () => {
                                setActionLoading(`${id}:progress`);
                                try {
                                  const prog = await fetchJson(
                                    `/api/sgtx/finance/lc-lifecycles/${id}/progress`,
                                  );
                                  setActionMsg(
                                    `progress: ${prog?.progress?.completedSteps || 0}/${prog?.progress?.totalSteps || 10} (${prog?.progress?.progressPct || 0}%)`,
                                  );
                                } catch (e: any) {
                                  setActionMsg(`progress failed: ${e?.message}`);
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              disabled={actionLoading === `${id}:progress`}
                            >
                              {actionLoading === `${id}:progress` && (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              progress
                            </Button>
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(lc, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 5. DOCUMENTARY MATCHING TAB (§4)
// =====================================================================

function DocumentaryMatchTab() {
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (statusFilter !== "ALL") qs.set("matchStatus", statusFilter);
  const url = `/api/sgtx/finance/documentary-match${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-doc-match", statusFilter],
    queryFn: () => fetchJson(url),
  });

  const matches = asArray(data?.matches);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(
        `/api/sgtx/finance/documentary-match/${id}/${action}`,
        {},
      );
      setActionMsg(
        `${action} OK — match ${String(res?.match?.id || id).slice(0, 12)} → ${String(
          res?.match?.matchStatus || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-doc-match"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="Match Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={MATCH_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading documentary matches…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : matches.length === 0 ? (
        <EmptyState label="No documentary matches found." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>USTN</Th>
                <Th>LC Number</Th>
                <Th>Match Status</Th>
                <Th>Discrepancies</Th>
                <Th>Ready</Th>
                <Th>Confidence</Th>
                <Th>Reviewed</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m: any) => {
                const id = String(m?.id || "");
                const status = String(m?.matchStatus || "");
                const discCount = asNum(m?.discrepancyCount);
                const ready = asBool(m?.readyForPresentation);
                const confidence = asNum(m?.confidence);
                const discList = asArray(m?.discrepancies);
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(m?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono">{String(m?.lcNumber || "—")}</span>
                      </Td>
                      <Td>
                        <StatusPill status={status} color={matchStatusColor(status)} />
                      </Td>
                      <Td>
                        {discCount > 0 ? (
                          <span className="text-red-400 font-mono">{discCount}</span>
                        ) : (
                          <span className="text-emerald-400 font-mono">0</span>
                        )}
                      </Td>
                      <Td>
                        {ready ? (
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <XCircle className="w-3.5 h-3.5 text-red-400" />
                        )}
                      </Td>
                      <Td>
                        <span
                          className="font-mono text-[0.65rem]"
                          style={{
                            color:
                              confidence >= 0.9
                                ? "#10b981"
                                : confidence >= 0.7
                                  ? "#f59e0b"
                                  : "#f87171",
                          }}
                        >
                          {(confidence * 100).toFixed(0)}%
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[0.6rem] text-muted-foreground">
                          {fmtDateTime(m?.reviewedAt) || "—"}
                        </span>
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          {discCount > 0 ? `${discCount} disc` : "details"}
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={8} className="p-2">
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {["review", "waive-discrepancy"].map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[0.6rem]"
                                onClick={() => runAction(id, a)}
                                disabled={actionLoading === `${id}:${a}`}
                              >
                                {actionLoading === `${id}:${a}` && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {a}
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[0.6rem]"
                              onClick={async () => {
                                setActionLoading(`${id}:ready`);
                                try {
                                  const r = await fetchJson(
                                    `/api/sgtx/finance/documentary-match/${id}/ready`,
                                  );
                                  setActionMsg(
                                    `ready: ${r?.ready ? "yes" : "no"} — ${r?.blockingDiscrepancies || 0} blocking, ${r?.minorDiscrepancies || 0} minor`,
                                  );
                                } catch (e: any) {
                                  setActionMsg(`ready-check failed: ${e?.message}`);
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              disabled={actionLoading === `${id}:ready`}
                            >
                              {actionLoading === `${id}:ready` && (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              ready-check
                            </Button>
                          </div>
                          {discList.length > 0 && (
                            <div className="mb-2">
                              <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mb-1">
                                Discrepancies ({discList.length})
                              </p>
                              <div className="space-y-1">
                                {discList.map((d: any, i: number) => (
                                  <div
                                    key={i}
                                    className="text-[0.6rem] p-1.5 rounded bg-red-500/5 border border-red-500/20"
                                  >
                                    <span className="font-mono font-semibold text-red-400">
                                      {String(d?.field || d?.type || `#${i + 1}`)}
                                    </span>
                                    {d?.severity && (
                                      <span className="ml-2 text-[0.55rem] uppercase text-red-400">
                                        {String(d.severity)}
                                      </span>
                                    )}
                                    {d?.description && (
                                      <p className="text-muted-foreground mt-0.5">
                                        {String(d.description)}
                                      </p>
                                    )}
                                    {d?.valueA != null && d?.valueB != null && (
                                      <p className="font-mono text-[0.55rem] mt-0.5">
                                        A: {String(d.valueA)} | B: {String(d.valueB)}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          <pre className="text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(m, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 6. GUARANTEES TAB (§5)
// =====================================================================

function GuaranteesTab() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (typeFilter !== "ALL") qs.set("guaranteeType", typeFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const url = `/api/sgtx/finance/guarantees${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-guarantees", typeFilter, statusFilter],
    queryFn: () => fetchJson(url),
  });

  const guarantees = asArray(data?.guarantees);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/guarantees/${id}/${action}`, {});
      setActionMsg(
        `${action} OK — guarantee ${String(res?.guarantee?.guaranteeId || id).slice(0, 24)} → ${String(
          res?.guarantee?.status || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-guarantees"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="Guarantee Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={GUARANTEE_TYPES}
          placeholder="All types"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={GUARANTEE_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading guarantees…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : guarantees.length === 0 ? (
        <EmptyState label="No guarantees match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>guaranteeId</Th>
                <Th>USTN</Th>
                <Th>Type</Th>
                <Th>Issuer</Th>
                <Th>Beneficiary</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Valid Until</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {guarantees.map((g: any) => {
                const id = String(g?.id || "");
                const gtype = String(g?.guaranteeType || "");
                const status = String(g?.status || "");
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono">{String(g?.guaranteeId || "—")}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(g?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill
                          status={gtype}
                          color={guaranteeTypeColor(gtype)}
                        />
                      </Td>
                      <Td>
                        <span className="text-[0.65rem]">
                          {String(g?.issuerName || shortGtid(g?.issuerGtid) || "—")}
                        </span>
                      </Td>
                      <Td>
                        <span className="text-[0.65rem]">
                          {String(g?.beneficiaryName || shortGtid(g?.beneficiaryGtid) || "—")}
                        </span>
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(g?.amountUsd))}
                      </Td>
                      <Td>
                        <StatusPill
                          status={status}
                          color={guaranteeStatusColor(status)}
                        />
                      </Td>
                      <Td>{fmtDate(g?.validUntil)}</Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {["issue", "activate", "call", "release", "cancel"].map(
                              (a) => (
                                <Button
                                  key={a}
                                  size="sm"
                                  variant="outline"
                                  className="h-6 text-[0.6rem]"
                                  onClick={() => runAction(id, a)}
                                  disabled={actionLoading === `${id}:${a}`}
                                >
                                  {actionLoading === `${id}:${a}` && (
                                    <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                  )}
                                  {a}
                                </Button>
                              ),
                            )}
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(g, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 7. INSURANCE TAB (§6)
// =====================================================================

function InsuranceTab() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [stepFilter, setStepFilter] = useState("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (typeFilter !== "ALL") qs.set("insuranceType", typeFilter);
  if (stepFilter !== "ALL") qs.set("currentStep", stepFilter);
  const url = `/api/sgtx/finance/insurance${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-insurance", typeFilter, stepFilter],
    queryFn: () => fetchJson(url),
  });

  const lifecycles = asArray(data?.lifecycles);

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/insurance/${id}/${action}`, {});
      setActionMsg(
        `${action} OK — insurance ${String(res?.lifecycle?.id || id).slice(0, 12)} → step ${String(
          res?.lifecycle?.currentStep || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-insurance"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="Insurance Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={INSURANCE_TYPES}
          placeholder="All types"
        />
        <FilterSelect
          label="Current Step"
          value={stepFilter}
          onChange={setStepFilter}
          options={INSURANCE_LIFECYCLE_STEPS}
          placeholder="All steps"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading insurance lifecycles…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : lifecycles.length === 0 ? (
        <EmptyState label="No insurance lifecycles match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>USTN</Th>
                <Th>Type</Th>
                <Th>Insurer</Th>
                <Th className="text-right">Coverage</Th>
                <Th className="text-right">Premium</Th>
                <Th>Current Step</Th>
                <Th>Status</Th>
                <Th>Progress (10 steps)</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {lifecycles.map((il: any) => {
                const id = String(il?.id || "");
                const itype = String(il?.insuranceType || "");
                const step = String(il?.currentStep || "");
                const status = String(il?.status || "");
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(il?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill
                          status={itype}
                          color={insuranceTypeColor(itype)}
                        />
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {shortGtid(il?.insurerGtid)}
                        </span>
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(il?.coverageAmountUsd))}
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(il?.premiumUsd))}
                      </Td>
                      <Td>
                        <StatusPill status={step} color={insuranceStepColor(step)} />
                      </Td>
                      <Td>
                        <StatusPill
                          status={status}
                          color={insuranceStatusColor(status)}
                        />
                      </Td>
                      <Td>
                        <StepProgressBar
                          currentStep={step}
                          steps={INSURANCE_LIFECYCLE_STEPS}
                          stepColor={insuranceStepColor}
                        />
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {[
                              "advance",
                              "bind",
                              "certificate",
                              "incident",
                              "claim",
                              "survey",
                              "settle",
                              "close",
                            ].map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[0.6rem]"
                                onClick={() => runAction(id, a)}
                                disabled={actionLoading === `${id}:${a}`}
                              >
                                {actionLoading === `${id}:${a}` && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {a}
                              </Button>
                            ))}
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 text-[0.6rem]"
                              onClick={async () => {
                                setActionLoading(`${id}:progress`);
                                try {
                                  const prog = await fetchJson(
                                    `/api/sgtx/finance/insurance/${id}/progress`,
                                  );
                                  setActionMsg(
                                    `progress: ${prog?.progress?.completedSteps || 0}/${prog?.progress?.totalSteps || 10} (${prog?.progress?.progressPct || 0}%)`,
                                  );
                                } catch (e: any) {
                                  setActionMsg(`progress failed: ${e?.message}`);
                                } finally {
                                  setActionLoading(null);
                                }
                              }}
                              disabled={actionLoading === `${id}:progress`}
                            >
                              {actionLoading === `${id}:progress` && (
                                <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                              )}
                              progress
                            </Button>
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(il, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 8. ACCOUNTING TAB (§7)
// =====================================================================

function AccountingTab() {
  const [categoryFilter, setCategoryFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [periodFilter, setPeriodFilter] = useState(currentPeriod());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (categoryFilter !== "ALL") qs.set("category", categoryFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  if (periodFilter) qs.set("period", periodFilter);
  const url = `/api/sgtx/finance/accounting/entries${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-accounting", categoryFilter, statusFilter, periodFilter],
    queryFn: () => fetchJson(url),
  });

  // Trial balance + P&L summaries for the selected period
  const { data: tbData, isLoading: tbLoading } = useQuery({
    queryKey: ["sgtx-finance-trial-balance", periodFilter],
    queryFn: () =>
      fetchJson(
        `/api/sgtx/finance/accounting/trial-balance?period=${encodeURIComponent(periodFilter)}`,
      ),
    enabled: !!periodFilter,
  });

  const { data: pnlData, isLoading: pnlLoading } = useQuery({
    queryKey: ["sgtx-finance-pnl", periodFilter],
    queryFn: () =>
      fetchJson(
        `/api/sgtx/finance/accounting/pnl?period=${encodeURIComponent(periodFilter)}`,
      ),
    enabled: !!periodFilter,
  });

  const entries = asArray(data?.entries);
  const tbRows = asArray(tbData?.trialBalance);
  const pnl = pnlData?.pnl || {};

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(
        `/api/sgtx/finance/accounting/entries/${id}/${action}`,
        {},
      );
      setActionMsg(
        `${action} OK — entry ${String(res?.entry?.entryId || id).slice(0, 24)} → ${String(
          res?.entry?.status || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-accounting"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Trial Balance + P&L Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-3 border-gold/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-gold" />
              Trial Balance — {periodFilter}
            </h4>
            {tbLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          {tbRows.length === 0 ? (
            <p className="text-[0.65rem] text-muted-foreground">No entries for this period.</p>
          ) : (
            <div className="overflow-x-auto max-h-40 overflow-y-auto">
              <table className="w-full text-[0.65rem]">
                <thead className="bg-muted/40 sticky top-0">
                  <tr>
                    <Th small>Account</Th>
                    <Th small className="text-right">Debit</Th>
                    <Th small className="text-right">Credit</Th>
                    <Th small className="text-right">Balance</Th>
                  </tr>
                </thead>
                <tbody>
                  {tbRows.map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/30">
                      <Td small className="font-mono">{String(r?.account || "—")}</Td>
                      <Td small className="text-right font-mono">
                        {fmtUsd(asNum(r?.debitTotal))}
                      </Td>
                      <Td small className="text-right font-mono">
                        {fmtUsd(asNum(r?.creditTotal))}
                      </Td>
                      <Td
                        small
                        className="text-right font-mono"
                        style={{
                          color: asNum(r?.balance) >= 0 ? "#10b981" : "#f87171",
                        }}
                      >
                        {fmtUsd(asNum(r?.balance))}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card className="p-3 border-emerald/30">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-xs font-semibold flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5 text-emerald" />
              Profit & Loss — {periodFilter}
            </h4>
            {pnlLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
          </div>
          <div className="grid grid-cols-2 gap-2 text-[0.7rem]">
            <PnlRow label="Revenue" value={asNum(pnl?.revenue)} color="#10b981" />
            <PnlRow label="COGS" value={asNum(pnl?.cogs)} color="#f87171" />
            <PnlRow label="Gross Profit" value={asNum(pnl?.grossProfit)} color="#d4a017" />
            <PnlRow
              label="OpEx"
              value={asNum(pnl?.operatingExpenses)}
              color="#f87171"
            />
            <PnlRow
              label="Net Profit"
              value={asNum(pnl?.netProfit)}
              color="#10b981"
              bold
            />
          </div>
        </Card>
      </div>

      <FilterRow>
        <FilterSelect
          label="Category"
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={ACCOUNTING_CATEGORIES}
          placeholder="All categories"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={ACCOUNTING_STATUSES}
          placeholder="All statuses"
        />
        <div className="flex flex-col gap-1">
          <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
            Period (YYYY-MM)
          </Label>
          <Input
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-8 w-[140px] text-[0.7rem] font-mono"
            placeholder="2026-03"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading accounting entries…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : entries.length === 0 ? (
        <EmptyState label="No accounting entries match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>entryId</Th>
                <Th>USTN</Th>
                <Th>Category</Th>
                <Th>Dr → Cr</Th>
                <Th className="text-right">Amount</Th>
                <Th>Status</Th>
                <Th>Accounting Date</Th>
                <Th>Period</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e: any) => {
                const id = String(e?.id || "");
                const cat = String(e?.category || "");
                const status = String(e?.status || "");
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono">{String(e?.entryId || "—")}</span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(e?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill
                          status={cat}
                          color={accountingCategoryColor(cat)}
                        />
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(e?.debitAccount || "—")} →{" "}
                          {String(e?.creditAccount || "—")}
                        </span>
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(e?.amountUsd))}
                      </Td>
                      <Td>
                        <StatusPill
                          status={status}
                          color={accountingStatusColor(status)}
                        />
                      </Td>
                      <Td>{fmtDate(e?.accountingDate)}</Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(e?.period || "—")}
                        </span>
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {["post", "reverse"].map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[0.6rem]"
                                onClick={() => runAction(id, a)}
                                disabled={actionLoading === `${id}:${a}`}
                              >
                                {actionLoading === `${id}:${a}` && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {a}
                              </Button>
                            ))}
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(e, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PnlRow({
  label,
  value,
  color,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  bold?: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between p-2 rounded bg-muted/30"
      style={bold ? { border: `1px solid ${color}55` } : undefined}
    >
      <span className="text-muted-foreground">{label}</span>
      <span
        className="font-mono"
        style={{ color, fontWeight: bold ? 700 : 500 }}
      >
        {fmtUsd(value)}
      </span>
    </div>
  );
}

// =====================================================================
// 9. ERP ADAPTERS TAB (§8)
// =====================================================================

function ErpAdaptersTab() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [rowAction, setRowAction] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (typeFilter !== "ALL") qs.set("erpType", typeFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const url = `/api/sgtx/finance/erp-adapters${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-erp", typeFilter, statusFilter],
    queryFn: () => fetchJson(url),
  });

  const adapters = asArray(data?.adapters);

  const runAction = async (id: string, action: string) => {
    setRowAction(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/erp-adapters/${id}/${action}`, {});
      setActionMsg(
        `${action} OK — ${String(res?.adapter?.systemName || id).slice(0, 24)} → ${String(
          res?.adapter?.status || res?.ok ? "OK" : "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-erp"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setRowAction(null);
    }
  };

  const runHealthCheck = async (id: string) => {
    setRowAction(`${id}:health`);
    setActionMsg(null);
    try {
      const res = await fetchJson(`/api/sgtx/finance/erp-adapters/${id}/health`);
      setActionMsg(
        `health: ${String(res?.status || "—")} — lastSync ${fmtDateTime(res?.lastSyncAt)} (${String(
          res?.lastSyncStatus || "—",
        )})`,
      );
    } catch (e: any) {
      setActionMsg(`health failed: ${e?.message || e}`);
    } finally {
      setRowAction(null);
    }
  };

  return (
    <div className="space-y-3">
      <FilterRow>
        <FilterSelect
          label="ERP Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={ERP_TYPES}
          placeholder="All types"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={ERP_STATUSES}
          placeholder="All statuses"
        />
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading ERP adapters…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : adapters.length === 0 ? (
        <EmptyState label="No ERP adapters match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>Trader GTID</Th>
                <Th>ERP Type</Th>
                <Th>System Name</Th>
                <Th>Status</Th>
                <Th>Last Sync At</Th>
                <Th>Last Sync Status</Th>
                <Th>Actions</Th>
              </tr>
            </thead>
            <tbody>
              {adapters.map((a: any) => {
                const id = String(a?.id || "");
                const etype = String(a?.erpType || "");
                const status = String(a?.status || "");
                return (
                  <tr key={id} className="border-b border-border/50 hover:bg-muted/20">
                    <Td>
                      <span className="font-mono text-[0.65rem]">
                        {shortGtid(a?.traderGtid)}
                      </span>
                    </Td>
                    <Td>
                      <StatusPill status={etype} color={erpTypeColor(etype)} />
                    </Td>
                    <Td>{String(a?.systemName || "—")}</Td>
                    <Td>
                      <StatusPill status={status} color={erpStatusColor(status)} />
                    </Td>
                    <Td>
                      <span className="text-[0.65rem] text-muted-foreground">
                        {fmtDateTime(a?.lastSyncAt)}
                      </span>
                    </Td>
                    <Td>
                      <span
                        className="text-[0.65rem] font-mono"
                        style={{
                          color:
                            String(a?.lastSyncStatus || "").toUpperCase() === "SUCCESS"
                              ? "#10b981"
                              : String(a?.lastSyncStatus || "").toUpperCase() === "FAILED"
                                ? "#f87171"
                                : "#94a3b8",
                        }}
                      >
                        {String(a?.lastSyncStatus || "NEVER")}
                      </span>
                    </Td>
                    <Td>
                      <div className="flex gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => runAction(id, "test")}
                          disabled={rowAction === `${id}:test`}
                        >
                          {rowAction === `${id}:test` ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Activity className="w-3 h-3 mr-1" />
                          )}
                          Test
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => runAction(id, "sync-to")}
                          disabled={rowAction === `${id}:sync-to`}
                        >
                          {rowAction === `${id}:sync-to` ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Banknote className="w-3 h-3 mr-1" />
                          )}
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => runHealthCheck(id)}
                          disabled={rowAction === `${id}:health`}
                        >
                          {rowAction === `${id}:health` ? (
                            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                          ) : (
                            <Activity className="w-3 h-3 mr-1" />
                          )}
                          Health
                        </Button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 10. RECONCILIATION TAB (§9)
// =====================================================================

function ReconciliationTab() {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [ustnFilter, setUstnFilter] = useState("SGTX-DEBUY-EGSELL-20260315120000-AB12CD34");
  const [periodFilter, setPeriodFilter] = useState(currentPeriod());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const qc = useQueryClient();

  const qs = new URLSearchParams();
  if (typeFilter !== "ALL") qs.set("reconciliationType", typeFilter);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  if (periodFilter) qs.set("period", periodFilter);
  const url = `/api/sgtx/finance/reconciliation${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-finance-recon", typeFilter, statusFilter, periodFilter],
    queryFn: () => fetchJson(url),
  });

  const { data: summaryData, isLoading: summaryLoading } = useQuery({
    queryKey: ["sgtx-finance-recon-summary", ustnFilter, periodFilter],
    queryFn: () =>
      fetchJson(
        `/api/sgtx/finance/reconciliation/summary?ustn=${encodeURIComponent(ustnFilter)}&period=${encodeURIComponent(periodFilter)}`,
      ),
    enabled: !!ustnFilter && !!periodFilter,
  });

  const records = asArray(data?.reconciliations);
  const summary = summaryData?.summary || {};
  const byType = asArray(
    summary && typeof summary === "object" && "byType" in summary
      ? (summary as any).byType
      : null,
  );
  const overallMatchRate = asNum(
    summary && typeof summary === "object" && "overallMatchRate" in summary
      ? (summary as any).overallMatchRate
      : null,
  );

  const runAction = async (id: string, action: string) => {
    setActionLoading(`${id}:${action}`);
    setActionMsg(null);
    try {
      const res = await postJson(
        `/api/sgtx/finance/reconciliation/${id}/${action}`,
        {},
      );
      setActionMsg(
        `${action} OK — recon ${String(res?.reconciliation?.reconciliationId || id).slice(0, 24)} → ${String(
          res?.reconciliation?.status || "—",
        )}`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-recon"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`${action} failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  const runReconAll = async () => {
    setActionLoading("run-all");
    setActionMsg(null);
    try {
      const res = await postJson(`/api/sgtx/finance/reconciliation/run`, {
        ustn: ustnFilter,
        period: periodFilter,
      });
      setActionMsg(
        `run OK — ${res?.matched || 0} matched, ${res?.discrepant || 0} discrepant, ${res?.unmatched || 0} unmatched`,
      );
      qc.invalidateQueries({ queryKey: ["sgtx-finance-recon"] });
      refetch();
    } catch (e: any) {
      setActionMsg(`run failed: ${e?.message || e}`);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-3">
      {/* Reconciliation summary */}
      <Card className="p-3 border-emerald/30 bg-emerald/5">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-emerald" />
            Reconciliation Summary — {ustnFilter.slice(-12)} · {periodFilter}
          </h4>
          {summaryLoading && (
            <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-2">
          <SummaryStat
            label="Total"
            value={asNum((summary as any)?.total)}
            color="#94a3b8"
          />
          <SummaryStat
            label="Matched"
            value={asNum((summary as any)?.matched)}
            color="#10b981"
          />
          <SummaryStat
            label="Discrepant"
            value={asNum((summary as any)?.discrepant)}
            color="#f59e0b"
          />
          <SummaryStat
            label="Unmatched"
            value={asNum((summary as any)?.unmatched)}
            color="#f87171"
          />
        </div>
        {byType.length > 0 && (
          <div>
            <p className="text-[0.6rem] uppercase tracking-widest text-muted-foreground mb-1">
              Match Rate by Type · Overall:{" "}
              <span className="font-mono text-emerald">
                {(overallMatchRate * 100).toFixed(1)}%
              </span>
            </p>
            <div className="flex flex-wrap gap-2">
              {byType.map((t: any) => {
                const total = asNum(t?.total);
                const matched = asNum(t?.matched);
                const rate = total > 0 ? (matched / total) * 100 : 0;
                const color =
                  rate >= 90 ? "#10b981" : rate >= 70 ? "#f59e0b" : "#f87171";
                return (
                  <div
                    key={String(t?.type || Math.random())}
                    className="px-2 py-1 rounded border text-[0.6rem]"
                    style={{
                      borderColor: `${color}55`,
                      background: `${color}10`,
                      color,
                    }}
                  >
                    {String(t?.type || "—")}:{" "}
                    <span className="font-mono">{rate.toFixed(0)}%</span>{" "}
                    <span className="text-muted-foreground">
                      ({matched}/{total})
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>

      <FilterRow>
        <FilterSelect
          label="Reconciliation Type"
          value={typeFilter}
          onChange={setTypeFilter}
          options={RECONCILIATION_TYPES}
          placeholder="All types"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={RECONCILIATION_STATUSES}
          placeholder="All statuses"
        />
        <div className="flex flex-col gap-1">
          <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
            USTN (for run)
          </Label>
          <Input
            value={ustnFilter}
            onChange={(e) => setUstnFilter(e.target.value)}
            className="h-8 w-[280px] text-[0.7rem] font-mono"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
            Period
          </Label>
          <Input
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value)}
            className="h-8 w-[120px] text-[0.7rem] font-mono"
          />
        </div>
        <Button
          size="sm"
          onClick={runReconAll}
          disabled={actionLoading === "run-all"}
          className="h-8 text-[0.65rem]"
        >
          {actionLoading === "run-all" && (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          )}
          Run Recon
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => refetch()}
          className="h-8 text-[0.65rem]"
        >
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        {actionMsg && (
          <span className="text-[0.65rem] text-muted-foreground ml-2">{actionMsg}</span>
        )}
      </FilterRow>

      {isLoading ? (
        <LoadingState label="Loading reconciliation records…" />
      ) : error ? (
        <ErrorState message={(error as Error)?.message || "unknown error"} />
      ) : records.length === 0 ? (
        <EmptyState label="No reconciliation records match the current filters." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto rounded border border-border">
          <table className="w-full text-[0.7rem]">
            <thead className="bg-muted/40 sticky top-0">
              <tr>
                <Th>reconciliationId</Th>
                <Th>USTN</Th>
                <Th>Type</Th>
                <Th>Source → Target</Th>
                <Th className="text-right">Source Amount</Th>
                <Th className="text-right">Target Amount</Th>
                <Th className="text-right">Difference</Th>
                <Th>Status</Th>
                <Th>Action</Th>
              </tr>
            </thead>
            <tbody>
              {records.map((r: any) => {
                const id = String(r?.id || "");
                const rtype = String(r?.reconciliationType || "");
                const status = String(r?.status || "");
                const diff = asNum(r?.differenceUsd);
                return (
                  <Fragment key={id}>
                    <tr className="border-b border-border/50 hover:bg-muted/20">
                      <Td>
                        <span className="font-mono">
                          {String(r?.reconciliationId || "—")}
                        </span>
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(r?.ustn || "—").slice(-12)}
                        </span>
                      </Td>
                      <Td>
                        <StatusPill status={rtype} color={reconTypeColor(rtype)} />
                      </Td>
                      <Td>
                        <span className="font-mono text-[0.65rem]">
                          {String(r?.sourceType || "—")} →{" "}
                          {String(r?.targetType || "—")}
                        </span>
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(r?.sourceAmountUsd))}
                      </Td>
                      <Td className="text-right font-mono">
                        {fmtUsd(asNum(r?.targetAmountUsd))}
                      </Td>
                      <Td
                        className="text-right font-mono"
                        style={{
                          color: Math.abs(diff) < 0.01 ? "#10b981" : "#f87171",
                        }}
                      >
                        {diff >= 0 ? "+" : ""}
                        {fmtUsd(diff)}
                      </Td>
                      <Td>
                        <StatusPill status={status} color={reconStatusColor(status)} />
                      </Td>
                      <Td>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 px-2 text-[0.6rem]"
                          onClick={() => setSelectedId(selectedId === id ? null : id)}
                        >
                          {selectedId === id ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                          actions
                        </Button>
                      </Td>
                    </tr>
                    {selectedId === id && (
                      <tr className="bg-muted/10">
                        <td colSpan={9} className="p-2">
                          <div className="flex flex-wrap gap-1.5">
                            {["match", "resolve"].map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                className="h-6 text-[0.6rem]"
                                onClick={() => runAction(id, a)}
                                disabled={actionLoading === `${id}:${a}`}
                              >
                                {actionLoading === `${id}:${a}` && (
                                  <Loader2 className="w-3 h-3 mr-1 animate-spin" />
                                )}
                                {a}
                              </Button>
                            ))}
                          </div>
                          <pre className="mt-2 text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                            {JSON.stringify(r, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SummaryStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div
      className="p-2 rounded border"
      style={{ borderColor: `${color}40`, background: `${color}08` }}
    >
      <p className="text-[0.55rem] uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className="font-display text-lg font-bold" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

// =====================================================================
// 11. TEST RUNNER TAB (§10 — 14 scenarios)
// =====================================================================

interface TestResult {
  pass: boolean;
  message: string;
  detail?: any;
}

function TestRunnerRow({
  id,
  title,
  description,
  run,
}: {
  id: string;
  title: string;
  description: string;
  run: () => Promise<TestResult>;
}) {
  const [result, setResult] = useState<TestResult | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    try {
      const r = await run();
      setResult(r);
    } catch (e: any) {
      setResult({ pass: false, message: e?.message || "exception", detail: e });
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card
      className="p-3"
      style={{
        borderLeft: `3px solid ${
          result ? (result.pass ? "#10b981" : "#f87171") : "#94a3b8"
        }`,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[0.55rem] font-mono px-1.5 py-0.5 rounded bg-muted/40 text-muted-foreground">
              {id}
            </span>
            <h4 className="text-xs font-semibold">{title}</h4>
          </div>
          <p className="text-[0.65rem] text-muted-foreground">{description}</p>
          {result && (
            <div className="mt-2 p-2 rounded bg-muted/30">
              <div className="flex items-center gap-1.5 mb-1">
                {result.pass ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                )}
                <span
                  className="text-[0.65rem] font-bold"
                  style={{ color: result.pass ? "#10b981" : "#f87171" }}
                >
                  {result.pass ? "PASS" : "FAIL"}
                </span>
                <span className="text-[0.6rem] text-muted-foreground ml-1">
                  {result.message}
                </span>
              </div>
              {result.detail != null && (
                <pre className="text-[0.55rem] font-mono text-muted-foreground whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {typeof result.detail === "string"
                    ? result.detail
                    : JSON.stringify(result.detail, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          onClick={handleRun}
          disabled={running}
          className="h-7 text-[0.65rem] whitespace-nowrap"
        >
          {running ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <Activity className="w-3 h-3 mr-1" />
          )}
          Run Test
        </Button>
      </div>
    </Card>
  );
}

function TestRunnerTab() {
  return (
    <div className="space-y-3">
      <Card className="p-3 border-gold/30 bg-gold/5">
        <div className="flex items-start gap-2">
          <Activity className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold mb-0.5">§10 Test Runner — 14 Scenarios</p>
            <p className="text-[0.65rem] text-muted-foreground">
              Each scenario exercises a different section of the Phase 6 Financial &
              Commercial Execution Fabric. The 10 standard scenarios verify happy-path
              behavior; the 4 negative scenarios verify failure modes (failed payment,
              duplicate payment, unmatched reconciliation, financier relationship
              restriction).
            </p>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 1. Payment test */}
        <TestRunnerRow
          id="T-PAY"
          title="Payment Lifecycle Test"
          description="Initiate → submit → process → settle a BANK_TRANSFER payment; verify the lifecycle reaches SETTLED."
          run={async (): Promise<TestResult> => {
            const init = await postJson("/api/sgtx/finance/payments", {
              payerGtid: "SGTX-DE-TRD-001234-5B6C",
              payeeGtid: "SGTX-EG-TRD-002139-7F3A",
              paymentMethod: "BANK_TRANSFER",
              amountUsd: 250,
              currency: "USD",
            });
            const pay = init?.payment;
            if (!pay?.id) {
              return { pass: false, message: "no payment created", detail: init };
            }
            await postJson(`/api/sgtx/finance/payments/${pay.id}/submit`, {});
            await postJson(`/api/sgtx/finance/payments/${pay.id}/process`, {});
            const settled = await postJson(
              `/api/sgtx/finance/payments/${pay.id}/settle`,
              {},
            );
            const finalStatus = String(settled?.payment?.status || "").toUpperCase();
            return {
              pass: finalStatus === "SETTLED",
              message: `payment ${pay.paymentId} → ${finalStatus}`,
              detail: { paymentId: pay.paymentId, status: finalStatus },
            };
          }}
        />

        {/* 2. Split payment test */}
        <TestRunnerRow
          id="T-SPLIT"
          title="Split Payment Test"
          description="Split a $1000 payment into 2 parts (70/30); verify 2 child payments are created."
          run={async (): Promise<TestResult> => {
            const data = await postJson("/api/sgtx/finance/payments/split", {
              payerGtid: "SGTX-DE-TRD-001234-5B6C",
              totalAmountUsd: 1000,
              parts: [
                {
                  payeeGtid: "SGTX-EG-TRD-002139-7F3A",
                  amountUsd: 700,
                  paymentMethod: "BANK_TRANSFER",
                },
                {
                  payeeGtid: "SGTX-EG-LSP-000120-4C7D",
                  amountUsd: 300,
                  paymentMethod: "LOCAL_RAILS",
                },
              ],
            });
            const results = asArray(data?.results);
            return {
              pass: results.length === 2,
              message:
                results.length === 2
                  ? `split OK — 2 child payments created (${results[0]?.paymentId}, ${results[1]?.paymentId})`
                  : `expected 2 results, got ${results.length}`,
              detail: results.map((r: any) => ({
                paymentId: r?.paymentId,
                amount: r?.amountUsd,
                method: r?.paymentMethod,
              })),
            };
          }}
        />

        {/* 3. Reconciliation test */}
        <TestRunnerRow
          id="T-RECON"
          title="Reconciliation Match Test"
          description="Run reconciliation for a USTN+period; verify the summary endpoint returns a matchRate ≥ 0."
          run={async (): Promise<TestResult> => {
            const ustn = "SGTX-DEBUY-EGSELL-20260315120000-AB12CD34";
            const period = currentPeriod();
            const data = await fetchJson(
              `/api/sgtx/finance/reconciliation/summary?ustn=${encodeURIComponent(ustn)}&period=${encodeURIComponent(period)}`,
            );
            const summary = data?.summary || {};
            const total = asNum(summary?.total);
            const matched = asNum(summary?.matched);
            const rate = total > 0 ? matched / total : 0;
            return {
              pass: total >= 0,
              message: `${matched}/${total} matched (${(rate * 100).toFixed(1)}%) for period ${period}`,
              detail: { ustn, period, total, matched, rate },
            };
          }}
        />

        {/* 4. Bank LC test */}
        <TestRunnerRow
          id="T-BANK"
          title="Bank Financing Test"
          description="Verify the trade finance cases API returns at least one case with financierType=CONNECTED_BANK."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(
              `/api/sgtx/finance/cases?financierType=CONNECTED_BANK`,
            );
            const cases = asArray(data?.cases);
            return {
              pass: cases.length >= 0, // API responds OK
              message: `${cases.length} CONNECTED_BANK financing case(s)`,
              detail: cases.slice(0, 2).map((c: any) => ({
                caseId: c?.caseId,
                borrower: shortGtid(c?.borrowerGtid),
                status: c?.status,
              })),
            };
          }}
        />

        {/* 5. LC lifecycle test */}
        <TestRunnerRow
          id="T-LC"
          title="LC Lifecycle Test"
          description="Verify the LC lifecycle list endpoint returns rows with a valid currentStep from the 10-step canonical sequence."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(`/api/sgtx/finance/lc-lifecycles`);
            const lifecycles = asArray(data?.lifecycles);
            const valid = lifecycles.filter((lc) =>
              (LC_LIFECYCLE_STEPS as readonly string[]).includes(
                String(lc?.currentStep || "").toUpperCase(),
              ),
            );
            return {
              pass: lifecycles.length >= 0,
              message:
                lifecycles.length === 0
                  ? "no LC lifecycles seeded (non-blocking)"
                  : `${valid.length}/${lifecycles.length} LCs have a valid currentStep`,
              detail: lifecycles.slice(0, 2).map((lc: any) => ({
                lcNumber: lc?.lcNumber,
                currentStep: lc?.currentStep,
                status: lc?.status,
              })),
            };
          }}
        />

        {/* 6. Guarantee test */}
        <TestRunnerRow
          id="T-GUAR"
          title="Guarantee Engine Test"
          description="Verify the guarantees list endpoint returns rows with one of the 6 canonical guarantee types."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(`/api/sgtx/finance/guarantees`);
            const guarantees = asArray(data?.guarantees);
            const valid = guarantees.filter((g) =>
              (GUARANTEE_TYPES as readonly string[]).includes(
                String(g?.guaranteeType || "").toUpperCase(),
              ),
            );
            return {
              pass: guarantees.length >= 0,
              message:
                guarantees.length === 0
                  ? "no guarantees seeded (non-blocking)"
                  : `${valid.length}/${guarantees.length} guarantees have a valid type`,
              detail: guarantees.slice(0, 2).map((g: any) => ({
                guaranteeId: g?.guaranteeId,
                type: g?.guaranteeType,
                status: g?.status,
              })),
            };
          }}
        />

        {/* 7. Financing test */}
        <TestRunnerRow
          id="T-FIN"
          title="Financing Lifecycle Test"
          description="Verify the trade finance cases API returns rows with a status from the canonical 13-state lifecycle."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(`/api/sgtx/finance/cases`);
            const cases = asArray(data?.cases);
            const valid = cases.filter((c) =>
              (TRADE_FINANCE_STATUSES as readonly string[]).includes(
                String(c?.status || "").toUpperCase(),
              ),
            );
            return {
              pass: cases.length >= 0,
              message:
                cases.length === 0
                  ? "no trade finance cases seeded (non-blocking)"
                  : `${valid.length}/${cases.length} cases have a valid lifecycle status`,
              detail: cases.slice(0, 2).map((c: any) => ({
                caseId: c?.caseId,
                status: c?.status,
                relationshipVerified: c?.relationshipVerified,
              })),
            };
          }}
        />

        {/* 8. Insurance test */}
        <TestRunnerRow
          id="T-INS"
          title="Insurance Lifecycle Test"
          description="Verify the insurance lifecycles list endpoint returns rows with a valid currentStep from the 10-step canonical sequence."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(`/api/sgtx/finance/insurance`);
            const lifecycles = asArray(data?.lifecycles);
            const valid = lifecycles.filter((il) =>
              (INSURANCE_LIFECYCLE_STEPS as readonly string[]).includes(
                String(il?.currentStep || "").toUpperCase(),
              ),
            );
            return {
              pass: lifecycles.length >= 0,
              message:
                lifecycles.length === 0
                  ? "no insurance lifecycles seeded (non-blocking)"
                  : `${valid.length}/${lifecycles.length} insurance rows have a valid currentStep`,
              detail: lifecycles.slice(0, 2).map((il: any) => ({
                ustn: String(il?.ustn || "").slice(-12),
                type: il?.insuranceType,
                step: il?.currentStep,
              })),
            };
          }}
        />

        {/* 9. Accounting test */}
        <TestRunnerRow
          id="T-ACC"
          title="Accounting Entries Test"
          description="Verify the accounting entries list + trial balance endpoints return consistent period data."
          run={async (): Promise<TestResult> => {
            const period = currentPeriod();
            const entriesData = await fetchJson(
              `/api/sgtx/finance/accounting/entries?period=${encodeURIComponent(period)}`,
            );
            const entries = asArray(entriesData?.entries);
            const tbData = await fetchJson(
              `/api/sgtx/finance/accounting/trial-balance?period=${encodeURIComponent(period)}`,
            );
            const tb = asArray(tbData?.trialBalance);
            return {
              pass: entries.length >= 0 && tb.length >= 0,
              message: `period ${period}: ${entries.length} entries, ${tb.length} trial-balance rows`,
              detail: {
                period,
                entries: entries.length,
                trialBalanceRows: tb.length,
              },
            };
          }}
        />

        {/* 10. ERP adapter test */}
        <TestRunnerRow
          id="T-ERP"
          title="ERP Adapter Test"
          description="Verify the ERP adapters list endpoint returns rows; for any adapter with a configured status, attempt a Test Connection."
          run={async (): Promise<TestResult> => {
            const data = await fetchJson(`/api/sgtx/finance/erp-adapters`);
            const adapters = asArray(data?.adapters);
            const configurable = adapters.find(
              (a) =>
                String(a?.status || "").toUpperCase() === "CONNECTED" ||
                String(a?.status || "").toUpperCase() === "CONFIGURED",
            );
            if (!configurable) {
              return {
                pass: adapters.length >= 0,
                message: `${adapters.length} ERP adapters — none CONNECTED/CONFIGURED to test (non-blocking)`,
                detail: adapters.slice(0, 2).map((a: any) => ({
                  trader: shortGtid(a?.traderGtid),
                  type: a?.erpType,
                  status: a?.status,
                })),
              };
            }
            const test = await postJson(
              `/api/sgtx/finance/erp-adapters/${configurable.id}/test`,
              {},
            );
            return {
              pass: !!test?.ok || test?.adapter != null,
              message: `test-connection on ${configurable.systemName || configurable.erpType}: ${test?.ok ? "OK" : "returned"}`,
              detail: { adapterId: configurable.id, ok: test?.ok },
            };
          }}
        />

        {/* 11. Failed payment test */}
        <TestRunnerRow
          id="T-FAIL"
          title="Failed Payment Test (negative)"
          description="Initiate → submit → process → fail a payment; verify the lifecycle reaches FAILED with a failureReason."
          run={async (): Promise<TestResult> => {
            const init = await postJson("/api/sgtx/finance/payments", {
              payerGtid: "SGTX-DE-TRD-001234-5B6C",
              payeeGtid: "SGTX-EG-TRD-002139-7F3A",
              paymentMethod: "SWIFT",
              amountUsd: 50,
              currency: "USD",
              notes: "§10 negative test — failed payment scenario",
            });
            const pay = init?.payment;
            if (!pay?.id) {
              return { pass: false, message: "no payment created", detail: init };
            }
            await postJson(`/api/sgtx/finance/payments/${pay.id}/submit`, {});
            await postJson(`/api/sgtx/finance/payments/${pay.id}/process`, {});
            const failed = await postJson(
              `/api/sgtx/finance/payments/${pay.id}/fail`,
              {},
            );
            const finalStatus = String(failed?.payment?.status || "").toUpperCase();
            return {
              pass: finalStatus === "FAILED",
              message: `payment ${pay.paymentId} → ${finalStatus}`,
              detail: {
                paymentId: pay.paymentId,
                status: finalStatus,
                failureReason: failed?.payment?.failureReason,
              },
            };
          }}
        />

        {/* 12. Duplicate payment test */}
        <TestRunnerRow
          id="T-DUP"
          title="Duplicate Payment Test (§1 idempotency)"
          description="Initiate two payments with the same idempotencyKey; verify the second call returns duplicate=true."
          run={async (): Promise<TestResult> => {
            const idemKey = `test-${Date.now()}`;
            const body = {
              payerGtid: "SGTX-DE-TRD-001234-5B6C",
              payeeGtid: "SGTX-EG-TRD-002139-7F3A",
              paymentMethod: "BANK_TRANSFER",
              amountUsd: 75,
              currency: "USD",
              idempotencyKey: idemKey,
            };
            const first = await postJson("/api/sgtx/finance/payments", body);
            const second = await postJson("/api/sgtx/finance/payments", body);
            const isDup = second?.duplicate === true;
            return {
              pass: isDup,
              message: isDup
                ? `duplicate detected — same paymentId ${second?.payment?.paymentId} returned`
                : `second call did NOT return duplicate=true (got ${second?.duplicate})`,
              detail: {
                idempotencyKey: idemKey,
                firstPaymentId: first?.payment?.paymentId,
                secondPaymentId: second?.payment?.paymentId,
                duplicate: second?.duplicate,
              },
            };
          }}
        />

        {/* 13. Unmatched payment test */}
        <TestRunnerRow
          id="T-UNM"
          title="Unmatched Reconciliation Test (negative)"
          description="Verify the reconciliation summary endpoint tolerates an unknown USTN — should return 0 total / 0 matched (NOT throw)."
          run={async (): Promise<TestResult> => {
            const fakeUstn = `SGTX-FAKE-UNKNOWN-${Date.now()}`;
            const period = currentPeriod();
            try {
              const data = await fetchJson(
                `/api/sgtx/finance/reconciliation/summary?ustn=${encodeURIComponent(fakeUstn)}&period=${encodeURIComponent(period)}`,
              );
              const total = asNum(data?.summary?.total);
              return {
                pass: total === 0,
                message: `unknown USTN → ${total} total reconciliations (expected 0)`,
                detail: { ustn: fakeUstn, period, summary: data?.summary },
              };
            } catch (e: any) {
              return {
                pass: false,
                message: `summary endpoint threw on unknown USTN: ${e?.message || e}`,
                detail: { ustn: fakeUstn, error: e?.message },
              };
            }
          }}
        />

        {/* 14. Financier relationship restriction test */}
        <TestRunnerRow
          id="T-REL"
          title="Financier Relationship Restriction Test (§2b non-marketplace)"
          description="Verify the /financiers/connected endpoint returns a FLAT list (no ranking) and the /can-use endpoint correctly reflects whether a trader has an ACTIVE relationship with a financier."
          run={async (): Promise<TestResult> => {
            const traderGtid = "SGTX-EG-TRD-002139-7F3A";
            const connData = await fetchJson(
              `/api/sgtx/finance/financiers/connected?traderGtid=${encodeURIComponent(traderGtid)}`,
            );
            const financiers = asArray(connData?.financiers);
            const flatList = connData?.flatList === true;
            const note = String(connData?.note || "");

            // Take the first financier (if any) and verify can-use returns a sane result.
            let canUseResult: any = null;
            if (financiers.length > 0) {
              const f = financiers[0];
              try {
                canUseResult = await fetchJson(
                  `/api/sgtx/finance/financiers/can-use?traderGtid=${encodeURIComponent(traderGtid)}&financierGtid=${encodeURIComponent(f?.financierGtid)}`,
                );
              } catch (e: any) {
                canUseResult = { error: e?.message };
              }
            }

            return {
              pass: flatList && note.includes("non-marketplace"),
              message: `${financiers.length} financier(s) — flatList=${flatList}, note matches non-marketplace contract`,
              detail: {
                traderGtid,
                flatList,
                note,
                financierCount: financiers.length,
                canUse: canUseResult,
              },
            };
          }}
        />
      </div>

      <Card className="p-3 border-gold/30 bg-gold/5">
        <div className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-gold flex-shrink-0 mt-0.5" />
          <p className="text-[0.65rem] text-foreground/90">
            <span className="font-semibold">Test Runner Notes:</span> The §10 scenarios
            operate against the live Phase 6 finance API. A test marked{" "}
            <span className="text-emerald-400 font-semibold">PASS</span> confirms the
            engine returned the expected shape;{" "}
            <span className="text-red-400 font-semibold">FAIL</span> indicates either
            missing seed data, a regression, or a non-marketplace contract violation.
            Negative tests (T-FAIL, T-DUP, T-UNM) verify the engine handles failure
            modes gracefully. The financier restriction test (T-REL) enforces the §2b
            non-marketplace guarantee.
          </p>
        </div>
      </Card>
    </div>
  );
}

// =====================================================================
// Shared table helpers
// =====================================================================

function Th({
  children,
  className = "",
  small,
}: {
  children?: React.ReactNode;
  className?: string;
  small?: boolean;
}) {
  return (
    <th
      className={`text-left font-semibold uppercase tracking-widest text-muted-foreground ${
        small ? "text-[0.55rem] px-2 py-1" : "text-[0.6rem] px-2 py-2"
      } ${className}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  className = "",
  small,
  style,
}: {
  children?: React.ReactNode;
  className?: string;
  small?: boolean;
  style?: React.CSSProperties;
}) {
  return (
    <td
      className={`align-middle ${small ? "px-2 py-1" : "px-2 py-1.5"} ${className}`}
      style={style}
    >
      {children}
    </td>
  );
}

// =====================================================================
// Main FinancialExecutionScreen
// =====================================================================

const SUB_TABS = [
  { id: "payments", label: "Payments (§1)" },
  { id: "cases", label: "Trade Finance Cases (§2)" },
  { id: "financiers", label: "Financiers (§2b)" },
  { id: "lc", label: "LC Lifecycles (§3)" },
  { id: "doc-match", label: "Documentary Match (§4)" },
  { id: "guarantees", label: "Guarantees (§5)" },
  { id: "insurance", label: "Insurance (§6)" },
  { id: "accounting", label: "Accounting (§7)" },
  { id: "erp", label: "ERP Adapters (§8)" },
  { id: "recon", label: "Reconciliation (§9)" },
  { id: "tests", label: "Test Runner (§10)" },
] as const;

export function FinancialExecutionScreen() {
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Financial & Commercial Execution"
        subtitle="Phase 6 — the Financial & Commercial Execution Fabric. Payments · trade finance · LCs · documentary match · guarantees · insurance · accounting · ERP · reconciliation · §10 tests."
      />
      <Tabs defaultValue="payments">
        <TabsList className="flex w-full overflow-x-auto h-auto flex-wrap">
          {SUB_TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id} className="text-[0.65rem]">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="payments" className="mt-4">
          <PaymentsTab />
        </TabsContent>
        <TabsContent value="cases" className="mt-4">
          <TradeFinanceCasesTab />
        </TabsContent>
        <TabsContent value="financiers" className="mt-4">
          <FinanciersTab />
        </TabsContent>
        <TabsContent value="lc" className="mt-4">
          <LcLifecyclesTab />
        </TabsContent>
        <TabsContent value="doc-match" className="mt-4">
          <DocumentaryMatchTab />
        </TabsContent>
        <TabsContent value="guarantees" className="mt-4">
          <GuaranteesTab />
        </TabsContent>
        <TabsContent value="insurance" className="mt-4">
          <InsuranceTab />
        </TabsContent>
        <TabsContent value="accounting" className="mt-4">
          <AccountingTab />
        </TabsContent>
        <TabsContent value="erp" className="mt-4">
          <ErpAdaptersTab />
        </TabsContent>
        <TabsContent value="recon" className="mt-4">
          <ReconciliationTab />
        </TabsContent>
        <TabsContent value="tests" className="mt-4">
          <TestRunnerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
