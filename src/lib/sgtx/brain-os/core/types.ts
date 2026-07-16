// SGTX Brain OS — Core Types
// The intelligence operating system that orchestrates the entire SGTX platform.
// Every feature, add-on, and compliance module is controlled by the Brain.

export type AuthorityLevel = "A0" | "A1" | "A2" | "A3" | "A4" | "A5";
export type ConstitutionalVerdict = "ALLOW" | "CONDITIONAL" | "DENY";

export interface BrainEvent<T = any> {
  id: string;
  type: string;
  aggregateId: string;
  payload: T;
  metadata: {
    source: string;
    correlationId?: string;
    causationId?: string;
    timestamp: string;
    tenantGtid?: string;
  };
}

export type EventHandler<T = any> = (event: BrainEvent<T>) => Promise<void> | void;

export interface BrainModule {
  id: string;
  name: string;
  version: string;
  type: "capability" | "learning" | "infrastructure";
  authority: AuthorityLevel;
  description: string;
  capabilities: string[];
  subscriptions?: string[];
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
  healthCheck?(): Promise<{ healthy: boolean; latencyMs: number }>;
  invoke?(capability: string, input: any): Promise<any>;
}

export interface InferenceRequest {
  systemPrompt: string;
  userPrompt: string;
  authority: AuthorityLevel;
  maxTokens?: number;
  correlationId?: string;
  /**
   * Opt-out flag for the provider router's web fallback step. When `false`
   * (explicit), the router will NOT consult the web after every model adapter
   * fails. Defaults to `true` — web fallback is enabled unless the caller
   * explicitly disables it.
   */
  fallbackToWeb?: boolean;
  /**
   * Skip flag honoured by the Brain orchestrator's invoke() web-fallback
   * wrapper. When `true`, the orchestrator will NOT attempt a web search
   * after the module invocation throws. Independent of `fallbackToWeb`
   * (which is router-level) so callers can disable one without the other.
   */
  skipWebFallback?: boolean;
}

export interface InferenceResult {
  content: string;
  provider: string;
  model: string;
  latencyMs: number;
  costUsd: number;
  fallbackUsed: boolean;
  correlationId?: string;
}

export interface LearningFeedback {
  id: string;
  decisionId: string;
  actualOutcome: "success" | "failure" | "partial";
  outcomeDetails: string;
  expectedOutcome: string;
  deviationScore: number;
  feedbackSource: "system" | "human" | "outcome-monitor";
  createdAt: string;
}

export interface ModelVersion {
  id: string;
  modelName: string;
  version: string;
  stage: "candidate" | "shadow" | "canary" | "production" | "deprecated";
  accuracy: number;
  sampleSize: number;
  validatedAt?: string;
}

export interface KnowledgeEntry {
  id: string;
  domain: string;
  pattern: string;
  confidence: number;
  source: string;
  sampleSize: number;
  createdAt: string;
}
