// SGTX Brain OS — Daily Worldwide Routes Sync Scheduler
// =============================================================================
// A long-running scheduler that triggers `logistics.worldwide-routes-sync`
// once per day so the worldwide port routes database stays current with
// market drift applied.
//
// Lifecycle:
//   * `initDailyRoutesSyncCron()` — explicit entry point. Reads the latest
//     `WorldwideRoutesSyncLog` row; if it's older than 20h, fires the sync
//     immediately. Otherwise schedules the first tick for `lastSync + 24h`.
//     Either way, after the first tick a `setInterval(24h)` keeps the sync
//     running daily.
//   * `stopDailyRoutesSyncCron()` — clears the interval + any pending
//     one-shot timer. Idempotent.
//
// Each tick:
//   1. Invokes `brainOrchestrator.invoke("logistics.worldwide-routes-sync",
//      { source: "daily-cron", drift: 0.03 })` to refresh all routes.
//   2. Publishes `brain.worldwide-routes.daily-sync-completed` with the
//      sync summary.
//   3. Appends a `WorldwideRoutesSyncLog` row.
//   4. Emits a structured `logger.info(...)` line.
//
// IMPORTANT: the scheduler is NOT auto-started on import. Next.js would
// spin it up on every worker. The orchestrator's `initialize()` calls
// `initDailyRoutesSyncCron()` explicitly, and the `/api/sgtx/worldwide-routes/cron`
// route exposes status + manual-trigger for operators.
// =============================================================================

import { db } from "@/lib/db";
import { brainOrchestrator } from "../core/orchestrator";
import { eventBus } from "../core/event-bus";
import { logger } from "../observability/structured-logging";

/** 24-hour interval between scheduled syncs. */
const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
/** If the last sync log is older than this, fire immediately on init. */
const STALE_THRESHOLD_MS = 20 * 60 * 60 * 1000;

/** Status snapshot returned by `getDailySyncStatus()`. */
export interface DailySyncStatus {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastDurationMs: number | null;
  lastRoutesCount: number | null;
  lastErrors: string[];
  isRunning: boolean;
}

/** The shape of a WorldwideRoutesSyncLog row (schema defined by Task 1-A). */
interface SyncLogRow {
  id?: string;
  syncedAt: Date | string;
  routesCount: number;
  linesCount?: number;
  portsCount?: number;
  errors: string;
  durationMs: number;
  driftApplied?: number;
  brainLearningUpdates?: number;
}

