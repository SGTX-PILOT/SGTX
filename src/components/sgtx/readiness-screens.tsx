"use client";

// SGTX Phase 10 — Production Readiness Center (admin portal §1–§13)
// ---------------------------------------------------------------------------
// Single-file React component exposing 7 sub-tabs:
//   1. Readiness Report (§11-§12 — default)     5. Government Connectivity (§4)
//   2. E2E Trade Graph (§1 — 23 steps)           6. Security Audit (§8 — 11 checks)
//   3. Multimodal Tests (§2 — 10 modes)          7. Test Runner (§14 — Run All Tests)
//   4. Country Readiness (§3 — jurisdictions, EG highlighted)
//
// COLOR PALETTE — gold / emerald / amber / red / slate only. NO indigo, NO blue.
//   • PRODUCTION_CONNECTED / PASSED / COMPLETED / READY  = emerald (#10b981)
//   • SANDBOX_CONNECTED / PARTIAL / IN_PROGRESS          = amber (#f59e0b)
//   • INTEGRATION_REQUIRED / FAILED / CRITICAL            = red (#f87171)
//   • MANUAL_ONLY / PORTAL_ONLY / SUPERSEDED              = slate (#94a3b8)
//   • CORE_READY / ADAPTER_READY / COUNTRY_CONFIGURED     = gold (#d4a017)
//
// Defensive parsing: every cell uses safeParse(...) with Array.isArray guards
// so malformed JSON columns never crash the UI. Tables wrap in overflow-x-auto
// + max-h-96 overflow-y-auto per the design system.

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { fmtDateTime } from "@/lib/sgtx/format";
import {
  Loader2,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  PlayCircle,
  Globe2,
  Activity,
  Gauge,
  Boxes,
  Lock,
  Network,
  FileText,
  RefreshCw,
  Sparkles,
} from "lucide-react";

// ============ Constants (mirror lib constants — kept inline for self-containment) ============

const E2E_STEPS = [
  "Trade",
  "Order",
  "Contract",
  "Regulatory",
  "Documents",
  "Licenses",
  "Permits",
  "Certificates",
  "Booking",
  "ExportCustoms",
  "Transport",
  "Transit",
  "ImportCustoms",
  "Tax",
  "Release",
  "Delivery",
  "Acceptance",
  "Settlement",
  "Accounting",
  "Claims",
  "PostClearance",
  "Evidence",
  "UstnClosed",
] as const;

const READINESS_TERMINOLOGY = [
  "CORE_READY",
  "ADAPTER_READY",
  "COUNTRY_CONFIGURED",
  "SANDBOX_CONNECTED",
  "PRODUCTION_CONNECTED",
  "MANUAL_ONLY",
  "PORTAL_ONLY",
  "INTEGRATION_REQUIRED",
] as const;

const VALIDATION_STATUSES = ["PASSED", "FAILED", "PARTIAL"] as const;

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

function truncate(s: string | null | undefined, n: number): string {
  const v = String(s || "");
  if (v.length <= n) return v;
  return v.slice(0, n) + "…";
}

// ============ Color helpers (restricted palette — NO indigo, NO blue) ============

function readinessColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "PRODUCTION_CONNECTED" || v === "PASSED" || v === "READY") return "#10b981";
  if (v === "SANDBOX_CONNECTED" || v === "PARTIAL" || v === "IN_PROGRESS") return "#f59e0b";
  if (v === "INTEGRATION_REQUIRED" || v === "FAILED" || v === "CRITICAL") return "#f87171";
  if (v === "MANUAL_ONLY" || v === "PORTAL_ONLY" || v === "SUPERSEDED") return "#94a3b8";
  if (v === "CORE_READY" || v === "ADAPTER_READY" || v === "COUNTRY_CONFIGURED") return "#d4a017";
  return "#94a3b8";
}

function validationStatusColor(s: string | null | undefined): string {
  const v = String(s || "").toUpperCase();
  if (v === "PASSED") return "#10b981";
  if (v === "PARTIAL") return "#f59e0b";
  if (v === "FAILED") return "#f87171";
  return "#94a3b8";
}

