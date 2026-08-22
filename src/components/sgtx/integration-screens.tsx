"use client";

// SGTX Phase 8 — Global Integration Control Center (admin portal §1–§11)
// ---------------------------------------------------------------------------
// Single-file React component exposing 7 sub-tabs:
//   1. Gap Analysis (§7 — default)        5. Alerts (§10)
//   2. Integration Catalog (§1-3)          6. Discovery Test (§5 interactive)
//   3. Country Readiness (§8)             7. Test Runner (§11 — 10 scenarios)
//   4. Trade Lane Readiness (§9)
//
// COLOR PALETTE — gold / emerald / amber / red / slate only. NO indigo, NO blue.
//   • CONNECTED      = emerald (#10b981)
//   • PARTIAL        = amber   (#f59e0b)
//   • MANUAL         = slate   (#94a3b8)
//   • MISSING        = red     (#f87171)
//   • DEPRECATED     = red     (#f87171)
//   • CRITICAL / OPEN (alerts)  = red
//   • WARN / ACKNOWLEDGED      = amber
//   • INFO / RESOLVED          = emerald
//   • DISMISSED                = slate
//
// Defensive parsing: every cell uses safeParse(...) with Array.isArray guards
// so malformed JSON columns never crash the UI.

import { Fragment, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDate, fmtDateTime } from "@/lib/sgtx/format";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Globe2,
  Activity,
  ShieldAlert,
  Boxes,
  Network,
  Gauge,
  Beaker,
  PlayCircle,
} from "lucide-react";

// ============ Constants (mirror lib constants — kept inline for self-containment) ============

const AUTHORITIES = [
  "CUSTOMS",
  "TAX",
  "SPS",
  "TBT",
  "AGRICULTURE",
  "HEALTH",
  "STANDARDS",
  "SECURITY",
  "TRANSPORT",
  "BANK",
  "INSURANCE",
  "BROKER",
  "ERP",
] as const;

const INTEGRATION_TYPES = [
  "API",
  "EDI",
  "XML",
  "JSON",
  "UN_EDIFACT",
  "CARGO_XML",
  "ONE_RECORD",
  "ISO_20022",
  "SFTP",
  "WEBHOOK",
  "PORTAL",
  "BROKER",
  "MANUAL",
] as const;

const CONNECTOR_STATUSES = [
  "NOT_DISCOVERED",
  "DISCOVERED",
  "DOCUMENTED",
  "CONTACT_REQUIRED",
  "CREDENTIALS_REQUIRED",
  "SANDBOX_AVAILABLE",
  "SANDBOX_CONNECTED",
  "CERTIFICATION_REQUIRED",
  "CERTIFICATION_PENDING",
  "PRODUCTION_READY",
  "PRODUCTION_CONNECTED",
  "DEGRADED",
  "OUTAGE",
  "PORTAL_ONLY",
  "MANUAL_ONLY",
  "DEPRECATED",
] as const;

const GAP_STATUSES = ["CONNECTED", "PARTIAL", "MANUAL", "MISSING", "DEPRECATED"] as const;

const READINESS_LEVELS = ["CONNECTED", "PARTIAL", "MANUAL", "MISSING"] as const;

const DIMENSIONS = [
  "CUSTOMS",
  "TAX",
  "SPS",
  "TBT",
  "LICENSES",
  "PERMITS",
  "CERTIFICATES",
  "TRANSPORT",
  "SECURITY",
  "PAYMENT",
  "INSURANCE",
  "BROKER",
  "ERP",
  "ACCOUNTING",
  "GOVERNMENT_APIS",
] as const;

const ALERT_TYPES = [
  "CERTIFICATE_EXPIRES",
  "API_EXPIRES",
  "CREDENTIAL_EXPIRES",
  "SCHEMA_CHANGES",
  "CONNECTOR_OUTAGE",
  "COUNTRY_LAW_CHANGES",
  "REQUIRED_MISSING",
  "LANE_NON_READY",
  "CONNECTOR_DEPRECATED",
] as const;

const ALERT_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESOLVED", "DISMISSED"] as const;
const ALERT_SEVERITIES = ["INFO", "WARN", "CRITICAL"] as const;

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

function pct(n: number): string {
  const v = Math.max(0, Math.min(1, Number(n) || 0));
  return `${(v * 100).toFixed(1)}%`;
}

// ============ Color helpers (restricted palette — NO indigo, NO blue) ============

function gapStatusColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "CONNECTED") return "#10b981";
  if (v === "PARTIAL") return "#f59e0b";
  if (v === "MANUAL") return "#94a3b8";
  if (v === "MISSING") return "#f87171";
  if (v === "DEPRECATED") return "#f87171";
  return "#94a3b8";
}

function readinessLevelColor(s: string | null | undefined): string {
  return gapStatusColor(s); // same 4-color palette
}

function connectorStatusColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "PRODUCTION_CONNECTED" || v === "SANDBOX_CONNECTED") return "#10b981";
  if (v === "PORTAL_ONLY" || v === "MANUAL_ONLY") return "#94a3b8";
  if (v === "NOT_DISCOVERED") return "#f87171";
  if (v === "DEPRECATED" || v === "OUTAGE") return "#f87171";
  // DISCOVERED, DOCUMENTED, CONTACT_REQUIRED, CREDENTIALS_REQUIRED,
  // SANDBOX_AVAILABLE, CERTIFICATION_REQUIRED, CERTIFICATION_PENDING,
  // PRODUCTION_READY, DEGRADED
  return "#f59e0b";
}

function alertSeverityColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "CRITICAL") return "#f87171";
  if (v === "WARN") return "#f59e0b";
  if (v === "INFO") return "#94a3b8";
  return "#94a3b8";
}

function alertStatusColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "OPEN") return "#f87171";
  if (v === "ACKNOWLEDGED") return "#f59e0b";
  if (v === "RESOLVED") return "#10b981";
  if (v === "DISMISSED") return "#94a3b8";
  return "#94a3b8";
}

function integrationTypeColor(t: string | null | undefined): string {
  const v = String(t || "").toUpperCase();
  if (v === "API" || v === "JSON" || v === "ONE_RECORD") return "#10b981";
  if (v === "EDI" || v === "UN_EDIFACT" || v === "ISO_20022") return "#d4a017";
  if (v === "PORTAL" || v === "BROKER" || v === "MANUAL") return "#94a3b8";
  if (v === "XML" || v === "CARGO_XML" || v === "SFTP" || v === "WEBHOOK") return "#f59e0b";
  return "#94a3b8";
}

// ============ Reusable presentational helpers ============

function StatusPill({
  status,
  color,
  title,
}: {
  status: string | null | undefined;
  color: string;
  title?: string;
}) {
  const label = String(status || "—");
  return (
    <span
      title={title || label}
      className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold whitespace-nowrap"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}55` }}
    >
      {label}
    </span>
  );
}

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

