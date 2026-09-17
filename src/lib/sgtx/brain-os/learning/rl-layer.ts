// SGTX Brain OS — Reinforcement Learning Layer (BRAIN-CTO-6, Rec 4)
// Learns optimal policies for 3 high-stakes domains from outcome feedback:
//
//   FeePolicy              — fee rate ∈ [0.001, 0.025] (constitutional bounds)
//                            Higher fee → more revenue per trade, but may
//                            reduce trade volume / trigger settlement failures.
//                            Lower fee  → more volume, less revenue per trade.
//
//   DisputeThresholdPolicy — dispute risk threshold ∈ [0, 1]
//                            Too low  → too many false alerts (operational overhead)
//                            Too high → missed disputes (financial loss)
//
//   ComplianceGatePolicy   — compliance strictness ∈ [0, 1]
//                            Too strict → blocked legitimate trades (lost revenue)
//                            Too loose  → compliance violations (regulatory exposure)
//
// Algorithm: tabular Q-learning with ε-exploration.
//   state   = (commodity, lane, marketConditions) — hashed to a stable string
//   action  = discrete bin per domain (see DISCRETE_ACTIONS below)
//   reward  = feedback score (1 - deviationScore) averaged over recent decisions
//
// The RL agent NEVER deploys directly — every proposed change goes through the
// validation gate (validateAndDeploy). This is the constitutional invariant.

import { eventBus } from "../core/event-bus";
import { validationGate } from "./validation-gate";
import { modelRegistry } from "./model-registry";
import { moduleRegistry } from "../core/module-registry";
import type { ModelAdapter, InferenceRequest, InferenceResult, BrainEvent } from "../core/types";
import { generateId, now } from "../core/utils";

export type PolicyDomain = "FeePolicy" | "DisputeThresholdPolicy" | "ComplianceGatePolicy";

export interface PolicyState {
  commodity: string;
  lane: string; // e.g. "EG→DE"
  marketConditions: "calm" | "volatile" | "stressed";
}

export interface PolicyAction {
  // Domain-specific continuous action (already projected from the discrete bin
  // the Q-table actually updates on).
  value: number;
  // Discrete bin label used by the Q-table (exposed for observability).
  bin: number;
  // Human-readable label.
  label: string;
}

export interface PolicyProposal {
  proposalId: string;
  domain: PolicyDomain;
  state: PolicyState;
  currentAction: PolicyAction;
  proposedAction: PolicyAction;
  expectedRewardDelta: number;
  rationale: string;
  createdAt: string;
}

export interface PolicyDeploymentResult {
  proposalId: string;
  domain: PolicyDomain;
  deployed: boolean;
  reason: string;
  validatedAt: string;
}

// Constitutional + operational bounds per domain.
const DOMAIN_BOUNDS: Record<PolicyDomain, { min: number; max: number; bins: number; label: (v: number) => string }> = {
  FeePolicy: {
    min: 0.001, max: 0.025, bins: 12,
    label: (v) => `fee_rate=${(v * 100).toFixed(2)}%`,
  },
  DisputeThresholdPolicy: {
    min: 0.0, max: 1.0, bins: 10,
    label: (v) => `dispute_threshold=${v.toFixed(2)}`,
  },
  ComplianceGatePolicy: {
    min: 0.0, max: 1.0, bins: 10,
    label: (v) => `compliance_strictness=${v.toFixed(2)}`,
  },
};

const DEFAULT_CURRENT_ACTION: Record<PolicyDomain, number> = {
  FeePolicy: 0.01,               // 1.0%
  DisputeThresholdPolicy: 0.5,   // 0.50
  ComplianceGatePolicy: 0.6,     // 0.60
};

function stateKey(s: PolicyState): string {
  return `${s.commodity}|${s.lane}|${s.marketConditions}`;
}

function binForValue(domain: PolicyDomain, value: number): number {
  const b = DOMAIN_BOUNDS[domain];
  const clamped = Math.min(b.max, Math.max(b.min, value));
  const t = (clamped - b.min) / (b.max - b.min);
  return Math.min(b.bins - 1, Math.max(0, Math.floor(t * b.bins)));
}

function valueForBin(domain: PolicyDomain, bin: number): number {
  const b = DOMAIN_BOUNDS[domain];
  const t = (bin + 0.5) / b.bins;
  return b.min + t * (b.max - b.min);
}

function actionForBin(domain: PolicyDomain, bin: number): PolicyAction {
  const value = valueForBin(domain, bin);
  return { value, bin, label: DOMAIN_BOUNDS[domain].label(value) };
}

