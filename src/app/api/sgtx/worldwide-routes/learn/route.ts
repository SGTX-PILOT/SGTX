// POST /api/sgtx/worldwide-routes/learn — feed an actual outcome back to
// the worldwide-routes learner.
//
// Body: { routeId: string, actualPriceUsd: number, actualTransitDays: number }
//
// Looks up the most recent predicted price/transit for the route from the
// `WorldwidePortRoute` table (created by Task 1-A) and feeds the
// prediction/actual pair into the learner (which mirrors it into the
// shadow pipeline for agreement-rate telemetry).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  logger,
  worldwideRoutesLearner,
} from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

interface LearnRequestBody {
  routeId?: string;
  actualPriceUsd?: number;
  actualTransitDays?: number;
  /** Optional explicit override of the predicted values. */
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
}

/**
 * Look up the most recent predicted price/transit for a route from the
 * WorldwidePortRoute table (schema created by Task 1-A). The table uses
 * `price40Std` as the canonical 40' standard-container price and
 * `transitDays` as the transit-time column — we pick those.
 *
 * Returns undefined for either field when the route isn't found or the
 * column isn't populated.
 */
async function lookupPrediction(routeId: string): Promise<{
  predictedPriceUsd?: number;
  predictedTransitDays?: number;
}> {
  try {
    const row = await (db as unknown as {
      worldwidePortRoute: {
        findUnique: (args: unknown) => Promise<Record<string, unknown> | null>;
      };
    }).worldwidePortRoute.findUnique({
      where: { routeId },
    });
    if (!row) return {};
    const result: { predictedPriceUsd?: number; predictedTransitDays?: number } = {};
    // Prefer the canonical 40'STD price; fall back to other container
    // types if the row uses a different one.
    for (const key of [
      "price40Std",
      "price40Hc",
      "price20Std",
      "price40Reefer",
      "price20Reefer",
    ]) {
      const v = row[key];
      if (typeof v === "number" && Number.isFinite(v)) {
        result.predictedPriceUsd = v;
        break;
      }
    }
    // Transit days is a single Int column on this schema.
    const transit = row.transitDays;
    if (typeof transit === "number" && Number.isFinite(transit)) {
      result.predictedTransitDays = transit;
    } else if (typeof transit === "string" && transit !== "") {
      const n = Number(transit);
      if (Number.isFinite(n)) result.predictedTransitDays = n;
    }
    return result;
  } catch (e) {
    logger.warn("worldwide-routes learn: prediction lookup failed", {
      component: "worldwide-routes-learn",
      routeId,
      error: e instanceof Error ? e.message : String(e),
    });
    return {};
  }
}

/**
 * POST — record an actual outcome for a route.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LearnRequestBody;
    if (!body || typeof body.routeId !== "string" || !body.routeId) {
      return NextResponse.json(
        { ok: false, error: "routeId is required" },
        { status: 400 },
      );
    }
    if (
      typeof body.actualPriceUsd !== "number" ||
      !Number.isFinite(body.actualPriceUsd)
    ) {
      return NextResponse.json(
        { ok: false, error: "actualPriceUsd must be a finite number" },
        { status: 400 },
      );
    }
    if (
      typeof body.actualTransitDays !== "number" ||
      !Number.isFinite(body.actualTransitDays)
    ) {
      return NextResponse.json(
        { ok: false, error: "actualTransitDays must be a finite number" },
        { status: 400 },
      );
    }

    // Look up the most recent prediction for this route from the DB.
    const fromDb = await lookupPrediction(body.routeId);
    const predictedPriceUsd = body.predictedPriceUsd ?? fromDb.predictedPriceUsd;
    const predictedTransitDays =
      body.predictedTransitDays ?? fromDb.predictedTransitDays;

    worldwideRoutesLearner.recordObservation({
      routeId: body.routeId,
      actualPriceUsd: body.actualPriceUsd,
      actualTransitDays: body.actualTransitDays,
      predictedPriceUsd,
      predictedTransitDays,
    });

    return NextResponse.json({
      ok: true,
      learningStats: worldwideRoutesLearner.getLearningStats(),
      recorded: {
        routeId: body.routeId,
        predictedPriceUsd,
        predictedTransitDays,
        actualPriceUsd: body.actualPriceUsd,
        actualTransitDays: body.actualTransitDays,
      },
    });
  } catch (e: any) {
    logger.error("worldwide-routes learn: POST failed", {
      component: "worldwide-routes-learn",
      error: e?.message ?? String(e),
    });
    return NextResponse.json(
      { ok: false, error: e?.message ?? String(e) },
      { status: 500 },
    );
  }
}
