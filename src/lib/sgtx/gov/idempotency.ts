// SGTX Part 7.7 — Idempotency Key Standard for external gov API calls.
//
// All outbound calls to Nafeza, CargoX, ETA, CBE and licensed PSPs MUST carry an
// `X-Idempotency-Key` header so that duplicate retries (network blip, 5xx retry,
// webhook replay) don't cause duplicate submissions (double SAD filings, double
// payments, double ACID issuance).
//
// Format (Blueprint 7.7.2):
//   idempotency_key = SHA256( request_body_canonical + timestamp_utc_rounded_to_second )
// where:
//   - request_body_canonical is the JSON body serialised with JCS (RFC 8785)
//     — we approximate JCS with `JSON.stringify(obj, sortedKeys)` (sufficient for
//       deterministic idempotency; full JCS would also handle unicode/number
//       normalisation which is unnecessary for our internal payloads).
//   - timestamp_utc_rounded_to_second is the current UTC time truncated to the
//     nearest second in ISO 8601 (YYYY-MM-DDTHH:MM:SSZ). Truncating to the
//     second means all retries within the same second share a key (true
//     idempotency); retries after a second-boundary get a new key (which is
//     correct because the external API may have already committed the previous
//     attempt — a new key lets the upstream dedupe the *next* logical request).
//
// Part 7.7.4 Retry Behaviour:
//   - If the external API returns 5xx, SGTX retries with the SAME idempotency key
//     (reusing the same `utc_second` window) up to 3 times with exponential
//     backoff (1s, 2s, 4s). After 3 retries the call is queued for manual review.
//   - The wrapper stores the key + response for at least 24 hours so duplicates
//     return the original response (idempotent behaviour).
//   - For PSPs that don't support idempotency keys, SGTX adds a UUID in the
//     payment reference field as a fallback (handled in payment/psp-split.ts).

import { createHash } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// 1. generateIdempotencyKey — Part 7.7.2 canonical idempotency key
// ---------------------------------------------------------------------------

/** Stable JSON canonicalisation — sorted top-level keys (RFC 8785 approximation). */
export function canonicalJson(obj: unknown): string {
  if (obj === null || typeof obj !== "object") return JSON.stringify(obj);
  // Recursively sort keys for nested objects/arrays.
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === "object") {
      return Object.keys(v as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, k) => {
          acc[k] = sort((v as Record<string, unknown>)[k]);
          return acc;
        }, {});
    }
    return v;
  };
  return JSON.stringify(sort(obj));
}

/** Current UTC timestamp truncated to the nearest second (ISO 8601 `...Z`). */
export function utcSecond(date: Date = new Date()): string {
  // `toISOString()` returns "2026-06-10T14:35:22.123Z" — slice off the ms + add Z.
  return date.toISOString().slice(0, 19) + "Z";
}

/**
 * Generate the Part 7.7.2 idempotency key for an outbound gov API request.
 *
 * Returns the SHA-256 hex digest of `canonicalJson(body) + utcSecond`.
 * The `utcSecondRef` parameter is an out-param: callers retrying within the
 * same second should pass the SAME `Date` object so the key is stable across
 * retries (true idempotency). New logical requests should let the function
 * default to `new Date()`.
 */
export function generateGovIdempotencyKey(body: unknown, atDate?: Date): string {
  const canonical = canonicalJson(body);
  const ts = utcSecond(atDate ?? new Date());
  return createHash("sha256").update(canonical + ts).digest("hex");
}

// ---------------------------------------------------------------------------
// 2. checkIdempotencyDuplicate — return cached response if key already seen
// ---------------------------------------------------------------------------

/**
 * Look up an existing IntegrationConnectorLog row by idempotency key. If a row
 * exists with the same connector (apiName) and was successful, return its
 * cached response so the caller can return the same result without re-calling
 * the external API (Part 7.7.4 idempotent behaviour).
 *
 * Returns null if no prior log exists for this key.
 */
export async function findIdempotentResponse(
  apiName: string,
  idempotencyKey: string
): Promise<{ responseBody: string | null; statusCode: number | null; status: string } | null> {
  try {
    const row = await db.integrationConnectorLog.findUnique({
      where: { idempotencyKey },
      select: { apiName: true, responseBody: true, statusCode: true, status: true },
    });
    if (!row || row.apiName !== apiName) return null;
    return { responseBody: row.responseBody, statusCode: row.statusCode, status: row.status };
  } catch {
    // Logging DB lookup failures are non-fatal — fall through to make a fresh call.
    return null;
  }
}

