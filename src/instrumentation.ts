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
  // The Prisma Client validates env("DATABASE_URL") at query time. If the env
  // var is not injected by Vercel at runtime, all queries fail with URL_INVALID.
  // This runs first (instrumentation is the earliest hook) so db.ts's import of
  // PrismaClient sees a valid DATABASE_URL.
  if (!process.env.DATABASE_URL) {
    const TURSO_HOST = "sgtx-fortleem.aws-us-east-1.turso.io";
    const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN ||
      "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2VGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA";
    process.env.DATABASE_URL = `libsql://${TURSO_HOST}?authToken=${TURSO_TOKEN}`;
    console.log("[SGTX] DATABASE_URL fallback set in instrumentation hook");
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
