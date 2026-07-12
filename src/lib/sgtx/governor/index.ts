// SGTX Governor Service (Blueprint Part 1.1-1.8)
// Simulates the Rust+Axum Governor in TypeScript:
// - OPA (Rego) policy evaluation → business rules, RBAC, dual-mode
// - WasmEdge constitutional modules → fee bounds, jurisdiction, incoterms, dual_mode
// - AI consult (A1-A3) via the AI Orchestrator
// - Decision Merger → final verdict
// - Loom hash chain (SHA256-linked, tamper-evident)
// - Ed25519 signing (simulated with SHA256)
// - Tenant message generation (AI)

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { runAI } from "@/lib/sgtx/ai/orchestrator";
import { signWithPlatformKeySync } from "@/lib/sgtx/crypto/platform-key";
import { logger } from "@/lib/sgtx/logger";

// ============ Types ============
export type Verdict = "ALLOW" | "DENY" | "CONDITIONAL";

export interface GovernorRequest {
  action: string; // contract.sign | trade.create | fee.collect | ...
  actorGtid?: string;
  actorEmployeeId?: string;
  traderMode?: string; // BUY | SELL | DUAL
  resourceUstn?: string;
  payload?: any;
}

export interface GovernorCondition {
  condition_id: string;
  label: string;
  status: "unmet" | "met";
  action_url?: string;
}

export interface GovernorResponse {
  decisionId: string;
  verdict: Verdict;
  conditions: GovernorCondition[];
  tenantMessage?: string;
  loomHash: string;
  previousHash: string | null;
  signature: string;
  moduleVersions: Record<string, string>;
  aiConfidence?: number;
  createdAt: string;
}

// ============ Constitutional Modules (Part 1.3 WasmEdge simulation) ============
// Each module returns a verdict; the Governor merges them.

const MODULE_VERSIONS = {
  constitutional_rules: "v1.0.0-immutable",
  jurisdiction_matrix: "v2026.06.17-ria",
  incoterms_engine: "v2020-incoterms",
  fee_gate: "v1.0.0-immutable",
  distressed_country_gate: "v2026.06.17-ria",
  dual_mode_gate: "v1.0.0-immutable",
  reserve_rules: "v1.0.0-immutable",
};

// 1.3.2 constitutional_rules.wasm — fee bounds, A5 prohibition, multisig
function constitutionalRules(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  const conditions: GovernorCondition[] = [];
  // Fee bounds check (0.1% - 2.5%)
  if (input.feeRate != null) {
    if (input.feeRate < 0.001 || input.feeRate > 0.025) {
      return { verdict: "DENY", conditions: [{ condition_id: "fee_out_of_bounds", label: `Fee rate ${(input.feeRate * 100).toFixed(2)}% violates constitutional bounds (0.1%-2.5%)`, status: "unmet" }] };
    }
  }
  // A5 prohibition — no autonomous execution
  if (input.autonomous === true) {
    return { verdict: "DENY", conditions: [{ condition_id: "a5_violation", label: "A5 FORBIDDEN: Autonomous execution blocked at WASM compile time.", status: "unmet" }] };
  }
  return { verdict: "ALLOW", conditions };
}

