// @ts-nocheck
/**
 * SGTX Customs Gateway — Production Runbooks (§172)
 * ===========================================================================
 *
 * Structured operational procedures for incidents affecting the customs
 * gateway. Each runbook carries:
 *   - scenario  — what triggered this runbook
 *   - severity  — LOW | MEDIUM | HIGH | CRITICAL
 *   - steps[]   — ordered actions with expected results + timeouts
 *   - escalation — who to escalate to if steps don't resolve
 *   - rollbackProcedure — how to undo if the change makes things worse
 *   - evidenceRequired — the artefacts that MUST be collected for audit
 *
 * §172 PRINCIPLE: a runbook is a structured human procedure. The
 * customs gateway may AUTO-DETECT the trigger (e.g. an adapter outage)
 * and AUTO-RECOMMEND the runbook, but it NEVER auto-executes
 * consequential steps without human + Governor approval. The
 * "auto-invoke runbooks" feature flag (§169) is OFF by default.
 *
 * Each runbook step's `timeout` is a guideline — the operator decides
 * when to move on or escalate. A timed-out step does NOT auto-escalate;
 * the operator must escalate per the runbook's escalation policy.
 *
 * All public functions are wrapped in try/catch with safe defaults.
 */

import { logger } from "@/lib/sgtx/logger";

// ============ Types ============

export type RunbookSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface RunbookStep {
  step: string;
  action: string;
  expectedResult: string;
  timeout: string;
}

export interface Runbook {
  runbookId: string;
  title: string;
  scenario: string;
  severity: RunbookSeverity;
  steps: RunbookStep[];
  escalation: string;
  rollbackProcedure: string;
  evidenceRequired: string[];
}

// ============ §172 Runbook Catalogue ============

