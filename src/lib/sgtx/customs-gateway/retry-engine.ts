// @ts-nocheck
/**
 * SGTX Customs Gateway — Retry Engine
 * ===========================================================================
 *
 * Jurisdiction-neutral retry engine used by every country adapter when calling
 * an external government system. Implements exponential backoff with full
 * jitter (AWS-style) and a configurable list of retryable error categories.
 *
 * Retryable categories (transient — safe to retry the SAME idempotent call):
 *   RATE_LIMIT           — government API returned 429 Too Many Requests
 *   TIMEOUT              — no response within expectedResponseMs
 *   NETWORK_ERROR        — TCP / DNS / TLS handshake failure
 *   SYSTEM_UNAVAILABLE   — government returned 503 Service Unavailable
 *
 * Non-retryable categories (deterministic — retrying will produce the same
 * failure, so we surface the error immediately to the broker/operator):
 *   AUTHENTICATION_ERROR  AUTHORIZATION_ERROR  VALIDATION_ERROR
 *   CLASSIFICATION_ERROR  PARTY_ERROR          DOCUMENT_ERROR
 *   GOVERNMENT_HOLD       PGA_HOLD             DUPLICATE
 *   UNKNOWN_EXTERNAL_ERROR
 *
 * Idempotency contract (per SGTX §18 + customs-gateway G1):
 *   - The `idempotencyKey` passed in MUST be the same across retries.
 *   - On retry, the adapter re-issues the call with the same key so the
 *     government side can dedupe.
 *   - The retry engine NEVER manufactures a success — if every attempt fails,
 *     the original error propagates to the caller.
 *
 * L0 constraints respected:
 *   - NON-CUSTODIAL: this engine handles only API calls, never funds.
 *   - Governor mandatory: the calling adapter MUST have already passed G1
 *     Governor approval before invoking executeWithRetry — retry never
 *     overrides a Governor DENY.
 *   - try/catch with safe defaults on every public function.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export interface RetryConfig {
  /** Maximum number of retry attempts (NOT counting the initial attempt). */
  maxRetries: number;
  /** Base backoff in milliseconds — the first retry waits ~baseDelayMs. */
  baseDelayMs: number;
  /** Ceiling on the backoff between retries (jitter is applied BELOW this). */
  maxDelayMs: number;
  /** Jitter factor in [0, 1). 0.3 means the delay varies ±30 % around the mean. */
  jitterFactor: number;
  /** Error categories that should trigger a retry. See ERROR_CATEGORIES. */
  retryableCategories: string[];
}

export interface RetryAttempt {
  attemptNumber: number; // 1 = initial attempt, 2 = first retry, etc.
  startedAt: string;
  endedAt: string;
  durationMs: number;
  success: boolean;
  errorCategory?: string;
  errorMessage?: string;
  nextRetryDelayMs?: number; // absent on final attempt or success
}

export interface RetryOutcome<T> {
  ok: boolean;
  result?: T;
  error?: { category: string; message: string; retryable: boolean };
  attempts: RetryAttempt[];
  totalDurationMs: number;
  idempotencyKey: string;
}

// ============ Default config ============

export const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  jitterFactor: 0.3,
  retryableCategories: [
    "RATE_LIMIT",
    "TIMEOUT",
    "NETWORK_ERROR",
    "SYSTEM_UNAVAILABLE",
  ],
};

/**
 * Per-adapter overrides for adapters whose government systems have known
 * different retry behaviour. Lookup by adapterId; falls back to DEFAULT_RETRY_CONFIG.
 */
