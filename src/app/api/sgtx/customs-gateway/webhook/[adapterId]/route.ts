// @ts-nocheck
/**
 * SGTX Customs Gateway — Webhook Receiver API
 * POST /api/sgtx/customs-gateway/webhook/<adapterId>
 *   Raw body: external government webhook event payload
 *   Headers:
 *     X-Signature     — HMAC-SHA256 hex (or "sha256=<hex>")
 *     X-Timestamp     — epoch ms (for replay protection)
 *     X-Idempotency-Key — optional, dedup key
 *
 * Pipeline:
 *   1. Rate-limit by source IP + adapterId (60 req/min default).
 *   2. Resolve adapter's WebhookSecurityConfig (HMAC-SHA256 + secretRef).
 *   3. Verify signature (constant-time compare).
 *   4. Replay protection (timestamp tolerance + nonce cache).
 *   5. processGovernmentEvent(payload, adapterId) — the 10-step pipeline.
 *
 * CRITICAL: never trust broker_gtid or filer_code from the payload — the
 * adapterId in the path is the SGTX-side identifier; the payload's broker
 * fields are advisory only and resolved via CustomsDeclaration lookup.
 */

import { NextRequest, NextResponse } from "next/server";
import { processGovernmentEvent } from "@/lib/sgtx/customs-gateway/event-processing";
import {
  verifyWebhookSignature,
  checkReplayProtection,
  checkRateLimit,
  sendToDeadLetter,
  type WebhookSecurityConfig,
} from "@/lib/sgtx/customs-gateway/webhook-security";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/**
 * Default webhook security config. Adapters can override per-adapter via
 * env vars (e.g. SGTX_WEBHOOK_CONFIG_<ADAPTER_ID>).
 *
 * The secret is resolved at verification time from the secretRef via the
 * webhook-security module's resolveSecret() helper.
 */
function getWebhookConfig(adapterId: string): WebhookSecurityConfig {
  try {
    return {
      signatureHeader: "X-Signature",
      signatureAlgorithm: "HMAC-SHA256",
      timestampHeader: "X-Timestamp",
      timestampToleranceMs: 5 * 60 * 1000, // 5 minutes
      secretRef: `SGTX_WEBHOOK_SECRET_${String(adapterId || "").toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    };
  } catch {
    return {
      signatureHeader: "X-Signature",
      signatureAlgorithm: "HMAC-SHA256",
      timestampHeader: "X-Timestamp",
      timestampToleranceMs: 5 * 60 * 1000,
      secretRef: "SGTX_WEBHOOK_DEV_SECRET",
    };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ adapterId: string }> },
) {
  try {
    const { adapterId } = await params;
    if (!adapterId) {
      return NextResponse.json(
        { ok: false, error: "adapterId is required in the path" },
        { status: 400 },
      );
    }

    // §1 Rate limit.
    const sourceIp =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const rate = await checkRateLimit(sourceIp, adapterId, 60);
    if (!rate.allowed) {
      return NextResponse.json(
        {
          ok: false,
          error: "RATE_LIMITED",
          retryAfterMs: rate.resetAt - Date.now(),
          resetAt: rate.resetAt,
        },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((rate.resetAt - Date.now()) / 1000)) },
        },
      );
    }

    // §2 Read body (raw text for signature verification).
    const rawBody = await req.text();
    if (!rawBody) {
      return NextResponse.json(
        { ok: false, error: "empty body" },
        { status: 400 },
      );
    }

    // §3 Verify signature.
    const config = getWebhookConfig(adapterId);
    const signature = req.headers.get(config.signatureHeader.toLowerCase()) || "";
    const signatureResult = await verifyWebhookSignature(rawBody, signature, config);
    if (!signatureResult.valid) {
      logger.warn("[api/customs-gateway/webhook] signature verification failed", {
        adapterId,
        reason: signatureResult.reason,
        sourceIp,
      });
      // Send to DLQ for forensic review.
      let parsed: any = null;
      try { parsed = JSON.parse(rawBody); } catch {}
      await sendToDeadLetter(
        parsed || rawBody,
        `signature verification failed: ${signatureResult.reason}`,
        adapterId,
      );
      return NextResponse.json(
        { ok: false, error: "SIGNATURE_INVALID", reason: signatureResult.reason },
        { status: 401 },
      );
    }

    // §4 Replay protection.
    let parsedBody: any;
    try {
      parsedBody = JSON.parse(rawBody);
    } catch (err) {
      await sendToDeadLetter(rawBody, `invalid JSON: ${String(err)}`, adapterId);
      return NextResponse.json(
        { ok: false, error: "INVALID_JSON" },
        { status: 400 },
      );
    }

    const eventId =
      parsedBody.event_id ||
      parsedBody.eventId ||
      parsedBody.id ||
      `${adapterId}-${Date.now()}`;
    const timestampHeader = config.timestampHeader
      ? req.headers.get(config.timestampHeader.toLowerCase())
      : null;
    const timestamp = timestampHeader ? Number(timestampHeader) : Date.now();
    const replay = await checkReplayProtection(eventId, timestamp, config.timestampToleranceMs);
    if (replay.isReplay) {
      logger.warn("[api/customs-gateway/webhook] replay detected", {
        adapterId,
        eventId,
        reason: replay.reason,
      });
      // Idempotent 200 OK — do not reprocess.
      return NextResponse.json(
        { ok: true, replay: true, reason: replay.reason, eventId },
        { status: 200 },
      );
    }

    // §5 Process the event through the 10-step pipeline.
    const event = await processGovernmentEvent(parsedBody, adapterId);
    return NextResponse.json(
      { ok: true, event, replay: false },
      { status: 200 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/webhook] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
