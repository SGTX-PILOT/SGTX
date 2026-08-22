// @ts-nocheck
// §3 Country Readiness Tests — per-jurisdiction readiness + activation flag.
// POST /api/sgtx/readiness/country-tests
//      → runCountryReadinessTests() → returns CountryReadinessTest[] (Egypt-first if activated).
import { NextResponse } from "next/server";
import { runCountryReadinessTests } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const results = await runCountryReadinessTests();
    return NextResponse.json({ results, count: results.length });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/country-tests] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
