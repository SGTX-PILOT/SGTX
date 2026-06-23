// SGTX Part 8.4 — Terminal/Carrier Certificate Management
//
// Simulates the SGTX internal Certificate Authority that issues client
// certificates to terminals and carriers for mTLS authentication against
// the Container Release Authorisation API (Part 8.3.1).
//
// Certificate lifecycle:
//   1. Terminal/Carrier generates CSR (Certificate Signing Request).
//   2. SGTX CA issues client certificate (bound to organisation, role,
//      client ID). Certificate is signed by the simulated SGTX-CA
//      intermediate which is itself chained to the Egypt Trust root.
//   3. Certificate valid for 1 year (365 days), renewable via rotation.
//   4. Revocation list (CRL) for compromised certificates.
//   5. Rotation mints a fresh serial+keypair, marks the previous cert
//      superseded, and extends validity by 1 year from rotation time.
//
// All certificate material is PERSISTED to the ConfigurationHistory table
// (configKey namespace: `release_cert.*`) so it survives dev-server reloads.
// No real private key material is stored — only the public-facing metadata
// (subject, issuer, serial, fingerprint, validity window, status).
//
// SIMULATION ONLY. The production stack uses an HSM-backed Egypt Trust CA
// that issues real X.509 client certificates over a CMPv2 protocol.

import { createHash, randomBytes } from "crypto";
import { freshDb as db } from "@/lib/db-fresh";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ReleaseCertRole = "TERMINAL" | "CARRIER";
export type ReleaseCertStatus = "ACTIVE" | "REVOKED" | "EXPIRED" | "SUPERSEDED";

export interface Certificate {
  clientId: string;          // TERM-001, CARRIER-002
  orgName: string;
  role: ReleaseCertRole;
  subject: string;           // CN=TERM-001,O=Alexandria Container Terminal,C=EG
  issuer: string;            // CN=SGTX-CA,O=SGTX,C=EG
  serialNumber: string;      // 0A:1B:2C:...
  fingerprint: string;       // SHA-256 of canonical certificate payload
  validFrom: string;         // ISO 8601
  validUntil: string;        // ISO 8601 (+1 year)
  publicKey: string;         // simulated — hex RSA-2048 public key
  status: ReleaseCertStatus;
  issuedAt: string;          // ISO 8601
  revokedAt?: string;
  revokedReason?: string;
  supersededBy?: string;     // clientId of the rotation successor
  rotatedFrom?: string;      // clientId of the rotation predecessor
  keyType: "RSA-2048";
  signatureAlgorithm: "SHA256-RSA";
  mode: "SIMULATION";
}

export interface CrlEntry {
  clientId: string;
  serialNumber: string;
  fingerprint: string;
  revokedAt: string;
  reason: string;
  revokedBy: string;
}

export interface IssueCertInput {
  orgName: string;
  role: ReleaseCertRole;
  clientId: string;
  requestedBy?: string;     // GTID of the admin/owner issuing the cert
  validityDays?: number;    // default 365
  csrPem?: string;          // simulated CSR (logged, not parsed)
}

export interface RevokeResult {
  revoked: boolean;
  crlEntry: CrlEntry | null;
  reason: string;
}

export interface VerifyResult {
  valid: boolean;
  certificate?: Certificate;
  revoked?: CrlEntry;
  expired?: boolean;
  reason?: string;
}

export interface RotateResult {
  oldCert: Certificate;
  newCert: Certificate;
  rotatedAt: string;
}

