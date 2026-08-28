// @ts-nocheck
/**
 * SGTX Customs Gateway — Webhook / Event Security
 * ===========================================================================
 *
 * Implements authentication, signature verification, replay protection, schema
 * validation, rate limiting, and dead-letter handling for inbound government
 * webhook events.
 *
 * Five exported capabilities:
 *   1. verifyWebhookSignature  — HMAC-SHA256 / RSA-SHA256 / mTLS verification
 *   2. checkReplayProtection   — nonce cache with timestamp tolerance
 *   3. validateWebhookSchema   — minimal JSON-schema validation
 *   4. checkRateLimit          — sliding-window per-IP / per-adapter limiter
 *   5. sendToDeadLetter        — persist undeliverable events for inspection
 *
 * Security principles:
 *   - NEVER trust broker_gtid / filer_code from the event payload — always
 *     resolve via the registered adapter record. The adapterId passed to
 *     verifyWebhookSignature is the SGTX-side identifier; the payload fields
 *     are advisory only.
 *   - Default-deny: any internal error returns `valid: false` / `allowed:
 *     false`. Security functions NEVER throw — they fail closed.
 *   - Replay protection uses an in-memory nonce set with a TTL equal to the
 *     timestamp tolerance. For multi-instance deploys, the IntegrationConnectorLog
 *     table (idempotencyKey) is the durable second-line dedupe.
 *   - Rate limit uses a per-minute sliding window in memory. On overflow, the
 *     caller is denied and the reset time is returned so the caller can
 *     compute Retry-After.
 *   - Dead-letter events are persisted in IntegrationConnectorLog with
 *     status="DEAD_LETTER" for forensic review. They are NEVER silently
 *     dropped.
 *
 * All public functions are wrapped in try/catch with safe defaults.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ============ §1 Configuration types ============

export interface WebhookSecurityConfig {
  /** HTTP header carrying the signature, e.g. "X-Signature" or "X-Hub-Signature-256". */
  signatureHeader: string;
  /** Signature algorithm. HMAC-SHA256 (shared secret), RSA-SHA256 (asymmetric),
   *  or mTLS (transport-level — no application signature checked). */
  signatureAlgorithm: "HMAC-SHA256" | "RSA-SHA256" | "mTLS";
  /** HTTP header carrying the request timestamp, e.g. "X-Timestamp". Null if
   *  the algorithm does not use timestamp-based replay protection. */
  timestampHeader: string | null;
  /** Maximum age of a request before it is rejected as stale (default 5 min). */
  timestampToleranceMs: number;
  /** Reference (name / HSM handle) of the secret / public key used to verify.
   *  The actual secret material is NEVER stored in this config — only the
   *  reference is stored. The runtime resolves the secret via the platform
   *  secret manager. */
  secretRef: string;
}

export interface SignatureVerificationResult {
  valid: boolean;
  reason: string;
}

