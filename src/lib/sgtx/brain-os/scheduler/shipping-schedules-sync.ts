// SGTX Brain OS — Shipping Schedules Sync Scheduler
// =============================================================================
// A long-running scheduler that triggers `syncShippingSchedules()` from
// `@/lib/sgtx/compliance/shipping-lines-scraper` once every 12 hours so the
// `ShippingSchedule` table stays current with carrier-published ETAs, voyage
// rollings, and blank-sailing cancellations (which shift more frequently than
// the underlying worldwide route geometry).
//
// Lifecycle:
//   * `startShippingSchedulesSyncCron()` — explicit entry point. Reads the
//     most recent `WorldwideRoutesSyncLog` row tagged with
//     `source: "shipping-schedules"`; if it's older than 10h, fires the sync
//     immediately. Otherwise schedules the first tick for `lastSync + 12h`.
//     Either way, after the first tick a `setInterval(12h)` keeps the sync
//     running on a 12-hour cadence. Idempotent — safe to call from multiple
//     workers; each worker gets its own in-memory timer.
//   * `stopShippingSchedulesSyncCron()` — clears the interval + any pending
//     one-shot timer. Idempotent.
//   * `getShippingSchedulesSyncStatus()` — returns last sync, next sync, and
//     whether a sync is currently running.
//
// Each tick:
//   1. Invokes `syncShippingSchedules()` (the shipping-lines-scraper) to
//      refresh all seeded schedules + best-effort worldwide routes sync.
//   2. Publishes `brain.shipping-schedules.sync-completed` with the sync
//      summary.
//   3. Appends a `WorldwideRoutesSyncLog` row tagged with
//      `source: "shipping-schedules"` (reuses the existing model for
//      operational simplicity — the schema is generic enough to cover both
//      sync kinds).
//   4. Emits a structured `logger.info(...)` line.
//
// IMPORTANT: the scheduler is NOT auto-started on import. Next.js would
// spin it up on every worker. The orchestrator's `initialize()` calls
// `startShippingSchedulesSyncCron()` explicitly via a dynamic import.
// =============================================================================

import { db } from "@/lib/db";
import { syncShippingSchedules } from "@/lib/sgtx/compliance/shipping-lines-scraper";
import { eventBus } from "../core/event-bus";
import { logger } from "../observability/structured-logging";

/** 12-hour interval between scheduled syncs (schedules change more frequently than route geometry). */
const SYNC_INTERVAL_MS = 12 * 60 * 60 * 1000;
/** If the last sync log is older than this, fire immediately on start. */
const STALE_THRESHOLD_MS = 10 * 60 * 60 * 1000;

/** Tag persisted to the `WorldwideRoutesSyncLog.errors` field so operators
 *  can distinguish a shipping-schedules sync row from a worldwide-routes row. */
const SYNC_SOURCE_TAG = "shipping-schedules";

