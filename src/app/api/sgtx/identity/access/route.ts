// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getIdentityAccessPayload } from "@/lib/sgtx/identity/identity-access";

export const dynamic = "force-dynamic";

// GET /api/sgtx/identity/access — Internal SGTX Identity & Access mirror (v18 §4.4-§4.12)

export async function GET(req: NextRequest) {
  try {
    const payload = getIdentityAccessPayload();
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
    logger.error("[api/sgtx/identity/access] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Identity & Access metadata unavailable" }, { status: 503 });
  }
}
