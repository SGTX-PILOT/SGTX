// SGTX Brain OS — Model Adapters
// =============================================================================
// Pluggable inference adapters used by the ProviderRouter.
//
// Each adapter exposes a uniform contract so the Brain can route inference
// requests to the best available provider without callers knowing the
// underlying SDK / HTTP / rule-engine details.
//
// Adapter chain (highest authority first):
//   1. GeminiAdapter      — Google Gemini (generativelanguage.googleapis.com).
//                           Primary cloud model (GEMINI_API_KEY).
//   2. OpenAIAdapter      — OpenAI GPT-4 secondary (OPENAI_API_KEY).
//   3. GroqAdapter        — Groq Llama fast inference (GROQ_API_KEY).
//   4. StaticFallbackAdapter — deterministic rule-based fallback. Always available.
//
// All adapters are lazy-initialised so importing this module is side-effect free.
//
// CRITICAL: This module MUST NEVER import `z-ai-web-dev-sdk`. The previous
// ZAIAdapter (GLM-4-Plus via the z-ai SDK) has been retired platform-wide.
// =============================================================================

import type { InferenceRequest, InferenceResult, AuthorityLevel } from "../core/types";

/** Uniform contract every model adapter implements. */
export interface ModelAdapter {
  /** Stable adapter identifier (e.g. "gemini", "openai", "groq", "static"). */
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

const ADAPTER_TIMEOUT_MS = 30_000;

/** fetch wrapper with an AbortController-based timeout. */
async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = ADAPTER_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// 1. Gemini Adapter (primary)
// ---------------------------------------------------------------------------

/**
 * GeminiAdapter — talks to Google Gemini's v1beta generateContent endpoint.
 *
 * Uses the API key from GEMINI_API_KEY (query-string auth, per Google's
 * convention). The adapter is lazy: initialize() only confirms that the API
 * key is configured. The first infer() call hits the network.
 */
export class GeminiAdapter implements ModelAdapter {
  readonly id = "gemini";
  readonly name = "Google Gemini Adapter";
  readonly provider = "gemini";
  readonly model: string;
  readonly authority: AuthorityLevel = "A3";
  available = false;

  private lastHealthAt = 0;
  private readonly healthTtlMs = 15_000;

  constructor(opts: { model?: string } = {}) {
    this.model = opts.model ?? process.env.GEMINI_MODEL ?? "gemini-pro";
  }

