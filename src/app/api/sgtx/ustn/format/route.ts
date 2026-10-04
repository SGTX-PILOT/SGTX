// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getUstnFormatPayload } from "@/lib/sgtx/ustn/ustn-v18";

export const dynamic = "force-dynamic";

// GET /api/sgtx/ustn/format — Internal SGTX USTN format mirror (v18 §5.1)
//
// Internal mirror of /api/v1/ustn/format. Auth NOT required (canonical
// format spec is public).

export async function GET(req: NextRequest) {
  try {
    const payload = getUstnFormatPayload();
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
    logger.error("[api/sgtx/ustn/format] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "USTN format metadata unavailable" },
      { status: 503 },
    );
  }
}
