/**
 * Free Integrations — Daily Cron Scheduler
 * =========================================
 *
 * Runs every free open-source integration once per day:
 *   1. OFAC SDN sync               (sanctions list)
 *   2. UN sanctions sync            (sanctions list)
 *   3. EU sanctions sync            (sanctions list)
 *   4. FX rates sync                (open.er-api.com + ECB)
 *   5. World Bank commodity prices  (monthly commodities)
 *   6. REST Countries + World Bank  (country metadata)
 *   7. UN/LOCODE sync               (port + location codes — only a single
 *                                    country per cron tick to stay under
 *                                    the 24h interval; full sync is
 *                                    operator-triggered)
 *   8. Port weather batch           (open-meteo for top 50 ports)
 *
 * Each integration is wrapped in its own try/catch — a failure in one
 * does NOT block the others. The `runAllFreeIntegrationSyncs()` function
 * returns a summary with per-integration status + counts.
 *
 * The scheduler is NOT auto-started on import (same pattern as
 * `dailyRoutesSyncCron`). `initFreeIntegrationsCron()` is the explicit
 * entry point called by the Brain orchestrator or the cron route.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { syncOfacSdnList } from "@/lib/sgtx/compliance/ofac-sdn-sync";
import { syncUnSanctionsList } from "@/lib/sgtx/compliance/un-sanctions-sync";
import { syncEuSanctionsList } from "@/lib/sgtx/compliance/eu-sanctions-sync";
import { syncFxRates } from "@/lib/sgtx/compliance/fx-rates-sync";
import { syncWorldBankPrices } from "@/lib/sgtx/compliance/worldbank-prices-sync";
import { syncCountries } from "@/lib/sgtx/onboarding/restcountries-sync";
import { syncUnlocode } from "@/lib/sgtx/shipping/unlocode-sync";
import { syncPortWeatherBatch } from "@/lib/sgtx/compliance/weather-client";

const SYNC_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STALE_THRESHOLD_MS = 20 * 60 * 60 * 1000;

export interface FreeIntegrationSyncStatus {
  lastSyncAt: string | null;
  nextSyncAt: string | null;
  isRunning: boolean;
  schedulerStarted: boolean;
  lastResult: FreeIntegrationsRunSummary | null;
}

export interface FreeIntegrationsRunSummary {
  startedAt: string;
  durationMs: number;
  ofac: { ok: boolean; upserted: number; errors: string[] };
  unSanctions: { ok: boolean; upserted: number; errors: string[] };
  euSanctions: { ok: boolean; upserted: number; errors: string[] };
  fxRates: { ok: boolean; upserted: number; errors: string[] };
  worldbankPrices: { ok: boolean; upserted: number; errors: string[] };
  countries: { ok: boolean; upserted: number; errors: string[] };
  unlocode: { ok: boolean; upserted: number; errors: string[] };
  weather: { ok: boolean; fetched: number; errors: string[] };
  overallOk: boolean;
}

class FreeIntegrationsCronImpl {
  private intervalTimer: NodeJS.Timeout | null = null;
  private oneShotTimer: NodeJS.Timeout | null = null;
  private started = false;
  private isRunning = false;
  private lastSyncAt: string | null = null;
  private nextSyncAt: string | null = null;
  private lastResult: FreeIntegrationsRunSummary | null = null;

  async init(): Promise<void> {
    if (this.started) return;
    this.started = true;

    let initialDelayMs = 0;
    try {
      const latest = await db.freeIntegrationSyncLog.findFirst({
        orderBy: { syncedAt: "desc" },
      });
      if (latest) {
        const lastMs = new Date(latest.syncedAt).getTime();
        const ageMs = Date.now() - lastMs;
        this.lastSyncAt = new Date(lastMs).toISOString();
        if (ageMs < STALE_THRESHOLD_MS) {
          initialDelayMs = Math.max(0, SYNC_INTERVAL_MS - ageMs);
        }
      }
    } catch (err) {
      logger.warn("free-integrations: init DB read failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    this.scheduleNext(initialDelayMs);
    logger.info("free-integrations: scheduler initialized", { initialDelayMs });
  }

  private scheduleNext(delayMs: number): void {
    if (this.oneShotTimer) clearTimeout(this.oneShotTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.nextSyncAt = new Date(Date.now() + delayMs).toISOString();
    this.oneShotTimer = setTimeout(() => {
      void this.tick().catch((err) => {
        logger.error("free-integrations: initial tick failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      });
      if (!this.intervalTimer) {
        this.intervalTimer = setInterval(() => {
          void this.tick().catch((err) => {
            logger.error("free-integrations: recurring tick failed", {
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }, SYNC_INTERVAL_MS);
      }
    }, delayMs);
  }

  stop(): void {
    if (this.oneShotTimer) clearTimeout(this.oneShotTimer);
    if (this.intervalTimer) clearInterval(this.intervalTimer);
    this.oneShotTimer = null;
    this.intervalTimer = null;
    this.started = false;
    this.nextSyncAt = null;
    logger.info("free-integrations: scheduler stopped");
  }

  isStarted(): boolean {
    return this.started;
  }

  async tick(): Promise<FreeIntegrationsRunSummary> {
    if (this.isRunning) {
      logger.warn("free-integrations: tick skipped (already running)");
      return this.lastResult ?? {
        startedAt: new Date().toISOString(),
        durationMs: 0,
        ofac: { ok: true, upserted: 0, errors: ["skipped"] },
        unSanctions: { ok: true, upserted: 0, errors: ["skipped"] },
        euSanctions: { ok: true, upserted: 0, errors: ["skipped"] },
        fxRates: { ok: true, upserted: 0, errors: ["skipped"] },
        worldbankPrices: { ok: true, upserted: 0, errors: ["skipped"] },
        countries: { ok: true, upserted: 0, errors: ["skipped"] },
        unlocode: { ok: true, upserted: 0, errors: ["skipped"] },
        weather: { ok: true, fetched: 0, errors: ["skipped"] },
        overallOk: false,
      };
    }
    this.isRunning = true;
    const startedAt = new Date().toISOString();
    const start = Date.now();

    // Run each integration. Each is independent — failures captured in errors[].
    const ofac = await safeRun(() => syncOfacSdnList(), "ofac-sdn");
    const unSanctions = await safeRun(() => syncUnSanctionsList(), "un-sanctions");
    const euSanctions = await safeRun(() => syncEuSanctionsList(), "eu-sanctions");
    const fxRates = await safeRun(() => syncFxRates(), "fx-rates");
    const worldbankPrices = await safeRun(() => syncWorldBankPrices(), "worldbank-prices");
    const countries = await safeRun(() => syncCountries(), "rest-countries");
    // UN/LOCODE single-country per tick (Egypt first, since SGTX primary corridor).
    // Full sync is operator-triggered via POST /api/sgtx/shipping/unlocode/sync.
    const unlocode = await safeRun(() => syncUnlocode("EG"), "unlocode");
    const weather = await safeRunWeather();

    const summary: FreeIntegrationsRunSummary = {
      startedAt,
      durationMs: Date.now() - start,
      ofac: { ok: ofac.ok, upserted: ofac.upserted, errors: ofac.errors },
      unSanctions: { ok: unSanctions.ok, upserted: unSanctions.upserted, errors: unSanctions.errors },
      euSanctions: { ok: euSanctions.ok, upserted: euSanctions.upserted, errors: euSanctions.errors },
      fxRates: { ok: fxRates.ok, upserted: fxRates.upserted, errors: fxRates.errors },
      worldbankPrices: { ok: worldbankPrices.ok, upserted: worldbankPrices.upserted, errors: worldbankPrices.errors },
      countries: { ok: countries.ok, upserted: countries.upserted, errors: countries.errors },
      unlocode: { ok: unlocode.ok, upserted: unlocode.upserted, errors: unlocode.errors },
      weather: { ok: weather.ok, fetched: weather.fetched, errors: weather.errors },
      overallOk:
        ofac.ok &&
        unSanctions.ok &&
        euSanctions.ok &&
        fxRates.ok &&
        worldbankPrices.ok &&
        countries.ok &&
        unlocode.ok &&
        weather.ok,
    };

    this.lastSyncAt = new Date().toISOString();
    this.nextSyncAt = new Date(Date.now() + SYNC_INTERVAL_MS).toISOString();
    this.lastResult = summary;
    this.isRunning = false;
    logger.info("free-integrations daily sync completed", {
      durationMs: summary.durationMs,
      overallOk: summary.overallOk,
    });
    return summary;
  }

  getStatus(): FreeIntegrationSyncStatus {
    return {
      lastSyncAt: this.lastSyncAt,
      nextSyncAt: this.nextSyncAt,
      isRunning: this.isRunning,
      schedulerStarted: this.started,
      lastResult: this.lastResult,
    };
  }
}

interface SafeRunResult {
  ok: boolean;
  upserted: number;
  errors: string[];
}

interface SafeRunWeatherResult {
  ok: boolean;
  fetched: number;
  errors: string[];
}

async function safeRun<T extends { ok: boolean; errors: string[]; upserted?: number }>(
  fn: () => Promise<T>,
  name: string,
): Promise<SafeRunResult> {
  try {
    const r = await fn();
    return { ok: r.ok, upserted: r.upserted ?? 0, errors: r.errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`free-integrations: ${name} failed`, { error: msg });
    return { ok: false, upserted: 0, errors: [msg] };
  }
}

async function safeRunWeather(): Promise<SafeRunWeatherResult> {
  try {
    const r = await syncPortWeatherBatch(50);
    return { ok: r.ok, fetched: r.fetched, errors: r.errors };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error("free-integrations: weather failed", { error: msg });
    return { ok: false, fetched: 0, errors: [msg] };
  }
}

/** Singleton scheduler — NOT auto-started. Call `initFreeIntegrationsCron()`. */
export const freeIntegrationsCron = new FreeIntegrationsCronImpl();

/** Explicit init function — idempotent. */
export async function initFreeIntegrationsCron(): Promise<void> {
  await freeIntegrationsCron.init();
}

/** Stop the scheduler. Idempotent. */
export function stopFreeIntegrationsCron(): void {
  freeIntegrationsCron.stop();
}

/** Status accessor. */
export function getFreeIntegrationsSyncStatus(): FreeIntegrationSyncStatus {
  return freeIntegrationsCron.getStatus();
}

/** Run all free integration syncs once. Used by the cron route's POST handler. */
export async function runAllFreeIntegrationSyncs(): Promise<FreeIntegrationsRunSummary> {
  return freeIntegrationsCron.tick();
}