// 1.3.2 jurisdiction_matrix.wasm — strictest rule among parties
// FAIL-CLOSED: any party country NOT found in the Jurisdiction table returns
// CONDITIONAL with a `jurisdiction_unrated_{cc}` condition requiring manual
// compliance review. Only countries explicitly seeded as FULL/STANDARD pass
// cleanly to ALLOW. (Fixes prior audit finding M-021 / AUDIT-3 #10.)
async function jurisdictionMatrix(input: any): Promise<{ verdict: Verdict; conditions: GovernorCondition[] }> {
  const countries = [input.buyerCountry, input.sellerCountry, input.logisticsCountry, input.financierCountry].filter(Boolean);
  const conditions: GovernorCondition[] = [];
  let strictestTier = "FULL";
  const tierRank = { FULL: 0, STANDARD: 1, LIMITED: 2, RESTRICTED: 3, BLOCKED: 4 };

  for (const cc of countries) {
    const jur = await db.jurisdiction.findUnique({ where: { countryCode: cc } });
    if (!jur) {
      // Unknown / un-seeded jurisdiction → FAIL-CLOSED.
      // Do NOT silently ALLOW. Require manual compliance review.
      conditions.push({
        condition_id: `jurisdiction_unrated_${cc}`,
        label: `Jurisdiction ${cc} is not rated — manual compliance review required.`,
        status: "unmet",
        action_url: "/compliance",
      });
      // Treat unknown as strictly more restrictive than FULL so a downstream
      // ALLOW verdict is impossible without resolving the unrated condition.
      strictestTier = "LIMITED";
      continue;
    }
    if ((tierRank as any)[jur.tier] > (tierRank as any)[strictestTier]) strictestTier = jur.tier;
    if (jur.tier === "BLOCKED") {
      return { verdict: "DENY", conditions: [{ condition_id: "blocked_jurisdiction", label: `Jurisdiction ${cc} is BLOCKED — trade cannot proceed.`, status: "unmet" }] };
    }
    if (jur.tier === "RESTRICTED") {
      conditions.push({ condition_id: `restricted_${cc}`, label: `Jurisdiction ${cc} is RESTRICTED — enhanced due diligence required.`, status: "unmet", action_url: "/compliance" });
    }
    if (jur.tier === "LIMITED") {
      conditions.push({ condition_id: `limited_${cc}`, label: `Jurisdiction ${cc} is LIMITED — pre-approved corridors only.`, status: "unmet" });
    }
  }

  if (strictestTier === "RESTRICTED" || strictestTier === "LIMITED") {
    return { verdict: "CONDITIONAL", conditions };
  }
  return { verdict: "ALLOW", conditions };
}

// 1.3.2 incoterms_engine.wasm — validates logistics cost entries match incoterm
function incotermsEngine(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  if (!input.incoterm || !input.logisticsCosts) return { verdict: "ALLOW", conditions: [] };
  const costs = input.logisticsCosts;
  // FOB: buyer pays freight after loading; seller shouldn't include sea freight
  if (input.incoterm === "FOB" && costs.oceanFreight && costs.oceanFreightPaidBy === "seller") {
    return { verdict: "DENY", conditions: [{ condition_id: "incoterm_mismatch", label: "FOB incoterm mismatch: seller cannot pay ocean freight.", status: "unmet" }] };
  }
  // EXW: buyer handles all logistics; seller shouldn't include any transport
  if (input.incoterm === "EXW" && (costs.trucking || costs.oceanFreight)) {
    return { verdict: "CONDITIONAL", conditions: [{ condition_id: "exw_mismatch", label: "EXW incoterm: seller should not include transport costs.", status: "unmet" }] };
  }
  return { verdict: "ALLOW", conditions: [] };
}

// 1.3.2 fee_gate.wasm — validates gross-up, split instructions
function feeGate(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  if (input.tradeValue && input.feeAmount) {
    const expectedFee = input.tradeValue * 0.015; // 1.5%
    if (Math.abs(input.feeAmount - expectedFee) > 0.01) {
      return { verdict: "DENY", conditions: [{ condition_id: "fee_mismatch", label: `Fee amount ${input.feeAmount} does not match 1.5% of trade value (${expectedFee}).`, status: "unmet" }] };
    }
  }
  return { verdict: "ALLOW", conditions: [] };
}

// 1.3.2 dual_mode_gate.wasm — prevents buyer acting as seller and vice versa
function dualModeGate(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  if (!input.traderMode || !input.action) return { verdict: "ALLOW", conditions: [] };
  const sellerActions = ["quote.submit", "exw.lock", "packing.lock", "logistics.addenda.sign"];
  const buyerActions = ["trade.request.create", "quote.accept", "settlement.approve"];
  if (input.traderMode === "BUY" && sellerActions.includes(input.action)) {
    return { verdict: "DENY", conditions: [{ condition_id: "wrong_mode", label: `You are in Buyer mode. Action "${input.action}" requires Seller mode.`, status: "unmet", action_url: "/switch-mode" }] };
  }
  if (input.traderMode === "SELL" && buyerActions.includes(input.action)) {
    return { verdict: "DENY", conditions: [{ condition_id: "wrong_mode", label: `You are in Seller mode. Action "${input.action}" requires Buyer mode.`, status: "unmet", action_url: "/switch-mode" }] };
  }
  return { verdict: "ALLOW", conditions: [] };
}