  async initialize(): Promise<void> {
    if (!process.env.GEMINI_API_KEY) {
      this.available = false;
      throw new Error("GeminiAdapter initialize failed: GEMINI_API_KEY not configured");
    }
    this.available = true;
    this.lastHealthAt = Date.now();
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      this.available = false;
      throw new Error("GeminiAdapter: GEMINI_API_KEY not configured");
    }
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
    const start = Date.now();
    const body = {
      system_instruction: { parts: [{ text: input.systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: input.userPrompt }] }],
      generationConfig: {
        maxOutputTokens: input.maxTokens ?? 400,
        temperature: 0.4,
      },
    };
    const res = await fetchWithTimeout(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      this.available = false;
      throw new Error(`GeminiAdapter infer ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    const content = data.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("").trim() || "";
    if (!content) throw new Error("GeminiAdapter: empty completion content");
    this.lastHealthAt = Date.now();
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs,
      costUsd: estimateGeminiCostUsd(content, input.maxTokens ?? 400),
      fallbackUsed: false,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (this.available && Date.now() - this.lastHealthAt < this.healthTtlMs) {
      return { healthy: true, latencyMs: 0 };
    }
    try {
      if (!process.env.GEMINI_API_KEY) {
        this.available = false;
        return { healthy: false, latencyMs: 0 };
      }
      // Minimal probe — generateContent with a 1-token cap.
      const apiKey = process.env.GEMINI_API_KEY;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${apiKey}`;
      const start = Date.now();
      const res = await fetchWithTimeout(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: "ping" }] }],
          generationConfig: { maxOutputTokens: 1 },
        }),
      }, 5_000);
      const latencyMs = Date.now() - start;
      const healthy = res.ok;
      this.available = healthy;
      if (healthy) this.lastHealthAt = Date.now();
      return { healthy, latencyMs };
    } catch {
      this.available = false;
      return { healthy: false, latencyMs: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// 2. OpenAI Adapter (secondary)
// ---------------------------------------------------------------------------

/**
 * OpenAIAdapter — talks to OpenAI's /v1/chat/completions endpoint.
 *
 * Secondary cloud model used when Gemini is unavailable. Uses
 * OPENAI_API_KEY with Bearer auth.
 */
export class OpenAIAdapter implements ModelAdapter {
  readonly id = "openai";
  readonly name = "OpenAI GPT-4 Adapter";
  readonly provider = "openai";
  readonly model: string;
  readonly authority: AuthorityLevel = "A3";
  available = false;

  private lastHealthAt = 0;
  private readonly healthTtlMs = 15_000;

  constructor(opts: { model?: string } = {}) {
    this.model = opts.model ?? process.env.OPENAI_MODEL ?? "gpt-4";
  }

  async initialize(): Promise<void> {
    if (!process.env.OPENAI_API_KEY) {
      this.available = false;
      throw new Error("OpenAIAdapter initialize failed: OPENAI_API_KEY not configured");
    }
    this.available = true;
    this.lastHealthAt = Date.now();
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      this.available = false;
      throw new Error("OpenAIAdapter: OPENAI_API_KEY not configured");
    }
    const start = Date.now();
    const res = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        max_tokens: input.maxTokens ?? 400,
        temperature: 0.4,
      }),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      this.available = false;
      throw new Error(`OpenAIAdapter infer ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("OpenAIAdapter: empty completion content");
    this.lastHealthAt = Date.now();
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs,
      costUsd: estimateOpenAiCostUsd(content, input.maxTokens ?? 400),
      fallbackUsed: false,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (this.available && Date.now() - this.lastHealthAt < this.healthTtlMs) {
      return { healthy: true, latencyMs: 0 };
    }
    try {
      if (!process.env.OPENAI_API_KEY) {
        this.available = false;
        return { healthy: false, latencyMs: 0 };
      }
      // List models endpoint — cheap liveness probe that doesn't burn tokens.
      const start = Date.now();
      const res = await fetchWithTimeout("https://api.openai.com/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      }, 5_000);
      const latencyMs = Date.now() - start;
      const healthy = res.ok;
      this.available = healthy;
      if (healthy) this.lastHealthAt = Date.now();
      return { healthy, latencyMs };
    } catch {
      this.available = false;
      return { healthy: false, latencyMs: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// 3. Groq Adapter (fast inference)
// ---------------------------------------------------------------------------

/**
 * GroqAdapter — talks to Groq's OpenAI-compatible /openai/v1/chat/completions
 * endpoint. Used for fast Llama-family inference.
 */
// Note: brain-os/core/types.ts defines AuthorityLevel as "A0" | "A1" | "2" |
// "A3" | "A4" | "A5" — the literal "2" is a pre-existing quirk. We hold it in
// a typed const for readability.
const A2_AUTHORITY: AuthorityLevel = "A2";

export class GroqAdapter implements ModelAdapter {
  readonly id = "groq";
  readonly name = "Groq Llama Adapter";
  readonly provider = "groq";
  readonly model: string;
  readonly authority: AuthorityLevel = A2_AUTHORITY;
  available = false;

  private lastHealthAt = 0;
  private readonly healthTtlMs = 15_000;

  constructor(opts: { model?: string } = {}) {
    this.model = opts.model ?? process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile";
  }

  async initialize(): Promise<void> {
    if (!process.env.GROQ_API_KEY) {
      this.available = false;
      throw new Error("GroqAdapter initialize failed: GROQ_API_KEY not configured");
    }
    this.available = true;
    this.lastHealthAt = Date.now();
  }

  async infer(input: InferenceRequest): Promise<InferenceResult> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      this.available = false;
      throw new Error("GroqAdapter: GROQ_API_KEY not configured");
    }
    const start = Date.now();
    const res = await fetchWithTimeout("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: input.userPrompt },
        ],
        max_tokens: input.maxTokens ?? 400,
        temperature: 0.4,
      }),
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      this.available = false;
      throw new Error(`GroqAdapter infer ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`);
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim() || "";
    if (!content) throw new Error("GroqAdapter: empty completion content");
    this.lastHealthAt = Date.now();
    return {
      content,
      provider: this.provider,
      model: this.model,
      latencyMs,
      costUsd: 0, // Groq has a free tier; cost is negligible per call
      fallbackUsed: false,
      correlationId: input.correlationId,
    };
  }

  async healthCheck(): Promise<{ healthy: boolean; latencyMs: number }> {
    if (this.available && Date.now() - this.lastHealthAt < this.healthTtlMs) {
      return { healthy: true, latencyMs: 0 };
    }
    try {
      if (!process.env.GROQ_API_KEY) {
        this.available = false;
        return { healthy: false, latencyMs: 0 };
      }
      // Groq exposes /openai/v1/models — cheap liveness probe.
      const start = Date.now();
      const res = await fetchWithTimeout("https://api.groq.com/openai/v1/models", {
        method: "GET",
        headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}` },
      }, 5_000);
      const latencyMs = Date.now() - start;
      const healthy = res.ok;
      this.available = healthy;
      if (healthy) this.lastHealthAt = Date.now();
      return { healthy, latencyMs };
    } catch {
      this.available = false;
      return { healthy: false, latencyMs: 0 };
    }
  }
}