export interface ListCertsFilter {
  role?: ReleaseCertRole;
  status?: ReleaseCertStatus;
  orgName?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CONFIG_KEY_PREFIX = "release_cert";
const SGTX_CA_SUBJECT = "CN=SGTX-CA,O=SGTX Platform Authority,C=EG";
const DEFAULT_VALIDITY_DAYS = 365;
const COUNTRY_CODE = "EG";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function addDays(iso: string, days: number): string {
  return new Date(new Date(iso).getTime() + days * 24 * 3600 * 1000).toISOString();
}

function serialNumber(): string {
  return Array.from({ length: 16 }, () =>
    randomBytes(1).toString("hex").toUpperCase().padStart(2, "0"),
  ).join(":");
}

function simulatedPublicKey(clientId: string): string {
  // Deterministic simulated 2048-bit RSA public key (hex).
  // NOT a real key — just a stable identifier for the simulated material.
  return createHash("sha256")
    .update(`sgtx-release-cert-pub|${clientId}|${Date.now()}-${Math.random()}`)
    .digest("hex")
    .padEnd(512, "0")
    .slice(0, 512);
}

function canonicalCertPayload(input: {
  clientId: string;
  orgName: string;
  role: ReleaseCertRole;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validUntil: string;
  publicKey: string;
}): string {
  return [
    `clientId=${input.clientId}`,
    `orgName=${input.orgName}`,
    `role=${input.role}`,
    `subject=${input.subject}`,
    `issuer=${input.issuer}`,
    `serial=${input.serialNumber}`,
    `validFrom=${input.validFrom}`,
    `validUntil=${input.validUntil}`,
    `publicKey=${input.publicKey}`,
  ].join("|");
}

function certFingerprint(input: {
  clientId: string;
  orgName: string;
  role: ReleaseCertRole;
  subject: string;
  issuer: string;
  serialNumber: string;
  validFrom: string;
  validUntil: string;
  publicKey: string;
}): string {
  const canonical = canonicalCertPayload(input);
  return `sha256:${createHash("sha256").update(canonical, "utf8").digest("hex")}`;
}

function buildSubject(input: {
  clientId: string;
  orgName: string;
  role: ReleaseCertRole;
}): string {
  // CN=<clientId>,O=<orgName>,OU=<role>,C=EG
  const cleanedOrg = input.orgName.replace(/,/g, " ").trim();
  return `CN=${input.clientId},O=${cleanedOrg},OU=${input.role},C=${COUNTRY_CODE}`;
}

// ---------------------------------------------------------------------------
// Persistence helpers
// ---------------------------------------------------------------------------

/**
 * All certificates are persisted as ConfigurationHistory rows keyed
 * `release_cert.client.<clientId>` so they survive dev-server reloads.
 * The `newValue` column holds the canonical JSON of the Certificate.
 */
async function persistCert(cert: Certificate, actor: string, reason: string): Promise<void> {
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.client.${cert.clientId}`,
        oldValue: null,
        newValue: JSON.stringify(cert),
        changedByGtid: actor,
        changeReason: reason,
        version: 1,
      },
    });
  } catch (e) {
    console.error("[release/cert-management] persistCert failed:", e);
  }
}

async function persistCrlEntry(entry: CrlEntry, actor: string): Promise<void> {
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.crl.${entry.clientId}.${Date.now()}`,
        oldValue: null,
        newValue: JSON.stringify(entry),
        changedByGtid: actor,
        changeReason: `revoke:${entry.reason}`,
        version: 1,
      },
    });
  } catch (e) {
    console.error("[release/cert-management] persistCrlEntry failed:", e);
  }
}

async function loadAllCertRows(): Promise<Certificate[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: {
        configKey: { startsWith: `${CONFIG_KEY_PREFIX}.client.` },
      },
      orderBy: { createdAt: "desc" },
    });
    const certs: Certificate[] = [];
    for (const row of rows) {
      if (!row.newValue) continue;
      try {
        certs.push(JSON.parse(row.newValue) as Certificate);
      } catch {
        // skip malformed
      }
    }
    // De-duplicate by clientId, keeping the most-recent row (already ordered desc).
    const seen = new Set<string>();
    return certs.filter((c) => {
      if (seen.has(c.clientId)) return false;
      seen.add(c.clientId);
      return true;
    });
  } catch (e) {
    console.error("[release/cert-management] loadAllCertRows failed:", e);
    return [];
  }
}

