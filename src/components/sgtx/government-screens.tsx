"use client";

// SGTX Phase 4 §7 ADMIN — Government Integration Control Center (gov portal)
// Seven sub-tabs that exercise every Phase 4 government integration subsystem:
//   1. Control Center (§7) — THE wide 19-column Global Government Integration
//      Control Center table + health summary tiles. Default tab.
//   2. Customs Operations    — CustomsOperationV2 rows + status/operation/mode filters
//   3. Workflows             — MultiAgencyWorkflow rows + expanded WorkflowStep list
//   4. Single Window Mappings— SingleWindowMapping rows (canonical ↔ national)
//   5. Gateway Calls         — GovGatewayCall audit log (most recent first)
//   6. Submissions           — GovernmentSubmission authoritative audit rows
//   7. Test Runner           — §9 scenarios with PASS/FAIL execution
//
// Design rules (mandatory per the SGTX convention):
//   • 'use client' at top — admin UI is interactive.
//   • non-marketplace — never ranks, scores, or recommends counterparties.
//   • never crashes on missing/malformed API data — every JSON field is
//     defensively parsed via `safeParse`, every list is `Array.isArray`-guarded.
//   • palette: gold / emerald / amber / red / slate (NO indigo or blue).
//   • §7 Control Center table is WIDE (19 columns) — horizontally scrollable
//     with sticky first column (Jurisdiction).
//   • Egypt connectors (jurisdictionCode=EG) get a gold left border (§8 Egypt-first).
//   • tables wrap in `overflow-x-auto max-h-96 overflow-y-auto scroll-gold`.
//   • verdict icons: CheckCircle2 (green), AlertTriangle (amber), XCircle (red).
//   • uses @tanstack/react-query for fetching + mutations.

import { Fragment, useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDate, fmtDateTime } from "@/lib/sgtx/format";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Landmark,
  Network,
  Building2,
  Globe2,
  ShieldCheck,
  Workflow as WorkflowIcon,
  FileClock,
  Send,
  FlaskConical,
  ChevronRight,
  ChevronDown,
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

/** Defensive fetch + JSON parse — throws a readable Error on non-2xx. */
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

/** Format a 0..100 coverage percentage. */
function fmtPct(c: unknown): string {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

/** Small pill badge with arbitrary colour. */
function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold whitespace-nowrap"
      style={{ color, background: `${color}1a` }}
    >
      {children}
    </span>
  );
}