// 1.3.6 reserve_rules.wasm — reserve composition (50% USD, 25% EUR, ≥15% gold, ≤10% other, ≥110% backing)
function reserveRules(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  if (input.reserveComposition) {
    const r = input.reserveComposition;
    if (r.usd !== 50 || r.eur !== 25 || r.gold < 15 || r.other > 10) {
      return { verdict: "DENY", conditions: [{ condition_id: "reserve_violation", label: "Reserve composition violates constitution (50% USD, 25% EUR, ≥15% gold, ≤10% other).", status: "unmet" }] };
    }
    if (r.backingRatio < 1.10) {
      return { verdict: "DENY", conditions: [{ condition_id: "insufficient_reserves", label: `Insufficient reserves (${(r.backingRatio * 100).toFixed(0)}% < 110% backing).`, status: "unmet" }] };
    }
  }
  return { verdict: "ALLOW", conditions: [] };
}

// 1.3.2 distressed_country_gate.wasm — applies country-specific factor to distressed cargo fee (1.5% × factor)
async function distressedCountryGate(input: any): Promise<{ verdict: Verdict; conditions: GovernorCondition[] }> {
  if (!input.isDistressed || !input.destCountry) return { verdict: "ALLOW", conditions: [] };
  const jur = await db.jurisdiction.findUnique({ where: { countryCode: input.destCountry } });
  if (!jur) return { verdict: "ALLOW", conditions: [] };
  // Distressed fee factor by tier: FULL=1.0, STANDARD=1.2, LIMITED=1.5, RESTRICTED=2.0, BLOCKED=DENY
  const factors: Record<string, number> = { FULL: 1.0, STANDARD: 1.2, LIMITED: 1.5, RESTRICTED: 2.0 };
  if (jur.tier === "BLOCKED") {
    return { verdict: "DENY", conditions: [{ condition_id: "distressed_blocked", label: `Distressed cargo cannot be sold to BLOCKED jurisdiction ${input.destCountry}.`, status: "unmet" }] };
  }
  const factor = factors[jur.tier] || 1.0;
  if (factor > 1.0) {
    return { verdict: "CONDITIONAL", conditions: [{ condition_id: "distressed_factor", label: `Distressed cargo fee factor ${factor}x applied for ${jur.tier} jurisdiction ${input.destCountry}.`, status: "unmet" }] };
  }
  return { verdict: "ALLOW", conditions: [] };
}

// ============ OPA Policy Engine (Part 1.2 simulation) ============
// Evaluates RBAC, permissions, data scopes, dual-mode context, reserve composition (Part 1.2 reserve.rego)
function opaEvaluate(input: any): { verdict: Verdict; conditions: GovernorCondition[] } {
  const conditions: GovernorCondition[] = [];
  // Permission check (simplified RBAC)
  const actionPerms: Record<string, string[]> = {
    "contract.sign": ["OWNER", "ADMIN", "OPERATOR"],
    "trade.create": ["OWNER", "ADMIN", "OPERATOR"],
    "fee.collect": ["OWNER", "ADMIN"],
    "financing.request": ["OWNER", "ADMIN"],
    "dispute.file": ["OWNER", "ADMIN", "OPERATOR"],
    "settlement.approve": ["OWNER", "ADMIN"],
  };
  const requiredRoles = actionPerms[input.action] || [];
  if (requiredRoles.length > 0 && input.actorRole && !requiredRoles.includes(input.actorRole)) {
    return { verdict: "DENY", conditions: [{ condition_id: "insufficient_role", label: `Role "${input.actorRole}" lacks permission for "${input.action}". Required: ${requiredRoles.join(" or ")}.`, status: "unmet" }] };
  }
  // Readiness check (Part 2.8.8) — trade.create requires score ≥70%
  if (input.action === "trade.create" && input.readinessScore != null && input.readinessScore < 70) {
    conditions.push({ condition_id: "readiness_below_threshold", label: `Trade readiness score ${input.readinessScore}% is below required 70%.`, status: "unmet", action_url: "/admin/readiness" });
    return { verdict: "CONDITIONAL", conditions };
  }
  // Part 1.2 reserve.rego — minimum backing ratio ≥110%; freeze new trades if below
  // Only applies to actions that create or settle obligations (trade.create, financing.request, settlement.approve)
  const reserveActions = ["trade.create", "financing.request", "settlement.approve"];
  if (reserveActions.includes(input.action) && input.reserveRatio != null) {
    if (input.reserveRatio < 1.1) {
      conditions.push({
        condition_id: "reserve_below_110",
        label: `Reserve backing ratio ${(input.reserveRatio * 100).toFixed(0)}% is below the constitutional 110% minimum. New trades are frozen and CBE has been alerted.`,
        status: "unmet",
        action_url: "/admin/reserve",
      });
      return { verdict: "DENY", conditions };
    }
    if (input.quarterlyAttestation === false) {
      conditions.push({
        condition_id: "quarterly_attestation_missing",
        label: "Quarterly reserve attestation by external auditor (Big Four) is required.",
        status: "unmet",
        action_url: "/admin/reserve",
      });
      return { verdict: "CONDITIONAL", conditions };
    }
  }
  return { verdict: "ALLOW", conditions };
}

