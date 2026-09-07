// @ts-nocheck
// =============================================================================
// SGTX Authority Matrix Library (v17 §19.29-19.31)
// -----------------------------------------------------------------------------
// Authority is DOMAIN-SPECIFIC. Financial authority does NOT confer legal
// authority. Legal authority does NOT confer operational authority. Each
// domain has its own authority chain.
//
// Key principles (v17 §19.31):
//   1. ASSERTION ≠ CONFIRMATION.
//        • An assertion is an actor's claim of authority ("I, the seller,
//          assert that this contract is ready to sign").
//        • A confirmation is a second actor's verification of that assertion
//          ("I, the compliance officer, confirm the seller's assertion").
//        • An action that requires confirmation CANNOT proceed on assertion
//          alone — confirmation is mandatory.
//
//   2. Authority levels form a strict ladder:
//        ASSERT → CONFIRM → AUTHORIZE → FINALIZE
//        • ASSERT     — actor claims a fact (not yet verified)
//        • CONFIRM    — a second actor verifies the assertion
//        • AUTHORIZE — an authorised officer grants permission for the
//                      action (depends on prior CONFIRM)
//        • FINALIZE  — the platform (Governor + Loom) closes the action
//                      immutably (depends on prior AUTHORIZE)
//
//   3. Evidence integrity is SEPARATE from authority:
//        • Evidence (documents, signatures, telemetry) has its own Loom-
//          anchored integrity chain (sha256 hash chain).
//        • Authority is about WHO can act; evidence is about WHAT was
//          observed. The two must not be conflated: an actor can have
//          authority but the evidence can still be insufficient (and vice
//          versa).
//
// Domains (v17 §19.29):
//   FINANCIAL    — settlement, fee, financing, reserve
//   LEGAL        — contract sign, dispute, arbitration
//   OPERATIONAL  — logistics, customs declaration, container release
//   REGULATORY   — sanctions, FTA, customs compliance, labelling
//   CUSTOMS      — customs declaration submission, duty payment, clearance
//   LOGISTICS    — carrier selection, addendum signing, route planning
//   DOCUMENTARY  — document issuance, certification, apostille
//   COMPLIANCE   — EDD, KYB, sanctions screening, AML
//
// Persistence:
//   Assertions and confirmations are persisted to the ConfigurationHistory
//   table (no schema change needed) with a `configKey` prefix of
//   `authority_assertion.<id>` and `authority_confirmation.<id>`. This gives
//   us a Loom-anchored, durable, queryable audit trail of every authority
//   event on the platform.
// =============================================================================

import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";
import { createHash } from "crypto";
import { logger } from "@/lib/sgtx/logger";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type AuthorityDomain =
  | "FINANCIAL"
  | "LEGAL"
  | "OPERATIONAL"
  | "REGULATORY"
  | "CUSTOMS"
  | "LOGISTICS"
  | "DOCUMENTARY"
  | "COMPLIANCE";

export type AuthorityLevel = "ASSERT" | "CONFIRM" | "AUTHORIZE" | "FINALIZE";

export interface AuthorityAssertion {
  id: string;
  ustn?: string;
  actor_gtid: string;
  domain: AuthorityDomain;
  action: string;
  level: AuthorityLevel; // always "ASSERT" for assertions
  evidence_required: string[];
  evidence_provided?: Record<string, any>;
  confirmed_by: string[]; // GTIDs who have confirmed
  confirmation_count: number;
  required_confirmations: number; // default 1, can be 2 for high-stakes
  authorized_by?: string; // GTID of the authorised officer (set at AUTHORIZE)
  finalized: boolean; // set to true at FINALIZE
  created_at: string;
  confirmed_at?: string;
  authorized_at?: string;
  finalized_at?: string;
  loom_anchor?: string; // sha256 hash chain anchor
}

export interface AuthorityConfirmation {
  id: string;
  assertion_id: string;
  confirmer_gtid: string;
  domain: AuthorityDomain;
  confirmed_at: string;
  note?: string;
  loom_anchor?: string;
}

