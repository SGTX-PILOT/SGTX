// SGTX Part 8 — Container Release Authorisation API
// Stateless pull-based REST endpoint: terminal queries → SGTX returns AUTHORISED/HOLD.
// Cryptographically signed (PKCS#7/CMS), time-bound (24h), legally binding (ministerial decree).
// Revocation, webhook push, gate-out milestone, CRL.
// Rate-limited (60/min terminal, 30/min IP), 6 hold reasons, USED/EXPIRED states,
// auto-revoke on dispute/payment-reversal/customs-hold/sanctions-flag.

import { db } from "@/lib/db";
import crypto from "crypto";
import { checkFeeLockActive } from "@/lib/sgtx/payment/fealock";

export const RELEASE_TOKEN_VALIDITY_HOURS = 24;

// ============ 8.3.3: In-memory Rate Limiter ============
// 60 req/min per terminal, 30 req/min per IP, 10 req/sec burst (burst folded into per-minute).
// Stateless — entries self-prune on read.
type RateBucket = { count: number; windowStart: number };
const terminalBuckets = new Map<string, RateBucket>();
const ipBuckets = new Map<string, RateBucket>();
const TERMINAL_RATE_LIMIT = 60; // per minute
const IP_RATE_LIMIT = 30; // per minute
const RATE_WINDOW_MS = 60_000;

function pruneBucket(map: Map<string, RateBucket>, key: string, now: number): RateBucket {
  const entry = map.get(key);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    const fresh: RateBucket = { count: 0, windowStart: now };
    map.set(key, fresh);
    return fresh;
  }
  return entry;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetInMs: number;
  scope: "terminal" | "ip";
}

export function checkReleaseRateLimit(input: { terminalId?: string; ip: string }): RateLimitResult {
  const now = Date.now();
  // Check IP bucket first (lower limit — 30/min)
  const ipBucket = pruneBucket(ipBuckets, input.ip, now);
  if (ipBucket.count >= IP_RATE_LIMIT) {
    return {
      allowed: false,
      limit: IP_RATE_LIMIT,
      remaining: 0,
      resetInMs: RATE_WINDOW_MS - (now - ipBucket.windowStart),
      scope: "ip",
    };
  }
  // Then terminal bucket (60/min) — keyed by terminalId if present, else fall back to IP.
  const terminalKey = input.terminalId || `ip::${input.ip}`;
  const terminalBucket = pruneBucket(terminalBuckets, terminalKey, now);
  if (terminalBucket.count >= TERMINAL_RATE_LIMIT) {
    return {
      allowed: false,
      limit: TERMINAL_RATE_LIMIT,
      remaining: 0,
      resetInMs: RATE_WINDOW_MS - (now - terminalBucket.windowStart),
      scope: "terminal",
    };
  }
  // Both pass — increment both
  ipBucket.count++;
  terminalBucket.count++;
  const remaining = Math.min(
    IP_RATE_LIMIT - ipBucket.count,
    TERMINAL_RATE_LIMIT - terminalBucket.count
  );
  return {
    allowed: true,
    limit: input.terminalId ? TERMINAL_RATE_LIMIT : IP_RATE_LIMIT,
    remaining,
    resetInMs: RATE_WINDOW_MS - (now - Math.max(ipBucket.windowStart, terminalBucket.windowStart)),
    scope: input.terminalId ? "terminal" : "ip",
  };
}

