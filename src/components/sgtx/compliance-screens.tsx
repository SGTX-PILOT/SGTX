"use client";

// SGTX Phase 3 §8 ADMIN — Compliance Engine screens (gov portal)
// Nine sub-tabs that exercise every Phase 3 compliance subsystem + the §8
// connector registry "show all missing" view + the unified 7-subsystem
// compliance screen endpoint:
//   1. Connectors       — §8 "show all missing" view (default) + health summary
//   2. Licenses         — TradeLicense rows (license + state + type filter)
//   3. Permits          — TradePermit rows
//   4. Certificates     — RegulatoryCertificate rows
//   5. SPS Rules        — SpsRequirement rows
//   6. TBT Rules        — TbtRequirement rows
//   7. Controlled Goods — ControlledGoodsControl rows
//   8. Sanctions        — SanctionsScreening rows
//   9. Full Screen      — POST /api/sgtx/compliance/screen (the orchestrator)
//
// Design rules (mandatory per the SGTX convention):
//   • 'use client' at top — admin UI is interactive.
//   • non-marketplace — never ranks, scores, or recommends counterparties.
//   • never crashes on missing/malformed API data — every JSON field is
//     defensively parsed via `safeParse`, every list is `Array.isArray`-guarded.
//   • palette: gold / emerald / amber / red / slate (NO indigo or blue).
//   • tables wrap in `overflow-x-auto max-h-96 overflow-y-auto scroll-gold`.
//   • verdict icons: CheckCircle2 (green), AlertTriangle (amber), XCircle (red).
//   • uses @tanstack/react-query for fetching + mutations.

import { useMemo, useState } from "react";
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
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Scale,
  Plug,
  FileText,
  Stamp,
  Leaf,
  Microscope,
  Boxes,
  Gavel,
  Radio,
  FlaskConical,
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

/** Format a 0..1 confidence as a percentage string. */
function fmtConfidence(c: unknown): string {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n * 100)}%`;
}

/** Format a 0..100 coverage percentage. */
function fmtPct(c: unknown): string {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${Math.round(n)}%`;
}