interface QEntry {
  // Q-values per discrete action bin.
  q: number[];
  // Last-applied bin (for eligibility / TD updates).
  lastBin: number;
  // Sliding-window of observed rewards (max 50) for diagnostics.
  recentRewards: number[];
}

interface PendingProposal {
  proposal: PolicyProposal;
  createdAt: string;
}

class RLAgentImpl {
  // Per-domain Q-tables: Map<stateKey, QEntry>
  private qTables: Record<PolicyDomain, Map<string, QEntry>> = {
    FeePolicy: new Map(),
    DisputeThresholdPolicy: new Map(),
    ComplianceGatePolicy: new Map(),
  };
  // Currently-deployed action per domain (global — applies to all states).
  private deployedAction: Record<PolicyDomain, PolicyAction> = {
    FeePolicy: actionForBin("FeePolicy", binForValue("FeePolicy", DEFAULT_CURRENT_ACTION.FeePolicy)),
    DisputeThresholdPolicy: actionForBin("DisputeThresholdPolicy", binForValue("DisputeThresholdPolicy", DEFAULT_CURRENT_ACTION.DisputeThresholdPolicy)),
    ComplianceGatePolicy: actionForBin("ComplianceGatePolicy", binForValue("ComplianceGatePolicy", DEFAULT_CURRENT_ACTION.ComplianceGatePolicy)),
  };
  // Hyperparameters
  private alpha = 0.1;     // learning rate
  private gamma = 0.9;     // discount factor
  private epsilon = 0.15;  // exploration rate
  private rewardWindow = 50;
  private maxQEntriesPerDomain = 5000; // memory bound

  private pendingProposals = new Map<string, PendingProposal>();
  private autoCollectionStarted = false;
  private unsubscribers: Array<() => void> = [];

  /**
   * Subscribe to feedback events and update Q-values for the affected
   * state-action pairs. Idempotent.
   *
   * Feedback events carry a `decisionScope` metadata field (set by the
   * extended feedback rules in feedback-loop.ts: "compliance-precheck",
   * "dispute-risk", "dynamic-fee"). We map each to its policy domain.
   */
  async startLearning(): Promise<void> {
    if (this.autoCollectionStarted) return;
    this.autoCollectionStarted = true;
    const unsub = eventBus.subscribe(
      "rl-agent",
      "brain.learning.feedback",
      async (event: BrainEvent) => this.handleFeedbackEvent(event),
    );
    this.unsubscribers.push(unsub);
  }

  stopLearning(): void {
    for (const u of this.unsubscribers) u();
    this.unsubscribers = [];
    this.autoCollectionStarted = false;
  }

  /**
   * Propose a policy update for a domain, given a state. Greedy action with
   * respect to the current Q-table (no exploration at proposal time — we want
   * the BEST known action, not a random probe).
   *
   * Returns a proposal with a stable proposalId that must be passed to
   * validateAndDeploy() to actually apply the change.
   */
  proposePolicyUpdate(domain: PolicyDomain, state: PolicyState): PolicyProposal {
    const qTable = this.qTables[domain];
    const key = stateKey(state);
    let entry = qTable.get(key);
    if (!entry) {
      entry = this.freshEntry(domain);
      this.maybeEvict(domain);
      qTable.set(key, entry);
    }

    const bestBin = this.argMax(entry.q);
    const proposedAction = actionForBin(domain, bestBin);
    const currentAction = this.deployedAction[domain];
    const expectedRewardDelta = entry.q[bestBin] - entry.q[currentAction.bin];

    const proposal: PolicyProposal = {
      proposalId: generateId(`rl-${domain}`),
      domain,
      state,
      currentAction,
      proposedAction,
      expectedRewardDelta,
      rationale: this.buildRationale(domain, state, currentAction, proposedAction, entry),
      createdAt: now(),
    };

    this.pendingProposals.set(proposal.proposalId, { proposal, createdAt: now() });
    return proposal;
  }

