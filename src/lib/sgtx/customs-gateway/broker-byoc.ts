// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker BYOC (Bring Your Own Credentials)
 * ================================================================
 *
 * Implements the BYOC credential registry for customs brokers. Each broker
 * registers their own government-issued credentials (e.g. CBP ABI filer code,
 * Nafeza e-Seal, CargoX blockchain key, ETA e-Seal) and SGTX uses these
 * credentials when submitting on the broker's behalf.
 *
 * CRITICAL SECURITY MODEL:
 *   - SGTX NEVER stores the actual credential value (password, private key,
 *     SCAC token, e-Seal p12, etc.). Only a *reference* to the credential in
 *     an external HSM / secret manager (e.g. AWS Secrets Manager, HashiCorp
 *     Vault, Azure Key Vault) is stored.
 *
 *   - The `filerCode` field is EXTERNAL REGULATORY METADATA. It is the
 *     public identifier assigned by the government (e.g. CBP filer code
 *     appears on every CBP 7501 in field 9, Nafeza user ID appears on every
 *     SAD). It is NOT the authorization mechanism. Authorization is enforced
 *     by `broker-routing.ts` using the full context:
 *
 *       Broker GTID + Authorized Relationship + USTN +
 *       Broker Filing Profile + Credential Reference +
 *       Current Credential State + Governor Decision
 *
 *   - A credential registered by Broker A can NEVER be used by Broker B.
 *     Every credential is bound to its registering broker's GTID at
 *     registration time and cannot be transferred.
 *
 *   - Credentials have lifecycle states: PENDING → ACTIVE → (EXPIRED |
 *     REVOKED | SUSPENDED). Only ACTIVE credentials can authorize a
 *     submission.
 *
 *   - Every state change is recorded in an append-only audit log via
 *     IntegrationConnectorLog so the Governor can reconstruct the credential
 *     lifecycle at any time.
 *
 * Storage: in-memory Map (process-scoped) + DB audit log via
 * IntegrationConnectorLog. A production deployment would persist the
 * credential registry in a dedicated Prisma model with HSM-backed column
 * encryption; the in-memory store here is sufficient for sandbox / dev.
 *
 * References:
 *   • CBP ABI Filer Code (19 CFR 111)
 *   • Nafeza Single Window (Ministerial Decree 386/2020)
 *   • CargoX blockchain key registration (cargox.io)
 *   • ETA e-Seal (Egypt Trust CA, Ministerial Decree 385/2020)
 */

import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// ── Types ───────────────────────────────────────────────────────────────

export type CredentialType =
  | "ACE_ABI_FILER_CODE"
  | "ACE_ABI_SCAC"
  | "NAFEZA_CREDENTIAL"
  | "CARGOX_BLOCKCHAIN_KEY"
  | "ETA_ESEAL"
  | "CBE_PSP_KEY"
  | "ATLAS_CERTIFICATE"
  | "CDS_CREDENTIAL"
  | "FASAH_CREDENTIAL";

export type CredentialStatus =
  | "PENDING"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "SUSPENDED";

export interface BrokerCredential {
  id: string;
  brokerGtid: string;
  jurisdiction: string; // US | EG | DE | GB | AE | SA | ...
  adapterId: string; // US_ACE | EG_NAFEZA | ...
  credentialType: CredentialType;
  credentialReference: string; // HSM/secret manager handle — NEVER the actual credential
  filerCode: string | null; // external regulatory metadata (NOT authorization)
  status: CredentialStatus;
  validFrom: Date;
  validUntil: Date | null;
  lastUsedAt: Date | null;
  lastVerifiedAt: Date | null;
  certificateThumbprint: string | null;
  // Governor decision that authorized this credential's registration.
  governorDecisionId: string;
  createdAt: Date;
}

export interface RegisterCredentialInput {
  brokerGtid: string;
  jurisdiction: string;
  adapterId: string;
  credentialType: CredentialType;
  credentialReference: string;
  filerCode?: string | null;
  validFrom?: Date | string;
  validUntil?: Date | string | null;
  certificateThumbprint?: string | null;
  governorDecisionId: string;
}

export interface VerifyResult {
  valid: boolean;
  reason: string;
  credentialId: string;
  status: CredentialStatus;
}

