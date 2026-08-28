// @ts-nocheck
/**
 * SGTX Part 26 — Incoterm Engine API
 * GET /api/sgtx/incoterm-engine?incoterm=<XX>
 *   Returns: IncotermResponsibilities
 * GET /api/sgtx/incoterm-engine
 *   Returns: list of all 11 Incoterms 2020
 */

import { NextRequest, NextResponse } from "next/server";
import { getIncotermResponsibilities, listIncoterms } from "@/lib/sgtx/incoterm-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const incoterm = searchParams.get("incoterm");
    if (!incoterm) {
      return NextResponse.json({
        ok: true,
        incoterms: listIncoterms(),
        note: "All 11 Incoterms 2020 supported: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF",
      });
    }
    const responsibilities = await getIncotermResponsibilities(incoterm);
    return NextResponse.json({ ok: true, responsibilities });
  } catch (err: any) {
    logger.error("[api/incoterm-engine] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
