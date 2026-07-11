// SGTX Brain OS — Model Adapters
// =============================================================================
// Pluggable inference adapters used by the ProviderRouter.
//
// Each adapter exposes a uniform contract so the Brain can route inference
// requests to the best available provider without callers knowing the
// underlying SDK / HTTP / rule-engine details.
//
// Adapter chain (highest authority first):
//   1. ZAIAdapter        — z-ai-web-dev-sdk (glm-4-plus). Primary cloud model.
//   2. LocalAdapter      — Ollama localhost:11434. Sovereign / air-gapped inference.
//   3. StaticFallbackAdapter — deterministic rule-based fallback. Always available.
//
// All adapters are lazy-initialised so importing this module is side-effect free.
// =============================================================================

import type { InferenceRequest, InferenceResult, AuthorityLevel } from "../core/types";

/** Uniform contract every model adapter implements. */
export interface ModelAdapter {
  /** Stable adapter identifier (e.g. "zai", "local", "static"). */
  readonly id: string;
  /** Human-readable adapter name. */
  readonly name: string;
  /** Underlying provider family. */
  readonly provider: string;
  /** Default model identifier this adapter targets. */
  readonly model: string;
  /** Authority level this adapter may serve. */
  readonly authority: AuthorityLevel;
  /** True once initialize() has succeeded and healthCheck() last passed. */
  available: boolean;
  /** Perform any expensive setup (SDK bootstrap, connection probe). */
  initialize(): Promise<void>;
  /** Run an inference request. Throws on failure. */
  infer(input: InferenceRequest): Promise<InferenceResult>;
  /** Lightweight liveness probe. */
  healthCheck(): Promise<{ healthy: boolean; latencyMs: number }>;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// 1. ZAI Adapter (primary)
// ---------------------------------------------------------------------------

/**
 * ZAIAdapter — wraps z-ai-web-dev-sdk (GLM-4 family).
 *
 * The SDK is loaded lazily via dynamic import so this module can be imported
 * in environments where the SDK is not installed (e.g. tests) without
 * throwing at import time.
 */
export class ZAIAdapter implements ModelAdapter {
  readonly id = "zai";
  readonly name = "ZAI GLM-4 Adapter";
  readonly provider = "zai";
  readonly model = "glm-4-plus";
  readonly authority: AuthorityLevel = "A3";
  available = false;

  private zaiInstance: any = null;
  private lastHealthAt = 0;
  private readonly healthTtlMs = 15_000;

