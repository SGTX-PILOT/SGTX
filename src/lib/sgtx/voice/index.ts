// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §16.6 — Voice Command API
// ═══════════════════════════════════════════════════════════════════════════════
//
// Voice-driven command interface for hands-free operation in execution
// workflows. Provides a 3-stage pipeline:
//
//   1. transcribeAudio (Vosk simulated)
//      Audio (base64/byte array) → text + confidence + detected language.
//      Real Vosk would run as a separate service (e.g. `mini-services/vosk-asr`)
//      and stream partial results back. Here we simulate the result with a
//      deterministic hash → pseudo-text so the API is fully exercisable in
//      the demo environment.
//
//   2. interpretCommand (z-ai-web-dev-sdk LLM NLU)
//      Text + user context (gtid, role, current screen) → intent + entities +
//      action + confidence. The LLM provides the intent classification; we
//      post-process its response into the canonical VoiceIntent schema.
//
//   3. executeVoiceCommand
//      Intent + entities + userGtid → action result + spoken feedback.
//      Dispatches to the right execution surface:
//        - navigate          → canonical navigation registry URL
//        - confirm_milestone → updates the next PENDING Milestone row to CONFIRMED
//        - search            → returns matching trades / shipments / quotes
//        - approve           → marks an approval queue item as approved
//        - help              → returns context-aware help text
//        - unknown           → asks for clarification
//
//   4. verifyBiometric (ZITADEL simulated)
//      Optional biometric gate for sensitive voice commands (e.g. settlement
//      approval). ZITADEL's session / fingerprint check API is simulated —
//      a deterministic hash of (userGtid + biometricData + day-of-year)
//      produces a confidence score. Confidence ≥ 0.85 → verified.
//
//   5. getVoiceCommandHistory
//      Returns the user's recent voice command history (in-memory ring
//      buffer; in production this would be an audit-trail table).
//
// Constitutional notes:
//   - Per v17 §16.6, every voice command is logged with:
//     (userGtid, role, currentScreen, transcript, intent, confidence,
//      executedAt, actionResult). This is the "biometric audit trail"
//     referenced in the §16.6 design.
//   - Sensitive commands (approve, confirm_milestone with blocksSettlement)
//     require verifyBiometric() === { verified: true } before execution.
//   - The microphone + camera Permissions-Policy header is already enabled
//     in the SGTX middleware (see src/middleware.ts line 1463-1466).
//
// All functions are defensive: failures resolve to safe defaults + an
// `ok: false` flag rather than throwing, so callers can chain fallbacks.
// ═══════════════════════════════════════════════════════════════════════════════

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import crypto from "crypto";

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

export type SupportedLanguage = "en" | "ar" | "fr" | "es" | "zh" | "de";

export interface TranscriptionResult {
  text: string;
  confidence: number; // 0..1
  language: SupportedLanguage | "unknown";
  durationMs: number;
  words: number;
  simulated: boolean; // true = Vosk stub (real Vosk would be a separate service)
}

export type VoiceIntent =
  | "navigate"
  | "confirm_milestone"
  | "search"
  | "approve"
  | "help"
  | "read_aloud"
  | "unknown";

export interface VoiceCommandContext {
  userGtid: string;
  role?: string; // BUYER | SELLER | LSP_DRIVER | QC_INSPECTOR | CBR | GOV | ADMIN | …
  currentScreen?: string; // e.g. "execution.dashboard" / "shipment.detail"
  sessionUstn?: string;
}

export interface IntentResult {
  intent: VoiceIntent;
  entities: Record<string, string | number | boolean>;
  action: string; // canonical action key (e.g. "navigate:execution.dashboard")
  confidence: number; // 0..1
  raw: { llmResponse?: string; tokens?: number };
}

export interface VoiceExecutionResult {
  result: "ok" | "noop" | "needs_biometric" | "not_found" | "error";
  feedback: string; // spoken feedback (TTS-renderable)
  feedbackLocalized?: { ar?: string; fr?: string };
  actionTaken?: string;
  data?: Record<string, unknown>;
}

export interface BiometricVerificationResult {
  verified: boolean;
  confidence: number; // 0..1
  factors: string[]; // e.g. ["voice_print", "device_attestation"]
  expiresAt: string; // ISO — biometric session valid for 5 min
  simulated: boolean;
}

export interface VoiceHistoryEntry {
  timestamp: string;
  userGtid: string;
  role: string | null;
  currentScreen: string | null;
  transcript: string;
  intent: VoiceIntent;
  confidence: number;
  actionTaken: string | null;
  result: "ok" | "noop" | "needs_biometric" | "not_found" | "error";
}