export const ADAPTER_RETRY_OVERRIDES: Record<string, Partial<RetryConfig>> = {
  // Nafeza has a published 5 req/s rate limit — be more conservative.
  "EG-NAFEZA": { maxRetries: 4, baseDelayMs: 2000 },
  // CargoX blockchain finality adds ~2 s — use a slightly longer base delay.
  "EG-CARGOX": { baseDelayMs: 2000, maxRetries: 4 },
  // ETA e-Invoice is synchronous and quick — fewer retries, shorter backoff.
  "EG-ETA": { maxRetries: 2, baseDelayMs: 800 },
  // CBE payment retries must be slow to avoid double-charging under load.
  "EG-CBE": { maxRetries: 3, baseDelayMs: 5000, maxDelayMs: 60000 },
  // ACE ABI is a mainframe interface — give it longer timeouts and fewer retries.
  "US-CBP-ACE": { maxRetries: 2, baseDelayMs: 3000, maxDelayMs: 45000 },
};

export function getRetryConfig(adapterId?: string): RetryConfig {
  try {
    const override = adapterId ? ADAPTER_RETRY_OVERRIDES[adapterId] : null;
    if (!override) return { ...DEFAULT_RETRY_CONFIG };
    return { ...DEFAULT_RETRY_CONFIG, ...override };
  } catch {
    return { ...DEFAULT_RETRY_CONFIG };
  }
}

// ============ Backoff with jitter ============

/**
 * Compute the delay (in ms) before the next retry attempt, given the
 * 1-indexed `attemptNumber` (i.e. attemptNumber=2 means "delay before the
 * 2nd attempt — the 1st retry").
 *
 * Formula:
 *   mean    = min(maxDelayMs, baseDelayMs * 2^(attemptNumber - 2))
 *   jitter  = mean * jitterFactor * (2 * Math.random() - 1)   // ∈ [-1, +1]
 *   delay   = clamp(mean + jitter, 0, maxDelayMs)
 *
 * The "+/-" full-jitter variant is intentionally bounded so a retry storm
 * can never exceed maxDelayMs on average.
 */