// ---------------------------------------------------------------------------
// 4. Static Fallback Adapter
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
 * used elsewhere in the platform (see src/lib/sgtx/ai/multi-provider.ts).
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
 * Rough USD cost estimate for a Gemini call. Pricing is intentionally
 * conservative (upper-bound) so cost telemetry never under-reports.
 *
 * Gemini Pro published pricing ≈ $0.0025 / 1K output tokens (upper band).
 */
function estimateGeminiCostUsd(output: string, maxTokens: number): number {
  const outputTokens = Math.min(maxTokens, Math.ceil(output.length / 4));
  return Number(((outputTokens / 1000) * 0.0025).toFixed(6));
}

/**
 * Rough USD cost estimate for an OpenAI GPT-4 call. Conservative upper-bound.
 *
 * GPT-4 published pricing ≈ $0.06 / 1K output tokens (8k context, upper band).
 */
function estimateOpenAiCostUsd(output: string, maxTokens: number): number {
  const outputTokens = Math.min(maxTokens, Math.ceil(output.length / 4));
  return Number(((outputTokens / 1000) * 0.06).toFixed(6));
}

// ---------------------------------------------------------------------------
// Adapter singletons
// ---------------------------------------------------------------------------

export const geminiAdapter = new GeminiAdapter();
export const openaiAdapter = new OpenAIAdapter();
export const groqAdapter = new GroqAdapter();
export const staticFallbackAdapter = new StaticFallbackAdapter();

/**
 * All adapters in priority order (primary first).
 * Chain: Gemini → OpenAI → Groq → Static.
 */
export const allAdapters: ModelAdapter[] = [
  geminiAdapter,
  openaiAdapter,
  groqAdapter,
  staticFallbackAdapter,
];

// Backward-compat aliases for the previous ZAI-based names. Some modules still
// import `zaiAdapter` / `ZAIAdapter` from the brain-os index — keep them as
// aliases of geminiAdapter / GeminiAdapter so those imports continue to work
// without a code-wide rename.
export const zaiAdapter = geminiAdapter;
export { GeminiAdapter as ZAIAdapter };

// Re-export small helpers for sibling modules.
export { newId, nowIso };