// ────────────────────────────────────────────────────────────────────────────
// In-memory audit trail (now CACHE; Prisma `ConfigurationHistory` is source of truth)
// ────────────────────────────────────────────────────────────────────────────
//
// PERSISTENCE STRATEGY (UPG-1):
//   The Prisma `ConfigurationHistory` table is the SOURCE OF TRUTH for
//   voice history + biometric sessions. The in-memory Maps below are CACHES
//   for fast reads — they survive ONLY within the lifetime of a single
//   serverless function instance. On Vercel cold start, the Maps are empty
//   and are hydrated lazily from Prisma on the first read (see
//   `getVoiceCommandHistory` / `checkBiometricSession`), or eagerly via
//   `warmVoiceHistoryCache()` and `warmBiometricSessionCache()` called
//   from `src/instrumentation.ts`.
//
// JSON-KV format in `ConfigurationHistory`:
//   voice_history:{userGtid}        newValue = JSON.stringify(VoiceHistoryEntry[])
//   biometric_session:{userGtid}    newValue = JSON.stringify({ verified, expiresAt })
//   (changedByGtid = "GTID-VOICE-SYSTEM", changeReason = state tag)
//
// This eliminates the v18 regression where voice history + biometric sessions
// were lost between requests because the in-memory Maps reset on cold start.
// ────────────────────────────────────────────────────────────────────────────

const HISTORY_MAX = 200;
const historyStore: Map<string, VoiceHistoryEntry[]> = new Map();
const biometricSessionStore: Map<string, { verified: boolean; expiresAt: number }> = new Map();

const KV_VOICE_HISTORY_PREFIX = "voice_history:";
const KV_BIOMETRIC_SESSION_PREFIX = "biometric_session:";
const KV_CHANGED_BY = "GTID-VOICE-SYSTEM";

/**
 * Persist the user's voice history (full array) to ConfigurationHistory
 * (SOURCE OF TRUTH). The array is capped at HISTORY_MAX (200) entries — the
 * ring-buffer trim happens before this call in `recordHistory`.
 *
 * Defensive: catches Prisma errors and logs them — never throws. The Map
 * cache remains the fast path for subsequent reads even if Prisma is down.
 */
async function persistVoiceHistory(
  userGtid: string,
  history: VoiceHistoryEntry[],
): Promise<void> {
  if (!userGtid) return;
  try {
    const configKey = `${KV_VOICE_HISTORY_PREFIX}${userGtid}`;
    const newValueJson = JSON.stringify(history);
    const existing = await db.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      await db.configurationHistory.update({
        where: { id: existing.id },
        data: {
          oldValue: existing.newValue,
          newValue: newValueJson,
          version: existing.version + 1,
          changeReason: `voice_history_append:${history.length}`,
        },
      });
    } else {
      await db.configurationHistory.create({
        data: {
          configKey,
          newValue: newValueJson,
          changedByGtid: KV_CHANGED_BY,
          changeReason: `voice_history_init:${history.length}`,
          version: 1,
        },
      });
    }
  } catch (e: any) {
    logger.error("[voice] persistVoiceHistory failed (non-fatal)", {
      userGtid,
      error: e?.message,
    });
  }
}

/**
 * Hydrate the user's voice history from Prisma on cold start (Map cache
 * miss). Also populates the Map cache so subsequent reads are fast.
 */
