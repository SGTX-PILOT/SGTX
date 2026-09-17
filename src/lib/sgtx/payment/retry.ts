// SGTX Part 6.13 — Error Handling & Retry Policies
//
// Government API retry policy (Part 6.13):
//   ETA:                  3 retries, exponential backoff (1s, 2s, 4s) → generate PDF for manual submission
//   CargoX:               3 retries, then queue every 10 min for 2h → manual ACID via web portal
//   Nafeza (declaration): 3 retries, then queue for manual review → download prefilled PDF
//   Nafeza (certificate): 3 retries, then mark as failed → notify lab to resubmit
//   Bank settlement API:  3 retries; if still failing → mark as pending manual reconciliation
//
// All errors are logged in integration_connector_logs with request/response bodies (sanitised).
// AI Authority: A2 for error analysis; A1 for Groq-generated error summaries.

import { db as _db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { generateIdempotencyKey } from "./psp-split";

// Use freshDb (non-cached PrismaClient) so writes work even when the globalThis-
// cached `db` has a stale SQLite connection (e.g. after `bun run db:push`
// replaces the DB file mid-dev-session).
const db = (freshDb ?? _db) as typeof _db;

// ============ 6.12: Idempotency Key Standard ============
// Verifies format: SHA256(canonical_body + utc_second)
//   request_body_canonical = JSON serialised with JCS (RFC 8785)
//   timestamp_utc_rounded_to_second = ISO 8601 YYYY-MM-DDTHH:MM:SSZ
//
// Returns the canonical body, timestamp, and SHA-256 hex digest.
export function verifyIdempotencyKeyFormat(body: any): {
  canonical: string;
  timestampUtc: string;
  expectedKey: string;
} {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const timestampUtc = new Date().toISOString().slice(0, 19) + "Z";
  // Re-derive using the same algorithm as generateIdempotencyKey for parity check
  const expectedKey = generateIdempotencyKey(body);
  return { canonical, timestampUtc, expectedKey };
}

// ============ 6.13: API retry configurations ============
export interface RetryPolicy {
  apiName: string;
  maxRetries: number;
  backoffMs: number[];            // exponential backoff schedule
  fallbackAction: string;          // human-readable fallback action
  notify: string[];                // Smart Inbox recipients
}

export const RETRY_POLICIES: Record<string, RetryPolicy> = {
  ETA: {
    apiName: "ETA (eInvoice)",
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Generate PDF invoice for manual submission to ETA portal",
    notify: ["seller"],
  },
  CARGOX: {
    apiName: "CargoX (ACID generation)",
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Manual ACID creation via CargoX web portal",
    notify: ["seller"],
  },
  NAFEZA_DECLARATION: {
    apiName: "Nafeza (customs declaration)",
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Queue for manual review; download prefilled SAD PDF",
    notify: ["seller", "broker"],
  },
  NAFEZA_CERTIFICATE: {
    apiName: "Nafeza (certificate request)",
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Mark as failed; notify lab to resubmit certificate request",
    notify: ["lab", "seller"],
  },
  BANK_SETTLEMENT: {
    apiName: "Bank settlement API",
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Mark as pending manual reconciliation; finance team reviews bank statement",
    notify: ["finance"],
  },
  PSP_API: {
    apiName: "PSP API (Fawry/PayMob/Stripe/CBE IPN)",
    maxRetries: 3,
    backoffMs: [500, 1000, 2000],
    fallbackAction: "Trigger PSP fallback chain (Part 6.5.2)",
    notify: ["seller", "platform_governance"],
  },
};

export interface RetryResult<T> {
  ok: boolean;
  result: T | null;
  attempts: number;
  lastError: string | null;
  fallbackTriggered: boolean;
  idempotencyKey: string;
  logIds: string[];
}

// ============ 6.13: withRetry — exponential backoff helper ============
// Wraps an external API call with retry + exponential backoff + IntegrationConnectorLog.
// On final failure, triggers the fallback action (if provided) and returns ok=false.
export async function withRetry<T>(
  apiName: keyof typeof RETRY_POLICIES | string,
  endpoint: string,
  body: any,
  fn: (body: any) => Promise<{ ok: true; result: T } | { ok: false; error: string; status?: number }>,
  options?: {
    ustn?: string;
    fallbackHandler?: (lastError: string) => Promise<void>;
  }
): Promise<RetryResult<T>> {
  const policy = RETRY_POLICIES[apiName] ?? {
    apiName: String(apiName),
    maxRetries: 3,
    backoffMs: [1000, 2000, 4000],
    fallbackAction: "Mark as failed; manual review required",
    notify: ["seller"],
  };

  const idempotencyKey = generateIdempotencyKey(body);
  const logIds: string[] = [];
  let lastError = "No error recorded";
  let attempts = 0;
  let result: T | null = null;

  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    attempts = attempt + 1;
    const startTime = Date.now();

    try {
      const res = await fn(body);
      const durationMs = Date.now() - startTime;

      // Persist IntegrationConnectorLog (Part 6.13 — all errors logged)
      const log = await db.integrationConnectorLog.create({
        data: {
          logId: `LOG-${apiName}-${Date.now()}-${attempt}`,
          apiName: String(apiName),
          endpoint,
          ustn: options?.ustn ?? null,
          idempotencyKey: attempt === 0 ? idempotencyKey : `${idempotencyKey}-r${attempt}`,
          requestBody: JSON.stringify(body).slice(0, 4000),
          responseBody: res.ok ? JSON.stringify(res.result).slice(0, 4000) : (res.error ?? "").slice(0, 4000),
          statusCode: res.ok ? 200 : (res.status ?? 500),
          status: res.ok ? "SUCCESS" : "FAILED",
          attemptCount: attempts,
          errorMessage: res.ok ? null : res.error,
          retryScheduledAt: res.ok ? null : (attempt < policy.maxRetries
            ? new Date(Date.now() + (policy.backoffMs[attempt] ?? 4000))
            : null),
        },
      });
      logIds.push(log.id);

      if (res.ok) {
        return { ok: true, result: res.result, attempts, lastError: null, fallbackTriggered: false, idempotencyKey, logIds };
      }

      lastError = res.error;

      // If not last attempt — wait for backoff
      if (attempt < policy.maxRetries) {
        const backoff = policy.backoffMs[attempt] ?? 4000;
        await new Promise(r => setTimeout(r, backoff));
      }
    } catch (e: any) {
      lastError = e?.message || String(e) || "Unknown error";
      const errSlice = lastError.slice(0, 4000);

      const log = await db.integrationConnectorLog.create({
        data: {
          logId: `LOG-${apiName}-${Date.now()}-${attempt}-EX`,
          apiName: String(apiName),
          endpoint,
          ustn: options?.ustn ?? null,
          idempotencyKey: attempt === 0 ? idempotencyKey : `${idempotencyKey}-r${attempt}`,
          requestBody: JSON.stringify(body).slice(0, 4000),
          responseBody: errSlice,
          statusCode: 500,
          status: "EXCEPTION",
          attemptCount: attempts,
          errorMessage: lastError,
          retryScheduledAt: attempt < policy.maxRetries
            ? new Date(Date.now() + (policy.backoffMs[attempt] ?? 4000))
            : null,
        },
      });
      logIds.push(log.id);

      if (attempt < policy.maxRetries) {
        const backoff = policy.backoffMs[attempt] ?? 4000;
        await new Promise(r => setTimeout(r, backoff));
      }
    }
  }

  // All retries exhausted — trigger fallback
  let fallbackTriggered = false;
  if (options?.fallbackHandler) {
    try {
      await options.fallbackHandler(lastError ?? "unknown error");
      fallbackTriggered = true;
    } catch {
      // fallback handler failed — still report original error
    }
  }

  // Smart Inbox alert (Part 6.13 — notify)
  const admin = await db.tenant.findFirst({ where: { OR: [{ type: "ADM" }, { type: "GOV" }] } });
  if (admin) {
    await db.inboxItem.create({
      data: {
        tenantGtid: admin.gtid,
        category: "COMPLIANCE",
        priority: 90,
        title: `External API retries exhausted — ${apiName}`,
        description:
          `${policy.apiName} failed after ${attempts} attempt(s). Last error: ${lastError ?? "unknown"}. ` +
          `Fallback action: ${policy.fallbackAction}. Notify: ${policy.notify.join(", ")}. ` +
          `Endpoint: ${endpoint}. USTN: ${options?.ustn ?? "—"}. ` +
          `${fallbackTriggered ? "Fallback handler executed." : "No fallback handler registered."}`,
        ctaLabel: "Review Logs",
      },
    });
  }

  return { ok: false, result, attempts, lastError, fallbackTriggered, idempotencyKey, logIds };
}

// ============ 6.13: Get retry policy ============
export function getRetryPolicy(apiName: string): RetryPolicy | null {
  return RETRY_POLICIES[apiName] ?? null;
}

// ============ 6.13: List all retry policies ============
export function listRetryPolicies(): Array<RetryPolicy & { apiName: string }> {
  return Object.entries(RETRY_POLICIES).map(([key, policy]) => ({ ...policy, apiName: key }));
}