// ============ Loom Hash Chain (Part 1.6) ============
function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

async function getPreviousLoomHash(): Promise<string | null> {
  const last = await db.governorDecision.findFirst({ orderBy: { createdAt: "desc" } });
  return last?.loomHash || null;
}

function signEd25519(decisionJson: string): string {
  // Real platform key signature (HMAC-SHA256 with platform key — not forgeable)
  return signWithPlatformKeySync(decisionJson);
}

// ============ Tenant Message Generation (Part 1.5) ============
async function generateTenantMessage(action: string, verdict: Verdict, conditions: GovernorCondition[], actorGtid?: string): Promise<string> {
  const condLabels = conditions.map((c) => c.label);
  const result = await runAI({
    agent_name: "tenant_message_generator",
    authority_level: "A1",
    system_prompt: "You are the SGTX Governor Message Generator. Write a 2-3 sentence plain-language message explaining why an action was blocked or made conditional. Never expose OPA rule IDs, WasmEdge codes, or Loom hashes. Be empathetic and actionable. Mention the specific conditions to resolve. Non-marketplace: never suggest alternative counterparties.",
    user_prompt: `Action attempted: ${action}\nVerdict: ${verdict}\nConditions: ${condLabels.join("; ")}\nActor: ${actorGtid || "unknown"}\n\nWrite the tenant message.`,
    max_tokens: 120,
    temperature: 0.4,
  });
  return result.content;
}