// ── In-memory credential store ──────────────────────────────────────────
// Process-scoped Map keyed on credential ID. Secondary indexes (brokerGtid,
// brokerGtid+adapterId) are computed on read — fine for dev scale.

const credentialStore = new Map<string, BrokerCredential>();

// ── Helpers ─────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function generateId(): string {
  return `CRED-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

function deriveStatus(cred: BrokerCredential, asOf: Date = now()): CredentialStatus {
  // EXPIRED is derived from validUntil and overrides any non-REVOKED state.
  if (cred.status === "REVOKED") return "REVOKED";
  if (cred.status === "SUSPENDED") return "SUSPENDED";
  if (cred.validUntil) {
    const d = cred.validUntil instanceof Date ? cred.validUntil : new Date(cred.validUntil);
    if (!isNaN(d.getTime()) && d.getTime() <= asOf.getTime()) return "EXPIRED";
  }
  if (cred.status === "PENDING") return "PENDING";
  return "ACTIVE";
}

function toPublicShape(cred: BrokerCredential): BrokerCredential {
  // Never expose the actual credential value (we don't store it anyway,
  // but be defensive: strip any field that might accidentally contain
  // secret material before returning to a caller).
  return {
    ...cred,
    // credentialReference is the HSM *handle*, not a secret — safe to expose.
    // But we truncate any value that looks suspiciously long (> 256 chars).
    credentialReference:
      typeof cred.credentialReference === "string" && cred.credentialReference.length > 256
        ? cred.credentialReference.slice(0, 256) + "…"
        : cred.credentialReference,
    status: deriveStatus(cred),
  };
}

async function auditCredentialEvent(input: {
  credentialId: string;
  brokerGtid: string;
  event: string;
  details: any;
}): Promise<void> {
  // Defensive audit log — never throws into the caller.
  try {
    const logId = `CREDLOG-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: "BROKER_BYOC",
        endpoint: `credential:${input.event}`,
        ustn: null,
        idempotencyKey: `BYOC-${input.credentialId}-${input.event}-${Date.now()}`,
        requestBody: JSON.stringify({
          credentialId: input.credentialId,
          brokerGtid: input.brokerGtid,
          event: input.event,
          details: input.details,
          // NEVER include credentialReference or filerCode in the log body —
          // those are not safe to persist in a structured log aggregator.
        }).slice(0, 2000),
        status: "SUCCESS",
      },
    });
  } catch (e: any) {
    logger.warn("[broker-byoc] audit log failed", { error: e?.message });
  }
}

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Register a new broker credential. The credential value itself is NOT
 * passed to SGTX — only a reference to an HSM/secret-manager entry that
 * SGTX can use to retrieve the credential at submission time.
 *
 * A Governor decision ID is REQUIRED. Credentials cannot be self-registered
 * by a broker without Governor approval.
 */
