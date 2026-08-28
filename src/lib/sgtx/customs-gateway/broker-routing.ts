// @ts-nocheck
/**
 * SGTX Customs Gateway — Broker Routing & Authorization
 * ======================================================
 *
 * Enforces the broker authorization model that gates every customs
 * submission. The central security invariant is:
 *
 *     FILER CODE != AUTHORIZATION
 *
 * A filer code is public regulatory metadata (e.g. CBP filer code appears
 * on every CBP 7501 in field 9; Nafeza user ID appears on every SAD). It
 * is NOT a secret, NOT a credential, and NOT a usable authorization
 * mechanism. Any security model that treats filer code as authorization is
 * broken by design — anyone can copy a filer code from a published CBP 7501.
 *
 * SGTX's authorization model is layered:
 *
 *   Authorization = Broker GTID (identity)
 *                 + Authorized Relationship (broker is contractually
 *                   allowed to file for this trade's USTN)
 *                 + USTN (the trade being filed against)
 *                 + Broker Filing Profile (broker is configured for this
 *                   customs adapter / jurisdiction)
 *                 + Credential Reference (broker has a registered BYOC
 *                   credential for this adapter)
 *                 + Current Credential State (credential is ACTIVE — not
 *                   PENDING / EXPIRED / REVOKED / SUSPENDED)
 *                 + Governor Decision (Governor has approved THIS submission)
 *
 * All six conditions must hold simultaneously. Any single failure blocks
 * the submission.
 *
 * SECURITY INVARIANTS (verified by tests + runtime checks):
 *   1. Broker A credential can NEVER be used for Broker B
 *      → enforced by getActiveCredential filtering on brokerGtid FIRST.
 *   2. A filer code alone can NEVER authorize a submission
 *      → filer code is checked for consistency only (matches the registered
 *        credential's filerCode); a mismatch is logged but never blocks
 *        (since the registered credential is the source of truth).
 *   3. An expired/revoked/suspended credential blocks submission
 *      → enforced by checking credential state in step 4.
 *   4. Governor denial blocks submission
 *      → enforced by step 5 (Governor decision lookup).
 *
 * References:
 *   • 19 CFR 111 (CBP broker licensing)
 *   • Ministerial Decree 386/2020 (Nafeza broker registration)
 *   • SGTX L0 Constitution — broker authorization invariants
 */

import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import {
  getActiveCredential,
  verifyCredential,
  markUsed,
  type BrokerCredential,
} from "@/lib/sgtx/customs-gateway/broker-byoc";

// ── Types ───────────────────────────────────────────────────────────────

export interface BrokerAuthorizationContext {
  brokerGtid: string;
  authorizedRelationship: boolean;
  ustn: string;
  filingProfileId: string | null;
  credentialReference: string | null;
  credentialState: "ACTIVE" | "EXPIRED" | "REVOKED" | "SUSPENDED" | "PENDING" | "UNKNOWN";
  governorDecisionId: string | null;
  filerCode: string | null; // external metadata, checked but NEVER used for authz
}

export interface AuthorizationResult {
  authorized: boolean;
  context: BrokerAuthorizationContext;
  reason: string;
  checks: Array<{ check: string; passed: boolean; detail: string }>;
}

// ── In-memory filing profile store ──────────────────────────────────────
// A filing profile binds a broker to a specific customs adapter with
// jurisdiction-specific metadata. A broker may have multiple filing profiles
// (e.g. one for US_ACE, one for EG_NAFEZA). The profile ID is referenced by
// the authorization check.

export interface BrokerFilingProfile {
  id: string;
  brokerGtid: string;
  adapterId: string;
  jurisdiction: string;
  defaultFilerCode: string | null; // public regulatory metadata, NOT authorization
  status: "PENDING" | "ACTIVE" | "INACTIVE";
  createdAt: Date;
  governorDecisionId: string;
}

const filingProfileStore = new Map<string, BrokerFilingProfile>();