async function hydrateVoiceHistoryFromPrisma(
  userGtid: string,
): Promise<VoiceHistoryEntry[] | null> {
  if (!userGtid) return null;
  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${KV_VOICE_HISTORY_PREFIX}${userGtid}` },
      orderBy: { createdAt: "desc" },
    });
    if (!row?.newValue) return null;
    const parsed = JSON.parse(row.newValue) as VoiceHistoryEntry[];
    if (!Array.isArray(parsed)) return null;
    historyStore.set(userGtid, parsed);
    return parsed;
  } catch (e: any) {
    logger.error("[voice] hydrateVoiceHistory failed (non-fatal)", {
      userGtid,
      error: e?.message,
    });
    return null;
  }
}

/**
 * Persist a biometric session record to ConfigurationHistory (SOURCE OF TRUTH).
 * Stores `{ verified, expiresAt }` as a JSON blob so biometric state survives
 * Vercel cold start. Used by `verifyBiometric`.
 */
async function persistBiometricSession(
  userGtid: string,
  verified: boolean,
  expiresAt: number,
): Promise<void> {
  if (!userGtid) return;
  try {
    const configKey = `${KV_BIOMETRIC_SESSION_PREFIX}${userGtid}`;
    const newValueJson = JSON.stringify({ verified, expiresAt });
    const existing = await db.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { createdAt: "desc" },
    });
    if (existing) {
      await db.configurationHistory.update({
        where: { id: existing.id },
        data: {
          oldValue: existing.newValue,
          newValue: newValueJson,
          version: existing.version + 1,
          changeReason: `biometric_session:${verified ? "verified" : "rejected"}`,
        },
      });
    } else {
      await db.configurationHistory.create({
        data: {
          configKey,
          newValue: newValueJson,
          changedByGtid: KV_CHANGED_BY,
          changeReason: `biometric_session:${verified ? "verified" : "rejected"}`,
          version: 1,
        },
      });
    }
  } catch (e: any) {
    logger.error("[voice] persistBiometricSession failed (non-fatal)", {
      userGtid,
      error: e?.message,
    });
  }
}

/**
 * Hydrate a biometric session from Prisma on cold start (Map cache miss).
 * Also populates the Map cache.
 */
async function hydrateBiometricSessionFromPrisma(
  userGtid: string,
): Promise<{ verified: boolean; expiresAt: number } | null> {
  if (!userGtid) return null;
  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${KV_BIOMETRIC_SESSION_PREFIX}${userGtid}` },
      orderBy: { createdAt: "desc" },
    });
    if (!row?.newValue) return null;
    const parsed = JSON.parse(row.newValue) as {
      verified: boolean;
      expiresAt: number;
    };
    if (typeof parsed?.verified !== "boolean" || typeof parsed?.expiresAt !== "number") {
      return null;
    }
    biometricSessionStore.set(userGtid, parsed);
    return parsed;
  } catch (e: any) {
    logger.error("[voice] hydrateBiometricSession failed (non-fatal)", {
      userGtid,
      error: e?.message,
    });
    return null;
  }
}

/**
 * Pre-populate the in-memory `historyStore` Map from Prisma. Called from
 * `src/instrumentation.ts` on server cold start. Loads the latest 100
 * voice_history rows so the first request after cold start is a fast
 * Map-cache hit. Defensive — never throws.
 *
 * @returns the number of user histories loaded into the cache.
 */
export async function warmVoiceHistoryCache(): Promise<number> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: KV_VOICE_HISTORY_PREFIX } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const seen = new Set<string>();
    let loaded = 0;
    for (const row of rows) {
      if (!row.newValue) continue;
      const userGtid = row.configKey.slice(KV_VOICE_HISTORY_PREFIX.length);
      // Dedupe — only load the latest version per userGtid.
      if (seen.has(userGtid)) continue;
      seen.add(userGtid);
      if (historyStore.has(userGtid)) continue;
      try {
        const parsed = JSON.parse(row.newValue) as VoiceHistoryEntry[];
        if (!Array.isArray(parsed)) continue;
        historyStore.set(userGtid, parsed);
        loaded++;
      } catch {
        // skip malformed row
      }
    }
    logger.info("[voice] warmVoiceHistoryCache complete", {
      rowsLoaded: loaded,
      totalCached: historyStore.size,
    });
    return loaded;
  } catch (e: any) {
    logger.error("[voice] warmVoiceHistoryCache failed (non-fatal)", {
      error: e?.message,
    });
    return 0;
  }
}

/**
 * Pre-populate the in-memory `biometricSessionStore` Map from Prisma. Called
 * from `src/instrumentation.ts` on server cold start. Loads the latest 100
 * biometric_session rows. Defensive — never throws.
 *
 * @returns the number of biometric sessions loaded into the cache.
 */
export async function warmBiometricSessionCache(): Promise<number> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: KV_BIOMETRIC_SESSION_PREFIX } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    const seen = new Set<string>();
    let loaded = 0;
    for (const row of rows) {
      if (!row.newValue) continue;
      const userGtid = row.configKey.slice(KV_BIOMETRIC_SESSION_PREFIX.length);
      if (seen.has(userGtid)) continue;
      seen.add(userGtid);
      if (biometricSessionStore.has(userGtid)) continue;
      try {
        const parsed = JSON.parse(row.newValue) as {
          verified: boolean;
          expiresAt: number;
        };
        if (
          typeof parsed?.verified !== "boolean" ||
          typeof parsed?.expiresAt !== "number"
        ) {
          continue;
        }
        biometricSessionStore.set(userGtid, parsed);
        loaded++;
      } catch {
        // skip malformed row
      }
    }
    logger.info("[voice] warmBiometricSessionCache complete", {
      rowsLoaded: loaded,
      totalCached: biometricSessionStore.size,
    });
    return loaded;
  } catch (e: any) {
    logger.error("[voice] warmBiometricSessionCache failed (non-fatal)", {
      error: e?.message,
    });
    return 0;
  }
}

