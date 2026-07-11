// SGTX Brain OS — Health Monitor
// =============================================================================
// Background health monitor that polls every registered Brain module on a
// fixed cadence (default 30s) and auto-restarts modules that have failed
// `failureThreshold` consecutive health checks (default 2).
//
// The monitor is intentionally conservative:
//   * A module that returns `{ healthy: false }` twice in a row is restarted
//     via `module.initialize?.()`. Restart is best-effort — failures are
//     logged but never crash the monitor loop.
//   * If a module lacks `healthCheck`, it is treated as healthy.
//   * The monitor never blocks the event loop: each tick awaits all probes
//     in parallel and persists results to in-memory history (capped at 200).
//
// API:
//   healthMonitor.start()      → kicks off the polling loop (idempotent)
//   healthMonitor.stop()       → stops the loop and clears the timer
//   healthMonitor.snapshot()   → latest per-module health + global status
//   healthMonitor.history(id?) → recent probe results
// =============================================================================

import type { BrainModule } from "../core/types";
import { moduleRegistry } from "../core/module-registry";
import { eventBus } from "../core/event-bus";
import { logger } from "../observability/structured-logging";
import { metrics } from "../observability/metrics";

export interface ModuleHealth {
  moduleId: string;
  healthy: boolean;
  latencyMs: number;
  error?: string;
  probedAt: string;
  consecutiveFailures: number;
  lastRestartAt: string | null;
  restartCount: number;
}

export interface HealthSnapshot {
  overall: "healthy" | "degraded" | "unhealthy";
  polledAt: string;
  totalModules: number;
  healthy: number;
  unhealthy: number;
  modules: ModuleHealth[];
}

interface HealthMonitorOptions {
  pollIntervalMs?: number;
  failureThreshold?: number;
  historyPerModule?: number;
}

const DEFAULTS: Required<HealthMonitorOptions> = {
  pollIntervalMs: 30_000,
  failureThreshold: 2,
  historyPerModule: 50,
};

class HealthMonitorImpl {
  private opts: Required<HealthMonitorOptions> = { ...DEFAULTS };
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private inFlight = false;

  private readonly state = new Map<string, ModuleHealth>();
  private readonly historyMap = new Map<string, ModuleHealth[]>();
  private lastSnapshot: HealthSnapshot | null = null;

  /** Allow callers (tests, ops dashboards) to override defaults. */
  configure(opts: HealthMonitorOptions): void {
    this.opts = { ...this.opts, ...opts };
  }

  /** Begin polling. Safe to call multiple times. */
  start(): void {
    if (this.running) return;
    this.running = true;
    // Fire the first probe immediately so dashboards light up at startup.
    this.tick().catch(() => { /* non-blocking */ });
    this.timer = setInterval(() => {
      this.tick().catch(() => { /* non-blocking */ });
    }, this.opts.pollIntervalMs);
    if (typeof this.timer.unref === "function") this.timer.unref();
    logger.info("HealthMonitor started", {
      component: "health-monitor",
      pollIntervalMs: this.opts.pollIntervalMs,
      failureThreshold: this.opts.failureThreshold,
    });
  }

  /** Stop polling. Safe to call when not running. */
  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** True if the polling loop is currently active. */
  isRunning(): boolean {
    return this.running;
  }

  /** Latest snapshot. Returns a synthetic unhealthy snapshot if never polled. */
  snapshot(): HealthSnapshot {
    if (this.lastSnapshot) return this.lastSnapshot;
    return {
      overall: "unhealthy",
      polledAt: new Date().toISOString(),
      totalModules: 0,
      healthy: 0,
      unhealthy: 0,
      modules: [],
    };
  }

  /** Per-module history (newest first), capped at `historyPerModule`. */
  history(moduleId?: string): ModuleHealth[] {
    if (moduleId) return (this.historyMap.get(moduleId) ?? []).slice().reverse();
    const all: ModuleHealth[] = [];
    for (const arr of this.historyMap.values()) all.push(...arr);
    return all.sort((a, b) => b.probedAt.localeCompare(a.probedAt));
  }

  /** Force a single probe cycle outside the polling cadence. */
  async probeNow(): Promise<HealthSnapshot> {
    return this.tick();
  }

