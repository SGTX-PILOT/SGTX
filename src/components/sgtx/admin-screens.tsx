"use client";

// SGTX Admin Portal screens (Blueprint Part 12C.11 — Platform Admin)
// - AdminCommandCenter    : platform-wide metrics dashboard
// - AdminMetricsScreen    : Prometheus metrics + system health + components
// - AdminIncidentsScreen  : P0–P3 incident list + create + resolve with AI post-mortem
// - AdminThreatsScreen    : threat findings list + filters + mitigate
// - AdminMultisigScreen   : multisig approval requests + create + approve
// - AdminAddOnsScreen     : GNN / PQC / ZK / Federated / Causal add-on status cards
// - AdminIntegrationsScreen : IntegrationHealth + Nafeza/CargoX/ETA/CBE test buttons
// - AdminSlaScreen        : SLA metrics + status page + maintenance windows
// - AdminAuditScreen      : Governor decision audit trail (loom chain)

import { useState } from "react";
import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SectionHeader } from "@/components/sgtx/widgets";
import { fmtDate, fmtDateTime, timeAgo, statusColor } from "@/lib/sgtx/format";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  ShieldCheck, AlertTriangle, Activity, Lock, Gavel, Globe2, FileText,
  Loader2, Sparkles, CheckCircle2, Clock, Building2, Users, Ship, Banknote,
  Brain, Zap, Plus, Send, Server, Database, Network as NetworkIcon,
  Gauge, ScrollText, Crown, Bug, AlertOctagon, Cog, Boxes, RefreshCw,
  ExternalLink, Eye, PlayCircle, KeyRound, Network, GitBranch,
} from "lucide-react";

// ============ Shared helpers ============
async function jfetch<T = any>(url: string, opts?: RequestInit): Promise<T> {
  const r = await fetch(url, opts);
  if (!r.ok) {
    let msg = `HTTP ${r.status}`;
    try { const j = await r.json(); msg = j.error || msg; } catch { /* ignore */ }
    throw new Error(msg);
  }
  return r.json() as Promise<T>;
}

