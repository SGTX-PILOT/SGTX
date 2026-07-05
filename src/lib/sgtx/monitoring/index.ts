// @ts-nocheck
// SGTX Part 15 — SLA & Uptime Monitoring
//
// Production stack (per blueprint Part 15):
//   - Prometheus           — metrics scraper (15s scrape interval)
//   - Grafana              — dashboards (12 dashboards: Governor, FeeLock,
//                            Release API, Workflow, Inbox, AI, etc.)
//   - Loki                 — log aggregation (30d retention)
//   - Jaeger               — distributed tracing (OpenTelemetry)
//   - Blackbox Exporter    — synthetic probes (per-region uptime)
//   - Alertmanager         — alert routing (PagerDuty / OpsGenie / Slack)
//   - sla-monitor (Rust)   — custom SLA calculator (per-service SLOs)
//   - Status Page (public) — https://status.sgtx.io
//
// This module simulates:
//   - Prometheus exposition format text (counter / gauge / histogram)
//   - SLA target tracking per service (availability %, p95 latency, RTO, RPO)
//   - Uptime monitoring (per-region, per-service) — 24h of data points
//   - Alert management (critical / warning / info) — Alertmanager view
//   - Public status page data
//   - In-memory metric recording (recordMetric)
//
// ServiceSLA shape (Part 15.1) — coverage targets per service:
//
//   ┌───────────────────────────────┬──────────────┬──────────┬─────────┬─────────┐
//   │ Service                       │ Avail Target │ p95 (ms) │ RTO(min)│ RPO(sec)│
//   ├───────────────────────────────┼──────────────┼──────────┼─────────┼─────────┤
//   │ Governor Service              │   99.99%     │   150    │    5    │    0    │
//   │ End-to-End Workflow           │   99.95%     │   500    │   15    │   30    │
//   │ FeeLock KV                    │   99.999%    │    50    │    1    │    0    │
//   │ GTID Resolution               │   99.99%     │    30    │    2    │    0    │
//   │ Audit Log                     │   99.999%    │    20    │    1    │    0    │
//   │ Smart Inbox                   │   99.95%     │   200    │   10    │   60    │
//   │ Container Release API         │   99.95%     │   300    │   15    │   30    │
//   │ Payment Orchestrator          │   99.95%     │   500    │   15    │   30    │
//   │ Government Adapter Layer      │   99.5%      │  2000    │   60    │  300    │
//   │ AI Orchestrator               │   99.9%      │  3000    │   30    │   60    │
//   │ PDPL Compliance Service       │   99.99%     │   100    │    5    │    0    │
//   │ Identity Service              │   99.99%     │   100    │    5    │    0    │
//   └───────────────────────────────┴──────────────┴──────────┴─────────┴─────────┘
//
// All values are SIMULATED with realistic drift around the targets.

import { freshDb } from "@/lib/db-fresh";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type SLAStatus = "MEETING" | "BREACHED" | "AT_RISK";

export interface ServiceSLA {
  service: string; // "Governor Service" | "FeeLock KV" | "Container Release API" | etc.
  availabilityTarget: number; // 0.9995
  currentAvailability: number; // 0.9998
  p95LatencyTargetMs: number;
  currentP95LatencyMs: number;
  rtoMinutes: number;
  rpoSeconds: number;
  monthlyCreditPct: number; // % of monthly platform fee if breached
  status: SLAStatus;
  region: string; // primary region for this measurement
  measuredAt: string;
  trend: "IMPROVING" | "STABLE" | "DEGRADING";
}

export interface SLACredit {
  service: string;
  breachType: "AVAILABILITY" | "LATENCY" | "RTO" | "RPO";
  targetValue: string;
  actualValue: string;
  creditPct: number; // % of monthly platform fee owed
  affectedTrades: number;
  detectedAt: string;
}

export interface SLAStatusResult {
  services: ServiceSLA[];
  overallAvailability: number;
  overallStatus: "MEETING" | "BREACHED" | "AT_RISK";
  creditsOwed: SLACredit[];
  totalCreditPct: number;
  measuredAt: string;
  measurementWindow: "24h" | "7d" | "30d";
}

export interface UptimeDataPoint {
  timestamp: string; // ISO
  available: boolean;
  latencyMs: number;
  region: string;
}