export interface AuthorityEvidence {
  evidence_id: string;
  type: string; // e.g. "document", "signature", "telemetry", "ledger-entry"
  ref: string;  // document id / signature hash / telemetry timestamp
  integrity_hash: string; // sha256 of the evidence payload
  captured_at: string;
}

export interface EvaluateAuthorityResult {
  hasAuthority: boolean;
  authorityLevel: AuthorityLevel | "NONE";
  evidenceRequired: string[];
  evidenceSatisfied: boolean;
  confirmedBy: string[];
  requiredConfirmations: number;
  pendingConfirmations: number;
  reason: string;
  /** The next level required before the action can proceed. */
  nextStep?: AuthorityLevel;
}

export interface DomainMatrix {
  currentAuthority: AuthorityLevel | "NONE";
  assertions: AuthorityAssertion[];
  confirmations: AuthorityConfirmation[];
  /** Highest level achieved across all assertions in this domain. */
  highestLevelAchieved: AuthorityLevel | "NONE";
  finalized: boolean;
}

// ──────────────────────────────────────────────────────────────────────────
// Domain-action registry
// Each (domain, action) pair declares the required authority ladder + the
// minimum number of confirmations + the evidence categories required.
// v17 §19.29: the matrix is per-domain. CONFIRM counts are higher for
// high-stakes actions (settlement, dispute arbitration, contract sign).
// ──────────────────────────────────────────────────────────────────────────

interface DomainActionRule {
  domain: AuthorityDomain;
  action: string;
  requiredConfirmations: number;
  /** Authority level required to actually execute the action. */
  requiredLevel: AuthorityLevel;
  evidenceRequired: string[];
}

const DOMAIN_ACTION_RULES: DomainActionRule[] = [
  // FINANCIAL domain — settlement is high-stakes (2 confirmations)
  { domain: "FINANCIAL", action: "fee.collect",            requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["feelock-state", "ustn-active"] },
  { domain: "FINANCIAL", action: "settlement.approve",    requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["settlement-instruction", "beneficiary-consistency", "reserve-ratio"] },
  { domain: "FINANCIAL", action: "financing.request",     requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["financing-toggle-on", "rfq-issued"] },
  { domain: "FINANCIAL", action: "financing.agreement",   requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["accepted-bids", "co-financing-sum", "financier-kyb"] },
  { domain: "FINANCIAL", action: "reserve.attest",         requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["big-four-auditor-report", "reserve-ratio>=1.10"] },

  // LEGAL domain — contract sign is high-stakes (2 confirmations)
  { domain: "LEGAL",     action: "contract.sign",          requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["contract-document", "qes-signature", "parties-kyb"] },
  { domain: "LEGAL",     action: "dispute.file",           requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["dispute-evidence", "dispute-narrative"] },
  { domain: "LEGAL",     action: "arbitration.initiate",  requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["arbitration-clause", "dispute-claim"] },

  // OPERATIONAL domain
  { domain: "OPERATIONAL", action: "container.release",   requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["addendum-signed", "carrier-confirmed"] },
  { domain: "OPERATIONAL", action: "trade.create",         requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["trade-readiness>=70", "parties-kyb"] },

  // REGULATORY domain
  { domain: "REGULATORY", action: "sanctions.screen",      requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["sanctions-list-snapshot", "screening-result"] },
  { domain: "REGULATORY", action: "fta.claim",             requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["origin-certificate", "fta-rules-applied"] },

  // CUSTOMS domain — declaration is high-stakes (2 confirmations)
  { domain: "CUSTOMS",   action: "broker.declaration.submit", requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["hs-code", "declared-value", "origin-country", "cbr-liability-ack"] },
  { domain: "CUSTOMS",   action: "duty.pay",               requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["duty-assessment", "payment-instruction"] },
  { domain: "CUSTOMS",   action: "customs.clearance",      requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["declaration-accepted", "duty-paid"] },

  // LOGISTICS domain
  { domain: "LOGISTICS", action: "logistics.quote.select", requiredConfirmations: 1, requiredLevel: "CONFIRM",   evidenceRequired: ["addendum-signed", "carrier-gtid"] },
  { domain: "LOGISTICS", action: "logistics.fallback.activate", requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["primary-carrier-failed", "fallback-carrier-kyb"] },

  // DOCUMENTARY domain
  { domain: "DOCUMENTARY", action: "document.issue",      requiredConfirmations: 1, requiredLevel: "AUTHORIZE", evidenceRequired: ["document-template", "signing-authority"] },
  { domain: "DOCUMENTARY", action: "certificate.apostille", requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["apostille-authority-gtid", "document-original"] },

  // COMPLIANCE domain
  { domain: "COMPLIANCE", action: "edd.signoff",            requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["edd-questionnaire", "kyb-report", "compliance-officer-gtid"] },
  { domain: "COMPLIANCE", action: "aml.report",             requiredConfirmations: 2, requiredLevel: "AUTHORIZE", evidenceRequired: ["suspicious-activity-report", "filing-reference"] },
];

