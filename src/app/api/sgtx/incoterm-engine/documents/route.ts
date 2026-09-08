// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm Document Requirements API
 * GET /api/sgtx/incoterm-engine/documents
 *   ?incoterm=X&transport_mode=Y&origin_country=Z&dest_country=W
 *
 * Returns:
 *   {
 *     incoterm, transport_mode, origin_country, dest_country,
 *     mandatory: DocumentRequirement[],
 *     optional:  DocumentRequirement[],
 *     all:       DocumentRequirement[],
 *     grouped_by_category: Record<DocumentCategory, DocumentRequirement[]>,
 *     issuer_per_doc: Record<documentType, DocumentIssuer>
 *   }
 *
 * Public so the buyer wizard + seller workflow can call without a session
 * cookie. Rate-limited by the anonymous API bucket (50 req/min) above.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getDocumentRequirements,
  getDocumentIssuer,
  validateDocumentCompleteness,
  groupDocumentsByCategory,
  incotermRequiresSellerInsurance,
  incotermSellerHandlesImport,
  incotermBuyerHandlesExport,
  type DocumentRequirement,
} from "@/lib/sgtx/incoterm-engine/document-requirements";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const incoterm = (searchParams.get("incoterm") || "").trim().toUpperCase();
    const transportMode = (searchParams.get("transport_mode") || "SEA").trim().toUpperCase();
    const originCountry = (searchParams.get("origin_country") || "").trim().toUpperCase();
    const destCountry = (searchParams.get("dest_country") || "").trim().toUpperCase();

    if (!incoterm) {
      return NextResponse.json(
        {
          ok: false,
          error: "incoterm is required (one of EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF).",
        },
        { status: 400 },
      );
    }

    const all = getDocumentRequirements(incoterm, transportMode, originCountry, destCountry);
    const mandatory = all.filter((d: DocumentRequirement) => d.mandatory);
    const optional = all.filter((d: DocumentRequirement) => !d.mandatory);
    const grouped = groupDocumentsByCategory(all);
    const issuerPerDoc: Record<string, string> = {};
    for (const d of all) {
      issuerPerDoc[d.documentType] = d.issuer;
    }

    // Surface incoterm-specific advisory flags.
    const sellerMustInsure = incotermRequiresSellerInsurance(incoterm);
    const sellerHandlesImport = incotermSellerHandlesImport(incoterm);
    const buyerHandlesExport = incotermBuyerHandlesExport(incoterm);

    return NextResponse.json({
      ok: true,
      incoterm,
      transport_mode: transportMode,
      origin_country: originCountry,
      dest_country: destCountry,
      mandatory,
      optional,
      all,
      grouped_by_category: grouped,
      issuer_per_doc: issuerPerDoc,
      flags: {
        seller_must_insure: sellerMustInsure,
        seller_handles_import: sellerHandlesImport,
        buyer_handles_export: buyerHandlesExport,
      },
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/documents] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoterm = (body.incoterm || "").trim().toUpperCase();
    const transportMode = (body.transport_mode || "SEA").trim().toUpperCase();
    const documents = Array.isArray(body.documents) ? body.documents : [];

    if (!incoterm) {
      return NextResponse.json(
        { ok: false, error: "incoterm is required." },
        { status: 400 },
      );
    }

    const result = validateDocumentCompleteness(incoterm, documents, transportMode);
    return NextResponse.json({
      ok: true,
      incoterm,
      transport_mode: transportMode,
      complete: result.complete,
      missing: result.missing,
      warnings: result.warnings,
      extra: result.extra,
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/documents] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