function StatTile({
  label, value, sub, icon: Icon, accent = "#ca8a04",
}: { label: string; value: string | number; sub?: string; icon: LucideIcon; accent?: string }) {
  return (
    <Card className="relative p-4 overflow-hidden hover:border-gold/40 transition-colors group">
      <div className="absolute top-0 right-0 w-16 h-16 rounded-full blur-2xl opacity-10 group-hover:opacity-25 transition-opacity" style={{ background: accent }} />
      <div className="flex items-start justify-between mb-2">
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accent}1a` }}>
          <Icon className="w-4 h-4" style={{ color: accent }} />
        </div>
      </div>
      <p className="text-2xl font-bold text-foreground font-display">{value}</p>
      <p className="text-[0.7rem] text-muted-foreground mt-0.5">{label}</p>
      {sub && <p className="text-[0.6rem] text-muted-foreground/70 mt-1">{sub}</p>}
    </Card>
  );
}

function SectionCard({
  title, icon: Icon, accent = "#ca8a04", children, action,
}: { title: string; icon: LucideIcon; accent?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <span className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: `${accent}1a` }}>
            <Icon className="w-3.5 h-3.5" style={{ color: accent }} />
          </span>
          {title}
        </h3>
        {action}
      </div>
      {children}
    </Card>
  );
}

function StatusPill({ status }: { status: string }) {
  const color = statusColor(status);
  return (
    <span
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[0.65rem] font-semibold"
      style={{ color, background: `${color}1a`, border: `1px solid ${color}40` }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
      {status}
    </span>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const map: Record<string, { color: string; label: string }> = {
    P0: { color: "#dc2626", label: "P0 · Critical" },
    P1: { color: "#ea580c", label: "P1 · High" },
    P2: { color: "#f59e0b", label: "P2 · Medium" },
    P3: { color: "#3b82f6", label: "P3 · Low" },
    CRITICAL: { color: "#dc2626", label: "CRITICAL" },
    HIGH: { color: "#ea580c", label: "HIGH" },
    MEDIUM: { color: "#f59e0b", label: "MEDIUM" },
    LOW: { color: "#3b82f6", label: "LOW" },
  };
  const m = map[severity] || { color: "#94a3b8", label: severity };
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wider"
      style={{ color: m.color, background: `${m.color}1a`, border: `1px solid ${m.color}40` }}
    >
      {m.label}
    </span>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-center py-8 text-xs text-muted-foreground">
      <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-emerald-400/60" />
      {children}
    </div>
  );
}

function QueryLoading({ label = "Loading…" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center py-10">
      <Loader2 className="w-5 h-5 animate-spin text-gold mr-2" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

function QueryError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="text-center py-8">
      <AlertTriangle className="w-6 h-6 mx-auto mb-2 text-red-400" />
      <p className="text-xs text-red-400 mb-2">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry} className="h-7 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Retry
        </Button>
      )}
    </div>
  );
}

// ============================================================
// 1. COMMAND CENTER
// ============================================================
export function AdminCommandCenter() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin-metrics"],
    queryFn: () => jfetch<any>("/api/sgtx/admin/metrics"),
    refetchInterval: 30000,
  });

  if (isLoading) return <QueryLoading label="Loading platform metrics…" />;
  if (error || !data) return <QueryError message={(error as Error)?.message || "Failed to load metrics"} onRetry={() => refetch()} />;

  const p = data.platform || {};
  const s = data.security || {};
  const o = data.operations || {};
  const c = data.compliance || {};
  const l = data.logistics || {};
  const i = data.intelligence || {};
  const m = data.monitoring || {};

  const sections: {
    title: string; icon: LucideIcon; accent: string; stats: { label: string; value: string | number; sub?: string; icon: LucideIcon }[];
  }[] = [
    {
      title: "Platform", icon: Globe2, accent: "#ca8a04",
      stats: [
        { label: "Tenants", value: p.tenants ?? 0, sub: "onboarded", icon: Building2 },
        { label: "Trades", value: p.trades ?? 0, sub: "total", icon: Ship },
        { label: "Active", value: p.activeTrades ?? 0, sub: "in-flight", icon: Activity },
        { label: "Disputes", value: p.disputes ?? 0, sub: "filed", icon: Gavel },
        { label: "Inbox", value: p.pendingInbox ?? 0, sub: "pending", icon: Clock },
        { label: "Financing", value: p.financingRequests ?? 0, sub: "open RFQs", icon: Banknote },
        { label: "Decisions", value: p.recentDecisions ?? 0, sub: "governor", icon: ShieldCheck },
      ],
    },
    {
      title: "Security", icon: ShieldCheck, accent: "#dc2626",
      stats: [
        { label: "Open Incidents", value: s.openIncidents ?? 0, sub: "P0–P3", icon: AlertTriangle },
        { label: "Open Threats", value: s.openThreats ?? 0, sub: "findings", icon: Bug },
      ],
    },
    {
      title: "Operations", icon: Cog, accent: "#0ea5e9",
      stats: [
        { label: "Open Tasks", value: o.openTasks ?? 0, sub: "task center", icon: CheckCircle2 },
        { label: "Open Feedback", value: o.openFeedback ?? 0, sub: "tickets", icon: Users },
      ],
    },
    {
      title: "Compliance", icon: Gavel, accent: "#9333ea",
      stats: [
        { label: "Consents", value: c.consents ?? 0, sub: "records", icon: FileText },
        { label: "Pending DSR", value: c.pendingDsrRequests ?? 0, sub: "PDPL", icon: ShieldCheck },
      ],
    },
    {
      title: "Logistics", icon: Ship, accent: "#0d6efd",
      stats: [
        { label: "Distressed", value: l.distressedListings ?? 0, sub: "active", icon: AlertOctagon },
        { label: "Pallets", value: l.palletDetails ?? 0, sub: "tracked", icon: Boxes },
      ],
    },
    {
      title: "Intelligence", icon: Brain, accent: "#10b981",
      stats: [
        { label: "Memory Events", value: i.tradeMemoryEvents ?? 0, sub: "ingested", icon: Database },
        { label: "Predictions", value: i.predictiveInsights ?? 0, sub: "insights", icon: Sparkles },
        { label: "Open Anomalies", value: i.openAnomalies ?? 0, sub: "unresolved", icon: AlertTriangle },
      ],
    },
    {
      title: "Monitoring", icon: Gauge, accent: "#f59e0b",
      stats: [
        { label: "SLA Metrics", value: m.slaMetrics ?? 0, sub: "data points", icon: Activity },
      ],
    },
  ];

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Platform Admin · Command Center"
        subtitle="Part 12C.11 — Sovereign governance dashboard · live metrics across all SGTX subsystems"
        action={
          <Button size="sm" variant="outline" onClick={() => { refetch(); toast.success("Refreshed"); }} className="h-7 text-xs">
            <RefreshCw className="w-3 h-3 mr-1" /> Refresh
          </Button>
        }
      />

      {/* Hero banner */}
      <Card className="p-5 border-gold/30 bg-gold/5 relative overflow-hidden">
        <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-gold/40 bg-gold/10 flex-shrink-0">
            <Crown className="w-6 h-6 text-gold" />
          </div>
          <div className="flex-1">
            <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">Constitutional Authority</p>
            <h2 className="font-display text-xl font-bold text-foreground">Platform Governance Authority</h2>
            <p className="text-xs text-muted-foreground mt-1 max-w-3xl leading-relaxed">
              You are operating as the sovereign administrator. Actions taken here are governed by multisig approvals,
              Loom-hashed for tamper evidence, and signed with Dilithium3 (PQC). Use with discretion.
            </p>
            <div className="flex flex-wrap gap-3 mt-3 text-[0.65rem] text-muted-foreground">
              <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3 text-gold" /> Loom-anchored</span>
              <span className="flex items-center gap-1"><KeyRound className="w-3 h-3 text-gold" /> PQC-signed</span>
              <span className="flex items-center gap-1"><Lock className="w-3 h-3 text-gold" /> Multisig-gated</span>
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 text-gold" /> Updated {timeAgo(data.timestamp)}</span>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {sections.map((sec) => (
          <motion.div key={sec.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <SectionCard title={sec.title} icon={sec.icon} accent={sec.accent}>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {sec.stats.map((st) => (
                  <StatTile key={st.label} label={st.label} value={st.value} sub={st.sub} icon={st.icon} accent={sec.accent} />
                ))}
              </div>
            </SectionCard>
          </motion.div>
        ))}
      </div>

      {/* Quick links */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Zap className="w-4 h-4 text-gold" /> Quick Channels</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
          <a href="/api/sgtx/metrics" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3 h-3 text-gold" /> Prometheus endpoint
          </a>
          <a href="/api/sgtx/health" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3 h-3 text-gold" /> Health check
          </a>
          <a href="/api/sgtx/status" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3 h-3 text-gold" /> Public status page
          </a>
          <a href="/api/sgtx/openapi" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 p-2 rounded-lg hover:bg-muted/50 transition-colors">
            <ExternalLink className="w-3 h-3 text-gold" /> OpenAPI spec
          </a>
        </div>
      </Card>
    </div>
  );
}

// ============================================================
// 2. METRICS & HEALTH
// ============================================================
export function AdminMetricsScreen() {
  const { data: jsonMetrics, isLoading: l1, refetch: r1 } = useQuery({
    queryKey: ["metrics-json"],
    queryFn: () => jfetch<any>("/api/sgtx/metrics?format=json"),
  });
  const { data: health, isLoading: l2, refetch: r2 } = useQuery({
    queryKey: ["health"],
    queryFn: () => jfetch<any>("/api/sgtx/health"),
  });
  const { data: promText, isLoading: l3 } = useQuery({
    queryKey: ["metrics-prom"],
    queryFn: async () => (await fetch("/api/sgtx/metrics")).text(),
  });

  const isLoading = l1 || l2 || l3;
  const refreshAll = () => { r1(); r2(); toast.success("Refreshed metrics"); };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Metrics & System Health"
        subtitle="Part 25 + 27.14 — Prometheus gauges · health probes · component status"
        action={<Button size="sm" variant="outline" onClick={refreshAll} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {isLoading ? <QueryLoading /> : (
        <>
          {/* Health banner */}
          <Card className={`p-4 border ${health?.status === "healthy" ? "border-emerald-500/30 bg-emerald-500/5" : "border-red-500/30 bg-red-500/5"}`}>
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${health?.status === "healthy" ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
                {health?.status === "healthy"
                  ? <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                  : <AlertTriangle className="w-5 h-5 text-red-500" />}
              </div>
              <div className="flex-1">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Platform Status</p>
                <p className="font-display text-lg font-bold capitalize">{health?.status || "unknown"}</p>
                <p className="text-[0.65rem] text-muted-foreground">
                  Version {health?.version || "—"} · last probed {timeAgo(health?.timestamp)}
                </p>
              </div>
            </div>
            {health?.checks && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3 pt-3 border-t border-border/40">
                {Object.entries(health.checks).map(([k, v]) => (
                  <div key={k} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground capitalize">{k.replace(/_/g, " ")}</span>
                    <span className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: v === "ok" ? "#10b981" : "#f87171" }} />
                      <span style={{ color: v === "ok" ? "#10b981" : "#f87171" }}>{String(v)}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* JSON metric tiles */}
          {jsonMetrics && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatTile label="Tenants" value={jsonMetrics.tenants ?? 0} icon={Building2} accent="#ca8a04" />
              <StatTile label="Trades" value={jsonMetrics.trades ?? 0} icon={Ship} accent="#0ea5e9" />
              <StatTile label="Active Trades" value={jsonMetrics.activeTrades ?? 0} icon={Activity} accent="#10b981" />
              <StatTile label="Disputes" value={jsonMetrics.disputes ?? 0} icon={Gavel} accent="#f87171" />
              <StatTile label="Pending Inbox" value={jsonMetrics.pendingInbox ?? 0} icon={Clock} accent="#f59e0b" />
              <StatTile label="Financing RFQs" value={jsonMetrics.financingRequests ?? 0} icon={Banknote} accent="#9333ea" />
              <StatTile label="Open Incidents" value={jsonMetrics.openIncidents ?? 0} icon={AlertTriangle} accent="#dc2626" />
              <StatTile label="SLA Datapoints" value={jsonMetrics.slaMetrics?.length ?? 0} icon={Gauge} accent="#0d6efd" />
            </div>
          )}

          {/* Component availability */}
          {jsonMetrics?.slaMetrics?.length > 0 && (
            <SectionCard title="Component Availability (latest SLA)" icon={Server} accent="#0d6efd">
              <div className="space-y-2">
                {jsonMetrics.slaMetrics.map((m: any, idx: number) => (
                  <div key={`${m.component}-${idx}`} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                    <div className="flex items-center gap-2">
                      <Server className="w-3.5 h-3.5 text-muted-foreground" />
                      <span className="text-xs font-medium">{m.component}</span>
                      <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0">{m.uptimeWindow}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-xs">
                      <span className="text-muted-foreground">p95: <span className="font-mono">{m.p95LatencyMs ? `${m.p95LatencyMs}ms` : "—"}</span></span>
                      <span className="text-muted-foreground">err: <span className="font-mono">{m.errorRatePct != null ? `${m.errorRatePct}%` : "—"}</span></span>
                      <span className="font-bold" style={{ color: m.availabilityPct >= 99.9 ? "#10b981" : m.availabilityPct >= 99 ? "#f59e0b" : "#f87171" }}>
                        {m.availabilityPct}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Prometheus preview */}
          <SectionCard title="Prometheus Format Preview" icon={Activity} accent="#ca8a04"
            action={<a href="/api/sgtx/metrics" target="_blank" rel="noreferrer" className="text-[0.65rem] text-gold hover:underline flex items-center gap-1"><ExternalLink className="w-3 h-3" /> Open raw</a>}>
            <pre className="text-[0.65rem] font-mono text-foreground/80 bg-muted/40 p-3 rounded-lg max-h-80 overflow-auto scroll-gold whitespace-pre-wrap">
              {promText || "# (no metrics returned)"}
            </pre>
          </SectionCard>
        </>
      )}
    </div>
  );
}

// ============================================================
// 3. INCIDENTS
// ============================================================
export function AdminIncidentsScreen() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ severity: "P2", title: "", description: "", affectedSystems: "" });
  const [submitting, setSubmitting] = useState(false);
  const [resolveModal, setResolveModal] = useState<any | null>(null);
  const [resolveForm, setResolveForm] = useState({ rootCause: "", resolution: "" });
  const [resolving, setResolving] = useState(false);
  const [postMortem, setPostMortem] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["incidents", statusFilter],
    queryFn: () => jfetch<{ incidents: any[] }>(`/api/sgtx/incidents${statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`),
  });

  const incidents = data?.incidents || [];

  const submit = async () => {
    if (!form.title.trim()) { toast.error("Title required"); return; }
    setSubmitting(true);
    try {
      const affected = form.affectedSystems.split(",").map(s => s.trim()).filter(Boolean);
      await jfetch("/api/sgtx/incidents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ severity: form.severity, title: form.title, description: form.description, affectedSystems: affected }),
      });
      toast.success("Incident created", { description: `${form.severity} · ${form.title}` });
      setForm({ severity: "P2", title: "", description: "", affectedSystems: "" });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    } catch (e: any) {
      toast.error("Failed to create incident", { description: e.message });
    } finally { setSubmitting(false); }
  };

  const resolve = async () => {
    if (!resolveModal) return;
    if (!resolveForm.rootCause.trim() || !resolveForm.resolution.trim()) {
      toast.error("Root cause and resolution required");
      return;
    }
    setResolving(true);
    try {
      const r = await jfetch<any>("/api/sgtx/incidents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: resolveModal.id,
          rootCause: resolveForm.rootCause,
          resolution: resolveForm.resolution,
        }),
      });
      toast.success("Incident resolved", { description: "AI post-mortem generated" });
      setPostMortem(r.postMortem);
      qc.invalidateQueries({ queryKey: ["incidents"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    } catch (e: any) {
      toast.error("Failed to resolve", { description: e.message });
    } finally { setResolving(false); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Incident Management"
        subtitle="Part 24.6 — P0–P3 incidents · AI-generated post-mortems · Smart Inbox escalation"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3 h-3 mr-1" /> New Incident
          </Button>
        }
      />

      {/* Filter */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All statuses</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="INVESTIGATING">Investigating</SelectItem>
            <SelectItem value="RESOLVED">Resolved</SelectItem>
            <SelectItem value="CLOSED">Closed</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {/* Create form */}
      {showForm && (
        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}>
          <Card className="p-4 border-gold/30 bg-gold/5">
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-gold" /> Declare Incident</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <Label className="text-xs">Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="P0">P0 · Critical (platform down)</SelectItem>
                    <SelectItem value="P1">P1 · High (major function impaired)</SelectItem>
                    <SelectItem value="P2">P2 · Medium (partial impairment)</SelectItem>
                    <SelectItem value="P3">P3 · Low (cosmetic / minor)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Title</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Nafeza connector timeout" />
              </div>
            </div>
            <div className="mt-3">
              <Label className="text-xs">Description</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3} placeholder="What's happening, scope, impact…" />
            </div>
            <div className="mt-3">
              <Label className="text-xs">Affected systems (comma-separated)</Label>
              <Input value={form.affectedSystems} onChange={(e) => setForm({ ...form, affectedSystems: e.target.value })} placeholder="governor, nafeza, inbox" />
            </div>
            <div className="flex gap-2 mt-3">
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={submit} disabled={submitting}>
                {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Creating…</> : <><Send className="w-3 h-3 mr-1" /> Create & Notify</>}
              </Button>
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
            {(form.severity === "P0" || form.severity === "P1") && (
              <p className="text-[0.65rem] text-amber-400 mt-2 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> {form.severity} incidents auto-escalate to Platform Governance Authority via Smart Inbox.
              </p>
            )}
          </Card>
        </motion.div>
      )}

      {/* List */}
      {isLoading ? <QueryLoading /> : error ? <QueryError message={(error as Error)?.message} onRetry={() => refetch()} /> : (
        <div className="space-y-3">
          {incidents.length === 0 ? <EmptyHint>No incidents in this view. The platform is operating cleanly.</EmptyHint> : (
            incidents.map((inc: any) => (
              <Card key={inc.id} className="p-4 hover:border-gold/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={inc.severity} />
                      <StatusPill status={inc.status} />
                      <span className="text-[0.6rem] text-muted-foreground">opened {timeAgo(inc.openedAt)}</span>
                      {inc.resolvedAt && <span className="text-[0.6rem] text-muted-foreground">· resolved {timeAgo(inc.resolvedAt)}</span>}
                    </div>
                    <p className="text-sm font-semibold text-foreground mt-1.5">{inc.title}</p>
                    {inc.description && <p className="text-xs text-muted-foreground mt-1 leading-snug">{inc.description}</p>}
                    {inc.affectedSystems && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {(() => { try { return JSON.parse(inc.affectedSystems); } catch { return []; } })().map((s: string, idx: number) => (
                          <Badge key={idx} variant="outline" className="text-[0.55rem] px-1.5 py-0">{s}</Badge>
                        ))}
                      </div>
                    )}
                    {inc.rootCause && (
                      <div className="mt-2 p-2 rounded-md bg-muted/40 border border-border/50">
                        <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Root cause</p>
                        <p className="text-xs text-foreground/80 mt-0.5">{inc.rootCause}</p>
                        <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mt-1.5">Resolution</p>
                        <p className="text-xs text-foreground/80 mt-0.5">{inc.resolution}</p>
                      </div>
                    )}
                    {inc.postMortemText && (
                      <details className="mt-2">
                        <summary className="text-[0.65rem] text-gold cursor-pointer hover:underline flex items-center gap-1">
                          <Sparkles className="w-3 h-3" /> View AI post-mortem
                        </summary>
                        <pre className="mt-2 text-[0.65rem] font-sans whitespace-pre-wrap text-foreground/70 p-3 bg-gold/5 border border-gold/20 rounded-lg">{inc.postMortemText}</pre>
                      </details>
                    )}
                  </div>
                  {(inc.status === "OPEN" || inc.status === "INVESTIGATING") && (
                    <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs flex-shrink-0" onClick={() => { setResolveModal(inc); setPostMortem(null); setResolveForm({ rootCause: "", resolution: "" }); }}>
                      <CheckCircle2 className="w-3 h-3 mr-1" /> Resolve
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* Resolve modal (inline) */}
      {resolveModal && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setResolveModal(null)}>
          <div className="bg-card border border-gold/30 rounded-xl max-w-lg w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-base font-bold flex items-center gap-2"><CheckCircle2 className="w-4 h-4 text-gold" /> Resolve Incident</h3>
              <button onClick={() => setResolveModal(null)} className="text-muted-foreground hover:text-foreground">✕</button>
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-2">
              <SeverityBadge severity={resolveModal.severity} /> {resolveModal.title}
            </div>
            <div>
              <Label className="text-xs">Root Cause</Label>
              <Textarea value={resolveForm.rootCause} onChange={(e) => setResolveForm({ ...resolveForm, rootCause: e.target.value })} rows={2} placeholder="What actually caused this?" />
            </div>
            <div>
              <Label className="text-xs">Resolution</Label>
              <Textarea value={resolveForm.resolution} onChange={(e) => setResolveForm({ ...resolveForm, resolution: e.target.value })} rows={2} placeholder="What was done to resolve it?" />
            </div>
            {postMortem && (
              <div className="p-3 rounded-lg bg-gold/5 border border-gold/30">
                <p className="text-[0.65rem] font-semibold text-gold uppercase tracking-wider flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI Post-Mortem</p>
                <pre className="text-[0.7rem] font-sans whitespace-pre-wrap text-foreground/80">{postMortem}</pre>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setResolveModal(null)}>Close</Button>
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={resolve} disabled={resolving || !resolveForm.rootCause || !resolveForm.resolution}>
                {resolving ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Generating…</> : <><Sparkles className="w-3 h-3 mr-1" /> Resolve & Generate Post-Mortem</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// 4. THREATS
// ============================================================
export function AdminThreatsScreen() {
  const qc = useQueryClient();
  const [sourceFilter, setSourceFilter] = useState("ALL");
  const [severityFilter, setSeverityFilter] = useState("ALL");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["threats", sourceFilter, severityFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (sourceFilter !== "ALL") params.set("source", sourceFilter);
      if (severityFilter !== "ALL") params.set("status", severityFilter === "OPEN" ? "OPEN" : undefined as any);
      const qs = params.toString();
      return jfetch<{ threats: any[] }>(`/api/sgtx/threats${qs ? `?${qs}` : ""}`);
    },
  });

  const threats = data?.threats || [];
  const [mitigatingId, setMitigatingId] = useState<string | null>(null);

  const mitigate = async (t: any) => {
    setMitigatingId(t.id);
    try {
      await jfetch("/api/sgtx/threats/mitigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threatId: t.id }),
      });
      toast.success("Threat mitigated", { description: t.title });
      qc.invalidateQueries({ queryKey: ["threats"] });
      qc.invalidateQueries({ queryKey: ["admin-metrics"] });
    } catch (e: any) {
      toast.error("Mitigation failed", { description: e.message });
    } finally { setMitigatingId(null); }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Threat Findings" subtitle="Part 24.3 — trivy / falco / wazuh / pentest findings · MITRE-mapped · mitigate workflow" />

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Source:</span>
        <Select value={sourceFilter} onValueChange={setSourceFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="trivy">trivy</SelectItem>
            <SelectItem value="falco">falco</SelectItem>
            <SelectItem value="wazuh">wazuh</SelectItem>
            <SelectItem value="pentest">pentest</SelectItem>
            <SelectItem value="manual">manual</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-2">Status:</span>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="OPEN">Open</SelectItem>
            <SelectItem value="MITIGATED">Mitigated</SelectItem>
            <SelectItem value="ACCEPTED">Accepted</SelectItem>
            <SelectItem value="FALSE_POSITIVE">False positive</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs ml-auto">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? <QueryLoading /> : error ? <QueryError message={(error as Error)?.message} onRetry={() => refetch()} /> : (
        <div className="space-y-2 max-h-[640px] overflow-y-auto scroll-gold pr-1">
          {threats.length === 0 ? <EmptyHint>No threat findings match the filter.</EmptyHint> : (
            threats.map((t: any) => (
              <Card key={t.id} className="p-3 hover:border-gold/30 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <SeverityBadge severity={t.severity} />
                      <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0">{t.source}</Badge>
                      <StatusPill status={t.status} />
                      {t.cveId && <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 font-mono">{t.cveId}</Badge>}
                      <span className="text-[0.6rem] text-muted-foreground">{timeAgo(t.createdAt)}</span>
                    </div>
                    <p className="text-sm font-medium text-foreground mt-1">{t.title}</p>
                    {t.description && <p className="text-xs text-muted-foreground mt-1 leading-snug line-clamp-2">{t.description}</p>}
                    {(t.mitreTactic || t.mitreTechnique) && (
                      <div className="flex gap-1 mt-1.5">
                        {t.mitreTactic && <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 font-mono">{t.mitreTactic}</Badge>}
                        {t.mitreTechnique && <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 font-mono">{t.mitreTechnique}</Badge>}
                      </div>
                    )}
                  </div>
                  {t.status === "OPEN" && (
                    <Button size="sm" variant="outline" className="h-7 text-xs flex-shrink-0" onClick={() => mitigate(t)} disabled={mitigatingId === t.id}>
                      {mitigatingId === t.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <ShieldCheck className="w-3 h-3 mr-1" />}
                      Mitigate
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 5. MULTISIG
// ============================================================
export function AdminMultisigScreen() {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    requestType: "POLICY_UPDATE",
    requesterGtid: "SGTX-ZZ-ADM-000001-A1B2",
    payload: "{\n  \n}",
    requiredApprovals: "3",
  });
  const [submitting, setSubmitting] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approverGtid, setApproverGtid] = useState("SGTX-ZZ-ADM-000001-A1B2");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["multisig", statusFilter],
    queryFn: () => jfetch<{ requests: any[] }>(`/api/sgtx/multisig${statusFilter !== "ALL" ? `?status=${statusFilter}` : ""}`),
  });

  const requests = data?.requests || [];

  const submit = async () => {
    if (!form.requestType || !form.requesterGtid) { toast.error("Type and requester required"); return; }
    let payload: any = {};
    try { payload = JSON.parse(form.payload || "{}"); }
    catch { toast.error("Payload must be valid JSON"); return; }
    setSubmitting(true);
    try {
      await jfetch("/api/sgtx/multisig", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType: form.requestType,
          requesterGtid: form.requesterGtid,
          payload,
          requiredApprovals: Number(form.requiredApprovals) || 3,
        }),
      });
      toast.success("Multisig request created", { description: `${form.requestType} · requires ${form.requiredApprovals} approvals` });
      setShowForm(false);
      qc.invalidateQueries({ queryKey: ["multisig"] });
    } catch (e: any) {
      toast.error("Failed to create", { description: e.message });
    } finally { setSubmitting(false); }
  };

  const approve = async (r: any) => {
    if (!approverGtid) { toast.error("Approver GTID required"); return; }
    setApprovingId(r.id);
    try {
      const res = await jfetch<any>("/api/sgtx/multisig/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: r.id, approverGtid }),
      });
      toast.success(res.approved ? "Threshold reached — executed" : "Approval recorded", {
        description: `${res.approvalCount}/${r.requiredApprovals} approvals`,
      });
      qc.invalidateQueries({ queryKey: ["multisig"] });
    } catch (e: any) {
      toast.error("Approval failed", { description: e.message });
    } finally { setApprovingId(null); }
  };

  const typeColor = (t: string) =>
    t === "IMPERSONATION" ? "#dc2626" : t === "CONFIG_ROLLBACK" ? "#ea580c" : t === "ADDON_ACTIVATE" ? "#9333ea" : "#ca8a04";

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Multisig Approvals"
        subtitle="Part 12C.11 — 3-of-N quorum for policy updates, add-on activation, rollbacks, impersonation"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={() => setShowForm(v => !v)}>
            <Plus className="w-3 h-3 mr-1" /> New Request
          </Button>
        }
      />

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Filter:</span>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
            <SelectItem value="APPROVED">Approved</SelectItem>
            <SelectItem value="REJECTED">Rejected</SelectItem>
            <SelectItem value="EXECUTED">Executed</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[0.65rem] text-muted-foreground">Approving as:</span>
          <Input value={approverGtid} onChange={(e) => setApproverGtid(e.target.value)} className="h-8 w-64 text-xs font-mono" />
        </div>
      </div>

      {showForm && (
        <Card className="p-4 border-gold/30 bg-gold/5">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2"><Lock className="w-4 h-4 text-gold" /> Create Multisig Request</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Request Type</Label>
              <Select value={form.requestType} onValueChange={(v) => setForm({ ...form, requestType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="POLICY_UPDATE">POLICY_UPDATE</SelectItem>
                  <SelectItem value="ADDON_ACTIVATE">ADDON_ACTIVATE</SelectItem>
                  <SelectItem value="SPECIAL_RATE">SPECIAL_RATE</SelectItem>
                  <SelectItem value="CONFIG_ROLLBACK">CONFIG_ROLLBACK</SelectItem>
                  <SelectItem value="IMPERSONATION">IMPERSONATION (high-risk)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Required Approvals (quorum)</Label>
              <Input type="number" min={1} max={10} value={form.requiredApprovals} onChange={(e) => setForm({ ...form, requiredApprovals: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Requester GTID</Label>
              <Input value={form.requesterGtid} onChange={(e) => setForm({ ...form, requesterGtid: e.target.value })} className="font-mono text-xs" />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs">Payload (JSON)</Label>
              <Textarea value={form.payload} onChange={(e) => setForm({ ...form, payload: e.target.value })} rows={5} className="font-mono text-xs" />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs" onClick={submit} disabled={submitting}>
              {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting…</> : <><Send className="w-3 h-3 mr-1" /> Submit & Notify Quorum</>}
            </Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setShowForm(false)}>Cancel</Button>
          </div>
        </Card>
      )}

      {isLoading ? <QueryLoading /> : error ? <QueryError message={(error as Error)?.message} onRetry={() => refetch()} /> : (
        <div className="space-y-2">
          {requests.length === 0 ? <EmptyHint>No multisig requests in this view.</EmptyHint> : (
            requests.map((r: any) => {
              const approvals = (() => { try { return JSON.parse(r.approvals || "[]"); } catch { return []; } })();
              const payload = (() => { try { return JSON.parse(r.payload || "{}"); } catch { return {}; } })();
              return (
                <Card key={r.id} className="p-4 hover:border-gold/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[0.6rem] font-bold px-2 py-0.5" style={{ color: typeColor(r.requestType), borderColor: typeColor(r.requestType) + "55" }}>
                          {r.requestType}
                        </Badge>
                        <StatusPill status={r.status} />
                        <span className="text-[0.6rem] text-muted-foreground font-mono">{r.requesterGtid}</span>
                        <span className="text-[0.6rem] text-muted-foreground">· {timeAgo(r.createdAt)}</span>
                      </div>
                      <div className="mt-2 flex items-center gap-3">
                        <div className="flex-1">
                          <div className="flex items-center justify-between text-[0.65rem] mb-1">
                            <span className="text-muted-foreground">Quorum</span>
                            <span className="font-semibold" style={{ color: approvals.length >= r.requiredApprovals ? "#10b981" : "#f59e0b" }}>
                              {approvals.length} / {r.requiredApprovals}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full bg-gold-gradient" style={{ width: `${Math.min(100, (approvals.length / Math.max(r.requiredApprovals, 1)) * 100)}%` }} />
                          </div>
                        </div>
                      </div>
                      {Object.keys(payload).length > 0 && (
                        <details className="mt-2">
                          <summary className="text-[0.65rem] text-gold cursor-pointer hover:underline">View payload</summary>
                          <pre className="mt-1 text-[0.6rem] font-mono text-foreground/70 p-2 bg-muted/40 rounded whitespace-pre-wrap">{JSON.stringify(payload, null, 2)}</pre>
                        </details>
                      )}
                      {approvals.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {approvals.map((a: string, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-[0.55rem] px-1.5 py-0 font-mono text-emerald-400 border-emerald-500/30">{a}</Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    {r.status === "PENDING" && (
                      <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs flex-shrink-0" onClick={() => approve(r)} disabled={approvingId === r.id}>
                        {approvingId === r.id ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <CheckCircle2 className="w-3 h-3 mr-1" />}
                        Approve
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 6. ADD-ONS
// ============================================================
export function AdminAddOnsScreen() {
  const qc = useQueryClient();

  // GNN
  const { data: gnn, isLoading: gnnL } = useQuery({
    queryKey: ["addon-gnn"],
    queryFn: () => jfetch<any>("/api/sgtx/gnn/risk?tenantGtid=SGTX-EG-TRD-002139-7F3A&counterpartyGtid=SGTX-DE-TRD-001234-5B6C"),
  });
  // PQC
  const { data: pqc, isLoading: pqcL } = useQuery({
    queryKey: ["addon-pqc"],
    queryFn: () => jfetch<any>("/api/sgtx/pqc/public-key"),
  });
  // Federated
  const { data: fed, isLoading: fedL } = useQuery({
    queryKey: ["addon-fed"],
    queryFn: () => jfetch<{ models: any[] }>("/api/sgtx/federated/status"),
  });
  // Multi-Provider AI System
  const { data: aiProviders, isLoading: aiProvidersL } = useQuery({
    queryKey: ["ai-providers"],
    queryFn: () => jfetch<any>("/api/sgtx/ai/providers"),
  });

  // ZK test
  const [zkReserve, setZkReserve] = useState("1000000");
  const [zkLiabilities, setZkLiabilities] = useState("800000");
  const [zkResult, setZkResult] = useState<any>(null);
  const [zkLoading, setZkLoading] = useState(false);
  const testZk = async () => {
    setZkLoading(true);
    try {
      const r = await jfetch<any>("/api/sgtx/zk/reserve-proof", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reserveAmount: Number(zkReserve), liabilities: Number(zkLiabilities) }),
      });
      setZkResult(r);
      toast.success(r.verified ? "ZK proof verified ✓" : "ZK proof failed (ratio < 1.1×)", {
        description: `ratio: ${r.reserveRatio}×`,
      });
    } catch (e: any) { toast.error("ZK test failed", { description: e.message }); }
    finally { setZkLoading(false); }
  };

  // Causal test
  const [causalResult, setCausalResult] = useState<any>(null);
  const [causalLoading, setCausalLoading] = useState(false);
  const testCausal = async () => {
    setCausalLoading(true);
    try {
      const r = await jfetch<any>("/api/sgtx/causal/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: "DISPUTE",
          entityRef: "dispute-test-001",
          factors: [
            { name: "Documentation gap", weight: 35 },
            { name: "Logistics delay", weight: 25 },
            { name: "Payment disagreement", weight: 20 },
            { name: "Quality dispute", weight: 20 },
          ],
        }),
      });
      setCausalResult(r);
      toast.success("Causal analysis complete");
    } catch (e: any) { toast.error("Causal test failed", { description: e.message }); }
    finally { setCausalLoading(false); }
  };

  const refreshAll = () => { qc.invalidateQueries({ queryKey: ["addon-gnn"] }); qc.invalidateQueries({ queryKey: ["addon-pqc"] }); qc.invalidateQueries({ queryKey: ["addon-fed"] }); toast.success("Add-ons refreshed"); };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Add-on Library Status"
        subtitle="Part 11 — GNN · PQC · ZK · Federated · Causal · all simulated stubs ready for production swap-in"
        action={<Button size="sm" variant="outline" onClick={refreshAll} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* GNN */}
        <Card className="p-4 border-gold/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-purple-500/15">
                <Network className="w-4 h-4 text-purple-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">GNN Risk Engine</h3>
                <p className="text-[0.6rem] text-muted-foreground">Part 11.1 · sanctions-proximity · graph-risk</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-purple-400 border-purple-500/40">ACTIVE</Badge>
          </div>
          {gnnL ? <QueryLoading label="Querying GNN…" /> : gnn && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Sanctions proximity</span>
                <span className="font-mono font-semibold">{gnn.sanctionsProximity} / 6</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Graph risk score</span>
                <span className="font-bold" style={{ color: gnn.graphRiskScore >= 70 ? "#f87171" : gnn.graphRiskScore >= 40 ? "#f59e0b" : "#10b981" }}>{gnn.graphRiskScore}/100</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Recommendation</span>
                <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0" style={{ color: gnn.recommendation?.startsWith("ALLOW") ? "#10b981" : "#f87171", borderColor: "currentColor" }}>
                  {gnn.recommendation?.split("—")[0].trim()}
                </Badge>
              </div>
              <p className="text-[0.65rem] text-muted-foreground italic pt-1 border-t border-border/40 mt-2">
                {gnn.recommendation}
              </p>
              <p className="text-[0.55rem] text-muted-foreground font-mono">test: EG-TRD-002139 ↔ DE-TRD-001234</p>
            </div>
          )}
        </Card>

        {/* PQC */}
        <Card className="p-4 border-gold/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-500/15">
                <KeyRound className="w-4 h-4 text-amber-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">PQC (Dilithium3)</h3>
                <p className="text-[0.6rem] text-muted-foreground">Part 11.5 · post-quantum signatures</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-amber-400 border-amber-500/40">READY</Badge>
          </div>
          {pqcL ? <QueryLoading label="Loading public key…" /> : pqc && (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Algorithm</span>
                <span className="font-mono">{pqc.algorithm}</span>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">Public key</p>
                <pre className="font-mono text-[0.6rem] text-foreground/70 p-2 bg-muted/40 rounded break-all whitespace-pre-wrap">{pqc.publicKey}</pre>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Valid until</span>
                <span className="font-mono text-emerald-400">{fmtDate(pqc.validUntil)}</span>
              </div>
            </div>
          )}
        </Card>

        {/* ZK */}
        <Card className="p-4 border-gold/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-500/15">
                <Eye className="w-4 h-4 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">ZK Reserve Proof</h3>
                <p className="text-[0.6rem] text-muted-foreground">Part 11.5 · zk-SNARK (simulated)</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-emerald-400 border-emerald-500/40">TEST</Badge>
          </div>
          <div className="grid grid-cols-2 gap-2 mb-2">
            <div>
              <Label className="text-[0.65rem]">Reserve ($)</Label>
              <Input value={zkReserve} onChange={(e) => setZkReserve(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
            <div>
              <Label className="text-[0.65rem]">Liabilities ($)</Label>
              <Input value={zkLiabilities} onChange={(e) => setZkLiabilities(e.target.value)} className="h-8 text-xs font-mono" />
            </div>
          </div>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs w-full" onClick={testZk} disabled={zkLoading}>
            {zkLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
            Generate Proof
          </Button>
          {zkResult && (
            <div className="mt-2 p-2 rounded-md bg-muted/40 border border-border/50 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Verified</span>
                <span style={{ color: zkResult.verified ? "#10b981" : "#f87171" }} className="font-bold">{String(zkResult.verified)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Reserve ratio</span>
                <span className="font-mono">{zkResult.reserveRatio}×</span>
              </div>
              <pre className="font-mono text-[0.55rem] text-foreground/70 break-all whitespace-pre-wrap">{zkResult.proof}</pre>
            </div>
          )}
        </Card>

        {/* Federated */}
        <Card className="p-4 border-gold/20">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-blue-500/15">
                <GitBranch className="w-4 h-4 text-blue-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Federated Learning</h3>
                <p className="text-[0.6rem] text-muted-foreground">Part 11.4 · 3 models · privacy-preserving</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-blue-400 border-blue-500/40">TRAINING</Badge>
          </div>
          {fedL ? <QueryLoading label="Polling models…" /> : fed?.models?.length ? (
            <div className="space-y-2">
              {fed.models.map((m: any) => (
                <div key={m.name} className="p-2 rounded-lg bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-mono font-semibold">{m.name}</span>
                    <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0">{m.version}</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[0.65rem] mt-1.5 text-muted-foreground">
                    <span>acc: <span className="font-mono text-foreground">{(m.accuracy * 100).toFixed(1)}%</span></span>
                    <span>peers: <span className="font-mono text-foreground">{m.participants}</span></span>
                    <span>upd: <span className="font-mono text-foreground">{timeAgo(m.lastUpdated)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          ) : <EmptyHint>No federated models registered.</EmptyHint>}
        </Card>

        {/* Causal */}
        <Card className="p-4 border-gold/20 lg:col-span-2">
          <div className="flex items-start justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-rose-500/15">
                <Brain className="w-4 h-4 text-rose-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold">Causal Attribution</h3>
                <p className="text-[0.6rem] text-muted-foreground">Part 11.2 · counterfactual root-cause analysis · AI-summarised</p>
              </div>
            </div>
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-rose-400 border-rose-500/40">READY</Badge>
          </div>
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={testCausal} disabled={causalLoading}>
            {causalLoading ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <PlayCircle className="w-3 h-3 mr-1" />}
            Run Test Analysis (dispute sample)
          </Button>
          {causalResult && (
            <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground">Root causes (weighted)</p>
                {causalResult.rootCauses?.map((rc: any, i: number) => (
                  <div key={i} className="flex items-center justify-between text-xs p-2 rounded bg-muted/30">
                    <span>{rc.name || rc.factor}</span>
                    <span className="font-mono font-semibold" style={{ color: rc.weight >= 30 ? "#f87171" : "#f59e0b" }}>{rc.weight}%</span>
                  </div>
                ))}
              </div>
              <div>
                <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1.5">AI summary</p>
                <pre className="text-[0.7rem] font-sans whitespace-pre-wrap text-foreground/80 p-2 bg-gold/5 border border-gold/20 rounded">{causalResult.aiSummary}</pre>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Multi-Provider AI Consensus System */}
      <Card className="p-4 border-gold/30 bg-gold/5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-lg flex items-center justify-center bg-gold/15">
              <Brain className="w-4 h-4 text-gold" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-gold">Multi-Provider AI Consensus</h3>
              <p className="text-[0.6rem] text-muted-foreground">GLM + HuggingFace + Groq — best model for each task, consensus for critical decisions</p>
            </div>
          </div>
          {aiProviders && (
            <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-emerald-400 border-emerald-500/40">
              {aiProviders.providers?.filter((p: any) => p.available).length || 0}/{aiProviders.providers?.length || 0} available
            </Badge>
          )}
        </div>

        {aiProvidersL ? (
          <QueryLoading label="Loading AI providers…" />
        ) : aiProviders ? (
          <div className="space-y-3">
            {/* Provider cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {aiProviders.providers?.map((p: any) => (
                <div key={p.name} className={`p-2 rounded-lg border ${p.available ? "bg-background/40 border-emerald-500/30" : "bg-background/20 border-red-500/30"}`}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[0.65rem] font-semibold">{p.name}</span>
                    <Badge variant="outline" className={`text-[0.5rem] px-1 py-0 ${p.available ? "text-emerald-400 border-emerald-500/40" : "text-red-400 border-red-500/40"}`}>
                      {p.available ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>
                  <p className="text-[0.55rem] text-muted-foreground">{p.role}</p>
                  <p className="text-[0.55rem] text-gold mt-1">{p.avgLatency}</p>
                  <div className="mt-1 space-y-0.5">
                    {p.models?.slice(0, 2).map((m: string) => (
                      <p key={m} className="text-[0.5rem] font-mono text-muted-foreground truncate">{m}</p>
                    ))}
                  </div>
                  <p className="text-[0.5rem] text-muted-foreground mt-1 italic">{p.bestFor?.slice(0, 50)}</p>
                  {p.note && <p className="text-[0.5rem] text-amber-400 mt-1">{p.note}</p>}
                </div>
              ))}
            </div>

            {/* Task routing table */}
            <div>
              <p className="text-[0.6rem] uppercase tracking-wider text-muted-foreground mb-1.5">Task → Model routing</p>
              <div className="space-y-0.5 max-h-40 overflow-y-auto">
                {aiProviders.taskRouting?.map((t: any) => (
                  <div key={t.task} className="flex items-center gap-2 text-[0.6rem] p-1 rounded bg-background/30">
                    <Badge variant="outline" className={`text-[0.5rem] px-1 py-0 ${
                      t.authority === "A3" ? "text-red-400 border-red-500/40" :
                      t.authority === "A2" ? "text-amber-400 border-amber-500/40" :
                      "text-muted-foreground"
                    }`}>{t.authority}</Badge>
                    <code className="font-mono flex-1 truncate">{t.task}</code>
                    <span className="text-muted-foreground truncate">{t.primaryModel}</span>
                    {typeof t.consensus === "string" ? (
                      <span className="text-muted-foreground">single</span>
                    ) : (
                      <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-gold border-gold/30">{t.consensus.length} providers</Badge>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Safety rule */}
            <div className="p-2 rounded bg-amber-500/5 border border-amber-500/20">
              <p className="text-[0.6rem] text-amber-400 flex items-center gap-1.5">
                <ShieldCheck className="w-3 h-3" />
                <span className="font-semibold">Safety rule:</span> {aiProviders.safetyRule}
              </p>
            </div>
          </div>
        ) : (
          <EmptyHint>AI provider status unavailable.</EmptyHint>
        )}
      </Card>
    </div>
  );
}

// ============================================================
// 7. INTEGRATIONS
// ============================================================
export function AdminIntegrationsScreen() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["integrations"],
    queryFn: () => jfetch<any[]>("/api/sgtx/integrations"),
  });
  const [testing, setTesting] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { ok: boolean; message: string; ms?: number }>>({});

  const integrations = data || [];

  const testEndpoint = async (name: string, url: string, opts?: RequestInit) => {
    setTesting(name);
    const t0 = Date.now();
    try {
      const r = await fetch(url, opts);
      const ms = Date.now() - t0;
      const ok = r.ok;
      let message = `${r.status} ${r.statusText}`;
      try { const j = await r.json(); message = j.error || j.message || message; } catch { /* text response ok */ }
      setTestResults(prev => ({ ...prev, [name]: { ok, message, ms } }));
      toast(ok ? `✓ ${name} reachable` : `✗ ${name} failed`, { description: `${message} (${ms}ms)` });
    } catch (e: any) {
      const ms = Date.now() - t0;
      setTestResults(prev => ({ ...prev, [name]: { ok: false, message: e.message, ms } }));
      toast.error(`${name} unreachable`, { description: e.message });
    } finally { setTesting(null); }
  };

  const testAll = async () => {
    const endpoints: { name: string; url: string; opts?: RequestInit }[] = [
      { name: "Nafeza", url: "/api/sgtx/gov/nafeza/declare", opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: "SGTX-EG-USTN-TEST", declarationData: { test: true } }) } },
      { name: "CargoX", url: "/api/sgtx/gov/cargox/submit", opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: "SGTX-EG-USTN-TEST", documentHash: "a".repeat(64), documentType: "BL" }) } },
      { name: "ETA", url: "/api/sgtx/gov/eta/invoice", opts: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: "SGTX-EG-USTN-TEST", invoiceData: { test: true } }) } },
      { name: "CBE", url: "/api/sgtx/gov/cbe/fx-rate?from=USD&to=EGP" },
    ];
    for (const ep of endpoints) {
      await testEndpoint(ep.name, ep.url, ep.opts);
    }
  };

  const categoryColor = (cat: string) =>
    cat === "CUSTOMS" ? "#ca8a04" : cat === "PAYMENT" ? "#10b981" : cat === "BANK" ? "#0d6efd" : cat === "LOGISTICS" ? "#0ea5e9" : "#64748b";

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Government Integrations"
        subtitle="Part 7 — Nafeza · CargoX · ETA · CBE · PSP · AIS · live health probes + outbound test"
        action={
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={testAll} disabled={!!testing}>
            {testing ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : <Zap className="w-3 h-3 mr-1" />} Test All
          </Button>
        }
      />

      {isLoading ? <QueryLoading /> : error ? <QueryError message={(error as Error)?.message} onRetry={() => refetch()} /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {integrations.length === 0 ? <EmptyHint>No integrations registered.</EmptyHint> : (
            integrations.map((itg: any) => {
              const color = categoryColor(itg.category);
              const test = testResults[itg.name];
              return (
                <Card key={itg.id} className="p-4 hover:border-gold/30 transition-colors">
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${color}1a` }}>
                        <NetworkIcon className="w-4 h-4" style={{ color }} />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold truncate">{itg.name}</h3>
                        <p className="text-[0.6rem] text-muted-foreground">{itg.category}</p>
                      </div>
                    </div>
                    <StatusPill status={itg.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-[0.65rem] text-muted-foreground">
                    <div>
                      <p>Latency</p>
                      <p className="font-mono text-foreground">{itg.latencyMs}ms</p>
                    </div>
                    <div>
                      <p>Error rate</p>
                      <p className="font-mono text-foreground">{itg.errorRate}%</p>
                    </div>
                    <div>
                      <p>Uptime 30d</p>
                      <p className="font-mono" style={{ color: itg.uptime30d >= 99.9 ? "#10b981" : itg.uptime30d >= 99 ? "#f59e0b" : "#f87171" }}>{itg.uptime30d}%</p>
                    </div>
                  </div>
                  {itg.lastIncident && (
                    <p className="text-[0.6rem] text-muted-foreground mt-2 italic">Last incident: {itg.lastIncident}</p>
                  )}
                  {test && (
                    <div className="mt-2 pt-2 border-t border-border/40 flex items-center justify-between text-[0.65rem]">
                      <span className="flex items-center gap-1" style={{ color: test.ok ? "#10b981" : "#f87171" }}>
                        {test.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                        {test.ok ? "Reachable" : "Failed"}
                      </span>
                      {test.ms != null && <span className="font-mono text-muted-foreground">{test.ms}ms</span>}
                    </div>
                  )}
                </Card>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// 8. SLA & STATUS
// ============================================================
export function AdminSlaScreen() {
  const { data: sla, isLoading: slaL, refetch: slaR } = useQuery({
    queryKey: ["sla"],
    queryFn: () => jfetch<{ metrics: any[]; creditsEligible: number; window: string }>("/api/sgtx/sla"),
  });
  const { data: status, isLoading: statusL, refetch: statusR } = useQuery({
    queryKey: ["status-page"],
    queryFn: () => jfetch<any>("/api/sgtx/status"),
  });

  const refreshAll = () => { slaR(); statusR(); toast.success("SLA refreshed"); };

  return (
    <div className="space-y-5">
      <SectionHeader
        title="SLA & Status Page"
        subtitle="Part 25 — 99.9% uptime SLA · credits-eligible · maintenance windows · public status"
        action={<Button size="sm" variant="outline" onClick={refreshAll} className="h-7 text-xs"><RefreshCw className="w-3 h-3 mr-1" /> Refresh</Button>}
      />

      {slaL || statusL ? <QueryLoading /> : (
        <>
          {/* Overall status banner */}
          {status && (
            <Card className={`p-4 border ${status.overall === "operational" ? "border-emerald-500/30 bg-emerald-500/5" : status.overall === "degraded" ? "border-amber-500/30 bg-amber-500/5" : "border-red-500/30 bg-red-500/5"}`}>
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${status.overall === "operational" ? "bg-emerald-500/15" : status.overall === "degraded" ? "bg-amber-500/15" : "bg-red-500/15"}`}>
                  {status.overall === "operational" ? <CheckCircle2 className="w-5 h-5 text-emerald-500" /> : <AlertTriangle className="w-5 h-5 text-amber-500" />}
                </div>
                <div className="flex-1">
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Overall Status</p>
                  <p className="font-display text-lg font-bold capitalize">{status.overall?.replace(/_/g, " ")}</p>
                  <p className="text-[0.65rem] text-muted-foreground">Last updated {timeAgo(status.lastUpdated)}</p>
                </div>
                <a href="/api/sgtx/status" target="_blank" rel="noreferrer" className="text-[0.65rem] text-gold hover:underline flex items-center gap-1">
                  <ExternalLink className="w-3 h-3" /> Public page
                </a>
              </div>
            </Card>
          )}

          {/* Component status grid */}
          {status?.components && (
            <SectionCard title="Component Status" icon={Server} accent="#0d6efd">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {status.components.map((c: any) => {
                  const color = c.status === "operational" ? "#10b981" : c.status === "degraded" ? "#f59e0b" : "#f87171";
                  return (
                    <div key={c.component} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs font-medium capitalize">{c.component}</span>
                      </div>
                      <span className="flex items-center gap-1.5 text-[0.65rem]">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
                        <span style={{ color }}>{c.status}</span>
                      </span>
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          )}

          {/* Active incidents */}
          {status?.activeIncidents?.length > 0 && (
            <SectionCard title="Active Status Incidents" icon={AlertTriangle} accent="#dc2626">
              <div className="space-y-2">
                {status.activeIncidents.map((inc: any) => (
                  <div key={inc.id} className="p-2 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium capitalize">{inc.component}</span>
                      <StatusPill status={inc.status} />
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{inc.message}</p>
                    <p className="text-[0.6rem] text-muted-foreground mt-1">{timeAgo(inc.createdAt)}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* Maintenance windows */}
          {status?.upcomingMaintenance?.length > 0 && (
            <SectionCard title="Upcoming Maintenance" icon={Clock} accent="#f59e0b">
              <div className="space-y-2">
                {status.upcomingMaintenance.map((m: any) => (
                  <div key={m.id} className="p-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-semibold">{m.title}</span>
                      <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-amber-400 border-amber-500/40">{m.status}</Badge>
                    </div>
                    {m.description && <p className="text-xs text-muted-foreground mt-1">{m.description}</p>}
                    <p className="text-[0.65rem] text-muted-foreground mt-1">
                      {fmtDateTime(m.scheduledStart)} → {fmtDateTime(m.scheduledEnd)}
                    </p>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {/* SLA metrics table */}
          {sla && (
            <SectionCard title={`SLA Metrics · window: ${sla.window}`} icon={Gauge} accent="#ca8a04"
              action={<Badge variant="outline" className="text-[0.6rem] px-1.5 py-0 text-amber-400 border-amber-500/40">{sla.creditsEligible} credits-eligible</Badge>}>
              {sla.metrics.length === 0 ? <EmptyHint>No SLA metrics recorded in this window.</EmptyHint> : (
                <div className="max-h-96 overflow-y-auto scroll-gold pr-1 space-y-2">
                  {sla.metrics.map((m: any, idx: number) => (
                    <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-muted/30">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.availabilityPct >= 99.9 ? "#10b981" : m.availabilityPct >= 99 ? "#f59e0b" : "#f87171" }} />
                        <span className="text-xs font-medium">{m.component}</span>
                        <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0">{m.uptimeWindow}</Badge>
                      </div>
                      <div className="flex items-center gap-3 text-xs">
                        <span className="text-muted-foreground">p95: <span className="font-mono text-foreground">{m.p95LatencyMs ? `${m.p95LatencyMs}ms` : "—"}</span></span>
                        <span className="text-muted-foreground">err: <span className="font-mono text-foreground">{m.errorRatePct != null ? `${m.errorRatePct}%` : "—"}</span></span>
                        <span className="font-bold" style={{ color: m.availabilityPct >= 99.9 ? "#10b981" : m.availabilityPct >= 99 ? "#f59e0b" : "#f87171" }}>{m.availabilityPct}%</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}

// ============================================================
// 9. AUDIT — Governor decision log
// ============================================================
export function AdminAuditScreen() {
  const [actionFilter, setActionFilter] = useState("ALL");
  const [verdictFilter, setVerdictFilter] = useState("ALL");
  const [limit, setLimit] = useState("50");

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["governor-decisions", actionFilter, verdictFilter, limit],
    queryFn: () => {
      const params = new URLSearchParams();
      if (actionFilter !== "ALL") params.set("action", actionFilter);
      if (verdictFilter !== "ALL") params.set("verdict", verdictFilter);
      params.set("limit", limit);
      return jfetch<{ decisions: any[]; total: number }>(`/api/sgtx/governor/decisions?${params.toString()}`);
    },
  });

  const decisions = data?.decisions || [];
  const verdictColor = (v: string) => v === "ALLOW" ? "#10b981" : v === "CONDITIONAL" ? "#f59e0b" : "#f87171";

  return (
    <div className="space-y-5">
      <SectionHeader
        title="Governor Audit Trail"
        subtitle="Part 1.2 — Loom hash-chained · Ed25519 + Dilithium3 signed · tamper-evident decision log"
      />

      <Card className="p-4 border-gold/30 bg-gold/5">
        <div className="flex items-start gap-3">
          <ScrollText className="w-5 h-5 text-gold flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-xs text-foreground/80 leading-relaxed">
              Every Governor decision is anchored to a Loom hash chain — each entry's <code className="font-mono text-gold">loomHash</code> incorporates
              the <code className="font-mono text-gold">previousHash</code>, making retrospective edits cryptographically detectable.
              Decisions are dual-signed with Ed25519 (operational) and Dilithium3 (post-quantum, where available).
            </p>
            {data?.total != null && (
              <p className="text-[0.65rem] text-muted-foreground mt-1.5">
                Total decisions in chain: <span className="font-mono text-foreground font-semibold">{data.total}</span>
              </p>
            )}
          </div>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Action:</span>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-44 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All actions</SelectItem>
            <SelectItem value="contract.sign">contract.sign</SelectItem>
            <SelectItem value="trade.create">trade.create</SelectItem>
            <SelectItem value="fee.collect">fee.collect</SelectItem>
            <SelectItem value="financing.request">financing.request</SelectItem>
            <SelectItem value="settlement.approve">settlement.approve</SelectItem>
            <SelectItem value="quote.submit">quote.submit</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground ml-2">Verdict:</span>
        <Select value={verdictFilter} onValueChange={setVerdictFilter}>
          <SelectTrigger className="w-32 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All</SelectItem>
            <SelectItem value="ALLOW">ALLOW</SelectItem>
            <SelectItem value="CONDITIONAL">CONDITIONAL</SelectItem>
            <SelectItem value="DENY">DENY</SelectItem>
          </SelectContent>
        </Select>
        <Select value={limit} onValueChange={setLimit}>
          <SelectTrigger className="w-24 h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="20">20</SelectItem>
            <SelectItem value="50">50</SelectItem>
            <SelectItem value="100">100</SelectItem>
            <SelectItem value="200">200</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => refetch()} className="h-8 text-xs ml-auto">
          <RefreshCw className="w-3 h-3 mr-1" /> Refresh
        </Button>
      </div>

      {isLoading ? <QueryLoading /> : error ? <QueryError message={(error as Error)?.message} onRetry={() => refetch()} /> : (
        <div className="space-y-2 max-h-[640px] overflow-y-auto scroll-gold pr-1">
          {decisions.length === 0 ? <EmptyHint>No Governor decisions match the filter. The chain is empty for this query.</EmptyHint> : (
            decisions.map((d: any, idx: number) => (
              <motion.div key={d.id} initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.02, 0.5) }}>
                <Card className="p-3 hover:border-gold/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[0.6rem] font-mono font-bold px-1.5 py-0.5" style={{ color: "#ca8a04", borderColor: "#ca8a0455" }}>
                          {d.action}
                        </Badge>
                        <span
                          className="text-[0.6rem] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ color: verdictColor(d.verdict), background: `${verdictColor(d.verdict)}1a` }}
                        >
                          {d.verdict}
                        </span>
                        {d.actorGtid && <span className="text-[0.6rem] text-muted-foreground font-mono">{d.actorGtid}</span>}
                        {d.traderMode && <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0">{d.traderMode}</Badge>}
                        <span className="text-[0.6rem] text-muted-foreground">· {fmtDateTime(d.createdAt)}</span>
                      </div>
                      {d.resourceUstn && (
                        <p className="text-[0.65rem] text-muted-foreground font-mono mt-1">USTN: {d.resourceUstn}</p>
                      )}
                      {d.conditions && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {(() => { try { return JSON.parse(d.conditions); } catch { return []; } })().map((c: string, i: number) => (
                            <Badge key={i} variant="outline" className="text-[0.55rem] px-1.5 py-0 text-amber-400 border-amber-500/30">{c}</Badge>
                          ))}
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/40">
                        <div className="min-w-0">
                          <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Decision ID</p>
                          <p className="text-[0.65rem] font-mono text-foreground truncate">{d.decisionId}</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Loom hash</p>
                          <p className="text-[0.65rem] font-mono text-gold truncate" title={d.loomHash}>{d.loomHash?.slice(0, 24)}…</p>
                        </div>
                        <div className="min-w-0">
                          <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">Signature</p>
                          <p className="text-[0.65rem] font-mono text-foreground/70 truncate" title={d.signature}>{d.signature?.slice(0, 24)}…</p>
                        </div>
                      </div>
                      {d.tenantMessage && (
                        <details className="mt-2">
                          <summary className="text-[0.65rem] text-gold cursor-pointer hover:underline flex items-center gap-1">
                            <Sparkles className="w-3 h-3" /> Tenant-facing message
                          </summary>
                          <pre className="mt-1 text-[0.7rem] font-sans whitespace-pre-wrap text-foreground/80 p-2 bg-gold/5 border border-gold/20 rounded">
                            {(() => { try { return JSON.parse(d.tenantMessage); } catch { return d.tenantMessage; } })() as any}
                          </pre>
                        </details>
                      )}
                    </div>
                    {d.aiConfidence != null && (
                      <div className="text-right flex-shrink-0">
                        <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wider">AI conf</p>
                        <p className="text-sm font-bold" style={{ color: d.aiConfidence >= 0.8 ? "#10b981" : d.aiConfidence >= 0.5 ? "#f59e0b" : "#f87171" }}>
                          {Math.round(d.aiConfidence * 100)}%
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              </motion.div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
