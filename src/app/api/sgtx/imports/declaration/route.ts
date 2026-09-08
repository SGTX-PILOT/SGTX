// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: create import declaration
 * ============================================================================
 * POST /api/sgtx/imports/declaration
 *   Body: { ustn, importer_gtid, goods: [{ hs_code, quantity, unit_value_usd, origin_country }] }
 *   Returns: { ok, declaration_id, declaration_no, form4_required, form4_reason,
 *              estimated_duty_usd, estimated_tax_usd, total_payable_usd,
 *              goods_count, dest_country }
 *
 * Creates a CustomsDeclaration row for the import, computes estimated duty +
 * tax per good (via the G-02 tariff-engine + G-18 tax-engine), determines
 * whether a Form 4 (Egyptian GOEIC) import permit is required, and persists
 * the full payload (goods + charges + Form 4 + status timeline) into the
 * CustomsDeclaration.etaXml JSON bundle.
 *
 * JWT-protected via the existing /api/sgtx/* middleware convention.
 */

import { NextRequest, NextResponse } from "next/server";
import { createImportDeclaration } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body) {
      return NextResponse.json({ ok: false, error: "Body is required" }, { status: 400 });
    }
    const { ustn, importer_gtid, goods } = body;
    if (!ustn) {
      return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
    }
    if (!importer_gtid) {
      return NextResponse.json({ ok: false, error: "importer_gtid is required" }, { status: 400 });
    }
    if (!Array.isArray(goods) || goods.length === 0) {
      return NextResponse.json({ ok: false, error: "goods[] is required (non-empty)" }, { status: 400 });
    }
    // Validate goods schema (camelCase internal representation).
    const importGoods = goods.map((g: any, i: number) => {
      const hs = g.hs_code || g.hsCode;
      const qty = Number(g.quantity);
      const uv = Number(g.unit_value_usd ?? g.unitValueUsd);
      const oc = g.origin_country || g.originCountry;
      if (!hs || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(uv) || uv <= 0 || !oc) {
        throw new Error(`goods[${i}] invalid: requires hs_code, quantity>0, unit_value_usd>0, origin_country`);
      }
      return { hsCode: hs, quantity: qty, unitValueUsd: uv, originCountry: oc };
    });

    const result = await createImportDeclaration(ustn, importer_gtid, importGoods);

    return NextResponse.json({
      ok: true,
      declaration_id: result.declarationId,
      declaration_no: result.declarationNo,
      form4_required: result.form4Required,
      form4_reason: result.form4Reason,
      estimated_duty_usd: result.estimatedDutyUsd,
      estimated_tax_usd: result.estimatedTaxUsd,
      total_payable_usd: result.totalPayableUsd,
      goods_count: result.goodsCount,
      dest_country: result.destCountry,
    }, { status: 201 });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/declaration] POST failed", { error: err?.message });
    const status = err?.message?.startsWith("TRADE_NOT_FOUND")
      || err?.message?.startsWith("GOODS_REQUIRED")
      || err?.message?.startsWith("USTN_REQUIRED")
      || err?.message?.startsWith("IMPORTER_GTID_REQUIRED")
      || err?.message?.startsWith("INVALID_GOODS")
      ? 400 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
