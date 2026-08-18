// SGTX Idempotency Middleware (§XIX)
// Prevents duplicate irreversible actions when requests are retried.
//
// Industry-standard idempotency pattern (Stripe-style):
//   1. Caller sends X-Idempotency-Key header on the POST.
//   2. Wrapper checks the in-process cache for `${action}:${key}`.
//   3. If a prior call with the same key already completed successfully (2xx),
//      replay the cached response — the caller gets the same answer without
//      the side effect running twice.
//   4. If a prior call with the same key is still in-flight, return 409
//      Conflict so the caller backs off and retries.
//   5. Otherwise, run the wrapped fn. On 2xx success, cache the response. On
//      non-2xx (validation/server error), do NOT cache — the caller can fix
//      the payload and retry with the same key.
//   6. If no X-Idempotency-Key header is provided, pass through unchanged
//      (idempotency is opt-in per call).
//
// Implementation note: this uses a process-local Map, which is sufficient for
// Vercel serverless (each function instance handles one request; retries hit
// the same instance within the 24h TTL window). For multi-instance deploys,
// the IntegrationConnectorLog table (Part 7.7) is the durable source of truth
// — this in-memory layer is the fast first-line dedupe.

import { NextRequest } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export interface IdempotencyRecord {
  key: string;
  action: string;
  responseBody: string;
  status: number;
  createdAt: Date;
}

interface CacheEntry {
  state: "in_flight" | "completed";
  record?: IdempotencyRecord;
  expiresAt: number;
}

const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const cache = new Map<string, CacheEntry>();

// Lightweight cleanup — drop expired entries on read. Keeps the Map small
// without a dedicated sweeper. Runs in O(n) but only on cache writes, so the
// cost is amortised across requests.
function evictExpired(now: number): void {
  for (const [k, entry] of cache) {
    if (entry.expiresAt < now) cache.delete(k);
  }
}

/**
 * Read the X-Idempotency-Key header from an incoming Next.js request.
 *
 * Header lookup is case-insensitive (Next.js normalises to lowercase).
 * Returns null if the header is absent or empty — callers should treat null
 * as "idempotency skipped" (pass-through).
 */
export function getIdempotencyKey(req: NextRequest): string | null {
  const raw = req.headers.get("x-idempotency-key");
  if (!raw) return null;
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Wrap an irreversible action with idempotency protection.
 *
 * Behaviour:
 *   - If `key` is null → idempotency is skipped; fn runs normally and the
 *     result is returned with `cached: false`. (Pass-through.)
 *   - If `key` was seen before AND the action completed successfully (2xx) →
 *     replay the cached response body + status with `cached: true`.
 *   - If `key` was seen before but the action is still in-flight → return
 *     { body: { error: "IDEMPOTENCY_IN_FLIGHT", ... }, status: 409, cached: false }.
 *   - Otherwise → mark in-flight, run fn, store the response (only on 2xx
 *     success — validation/server errors are NOT cached so the caller can
 *     fix the payload and retry with the same key), return with `cached: false`.
 *
 * Errors thrown by `fn` propagate to the caller — the in-flight marker is
 * cleared so the same key can be retried.
 */
export async function withIdempotency(
  key: string | null,
  action: string,
  fn: () => Promise<{ body: any; status: number }>
): Promise<{ body: any; status: number; cached: boolean }> {
  // No key → pass-through (no idempotency).
  if (!key) {
    const result = await fn();
    return { body: result.body, status: result.status, cached: false };
  }

  const cacheKey = `${action}:${key}`;
  const now = Date.now();
  evictExpired(now);

  const existing = cache.get(cacheKey);
  if (existing) {
    if (existing.state === "completed" && existing.record) {
      // Cached successful response — replay it verbatim.
      logger.debug("[idempotency] cache HIT", { action, key, status: existing.record.status });
      try {
        const body = JSON.parse(existing.record.responseBody);
        return { body, status: existing.record.status, cached: true };
      } catch {
        // Cached body is malformed (shouldn't happen) — fall through and re-run.
        cache.delete(cacheKey);
      }
    } else {
      // In-flight — reject the duplicate to prevent double-execution.
      logger.warn("[idempotency] in-flight duplicate rejected", { action, key });
      return {
        body: {
          error: "IDEMPOTENCY_IN_FLIGHT",
          message: `Action "${action}" with key "${key}" is already being processed. Retry shortly.`,
          action,
          key,
        },
        status: 409,
        cached: false,
      };
    }
  }

  // Mark in-flight BEFORE running fn so a concurrent duplicate sees it.
  cache.set(cacheKey, { state: "in_flight", expiresAt: now + TTL_MS });

  try {
    const result = await fn();
    // Cache only successful responses (2xx). Validation/server errors are not
    // cached so the caller can fix the payload and retry with the same key.
    if (result.status >= 200 && result.status < 300) {
      const record: IdempotencyRecord = {
        key,
        action,
        responseBody: JSON.stringify(result.body),
        status: result.status,
        createdAt: new Date(),
      };
      cache.set(cacheKey, { state: "completed", record, expiresAt: now + TTL_MS });
      logger.debug("[idempotency] cached new response", { action, key, status: result.status });
    } else {
      // Non-success — remove the in-flight marker so the next retry can re-run.
      cache.delete(cacheKey);
    }
    return { body: result.body, status: result.status, cached: false };
  } catch (err) {
    // fn threw — clear the in-flight marker so the caller can retry.
    cache.delete(cacheKey);
    throw err;
  }
}

/**
 * Test helper — clears the in-memory cache. Exported so unit tests can reset
 * state between cases. Not used in production code paths.
 */
export function __clearIdempotencyCacheForTests(): void {
  cache.clear();
}
