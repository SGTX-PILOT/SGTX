// SGTX AI Orchestrator (Blueprint Part 1.4 — AI Authority Ladder)
// NO ZAI — uses multi-provider system: Gemini → OpenAI → GroQ → HuggingFace → static fallback
// Re-exports from multi-provider.ts for backward compatibility

export type { AuthorityLevel, AIProvider, AIResult } from "./multi-provider";
export { runAI, callAI, getInferenceLog, getAIProviderStatus } from "./multi-provider";
import { runAI } from "./multi-provider";

// Convenience: callAI is already re-exported above
// Additional helpers can be added here as needed
