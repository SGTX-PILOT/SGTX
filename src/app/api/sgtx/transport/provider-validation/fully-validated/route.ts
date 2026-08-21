// @ts-nocheck
// §6 Provider Validation — is the provider fully validated?
// GET /api/sgtx/transport/provider-validation/fully-validated?providerGtid=X&providerType=Y
//
// Returns true iff `validateProvider` returns overallVerdict === "VALIDATED".
import { NextResponse } from "next/server";
import { isProviderFullyValidated } from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerGtid = url.searchParams.get("providerGtid");
    const providerType = url.searchParams.get("providerType");
    if (!providerGtid || !providerType) {
      return NextResponse.json(
        { error: "providerGtid and providerType required" },
        { status: 400 },
      );
    }
    const fullyValidated = await isProviderFullyValidated(
      providerGtid,
      providerType,
    );
    return NextResponse.json({ providerGtid, providerType, fullyValidated });
  } catch (err: any) {
    logger.error(
      "[api/transport/provider-validation/fully-validated] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