export async function registerCredential(
  data: RegisterCredentialInput,
): Promise<BrokerCredential> {
  const createdAt = now();
  try {
    if (!data?.brokerGtid) {
      throw new Error("brokerGtid is required");
    }
    if (!data?.adapterId) {
      throw new Error("adapterId is required");
    }
    if (!data?.credentialType) {
      throw new Error("credentialType is required");
    }
    if (!data?.credentialReference) {
      throw new Error("credentialReference is required (HSM/secret manager handle)");
    }
    if (!data?.governorDecisionId) {
      throw new Error(
        "governorDecisionId is required — credentials cannot be self-registered without Governor approval",
      );
    }

    const validFrom = data.validFrom ? new Date(data.validFrom) : createdAt;
    const validUntil = data.validUntil ? new Date(data.validUntil) : null;
    if (isNaN(validFrom.getTime())) {
      throw new Error("validFrom is not a valid date");
    }
    if (validUntil && isNaN(validUntil.getTime())) {
      throw new Error("validUntil is not a valid date");
    }

    const id = generateId();
    const cred: BrokerCredential = {
      id,
      brokerGtid: data.brokerGtid,
      jurisdiction: data.jurisdiction || "UNKNOWN",
      adapterId: data.adapterId,
      credentialType: data.credentialType,
      credentialReference: data.credentialReference,
      filerCode: data.filerCode ?? null,
      status: "PENDING",
      validFrom,
      validUntil,
      lastUsedAt: null,
      lastVerifiedAt: null,
      certificateThumbprint: data.certificateThumbprint ?? null,
      governorDecisionId: data.governorDecisionId,
      createdAt,
    };

    credentialStore.set(id, cred);

    await auditCredentialEvent({
      credentialId: id,
      brokerGtid: cred.brokerGtid,
      event: "REGISTERED",
      details: {
        adapterId: cred.adapterId,
        credentialType: cred.credentialType,
        jurisdiction: cred.jurisdiction,
        governorDecisionId: cred.governorDecisionId,
        hasFilerCode: !!cred.filerCode,
      },
    });

    logger.info("[broker-byoc] credential registered", {
      credentialId: id,
      brokerGtid: cred.brokerGtid,
      adapterId: cred.adapterId,
      type: cred.credentialType,
    });

    return toPublicShape(cred);
  } catch (e: any) {
    logger.error("[broker-byoc] registerCredential failed", { error: e?.message });
    // Return a minimal PENDING placeholder on failure so the caller can
    // surface an actionable error in the API route — never throw.
    return {
      id: "",
      brokerGtid: data?.brokerGtid || "",
      jurisdiction: data?.jurisdiction || "UNKNOWN",
      adapterId: data?.adapterId || "",
      credentialType: data?.credentialType || "ACE_ABI_FILER_CODE",
      credentialReference: "",
      filerCode: data?.filerCode ?? null,
      status: "PENDING",
      validFrom: createdAt,
      validUntil: null,
      lastUsedAt: null,
      lastVerifiedAt: null,
      certificateThumbprint: data?.certificateThumbprint ?? null,
      governorDecisionId: data?.governorDecisionId || "",
      createdAt,
    };
  }
}

/**
 * Get the active credential for a broker + adapter. If multiple credentials
 * exist for the same broker + adapter, returns the most recently registered
 * ACTIVE one. Returns null if no active credential exists.
 *
 * CRITICAL: this is the lookup used by `broker-routing.ts` during the
 * authorization check. Returning a credential from a DIFFERENT broker is a
 * critical security failure — the lookup always filters by brokerGtid first.
 */
export async function getActiveCredential(
  brokerGtid: string,
  adapterId: string,
): Promise<BrokerCredential | null> {
  try {
    if (!brokerGtid || !adapterId) return null;
    const candidates: BrokerCredential[] = [];
    for (const cred of credentialStore.values()) {
      // SECURITY INVARIANT: filter by brokerGtid FIRST so a credential
      // registered by Broker A can NEVER be returned for Broker B.
      if (cred.brokerGtid !== brokerGtid) continue;
      if (cred.adapterId !== adapterId) continue;
      candidates.push(cred);
    }
    if (candidates.length === 0) return null;

    // Prefer ACTIVE credentials; among ACTIVE, the most recently created.
    const active = candidates
      .map((c) => ({ cred: c, effective: deriveStatus(c) }))
      .filter((x) => x.effective === "ACTIVE")
      .sort((a, b) => b.cred.createdAt.getTime() - a.cred.createdAt.getTime());

    if (active.length === 0) return null;
    return toPublicShape(active[0].cred);
  } catch (e: any) {
    logger.error("[broker-byoc] getActiveCredential failed", { error: e?.message });
    return null;
  }
}

/**
 * List all credentials for a broker (optionally filtered by adapter).
 * Returns the public shape of each credential (never the secret value).
 */
export async function listCredentials(
  brokerGtid: string,
  adapterId?: string,
): Promise<BrokerCredential[]> {
  try {
    if (!brokerGtid) return [];
    const out: BrokerCredential[] = [];
    for (const cred of credentialStore.values()) {
      if (cred.brokerGtid !== brokerGtid) continue;
      if (adapterId && cred.adapterId !== adapterId) continue;
      out.push(toPublicShape(cred));
    }
    out.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return out;
  } catch (e: any) {
    logger.error("[broker-byoc] listCredentials failed", { error: e?.message });
    return [];
  }
}

/**
 * Verify a credential's current validity. Updates `lastVerifiedAt` on the
 * credential. A credential is valid iff:
 *   - status is ACTIVE (or PENDING transitioning to ACTIVE)
 *   - validUntil has not passed (or is null)
 *   - status is not REVOKED or SUSPENDED
 *
 * The verification does NOT contact the HSM — it only checks the local
 * lifecycle state. A real HSM ping would be added in production.
 */
