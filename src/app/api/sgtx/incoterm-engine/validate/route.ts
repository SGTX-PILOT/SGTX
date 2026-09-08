// @ts-nocheck
/**
 * SGTX v17 Phase 2 — Incoterm Consistency Validation API
 * POST /api/sgtx/incoterm-engine/validate
 *
 * Body:
 *   {
 *     incoterm, transport_mode, logistics_costs: LogisticsCost[],
 *     documents: DocumentInput[], origin_country, dest_country,
 *     mode: "A" | "B" | "C", perspective: "BUYER" | "SELLER"
 *   }
 *
 * Returns the comprehensive validation result combining:
 *   • mode compatibility (validateIncotermModeCompatibility)
 *   • mandatory-services coverage (validateIncotermConsistency)
 *   • document completeness (validateDocumentCompleteness)
 *
 * Returns:
 *   {
 *     ok, valid, errors: [], warnings: [],
 *     missing_mandatory_services: [],
 *     missing_documents: [],
 *     mode_compatibility: ModeCompatibility,
 *     document_completeness: DocumentCompletenessResult,
 *     non_marketplace: true
 *   }
 *
 * Public so the buyer wizard + seller workflow can call without a session
 * cookie. Used by the seller-side G2U18 (mandatory services priced) and
 * G1U22 (documentation completeness) gates.
 */

import { NextRequest, NextResponse } from "next/server";
import { validateIncotermConsistency, getIncotermResponsibility } from "@/lib/sgtx/incoterms/responsibility-engine";
import { validateIncotermModeCompatibility, getIncotermModeRestrictions, getModeAIncotermServices, getModeBIncotermServices, getModeCIncotermServices } from "@/lib/sgtx/incoterm-engine/mode-integration";
import { validateDocumentCompleteness } from "@/lib/sgtx/incoterm-engine/document-requirements";
import { getSellerMandatoryServices, getBuyerMandatoryServices, getMandatoryLogisticsCosts, getTotalTradeValue, calculateIncotermFees } from "@/lib/sgtx/incoterm-engine/fee-calculator";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const incoterm = (body.incoterm || "").trim().toUpperCase();
    const transportMode = (body.transport_mode || "SEA").trim().toUpperCase();
    const originCountry = (body.origin_country || "").trim().toUpperCase();
    const destCountry = (body.dest_country || "").trim().toUpperCase();
    const mode = (body.mode || "A").trim().toUpperCase();
    const perspective = (body.perspective || "BUYER").trim().toUpperCase() as "BUYER" | "SELLER";
    const logisticsCosts = Array.isArray(body.logistics_costs) ? body.logistics_costs : [];
    const documents = Array.isArray(body.documents) ? body.documents : [];
    const tradeValueUsd = Number(body.trade_value_usd ?? body.trade_value ?? 0);

    if (!incoterm) {
      return NextResponse.json(
        { ok: false, error: "incoterm is required." },
        { status: 400 },
      );
    }

    const errors: string[] = [];
    const warnings: string[] = [];

    // 1. Mode compatibility check.
    const modeCompatibility = validateIncotermModeCompatibility(
      incoterm,
      mode,
      transportMode,
    );
    if (!modeCompatibility.compatible) {
      errors.push(`Mode incompatibility: ${modeCompatibility.reason}`);
    }

    // 2. Mandatory-services coverage check (per incoterm responsibility matrix).
    let missingMandatoryServices: string[] = [];
    try {
      // Use the matrix's validateIncotermConsistency to detect missing services.
      const consistency = validateIncotermConsistency(incoterm, logisticsCosts);
      // Filter the missing list to only the perspective's mandatory services.
      const perspectiveMandatory =
        perspective === "SELLER"
          ? getSellerMandatoryServices(incoterm)
          : getBuyerMandatoryServices(incoterm);
      missingMandatoryServices = consistency.missing.filter((m) =>
        perspectiveMandatory.includes(m),
      );
      if (missingMandatoryServices.length > 0) {
        errors.push(
          `Missing mandatory service(s) for ${incoterm} (${perspective} perspective): ${missingMandatoryServices.join(", ")}.`,
        );
      }
    } catch (err: any) {
      warnings.push(`Mandatory-services coverage check failed: ${err?.message || "unknown error"}.`);
    }

    // 3. Document completeness check.
    let documentCompleteness;
    try {
      documentCompleteness = validateDocumentCompleteness(
        incoterm,
        documents,
        transportMode,
      );
      if (!documentCompleteness.complete) {
        errors.push(
          `Missing mandatory document(s): ${documentCompleteness.missing.join(", ")}.`,
        );
      }
      for (const w of documentCompleteness.warnings || []) {
        warnings.push(w);
      }
    } catch (err: any) {
      warnings.push(`Document completeness check failed: ${err?.message || "unknown error"}.`);
      documentCompleteness = { complete: false, missing: [], warnings, extra: [] };
    }

    // 4. Advisory: SGTX fee preview (only when trade value + logistics costs supplied).
    let feePreview = null;
    if (tradeValueUsd > 0) {
      try {
        const r = calculateIncotermFees(incoterm, tradeValueUsd, logisticsCosts);
        feePreview = {
          total_trade_value_usd: r.totalTradeValueUsd,
          sgtx_fee_usd: r.sgtxFeeUsd,
          buyer_pays_usd: r.buyerPaysUsd,
          seller_pays_usd: r.sellerPaysUsd,
        };
      } catch (err: any) {
        warnings.push(`Fee preview skipped: ${err?.message || "unknown error"}.`);
      }
    }

    // 5. Advisory: per-mode mandatory service listing (for the UI to render).
    const mandatoryServicesPerMode = {
      A: getModeAIncotermServices(incoterm),
      B: getModeBIncotermServices(incoterm, perspective),
      C: getModeCIncotermServices(incoterm, perspective),
    };

    const valid = errors.length === 0;
    return NextResponse.json({
      ok: true,
      valid,
      errors,
      warnings,
      missing_mandatory_services: missingMandatoryServices,
      missing_documents: documentCompleteness?.missing || [],
      mode_compatibility: modeCompatibility,
      document_completeness: documentCompleteness,
      mandatory_services_per_mode: mandatoryServicesPerMode,
      fee_preview: feePreview,
      non_marketplace: true,
    });
  } catch (err: any) {
    logger.error("[api/incoterm-engine/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