/** Pull a sync-relevant count from a Brain invoke result. */
function extractRoutesCount(result: unknown): number | null {
  if (!result || typeof result !== "object") return null;
  const r = result as Record<string, unknown>;
  for (const key of ["routesCount", "totalRoutes", "syncedRoutes", "count", "updated"]) {
    const v = r[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  // Some orchestrators return a nested `summary`.
  const summary = r.summary;
  if (summary && typeof summary === "object") {
    const s = summary as Record<string, unknown>;
    for (const key of ["routesCount", "totalRoutes", "syncedRoutes", "count", "updated"]) {
      const v = s[key];
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
  }
  return null;
}

/** Pull an errors array from a Brain invoke result. */
function extractErrors(result: unknown): string[] {
  if (!result || typeof result !== "object") return [];
  const r = result as Record<string, unknown>;
  const candidates = [r.errors, (r.summary as Record<string, unknown> | undefined)?.errors];
  for (const c of candidates) {
    if (Array.isArray(c)) {
      return c.map((e) => (typeof e === "string" ? e : String(e)));
    }
  }
  return [];
}

class DailyRoutesSyncCronImpl {
  private intervalTimer: NodeJS.Timeout | null = null;
  private oneShotTimer: NodeJS.Timeout | null = null;
  private started = false;
  private isRunning = false;

  private lastSyncAt: string | null = null;
  private nextSyncAt: string | null = null;
  private lastDurationMs: number | null = null;
  private lastRoutesCount: number | null = null;
  private lastErrors: string[] = [];

  /**
   * Explicit entry point — called by the Brain orchestrator's
   * `initialize()` (or manually by an operator via the cron route).
   *
   * Idempotent. Reads the latest sync log; if it's older than 20h (or
   * there is no prior log), fires the sync immediately. Otherwise
   * schedules the first tick for `lastSync + 24h`. Either way, after the
   * first tick a `setInterval(24h)` keeps the sync running daily.
   */
  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    let initialDelayMs = 0;
    try {
      const latest = await (db as unknown as {
        worldwideRoutesSyncLog: {
          findFirst: (args: unknown) => Promise<SyncLogRow | null>;
        };
      }).worldwideRoutesSyncLog.findFirst({
        orderBy: { syncedAt: "desc" },
      });

      if (latest) {
        const lastSyncMs = new Date(latest.syncedAt).getTime();
        const ageMs = Date.now() - lastSyncMs;
        this.lastSyncAt = new Date(lastSyncMs).toISOString();
        this.lastDurationMs = latest.durationMs;
        this.lastRoutesCount = latest.routesCount;
        try {
          this.lastErrors = latest.errors ? JSON.parse(latest.errors) : [];
        } catch {
          this.lastErrors = [];
        }
        if (ageMs >= STALE_THRESHOLD_MS) {
          // Stale — fire now.
          initialDelayMs = 0;
        } else {
          // Fresh — schedule for lastSync + 24h.
          initialDelayMs = Math.max(0, SYNC_INTERVAL_MS - ageMs);
        }
      } else {
        // No prior log — fire now.
        initialDelayMs = 0;
      }
    } catch (err) {
      // DB read failure (e.g. table not yet created by Task 1-A) — fall
      // back to firing immediately and let the sync itself surface any
      // deeper errors.
      logger.warn("daily-routes-sync: could not read latest sync log", {
        component: "daily-routes-sync",
        error: err instanceof Error ? err.message : String(err),
      });
      initialDelayMs = 0;
    }

    this.scheduleNext(initialDelayMs);
    logger.info("daily-routes-sync: scheduler initialized", {
      component: "daily-routes-sync",
      initialDelayMs,
      lastSyncAt: this.lastSyncAt,
    });
  }

  /**
   * Schedule the next tick. If `delayMs` is 0, fire immediately. After
   * the first tick, a `setInterval(24h)` keeps the sync running daily.
   */
  private scheduleNext(delayMs: number): void {
    if (this.oneShotTimer) {
      clearTimeout(this.oneShotTimer);
      this.oneShotTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.nextSyncAt = new Date(Date.now() + delayMs).toISOString();
    // First tick — one-shot. Inside the tick we install the recurring
    // setInterval so subsequent ticks run on a clean 24h cadence.
    this.oneShotTimer = setTimeout(() => {
      void this.tick().catch((err) => {
        logger.error("daily-routes-sync: initial tick failed", {
          component: "daily-routes-sync",
          error: err instanceof Error ? err.message : String(err),
        });
      });
      // After the first tick fires, install the recurring interval.
      if (!this.intervalTimer) {
        this.intervalTimer = setInterval(() => {
          void this.tick().catch((err) => {
            logger.error("daily-routes-sync: recurring tick failed", {
              component: "daily-routes-sync",
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }, SYNC_INTERVAL_MS);
      }
    }, delayMs);
  }

  /** Stop the scheduler. Idempotent. */
  stop(): void {
    if (this.oneShotTimer) {
      clearTimeout(this.oneShotTimer);
      this.oneShotTimer = null;
    }
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = null;
    }
    this.started = false;
    this.nextSyncAt = null;
    logger.info("daily-routes-sync: scheduler stopped", {
      component: "daily-routes-sync",
    });
  }

  /** Whether `init()` has been called. */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Execute one sync tick. Safe to call manually (the cron route does so
   * on POST). Re-entrant guard prevents overlapping runs.
   *
   * Returns the Brain invoke result + the duration so callers can surface
   * the sync summary to the client.
   */
  async tick(): Promise<{ result: unknown; durationMs: number }> {
    if (this.isRunning) {
      logger.warn("daily-routes-sync: tick skipped (already running)", {
        component: "daily-routes-sync",
      });
      return { result: null, durationMs: 0 };
    }
    this.isRunning = true;
    const start = Date.now();
    let result: unknown = null;
    try {
      result = await brainOrchestrator.invoke("logistics.worldwide-routes-sync", {
        source: "daily-cron",
        drift: 0.03,
      });
      const durationMs = Date.now() - start;
      const routesCount = extractRoutesCount(result);
      const errors = extractErrors(result);
      this.lastSyncAt = new Date().toISOString();
      this.lastDurationMs = durationMs;
      this.lastRoutesCount = routesCount;
      this.lastErrors = errors;
      this.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();

      // Publish the daily-sync-completed event for downstream consumers
      // (dashboards, the worldwide-routes-learner, etc.).
      try {
        await eventBus.publish(
          "brain.worldwide-routes.daily-sync-completed",
          "worldwide-routes",
          {
            source: "daily-cron",
            durationMs,
            routesCount,
            errors,
            result: result && typeof result === "object"
              ? (result as Record<string, unknown>)
              : { value: result },
          },
          { source: "daily-routes-sync" },
        );
      } catch (publishErr) {
        logger.warn("daily-routes-sync: event publish failed", {
          component: "daily-routes-sync",
          error: publishErr instanceof Error ? publishErr.message : String(publishErr),
        });
      }

      // Persist a sync log row. The schema (defined by Task 1-A) uses
      // `syncedAt` (default now()), `routesCount`, `errors`, `durationMs`,
      // `driftApplied`, `brainLearningUpdates`, plus optional `linesCount`
      // and `portsCount`. We pull whatever the Brain result carries and
      // fall back to safe defaults.
      try {
        const linesCount =
          typeof (result as Record<string, unknown> | null)?.linesCount === "number"
            ? (result as { linesCount: number }).linesCount
            : typeof (result as { summary?: { linesCount?: number } } | null)
                ?.summary?.linesCount === "number"
              ? (result as { summary: { linesCount: number } }).summary.linesCount
              : 0;
        const portsCount =
          typeof (result as Record<string, unknown> | null)?.portsCount === "number"
            ? (result as { portsCount: number }).portsCount
            : typeof (result as { summary?: { portsCount?: number } } | null)
                ?.summary?.portsCount === "number"
              ? (result as { summary: { portsCount: number } }).summary.portsCount
              : 0;
        await (db as unknown as {
          worldwideRoutesSyncLog: {
            create: (args: unknown) => Promise<unknown>;
          };
        }).worldwideRoutesSyncLog.create({
          data: {
            routesCount: routesCount ?? 0,
            linesCount,
            portsCount,
            errors: JSON.stringify(errors),
            durationMs,
            driftApplied: 0.03,
            brainLearningUpdates: 0,
          },
        });
      } catch (dbErr) {
        // Persistence failure is non-fatal — the in-memory status is
        // still updated and the event was still published.
        logger.warn("daily-routes-sync: could not persist sync log", {
          component: "daily-routes-sync",
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      logger.info("worldwide-routes daily sync completed", {
        component: "daily-routes-sync",
        durationMs,
        routesCount,
        errorsCount: errors.length,
        nextSyncAt: this.nextSyncAt,
      });

      return { result, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      this.lastSyncAt = new Date().toISOString();
      this.lastDurationMs = durationMs;
      this.lastRoutesCount = null;
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.lastErrors = [errorMessage];
      this.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
      logger.error("worldwide-routes daily sync failed", {
        component: "daily-routes-sync",
        error: errorMessage,
        durationMs,
      });
      // Re-throw so manual callers (POST /cron) can surface the error.
      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  /** Return a snapshot of the scheduler's current state. */
  getStatus(): DailySyncStatus {
    return {
      lastSyncAt: this.lastSyncAt,
      nextSyncAt: this.nextSyncAt,
      lastDurationMs: this.lastDurationMs,
      lastRoutesCount: this.lastRoutesCount,
      lastErrors: this.lastErrors,
      isRunning: this.isRunning,
    };
  }
}

/** Singleton scheduler. NOT auto-started — call `initDailyRoutesSyncCron()`. */
export const dailyRoutesSyncCron = new DailyRoutesSyncCronImpl();

/**
 * Explicit init function the orchestrator calls from `initialize()`.
 * Idempotent — safe to call from multiple workers; each worker gets its
 * own in-memory scheduler, but the sync itself is guarded by the
 * `isRunning` flag and persists its result to the shared
 * `WorldwideRoutesSyncLog` table.
 */
export async function initDailyRoutesSyncCron(): Promise<void> {
  await dailyRoutesSyncCron.init();
}

/** Stop the daily routes sync scheduler. Idempotent. */
export function stopDailyRoutesSyncCron(): void {
  dailyRoutesSyncCron.stop();
}

/** Start alias (kept for symmetry with `stopDailyRoutesSyncCron`). */
export async function startDailyRoutesSyncCron(): Promise<void> {
  await initDailyRoutesSyncCron();
}

/**
 * Status accessor exposed at module scope for the cron route. Equivalent to
 * `dailyRoutesSyncCron.getStatus()` — provided so callers can import a
 * function named per the task spec (`getDailySyncStatus`).
 */
export function getDailySyncStatus(): DailySyncStatus {
  return dailyRoutesSyncCron.getStatus();
}