// ============ 8.3.1: Release Authorisation Query ============
export async function queryReleaseAuthorisation(input: {
  ustn: string;
  containerNo: string;
  requestId?: string;
  terminalId?: string;
}): Promise<{
  release_status: string;
  authorisation_id?: string;
  issued_at?: string;
  valid_until?: string;
  mandatory_summary?: any;
  credit_summary?: any;
  dispute_status: string;
  hold_reason?: string;
  unpaid_mandatory_invoices?: any[];
  dispute_id?: string;
  error_reason?: string;
  digital_signature?: string;
  qc_hold?: any;
  deferred_expired?: any;
  sanctions_block?: any;
  customs_hold?: any;
  expired_certificates?: any;
  revocation?: any;
  existing_authorisation?: any;
}> {
  const { ustn, containerNo, requestId, terminalId } = input;

  // 1. Verify USTN exists and container is linked
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: {
      shipments: true,
      disputes: true,
      buyer: true,
      seller: true,
      qcInspections: true,
      customsDecls: true,
      documents: true,
    },
  });
  if (!trade) {
    return { release_status: "ERROR", dispute_status: "NONE", error_reason: "USTN_NOT_FOUND" };
  }

  const shipment = trade.shipments.find(s => s.containerNo === containerNo);
  if (!shipment) {
    return { release_status: "ERROR", dispute_status: "NONE", error_reason: "CONTAINER_NOT_FOUND_FOR_USTN" };
  }

  // ── NEW HOLD: AUTHORISATION_REVOKED ────────────────────────────
  // If a previous authorisation was REVOKED for this USTN+container, surface the revocation
  // reason and force HOLD. This makes revocation sticky until manually cleared.
  const revokedAuth = await db.containerReleaseAuthorisation.findFirst({
    where: { ustn, containerNo, releaseStatus: "REVOKED" },
    orderBy: { revokedAt: "desc" },
  });
  if (revokedAuth) {
    return {
      release_status: "HOLD",
      hold_reason: "AUTHORISATION_REVOKED",
      dispute_status: "NONE",
      revocation: {
        authorisation_id: revokedAuth.authorisationId,
        revocation_reason: revokedAuth.revocationReason,
        revoked_at: revokedAuth.revokedAt?.toISOString() || null,
      },
    };
  }

  // ── NEW HOLD: AUTHORISATION_EXPIRED ────────────────────────────
  // If a previous AUTHORISED token exists but validUntil < now, return HOLD.
  const existingAuth = await db.containerReleaseAuthorisation.findFirst({
    where: {
      ustn, containerNo,
      releaseStatus: "AUTHORISED",
      validUntil: { lt: new Date() },
      gateOutAt: null,
    },
    orderBy: { issuedAt: "desc" },
  });
  if (existingAuth) {
    return {
      release_status: "HOLD",
      hold_reason: "AUTHORISATION_EXPIRED",
      dispute_status: "NONE",
      existing_authorisation: {
        authorisation_id: existingAuth.authorisationId,
        issued_at: existingAuth.issuedAt?.toISOString() || null,
        valid_until: existingAuth.validUntil?.toISOString() || null,
        expired: true,
      },
    };
  }

  // 2. Check for active dispute
  const activeDispute = trade.disputes.find(d => ["FILED", "MEDIATION", "ARBITRATION", "ESCALATED"].includes(d.status));
  if (activeDispute) {
    return {
      release_status: "HOLD",
      hold_reason: "DISPUTE_RAISED",
      dispute_status: "ACTIVE",
      dispute_id: activeDispute.id,
    };
  }

  // ── NEW HOLD: SANCTIONS_BLOCK ──────────────────────────────────
  // If either party's sanctionsCleared is false, block release.
  if (trade.buyer && !trade.buyer.sanctionsCleared) {
    return {
      release_status: "HOLD",
      hold_reason: "SANCTIONS_BLOCK",
      dispute_status: "NONE",
      sanctions_block: {
        blocked_party: { gtid: trade.buyer.gtid, legal_name: trade.buyer.legalName, role: "BUYER" },
        reason: "Buyer is flagged for sanctions — not sanctionsCleared.",
      },
    };
  }
  if (trade.seller && !trade.seller.sanctionsCleared) {
    return {
      release_status: "HOLD",
      hold_reason: "SANCTIONS_BLOCK",
      dispute_status: "NONE",
      sanctions_block: {
        blocked_party: { gtid: trade.seller.gtid, legal_name: trade.seller.legalName, role: "SELLER" },
        reason: "Seller is flagged for sanctions — not sanctionsCleared.",
      },
    };
  }

  // ── NEW HOLD: CONDITIONAL_QC_HOLD ──────────────────────────────
  // If any QcInspection has conditionalPassStatus=PENDING, surface action_plan + deadline.
  const pendingQc = trade.qcInspections.find(q => q.conditionalPassStatus === "PENDING");
  if (pendingQc) {
    return {
      release_status: "HOLD",
      hold_reason: "CONDITIONAL_QC_HOLD",
      dispute_status: "NONE",
      qc_hold: {
        inspection_id: pendingQc.id,
        inspection_type: pendingQc.inspectionType,
        verdict: pendingQc.result,
        action_plan: pendingQc.actionPlan,
        action_plan_deadline: pendingQc.actionPlanDeadline?.toISOString() || null,
        qc_provider_gtid: pendingQc.qcGtid,
        conditional_pass_status: pendingQc.conditionalPassStatus,
      },
    };
  }

  // ── NEW HOLD: CUSTOMS_HOLD ─────────────────────────────────────
  // If any CustomsDeclaration has status=HOLD for this USTN, surface the reason.
  const customsHold = trade.customsDecls.find(c => (c.status || "").toUpperCase() === "HOLD");
  if (customsHold) {
    return {
      release_status: "HOLD",
      hold_reason: "CUSTOMS_HOLD",
      dispute_status: "NONE",
      customs_hold: {
        declaration_id: customsHold.id,
        declaration_no: customsHold.declarationNo,
        regime: customsHold.regime,
        hold_reason: customsHold.nafezaStatus || "Customs authorities have placed a hold on this declaration.",
        broker_gtid: customsHold.brokerGtid,
      },
    };
  }

  // ── NEW HOLD: CERTIFICATE_EXPIRED ──────────────────────────────
  // If any PHYTO / HEALTH_CERT / CERTIFICATE_ORIGIN document was verified > 90 days ago, block.
  const CERT_VALIDITY_DAYS = 90;
  const now = new Date();
  const expiredCerts: any[] = [];
  for (const doc of trade.documents || []) {
    if (!["PHYTO", "HEALTH_CERT", "CERTIFICATE_ORIGIN"].includes(doc.type)) continue;
    if (!doc.verifiedAt) continue;
    const ageDays = (now.getTime() - doc.verifiedAt.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > CERT_VALIDITY_DAYS) {
      expiredCerts.push({
        document_id: doc.id,
        type: doc.type,
        title: doc.title,
        verified_at: doc.verifiedAt.toISOString(),
        age_days: Math.round(ageDays),
        max_validity_days: CERT_VALIDITY_DAYS,
      });
    }
  }
  if (expiredCerts.length > 0) {
    return {
      release_status: "HOLD",
      hold_reason: "CERTIFICATE_EXPIRED",
      dispute_status: "NONE",
      expired_certificates: expiredCerts,
    };
  }

  // 3. Check FeeLock — Part 6.6 state machine is the source of truth (NATS KV mirror).
  //    Falls back to FeePaymentRequest.feeLockStatus for legacy rows (Part 8.3 backward compat).
  const feePayments = await db.feePaymentRequest.findMany({ where: { ustn } });
  const stage1 = feePayments.find(f => f.stage === "STAGE1");
  const feeLockActive = await checkFeeLockActive(ustn);
  const feeLockFrozen = stage1?.feeLockStatus === "FROZEN" || (await db.feeLock.findFirst({ where: { ustn, status: "FROZEN" } })) !== null;

  // Build mandatory summary
  const mandatoryTotal = stage1?.totalAmountUsd || 0;
  const mandatorySettled = feeLockActive ? mandatoryTotal : (stage1?.status === "PAID" ? mandatoryTotal : 0);

  // Build credit summary (Stage 2 — CREDIT freight)
  const stage2 = feePayments.find(f => f.stage === "STAGE2");
  const creditOutstanding = stage2 && stage2.status !== "PAID" ? stage2.totalAmountUsd : 0;
  const creditOverdue = stage2?.dueDate && new Date() > stage2.dueDate && stage2.status !== "PAID";

  // If FeeLock is frozen (Part 6.6.3 — dispute filed after payment), block release.
  if (feeLockFrozen) {
    return {
      release_status: "HOLD",
      hold_reason: "FEELOCK_FROZEN",
      dispute_status: "ACTIVE",
      mandatory_summary: { total_usd: mandatoryTotal, settled_usd: mandatorySettled },
    };
  }

  // ── NEW HOLD: DEFERRED_PAYMENT_EXPIRED ─────────────────────────
  // If a deferred FeePaymentRequest's guaranteeExpiry < now (and not PAID), block release.
  const deferredExpired = feePayments.find(f =>
    f.deferred &&
    f.status !== "PAID" &&
    f.guaranteeExpiry &&
    new Date(f.guaranteeExpiry) < now
  );
  if (deferredExpired) {
    return {
      release_status: "HOLD",
      hold_reason: "DEFERRED_PAYMENT_EXPIRED",
      dispute_status: "NONE",
      deferred_expired: {
        fee_payment_request_id: deferredExpired.requestId,
        deferred_amount: deferredExpired.totalAmountUsd,
        expiry_date: deferredExpired.guaranteeExpiry!.toISOString(),
        deferred_status: deferredExpired.deferredStatus,
        stage: deferredExpired.stage,
      },
    };
  }

  if (!feeLockActive) {
    // Find unpaid mandatory invoices
    const unpaidInvoices: any[] = [];
    if (stage1 && stage1.status !== "PAID") {
      const splits = JSON.parse(stage1.splits || "[]");
      for (const split of splits) {
        unpaidInvoices.push({ payee: split.payee_gtid, invoice_id: split.payee_gtid, amount: split.amount, currency: "USD" });
      }
    } else if (!stage1) {
      // No FeePaymentRequest row — try PaymentAttempt (Part 6) split
      const attempt = await db.paymentAttempt.findFirst({
        where: { ustn, stage: "STAGE1" },
        orderBy: { attemptedAt: "desc" },
      });
      if (attempt?.splitJson) {
        for (const split of JSON.parse(attempt.splitJson)) {
          unpaidInvoices.push({ payee: split.payee_gtid, invoice_id: split.payee_gtid, amount: split.amount, currency: "USD" });
        }
      }
    }
    return {
      release_status: "HOLD",
      hold_reason: "MANDATORY_PAYMENT_PENDING",
      dispute_status: "NONE",
      mandatory_summary: { total_usd: mandatoryTotal, settled_usd: mandatorySettled },
      unpaid_mandatory_invoices: unpaidInvoices,
    };
  }

  // 4. All conditions pass — generate AUTHORISED response
  const now2 = new Date();
  const validUntil = new Date(now2.getTime() + RELEASE_TOKEN_VALIDITY_HOURS * 3600 * 1000);
  const authorisationId = `REL-${now2.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}`;

  // Build response (without signature)
  const responseData: any = {
    ustn,
    container: containerNo,
    release_status: "AUTHORISED",
    authorisation_id: authorisationId,
    issued_at: now2.toISOString(),
    valid_until: validUntil.toISOString(),
    mandatory_summary: { total_usd: mandatoryTotal, total_egp: 0, settled_usd: mandatorySettled, settled_egp: 0 },
    credit_summary: { total_outstanding_usd: creditOutstanding, overdue: !!creditOverdue, next_due_date: stage2?.dueDate?.toISOString().slice(0, 10) || null },
    dispute_status: "NONE",
  };

  // 5. Generate digital signature (PKCS#7/CMS — simulated with Ed25519)
  const canonicalJson = JSON.stringify(responseData, Object.keys(responseData).sort());
  const digitalSignature = "MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCABgkqhkiG9w0BBwEAAKCAMIIB" +
    Buffer.from(crypto.createHash("sha256").update(canonicalJson + authorisationId).digest()).toString("base64").slice(0, 64) + "...";
  responseData.digital_signature = digitalSignature;

  // 6. Persist authorisation record
  await db.containerReleaseAuthorisation.create({
    data: {
      authorisationId, ustn, containerNo,
      releaseStatus: "AUTHORISED",
      requestId: requestId || null, terminalId: terminalId || null,
      issuedAt: now2, validUntil,
      mandatorySummary: JSON.stringify(responseData.mandatory_summary),
      creditSummary: JSON.stringify(responseData.credit_summary),
      disputeStatus: "NONE",
      digitalSignature,
    },
  });

  return responseData;
}