  // -------------------------------------------------------------------
  private async tick(): Promise<HealthSnapshot> {
    if (this.inFlight) return this.snapshot();
    this.inFlight = true;
    try {
      const modules = moduleRegistry.listModules().map((m) => moduleRegistry.getModule(m.id)).filter(Boolean) as BrainModule[];
      const probes = await Promise.allSettled(
        modules.map((mod) => this.probeModule(mod)),
      );

      let healthy = 0;
      let unhealthy = 0;
      const modulesHealth: ModuleHealth[] = [];
      probes.forEach((p, i) => {
        const mod = modules[i]!;
        const result = this.state.get(mod.id) ?? this.makeInitial(mod.id);
        modulesHealth.push(result);
        if (result.healthy) healthy++;
        else unhealthy++;
      });

      const overall: HealthSnapshot["overall"] =
        unhealthy === 0 ? "healthy" : unhealthy < healthy ? "degraded" : "unhealthy";
      const snapshot: HealthSnapshot = {
        overall,
        polledAt: new Date().toISOString(),
        totalModules: modules.length,
        healthy,
        unhealthy,
        modules: modulesHealth,
      };
      this.lastSnapshot = snapshot;

      metrics.gauge("brain_health_modules_total", modules.length);
      metrics.gauge("brain_health_healthy_total", healthy);
      metrics.gauge("brain_health_unhealthy_total", unhealthy);

      await eventBus.publish("brain.health.snapshot", "brain", snapshot, {
        source: "health-monitor",
      }).catch(() => { /* non-blocking */ });

      return snapshot;
    } finally {
      this.inFlight = false;
    }
  }

  private async probeModule(mod: BrainModule): Promise<ModuleHealth> {
    const prev = this.state.get(mod.id) ?? this.makeInitial(mod.id);
    let healthy = true;
    let latencyMs = 0;
    let error: string | undefined;

    if (typeof mod.healthCheck === "function") {
      try {
        const probe = await mod.healthCheck();
        healthy = Boolean(probe?.healthy);
        latencyMs = probe?.latencyMs ?? 0;
      } catch (err) {
        healthy = false;
        error = (err as Error).message;
      }
    }

    const consecutiveFailures = healthy ? 0 : prev.consecutiveFailures + 1;
    const updated: ModuleHealth = {
      moduleId: mod.id,
      healthy,
      latencyMs,
      error,
      probedAt: new Date().toISOString(),
      consecutiveFailures,
      lastRestartAt: prev.lastRestartAt,
      restartCount: prev.restartCount,
    };
    this.state.set(mod.id, updated);
    this.pushHistory(mod.id, updated);

    metrics.gauge("brain_module_health", healthy ? 1 : 0, { moduleId: mod.id });
    metrics.observe("brain_module_probe_latency_ms", latencyMs, { moduleId: mod.id });

    if (!healthy && consecutiveFailures >= this.opts.failureThreshold) {
      await this.restartModule(mod);
    }
    return updated;
  }

  private async restartModule(mod: BrainModule): Promise<void> {
    const prev = this.state.get(mod.id);
    if (!prev) return;
    try {
      logger.warn(`HealthMonitor: restarting module "${mod.id}" after ${prev.consecutiveFailures} failures`, {
        component: "health-monitor",
        moduleId: mod.id,
        lastError: prev.error,
      });
      if (typeof mod.initialize === "function") await mod.initialize();
      const restarted: ModuleHealth = {
        ...prev,
        lastRestartAt: new Date().toISOString(),
        restartCount: prev.restartCount + 1,
        consecutiveFailures: 0,
        healthy: true,
        error: undefined,
      };
      this.state.set(mod.id, restarted);
      metrics.increment("brain_module_restarts_total", 1, { moduleId: mod.id });
      await eventBus.publish("brain.health.module-restarted", mod.id, {
        moduleId: mod.id,
        restartCount: restarted.restartCount,
      }, { source: "health-monitor" }).catch(() => { /* non-blocking */ });
    } catch (err) {
      logger.error(`HealthMonitor: restart failed for "${mod.id}"`, {
        component: "health-monitor",
        moduleId: mod.id,
        error: (err as Error).message,
      });
    }
  }

  private makeInitial(moduleId: string): ModuleHealth {
    return {
      moduleId,
      healthy: true,
      latencyMs: 0,
      probedAt: new Date().toISOString(),
      consecutiveFailures: 0,
      lastRestartAt: null,
      restartCount: 0,
    };
  }

  private pushHistory(moduleId: string, h: ModuleHealth): void {
    const arr = this.historyMap.get(moduleId) ?? [];
    arr.push(h);
    if (arr.length > this.opts.historyPerModule) arr.shift();
    this.historyMap.set(moduleId, arr);
  }
}

/** Singleton health monitor. */
export const healthMonitor = new HealthMonitorImpl();
export { HealthMonitorImpl as HealthMonitor };
