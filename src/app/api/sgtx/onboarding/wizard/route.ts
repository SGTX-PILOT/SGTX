// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getOnboardingWizardPayload } from "@/lib/sgtx/identity/onboarding-wizard";

export const dynamic = "force-dynamic";

// GET /api/sgtx/onboarding/wizard — Internal SGTX Onboarding Wizard mirror (v18 §4.3)
//
// Internal mirror of /api/v1/onboarding/wizard for the cockpit admin
// panel and demo portals. Same payload — see that endpoint for the full
// schema. Auth NOT required (canonical wizard metadata is public).

export async function GET(req: NextRequest) {
  try {
    const payload = getOnboardingWizardPayload();
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
    logger.error("[api/sgtx/onboarding/wizard] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: "Onboarding wizard metadata unavailable" },
      { status: 503 },
    );
  }
}
