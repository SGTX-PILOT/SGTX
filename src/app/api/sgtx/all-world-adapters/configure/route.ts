// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §20.118 — Auto-configure platform for a new country
// ═══════════════════════════════════════════════════════════════════════════════
//
// POST /api/sgtx/all-world-adapters/configure
//   body: { country_code: "EG" }
//
// Walks the 20-step country activation workflow for the given country,
// surfaces the gaps that need to be closed before going live, and lists
// the modules that have been activated. Also consults the GRiRE engine
// (best-effort) for a product/corridor matrix.
//
// Returns: { configured, modules_activated, gaps, adapter }
//   - configured: true if there are no BLOCKER gaps + the customs gateway is
//     supported (i.e. the country can be activated in production)
//   - modules_activated: list of activation steps that have been satisfied
//   - gaps: list of activation steps that still need operator action
//     (each gap has a step name, a reason, and a severity BLOCKER/WARN/INFO)
//   - adapter: the full CountryAdapter object (capabilities, endpoints,
//     language, currency, timezone, regulatory sources)
// ═══════════════════════════════════════════════════════════════════════════════

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { autoConfigureForCountry } from "@/lib/sgtx/all-world-adapters";
import "@/lib/sgtx/all-world-adapters/registry";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const countryCode: string = body?.country_code || body?.countryCode || body?.country || "";

    if (!countryCode || typeof countryCode !== "string") {
      return NextResponse.json(
        {
          ok: false,
          error: "body.country_code must be a non-empty string (ISO alpha-2)",
          example: { country_code: "EG" },
        },
        { status: 400 },
      );
    }

    const result = await autoConfigureForCountry(countryCode);

    return NextResponse.json({
      ok: true,
      country_code: countryCode.toUpperCase(),
      configured: result.configured,
      modules_activated: result.modulesActivated,
      modules_activated_count: result.modulesActivated.length,
      gaps: result.gaps,
      gaps_count: result.gaps.length,
      blockers_count: result.gaps.filter((g: any) => g.severity === "BLOCKER").length,
      adapter: result.adapter,
      hint: result.configured
        ? "Country is ready for production activation — proceed with steps 14-20 (credentials, sandbox, conformance, legal review, production approval, activation, Loom record)."
        : "Resolve all BLOCKER gaps before proceeding to production activation. See the gaps array for each step's reason.",
    });
  } catch (err: any) {
    logger.error("[api/sgtx/all-world-adapters/configure] POST failed", {
      error: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