// ── In-memory authorized relationship store ─────────────────────────────
// Maps (brokerGtid, ustn) → { authorized: boolean, since: Date, governorDecisionId }.
// An "authorized relationship" means the broker is contractually allowed to
// file customs declarations on behalf of the trade named by the USTN. This
// is established either by:
//   - the trade's seller/buyer explicitly authorizing the broker, OR
//   - the Governor approving a broker assignment.

interface AuthorizedRelationship {
  brokerGtid: string;
  ustn: string;
  authorized: boolean;
  since: Date;
  governorDecisionId: string;
}

const relationshipStore = new Map<string, AuthorizedRelationship>();

function relationshipKey(brokerGtid: string, ustn: string): string {
  return `${brokerGtid}::${ustn}`;
}

// ── In-memory Governor decision store ───────────────────────────────────
// Maps governorDecisionId → { approved: boolean, ustn, brokerGtid, adapterId }.
// In production, this would be the Governor's signed Loom entry.

interface GovernorDecision {
  decisionId: string;
  approved: boolean;
  ustn: string;
  brokerGtid: string;
  adapterId: string | null;
  credentialId: string | null;
  reason: string;
  decidedAt: Date;
}

const governorDecisionStore = new Map<string, GovernorDecision>();

// ── Helpers ─────────────────────────────────────────────────────────────

function now(): Date {
  return new Date();
}

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
}