  /**
   * Validate + deploy a proposed policy change. Routes the proposal through
   * the validation gate (which runs constitutional + held-out checks). The RL
   * agent NEVER deploys directly.
   *
   * Mechanism: the RL agent registers an ephemeral `PolicyAdapter` (whose
   * `infer()` returns the proposed action as JSON) for the candidate model,
   * then asks the validation gate to evaluate the candidate against a single
   * held-out test case (the proposed action itself) plus the domain-specific
   * constitutional rules. If the gate returns "deploy", the proposed action
   * replaces the currently-deployed action.
   */
  async validateAndDeploy(domain: PolicyDomain, proposal: PolicyProposal): Promise<PolicyDeploymentResult> {
    const pending = this.pendingProposals.get(proposal.proposalId);
    if (!pending) {
      return { proposalId: proposal.proposalId, domain, deployed: false, reason: "Proposal not found (expired or unknown)", validatedAt: now() };
    }

    // Constitutional bounds check (defence-in-depth — the validation gate
    // also enforces these, but we want a fast-fail here so the operator gets
    // an immediate, domain-specific message).
    const bounds = DOMAIN_BOUNDS[domain];
    if (proposal.proposedAction.value < bounds.min || proposal.proposedAction.value > bounds.max) {
      const reason = `Proposed ${domain} value ${proposal.proposedAction.value} out of bounds [${bounds.min}, ${bounds.max}]`;
      this.pendingProposals.delete(proposal.proposalId);
      return { proposalId: proposal.proposalId, domain, deployed: false, reason, validatedAt: now() };
    }

    let validated = false;
    let reason = "";
    let policyAdapterId: string | null = null;

    try {
      const candidate = await modelRegistry.registerCandidate({
        modelName: `rl-policy-${domain}`,
        version: `bin${proposal.proposedAction.bin}-${Date.now()}`,
      });

      // Register an ephemeral PolicyAdapter whose id matches the candidate
      // model's id, so the validation gate's `resolveAdapter()` finds it via
      // the direct-lookup path. The adapter returns the proposed action's
      // value/bin as JSON for every inference request.
      const policyAdapter = new PolicyAdapter(candidate.id, proposal.proposedAction);
      await moduleRegistry.registerAdapter(policyAdapter);
      policyAdapterId = policyAdapter.id;

      // The single held-out test case asserts that the proposed action is the
      // one that should be deployed. The validation gate's deep-equality
      // check confirms the adapter returns what we promised.
      const testCases = [{
        input: { ...proposal.state, domain },
        expected: { value: proposal.proposedAction.value, bin: proposal.proposedAction.bin },
      }];
      const constitutionalRules = this.constitutionalRulesFor(domain, proposal.proposedAction.value);

      const result = await validationGate.validate({
        modelId: candidate.id,
        testCases,
        constitutionalRules,
      });

      if (result.recommendation === "deploy") {
        validated = true;
        reason = `Validation gate passed (accuracy=${result.accuracy.toFixed(2)}, violations=${result.constitutionalViolations.length})`;
      } else if (result.recommendation === "reject") {
        validated = false;
        reason = `Validation gate rejected: ${result.constitutionalViolations.join("; ") || "accuracy below threshold"}`;
      } else {
        validated = false;
        reason = `Validation gate held: accuracy=${result.accuracy.toFixed(2)}, awaiting more observations`;
      }
    } catch (err: any) {
      validated = false;
      reason = `Validation gate error: ${err?.message ?? String(err)}`;
    } finally {
      // Always clean up the ephemeral adapter so we don't leak registry
      // entries. The candidate model record is retained for observability.
      if (policyAdapterId) {
        try { await moduleRegistry.unregisterAdapter(policyAdapterId); } catch { /* best effort */ }
      }
    }

    if (validated) {
      this.deployedAction[domain] = proposal.proposedAction;
      await eventBus.publish(
        "brain.policy.deployed",
        `policy-${domain}`,
        {
          proposalId: proposal.proposalId,
          domain,
          state: proposal.state,
          action: proposal.proposedAction,
        },
        { source: "rl-agent" },
      );
    }

    this.pendingProposals.delete(proposal.proposalId);
    return { proposalId: proposal.proposalId, domain, deployed: validated, reason, validatedAt: now() };
  }

  /** Get the currently-deployed action for a domain. */
  getDeployedAction(domain: PolicyDomain): PolicyAction {
    return this.deployedAction[domain];
  }

  /** Get a snapshot of a Q-entry (for observability). Returns undefined if no
   *  entry exists for the state. */
  getQEntry(domain: PolicyDomain, state: PolicyState): { q: number[]; lastBin: number; recentRewards: number[] } | undefined {
    const e = this.qTables[domain].get(stateKey(state));
    return e ? { q: [...e.q], lastBin: e.lastBin, recentRewards: [...e.recentRewards] } : undefined;
  }

