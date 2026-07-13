// SGTX Brain OS — Shadow Model Pipeline
// =============================================================================
// The shadow pipeline runs a candidate model in parallel with the production
// model on a sampled fraction of live AI inferences. Outputs are compared
// and the agreement rate is tracked over a sliding window.
//
// The pipeline is purely observational — it never influences production
// outputs and never blocks the request path. A candidate model that
// consistently agrees (or disagrees) with production is surfaced via the
// event bus so the LearningLoop can promote, demote, or retrain it.
//
// Design notes:
//  - Sample rate is configurable (default 1/100 = every 100th inference).
//  - Comparison is pluggable: callers pass a `compare` predicate. The
//    default comparator does a structural equality check on a curated set
//    of "decision-relevant" fields (probability / riskLevel / verdict /
//    score / recommendation) — so cosmetic differences in free-text
//    reasoning don't count as disagreements.
//  - All state is in-memory and per-process. The metrics exported here are
//    scrape-friendly for the existing observability stack.
// ============================================================================

import type { BrainEvent } from "../core/types";
import { eventBus } from "../core/event-bus";

/** A single shadow-comparison record. */
export interface ShadowEvaluation {
  id: string;
  capability: string;
  correlationId?: string;
  production: ShadowModelOutput;
  candidate: ShadowModelOutput;
  agreed: boolean;
  latencyMs: number;
  evaluatedAt: string;
}

/** A normalised model output for comparison. The pipeline only looks at
 *  decision-relevant fields — anything else is treated as cosmetic. */
export interface ShadowModelOutput {
  provider: string;
  model: string;
  /** A compact "decision" view of the output. */
  decision: Record<string, unknown>;
  /** Raw output preserved for offline forensics. */
  raw?: unknown;
}

export interface ShadowPipelineStats {
  totalInferences: number;
  sampledEvaluations: number;
  agreements: number;
  disagreements: number;
  agreementRate: number; // agreements / sampledEvaluations
  sampleRate: number; // 1-in-N
  startedAt: string | null;
  active: boolean;
}

/** Compare two decisions on the canonical fields only. */
function defaultCompare(prod: Record<string, unknown>, cand: Record<string, unknown>): boolean {
  const keys = ["probability", "riskLevel", "verdict", "score", "recommendation", "tier", "allowed"];
  // If neither side exposes any of the canonical keys, fall back to
  // JSON-structural equality of the whole decision blob — guarantees we
  // still produce a meaningful agreement signal for non-AI capabilities.
  const prodHas = keys.filter((k) => prod[k] !== undefined);
  const candHas = keys.filter((k) => cand[k] !== undefined);
  if (prodHas.length === 0 && candHas.length === 0) {
    return JSON.stringify(prod) === JSON.stringify(cand);
  }
  for (const k of new Set([...prodHas, ...candHas])) {
    if (JSON.stringify(prod[k]) !== JSON.stringify(cand[k])) return false;
  }
  return true;
}

/**
 * Extract a normalised decision view from an arbitrary model output.
 * Falls back to the whole payload when no canonical field is present.
 */
function extractDecision(output: unknown): Record<string, unknown> {
  if (!output || typeof output !== "object") return { value: output };
  const o = output as Record<string, unknown>;
  const decision: Record<string, unknown> = {};
  for (const k of [
    "probability",
    "riskLevel",
    "verdict",
    "score",
    "recommendation",
    "tier",
    "allowed",
  ]) {
    if (o[k] !== undefined) decision[k] = o[k];
  }
  // Nested result wrappers (InferenceResult shape etc.) — peek one level deep.
  if (Object.keys(decision).length === 0) {
    for (const k of ["result", "output", "decision"]) {
      const inner = o[k];
      if (inner && typeof inner === "object") {
        const innerObj = inner as Record<string, unknown>;
        for (const kk of ["probability", "riskLevel", "verdict", "score", "recommendation", "tier", "allowed"]) {
          if (innerObj[kk] !== undefined) decision[kk] = innerObj[kk];
        }
      }
    }
  }
  return Object.keys(decision).length > 0 ? decision : { ...o };
}