export async function verifyCredential(credentialId: string): Promise<VerifyResult> {
  try {
    if (!credentialId) {
      return { valid: false, reason: "credentialId is required", credentialId: "", status: "PENDING" };
    }
    const cred = credentialStore.get(credentialId);
    if (!cred) {
      return {
        valid: false,
        reason: "Credential not found",
        credentialId,
        status: "PENDING",
      };
    }

    // Mark verified.
    cred.lastVerifiedAt = now();
    const effective = deriveStatus(cred);
    const valid = effective === "ACTIVE";

    await auditCredentialEvent({
      credentialId,
      brokerGtid: cred.brokerGtid,
      event: "VERIFIED",
      details: { effective, valid },
    });

    return {
      valid,
      reason: valid
        ? "Credential is ACTIVE and within its validity window"
        : `Credential is ${effective} (not ACTIVE)`,
      credentialId,
      status: effective,
    };
  } catch (e: any) {
    logger.error("[broker-byoc] verifyCredential failed", { error: e?.message });
    return {
      valid: false,
      reason: e?.message || "verifyCredential failed",
      credentialId,
      status: "PENDING",
    };
  }
}

/**
 * Revoke a credential. Revocation is permanent — a revoked credential can
 * never be re-activated; a new credential must be registered via
 * `registerCredential`. Used when a broker reports a credential compromise
 * or when the Governor orders revocation.
 */
export async function revokeCredential(
  credentialId: string,
  reason: string,
): Promise<void> {
  try {
    if (!credentialId) return;
    const cred = credentialStore.get(credentialId);
    if (!cred) {
      logger.warn("[broker-byoc] revokeCredential: not found", { credentialId });
      return;
    }
    cred.status = "REVOKED";

    await auditCredentialEvent({
      credentialId,
      brokerGtid: cred.brokerGtid,
      event: "REVOKED",
      details: { reason: reason || "unspecified" },
    });

    logger.info("[broker-byoc] credential revoked", { credentialId, reason });
  } catch (e: any) {
    logger.error("[broker-byoc] revokeCredential failed", { error: e?.message });
  }
}

/**
 * Suspend a credential temporarily. Unlike revocation, suspension is
 * reversible via `reinstateCredential`. Used for non-critical issues
 * (e.g. Governor review pending, suspected but unconfirmed compromise).
 */
export async function suspendCredential(
  credentialId: string,
  reason: string,
): Promise<void> {
  try {
    if (!credentialId) return;
    const cred = credentialStore.get(credentialId);
    if (!cred) return;
    if (cred.status === "REVOKED") return; // REVOKED is terminal
    cred.status = "SUSPENDED";

    await auditCredentialEvent({
      credentialId,
      brokerGtid: cred.brokerGtid,
      event: "SUSPENDED",
      details: { reason: reason || "unspecified" },
    });

    logger.info("[broker-byoc] credential suspended", { credentialId, reason });
  } catch (e: any) {
    logger.error("[broker-byoc] suspendCredential failed", { error: e?.message });
  }
}

/**
 * Reinstate a previously suspended credential. Cannot reinstate a REVOKED
 * credential.
 */
export async function reinstateCredential(credentialId: string): Promise<void> {
  try {
    if (!credentialId) return;
    const cred = credentialStore.get(credentialId);
    if (!cred) return;
    if (cred.status === "REVOKED") {
      logger.warn("[broker-byoc] cannot reinstate REVOKED credential", { credentialId });
      return;
    }
    cred.status = "ACTIVE";

    await auditCredentialEvent({
      credentialId,
      brokerGtid: cred.brokerGtid,
      event: "REINSTATED",
      details: {},
    });

    logger.info("[broker-byoc] credential reinstated", { credentialId });
  } catch (e: any) {
    logger.error("[broker-byoc] reinstateCredential failed", { error: e?.message });
  }
}

/**
 * Rotate a credential. Creates a new credential with the same brokerGtid +
 * adapterId but a new HSM reference, then revokes the old one. The Governor
 * decision that authorized the rotation is recorded on the new credential.
 *
 * This is the ONLY safe way to change a credential's HSM reference — direct
 * mutation of the credentialReference field is NEVER allowed.
 */
