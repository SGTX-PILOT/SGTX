// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { signBankMandateQes } from "@/lib/sgtx/bank-mandate";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// POST /api/sgtx/bank-mandate/agreement/[id]/sign
// Body: { signerGtid?, qesCertRef? }
// Signs the bank mandate agreement with a QES via Egypt Trust. If no
// qesCertRef is provided, a synthetic EG-TRUST-QES-* cert reference is
// generated (simulated issuance). On success, the mandate status flips
// to SIGNED and a QesSignature row is recorded for the audit trail.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "mandate id required" }, { status: 400 });
    }
    const body = await req.json().catch(() => ({}));
    const signerGtid = typeof body.signerGtid === "string" ? body.signerGtid : null;
    const qesCertRef = typeof body.qesCertRef === "string" && body.qesCertRef.trim()
      ? body.qesCertRef.trim()
      : null;

    const result = await signBankMandateQes(id, signerGtid, qesCertRef);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/bank-mandate/agreement/[id]/sign] POST failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}