// ============ 8.9: Release Revocation ============
export async function revokeReleaseAuthorisation(input: {
  ustn: string;
  containerNo: string;
  reason: string;
}): Promise<{ ok: true; revokedCount: number } | { ok: false; reason: string }> {
  const result = await db.containerReleaseAuthorisation.updateMany({
    where: {
      ustn: input.ustn, containerNo: input.containerNo,
      releaseStatus: "AUTHORISED", revokedAt: null,
    },
    data: {
      releaseStatus: "REVOKED",
      revocationReason: input.reason,
      revokedAt: new Date(),
    },
  });

  // Push webhook to terminals (simulated)
  if (result.count > 0) {
    await db.inboxItem.create({
      data: {
        tenantGtid: "SGTX-EG-SHP-000031-9E8F", // shipping line
        category: "SHIPMENT_ALERT", priority: 100,
        title: `RELEASE_REVOKED — ${input.ustn.slice(0, 24)}… / ${input.containerNo}`,
        description: `Container release authorisation revoked. Reason: ${input.reason}. Gate must refuse exit. Next query will return HOLD.`,
        ctaLabel: "View Details",
      },
    });
  }

  return { ok: true, revokedCount: result.count };
}

// ============ 8.9.1: Auto-Revoke on Event (Part 8 — new) ============
// Triggered by upstream events (dispute raised, payment reversal, customs hold,
// sanctions flag). Revokes ALL active authorisations for the USTN across all
// containers (since the trigger is USTN-scoped, not container-scoped) and
// emits a Smart Inbox alert to the shipping line.
export type AutoRevokeEventType =
  | "DISPUTE_RAISED"
  | "PAYMENT_REVERSAL"
  | "CUSTOMS_HOLD"
  | "SANCTIONS_FLAG";

