// @ts-nocheck
// SGTX Part 7.9.1 — Certificate Management (mTLS eSeal + TLS client certs).
//
// SGTX stores Egypt Trust eSeal certificates (exporter / broker / SGTX
// platform) and bank client certificates (issued by SGTX CA internal) in the
// `Certificate` table. Private keys are stored AES-256-GCM encrypted — in
// production they never leave the SoftHSM.
//
// This module provides:
//   - uploadCertificate: admin uploads a new PEM cert + (optional) encrypted
//     private key. Auto-detects expiry → status PENDING_RENEWAL if <30 days.
//   - listCertificates: return all certs for a tenant, optionally filtered by
//     type or status.
//   - checkExpiry: scan all ACTIVE certs, flip any that are within 30 days of
//     expiry to PENDING_RENEWAL, return the list so callers can raise Smart
//     Inbox alerts (Part 7.9.1 renewal workflow).
//   - findActiveCertificate: helper for gov clients to pick a valid cert to use
//     for an mTLS call.
//
// All operations log to IntegrationConnectorLog for audit (Part 7.9.3).

import { createHash } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj ?? {}).sort());
}

async function logOutbound(params: {
  connectorName: string;
  endpoint: string;
  ustn?: string;
  payload: unknown;
  response?: unknown;
  statusCode?: number;
  status?: string;
  errorMessage?: string;
}): Promise<void> {
  const bodyStr = typeof params.payload === "string"
    ? params.payload
    : canonical(params.payload);
  const respStr = params.response === undefined
    ? null
    : (typeof params.response === "string" ? params.response : canonical(params.response));
  const idempotencyKey = sha256Hex(bodyStr).slice(0, 32);
  const logId = `LOG-${params.connectorName}-${Date.now()}-${idempotencyKey.slice(0, 6)}`;
  try {
    // Part 7.7.4 — idempotent logging (upsert with no-op update on duplicate keys).
    await db.integrationConnectorLog.upsert({
      where: { idempotencyKey },
      create: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey,
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
      update: {},
    });
  } catch (e) {
    logger.error(`[certificates/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. uploadCertificate (Part 7.9.1)
// ---------------------------------------------------------------------------

export type CertificateType = "E_SEAL" | "TLS_CLIENT" | "TLS_SERVER" | "BANK_CLIENT";

export interface CertificateInput {
  tenantGtid?: string;
  certificateType: CertificateType;
  issuer?: string; // "Egypt Trust" | "SGTX CA"
  subjectCn?: string;
  certificatePem: string;
  privateKeyEnc?: string; // AES-256-GCM ciphertext (base64) — caller encrypts before sending
  serialNumber?: string;
  validFrom?: string;
  validUntil?: string;
  uploadedByGtid?: string;
}

/**
 * Persist a new certificate. Detects expiry status:
 *   - PENDING_RENEWAL if validUntil < now + 30 days
 *   - EXPIRED if validUntil < now
 *   - ACTIVE otherwise
 */
export async function uploadCertificate(input: CertificateInput): Promise<{
  certId: string;
  status: string;
  serialNumber: string | null;
  validUntil: string | null;
}> {
  if (!input.certificatePem || !input.certificateType) {
    throw new Error("certificatePem and certificateType are required");
  }

  const now = new Date();
  const validFrom = input.validFrom ? new Date(input.validFrom) : null;
  const validUntil = input.validUntil ? new Date(input.validUntil) : null;

  let status = "ACTIVE";
  if (validUntil) {
    const daysUntilExpiry = (validUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
    if (daysUntilExpiry < 0) {
      status = "EXPIRED";
    } else if (daysUntilExpiry < 30) {
      status = "PENDING_RENEWAL";
    }
  }

  const created = await db.certificate.create({
    data: {
      tenantGtid: input.tenantGtid ?? null,
      certificateType: input.certificateType,
      issuer: input.issuer ?? null,
      subjectCn: input.subjectCn ?? null,
      certificatePem: input.certificatePem,
      privateKeyEnc: input.privateKeyEnc ?? null,
      serialNumber: input.serialNumber ?? null,
      validFrom,
      validUntil,
      status,
      uploadedByGtid: input.uploadedByGtid ?? null,
      uploadedAt: now,
    },
  });

  await logOutbound({
    connectorName: "CERTIFICATE_UPLOAD",
    endpoint: "POST /v1/certificates",
    ustn: input.tenantGtid,
    payload: {
      tenantGtid: input.tenantGtid,
      certificateType: input.certificateType,
      issuer: input.issuer,
      subjectCn: input.subjectCn,
      serialNumber: input.serialNumber,
      validFrom: input.validFrom,
      validUntil: input.validUntil,
    },
    response: { certId: created.id, status },
    statusCode: 201,
    status: "SUCCESS",
  });

  return {
    certId: created.id,
    status,
    serialNumber: created.serialNumber,
    validUntil: created.validUntil ? created.validUntil.toISOString() : null,
  };
}

// ---------------------------------------------------------------------------
// 2. listCertificates
// ---------------------------------------------------------------------------

export async function listCertificates(filter: {
  tenantGtid?: string;
  certificateType?: CertificateType;
  status?: string;
}): Promise<Array<{
  certId: string;
  tenantGtid: string | null;
  certificateType: string;
  issuer: string | null;
  subjectCn: string | null;
  serialNumber: string | null;
  validFrom: string | null;
  validUntil: string | null;
  status: string;
  uploadedAt: string;
}>> {
  const where: { tenantGtid?: string; certificateType?: string; status?: string } = {};
  if (filter.tenantGtid) where.tenantGtid = filter.tenantGtid;
  if (filter.certificateType) where.certificateType = filter.certificateType;
  if (filter.status) where.status = filter.status;

  const rows = await db.certificate.findMany({
    where,
    orderBy: { uploadedAt: "desc" },
  });

  return rows.map((r) => ({
    certId: r.id,
    tenantGtid: r.tenantGtid,
    certificateType: r.certificateType,
    issuer: r.issuer,
    subjectCn: r.subjectCn,
    serialNumber: r.serialNumber,
    validFrom: r.validFrom ? r.validFrom.toISOString() : null,
    validUntil: r.validUntil ? r.validUntil.toISOString() : null,
    status: r.status,
    uploadedAt: r.uploadedAt.toISOString(),
  }));
}

// ---------------------------------------------------------------------------
// 3. checkExpiry (Part 7.9.1 renewal workflow)
// ---------------------------------------------------------------------------

/**
 * Scan all ACTIVE certificates; flip any within 30 days of expiry to
 * PENDING_RENEWAL and any past expiry to EXPIRED. Returns the list of certs
 * that need renewal so callers can raise Smart Inbox alerts (Part 7.9.1).
 */
export async function checkExpiry(): Promise<{
  renewed: number;
  expired: number;
  pendingRenewal: Array<{ certId: string; subjectCn: string | null; validUntil: string }>;
}> {
  const now = new Date();
  const thirtyDaysAhead = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const activeCerts = await db.certificate.findMany({
    where: { status: "ACTIVE" },
  });

  const pendingRenewal: Array<{ certId: string; subjectCn: string | null; validUntil: string }> = [];
  let expired = 0;

  for (const cert of activeCerts) {
    if (!cert.validUntil) continue;
    if (cert.validUntil < now) {
      await db.certificate.update({ where: { id: cert.id }, data: { status: "EXPIRED" } });
      expired++;
    } else if (cert.validUntil < thirtyDaysAhead) {
      await db.certificate.update({ where: { id: cert.id }, data: { status: "PENDING_RENEWAL" } });
      pendingRenewal.push({
        certId: cert.id,
        subjectCn: cert.subjectCn,
        validUntil: cert.validUntil.toISOString(),
      });
    }
  }

  await logOutbound({
    connectorName: "CERTIFICATE_EXPIRY_CHECK",
    endpoint: "GET /v1/certificates/expiry-check",
    payload: { checked: activeCerts.length },
    response: { expired, pendingRenewal: pendingRenewal.length },
    statusCode: 200,
    status: "SUCCESS",
  });

  return { renewed: pendingRenewal.length, expired, pendingRenewal };
}

// ---------------------------------------------------------------------------
// 4. findActiveCertificate — pick a valid cert for an mTLS call
// ---------------------------------------------------------------------------

/**
 * Return the most recent ACTIVE certificate of the requested type for the
 * given tenant. Used by gov clients (nafeza/cargox/eta/cbe) to pick a cert
 * for the mTLS handshake (Part 7.10 GGOV1 — mTLS cert valid and not expired).
 */
export async function findActiveCertificate(
  tenantGtid: string,
  certificateType: CertificateType
): Promise<{ certId: string; certificatePem: string; validUntil: string | null } | null> {
  const cert = await db.certificate.findFirst({
    where: { tenantGtid, certificateType, status: "ACTIVE" },
    orderBy: { uploadedAt: "desc" },
  });
  if (!cert) return null;
  return {
    certId: cert.id,
    certificatePem: cert.certificatePem,
    validUntil: cert.validUntil ? cert.validUntil.toISOString() : null,
  };
}