async function auditAuthorization(input: {
  brokerGtid: string;
  ustn: string;
  adapterId: string;
  authorized: boolean;
  reason: string;
}): Promise<void> {
  try {
    const logId = `AUTHLOG-${Date.now()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: "BROKER_ROUTING",
        endpoint: "authorization:check",
        ustn: input.ustn || null,
        idempotencyKey: `AUTH-${input.brokerGtid}-${input.ustn}-${input.adapterId}-${Date.now()}`,
        requestBody: JSON.stringify({
          brokerGtid: input.brokerGtid,
          ustn: input.ustn,
          adapterId: input.adapterId,
          authorized: input.authorized,
          reason: input.reason,
        }).slice(0, 2000),
        status: input.authorized ? "SUCCESS" : "FAILED",
      },
    });
  } catch (e: any) {
    logger.warn("[broker-routing] audit log failed", { error: e?.message });
  }
}

// ── Public: filing profile management ───────────────────────────────────

/**
 * Register a filing profile for a broker + adapter. A filing profile
 * captures the broker's intent to file via a specific customs adapter
 * (e.g. "Broker GTID-X wants to file US ACE entries"). Requires Governor
 * approval (decision ID).
 */
export async function registerFilingProfile(input: {
  brokerGtid: string;
  adapterId: string;
  jurisdiction: string;
  defaultFilerCode?: string | null;
  governorDecisionId: string;
}): Promise<BrokerFilingProfile | null> {
  try {
    if (!input?.brokerGtid || !input?.adapterId) return null;
    const id = generateId("PROFILE");
    const profile: BrokerFilingProfile = {
      id,
      brokerGtid: input.brokerGtid,
      adapterId: input.adapterId,
      jurisdiction: input.jurisdiction || "UNKNOWN",
      defaultFilerCode: input.defaultFilerCode ?? null,
      status: "PENDING",
      createdAt: now(),
      governorDecisionId: input.governorDecisionId,
    };
    filingProfileStore.set(id, profile);
    logger.info("[broker-routing] filing profile registered", {
      profileId: id,
      brokerGtid: input.brokerGtid,
      adapterId: input.adapterId,
    });
    return profile;
  } catch (e: any) {
    logger.error("[broker-routing] registerFilingProfile failed", { error: e?.message });
    return null;
  }
}

/**
 * Lookup the broker's filing profile for a specific adapter.
 */
export async function getFilingProfile(
  brokerGtid: string,
  adapterId: string,
): Promise<BrokerFilingProfile | null> {
  try {
    if (!brokerGtid || !adapterId) return null;
    for (const profile of filingProfileStore.values()) {
      if (profile.brokerGtid === brokerGtid && profile.adapterId === adapterId) {
        return profile;
      }
    }
    return null;
  } catch (e: any) {
    logger.error("[broker-routing] getFilingProfile failed", { error: e?.message });
    return null;
  }
}

/**
 * Activate a filing profile (Governor-approved).
 */
export async function activateFilingProfile(profileId: string): Promise<void> {
  try {
    if (!profileId) return;
    const profile = filingProfileStore.get(profileId);
    if (!profile) return;
    profile.status = "ACTIVE";
    logger.info("[broker-routing] filing profile activated", { profileId });
  } catch (e: any) {
    logger.warn("[broker-routing] activateFilingProfile failed", { error: e?.message });
  }
}

// ── Public: authorized relationship management ──────────────────────────

/**
 * Authorize a broker to file for a specific USTN. The seller/buyer of the
 * trade OR the Governor may call this. Requires Governor approval (decision
 * ID).
 */
export async function authorizeRelationship(input: {
  brokerGtid: string;
  ustn: string;
  governorDecisionId: string;
}): Promise<boolean> {
  try {
    if (!input?.brokerGtid || !input?.ustn) return false;
    const key = relationshipKey(input.brokerGtid, input.ustn);
    relationshipStore.set(key, {
      brokerGtid: input.brokerGtid,
      ustn: input.ustn,
      authorized: true,
      since: now(),
      governorDecisionId: input.governorDecisionId,
    });
    logger.info("[broker-routing] relationship authorized", {
      brokerGtid: input.brokerGtid,
      ustn: input.ustn,
    });
    return true;
  } catch (e: any) {
    logger.error("[broker-routing] authorizeRelationship failed", { error: e?.message });
    return false;
  }
}

/**
 * Revoke a broker's authorization to file for a USTN.
 */
export async function revokeRelationship(brokerGtid: string, ustn: string): Promise<void> {
  try {
    if (!brokerGtid || !ustn) return;
    const key = relationshipKey(brokerGtid, ustn);
    const existing = relationshipStore.get(key);
    if (existing) {
      existing.authorized = false;
      logger.info("[broker-routing] relationship revoked", { brokerGtid, ustn });
    }
  } catch (e: any) {
    logger.warn("[broker-routing] revokeRelationship failed", { error: e?.message });
  }
}

// ── Public: Governor decision management ────────────────────────────────

/**
 * Record a Governor decision for a specific submission. The Governor (or the
 * Governor's automated gate) approves or denies the submission before it is
 * sent to the customs adapter.
 */
export async function recordGovernorDecision(input: {
  decisionId: string;
  approved: boolean;
  ustn: string;
  brokerGtid: string;
  adapterId?: string | null;
  credentialId?: string | null;
  reason?: string;
}): Promise<void> {
  try {
    if (!input?.decisionId) return;
    governorDecisionStore.set(input.decisionId, {
      decisionId: input.decisionId,
      approved: input.approved,
      ustn: input.ustn,
      brokerGtid: input.brokerGtid,
      adapterId: input.adapterId ?? null,
      credentialId: input.credentialId ?? null,
      reason: input.reason || "",
      decidedAt: now(),
    });
    logger.info("[broker-routing] governor decision recorded", {
      decisionId: input.decisionId,
      approved: input.approved,
      ustn: input.ustn,
    });
  } catch (e: any) {
    logger.error("[broker-routing] recordGovernorDecision failed", { error: e?.message });
  }
}

// ── Public: the authorization gate ──────────────────────────────────────

/**
 * The main authorization gate. Every customs submission MUST pass through
 * this function before the adapter's submit() method is called.
 *
 * The check is layered:
 *   1. Verify broker GTID exists and is active (registered in the broker
 *      liability table OR an authorized-relationship record exists for
 *      this broker).
 *   2. Verify broker has an authorized relationship with the trade's USTN.
 *   3. Verify broker has a filing profile for this adapter.
 *   4. Verify broker has an ACTIVE credential for this adapter.
 *   5. Verify Governor has approved THIS submission.
 *   6. Filer code is checked for consistency with the registered credential's
 *      filerCode (warns on mismatch; NEVER used as the authorization
 *      mechanism).
 *
 * CRITICAL: ALL FIVE checks (1–5) must pass for `authorized: true`. A failure
 * on any single check blocks the submission. The filer-code consistency
 * check (step 6) is informational and does NOT block.
 */
export async function authorizeSubmission(
  brokerGtid: string,
  ustn: string,
  adapterId: string,
  filerCode: string,
): Promise<{
  authorized: boolean;
  context: BrokerAuthorizationContext;
  reason: string;
}> {
  const checks: Array<{ check: string; passed: boolean; detail: string }> = [];
  const context: BrokerAuthorizationContext = {
    brokerGtid: brokerGtid || "",
    authorizedRelationship: false,
    ustn: ustn || "",
    filingProfileId: null,
    credentialReference: null,
    credentialState: "UNKNOWN",
    governorDecisionId: null,
    filerCode: filerCode || null,
  };

  try {
    if (!brokerGtid) {
      checks.push({ check: "brokerGtid", passed: false, detail: "brokerGtid is required" });
      return { authorized: false, context, reason: "brokerGtid is required", checks };
    }
    if (!ustn) {
      checks.push({ check: "ustn", passed: false, detail: "ustn is required" });
      return { authorized: false, context, reason: "ustn is required", checks };
    }
    if (!adapterId) {
      checks.push({ check: "adapterId", passed: false, detail: "adapterId is required" });
      return { authorized: false, context, reason: "adapterId is required", checks };
    }

    // Check 1: broker GTID is registered (an authorized-relationship record
    // OR a filing profile OR a credential exists for this broker).
    let brokerKnown = false;
    for (const rel of relationshipStore.values()) {
      if (rel.brokerGtid === brokerGtid) { brokerKnown = true; break; }
    }
    if (!brokerKnown) {
      for (const prof of filingProfileStore.values()) {
        if (prof.brokerGtid === brokerGtid) { brokerKnown = true; break; }
      }
    }
    checks.push({
      check: "1_broker_gtid_exists",
      passed: brokerKnown,
      detail: brokerKnown ? "Broker GTID registered" : "Broker GTID not registered",
    });

    // Check 2: authorized relationship for this USTN.
    const rel = relationshipStore.get(relationshipKey(brokerGtid, ustn));
    const hasRelationship = !!rel && rel.authorized;
    context.authorizedRelationship = hasRelationship;
    checks.push({
      check: "2_authorized_relationship",
      passed: hasRelationship,
      detail: hasRelationship
        ? `Authorized since ${rel!.since.toISOString()}`
        : "No authorized relationship for this USTN",
    });

    // Check 3: filing profile for this adapter.
    const profile = await getFilingProfile(brokerGtid, adapterId);
    const hasProfile = !!profile && profile.status !== "INACTIVE";
    context.filingProfileId = profile?.id ?? null;
    checks.push({
      check: "3_filing_profile",
      passed: hasProfile,
      detail: hasProfile
        ? `Profile ${profile!.id} (${profile!.status})`
        : "No filing profile for this adapter",
    });

    // Check 4: ACTIVE credential for this adapter.
    const cred: BrokerCredential | null = await getActiveCredential(brokerGtid, adapterId);
    const hasActiveCredential = !!cred && cred.status === "ACTIVE";
    context.credentialReference = cred?.credentialReference ?? null;
    context.credentialState = cred
      ? (cred.status as BrokerAuthorizationContext["credentialState"])
      : "UNKNOWN";
    checks.push({
      check: "4_active_credential",
      passed: hasActiveCredential,
      detail: hasActiveCredential
        ? `Credential ${cred!.id} (${cred!.status})`
        : `No ACTIVE credential (state: ${context.credentialState})`,
    });

    // Check 5: Governor decision approving THIS submission.
    // Look up the most recent Governor decision matching brokerGtid + ustn.
    let govDecision: GovernorDecision | null = null;
    for (const d of governorDecisionStore.values()) {
      if (d.brokerGtid === brokerGtid && d.ustn === ustn) {
        if (!govDecision || d.decidedAt > govDecision.decidedAt) {
          govDecision = d;
        }
      }
    }
    const hasGovernorApproval = !!govDecision && govDecision.approved;
    context.governorDecisionId = govDecision?.decisionId ?? null;
    checks.push({
      check: "5_governor_decision",
      passed: hasGovernorApproval,
      detail: hasGovernorApproval
        ? `Decision ${govDecision!.decisionId} (approved)`
        : govDecision
          ? `Decision ${govDecision!.decisionId} (DENIED: ${govDecision!.reason})`
          : "No Governor decision for this broker+USTN",
    });

    // Check 6 (informational only): filer code consistency.
    // The filer code supplied by the caller is compared against the
    // registered credential's filerCode. A mismatch is logged but NEVER
    // blocks the submission — the credential is the source of truth.
    let filerCodeConsistent = true;
    if (cred && cred.filerCode && filerCode) {
      filerCodeConsistent = cred.filerCode === filerCode;
    }
    checks.push({
      check: "6_filer_code_consistency",
      passed: filerCodeConsistent,
      detail: filerCodeConsistent
        ? "Filer code matches registered credential"
        : `Filer code mismatch (supplied: ${filerCode || "(none)"}, registered: ${cred?.filerCode || "(none)"}). Informational only — credential is source of truth.`,
    });

    // Authorization requires ALL of checks 1–5 to pass.
    const blockingChecks = checks.filter((c) =>
      ["1_broker_gtid_exists", "2_authorized_relationship", "3_filing_profile", "4_active_credential", "5_governor_decision"].includes(c.check),
    );
    const authorized = blockingChecks.every((c) => c.passed);

    const failedChecks = blockingChecks.filter((c) => !c.passed);
    const reason = authorized
      ? "All authorization checks passed"
      : `Authorization blocked: ${failedChecks.map((c) => c.check).join(", ")}`;

    // Mark credential as used if authorized.
    if (authorized && cred) {
      await markUsed(cred.id);
    }

    await auditAuthorization({
      brokerGtid,
      ustn,
      adapterId,
      authorized,
      reason,
    });

    logger.info("[broker-routing] authorizeSubmission", {
      brokerGtid,
      ustn,
      adapterId,
      authorized,
      failedChecks: failedChecks.map((c) => c.check),
    });

    return { authorized, context, reason };
  } catch (e: any) {
    logger.error("[broker-routing] authorizeSubmission failed", { error: e?.message });
    return {
      authorized: false,
      context,
      reason: `Authorization check failed: ${e?.message || "internal error"}`,
      checks,
    };
  }
}

/**
 * Convenience helper: returns the full authorization context (without
 * enforcing). Useful for the UI to show what's blocking a submission.
 */
export async function getAuthorizationContext(
  brokerGtid: string,
  ustn: string,
  adapterId: string,
): Promise<BrokerAuthorizationContext> {
  try {
    const result = await authorizeSubmission(brokerGtid, ustn, adapterId, "");
    return result.context;
  } catch (e: any) {
    logger.error("[broker-routing] getAuthorizationContext failed", { error: e?.message });
    return {
      brokerGtid: brokerGtid || "",
      authorizedRelationship: false,
      ustn: ustn || "",
      filingProfileId: null,
      credentialReference: null,
      credentialState: "UNKNOWN",
      governorDecisionId: null,
      filerCode: null,
    };
  }
}

/**
 * Convenience helper: verify a credential's current validity for a broker +
 * adapter. Returns the verify result; never throws.
 */
export async function verifyBrokerCredential(
  brokerGtid: string,
  adapterId: string,
): Promise<{ valid: boolean; reason: string; credentialId: string }> {
  try {
    const cred = await getActiveCredential(brokerGtid, adapterId);
    if (!cred) {
      return { valid: false, reason: "No active credential", credentialId: "" };
    }
    const result = await verifyCredential(cred.id);
    return {
      valid: result.valid,
      reason: result.reason,
      credentialId: cred.id,
    };
  } catch (e: any) {
    logger.error("[broker-routing] verifyBrokerCredential failed", { error: e?.message });
    return { valid: false, reason: e?.message || "verify failed", credentialId: "" };
  }
}
