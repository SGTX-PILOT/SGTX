// @ts-nocheck
// §6 Provider Validation — validate a provider (full ProviderValidationResult).
// POST /api/sgtx/transport/provider-validation/validate
// body: { providerGtid, providerType, context? }
//
// Returns:
//   • providerGtid, providerType
//   • checks: [{ validationType, status, validUntil?, referenceNumber?, reason? }]
//   • overallVerdict: "VALIDATED" | "CONDITIONAL" | "INVALID"
//   • validChecks, pendingChecks, expiredChecks, invalidChecks
//
// The optional `context` triggers context-aware additional screening:
//   • originLocation + destinationLocation → route authorization check
//   • hs6 → commodity authorization check
//   • vehiclePlate → vehicle authorization check
//   • driverId → driver authorization check
// A failing context check demotes VALIDATED → CONDITIONAL.
import { NextResponse } from "next/server";
import { validateProvider } from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.providerGtid) {
      return NextResponse.json(
        { error: "providerGtid required" },
        { status: 400 },
      );
    }
    if (!body.providerType) {
      return NextResponse.json(
        { error: "providerType required" },
        { status: 400 },
      );
    }
    const result = await validateProvider(
      body.providerGtid,
      body.providerType,
      body.context,
    );
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/transport/provider-validation/validate] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
