// SGTX Brain OS — Knowledge Base
// Persistent learned knowledge (patterns, heuristics, feedback-derived rules).
// In-memory Map (Postgres/SQLite adapter ready). Entries are domain-keyed with confidence scores.

import { generateId, now } from "../core/utils";
import { feedbackLoop } from "./feedback-loop";

export interface KnowledgeEntry {
  id: string;
  domain: string;
  pattern: string;
  confidence: number; // [0, 1]
  source: string;
  createdAt: string;
  validatedAt?: string;
  sampleSize: number;
}

interface AddKnowledgeInput {
  domain: string;
  pattern: string;
  confidence: number;
  source: string;
}

interface ValidateAndPruneResult {
  validated: number;
  pruned: number;
}

// Domains the knowledge base recognises (loose — unknown domains still accepted but tagged)
const KNOWN_DOMAINS = [
  "trade-lane",
  "compliance",
  "pricing",
  "sanctions",
  "documentation",
  "fx",
  "logistics",
  "dispute",
  "force-majeure",
] as const;

// Confidence threshold below which an entry is pruned on validateAndPrune
const PRUNE_CONFIDENCE_THRESHOLD = 0.4;
// Minimum sample size to retain an entry; below this entries are flagged for re-validation
const MIN_SAMPLE_SIZE = 3;

class KnowledgeBaseImpl {
  private entries = new Map<string, KnowledgeEntry>();

  /** Add a new knowledge entry. Clamps confidence to [0, 1]. */
  async add(input: AddKnowledgeInput): Promise<KnowledgeEntry> {
    const entry: KnowledgeEntry = {
      id: generateId("kb"),
      domain: this.normalizeDomain(input.domain),
      pattern: input.pattern,
      confidence: Math.min(1, Math.max(0, input.confidence)),
      source: input.source,
      createdAt: now(),
      sampleSize: 1,
    };
    this.entries.set(entry.id, entry);
    return entry;
  }

  /** Query entries by domain, optionally filtered by minimum confidence. */
  query(domain: string, minConfidence: number = 0): KnowledgeEntry[] {
    const normalized = this.normalizeDomain(domain);
    return Array.from(this.entries.values())
      .filter(e => e.domain === normalized && e.confidence >= minConfidence)
      .sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Derive knowledge from accumulated feedback for a module.
   * Heuristic: groups feedback records by outcome bucket and emits confidence-weighted patterns.
   * e.g. "commodity X has Y% dispute rate on lane Z" derived from dispute events.
   */
  async deriveFromFeedback(moduleId: string): Promise<KnowledgeEntry[]> {
    const feedback = feedbackLoop.getFeedbackForModule(moduleId, 1000);
    if (feedback.length === 0) return [];

    const metrics = feedbackLoop.getAccuracyMetrics(moduleId);
    const successRate = metrics.accuracyRate;
    const failureRate = metrics.total > 0 ? metrics.failure / metrics.total : 0;

    const derived: KnowledgeEntry[] = [];

    // Pattern 1: Overall accuracy of the module
    if (metrics.total >= MIN_SAMPLE_SIZE) {
      const accuracyEntry = await this.add({
        domain: "trade-lane",
        pattern: `Module ${moduleId} accuracy ${(successRate * 100).toFixed(1)}% over ${metrics.total} decisions`,
        confidence: Math.min(1, successRate),
        source: `feedback-derivation:${moduleId}`,
      });
      // Override sample size post-creation
      accuracyEntry.sampleSize = metrics.total;
      derived.push(accuracyEntry);
    }

    // Pattern 2: Failure-rate derived risk heuristic
    if (metrics.failure >= MIN_SAMPLE_SIZE) {
      const failureEntry = await this.add({
        domain: "dispute",
        pattern: `Module ${moduleId} failure rate ${(failureRate * 100).toFixed(1)}% — flag for review when > 20%`,
        confidence: Math.min(1, failureRate),
        source: `feedback-derivation:${moduleId}`,
      });
      failureEntry.sampleSize = metrics.failure;
      derived.push(failureEntry);
    }

    // Pattern 3: Group failures by metadata-derived lane (origin→dest) if present
    const laneBuckets = new Map<string, { total: number; failed: number }>();
    for (const f of feedback) {
      const md = f.metadata || {};
      const lane = md.lane || md.originDestination || "unknown";
      const bucket = laneBuckets.get(lane) ?? { total: 0, failed: 0 };
      bucket.total += 1;
      if (f.actualOutcome === "failure") bucket.failed += 1;
      laneBuckets.set(lane, bucket);
    }
    for (const [lane, bucket] of laneBuckets) {
      if (bucket.total < MIN_SAMPLE_SIZE || lane === "unknown") continue;
      const laneFailureRate = bucket.failed / bucket.total;
      if (laneFailureRate > 0.2) {
        const laneEntry = await this.add({
          domain: "trade-lane",
          pattern: `Lane ${lane} has ${(laneFailureRate * 100).toFixed(1)}% dispute rate (${bucket.failed}/${bucket.total}) via module ${moduleId}`,
          confidence: Math.min(1, laneFailureRate + 0.2),
          source: `feedback-derivation:${moduleId}:lane`,
        });
        laneEntry.sampleSize = bucket.total;
        derived.push(laneEntry);
      }
    }

    return derived;
  }

  /**
   * Validate entries against new data; retire low-confidence entries.
   * Returns counts of validated and pruned entries.
   */
  async validateAndPrune(): Promise<ValidateAndPruneResult> {
    let validated = 0;
    let pruned = 0;

    for (const [id, entry] of this.entries) {
      // Re-validate against fresh feedback if the entry came from a module
      const moduleMatch = entry.source.match(/^feedback-derivation:(.+?)(?::|$)/);
      if (moduleMatch) {
        const moduleId = moduleMatch[1];
        const metrics = feedbackLoop.getAccuracyMetrics(moduleId);
        if (metrics.total > entry.sampleSize) {
          // New data has arrived — refresh confidence and sample size
          entry.confidence = Math.min(1, Math.max(0, metrics.accuracyRate));
          entry.sampleSize = metrics.total;
          entry.validatedAt = now();
          validated++;
          continue;
        }
      }

      // Prune entries below threshold (unless recently created)
      if (entry.confidence < PRUNE_CONFIDENCE_THRESHOLD) {
        this.entries.delete(id);
        pruned++;
        continue;
      }

      // Prune entries with insufficient sample size older than 7 days
      const ageDays = (Date.now() - new Date(entry.createdAt).getTime()) / (1000 * 60 * 60 * 24);
      if (entry.sampleSize < MIN_SAMPLE_SIZE && ageDays > 7) {
        this.entries.delete(id);
        pruned++;
        continue;
      }

      // Mark as validated (stale validation is still validation)
      if (!entry.validatedAt) {
        entry.validatedAt = now();
        validated++;
      }
    }

    return { validated, pruned };
  }

  /** Get a single entry by ID. */
  get(id: string): KnowledgeEntry | undefined {
    return this.entries.get(id);
  }

  /** Total entry count. */
  size(): number {
    return this.entries.size;
  }

  /** Reset (for testing). */
  reset(): void {
    this.entries.clear();
  }

  private normalizeDomain(domain: string): string {
    const lower = domain.toLowerCase();
    const known = (KNOWN_DOMAINS as readonly string[]).includes(lower);
    return known ? lower : `custom:${lower}`;
  }
}

export const knowledgeBase = new KnowledgeBaseImpl();
export { KnowledgeBaseImpl };
