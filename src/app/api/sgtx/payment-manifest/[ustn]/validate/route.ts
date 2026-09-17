// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  validatePaymentManifest,
  getPaymentManifest,
} from "@/lib/sgtx/payment-manifest";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment-manifest/[ustn]/validate — validate the
// most recent stored manifest. v18 §8.9 validation rules:
//   • Each leg has an attributable quote (or is a government fee /
//     SGTX platform fee / seller commercial balance).
//   • Leg IDs follow the convention.
//   • Currencies are EGP or USD only.
//   • Totals match sum of legs.
//   • Beneficiary IBAN present for all legs (warning only).
//
// Body: { manifest?: PaymentManifest }    // optional — if omitted,
//                                          // validates the stored manifest
//
// → { ok, valid, errors, warnings }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await params;
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  // Caller may POST an in-memory manifest for validation; otherwise
  // we fetch the most recent stored manifest for the USTN.
  let manifest = null;
  try {
    const body = await req.json().catch(() => null);
    if (body && body.manifest) manifest = body.manifest;
  } catch {
    // body is null/empty — fall through to stored manifest.
  }
  if (!manifest) {
    try {
      manifest = await getPaymentManifest(ustn);
    } catch (e: any) {
      logger.error("[api/payment-manifest/[ustn]/validate] fetch failed", {
        error: e?.message,
      });
      return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
    }
  }
  if (!manifest) {
    return NextResponse.json({ error: "no manifest found for ustn" }, { status: 404 });
  }

  try {
    const result = validatePaymentManifest(manifest);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/payment-manifest/[ustn]/validate] failed", {
      error: e?.message,
    });
    return NextResponse.json({ error: e?.message || "validate failed" }, { status: 500 });
  }
}
