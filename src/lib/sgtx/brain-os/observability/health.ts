// SGTX Brain OS — Aggregate Health Check
// =============================================================================
// Aggregates health signals from every Brain sub-system into a single
// `/healthz`-style payload.
//
// Probes (all run in parallel, with a 5s timeout each):
//   * EventBus          — subscriber count + back-pressure state
//   * ModuleRegistry    — count of registered/active/failed modules
//   * LearningLoop      — feedback volume + accuracy rate
//   * ProviderRouter    — adapter availability (ZAI / Local / Static)
//   * PostgresEventStore— DB row count + readiness
//   * CircuitBreaker    — number of open circuits
//   * HealthMonitor     — latest snapshot (if running)
//
// Overall verdict:
//   "healthy"   — every probe reports healthy / ok
//   "degraded"  — at least one probe reports degraded or a non-critical failure
//   "unhealthy" — a critical probe (EventBus, ModuleRegistry, PostgresEventStore)
//                 reports unhealthy
// =============================================================================

import { eventBus } from "../core/event-bus";
import { moduleRegistry } from "../core/module-registry";
import { learningLoop } from "../learning/learning-loop";
import { providerRouter } from "../adapters/provider-router";
import { postgresEventStore } from "../storage/postgres-event-store";
import { circuitBreaker } from "../self-healing/circuit-breaker";
import { healthMonitor } from "../self-healing/health-monitor";
import { logger } from "./structured-logging";

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export interface ProbeResult {
  name: string;
  status: HealthStatus;
  critical: boolean;
  latencyMs: number;
  details?: Record<string, unknown>;
  error?: string;
}

export interface HealthReport {
  status: HealthStatus;
  generatedAt: string;
  uptimeMs: number;
  version: string;
  probes: ProbeResult[];
}

const VERSION = "brain-os-1.0.0";
const PROBE_TIMEOUT_MS = 5_000;
const startedAt = Date.now();

async function withTimeout<T>(p: Promise<T>, ms = PROBE_TIMEOUT_MS): Promise<T> {
  return Promise.race<T>([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`probe timeout after ${ms}ms`)), ms),
    ),
  ]);
}

function statusFromBooleans(healthy: boolean, critical: boolean): HealthStatus {
  if (healthy) return "healthy";
  return critical ? "unhealthy" : "degraded";
}

class HealthCheckImpl {
  private startedAt = startedAt;

  /** Run every probe and return the aggregate report. */
  async check(): Promise<HealthReport> {
    const probes = await Promise.all([
      this.probeEventBus(),
      this.probeModuleRegistry(),
      this.probeLearningLoop(),
      this.probeProviderRouter(),
      this.probeEventStore(),
      this.probeCircuitBreaker(),
      this.probeHealthMonitor(),
    ]);

    const anyCritical = probes.some((p) => p.critical && p.status === "unhealthy");
    const anyDegraded = probes.some((p) => p.status === "degraded" || p.status === "unhealthy");
    const status: HealthStatus = anyCritical ? "unhealthy" : anyDegraded ? "degraded" : "healthy";

    const report: HealthReport = {
      status,
      generatedAt: new Date().toISOString(),
      uptimeMs: Date.now() - this.startedAt,
      version: VERSION,
      probes,
    };

    if (status !== "healthy") {
      logger.warn(`Brain OS health=${status}`, {
        component: "health",
        status,
        unhealthy: probes.filter((p) => p.status !== "healthy").map((p) => p.name),
      });
    }
    return report;
  }

  /** Convenience: true when every critical probe is healthy. */
  async ok(): Promise<boolean> {
    const r = await this.check();
    return r.status !== "unhealthy";
  }