  async initialize(): Promise<void> {
    if (this.zaiInstance) {
      this.available = true;
      return;
    }
    try {
      const ZAI = (await import("z-ai-web-dev-sdk")).default;
      this.zaiInstance = await ZAI.create();
      this.available = true;
      this.lastHealthAt = Date.now();
    } catch (err) {
      this.available = false;
      throw new Error(`ZAIAdapter initialize failed: ${(err as Error).message}`);
    }
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    if (!this.zaiInstance) await this.initialize();
    const start = Date.now();
    const completion = await this.zaiInstance.chat.completions.create({
      messages: [
        { role: "system", content: input.systemPrompt },
        { role: "user", content: input.userPrompt },
      ],
      thinking: { type: "disabled" },
      max_tokens: input.maxTokens ?? 400,
      temperature: 0.4,
    });
    const latencyMs = Date.now() - start;
    const content = completion?.choices?.[0]?.message?.content || "";
    if (!content) throw new Error("ZAIAdapter: empty completion content");
    this.lastHealthAt = Date.now();
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs,
      costUsd: estimateZaiCostUsd(content, input.maxTokens ?? 400),
      fallbackUsed: false,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    // Cache positive health for a short window to avoid hammering the SDK.
    if (this.available && Date.now() - this.lastHealthAt < this.healthTtlMs) {
      return { healthy: true, latencyMs: 0 };
    }
    try {
      if (!this.zaiInstance) await this.initialize();
      const start = Date.now();
      // Minimal inference to confirm the SDK is responsive.
      const probe = await this.zaiInstance.chat.completions.create({
        messages: [{ role: "user", content: "ping" }],
        thinking: { type: "disabled" },
        max_tokens: 1,
      });
      const latencyMs = Date.now() - start;
      const healthy = Boolean(probe?.choices?.length);
      this.available = healthy;
      this.lastHealthAt = Date.now();
      return { healthy, latencyMs };
    } catch {
      this.available = false;
      return { healthy: false, latencyMs: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// 2. Local Adapter (Ollama)
// ---------------------------------------------------------------------------

/**
 * LocalAdapter — talks to a local Ollama server (default http://localhost:11434).
 *
 * This is a stub-grade adapter: it performs a real /api/chat probe during
 * initialize() and healthCheck(), but inference itself is only attempted when
 * the server is reachable. When unavailable, infer() throws so the
 * ProviderRouter can fall through to the next adapter.
 *
 * Note: AuthorityLevel A2 is represented by the literal `"2"` in core/types
 * (a pre-existing quirk). We hold it in a typed constant for readability.
 */
const A2_AUTHORITY: AuthorityLevel = "2";

export class LocalAdapter implements ModelAdapter {
  readonly id = "local";
  readonly name = "Ollama Local Adapter";
  readonly provider = "ollama";
  readonly model: string;
  readonly authority: AuthorityLevel = A2_AUTHORITY;
  available = false;

  private readonly baseUrl: string;
  private lastHealthAt = 0;
  private readonly healthTtlMs = 10_000;

  constructor(opts: { baseUrl?: string; model?: string } = {}) {
    this.baseUrl = (opts.baseUrl ?? process.env.OLLAMA_BASE_URL ?? "http://localhost:11434").replace(/\/$/, "");
    this.model = opts.model ?? process.env.OLLAMA_MODEL ?? "llama3.1:8b";
  }

  async initialize(): Promise<void> {
    const probe = await this.healthCheck();
    this.available = probe.healthy;
    if (!probe.healthy) {
      throw new Error(`LocalAdapter: Ollama not reachable at ${this.baseUrl}`);
    }
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    if (!this.available) await this.initialize();
    const start = Date.now();
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        options: { num_predict: input.maxTokens ?? 400, temperature: 0.4 },
      }),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      this.available = false;
      throw new Error(`LocalAdapter infer ${res.status}: ${await res.text().catch(() => "")}`);
    }
    const data = (await res.json()) as { message?: { content?: string } };
    const content = data?.message?.content ?? "";
    if (!content) throw new Error("LocalAdapter: empty completion content");
    this.lastHealthAt = Date.now();
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs,
      costUsd: 0, // local inference has no per-call USD cost
      fallbackUsed: false,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (this.available && Date.now() - this.lastHealthAt < this.healthTtlMs) {
      return { healthy: true, latencyMs: 0 };
    }
    const start = Date.now();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 1500);
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);
      const latencyMs = Date.now() - start;
      const healthy = res.ok;
      this.available = healthy;
      if (healthy) this.lastHealthAt = Date.now();
      return { healthy, latencyMs };
    } catch {
      this.available = false;
      return { healthy: false, latencyMs: Date.now() - start };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Static Fallback Adapter
// ---------------------------------------------------------------------------

interface FallbackRule {
  match: RegExp | ((input: InferenceRequest) => boolean);
  response: string | ((input: InferenceRequest) => string);
}

/**
 * StaticFallbackAdapter — deterministic rule-based fallback.
 *
 * Always available. Produces a conservative, audit-friendly response when no
 * real model is reachable. The rule table below mirrors the static fallbacks
 * used elsewhere in the platform (see src/lib/sgtx/ai/orchestrator.ts).
 */
export class StaticFallbackAdapter implements ModelAdapter {
  readonly id = "static";
  readonly name = "Static Rule-Based Fallback";
  readonly provider = "static";
  readonly model = "rules-v1";
  readonly authority: AuthorityLevel = "A1";
  available = true;

  private readonly rules: FallbackRule[] = [
    { match: /inbox|summary/i, response: "Pending actions require attention. Please review the Smart Inbox for high-priority items. (Static fallback.)" },
    { match: /dispute|root-?cause/i, response: "Root-cause analysis unavailable. Manual review recommended. (Static fallback.)" },
    { match: /clause|contract/i, response: "Standard contract clause generation unavailable. Please use the template provided. (Static fallback.)" },
    { match: /price|market/i, response: "Market price advisory unavailable. Please consult public commodity indices. (Static fallback.)" },
    { match: /compliance|governor|prescreen/i, response: "Automated pre-screen unavailable. Manual compliance review required. (Static fallback.)" },
    { match: /load|pack/i, response: "1. Inspect container condition. 2. Load pallets evenly. 3. Secure with straps. 4. Verify seal. 5. Record milestone. (Static fallback.)" },
  ];

  async initialize(): Promise<void> {
    this.available = true;
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    const start = Date.now();
    const content = this.matchRule(input);
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs: Date.now() - start,
      costUsd: 0,
      fallbackUsed: true,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    return { healthy: true, latencyMs: 0 };
  }

  private matchRule(input: InferenceRequest): string {
    const haystack = `${input.systemPrompt}\n${input.userPrompt}`;
    for (const rule of this.rules) {
      const matched = rule.match instanceof RegExp
        ? rule.match.test(haystack)
        : rule.match(input);
      if (matched) {
        return typeof rule.response === "function" ? rule.response(input) : rule.response;
      }
    }
    return "AI advisory unavailable. The Brain is operating in degraded mode — please contact support if this persists.";
  }
}

// ---------------------------------------------------------------------------
// Cost estimation
// ---------------------------------------------------------------------------

/**
 * Rough USD cost estimate for a ZAI call. Pricing is intentionally conservative
 * (upper-bound) so cost telemetry never under-reports.
 *
 * GLM-4-plus published pricing ≈ $0.01 / 1K output tokens (worst-case band).
 */
function estimateZaiCostUsd(output: string, maxTokens: number): number {
  const outputTokens = Math.min(maxTokens, Math.ceil(output.length / 4));
  return Number(((outputTokens / 1000) * 0.01).toFixed(6));
}

// ---------------------------------------------------------------------------
// Adapter singletons
// ---------------------------------------------------------------------------

export const zaiAdapter = new ZAIAdapter();
export const localAdapter = new LocalAdapter();
export const staticFallbackAdapter = new StaticFallbackAdapter();

/** All adapters in priority order (primary first). */
export const allAdapters: ModelAdapter[] = [zaiAdapter, localAdapter, staticFallbackAdapter];

// Re-export small helpers for sibling modules.
export { newId, nowIso };
