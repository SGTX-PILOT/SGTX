// GET /api/sgtx/providers/list?type=QC&country=EG&corridor=EG-DE
// Returns active (VERIFIED) tenants of the requested provider type for the
// provider-picker dropdowns in the trade-request wizard (CG-7 fix) and
// elsewhere. Replaces the previously-hardcoded provider GTIDs.
//
// Query params:
//   type     — required. Tenant.type one of: LSP | SHIP | LAB | QC | CBR
//   country  — optional ISO-3166 alpha2. When provided, providers in this
//              country are returned first (origin-side preference).
//   corridor — optional "{origin}-{dest}" ISO pair. Reserved for future use
//              (provider corridor specialisation). Currently a no-op filter.
//   active   — optional "true" (default) | "false". When true (default), only
//              tenants with lifecycleState "VERIFIED" are returned.
//
// Response: { providers: [{ gtid, legalName, type, country, city, trustScore,
//                            kybTier, lifecycleState }], total }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

const ALLOWED_TYPES = new Set(["LSP", "SHIP", "LAB", "QC", "CBR"]);

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const type = (sp.get("type") || "").toUpperCase();
    const country = (sp.get("country") || "").toUpperCase() || undefined;
    const onlyActive = (sp.get("active") || "true").toLowerCase() !== "false";

    if (!type || !ALLOWED_TYPES.has(type)) {
      return NextResponse.json(
        {
          error: "Missing or invalid `type`. Must be one of LSP, SHIP, LAB, QC, CBR.",
          providers: [],
          total: 0,
        },
        { status: 400 },
      );
    }

    // Two-pass query: providers in the requested country first (when supplied),
    // then the rest of the active providers of that type. We deliberately do
    // NOT hard-filter by country — a destination-side lab/QC is valid even if
    // its head office is in a different country (CG-7: "destination-side
    // inspections impossible" was the gap; we now surface every active
    // provider and let the buyer pick).
    const where: any = { type };
    if (onlyActive) where.lifecycleState = "VERIFIED";

    const tenants: any[] = await db.tenant.findMany({
      where,
      orderBy: [{ trustScore: "desc" }, { legalName: "asc" }],
    });

    const providers = tenants.map((t) => ({
      gtid: t.gtid,
      legalName: t.legalName,
      type: t.type,
      country: t.country,
      city: t.city || null,
      trustScore: t.trustScore,
      kybTier: t.kybTier,
      lifecycleState: t.lifecycleState,
    }));

    // Stable ordering: country-matching providers first, then by trust score
    // (already the DB order, but we re-sort to keep country matches on top).
    if (country) {
      providers.sort((a, b) => {
        const aMatch = a.country === country ? 0 : 1;
        const bMatch = b.country === country ? 0 : 1;
        if (aMatch !== bMatch) return aMatch - bMatch;
        return (b.trustScore || 0) - (a.trustScore || 0);
      });
    }

    return NextResponse.json({ providers, total: providers.length });
  } catch (e: any) {
    logger.error("[providers/list]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to list providers", providers: [], total: 0 },
      { status: 500 },
    );
  }
}
