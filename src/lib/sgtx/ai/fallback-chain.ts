// @ts-nocheck
// =============================================================================
// SGTX v18 §3.4.2 — AI Model Fallback Chain
// -----------------------------------------------------------------------------
// If one AI model fails, the platform automatically chooses another model.
// Fallback chain (v18 §3.4.2):
//   Primary: z-ai-web-dev-sdk (glm-4-plus)
//   Fallback 1: Groq (llama3-70b-8192) — if z-ai fails
//   Fallback 2: Ollama (llama3.2:3b) — if Groq fails
//   Terminal: Static templates — if Ollama fails
//
// Every inference is logged to ai_inference_records with the provider, model,
// latency, fallback_used, and fallback_reason.
// =============================================================================

import { logger } from "@/lib/sgtx/logger";

export type AiProvider = "z-ai" | "groq" | "ollama" | "static-templates";
export type AiAuthorityLevel = "A1" | "A2" | "A3" | "A4";

export interface AiInferenceResult {
  content: string;
  provider: AiProvider;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  confidence: number;
  authorityLevel: AiAuthorityLevel;
}

interface FallbackConfig {
  enabled: boolean;
  primary: AiProvider;
  fallback1: AiProvider;
  fallback2: AiProvider;
  terminal: AiProvider;
  timeoutMs: number;
}

// Load configuration from environment
function loadConfig(): FallbackConfig {
  return {
    enabled: process.env.AI_FALLBACK_ENABLED === "true",
    primary: (process.env.AI_PRIMARY_PROVIDER as AiProvider) || "z-ai",
    fallback1: (process.env.AI_FALLBACK_1 as AiProvider) || "groq",
    fallback2: (process.env.AI_FALLBACK_2 as AiProvider) || "ollama",
    terminal: (process.env.AI_TERMINAL as AiProvider) || "static-templates",
    timeoutMs: parseInt(process.env.AI_TIMEOUT_MS || "5000", 10),
  };
}

// Static template responses (terminal fallback)
const STATIC_TEMPLATES: Record<string, string> = {
  default: "I apologize, but all AI providers are currently unavailable. Please try again later.",
  tenant_message: "Your request has been received and is being processed. You will be notified when complete.",
  negotiation_suggestion: "Based on standard trade practices, consider accepting the current terms subject to standard conditions.",
  compliance_summary: "Compliance review is in progress. All checks will be completed before the trade proceeds.",
  container_advisor: "Standard container configuration recommended based on commodity type and quantity.",
  risk_assessment: "Risk assessment pending. Please consult your compliance team for the latest risk profile.",
};