export const RUNBOOKS: Runbook[] = [
  {
    runbookId: "RB-001",
    title: "Adapter Outage",
    scenario: "Customs adapter becomes unavailable (HEALTH=GOVERNMENT_UNAVAILABLE / BROKER_UNAVAILABLE / DISABLED)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Detect adapter outage via health check (performHealthCheck)", expectedResult: "Outage confirmed", timeout: "5 min" },
      { step: "2", action: "Identify affected USTNs (declarations in SUBMITTED/PROCESSING state for this adapter)", expectedResult: "List of impacted trades", timeout: "10 min" },
      { step: "3", action: "Switch to fallback (portal / manual / broker-direct)", expectedResult: "Fallback active", timeout: "30 min" },
      { step: "4", action: "Notify affected brokers and traders (Smart Inbox)", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "5", action: "Queue pending submissions (IntegrationConnectorLog PENDING)", expectedResult: "Submissions queued", timeout: "10 min" },
      { step: "6", action: "Monitor adapter recovery (performHealthCheck every 5 min)", expectedResult: "Adapter restored to HEALTHY", timeout: "Ongoing" },
      { step: "7", action: "Process queued submissions in FIFO order", expectedResult: "All submissions completed", timeout: "2 hours" },
      { step: "8", action: "Reconcile all affected trades (runCustomsComplianceCheck)", expectedResult: "All trades reconciled", timeout: "4 hours" },
    ],
    escalation: "CTO → Engineering Lead → Operations",
    rollbackProcedure: "Disable adapter, switch all traffic to fallback",
    evidenceRequired: ["Health check logs", "Affected USTN list", "Notification records", "Reconciliation report"],
  },
  {
    runbookId: "RB-002",
    title: "Government System Outage",
    scenario: "The underlying government customs system (ACE / Nafeza / CargoX / ETA / ICEGATE etc.) is down",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Confirm outage via adapter health + government status page", expectedResult: "Outage confirmed + source identified", timeout: "10 min" },
      { step: "2", action: "Mark adapter health = GOVERNMENT_UNAVAILABLE", expectedResult: "Health state updated", timeout: "5 min" },
      { step: "3", action: "Notify all in-flight trades via Smart Inbox", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "4", action: "Hold new submissions (queue, do not fail)", expectedResult: "New submissions queued PENDING", timeout: "10 min" },
      { step: "5", action: "Coordinate with broker partners for manual filing window", expectedResult: "Manual filing window communicated", timeout: "30 min" },
      { step: "6", action: "Monitor government status recovery", expectedResult: "Government system operational", timeout: "Ongoing" },
      { step: "7", action: "Drain queued submissions with backoff", expectedResult: "Queue drained", timeout: "6 hours" },
    ],
    escalation: "CTO → Government Liaison → Operations",
    rollbackProcedure: "Resume automated submissions when government system confirmed healthy for 30 min",
    evidenceRequired: ["Government status page screenshots", "Adapter health log", "Queued submission list", "Broker coordination log"],
  },
  {
    runbookId: "RB-003",
    title: "Credential Expiry",
    scenario: "Adapter credential within expiry window (CREDENTIAL_EXPIRING) or expired (CREDENTIAL_EXPIRED)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Identify which credential is expiring (adapter + credential reference)", expectedResult: "Credential identified", timeout: "5 min" },
      { step: "2", action: "Notify credential owner (broker or SGTX ops)", expectedResult: "Notification sent", timeout: "10 min" },
      { step: "3", action: "If expired: disable adapter (mark DISABLED)", expectedResult: "Adapter disabled", timeout: "5 min" },
      { step: "4", action: "If expiring: schedule renewal before expiry deadline", expectedResult: "Renewal scheduled", timeout: "1 hour" },
      { step: "5", action: "Renew credential with the issuing authority", expectedResult: "New credential issued", timeout: "Varies (1–14 days)" },
      { step: "6", action: "Update credential reference (do NOT delete the old one — preserve audit)", expectedResult: "Credential reference updated", timeout: "10 min" },
      { step: "7", action: "Re-enable adapter + performHealthCheck", expectedResult: "Adapter HEALTHY", timeout: "10 min" },
    ],
    escalation: "Security Lead → Engineering Lead → CTO",
    rollbackProcedure: "Restore prior credential reference if renewal fails before expiry",
    evidenceRequired: ["Credential expiry alert", "Renewal request + authority response", "Credential reference update log", "Post-renewal health check"],
  },
  {
    runbookId: "RB-004",
    title: "Certificate Rotation",
    scenario: "TLS / signing / e-Seal certificate rotation required (scheduled or emergency)",
    severity: "MEDIUM",
    steps: [
      { step: "1", action: "Identify certificate(s) for rotation + affected adapters", expectedResult: "Certificate list identified", timeout: "10 min" },
      { step: "2", action: "Issue new certificate from the CA / issuing authority", expectedResult: "New certificate issued", timeout: "1–7 days" },
      { step: "3", action: "Stage new certificate in test environment", expectedResult: "Test pass", timeout: "1 hour" },
      { step: "4", action: "Schedule production cutover window (low-traffic)", expectedResult: "Window scheduled + notified", timeout: "30 min" },
      { step: "5", action: "Swap active certificate reference (keep old for grace period)", expectedResult: "Active reference updated", timeout: "15 min" },
      { step: "6", action: "Verify via performHealthCheck + test submission", expectedResult: "Test submission successful", timeout: "30 min" },
      { step: "7", action: "Revoke old certificate after grace period (≥ 7 days)", expectedResult: "Old cert revoked", timeout: "1 hour" },
    ],
    escalation: "Security Lead → Engineering Lead",
    rollbackProcedure: "Switch back to old certificate reference (kept during grace period)",
    evidenceRequired: ["New certificate", "Test results", "Cutover schedule + notification", "Old cert revocation record"],
  },
  {
    runbookId: "RB-005",
    title: "Adapter Schema Change",
    scenario: "Government changes the customs message schema (e.g. ACE ABI release, Nafeza ACI update)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Detect schema mismatch (SCHEMA_FAILURE health state)", expectedResult: "Mismatch confirmed", timeout: "15 min" },
      { step: "2", action: "Identify affected adapter + new schema version", expectedResult: "Adapter + version identified", timeout: "10 min" },
      { step: "3", action: "Pull updated government spec + diff against current", expectedResult: "Diff produced", timeout: "4 hours" },
      { step: "4", action: "Update adapter schema + unit tests", expectedResult: "Tests pass", timeout: "1–5 days" },
      { step: "5", action: "Certify in sandbox against government test environment", expectedResult: "Sandbox certification complete", timeout: "1–3 days" },
      { step: "6", action: "Schedule production cutover (coordinate with government cut-over window)", expectedResult: "Cutover scheduled", timeout: "30 min" },
      { step: "7", action: "Deploy updated adapter + update CountryConfiguration.schemaVersion", expectedResult: "Adapter HEALTHY", timeout: "1 hour" },
      { step: "8", action: "Process queued submissions against new schema", expectedResult: "Queue drained", timeout: "4 hours" },
    ],
    escalation: "Engineering Lead → CTO → Government Liaison",
    rollbackProcedure: "Roll back to previous adapter version (keep prior schema mapping for 30 days)",
    evidenceRequired: ["Schema diff", "Updated adapter + tests", "Sandbox certification record", "Production cutover log"],
  },
  {
    runbookId: "RB-006",
    title: "Failed Submission",
    scenario: "A customs declaration submission returns REJECTED or MANUAL_FALLBACK",
    severity: "MEDIUM",
    steps: [
      { step: "1", action: "Inspect SubmissionResult + normalized error (error-normalization.ts)", expectedResult: "Root cause identified", timeout: "15 min" },
      { step: "2", action: "Classify error: retryable (transient) vs non-retryable (data)", expectedResult: "Classification recorded", timeout: "5 min" },
      { step: "3", action: "If retryable: confirm retry-engine will pick it up (idempotency key intact)", expectedResult: "Retry scheduled", timeout: "5 min" },
      { step: "4", action: "If non-retryable: send to broker review (BROKER_REVIEW state)", expectedResult: "Broker notified", timeout: "15 min" },
      { step: "5", action: "Broker corrects declaration data + re-submits", expectedResult: "Re-submission accepted", timeout: "4 hours" },
      { step: "6", action: "Update declaration state machine (declaration-lifecycle.ts)", expectedResult: "State consistent", timeout: "5 min" },
    ],
    escalation: "Engineering Lead → Broker Operations",
    rollbackProcedure: "Cancel the rejected submission (if a partial government-side record was created) and re-file as a new declaration",
    evidenceRequired: ["SubmissionResult record", "Normalized error classification", "Broker communication log", "Re-submission record"],
  },
  {
    runbookId: "RB-007",
    title: "Duplicate Submission",
    scenario: "Same declaration submitted twice (idempotency key collision in IntegrationConnectorLog)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Detect duplicate (idempotency_key unique constraint)", expectedResult: "Duplicate detected", timeout: "5 min" },
      { step: "2", action: "Identify the original submission (earliest IntegrationConnectorLog row)", expectedResult: "Original identified", timeout: "5 min" },
      { step: "3", action: "Reject the duplicate with the original's external reference", expectedResult: "Duplicate rejected", timeout: "5 min" },
      { step: "4", action: "Notify the broker that the duplicate was suppressed", expectedResult: "Broker notified", timeout: "10 min" },
      { step: "5", action: "Audit-trail: log the suppression in Activity + CanonicalEvent", expectedResult: "Audit trail complete", timeout: "5 min" },
    ],
    escalation: "Engineering Lead → Broker Operations",
    rollbackProcedure: "If the original was wrong and the duplicate was correct: cancel original via adapter.cancel(), then re-file duplicate as a new submission with a fresh idempotency key",
    evidenceRequired: ["Duplicate detection record", "Original submission reference", "Suppression audit log", "Broker notification"],
  },
  {
    runbookId: "RB-008",
    title: "Government Rejection",
    scenario: "Government formally rejects a filed declaration (government status = REJECTED)",
    severity: "MEDIUM",
    steps: [
      { step: "1", action: "Capture government rejection notice (raw + normalized)", expectedResult: "Rejection captured", timeout: "10 min" },
      { step: "2", action: "Update declaration state → REJECTED", expectedResult: "State updated", timeout: "5 min" },
      { step: "3", action: "Notify broker + trader (Smart Inbox)", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "4", action: "Broker reviews rejection reason + prepares amendment", expectedResult: "Amendment drafted", timeout: "4 hours" },
      { step: "5", action: "File amendment via adapter.amend()", expectedResult: "Amendment accepted", timeout: "1 hour" },
      { step: "6", action: "Update declaration state machine + audit", expectedResult: "Audit trail complete", timeout: "5 min" },
    ],
    escalation: "Engineering Lead → Broker Operations → Government Liaison (if rejection is disputed)",
    rollbackProcedure: "If amendment also rejected: cancel declaration, create a new one with corrected data (do NOT keep amending indefinitely — 3 amendments max before human escalation)",
    evidenceRequired: ["Government rejection notice", "Normalized rejection reason", "Broker amendment", "Amendment submission record"],
  },
  {
    runbookId: "RB-009",
    title: "Government Hold",
    scenario: "Customs authority places a hold on a filed declaration (CUSTOMS_HOLD / PGA_HOLD)",
    severity: "MEDIUM",
    steps: [
      { step: "1", action: "Record hold via createHold() (§158 — issuedBy MUST be the authority)", expectedResult: "Hold recorded", timeout: "10 min" },
      { step: "2", action: "Update declaration state → CUSTOMS_HOLD or PGA_HOLD", expectedResult: "State updated", timeout: "5 min" },
      { step: "3", action: "Notify broker + trader (Smart Inbox)", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "4", action: "Coordinate with broker for document / inspection response", expectedResult: "Response plan agreed", timeout: "2 hours" },
      { step: "5", action: "Monitor for authority release (releaseReference required)", expectedResult: "Release received", timeout: "Varies (hours–days)" },
      { step: "6", action: "On release: releaseHold(holdId, releaseReference) (§113 — authoritative evidence required)", expectedResult: "Hold RELEASED", timeout: "10 min" },
      { step: "7", action: "Update declaration state → ACCEPTED / RELEASED", expectedResult: "State consistent", timeout: "5 min" },
    ],
    escalation: "Broker Operations → Government Liaison (if hold > 5 business days)",
    rollbackProcedure: "If release is reversed by authority: re-create hold with the new authority reference (never silently un-release)",
    evidenceRequired: ["Hold record (with authority identifier)", "Authority release reference", "Broker coordination log", "State transition audit"],
  },
  {
    runbookId: "RB-010",
    title: "Payment Discrepancy",
    scenario: "Duty / tax payment amount disagrees with the filed declaration (PAYMENT_HOLD or reconciliation mismatch)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Capture discrepancy (filed amount vs paid amount)", expectedResult: "Discrepancy quantified", timeout: "15 min" },
      { step: "2", action: "Create PAYMENT_HOLD via createHold() (§158)", expectedResult: "Hold recorded", timeout: "10 min" },
      { step: "3", action: "Notify broker + trader + finance team", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "4", action: "Investigate root cause (FX rounding / tariff change / valuation dispute)", expectedResult: "Root cause identified", timeout: "4 hours" },
      { step: "5", action: "Resolve: top-up payment OR amendment to declared value", expectedResult: "Resolution actioned", timeout: "1 business day" },
      { step: "6", action: "Verify reconciliation matches", expectedResult: "Reconciliation clean", timeout: "30 min" },
      { step: "7", action: "releaseHold() with bank / authority reference", expectedResult: "Hold RELEASED", timeout: "10 min" },
    ],
    escalation: "Finance Lead → Engineering Lead → CTO (if discrepancy > $10k)",
    rollbackProcedure: "If resolution is reversed (e.g. chargeback): re-create PAYMENT_HOLD with new evidence (never silently re-open)",
    evidenceRequired: ["Discrepancy record", "Root cause analysis", "Resolution evidence (bank ref / amendment)", "Reconciliation report"],
  },
  {
    runbookId: "RB-011",
    title: "Fee Dispute Escalation",
    scenario: "Fee dispute reaches ESCALATED state or CRITICAL broker risk flag is raised",
    severity: "MEDIUM",
    steps: [
      { step: "1", action: "Verify dispute is in ESCALATED state (§18) + Governor decision recorded", expectedResult: "Escalation verified", timeout: "10 min" },
      { step: "2", action: "Notify broker + trader + SGTX compliance", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "3", action: "If CRITICAL: verify broker risk flag + Governor decision (§21 + §43)", expectedResult: "Risk flag + Governor verified", timeout: "15 min" },
      { step: "4", action: "Gather full evidence package (§71 gatherEvidence)", expectedResult: "Evidence package complete", timeout: "30 min" },
      { step: "5", action: "Convene mediation panel (neutral SGTX mediator)", expectedResult: "Panel scheduled", timeout: "1 business day" },
      { step: "6", action: "Resolution: UPHELD / REJECTED / PARTIALLY_UPHELD via Governor", expectedResult: "Resolution recorded", timeout: "5 business days" },
      { step: "7", action: "If UPHELD: process refund via non-custodial payment engine", expectedResult: "Refund processed", timeout: "2 business days" },
    ],
    escalation: "Compliance Lead → CTO → External Arbitration (if not resolved in 5 business days)",
    rollbackProcedure: "If resolution is reversed on appeal: re-open dispute via Governor decision (never silently re-open)",
    evidenceRequired: ["Dispute record", "Governor decision", "Evidence package", "Mediation panel record", "Refund / chargeback evidence"],
  },
  {
    runbookId: "RB-012",
    title: "Evidence Corruption",
    scenario: "Stored evidence (declarations, invoices, messages) is corrupted, tampered, or missing",
    severity: "CRITICAL",
    steps: [
      { step: "1", action: "Detect corruption (verifyFeeIntegrity fails OR hash-chain broken)", expectedResult: "Corruption confirmed", timeout: "10 min" },
      { step: "2", action: "Identify scope (which USTNs / which records affected)", expectedResult: "Scope identified", timeout: "30 min" },
      { step: "3", action: "Freeze affected trades (no new submissions until restored)", expectedResult: "Freeze applied", timeout: "15 min" },
      { step: "4", action: "Notify CTO + Security + Compliance immediately", expectedResult: "Notifications sent", timeout: "5 min" },
      { step: "5", action: "Restore from backup / replica / CanonicalEvent hash chain", expectedResult: "Evidence restored", timeout: "4 hours" },
      { step: "6", action: "Verify integrity post-restore (verifyFeeIntegrity + Loom verifier)", expectedResult: "Integrity confirmed", timeout: "30 min" },
      { step: "7", action: "Unfreeze affected trades", expectedResult: "Trades resumed", timeout: "10 min" },
      { step: "8", action: "Post-incident review (root cause + prevention)", expectedResult: "PIR document complete", timeout: "5 business days" },
    ],
    escalation: "CTO → Security Lead → Compliance → External Auditor (if tampering suspected)",
    rollbackProcedure: "If restore fails: keep trades frozen + engage backup/replica team. DO NOT unfreeze without integrity confirmation.",
    evidenceRequired: ["Corruption detection log", "Scope analysis", "Restore operation log", "Post-restore integrity verification", "PIR document"],
  },
  {
    runbookId: "RB-013",
    title: "Tenant Isolation Incident",
    scenario: "One tenant's data leaks into another tenant's view (cross-tenant access detected)",
    severity: "CRITICAL",
    steps: [
      { step: "1", action: "Confirm cross-tenant access (audit log shows actorGtid A accessed tenant B's data)", expectedResult: "Incident confirmed", timeout: "10 min" },
      { step: "2", action: "Revoke the offending actor's session immediately", expectedResult: "Session revoked", timeout: "5 min" },
      { step: "3", action: "Notify CTO + Security + DPO (data protection officer)", expectedResult: "Notifications sent", timeout: "5 min" },
      { step: "4", action: "Identify full scope (which tenants / which records / time window)", expectedResult: "Scope identified", timeout: "1 hour" },
      { step: "5", action: "Patch the isolation bug + deploy hotfix", expectedResult: "Patch deployed", timeout: "2 hours" },
      { step: "6", action: "Notify affected tenants (regulatory disclosure if PII involved)", expectedResult: "Disclosures sent", timeout: "1 business day" },
      { step: "7", action: "Full audit of tenant boundaries", expectedResult: "Audit complete", timeout: "5 business days" },
      { step: "8", action: "PIR + prevention plan", expectedResult: "PIR document complete", timeout: "5 business days" },
    ],
    escalation: "CTO → DPO → External Regulator (if PII / regulated data involved)",
    rollbackProcedure: "If patch causes new issues: revert hotfix, re-freeze affected tenant views manually until a corrected patch is ready",
    evidenceRequired: ["Cross-tenant access audit log", "Actor session revocation record", "Tenant notification records", "Hotfix deployment log", "PIR document"],
  },
  {
    runbookId: "RB-014",
    title: "Broker Suspension",
    scenario: "Broker requires suspension (CRITICAL risk flag upheld OR regulatory action)",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Verify CRITICAL broker risk flag + Governor decision (§21 + §43)", expectedResult: "Suspension authorised by Governor", timeout: "15 min" },
      { step: "2", action: "Mark broker inactive (BrokerRiskFlag + operational eligibility)", expectedResult: "Broker marked ineligible for new assignments", timeout: "10 min" },
      { step: "3", action: "Identify in-flight trades assigned to this broker", expectedResult: "In-flight list identified", timeout: "15 min" },
      { step: "4", action: "Reassign in-flight trades to alternate broker (with trader consent)", expectedResult: "Reassignments agreed", timeout: "2 hours" },
      { step: "5", action: "Notify broker + traders + SGTX compliance", expectedResult: "Notifications sent", timeout: "30 min" },
      { step: "6", action: "Preserve all broker evidence (do NOT delete — §69 immutable)", expectedResult: "Evidence preserved", timeout: "30 min" },
      { step: "7", action: "If regulatory: file report with the customs authority", expectedResult: "Report filed", timeout: "1 business day" },
    ],
    escalation: "Compliance Lead → CTO → External Regulator (if mandated)",
    rollbackProcedure: "Suspension can be reversed ONLY via a Governor decision (verdict=ALLOW) clearing the risk flag (clearRiskFlag). NEVER auto-restore.",
    evidenceRequired: ["Governor decision authorising suspension", "Risk flag record", "In-flight trade reassignment log", "Broker + trader notifications", "Regulatory report (if filed)"],
  },
  {
    runbookId: "RB-015",
    title: "Adapter Rollback",
    scenario: "A new adapter version is misbehaving in production — must roll back to prior version",
    severity: "HIGH",
    steps: [
      { step: "1", action: "Confirm rollback is required (health DEGRADED / SCHEMA_FAILURE /widespread submission failures)", expectedResult: "Rollback justified", timeout: "15 min" },
      { step: "2", action: "Identify prior stable adapter version (git tag + adapter registry log)", expectedResult: "Prior version identified", timeout: "10 min" },
      { step: "3", action: "Notify CTO + Engineering Lead + affected brokers", expectedResult: "Notifications sent", timeout: "15 min" },
      { step: "4", action: "Disable new adapter version (mark DISABLED)", expectedResult: "New version disabled", timeout: "5 min" },
      { step: "5", action: "Deploy prior stable version + update CountryConfiguration.adapterVersion", expectedResult: "Prior version deployed", timeout: "30 min" },
      { step: "6", action: "performHealthCheck + test submission", expectedResult: "Adapter HEALTHY", timeout: "30 min" },
      { step: "7", action: "Re-queue suppressed submissions", expectedResult: "Queue drained", timeout: "2 hours" },
      { step: "8", action: "Post-incident review of the failed version", expectedResult: "PIR document complete", timeout: "5 business days" },
    ],
    escalation: "Engineering Lead → CTO",
    rollbackProcedure: "If prior version also fails: keep adapter DISABLED, switch all traffic to manual / portal fallback (RB-001 step 3)",
    evidenceRequired: ["Rollback justification", "Prior version identifier", "Deployment log", "Post-rollback health check", "PIR document"],
  },
];

// ============ Public API ============

/**
 * §172 — Get a runbook by ID. Returns null if not found. NEVER throws.
 */
export function getRunbook(runbookId: string): Runbook | null {
  try {
    if (!runbookId) return null;
    return RUNBOOKS.find((r) => r.runbookId === runbookId) || null;
  } catch (err) {
    logger.error("[customs-gateway/production-runbooks] getRunbook failed", { error: String(err), runbookId });
    return null;
  }
}

/**
 * §172 — List all runbooks. NEVER throws — returns [] on error.
 */
export function listRunbooks(): Runbook[] {
  try {
    return RUNBOOKS;
  } catch (err) {
    logger.error("[customs-gateway/production-runbooks] listRunbooks failed", { error: String(err) });
    return [];
  }
}

/**
 * §172 — List runbooks by severity. NEVER throws — returns [] on error.
 */
export function getRunbooksBySeverity(severity: string): Runbook[] {
  try {
    const upper = String(severity || "").toUpperCase();
    if (!["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(upper)) return [];
    return RUNBOOKS.filter((r) => r.severity === upper);
  } catch (err) {
    logger.error("[customs-gateway/production-runbooks] getRunbooksBySeverity failed", {
      error: String(err), severity,
    });
    return [];
  }
}
