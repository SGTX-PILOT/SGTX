// SGTX instrumentation hook — defensive, never breaks build
export async function register() {
  // Skip entirely during build (NODE_ENV=production + no request context)
  if (process.env.NEXT_BUILD_PHASE === "phase-production-server") return;
  if (process.env.SGTX_DISABLE_BRAIN_OS_INIT === "1") return;
  
  // Only run on Node.js runtime (not Edge)
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  
  // Runtime-only initialization (never during build)
  if (process.env.NODE_ENV === "production") {
    // In production runtime, lazily init without importing heavy modules
    console.log("[SGTX] instrumentation: runtime mode, lazy init");
    return;
  }
  
  // Dev-only: full Brain OS initialization
  try {
    const brainMod = await import("@/lib/sgtx/brain-os");
    if (brainMod) {
      const { brainOrchestrator, registerAllCapabilities } = brainMod;
      await registerAllCapabilities().catch(() => {});
      await brainOrchestrator.initialize().catch(() => {});
      console.log("[SGTX Brain OS] auto-initialised via instrumentation hook");
    }
  } catch (e) {
    console.error("[SGTX Brain OS] auto-init failed (non-fatal):", e);
  }
}
