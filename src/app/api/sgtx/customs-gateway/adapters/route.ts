// @ts-nocheck
/**
 * SGTX Customs Gateway — Adapter Registry API
 * ===========================================================================
 * GET /api/sgtx/customs-gateway/adapters
 *   Returns: { ok, adapters[] }  — full AdapterStatus list (for Admin Portal)
 *
 * Optional: ?jurisdiction=<CC> filters by jurisdiction.
 *
 * L0 (NON-MARKETPLACE): the registry lists adapters; it NEVER auto-selects
 * one. The broker + Governor choose the adapter when creating a declaration.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listAdapters,
  getAdapterStatus,
  getAdapterByJurisdiction,
} from "@/lib/sgtx/customs-gateway/adapter-registry";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const jurisdiction = searchParams.get("jurisdiction");
    const statuses = getAdapterStatus();
    if (jurisdiction) {
      const upper = jurisdiction.toUpperCase();
      const filtered = statuses.filter((a) => a.jurisdiction === upper);
      const adapter = getAdapterByJurisdiction(upper);
      return NextResponse.json({
        ok: true,
        jurisdiction: upper,
        count: filtered.length,
        adapters: filtered,
        defaultAdapter: adapter
          ? {
              adapterId: adapter.adapterId,
              name: adapter.name,
              status: adapter.status,
              supportedOperations: adapter.supportedOperations,
            }
          : null,
        note: "Default adapter is a hint — the broker + Governor choose. NON-MARKETPLACE.",
      });
    }
    return NextResponse.json({
      ok: true,
      count: statuses.length,
      adapters: statuses,
      note: "All registered country adapters. NON-MARKETPLACE — adapter choice is broker + Governor gated.",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/adapters] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
