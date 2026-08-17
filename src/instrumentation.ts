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

  // CCL-004: Prisma's sqlite provider ONLY accepts file: URLs — it rejects
  // libsql:// with URL_INVALID. The @prisma/adapter-libsql driver adapter
  // handles the real Turso connection, but Prisma's constructor still
  // validates env("DATABASE_URL"). So if DATABASE_URL is a libsql:// URL
  // (or undefined), we move it to TURSO_LIBSQL_URL and replace DATABASE_URL
  // with a dummy file: URL. db.ts reads TURSO_LIBSQL_URL for the adapter.
  const envDbUrl = process.env.DATABASE_URL || ""
  if (!envDbUrl || envDbUrl === "undefined" || envDbUrl.startsWith("libsql://") || envDbUrl.startsWith("http")) {
    // Store the real libsql URL for db.ts to use with the adapter
    if (envDbUrl && envDbUrl !== "undefined") {
      process.env.TURSO_LIBSQL_URL = envDbUrl
    }
    // Set a dummy file URL so Prisma's sqlite provider constructor passes
    process.env.DATABASE_URL = "file:/tmp/sgtx-dummy.db"
    ;(globalThis as any).__sgtxInstrumentationRan = true
    console.log("[SGTX] DATABASE_URL replaced with dummy file: URL (libsql adapter handles real connection)")
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