export interface UptimeHistory {
  service: string;
  windowHours: number;
  dataPoints: UptimeDataPoint[];
  availabilityPct: number;
  avgLatencyMs: number;
  p95LatencyMs: number;
  p99LatencyMs: number;
  totalRequests: number;
  failedRequests: number;
  regions: string[];
}

export type AlertSeverity = "critical" | "warning" | "info";

export interface Alert {
  id: string; // ALERT-<service>-<n>
  severity: AlertSeverity;
  service: string;
  title: string;
  description: string;
  firedAt: string;
  resolvedAt: string | null;
  status: "firing" | "resolved" | "silenced";
  labels: Record<string, string>;
  annotations: Record<string, string>;
  runbookUrl: string;
  silencesAvailable: boolean;
}

export interface AlertsResult {
  critical: Alert[];
  warning: Alert[];
  info: Alert[];
  totalFiring: number;
  totalCritical: number;
  totalResolved24h: number;
}

export type ServiceOperationalStatus =
  | "OPERATIONAL"
  | "DEGRADED"
  | "PARTIAL_OUTAGE"
  | "MAJOR_OUTAGE"
  | "MAINTENANCE";

export interface ServiceStatus {
  service: string;
  status: ServiceOperationalStatus;
  availability30d: number;
  uptime90d: number;
  lastIncidentAt: string | null;
  description: string;
  regions: { region: string; status: ServiceOperationalStatus; latencyMs: number }[];
}

export interface StatusIncident {
  id: string;
  title: string;
  severity: "minor" | "major" | "critical" | "maintenance";
  status: "investigating" | "identified" | "monitoring" | "resolved";
  affectedServices: string[];
  startedAt: string;
  resolvedAt: string | null;
  updates: { timestamp: string; message: string; status: string }[];
}

export interface StatusPage {
  overall: "OPERATIONAL" | "DEGRADED" | "OUTAGE";
  services: ServiceStatus[];
  lastIncident: StatusIncident | null;
  activeIncidents: StatusIncident[];
  upcomingMaintenance: {
    id: string;
    title: string;
    description: string;
    scheduledStart: string;
    scheduledEnd: string;
    affectedServices: string[];
  }[];
  generatedAt: string;
}

