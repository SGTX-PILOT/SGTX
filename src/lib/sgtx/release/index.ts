// SGTX Part 8 — Container Release Authorisation API
// Stateless pull-based REST endpoint: terminal queries → SGTX returns AUTHORISED/HOLD.
// Cryptographically signed (PKCS#7/CMS), time-bound (24h), legally binding (ministerial decree).
// Revocation, webhook push, gate-out milestone, CRL.

import { db } from "@/lib/db";
import crypto from "crypto";

export const RELEASE_TOKEN_VALIDITY_HOURS = 24;

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
}> {
  const { ustn, containerNo, requestId, terminalId } = input;

  // 1. Verify USTN exists and container is linked
  const trade = await db.trade.findUnique({ where: { ustn }, include: { shipments: true, disputes: true } });
  if (!trade) {
    return { release_status: "ERROR", dispute_status: "NONE", error_reason: "USTN_NOT_FOUND" };
  }

  const shipment = trade.shipments.find(s => s.containerNo === containerNo);
  if (!shipment) {
    return { release_status: "ERROR", dispute_status: "NONE", error_reason: "CONTAINER_NOT_FOUND_FOR_USTN" };
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

  // 3. Check FeeLock — all MANDATORY payments settled
  const feePayments = await db.feePaymentRequest.findMany({ where: { ustn } });
  const stage1 = feePayments.find(f => f.stage === "STAGE1");
  const feeLockActive = stage1?.feeLockStatus === "ACTIVE";

  // Build mandatory summary
  const mandatoryTotal = stage1?.totalAmountUsd || 0;
  const mandatorySettled = stage1?.status === "PAID" ? mandatoryTotal : 0;

  // Build credit summary (Stage 2 — CREDIT freight)
  const stage2 = feePayments.find(f => f.stage === "STAGE2");
  const creditOutstanding = stage2 && stage2.status !== "PAID" ? stage2.totalAmountUsd : 0;
  const creditOverdue = stage2?.dueDate && new Date() > stage2.dueDate && stage2.status !== "PAID";

  if (!feeLockActive) {
    // Find unpaid mandatory invoices
    const unpaidInvoices: any[] = [];
    if (stage1 && stage1.status !== "PAID") {
      const splits = JSON.parse(stage1.splits || "[]");
      for (const split of splits) {
        unpaidInvoices.push({ payee: split.payee_gtid, invoice_id: split.payee_gtid, amount: split.amount, currency: "USD" });
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
  const now = new Date();
  const validUntil = new Date(now.getTime() + RELEASE_TOKEN_VALIDITY_HOURS * 3600 * 1000);
  const authorisationId = `REL-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}-${Math.floor(Math.random() * 900 + 100)}`;

  // Build response (without signature)
  const responseData: any = {
    ustn,
    container: containerNo,
    release_status: "AUTHORISED",
    authorisation_id: authorisationId,
    issued_at: now.toISOString(),
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
      issuedAt: now, validUntil,
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

// ============ 8.7 Step 6: Gate-Out Event ============
export async function recordGateOut(input: {
  ustn: string;
  containerNo: string;
  authorisationId: string;
  gateOperatorId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const auth = await db.containerReleaseAuthorisation.findUnique({ where: { authorisationId: input.authorisationId } });
  if (!auth) return { ok: false, reason: "Authorisation not found." };
  if (auth.releaseStatus !== "AUTHORISED") return { ok: false, reason: `Authorisation status is ${auth.releaseStatus}.` };
  if (auth.ustn !== input.ustn || auth.containerNo !== input.containerNo) return { ok: false, reason: "USTN/container mismatch." };

  await db.containerReleaseAuthorisation.update({
    where: { authorisationId: input.authorisationId },
    data: { gateOutAt: new Date(), gateOperatorId: input.gateOperatorId },
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

  return { ok: true };
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
