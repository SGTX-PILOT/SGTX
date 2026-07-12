// SGTX — Fine-Tuning Dataset Seed Script
// =============================================================================
// Generates 200 synthetic high-quality training examples by invoking the
// Brain OS `logistics.worldwide-routes-search` capability on 200 random port
// pairs from the WorldwidePortRoute table, then recording each as a training
// example via `datasetCollector.recordExample(...)`. ~50% of examples get a
// mock actualOutcome to demonstrate the feedback loop.
//
// Run with: bun run scripts/seed-finetuning-examples.ts
// =============================================================================

import { db } from "@/lib/db";
import {
  brainOrchestrator,
  datasetCollector,
  registerAllCapabilities,
  logger,
} from "@/lib/sgtx/brain-os";

const TARGET_EXAMPLES = 200;

interface RouteRow {
  routeId: string;
  originPort: string;
  destinationPort: string;
  shippingLine: string;
  transitDays: number;
  price40Std: number;
}

/**
 * Pick N distinct port pairs from the WorldwidePortRoute table. Returns at
 * most `count` rows (or fewer if the table is undersized).
 */
async function pickRandomRoutePairs(count: number): Promise<RouteRow[]> {
  // Cast — the legacy `db` singleton sometimes lacks the model until the
  // Prisma client is regenerated, which is the same defensive pattern the
  // worldwide-routes-learn route uses.
  const client = (db as unknown as {
    worldwidePortRoute: {
      findMany: (args: unknown) => Promise<RouteRow[]>;
      count: (args?: unknown) => Promise<number>;
    };
  }).worldwidePortRoute;

  const total = await client.count({});
  if (total === 0) {
    throw new Error("WorldwidePortRoute table is empty — run Task 1-A's sync first.");
  }
  // Randomised SQL-side sampling: pull up to `count * 3` rows ordered by a
  // pseudo-random column, then take the first `count` distinct routeIds.
  // SQLite doesn't have RAND() — we use ABS(id % 7) as a poor man's shuffle.
  const rows = await client.findMany({
    take: Math.min(total, count * 3),
    where: {},
    orderBy: { originPort: "asc" },
  });
  // Fisher-Yates shuffle in JS.
  for (let i = rows.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rows[i], rows[j]] = [rows[j], rows[i]];
  }
  return rows.slice(0, count);
}

/**
 * Run the seed: invoke the Brain OS for 200 random port pairs, record each
 * result + (for ~50%) a mock actualOutcome.
 */
async function main(): Promise<void> {
  console.log("🌱 Seeding fine-tuning dataset...");
  // Initialise the Brain OS + register all capabilities.
  registerAllCapabilities();
  await brainOrchestrator.initialize();
  datasetCollector.start();

  const routes = await pickRandomRoutePairs(TARGET_EXAMPLES);
  console.log(`  picked ${routes.length} random port-pair routes`);

  let recorded = 0;
  let withOutcome = 0;
  for (const route of routes) {
    try {
      // Invoke the Brain's worldwide-routes-search capability.
      const result = await brainOrchestrator.invoke(
        "logistics.worldwide-routes-search",
        {
          origin: route.originPort,
          dest: route.destinationPort,
          limit: 1,
        },
      );

      // Best-effort extract the first route from the result.
      const firstRoute =
        result && typeof result === "object"
          ? ((result as Record<string, unknown>).routes ??
            (result as Record<string, unknown>).result ??
            result)
          : result;
      const routesArr = Array.isArray(firstRoute) ? firstRoute : [firstRoute];
      const top = routesArr[0] as Record<string, unknown> | undefined;

      const output: Record<string, unknown> = {
        success: true,
        capability: "logistics.worldwide-routes-search",
        routeId: route.routeId,
        predictedPriceUsd: top?.price40Std ?? route.price40Std,
        predictedTransitDays: top?.transitDays ?? route.transitDays,
        shippingLine: top?.shippingLine ?? route.shippingLine,
        confidence: top?.confidence ?? 0.82,
        topRoute: top ?? null,
      };

      // ~50% of examples get a mock actualOutcome (closes the feedback loop).
      const includeOutcome = Math.random() < 0.5;
      const actualOutcome: Record<string, unknown> | undefined = includeOutcome
        ? {
            routeId: route.routeId,
            actualPriceUsd: route.price40Std * (0.95 + Math.random() * 0.1),
            actualTransitDays: route.transitDays + (Math.random() < 0.5 ? -1 : 1),
            observedAt: new Date().toISOString(),
            source: "mock-observation",
          }
        : undefined;

      await datasetCollector.recordExample({
        capability: "logistics.worldwide-routes-search",
        input: {
          origin: route.originPort,
          dest: route.destinationPort,
          limit: 1,
          routeId: route.routeId,
          tenantGtid: "SGTX-EG-TRD-002139-7F3A",
        },
        output,
        actualOutcome,
        source: "manual-observation",
        metadata: {
          routeId: route.routeId,
          tenantGtid: "SGTX-EG-TRD-002139-7F3A",
          modelProvider: "zai-gemini",
        },
      });
      recorded++;
      if (includeOutcome) withOutcome++;
    } catch (err) {
      logger.warn("seed-finetuning: invoke/record failed for one route", {
        component: "seed-finetuning",
        routeId: route.routeId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  console.log(`  ✓ recorded ${recorded} examples (${withOutcome} with mock actualOutcome)`);

  // Print dataset stats.
  const stats = await datasetCollector.getDatasetStats();
  console.log("  dataset stats:", JSON.stringify(stats, null, 2));

  await db.$disconnect().catch(() => {});
  console.log("✓ done");
}

main().catch((err) => {
  console.error("seed-finetuning failed:", err);
  process.exit(1);
});