export interface MonitoringDashboard {
  sla: SLAStatusResult;
  alerts: AlertsResult;
  status: StatusPage;
  metrics: {
    totalServices: number;
    operationalServices: number;
    degradedServices: number;
    outageServices: number;
    criticalAlerts: number;
    warningAlerts: number;
    p95LatencyAvgMs: number;
    overallAvailability: number;
    creditsOwedPct: number;
  };
  generatedAt: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Service SLA registry (Part 15.1)
// ──────────────────────────────────────────────────────────────────────────

interface SLASpec {
  service: string;
  availabilityTarget: number;
  p95LatencyTargetMs: number;
  rtoMinutes: number;
  rpoSeconds: number;
  monthlyCreditPct: number;
  region: string;
}

const SLA_SPECS: SLASpec[] = [
  { service: "Governor Service", availabilityTarget: 0.9999, p95LatencyTargetMs: 150, rtoMinutes: 5, rpoSeconds: 0, monthlyCreditPct: 10, region: "cairo" },
  { service: "End-to-End Workflow", availabilityTarget: 0.9995, p95LatencyTargetMs: 500, rtoMinutes: 15, rpoSeconds: 30, monthlyCreditPct: 5, region: "cairo" },
  { service: "FeeLock KV", availabilityTarget: 0.99999, p95LatencyTargetMs: 50, rtoMinutes: 1, rpoSeconds: 0, monthlyCreditPct: 15, region: "cairo" },
  { service: "GTID Resolution", availabilityTarget: 0.9999, p95LatencyTargetMs: 30, rtoMinutes: 2, rpoSeconds: 0, monthlyCreditPct: 10, region: "cairo" },
  { service: "Audit Log", availabilityTarget: 0.99999, p95LatencyTargetMs: 20, rtoMinutes: 1, rpoSeconds: 0, monthlyCreditPct: 15, region: "cairo" },
  { service: "Smart Inbox", availabilityTarget: 0.9995, p95LatencyTargetMs: 200, rtoMinutes: 10, rpoSeconds: 60, monthlyCreditPct: 5, region: "cairo" },
  { service: "Container Release API", availabilityTarget: 0.9995, p95LatencyTargetMs: 300, rtoMinutes: 15, rpoSeconds: 30, monthlyCreditPct: 10, region: "cairo" },
  { service: "Payment Orchestrator", availabilityTarget: 0.9995, p95LatencyTargetMs: 500, rtoMinutes: 15, rpoSeconds: 30, monthlyCreditPct: 10, region: "cairo" },
  { service: "Government Adapter Layer", availabilityTarget: 0.995, p95LatencyTargetMs: 2000, rtoMinutes: 60, rpoSeconds: 300, monthlyCreditPct: 3, region: "cairo" },
  { service: "AI Orchestrator", availabilityTarget: 0.999, p95LatencyTargetMs: 3000, rtoMinutes: 30, rpoSeconds: 60, monthlyCreditPct: 5, region: "cairo" },
  { service: "PDPL Compliance Service", availabilityTarget: 0.9999, p95LatencyTargetMs: 100, rtoMinutes: 5, rpoSeconds: 0, monthlyCreditPct: 10, region: "cairo" },
  { service: "Identity Service", availabilityTarget: 0.9999, p95LatencyTargetMs: 100, rtoMinutes: 5, rpoSeconds: 0, monthlyCreditPct: 10, region: "cairo" },
];

const REGIONS = ["cairo", "dubai", "frankfurt"];

// ──────────────────────────────────────────────────────────────────────────
// In-memory metric store (for recordMetric + Prometheus exposition)
// ──────────────────────────────────────────────────────────────────────────

type MetricType = "counter" | "gauge" | "histogram";

interface MetricEntry {
  type: MetricType;
  help: string;
  samples: Map<string, number>; // labels-key → value
}

const metricStore: Map<string, MetricEntry> = new Map();

function labelsKey(labels?: Record<string, string>): string {
  if (!labels || Object.keys(labels).length === 0) return "";
  return Object.entries(labels)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}="${v}"`)
    .join(",");
}

function labelsString(labels?: Record<string, string>): string {
  const k = labelsKey(labels);
  return k ? `{${k}}` : "";
}

function registerMetric(name: string, type: MetricType, help: string): MetricEntry {
  let m = metricStore.get(name);
  if (!m) {
    m = { type, help, samples: new Map() };
    metricStore.set(name, m);
  }
  return m;
}

export function recordMetric(
  name: string,
  value: number,
  labels?: Record<string, string>,
  opts?: { type?: MetricType; help?: string },
): void {
  const type = opts?.type ?? "counter";
  const help = opts?.help ?? `SGTX metric ${name}`;
  const m = registerMetric(name, type, help);
  const key = labelsKey(labels);
  const existing = m.samples.get(key) ?? 0;
  if (type === "counter") {
    m.samples.set(key, existing + value);
  } else {
    m.samples.set(key, value); // gauge / histogram (last-wins)
  }
}

// Seed baseline metrics so /metrics always returns a realistic snapshot
function seedBaselineMetrics(): void {
  if (metricStore.size > 0) return; // already seeded
  // Governor decisions by verdict
  recordMetric("sgtx_governor_decisions_total", 142, { verdict: "allow" }, { type: "counter", help: "Total Governor decisions" });
  recordMetric("sgtx_governor_decisions_total", 38, { verdict: "conditional" });
  recordMetric("sgtx_governor_decisions_total", 5, { verdict: "deny" });
  // Governor latency histogram (buckets)
  for (const [le, count] of [["25", 28], ["50", 67], ["100", 142], ["250", 165], ["500", 174], ["+Inf", 185]] as [string, number][]) {
    recordMetric("sgtx_governor_decision_duration_ms_bucket", count, { le });
  }
  // FeeLock
  recordMetric("sgtx_fealock_frozen_total", 412, {}, { type: "counter", help: "Total FeeLock freeze operations" });
  recordMetric("sgtx_fealock_released_total", 387, {});
  recordMetric("sgtx_fealock_held_amount_usd", 184250.50, {}, { type: "gauge", help: "Currently held FeeLock amount (USD)" });
  // Container releases
  recordMetric("sgtx_container_releases_total", 312, { outcome: "approved" });
  recordMetric("sgtx_container_releases_total", 8, { outcome: "denied" });
  // Government adapters
  for (const [adapter, ok, err] of [
    ["nafeza", 1842, 23],
    ["cargox", 921, 5],
    ["eta", 612, 12],
    ["cbe", 142, 3],
  ] as [string, number, number][]) {
    recordMetric("sgtx_gov_adapter_calls_total", ok, { adapter, status: "ok" });
    recordMetric("sgtx_gov_adapter_calls_total", err, { adapter, status: "error" });
  }
  // PSP
  for (const [psp, ok, err] of [
    ["fawry", 312, 4],
    ["paymob", 187, 2],
    ["stripe", 89, 1],
    ["cbe_ipn", 42, 0],
  ] as [string, number, number][]) {
    recordMetric("sgtx_psp_intents_total", ok, { provider: psp, status: "ok" });
    recordMetric("sgtx_psp_intents_total", err, { provider: psp, status: "error" });
  }
  // Loom chain
  recordMetric("sgtx_loom_chain_length", 185, {}, { type: "gauge", help: "Current Loom chain length" });
  recordMetric("sgtx_loom_replay_mismatches", 0, {}, { type: "gauge", help: "Loom replay mismatches (last run)" });
  // HSM
  recordMetric("sgtx_hsm_keys_total", 10, { status: "active" }, { type: "gauge", help: "HSM keys by status" });
  recordMetric("sgtx_hsm_keys_total", 2, { status: "rotating" });
  // Incidents
  recordMetric("sgtx_incidents_open", 2, { severity: "P0" }, { type: "gauge", help: "Open incidents by severity" });
  recordMetric("sgtx_incidents_open", 5, { severity: "P1" });
  recordMetric("sgtx_incidents_open", 11, { severity: "P2" });
  // Uptime per service (gauge)
  for (const spec of SLA_SPECS) {
    recordMetric(
      "sgtx_service_availability",
      // simulate current availability slightly above target
      Math.min(0.99999, spec.availabilityTarget + 0.0001),
      { service: spec.service },
      { type: "gauge", help: "Service availability (rolling 24h)" },
    );
    recordMetric(
      "sgtx_service_p95_latency_ms",
      Math.round(spec.p95LatencyTargetMs * (0.7 + Math.random() * 0.5)),
      { service: spec.service },
      { type: "gauge", help: "Service p95 latency (ms, rolling 24h)" },
    );
  }
  // Build info
  recordMetric(
    "sgtx_build_info",
    1,
    { version: "v11.1.0", commit: "abcdef0", env: "dev" },
    { type: "gauge", help: "SGTX build info" },
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Prometheus exposition format
// ──────────────────────────────────────────────────────────────────────────

export function getPrometheusMetrics(): string {
  seedBaselineMetrics();
  const lines: string[] = [];

  // Sort metrics alphabetically for deterministic output
  const sortedNames = Array.from(metricStore.keys()).sort();
  for (const name of sortedNames) {
    const m = metricStore.get(name)!;
    lines.push(`# HELP ${name} ${m.help}`);
    lines.push(`# TYPE ${name} ${m.type}`);

