import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";

/**
 * Recompute the Loom hash for a pallet: sha256(sscc + ustn + product).
 */
function recomputeLoomHash(sscc: string, ustn: string, product: string): string {
  return createHash("sha256").update(`${sscc}${ustn}${product}`).digest("hex");
}

/**
 * Verify the W3C VC proofValue: recompute sha256(sscc|ustn|product|issuanceDate)
 * and compare to the value embedded in the credential.
 */
function verifyVcProof(qrData: string, sscc: string, ustn: string, product: string): {
  vcValid: boolean;
  vc: Record<string, unknown> | null;
  expectedProof: string;
  storedProof: string | null;
} {
  let vc: Record<string, unknown> | null = null;
  try {
    vc = JSON.parse(qrData);
  } catch {
    return { vcValid: false, vc: null, expectedProof: "", storedProof: null };
  }

  const issuanceDate = (vc as { issuanceDate?: string })?.issuanceDate ?? "";
  const proof = (vc as { proof?: { proofValue?: string } })?.proof;
  const storedProof = proof?.proofValue ?? null;
  const expectedProof = createHash("sha256")
    .update(`${sscc}|${ustn}|${product ?? ""}|${issuanceDate}`)
    .digest("hex");

  return {
    vcValid: Boolean(storedProof) && storedProof === expectedProof,
    vc,
    expectedProof,
    storedProof,
  };
}

// GET /api/sgtx/barcodes/verify?sscc=...
// Offline W3C VC verification: recompute Loom hash and proofValue, compare to stored values.
export async function GET(req: NextRequest) {
  try {
    const sscc = req.nextUrl.searchParams.get("sscc");
    if (!sscc) {
      return NextResponse.json({ error: "sscc required" }, { status: 400 });
    }

    const pallet = await db.palletDetail.findUnique({
      where: { sscc },
    });

    if (!pallet) {
      return NextResponse.json(
        { ok: false, verified: false, error: "pallet not found" },
        { status: 404 },
      );
    }

    const product = pallet.product ?? "";
    const recomputedHash = recomputeLoomHash(pallet.sscc, pallet.ustn, product);
    const hashMatches = Boolean(pallet.loomHash) && pallet.loomHash === recomputedHash;

    const { vcValid, vc, expectedProof, storedProof } = pallet.qrData
      ? verifyVcProof(pallet.qrData, pallet.sscc, pallet.ustn, product)
      : { vcValid: false, vc: null, expectedProof: "", storedProof: null };

    const verified = hashMatches && vcValid;

    return NextResponse.json({
      ok: true,
      verified,
      checks: {
        loomHashMatched: hashMatches,
        vcProofValid: vcValid,
      },
      pallet: {
        id: pallet.id,
        ustn: pallet.ustn,
        tradeId: pallet.tradeId,
        sscc: pallet.sscc,
        sequence: pallet.sequence,
        product: pallet.product,
        lotNumber: pallet.lotNumber,
        netWeightKg: pallet.netWeightKg,
        grossWeightKg: pallet.grossWeightKg,
        originCountry: pallet.originCountry,
        treatmentStatus: pallet.treatmentStatus,
        storedLoomHash: pallet.loomHash,
        recomputedLoomHash: recomputedHash,
        createdAt: pallet.createdAt,
      },
      vc,
      proof: {
        expected: expectedProof,
        stored: storedProof,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "VERIFY_FAILED", detail: message }, { status: 500 });
  }
}
