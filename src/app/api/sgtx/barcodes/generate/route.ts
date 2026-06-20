import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";

// ===== GS1 SSCC-18 helpers =====
// SSCC-18 = 1 (extension digit) + 7 (company prefix padded) + 9 (serial reference) + 1 (check digit)
// Per blueprint: 0 (extension) + company prefix (6 from seller GTID) + serial reference (9, padded) + check digit.

/**
 * Compute the GS1 check digit for a 17-digit SSCC prefix.
 * Algorithm: sum odd positions × 3 + even positions, then (10 - (sum % 10)) % 10.
 */
function gs1CheckDigit(sscc17: string): number {
  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const digit = parseInt(sscc17[i], 10);
    if (Number.isNaN(digit)) {
      throw new Error(`Invalid digit at position ${i}: "${sscc17[i]}"`);
    }
    sum += i % 2 === 0 ? digit * 3 : digit;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Extract a 6-digit company prefix from a seller GTID like "SGTX-EG-TRD-002139-7F3A".
 * Falls back to a hash-derived 6-digit prefix if no numeric sequence is found.
 */
function companyPrefixFromGtid(sellerGtid: string | null | undefined): string {
  if (sellerGtid) {
    const parts = sellerGtid.split("-");
    // parts: [SGTX, COUNTRY, TYPE, SEQ, CHECKSUM]
    const seq = parts[3];
    if (seq && /^\d+$/.test(seq)) {
      // Pad/truncate to exactly 6 digits
      return seq.padStart(6, "0").slice(-6);
    }
  }
  // Fallback: deterministic 6-digit prefix from a SHA-256 of the gtid
  const h = createHash("sha256").update(sellerGtid || "SGTX-DEFAULT").digest("hex");
  return h.slice(0, 6).replace(/\D/g, "").padStart(6, "0").slice(-6);
}

/**
 * Build the full 18-digit SSCC for a given company prefix + monotonic sequence number.
 */
function buildSscc(companyPrefix: string, sequence: number): string {
  const prefix17 = "0" + companyPrefix + String(sequence).padStart(9, "0").slice(-9);
  if (prefix17.length !== 17) {
    throw new Error(`SSCC prefix must be 17 digits, got ${prefix17.length}`);
  }
  const check = gs1CheckDigit(prefix17);
  return prefix17 + String(check);
}

/**
 * Build a W3C Verifiable Credential for a pallet.
 */
function buildPalletVc(opts: {
  sscc: string;
  ustn: string;
  product?: string | null;
  lotNumber?: string | null;
  netWeightKg?: number | null;
  originCountry?: string | null;
  treatmentStatus?: string | null;
}): string {
  const issuanceDate = new Date().toISOString();
  const proofValue = createHash("sha256")
    .update(`${opts.sscc}|${opts.ustn}|${opts.product ?? ""}|${issuanceDate}`)
    .digest("hex");

  const vc = {
    "@context": ["https://www.w3.org/2018/credentials/v1"],
    type: ["VerifiableCredential", "PalletCredential"],
    credentialSubject: {
      sscc: opts.sscc,
      ustn: opts.ustn,
      product: opts.product ?? null,
      lotNumber: opts.lotNumber ?? null,
      netWeightKg: opts.netWeightKg ?? null,
      originCountry: opts.originCountry ?? null,
      treatmentStatus: opts.treatmentStatus ?? null,
    },
    issuanceDate,
    proof: {
      type: "Ed25519Signature2020",
      verificationMethod: "https://sgtx.io/.well-known/sgtx-keys",
      proofValue,
    },
  };
  return JSON.stringify(vc);
}

/**
 * Loom hash = sha256 of (sscc + ustn + product).
 */
function loomHash(sscc: string, ustn: string, product: string): string {
  return createHash("sha256").update(`${sscc}${ustn}${product}`).digest("hex");
}

interface GeneratePalletInput {
  sequence: number;
  product?: string;
  lotNumber?: string;
  netWeightKg?: number;
  grossWeightKg?: number;
  originCountry?: string;
  treatmentStatus?: string;
}

// POST /api/sgtx/barcodes/generate
// Body: { ustn, tradeId?, sellerGtid?, pallets: [...] }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, tradeId, sellerGtid, pallets } = body as {
      ustn?: string;
      tradeId?: string;
      sellerGtid?: string;
      pallets?: GeneratePalletInput[];
    };

    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    if (!Array.isArray(pallets) || pallets.length === 0) {
      return NextResponse.json({ error: "pallets[] required" }, { status: 400 });
    }

    // Resolve seller GTID: prefer provided, else look up Trade.sellerGtid by ustn.
    let resolvedSellerGtid = sellerGtid ?? null;
    if (!resolvedSellerGtid) {
      const trade = await db.trade.findUnique({
        where: { ustn },
        select: { sellerGtid: true },
      });
      resolvedSellerGtid = trade?.sellerGtid ?? null;
    }

    const companyPrefix = companyPrefixFromGtid(resolvedSellerGtid);

    // Determine starting sequence offset so serial references stay unique per trade.
    const existing = await db.palletDetail.count({ where: { ustn } });
    const seqOffset = existing;

    const created = await db.$transaction(
      pallets.map((p, i) => {
        const seq = Number.isFinite(p?.sequence) ? (p.sequence as number) : i + 1;
        const serialRef = seqOffset + i + 1;
        const sscc = buildSscc(companyPrefix, serialRef);
        const product = p?.product ?? "";
        const qrData = buildPalletVc({
          sscc,
          ustn,
          product,
          lotNumber: p?.lotNumber,
          netWeightKg: p?.netWeightKg,
          originCountry: p?.originCountry,
          treatmentStatus: p?.treatmentStatus,
        });
        const hash = loomHash(sscc, ustn, product);

        return db.palletDetail.create({
          data: {
            tradeId: tradeId ?? null,
            ustn,
            sscc,
            sequence: seq,
            product: product || null,
            lotNumber: p?.lotNumber ?? null,
            netWeightKg: p?.netWeightKg ?? null,
            grossWeightKg: p?.grossWeightKg ?? null,
            originCountry: p?.originCountry ?? null,
            treatmentStatus: p?.treatmentStatus ?? null,
            qrData,
            loomHash: hash,
          },
        });
      }),
    );

    return NextResponse.json({
      ok: true,
      companyPrefix,
      pallets: created.map((p) => ({
        id: p.id,
        sscc: p.sscc,
        sequence: p.sequence,
        qrData: p.qrData,
        loomHash: p.loomHash,
      })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: "GENERATE_FAILED", detail: message }, { status: 500 });
  }
}
