import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { getDocumentStatus, verifyDocument } from "@/lib/sgtx/gov";

// GET /api/sgtx/gov/cargox/verify — verify a CargoX-notarized document
// Query params:
//   acid            — (optional) ACID of the notarized document → returns lifecycle status
//   documentHash    — (optional) when provided with blockchainSeal → cryptographic verify
//   blockchainSeal  — (optional) the seal returned by /cargox/submit
//
// Behaviour:
//   - If `acid` is supplied: returns { ok, acid, verified, timestamp }
//   - If `documentHash` + `blockchainSeal` are supplied: returns { ok, documentHash, verified }
//   - Otherwise: 400 with usage instructions.

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const acid = searchParams.get("acid");
    const documentHash = searchParams.get("documentHash");
    const blockchainSeal = searchParams.get("blockchainSeal");

    if (acid) {
      const result = await getDocumentStatus(acid);
      return NextResponse.json({
        ok: true,
        acid,
        verified: result.verified,
        timestamp: result.timestamp,
      });
    }

    if (documentHash && blockchainSeal) {
      const verified = verifyDocument(documentHash, blockchainSeal);
      return NextResponse.json({
        ok: true,
        documentHash,
        blockchainSeal,
        verified,
      });
    }

    return NextResponse.json(
      {
        error:
          "Provide either ?acid=<ACID> or ?documentHash=<sha256>&blockchainSeal=<seal> as query parameters.",
      },
      { status: 400 }
    );
  } catch (e: any) {
    logger.error("[gov/cargox/verify] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to verify CargoX document" },
      { status: 500 }
    );
  }
}