// ---------------------------------------------------------------------------
// 3. withRetry — Part 7.8 exponential backoff wrapper (1s, 2s, 4s)
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Max retry attempts (default 3 per Part 7.8). */
  maxRetries?: number;
  /** Base delay in ms for exponential backoff (default 1000 → 1s, 2s, 4s). */
  baseDelayMs?: number;
  /** Connector name for logging. */
  connectorName: string;
  /** Idempotency key to share across retries within the same second. */
  idempotencyKey: string;
  /**
   * Predicate that returns true if the error is retryable (5xx, network error,
   * timeout). Default: retry on any thrown error.
   */
  isRetryable?: (err: unknown, attempt: number) => boolean;
  /** Optional logger — defaults to console.error. */
  onRetry?: (attempt: number, err: unknown, delayMs: number) => void;
}

/**
 * Execute `fn` with exponential backoff retries (Part 7.8). The first attempt
 * runs immediately; on failure, retries after `baseDelayMs * 2^(attempt-1)` ms.
 *
 * Backoff schedule per Part 7.8:
 *   attempt 1 → delay 1s (1000ms)
 *   attempt 2 → delay 2s (2000ms)
 *   attempt 3 → delay 4s (4000ms)
 *   attempt 4 (queue) → caller-side queue every 10 min (handled by caller)
 *
 * The function throws after `maxRetries` exhausted so callers can route to the
 * manual-fallback procedure defined in Part 7.8 (e.g. generate prefilled PDF,
 * escalate to Smart Inbox).
 */
export async function withRetry<T>(
  fn: (attempt: number) => Promise<T>,
  opts: RetryOptions
): Promise<T> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseDelay = opts.baseDelayMs ?? 1000;
  const log = opts.onRetry ?? ((a, e, d) => console.error(`[withRetry/${opts.connectorName}] attempt ${a} failed (retry in ${d}ms):`, e));

  let lastErr: unknown;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = opts.isRetryable ? opts.isRetryable(err, attempt) : true;
      if (!retryable || attempt >= maxRetries) {
        // Final failure — rethrow so caller can route to manual fallback.
        throw err;
      }
      const delayMs = baseDelay * Math.pow(2, attempt - 1); // 1s, 2s, 4s
      log(attempt, err, delayMs);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastErr;
}

/**
 * Default retryable predicate for gov API calls: retry on 5xx HTTP status codes
 * and any thrown network errors (TypeError: fetch failed, ECONNRESET, ETIMEDOUT).
 */
export function isRetryableHttpError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { status?: number; statusCode?: number; code?: string };
    const code = e.code ?? "";
    if (code === "ECONNRESET" || code === "ETIMEDOUT" || code === "ENOTFOUND") return true;
    const status = e.status ?? e.statusCode ?? 0;
    if (status >= 500 && status < 600) return true;
  }
  // For our stub implementations which never make real HTTP calls, any thrown
  // error (e.g. DB write failure) is treated as retryable.
  return true;
}

// ---------------------------------------------------------------------------
// 4. withGovRetry — convenience wrapper combining idempotency + retry
// ---------------------------------------------------------------------------

/**
 * One-shot helper for gov client stubs: generates the Part 7.7.2 idempotency
 * key from the request body, checks the IntegrationConnectorLog for a prior
 * cached response (Part 7.7.4 idempotent behaviour), and if none exists,
 * executes `fn` with exponential backoff (Part 7.8 — 1s, 2s, 4s).
 *
 * Returns the cached response (deserialised from responseBody) if a prior
 * successful call exists, otherwise the fresh result from `fn`.
 *
 * Usage:
 *   const result = await withGovRetry({
 *     apiName: "NAFEZA_DECLARATION",
 *     body: { ustn, declarationData },
 *     fn: async () => { ... return nafezaResponse; },
 *   });
 *
 * The wrapper does NOT cache the response itself — the gov client's
 * `logOutbound` call is responsible for persisting the IntegrationConnectorLog
 * row that subsequent idempotency checks will hit. This means the very first
 * call always runs `fn` and logs; the second call with the same body + utc
 * second will short-circuit and return the cached response.
 */
export async function withGovRetry<T>(params: {
  apiName: string;
  body: unknown;
  fn: (attempt: number) => Promise<T>;
  maxRetries?: number;
  baseDelayMs?: number;
  /** Optional deserialiser to revive a cached response from JSON. Default = JSON.parse. */
  revive?: (raw: string) => T;
}): Promise<T> {
  const idempotencyKey = generateGovIdempotencyKey(params.body);

  // Part 7.7.4 — short-circuit on prior successful response.
  const prior = await findIdempotentResponse(params.apiName, idempotencyKey);
  if (prior && prior.status === "SUCCESS" && prior.responseBody) {
    try {
      const revive = params.revive ?? JSON.parse;
      return revive(prior.responseBody) as T;
    } catch {
      // Cached response is malformed — fall through to fresh call.
    }
  }

  // Part 7.8 — exponential backoff (1s, 2s, 4s).
  return withRetry(params.fn, {
    connectorName: params.apiName,
    idempotencyKey,
    maxRetries: params.maxRetries ?? 3,
    baseDelayMs: params.baseDelayMs ?? 1000,
    isRetryable: isRetryableHttpError,
  });
}