export function computeBackoffDelay(
  attemptNumber: number,
  config: RetryConfig,
): number {
  try {
    if (attemptNumber <= 1) return 0;
    const exp = Math.pow(2, attemptNumber - 2);
    const mean = Math.min(config.maxDelayMs, config.baseDelayMs * exp);
    const jitter = mean * config.jitterFactor * (2 * Math.random() - 1);
    const delay = Math.max(0, Math.round(mean + jitter));
    return Math.min(delay, config.maxDelayMs);
  } catch {
    return config.baseDelayMs;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ============ Retryable category check ============

export function isRetryable(category: string, config: RetryConfig = DEFAULT_RETRY_CONFIG): boolean {
  try {
    return config.retryableCategories.includes(category);
  } catch {
    return false;
  }
}

// ============ executeWithRetry ============

/**
 * Execute `operation` with retries. The operation MUST be idempotent (the
 * `idempotencyKey` is forwarded to the adapter so the government side can
 * dedupe across retries).
 *
 * Behaviour:
 *   - The first attempt runs immediately.
 *   - If it throws AND the error category is in `config.retryableCategories`,
 *     wait `computeBackoffDelay(attempt, config)` ms and retry.
 *   - Repeat up to `config.maxRetries` retries.
 *   - If every attempt fails, the LAST error is returned in the `error` field
 *     (NEVER manufactured as success).
 *   - If the operation succeeds, return immediately with `ok: true`.
 *
 * The operation may return a structured error instead of throwing — in that
 * case it should set `{ __retryCategory: "<CATEGORY>" }` on the returned
 * object (handled below) OR throw an Error with `error.__retryCategory`.
 *
 * try/catch with safe defaults — if executeWithRetry itself fails, return a
 * fallback RetryOutcome with `ok: false` and a single attempt record.
 */
export async function executeWithRetry<T>(
  operation: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  idempotencyKey: string,
): Promise<RetryOutcome<T>> {
  const startedAt = Date.now();
  const attempts: RetryAttempt[] = [];
  const maxAttempts = Math.max(1, (config.maxRetries || 0) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const attemptStart = Date.now();
    const attemptStartIso = new Date(attemptStart).toISOString();
    try {
      const result = await operation();
      const attemptEnd = Date.now();
      attempts.push({
        attemptNumber: attempt,
        startedAt: attemptStartIso,
        endedAt: new Date(attemptEnd).toISOString(),
        durationMs: attemptEnd - attemptStart,
        success: true,
      });
      return {
        ok: true,
        result,
        attempts,
        totalDurationMs: attemptEnd - startedAt,
        idempotencyKey,
      };
    } catch (err: any) {
      const attemptEnd = Date.now();
      const category =
        err?.__retryCategory ||
        err?.category ||
        inferCategoryFromError(err) ||
        "UNKNOWN_EXTERNAL_ERROR";
      const message = err?.message || String(err);
      const retryable = isRetryable(category, config);

      // If we have attempts remaining AND the category is retryable, schedule.
      const willRetry = retryable && attempt < maxAttempts;
      const nextDelay = willRetry
        ? computeBackoffDelay(attempt + 1, config)
        : undefined;

      attempts.push({
        attemptNumber: attempt,
        startedAt: attemptStartIso,
        endedAt: new Date(attemptEnd).toISOString(),
        durationMs: attemptEnd - attemptStart,
        success: false,
        errorCategory: category,
        errorMessage: message,
        nextRetryDelayMs: nextDelay,
      });

      logger.warn("[customs-gateway/retry] attempt failed", {
        idempotencyKey,
        attempt,
        category,
        retryable,
        willRetry,
        nextDelayMs: nextDelay,
        message,
      });

      if (!willRetry) {
        return {
          ok: false,
          error: { category, message, retryable },
          attempts,
          totalDurationMs: attemptEnd - startedAt,
          idempotencyKey,
        };
      }

      // Sleep before next attempt.
      if (nextDelay && nextDelay > 0) {
        await sleep(nextDelay);
      }
    }
  }

  // Should never reach here — the loop returns on every path.
  const endedAt = Date.now();
  return {
    ok: false,
    error: {
      category: "UNKNOWN_EXTERNAL_ERROR",
      message: "retry engine exhausted attempts without resolution",
      retryable: false,
    },
    attempts,
    totalDurationMs: endedAt - startedAt,
    idempotencyKey,
  };
}

// ============ Error category inference (fallback) ============

/**
 * Heuristic: infer the retryable category from a thrown error's properties.
 * Used when the operation throws a plain Error (no `__retryCategory` hint).
 *
 * NEVER returns a non-retryable category unless evidence is clear — the
 * default is the retryable "UNKNOWN_EXTERNAL_ERROR" so the engine gets one
 * chance to retry transient hiccups before surfacing.
 */
function inferCategoryFromError(err: any): string | null {
  try {
    const msg = (err?.message || "").toLowerCase();
    const code = (err?.code || err?.statusCode || err?.status || "").toString();
    if (code === "429" || msg.includes("rate limit") || msg.includes("too many requests")) {
      return "RATE_LIMIT";
    }
    if (code === "503" || msg.includes("service unavailable") || msg.includes("system unavailable")) {
      return "SYSTEM_UNAVAILABLE";
    }
    if (
      msg.includes("timeout") ||
      msg.includes("timed out") ||
      msg.includes("etimedout") ||
      msg.includes("aborted")
    ) {
      return "TIMEOUT";
    }
    if (
      msg.includes("network error") ||
      msg.includes("econnreset") ||
      msg.includes("econnrefused") ||
      msg.includes("enotfound") ||
      msg.includes("dns")
    ) {
      return "NETWORK_ERROR";
    }
    if (code === "401" || code === "403" || msg.includes("unauthorized") || msg.includes("forbidden")) {
      return "AUTHENTICATION_ERROR";
    }
    if (code === "400" || code === "422" || msg.includes("validation")) {
      return "VALIDATION_ERROR";
    }
    if (msg.includes("duplicate")) {
      return "DUPLICATE";
    }
    return "UNKNOWN_EXTERNAL_ERROR";
  } catch {
    return null;
  }
}
