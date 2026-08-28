// @ts-nocheck
/**
 * SGTX Part 31 — Customs Procedures API
 * GET /api/sgtx/customs-procedures?country=<CC>&procedure=<NAME>
 *   Returns: ProcedureDetails
 * GET /api/sgtx/customs-procedures
 *   Returns: list of supported procedures + countries
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getCustomsProcedure,
  listProcedures,
  listSupportedCountries,
} from "@/lib/sgtx/customs-procedures";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    const procedure = searchParams.get("procedure");
    if (!country || !procedure) {
      return NextResponse.json({
        ok: true,
        procedures: listProcedures(),
        countries: listSupportedCountries(),
        note: "16 procedures supported × 12 country overrides + generic fallback",
      });
    }
    const details = await getCustomsProcedure(country, procedure);
    return NextResponse.json({ ok: true, details });
  } catch (err: any) {
    logger.error("[api/customs-procedures] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
