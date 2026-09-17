"use client";

// SGTX Phase 2 §7 ADMIN — Regulatory Engine screens (gov portal)
// Six sub-tabs that exercise every Phase 2 registry + the compute endpoint:
//   1. Product Profiles   — ProductRegulatoryProfile list + inline compute form
//   2. Classification Rules — ClassificationRule list + type filter
//   3. Tariff Rules       — TariffRule list + tariffType filter
//   4. Origin Rules       — OriginRule list + ruleType filter
//   5. Trade Agreements   — TradeAgreement list with expiry badges
//   6. Compute            — full REGULATORY_PRODUCT_RESULT form + structured card
//
// Design rules:
//   • non-marketplace — never ranks, scores, or recommends counterparties
//   • never crashes on missing/malformed API data — every JSON field is
//     defensively parsed via `safeParse`, every list is `Array.isArray`-guarded
//   • palette: gold / emerald / amber / red / slate (NO indigo or blue)
//   • tables wrap in `overflow-x-auto max-h-96 overflow-y-auto scroll-gold`
//   • verdict icons: CheckCircle2 (green), AlertTriangle (amber), XCircle (red)

import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDate } from "@/lib/sgtx/format";
import {
  Loader2,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Calculator,
  Boxes,
  Gavel,
  FileText,
  Ship,
  Scale,
  Globe2,
  Info,
} from "lucide-react";

// ============ Shared helpers ============

