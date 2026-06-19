import { NextRequest, NextResponse } from "next/server";
import { submitDocument } from "@/lib/sgtx/gov";

// POST /api/sgtx/gov/cargox/submit — submit a document to CargoX for blockchain notarization
// Body: {
//   ustn: string,
//   documentHash: string,     // SHA-256 hex digest of the document file
//   documentType: string      // "BL" | "COMMERCIAL_INVOICE" | "CERT_ORIGIN" | "INSPECTION" | ...
// }
// Returns: { ok, acid, blockchainSeal, status, txHash, notarizedAt }

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, documentHash, documentType } = body || {};

    const missing: string[] = [];
    if (!ustn) missing.push("ustn");
    if (!documentHash) missing.push("documentHash");
    if (!documentType) missing.push("documentType");
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 }
      );
    }

    // Validate documentHash format (SHA-256 → 64-char hex).
    if (!/^[0-9a-fA-F]{64}$/.test(String(documentHash))) {
      return NextResponse.json(
        { error: "documentHash must be a 64-character SHA-256 hex digest" },
        { status: 400 }
      );
    }

    const result = await submitDocument(ustn, String(documentHash).toLowerCase(), documentType);

    return NextResponse.json({
      ok: true,
      acid: result.acid,
      blockchainSeal: result.blockchainSeal,
      status: result.status,
      notarizedAt: new Date().toISOString(),
    });
  } catch (e: any) {
    console.error("[gov/cargox/submit] error:", e);
    return NextResponse.json(
      { error: e?.message || "Failed to submit document to CargoX" },
      { status: 500 }
    );
  }
}