    const samples = Array.from(m.samples.entries()).sort(([a], [b]) => a.localeCompare(b));
    for (const [labels, value] of samples) {
      const labelStr = labels ? `{${labels}}` : "";
      // Format number — integers as-is, floats with reasonable precision
      const formatted = Number.isInteger(value) ? String(value) : value.toFixed(4);
      lines.push(`${name}${labelStr} ${formatted}`);
    }
  }

  return lines.join("\n") + "\n";
}

// ──────────────────────────────────────────────────────────────────────────
// SLA status (Part 15.1)
// ──────────────────────────────────────────────────────────────────────────

function pseudoRandom(seed: number): number {
  // Deterministic 0..1 from a seed (so the same service always has the same
  // current availability on each call within the same process lifecycle)
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function serviceStatus(
  current: number,
  target: number,
): SLAStatus {
  if (current < target) return "BREACHED";
  // AT_RISK if within 0.05% of target
  if (current - target < 0.0005) return "AT_RISK";
  return "MEETING";
}

function trendFor(serviceIndex: number): "IMPROVING" | "STABLE" | "DEGRADING" {
  const r = pseudoRandom(serviceIndex * 7 + 3);
  if (r < 0.3) return "IMPROVING";
  if (r < 0.8) return "STABLE";
  return "DEGRADING";
}

export async function getSLAStatus(window: "24h" | "7d" | "30d" = "24h"): Promise<SLAStatusResult> {
  const services: ServiceSLA[] = SLA_SPECS.map((spec, i) => {
    // Simulate current availability — most services meet target, a few breach
    const r = pseudoRandom(i * 13 + (window === "24h" ? 1 : window === "7d" ? 7 : 30));
    // 70% MEETING, 20% AT_RISK, 10% BREACHED
    let current: number;
    if (r < 0.1) {
      current = spec.availabilityTarget - 0.0005 - r * 0.001; // below target
    } else if (r < 0.3) {
      current = spec.availabilityTarget + (r - 0.2) * 0.002; // close to target
    } else {
      current = Math.min(0.99999, spec.availabilityTarget + 0.0003 + r * 0.0002);
    }
    const status = serviceStatus(current, spec.availabilityTarget);
    const p95 = Math.round(spec.p95LatencyTargetMs * (0.6 + r * 0.8));
    return {
      service: spec.service,
      availabilityTarget: spec.availabilityTarget,
      currentAvailability: current,
      p95LatencyTargetMs: spec.p95LatencyTargetMs,
      currentP95LatencyMs: p95,
      rtoMinutes: spec.rtoMinutes,
      rpoSeconds: spec.rpoSeconds,
      monthlyCreditPct: spec.monthlyCreditPct,
      status,
      region: spec.region,
      measuredAt: new Date().toISOString(),
      trend: trendFor(i),
    };
  });

  const overallAvailability =
    services.reduce((s, x) => s + x.currentAvailability, 0) / services.length;
  const overallStatus: SLAStatus =
    services.some((s) => s.status === "BREACHED")
      ? "BREACHED"
      : services.some((s) => s.status === "AT_RISK")
        ? "AT_RISK"
        : "MEETING";

  // Compute credits owed
  const creditsOwed: SLACredit[] = [];
  for (const s of services) {
    if (s.status === "BREACHED") {
      const breachType: SLACredit["breachType"] =
        s.currentAvailability < s.availabilityTarget ? "AVAILABILITY" : "LATENCY";
      creditsOwed.push({
        service: s.service,
        breachType,
        targetValue:
          breachType === "AVAILABILITY"
            ? (s.availabilityTarget * 100).toFixed(4) + "%"
            : `${s.p95LatencyTargetMs}ms`,
        actualValue:
          breachType === "AVAILABILITY"
            ? (s.currentAvailability * 100).toFixed(4) + "%"
            : `${s.currentP95LatencyMs}ms`,
        creditPct: s.monthlyCreditPct,
        affectedTrades: Math.floor(pseudoRandom(services.indexOf(s) + 1) * 50) + 1,
        detectedAt: new Date(Date.now() - 3600_000).toISOString(),
      });
    }
  }

  // Persist a SlaMetric snapshot for trend analysis (best-effort)
  try {
    for (const s of services) {
      await freshDb.slaMetric.create({
        data: {
          component: s.service.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, ""),
          availabilityPct: s.currentAvailability * 100,
          p95LatencyMs: s.currentP95LatencyMs,
          errorRatePct: (1 - s.currentAvailability) * 100,
          uptimeWindow: window,
        },
      });
    }
  } catch (e) {
    // Persistence failure must not break SLA reporting
    logger.error("[monitoring/getSLAStatus] SlaMetric persist failed:", e);
  }

  return {
    services,
    overallAvailability,
    overallStatus,
    creditsOwed,
    totalCreditPct: creditsOwed.reduce((s, c) => s + c.creditPct, 0),
    measuredAt: new Date().toISOString(),
    measurementWindow: window,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Uptime history (per-service synthetic probes)
// ──────────────────────────────────────────────────────────────────────────

export function getUptimeHistory(
  service?: string,
  hours: number = 24,
): UptimeHistory | { services: UptimeHistory[] } {
  if (service) {
    return buildUptimeHistoryFor(service, hours);
  }
  // Return all services
  return {
    services: SLA_SPECS.map((s) => buildUptimeHistoryFor(s.service, hours)),
  };
}

function buildUptimeHistoryFor(service: string, hours: number): UptimeHistory {
  const spec = SLA_SPECS.find((s) => s.service === service) ?? SLA_SPECS[0];
  const idx = SLA_SPECS.indexOf(spec);
  const now = Date.now();
  const intervalMs = 5 * 60 * 1000; // 5-min probes
  const dataPoints: UptimeDataPoint[] = [];
  let totalRequests = 0;
  let failedRequests = 0;
  const latencies: number[] = [];

  for (let t = hours * 60; t >= 0; t -= 5) {
    const ts = new Date(now - t * 60 * 1000).toISOString();
    const probeIdx = idx * 1000 + t;
    const r = pseudoRandom(probeIdx);
    // Most probes succeed; ~1 in 200 fails for degraded services
    const available = r > 0.005;
    const region = REGIONS[idx % REGIONS.length];
    const latency = Math.round(spec.p95LatencyTargetMs * (0.4 + pseudoRandom(probeIdx + 0.5) * 0.8));
    latencies.push(latency);
    dataPoints.push({ timestamp: ts, available, latencyMs: latency, region });
    totalRequests += 100; // 100 synthetic probes per interval
    if (!available) failedRequests += 100;
  }

  latencies.sort((a, b) => a - b);
  const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? 0;
  const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? 0;
  const avg = latencies.reduce((s, x) => s + x, 0) / Math.max(1, latencies.length);
  const successful = dataPoints.filter((d) => d.available).length;
  const availabilityPct = (successful / dataPoints.length) * 100;

  return {
    service,
    windowHours: hours,
    dataPoints,
    availabilityPct: Math.round(availabilityPct * 10000) / 10000,
    avgLatencyMs: Math.round(avg),
    p95LatencyMs: p95,
    p99LatencyMs: p99,
    totalRequests,
    failedRequests,
    regions: REGIONS,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Alerts (Alertmanager view)
// ──────────────────────────────────────────────────────────────────────────

export function getAlerts(): AlertsResult {
  // Simulated alerts — 2 critical, 3 warning, 4 info
  const now = Date.now();
  const alerts: Alert[] = [
    {
      id: "ALT-FEELOCK-001",
      severity: "critical",
      service: "FeeLock KV",
      title: "FeeLock KV p99 latency above SLO",
      description:
        "FeeLock KV p99 latency at 87ms (SLO: 50ms). NATS JetStream consumer lag on the fee-lock consumer group.",
      firedAt: new Date(now - 12 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "critical", service: "fealock", team: "platform", runbook: "fee-lock-p99" },
      annotations: { summary: "FeeLock p99 latency breach", dashboard: "https://grafana.sgtx.io/d/fealock" },
      runbookUrl: "https://runbooks.sgtx.io/fealock-p99",
      silencesAvailable: true,
    },
    {
      id: "ALT-HSM-002",
      severity: "critical",
      service: "HSM",
      title: "HSM key rotation overdue",
      description:
        "HSM-GOV_ADAPTER_MTLS-ROOT-001 rotation overdue by 2 days. Egypt Trust CA root mTLS key requires 4-of-5 multisig rotation.",
      firedAt: new Date(now - 48 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "critical", service: "hsm", team: "security", runbook: "hsm-rotation" },
      annotations: { summary: "HSM key rotation overdue", dashboard: "https://grafana.sgtx.io/d/hsm" },
      runbookUrl: "https://runbooks.sgtx.io/hsm-rotation",
      silencesAvailable: false,
    },
    {
      id: "ALT-GOVADAPTER-003",
      severity: "warning",
      service: "Government Adapter Layer",
      title: "CBE adapter rate-limit approaching",
      description:
        "CBE adapter at 87% of rate-limit (30/min). 4 minutes of headroom remaining at current request rate.",
      firedAt: new Date(now - 4 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "warning", service: "cbe-adapter", team: "platform" },
      annotations: { summary: "CBE rate-limit near" },
      runbookUrl: "https://runbooks.sgtx.io/cbe-ratelimit",
      silencesAvailable: true,
    },
    {
      id: "ALT-INBOX-004",
      severity: "warning",
      service: "Smart Inbox",
      title: "Smart Inbox queue depth above warning threshold",
      description: "332 undismissed inbox items (warning threshold: 250). 6 P0/P1 items past SLA deadline.",
      firedAt: new Date(now - 35 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "warning", service: "inbox", team: "platform" },
      annotations: { summary: "Inbox queue depth high" },
      runbookUrl: "https://runbooks.sgtx.io/inbox-depth",
      silencesAvailable: true,
    },
    {
      id: "ALT-GOV-005",
      severity: "warning",
      service: "Governor Service",
      title: "Governor conditional rate above baseline",
      description: "Governor CONDITIONAL verdict rate at 25% (baseline: 15%). Indicates upstream data quality issue.",
      firedAt: new Date(now - 90 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "warning", service: "governor", team: "platform" },
      annotations: { summary: "Governor conditional rate elevated" },
      runbookUrl: "https://runbooks.sgtx.io/governor-conditional",
      silencesAvailable: true,
    },
    {
      id: "ALT-RELEASE-006",
      severity: "info",
      service: "Container Release API",
      title: "Release webhook delivery slow",
      description: "Shipping line webhook p95 delivery time at 850ms (SLO: 500ms). No action needed yet.",
      firedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "info", service: "release" },
      annotations: { summary: "Release webhook delivery slow" },
      runbookUrl: "https://runbooks.sgtx.io/release-webhook",
      silencesAvailable: true,
    },
    {
      id: "ALT-AI-007",
      severity: "info",
      service: "AI Orchestrator",
      title: "AI inference cost spike",
      description: "AI inference cost 35% above weekly average ($214 today vs $159 daily avg). Investigate tenant usage.",
      firedAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "info", service: "ai" },
      annotations: { summary: "AI cost spike" },
      runbookUrl: "https://runbooks.sgtx.io/ai-cost",
      silencesAvailable: true,
    },
    {
      id: "ALT-PSP-008",
      severity: "info",
      service: "Payment Orchestrator",
      title: "PSP webhook replay detected",
      description: "FAWRY webhook replayed 3 times in last hour (idempotency layer absorbed all).",
      firedAt: new Date(now - 30 * 60 * 1000).toISOString(),
      resolvedAt: null,
      status: "firing",
      labels: { severity: "info", service: "payment", provider: "fawry" },
      annotations: { summary: "PSP webhook replay" },
      runbookUrl: "https://runbooks.sgtx.io/psp-replay",
      silencesAvailable: true,
    },
    {
      id: "ALT-LOOM-009",
      severity: "info",
      service: "Loom Verifier",
      title: "Loom replay completed successfully",
      description: "Hourly Loom replay verifier ran in 1.2s, 0 mismatches across 185 decisions.",
      firedAt: new Date(now - 15 * 60 * 1000).toISOString(),
      resolvedAt: new Date(now - 14 * 60 * 1000).toISOString(),
      status: "resolved",
      labels: { severity: "info", service: "loom" },
      annotations: { summary: "Loom replay OK" },
      runbookUrl: "https://runbooks.sgtx.io/loom-replay",
      silencesAvailable: false,
    },
  ];

  const critical = alerts.filter((a) => a.severity === "critical" && a.status === "firing");
  const warning = alerts.filter((a) => a.severity === "warning" && a.status === "firing");
  const info = alerts.filter((a) => a.severity === "info" && a.status === "firing");

  return {
    critical,
    warning,
    info,
    totalFiring: critical.length + warning.length + info.length,
    totalCritical: critical.length,
    totalResolved24h: alerts.filter((a) => a.status === "resolved").length,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Status page (public — https://status.sgtx.io)
// ──────────────────────────────────────────────────────────────────────────

export async function getStatusPage(): Promise<StatusPage> {
  const sla = await getSLAStatus("24h");

  const services: ServiceStatus[] = SLA_SPECS.map((spec, i) => {
    const s = sla.services[i];
    let status: ServiceOperationalStatus;
    if (s.status === "MEETING") status = "OPERATIONAL";
    else if (s.status === "AT_RISK") status = "DEGRADED";
    else status = "PARTIAL_OUTAGE";

    // Most services have at least one region OPERATIONAL
    const regions = REGIONS.map((r, ri) => {
      const rStatus: ServiceOperationalStatus =
        ri === 1 && s.status === "BREACHED" ? "DEGRADED" : status;
      return {
        region: r,
        status: rStatus,
        latencyMs: Math.round(s.currentP95LatencyMs * (0.8 + pseudoRandom(i * 100 + ri) * 0.4)),
      };
    });

    return {
      service: spec.service,
      status,
      availability30d: Math.min(0.99999, s.currentAvailability + 0.0001),
      uptime90d: Math.min(0.99999, s.currentAvailability + 0.0002),
      lastIncidentAt: new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000).toISOString(),
      description: `${spec.service} — ${spec.region} primary. RTO ${spec.rtoMinutes}min, RPO ${spec.rpoSeconds}s.`,
      regions,
    };
  });

  const overall: "OPERATIONAL" | "DEGRADED" | "OUTAGE" =
    services.every((s) => s.status === "OPERATIONAL")
      ? "OPERATIONAL"
      : services.some((s) => s.status === "MAJOR_OUTAGE" || s.status === "PARTIAL_OUTAGE")
        ? "OUTAGE"
        : "DEGRADED";

  const activeIncidents: StatusIncident[] = [
    {
      id: "INC-STATUS-001",
      title: "FeeLock KV elevated latency",
      severity: "minor",
      status: "monitoring",
      affectedServices: ["FeeLock KV"],
      startedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      resolvedAt: null,
      updates: [
        {
          timestamp: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
          message: "Detected elevated p99 latency on FeeLock KV. Investigating NATS consumer lag.",
          status: "investigating",
        },
        {
          timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
          message: "Root cause identified — NATS JetStream consumer backlog. Scaling consumers.",
          status: "identified",
        },
        {
          timestamp: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
          message: "Consumer scaling applied. Latency trending down. Monitoring.",
          status: "monitoring",
        },
      ],
    },
  ];

  const lastIncident = activeIncidents[0] ?? null;

  // Pull any scheduled maintenance from DB
  let upcomingMaintenance: StatusPage["upcomingMaintenance"] = [];
  try {
    const rows = await freshDb.maintenanceWindow.findMany({
      where: { status: "SCHEDULED" },
      orderBy: { scheduledStart: "asc" },
      take: 5,
    });
    upcomingMaintenance = rows.map((r: any) => {
      let affected: string[] = [];
      try {
        affected = r.affectedComponents ? JSON.parse(r.affectedComponents) : [];
      } catch {
        affected = [];
      }
      return {
        id: r.id,
        title: r.title,
        description: r.description,
        scheduledStart: r.scheduledStart.toISOString(),
        scheduledEnd: r.scheduledEnd.toISOString(),
        affectedServices: affected,
      };
    });
  } catch (e) {
    logger.error("[monitoring/getStatusPage] maintenance lookup failed:", e);
  }

  return {
    overall,
    services,
    lastIncident,
    activeIncidents,
    upcomingMaintenance,
    generatedAt: new Date().toISOString(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Combined dashboard (all data in one call)
// ──────────────────────────────────────────────────────────────────────────

export async function getMonitoringDashboard(): Promise<MonitoringDashboard> {
  const [sla, alerts, status] = await Promise.all([
    getSLAStatus("24h"),
    Promise.resolve(getAlerts()),
    getStatusPage(),
  ]);

  const operational = status.services.filter((s) => s.status === "OPERATIONAL").length;
  const degraded = status.services.filter((s) => s.status === "DEGRADED").length;
  const outage = status.services.filter(
    (s) => s.status === "PARTIAL_OUTAGE" || s.status === "MAJOR_OUTAGE",
  ).length;
  const p95Avg = Math.round(
    sla.services.reduce((s, x) => s + x.currentP95LatencyMs, 0) / sla.services.length,
  );

  return {
    sla,
    alerts,
    status,
    metrics: {
      totalServices: status.services.length,
      operationalServices: operational,
      degradedServices: degraded,
      outageServices: outage,
      criticalAlerts: alerts.critical.length,
      warningAlerts: alerts.warning.length,
      p95LatencyAvgMs: p95Avg,
      overallAvailability: sla.overallAvailability,
      creditsOwedPct: sla.totalCreditPct,
    },
    generatedAt: new Date().toISOString(),
  };
}