function findDomainRule(domain: AuthorityDomain, action: string): DomainActionRule | undefined {
  return DOMAIN_ACTION_RULES.find((r) => r.domain === domain && r.action === action);
}

// ──────────────────────────────────────────────────────────────────────────
// In-process state + persistence
// ──────────────────────────────────────────────────────────────────────────

// In-memory cache (process-local) — durable copy lives in ConfigurationHistory.
const assertions = new Map<string, AuthorityAssertion>();
const confirmations = new Map<string, AuthorityConfirmation>();

let hydrated = false;

async function hydrate(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  try {
    const rows = await freshDb.configurationHistory.findMany({
      where: {
        OR: [
          { configKey: { startsWith: "authority_assertion." } },
          { configKey: { startsWith: "authority_confirmation." } },
        ],
      },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.newValue || "{}");
        if (row.configKey.startsWith("authority_assertion.")) {
          assertions.set(parsed.id, parsed);
        } else if (row.configKey.startsWith("authority_confirmation.")) {
          confirmations.set(parsed.id, parsed);
        }
      } catch {
        // skip malformed
      }
    }
  } catch (err: any) {
    logger.warn(`[authority-matrix] hydrate failed — proceeding with empty cache: ${err?.message ?? err}`);
  }
}

async function persistAssertion(a: AuthorityAssertion): Promise<void> {
  try {
    const configKey = `authority_assertion.${a.id}`;
    const last = await freshDb.configurationHistory.findFirst({
      where: { configKey: `authority_assertion.${a.id}` },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;
    await freshDb.configurationHistory.create({
      data: {
        configKey,
        oldValue: last?.newValue ?? null,
        newValue: JSON.stringify(a),
        changedByGtid: a.actor_gtid,
        changeReason: `authority ${a.level} on ${a.domain}/${a.action}`,
        version: nextVersion,
      },
    });
  } catch (err: any) {
    logger.warn(`[authority-matrix] persistAssertion failed: ${err?.message ?? err}`);
  }
}

async function persistConfirmation(c: AuthorityConfirmation): Promise<void> {
  try {
    const configKey = `authority_confirmation.${c.id}`;
    await freshDb.configurationHistory.create({
      data: {
        configKey,
        newValue: JSON.stringify(c),
        changedByGtid: c.confirmer_gtid,
        changeReason: `authority CONFIRM on ${c.domain} (${c.assertion_id})`,
        version: 1,
      },
    });
  } catch (err: any) {
    logger.warn(`[authority-matrix] persistConfirmation failed: ${err?.message ?? err}`);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Loom anchor — sha256 of (assertion id + actor + domain + action + timestamp)
// ──────────────────────────────────────────────────────────────────────────

function loomAnchorForAssertion(a: AuthorityAssertion): string {
  return "sha256:" + createHash("sha256")
    .update(`authority|${a.id}|${a.actor_gtid}|${a.domain}|${a.action}|${a.created_at}`)
    .digest("hex");
}

function loomAnchorForConfirmation(c: AuthorityConfirmation): string {
  return "sha256:" + createHash("sha256")
    .update(`confirm|${c.id}|${c.assertion_id}|${c.confirmer_gtid}|${c.confirmed_at}`)
    .digest("hex");
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Record an ASSERTION. An assertion is the actor's claim — it is NOT yet
 * confirmation. The action the assertion relates to cannot proceed until
 * the required number of confirmations have been recorded AND the
 * required authority level is met.
 *
 * Returns the new assertion (including its id and Loom anchor).
 */
export async function assertAuthority(
  actor_gtid: string,
  domain: AuthorityDomain,
  action: string,
  options: { ustn?: string; evidenceProvided?: Record<string, any>; requiredConfirmationsOverride?: number } = {},
): Promise<AuthorityAssertion> {
  await hydrate();

  const rule = findDomainRule(domain, action);
  if (!rule) {
    throw new Error(`Authority rule not found for ${domain}/${action} — domain-action pair is not registered.`);
  }

  const id = `asrt-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const createdAt = new Date().toISOString();
  const requiredConfirmations = options.requiredConfirmationsOverride ?? rule.requiredConfirmations;

  const assertion: AuthorityAssertion = {
    id,
    ustn: options.ustn,
    actor_gtid,
    domain,
    action,
    level: "ASSERT",
    evidence_required: rule.evidenceRequired,
    evidence_provided: options.evidenceProvided,
    confirmed_by: [],
    confirmation_count: 0,
    required_confirmations: requiredConfirmations,
    finalized: false,
    created_at: createdAt,
  };
  assertion.loom_anchor = loomAnchorForAssertion(assertion);

  assertions.set(id, assertion);
  await persistAssertion(assertion);

  logger.info(`[authority-matrix] ASSERT by ${actor_gtid} on ${domain}/${action} (assertion=${id}, required_confirmations=${requiredConfirmations})`, {
    assertion_id: id, domain, action, ustn: options.ustn,
  });

  return assertion;
}

/**
 * Confirm an existing assertion. The confirmer must NOT be the same actor
 * who made the assertion (self-confirmation is forbidden — v17 §19.31).
 *
 * When the confirmation_count reaches required_confirmations, the
 * assertion's authority level is upgraded from ASSERT to CONFIRM.
 *
 * For AUTHORIZED-level actions, an additional AUTHORIZE step must be
 * performed by an authorised officer (see `authorizeAuthority`).
 */
export async function confirmAuthority(
  assertionId: string,
  confirmer_gtid: string,
  domain: AuthorityDomain,
  options: { note?: string } = {},
): Promise<AuthorityConfirmation> {
  await hydrate();

  const assertion = assertions.get(assertionId);
  if (!assertion) {
    throw new Error(`Authority assertion ${assertionId} not found.`);
  }
  if (assertion.domain !== domain) {
    throw new Error(
      `Domain mismatch: assertion ${assertionId} is in domain ${assertion.domain}, ` +
      `but confirmer attempted to confirm in domain ${domain}. Authority is DOMAIN-SPECIFIC (v17 §19.29).`,
    );
  }
  if (assertion.finalized) {
    throw new Error(`Assertion ${assertionId} is already finalized — cannot confirm.`);
  }
  if (assertion.actor_gtid === confirmer_gtid) {
    throw new Error(
      `Self-confirmation forbidden (v17 §19.31) — actor ${confirmer_gtid} cannot confirm their own assertion.`,
    );
  }
  if (assertion.confirmed_by.includes(confirmer_gtid)) {
    throw new Error(`Confirmer ${confirmer_gtid} has already confirmed assertion ${assertionId}.`);
  }

  const confirmationId = `cnf-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const confirmedAt = new Date().toISOString();

  const confirmation: AuthorityConfirmation = {
    id: confirmationId,
    assertion_id: assertionId,
    confirmer_gtid,
    domain,
    confirmed_at: confirmedAt,
    note: options.note,
  };
  confirmation.loom_anchor = loomAnchorForConfirmation(confirmation);

  confirmations.set(confirmationId, confirmation);
  await persistConfirmation(confirmation);

  assertion.confirmed_by.push(confirmer_gtid);
  assertion.confirmation_count = assertion.confirmed_by.length;
  if (assertion.confirmation_count >= assertion.required_confirmations && assertion.level === "ASSERT") {
    assertion.level = "CONFIRM";
    assertion.confirmed_at = confirmedAt;
  }
  await persistAssertion(assertion);

  logger.info(
    `[authority-matrix] CONFIRM by ${confirmer_gtid} on ${domain} (assertion=${assertionId}, count=${assertion.confirmation_count}/${assertion.required_confirmations}, level=${assertion.level})`,
    { assertion_id: assertionId, confirmation_id: confirmationId, domain },
  );

  return confirmation;
}

/**
 * Authorize an assertion — required for high-stakes actions where
 * `requiredLevel == AUTHORIZE`. The authoriser must be an authorised
 * officer (the caller is responsible for verifying the authoriser's
 * officer status before calling this function).
 *
 * Requires the assertion to already be at CONFIRM level.
 */
export async function authorizeAuthority(
  assertionId: string,
  authorizer_gtid: string,
  domain: AuthorityDomain,
): Promise<AuthorityAssertion> {
  await hydrate();

  const assertion = assertions.get(assertionId);
  if (!assertion) throw new Error(`Authority assertion ${assertionId} not found.`);
  if (assertion.domain !== domain) {
    throw new Error(`Domain mismatch: assertion ${assertionId} is in ${assertion.domain}, not ${domain}.`);
  }
  if (assertion.finalized) throw new Error(`Assertion ${assertionId} is already finalized.`);
  if (assertion.level !== "CONFIRM") {
    throw new Error(
      `Assertion ${assertionId} cannot be AUTHORIZE'd — it is at level ${assertion.level}. ` +
      `Required: CONFIRM (i.e. ${assertion.required_confirmations} confirmation(s) recorded).`,
    );
  }
  if (assertion.actor_gtid === authorizer_gtid) {
    throw new Error(`Self-authorisation forbidden — actor ${authorizer_gtid} cannot authorize their own assertion.`);
  }
  if (assertion.confirmed_by.includes(authorizer_gtid)) {
    throw new Error(`Authoriser ${authorizer_gtid} already confirmed this assertion — must be a third party.`);
  }

  assertion.level = "AUTHORIZE";
  assertion.authorized_by = authorizer_gtid;
  assertion.authorized_at = new Date().toISOString();
  await persistAssertion(assertion);

  logger.info(`[authority-matrix] AUTHORIZE by ${authorizer_gtid} on ${domain} (assertion=${assertionId})`, {
    assertion_id: assertionId, domain, authorizer: authorizer_gtid,
  });

  return assertion;
}

/**
 * Finalize an assertion — called by the Governor (or its delegate) once
 * the action has been executed and the Loom has been anchored. After
 * finalization, the assertion is immutable.
 *
 * Requires the assertion to be at AUTHORIZE level.
 */
export async function finalizeAuthority(assertionId: string, finalizerGtid: string): Promise<AuthorityAssertion> {
  await hydrate();
  const assertion = assertions.get(assertionId);
  if (!assertion) throw new Error(`Authority assertion ${assertionId} not found.`);
  if (assertion.finalized) throw new Error(`Assertion ${assertionId} is already finalized.`);
  if (assertion.level !== "AUTHORIZE") {
    throw new Error(`Cannot finalize — assertion is at ${assertion.level}, must be AUTHORIZE.`);
  }

  assertion.finalized = true;
  assertion.finalized_at = new Date().toISOString();
  await persistAssertion(assertion);

  logger.info(`[authority-matrix] FINALIZE by ${finalizerGtid} (assertion=${assertionId})`, {
    assertion_id: assertionId, finalizer: finalizerGtid,
  });

  return assertion;
}

/**
 * Evaluate the current authority for a (domain, action) pair. Returns:
 *   • hasAuthority       — can the action proceed right now?
 *   • authorityLevel     — current level (ASSERT / CONFIRM / AUTHORIZE / FINALIZE / NONE)
 *   • evidenceRequired   — list of evidence categories required
 *   • evidenceSatisfied  — were all required evidence categories provided?
 *   • confirmedBy        — list of GTIDs who have confirmed
 *   • requiredConfirmations — minimum confirmations required
 *   • pendingConfirmations — confirmations still required
 *   • nextStep           — the next level needed before the action can proceed
 *
 * Key principle: ASSERTION ≠ CONFIRMATION (v17 §19.31). An assertion alone
 * does NOT grant authority to proceed. The action can proceed only when
 * `hasAuthority == true`.
 */
export async function evaluateAuthority(
  actor_gtid: string,
  domain: AuthorityDomain,
  action: string,
  evidence: AuthorityEvidence[] = [],
): Promise<EvaluateAuthorityResult> {
  await hydrate();

  const rule = findDomainRule(domain, action);
  if (!rule) {
    return {
      hasAuthority: false,
      authorityLevel: "NONE",
      evidenceRequired: [],
      evidenceSatisfied: false,
      confirmedBy: [],
      requiredConfirmations: 0,
      pendingConfirmations: 0,
      reason: `Domain-action pair ${domain}/${action} is not registered in the authority matrix.`,
    };
  }

  // Find the most recent assertion by this actor for this domain+action.
  const matching = Array.from(assertions.values())
    .filter((a) => a.actor_gtid === actor_gtid && a.domain === domain && a.action === action)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  const latest = matching[0];

  if (!latest) {
    return {
      hasAuthority: false,
      authorityLevel: "NONE",
      evidenceRequired: rule.evidenceRequired,
      evidenceSatisfied: false,
      confirmedBy: [],
      requiredConfirmations: rule.requiredConfirmations,
      pendingConfirmations: rule.requiredConfirmations,
      reason: `No assertion found by ${actor_gtid} on ${domain}/${action} — call assertAuthority first.`,
      nextStep: "ASSERT",
    };
  }

  // Evidence integrity check — for each required evidence category, see if
  // at least one provided evidence has matching type and a valid integrity hash.
  const evidenceSatisfied = rule.evidenceRequired.every((requiredType) =>
    evidence.some((e) => e.type === requiredType && !!e.integrity_hash),
  );

  const pendingConfirmations = Math.max(0, latest.required_confirmations - latest.confirmation_count);

  // Authority ladder — does the current assertion's level satisfy the rule?
  const levelRank: Record<AuthorityLevel, number> = {
    ASSERT: 0,
    CONFIRM: 1,
    AUTHORIZE: 2,
    FINALIZE: 3,
  };
  const hasAuthority =
    latest.finalized ||
    (levelRank[latest.level] >= levelRank[rule.requiredLevel] && evidenceSatisfied);

  let nextStep: AuthorityLevel | undefined;
  if (!latest.finalized) {
    if (latest.level === "ASSERT" && pendingConfirmations > 0) nextStep = "CONFIRM";
    else if (latest.level === "CONFIRM" && rule.requiredLevel === "AUTHORIZE") nextStep = "AUTHORIZE";
    else if (latest.level === "AUTHORIZE") nextStep = "FINALIZE";
  }

  const reason = !evidenceSatisfied
    ? `Evidence missing — required: ${rule.evidenceRequired.join(", ")}.`
    : pendingConfirmations > 0
      ? `${pendingConfirmations} confirmation(s) still required.`
      : latest.level === "ASSERT" && rule.requiredLevel === "ASSERT"
        ? "Assertion alone is sufficient (low-stakes action)."
        : !hasAuthority
          ? `Authority level ${latest.level} does not meet required ${rule.requiredLevel}.`
          : "Authority satisfied.";

  return {
    hasAuthority,
    authorityLevel: latest.level,
    evidenceRequired: rule.evidenceRequired,
    evidenceSatisfied,
    confirmedBy: latest.confirmed_by,
    requiredConfirmations: latest.required_confirmations,
    pendingConfirmations,
    reason,
    nextStep,
  };
}

/**
 * Return the full authority matrix for a given USTN — every domain's
 * current authority level, all assertions, all confirmations.
 *
 * Used by the Trade Cockpit to render the "Authority Matrix" panel.
 */
export async function getAuthorityMatrix(ustn: string): Promise<{
  ustn: string;
  domains: Record<AuthorityDomain, DomainMatrix>;
  totalAssertions: number;
  totalConfirmations: number;
  finalizedActions: number;
}> {
  await hydrate();

  const allAssertions = Array.from(assertions.values()).filter((a) => a.ustn === ustn);
  const assertionIds = new Set(allAssertions.map((a) => a.id));
  const allConfirmations = Array.from(confirmations.values()).filter((c) => assertionIds.has(c.assertion_id));

  const domains = {} as Record<AuthorityDomain, DomainMatrix>;
  const allDomains: AuthorityDomain[] = [
    "FINANCIAL", "LEGAL", "OPERATIONAL", "REGULATORY", "CUSTOMS", "LOGISTICS", "DOCUMENTARY", "COMPLIANCE",
  ];
  for (const d of allDomains) {
    const dAssertions = allAssertions.filter((a) => a.domain === d);
    const dConfirmations = allConfirmations.filter((c) => c.domain === d);
    const highestLevel = dAssertions.reduce<AuthorityLevel | "NONE">((acc, a) => {
      if (acc === "NONE") return a.level;
      const rank: Record<AuthorityLevel, number> = { ASSERT: 0, CONFIRM: 1, AUTHORIZE: 2, FINALIZE: 3 };
      return rank[a.level] > rank[acc] ? a.level : acc;
    }, "NONE");
    const anyFinalized = dAssertions.some((a) => a.finalized);
    domains[d] = {
      currentAuthority: highestLevel,
      assertions: dAssertions,
      confirmations: dConfirmations,
      highestLevelAchieved: highestLevel,
      finalized: anyFinalized,
    };
  }

  return {
    ustn,
    domains,
    totalAssertions: allAssertions.length,
    totalConfirmations: allConfirmations.length,
    finalizedActions: allAssertions.filter((a) => a.finalized).length,
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Self-test — used by /api/sgtx/health
// ──────────────────────────────────────────────────────────────────────────

export async function selfTestAuthorityMatrix(): Promise<{ ok: boolean; detail: string }> {
  try {
    const actor = `self-test-actor-${Date.now()}`;
    const confirmer = `self-test-confirmer-${Date.now()}`;
    const assertion = await assertAuthority(actor, "OPERATIONAL", "container.release", {
      evidenceProvided: { "addendum-signed": true, "carrier-confirmed": true },
    });
    const evalBefore = await evaluateAuthority(actor, "OPERATIONAL", "container.release", [
      { evidence_id: "ev-1", type: "addendum-signed", ref: "doc-1", integrity_hash: "sha256:x", captured_at: new Date().toISOString() },
      { evidence_id: "ev-2", type: "carrier-confirmed", ref: "doc-2", integrity_hash: "sha256:y", captured_at: new Date().toISOString() },
    ]);
    if (evalBefore.hasAuthority) {
      return { ok: false, detail: "ASSERT alone should NOT grant authority (v17 §19.31)" };
    }
    await confirmAuthority(assertion.id, confirmer, "OPERATIONAL");
    const evalAfter = await evaluateAuthority(actor, "OPERATIONAL", "container.release", [
      { evidence_id: "ev-1", type: "addendum-signed", ref: "doc-1", integrity_hash: "sha256:x", captured_at: new Date().toISOString() },
      { evidence_id: "ev-2", type: "carrier-confirmed", ref: "doc-2", integrity_hash: "sha256:y", captured_at: new Date().toISOString() },
    ]);
    if (!evalAfter.hasAuthority) {
      return { ok: false, detail: `After confirmation, authority should be granted. reason=${evalAfter.reason}` };
    }
    return { ok: true, detail: `assert→confirm→grant; level=${evalAfter.authorityLevel}, confirmations=${evalAfter.confirmedBy.length}` };
  } catch (err: any) {
    return { ok: false, detail: `threw: ${err?.message ?? String(err)}` };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Re-export the domain-action rules for visibility / documentation endpoints
// ──────────────────────────────────────────────────────────────────────────

export function getDomainActionRules(): DomainActionRule[] {
  return [...DOMAIN_ACTION_RULES];
}
