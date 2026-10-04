// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getServiceProviderPayload } from "@/lib/sgtx/workflow/service-provider";

export const dynamic = "force-dynamic";

// GET /api/sgtx/workflow/service-provider — Internal SGTX Service Provider mirror (v18 §11)

export async function GET(req: NextRequest) {
  try {
    const payload = getServiceProviderPayload();
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
    logger.error("[api/sgtx/workflow/service-provider] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Service provider metadata unavailable" }, { status: 503 });
  }
}
