// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { amendPaymentManifest } from "@/lib/sgtx/payment-manifest";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/payment-manifest/[ustn]/amend — amend a manifest.
// NEVER silent mutation — always creates a NEW version (v18 §8.9).
//
// Body: {
//   reason: string,                                // required
//   amendments: {
//     add_legs?: ManifestLeg[],
//     replace_legs?: ManifestLeg[],                 // matched by leg_id
//     remove_leg_ids?: string[],
//     recalc_seller_balance?: boolean,
//     recalc_sgtx_fee?: boolean,
//   },
// }
//
// → { ok, newVersion, newHash, oldVersion }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  const { ustn } = await params;
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  if (!body.reason) {
    return NextResponse.json({ error: "reason required (immutable amendments)" }, { status: 400 });
  }
  const amendments = body.amendments || {};
  try {
    const result = await amendPaymentManifest(ustn, amendments, body.reason);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    if (e.message && /no existing manifest/i.test(e.message)) {
      return NextResponse.json({ error: e.message }, { status: 404 });
    }
    logger.error("[api/payment-manifest/[ustn]/amend] failed", { error: e?.message });
    return NextResponse.json({ error: e?.message || "amend failed" }, { status: 500 });
  }
}