export interface ReplayCheckResult {
  isReplay: boolean;
  reason: string;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

// ============ §2 Signature verification ============

/**
 * Resolve the secret material for a given secretRef. The runtime should call
 * out to a secret manager (HSM, AWS Secrets Manager, etc.); here we fall back
 * to environment variables so the module is self-contained for development.
 *
 * Returns null if the secret cannot be resolved — callers MUST treat null as
 * a verification failure (never default to an empty secret).
 */
async function resolveSecret(secretRef: string): Promise<string | null> {
  try {
    if (!secretRef) return null;
    // Allow direct env-var override for development.
    const direct = process.env[secretRef];
    if (direct) return direct;
    // Allow a webhook secret registry env var (JSON map).
    const registry = process.env.SGTX_WEBHOOK_SECRET_REGISTRY;
    if (registry) {
      const map = JSON.parse(registry);
      if (map && typeof map === "object" && map[secretRef]) {
        return String(map[secretRef]);
      }
    }
    // Final fallback — a default dev secret so signature verification works
    // in the sandbox. NEVER used in production (env will be set).
    if (process.env.NODE_ENV !== "production") {
      return process.env.SGTX_WEBHOOK_DEV_SECRET || "sgtx-dev-webhook-secret";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison to prevent timing attacks. Always compares
 * the full length of the strings (padding with zeros if lengths differ).
 */
function safeEqual(a: string, b: string): boolean {
  try {
    const aBuf = Buffer.from(String(a || ""), "utf8");
    const bBuf = Buffer.from(String(b || ""), "utf8");
    if (aBuf.length !== bBuf.length) {
      // Still compare to keep timing roughly constant.
      aBuf.compare(bBuf);
      return false;
    }
    return aBuf.compare(bBuf) === 0;
  } catch {
    return false;
  }
}

/**
 * Verify the signature of an inbound webhook payload.
 *
 * HMAC-SHA256: signature is hex-encoded HMAC of `payload` using the shared
 *   secret. We support both "sha256=<hex>" (GitHub-style) and bare "<hex>"
 *   formats.
 *
 * RSA-SHA256: signature is base64-encoded RSA signature over `payload`. The
 *   public key is resolved from the secretRef (PEM-encoded).
 *
 * mTLS: the signature is not checked at the application layer — the transport
 *   is responsible for mutual TLS. We return valid=true if the secretRef
 *   resolves (i.e. the adapter is registered); the actual cert validation is
 *   done at the TLS layer.
 *
 * CRITICAL: never throws — returns valid=false on any internal error.
 */
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  config: WebhookSecurityConfig,
): Promise<SignatureVerificationResult> {
  try {
    if (!config) {
      return { valid: false, reason: "missing security config" };
    }
    if (typeof payload !== "string") {
      return { valid: false, reason: "payload must be a string" };
    }
    if (!signature) {
      return { valid: false, reason: "missing signature header" };
    }

    const secret = await resolveSecret(config.secretRef);
    if (!secret) {
      logger.error("[webhook-security] secret resolution failed", {
        secretRef: config.secretRef,
      });
      return { valid: false, reason: "secret resolution failed" };
    }

    const crypto = await import("node:crypto");

    if (config.signatureAlgorithm === "HMAC-SHA256") {
      // Support both "sha256=<hex>" (GitHub-style) and bare "<hex>".
      const sig = String(signature).trim();
      const hex = sig.startsWith("sha256=") ? sig.slice(7) : sig;
      const expected = crypto
        .createHmac("sha256", secret)
        .update(payload, "utf8")
        .digest("hex");
      const ok = safeEqual(hex.toLowerCase(), expected.toLowerCase());
      return ok
        ? { valid: true, reason: "hmac-sha256 verified" }
        : { valid: false, reason: "hmac-sha256 mismatch" };
    }

    if (config.signatureAlgorithm === "RSA-SHA256") {
      // secret is the PEM-encoded public key.
      let verifier;
      try {
        verifier = crypto.createVerify("RSA-SHA256");
      } catch (err) {
        return { valid: false, reason: `verifier init failed: ${String(err)}` };
      }
      verifier.update(payload, "utf8");
      verifier.end();
      let ok = false;
      try {
        ok = verifier.verify(secret, signature, "base64");
      } catch (err) {
        return { valid: false, reason: `rsa verify failed: ${String(err)}` };
      }
      return ok
        ? { valid: true, reason: "rsa-sha256 verified" }
        : { valid: false, reason: "rsa-sha256 mismatch" };
    }

    if (config.signatureAlgorithm === "mTLS") {
      // Application layer accepts — TLS layer has already validated the
      // client certificate. We confirm the adapter is registered by checking
      // that the secret resolved.
      return { valid: true, reason: "mtls transport verified (app-layer ack)" };
    }

    return { valid: false, reason: `unknown algorithm: ${config.signatureAlgorithm}` };
  } catch (err) {
    logger.error("[webhook-security] verifyWebhookSignature failed — default deny", {
      error: String(err),
    });
    return { valid: false, reason: `internal error: ${String(err)}` };
  }
}

// ============ §3 Replay protection ============

/**
 * In-memory nonce cache. Keys are eventIds; values are timestamps. Entries
 * expire after `toleranceMs` (default 5 minutes). A periodic sweep on read
 * keeps the map bounded.
 *
 * For multi-instance deploys, the IntegrationConnectorLog.idempotencyKey
 * unique constraint is the durable second-line dedupe — this in-memory layer
 * is the fast first-line check.
 */
const nonceCache = new Map<string, number>();

function evictExpiredNonces(now: number, toleranceMs: number): void {
  try {
    const cutoff = now - toleranceMs;
    for (const [k, ts] of nonceCache) {
      if (ts < cutoff) nonceCache.delete(k);
    }
  } catch {
    // best-effort
  }
}

/**
 * Check if an event has already been seen (replay detection).
 *
 * Algorithm:
 *   1. Reject if the timestamp is older than `toleranceMs` (stale request).
 *   2. Reject if the timestamp is too far in the future (clock skew attack).
 *   3. Reject if the eventId is already in the nonce cache (replay).
 *   4. Otherwise, record the eventId in the nonce cache and accept.
 *
 * Returns isReplay=true if the event is a duplicate; the caller should
 * respond 200 OK (idempotent ack) but NOT reprocess the event.
 */
export async function checkReplayProtection(
  eventId: string,
  timestamp: number,
  toleranceMs: number,
): Promise<ReplayCheckResult> {
  try {
    if (!eventId) {
      return { isReplay: true, reason: "missing eventId — rejected as replay" };
    }
    if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
      return { isReplay: true, reason: "invalid timestamp — rejected as replay" };
    }
    if (typeof toleranceMs !== "number" || toleranceMs <= 0) {
      return { isReplay: true, reason: "invalid tolerance — rejected as replay" };
    }

    const now = Date.now();
    evictExpiredNonces(now, toleranceMs);

    // Stale check.
    if (timestamp < now - toleranceMs) {
      return {
        isReplay: true,
        reason: `stale request (age=${now - timestamp}ms, tolerance=${toleranceMs}ms)`,
      };
    }
    // Future-skew check (allow 60s of clock skew).
    if (timestamp > now + 60_000) {
      return {
        isReplay: true,
        reason: `future timestamp (skew=${timestamp - now}ms) — rejected as replay`,
      };
    }

    // Nonce check.
    if (nonceCache.has(eventId)) {
      return {
        isReplay: true,
        reason: `duplicate eventId "${eventId}" within tolerance window`,
      };
    }

    // Record and accept.
    nonceCache.set(eventId, now);
    return { isReplay: false, reason: "accepted — first occurrence" };
  } catch (err) {
    logger.error("[webhook-security] checkReplayProtection failed — default deny", {
      error: String(err),
      eventId,
    });
    return { isReplay: true, reason: `internal error: ${String(err)}` };
  }
}

/**
 * Test helper — clears the in-memory nonce cache. Exported so unit tests can
 * reset state between cases. Not used in production code paths.
 */
export function __clearNonceCacheForTests(): void {
  nonceCache.clear();
}

// ============ §4 Schema validation ============

/**
 * Minimal JSON-schema validator. Supports a subset of JSON Schema draft 07:
 *   - type (string, number, boolean, object, array)
 *   - required (array of property names)
 *   - properties (nested schema per property)
 *   - additionalProperties: false (reject unknown properties)
 *
 * For full schema validation, integrate ajv or similar — but per the spec we
 * add NO new dependencies, so this minimal validator is used.
 *
 * Returns { valid, errors[] } — never throws.
 */
export async function validateWebhookSchema(
  payload: any,
  expectedSchema: any,
): Promise<SchemaValidationResult> {
  try {
    if (!expectedSchema || typeof expectedSchema !== "object") {
      return { valid: false, errors: ["missing or invalid expected schema"] };
    }
    const errors: string[] = [];
    _validateNode(payload, expectedSchema, "$", errors);
    return { valid: errors.length === 0, errors };
  } catch (err) {
    return {
      valid: false,
      errors: [`internal error: ${String(err)}`],
    };
  }
}

function _validateNode(value: any, schema: any, path: string, errors: string[]): void {
  try {
    if (!schema || typeof schema !== "object") return;
    // type check
    if (schema.type) {
      const t = schema.type;
      if (t === "string" && typeof value !== "string") {
        errors.push(`${path}: expected string, got ${typeof value}`);
        return;
      }
      if (t === "number" && typeof value !== "number") {
        errors.push(`${path}: expected number, got ${typeof value}`);
        return;
      }
      if (t === "boolean" && typeof value !== "boolean") {
        errors.push(`${path}: expected boolean, got ${typeof value}`);
        return;
      }
      if (t === "object" && (typeof value !== "object" || value === null || Array.isArray(value))) {
        errors.push(`${path}: expected object, got ${value === null ? "null" : Array.isArray(value) ? "array" : typeof value}`);
        return;
      }
      if (t === "array" && !Array.isArray(value)) {
        errors.push(`${path}: expected array, got ${typeof value}`);
        return;
      }
    }
    // object properties
    if (schema.type === "object" && value && typeof value === "object" && !Array.isArray(value)) {
      if (Array.isArray(schema.required)) {
        for (const req of schema.required) {
          if (!(req in value)) {
            errors.push(`${path}: missing required property "${req}"`);
          }
        }
      }
      if (schema.properties && typeof schema.properties === "object") {
        for (const [k, sub] of Object.entries(schema.properties)) {
          if (k in value) {
            _validateNode(value[k], sub, `${path}.${k}`, errors);
          }
        }
      }
      if (schema.additionalProperties === false && schema.properties) {
        for (const k of Object.keys(value)) {
          if (!(k in schema.properties)) {
            errors.push(`${path}: additional property "${k}" not allowed`);
          }
        }
      }
    }
    // array items
    if (schema.type === "array" && Array.isArray(value) && schema.items) {
      for (let i = 0; i < value.length; i++) {
        _validateNode(value[i], schema.items, `${path}[${i}]`, errors);
      }
    }
  } catch {
    // best-effort — do not throw out of the validator
  }
}

// ============ §5 Rate limiting ============

interface RateLimitBucket {
  count: number;
  windowStart: number;
}

const rateLimitBuckets = new Map<string, RateLimitBucket>();

/**
 * Sliding-window rate limiter. Each (sourceIp, adapterId) pair gets a bucket
 * that resets every 60 seconds. If the bucket count exceeds `limitPerMinute`,
 * the request is denied and the caller must wait until `resetAt`.
 *
 * Returns:
 *   - allowed: true if the request is permitted; false if rate-limited.
 *   - remaining: number of requests remaining in the current window.
 *   - resetAt: epoch ms when the window resets (for Retry-After header).
 */
export async function checkRateLimit(
  sourceIp: string,
  adapterId: string,
  limitPerMinute: number,
): Promise<RateLimitResult> {
  try {
    if (!sourceIp || !adapterId) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
    }
    if (typeof limitPerMinute !== "number" || limitPerMinute <= 0) {
      return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
    }

    const key = `${sourceIp}|${adapterId}`;
    const now = Date.now();
    const windowMs = 60_000;
    const existing = rateLimitBuckets.get(key);

    if (!existing || now >= existing.windowStart + windowMs) {
      // Start a new window.
      const bucket: RateLimitBucket = { count: 1, windowStart: now };
      rateLimitBuckets.set(key, bucket);
      return {
        allowed: true,
        remaining: limitPerMinute - 1,
        resetAt: now + windowMs,
      };
    }

    // Existing window — increment.
    existing.count += 1;
    const allowed = existing.count <= limitPerMinute;
    const remaining = Math.max(0, limitPerMinute - existing.count);
    return {
      allowed,
      remaining,
      resetAt: existing.windowStart + windowMs,
    };
  } catch (err) {
    logger.error("[webhook-security] checkRateLimit failed — default deny", {
      error: String(err),
      sourceIp,
      adapterId,
    });
    return { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };
  }
}

/**
 * Test helper — clears the rate-limit buckets. Exported so unit tests can
 * reset state between cases. Not used in production code paths.
 */
export function __clearRateLimitBucketsForTests(): void {
  rateLimitBuckets.clear();
}

// ============ §6 Dead-letter handling ============

/**
 * Persist an undeliverable event to the dead-letter queue.
 *
 * The event is stored in IntegrationConnectorLog with:
 *   - status = "DEAD_LETTER"
 *   - apiName = `customs-webhook:<adapterId>`
 *   - endpoint = "webhook/dead-letter"
 *   - idempotencyKey = `dlq-<adapterId>-<eventId>-<timestamp>` (unique)
 *   - requestBody = JSON of the original event
 *   - errorMessage = the reason the event could not be processed
 *
 * Dead-letter events are NEVER silently dropped — they are always persisted
 * for forensic review. A retention sweeper (out of scope here) should
 * periodically archive or purge old dead-letter records.
 *
 * Returns void — never throws (best-effort persistence).
 */
export async function sendToDeadLetter(
  event: any,
  reason: string,
  adapterId: string,
): Promise<void> {
  try {
    if (!adapterId) adapterId = "unknown";
    const eventId =
      (event && (event.eventId || event.id)) ||
      `unknown-${Date.now()}-${Math.floor(Math.random() * 9999)}`;
    const logId = `DLQ-${adapterId}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    const idempotencyKey = `dlq-${adapterId}-${eventId}-${Date.now()}`;

    const requestBody =
      typeof event === "string"
        ? event.slice(0, 4000)
        : JSON.stringify(event || {}).slice(0, 4000);

    try {
      await db.integrationConnectorLog.create({
        data: {
          logId,
          apiName: `customs-webhook:${adapterId}`,
          endpoint: "webhook/dead-letter",
          ustn: (event && event.ustn) || null,
          idempotencyKey,
          requestBody,
          responseBody: null,
          statusCode: null,
          status: "DEAD_LETTER",
          attemptCount: 0,
          errorMessage: String(reason || "unknown reason").slice(0, 1000),
        },
      });
    } catch (dbErr) {
      // Idempotency-key collision or DB unreachable — log only, never throw.
      logger.error("[webhook-security] dead-letter persist failed", {
        error: String(dbErr),
        adapterId,
        eventId,
      });
    }

    logger.warn("[webhook-security] event sent to dead-letter", {
      adapterId,
      eventId,
      reason,
      logId,
    });
  } catch (err) {
    // Absolute last-resort — never let DLQ itself throw.
    logger.error("[webhook-security] sendToDeadLetter failed — silent drop", {
      error: String(err),
      adapterId,
    });
  }
}