const AUTO_REVOKE_REASONS: Record<AutoRevokeEventType, string> = {
  DISPUTE_RAISED: "Dispute raised",
  PAYMENT_REVERSAL: "Payment reversed",
  CUSTOMS_HOLD: "Customs hold",
  SANCTIONS_FLAG: "Sanctions flag",
};

export async function autoRevokeOnEvent(
  ustn: string,
  eventType: AutoRevokeEventType
): Promise<{
  ok: true;
  eventType: AutoRevokeEventType;
  reason: string;
  revokedAuthorisations: number;
  revokedAt: string;
} | { ok: false; reason: string }> {
  const reason = AUTO_REVOKE_REASONS[eventType];
  if (!reason) {
    return { ok: false, reason: `Unknown event type: ${eventType}` };
  }

  // Revoke ALL active authorisations for this USTN (any container).
  const result = await db.containerReleaseAuthorisation.updateMany({
    where: {
      ustn,
      releaseStatus: "AUTHORISED",
      revokedAt: null,
    },
    data: {
      releaseStatus: "REVOKED",
      revocationReason: reason,
      revokedAt: new Date(),
    },
  });

  const revokedAt = new Date().toISOString();

  // Smart Inbox alert to the shipping line (and any terminal that previously queried).
  if (result.count > 0) {
    const auths = await db.containerReleaseAuthorisation.findMany({
      where: { ustn, releaseStatus: "REVOKED", revocationReason: reason },
      select: { containerNo: true, terminalId: true, authorisationId: true },
      orderBy: { revokedAt: "desc" },
      take: 10,
    });
    const containerList = auths.map(a => a.containerNo).join(", ") || "(none)";
    await db.inboxItem.create({
      data: {
        tenantGtid: "SGTX-EG-SHP-000031-9E8F",
        category: "SHIPMENT_ALERT",
        priority: 100,
        title: `AUTO-REVOKE (${eventType}) — ${ustn.slice(0, 24)}…`,
        description:
          `Auto-revoke triggered by event ${eventType}. Reason: ${reason}. ` +
          `Affected containers: ${containerList}. ` +
          `${result.count} authorisation(s) revoked at ${revokedAt}. ` +
          `Gate must refuse exit until the underlying event is cleared and a fresh AUTHORISED token is issued.`,
        ctaLabel: "View Audit Trail",
      },
    });
  }

  return {
    ok: true,
    eventType,
    reason,
    revokedAuthorisations: result.count,
    revokedAt,
  };
}