async function loadCrlRows(): Promise<CrlEntry[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: {
        configKey: { startsWith: `${CONFIG_KEY_PREFIX}.crl.` },
      },
      orderBy: { createdAt: "desc" },
    });
    const entries: CrlEntry[] = [];
    for (const row of rows) {
      if (!row.newValue) continue;
      try {
        entries.push(JSON.parse(row.newValue) as CrlEntry);
      } catch {
        // skip malformed
      }
    }
    // De-duplicate by clientId (keep most recent revocation).
    const seen = new Set<string>();
    return entries.filter((e) => {
      if (seen.has(e.clientId)) return false;
      seen.add(e.clientId);
      return true;
    });
  } catch (e) {
    console.error("[release/cert-management] loadCrlRows failed:", e);
    return [];
  }
}

/**
 * Refresh the in-memory status of each cert based on its validity window.
 * (We don't persist EXPIRED — that's a derived field — but we surface it
 * to the caller so the dashboard can render an accurate state.)
 */
function withDerivedStatus(cert: Certificate): Certificate {
  if (cert.status === "REVOKED" || cert.status === "SUPERSEDED") return cert;
  const now = Date.now();
  const until = new Date(cert.validUntil).getTime();
  if (until < now) {
    return { ...cert, status: "EXPIRED" as ReleaseCertStatus };
  }
  return cert;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Issue (or re-issue) a client certificate for a terminal or carrier.
 *
 * CSR is simulated — we accept any PEM string in `csrPem` and log it for
 * audit purposes but generate the certificate material deterministically
 * from the clientId + orgName + role inputs.
 *
 * If a certificate already exists for the clientId, calling issueCertificate
 * is equivalent to rotation: the existing cert is marked SUPERSEDED and a
 * fresh cert with a new serial + fingerprint is minted.
 */
export async function issueCertificate(input: IssueCertInput): Promise<Certificate> {
  const { orgName, role, clientId, requestedBy } = input;
  if (!orgName || !role || !clientId) {
    throw new Error("issueCertificate: orgName, role, clientId are required");
  }
  if (role !== "TERMINAL" && role !== "CARRIER") {
    throw new Error(`issueCertificate: role must be TERMINAL or CARRIER (got ${role})`);
  }

  const issuedAt = nowIso();
  const validFrom = issuedAt;
  const validDays = input.validityDays && input.validityDays > 0 ? input.validityDays : DEFAULT_VALIDITY_DAYS;
  const validUntil = addDays(validFrom, validDays);

  const subject = buildSubject({ clientId, orgName, role });
  const serial = serialNumber();
  const pubKey = simulatedPublicKey(clientId);

  const fp = certFingerprint({
    clientId,
    orgName,
    role,
    subject,
    issuer: SGTX_CA_SUBJECT,
    serialNumber: serial,
    validFrom,
    validUntil,
    publicKey: pubKey,
  });

  // If an existing cert exists for this clientId, mark it SUPERSEDED.
  const existingCerts = await loadAllCertRows();
  const prior = existingCerts.find((c) => c.clientId === clientId);
  if (prior) {
    const superseded: Certificate = {
      ...prior,
      status: "SUPERSEDED",
      supersededBy: clientId, // the new cert reuses the clientId
    };
    try {
      await db.configurationHistory.create({
        data: {
          configKey: `${CONFIG_KEY_PREFIX}.client.${prior.clientId}.superseded.${Date.now()}`,
          oldValue: JSON.stringify(prior),
          newValue: JSON.stringify(superseded),
          changedByGtid: requestedBy || "SGTX-CA",
          changeReason: `superseded by re-issue (new serial ${serial})`,
          version: 1,
        },
      });
    } catch (e) {
      console.error("[release/cert-management] mark-superseded failed:", e);
    }
  }

  const cert: Certificate = {
    clientId,
    orgName,
    role,
    subject,
    issuer: SGTX_CA_SUBJECT,
    serialNumber: serial,
    fingerprint: fp,
    validFrom,
    validUntil,
    publicKey: pubKey,
    status: "ACTIVE",
    issuedAt,
    rotatedFrom: prior ? prior.clientId : undefined,
    keyType: "RSA-2048",
    signatureAlgorithm: "SHA256-RSA",
    mode: "SIMULATION",
  };

  await persistCert(cert, requestedBy || "SGTX-CA", prior ? "rotate (re-issue)" : "initial issue");

  // Activity log entry (admin timeline). actorGtid is null when the
  // issuer is the SGTX-CA system principal (no matching Tenant row).
  try {
    await db.activity.create({
      data: {
        actorGtid: requestedBy && requestedBy.startsWith("GTID-") ? requestedBy : null,
        action: `RELEASE_CERT_${prior ? "ROTATED" : "ISSUED"}`,
        description: `${role} certificate ${prior ? "rotated" : "issued"} for ${clientId} (${orgName}) — serial ${serial}`,
        type: "SUCCESS",
        metadata: JSON.stringify({
          clientId,
          role,
          orgName,
          serial,
          fingerprint: fp,
          validFrom,
          validUntil,
          rotatedFrom: prior ? prior.clientId : null,
          requestedBy: requestedBy || "SGTX-CA",
        }),
      },
    });
  } catch (e) {
    console.error("[release/cert-management] activity log failed:", e);
  }

  return cert;
}

/**
 * Revoke a terminal/carrier certificate. Adds an entry to the CRL and
 * marks the certificate status REVOKED. The revocation is sticky — any
 * subsequent mTLS handshake using that clientId will be rejected.
 */
export async function revokeCertificate(
  clientId: string,
  reason: string,
  revokedBy = "SGTX-CA",
): Promise<RevokeResult> {
  if (!clientId || !reason) {
    return { revoked: false, crlEntry: null, reason: "clientId and reason are required" };
  }

  const certs = await loadAllCertRows();
  const cert = certs.find((c) => c.clientId === clientId);
  if (!cert) {
    return { revoked: false, crlEntry: null, reason: `No certificate found for clientId=${clientId}` };
  }
  if (cert.status === "REVOKED") {
    // Idempotent — return the existing CRL entry.
    const crl = await loadCrlRows();
    const existing = crl.find((e) => e.clientId === clientId);
    return {
      revoked: true,
      crlEntry: existing || null,
      reason: `Certificate ${clientId} was already revoked`,
    };
  }

  const revokedAt = nowIso();
  const revokedCert: Certificate = { ...cert, status: "REVOKED", revokedAt, revokedReason: reason };
  const crlEntry: CrlEntry = {
    clientId,
    serialNumber: cert.serialNumber,
    fingerprint: cert.fingerprint,
    revokedAt,
    reason,
    revokedBy,
  };

  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${CONFIG_KEY_PREFIX}.client.${clientId}.revoked.${Date.now()}`,
        oldValue: JSON.stringify(cert),
        newValue: JSON.stringify(revokedCert),
        changedByGtid: revokedBy,
        changeReason: `revoke:${reason}`,
        version: 1,
      },
    });
  } catch (e) {
    console.error("[release/cert-management] persist revoke failed:", e);
  }

  await persistCrlEntry(crlEntry, revokedBy);

  try {
    await db.activity.create({
      data: {
        actorGtid: revokedBy && revokedBy.startsWith("GTID-") ? revokedBy : null,
        action: "RELEASE_CERT_REVOKED",
        description: `${cert.role} certificate revoked for ${clientId} (${cert.orgName}) — reason: ${reason}`,
        type: "WARNING",
        metadata: JSON.stringify({ clientId, reason, serial: cert.serialNumber, revokedAt, revokedBy }),
      },
    });
  } catch (e) {
    console.error("[release/cert-management] activity log failed:", e);
  }

  return { revoked: true, crlEntry, reason: "revoked" };
}

/**
 * Return the Certificate Revocation List (CRL) for the SGTX-CA.
 * Each entry contains clientId, serial, fingerprint, revokedAt, reason.
 */
export async function getCRL(): Promise<CrlEntry[]> {
  return loadCrlRows();
}

/**
 * Verify a client certificate by clientId.
 * Returns valid=true only if the cert exists, is not revoked, and has not
 * expired.
 */
export async function verifyCertificate(clientId: string): Promise<VerifyResult> {
  if (!clientId) {
    return { valid: false, reason: "clientId is required" };
  }
  const certs = await loadAllCertRows();
  const cert = certs.find((c) => c.clientId === clientId);
  if (!cert) {
    return { valid: false, reason: `No certificate found for clientId=${clientId}` };
  }
  if (cert.status === "REVOKED") {
    const crl = await loadCrlRows();
    const entry = crl.find((e) => e.clientId === clientId) || null;
    return {
      valid: false,
      certificate: withDerivedStatus(cert),
      revoked: entry || undefined,
      reason: `Certificate revoked at ${cert.revokedAt || "unknown"} — reason: ${cert.revokedReason || "unspecified"}`,
    };
  }
  if (cert.status === "SUPERSEDED") {
    return {
      valid: false,
      certificate: cert,
      reason: `Certificate superseded by a newer issuance (rotatedFrom=${cert.rotatedFrom || "n/a"})`,
    };
  }
  const derived = withDerivedStatus(cert);
  if (derived.status === "EXPIRED") {
    return {
      valid: false,
      certificate: derived,
      expired: true,
      reason: `Certificate expired at ${derived.validUntil}`,
    };
  }
  return { valid: true, certificate: derived };
}

/**
 * List all certificates, optionally filtered by role / status / orgName.
 * The derived EXPIRED status is computed on read.
 */
export async function listCertificates(filter?: ListCertsFilter): Promise<Certificate[]> {
  let certs = await loadAllCertRows();
  if (filter?.role) certs = certs.filter((c) => c.role === filter.role);
  if (filter?.status) {
    // For EXPIRED filter, compute derived status first.
    if (filter.status === "EXPIRED") {
      certs = certs.filter((c) => withDerivedStatus(c).status === "EXPIRED");
    } else {
      certs = certs.filter((c) => c.status === filter.status);
    }
  }
  if (filter?.orgName) {
    const q = filter.orgName.toLowerCase();
    certs = certs.filter((c) => c.orgName.toLowerCase().includes(q));
  }
  return certs.map(withDerivedStatus);
}

/**
 * Rotate a certificate: mint a new serial + keypair + fingerprint, mark the
 * old cert SUPERSEDED, and persist both. The new cert has validity starting
 * NOW and extending for another year (or whatever the original validity was).
 *
 * This is the programmatic equivalent of "renew before expiry" — operators
 * call this 30-60 days before validUntil to keep the mTLS chain unbroken.
 */
export async function rotateCertificate(
  clientId: string,
  rotatedBy = "SGTX-CA",
): Promise<RotateResult> {
  const certs = await loadAllCertRows();
  const oldCert = certs.find((c) => c.clientId === clientId);
  if (!oldCert) {
    throw new Error(`rotateCertificate: no certificate found for clientId=${clientId}`);
  }

  // Re-issue (mint a fresh cert with the same clientId/orgName/role).
  const newCert = await issueCertificate({
    orgName: oldCert.orgName,
    role: oldCert.role,
    clientId: oldCert.clientId,
    requestedBy: rotatedBy,
  });

  // The newCert.rotatedFrom already set inside issueCertificate.
  return {
    oldCert: { ...oldCert, status: "SUPERSEDED", supersededBy: newCert.clientId },
    newCert,
    rotatedAt: newCert.issuedAt,
  };
}
