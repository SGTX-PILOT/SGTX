// SGTX Brain OS — Per-Tenant Capability Rate Limiter
// =============================================================================
// Fixed-window in-memory rate limiter, keyed by (tenantGtid, capability).
// Applied to AI-intensive capabilities (intelligence.*, market.*) to prevent
// a single tenant from saturating the model pipeline. The limit is generous
// (100/min) — its purpose is to absorb runaway loops and accidental
// fan-outs, not to throttle legitimate trade workflows.
//
// The map is process-local; for multi-instance production deployments the
// same check should be backed by Redis (or a Postgres advisory lock). The
// interface below is intentionally storage-agnostic so the swap is drop-in.
// =============================================================================

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number; // epoch ms
}

interface RateBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 60_000; // 1 minute
const MAX_PER_TENANT = 100;

// Two separate maps for the two rate-limited capability families. Both use
// the same limit but are tracked independently so a burst of `intelligence.*`
// calls doesn't eat into a tenant's `market.*` budget.
const rateMap = new Map<string, RateBucket>();

/**
 * Capability families that are subject to per-tenant rate limiting. We
 * rate-limit AI-heavy capabilities (model inference, market data scraping)
// but never the synchronous control plane (compliance, logistics, payment).
 */
const RATE_LIMITED_PREFIXES = ["intelligence.", "market."];

/** True if a capability is in a rate-limited family. */
export function isRateLimited(capability: string): boolean {
  for (const prefix of RATE_LIMITED_PREFIXES) {
    if (capability.startsWith(prefix)) return true;
  }
  return false;
}

/**
 * Check (and consume) one unit against the tenant's per-capability budget.
 * The first call within a window seeds a fresh bucket; subsequent calls
 * increment until the window resets.
 */
export function checkRateLimit(
  tenantGtid: string,
  capability: string,
): RateLimitDecision {
  const key = `${tenantGtid}:${capability}`;
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt < now) {
    const resetAt = now + WINDOW_MS;
    rateMap.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_PER_TENANT - 1, resetAt };
  }
  if (entry.count >= MAX_PER_TENANT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  entry.count++;
  return {
    allowed: true,
    remaining: MAX_PER_TENANT - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Peek without consuming — useful for dashboard / pre-flight checks. Does
 * not mutate the bucket.
 */
export function peekRateLimit(
  tenantGtid: string,
  capability: string,
): RateLimitDecision {
  const key = `${tenantGtid}:${capability}`;
  const now = Date.now();
  const entry = rateMap.get(key);
  if (!entry || entry.resetAt < now) {
    return { allowed: true, remaining: MAX_PER_TENANT, resetAt: now + WINDOW_MS };
  }
  if (entry.count >= MAX_PER_TENANT) {
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }
  return {
    allowed: true,
    remaining: MAX_PER_TENANT - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset a single tenant's bucket for a capability (manual override for
// break-glass / admin tools).
 */
export function resetRateLimit(tenantGtid: string, capability: string): void {
  rateMap.delete(`${tenantGtid}:${capability}`);
}

/** Clear every bucket — used by tests. */
export function clearRateLimits(): void {
  rateMap.clear();
}

/** Snapshot the live buckets for observability dashboards. */
export function snapshotRateLimits(): Array<{
  tenantGtid: string;
  capability: string;
  count: number;
  resetAt: number;
  remaining: number;
}> {
  const now = Date.now();
  return Array.from(rateMap.entries())
    .filter(([, v]) => v.resetAt >= now)
    .map(([k, v]) => {
      const [tenantGtid, capability] = k.split(":");
      return {
        tenantGtid,
        capability,
        count: v.count,
        resetAt: v.resetAt,
        remaining: Math.max(0, MAX_PER_TENANT - v.count),
      };
    });
}

export const RATE_LIMIT_CONFIG = {
  windowMs: WINDOW_MS,
  maxPerTenant: MAX_PER_TENANT,
  prefixes: RATE_LIMITED_PREFIXES,
} as const;