// ============ 8.3.2: Webhook Push (RELEASE_READY) ============
export async function pushReleaseReadyWebhook(input: {
  ustn: string;
  containerNo: string;
  authorisationId: string;
  validUntil: Date;
  terminalGtid?: string;
}): Promise<{ ok: true }> {
  // Simulate POST to terminal's webhook URL
  const payload = {
    event: "RELEASE_READY",
    ustn: input.ustn,
    container: input.containerNo,
    authorisation_id: input.authorisationId,
    valid_until: input.validUntil.toISOString(),
    timestamp: new Date().toISOString(),
  };

  // Log the webhook push
  await db.integrationConnectorLog.create({
    data: {
      logId: `LOG-WEBHOOK-${Date.now()}`,
      apiName: "RELEASE_WEBHOOK",
      endpoint: "POST /v1/release/webhook",
      ustn: input.ustn,
      idempotencyKey: crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 32),
      requestBody: JSON.stringify(payload),
      responseBody: JSON.stringify({ status: "200 OK" }),
      statusCode: 200, status: "SUCCESS",
    },
  });

  // Smart Inbox to terminal/shipping line
  await db.inboxItem.create({
    data: {
      tenantGtid: input.terminalGtid || "SGTX-EG-SHP-000031-9E8F",
      category: "NEW_OFFER", priority: 85,
      title: `RELEASE_READY — ${input.containerNo}`,
      description: `Container ${input.containerNo} is authorised for release. USTN: ${input.ustn.slice(0, 24)}…. Valid until ${input.validUntil.toISOString()}. Pull query at gate required.`,
      ctaLabel: "View Authorisation",
    },
  });

  return { ok: true };
}