// ── z-ai provider (primary) ───────────────────────────────────────────────
async function callZAi(prompt: string, authorityLevel: AiAuthorityLevel, timeoutMs: number): Promise<string> {
  const ZAI = (await import("z-ai-web-dev-sdk")).default;
  const zai = await ZAI.create();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await zai.chat.completions.create({
      messages: [{ role: "user", content: prompt }],
      model: "glm-4-plus",
      thinking: { type: "disabled" },
    });
    clearTimeout(timer);
    return response.choices[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Groq provider (fallback 1) ────────────────────────────────────────────
async function callGroq(prompt: string, timeoutMs: number): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY not set");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3-70b-8192",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 512,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Groq API error: ${response.status}`);
    const data = await response.json();
    return data.choices[0]?.message?.content || "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Ollama provider (fallback 2) ──────────────────────────────────────────
async function callOllama(prompt: string, timeoutMs: number): Promise<string> {
  const ollamaHost = process.env.OLLAMA_HOST || "http://localhost:11434";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${ollamaHost}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2:3b",
        prompt,
        stream: false,
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) throw new Error(`Ollama API error: ${response.status}`);
    const data = await response.json();
    return data.response || "";
  } finally {
    clearTimeout(timer);
  }
}

// ── Static template (terminal) ────────────────────────────────────────────
function getStaticTemplate(prompt: string, authorityLevel: AiAuthorityLevel): string {
  const lowerPrompt = prompt.toLowerCase();
  for (const key of Object.keys(STATIC_TEMPLATES)) {
    if (lowerPrompt.includes(key)) return STATIC_TEMPLATES[key];
  }
  return STATIC_TEMPLATES.default;
}

// ── Log inference to ai_inference_records ──────────────────────────────────
async function logInference(params: {
  agentName: string;
  authorityLevel: AiAuthorityLevel;
  provider: AiProvider;
  model: string;
  latencyMs: number;
  fallbackUsed: boolean;
  fallbackReason?: string;
  inputContext: string;
  outputLengthTokens: number;
  confidence: number;
}) {
  try {
    const { freshDb } = await import("@/lib/db-fresh");
    await freshDb.aiInferenceRecord?.create({
      data: {
        agentName: params.agentName,
        authorityLevel: params.authorityLevel,
        provider: params.provider,
        model: params.model,
        latencyMs: params.latencyMs,
        fallbackUsed: params.fallbackUsed,
        fallbackReason: params.fallbackReason || null,
        inputContext: params.inputContext,
        outputLengthTokens: params.outputLengthTokens,
        confidence: params.confidence,
      },
    });
  } catch (e: any) {
    logger.warn("[ai-fallback] inference log failed (non-fatal):", { error: e?.message });
  }
}

// ── Main fallback orchestrator ─────────────────────────────────────────────
export async function runWithFallback(
  prompt: string,
  options: {
    agentName?: string;
    authorityLevel?: AiAuthorityLevel;
    templateKey?: string;
  } = {},
): Promise<AiInferenceResult> {
  const config = loadConfig();
  const authorityLevel = options.authorityLevel || "A1";
  const agentName = options.agentName || "generic_agent";
  const startTime = Date.now();

  // If fallback is disabled, just call primary
  if (!config.enabled) {
    try {
      const content = await callZAi(prompt, authorityLevel, config.timeoutMs);
      const latencyMs = Date.now() - startTime;
      await logInference({
        agentName, authorityLevel, provider: config.primary, model: "glm-4-plus",
        latencyMs, fallbackUsed: false, inputContext: prompt.slice(0, 200),
        outputLengthTokens: Math.ceil(content.length / 4), confidence: 0.85,
      });
      return { content, provider: config.primary, model: "glm-4-plus", latencyMs, fallbackUsed: false, confidence: 0.85, authorityLevel };
    } catch (e: any) {
      // Even if fallback is disabled, use static template as last resort
      const content = getStaticTemplate(prompt, authorityLevel);
      const latencyMs = Date.now() - startTime;
      return { content, provider: "static-templates", model: "static", latencyMs, fallbackUsed: true, fallbackReason: e?.message, confidence: 0.3, authorityLevel };
    }
  }

  // Build the fallback chain
  const chain: { provider: AiProvider; call: () => Promise<string>; model: string }[] = [
    { provider: config.primary, call: () => callZAi(prompt, authorityLevel, config.timeoutMs), model: "glm-4-plus" },
    { provider: config.fallback1, call: () => callGroq(prompt, config.timeoutMs), model: "llama3-70b-8192" },
    { provider: config.fallback2, call: () => callOllama(prompt, config.timeoutMs), model: "llama3.2:3b" },
  ];

  let lastError: string | undefined;
  for (const link of chain) {
    try {
      const content = await link.call();
      if (content && content.trim().length > 0) {
        const latencyMs = Date.now() - startTime;
        const fallbackUsed = link.provider !== config.primary;
        const confidence = fallbackUsed ? 0.65 : 0.85;
        await logInference({
          agentName, authorityLevel, provider: link.provider, model: link.model,
          latencyMs, fallbackUsed, fallbackReason: fallbackUsed ? lastError : undefined,
          inputContext: prompt.slice(0, 200), outputLengthTokens: Math.ceil(content.length / 4), confidence,
        });
        return { content, provider: link.provider, model: link.model, latencyMs, fallbackUsed, fallbackReason: fallbackUsed ? lastError : undefined, confidence, authorityLevel };
      }
    } catch (e: any) {
      lastError = e?.message || String(e);
      logger.warn(`[ai-fallback] ${link.provider} failed:`, { error: lastError });
      // Continue to next provider in the chain
    }
  }

  // Terminal fallback: static template
  const content = getStaticTemplate(prompt, authorityLevel);
  const latencyMs = Date.now() - startTime;
  await logInference({
    agentName, authorityLevel, provider: "static-templates", model: "static",
    latencyMs, fallbackUsed: true, fallbackReason: `All providers failed. Last error: ${lastError}`,
    inputContext: prompt.slice(0, 200), outputLengthTokens: Math.ceil(content.length / 4), confidence: 0.3,
  });
  return { content, provider: "static-templates", model: "static", latencyMs, fallbackUsed: true, fallbackReason: `All providers failed: ${lastError}`, confidence: 0.3, authorityLevel };
}

// ── Health check for AI providers ─────────────────────────────────────────
export async function checkAiProviderHealth(): Promise<Record<AiProvider, "up" | "down" | "unknown">> {
  const config = loadConfig();
  const providers: AiProvider[] = [config.primary, config.fallback1, config.fallback2];
  const health: Record<string, "up" | "down" | "unknown"> = {};

  for (const provider of providers) {
    try {
      const testPrompt = "Health check — respond with 'OK'";
      const chain: Record<AiProvider, () => Promise<string>> = {
        "z-ai": () => callZAi(testPrompt, "A1", 3000),
        "groq": () => callGroq(testPrompt, 3000),
        "ollama": () => callOllama(testPrompt, 3000),
        "static-templates": () => Promise.resolve("OK"),
      };
      await chain[provider]();
      health[provider] = "up";
    } catch {
      health[provider] = "down";
    }
  }
  health["static-templates"] = "up"; // Always up
  return health as Record<AiProvider, "up" | "down" | "unknown">;
}