  // --- individual probes ---------------------------------------------
  private async probeEventBus(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const metrics = eventBus.getMetrics();
      const healthy = metrics.inFlight < 4500; // back-pressure threshold = 5000
      return {
        name: "event-bus",
        status: statusFromBooleans(healthy, true),
        critical: true,
        latencyMs: Date.now() - start,
        details: metrics,
      };
    } catch (err) {
      return { name: "event-bus", status: "unhealthy", critical: true, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeModuleRegistry(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const modules = moduleRegistry.listModules();
      const failed = modules.filter((m) => m.status === "failed").length;
      const active = modules.filter((m) => m.status === "active").length;
      const healthy = failed === 0 || active > 0; // some modules may fail at boot
      return {
        name: "module-registry",
        status: statusFromBooleans(healthy, true),
        critical: true,
        latencyMs: Date.now() - start,
        details: { total: modules.length, active, failed, capabilities: moduleRegistry.listCapabilities().length },
      };
    } catch (err) {
      return { name: "module-registry", status: "unhealthy", critical: true, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeLearningLoop(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const m = learningLoop.getAccuracyMetrics();
      const healthy = m.total === 0 || m.accuracyRate >= 0.5;
      return {
        name: "learning-loop",
        status: statusFromBooleans(healthy, false),
        critical: false,
        latencyMs: Date.now() - start,
        details: m,
      };
    } catch (err) {
      return { name: "learning-loop", status: "degraded", critical: false, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeProviderRouter(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const snap = await withTimeout(providerRouter.health());
      const available = snap.filter((a) => a.available).length;
      // Healthy if the static fallback is available (it always is) — degraded
      // if ZAI is down because callers may not realise they're getting rules.
      const zaiOk = snap.find((a) => a.id === "zai")?.available ?? false;
      const status: HealthStatus = zaiOk ? "healthy" : available > 0 ? "degraded" : "unhealthy";
      return {
        name: "provider-router",
        status,
        critical: false,
        latencyMs: Date.now() - start,
        details: { adapters: snap, available },
      };
    } catch (err) {
      return { name: "provider-router", status: "degraded", critical: false, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeEventStore(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const ready = postgresEventStore.isReady();
      let count: number | undefined;
      let error: string | undefined = postgresEventStore.getInitError() ?? undefined;
      if (!ready) {
        try {
          await withTimeout(postgresEventStore.initialize());
        } catch (err) {
          error = (err as Error).message;
        }
      }
      try {
        count = await withTimeout(postgresEventStore.count());
      } catch (err) {
        error = (err as Error).message;
      }
      const healthy = error === undefined;
      return {
        name: "event-store",
        status: statusFromBooleans(healthy, true),
        critical: true,
        latencyMs: Date.now() - start,
        details: { ready: postgresEventStore.isReady(), totalEvents: count },
        error,
      };
    } catch (err) {
      return { name: "event-store", status: "unhealthy", critical: true, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeCircuitBreaker(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const snap = circuitBreaker.snapshot();
      const open = snap.filter((c) => c.state === "open").length;
      const halfOpen = snap.filter((c) => c.state === "half-open").length;
      const healthy = open === 0;
      const status: HealthStatus = healthy ? "healthy" : halfOpen > 0 || open <= 2 ? "degraded" : "unhealthy";
      return {
        name: "circuit-breaker",
        status,
        critical: false,
        latencyMs: Date.now() - start,
        details: { total: snap.length, open, halfOpen, closed: snap.length - open - halfOpen },
      };
    } catch (err) {
      return { name: "circuit-breaker", status: "degraded", critical: false, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }

  private async probeHealthMonitor(): Promise<ProbeResult> {
    const start = Date.now();
    try {
      const snap = healthMonitor.snapshot();
      const healthy = snap.overall === "healthy";
      const status: HealthStatus = healthy ? "healthy" : snap.overall === "degraded" ? "degraded" : "unhealthy";
      return {
        name: "health-monitor",
        status,
        critical: false,
        latencyMs: Date.now() - start,
        details: {
          running: healthMonitor.isRunning(),
          overall: snap.overall,
          totalModules: snap.totalModules,
          healthyModules: snap.healthy,
          unhealthyModules: snap.unhealthy,
          polledAt: snap.polledAt,
        },
      };
    } catch (err) {
      return { name: "health-monitor", status: "degraded", critical: false, latencyMs: Date.now() - start, error: (err as Error).message };
    }
  }
}

/** Singleton aggregate health check. */
export const health = new HealthCheckImpl();
export { HealthCheckImpl as HealthCheck };