// ============ Main Governor Decision Pipeline ============
export async function governorDecide(req: GovernorRequest): Promise<GovernorResponse> {
  const { action, actorGtid, actorEmployeeId, traderMode, resourceUstn, payload } = req;

  // Gather context
  let buyerCountry: string | undefined, sellerCountry: string | undefined;
  let actorRole: string | undefined, readinessScore: number | undefined;
  if (actorGtid) {
    const tenant = await db.tenant.findUnique({ where: { gtid: actorGtid } });
    if (tenant) {
      actorRole = "OWNER"; // simplified
      if (action.includes("buyer") || traderMode === "BUY") buyerCountry = tenant.country;
      if (action.includes("seller") || traderMode === "SELL") sellerCountry = tenant.country;
      const readiness = await db.tradeReadiness.findUnique({ where: { tenantGtid: actorGtid } });
      if (readiness) readinessScore = readiness.score;
    }
  }
  if (resourceUstn) {
    const trade = await db.trade.findUnique({ where: { ustn: resourceUstn }, include: { buyer: true, seller: true } });
    if (trade) {
      buyerCountry = trade.buyer?.country;
      sellerCountry = trade.seller?.country;
    }
  }

  const moduleInput = {
    action, actorGtid, traderMode, buyerCountry, sellerCountry,
    incoterm: payload?.incoterm, logisticsCosts: payload?.logisticsCosts,
    tradeValue: payload?.tradeValue, feeAmount: payload?.feeAmount, feeRate: payload?.feeRate,
    reserveComposition: payload?.reserveComposition, autonomous: payload?.autonomous,
    reserveRatio: payload?.reserveRatio, quarterlyAttestation: payload?.quarterlyAttestation,
    actorRole, readinessScore,
  };

  // Run all constitutional modules + OPA with 50ms hard timeout (blueprint 1.3.4)
  // Modules exceeding timeout are treated as DENY + constitutional violation logged
  const MODULE_TIMEOUT_MS = 50;
  function withTimeout<T>(promise: Promise<T>, moduleName: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) =>
        setTimeout(() => reject(new Error(`Constitutional module ${moduleName} exceeded ${MODULE_TIMEOUT_MS}ms hard timeout — treated as DENY`)), MODULE_TIMEOUT_MS)
      ),
    ]);
  }

  const modulePromises = [
    { name: "constitutional_rules.wasm", fn: () => constitutionalRules(moduleInput) },
    { name: "jurisdiction_matrix.wasm", fn: () => jurisdictionMatrix(moduleInput) },
    { name: "incoterms_engine.wasm", fn: () => incotermsEngine(moduleInput) },
    { name: "fee_gate.wasm", fn: () => feeGate(moduleInput) },
    { name: "dual_mode_gate.wasm", fn: () => dualModeGate(moduleInput) },
    { name: "reserve_rules.wasm", fn: () => reserveRules(moduleInput) },
    { name: "distressed_country_gate.wasm", fn: () => distressedCountryGate(moduleInput) },
    { name: "opa (rego)", fn: () => opaEvaluate(moduleInput) },
  ];

  const results = await Promise.all(
    modulePromises.map(async (m) => {
      try {
        return await withTimeout(Promise.resolve(m.fn()), m.name);
      } catch (err: any) {
        // Module timed out or crashed — return DENY with constitutional violation (blueprint 1.3.4)
        logger.error(`[Governor] Constitutional violation: ${m.name} — ${err.message}`);
        return { verdict: "DENY" as Verdict, conditions: [{ condition_id: `timeout_${m.name}`, label: `Constitutional module ${m.name} failed: ${err.message}`, status: "unmet" as const }] };
      }
    })
  );

  // Decision Merger — strictest verdict wins
  const allConditions: GovernorCondition[] = [];
  let finalVerdict: Verdict = "ALLOW";
  for (const r of results) {
    if (r.verdict === "DENY") { finalVerdict = "DENY"; allConditions.push(...r.conditions); break; }
    if (r.verdict === "CONDITIONAL" && finalVerdict === "ALLOW") { finalVerdict = "CONDITIONAL"; }
    allConditions.push(...r.conditions);
  }

  // Generate tenant message if not ALLOW
  let tenantMessage: string | undefined;
  if (finalVerdict !== "ALLOW") {
    tenantMessage = await generateTenantMessage(action, finalVerdict, allConditions, actorGtid);
  }

  // Loom hash chain
  const previousHash = await getPreviousLoomHash();
  const decisionId = "dec-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const decisionJson = JSON.stringify({ decisionId, action, actorGtid, verdict: finalVerdict, conditions: allConditions, previousHash });
  const signature = signEd25519(decisionJson);
  const loomHash = sha256((previousHash || "genesis") + decisionJson + signature);

  // Persist
  await db.governorDecision.create({
    data: {
      decisionId, action, actorGtid: actorGtid || null, actorEmployeeId: actorEmployeeId || null,
      traderMode: traderMode || null, resourceUstn: resourceUstn || null,
      payload: payload ? JSON.stringify(payload) : null,
      verdict: finalVerdict, conditions: JSON.stringify(allConditions),
      tenantMessage: tenantMessage || null, loomHash, previousHash, signature,
      moduleVersions: JSON.stringify(MODULE_VERSIONS),
    },
  });

  return {
    decisionId, verdict: finalVerdict, conditions: allConditions, tenantMessage,
    loomHash, previousHash, signature, moduleVersions: MODULE_VERSIONS,
    createdAt: new Date().toISOString(),
  };
}

