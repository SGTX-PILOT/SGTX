// SGTX Brain — Portal Intelligence endpoint
// ============================================================================
// GET /api/sgtx/brain/portal-intelligence?portal=seller&gtid=SGTX-EG-TRD-002139-7F3A
//
// Returns 3 role-specific Brain insights for the requesting tenant's portal
// dashboard. Called by PortalShell on mount (wiring into the UI is a
// follow-up; for now this endpoint exposes the Brain function over HTTP).
//
// Query params:
//   • portal (required) — one of: buyer | seller | lsp | shipping | lab | qc |
//     customs_broker | bank | private_financier | government | admin
//   • gtid  (required) — the tenant's GTID (e.g. SGTX-EG-TRD-002139-7F3A)
//
// Response shape: PortalIntelligenceResult (see
// src/lib/sgtx/ai/portal-intelligence.ts).

import { NextRequest, NextResponse } from "next/server";
import {
  getPortalIntelligence,
  type PortalType,
} from "@/lib/sgtx/ai/portal-intelligence";

const VALID_PORTALS: ReadonlySet<PortalType> = new Set<PortalType>([
  "buyer",
  "seller",
  "lsp",
  "shipping",
  "lab",
  "qc",
  "customs_broker",
  "bank",
  "private_financier",
  "government",
  "admin",
]);

// Always run as dynamic — the response depends on tenant DB state.
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const portalRaw = sp.get("portal");
    const gtid = sp.get("gtid");

    if (!portalRaw) {
      return NextResponse.json(
        { error: "portal query param required (e.g. ?portal=seller)" },
        { status: 400 },
      );
    }
    if (!gtid) {
      return NextResponse.json(
        { error: "gtid query param required (e.g. ?gtid=SGTX-EG-TRD-002139-7F3A)" },
        { status: 400 },
      );
    }
    if (!VALID_PORTALS.has(portalRaw as PortalType)) {
      return NextResponse.json(
        {
          error: `Invalid portal '${portalRaw}'. Valid portals: ${Array.from(VALID_PORTALS).join(", ")}`,
        },
        { status: 400 },
      );
    }

    const portal = portalRaw as PortalType;
    const result = await getPortalIntelligence({ tenantGtid: gtid, portal });

    return NextResponse.json({
      ok: true,
      ...result,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "portal-intelligence failed" },
      { status: 500 },
    );
  }
}