export interface ShadowPipelineOptions {
  /** Sample 1-in-N inferences for shadow evaluation. */
  sampleRate?: number;
  /** Max evaluations kept in the sliding window. */
  maxEvaluations?: number;
  /** Custom comparator. Defaults to the canonical-field comparator. */
  compare?: (prod: Record<string, unknown>, cand: Record<string, unknown>) => boolean;
  /** Candidate model resolver — given (capability, input), returns the
   *  candidate model's output, or null to skip this sample. May be null
   *  when no candidate is registered yet (the pipeline still samples and
   *  increments totalInferences, but skips the comparison step). */
  candidateResolver?: ((capability: string, input: unknown) => Promise<ShadowModelOutput | null>) | null;
}

export class ShadowPipeline {
  private sampleRate: number;
  private maxEvaluations: number;
  private compare: (prod: Record<string, unknown>, cand: Record<string, unknown>) => boolean;
  private candidateResolver:
    | ((capability: string, input: unknown) => Promise<ShadowModelOutput | null>)
    | null;

  private totalInferences = 0;
  private sampledEvaluations = 0;
  private agreements = 0;
  private disagreements = 0;
  private evaluations: ShadowEvaluation[] = [];
  private startedAt: string | null = null;
  private active = false;

  // Per-capability agreement breakdown — surfaced via stats() for the
  // dashboard so an operator can see which capability the candidate is
  // struggling with.
  private perCapability = new Map<
    string,
    { sampled: number; agreements: number; disagreements: number }
  >();

  constructor(opts: ShadowPipelineOptions = {}) {
    this.sampleRate = Math.max(1, Math.floor(opts.sampleRate ?? 100));
    this.maxEvaluations = Math.max(10, Math.floor(opts.maxEvaluations ?? 1000));
    this.compare = opts.compare ?? defaultCompare;
    this.candidateResolver = opts.candidateResolver ?? null;
  }

  /** Activate the pipeline. Idempotent. */
  start(): void {
    if (this.active) return;
    this.active = true;
    this.startedAt = new Date().toISOString();
  }

  /** Deactivate. In-flight samples are still completed. */
  stop(): void {
    this.active = false;
  }

  isActive(): boolean {
    return this.active;
  }