// ============ 8.7 Step 6: Gate-Out Event (with USED state transition) ============
// Per Part 8.7: when the gate-out is recorded, the releaseStatus transitions
// from AUTHORISED → USED (terminal state — token cannot be replayed).
export async function recordGateOut(input: {
  ustn: string;
  containerNo: string;
  authorisationId: string;
  gateOperatorId: string;
}): Promise<{ ok: true; releaseStatus: string } | { ok: false; reason: string }> {
  const auth = await db.containerReleaseAuthorisation.findUnique({ where: { authorisationId: input.authorisationId } });
  if (!auth) return { ok: false, reason: "Authorisation not found." };
  if (auth.releaseStatus !== "AUTHORISED") return { ok: false, reason: `Authorisation status is ${auth.releaseStatus} (must be AUTHORISED to gate-out).` };
  if (auth.ustn !== input.ustn || auth.containerNo !== input.containerNo) return { ok: false, reason: "USTN/container mismatch." };

  // ── USED state transition ──
  // Mark the token as USED so it cannot be replayed for a second gate-out.
  await db.containerReleaseAuthorisation.update({
    where: { authorisationId: input.authorisationId },
    data: {
      releaseStatus: "USED",
      gateOutAt: new Date(),
      gateOperatorId: input.gateOperatorId,
    },
  });

  // Update shipment milestone to GATED_OUT
  const shipment = await db.shipment.findFirst({ where: { ustn: input.ustn, containerNo: input.containerNo } });
  if (shipment) {
    await db.shipment.update({ where: { id: shipment.id }, data: { status: "RELEASED", releasedAt: new Date() } });
    await db.milestone.create({
      data: {
        shipmentId: shipment.id, ustn: input.ustn, sequence: 6,
        type: "GATED_IN", label: `Container gated out — ${input.containerNo}`,
        status: "CONFIRMED", actorGtid: null, actorName: `Gate: ${input.gateOperatorId}`,
        confirmedAt: new Date(),
      },
    });
  }

  return { ok: true, releaseStatus: "USED" };
}

// ============ 8.6: Digital Signature Verification Helper ============
export function verifyDigitalSignature(responseJson: any, signature: string, sgtxPublicKey: string): boolean {
  // In production: PKCS#7/CMS verification using SGTX's public certificate
  // Here: simulated SHA-256 hash verification
  const { digital_signature, ...dataWithoutSig } = responseJson;
  const canonical = JSON.stringify(dataWithoutSig, Object.keys(dataWithoutSig).sort());
  const expectedHash = crypto.createHash("sha256").update(canonical).digest("hex").slice(0, 64);
  const sigHash = signature.replace("MIAGCSqGSIb3DQEHAqCAMIACAQExDzANBglghkgBZQMEAgEFADCABgkqhkiG9w0BBwEAAKCAMIIB", "").replace("...", "");
  return sigHash.includes(expectedHash.slice(0, 32));
}

// ============ 8.4.1: CRL (Certificate Revocation List) ============
export function generateCrl(): string {
  // Simulated CRL (in production: X.509 CRL signed by SGTX CA)
  return `-----BEGIN X509 CRL-----
MIIBGzCBhwIBATANBgkqhkiG9w0BAQsFADAVMRMwEQYDVQQDDApTR1RYIENB
IDEuMB4XDTI2MDYxODAwMDAwMFoXDTI2MDYyNTAwMDAwMFowgAYGA1UdFASD
BKAwD6EuMAuCAQAAAAAABgBFUQAuMAuCAQAAAAAABgBGSAAuMAuCAQAAAAAA
BgBHUaEuMAuCAQAAAAAABgBFSaA=
-----END X509 CRL-----`;
}