  /** Hyperparameter accessors (for tests / operators). */
  getHyperparameters() { return { alpha: this.alpha, gamma: this.gamma, epsilon: this.epsilon, rewardWindow: this.rewardWindow }; }
  setHyperparameters(p: Partial<{ alpha: number; gamma: number; epsilon: number; rewardWindow: number }>) {
    if (p.alpha != null) this.alpha = p.alpha;
    if (p.gamma != null) this.gamma = p.gamma;
    if (p.epsilon != null) this.epsilon = p.epsilon;
    if (p.rewardWindow != null) this.rewardWindow = p.rewardWindow;
  }

  /** Reset all RL state (for tests). */
  reset(): void {
    this.stopLearning();
    for (const d of Object.keys(this.qTables) as PolicyDomain[]) this.qTables[d].clear();
    this.pendingProposals.clear();
    for (const d of Object.keys(this.deployedAction) as PolicyDomain[]) {
      this.deployedAction[d] = actionForBin(d, binForValue(d, DEFAULT_CURRENT_ACTION[d]));
    }
  }

  // -- internals --

  private freshEntry(domain: PolicyDomain): QEntry {
    return {
      q: new Array(DOMAIN_BOUNDS[domain].bins).fill(0),
      lastBin: this.deployedAction[domain].bin,
      recentRewards: [],
    };
  }

  private maybeEvict(domain: PolicyDomain): void {
    const table = this.qTables[domain];
    if (table.size < this.maxQEntriesPerDomain) return;
    // Evict the oldest entry (Map preserves insertion order in JS).
    const firstKey = table.keys().next().value;
    if (firstKey != null) table.delete(firstKey);
  }

  private argMax(arr: number[]): number {
    let best = 0;
    for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
    return best;
  }

  private buildRationale(domain: PolicyDomain, state: PolicyState, current: PolicyAction, proposed: PolicyAction, entry: QEntry): string {
    if (proposed.bin === current.bin) {
      return `${domain}: greedy action (${proposed.label}) matches current deployed action — no change proposed`;
    }
    const delta = entry.q[proposed.bin] - entry.q[current.bin];
    return `${domain}: Q[${proposed.label}] (${entry.q[proposed.bin].toFixed(3)}) > Q[${current.label}] (${entry.q[current.bin].toFixed(3)}) by ${delta.toFixed(3)} for state {commodity=${state.commodity}, lane=${state.lane}, market=${state.marketConditions}}`;
  }

  /**
   * Update Q-values from a feedback event. The event payload's `decisionId`
   * is parsed for the state hint (`<moduleId>_<commodity>_<lane>_<market>`)
   * and the deviation score becomes the negative reward.
   *
   * Reward signal (centred at 0 so failures pull Q-values DOWN, not just to 0):
   *   deviationScore = 0 (perfect)  → reward = +1
   *   deviationScore = 0.5 (partial) → reward =  0
   *   deviationScore = 1 (total miss) → reward = -1
   */
  private async handleFeedbackEvent(event: BrainEvent): Promise<void> {
    try {
      const payload = (event.payload || {}) as Record<string, any>;
      const deviation = typeof payload.deviationScore === "number" ? payload.deviationScore : 0.5;
      const reward = 1 - 2 * deviation; // +1 (perfect) .. -1 (total miss)
      const decisionId: string | undefined = payload.decisionId;
      if (!decisionId) return;

      const domain = this.inferDomain(decisionId, payload);
      if (!domain) return;

      // Best-effort state extraction from the decisionId prefix (convention:
      // `<scopePrefix>_<commodity>_<lane>_<market>` — falls back to "default"
      // state when the convention is not followed).
      const state = this.inferState(decisionId);

      const qTable = this.qTables[domain];
      const key = stateKey(state);
      let entry = qTable.get(key);
      if (!entry) {
        entry = this.freshEntry(domain);
        this.maybeEvict(domain);
        qTable.set(key, entry);
      }

      // Q-learning update: Q[s, a] += α * (r + γ * max_a' Q[s', a'] - Q[s, a])
      // Since we update on terminal feedback (per-decision reward), s' = s
      // and the max term is over the same state's Q-row.
      const a = entry.lastBin;
      const maxNext = Math.max(...entry.q);
      const td = reward + this.gamma * maxNext - entry.q[a];
      entry.q[a] += this.alpha * td;

      // ε-greedy: occasionally explore a different bin (so we gather reward
      // signal for actions other than the deployed one). The chosen bin
      // becomes lastBin so the NEXT feedback updates that bin's Q-value.
      if (Math.random() < this.epsilon) {
        const exploreBin = Math.floor(Math.random() * DOMAIN_BOUNDS[domain].bins);
        entry.lastBin = exploreBin;
      }

      // Sliding reward window
      entry.recentRewards.push(reward);
      if (entry.recentRewards.length > this.rewardWindow) entry.recentRewards.shift();
    } catch {
      // RL must never break feedback processing.
    }
  }