function scoreColor(score: number): string {
  if (score >= 90) return "#10b981";
  if (score >= 70) return "#d4a017";
  if (score >= 50) return "#f59e0b";
  return "#f87171";
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
      className={`text-left font-semibold uppercase tracking-widest text-muted-foreground sticky top-0 bg-card z-10 ${
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
  colSpan,
}: {
  children?: React.ReactNode;
  className?: string;
  small?: boolean;
  style?: React.CSSProperties;
  colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
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

function PillsList({ items, max = 12 }: { items: any[]; max?: number }) {
  const list = items.slice(0, max);
  if (list.length === 0) {
    return <span className="text-muted-foreground text-[0.65rem]">none</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {list.map((item, i) => (
        <Badge key={i} variant="outline" className="text-[0.55rem] font-mono">
          {typeof item === "string" ? item : JSON.stringify(item)}
        </Badge>
      ))}
      {items.length > max && (
        <span className="text-[0.55rem] text-muted-foreground">+{items.length - max} more</span>
      )}
    </div>
  );
}

// =====================================================================
// 1. READINESS REPORT TAB (§11-§12 — default)
// =====================================================================

function ReadinessReportTab() {
  const queryClient = useQueryClient();
  const [reportId, setReportId] = useState("");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["sgtx-readiness-report-latest"],
    queryFn: () => fetchJson("/api/sgtx/readiness/report/latest"),
    retry: false,
  });

  const report = data?.report;

  const generateMut = useMutation({
    mutationFn: (vars: { generatedBy?: string }) =>
      postJson("/api/sgtx/readiness/report", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgtx-readiness-report-latest"] });
      queryClient.invalidateQueries({ queryKey: ["sgtx-readiness-report-list"] });
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Production Readiness Report"
        subtitle="Phase 10 · §11-§12 — aggregate of all Phase 1-9 verification surfaces. NEVER claims 'WORLDWIDE INTEGRATED' unless every individual connector is operational."
      />

      {/* Top summary tiles */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryTile
          label="Overall Readiness"
          value={String(report?.overallReadiness || "—")}
          accent={readinessColor(report?.overallReadiness)}
          icon={ShieldCheck}
        />
        <SummaryTile
          label="Readiness Score"
          value={`${asNum(report?.readinessScore).toFixed(1)}/100`}
          accent={scoreColor(asNum(report?.readinessScore))}
          icon={Gauge}
        />
        <SummaryTile
          label="Terminology"
          value={String(report?.terminology || "—")}
          accent={report?.terminology === "CORRECT" ? "#10b981" : "#f87171"}
          icon={FileText}
        />
        <SummaryTile
          label="Generated At"
          value={report?.generatedAt ? fmtDateTime(report.generatedAt) : "—"}
          accent="#94a3b8"
          icon={Activity}
        />
      </div>

      {/* Action buttons */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Button
            size="sm"
            onClick={() => generateMut.mutate({})}
            disabled={generateMut.isPending}
            className="h-8"
            style={{ background: "#d4a017", color: "#0a0a0a" }}
          >
            {generateMut.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <Sparkles className="w-3 h-3 mr-1" />
            )}
            Generate Report
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh Latest
          </Button>
          <div className="flex flex-col gap-1">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              Lookup by ID
            </Label>
            <div className="flex gap-2">
              <Input
                value={reportId}
                placeholder="report cuid"
                onChange={(e) => setReportId(e.target.value)}
                className="h-8 w-[280px] text-[0.7rem] font-mono"
              />
              <Button
                size="sm"
                variant="outline"
                className="h-8"
                onClick={() => {
                  if (reportId.trim()) {
                    window.open(`/api/sgtx/readiness/report/${encodeURIComponent(reportId.trim())}`, "_blank");
                  }
                }}
              >
                Open
              </Button>
            </div>
          </div>
          {generateMut.isError && (
            <div className="text-[0.65rem] text-red-400 ml-auto">
              {(generateMut.error as Error).message}
            </div>
          )}
          {generateMut.isSuccess && generateMut.data?.report && (
            <div className="text-[0.65rem] text-emerald-500 ml-auto">
              Generated {generateMut.data.report.reportId || generateMut.data.report.id}
            </div>
          )}
        </div>
      </Card>

      {isLoading ? (
        <LoadingState label="Loading latest readiness report…" />
      ) : error ? (
        <ErrorState message={(error as Error).message} />
      ) : !report ? (
        <EmptyState label="No readiness reports yet — click 'Generate Report' to create one." />
      ) : (
        <ReportSections report={report} />
      )}
    </div>
  );
}

function ReportSections({ report }: { report: any }) {
  const implementedModules = asArray(report?.implementedModules);
  const activeJurisdictions = asArray(report?.activeJurisdictions);
  const inactiveJurisdictions = asArray(report?.inactiveJurisdictions);
  const activeConnectors = asArray(report?.activeConnectors);
  const missingConnectors = asArray(report?.missingConnectors);
  const sandboxConnectors = asArray(report?.sandboxConnectors);
  const portalOnlyIntegrations = asArray(report?.portalOnlyIntegrations);
  const manualOnlyIntegrations = asArray(report?.manualOnlyIntegrations);
  const outstandingBlockers = asArray(report?.outstandingBlockers);
  const testResults = asArray(report?.testResults);
  const securityResults = asArray(report?.securityResults);
  const deploymentResults = asArray(report?.deploymentResults);

  return (
    <div className="space-y-4">
      {/* Top-level readiness banner */}
      <Card
        className="p-4"
        style={{
          borderLeft: `4px solid ${readinessColor(report?.overallReadiness)}`,
          background: `${readinessColor(report?.overallReadiness)}0d`,
        }}
      >
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck
            className="w-5 h-5"
            style={{ color: readinessColor(report?.overallReadiness) }}
          />
          <h3 className="text-sm font-bold">Overall Production Readiness</h3>
          <StatusPill
            status={report?.overallReadiness}
            color={readinessColor(report?.overallReadiness)}
          />
          <span className="ml-auto text-[0.7rem] text-muted-foreground">
            Score:{" "}
            <span
              className="font-bold"
              style={{ color: scoreColor(asNum(report?.readinessScore)) }}
            >
              {asNum(report?.readinessScore).toFixed(1)}/100
            </span>{" "}
            · Terminology:{" "}
            <span
              className={
                report?.terminology === "CORRECT"
                  ? "text-emerald-500 font-semibold"
                  : "text-red-400 font-semibold"
              }
            >
              {String(report?.terminology || "—")}
            </span>
          </span>
        </div>
        <p className="text-[0.7rem] text-muted-foreground">
          {report?.reportId || report?.id} · generated{" "}
          {report?.generatedAt ? fmtDateTime(report.generatedAt) : "—"} by{" "}
          {String(report?.generatedBy || "system")}
        </p>
      </Card>

      {/* Module status */}
      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Implemented Modules (Phase 1-9)
        </h4>
        {implementedModules.length === 0 ? (
          <p className="text-[0.7rem] text-muted-foreground">No modules recorded.</p>
        ) : (
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Module</Th>
                  <Th small>Status</Th>
                  <Th small>Phase</Th>
                </tr>
              </thead>
              <tbody>
                {implementedModules.map((m: any, i: number) => (
                  <tr key={i} className="border-t">
                    <Td small className="font-mono">
                      {String(m?.name || m || "—")}
                    </Td>
                    <Td small>
                      <StatusPill
                        status={m?.status || "READY"}
                        color={readinessColor(m?.status || "READY")}
                      />
                    </Td>
                    <Td small className="text-muted-foreground">
                      {String(m?.phase || "—")}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Jurisdictions + Connectors summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Jurisdictions
          </h4>
          <div className="text-[0.7rem] space-y-1">
            <div className="flex justify-between">
              <span className="text-emerald-500">Active</span>
              <span className="font-bold">{activeJurisdictions.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-500">Inactive</span>
              <span className="font-bold">{inactiveJurisdictions.length}</span>
            </div>
          </div>
          <div className="mt-2">
            <PillsList items={activeJurisdictions.map((j: any) => typeof j === "string" ? j : j?.countryCode)} />
          </div>
        </Card>
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Connectors
          </h4>
          <div className="text-[0.7rem] space-y-1">
            <div className="flex justify-between">
              <span className="text-emerald-500">Production</span>
              <span className="font-bold">{activeConnectors.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-amber-500">Sandbox</span>
              <span className="font-bold">{sandboxConnectors.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Portal-only</span>
              <span className="font-bold">{portalOnlyIntegrations.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-400">Manual-only</span>
              <span className="font-bold">{manualOnlyIntegrations.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-red-400">Missing</span>
              <span className="font-bold">{missingConnectors.length}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Outstanding blockers */}
      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Outstanding Blockers
        </h4>
        {outstandingBlockers.length === 0 ? (
          <p className="text-[0.7rem] text-emerald-500">No outstanding blockers. Ready for production.</p>
        ) : (
          <div className="overflow-x-auto max-h-48 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Source</Th>
                  <Th small>Type</Th>
                  <Th small>Severity</Th>
                  <Th small>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {outstandingBlockers.map((b: any, i: number) => (
                  <tr key={i} className="border-t">
                    <Td small className="font-mono">
                      {String(b?.source || b?.jurisdictionCode || "—")}
                    </Td>
                    <Td small>{String(b?.type || b?.alertType || "—")}</Td>
                    <Td small>
                      <StatusPill
                        status={b?.severity || "HIGH"}
                        color={readinessColor(b?.severity === "CRITICAL" ? "FAILED" : "PARTIAL")}
                      />
                    </Td>
                    <Td small className="text-muted-foreground">
                      {truncate(String(b?.detail || b?.message || ""), 80)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Test results */}
      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Verification Test Results
        </h4>
        {testResults.length === 0 ? (
          <p className="text-[0.7rem] text-muted-foreground">No test results recorded.</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Section</Th>
                  <Th small>Result</Th>
                  <Th small>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {testResults.map((t: any, i: number) => (
                  <tr key={i} className="border-t">
                    <Td small className="font-mono">
                      {String(t?.section || t?.name || `§${i + 1}`)}
                    </Td>
                    <Td small>
                      <StatusPill
                        status={t?.status || (t?.passed ? "PASSED" : "FAILED")}
                        color={readinessColor(t?.passed ? "PASSED" : "FAILED")}
                      />
                    </Td>
                    <Td small className="text-muted-foreground">
                      {truncate(String(t?.detail || t?.summary || JSON.stringify(t)), 100)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Security checks */}
      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
          Security Audit ({securityResults.length} checks)
        </h4>
        {securityResults.length === 0 ? (
          <p className="text-[0.7rem] text-muted-foreground">No security checks recorded.</p>
        ) : (
          <div className="overflow-x-auto max-h-64 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Check</Th>
                  <Th small>Passed</Th>
                  <Th small>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {securityResults.map((s: any, i: number) => (
                  <tr key={i} className="border-t">
                    <Td small className="font-mono">
                      {String(s?.name || `check-${i}`)}
                    </Td>
                    <Td small>
                      <YesNo v={asBool(s?.passed)} />
                    </Td>
                    <Td small className="text-muted-foreground">
                      {truncate(String(s?.detail || ""), 100)}
                    </Td>
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

// =====================================================================
// 2. E2E TRADE GRAPH TAB (§1 — 23 steps)
// =====================================================================

function E2ETradeGraphTab() {
  const queryClient = useQueryClient();
  const [ustn, setUstn] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const qs = new URLSearchParams();
  if (statusFilter !== "ALL") qs.set("status", statusFilter);
  const listUrl = `/api/sgtx/readiness/e2e${qs.toString() ? `?${qs.toString()}` : ""}`;

  const { data: listData, isLoading: listLoading, error: listError, refetch } = useQuery({
    queryKey: ["sgtx-readiness-e2e-list", statusFilter],
    queryFn: () => fetchJson(listUrl),
  });

  const validations = asArray(listData?.validations);

  const validateMut = useMutation({
    mutationFn: (vars: { ustn: string }) =>
      postJson("/api/sgtx/readiness/e2e/validate", vars),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sgtx-readiness-e2e-list"] });
    },
  });

  const lastValidation = validateMut.data?.validation;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="E2E Trade Graph Validation"
        subtitle="Phase 10 · §1 — the 23-step trade lifecycle validator. Each step is a Boolean; failed steps get a reason recorded."
      />

      {/* Validate form */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[280px]">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              USTN
            </Label>
            <Input
              value={ustn}
              placeholder="SGTX-XXXXXX-XXXXXX-YYYYMMDDHHMMSS-RANDOM8"
              onChange={(e) => setUstn(e.target.value)}
              className="h-8 text-[0.7rem] font-mono"
            />
          </div>
          <Button
            size="sm"
            onClick={() => {
              if (ustn.trim()) validateMut.mutate({ ustn: ustn.trim() });
            }}
            disabled={validateMut.isPending || !ustn.trim()}
            className="h-8"
            style={{ background: "#d4a017", color: "#0a0a0a" }}
          >
            {validateMut.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="w-3 h-3 mr-1" />
            )}
            Validate
          </Button>
          <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
          <div className="flex flex-col gap-1">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              Status
            </Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-8 w-[160px] text-[0.7rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL" className="text-[0.7rem]">ALL</SelectItem>
                {VALIDATION_STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="text-[0.7rem]">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        {validateMut.isError && (
          <div className="mt-2 text-[0.65rem] text-red-400">
            Validation failed: {(validateMut.error as Error).message}
          </div>
        )}
      </Card>

      {/* 23-step checklist (most recent validation) */}
      {lastValidation && (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <h4 className="text-xs font-bold uppercase tracking-widest">
              23-Step Checklist
            </h4>
            <StatusPill
              status={lastValidation.status}
              color={validationStatusColor(lastValidation.status)}
            />
            <span className="text-[0.7rem] text-muted-foreground ml-auto">
              {lastValidation.validationId} ·{" "}
              {lastValidation.completedSteps || 0}/23 steps
            </span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
            {E2E_STEPS.map((step, i) => {
              const stepKey = `step${i + 1}`;
              const passed = asBool(lastValidation[stepKey]);
              return (
                <div
                  key={step}
                  className="px-2 py-1 rounded border text-[0.65rem] flex items-center gap-1.5"
                  style={{
                    borderColor: passed ? "#10b98155" : "#f8717155",
                    background: passed ? "#10b9810d" : "#f871710d",
                  }}
                  title={passed ? `${step} — passed` : `${step} — failed or pending`}
                >
                  <YesNo v={passed} />
                  <span className="font-mono">{step}</span>
                </div>
              );
            })}
          </div>
          {asArray(lastValidation.failedSteps).length > 0 && (
            <div className="mt-3 text-[0.7rem]">
              <span className="text-red-400 font-semibold">Failed steps:</span>{" "}
              <PillsList items={asArray(lastValidation.failedSteps)} />
            </div>
          )}
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-[0.65rem] text-muted-foreground">
            <div>USTN: <span className="font-mono">{String(lastValidation.ustn || "—")}</span></div>
            <div>Transport: <span className="font-mono">{String(lastValidation.transportMode || "—")}</span></div>
            <div>Origin: <span className="font-mono">{String(lastValidation.originCountry || "—")}</span></div>
            <div>Destination: <span className="font-mono">{String(lastValidation.destinationCountry || "—")}</span></div>
          </div>
        </Card>
      )}

      {/* Validations list */}
      {listLoading ? (
        <LoadingState label="Loading E2E validations…" />
      ) : listError ? (
        <ErrorState message={(listError as Error).message} />
      ) : validations.length === 0 ? (
        <EmptyState label="No E2E validations yet — validate a USTN above to create one." />
      ) : (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Recent Validations ({validations.length})
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Validation ID</Th>
                  <Th small>USTN</Th>
                  <Th small>Status</Th>
                  <Th small>Steps</Th>
                  <Th small>Transport</Th>
                  <Th small>Origin</Th>
                  <Th small>Dest</Th>
                  <Th small>Created</Th>
                </tr>
              </thead>
              <tbody>
                {validations.map((v: any) => (
                  <tr key={v.id} className="border-t hover:bg-muted/30">
                    <Td small className="font-mono">
                      {String(v.validationId || v.id)}
                    </Td>
                    <Td small className="font-mono">
                      {truncate(String(v.ustn || "—"), 32)}
                    </Td>
                    <Td small>
                      <StatusPill
                        status={v.status}
                        color={validationStatusColor(v.status)}
                      />
                    </Td>
                    <Td small>{asNum(v.completedSteps)}/23</Td>
                    <Td small className="text-muted-foreground">
                      {String(v.transportMode || "—")}
                    </Td>
                    <Td small className="text-muted-foreground">
                      {String(v.originCountry || "—")}
                    </Td>
                    <Td small className="text-muted-foreground">
                      {String(v.destinationCountry || "—")}
                    </Td>
                    <Td small className="text-muted-foreground">
                      {v.createdAt ? fmtDateTime(v.createdAt) : "—"}
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
// 3. MULTIMODAL TESTS TAB (§2 — 10 modes)
// =====================================================================

function MultimodalTestsTab() {
  const [results, setResults] = useState<any[] | null>(null);

  const runMut = useMutation({
    mutationFn: () => postJson("/api/sgtx/readiness/multimodal-tests", {}),
    onSuccess: (data) => {
      setResults(asArray(data?.results));
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Multimodal Transport Tests"
        subtitle="Phase 10 · §2 — 10 transport mode combinations (single-leg + multimodal). Validates transport-graph shape + lifecycle reachability."
      />

      <Card className="p-4 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="h-8"
          style={{ background: "#d4a017", color: "#0a0a0a" }}
        >
          {runMut.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <PlayCircle className="w-3 h-3 mr-1" />
          )}
          Run Tests
        </Button>
        {results && (
          <span className="text-[0.7rem] text-muted-foreground">
            {results.filter((r) => r?.passed).length}/{results.length} passed
          </span>
        )}
        {runMut.isError && (
          <span className="text-[0.65rem] text-red-400">
            Error: {(runMut.error as Error).message}
          </span>
        )}
      </Card>

      {!results ? (
        <EmptyState label="Click 'Run Tests' to execute the 10 multimodal combinations." />
      ) : (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Results
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Mode</Th>
                  <Th small>Legs</Th>
                  <Th small>Passed</Th>
                  <Th small>USTN</Th>
                  <Th small>Failed Steps</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <tr key={i} className="border-t">
                    <Td small className="font-mono">
                      {String(r?.mode || "—")}
                    </Td>
                    <Td small>
                      <PillsList items={asArray(r?.legs)} max={5} />
                    </Td>
                    <Td small>
                      <YesNo v={asBool(r?.passed)} />
                    </Td>
                    <Td small className="font-mono">
                      {truncate(String(r?.ustn || "—"), 28)}
                    </Td>
                    <Td small>
                      <PillsList items={asArray(r?.failedSteps)} max={6} />
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
// 4. COUNTRY READINESS TAB (§3 — jurisdictions, EG highlighted)
// =====================================================================

function CountryReadinessTab() {
  const [results, setResults] = useState<any[] | null>(null);

  const runMut = useMutation({
    mutationFn: () => postJson("/api/sgtx/readiness/country-tests", {}),
    onSuccess: (data) => {
      setResults(asArray(data?.results));
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Country Readiness Tests"
        subtitle="Phase 10 · §3 — every registered jurisdiction's readiness level + activation flag. Egypt (EG) highlighted when activated."
      />

      <Card className="p-4 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="h-8"
          style={{ background: "#d4a017", color: "#0a0a0a" }}
        >
          {runMut.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <PlayCircle className="w-3 h-3 mr-1" />
          )}
          Run Country Tests
        </Button>
        {results && (
          <span className="text-[0.7rem] text-muted-foreground">
            {results.filter((r) => r?.activated).length}/{results.length} activated
          </span>
        )}
        {runMut.isError && (
          <span className="text-[0.65rem] text-red-400">
            Error: {(runMut.error as Error).message}
          </span>
        )}
      </Card>

      {!results ? (
        <EmptyState label="Click 'Run Country Tests' to assess every registered jurisdiction." />
      ) : (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Jurisdiction Readiness
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Country</Th>
                  <Th small>Name</Th>
                  <Th small>Readiness</Th>
                  <Th small>Activated</Th>
                  <Th small>Score</Th>
                  <Th small>Missing Dimensions</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const isEG = String(r?.countryCode || "").toUpperCase() === "EG";
                  return (
                    <tr
                      key={i}
                      className="border-t"
                      style={isEG ? { background: "#d4a0170d" } : undefined}
                    >
                      <Td small className="font-mono font-bold">
                        {String(r?.countryCode || "—")}
                        {isEG && (
                          <span className="ml-1 text-[0.55rem] text-amber-600">★ EG</span>
                        )}
                      </Td>
                      <Td small>{String(r?.countryName || "—")}</Td>
                      <Td small>
                        <StatusPill
                          status={r?.readinessLevel}
                          color={readinessColor(r?.readinessLevel)}
                        />
                      </Td>
                      <Td small>
                        <YesNo v={asBool(r?.activated)} />
                      </Td>
                      <Td small>
                        <span
                          className="font-bold"
                          style={{ color: scoreColor(asNum(r?.readinessScore)) }}
                        >
                          {asNum(r?.readinessScore).toFixed(1)}
                        </span>
                      </Td>
                      <Td small>
                        <PillsList items={asArray(r?.missingDimensions)} max={6} />
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
// 5. GOVERNMENT CONNECTIVITY TAB (§4 — 11 checks per connector)
// =====================================================================

function GovernmentConnectivityTab() {
  const [results, setResults] = useState<any[] | null>(null);

  const runMut = useMutation({
    mutationFn: () => postJson("/api/sgtx/readiness/government-connectivity", {}),
    onSuccess: (data) => {
      setResults(asArray(data?.results));
    },
  });

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Government Connectivity"
        subtitle="Phase 10 · §4 — 11-check verification of every active IntegrationCatalog connector (PRODUCTION_CONNECTED + SANDBOX_CONNECTED)."
      />

      <Card className="p-4 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="h-8"
          style={{ background: "#d4a017", color: "#0a0a0a" }}
        >
          {runMut.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <PlayCircle className="w-3 h-3 mr-1" />
          )}
          Run Check
        </Button>
        {results && (
          <span className="text-[0.7rem] text-muted-foreground">
            {results.filter((r) => r?.overallPassed).length}/{results.length} connectors fully passing all 11 checks
          </span>
        )}
        {runMut.isError && (
          <span className="text-[0.65rem] text-red-400">
            Error: {(runMut.error as Error).message}
          </span>
        )}
      </Card>

      {!results ? (
        <EmptyState label="Click 'Run Check' to verify every active government connector." />
      ) : results.length === 0 ? (
        <EmptyState label="No active connectors found — check the Integration Catalog." />
      ) : (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Connectors ({results.length})
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Connector</Th>
                  <Th small>Jurisdiction</Th>
                  <Th small>Authority</Th>
                  <Th small>System</Th>
                  <Th small>Overall</Th>
                  <Th small>Checks (11)</Th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const checks = asArray(r?.checks);
                  const passedCount = checks.filter((c) => asBool(c?.passed)).length;
                  return (
                    <tr key={i} className="border-t align-top">
                      <Td small className="font-mono">
                        {truncate(String(r?.connectorId || "—"), 16)}
                      </Td>
                      <Td small className="font-mono">
                        {String(r?.jurisdictionCode || "—")}
                      </Td>
                      <Td small className="text-muted-foreground">
                        {String(r?.authority || "—")}
                      </Td>
                      <Td small className="text-muted-foreground">
                        {String(r?.systemName || "—")}
                      </Td>
                      <Td small>
                        <StatusPill
                          status={asBool(r?.overallPassed) ? "PASSING" : "FAILING"}
                          color={readinessColor(asBool(r?.overallPassed) ? "PASSED" : "FAILED")}
                        />
                      </Td>
                      <Td small>
                        <div className="text-[0.6rem] mb-1">
                          <span
                            className="font-bold"
                            style={{
                              color: passedCount === 11 ? "#10b981" : "#f59e0b",
                            }}
                          >
                            {passedCount}/11
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-0.5">
                          {checks.map((c: any, j: number) => (
                            <span
                              key={j}
                              title={`${c?.name}: ${c?.detail || (asBool(c?.passed) ? "passed" : "failed")}`}
                              className="w-2 h-2 rounded-sm inline-block"
                              style={{
                                background: asBool(c?.passed) ? "#10b981" : "#f87171",
                              }}
                            />
                          ))}
                        </div>
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
// 6. SECURITY AUDIT TAB (§8 — 11 checks)
// =====================================================================

function SecurityAuditTab() {
  const [result, setResult] = useState<any | null>(null);

  const runMut = useMutation({
    mutationFn: () => postJson("/api/sgtx/readiness/security-audit", {}),
    onSuccess: (data) => {
      setResult(data?.result);
    },
  });

  const checks = asArray(result?.checks);

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Security Audit"
        subtitle="Phase 10 · §8 — 11 security checks (dependency audit, API security, RBAC, RLS, tenant isolation, secrets, certificates, signatures, replay, idempotency, audit integrity)."
      />

      <Card className="p-4 flex items-center gap-3">
        <Button
          size="sm"
          onClick={() => runMut.mutate()}
          disabled={runMut.isPending}
          className="h-8"
          style={{ background: "#d4a017", color: "#0a0a0a" }}
        >
          {runMut.isPending ? (
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
          ) : (
            <PlayCircle className="w-3 h-3 mr-1" />
          )}
          Run Audit
        </Button>
        {result && (
          <span className="text-[0.7rem] text-muted-foreground">
            {checks.filter((c) => asBool(c?.passed)).length}/{checks.length} checks passing · overall{" "}
            <StatusPill
              status={asBool(result?.overallPassed) ? "PASSING" : "FAILING"}
              color={readinessColor(asBool(result?.overallPassed) ? "PASSED" : "FAILED")}
            />
          </span>
        )}
        {runMut.isError && (
          <span className="text-[0.65rem] text-red-400">
            Error: {(runMut.error as Error).message}
          </span>
        )}
      </Card>

      {!result ? (
        <EmptyState label="Click 'Run Audit' to execute the 11 security checks." />
      ) : checks.length === 0 ? (
        <EmptyState label="Audit ran but no checks were recorded." />
      ) : (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Security Checks ({checks.length})
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Check</Th>
                  <Th small>Passed</Th>
                  <Th small>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {checks.map((c, i) => (
                  <tr key={i} className="border-t align-top">
                    <Td small className="font-mono font-semibold">
                      {String(c?.name || `check-${i}`)}
                    </Td>
                    <Td small>
                      <YesNo v={asBool(c?.passed)} />
                    </Td>
                    <Td small className="text-muted-foreground">
                      {String(c?.detail || "—")}
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
// 7. TEST RUNNER TAB (§14 — Run All Tests)
// =====================================================================

function TestRunnerTab() {
  const [ustn, setUstn] = useState("");
  const [generatedBy, setGeneratedBy] = useState("");
  const [result, setResult] = useState<any | null>(null);

  const runMut = useMutation({
    mutationFn: (vars: { ustn?: string; generatedBy?: string }) =>
      postJson("/api/sgtx/readiness/run-all-tests", vars),
    onSuccess: (data) => {
      setResult(data);
    },
  });

  const blocks = result
    ? [
        { key: "e2e", label: "§1 E2E Trade Graph", block: result.e2e },
        { key: "multimodal", label: "§2 Multimodal Tests", block: result.multimodal },
        { key: "countries", label: "§3 Country Readiness", block: result.countries },
        { key: "governmentConnectivity", label: "§4 Gov Connectivity", block: result.governmentConnectivity },
        { key: "financialRecon", label: "§5 Financial Recon", block: result.financialRecon },
        { key: "dataRecon", label: "§6 Data Recon", block: result.dataRecon },
        { key: "gapCenter", label: "§7 Admin Gap Center", block: result.gapCenter },
        { key: "securityAudit", label: "§8 Security Audit", block: result.securityAudit },
        { key: "governorCoverage", label: "§9 Governor Coverage", block: result.governorCoverage },
        { key: "loomTraceability", label: "§10 Loom Traceability", block: result.loomTraceability },
        { key: "report", label: "§11 Production Report", block: result.report },
      ]
    : [];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Test Runner — Run All Tests"
        subtitle="Phase 10 · §14 — comprehensive readiness sweep. Runs every verification (§1-§10) + generates a fresh Production Readiness Report."
      />

      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1 flex-1 min-w-[260px]">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              USTN (optional)
            </Label>
            <Input
              value={ustn}
              placeholder="SGTX-XXXXXX-…"
              onChange={(e) => setUstn(e.target.value)}
              className="h-8 text-[0.7rem] font-mono"
            />
          </div>
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <Label className="text-[0.6rem] tracking-widest uppercase text-muted-foreground">
              Generated By (optional)
            </Label>
            <Input
              value={generatedBy}
              placeholder="admin@sgtx.io"
              onChange={(e) => setGeneratedBy(e.target.value)}
              className="h-8 text-[0.7rem]"
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              runMut.mutate({
                ustn: ustn.trim() || undefined,
                generatedBy: generatedBy.trim() || undefined,
              })
            }
            disabled={runMut.isPending}
            className="h-8"
            style={{ background: "#d4a017", color: "#0a0a0a" }}
          >
            {runMut.isPending ? (
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            ) : (
              <PlayCircle className="w-3 h-3 mr-1" />
            )}
            Run All Tests
          </Button>
          {runMut.isError && (
            <span className="text-[0.65rem] text-red-400">
              Error: {(runMut.error as Error).message}
            </span>
          )}
        </div>
      </Card>

      {result?.summary && (
        <Card
          className="p-4"
          style={{
            borderLeft: `4px solid ${readinessColor(result.summary.overallReadiness)}`,
            background: `${readinessColor(result.summary.overallReadiness)}0d`,
          }}
        >
          <div className="flex items-center gap-3 mb-2">
            <ShieldCheck
              className="w-5 h-5"
              style={{ color: readinessColor(result.summary.overallReadiness) }}
            />
            <h3 className="text-sm font-bold">Sweep Summary</h3>
            <StatusPill
              status={result.summary.overallReadiness}
              color={readinessColor(result.summary.overallReadiness)}
            />
            <span className="ml-auto text-[0.7rem] text-muted-foreground">
              Score:{" "}
              <span
                className="font-bold"
                style={{ color: scoreColor(asNum(result.summary.readinessScore)) }}
              >
                {asNum(result.summary.readinessScore).toFixed(1)}/100
              </span>{" "}
              · Terminology:{" "}
              <span
                className={
                  result.summary.terminology === "CORRECT"
                    ? "text-emerald-500 font-semibold"
                    : "text-red-400 font-semibold"
                }
              >
                {String(result.summary.terminology || "—")}
              </span>
            </span>
          </div>
          <div className="text-[0.7rem] text-muted-foreground">
            {result.summary.passed}/{result.summary.total} blocks passed ·{" "}
            {result.summary.failed} failed · ran at{" "}
            {result.summary.ranAt ? fmtDateTime(result.summary.ranAt) : "—"}
          </div>
        </Card>
      )}

      {result && (
        <Card className="p-4">
          <h4 className="text-xs font-bold uppercase tracking-widest mb-2 text-muted-foreground">
            Verification Blocks
          </h4>
          <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded">
            <table className="w-full text-[0.7rem]">
              <thead>
                <tr>
                  <Th small>Block</Th>
                  <Th small>Status</Th>
                  <Th small>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {blocks.map((b) => {
                  const ok = b.block?.ok === true;
                  const skipped = b.block?.skipped === true;
                  return (
                    <tr key={b.key} className="border-t align-top">
                      <Td small className="font-mono font-semibold">
                        {b.label}
                      </Td>
                      <Td small>
                        {skipped ? (
                          <StatusPill status="SKIPPED" color="#94a3b8" />
                        ) : ok ? (
                          <StatusPill status="OK" color="#10b981" />
                        ) : (
                          <StatusPill status="ERROR" color="#f87171" />
                        )}
                      </Td>
                      <Td small className="text-muted-foreground">
                        {skipped
                          ? "No USTN provided — skipped"
                          : ok
                            ? truncate(
                                JSON.stringify(
                                  b.block?.result?.overallPassed ??
                                    b.block?.result?.overallReconciled ??
                                    b.block?.result?.overallLinked ??
                                    b.block?.result?.noHiddenGaps ??
                                    b.block?.result?.overallCovered ??
                                    b.block?.result?.completeChain ??
                                    b.block?.result?.overallReadiness ??
                                    b.block?.result?.length ??
                                    b.block?.result,
                                ),
                                100,
                              )
                            : String(b.block?.error || "unknown error")}
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
// MAIN SCREEN — 7 sub-tabs
// =====================================================================

export function ProductionReadinessCenterScreen() {
  const [tab, setTab] = useState("report");
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Production Readiness Center"
        subtitle="Phase 10 — FINAL INTEGRATION PHASE. Aggregates ALL Phase 1-9 verification surfaces (E2E lifecycle, multimodal, country readiness, government connectivity, financial & data reconciliation, security, governor coverage, Loom traceability) into a single readiness report."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid grid-cols-2 md:grid-cols-7 gap-1">
          <TabsTrigger value="report" className="text-[0.7rem]">
            <ShieldCheck className="w-3 h-3 mr-1" /> Report
          </TabsTrigger>
          <TabsTrigger value="e2e" className="text-[0.7rem]">
            <Network className="w-3 h-3 mr-1" /> E2E Graph
          </TabsTrigger>
          <TabsTrigger value="multimodal" className="text-[0.7rem]">
            <Boxes className="w-3 h-3 mr-1" /> Multimodal
          </TabsTrigger>
          <TabsTrigger value="country" className="text-[0.7rem]">
            <Globe2 className="w-3 h-3 mr-1" /> Country
          </TabsTrigger>
          <TabsTrigger value="gov-conn" className="text-[0.7rem]">
            <Lock className="w-3 h-3 mr-1" /> Gov Conn
          </TabsTrigger>
          <TabsTrigger value="security" className="text-[0.7rem]">
            <ShieldCheck className="w-3 h-3 mr-1" /> Security
          </TabsTrigger>
          <TabsTrigger value="tests" className="text-[0.7rem]">
            <PlayCircle className="w-3 h-3 mr-1" /> Test Runner
          </TabsTrigger>
        </TabsList>
        <TabsContent value="report">
          <ReadinessReportTab />
        </TabsContent>
        <TabsContent value="e2e">
          <E2ETradeGraphTab />
        </TabsContent>
        <TabsContent value="multimodal">
          <MultimodalTestsTab />
        </TabsContent>
        <TabsContent value="country">
          <CountryReadinessTab />
        </TabsContent>
        <TabsContent value="gov-conn">
          <GovernmentConnectivityTab />
        </TabsContent>
        <TabsContent value="security">
          <SecurityAuditTab />
        </TabsContent>
        <TabsContent value="tests">
          <TestRunnerTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