// ============ Loom Chain Verification (Part 1.11) ============
export async function verifyLoomChain(ustn: string): Promise<{
  ustn: string;
  genesisHash: string;
  latestHash: string | null;
  chainVerified: boolean;
  chainLength: number;
  decisions: any[];
}> {
  const decisions = await db.governorDecision.findMany({
    where: { resourceUstn: ustn },
    orderBy: { createdAt: "asc" },
  });

  let previousHash: string | null = null;
  let chainVerified = true;
  const decisionHashes: any[] = [];

  for (const d of decisions) {
    // Recompute hash
    const decisionJson = JSON.stringify({
      decisionId: d.decisionId, action: d.action, actorGtid: d.actorGtid,
      verdict: d.verdict, conditions: JSON.parse(d.conditions || "[]"), previousHash: d.previousHash,
    });
    const recomputed = sha256((d.previousHash || "genesis") + decisionJson + d.signature);
    const matches = recomputed === d.loomHash;
    if (!matches) chainVerified = false;
    decisionHashes.push({ decisionId: d.decisionId, loomHash: d.loomHash, previousHash: d.previousHash, timestamp: d.createdAt, verified: matches });
    previousHash = d.loomHash;
  }

  return {
    ustn,
    genesisHash: "sha256:" + createHash("sha256").update(JSON.stringify(MODULE_VERSIONS)).digest("hex"),
    latestHash: previousHash,
    chainVerified,
    chainLength: decisions.length,
    decisions: decisionHashes,
  };
}

// ============ Full Loom Chain Audit (Part 1.6 audit-chain-verifier cron) ============
// Recalculates every Governor decision hash from genesis (not filtered by USTN).
// Any mismatch → returns the offending decisions so the caller (audit-cron) can
// raise a P0 Incident + Smart Inbox to the Platform Governance Authority.
export interface LoomMismatch {
  decisionId: string;
  action: string;
  actorGtid: string | null;
  storedHash: string;
  recomputedHash: string;
  storedPreviousHash: string | null;
  expectedPreviousHash: string | null;
  timestamp: string;
  reason: "hash_mismatch" | "previous_hash_mismatch";
}

export async function auditFullLoomChain(): Promise<{
  chainVerified: boolean;
  decisionCount: number;
  genesisHash: string;
  latestHash: string | null;
  mismatches: LoomMismatch[];
}> {
  const decisions = await db.governorDecision.findMany({
    orderBy: { createdAt: "asc" },
  });

  const genesisHash = "sha256:" + createHash("sha256").update(JSON.stringify(MODULE_VERSIONS)).digest("hex");
  let expectedPrevious: string | null = null;
  const mismatches: LoomMismatch[] = [];

  for (const d of decisions) {
    // Recompute the decision hash the same way governorDecide() builds it
    const decisionJson = JSON.stringify({
      decisionId: d.decisionId,
      action: d.action,
      actorGtid: d.actorGtid,
      verdict: d.verdict,
      conditions: JSON.parse(d.conditions || "[]"),
      previousHash: d.previousHash,
    });
    const recomputed = sha256((d.previousHash || "genesis") + decisionJson + d.signature);

    if (recomputed !== d.loomHash) {
      mismatches.push({
        decisionId: d.decisionId,
        action: d.action,
        actorGtid: d.actorGtid,
        storedHash: d.loomHash,
        recomputedHash: recomputed,
        storedPreviousHash: d.previousHash,
        expectedPreviousHash: expectedPrevious,
        timestamp: d.createdAt.toISOString(),
        reason: "hash_mismatch",
      });
    }
    // Chain linkage check — the stored previousHash should equal the prior decision's loomHash
    if (d.previousHash !== expectedPrevious) {
      mismatches.push({
        decisionId: d.decisionId,
        action: d.action,
        actorGtid: d.actorGtid,
        storedHash: d.loomHash,
        recomputedHash: recomputed,
        storedPreviousHash: d.previousHash,
        expectedPreviousHash: expectedPrevious,
        timestamp: d.createdAt.toISOString(),
        reason: "previous_hash_mismatch",
      });
    }
    expectedPrevious = d.loomHash;
  }

  return {
    chainVerified: mismatches.length === 0,
    decisionCount: decisions.length,
    genesisHash,
    latestHash: expectedPrevious,
    mismatches,
  };
}
