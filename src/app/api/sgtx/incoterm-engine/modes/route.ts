// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm × Logistics Mode Compatibility API
 * GET /api/sgtx/incoterm-engine/modes
 *   ?incoterm=X&mode=Y&transport_mode=Z&perspective=BUYER|SELLER
 *
 * Returns:
 *   {
 *     incoterm,
 *     compatible_modes: ["A","B","C"],
 *     restrictions: ModeRestriction,
 *     compatibility: ModeCompatibility,
 *     mandatory_services_per_mode: { A: [...], B: [...], C: {...} },
 *     non_marketplace: true
 *   }
 *
 * Public so the buyer wizard + seller workflow can call without a session
 * cookie. Rate-limited by the anonymous API bucket (50 req/min) above.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getModeAIncotermServices,
  getModeBIncotermServices,
  getModeCIncotermServices,
  validateIncotermModeCompatibility,
  getIncotermModeRestrictions,
  getIncotermServicesForMode,
  listAllIncotermModeRestrictions,
  type LogisticsMode,
} from "@/lib/sgtx/incoterm-engine/mode-integration";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const incoterm = (searchParams.get("incoterm") || "").trim().toUpperCase();
    const mode = (searchParams.get("mode") || "").trim().toUpperCase() as LogisticsMode;
    const transportMode = (searchParams.get("transport_mode") || "").trim().toUpperCase();
    const perspective = (searchParams.get("perspective") || "BUYER").trim().toUpperCase() as "BUYER" | "SELLER";

    if (!incoterm) {
      // No incoterm supplied — return the full restrictions table for all 11 incoterms.
      return NextResponse.json({
        ok: true,
        all_incoterms: listAllIncotermModeRestrictions(),
        non_marketplace: true,
      });
    }

    const restrictions = getIncotermModeRestrictions(incoterm);
    let compatibility = null;
    if (mode) {
      compatibility = validateIncotermModeCompatibility(incoterm, mode, transportMode || undefined);
    }

    // Mandatory services per mode.
    const mandatory_services_per_mode: any = {
      A: getModeAIncotermServices(incoterm),
      B: getModeBIncotermServices(incoterm, perspective),
      C: getModeCIncotermServices(incoterm, perspective),
    };

    return NextResponse.json({
      ok: true,
      incoterm,
      compatible_modes: restrictions.modes,
      restrictions,
      compatibility,
      mandatory_services_per_mode,
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/modes] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