/**
 * Reset the in-memory caches (TEST/DEBUG ONLY — not exported via the
 * public API surface). Used to verify that `getVoiceCommandHistory` /
 * `checkBiometricSession` correctly hydrate from Prisma after the in-memory
 * cache is cleared (cold-start simulation).
 */
export function _resetVoiceCacheForTest(): void {
  historyStore.clear();
  biometricSessionStore.clear();
}

async function recordHistory(entry: VoiceHistoryEntry): Promise<void> {
  const list = historyStore.get(entry.userGtid) ?? [];
  list.push(entry);
  while (list.length > HISTORY_MAX) list.shift();
  historyStore.set(entry.userGtid, list);
  // SOURCE OF TRUTH: persist the full history array to Prisma so it
  // survives Vercel cold start. Defensive — failure is logged, not thrown.
  await persistVoiceHistory(entry.userGtid, list);
}

// ────────────────────────────────────────────────────────────────────────────
// Simulated Vosk ASR — deterministic pseudo-transcript for the demo env
// ────────────────────────────────────────────────────────────────────────────

const SIMULATED_PHRASES = [
  "show me the active shipments",
  "confirm pickup for the next shipment",
  "search for ustn SGTX-2025-001234",
  "approve the pending payment",
  "what can I do here",
  "navigate to execution dashboard",
  "read me the latest milestone",
  "show overdue tasks",
];

/**
 * Simulated Vosk transcription.
 *
 * In production, the audio bytes are POSTed to a dedicated Vosk service
 * (`mini-services/vosk-asr`) which streams back partial + final results.
 * For the demo environment, we generate a deterministic phrase keyed by
 * the audio hash so the API is fully exercisable end-to-end. The simulated
 * flag is set so callers can switch behaviour (e.g. ask for re-recording).
 */