/** Status snapshot returned by `getShippingSchedulesSyncStatus()`. */
export interface ShippingSchedulesSyncStatus {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  lastDurationMs: number | null;
  lastSchedulesCount: number | null;
  lastErrors: string[];
  isRunning: boolean;
  isStarted: boolean;
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

/**
 * Persist a sync log row to the shared `WorldwideRoutesSyncLog` table so
 * operators can query both daily-routes and shipping-schedules history from
 * the same surface. The `errors` field carries a `source` tag so the two
 * sync kinds can be told apart: `["source:shipping-schedules", ...rawErrors]`.
 */
async function persistSyncLog(args: {
  schedulesCount: number;
  linesCovered: number;
  routesCovered: number;
  errors: string[];
  durationMs: number;
}): Promise<void> {
  const taggedErrors = [SYNC_SOURCE_TAG, ...args.errors];
  await (db as unknown as {
    worldwideRoutesSyncLog: {
      create: (args: unknown) => Promise<unknown>;
    };
  }).worldwideRoutesSyncLog.create({
    data: {
      routesCount: args.routesCovered,
      linesCount: args.linesCovered,
      portsCount: args.schedulesCount,
      errors: JSON.stringify(taggedErrors),
      durationMs: args.durationMs,
      driftApplied: 0,
      brainLearningUpdates: 0,
    },
  });
}

/**
 * Read the most recent `WorldwideRoutesSyncLog` row tagged as a
 * shipping-schedules sync. Returns `null` when there is no prior log or the
 * DB read fails (e.g. table not yet created).
 */
async function readLatestShippingSchedulesSyncLog(): Promise<SyncLogRow | null> {
  try {
    const rows = await (db as unknown as {
      worldwideRoutesSyncLog: {
        findMany: (args: unknown) => Promise<SyncLogRow[]>;
      };
    }).worldwideRoutesSyncLog.findMany({
      orderBy: { syncedAt: "desc" },
      take: 50,
    });
    // Find the most recent row whose errors array starts with our source tag.
    for (const row of rows) {
      try {
        const parsed = row.errors ? JSON.parse(row.errors) : [];
        if (Array.isArray(parsed) && parsed[0] === SYNC_SOURCE_TAG) {
          return row;
        }
      } catch {
        // Not JSON-decodable — skip this row (likely a worldwide-routes entry).
      }
    }
    return null;
  } catch (err) {
    logger.warn("shipping-schedules-sync: could not read latest sync log", {
      component: "shipping-schedules-sync",
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

class ShippingSchedulesSyncCronImpl {
  private intervalTimer: NodeJS.Timeout | null = null;
  private oneShotTimer: NodeJS.Timeout | null = null;
  private started = false;
  private isRunning = false;

  private lastSyncAt: string | null = null;
  private nextSyncAt: string | null = null;
  private lastDurationMs: number | null = null;
  private lastSchedulesCount: number | null = null;
  private lastErrors: string[] = [];

  /**
   * Explicit entry point — called by the Brain orchestrator's
   * `initialize()` (or manually by an operator).
   *
   * Idempotent. Reads the latest shipping-schedules sync log; if it's older
   * than 10h (or there is no prior log), fires the sync immediately.
   * Otherwise schedules the first tick for `lastSync + 12h`. Either way,
   * after the first tick a `setInterval(12h)` keeps the sync running on a
   * 12-hour cadence.
   */
  async start(): Promise<void> {
    if (this.started) return;
    this.started = true;

    let initialDelayMs = 0;
    const latest = await readLatestShippingSchedulesSyncLog();
    if (latest) {
      const lastSyncMs = new Date(latest.syncedAt).getTime();
      const ageMs = Date.now() - lastSyncMs;
      this.lastSyncAt = new Date(lastSyncMs).toISOString();
      this.lastDurationMs = latest.durationMs;
      this.lastSchedulesCount = latest.portsCount ?? null;
      try {
        const parsed = latest.errors ? JSON.parse(latest.errors) : [];
        if (Array.isArray(parsed)) {
          // Drop the leading `source:shipping-schedules` tag for the in-memory snapshot.
          this.lastErrors = parsed.filter((e, i) => i > 0 || e !== SYNC_SOURCE_TAG);
        }
      } catch {
        this.lastErrors = [];
      }
      if (ageMs >= STALE_THRESHOLD_MS) {
        // Stale — fire now.
        initialDelayMs = 0;
      } else {
        // Fresh — schedule for lastSync + 12h.
        initialDelayMs = Math.max(0, SYNC_INTERVAL_MS - ageMs);
      }
    } else {
      // No prior log — fire now.
      initialDelayMs = 0;
    }

    this.scheduleNext(initialDelayMs);
    logger.info("shipping-schedules-sync: scheduler started", {
      component: "shipping-schedules-sync",
      initialDelayMs,
      lastSyncAt: this.lastSyncAt,
    });
  }

  /**
   * Schedule the next tick. If `delayMs` is 0, fire immediately. After the
   * first tick, a `setInterval(12h)` keeps the sync running on cadence.
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
    // setInterval so subsequent ticks run on a clean 12h cadence.
    this.oneShotTimer = setTimeout(() => {
      void this.tick().catch((err) => {
        logger.error("shipping-schedules-sync: initial tick failed", {
          component: "shipping-schedules-sync",
          error: err instanceof Error ? err.message : String(err),
        });
      });
      // After the first tick fires, install the recurring interval.
      if (!this.intervalTimer) {
        this.intervalTimer = setInterval(() => {
          void this.tick().catch((err) => {
            logger.error("shipping-schedules-sync: recurring tick failed", {
              component: "shipping-schedules-sync",
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
    logger.info("shipping-schedules-sync: scheduler stopped", {
      component: "shipping-schedules-sync",
    });
  }

  /** Whether `start()` has been called. */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * Execute one sync tick. Safe to call manually. Re-entrant guard prevents
   * overlapping runs.
   *
   * Returns the scraper result + the duration so callers can surface the
   * sync summary to the client.
   */
  async tick(): Promise<{ result: unknown; durationMs: number }> {
    if (this.isRunning) {
      logger.warn("shipping-schedules-sync: tick skipped (already running)", {
        component: "shipping-schedules-sync",
      });
      return { result: null, durationMs: 0 };
    }
    this.isRunning = true;
    const start = Date.now();
    let result: Awaited<ReturnType<typeof syncShippingSchedules>> | null = null;
    try {
      result = await syncShippingSchedules();
      const durationMs = Date.now() - start;
      const errors = result.errors || [];
      this.lastSyncAt = new Date().toISOString();
      this.lastDurationMs = durationMs;
      this.lastSchedulesCount = result.totalSchedules;
      this.lastErrors = errors;
      this.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();

      // Publish the sync-completed event for downstream consumers
      // (dashboards, the worldwide-routes-learner, etc.).
      try {
        await eventBus.publish(
          "brain.shipping-schedules.sync-completed",
          "shipping-schedules",
          {
            source: "cron",
            durationMs,
            totalSchedules: result.totalSchedules,
            linesCovered: result.linesCovered,
            routesCovered: result.routesCovered,
            errors,
            worldwideSync: result.worldwideSync,
          },
          { source: "shipping-schedules-sync" },
        );
      } catch (publishErr) {
        logger.warn("shipping-schedules-sync: event publish failed", {
          component: "shipping-schedules-sync",
          error: publishErr instanceof Error ? publishErr.message : String(publishErr),
        });
      }

      // Persist a sync log row tagged with `source: "shipping-schedules"`.
      // The shared `WorldwideRoutesSyncLog` table is reused for operational
      // simplicity — the schema is generic enough to cover both sync kinds.
      try {
        await persistSyncLog({
          schedulesCount: result.totalSchedules,
          linesCovered: result.linesCovered,
          routesCovered: result.routesCovered,
          errors,
          durationMs,
        });
      } catch (dbErr) {
        // Persistence failure is non-fatal — the in-memory status is still
        // updated and the event was still published.
        logger.warn("shipping-schedules-sync: could not persist sync log", {
          component: "shipping-schedules-sync",
          error: dbErr instanceof Error ? dbErr.message : String(dbErr),
        });
      }

      logger.info("shipping-schedules sync completed", {
        component: "shipping-schedules-sync",
        durationMs,
        totalSchedules: result.totalSchedules,
        linesCovered: result.linesCovered,
        routesCovered: result.routesCovered,
        errorsCount: errors.length,
        nextSyncAt: this.nextSyncAt,
      });

      return { result, durationMs };
    } catch (err) {
      const durationMs = Date.now() - start;
      this.lastSyncAt = new Date().toISOString();
      this.lastDurationMs = durationMs;
      this.lastSchedulesCount = null;
      const errorMessage = err instanceof Error ? err.message : String(err);
      this.lastErrors = [errorMessage];
      this.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
      logger.error("shipping-schedules sync failed", {
        component: "shipping-schedules-sync",
        error: errorMessage,
        durationMs,
      });
      // Re-throw so manual callers can surface the error.
      throw err;
    } finally {
      this.isRunning = false;
    }
  }

  /** Return a snapshot of the scheduler's current state. */
  getStatus(): ShippingSchedulesSyncStatus {
    return {
      lastSyncAt: this.lastSyncAt,
      nextSyncAt: this.nextSyncAt,
      lastDurationMs: this.lastDurationMs,
      lastSchedulesCount: this.lastSchedulesCount,
      lastErrors: this.lastErrors,
      isRunning: this.isRunning,
      isStarted: this.started,
    };
  }
}

/** Singleton scheduler. NOT auto-started — call `startShippingSchedulesSyncCron()`. */
export const shippingSchedulesSyncCron = new ShippingSchedulesSyncCronImpl();

/**
 * Explicit start function the orchestrator calls from `initialize()`.
 * Idempotent — safe to call from multiple workers; each worker gets its own
 * in-memory scheduler, but the sync itself is guarded by the `isRunning`
 * flag and persists its result to the shared `WorldwideRoutesSyncLog` table.
 */
export async function startShippingSchedulesSyncCron(): Promise<void> {
  await shippingSchedulesSyncCron.start();
}

/** Stop the shipping schedules sync scheduler. Idempotent. */
export function stopShippingSchedulesSyncCron(): void {
  shippingSchedulesSyncCron.stop();
}

/**
 * Status accessor exposed at module scope for the cron route / orchestrator
 * health surface. Equivalent to `shippingSchedulesSyncCron.getStatus()`.
 */
export function getShippingSchedulesSyncStatus(): ShippingSchedulesSyncStatus {
  return shippingSchedulesSyncCron.getStatus();
}
