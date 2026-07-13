// SGTX AI Orchestrator (Blueprint Part 1.4 — AI Authority Ladder)
// NO ZAI — uses multi-provider system: Gemini → OpenRouter → Groq → HuggingFace → static fallback
// Re-exports from multi-provider.ts for backward compatibility

export type { AuthorityLevel, AIProvider, AIResult } from "./multi-provider";
export {
  runAI,
  callAI,
  runMultiProviderAI,
  callProviderByName,
  callOpenRouter,
  getInferenceLog,
  getAIProviderStatus,
  getProviderHealth,
} from "./multi-provider";
import { runAI } from "./multi-provider";

// Convenience: callAI is already re-exported above
// Additional helpers can be added here as needed