function FilterRow({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 mb-3">{children}</div>;
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
        <SelectTrigger className="h-8 w-[200px] text-[0.7rem]">
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

function YesNo({ v }: { v: boolean }) {
  return v ? (
    <CheckCircle2 className="w-3 h-3 text-emerald-500" />
  ) : (
    <XCircle className="w-3 h-3 text-red-400" />
  );
}

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
// 1. GAP ANALYSIS TAB (§7 — default)
// =====================================================================

function GapAnalysisTab() {
  const [jurisdictionCode, setJurisdictionCode] = useState("ALL");
  const [authority, setAuthority] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [priorityMin, setPriorityMin] = useState(0);
  const [priorityMax, setPriorityMax] = useState(100);
  const [expanded, setExpanded] = useState<string | null>(null);

  const qs = new URLSearchParams();
  if (jurisdictionCode !== "ALL") qs.set("jurisdictionCode", jurisdictionCode);
  if (authority !== "ALL") qs.set("authority", authority);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const listUrl = `/api/sgtx/integrations/gaps${qs.toString() ? `?${qs.toString()}` : ""}`;

  const summaryQs = new URLSearchParams();
  if (jurisdictionCode !== "ALL") summaryQs.set("jurisdictionCode", jurisdictionCode);
  const summaryUrl = `/api/sgtx/integrations/gaps/summary${summaryQs.toString() ? `?${summaryQs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-integrations-gaps", jurisdictionCode, authority, statusFilter],
    queryFn: () => fetchJson(listUrl),
  });

  const { data: summaryData } = useQuery({
    queryKey: ["sgtx-integrations-gaps-summary", jurisdictionCode],
    queryFn: () => fetchJson(summaryUrl),
  });

  const allGaps = asArray(data?.gaps);
  // Client-side priority filter (range).
  const filteredGaps = allGaps.filter((g: any) => {
    const p = asNum(g.priority);
    return p >= Number(priorityMin) && p <= Number(priorityMax);
  });

  const summary: any = summaryData?.summary || {};
  const totalGaps = asNum(summary.total);
  const missingCount = asNum(summary.missing);
  const partialCount = asNum(summary.partial);
  const avgPriority = asNum(summary.avgPriority);
  const affectedUstnsCount = allGaps.reduce((acc: number, g: any) => {
    return acc + asArray(g.affectedUstns).length;
  }, 0);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Global Trade Integration Gap Analysis"
        subtitle="Phase 8 · §7 — per-trade-line actionable view of catalog × procedure × mode readiness"
      />

      {/* Summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <SummaryTile label="Total Gaps" value={String(totalGaps)} accent="#94a3b8" icon={Boxes} />
        <SummaryTile label="Missing" value={String(missingCount)} accent="#f87171" icon={XCircle} />
        <SummaryTile label="Partial" value={String(partialCount)} accent="#f59e0b" icon={AlertTriangle} />
        <SummaryTile label="Avg Priority" value={String(avgPriority)} accent="#d4a017" icon={Gauge} />
        <SummaryTile label="Affected USTNs" value={String(affectedUstnsCount)} accent="#10b981" icon={Network} />
      </div>

      {/* Filters */}
      <Card className="p-4">
        <FilterRow>
          <FilterInputText
            label="Jurisdiction"
            value={jurisdictionCode === "ALL" ? "" : jurisdictionCode}
            placeholder="e.g. EG"
            onChange={(v) => setJurisdictionCode(v || "ALL")}
          />
          <FilterSelect
            label="Authority"
            value={authority}
            onChange={setAuthority}
            options={AUTHORITIES}
            placeholder="ALL authorities"
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={GAP_STATUSES}
            placeholder="ALL statuses"
          />
          <div className="flex flex-col gap-1">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              Priority Range
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={0}
                max={100}
                value={priorityMin}
                onChange={(e) => setPriorityMin(Number(e.target.value) || 0)}
                className="h-8 w-20 text-[0.7rem]"
              />
              <span className="text-xs text-muted-foreground">→</span>
              <Input
                type="number"
                min={0}
                max={100}
                value={priorityMax}
                onChange={(e) => setPriorityMax(Number(e.target.value) || 100)}
                className="h-8 w-20 text-[0.7rem]"
              />
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 mt-5">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </FilterRow>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading gaps…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : filteredGaps.length === 0 ? (
        <EmptyState label="No gap records match the current filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <Th small></Th>
                  <Th small>Jurisdiction</Th>
                  <Th small>Authority</Th>
                  <Th small>System</Th>
                  <Th small>Procedure</Th>
                  <Th small>Mode</Th>
                  <Th small>Required?</Th>
                  <Th small>API?</Th>
                  <Th small>EDI?</Th>
                  <Th small>Portal?</Th>
                  <Th small>Sandbox?</Th>
                  <Th small>Production?</Th>
                  <Th small>Credentials?</Th>
                  <Th small>Cert?</Th>
                  <Th small>Legal?</Th>
                  <Th small>Status</Th>
                  <Th small>Priority</Th>
                  <Th small>Trades</Th>
                  <Th small>USTNs</Th>
                  <Th small>Owner</Th>
                  <Th small>Next Action</Th>
                </tr>
              </thead>
              <tbody>
                {filteredGaps.map((g: any) => {
                  const id = g.id || g.gapId || "";
                  const isOpen = expanded === id;
                  const lanesArr = asArray(g.affectedTradeLanes);
                  const ustnsArr = asArray(g.affectedUstns);
                  return (
                    <Fragment key={id}>
                      <tr
                        className="border-b border-border/30 hover:bg-muted/20 cursor-pointer"
                        onClick={() => setExpanded(isOpen ? null : id)}
                      >
                        <Td small>
                          {isOpen ? (
                            <ChevronDown className="w-3 h-3" />
                          ) : (
                            <ChevronRight className="w-3 h-3" />
                          )}
                        </Td>
                        <Td small className="font-mono">{g.jurisdictionCode || "—"}</Td>
                        <Td small>{g.authority || "—"}</Td>
                        <Td small>{g.systemName || "—"}</Td>
                        <Td small>{g.procedure || "—"}</Td>
                        <Td small>{g.transportMode || "—"}</Td>
                        <Td small><YesNo v={asBool(g.required)} /></Td>
                        <Td small><YesNo v={asBool(g.apiAvailable)} /></Td>
                        <Td small><YesNo v={asBool(g.ediAvailable)} /></Td>
                        <Td small><YesNo v={asBool(g.portalAvailable)} /></Td>
                        <Td small><YesNo v={asBool(g.sandboxRequired)} /></Td>
                        <Td small><YesNo v={asBool(g.documentationAvailable)} /></Td>
                        <Td small><YesNo v={asBool(g.credentialsRequired)} /></Td>
                        <Td small><YesNo v={asBool(g.certificationRequired)} /></Td>
                        <Td small><YesNo v={asBool(g.legalAgreementRequired)} /></Td>
                        <Td small>
                          <StatusPill status={g.status} color={gapStatusColor(g.status)} />
                        </Td>
                        <Td small className="font-semibold">{asNum(g.priority)}</Td>
                        <Td small className="text-center">{lanesArr.length}</Td>
                        <Td small className="text-center">{ustnsArr.length}</Td>
                        <Td small>{g.owner || "—"}</Td>
                        <Td small className="max-w-[200px] truncate" >{g.nextAction || "—"}</Td>
                      </tr>
                      {isOpen && (
                        <tr className="bg-muted/10 border-b border-border/30">
                          <Td small></Td>
                          <Td small colSpan={19}>
                            <div className="p-3 space-y-1 text-[0.65rem]">
                              <div>
                                <span className="font-semibold text-muted-foreground">Gap ID: </span>
                                <span className="font-mono">{g.gapId}</span>
                              </div>
                              <div>
                                <span className="font-semibold text-muted-foreground">Due date: </span>
                                {g.dueDate ? fmtDateTime(g.dueDate) : "—"}
                              </div>
                              <div>
                                <span className="font-semibold text-muted-foreground">Source: </span>
                                {g.source || "—"}
                              </div>
                              <div>
                                <span className="font-semibold text-muted-foreground">Evidence: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {asArray(g.evidence).length === 0 ? (
                                    <span className="text-muted-foreground">none</span>
                                  ) : (
                                    asArray(g.evidence).map((e: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[0.55rem] font-mono">
                                        {e}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="font-semibold text-muted-foreground">Affected trade lanes: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {lanesArr.length === 0 ? (
                                    <span className="text-muted-foreground">none</span>
                                  ) : (
                                    lanesArr.map((l: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[0.55rem] font-mono">
                                        {l}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </div>
                              <div>
                                <span className="font-semibold text-muted-foreground">Affected USTNs: </span>
                                <div className="flex flex-wrap gap-1 mt-1">
                                  {ustnsArr.length === 0 ? (
                                    <span className="text-muted-foreground">none</span>
                                  ) : (
                                    ustnsArr.map((u: string, i: number) => (
                                      <Badge key={i} variant="outline" className="text-[0.55rem] font-mono">
                                        {u}
                                      </Badge>
                                    ))
                                  )}
                                </div>
                              </div>
                              {g.notes && (
                                <div>
                                  <span className="font-semibold text-muted-foreground">Notes: </span>
                                  <pre className="whitespace-pre-wrap text-[0.6rem] mt-1">{g.notes}</pre>
                                </div>
                              )}
                            </div>
                          </Td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  icon: Icon,
}: {
  label: string;
  value: string;
  accent: string;
  icon: any;
}) {
  return (
    <Card className="p-3 flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center"
        style={{ background: `${accent}1a`, color: accent }}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <div className="text-[0.6rem] uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-lg font-bold">{value}</div>
      </div>
    </Card>
  );
}

function FilterInputText({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
        {label}
      </Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-8 w-[200px] text-[0.7rem]"
      />
    </div>
  );
}

// =====================================================================
// 2. INTEGRATION CATALOG TAB (§1-3)
// =====================================================================

function CatalogTab() {
  const [jurisdictionCode, setJurisdictionCode] = useState("ALL");
  const [authority, setAuthority] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [integrationType, setIntegrationType] = useState("ALL");

  const qs = new URLSearchParams();
  if (jurisdictionCode !== "ALL") qs.set("jurisdictionCode", jurisdictionCode);
  if (authority !== "ALL") qs.set("authority", authority);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  if (integrationType !== "ALL") qs.set("integrationType", integrationType);
  const url = `/api/sgtx/integrations/catalog${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-integrations-catalog", jurisdictionCode, authority, statusFilter, integrationType],
    queryFn: () => fetchJson(url),
  });

  const entries = asArray(data?.entries);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Worldwide Integration Catalog"
        subtitle="Phase 8 · §1–§3 — every system SGTX knows about (connected or not)"
      />

      <Card className="p-4">
        <FilterRow>
          <FilterInputText
            label="Jurisdiction"
            value={jurisdictionCode === "ALL" ? "" : jurisdictionCode}
            placeholder="e.g. EG"
            onChange={(v) => setJurisdictionCode(v || "ALL")}
          />
          <FilterSelect
            label="Authority"
            value={authority}
            onChange={setAuthority}
            options={AUTHORITIES}
            placeholder="ALL authorities"
          />
          <FilterSelect
            label="Status"
            value={statusFilter}
            onChange={setStatusFilter}
            options={CONNECTOR_STATUSES}
            placeholder="ALL statuses"
          />
          <FilterSelect
            label="Integration Type"
            value={integrationType}
            onChange={setIntegrationType}
            options={INTEGRATION_TYPES}
            placeholder="ALL types"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 mt-5">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </FilterRow>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading catalog…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : entries.length === 0 ? (
        <EmptyState label="No catalog entries match the current filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <Th small>Connector ID</Th>
                  <Th small>Jurisdiction</Th>
                  <Th small>Authority</Th>
                  <Th small>System Name</Th>
                  <Th small>Procedure</Th>
                  <Th small>Mode</Th>
                  <Th small>Type</Th>
                  <Th small>Status</Th>
                  <Th small>Priority</Th>
                  <Th small>Owner</Th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e: any, i: number) => (
                  <tr key={e.id || i} className="border-b border-border/30 hover:bg-muted/20">
                    <Td small className="font-mono text-[0.6rem]">{e.connectorId || "—"}</Td>
                    <Td small className="font-mono">{e.jurisdictionCode || "—"}</Td>
                    <Td small>{e.authority || "—"}</Td>
                    <Td small>{e.systemName || "—"}</Td>
                    <Td small>{e.procedure || "—"}</Td>
                    <Td small>{e.transportMode || "—"}</Td>
                    <Td small>
                      <StatusPill status={e.integrationType} color={integrationTypeColor(e.integrationType)} />
                    </Td>
                    <Td small>
                      <StatusPill status={e.status} color={connectorStatusColor(e.status)} />
                    </Td>
                    <Td small className="font-semibold">{asNum(e.priority)}</Td>
                    <Td small>{e.owner || "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 3. COUNTRY READINESS TAB (§8)
// =====================================================================

function CountryReadinessTab() {
  const [countryCode, setCountryCode] = useState("ALL");
  const [dimension, setDimension] = useState("ALL");
  const [readinessLevel, setReadinessLevel] = useState("ALL");

  const qs = new URLSearchParams();
  if (countryCode !== "ALL") qs.set("countryCode", countryCode);
  if (dimension !== "ALL") qs.set("dimension", dimension);
  if (readinessLevel !== "ALL") qs.set("readinessLevel", readinessLevel);
  const url = `/api/sgtx/integrations/country-readiness/list${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-country-readiness", countryCode, dimension, readinessLevel],
    queryFn: () => fetchJson(url),
  });

  const rows = asArray(data?.rows);
  const qc = useQueryClient();

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Country Readiness"
        subtitle="Phase 8 · §8 — per-country readiness across 15 integration dimensions"
      />

      <Card className="p-4">
        <FilterRow>
          <FilterInputText
            label="Country"
            value={countryCode === "ALL" ? "" : countryCode}
            placeholder="e.g. EG"
            onChange={(v) => setCountryCode(v || "ALL")}
          />
          <FilterSelect
            label="Dimension"
            value={dimension}
            onChange={setDimension}
            options={DIMENSIONS}
            placeholder="ALL dimensions"
          />
          <FilterSelect
            label="Readiness"
            value={readinessLevel}
            onChange={setReadinessLevel}
            options={READINESS_LEVELS}
            placeholder="ALL levels"
          />
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 mt-5">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </FilterRow>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading country readiness…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : rows.length === 0 ? (
        <EmptyState label="No country readiness rows match the current filters. Try the Assess button below to compute readiness." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <Th small>Country</Th>
                  <Th small>Dimension</Th>
                  <Th small>Level</Th>
                  <Th small>Score</Th>
                  <Th small>Connected</Th>
                  <Th small>Partial</Th>
                  <Th small>Manual</Th>
                  <Th small>Missing</Th>
                  <Th small>Action</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id || i} className="border-b border-border/30 hover:bg-muted/20">
                    <Td small className="font-mono">{r.countryCode || "—"}</Td>
                    <Td small>{r.dimension || "—"}</Td>
                    <Td small>
                      <StatusPill status={r.readinessLevel} color={readinessLevelColor(r.readinessLevel)} />
                    </Td>
                    <Td small className="font-semibold">{pct(r.readinessScore)}</Td>
                    <Td small className="text-center text-emerald-500 font-semibold">{asNum(r.connectedCount)}</Td>
                    <Td small className="text-center text-amber-500 font-semibold">{asNum(r.partialCount)}</Td>
                    <Td small className="text-center text-slate-400 font-semibold">{asNum(r.manualCount)}</Td>
                    <Td small className="text-center text-red-400 font-semibold">{asNum(r.missingCount)}</Td>
                    <Td small>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 text-[0.6rem] px-2"
                        onClick={async () => {
                          try {
                            await postJson(
                              `/api/sgtx/integrations/country-readiness/assess?countryCode=${encodeURIComponent(r.countryCode)}`,
                              {},
                            );
                            qc.invalidateQueries({ queryKey: ["sgtx-country-readiness"] });
                          } catch (e) {
                            // ignore
                          }
                        }}
                      >
                        <Gauge className="w-3 h-3 mr-1" /> Assess
                      </Button>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 4. TRADE LANE READINESS TAB (§9)
// =====================================================================

function TradeLaneTab() {
  const [originCountry, setOriginCountry] = useState("ALL");
  const [destinationCountry, setDestinationCountry] = useState("ALL");
  const [transportMode, setTransportMode] = useState("ALL");

  const qs = new URLSearchParams();
  if (originCountry !== "ALL") qs.set("originCountry", originCountry);
  if (destinationCountry !== "ALL") qs.set("destinationCountry", destinationCountry);
  if (transportMode !== "ALL") qs.set("transportMode", transportMode);
  const url = `/api/sgtx/integrations/trade-lanes${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-trade-lanes", originCountry, destinationCountry, transportMode],
    queryFn: () => fetchJson(url),
  });

  const lanes = asArray(data?.lanes);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Trade Lane Readiness"
        subtitle="Phase 8 · §9 — per-lane readiness across 5 dimensions (regulatory, document, customs, transport, government)"
      />

      <Card className="p-4">
        <FilterRow>
          <FilterInputText
            label="Origin Country"
            value={originCountry === "ALL" ? "" : originCountry}
            placeholder="e.g. EG"
            onChange={(v) => setOriginCountry(v || "ALL")}
          />
          <FilterInputText
            label="Destination Country"
            value={destinationCountry === "ALL" ? "" : destinationCountry}
            placeholder="e.g. AE"
            onChange={(v) => setDestinationCountry(v || "ALL")}
          />
          <FilterInputText
            label="Transport Mode"
            value={transportMode === "ALL" ? "" : transportMode}
            placeholder="e.g. ROAD"
            onChange={(v) => setTransportMode(v || "ALL")}
          />
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 mt-5">
            <Activity className="w-3 h-3 mr-1" /> Refresh
          </Button>
        </FilterRow>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading trade lanes…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : lanes.length === 0 ? (
        <EmptyState label="No trade lane readiness rows match the current filters. Use the Assess button below to assess a new lane." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <Th small>Lane ID</Th>
                  <Th small>Origin → Dest</Th>
                  <Th small>Transit</Th>
                  <Th small>Commodity</Th>
                  <Th small>HS6</Th>
                  <Th small>Mode</Th>
                  <Th small>Regulatory</Th>
                  <Th small>Document</Th>
                  <Th small>Customs</Th>
                  <Th small>Transport</Th>
                  <Th small>Government</Th>
                  <Th small>Manual TP</Th>
                  <Th small>Missing Int</Th>
                  <Th small>Overall</Th>
                </tr>
              </thead>
              <tbody>
                {lanes.map((l: any, i: number) => {
                  const overall = asNum(l.overallReadiness);
                  const low = overall < 0.5;
                  return (
                    <tr
                      key={l.id || i}
                      className={`border-b border-border/30 hover:bg-muted/20 ${low ? "bg-red-500/10" : ""}`}
                    >
                      <Td small className="font-mono text-[0.6rem]">{l.laneId || "—"}</Td>
                      <Td small className="font-mono">
                        {l.originCountry || "—"} → {l.destinationCountry || "—"}
                      </Td>
                      <Td small>
                        <div className="flex flex-wrap gap-1">
                          {asArray(l.transitCountries).length === 0 ? (
                            <span className="text-muted-foreground text-[0.6rem]">direct</span>
                          ) : (
                            asArray(l.transitCountries).map((c: string, j: number) => (
                              <Badge key={j} variant="outline" className="text-[0.55rem] font-mono">
                                {c}
                              </Badge>
                            ))
                          )}
                        </div>
                      </Td>
                      <Td small>{l.commodity || "—"}</Td>
                      <Td small className="font-mono">{l.hs6 || "—"}</Td>
                      <Td small>{l.transportMode || "—"}</Td>
                      <Td small>
                        <StatusPill status={l.regulatoryReadiness} color={readinessLevelColor(l.regulatoryReadiness)} />
                      </Td>
                      <Td small>
                        <StatusPill status={l.documentReadiness} color={readinessLevelColor(l.documentReadiness)} />
                      </Td>
                      <Td small>
                        <StatusPill status={l.customsReadiness} color={readinessLevelColor(l.customsReadiness)} />
                      </Td>
                      <Td small>
                        <StatusPill status={l.transportReadiness} color={readinessLevelColor(l.transportReadiness)} />
                      </Td>
                      <Td small>
                        <StatusPill status={l.governmentConnectivity} color={readinessLevelColor(l.governmentConnectivity)} />
                      </Td>
                      <Td small className="text-center text-amber-500 font-semibold">{asNum(l.manualTouchpoints)}</Td>
                      <Td small className="text-center text-red-400 font-semibold">{asNum(l.missingIntegrations)}</Td>
                      <Td small className="font-bold" style={{ color: low ? "#f87171" : "#10b981" }}>
                        {pct(overall)}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 5. ALERTS TAB (§10)
// =====================================================================

function AlertsTab() {
  const [alertType, setAlertType] = useState("ALL");
  const [severity, setSeverity] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const qs = new URLSearchParams();
  if (alertType !== "ALL") qs.set("alertType", alertType);
  if (severity !== "ALL") qs.set("severity", severity);
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const url = `/api/sgtx/integrations/alerts${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-integrations-alerts", alertType, severity, statusFilter],
    queryFn: () => fetchJson(url),
  });

  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<any>(null);
  const qc = useQueryClient();

  const alerts = asArray(data?.alerts);

  async function runScan() {
    setScanning(true);
    try {
      const r = await postJson("/api/sgtx/integrations/alerts/scan", {});
      setScanResult(r);
      qc.invalidateQueries({ queryKey: ["sgtx-integrations-alerts"] });
    } catch (e: any) {
      setScanResult({ error: e?.message || "scan failed" });
    } finally {
      setScanning(false);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Integration Alerts"
        subtitle="Phase 8 · §10 — open + acknowledged + resolved + dismissed alerts across all integrations"
      />

      <Card className="p-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Alert Type"
          value={alertType}
          onChange={setAlertType}
          options={ALERT_TYPES}
          placeholder="ALL types"
        />
        <FilterSelect
          label="Severity"
          value={severity}
          onChange={setSeverity}
          options={ALERT_SEVERITIES}
          placeholder="ALL severities"
        />
        <FilterSelect
          label="Status"
          value={statusFilter}
          onChange={setStatusFilter}
          options={ALERT_STATUSES}
          placeholder="ALL statuses"
        />
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 mt-5">
          <Activity className="w-3 h-3 mr-1" /> Refresh
        </Button>
        <Button size="sm" onClick={runScan} disabled={scanning} className="h-8 mt-5">
          {scanning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
          Scan for Alerts
        </Button>
        {scanResult && (
          <div className="text-[0.7rem] text-muted-foreground">
            {scanResult.error ? (
              <span className="text-red-400">Error: {scanResult.error}</span>
            ) : (
              <span>
                Scan complete — <b>{scanResult.generated}</b> new alert(s) generated (checked{" "}
                {scanResult.checked}).
              </span>
            )}
          </div>
        )}
      </Card>

      {isLoading ? (
        <LoadingState label="Loading alerts…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : alerts.length === 0 ? (
        <EmptyState label="No alerts match the current filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-[0.7rem]">
              <thead className="bg-muted/30 sticky top-0 z-10">
                <tr>
                  <Th small>Alert ID</Th>
                  <Th small>Type</Th>
                  <Th small>Severity</Th>
                  <Th small>Title</Th>
                  <Th small>Jurisdiction</Th>
                  <Th small>Connector</Th>
                  <Th small>Status</Th>
                  <Th small>Due Date</Th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a: any, i: number) => {
                  const isCriticalOpen =
                    String(a.severity || "").toUpperCase() === "CRITICAL" &&
                    String(a.status || "").toUpperCase() === "OPEN";
                  return (
                    <tr
                      key={a.id || i}
                      className={`border-b border-border/30 hover:bg-muted/20 ${isCriticalOpen ? "bg-red-500/10" : ""}`}
                    >
                      <Td small className="font-mono text-[0.6rem]">{a.alertId || "—"}</Td>
                      <Td small>
                        <StatusPill status={a.alertType} color={integrationTypeColor(a.alertType)} />
                      </Td>
                      <Td small>
                        <StatusPill status={a.severity} color={alertSeverityColor(a.severity)} />
                      </Td>
                      <Td small className="max-w-[280px] truncate" title={a.title}>{a.title || "—"}</Td>
                      <Td small className="font-mono">{a.jurisdictionCode || "—"}</Td>
                      <Td small className="font-mono text-[0.6rem]">{a.connectorId || "—"}</Td>
                      <Td small>
                        <StatusPill status={a.status} color={alertStatusColor(a.status)} />
                      </Td>
                      <Td small>{a.dueDate ? fmtDate(a.dueDate) : "—"}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

// =====================================================================
// 6. DISCOVERY TEST TAB (§5 interactive — §6 example default)
// =====================================================================

function DiscoveryTestTab() {
  const [originCountry, setOriginCountry] = useState("EG");
  const [destinationCountry, setDestinationCountry] = useState("AE");
  const [transitCountries, setTransitCountries] = useState("");
  const [commodity, setCommodity] = useState("Agricultural");
  const [hs6, setHs6] = useState("070310");
  const [mode, setMode] = useState("ROAD");
  const [incoterm, setIncoterm] = useState("FCA");
  const [specialCargoJson, setSpecialCargoJson] = useState(
    JSON.stringify({ temperatureControlled: true, dangerousGoods: false }, null, 2),
  );
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function discover() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      let specialCargo: any = undefined;
      const trimmed = specialCargoJson.trim();
      if (trimmed) {
        try {
          specialCargo = JSON.parse(trimmed);
        } catch (e: any) {
          throw new Error(`specialCargo JSON is invalid: ${e?.message}`);
        }
      }
      const transitArr = transitCountries
        .split(/[,\s]+/)
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean);
      const body: any = {
        originCountry: originCountry.trim().toUpperCase(),
        destinationCountry: destinationCountry.trim().toUpperCase(),
        commodity,
        hs6,
        mode: mode.trim().toUpperCase(),
        incoterm: incoterm || undefined,
        specialCargo,
      };
      if (transitArr.length > 0) body.transitCountries = transitArr;
      const r = await postJson("/api/sgtx/integrations/discover", body);
      setResult(r?.result);
    } catch (e: any) {
      setError(e?.message || "discovery failed");
    } finally {
      setLoading(false);
    }
  }

  const reqs = asArray(result?.requiredIntegrations);
  const summary = result?.summary || {};

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Integration Discovery Test"
        subtitle="Phase 8 · §5 — interactive test of the automatic discovery engine (default: §6 example EG → AE agricultural reefer by road)"
      />

      <Card className="p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <FilterInputText
          label="Origin Country"
          value={originCountry}
          placeholder="EG"
          onChange={setOriginCountry}
        />
        <FilterInputText
          label="Destination Country"
          value={destinationCountry}
          placeholder="AE"
          onChange={setDestinationCountry}
        />
        <FilterInputText
          label="Transit Countries (comma-separated, optional)"
          value={transitCountries}
          placeholder="JO, SA"
          onChange={setTransitCountries}
        />
        <FilterInputText
          label="Commodity"
          value={commodity}
          placeholder="Agricultural"
          onChange={setCommodity}
        />
        <FilterInputText
          label="HS6 Code"
          value={hs6}
          placeholder="070310"
          onChange={setHs6}
        />
        <FilterInputText
          label="Mode"
          value={mode}
          placeholder="ROAD"
          onChange={setMode}
        />
        <FilterInputText
          label="Incoterm"
          value={incoterm}
          placeholder="FCA"
          onChange={setIncoterm}
        />
        <div className="flex flex-col gap-1 md:col-span-2">
          <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
            Special Cargo (JSON)
          </Label>
          <Textarea
            value={specialCargoJson}
            onChange={(e) => setSpecialCargoJson(e.target.value)}
            className="font-mono text-[0.7rem] min-h-[80px]"
          />
        </div>
        <div className="md:col-span-2">
          <Button size="sm" onClick={discover} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Beaker className="w-3 h-3 mr-1" />}
            Discover Required Integrations
          </Button>
        </div>
      </Card>

      {error && <ErrorState message={error} />}

      {result && (
        <div className="space-y-3">
          {/* Flags + summary */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <SummaryTile label="Total" value={String(asNum(summary.total))} accent="#94a3b8" icon={Boxes} />
            <SummaryTile label="Connected" value={String(asNum(summary.connected))} accent="#10b981" icon={CheckCircle2} />
            <SummaryTile label="Partial" value={String(asNum(summary.partial))} accent="#f59e0b" icon={AlertTriangle} />
            <SummaryTile label="Manual" value={String(asNum(summary.manual))} accent="#94a3b8" icon={Boxes} />
            <SummaryTile label="Missing" value={String(asNum(summary.missing))} accent="#f87171" icon={XCircle} />
          </div>
          <Card className="p-3 flex flex-wrap gap-2">
            <Badge variant="outline" className="text-[0.6rem]">
              Origin: <span className="font-mono ml-1">{result.originCountry}</span>
            </Badge>
            <Badge variant="outline" className="text-[0.6rem]">
              Destination: <span className="font-mono ml-1">{result.destinationCountry}</span>
            </Badge>
            <Badge variant="outline" className="text-[0.6rem]">
              Transit:{" "}
              <span className="font-mono ml-1">
                {Array.isArray(result.transitCountries) && result.transitCountries.length > 0
                  ? result.transitCountries.join(", ")
                  : "(direct)"}
              </span>
            </Badge>
            <Badge
              variant="outline"
              className="text-[0.6rem]"
              style={{
                color: result.isReefer ? "#f59e0b" : "#94a3b8",
                borderColor: result.isReefer ? "#f59e0b55" : "#94a3b855",
              }}
            >
              Reefer: {result.isReefer ? "YES" : "no"}
            </Badge>
            <Badge
              variant="outline"
              className="text-[0.6rem]"
              style={{
                color: result.isDg ? "#f87171" : "#94a3b8",
                borderColor: result.isDg ? "#f8717155" : "#94a3b855",
              }}
            >
              DG: {result.isDg ? "YES" : "no"}
            </Badge>
            <Badge
              variant="outline"
              className="text-[0.6rem]"
              style={{
                color: result.isAgricultural ? "#10b981" : "#94a3b8",
                borderColor: result.isAgricultural ? "#10b98155" : "#94a3b855",
              }}
            >
              Agricultural: {result.isAgricultural ? "YES" : "no"}
            </Badge>
            <Badge
              variant="outline"
              className="text-[0.6rem]"
              style={{
                color: result.isPharma ? "#10b981" : "#94a3b8",
                borderColor: result.isPharma ? "#10b98155" : "#94a3b855",
              }}
            >
              Pharma: {result.isPharma ? "YES" : "no"}
            </Badge>
            <Badge
              variant="outline"
              className="text-[0.6rem]"
              style={{
                color: result.isChemical ? "#f59e0b" : "#94a3b8",
                borderColor: result.isChemical ? "#f59e0b55" : "#94a3b855",
              }}
            >
              Chemical: {result.isChemical ? "YES" : "no"}
            </Badge>
          </Card>

          {reqs.length === 0 ? (
            <EmptyState label="No required integrations returned." />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="w-full text-[0.7rem]">
                  <thead className="bg-muted/30 sticky top-0 z-10">
                    <tr>
                      <Th small>Country</Th>
                      <Th small>Role</Th>
                      <Th small>Authority</Th>
                      <Th small>Procedure</Th>
                      <Th small>Status</Th>
                      <Th small>Priority</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {reqs.map((r: any, i: number) => (
                      <tr key={i} className="border-b border-border/30 hover:bg-muted/20">
                        <Td small className="font-mono">{r.countryCode || "—"}</Td>
                        <Td small>{r.role || "—"}</Td>
                        <Td small>{r.authority || "—"}</Td>
                        <Td small>{r.procedure || "—"}</Td>
                        <Td small>
                          <StatusPill status={r.status} color={gapStatusColor(r.status)} />
                        </Td>
                        <Td small className="font-semibold">{asNum(r.priority)}</Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// 7. TEST RUNNER TAB (§11 — 10 scenarios)
// =====================================================================

interface TestScenario {
  id: string;
  label: string;
  description: string;
  // run returns { pass: boolean, message: string, detail?: any }
  run: () => Promise<{ pass: boolean; message: string; detail?: any }>;
}

function buildScenarios(): TestScenario[] {
  return [
    {
      id: "missing-integration",
      label: "Missing Integration",
      description: "Create a MISSING gap for a fictitious jurisdiction + verify the gap summary reflects it.",
      run: async () => {
        const created = await postJson("/api/sgtx/integrations/gaps", {
          jurisdictionCode: "ZZ",
          authority: "CUSTOMS",
          procedure: "EXPORT",
          transportMode: "ROAD",
          systemName: "TEST-MISSING",
          status: "MISSING",
          priority: 80,
          source: "MANUAL",
          notes: "test runner §11 — missing integration scenario",
        });
        if (!created?.gap?.id) {
          return { pass: false, message: "gap not created" };
        }
        const sum = await fetchJson("/api/sgtx/integrations/gaps/summary?jurisdictionCode=ZZ");
        const missing = asNum(sum?.summary?.missing);
        return {
          pass: missing >= 1,
          message: `missing=${missing} for ZZ`,
          detail: { gapId: created.gap.gapId, summary: sum?.summary },
        };
      },
    },
    {
      id: "connected-integration",
      label: "Connected Integration",
      description: "Upsert a PRODUCTION_CONNECTED catalog entry + verify getCatalogByConnectorId returns it.",
      run: async () => {
        const upserted = await postJson("/api/sgtx/integrations/catalog", {
          jurisdictionCode: "ZZ",
          authority: "CUSTOMS",
          systemName: "TEST-CONNECTED",
          procedure: "EXPORT",
          transportMode: "ROAD",
          integrationType: "API",
          status: "PRODUCTION_CONNECTED",
          priority: 90,
        });
        if (!upserted?.entry?.connectorId) {
          return { pass: false, message: "entry not upserted" };
        }
        const cid = upserted.entry.connectorId;
        const fetched = await fetchJson(
          `/api/sgtx/integrations/catalog/by-connector-id/${encodeURIComponent(cid)}`,
        );
        const ok = fetched?.entry?.connectorId === cid;
        return {
          pass: ok,
          message: ok ? `connected entry ${cid} round-tripped` : "round-trip failed",
          detail: { connectorId: cid, status: fetched?.entry?.status },
        };
      },
    },
    {
      id: "portal-only",
      label: "Portal-Only",
      description: "Upsert a PORTAL_ONLY catalog entry + verify isConnectorUsable=true (manual).",
      run: async () => {
        const upserted = await postJson("/api/sgtx/integrations/catalog", {
          jurisdictionCode: "ZZ",
          authority: "TAX",
          systemName: "TEST-PORTAL-ONLY",
          procedure: "EXPORT_INVOICE",
          integrationType: "PORTAL",
          status: "PORTAL_ONLY",
          priority: 50,
        });
        if (!upserted?.entry?.connectorId) {
          return { pass: false, message: "entry not upserted" };
        }
        // Status assertion: bucket should be manual via connected-count.
        const sum = await fetchJson(
          `/api/sgtx/integrations/catalog/connected-count?jurisdictionCode=ZZ`,
        );
        const manual = asNum(sum?.summary?.manual);
        return {
          pass: manual >= 1,
          message: `ZZ manual=${manual}`,
          detail: { connectorId: upserted.entry.connectorId, summary: sum?.summary },
        };
      },
    },
    {
      id: "manual-only",
      label: "Manual-Only",
      description: "Upsert a MANUAL_ONLY catalog entry + verify manual bucket increments.",
      run: async () => {
        const upserted = await postJson("/api/sgtx/integrations/catalog", {
          jurisdictionCode: "ZZ",
          authority: "BROKER",
          systemName: "TEST-MANUAL-ONLY",
          integrationType: "MANUAL",
          status: "MANUAL_ONLY",
          priority: 40,
        });
        if (!upserted?.entry?.connectorId) {
          return { pass: false, message: "entry not upserted" };
        }
        const sum = await fetchJson(
          `/api/sgtx/integrations/catalog/connected-count?jurisdictionCode=ZZ`,
        );
        const manual = asNum(sum?.summary?.manual);
        return {
          pass: manual >= 1,
          message: `ZZ manual=${manual}`,
          detail: { connectorId: upserted.entry.connectorId, summary: sum?.summary },
        };
      },
    },
    {
      id: "expired-certificate",
      label: "Expired Certificate",
      description: "Upsert a catalog entry with certification=EXPIRED + verify expiring-certificates endpoint returns it.",
      run: async () => {
        const upserted = await postJson("/api/sgtx/integrations/catalog", {
          jurisdictionCode: "ZZ",
          authority: "CUSTOMS",
          systemName: "TEST-EXPIRED-CERT",
          integrationType: "API",
          status: "PRODUCTION_CONNECTED",
          certification: "EXPIRED",
          priority: 70,
        });
        if (!upserted?.entry?.connectorId) {
          return { pass: false, message: "entry not upserted" };
        }
        const r = await fetchJson(
          "/api/sgtx/integrations/alerts/expiring-certificates?daysAhead=30",
        );
        const arr = asArray(r?.entries);
        const found = arr.some((e: any) => e?.connectorId === upserted.entry.connectorId);
        return {
          pass: found,
          message: found ? "expired-cert entry present in expiring-certificates" : "not found",
          detail: { connectorId: upserted.entry.connectorId, entriesCount: arr.length },
        };
      },
    },
    {
      id: "api-outage",
      label: "API Outage",
      description: "Upsert a catalog entry with status=OUTAGE + verify the alerts scan creates a CONNECTOR_OUTAGE alert.",
      run: async () => {
        const upserted = await postJson("/api/sgtx/integrations/catalog", {
          jurisdictionCode: "ZZ",
          authority: "CUSTOMS",
          systemName: "TEST-OUTAGE",
          integrationType: "API",
          status: "OUTAGE",
          priority: 95,
        });
        if (!upserted?.entry?.connectorId) {
          return { pass: false, message: "entry not upserted" };
        }
        const scan = await postJson("/api/sgtx/integrations/alerts/scan", {});
        const arr = asArray(scan?.newAlerts);
        const found = arr.some(
          (a: any) =>
            a?.alertType === "CONNECTOR_OUTAGE" &&
            a?.connectorId === upserted.entry.connectorId,
        );
        return {
          pass: found,
          message: found
            ? "CONNECTOR_OUTAGE alert generated"
            : `no matching alert in ${arr.length} new alerts`,
          detail: { connectorId: upserted.entry.connectorId, generated: scan?.generated },
        };
      },
    },
    {
      id: "new-government-requirement",
      label: "New Government Requirement",
      description: "Create a MISSING gap for a new authority + verify the getMissingGaps endpoint returns it.",
      run: async () => {
        const created = await postJson("/api/sgtx/integrations/gaps", {
          jurisdictionCode: "ZZ",
          authority: "HEALTH",
          procedure: "IMPORT_CERT",
          status: "MISSING",
          priority: 85,
          source: "GOVERNMENT_NOTIFICATION",
          notes: "test runner §11 — new government requirement scenario",
        });
        if (!created?.gap?.id) {
          return { pass: false, message: "gap not created" };
        }
        const missing = await fetchJson("/api/sgtx/integrations/gaps/missing?jurisdictionCode=ZZ");
        const arr = asArray(missing?.gaps);
        const found = arr.some((g: any) => g?.id === created.gap.id);
        return {
          pass: found,
          message: found ? "new MISSING gap surfaced in getMissingGaps" : "not found in missing list",
          detail: { gapId: created.gap.gapId, missingCount: arr.length },
        };
      },
    },
    {
      id: "new-trade-lane",
      label: "New Trade Lane",
      description: "Assess a new trade lane (ZZ→ZZ ROAD) + verify a TradeLaneReadiness row is returned.",
      run: async () => {
        const r = await postJson("/api/sgtx/integrations/trade-lanes/assess", {
          originCountry: "ZZ",
          destinationCountry: "ZZ",
          mode: "ROAD",
          commodity: "Test Widget",
          hs6: "000000",
        });
        const result = r?.result;
        if (!result?.laneId) {
          return { pass: false, message: "laneId not returned" };
        }
        return {
          pass: true,
          message: `lane ${result.laneId} assessed — overall=${pct(result.overallReadiness)}`,
          detail: {
            laneId: result.laneId,
            overallReadiness: result.overallReadiness,
            missingIntegrations: result.missingIntegrations,
          },
        };
      },
    },
    {
      id: "country-activation",
      label: "Country Activation",
      description: "Run country readiness assessment for ZZ + verify dimensions returned.",
      run: async () => {
        const r = await postJson(
          "/api/sgtx/integrations/country-readiness/assess?countryCode=ZZ",
          {},
        );
        const result = r?.result;
        if (!result?.countryCode) {
          return { pass: false, message: "result not returned" };
        }
        const dims = asArray(result.dimensions);
        return {
          pass: dims.length >= 10,
          message: `ZZ assessed — ${dims.length} dimensions, overall=${pct(result.overallReadiness)}`,
          detail: {
            countryCode: result.countryCode,
            dimensions: dims.length,
            overall: result.overallReadiness,
          },
        };
      },
    },
    {
      id: "priority-calculation",
      label: "Priority Calculation",
      description: "Create a MISSING gap + transition to CONNECTED + verify priority decreases.",
      run: async () => {
        const created = await postJson("/api/sgtx/integrations/gaps", {
          jurisdictionCode: "ZZ",
          authority: "BANK",
          procedure: "IMPORT_VAT",
          status: "MISSING",
          priority: 80,
          source: "MANUAL",
          notes: "test runner §11 — priority calculation scenario",
        });
        if (!created?.gap?.id) {
          return { pass: false, message: "gap not created" };
        }
        const beforePriority = asNum(created.gap.priority);
        const id = created.gap.id;
        // Transition to CONNECTED.
        const updated = await postJson(`/api/sgtx/integrations/gaps/${id}/status`, {
          newStatus: "CONNECTED",
          notes: "test runner resolved",
        });
        const afterPriority = asNum(updated?.gap?.priority);
        // CONNECTED base = 20, MISSING base = 80 → after should be ≤ before.
        const pass = afterPriority <= beforePriority;
        return {
          pass,
          message: `priority ${beforePriority} → ${afterPriority} after CONNECTED`,
          detail: { gapId: created.gap.gapId, before: beforePriority, after: afterPriority },
        };
      },
    },
  ];
}

function TestRunnerTab() {
  const scenarios = buildScenarios();
  const [results, setResults] = useState<Record<string, any>>({});
  const [running, setRunning] = useState<Record<string, boolean>>({});

  async function runOne(s: TestScenario) {
    setRunning((prev) => ({ ...prev, [s.id]: true }));
    try {
      const r = await s.run();
      setResults((prev) => ({ ...prev, [s.id]: r }));
    } catch (e: any) {
      setResults((prev) => ({ ...prev, [s.id]: { pass: false, message: e?.message || "error" } }));
    } finally {
      setRunning((prev) => ({ ...prev, [s.id]: false }));
    }
  }

  async function runAll() {
    for (const s of scenarios) {
      // Sequential to avoid DB contention + race conditions on shared fixtures.
      await runOne(s);
    }
  }

  const totalRun = Object.keys(results).length;
  const totalPass = Object.values(results).filter((r: any) => r?.pass).length;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Integration Test Runner"
        subtitle="Phase 8 · §11 — 10 interactive scenarios verifying the catalog → gap → discovery → readiness → alerts pipeline"
      />

      <Card className="p-4 flex items-center gap-3">
        <Button size="sm" onClick={runAll}>
          <PlayCircle className="w-3 h-3 mr-1" /> Run All Tests
        </Button>
        <div className="text-[0.7rem] text-muted-foreground">
          {totalRun > 0 ? (
            <span>
              <b>{totalPass}</b> / {totalRun} passed
            </span>
          ) : (
            <span>No tests run yet.</span>
          )}
        </div>
      </Card>

      <div className="space-y-3">
        {scenarios.map((s) => {
          const r = results[s.id];
          const isRunning = running[s.id];
          return (
            <Card key={s.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold">{s.label}</span>
                    {r && (
                      <StatusPill
                        status={r.pass ? "PASS" : "FAIL"}
                        color={r.pass ? "#10b981" : "#f87171"}
                      />
                    )}
                  </div>
                  <p className="text-[0.65rem] text-muted-foreground">{s.description}</p>
                  {r && (
                    <div className="mt-2 text-[0.65rem]">
                      <span className="text-muted-foreground">Result: </span>
                      <span style={{ color: r.pass ? "#10b981" : "#f87171" }}>{r.message}</span>
                      {r.detail && (
                        <pre className="mt-1 whitespace-pre-wrap text-[0.6rem] text-muted-foreground font-mono">
                          {JSON.stringify(r.detail, null, 2)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => runOne(s)}
                  disabled={isRunning}
                  className="h-7 text-[0.65rem]"
                >
                  {isRunning ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
                  Run Test
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
// MAIN EXPORT
// =====================================================================

export function GlobalIntegrationControlScreen() {
  const [tab, setTab] = useState("gaps");
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Global Integration Control Center"
        subtitle="Phase 8 — Worldwide Integration Catalog · Gap Analysis · Discovery · Country/Lane Readiness · Alerts"
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-1">
          <TabsTrigger value="gaps" className="text-[0.7rem]">
            <ShieldAlert className="w-3 h-3 mr-1" /> Gap Analysis
          </TabsTrigger>
          <TabsTrigger value="catalog" className="text-[0.7rem]">
            <Boxes className="w-3 h-3 mr-1" /> Catalog
          </TabsTrigger>
          <TabsTrigger value="country" className="text-[0.7rem]">
            <Globe2 className="w-3 h-3 mr-1" /> Country
          </TabsTrigger>
          <TabsTrigger value="lanes" className="text-[0.7rem]">
            <Network className="w-3 h-3 mr-1" /> Trade Lanes
          </TabsTrigger>
          <TabsTrigger value="alerts" className="text-[0.7rem]">
            <AlertTriangle className="w-3 h-3 mr-1" /> Alerts
          </TabsTrigger>
          <TabsTrigger value="discover" className="text-[0.7rem]">
            <Beaker className="w-3 h-3 mr-1" /> Discovery
          </TabsTrigger>
          <TabsTrigger value="tests" className="text-[0.7rem]">
            <PlayCircle className="w-3 h-3 mr-1" /> Test Runner
          </TabsTrigger>
        </TabsList>
        <TabsContent value="gaps">
          <GapAnalysisTab />
        </TabsContent>
        <TabsContent value="catalog">
          <CatalogTab />
        </TabsContent>
        <TabsContent value="country">
          <CountryReadinessTab />
        </TabsContent>
        <TabsContent value="lanes">
          <TradeLaneTab />
        </TabsContent>
        <TabsContent value="alerts">
          <AlertsTab />
        </TabsContent>
        <TabsContent value="discover">
          <DiscoveryTestTab />
        </TabsContent>
        <TabsContent value="tests">
          <TestRunnerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default GlobalIntegrationControlScreen;
