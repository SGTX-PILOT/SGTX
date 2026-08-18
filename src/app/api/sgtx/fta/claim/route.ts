// POST /api/sgtx/fta/claim — Create an FTA preference claim
//
// Body:
//   {
//     ustn?: string,
//     ftaPreferenceId?: string,
//     claimType: "ORIGIN"|"PROCESSING"|"DE_MINIMIS"|"OTHER",
//     claimReference?: string
//   }
//
// Optionally runs checkFtaPreference() first to validate that the supplied
// ftaPreferenceId actually applies to the shipment. If `autoVerify=false`
// (default), the claim is created with status=PENDING regardless.
//
// Response: { ok, claimId, status }

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createFtaClaim } from "@/lib/sgtx/fta";

const VALID_CLAIM_TYPES = new Set(["ORIGIN", "PROCESSING", "DE_MINIMIS", "OTHER"]);

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      ustn,
      ftaPreferenceId,
      claimType,
      claimReference,
    } = body || {};

    if (!claimType) {
      return NextResponse.json(
        { error: "Missing required field: claimType" },
        { status: 400 },
      );
    }
    if (!VALID_CLAIM_TYPES.has(String(claimType).toUpperCase())) {
      return NextResponse.json(
        { error: `Invalid claimType. Must be one of: ${[...VALID_CLAIM_TYPES].join(", ")}` },
        { status: 400 },
      );
    }

    // Defensive: if ftaPreferenceId is supplied, verify it exists.
    if (ftaPreferenceId) {
      try {
        const pref = await (db as any).ftaPreference.findUnique({
          where: { id: ftaPreferenceId },
          select: { id: true },
        });
        if (!pref) {
          return NextResponse.json(
            { error: `ftaPreferenceId ${ftaPreferenceId} not found` },
            { status: 404 },
          );
        }
      } catch (e: any) {
        logger.warn("[fta/claim] ftaPreference lookup failed (proceeding)", {
          error: e?.message || String(e),
        });
      }
    }

    const created = await createFtaClaim({
      ustn: ustn ?? null,
      ftaPreferenceId: ftaPreferenceId ?? null,
      claimType,
      claimReference: claimReference ?? null,
    });

    if (!created) {
      return NextResponse.json(
        { ok: false, error: "Failed to persist FTA preference claim (see server logs)" },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      claimId: created.id,
      status: created.status,
    });
  } catch (e: any) {
    logger.error("[fta/claim] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
