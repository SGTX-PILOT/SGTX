// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getSignatureRequirements,
  listDocumentTypes,
} from "@/lib/sgtx/digital-signature-legality";

export const dynamic = "force-dynamic";

// GET /api/sgtx/signature-legality/requirements — Get signature requirements for a document type (v17 §20.111)
//
// Query params:
//   ?country=X&document_type=Y — required signature type, witness, notarisation, apostille
//   ?document_types=true       — list all supported document types
//
// Returns:
//   {
//     "country": "EG",
//     "documentType": "REAL_ESTATE_DEED",
//     "requiredSignatureType": "QUALIFIED",
//     "witnessRequired": true,
//     "notarizationRequired": true,
//     "apostilleRequired": true,
//     "additionalRequirements": [...],
//     "notes": "..."
//   }
//
// Public read endpoint. Rate-limited 50 req/min/IP via the middleware
// anonymous bucket.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const country = sp.get("country") || "";
    const documentType = sp.get("document_type") || sp.get("documentType") || "";
    const wantDocumentTypes = sp.get("document_types") === "true";

    if (wantDocumentTypes) {
      return NextResponse.json({ document_types: listDocumentTypes() });
    }
    if (!country) {
      return NextResponse.json(
        { error: "country query parameter required" },
        { status: 400 },
      );
    }
    if (!documentType) {
      return NextResponse.json(
        {
          error:
            "document_type query parameter required (use ?document_types=true to list supported document types)",
        },
        { status: 400 },
      );
    }
    const upper = documentType.toUpperCase();
    if (!listDocumentTypes().includes(upper as any)) {
      return NextResponse.json(
        {
          error:
            "Invalid document_type. Valid values: " +
            listDocumentTypes().join(", "),
        },
        { status: 400 },
      );
    }
    const result = getSignatureRequirements(country, upper as any);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "public, max-age=3600" },
    });
  } catch (e: any) {
    logger.error("[api/sgtx/signature-legality/requirements] error:", {
      error: e?.message || String(e),
    });
    return NextResponse.json(
      { error: e?.message || "Signature requirements query failed" },
      { status: 500 },
    );
  }
}