/** Defensive JSON.parse — accepts already-parsed objects, returns `fallback` on any error. */
function safeParse<T>(raw: unknown, fallback: T): T {
  if (raw == null) return fallback;
  if (typeof raw === "object") return raw as T;
  if (typeof raw !== "string") return fallback;
  const s = raw.trim();
  if (s.length === 0) return fallback;
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/** Coerce anything into a string array. */
function asStringArray(raw: unknown): string[] {
  const parsed = safeParse<unknown>(raw, null);
  if (Array.isArray(parsed)) {
    return parsed
      .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
      .filter((s) => s.length > 0);
  }
  if (typeof raw === "string" && raw.length > 0) return [raw];
  return [];
}

/** Defensive fetch + JSON parse — always resolves (never throws). */
async function jfetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try {
      const j = await r.json();
      msg = (j && (j.error || j.message)) || msg;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return (await r.json()) as T;
}

/** Format a 0..1 confidence as a percentage string. */
function fmtConfidence(c: unknown): string {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Format a USD amount — defensive against missing / non-numeric values. */
function fmtUsd(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Format a rate (0.05 → "5.0%"). */
function fmtRate(v: unknown): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(2)}%`;
}

/** Severity badge colour for restriction / status badges. */
const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
  BLOCK: { color: "#f87171", label: "BLOCK" },
  WARN: { color: "#fbbf24", label: "WARN" },
  INFO: { color: "#94a3b8", label: "INFO" },
};

/** Verdict colour triplet (badge text colour + bg tint). */
function verdictStyle(v: string): { color: string; bg: string } {
  const u = String(v || "").toUpperCase();
  if (u === "ALLOW") return { color: "#10b981", bg: "#10b9811a" };
  if (u === "DENY") return { color: "#f87171", bg: "#f871711a" };
  return { color: "#fbbf24", bg: "#fbbf241a" };
}

/** Small pill badge with arbitrary colour. */
function Pill({
  color,
  children,
}: {
  color: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold whitespace-nowrap"
      style={{ color, background: `${color}1a` }}
    >
      {children}
    </span>
  );
}

/** Loading placeholder used inside tab bodies. */
function TabLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 p-6 text-xs text-muted-foreground justify-center">
      <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
      {label}
    </div>
  );
}

/** Empty-state placeholder. */
function TabEmpty({ label = "No rows." }: { label?: string }) {
  return (
    <div className="p-6 text-xs text-muted-foreground text-center">{label}</div>
  );
}

// ============ Sub-tab navigation ============

type SubTabId =
  | "products"
  | "classification"
  | "tariff"
  | "origin"
  | "agreements"
  | "compute";

const SUB_TABS: Array<{ id: SubTabId; label: string; icon: any }> = [
  { id: "products", label: "Product Profiles", icon: Boxes },
  { id: "classification", label: "Classification Rules", icon: Gavel },
  { id: "tariff", label: "Tariff Rules", icon: Calculator },
  { id: "origin", label: "Origin Rules", icon: Ship },
  { id: "agreements", label: "Trade Agreements", icon: Scale },
  { id: "compute", label: "Compute", icon: ShieldCheck },
];

// ============ Main screen ============

export function RegulatoryEngineScreen() {
  const [subTab, setSubTab] = useState<SubTabId>("products");
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Regulatory Engine"
        subtitle="Phase 2 §7 ADMIN — classification · tariff · origin · trade-agreement registries + unified compute endpoint"
      />

      {/* Sub-tab navigation */}
      <div className="flex gap-1 mb-2 border-b border-border overflow-x-auto scroll-gold">
        {SUB_TABS.map((t) => {
          const Icon = t.icon;
          const active = subTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2 -mb-[1px] ${
                active
                  ? "bg-gold/10 text-gold border-gold"
                  : "text-muted-foreground hover:text-foreground border-transparent hover:bg-muted/30"
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          );
        })}
      </div>

      {subTab === "products" && <ProductsTab />}
      {subTab === "classification" && <ClassificationRulesTab />}
      {subTab === "tariff" && <TariffRulesTab />}
      {subTab === "origin" && <OriginRulesTab />}
      {subTab === "agreements" && <TradeAgreementsTab />}
      {subTab === "compute" && <ComputeTab />}
    </div>
  );
}

// ============ 1. Product Profiles ============

function ProductsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reg-products"],
    queryFn: () => jfetch<{ profiles?: any[] }>("/api/sgtx/regulatory/products"),
  });
  const profiles = Array.isArray(data?.profiles) ? data!.profiles : [];

  // Inline "Compute Full Result" form
  const [productName, setProductName] = useState("");
  const [hs6, setHs6] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState("EG");
  const [originCountry, setOriginCountry] = useState("EU");
  const [customsValueUsd, setCustomsValueUsd] = useState("10000");
  const [claimPreferential, setClaimPreferential] = useState(false);
  const [result, setResult] = useState<any>(null);

  const computeMutation = useMutation({
    mutationFn: (body: any) =>
      jfetch<{ result?: any }>("/api/sgtx/regulatory/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (d) => setResult(d?.result || null),
    onError: (e: any) => setResult({ error: e?.message || "compute failed" }),
  });

  const runCompute = () => {
    const value = Number(customsValueUsd);
    if (!jurisdictionCode || !originCountry || !Number.isFinite(value)) return;
    computeMutation.mutate({
      productName: productName || undefined,
      hs6: hs6 || undefined,
      jurisdictionCode,
      originCountry,
      customsValueUsd: value,
      claimPreferential,
    });
  };

  return (
    <div className="space-y-4">
      {/* Compute Full Result form */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">Compute Full Result</h3>
          <span className="text-[0.6rem] text-muted-foreground">
            POST /api/sgtx/regulatory/compute
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <Label className="text-xs">Product Name</Label>
            <Input
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              placeholder="e.g. Fresh oranges"
              className="text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">HS6</Label>
            <Input
              value={hs6}
              onChange={(e) => setHs6(e.target.value)}
              placeholder="070310"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Jurisdiction Code</Label>
            <Input
              value={jurisdictionCode}
              onChange={(e) => setJurisdictionCode(e.target.value.toUpperCase())}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Origin Country</Label>
            <Input
              value={originCountry}
              onChange={(e) => setOriginCountry(e.target.value.toUpperCase())}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Customs Value (USD)</Label>
            <Input
              type="number"
              value={customsValueUsd}
              onChange={(e) => setCustomsValueUsd(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={claimPreferential}
                onCheckedChange={(v) => setClaimPreferential(v === true)}
              />
              <span>Claim preferential</span>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={runCompute}
            disabled={computeMutation.isPending}
            className="bg-gold-gradient text-sovereign"
          >
            {computeMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            )}
            Generate Regulatory Result
          </Button>
        </div>

        {/* Compact result preview */}
        {result && <CompactResult result={result} />}
      </Card>

      {/* Profiles table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {profiles.length} product profile{profiles.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            ProductRegulatoryProfile
          </span>
        </div>
        {isLoading ? (
          <TabLoading />
        ) : error ? (
          <TabEmpty label={`Load failed: ${(error as Error).message}`} />
        ) : profiles.length === 0 ? (
          <TabEmpty label="No product profiles yet." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Product</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Brand</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Confidence</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map((p: any) => (
                  <tr
                    key={p?.id || `${p?.hs6}-${p?.productName}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-medium">
                      {p?.productName || "—"}
                      {p?.productDescription && (
                        <span className="block text-[0.6rem] text-muted-foreground line-clamp-1">
                          {p.productDescription}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">{p?.hs6 || "—"}</td>
                    <td className="px-3 py-3 text-xs">
                      {p?.brand || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={p?.status} />
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {fmtConfidence(p?.confidenceScore)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

/** Compact verdict + headline metrics card — used by the Products tab inline compute. */
function CompactResult({ result }: { result: any }) {
  if (!result || result.error) {
    return (
      <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-500">
        <AlertTriangle className="w-3.5 h-3.5 inline mr-1.5" />
        {result?.error || "compute failed"}
      </div>
    );
  }
  const v = verdictStyle(result.verdict);
  const VerdictIcon =
    result.verdict === "ALLOW"
      ? CheckCircle2
      : result.verdict === "DENY"
        ? XCircle
        : AlertTriangle;
  const tariff = result.tariff || {};
  const restrictions: any[] = Array.isArray(result.restrictions)
    ? result.restrictions
    : [];

  return (
    <div className="mt-4 p-4 rounded-lg border border-border bg-muted/20">
      <div className="flex items-center gap-3 mb-3">
        <VerdictIcon className="w-5 h-5" style={{ color: v.color }} />
        <div className="flex-1">
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
            Verdict
          </p>
          <p className="text-sm font-bold" style={{ color: v.color }}>
            {result.verdict || "CONDITIONAL"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
            Overall confidence
          </p>
          <p className="text-sm font-bold">{fmtConfidence(result.overallConfidence)}</p>
        </div>
        <Pill color={v.color}>{result.verdict || "—"}</Pill>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <Metric label="Total Duty" value={fmtUsd(tariff.totalDutyUsd)} />
        <Metric label="Applied Rate" value={fmtRate(tariff.appliedRate)} />
        <Metric label="MFN Rate" value={fmtRate(tariff.mfnRate)} />
        <Metric
          label="Restrictions"
          value={`${restrictions.length} item${restrictions.length === 1 ? "" : "s"}`}
        />
      </div>
      {result.humanReviewRequired && (
        <div className="mt-3 text-[0.65rem] flex items-center gap-1 text-amber-600">
          <AlertTriangle className="w-3 h-3" /> Human review required
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p className="text-sm font-semibold">{value}</p>
    </div>
  );
}

/** Status pill for IN_FORCE / SUPERSEDED / DRAFT etc. */
function StatusPill({ status }: { status?: string | null }) {
  const s = String(status || "").toUpperCase();
  let color = "#94a3b8";
  if (s === "IN_FORCE" || s === "ACTIVE") color = "#10b981";
  else if (s === "SUPERSEDED" || s === "REPEALED" || s === "TERMINATED" || s === "EXPIRED" || s === "ARCHIVED" || s === "QUARANTINED")
    color = "#f87171";
  else if (s === "DRAFT" || s === "PROPOSED" || s === "PROVISIONAL") color = "#fbbf24";
  return <Pill color={color}>{status || "—"}</Pill>;
}

// ============ 2. Classification Rules ============

const CLASSIFICATION_TYPES = [
  "HS6",
  "HS_NATIONAL",
  "STATISTICAL",
  "EXPORT",
  "DUAL_USE",
  "STRATEGIC",
];

function ClassificationRulesTab() {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const { data, isLoading, error } = useQuery({
    queryKey: ["reg-classification-rules", typeFilter],
    queryFn: () => {
      const qs =
        typeFilter !== "ALL" ? `?type=${encodeURIComponent(typeFilter)}` : "";
      return jfetch<{ rules?: any[] }>(
        `/api/sgtx/regulatory/classification/rules${qs}`,
      );
    },
  });
  const rules = Array.isArray(data?.rules) ? data!.rules : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs">Filter by type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[200px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {CLASSIFICATION_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[0.6rem] text-muted-foreground ml-auto">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TabLoading />
        ) : error ? (
          <TabEmpty label={`Load failed: ${(error as Error).message}`} />
        ) : rules.length === 0 ? (
          <TabEmpty label="No classification rules match." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS Code</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">
                    Jurisdiction
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Legal Status</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">
                    Source
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Confidence ≥</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any) => (
                  <tr
                    key={r?.id || `${r?.classificationType}-${r?.hsCode}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Pill color="#ca8a04">{r?.classificationType || "—"}</Pill>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">{r?.hsCode || "—"}</td>
                    <td className="px-3 py-3 text-xs hidden md:table-cell">
                      {r?.jurisdictionId ? (
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {r.jurisdictionId.slice(0, 12)}
                          {r.jurisdictionId.length > 12 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">global</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r?.legalStatus} />
                    </td>
                    <td className="px-3 py-3 text-xs hidden sm:table-cell">
                      {r?.sourceId ? (
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {r.sourceId.slice(0, 12)}
                          {r.sourceId.length > 12 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {typeof r?.confidenceThreshold === "number"
                        ? fmtConfidence(r.confidenceThreshold)
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ 3. Tariff Rules ============

const TARIFF_TYPES = [
  "MFN",
  "PREFERENTIAL",
  "QUOTA",
  "ANTI_DUMPING",
  "COUNTERVAILING",
  "SAFEGUARDS",
  "AGRICULTURAL_LEVY",
  "EXCISE",
  "ENVIRONMENTAL_FEE",
  "IMPORT_SURCHARGE",
  "OTHER_GOVT_CHARGE",
];

function TariffRulesTab() {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const { data, isLoading, error } = useQuery({
    queryKey: ["reg-tariff-rules", typeFilter],
    queryFn: () => {
      const qs =
        typeFilter !== "ALL"
          ? `?tariffType=${encodeURIComponent(typeFilter)}`
          : "";
      return jfetch<{ rules?: any[] }>(`/api/sgtx/regulatory/tariff/rules${qs}`);
    },
  });
  const rules = Array.isArray(data?.rules) ? data!.rules : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs">Filter by tariff type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[220px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {TARIFF_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[0.6rem] text-muted-foreground ml-auto">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TabLoading />
        ) : error ? (
          <TabEmpty label={`Load failed: ${(error as Error).message}`} />
        ) : rules.length === 0 ? (
          <TabEmpty label="No tariff rules match." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">
                    Jurisdiction
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Origin</th>
                  <th className="text-left font-medium px-3 py-2.5">Rate (AV)</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">
                    Rate Type
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Legal Status</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">
                    Effective
                  </th>
                  <th className="text-left font-medium px-3 py-2.5 hidden xl:table-cell">
                    Quota
                  </th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any) => {
                  const hasQuota =
                    (typeof r?.quotaVolume === "number" &&
                      r.quotaVolume > 0) ||
                    (typeof r?.quotaUsed === "number" && r.quotaUsed > 0);
                  const quotaPct =
                    typeof r?.quotaVolume === "number" &&
                    r.quotaVolume > 0 &&
                    typeof r?.quotaUsed === "number"
                      ? Math.min(100, (r.quotaUsed / r.quotaVolume) * 100)
                      : null;
                  return (
                    <tr
                      key={r?.id || `${r?.tariffType}-${r?.hs6}`}
                      className="border-b border-border/40 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Pill color="#ca8a04">{r?.tariffType || "—"}</Pill>
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">{r?.hs6 || "—"}</td>
                      <td className="px-3 py-3 text-xs hidden lg:table-cell">
                        {r?.jurisdictionId ? (
                          <span className="font-mono text-[0.7rem] text-muted-foreground">
                            {r.jurisdictionId.slice(0, 10)}
                            {r.jurisdictionId.length > 10 ? "…" : ""}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">
                        {r?.originCountry || <span className="text-muted-foreground">ANY</span>}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">
                        {typeof r?.rateAdValorem === "number"
                          ? `${r.rateAdValorem.toFixed(3)}%`
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs hidden sm:table-cell">
                        {r?.rateType || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <StatusPill status={r?.legalStatus} />
                      </td>
                      <td className="px-3 py-3 text-xs hidden md:table-cell">
                        {fmtDate(r?.effectiveFrom)}
                      </td>
                      <td className="px-3 py-3 text-xs hidden xl:table-cell">
                        {hasQuota ? (
                          <div className="flex flex-col gap-1">
                            <span className="font-mono text-[0.65rem]">
                              {r.quotaUsed || 0}/{r.quotaVolume || 0}
                              {r?.quotaUnit ? ` ${r.quotaUnit}` : ""}
                            </span>
                            {quotaPct !== null && (
                              <div className="w-20 h-1.5 rounded-full bg-muted overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{
                                    width: `${quotaPct}%`,
                                    background:
                                      quotaPct > 90 ? "#f87171" : "#fbbf24",
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ 4. Origin Rules ============

const ORIGIN_RULE_TYPES = [
  "NON_PREFERENTIAL",
  "PREFERENTIAL",
  "WHOLLY_OBTAINED",
  "SUBSTANTIAL_TRANSFORMATION",
  "TARIFF_SHIFT",
  "REGIONAL_VALUE_CONTENT",
  "PROCESSING",
  "CUMULATION",
  "DIRECT_SHIPMENT",
  "ORIGIN_DECLARATION",
  "CERTIFICATE_OF_ORIGIN",
  "APPROVED_EXPORTER",
];

function OriginRulesTab() {
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const { data, isLoading, error } = useQuery({
    queryKey: ["reg-origin-rules", typeFilter],
    queryFn: () => {
      const qs =
        typeFilter !== "ALL"
          ? `?ruleType=${encodeURIComponent(typeFilter)}`
          : "";
      return jfetch<{ rules?: any[] }>(`/api/sgtx/regulatory/origin/rules${qs}`);
    },
  });
  const rules = Array.isArray(data?.rules) ? data!.rules : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs">Filter by rule type</Label>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[240px] h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">All types</SelectItem>
              {ORIGIN_RULE_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-[0.6rem] text-muted-foreground ml-auto">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </span>
        </div>
      </Card>

      <Card className="overflow-hidden">
        {isLoading ? (
          <TabLoading />
        ) : error ? (
          <TabEmpty label={`Load failed: ${(error as Error).message}`} />
        ) : rules.length === 0 ? (
          <TabEmpty label="No origin rules match." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Rule Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden lg:table-cell">
                    Jurisdiction
                  </th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">
                    Agreement
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">RVC Threshold</th>
                  <th className="text-left font-medium px-3 py-2.5">Legal Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any) => (
                  <tr
                    key={r?.id || `${r?.ruleType}-${r?.hs6}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Pill color="#ca8a04">{r?.ruleType || "—"}</Pill>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {r?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs hidden lg:table-cell">
                      {r?.jurisdictionId ? (
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {r.jurisdictionId.slice(0, 10)}
                          {r.jurisdictionId.length > 10 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs hidden md:table-cell">
                      {r?.agreementId ? (
                        <span className="font-mono text-[0.7rem] text-muted-foreground">
                          {r.agreementId.slice(0, 10)}
                          {r.agreementId.length > 10 ? "…" : ""}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {typeof r?.rvcThreshold === "number"
                        ? `${r.rvcThreshold}%`
                        : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill status={r?.legalStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ 5. Trade Agreements ============

function TradeAgreementsTab() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["reg-agreements"],
    queryFn: () => jfetch<{ agreements?: any[] }>("/api/sgtx/regulatory/agreements"),
  });
  const agreements = Array.isArray(data?.agreements) ? data!.agreements : [];

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {agreements.length} trade agreement{agreements.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">TradeAgreement</span>
        </div>
        {isLoading ? (
          <TabLoading />
        ) : error ? (
          <TabEmpty label={`Load failed: ${(error as Error).message}`} />
        ) : agreements.length === 0 ? (
          <TabEmpty label="No trade agreements on file." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Name</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden md:table-cell">
                    Parties
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Effective</th>
                  <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">
                    Expiry
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {agreements.map((a: any) => {
                  const parties = asStringArray(a?.parties);
                  const expiry = a?.expiryDate ? new Date(a.expiryDate) : null;
                  const expired =
                    (expiry && expiry.getTime() < Date.now()) ||
                    String(a?.legalStatus || "").toUpperCase() !== "IN_FORCE";
                  return (
                    <tr
                      key={a?.id || a?.name}
                      className="border-b border-border/40 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3">
                        <Pill color="#ca8a04">{a?.agreementType || "—"}</Pill>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        <div className="font-medium">{a?.name || "—"}</div>
                        {a?.shortName && (
                          <div className="text-[0.65rem] text-muted-foreground font-mono">
                            {a.shortName}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs hidden md:table-cell">
                        <div className="flex flex-wrap gap-1">
                          {parties.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            parties.slice(0, 6).map((p, i) => (
                              <span
                                key={`${p}-${i}`}
                                className="px-1.5 py-0.5 rounded text-[0.6rem] font-mono bg-muted/40"
                              >
                                {p}
                              </span>
                            ))
                          )}
                          {parties.length > 6 && (
                            <span className="text-[0.6rem] text-muted-foreground">
                              +{parties.length - 6}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-3 text-xs">{fmtDate(a?.effectiveDate)}</td>
                      <td className="px-3 py-3 text-xs hidden sm:table-cell">
                        {fmtDate(a?.expiryDate)}
                      </td>
                      <td className="px-3 py-3">
                        {expired ? (
                          <Pill color="#f87171">EXPIRED</Pill>
                        ) : (
                          <StatusPill status={a?.legalStatus} />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ 6. Compute (main interactive tab) ============

function ComputeTab() {
  // Form state
  const [productName, setProductName] = useState("");
  const [hs6, setHs6] = useState("");
  const [composition, setComposition] = useState("");
  const [material, setMaterial] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState("EG");
  const [originCountry, setOriginCountry] = useState("EU");
  const [customsValueUsd, setCustomsValueUsd] = useState("10000");
  const [quantity, setQuantity] = useState("");
  const [netWeightKg, setNetWeightKg] = useState("");
  const [claimPreferential, setClaimPreferential] = useState(false);
  const [agreementId, setAgreementId] = useState<string>("NONE");
  const [effectiveDate, setEffectiveDate] = useState("");
  const [result, setResult] = useState<any>(null);

  // Agreements list — used to populate the agreementId Select
  const { data: agreementsData } = useQuery({
    queryKey: ["reg-agreements"],
    queryFn: () => jfetch<{ agreements?: any[] }>("/api/sgtx/regulatory/agreements"),
  });
  const agreements = Array.isArray(agreementsData?.agreements)
    ? agreementsData!.agreements
    : [];

  const computeMutation = useMutation({
    mutationFn: (body: any) =>
      jfetch<{ result?: any }>("/api/sgtx/regulatory/compute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (d) => setResult(d?.result || null),
    onError: (e: any) => setResult({ error: e?.message || "compute failed" }),
  });

  const runCompute = () => {
    const value = Number(customsValueUsd);
    if (!jurisdictionCode || !originCountry || !Number.isFinite(value)) return;
    const body: any = {
      jurisdictionCode,
      originCountry,
      customsValueUsd: value,
    };
    if (productName) body.productName = productName;
    if (hs6) body.hs6 = hs6;
    if (composition) body.composition = composition;
    if (material) body.material = material;
    if (quantity) {
      const q = Number(quantity);
      if (Number.isFinite(q)) body.quantity = q;
    }
    if (netWeightKg) {
      const w = Number(netWeightKg);
      if (Number.isFinite(w)) body.netWeightKg = w;
    }
    if (claimPreferential) body.claimPreferential = true;
    if (agreementId !== "NONE") body.agreementId = agreementId;
    if (effectiveDate) body.effectiveDate = effectiveDate;
    computeMutation.mutate(body);
  };

  return (
    <div className="space-y-4">
      {/* Compute form */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Calculator className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">Generate Regulatory Result</h3>
          <span className="text-[0.6rem] text-muted-foreground">
            POST /api/sgtx/regulatory/compute
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <Field label="Product Name">
            <Input value={productName} onChange={(e) => setProductName(e.target.value)} placeholder="Fresh oranges" className="text-xs" />
          </Field>
          <Field label="HS6">
            <Input value={hs6} onChange={(e) => setHs6(e.target.value)} placeholder="070310" className="font-mono text-xs" />
          </Field>
          <Field label="Composition">
            <Input value={composition} onChange={(e) => setComposition(e.target.value)} placeholder="citrus, fresh" className="text-xs" />
          </Field>
          <Field label="Material">
            <Input value={material} onChange={(e) => setMaterial(e.target.value)} placeholder="organic" className="text-xs" />
          </Field>
          <Field label="Jurisdiction Code" required>
            <Input value={jurisdictionCode} onChange={(e) => setJurisdictionCode(e.target.value.toUpperCase())} className="font-mono text-xs" />
          </Field>
          <Field label="Origin Country" required>
            <Input value={originCountry} onChange={(e) => setOriginCountry(e.target.value.toUpperCase())} className="font-mono text-xs" />
          </Field>
          <Field label="Customs Value (USD)" required>
            <Input type="number" value={customsValueUsd} onChange={(e) => setCustomsValueUsd(e.target.value)} className="font-mono text-xs" />
          </Field>
          <Field label="Quantity">
            <Input type="number" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="optional" className="font-mono text-xs" />
          </Field>
          <Field label="Net Weight (kg)">
            <Input type="number" value={netWeightKg} onChange={(e) => setNetWeightKg(e.target.value)} placeholder="optional" className="font-mono text-xs" />
          </Field>
          <Field label="Agreement">
            <Select value={agreementId} onValueChange={setAgreementId}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">— auto-resolve —</SelectItem>
                {agreements.map((a: any) => (
                  <SelectItem key={a?.id || a?.name} value={a?.id || ""}>
                    {a?.shortName || a?.name || a?.id}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Effective Date">
            <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} className="text-xs" />
          </Field>
          <div className="flex items-end">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <Checkbox
                checked={claimPreferential}
                onCheckedChange={(v) => setClaimPreferential(v === true)}
              />
              <span>Claim preferential</span>
            </label>
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={runCompute}
            disabled={computeMutation.isPending}
            className="bg-gold-gradient text-sovereign"
          >
            {computeMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
            )}
            Generate Regulatory Result
          </Button>
        </div>
      </Card>

      {/* Result */}
      {computeMutation.isPending && !result && <TabLoading label="Computing regulatory result…" />}
      {result && <FullResult result={result} />}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label className="text-xs">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

// ============ Full REGULATORY_PRODUCT_RESULT card ============

function FullResult({ result }: { result: any }) {
  if (!result || result.error) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertTriangle className="w-4 h-4" />
          {result?.error || "compute failed"}
        </div>
      </Card>
    );
  }

  const v = verdictStyle(result.verdict);
  const VerdictIcon =
    result.verdict === "ALLOW"
      ? CheckCircle2
      : result.verdict === "DENY"
        ? XCircle
        : AlertTriangle;

  const classification = result.classification || {};
  const tariff = result.tariff || {};
  const origin = result.origin || {};
  const pref = result.preferentialEligibility || {};
  const documents: any[] = Array.isArray(result.documents) ? result.documents : [];
  const licenses: any[] = Array.isArray(result.licenses) ? result.licenses : [];
  const permits: any[] = Array.isArray(result.permits) ? result.permits : [];
  const certificates: any[] = Array.isArray(result.certificates)
    ? result.certificates
    : [];
  const restrictions: any[] = Array.isArray(result.restrictions)
    ? result.restrictions
    : [];
  const tariffLines: any[] = Array.isArray(tariff.lines) ? tariff.lines : [];

  return (
    <div className="space-y-4">
      {/* Verdict header */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: v.bg }}
          >
            <VerdictIcon className="w-5 h-5" style={{ color: v.color }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
              Verdict
            </p>
            <p className="text-lg font-bold" style={{ color: v.color }}>
              {result.verdict || "CONDITIONAL"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
              Overall confidence
            </p>
            <p className="text-sm font-bold">{fmtConfidence(result.overallConfidence)}</p>
          </div>
          {result.humanReviewRequired && (
            <Pill color="#fbbf24">
              <AlertTriangle className="w-2.5 h-2.5 inline mr-1" />
              Human review
            </Pill>
          )}
          {result.ustn && (
            <div className="text-right">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                USTN
              </p>
              <p className="font-mono text-[0.65rem]">{result.ustn}</p>
            </div>
          )}
          {result.generatedAt && (
            <div className="text-right">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                Generated
              </p>
              <p className="text-[0.65rem]">{fmtDate(result.generatedAt)}</p>
            </div>
          )}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Classification section */}
        <ResultSection title="Classification" icon={Gavel} accent="#ca8a04">
          {classification.error ? (
            <ErrorLine msg={classification.error} />
          ) : (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <KV label="HS6" value={classification.hs6} mono />
              <KV
                label="National Code"
                value={classification.nationalCode}
                mono
              />
              <KV
                label="Dual Use"
                value={
                  classification.dualUse
                    ? `${classification.dualUse.controlList || "?"}/${classification.dualUse.entry || "?"}`
                    : "—"
                }
              />
              <KV
                label="Strategic"
                value={
                  classification.strategic
                    ? `${classification.strategic.controlRegime || "?"}`
                    : "—"
                }
              />
              <KV
                label="Confidence"
                value={fmtConfidence(classification.confidence)}
              />
              <KV
                label="Human Review"
                value={classification.humanReviewRequired ? "Yes" : "No"}
              />
            </div>
          )}
        </ResultSection>

        {/* Tariff section */}
        <ResultSection title="Tariff" icon={Calculator} accent="#ca8a04">
          {tariff.error ? (
            <ErrorLine msg={tariff.error} />
          ) : tariffLines.length === 0 ? (
            <p className="text-xs text-muted-foreground">No tariff lines.</p>
          ) : (
            <div className="space-y-2">
              <div className="overflow-x-auto max-h-48 overflow-y-auto scroll-gold">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card">
                    <tr className="text-[0.6rem] text-muted-foreground uppercase tracking-wider border-b border-border">
                      <th className="text-left font-medium px-2 py-1.5">Type</th>
                      <th className="text-left font-medium px-2 py-1.5">Rate</th>
                      <th className="text-left font-medium px-2 py-1.5">Amount</th>
                      <th className="text-left font-medium px-2 py-1.5 hidden sm:table-cell">
                        Source
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tariffLines.map((l: any, i: number) => (
                      <tr
                        key={`${l?.tariffType}-${i}`}
                        className="border-b border-border/30"
                      >
                        <td className="px-2 py-1.5 font-mono text-[0.65rem]">
                          {l?.tariffType || "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[0.65rem]">
                          {typeof l?.rate === "number"
                            ? `${(l.rate * 100).toFixed(2)}%`
                            : String(l?.rate ?? "—")}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[0.65rem]">
                          {fmtUsd(l?.amount)}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[0.65rem] text-muted-foreground hidden sm:table-cell">
                          {l?.sourceId
                            ? `${l.sourceId.slice(0, 10)}${l.sourceId.length > 10 ? "…" : ""}`
                            : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs pt-1">
                <KV label="Total Duty" value={fmtUsd(tariff.totalDutyUsd)} bold />
                <KV label="Applied Rate" value={fmtRate(tariff.appliedRate)} />
                <KV label="MFN Rate" value={fmtRate(tariff.mfnRate)} />
              </div>
            </div>
          )}
        </ResultSection>

        {/* Origin section */}
        <ResultSection title="Origin" icon={Ship} accent="#ca8a04">
          {origin.error ? (
            <ErrorLine msg={origin.error} />
          ) : (
            <div className="space-y-2 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <KV
                  label="Non-Pref Basis"
                  value={origin?.nonPreferential?.basis || "—"}
                />
                <KV
                  label="Origin Country"
                  value={origin?.nonPreferential?.originCountry || "—"}
                  mono
                />
                <KV
                  label="Qualifying"
                  value={origin?.nonPreferential?.qualifying ? "Yes" : "No"}
                />
                <KV label="Confidence" value={fmtConfidence(origin.confidence)} />
              </div>
              {origin.preferential && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1">
                    Preferential
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <KV
                      label="Rule Applied"
                      value={origin.preferential.ruleApplied || "—"}
                    />
                    <KV
                      label="RVC Actual"
                      value={
                        typeof origin.preferential.rvcActual === "number"
                          ? `${origin.preferential.rvcActual.toFixed(1)}%`
                          : "—"
                      }
                    />
                    <KV
                      label="RVC Threshold"
                      value={
                        typeof origin.preferential.rvcThreshold === "number"
                          ? `${origin.preferential.rvcThreshold.toFixed(1)}%`
                          : "—"
                      }
                    />
                    <KV
                      label="Qualifying"
                      value={origin.preferential.qualifying ? "Yes" : "No"}
                    />
                  </div>
                  {origin.preferential.reason && (
                    <p className="mt-2 text-[0.65rem] text-muted-foreground">
                      <Info className="w-2.5 h-2.5 inline mr-1" />
                      {origin.preferential.reason}
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </ResultSection>

        {/* Preferential eligibility section */}
        <ResultSection title="Preferential Eligibility" icon={Scale} accent="#ca8a04">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <KV label="Claimed" value={pref.claimed ? "Yes" : "No"} />
            <KV label="Eligible" value={pref.eligible ? "Yes" : "No"} />
            <KV label="Preferential Rate" value={fmtRate(pref.preferentialRate)} mono />
            <KV label="MFN Rate" value={fmtRate(pref.mfnRate)} mono />
            <KV label="Savings" value={fmtUsd(pref.savings)} bold />
            <KV label="Agreement" value={pref.agreementId || "—"} mono />
          </div>
          {pref.reason && (
            <p className="mt-2 text-[0.65rem] text-muted-foreground">
              <Info className="w-2.5 h-2.5 inline mr-1" />
              {pref.reason}
            </p>
          )}
        </ResultSection>
      </div>

      {/* Restrictions */}
      <ResultSection
        title={`Restrictions (${restrictions.length})`}
        icon={AlertTriangle}
        accent="#f87171"
      >
        {restrictions.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            <CheckCircle2 className="w-3 h-3 inline mr-1 text-emerald-500" />
            No restrictions flagged.
          </p>
        ) : (
          <div className="space-y-1.5">
            {restrictions.map((r: any, i: number) => {
              const sev =
                SEVERITY_STYLE[String(r?.severity || "INFO").toUpperCase()] ||
                SEVERITY_STYLE.INFO;
              return (
                <div
                  key={`${r?.type}-${i}`}
                  className="flex items-start gap-2 p-2 rounded-lg bg-muted/20"
                >
                  <Pill color={sev.color}>{sev.label}</Pill>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{r?.type || "—"}</p>
                    {r?.description && (
                      <p className="text-[0.7rem] text-muted-foreground">
                        {r.description}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ResultSection>

      {/* Documents / licenses / permits / certificates — four-up grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ResultSection title={`Documents (${documents.length})`} icon={FileText} accent="#ca8a04">
          {documents.length === 0 ? (
            <p className="text-xs text-muted-foreground">No documents required.</p>
          ) : (
            <div className="space-y-1">
              {documents.map((d: any, i: number) => (
                <div
                  key={`${d?.type}-${i}`}
                  className="flex items-center gap-2 text-xs p-1.5 rounded bg-muted/20"
                >
                  <span className="font-mono text-[0.65rem] flex-1">{d?.type || "—"}</span>
                  {d?.mandatory && <Pill color="#fbbf24">MANDATORY</Pill>}
                </div>
              ))}
            </div>
          )}
        </ResultSection>

        <ResultSection title={`Licenses (${licenses.length})`} icon={Gavel} accent="#ca8a04">
          {licenses.length === 0 ? (
            <p className="text-xs text-muted-foreground">No licenses required.</p>
          ) : (
            <div className="space-y-1">
              {licenses.map((l: any, i: number) => (
                <div
                  key={`${l?.type}-${i}`}
                  className="text-xs p-1.5 rounded bg-muted/20"
                >
                  <p className="font-mono text-[0.65rem]">{l?.type || "—"}</p>
                  {l?.description && (
                    <p className="text-[0.65rem] text-muted-foreground">
                      {l.description}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ResultSection>

        <ResultSection title={`Permits (${permits.length})`} icon={ShieldCheck} accent="#ca8a04">
          {permits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No permits required.</p>
          ) : (
            <div className="space-y-1">
              {permits.map((p: any, i: number) => (
                <div
                  key={`${p?.type}-${i}`}
                  className="text-xs p-1.5 rounded bg-muted/20"
                >
                  <p className="font-mono text-[0.65rem]">{p?.type || "—"}</p>
                  {p?.issuingAuthority && (
                    <p className="text-[0.65rem] text-muted-foreground">
                      Issued by: {p.issuingAuthority}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ResultSection>

        <ResultSection title={`Certificates (${certificates.length})`} icon={Globe2} accent="#ca8a04">
          {certificates.length === 0 ? (
            <p className="text-xs text-muted-foreground">No certificates required.</p>
          ) : (
            <div className="space-y-1">
              {certificates.map((c: any, i: number) => (
                <div
                  key={`${c?.type}-${i}`}
                  className="text-xs p-1.5 rounded bg-muted/20"
                >
                  <p className="font-mono text-[0.65rem]">{c?.type || "—"}</p>
                  {c?.certificationBody && (
                    <p className="text-[0.65rem] text-muted-foreground">
                      Body: {c.certificationBody}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </ResultSection>
      </div>
    </div>
  );
}

/** A labelled section card used by FullResult. */
function ResultSection({
  title,
  icon: Icon,
  accent,
  children,
}: {
  title: string;
  icon: any;
  accent: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-3">
        <span
          className="w-7 h-7 rounded-md flex items-center justify-center"
          style={{ background: `${accent}1a` }}
        >
          <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
        </span>
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </Card>
  );
}

function KV({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: unknown;
  mono?: boolean;
  bold?: boolean;
}) {
  const display =
    value == null || value === ""
      ? "—"
      : typeof value === "boolean"
        ? value
          ? "Yes"
          : "No"
        : String(value);
  return (
    <div className="min-w-0">
      <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
        {label}
      </p>
      <p
        className={`text-xs ${mono ? "font-mono" : ""} ${bold ? "font-bold" : ""} truncate`}
      >
        {display}
      </p>
    </div>
  );
}

function ErrorLine({ msg }: { msg: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-red-500">
      <AlertTriangle className="w-3 h-3" />
      <span className="font-mono text-[0.65rem]">{msg}</span>
    </div>
  );
}
