// SGTX Brain OS — Retry Policy
// =============================================================================
// Exponential backoff with full jitter. Used by the orchestrator and
// capability wrappers to ride through transient failures without propagating
// them to callers.
//
// Defaults (per BRAIN-RESTORE spec):
//   * 3 attempts total (1 initial + 2 retries)
//   * 100ms base delay
//   * Exponential factor 2 (100ms → 200ms → 400ms)
//   * Full jitter: actual delay = random(0, base * 2^(attempt-1))
//   * Max delay cap: 5_000ms
//
// Callers can override any of these via the options bag.
// =============================================================================

import { logger } from "../observability/structured-logging";

export interface RetryOptions {
  /** Total number of attempts (initial try + retries). Default: 3. */
  attempts?: number;
  /** Base delay in ms. Default: 100. */
  baseDelayMs?: number;
  /** Exponential backoff factor. Default: 2. */
  factor?: number;
  /** Max delay cap in ms. Default: 5_000. */
  maxDelayMs?: number;
  /** Jitter strategy. Default: "full". */
  jitter?: "none" | "full" | "equal";
  /** Predicate to decide whether an error is retryable. Default: always retry. */
  retryOn?: (err: unknown, attempt: number) => boolean;
  /** Optional callback invoked before each retry sleep. */
  onRetry?: (info: { attempt: number; nextDelayMs: number; error: unknown }) => void;
  /** Optional AbortSignal for cancellation. */
  signal?: AbortSignal;
}

export interface RetryResult<T> {
  ok: true;
  value: T;
  attempts: number;
  totalDelayMs: number;
}

export interface RetryFailure {
  ok: false;
  error: unknown;
  attempts: number;
  totalDelayMs: number;
}

const DEFAULT_OPTS: Required<Omit<RetryOptions, "retryOn" | "onRetry" | "signal">> = {
  attempts: 3,
  baseDelayMs: 100,
  factor: 2,
  maxDelayMs: 5_000,
  jitter: "full",
};

function computeDelay(
  attempt: number, // 1-based attempt that just failed (1 = first failure → before retry 2)
  opts: Required<Pick<RetryOptions, "baseDelayMs" | "factor" | "maxDelayMs" | "jitter">>,
): number {
  const exp = Math.min(
    opts.maxDelayMs,
    opts.baseDelayMs * Math.pow(opts.factor, attempt - 1),
  );
  switch (opts.jitter) {
    case "none":
      return exp;
    case "equal":
      return exp / 2 + Math.random() * (exp / 2);
    case "full":
    default:
      return Math.random() * exp;
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * Run `fn` with exponential-backoff retries.
 *
 * Returns a discriminated union so callers can `if (r.ok)` without try/catch.
 * Throws only when the AbortSignal is aborted mid-retry.
 */
export async function retry<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<RetryResult<T> | RetryFailure> {
  const merged: Required<Omit<RetryOptions, "retryOn" | "onRetry" | "signal">> = {
    attempts: opts.attempts ?? DEFAULT_OPTS.attempts,
    baseDelayMs: opts.baseDelayMs ?? DEFAULT_OPTS.baseDelayMs,
    factor: opts.factor ?? DEFAULT_OPTS.factor,
    maxDelayMs: opts.maxDelayMs ?? DEFAULT_OPTS.maxDelayMs,
    jitter: opts.jitter ?? DEFAULT_OPTS.jitter,
  };
  const retryOn = opts.retryOn ?? (() => true);
  let lastError: unknown;
  let totalDelayMs = 0;

  for (let attempt = 1; attempt <= merged.attempts; attempt++) {
    if (opts.signal?.aborted) {
      throw new Error("retry: aborted before attempt " + attempt);
    }
    try {
      const value = await fn();
      return { ok: true, value, attempts: attempt, totalDelayMs };
    } catch (err) {
      lastError = err;
      if (attempt >= merged.attempts) break;
      if (!retryOn(err, attempt)) break;

      const delay = computeDelay(attempt, merged);
      totalDelayMs += delay;
      opts.onRetry?.({ attempt, nextDelayMs: delay, error: err });
      logger.debug(`retry: attempt ${attempt} failed, sleeping ${Math.round(delay)}ms`, {
        component: "retry-policy",
        attempt,
        delayMs: Math.round(delay),
        error: (err as Error)?.message ?? String(err),
      });
      await sleep(delay, opts.signal);
    }
  }

  return { ok: false, error: lastError, attempts: merged.attempts, totalDelayMs };
}

/**
 * Convenience wrapper that throws on failure instead of returning a union.
 * Useful for call sites that prefer try/catch over discriminated unions.
 */
export async function retryOrThrow<T>(fn: () => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const r = await retry(fn, opts);
  if (r.ok) return r.value;
  throw r.error;
}

/** Helper: retry only on network / transient errors. */
export const retryOnTransient: (err: unknown) => boolean = (err) => {
  const msg = (err as Error)?.message ?? String(err);
  if (/timeout|econnreset|enotfound|econnrefused|socket hang up|429|503|504/i.test(msg)) return true;
  return false;
};