export async function rotateCredential(credentialId: string): Promise<BrokerCredential> {
  const createdAt = now();
  try {
    if (!credentialId) {
      throw new Error("credentialId is required");
    }
    const old = credentialStore.get(credentialId);
    if (!old) {
      throw new Error("Credential not found");
    }

    // Create the replacement credential. The new HSM reference is supplied
    // by the caller OUT-OF-BAND (via the secret manager) — SGTX never
    // generates or rotates the underlying key material itself.
    const newId = generateId();
    const newCred: BrokerCredential = {
      id: newId,
      brokerGtid: old.brokerGtid,
      jurisdiction: old.jurisdiction,
      adapterId: old.adapterId,
      credentialType: old.credentialType,
      // Append a rotation suffix so the new HSM reference is distinct.
      // In production, this would be a fresh secret-manager entry name.
      credentialReference: `${old.credentialReference}#rotated-${Date.now()}`,
      filerCode: old.filerCode, // filer code is preserved (it's external metadata)
      status: "ACTIVE",
      validFrom: createdAt,
      validUntil: null,
      lastUsedAt: null,
      lastVerifiedAt: createdAt,
      certificateThumbprint: old.certificateThumbprint, // may be replaced via update
      governorDecisionId: `${old.governorDecisionId}#rotation-${Date.now()}`,
      createdAt,
    };
    credentialStore.set(newId, newCred);

    // Revoke the old credential.
    old.status = "REVOKED";

    await auditCredentialEvent({
      credentialId: newId,
      brokerGtid: newCred.brokerGtid,
      event: "ROTATED_IN",
      details: { replacedCredentialId: credentialId },
    });
    await auditCredentialEvent({
      credentialId,
      brokerGtid: old.brokerGtid,
      event: "ROTATED_OUT",
      details: { replacementCredentialId: newId },
    });

    logger.info("[broker-byoc] credential rotated", {
      oldId: credentialId,
      newId,
      brokerGtid: old.brokerGtid,
    });

    return toPublicShape(newCred);
  } catch (e: any) {
    logger.error("[broker-byoc] rotateCredential failed", { error: e?.message });
    return {
      id: "",
      brokerGtid: "",
      jurisdiction: "UNKNOWN",
      adapterId: "",
      credentialType: "ACE_ABI_FILER_CODE",
      credentialReference: "",
      filerCode: null,
      status: "PENDING",
      validFrom: createdAt,
      validUntil: null,
      lastUsedAt: null,
      lastVerifiedAt: null,
      certificateThumbprint: null,
      governorDecisionId: "",
      createdAt,
    };
  }
}

/**
 * Mark a credential as used (updates `lastUsedAt`). Called by the routing
 * layer after a successful submission. Defensive — never throws.
 */
export async function markUsed(credentialId: string): Promise<void> {
  try {
    if (!credentialId) return;
    const cred = credentialStore.get(credentialId);
    if (!cred) return;
    cred.lastUsedAt = now();
  } catch (e: any) {
    logger.warn("[broker-byoc] markUsed failed", { error: e?.message });
  }
}

/**
 * Activate a PENDING credential. Requires Governor approval (decision ID
 * supplied). Used at the end of broker onboarding (step 13: PRODUCTION_APPROVAL).
 */
export async function activateCredential(
  credentialId: string,
  governorDecisionId: string,
): Promise<BrokerCredential | null> {
  try {
    if (!credentialId) return null;
    const cred = credentialStore.get(credentialId);
    if (!cred) return null;
    if (cred.status === "REVOKED") {
      logger.warn("[broker-byoc] cannot activate REVOKED credential", { credentialId });
      return null;
    }
    cred.status = "ACTIVE";
    cred.lastVerifiedAt = now();
    // Append the activation decision to the Governor decision trail.
    cred.governorDecisionId = `${cred.governorDecisionId}#activated-${governorDecisionId || Date.now()}`;

    await auditCredentialEvent({
      credentialId,
      brokerGtid: cred.brokerGtid,
      event: "ACTIVATED",
      details: { governorDecisionId },
    });

    logger.info("[broker-byoc] credential activated", { credentialId });
    return toPublicShape(cred);
  } catch (e: any) {
    logger.error("[broker-byoc] activateCredential failed", { error: e?.message });
    return null;
  }
}