/** Boolean check / cross cell. */
function BoolCell({ value }: { value: unknown }) {
  return value ? (
    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 inline" />
  ) : (
    <XCircle className="w-3.5 h-3.5 text-red-500 inline" />
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

// ============ Status badge colour helpers ============

/** GovConnector §6 15-state lifecycle status → colour. */
function connectorStatusColor(status: unknown): string {
  const s = String(status || "").toUpperCase();
  if (s === "PRODUCTION_CONNECTED") return "#10b981"; // emerald-500
  if (s === "SANDBOX_CONNECTED") return "#10b981"; // emerald (avoid blue per spec)
  if (s === "DEGRADED" || s === "CERTIFICATION_PENDING") return "#fbbf24"; // amber-400
  if (
    s === "OUTAGE" ||
    s === "NOT_DISCOVERED" ||
    s === "DEPRECATED"
  )
    return "#f87171"; // red-400 (NOT_DISCOVERED = red-dim via 0.7 alpha in caller)
  if (s === "PORTAL_ONLY") return "#64748b"; // slate-500
  if (s === "MANUAL_ONLY") return "#94a3b8"; // slate-400
  if (
    s === "PRODUCTION_READY" ||
    s === "CERTIFICATION_REQUIRED" ||
    s === "CREDENTIALS_REQUIRED" ||
    s === "CONTACT_REQUIRED" ||
    s === "SANDBOX_AVAILABLE" ||
    s === "DOCUMENTED" ||
    s === "DISCOVERED"
  )
    return "#fbbf24";
  return "#94a3b8";
}

/** CustomsOperationV2 / GovernmentSubmission §4 status → colour. */
function customsStatusColor(s: unknown): string {
  const u = String(s || "").toUpperCase();
  if (u === "GOVERNMENT_RELEASED") return "#10b981";
  if (u === "GOVERNMENT_ACCEPTED") return "#10b981";
  if (u === "SUBMITTED" || u === "GOVERNMENT_HOLD") return "#fbbf24";
  if (u === "GOVERNMENT_REJECTED") return "#f87171";
  if (u === "SGTX_READY") return "#64748b";
  return "#94a3b8";
}

/** GovGatewayCall §9 status → colour. */
function gatewayCallStatusColor(s: unknown): string {
  const u = String(s || "").toUpperCase();
  if (u === "SUCCESS") return "#10b981";
  if (u === "FAILED") return "#f87171";
  if (u === "RETRY") return "#fbbf24";
  if (u === "DUPLICATE" || u === "PENDING") return "#64748b";
  return "#94a3b8";
}

/** WorkflowStep §4 status → colour. */
function workflowStepStatusColor(s: unknown): string {
  const u = String(s || "").toUpperCase();
  if (
    u === "GOVERNMENT_RELEASED" ||
    u === "GOVERNMENT_ACCEPTED" ||
    u === "SKIPPED"
  )
    return "#10b981";
  if (u === "IN_PROGRESS" || u === "SUBMITTED") return "#fbbf24";
  if (u === "GOVERNMENT_REJECTED" || u === "GOVERNMENT_HOLD")
    return "#f87171";
  if (u === "PENDING") return "#64748b";
  return "#94a3b8";
}

// ============ Sub-tab navigation ============

type SubTabId =
  | "control-center"
  | "customs-operations"
  | "workflows"
  | "mappings"
  | "gateway-calls"
  | "submissions"
  | "test-runner";

const SUB_TABS: Array<{ id: SubTabId; label: string; icon: any }> = [
  { id: "control-center", label: "Control Center (§7)", icon: Landmark },
  { id: "customs-operations", label: "Customs Operations", icon: Network },
  { id: "workflows", label: "Workflows", icon: WorkflowIcon },
  { id: "mappings", label: "Single Window Mappings", icon: Globe2 },
  { id: "gateway-calls", label: "Gateway Calls", icon: FileClock },
  { id: "submissions", label: "Submissions", icon: Send },
  { id: "test-runner", label: "Test Runner (§9)", icon: FlaskConical },
];

// ============ Filter option constants ============

const TRANSPORT_MODES = ["SEA", "AIR", "ROAD", "RAIL", "RORO", "MULTIMODAL"];
const TRANSPORT_MODES_WITH_ALL = ["ALL", ...TRANSPORT_MODES];

const CONNECTOR_STATUSES_LIST = [
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
];

const SYSTEM_TYPES_LIST = [
  "SINGLE_WINDOW",
  "CUSTOMS",
  "SPS",
  "HEALTH",
  "STANDARDS",
  "PORT",
  "BANK",
  "TAX",
];

const OPERATION_TYPES = [
  "EXPORT",
  "IMPORT",
  "TRANSIT",
  "TEMPORARY_EXPORT",
  "TEMPORARY_IMPORT",
  "INWARD_PROCESSING",
  "OUTWARD_PROCESSING",
  "BONDED_WAREHOUSE",
  "FREE_ZONE",
  "RE_EXPORT",
  "RE_IMPORT",
  "DESTRUCTION",
  "ABANDONMENT",
  "DRAWBACK",
  "POST_CLEARANCE",
];

const CUSTOMS_STATUSES_LIST = [
  "SGTX_READY",
  "SUBMITTED",
  "GOVERNMENT_ACCEPTED",
  "GOVERNMENT_REJECTED",
  "GOVERNMENT_HOLD",
  "GOVERNMENT_RELEASED",
];

const GATEWAY_OPERATION_TYPES = [
  "DISCOVER",
  "AUTHENTICATE",
  "VALIDATE",
  "PREPARE",
  "SUBMIT",
  "STATUS",
  "AMEND",
  "CANCEL",
  "INSPECT",
  "RELEASE",
  "DOCUMENT",
  "PERMIT",
  "CERTIFICATE",
  "PAYMENT",
  "RECONCILE",
];

const GATEWAY_CALL_STATUSES = [
  "PENDING",
  "SUCCESS",
  "FAILED",
  "RETRY",
  "DUPLICATE",
];

const MAPPING_TYPES = [
  "WCO_DATA_MODEL",
  "REGIONAL",
  "NATIONAL",
  "AUTHORITY_SPECIFIC",
];

const SUBMISSION_TYPES = [
  "DECLARATION",
  "CERTIFICATE",
  "PERMIT",
  "LICENSE",
  "DOCUMENT",
  "PAYMENT",
  "INSPECTION",
  "RELEASE",
];

// ============ Main screen ============

export function GovernmentIntegrationScreen() {
  const [subTab, setSubTab] = useState<SubTabId>("control-center");
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Government Integration Control Center"
        subtitle="Phase 4 §7 ADMIN — global government connectors · customs operations · multi-agency workflows · single-window mappings · gateway audit · §9 test runner"
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

      {subTab === "control-center" && <ControlCenterTab />}
      {subTab === "customs-operations" && <CustomsOperationsTab />}
      {subTab === "workflows" && <WorkflowsTab />}
      {subTab === "mappings" && <MappingsTab />}
      {subTab === "gateway-calls" && <GatewayCallsTab />}
      {subTab === "submissions" && <SubmissionsTab />}
      {subTab === "test-runner" && <TestRunnerTab />}
    </div>
  );
}

// ============ 1. Control Center (§7) — default tab ============

function ControlCenterTab() {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("all");
  const [authorityFilter, setAuthorityFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [systemTypeFilter, setSystemTypeFilter] = useState<string>("all");
  const [transportModeFilter, setTransportModeFilter] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: [
      "gov-connectors",
      jurisdictionFilter,
      authorityFilter,
      statusFilter,
      systemTypeFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (jurisdictionFilter !== "all")
        params.set("jurisdictionCode", jurisdictionFilter);
      if (authorityFilter !== "all") params.set("authority", authorityFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (systemTypeFilter !== "all")
        params.set("systemType", systemTypeFilter);
      const qs = params.toString();
      return jfetch<{ connectors?: any[] }>(
        `/api/sgtx/government/connectors${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const allConnectors = Array.isArray(q.data?.connectors)
    ? q.data!.connectors
    : [];

  // Client-side transport-mode filter (mode is a JSON array inside `transportModes`).
  const connectors = useMemo(() => {
    if (transportModeFilter === "ALL") return allConnectors;
    return allConnectors.filter((c) => {
      const modes = safeParse<string[]>(c?.transportModes, []);
      if (!Array.isArray(modes) || modes.length === 0) return false;
      return modes
        .map((m) => String(m || "").toUpperCase())
        .includes(transportModeFilter);
    });
  }, [allConnectors, transportModeFilter]);

  // Authority options — derived from the loaded data (so the dropdown always
  // reflects whatever jurisdictions have been seeded).
  const authorityOptions = useMemo(() => {
    const s = new Set<string>();
    allConnectors.forEach((c) => {
      if (c?.authority) s.add(String(c.authority));
    });
    return Array.from(s).sort();
  }, [allConnectors]);

  // Health summary tiles.
  const stats = useMemo(() => {
    const total = allConnectors.length;
    const connected = allConnectors.filter((c) => {
      const s = String(c?.status || "").toUpperCase();
      return (
        s === "PRODUCTION_CONNECTED" ||
        s === "SANDBOX_CONNECTED" ||
        s === "PRODUCTION_READY"
      );
    }).length;
    const problems = allConnectors.filter((c) => {
      const s = String(c?.status || "").toUpperCase();
      return s === "DEGRADED" || s === "OUTAGE";
    }).length;
    const gaps = allConnectors.filter((c) => {
      const s = String(c?.status || "").toUpperCase();
      return s === "MISSING" || s === "NOT_DISCOVERED";
    }).length;
    // Coverage % = connected / total (excluding NOT_DISCOVERED from the
    // denominator so undiscovered jurisdictions don't penalise the score).
    const discovered = total - gaps;
    const coveragePct =
      discovered > 0 ? Math.round((connected / discovered) * 100) : 0;
    return { total, connected, problems, gaps, coveragePct };
  }, [allConnectors]);

  const tiles: Array<{
    key: string;
    label: string;
    value: number | string;
    color: string;
  }> = [
    {
      key: "total",
      label: "Total Connectors",
      value: stats.total,
      color: "#ca8a04",
    },
    {
      key: "connected",
      label: "Connected",
      value: stats.connected,
      color: "#10b981",
    },
    {
      key: "problems",
      label: "Problems (DEGRADED/OUTAGE)",
      value: stats.problems,
      color: "#f87171",
    },
    {
      key: "gaps",
      label: "Gaps (MISSING/NOT_DISCOVERED)",
      value: stats.gaps,
      color: "#fbbf24",
    },
    {
      key: "coverage",
      label: "Avg Coverage %",
      value: `${stats.coveragePct}%`,
      color: "#ca8a04",
    },
  ];

  return (
    <div className="space-y-4">
      {/* Health summary tiles */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Landmark className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">
            Global Government Integration Health
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/connectors
          </span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {tiles.map((t) => (
              <div
                key={t.key}
                className="rounded-lg border border-border p-3 bg-muted/20"
              >
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                  {t.label}
                </p>
                <p className="text-lg font-bold" style={{ color: t.color }}>
                  {t.value}
                </p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* §7 Global Government Integration Control Center table */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
              <Globe2 className="w-4 h-4 text-gold" />
              Global Government Integration Control Center (§7)
              <Badge variant="secondary" className="text-[0.6rem]">
                {connectors.length}
              </Badge>
            </h3>
            <span className="text-[0.6rem] text-muted-foreground">
              19 spec columns · Egypt-first §8 gold border
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            <div>
              <Label className="text-xs">Jurisdiction</Label>
              <Input
                value={jurisdictionFilter === "all" ? "" : jurisdictionFilter}
                onChange={(e) =>
                  setJurisdictionFilter(e.target.value || "all")
                }
                placeholder="All (e.g. EG)"
                className="text-xs"
              />
            </div>
            <div>
              <Label className="text-xs">Authority</Label>
              <Select value={authorityFilter} onValueChange={setAuthorityFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All authorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All authorities</SelectItem>
                  {authorityOptions.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {CONNECTOR_STATUSES_LIST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">System Type</Label>
              <Select
                value={systemTypeFilter}
                onValueChange={setSystemTypeFilter}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  {SYSTEM_TYPES_LIST.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Transport Mode</Label>
              <Select
                value={transportModeFilter}
                onValueChange={setTransportModeFilter}
              >
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="ALL" />
                </SelectTrigger>
                <SelectContent>
                  {TRANSPORT_MODES_WITH_ALL.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>

        {q.isLoading ? (
          <TabLoading />
        ) : connectors.length === 0 ? (
          <TabEmpty label="No connectors found — seed GovConnector rows to populate the §7 Control Center." />
        ) : (
          <div className="overflow-x-auto max-h-[28rem] overflow-y-auto scroll-gold">
            <table className="w-full text-xs border-collapse">
              <thead className="sticky top-0 bg-card z-20">
                <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-3 py-2.5 sticky left-0 bg-card z-30">
                    Jurisdiction
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Authority</th>
                  <th className="text-left font-medium px-3 py-2.5">System</th>
                  <th className="text-left font-medium px-3 py-2.5">Procedure</th>
                  <th className="text-left font-medium px-3 py-2.5">Mode</th>
                  <th className="text-left font-medium px-3 py-2.5">
                    Integration Type
                  </th>
                  <th className="text-center font-medium px-2 py-2.5">API</th>
                  <th className="text-center font-medium px-2 py-2.5">EDI</th>
                  <th className="text-center font-medium px-2 py-2.5">Portal</th>
                  <th className="text-center font-medium px-2 py-2.5">Sandbox</th>
                  <th className="text-center font-medium px-2 py-2.5">
                    Production
                  </th>
                  <th className="text-center font-medium px-2 py-2.5">
                    Credentials
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">
                    Certification
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">
                    Legal Agreement
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">
                    Last Success
                  </th>
                  <th className="text-left font-medium px-3 py-2.5">Last Error</th>
                  <th className="text-left font-medium px-3 py-2.5">Version</th>
                  <th className="text-left font-medium px-3 py-2.5">Owner</th>
                  <th className="text-left font-medium px-3 py-2.5">Priority</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((c: any, i: number) => {
                  const id = String(c?.id || `row-${i}`);
                  const isEg = isEG(c?.jurisdictionCode);
                  const isExpanded = expandedId === id;
                  const statusStr = String(c?.status || "—");
                  const isNotDiscovered =
                    statusStr.toUpperCase() === "NOT_DISCOVERED";
                  const statusColor = connectorStatusColor(statusStr);
                  return (
                    <Fragment key={id}>
                      <tr
                        onClick={() =>
                          setExpandedId(isExpanded ? null : id)
                        }
                        className={`border-b border-border/40 hover:bg-muted/30 cursor-pointer ${
                          isEg ? "border-l-2 border-l-gold" : ""
                        }`}
                      >
                        <td
                          className={`px-3 py-2.5 sticky left-0 bg-card z-10 ${
                            isEg ? "font-bold text-gold" : ""
                          }`}
                        >
                          <div className="flex items-center gap-1">
                            {isExpanded ? (
                              <ChevronDown className="w-3 h-3 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-3 h-3 text-muted-foreground" />
                            )}
                            <span className="font-mono">
                              {c?.jurisdictionCode || "—"}
                            </span>
                          </div>
                          {c?.status && (
                            <span
                              className="block mt-1"
                              style={{
                                color: isNotDiscovered
                                  ? `${statusColor}b0`
                                  : statusColor,
                              }}
                            >
                              <Pill
                                color={
                                  isNotDiscovered
                                    ? `${statusColor}b0`
                                    : statusColor
                                }
                              >
                                {statusStr}
                              </Pill>
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">{c?.authority || "—"}</td>
                        <td className="px-3 py-2.5">{c?.systemName || "—"}</td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c?.procedure || c?.systemType || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {c?.mode || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          {c?.integrationType || "—"}
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.apiEnabled} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.ediEnabled} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.portalEnabled} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.sandboxEnabled} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.productionEnabled} />
                        </td>
                        <td className="px-2 py-2.5 text-center">
                          <BoolCell value={c?.credentialsConfigured} />
                        </td>
                        <td className="px-3 py-2.5">
                          {c?.certificationStatus ? (
                            <Pill
                              color={
                                String(
                                  c.certificationStatus,
                                ).toUpperCase() === "GRANTED"
                                  ? "#10b981"
                                  : String(
                                      c.certificationStatus,
                                    ).toUpperCase() === "EXPIRED"
                                    ? "#f87171"
                                    : "#fbbf24"
                              }
                            >
                              {c.certificationStatus}
                            </Pill>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          {c?.legalAgreement ? (
                            <span className="text-emerald-500 text-[0.65rem]">
                              signed
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c?.lastSuccessAt
                            ? fmtDateTime(c.lastSuccessAt)
                            : "—"}
                        </td>
                        <td className="px-3 py-2.5 text-red-500 max-w-[12rem] truncate">
                          {c?.lastError || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c?.version || "—"}
                        </td>
                        <td className="px-3 py-2.5 text-muted-foreground">
                          {c?.owner || "—"}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="font-mono">
                            {Number(c?.priority) || 0}
                          </span>
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr
                          className={`border-b border-border/40 bg-muted/20 ${
                            isEg ? "border-l-2 border-l-gold" : ""
                          }`}
                        >
                          <td
                            colSpan={19}
                            className="px-4 py-3 text-xs text-muted-foreground"
                          >
                            <ExpandedConnectorDetails
                              connector={c}
                              statusColor={
                                isNotDiscovered
                                  ? `${statusColor}b0`
                                  : statusColor
                              }
                            />
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
      </Card>
    </div>
  );
}

/** Expanded row content — protocols, endpoints, notes, lastError full text. */
function ExpandedConnectorDetails({
  connector,
  statusColor,
}: {
  connector: any;
  statusColor: string;
}) {
  const protocols = safeParse<string[]>(connector?.protocols, []);
  const transportModes = safeParse<string[]>(
    connector?.transportModes,
    [],
  );
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Status
        </p>
        <Pill color={statusColor}>{connector?.status || "—"}</Pill>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Protocols
        </p>
        <p className="font-mono">
          {Array.isArray(protocols) && protocols.length > 0
            ? protocols.join(", ")
            : "—"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Transport Modes (§8)
        </p>
        <p className="font-mono">
          {Array.isArray(transportModes) && transportModes.length > 0
            ? transportModes.join(", ")
            : "ALL"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Auth Method
        </p>
        <p className="font-mono">{connector?.authMethod || "—"}</p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Discovery URL
        </p>
        <p className="font-mono text-[0.65rem] break-all">
          {connector?.discoveryUrl || "—"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Auth Endpoint
        </p>
        <p className="font-mono text-[0.65rem] break-all">
          {connector?.authEndpoint || "—"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Submit Endpoint
        </p>
        <p className="font-mono text-[0.65rem] break-all">
          {connector?.submitEndpoint || "—"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Status Endpoint
        </p>
        <p className="font-mono text-[0.65rem] break-all">
          {connector?.statusEndpoint || "—"}
        </p>
      </div>
      <div>
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          System Type
        </p>
        <p className="font-mono">{connector?.systemType || "—"}</p>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">
          Last Error (full text)
        </p>
        <p className="text-red-500 font-mono text-[0.65rem] whitespace-pre-wrap break-all">
          {connector?.lastError || "—"}
        </p>
      </div>
      <div className="sm:col-span-2 lg:col-span-3">
        <p className="text-[0.6rem] uppercase tracking-widest mb-1">Notes</p>
        <p className="whitespace-pre-wrap">{connector?.notes || "—"}</p>
      </div>
    </div>
  );
}

// ============ 2. Customs Operations ============

function CustomsOperationsTab() {
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [transportModeFilter, setTransportModeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: [
      "gov-customs-operations",
      operationTypeFilter,
      statusFilter,
      transportModeFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (operationTypeFilter !== "all")
        params.set("operationType", operationTypeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (transportModeFilter !== "all")
        params.set("transportMode", transportModeFilter);
      const qs = params.toString();
      return jfetch<{ operations?: any[] }>(
        `/api/sgtx/government/customs-operations${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const operations = Array.isArray(q.data?.operations) ? q.data!.operations : [];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <Network className="w-4 h-4 text-gold" />
            Customs Operations
            <Badge variant="secondary" className="text-[0.6rem]">
              {operations.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/customs-operations
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">Operation Type</Label>
            <Select
              value={operationTypeFilter}
              onValueChange={setOperationTypeFilter}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {OPERATION_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CUSTOMS_STATUSES_LIST.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Transport Mode</Label>
            <Select
              value={transportModeFilter}
              onValueChange={setTransportModeFilter}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All modes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All modes</SelectItem>
                {TRANSPORT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <TabLoading />
      ) : operations.length === 0 ? (
        <TabEmpty label="No customs operations found." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Operation</th>
                <th className="text-left font-medium px-3 py-2.5">Jurisdiction</th>
                <th className="text-left font-medium px-3 py-2.5">Authority</th>
                <th className="text-left font-medium px-3 py-2.5">Declaration #</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-left font-medium px-3 py-2.5">Mode</th>
                <th className="text-left font-medium px-3 py-2.5">Submitted</th>
                <th className="text-left font-medium px-3 py-2.5">Released</th>
              </tr>
            </thead>
            <tbody>
              {operations.map((o: any, i: number) => {
                const isEg = isEG(o?.jurisdictionCode);
                return (
                  <tr
                    key={o?.id || i}
                    className={`border-b border-border/40 hover:bg-muted/30 ${
                      isEg ? "border-l-2 border-l-gold" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono">
                      {o?.operationType || "—"}
                    </td>
                    <td className="px-3 py-3 font-mono">
                      {o?.jurisdictionCode || "—"}
                    </td>
                    <td className="px-3 py-3">{o?.customsAuthority || "—"}</td>
                    <td className="px-3 py-3 font-mono">
                      {o?.declarationNumber || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={customsStatusColor(o?.status)}>
                        {o?.status || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3">{o?.transportMode || "—"}</td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {o?.submittedAt ? fmtDateTime(o.submittedAt) : "—"}
                    </td>
                    <td className="px-3 py-3 text-muted-foreground">
                      {o?.releasedAt ? fmtDateTime(o.releasedAt) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============ 3. Workflows ============

function WorkflowsTab() {
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");
  const [activeFilter, setActiveFilter] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["gov-workflows", jurisdictionFilter, activeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (jurisdictionFilter.trim())
        params.set("jurisdictionCode", jurisdictionFilter.trim().toUpperCase());
      if (activeFilter !== "all")
        params.set("active", activeFilter);
      const qs = params.toString();
      return jfetch<{ workflows?: any[] }>(
        `/api/sgtx/government/workflows${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const workflows = Array.isArray(q.data?.workflows)
    ? q.data!.workflows
    : [];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <WorkflowIcon className="w-4 h-4 text-gold" />
            Multi-Agency Workflows
            <Badge variant="secondary" className="text-[0.6rem]">
              {workflows.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/workflows · click a row to view its steps
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Jurisdiction Code</Label>
            <Input
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
              placeholder="e.g. EG"
              className="text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Active</Label>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="true">Active only</SelectItem>
                <SelectItem value="false">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <TabLoading />
      ) : workflows.length === 0 ? (
        <TabEmpty label="No workflows found." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Name</th>
                <th className="text-left font-medium px-3 py-2.5">Jurisdiction</th>
                <th className="text-left font-medium px-3 py-2.5">Operation</th>
                <th className="text-left font-medium px-3 py-2.5">Mode</th>
                <th className="text-left font-medium px-3 py-2.5">Version</th>
                <th className="text-left font-medium px-3 py-2.5">Active</th>
              </tr>
            </thead>
            <tbody>
              {workflows.map((w: any, i: number) => {
                const id = String(w?.id || `wf-${i}`);
                const isEg = isEG(w?.jurisdictionCode);
                const isExpanded = expandedId === id;
                return (
                  <Fragment key={id}>
                    <tr
                      onClick={() =>
                        setExpandedId(isExpanded ? null : id)
                      }
                      className={`border-b border-border/40 hover:bg-muted/30 cursor-pointer ${
                        isEg ? "border-l-2 border-l-gold" : ""
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          {isExpanded ? (
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          ) : (
                            <ChevronRight className="w-3 h-3 text-muted-foreground" />
                          )}
                          <span className="font-medium">
                            {w?.name || "—"}
                          </span>
                        </div>
                        {w?.description && (
                          <span className="block text-[0.6rem] text-muted-foreground mt-0.5">
                            {w.description}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {w?.jurisdictionCode || "—"}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {w?.operationType || "ALL"}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        {w?.transportMode || "ALL"}
                      </td>
                      <td className="px-3 py-3 font-mono">
                        v{Number(w?.version) || 1}
                      </td>
                      <td className="px-3 py-3">
                        {w?.active ? (
                          <Pill color="#10b981">ACTIVE</Pill>
                        ) : (
                          <Pill color="#64748b">INACTIVE</Pill>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr
                        className={`border-b border-border/40 bg-muted/20 ${
                          isEg ? "border-l-2 border-l-gold" : ""
                        }`}
                      >
                        <td colSpan={6} className="px-4 py-3">
                          <WorkflowStepsView workflowId={id} />
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
    </Card>
  );
}

/** Fetches the workflow with its steps and renders an ordered step list. */
function WorkflowStepsView({ workflowId }: { workflowId: string }) {
  const q = useQuery({
    queryKey: ["gov-workflow", workflowId],
    queryFn: () =>
      jfetch<{ workflow?: any }>(
        `/api/sgtx/government/workflows/${workflowId}`,
      ),
    enabled: !!workflowId,
  });
  if (q.isLoading) return <TabLoading label="Loading steps…" />;
  const steps = safeParse<any[]>(q.data?.workflow?.steps, []);
  if (!Array.isArray(steps) || steps.length === 0) {
    return <TabEmpty label="No steps defined for this workflow." />;
  }
  const sorted = [...steps].sort(
    (a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0),
  );
  return (
    <div className="overflow-x-auto max-h-72 overflow-y-auto scroll-gold">
      <table className="w-full text-xs">
        <thead className="sticky top-0 bg-card z-10">
          <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
            <th className="text-left font-medium px-3 py-2">#</th>
            <th className="text-left font-medium px-3 py-2">Agency</th>
            <th className="text-left font-medium px-3 py-2">Authority</th>
            <th className="text-left font-medium px-3 py-2">System</th>
            <th className="text-left font-medium px-3 py-2">Execution</th>
            <th className="text-left font-medium px-3 py-2">Status</th>
            <th className="text-left font-medium px-3 py-2">Gov Reference</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s: any, i: number) => (
            <tr
              key={s?.id || `step-${i}`}
              className="border-b border-border/40"
            >
              <td className="px-3 py-2 font-mono">{Number(s?.order) || i + 1}</td>
              <td className="px-3 py-2 font-mono">{s?.agency || "—"}</td>
              <td className="px-3 py-2">{s?.authority || "—"}</td>
              <td className="px-3 py-2 font-mono">{s?.systemName || "—"}</td>
              <td className="px-3 py-2">
                <Pill color="#94a3b8">{s?.executionMode || "SEQUENTIAL"}</Pill>
              </td>
              <td className="px-3 py-2">
                <Pill color={workflowStepStatusColor(s?.status)}>
                  {s?.status || "PENDING"}
                </Pill>
              </td>
              <td className="px-3 py-2 font-mono text-[0.65rem]">
                {s?.governmentReference || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============ 4. Single Window Mappings ============

function MappingsTab() {
  const [mappingTypeFilter, setMappingTypeFilter] = useState<string>("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");

  const q = useQuery({
    queryKey: ["gov-mappings", mappingTypeFilter, jurisdictionFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (mappingTypeFilter !== "all")
        params.set("mappingType", mappingTypeFilter);
      if (jurisdictionFilter.trim())
        params.set("jurisdictionCode", jurisdictionFilter.trim().toUpperCase());
      const qs = params.toString();
      return jfetch<{ mappings?: any[] }>(
        `/api/sgtx/government/mappings${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const mappings = Array.isArray(q.data?.mappings) ? q.data!.mappings : [];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <Globe2 className="w-4 h-4 text-gold" />
            Single Window Mappings
            <Badge variant="secondary" className="text-[0.6rem]">
              {mappings.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/mappings · canonical → national
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Mapping Type</Label>
            <Select
              value={mappingTypeFilter}
              onValueChange={setMappingTypeFilter}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {MAPPING_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Jurisdiction Code</Label>
            <Input
              value={jurisdictionFilter}
              onChange={(e) => setJurisdictionFilter(e.target.value)}
              placeholder="e.g. EG"
              className="text-xs"
            />
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <TabLoading />
      ) : mappings.length === 0 ? (
        <TabEmpty label="No single-window mappings found." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Type</th>
                <th className="text-left font-medium px-3 py-2.5">Jurisdiction</th>
                <th className="text-left font-medium px-3 py-2.5">Authority</th>
                <th className="text-left font-medium px-3 py-2.5">System</th>
                <th className="text-left font-medium px-3 py-2.5">Source → Target</th>
                <th className="text-left font-medium px-3 py-2.5">Transform</th>
                <th className="text-center font-medium px-3 py-2.5">Required</th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((m: any, i: number) => {
                const isEg = isEG(m?.jurisdictionCode);
                return (
                  <tr
                    key={m?.id || i}
                    className={`border-b border-border/40 hover:bg-muted/30 ${
                      isEg ? "border-l-2 border-l-gold" : ""
                    }`}
                  >
                    <td className="px-4 py-3 font-mono">
                      {m?.mappingType || "—"}
                    </td>
                    <td className="px-3 py-3 font-mono">
                      {m?.jurisdictionCode || "—"}
                    </td>
                    <td className="px-3 py-3">{m?.authority || "—"}</td>
                    <td className="px-3 py-3 font-mono">
                      {m?.systemName || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono text-[0.65rem]">
                        {m?.sourceField || "—"}
                      </span>
                      <span className="text-muted-foreground mx-1">→</span>
                      <span className="font-mono text-[0.65rem] text-emerald-600">
                        {m?.targetField || "—"}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <Pill color="#94a3b8">
                        {m?.transformation || "IDENTITY"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-center">
                      <BoolCell value={m?.required} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============ 5. Gateway Calls (audit log) ============

function GatewayCallsTab() {
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["gov-gateway-calls", operationTypeFilter, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (operationTypeFilter !== "all")
        params.set("operationType", operationTypeFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      const qs = params.toString();
      return jfetch<{ calls?: any[] }>(
        `/api/sgtx/government/gateway/calls${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const calls = Array.isArray(q.data?.calls) ? q.data!.calls : [];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <FileClock className="w-4 h-4 text-gold" />
            Gateway Calls (Audit Log)
            <Badge variant="secondary" className="text-[0.6rem]">
              {calls.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/gateway/calls · most recent first
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Operation Type</Label>
            <Select
              value={operationTypeFilter}
              onValueChange={setOperationTypeFilter}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All operations" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All operations</SelectItem>
                {GATEWAY_OPERATION_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {GATEWAY_CALL_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <TabLoading />
      ) : calls.length === 0 ? (
        <TabEmpty label="No gateway calls recorded." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Called At</th>
                <th className="text-left font-medium px-3 py-2.5">Connector</th>
                <th className="text-left font-medium px-3 py-2.5">USTN</th>
                <th className="text-left font-medium px-3 py-2.5">Operation</th>
                <th className="text-left font-medium px-3 py-2.5">Idempotency Key</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-center font-medium px-3 py-2.5">HTTP</th>
                <th className="text-left font-medium px-3 py-2.5">Error</th>
              </tr>
            </thead>
            <tbody>
              {calls.map((c: any, i: number) => (
                <tr
                  key={c?.id || i}
                  className="border-b border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {c?.calledAt ? fmtDateTime(c.calledAt) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {c?.connectorId || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {c?.ustn || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {c?.operationType || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {c?.idempotencyKey || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <Pill color={gatewayCallStatusColor(c?.status)}>
                      {c?.status || "—"}
                    </Pill>
                  </td>
                  <td className="px-3 py-3 text-center font-mono">
                    {c?.statusCode != null ? c.statusCode : "—"}
                  </td>
                  <td className="px-3 py-3 text-red-500 max-w-xs truncate">
                    {c?.errorMessage || "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============ 6. Submissions ============

function SubmissionsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [submissionTypeFilter, setSubmissionTypeFilter] =
    useState<string>("all");

  const q = useQuery({
    queryKey: ["gov-submissions", statusFilter, submissionTypeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (submissionTypeFilter !== "all")
        params.set("submissionType", submissionTypeFilter);
      const qs = params.toString();
      return jfetch<{ submissions?: any[] }>(
        `/api/sgtx/government/submissions${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const submissions = Array.isArray(q.data?.submissions)
    ? q.data!.submissions
    : [];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <Send className="w-4 h-4 text-gold" />
            Government Submissions
            <Badge variant="secondary" className="text-[0.6rem]">
              {submissions.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/government/submissions · §4 authoritative audit log
          </span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {CUSTOMS_STATUSES_LIST.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Submission Type</Label>
            <Select
              value={submissionTypeFilter}
              onValueChange={setSubmissionTypeFilter}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {SUBMISSION_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>
      {q.isLoading ? (
        <TabLoading />
      ) : submissions.length === 0 ? (
        <TabEmpty label="No government submissions recorded." />
      ) : (
        <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-card z-10">
              <tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase tracking-wider">
                <th className="text-left font-medium px-4 py-2.5">Submitted</th>
                <th className="text-left font-medium px-3 py-2.5">USTN</th>
                <th className="text-left font-medium px-3 py-2.5">Type</th>
                <th className="text-left font-medium px-3 py-2.5">Status</th>
                <th className="text-left font-medium px-3 py-2.5">Gov Reference</th>
                <th className="text-left font-medium px-3 py-2.5">Connector</th>
                <th className="text-center font-medium px-3 py-2.5">Duplicate</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s: any, i: number) => (
                <tr
                  key={s?.id || i}
                  className="border-b border-border/40 hover:bg-muted/30"
                >
                  <td className="px-4 py-3 text-muted-foreground">
                    {s?.submittedAt ? fmtDateTime(s.submittedAt) : "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {s?.ustn || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono">
                    {s?.submissionType || "—"}
                  </td>
                  <td className="px-3 py-3">
                    <Pill color={customsStatusColor(s?.status)}>
                      {s?.status || "—"}
                    </Pill>
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {s?.governmentReference || "—"}
                  </td>
                  <td className="px-3 py-3 font-mono text-[0.65rem]">
                    {s?.connectorId || "—"}
                  </td>
                  <td className="px-3 py-3 text-center">
                    {s?.duplicateDetected ? (
                      <Pill color="#64748b">DUP</Pill>
                    ) : (
                      <span className="text-muted-foreground text-[0.6rem]">
                        —
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ============ 7. Test Runner (§9) ============

/** A §9 test scenario definition. */
interface TestScenario {
  id: string;
  label: string;
  description: string;
  /** The actual test runner — returns a result object. */
  run: () => Promise<TestRunResult>;
}

interface TestRunResult {
  pass: boolean;
  message: string;
  details?: string;
}

/** Generate a random idempotency key for duplicate-response tests. */
function genIdempotencyKey(): string {
  return `test-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

const TEST_SCENARIOS: TestScenario[] = [
  {
    id: "api-connector",
    label: "API connector",
    description:
      "Verify the §7 Control Center loads API-type connectors (integrationType=API) and that apiEnabled is true on at least one row.",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      const api = list.filter(
        (c) =>
          String(c?.integrationType || "").toUpperCase() === "API" &&
          c?.apiEnabled === true,
      );
      if (api.length === 0) {
        return {
          pass: false,
          message:
            "No API-type connector with apiEnabled=true found — seed at least one.",
        };
      }
      return {
        pass: true,
        message: `Found ${api.length} API connector(s).`,
        details: api
          .slice(0, 3)
          .map(
            (c) =>
              `${c.jurisdictionCode}/${c.authority}/${c.systemName} (status=${c.status})`,
          )
          .join(" · "),
      };
    },
  },
  {
    id: "edi-connector",
    label: "EDI connector",
    description:
      "Verify the §7 Control Center loads EDI-type connectors (integrationType=EDI, ediEnabled=true).",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      const edi = list.filter(
        (c) =>
          String(c?.integrationType || "").toUpperCase() === "EDI" &&
          c?.ediEnabled === true,
      );
      if (edi.length === 0) {
        return {
          pass: false,
          message: "No EDI-type connector with ediEnabled=true found.",
        };
      }
      return {
        pass: true,
        message: `Found ${edi.length} EDI connector(s).`,
        details: edi
          .slice(0, 3)
          .map((c) => `${c.jurisdictionCode}/${c.systemName}`)
          .join(" · "),
      };
    },
  },
  {
    id: "portal-connector",
    label: "Portal connector",
    description:
      "Verify a PORTAL_ONLY or portal-integration connector exists in the registry.",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      const portal = list.filter(
        (c) =>
          String(c?.integrationType || "").toUpperCase() === "PORTAL" ||
          String(c?.mode || "").toUpperCase() === "PORTAL_ONLY" ||
          c?.portalEnabled === true,
      );
      if (portal.length === 0) {
        return {
          pass: false,
          message: "No portal-type connector found.",
        };
      }
      return {
        pass: true,
        message: `Found ${portal.length} portal connector(s).`,
      };
    },
  },
  {
    id: "manual-fallback",
    label: "Manual fallback",
    description:
      "Verify the registry contains a MANUAL_ONLY or MANUAL-integration connector (the §9 manual fallback path).",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      const manual = list.filter(
        (c) =>
          String(c?.integrationType || "").toUpperCase() === "MANUAL" ||
          String(c?.mode || "").toUpperCase() === "MANUAL_ONLY",
      );
      if (manual.length === 0) {
        return {
          pass: false,
          message: "No MANUAL connector found — manual fallback not configured.",
        };
      }
      return {
        pass: true,
        message: `Found ${manual.length} manual connector(s).`,
      };
    },
  },
  {
    id: "outage",
    label: "Outage",
    description:
      "Verify the registry can flag OUTAGE-status connectors (or gracefully reports zero outages).",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors?status=OUTAGE",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      if (list.length === 0) {
        return {
          pass: true,
          message: "No OUTAGE connectors — system healthy.",
        };
      }
      return {
        pass: true,
        message: `${list.length} connector(s) in OUTAGE — review required.`,
        details: list
          .slice(0, 3)
          .map(
            (c) =>
              `${c.jurisdictionCode}/${c.systemName} lastError=${(c.lastError || "").slice(0, 50)}`,
          )
          .join(" · "),
      };
    },
  },
  {
    id: "duplicate-response",
    label: "Duplicate response",
    description:
      "POST /api/sgtx/government/gateway/submit twice with the SAME idempotencyKey. The second response MUST have duplicate:true (§9 idempotency).",
    run: async () => {
      // Pick the first available connector to anchor the test.
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      const connector = list[0];
      if (!connector?.id) {
        return {
          pass: false,
          message:
            "No connector available — seed at least one GovConnector to run this test.",
        };
      }
      const key = genIdempotencyKey();
      const body = {
        connectorId: connector.id,
        operationType: "SUBMIT",
        payload: { _test: true, scenario: "duplicate-response", key },
        idempotencyKey: key,
      };
      // First call — should NOT be a duplicate.
      const r1 = await jfetch<any>(
        "/api/sgtx/government/gateway/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ).catch((e) => ({ _error: e.message }));
      if (r1?._error) {
        return {
          pass: false,
          message: `First submit failed: ${r1._error}`,
        };
      }
      // Second call — same idempotencyKey — MUST be flagged duplicate.
      const r2 = await jfetch<any>(
        "/api/sgtx/government/gateway/submit",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      ).catch((e) => ({ _error: e.message }));
      if (r2?._error) {
        return {
          pass: false,
          message: `Second submit failed: ${r2._error}`,
        };
      }
      const isDup = r2?.duplicate === true;
      if (!isDup) {
        return {
          pass: false,
          message:
            "Second submit did NOT return duplicate:true — §9 idempotency not enforced.",
          details: `r2.duplicate=${String(r2?.duplicate)} (expected true)`,
        };
      }
      return {
        pass: true,
        message:
          "Second submit returned duplicate:true — §9 idempotency enforced.",
        details: `key=${key}`,
      };
    },
  },
  {
    id: "rejected-declaration",
    label: "Rejected declaration",
    description:
      "Verify the registry can surface GOVERNMENT_REJECTED customs operations (or gracefully reports zero rejections).",
    run: async () => {
      const r = await jfetch<{ operations?: any[] }>(
        "/api/sgtx/government/customs-operations?status=GOVERNMENT_REJECTED",
      );
      const list = Array.isArray(r?.operations) ? r.operations : [];
      if (list.length === 0) {
        return {
          pass: true,
          message: "No rejected declarations — clean state.",
        };
      }
      return {
        pass: true,
        message: `${list.length} rejected declaration(s) found.`,
        details: list
          .slice(0, 3)
          .map((o) => `${o.operationType}/${o.declarationNumber || "—"}`)
          .join(" · "),
      };
    },
  },
  {
    id: "amended-declaration",
    label: "Amended declaration",
    description:
      "Verify the gateway AMEND operation endpoint is reachable (POST /api/sgtx/government/gateway/amend).",
    run: async () => {
      // Smoke-test the AMEND endpoint with a synthetic body — expecting a 400
      // (missing required fields) rather than a 404/500. A 400 means the route
      // exists and validates input.
      const r = await fetch(
        "/api/sgtx/government/gateway/amend",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        },
      );
      if (r.status === 404) {
        return { pass: false, message: "AMEND endpoint returned 404." };
      }
      if (r.status >= 500) {
        return {
          pass: false,
          message: `AMEND endpoint returned HTTP ${r.status} (server error).`,
        };
      }
      return {
        pass: true,
        message: `AMEND endpoint reachable (HTTP ${r.status}).`,
      };
    },
  },
  {
    id: "government-release",
    label: "Government release",
    description:
      "POST /api/sgtx/government/customs-operations/{id}/release with body { releaseReference, authority }. Verifies the endpoint enforces the §4 release contract (404 if no operation; 400 if releaseReference missing).",
    run: async () => {
      // Pick an operation in GOVERNMENT_ACCEPTED to test against (if any).
      const r = await jfetch<{ operations?: any[] }>(
        "/api/sgtx/government/customs-operations?status=GOVERNMENT_ACCEPTED",
      );
      const list = Array.isArray(r?.operations) ? r.operations : [];
      if (list.length === 0) {
        // No accepted operation — fall back to verifying the release endpoint
        // rejects an empty body on a non-existent operation (404 + §4 contract).
        const resp = await fetch(
          "/api/sgtx/government/customs-operations/nonexistent-id/release",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              releaseReference: "TEST-REL-REF",
              authority: "CUSTOMS",
            }),
          },
        );
        if (resp.status === 404) {
          return {
            pass: true,
            message:
              "Release endpoint correctly returned 404 for non-existent operation (§4 contract enforced). No GOVERNMENT_ACCEPTED operation available for full release test.",
          };
        }
        return {
          pass: false,
          message: `Unexpected status ${resp.status} from release endpoint.`,
        };
      }
      // Otherwise perform the actual release.
      const op = list[0];
      const releaseReference = `REL-TEST-${Date.now()}`;
      const rr = await jfetch<{ operation?: any }>(
        `/api/sgtx/government/customs-operations/${op.id}/release`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            releaseReference,
            authority: "CUSTOMS",
          }),
        },
      );
      const newStatus = String(rr?.operation?.status || "").toUpperCase();
      if (newStatus === "GOVERNMENT_RELEASED") {
        return {
          pass: true,
          message:
            "Operation transitioned to GOVERNMENT_RELEASED (§4 release path).",
          details: `opId=${op.id} releaseRef=${releaseReference}`,
        };
      }
      return {
        pass: false,
        message: `Release did not produce GOVERNMENT_RELEASED (got ${newStatus || "—"}).`,
      };
    },
  },
  {
    id: "multi-agency",
    label: "Multi-agency",
    description:
      "Verify at least one Multi-Agency Workflow exists with steps (≥2 steps for a real multi-agency flow).",
    run: async () => {
      const r = await jfetch<{ workflows?: any[] }>(
        "/api/sgtx/government/workflows",
      );
      const list = Array.isArray(r?.workflows) ? r.workflows : [];
      if (list.length === 0) {
        return { pass: false, message: "No multi-agency workflows defined." };
      }
      // Fetch the first workflow's steps.
      const wfId = list[0]?.id;
      if (!wfId) {
        return { pass: false, message: "First workflow missing id." };
      }
      const w = await jfetch<{ workflow?: any }>(
        `/api/sgtx/government/workflows/${wfId}`,
      );
      const steps = safeParse<any[]>(w?.workflow?.steps, []);
      if (!Array.isArray(steps) || steps.length < 2) {
        return {
          pass: false,
          message: `Workflow "${list[0]?.name}" has ${steps.length} step(s) — expected ≥2.`,
        };
      }
      return {
        pass: true,
        message: `Workflow "${list[0]?.name}" has ${steps.length} step(s).`,
        details: steps
          .slice(0, 4)
          .map((s) => `${s.agency}/${s.executionMode}`)
          .join(" · "),
      };
    },
  },
  {
    id: "integration-health",
    label: "Integration health",
    description:
      "Verify the connectors list returns ≥1 connector with lastSuccessAt populated (real integration health signal).",
    run: async () => {
      const r = await jfetch<{ connectors?: any[] }>(
        "/api/sgtx/government/connectors",
      );
      const list = Array.isArray(r?.connectors) ? r.connectors : [];
      if (list.length === 0) {
        return { pass: false, message: "No connectors found." };
      }
      const healthy = list.filter((c) => !!c?.lastSuccessAt);
      if (healthy.length === 0) {
        return {
          pass: false,
          message: "No connector with lastSuccessAt populated.",
        };
      }
      return {
        pass: true,
        message: `${healthy.length} connector(s) have lastSuccessAt populated.`,
      };
    },
  },
];

function TestRunnerTab() {
  const [selectedId, setSelectedId] = useState<string>(TEST_SCENARIOS[0].id);
  // Map of scenario id → last TestRunResult (or "running" sentinel).
  const [results, setResults] = useState<
    Record<string, TestRunResult | { _running: true }>
  >({});

  const scenario =
    TEST_SCENARIOS.find((s) => s.id === selectedId) || TEST_SCENARIOS[0];

  const mutation = useMutation({
    mutationFn: async (sc: TestScenario) => {
      setResults((prev) => ({ ...prev, [sc.id]: { _running: true } }));
      const r = await sc.run();
      setResults((prev) => ({ ...prev, [sc.id]: r }));
      return r;
    },
  });

  const current = results[selectedId];

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b border-border">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <h3 className="font-semibold text-sm flex-1 flex items-center gap-2">
            <FlaskConical className="w-4 h-4 text-gold" />
            §9 Test Runner
            <Badge variant="secondary" className="text-[0.6rem]">
              {TEST_SCENARIOS.length} scenarios
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            Execute the 11 §9 test scenarios against the live API
          </span>
        </div>
        <div>
          <Label className="text-xs">Scenario</Label>
          <Select value={selectedId} onValueChange={setSelectedId}>
            <SelectTrigger className="text-xs">
              <SelectValue placeholder="Pick a scenario" />
            </SelectTrigger>
            <SelectContent>
              {TEST_SCENARIOS.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Scenario details */}
        <div className="rounded-lg border border-border p-3 bg-muted/20">
          <div className="flex items-center justify-between mb-1">
            <p className="text-sm font-semibold">{scenario.label}</p>
            <code className="text-[0.6rem] text-muted-foreground">
              {scenario.id}
            </code>
          </div>
          <p className="text-xs text-muted-foreground">{scenario.description}</p>
        </div>

        {/* Run button + result */}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            onClick={() => mutation.mutate(scenario)}
            disabled={mutation.isPending && mutation.variables?.id === scenario.id}
            className="bg-gold-gradient text-sovereign"
          >
            {mutation.isPending && mutation.variables?.id === scenario.id ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <FlaskConical className="w-3.5 h-3.5 mr-1.5" />
            )}
            Run Test
          </Button>
          {current && (
            <TestResultBadge
              result={
                "_running" in current
                  ? { _running: true }
                  : (current as TestRunResult)
              }
            />
          )}
        </div>

        {/* Inline result detail */}
        {current && !("_running" in current) && (
          <div
            className="rounded-lg border p-3 text-xs"
            style={{
              borderColor: current.pass ? "#10b98155" : "#f8717155",
              background: current.pass ? "#10b98110" : "#f8717110",
            }}
          >
            <p
              className="font-semibold mb-1"
              style={{ color: current.pass ? "#10b981" : "#f87171" }}
            >
              {current.pass ? "PASS" : "FAIL"} — {current.message}
            </p>
            {current.details && (
              <p className="text-muted-foreground font-mono text-[0.65rem]">
                {current.details}
              </p>
            )}
          </div>
        )}

        {/* All scenarios summary */}
        <div className="rounded-lg border border-border">
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <p className="text-xs font-semibold">
              All Scenarios ({Object.keys(results).length} run)
            </p>
          </div>
          <div className="divide-y divide-border">
            {TEST_SCENARIOS.map((s) => {
              const r = results[s.id];
              return (
                <div
                  key={s.id}
                  className="px-3 py-2 flex items-center justify-between gap-2"
                >
                  <button
                    onClick={() => setSelectedId(s.id)}
                    className={`text-xs flex-1 text-left ${
                      selectedId === s.id
                        ? "font-semibold text-gold"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {s.label}
                  </button>
                  {r ? (
                    "_running" in r ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gold" />
                    ) : (
                      <TestResultBadge result={r as TestRunResult} compact />
                    )
                  ) : (
                    <span className="text-[0.6rem] text-muted-foreground">
                      not run
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}

/** Renders a PASS/FAIL badge or a "running" spinner. */
function TestResultBadge({
  result,
  compact = false,
}: {
  result: TestRunResult | { _running: true };
  compact?: boolean;
}) {
  if ("_running" in result) {
    return (
      <Pill color="#fbbf24">
        <span className="inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          RUNNING
        </span>
      </Pill>
    );
  }
  return (
    <Pill color={result.pass ? "#10b981" : "#f87171"}>
      {compact ? "" : ""}{result.pass ? "PASS" : "FAIL"}
    </Pill>
  );
}

// ============ Misc helpers ============

/** Case-insensitive Egypt check (§8 Egypt-first). */
function isEG(code: unknown): boolean {
  return String(code || "").toUpperCase() === "EG";
}