  /**
   * Record one production inference and (if sampled) run the candidate in
   * parallel. Always non-blocking — the candidate runs in the background
   * and any error is swallowed.
   *
   * Returns true if this inference was sampled for shadow evaluation.
   */
  async observe(
    capability: string,
    input: unknown,
    productionOutput: unknown,
    correlationId?: string,
  ): Promise<boolean> {
    if (!this.active) return false;
    this.totalInferences++;
    if (this.totalInferences % this.sampleRate !== 0) return false;

    if (!this.candidateResolver) return false;
    const production: ShadowModelOutput = {
      provider: "production",
      model: "production",
      decision: extractDecision(productionOutput),
      raw: productionOutput,
    };

    const startMs = Date.now();
    let candidate: ShadowModelOutput | null = null;
    try {
      candidate = await this.candidateResolver(capability, input);
    } catch {
      // Candidate resolver failure → treat as a silent skip, not a
      // disagreement. The pipeline is observational.
      return true;
    }
    if (!candidate) return true;

    const agreed = this.compare(production.decision, candidate.decision);
    const eval_: ShadowEvaluation = {
      id: `shadow_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      capability,
      correlationId,
      production,
      candidate,
      agreed,
      latencyMs: Date.now() - startMs,
      evaluatedAt: new Date().toISOString(),
    };

    this.evaluations.push(eval_);
    if (this.evaluations.length > this.maxEvaluations) this.evaluations.shift();
    this.sampledEvaluations++;
    if (agreed) this.agreements++;
    else this.disagreements++;

    const cap = this.perCapability.get(capability) ?? {
      sampled: 0,
      agreements: 0,
      disagreements: 0,
    };
    cap.sampled++;
    if (agreed) cap.agreements++;
    else cap.disagreements++;
    this.perCapability.set(capability, cap);

    // Publish a shadow-evaluation event for downstream consumers
    // (dashboards, learning loop, alerting on sustained disagreement).
    const event: BrainEvent = {
      id: eval_.id,
      type: "brain.shadow.evaluation",
      aggregateId: capability,
      payload: {
        capability,
        agreed,
        agreementRate: this.getStats().agreementRate,
        sampled: this.sampledEvaluations,
        latencyMs: eval_.latencyMs,
      },
      metadata: {
        source: "shadow-pipeline",
        correlationId,
        timestamp: eval_.evaluatedAt,
      },
    };
    eventBus.publish("brain.shadow.evaluation", capability, event.payload, {
      source: "shadow-pipeline",
      correlationId,
    }).catch(() => {});

    return true;
  }

  getStats(): ShadowPipelineStats {
    const agreementRate =
      this.sampledEvaluations === 0
        ? 0
        : this.agreements / this.sampledEvaluations;
    return {
      totalInferences: this.totalInferences,
      sampledEvaluations: this.sampledEvaluations,
      agreements: this.agreements,
      disagreements: this.disagreements,
      agreementRate,
      sampleRate: this.sampleRate,
      startedAt: this.startedAt,
      active: this.active,
    };
  }

  /** Per-capability breakdown for the dashboard. */
  getPerCapabilityBreakdown(): Array<{
    capability: string;
    sampled: number;
    agreements: number;
    disagreements: number;
    agreementRate: number;
  }> {
    return Array.from(this.perCapability.entries()).map(([capability, v]) => ({
      capability,
      sampled: v.sampled,
      agreements: v.agreements,
      disagreements: v.disagreements,
      agreementRate: v.sampled === 0 ? 0 : v.agreements / v.sampled,
    }));
  }

  /** Recent evaluations for offline forensics. */
  getEvaluations(limit = 100): ShadowEvaluation[] {
    return this.evaluations.slice(-limit);
  }

  /** Reset all counters — used by tests. */
  reset(): void {
    this.totalInferences = 0;
    this.sampledEvaluations = 0;
    this.agreements = 0;
    this.disagreements = 0;
    this.evaluations = [];
    this.perCapability.clear();
    this.startedAt = this.active ? new Date().toISOString() : null;
  }

  /** Install (or replace) the candidate model resolver at runtime. */
  setCandidateResolver(
    resolver: (capability: string, input: unknown) => Promise<ShadowModelOutput | null>,
  ): void {
    this.candidateResolver = resolver;
  }

  /** Tune the sampling rate (1-in-N) at runtime. */
  setSampleRate(rate: number): void {
    this.sampleRate = Math.max(1, Math.floor(rate));
  }
}

/**
 * Default singleton pipeline. The LearningLoop activates this in start()
 * and wires a candidate resolver that delegates to the StaticFallbackAdapter
 * — a deterministic, always-available model that's a useful baseline for
 * agreement-rate telemetry (and a real candidate for the next promotion
 * cycle if its agreement rate is consistently high).
 *
 * NOTE: The candidate resolver returns null by default (no candidate model
 * registered). The LearningLoop installs a real candidate via
 * `shadowPipeline.setResolver(...)` once a candidate is registered. Until
 * then observe() still samples and increments totalInferences, but skips
 * the comparison step — agreement telemetry starts populating the moment a
 * candidate is wired.
 */
class DefaultShadowPipeline extends ShadowPipeline {
  /** Install (or replace) the candidate model resolver. */
  setResolver(
    resolver: (capability: string, input: unknown) => Promise<ShadowModelOutput | null>,
  ): void {
    this.setCandidateResolver(resolver);
  }
}

export const shadowPipeline = new DefaultShadowPipeline({
  sampleRate: 100,
  maxEvaluations: 1000,
  candidateResolver: null,
});
