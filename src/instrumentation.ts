// SGTX Brain OS — Auto-initialisation hook (CCL-003)
// =============================================================================
// Next.js 16 instrumentation hook. Runs once per server/function instance on
// cold boot. Ensures the Brain orchestrator + learning loop + dataset
// collector + schedulers are started BEFORE any request is served, so that
// `brain.decision.made` events are captured + persisted to Turso.
//
// Without this, the Brain is dormant in Vercel serverless: the orchestrator
// only initialises when someone hits GET /api/sgtx/brain-os/status, meaning
// the first user-driven Brain capability invocation would miss the learning
// subscriptions.
//
// This hook is defensive — it NEVER throws (a failed init must not break the
// request path). All Brain subsystems catch their own errors internally.

export async function register() {
  // Only run on the Node.js runtime (not Edge).
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  // CCL-004: Ensure DATABASE_URL is set BEFORE any module that imports Prisma.
  // The Prisma Client validates env("DATABASE_URL") at construction. The
  // sqlite provider expects a file: URL. When using the libsql adapter, the
  // adapter handles the real Turso connection — but Prisma still validates
  // the env var. So we set a dummy file: URL here, and db.ts's
  // resolveDatabaseUrl() provides the real libsql:// URL to the adapter.
  if (!process.env.DATABASE_URL || process.env.DATABASE_URL === "undefined") {
    // Set a dummy file URL so Prisma's constructor validation passes.
    // The actual DB connection is handled by the PrismaLibSql adapter in db.ts.
    process.env.DATABASE_URL = "file:/tmp/sgtx-dummy.db";
    ;(globalThis as any).__sgtxInstrumentationRan = true; console.log("[SGTX] DATABASE_URL dummy set in instrumentation hook (adapter handles real connection)");
  }

  try {
    const { brainOrchestrator, registerAllCapabilities, learningLoop, datasetCollector, worldwideRoutesLearner } =
      await import("@/lib/sgtx/brain-os");

    // Register all 56 capabilities (compliance + AI + logistics + learning).
    await registerAllCapabilities().catch(() => {});

    // Initialise the orchestrator — wires the event bus + module registry.
    await brainOrchestrator.initialize().catch(() => {});

    // Start the learning subsystems (idempotent — safe to call on every boot).
    // Some `.start()` methods return void (not Promise) — wrap defensively.
    try { await learningLoop.start(); } catch {}
    try { datasetCollector.start(); } catch {}
    try { worldwideRoutesLearner.start(); } catch {}

    // Log silently — instrumentation must not produce response output.
    console.log("[SGTX Brain OS] auto-initialised via instrumentation hook");
  } catch (e) {
    // Defensive: never break the request path on Brain init failure.
    console.error("[SGTX Brain OS] auto-init failed (non-fatal):", e);
  }
}
