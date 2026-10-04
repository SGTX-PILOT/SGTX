// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getConstitutionPayload } from "@/lib/sgtx/constitutional-foundation";

export const dynamic = "force-dynamic";

// GET /api/sgtx/constitution — Internal SGTX constitutional foundation mirror (v18 §3)
//
// This is the internal mirror of /api/v1/constitution for the cockpit
// admin panel and demo portals that use the /api/sgtx/* surface.
// Same payload as /api/v1/constitution — see that endpoint for the full
// schema. Auth NOT required (canonical Layer 0 invariants are public).

export async function GET(req: NextRequest) {
  try {
    const payload = getConstitutionPayload();
    return NextResponse.json(
      {
        ...payload,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
          "X-SGTX-Version": "v18.0",
        },
      },
    );
  } catch (e: any) {
    logger.error("[api/sgtx/constitution] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "Constitution metadata unavailable" },
      { status: 503 },
    );
  }
}