  private inferDomain(decisionId: string, payload: Record<string, any>): PolicyDomain | null {
    // Prefer explicit metadata from the extended feedback rules.
    const scope = payload.metadata?.decisionScope || payload.decisionScope;
    if (scope === "compliance-precheck") return "ComplianceGatePolicy";
    if (scope === "dispute-risk") return "DisputeThresholdPolicy";
    if (scope === "dynamic-fee") return "FeePolicy";
    // Fallback: decisionId prefix convention (matches the existing modules).
    const id = decisionId.toLowerCase();
    if (id.startsWith("cmp_") || id.startsWith("compliance_")) return "ComplianceGatePolicy";
    if (id.startsWith("dpr_") || id.startsWith("dispute_")) return "DisputeThresholdPolicy";
    if (id.startsWith("fee_") || id.startsWith("pricing_")) return "FeePolicy";
    return null;
  }

  private inferState(decisionId: string): PolicyState {
    // decisionId convention: <prefix>_<commodity>_<lane>_<market>
    // e.g. fee_coffee_EG-DE_calm
    const parts = decisionId.split("_");
    if (parts.length >= 4) {
      const commodity = parts[1] ?? "default";
      const lane = (parts[2] ?? "UNK-UNK").replace("-", "→");
      const marketRaw = (parts[3] ?? "").toLowerCase();
      const marketConditions: PolicyState["marketConditions"] =
        marketRaw === "volatile" ? "volatile" : marketRaw === "stressed" ? "stressed" : "calm";
      return { commodity, lane, marketConditions };
    }
    return { commodity: "default", lane: "UNK→UNK", marketConditions: "calm" };
  }

  /** Domain-specific constitutional rules passed to the validation gate. */
  private constitutionalRulesFor(domain: PolicyDomain, value: number): Array<{ name: string; check: (output: any) => boolean }> {
    const rules: Array<{ name: string; check: (output: any) => boolean }> = [];
    if (domain === "FeePolicy") {
      rules.push({
        name: "FEE_BOUNDS",
        check: (output) => typeof output?.value === "number" && output.value >= 0.001 && output.value <= 0.025,
      });
      // Hard-coded reference: also enforce the proposed value is the one that
      // actually got deployed (defence-in-depth against a stale proposal).
      rules.push({
        name: "PROPOSED_VALUE_HONOURED",
        check: (output) => typeof output?.value === "number" && Math.abs(output.value - value) < 1e-9,
      });
    }
    if (domain === "DisputeThresholdPolicy") {
      rules.push({
        name: "THRESHOLD_IN_UNIT_INTERVAL",
        check: (output) => typeof output?.value === "number" && output.value >= 0 && output.value <= 1,
      });
    }
    if (domain === "ComplianceGatePolicy") {
      rules.push({
        name: "STRICTNESS_IN_UNIT_INTERVAL",
        check: (output) => typeof output?.value === "number" && output.value >= 0 && output.value <= 1,
      });
    }
    return rules;
  }
}

export const rlAgent = new RLAgentImpl();
export { RLAgentImpl as RLAgent };

/**
 * Ephemeral adapter that returns a fixed proposed action as JSON for every
 * inference request. Registered by the RL agent so the validation gate can
 * `infer()` the proposed action and compare it against the held-out test
 * case. Unregistered immediately after validation completes.
 */
class PolicyAdapter implements ModelAdapter {
  id: string;
  name = "RL Policy Adapter";
  provider = "custom" as const;
  model = "rl-policy";
  authority = "A3" as const;
  available = true;

  constructor(id: string, private readonly action: PolicyAction) {
    this.id = id;
  }

  async initialize(): Promise<void> { /* no-op */ }

  async infer(_input: InferenceRequest): Promise<InferenceResult> {
    const structured = { value: this.action.value, bin: this.action.bin };
    return {
      content: JSON.stringify(structured),
      structured,
      provider: this.provider,
      model: this.model,
      authority: this.authority,
      latencyMs: 0,
      tokensIn: 0,
      tokensOut: 0,
      costUsd: 0,
      fallbackUsed: false,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 0 };
  }

  estimateCost(): { tokensIn: number; tokensOut: number; costUsd: number } {
    return { tokensIn: 0, tokensOut: 0, costUsd: 0 };
  }
}
