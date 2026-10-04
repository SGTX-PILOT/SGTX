// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getKybPayload } from "@/lib/sgtx/identity/kyb-tiers";

export const dynamic = "force-dynamic";

// GET /api/sgtx/kyb/tiers — Internal SGTX KYB Tier Model mirror (v18 §4.2)
//
// This is the internal mirror of /api/v1/kyb/tiers for the cockpit admin
// panel and demo portals. Same payload — see that endpoint for the full
// schema. Auth NOT required (canonical Layer 1 metadata is public).

export async function GET(req: NextRequest) {
  try {
    const payload = getKybPayload();
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
    logger.error("[api/sgtx/kyb/tiers] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "KYB metadata unavailable" },
      { status: 503 },
    );
  }
}