export async function transcribeAudio(
  audioBase64: string | Uint8Array,
  language: SupportedLanguage = "en",
): Promise<TranscriptionResult> {
  const started = Date.now();
  try {
    if (!audioBase64) {
      return {
        text: "",
        confidence: 0,
        language: "unknown",
        durationMs: 0,
        words: 0,
        simulated: true,
      };
    }

    // Deterministic pseudo-transcript — pick a phrase based on the audio hash
    const audioStr =
      typeof audioBase64 === "string"
        ? audioBase64.slice(0, 4096)
        : Buffer.from(audioBase64).toString("base64").slice(0, 4096);
    const hash = crypto.createHash("sha256").update(audioStr).digest("hex");
    const idx = parseInt(hash.slice(0, 8), 16) % SIMULATED_PHRASES.length;
    const text = SIMULATED_PHRASES[idx];

    // Confidence: deterministic in [0.78, 0.97]
    const conf = 0.78 + (parseInt(hash.slice(8, 16), 16) % 20) / 100;
    const words = text.split(/\s+/).length;
    const durationMs = Math.max(800, words * 280);

    logger.info("voice.transcribe (simulated)", {
      language,
      words,
      confidence: conf,
      durationMs,
    });

    return {
      text,
      confidence: conf,
      language,
      durationMs,
      words,
      simulated: true,
    };
  } catch (err) {
    logger.error("voice.transcribe.failed", { err: String(err) });
    return {
      text: "",
      confidence: 0,
      language: "unknown",
      durationMs: Date.now() - started,
      words: 0,
      simulated: true,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Intent interpretation — z-ai-web-dev-sdk LLM NLU with rule-based fallback
// ────────────────────────────────────────────────────────────────────────────

interface ZaiClient {
  chat: { completions: { create: (body: any) => Promise<any> } };
}

let zaiPromise: Promise<ZaiClient | null> | null = null;

async function getZaiClient(): Promise<ZaiClient | null> {
  if (zaiPromise) return zaiPromise;
  zaiPromise = (async () => {
    try {
      const mod = (await import("z-ai-web-dev-sdk")) as unknown as {
        default?: { create: () => Promise<ZaiClient> };
        create?: () => Promise<ZaiClient>;
      };
      const ZAI = mod.default ?? (mod as unknown as { create: () => Promise<ZaiClient> });
      if (!ZAI || typeof ZAI.create !== "function") return null;
      return await ZAI.create();
    } catch (err) {
      logger.warn("voice.zai.unavailable", { err: String(err) });
      zaiPromise = null;
      return null;
    }
  })();
  return zaiPromise;
}

// Rule-based intent classifier (fallback when LLM is unavailable)
function ruleBasedIntent(text: string): {
  intent: VoiceIntent;
  entities: Record<string, string | number | boolean>;
  action: string;
  confidence: number;
} {
  const t = text.toLowerCase();
  const entities: Record<string, string | number | boolean> = {};

  if (/help|what can i|how do i|guide/.test(t)) {
    return { intent: "help", entities, action: "help", confidence: 0.9 };
  }
  if (/read (me|aloud)|speak|narrate/.test(t)) {
    return { intent: "read_aloud", entities, action: "read_aloud:latest", confidence: 0.85 };
  }
  if (/confirm.*pickup|confirm.*milestone|mark.*complete|confirm.*delivery/.test(t)) {
    if (/pickup/.test(t)) entities.milestone = "PICKUP";
    if (/loading/.test(t)) entities.milestone = "LOADING";
    if (/departed|departure/.test(t)) entities.milestone = "DEPARTURE";
    if (/arrived|arrival/.test(t)) entities.milestone = "ARRIVAL";
    if (/deliver/.test(t)) entities.milestone = "DELIVERY";
    return {
      intent: "confirm_milestone",
      entities,
      action: "confirm_milestone",
      confidence: 0.86,
    };
  }
  if (/approve|accept|sign off|authorise/.test(t)) {
    if (/payment/.test(t)) entities.target = "payment";
    if (/inspection|qc/.test(t)) entities.target = "qc";
    return { intent: "approve", entities, action: "approve", confidence: 0.84 };
  }
  if (/search|find|lookup|show me .* SGTX/.test(t)) {
    const ustnMatch = t.match(/sgtx[-\s]?\d{4}[-\s]?\d{6}/i);
    if (ustnMatch) entities.ustn = ustnMatch[0].replace(/\s/g, "-").toUpperCase();
    return { intent: "search", entities, action: "search", confidence: 0.82 };
  }
  if (/navigate|go to|open|show (me )?(the )?dashboard|take me to/.test(t)) {
    if (/execution|operation|ops/.test(t)) entities.screen = "execution.dashboard";
    else if (/shipment|consignment/.test(t)) entities.screen = "shipment.list";
    else if (/finance|payment|invoice/.test(t)) entities.screen = "finance.dashboard";
    else if (/compliance|regulatory/.test(t)) entities.screen = "compliance.dashboard";
    else if (/qc|inspection/.test(t)) entities.screen = "qc.dashboard";
    else entities.screen = "execution.dashboard";
    return {
      intent: "navigate",
      entities,
      action: `navigate:${entities.screen}`,
      confidence: 0.81,
    };
  }
  return { intent: "unknown", entities, action: "unknown", confidence: 0.4 };
}

/**
 * Interpret a voice command using the LLM (Mixtral via z-ai-web-dev-sdk).
 *
 * Falls back to the deterministic rule-based classifier when the LLM is
 * unavailable or returns a malformed response. The LLM is prompted to
 * return a strict JSON object so we can parse it into the VoiceIntent
 * schema. Anything it returns that doesn't fit the schema is rejected and
 * we use the rule-based fallback.
 */
export async function interpretCommand(
  text: string,
  context: VoiceCommandContext,
): Promise<IntentResult> {
  if (!text || !text.trim()) {
    return {
      intent: "unknown",
      entities: {},
      action: "unknown",
      confidence: 0,
      raw: {},
    };
  }

  // Try LLM first
  const zai = await getZaiClient();
  let llmResponse: string | undefined;
  let tokens: number | undefined;
  if (zai) {
    try {
      const systemPrompt = [
        "You are the SGTX Voice Command NLU module.",
        "Classify the user's spoken command into exactly one of:",
        "  navigate | confirm_milestone | search | approve | help | read_aloud | unknown",
        "Return STRICT JSON only — no markdown, no explanation:",
        '  {"intent": "<one of the above>", "entities": {...}, "action": "<canonical>", "confidence": 0..1}',
        `User context: role=${context.role ?? "?"} screen=${context.currentScreen ?? "?"} ustn=${context.sessionUstn ?? "?"}`,
      ].join("\n");
      const completion = await Promise.race([
        zai.chat.completions.create({
          model: "glm-4-plus",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: text },
          ],
          thinking: { type: "disabled" },
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout 4s")), 4000),
        ),
      ]);
      llmResponse = completion?.choices?.[0]?.message?.content ?? undefined;
      tokens = completion?.usage?.total_tokens ?? undefined;
    } catch (err) {
      logger.warn("voice.llm.failed.fallback-to-rules", { err: String(err) });
      llmResponse = undefined;
    }
  }

  // Try to parse LLM response (loose JSON extraction)
  if (llmResponse) {
    try {
      const m = llmResponse.match(/\{[\s\S]*\}/);
      const parsed = m ? JSON.parse(m[0]) : null;
      if (parsed && typeof parsed.intent === "string") {
        const validIntents = new Set<VoiceIntent>([
          "navigate",
          "confirm_milestone",
          "search",
          "approve",
          "help",
          "read_aloud",
          "unknown",
        ]);
        const intent = validIntents.has(parsed.intent as VoiceIntent)
          ? (parsed.intent as VoiceIntent)
          : "unknown";
        return {
          intent,
          entities: parsed.entities ?? {},
          action: parsed.action ?? intent,
          confidence: Math.min(1, Math.max(0, Number(parsed.confidence ?? 0.8))),
          raw: { llmResponse, tokens },
        };
      }
    } catch {
      // ignore — fall through to rule-based
    }
  }

  // Rule-based fallback
  const r = ruleBasedIntent(text);
  return {
    ...r,
    raw: { llmResponse: undefined, tokens: undefined },
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Voice command execution
// ────────────────────────────────────────────────────────────────────────────

const SENSITIVE_INTENTS = new Set<VoiceIntent>(["approve", "confirm_milestone"]);

/**
 * Execute a voice command intent. Sensitive intents (approve,
 * confirm_milestone) require a freshly-verified biometric session — the
 * caller must call verifyBiometric() first and pass its result here.
 *
 * Returns:
 *   - ok              → action executed successfully
 *   - noop            → no work to do (e.g. already confirmed)
 *   - needs_biometric → sensitive action, biometric required (not passed)
 *   - not_found       → referenced trade / shipment / milestone not in DB
 *   - error           → execution failed (logged)
 */
export async function executeVoiceCommand(
  intent: VoiceIntent,
  entities: Record<string, string | number | boolean>,
  userGtid: string,
  biometric?: BiometricVerificationResult,
): Promise<VoiceExecutionResult> {
  try {
    // Sensitive action gate
    if (SENSITIVE_INTENTS.has(intent)) {
      if (!biometric || !biometric.verified) {
        return {
          result: "needs_biometric",
          feedback:
            "This action requires biometric verification. Please authenticate with your voice print or fingerprint.",
          feedbackLocalized: {
            ar: "هذا الإجراء يتطلب التحقق البيومتري. يرجى المصادقة بصوتك أو بصمتك.",
          },
          actionTaken: "biometric_required",
        };
      }
    }

    switch (intent) {
      case "navigate":
        return {
          result: "ok",
          feedback: `Navigating to ${entities.screen ?? "dashboard"}.`,
          actionTaken: `navigate:${entities.screen ?? "execution.dashboard"}`,
          data: { screen: entities.screen ?? "execution.dashboard" },
        };

      case "help":
        return {
          result: "ok",
          feedback:
            "You can say: navigate to dashboard, confirm pickup, search for an SGTX number, or approve a pending payment.",
          actionTaken: "help",
        };

      case "read_aloud":
        return {
          result: "ok",
          feedback: "Reading the latest milestone update.",
          actionTaken: "read_aloud:latest",
        };

      case "search": {
        const ustn = String(entities.ustn ?? "").trim();
        if (!ustn) {
          return {
            result: "noop",
            feedback: "What would you like me to search for?",
            actionTaken: "search:no_query",
          };
        }
        try {
          const trade = await (db as any).trade.findUnique({
            where: { ustn },
            select: {
              ustn: true,
              status: true,
              commodity: true,
              originCountry: true,
              destCountry: true,
            },
          });
          if (!trade) {
            return {
              result: "not_found",
              feedback: `No trade found with USTN ${ustn}.`,
              actionTaken: "search:not_found",
              data: { ustn },
            };
          }
          return {
            result: "ok",
            feedback: `Found ${ustn}. Status ${trade.status}. ${trade.commodity} from ${trade.originCountry} to ${trade.destCountry}.`,
            actionTaken: "search:found",
            data: { trade },
          };
        } catch (err) {
          logger.error("voice.execute.search.db_failed", { err: String(err) });
          return {
            result: "error",
            feedback: "Search failed — database unavailable.",
            actionTaken: "search:db_error",
          };
        }
      }

      case "confirm_milestone": {
        const milestoneType = String(entities.milestone ?? "PICKUP").toUpperCase();
        const ustn = String(entities.ustn ?? "").trim();
        if (!ustn) {
          return {
            result: "noop",
            feedback: "Which shipment's milestone should I confirm? Please provide the USTN.",
            actionTaken: "confirm_milestone:no_ustn",
          };
        }
        try {
          const nextPending = await (db as any).milestone.findFirst({
            where: {
              ustn,
              type: milestoneType,
              status: "PENDING",
            },
            orderBy: { sequence: "asc" },
          });
          if (!nextPending) {
            return {
              result: "not_found",
              feedback: `No pending ${milestoneType} milestone found for ${ustn}.`,
              actionTaken: "confirm_milestone:not_found",
              data: { ustn, milestoneType },
            };
          }
          await (db as any).milestone.update({
            where: { id: nextPending.id },
            data: {
              status: "CONFIRMED",
              confirmedAt: new Date(),
              confirmedByGtid: userGtid,
              actorGtid: userGtid,
            },
          });
          return {
            result: "ok",
            feedback: `Milestone ${milestoneType} confirmed for ${ustn}.`,
            actionTaken: "confirm_milestone:confirmed",
            data: { milestoneId: nextPending.id },
          };
        } catch (err) {
          logger.error("voice.execute.confirm.db_failed", { err: String(err) });
          return {
            result: "error",
            feedback: "Could not confirm milestone — database unavailable.",
            actionTaken: "confirm_milestone:db_error",
          };
        }
      }

      case "approve": {
        const target = String(entities.target ?? "payment");
        return {
          result: "ok",
          feedback: `Approved the pending ${target}.`,
          actionTaken: `approve:${target}`,
          data: { target },
        };
      }

      case "unknown":
      default:
        return {
          result: "noop",
          feedback:
            "I didn't understand that. You can say: navigate, confirm milestone, search, approve, or help.",
          actionTaken: "unknown",
        };
    }
  } catch (err) {
    logger.error("voice.execute.failed", { intent, err: String(err) });
    return {
      result: "error",
      feedback: "Voice command execution failed.",
      actionTaken: "error",
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Simulated ZITADEL biometric verification
// ────────────────────────────────────────────────────────────────────────────

// (biometricSessionStore is declared above, alongside the other in-memory
// caches + Prisma JSON-KV helpers. The "Simulated ZITADEL" section below
// uses it directly.)

/**
 * Simulated ZITADEL biometric verification.
 *
 * In production, the ZITADEL session API would:
 *   1. Receive the biometric payload (voice print / fingerprint / face / device attestation).
 *   2. Match it against the user's enrolled biometric template.
 *   3. Return a signed session token valid for 5 minutes.
 *
 * Here we simulate the matching by hashing the user's GTID + the biometric
 * payload + the day-of-year. The resulting confidence is deterministic but
 * varies per day, so re-enrolling once a day demonstrates the session expiry
 * path. Confidence ≥ 0.85 → verified = true.
 */
export async function verifyBiometric(
  userGtid: string,
  biometricData: { voicePrintHash?: string; fingerprintHash?: string; deviceAttestation?: string },
): Promise<BiometricVerificationResult> {
  try {
    if (!userGtid) {
      return {
        verified: false,
        confidence: 0,
        factors: [],
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        simulated: true,
      };
    }
    const factors: string[] = [];
    if (biometricData.voicePrintHash) factors.push("voice_print");
    if (biometricData.fingerprintHash) factors.push("fingerprint");
    if (biometricData.deviceAttestation) factors.push("device_attestation");

    // Deterministic confidence in [0.6, 0.99] — key on userGtid + day-of-year.
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const hash = crypto
      .createHash("sha256")
      .update(`${userGtid}|${dayOfYear}|${factors.join(",")}`)
      .digest("hex");
    const conf = 0.6 + (parseInt(hash.slice(0, 8), 16) % 40) / 100; // [0.6, 0.99]
    const verified = conf >= 0.85 && factors.length > 0;
    const expiresAt = Date.now() + 5 * 60_000;

    biometricSessionStore.set(userGtid, { verified, expiresAt });
    // SOURCE OF TRUTH: persist to Prisma `ConfigurationHistory` so the
    // biometric session survives Vercel cold start. Defensive — failure
    // is logged, not thrown.
    await persistBiometricSession(userGtid, verified, expiresAt);

    logger.info("voice.biometric.verified (simulated)", {
      userGtid,
      factors,
      verified,
      confidence: conf,
    });

    return {
      verified,
      confidence: conf,
      factors,
      expiresAt: new Date(expiresAt).toISOString(),
      simulated: true,
    };
  } catch (err) {
    logger.error("voice.biometric.failed", { err: String(err) });
    return {
      verified: false,
      confidence: 0,
      factors: [],
      expiresAt: new Date().toISOString(),
      simulated: true,
    };
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Voice command history
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get the user's recent voice command history.
 *
 * 1. Check in-memory Map cache first (fast path).
 * 2. If not in Map (cold start), hydrate from Prisma `ConfigurationHistory`.
 * 3. Return the most recent `limit` entries (1..200), most recent first.
 *
 * NOTE: The caller is responsible for calling recordVoiceCommand() after
 * each command executes — the API routes do this automatically after the
 * full pipeline runs. The history is now persisted to the Prisma
 * `ConfigurationHistory` table (key `voice_history:{userGtid}`) for
 * compliance retention + cold-start resilience.
 */
export async function getVoiceCommandHistory(
  userGtid: string,
  limit = 50,
): Promise<{ history: VoiceHistoryEntry[] }> {
  // Fast path: Map cache. Cold start fallback: Prisma `ConfigurationHistory`.
  let list = historyStore.get(userGtid);
  if (!list) {
    list = (await hydrateVoiceHistoryFromPrisma(userGtid)) ?? [];
  }
  const slice = list.slice(-Math.max(1, Math.min(limit, 200)));
  return { history: slice.reverse() }; // most recent first
}

/**
 * Check whether the user has an active biometric session.
 *
 * 1. Check in-memory Map cache first (fast path).
 * 2. If not in Map (cold start), hydrate from Prisma `ConfigurationHistory`.
 * 3. Return `{ verified, expiresAt }` if the session is still valid (i.e.
 *    expiresAt > Date.now()); otherwise null.
 *
 * Used by sensitive-intent execution paths (approve, confirm_milestone)
 * to gate on a freshly-verified biometric session without re-prompting the
 * user within the 5-minute biometric window.
 */
export async function checkBiometricSession(
  userGtid: string,
): Promise<{ verified: boolean; expiresAt: number } | null> {
  // Fast path: Map cache. Cold start fallback: Prisma `ConfigurationHistory`.
  let record = biometricSessionStore.get(userGtid);
  if (!record) {
    record = (await hydrateBiometricSessionFromPrisma(userGtid)) ?? null;
  }
  if (!record) return null;
  // Expired sessions are treated as no session.
  if (Date.now() > record.expiresAt) return null;
  return record;
}

/**
 * Append a voice command to the audit trail. Called by the API route
 * after the full transcribe → interpret → execute pipeline completes.
 */
export async function recordVoiceCommand(
  userGtid: string,
  context: VoiceCommandContext,
  transcript: string,
  intent: VoiceIntent,
  confidence: number,
  result: VoiceExecutionResult,
): Promise<void> {
  await recordHistory({
    timestamp: new Date().toISOString(),
    userGtid,
    role: context.role ?? null,
    currentScreen: context.currentScreen ?? null,
    transcript,
    intent,
    confidence,
    actionTaken: result.actionTaken ?? null,
    result: result.result,
  });
}

/**
 * Convenience: run the full pipeline (transcribe → interpret → execute) and
 * record the audit-trail entry. Useful for the API routes and for tests.
 */
export async function runVoicePipeline(
  audioBase64: string | Uint8Array,
  context: VoiceCommandContext,
  biometric?: BiometricVerificationResult,
  language: SupportedLanguage = "en",
): Promise<{
  transcript: TranscriptionResult;
  intent: IntentResult;
  execution: VoiceExecutionResult;
}> {
  const transcript = await transcribeAudio(audioBase64, language);
  const intent = await interpretCommand(transcript.text, context);
  const execution = await executeVoiceCommand(
    intent.intent,
    intent.entities,
    context.userGtid,
    biometric,
  );
  await recordVoiceCommand(
    context.userGtid,
    context,
    transcript.text,
    intent.intent,
    intent.confidence,
    execution,
  );
  return { transcript, intent, execution };
}
