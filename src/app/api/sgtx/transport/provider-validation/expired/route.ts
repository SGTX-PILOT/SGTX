// @ts-nocheck
// §6 Provider Validation — all expired validations (for nightly compliance sweep).
// GET /api/sgtx/transport/provider-validation/expired
//
// Returns all ProviderValidation rows whose validUntil is in the past
// AND whose status is still VALIDATED (i.e. they SHOULD be marked EXPIRED).
import { NextResponse } from "next/server";
import { getExpiredValidations } from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const validations = await getExpiredValidations();
    return NextResponse.json({ validations });
  } catch (err: any) {
    logger.error("[api/transport/provider-validation/expired] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