/** Format a 0..1 match-score. */
function fmtScore(c: unknown): string {
  const n = typeof c === "number" ? c : Number(c);
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

/** Severity colour for restriction / status badges. */
const SEVERITY_STYLE: Record<string, { color: string; label: string }> = {
  BLOCK: { color: "#f87171", label: "BLOCK" },
  WARN: { color: "#fbbf24", label: "WARN" },
  INFO: { color: "#94a3b8", label: "INFO" },
};

/** Verdict colour triplet (badge text colour + bg tint). */
function verdictStyle(v: string): { color: string; bg: string } {
  const u = String(v || "").toUpperCase();
  if (u === "ALLOW") return { color: "#10b981", bg: "#10b9811a" };
  if (u === "BLOCK" || u === "DENY") return { color: "#f87171", bg: "#f871711a" };
  if (u === "ENHANCED_DD") return { color: "#fb923c", bg: "#fb923c1a" };
  if (u === "CONDITIONAL") return { color: "#fbbf24", bg: "#fbbf241a" };
  return { color: "#94a3b8", bg: "#94a3b81a" };
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

/** Metric tile (label + value). */
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

// ============ Status badge helpers ============

/** License / Permit / Certificate state → colour. */
function licenseStateColor(state: unknown): string {
  const s = String(state || "").toUpperCase();
  if (s === "ISSUED") return "#10b981";
  if (s === "EXPIRED" || s === "REVOKED" || s === "REJECTED") return "#f87171";
  if (
    s === "PENDING" ||
    s === "SUBMITTED" ||
    s === "APPLICATION_READY" ||
    s === "REQUIRED"
  )
    return "#fbbf24";
  if (s === "NOT_REQUIRED") return "#94a3b8";
  return "#94a3b8";
}

/** ComplianceConnector status → colour. */
function connectorStatusColor(status: unknown): string {
  const s = String(status || "").toUpperCase();
  if (s === "CONNECTED") return "#10b981";
  if (s === "DEGRADED") return "#fbbf24";
  if (s === "MISSING") return "#f87171";
  if (s === "NOT_AVAILABLE") return "#94a3b8";
  if (s === "PLANNED") return "#64748b"; // slate-500 (no blue)
  return "#94a3b8";
}

/** Controlled Goods severity → colour. */
function controlSeverityColor(sev: unknown): string {
  const s = String(sev || "").toUpperCase();
  if (s === "BLOCK") return "#f87171";
  if (s === "ENHANCED_DD") return "#fbbf24";
  if (s === "CONDITIONAL") return "#64748b";
  return "#94a3b8";
}

/** Legal status → colour. */
function legalStatusColor(s: unknown): string {
  const u = String(s || "").toUpperCase();
  if (u === "IN_FORCE" || u === "ACTIVE") return "#10b981";
  if (u === "SUPERSEDED" || u === "REPEALED" || u === "EXPIRED") return "#f87171";
  if (u === "DRAFT" || u === "PROPOSED" || u === "PROVISIONAL") return "#fbbf24";
  return "#94a3b8";
}

// ============ Sub-tab navigation ============

type SubTabId =
  | "connectors"
  | "licenses"
  | "permits"
  | "certificates"
  | "sps"
  | "tbt"
  | "controlled-goods"
  | "sanctions"
  | "screen";

const SUB_TABS: Array<{ id: SubTabId; label: string; icon: any }> = [
  { id: "connectors", label: "Connectors (§8)", icon: Plug },
  { id: "licenses", label: "Licenses", icon: FileText },
  { id: "permits", label: "Permits", icon: Stamp },
  { id: "certificates", label: "Certificates", icon: ShieldCheck },
  { id: "sps", label: "SPS Rules", icon: Leaf },
  { id: "tbt", label: "TBT Rules", icon: Microscope },
  { id: "controlled-goods", label: "Controlled Goods", icon: Boxes },
  { id: "sanctions", label: "Sanctions", icon: Gavel },
  { id: "screen", label: "Full Screen", icon: Scale },
];

// ============ Filter option constants ============

const LICENSE_TYPES = [
  "IMPORT",
  "EXPORT",
  "TRANSIT",
  "CONTROLLED_GOODS",
  "SPECIAL_PRODUCT",
  "STRATEGIC_GOODS",
];

const PERMIT_TYPES = [
  "SPS",
  "FOOD",
  "AGRICULTURAL",
  "VETERINARY",
  "PHARMA",
  "CHEMICAL",
  "ENVIRONMENTAL",
  "COMMUNICATIONS",
  "STRATEGIC_GOODS",
  "SPECIAL_TRANSPORT",
  "IMPORT",
  "EXPORT",
  "TRANSIT",
];

const CERTIFICATE_TYPES = [
  "COO",
  "PREFERENTIAL_COO",
  "EUR1",
  "PHYTOSANITARY",
  "HEALTH",
  "VETERINARY",
  "ANALYSIS",
  "CONFORMITY",
  "INSPECTION",
  "FUMIGATION",
  "TREATMENT",
  "COLD_TREATMENT",
  "HALAL",
  "ORGANIC",
  "LABORATORY",
  "SECURITY",
  "INSURANCE",
];

const LICENSE_STATES = [
  "NOT_REQUIRED",
  "REQUIRED",
  "APPLICATION_READY",
  "SUBMITTED",
  "PENDING",
  "ISSUED",
  "EXPIRED",
  "REVOKED",
  "REJECTED",
];

const SPS_CATEGORIES = [
  "PLANT_HEALTH",
  "FOOD_SAFETY",
  "ANIMAL_HEALTH",
  "VETERINARY",
  "MRL",
  "MICROBIOLOGY",
  "QUARANTINE",
  "INSPECTION",
  "SAMPLING",
  "LABORATORY",
  "TREATMENT",
  "RELEASE",
];

const TBT_CATEGORIES = [
  "PRODUCT_CONFORMITY",
  "MANDATORY_STANDARDS",
  "LABELING",
  "SAFETY",
  "EMC",
  "RADIO",
  "ENERGY_EFFICIENCY",
  "PRODUCT_REGISTRATION",
  "TESTING",
];

const CONTROL_CATEGORIES = [
  "DUAL_USE",
  "MILITARY_STRATEGIC",
  "CHEMICALS",
  "BIOLOGICAL",
  "RADIOACTIVE",
  "CONTROLLED_MEDICINES",
  "CITES",
  "CYBER_ADVANCED_TECH",
];

const SUBSYSTEMS_LIST = [
  "LICENSE",
  "PERMIT",
  "CERTIFICATE",
  "SPS",
  "TBT",
  "CONTROLLED_GOODS",
  "SANCTIONS",
];

const CONNECTOR_STATUSES_LIST = [
  "CONNECTED",
  "DEGRADED",
  "MISSING",
  "NOT_AVAILABLE",
  "PLANNED",
];

const VERDICTS = ["ALLOW", "CONDITIONAL", "ENHANCED_DD", "BLOCK"];

const TRANSPORT_MODES = ["SEA", "AIR", "ROAD", "RAIL", "RORO", "MULTIMODAL"];

const INTENDED_USES = [
  "HUMAN_CONSUMPTION",
  "ANIMAL_FEED",
  "PROCESSING",
  "RE_EXPORT",
  "PLANTING",
  "INDUSTRIAL",
];

// ============ Main screen ============

export function ComplianceEngineScreen() {
  const [subTab, setSubTab] = useState<SubTabId>("connectors");
  return (
    <div className="space-y-4">
      <SectionHeader
        title="Compliance Engine"
        subtitle="Phase 3 §8 ADMIN — 7 regulatory subsystems + connector registry + unified compliance screen"
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

      {subTab === "connectors" && <ConnectorsTab />}
      {subTab === "licenses" && <LicensesTab />}
      {subTab === "permits" && <PermitsTab />}
      {subTab === "certificates" && <CertificatesTab />}
      {subTab === "sps" && <SpsTab />}
      {subTab === "tbt" && <TbtTab />}
      {subTab === "controlled-goods" && <ControlledGoodsTab />}
      {subTab === "sanctions" && <SanctionsTab />}
      {subTab === "screen" && <FullScreenTab />}
    </div>
  );
}

// ============ 1. Connectors (§8) ============

function ConnectorsTab() {
  const [subsystemFilter, setSubsystemFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [jurisdictionFilter, setJurisdictionFilter] = useState<string>("");

  // Health summary.
  const { data: healthData, isLoading: healthLoading } = useQuery({
    queryKey: ["compliance-connector-health"],
    queryFn: () => jfetch<{ health?: any }>("/api/sgtx/compliance/connectors/health"),
  });
  const health = healthData?.health || {};

  // Missing / degraded connectors.
  const { data: missingData, isLoading: missingLoading } = useQuery({
    queryKey: ["compliance-connector-missing"],
    queryFn: () =>
      jfetch<{ missing?: any[] }>("/api/sgtx/compliance/connectors/missing"),
  });
  const missing = Array.isArray(missingData?.missing) ? missingData!.missing : [];

  // All connectors (filtered).
  const allQ = useQuery({
    queryKey: [
      "compliance-connectors",
      subsystemFilter,
      statusFilter,
      jurisdictionFilter,
    ],
    queryFn: () => {
      const params = new URLSearchParams();
      if (subsystemFilter !== "all") params.set("subsystem", subsystemFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (jurisdictionFilter.trim())
        params.set("jurisdictionCode", jurisdictionFilter.trim().toUpperCase());
      const qs = params.toString();
      return jfetch<{ connectors?: any[] }>(
        `/api/sgtx/compliance/connectors${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const connectors = Array.isArray(allQ.data?.connectors)
    ? allQ.data!.connectors
    : [];

  const stats: Array<{ key: string; label: string; value: number; color: string }> = [
    { key: "total", label: "Total", value: Number(health.total) || 0, color: "#ca8a04" },
    { key: "connected", label: "Connected", value: Number(health.connected) || 0, color: "#10b981" },
    { key: "degraded", label: "Degraded", value: Number(health.degraded) || 0, color: "#fbbf24" },
    { key: "missing", label: "Missing", value: Number(health.missing) || 0, color: "#f87171" },
    { key: "notAvailable", label: "Not Available", value: Number(health.notAvailable) || 0, color: "#94a3b8" },
    { key: "planned", label: "Planned", value: Number(health.planned) || 0, color: "#64748b" },
  ];

  return (
    <div className="space-y-4">
      {/* Health summary */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Plug className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">Connector Health Summary</h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/compliance/connectors/health
          </span>
        </div>
        {healthLoading ? (
          <TabLoading />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {stats.map((s) => (
              <div
                key={s.key}
                className="rounded-lg border border-border p-3 bg-muted/20"
              >
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                  {s.label}
                </p>
                <p className="text-lg font-bold" style={{ color: s.color }}>
                  {s.value}
                </p>
              </div>
            ))}
            <div className="rounded-lg border border-border p-3 bg-muted/20">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
                Avg Coverage
              </p>
              <p className="text-lg font-bold text-gold">
                {fmtPct(health.coveragePctAvg)}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Missing / degraded connectors */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Missing / Degraded Connectors
            <Badge variant="secondary" className="text-[0.6rem]">
              {missing.length}
            </Badge>
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            GET /api/sgtx/compliance/connectors/missing
          </span>
        </div>
        {missingLoading ? (
          <TabLoading />
        ) : missing.length === 0 ? (
          <TabEmpty label="No missing or degraded connectors — all subsystems wired." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Subsystem</th>
                  <th className="text-left font-medium px-3 py-2.5">Jurisdiction</th>
                  <th className="text-left font-medium px-3 py-2.5">Connector</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Last Error</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((r: any, i: number) => (
                  <tr
                    key={`${r?.subsystem}-${r?.jurisdictionCode}-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {r?.subsystem || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      <span className="font-mono">{r?.jurisdictionCode || "—"}</span>
                      {r?.jurisdictionName && r.jurisdictionName !== r?.jurisdictionCode && (
                        <span className="block text-[0.6rem] text-muted-foreground">
                          {r.jurisdictionName}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r?.connectorName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={connectorStatusColor(r?.status)}>
                        {r?.status || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs text-red-500 line-clamp-2 max-w-xs">
                      {r?.lastError || <span className="text-muted-foreground">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* All connectors (filterable) */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <h3 className="font-semibold text-sm flex-1">
              All Connectors{" "}
              <span className="text-muted-foreground font-normal">
                ({connectors.length})
              </span>
            </h3>
            <span className="text-[0.6rem] text-muted-foreground">
              GET /api/sgtx/compliance/connectors
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-xs">Subsystem</Label>
              <Select value={subsystemFilter} onValueChange={setSubsystemFilter}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="All subsystems" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All subsystems</SelectItem>
                  {SUBSYSTEMS_LIST.map((s) => (
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
                  {CONNECTOR_STATUSES_LIST.map((s) => (
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
                onChange={(e) => setJurisdictionFilter(e.target.value.toUpperCase())}
                placeholder="e.g. EG"
                className="font-mono text-xs"
              />
            </div>
          </div>
        </div>
        {allQ.isLoading ? (
          <TabLoading />
        ) : allQ.error ? (
          <TabEmpty label={`Load failed: ${(allQ.error as Error).message}`} />
        ) : connectors.length === 0 ? (
          <TabEmpty label="No connectors found — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Subsystem</th>
                  <th className="text-left font-medium px-3 py-2.5">Jurisdiction</th>
                  <th className="text-left font-medium px-3 py-2.5">Connector</th>
                  <th className="text-left font-medium px-3 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                  <th className="text-left font-medium px-3 py-2.5">Last Sync</th>
                  <th className="text-left font-medium px-3 py-2.5">Coverage</th>
                </tr>
              </thead>
              <tbody>
                {connectors.map((c: any, i: number) => (
                  <tr
                    key={c?.id || `${c?.subsystem}-${c?.jurisdictionCode}-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {c?.subsystem || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.jurisdictionCode || <span className="text-muted-foreground">Global</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c?.connectorName || "—"}
                      {c?.endpointUrl && (
                        <span className="block text-[0.6rem] text-muted-foreground line-clamp-1">
                          {c.endpointUrl}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.connectorType || "—"}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={connectorStatusColor(c?.status)}>
                        {c?.status || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c?.lastSyncAt ? (
                        fmtDateTime(c.lastSyncAt)
                      ) : (
                        <span className="text-muted-foreground">Never</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {fmtPct(c?.coveragePct)}
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

// ============ 2. Licenses ============

function LicensesTab() {
  const [stateFilter, setStateFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-licenses", stateFilter, typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (stateFilter !== "all") params.set("state", stateFilter);
      if (typeFilter !== "all") params.set("licenseType", typeFilter);
      const qs = params.toString();
      return jfetch<{ licenses?: any[] }>(
        `/api/sgtx/compliance/licenses${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const licenses = Array.isArray(q.data?.licenses) ? q.data!.licenses : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">License Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {LICENSE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">State</Label>
            <Select value={stateFilter} onValueChange={setStateFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All states" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All states</SelectItem>
                {LICENSE_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {licenses.length} license{licenses.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            TradeLicense
          </span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : licenses.length === 0 ? (
          <TabEmpty label="No licenses yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">License Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Product</th>
                  <th className="text-left font-medium px-3 py-2.5">State</th>
                  <th className="text-left font-medium px-3 py-2.5">Valid Until</th>
                  <th className="text-left font-medium px-3 py-2.5">License #</th>
                </tr>
              </thead>
              <tbody>
                {licenses.map((l: any, i: number) => (
                  <tr
                    key={l?.id || `lic-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {l?.licenseType || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {l?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {l?.productName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={licenseStateColor(l?.state)}>
                        {l?.state || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {fmtDate(l?.validUntil)}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {l?.licenseNumber || <span className="text-muted-foreground">—</span>}
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

// ============ 3. Permits ============

function PermitsTab() {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-permits", typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("permitType", typeFilter);
      const qs = params.toString();
      return jfetch<{ permits?: any[] }>(
        `/api/sgtx/compliance/permits${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const permits = Array.isArray(q.data?.permits) ? q.data!.permits : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Permit Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {PERMIT_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {permits.length} permit{permits.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">TradePermit</span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : permits.length === 0 ? (
          <TabEmpty label="No permits yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Permit Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Product</th>
                  <th className="text-left font-medium px-3 py-2.5">State</th>
                  <th className="text-left font-medium px-3 py-2.5">Valid Until</th>
                  <th className="text-left font-medium px-3 py-2.5">Permit #</th>
                </tr>
              </thead>
              <tbody>
                {permits.map((p: any, i: number) => (
                  <tr
                    key={p?.id || `perm-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {p?.permitType || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {p?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {p?.productName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={licenseStateColor(p?.state)}>
                        {p?.state || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">{fmtDate(p?.validUntil)}</td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {p?.permitNumber || <span className="text-muted-foreground">—</span>}
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

// ============ 4. Certificates ============

function CertificatesTab() {
  const [typeFilter, setTypeFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-certificates", typeFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (typeFilter !== "all") params.set("certificateType", typeFilter);
      const qs = params.toString();
      return jfetch<{ certificates?: any[] }>(
        `/api/sgtx/compliance/certificates${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const certificates = Array.isArray(q.data?.certificates)
    ? q.data!.certificates
    : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Certificate Type</Label>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {CERTIFICATE_TYPES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {certificates.length} certificate{certificates.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            RegulatoryCertificate
          </span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : certificates.length === 0 ? (
          <TabEmpty label="No certificates yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Certificate Type</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Product</th>
                  <th className="text-left font-medium px-3 py-2.5">State</th>
                  <th className="text-left font-medium px-3 py-2.5">Valid Until</th>
                  <th className="text-left font-medium px-3 py-2.5">Certificate #</th>
                </tr>
              </thead>
              <tbody>
                {certificates.map((c: any, i: number) => (
                  <tr
                    key={c?.id || `cert-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {c?.certificateType || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c?.productName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={licenseStateColor(c?.state)}>
                        {c?.state || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs">{fmtDate(c?.validUntil)}</td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.certificateNumber || (
                        <span className="text-muted-foreground">—</span>
                      )}
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

// ============ 5. SPS Rules ============

function SpsTab() {
  const [catFilter, setCatFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-sps-rules", catFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (catFilter !== "all") params.set("spsCategory", catFilter);
      const qs = params.toString();
      return jfetch<{ rules?: any[] }>(
        `/api/sgtx/compliance/sps/rules${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const rules = Array.isArray(q.data?.rules) ? q.data!.rules : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">SPS Category</Label>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {SPS_CATEGORIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">SpsRequirement</span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : rules.length === 0 ? (
          <TabEmpty label="No SPS rules yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">SPS Category</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Commodity</th>
                  <th className="text-left font-medium px-3 py-2.5">Lane</th>
                  <th className="text-left font-medium px-3 py-2.5">Season</th>
                  <th className="text-left font-medium px-3 py-2.5">Treatment</th>
                  <th className="text-left font-medium px-3 py-2.5">Quarantine</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any, i: number) => {
                  const lane =
                    r?.originCountry || r?.destCountry
                      ? `${r?.originCountry || "?"}→${r?.destCountry || "?"}`
                      : "—";
                  const season =
                    r?.seasonFrom || r?.seasonTo
                      ? `${r?.seasonFrom || "?"}-${r?.seasonTo || "?"}`
                      : "—";
                  return (
                    <tr
                      key={r?.id || `sps-${i}`}
                      className="border-b border-border/40 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-xs font-mono">
                        {r?.spsCategory || "—"}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">
                        {r?.hs6 || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r?.commodity || <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">{lane}</td>
                      <td className="px-3 py-3 text-xs font-mono">{season}</td>
                      <td className="px-3 py-3 text-xs">
                        {r?.treatmentRequired || "NONE"}
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r?.quarantineDays != null ? `${r.quarantineDays}d` : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Pill color={legalStatusColor(r?.legalStatus)}>
                          {r?.legalStatus || "—"}
                        </Pill>
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

// ============ 6. TBT Rules ============

function TbtTab() {
  const [catFilter, setCatFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-tbt-rules", catFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (catFilter !== "all") params.set("tbtCategory", catFilter);
      const qs = params.toString();
      return jfetch<{ rules?: any[] }>(
        `/api/sgtx/compliance/tbt/rules${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const rules = Array.isArray(q.data?.rules) ? q.data!.rules : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">TBT Category</Label>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {TBT_CATEGORIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {rules.length} rule{rules.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">TbtRequirement</span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : rules.length === 0 ? (
          <TabEmpty label="No TBT rules yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">TBT Category</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Standard Reference</th>
                  <th className="text-left font-medium px-3 py-2.5">Standard Body</th>
                  <th className="text-left font-medium px-3 py-2.5">Testing</th>
                  <th className="text-left font-medium px-3 py-2.5">Registration</th>
                  <th className="text-left font-medium px-3 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r: any, i: number) => (
                  <tr
                    key={r?.id || `tbt-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {r?.tbtCategory || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {r?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {r?.standardReference || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {r?.standardBody || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3">
                      {r?.testingRequired ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {r?.registrationRequired ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={legalStatusColor(r?.legalStatus)}>
                        {r?.legalStatus || "—"}
                      </Pill>
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

// ============ 7. Controlled Goods ============

function ControlledGoodsTab() {
  const [catFilter, setCatFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-controlled-goods", catFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (catFilter !== "all") params.set("controlCategory", catFilter);
      const qs = params.toString();
      return jfetch<{ controls?: any[] }>(
        `/api/sgtx/compliance/controlled-goods${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const controls = Array.isArray(q.data?.controls) ? q.data!.controls : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Control Category</Label>
            <Select value={catFilter} onValueChange={setCatFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All categories</SelectItem>
                {CONTROL_CATEGORIES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {controls.length} control{controls.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            ControlledGoodsControl
          </span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : controls.length === 0 ? (
          <TabEmpty label="No controlled-goods controls yet — adjust filters or seed rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Control Category</th>
                  <th className="text-left font-medium px-3 py-2.5">HS6</th>
                  <th className="text-left font-medium px-3 py-2.5">Product</th>
                  <th className="text-left font-medium px-3 py-2.5">Control List Entry</th>
                  <th className="text-left font-medium px-3 py-2.5">Severity</th>
                  <th className="text-left font-medium px-3 py-2.5">Export Lic</th>
                  <th className="text-left font-medium px-3 py-2.5">End-User Stmt</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c: any, i: number) => (
                  <tr
                    key={c?.id || `ctrl-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {c?.controlCategory || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.hs6 || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {c?.productName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {c?.controlListEntry || (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={controlSeverityColor(c?.severity)}>
                        {c?.severity || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3">
                      {c?.exportLicenseRequired ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {c?.endUserStatementRequired ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-slate-400" />
                      )}
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

// ============ 8. Sanctions ============

function SanctionsTab() {
  const [verdictFilter, setVerdictFilter] = useState<string>("all");

  const q = useQuery({
    queryKey: ["compliance-sanctions-screenings", verdictFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (verdictFilter !== "all") params.set("verdict", verdictFilter);
      const qs = params.toString();
      return jfetch<{ screenings?: any[] }>(
        `/api/sgtx/compliance/sanctions/screenings${qs ? `?${qs}` : ""}`,
      );
    },
  });
  const screenings = Array.isArray(q.data?.screenings)
    ? q.data!.screenings
    : [];

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <Label className="text-xs">Verdict</Label>
            <Select value={verdictFilter} onValueChange={setVerdictFilter}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="All verdicts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All verdicts</SelectItem>
                {VERDICTS.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">
            {screenings.length} screening{screenings.length === 1 ? "" : "s"}
          </h3>
          <span className="text-[0.6rem] text-muted-foreground">
            SanctionsScreening
          </span>
        </div>
        {q.isLoading ? (
          <TabLoading />
        ) : q.error ? (
          <TabEmpty label={`Load failed: ${(q.error as Error).message}`} />
        ) : screenings.length === 0 ? (
          <TabEmpty label="No sanctions screenings yet — run the Full Screen to generate rows." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Screening Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Screened Value</th>
                  <th className="text-left font-medium px-3 py-2.5">Matched Entity</th>
                  <th className="text-left font-medium px-3 py-2.5">List</th>
                  <th className="text-left font-medium px-3 py-2.5">Score</th>
                  <th className="text-left font-medium px-3 py-2.5">Verdict</th>
                  <th className="text-left font-medium px-3 py-2.5">Network Hits</th>
                  <th className="text-left font-medium px-3 py-2.5">Screened At</th>
                </tr>
              </thead>
              <tbody>
                {screenings.map((s: any, i: number) => (
                  <tr
                    key={s?.id || `scr-${i}`}
                    className="border-b border-border/40 hover:bg-muted/30"
                  >
                    <td className="px-4 py-3 text-xs font-mono">
                      {s?.screeningType || "—"}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {s?.screenedValue || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {s?.matchedEntity || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {s?.matchedList || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {fmtScore(s?.matchScore)}
                    </td>
                    <td className="px-3 py-3">
                      <Pill color={controlSeverityColor(s?.verdict)}>
                        {s?.verdict || "—"}
                      </Pill>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono">
                      {Number(s?.networkHits) || 0}
                    </td>
                    <td className="px-3 py-3 text-xs">
                      {fmtDateTime(s?.screenedAt)}
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

// ============ 9. Full Screen (the orchestrator) ============

function FullScreenTab() {
  // Form state.
  const [hs6, setHs6] = useState("");
  const [productName, setProductName] = useState("");
  const [jurisdictionCode, setJurisdictionCode] = useState("EG");
  const [originCountry, setOriginCountry] = useState("EU");
  const [destCountry, setDestCountry] = useState("EG");
  const [transportMode, setTransportMode] = useState<string>("SEA");
  const [applicantGtid, setApplicantGtid] = useState("");
  const [intendedUse, setIntendedUse] = useState<string>("HUMAN_CONSUMPTION");
  const [season, setSeason] = useState("");
  const [counterpartyName, setCounterpartyName] = useState("");
  const [vesselName, setVesselName] = useState("");

  const [result, setResult] = useState<any>(null);

  const mutation = useMutation({
    mutationFn: (body: any) =>
      jfetch<any>("/api/sgtx/compliance/screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (d) => setResult(d),
    onError: (e: any) => setResult({ error: e?.message || "screen failed" }),
  });

  const runScreen = () => {
    if (!jurisdictionCode || !originCountry || !destCountry) return;
    setResult(null);
    mutation.mutate({
      hs6: hs6 || undefined,
      productName: productName || undefined,
      jurisdictionCode,
      originCountry,
      destCountry,
      transportMode,
      applicantGtid: applicantGtid || undefined,
      intendedUse,
      season: season || undefined,
      counterpartyName: counterpartyName || undefined,
      vesselName: vesselName || undefined,
    });
  };

  return (
    <div className="space-y-4">
      {/* Form */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <Scale className="w-4 h-4 text-gold" />
          <h3 className="text-sm font-semibold">Full Compliance Screen</h3>
          <span className="text-[0.6rem] text-muted-foreground">
            POST /api/sgtx/compliance/screen
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
            <Label className="text-xs">Destination Country</Label>
            <Input
              value={destCountry}
              onChange={(e) => setDestCountry(e.target.value.toUpperCase())}
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Transport Mode</Label>
            <Select value={transportMode} onValueChange={setTransportMode}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select mode" />
              </SelectTrigger>
              <SelectContent>
                {TRANSPORT_MODES.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Applicant GTID</Label>
            <Input
              value={applicantGtid}
              onChange={(e) => setApplicantGtid(e.target.value.toUpperCase())}
              placeholder="SGTX-EG-TRD-…"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Intended Use</Label>
            <Select value={intendedUse} onValueChange={setIntendedUse}>
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select use" />
              </SelectTrigger>
              <SelectContent>
                {INTENDED_USES.map((u) => (
                  <SelectItem key={u} value={u}>
                    {u}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Season (MM)</Label>
            <Input
              value={season}
              onChange={(e) => setSeason(e.target.value)}
              placeholder="01"
              className="font-mono text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Counterparty Name (sanctions)</Label>
            <Input
              value={counterpartyName}
              onChange={(e) => setCounterpartyName(e.target.value)}
              placeholder="e.g. Acme Shipping Co."
              className="text-xs"
            />
          </div>
          <div>
            <Label className="text-xs">Vessel Name (sanctions)</Label>
            <Input
              value={vesselName}
              onChange={(e) => setVesselName(e.target.value)}
              placeholder="e.g. EVER GIVEN"
              className="text-xs"
            />
          </div>
        </div>
        <div className="mt-3">
          <Button
            onClick={runScreen}
            disabled={mutation.isPending}
            className="bg-gold-gradient text-sovereign"
          >
            {mutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
            ) : (
              <Scale className="w-3.5 h-3.5 mr-1.5" />
            )}
            Run Full Compliance Screen
          </Button>
        </div>
      </Card>

      {/* Result */}
      {result && <ComplianceResultCard result={result} />}
    </div>
  );
}

/** Render the full ComplianceResult envelope (7 subsystem cards + restrictions). */
function ComplianceResultCard({ result }: { result: any }) {
  if (!result || result.error) {
    return (
      <Card className="p-4">
        <div className="flex items-center gap-2 text-xs text-red-500">
          <AlertTriangle className="w-3.5 h-3.5" />
          {result?.error || "screen failed"}
        </div>
      </Card>
    );
  }

  const v = verdictStyle(result.topVerdict);
  const VerdictIcon =
    result.topVerdict === "ALLOW"
      ? CheckCircle2
      : result.topVerdict === "BLOCK"
        ? XCircle
        : AlertTriangle;
  const restrictions: any[] = Array.isArray(result.restrictions)
    ? result.restrictions
    : [];

  return (
    <div className="space-y-4">
      {/* Top verdict */}
      <Card className="p-4">
        <div className="flex items-center gap-3 mb-3">
          <VerdictIcon className="w-5 h-5" style={{ color: v.color }} />
          <div className="flex-1">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
              Top Verdict
            </p>
            <p className="text-sm font-bold" style={{ color: v.color }}>
              {result.topVerdict || "CONDITIONAL"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">
              Overall Confidence
            </p>
            <p className="text-sm font-bold">{fmtConfidence(result.overallConfidence)}</p>
          </div>
          <Pill color={v.color}>{result.topVerdict || "—"}</Pill>
        </div>
        {result.humanReviewRequired && (
          <div className="mt-2 text-[0.65rem] flex items-center gap-1 text-amber-600">
            <AlertTriangle className="w-3 h-3" /> Human review required
          </div>
        )}
      </Card>

      {/* 7 subsystem cards in 2-col grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <LicenseResultCard result={result.license} />
        <PermitResultCard result={result.permits} />
        <CertificateResultCard result={result.certificates} />
        <SpsResultCard result={result.sps} />
        <TbtResultCard result={result.tbt} />
        <ControlledGoodsResultCard result={result.controlledGoods} />
        <SanctionsResultCard result={result.sanctions} />
      </div>

      {/* Restrictions list (full width) */}
      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <h3 className="font-semibold text-sm">
            Restrictions{" "}
            <span className="text-muted-foreground font-normal">
              ({restrictions.length})
            </span>
          </h3>
        </div>
        {restrictions.length === 0 ? (
          <TabEmpty label="No restrictions — trade is clear." />
        ) : (
          <div className="overflow-x-auto max-h-96 overflow-y-auto scroll-gold">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase tracking-wider">
                  <th className="text-left font-medium px-4 py-2.5">Subsystem</th>
                  <th className="text-left font-medium px-3 py-2.5">Type</th>
                  <th className="text-left font-medium px-3 py-2.5">Severity</th>
                  <th className="text-left font-medium px-3 py-2.5">Description</th>
                </tr>
              </thead>
              <tbody>
                {restrictions.map((r: any, i: number) => {
                  const sv = SEVERITY_STYLE[String(r?.severity || "").toUpperCase()] || SEVERITY_STYLE.INFO;
                  return (
                    <tr
                      key={`r-${i}`}
                      className="border-b border-border/40 hover:bg-muted/30"
                    >
                      <td className="px-4 py-3 text-xs font-mono">
                        {r?.subsystem || "—"}
                      </td>
                      <td className="px-3 py-3 text-xs font-mono">
                        {r?.type || "—"}
                      </td>
                      <td className="px-3 py-3">
                        <Pill color={sv.color}>{sv.label}</Pill>
                      </td>
                      <td className="px-3 py-3 text-xs">
                        {r?.description || <span className="text-muted-foreground">—</span>}
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

// ============ Subsystem result cards ============

function SubsystemCard({
  title,
  icon: Icon,
  verdict,
  children,
}: {
  title: string;
  icon: any;
  verdict?: string;
  children: React.ReactNode;
}) {
  const v = verdictStyle(verdict || "");
  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="w-4 h-4 text-gold" />
        <h4 className="text-sm font-semibold flex-1">{title}</h4>
        {verdict && <Pill color={v.color}>{verdict}</Pill>}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">{children}</div>
    </Card>
  );
}

function LicenseResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard
      title="License"
      icon={FileText}
      verdict={result?.topVerdict || result?.verdict}
    >
      <Metric label="License Type" value={result?.licenseType || "—"} />
      <Metric label="State" value={result?.state || "—"} />
      <Metric label="Verdict" value={result?.topVerdict || result?.verdict || "—"} />
      <Metric
        label="Reason"
        value={
          typeof result?.reason === "string" && result.reason.length > 0
            ? result.reason.length > 60
              ? `${result.reason.slice(0, 60)}…`
              : result.reason
            : "—"
        }
      />
    </SubsystemCard>
  );
}

function PermitResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard title="Permits" icon={Stamp} verdict={result?.topVerdict}>
      <Metric label="Verdict" value={result?.topVerdict || "—"} />
      <Metric label="Required" value={String(Number(result?.requiredCount) || 0)} />
      <Metric label="Issued" value={String(Number(result?.issuedCount) || 0)} />
      <Metric label="Missing" value={String(Number(result?.missingCount) || 0)} />
    </SubsystemCard>
  );
}

function CertificateResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard title="Certificates" icon={ShieldCheck} verdict={result?.topVerdict}>
      <Metric label="Verdict" value={result?.topVerdict || "—"} />
      <Metric label="Required" value={String(Number(result?.requiredCount) || 0)} />
      <Metric label="Issued" value={String(Number(result?.issuedCount) || 0)} />
      <Metric label="Missing" value={String(Number(result?.missingCount) || 0)} />
      <Metric label="Expired" value={String(Number(result?.expiredCount) || 0)} />
    </SubsystemCard>
  );
}

function SpsResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard title="SPS" icon={Leaf} verdict={result?.topVerdict}>
      <Metric label="Verdict" value={result?.topVerdict || "—"} />
      <Metric label="Total Required" value={String(Number(result?.totalRequired) || 0)} />
      <Metric
        label="Sampling"
        value={result?.samplingRequired ? "Required" : "—"}
      />
      <Metric
        label="Lab Test"
        value={result?.labTestRequired ? "Required" : "—"}
      />
      <Metric
        label="Treatment"
        value={
          typeof result?.treatmentRequired === "string" &&
          result.treatmentRequired.length > 0 &&
          result.treatmentRequired !== "NONE"
            ? result.treatmentRequired
            : "—"
        }
      />
      <Metric
        label="Quarantine (max)"
        value={
          result?.quarantineDaysMax != null
            ? `${result.quarantineDaysMax}d`
            : "—"
        }
      />
    </SubsystemCard>
  );
}

function TbtResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard title="TBT" icon={Microscope} verdict={result?.topVerdict}>
      <Metric label="Verdict" value={result?.topVerdict || "—"} />
      <Metric
        label="Testing"
        value={result?.testingRequired ? "Required" : "—"}
      />
      <Metric
        label="Registration"
        value={result?.registrationRequired ? "Required" : "—"}
      />
      <Metric
        label="Mandatory Standards"
        value={String(Number(result?.mandatoryStandardsCount) || Array.isArray(result?.mandatoryStandards) ? result.mandatoryStandards.length : 0)}
      />
    </SubsystemCard>
  );
}

function ControlledGoodsResultCard({ result }: { result: any }) {
  return (
    <SubsystemCard
      title="Controlled Goods"
      icon={Boxes}
      verdict={result?.topVerdict}
    >
      <Metric label="Verdict" value={result?.topVerdict || "—"} />
      <Metric label="Top Severity" value={result?.topSeverity || "—"} />
      <Metric
        label="Controls"
        value={String(
          Number(result?.controlsCount) ||
            (Array.isArray(result?.controls) ? result.controls.length : 0),
        )}
      />
      <Metric
        label="End-User Stmt"
        value={result?.endUserStatementRequired ? "Required" : "—"}
      />
      <Metric
        label="End-Use Cert"
        value={result?.endUseCertificateRequired ? "Required" : "—"}
      />
    </SubsystemCard>
  );
}

function SanctionsResultCard({ result }: { result: any }) {
  // `result` is { results: [...], aggregate: {...} } OR an aggregate object.
  const aggregate =
    result && typeof result === "object" && result.aggregate
      ? result.aggregate
      : result || {};
  const results: any[] = Array.isArray(result?.results) ? result.results : [];
  const matchedCount =
    Number(aggregate.matchedCount) ||
    results.filter((r: any) => r && r.verdict && r.verdict !== "ALLOW").length;
  const blockCount =
    Number(aggregate.blockCount) ||
    results.filter((r: any) => r?.verdict === "BLOCK").length;
  const enhancedDdCount =
    Number(aggregate.enhancedDdCount) ||
    results.filter((r: any) => r?.verdict === "ENHANCED_DD").length;
  const totalScreened =
    Number(aggregate.totalScreened) || results.length;

  return (
    <SubsystemCard
      title="Sanctions"
      icon={Gavel}
      verdict={aggregate.topVerdict || aggregate.verdict}
    >
      <Metric
        label="Verdict"
        value={aggregate.topVerdict || aggregate.verdict || "—"}
      />
      <Metric label="Total Screened" value={String(totalScreened)} />
      <Metric label="Matched" value={String(matchedCount)} />
      <Metric label="Block" value={String(blockCount)} />
      <Metric label="Enhanced DD" value={String(enhancedDdCount)} />
    </SubsystemCard>
  );
}
