// @ts-nocheck
/**
 * SGTX v17 §24 — Imports Workflow: get / amend declaration
 * ============================================================================
 * GET   /api/sgtx/imports/declaration/[id]
 *   Returns: { ok, declaration }
 *
 * PATCH /api/sgtx/imports/declaration/[id]
 *   Body: { form4_permit_id?, add_goods?, broker_gtid?, notes? }
 *   Returns: { ok, declaration_id, form4_permit_id, goods_count, total_payable_usd }
 *
 * The PATCH endpoint supports:
 *   • Attaching a Form 4 permit reference (GOEIC-issued import permit)
 *   • Adding / amending goods (recalculates charges)
 *   • Assigning a customs broker
 *   • Free-text amendment notes
 *
 * PATCH is blocked once the declaration has been submitted (status SUBMITTED
 * or CLEARED). To change a submitted declaration, file an amendment via the
 * destination customs authority.
 */

import { NextRequest, NextResponse } from "next/server";
import { amendDeclaration, getDeclaration } from "@/lib/sgtx/imports";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const declaration = await getDeclaration(id);
    return NextResponse.json({ ok: true, declaration });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/declaration/[id]] GET failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND") ? 404 : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id is required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body) {
      return NextResponse.json({ ok: false, error: "Body is required" }, { status: 400 });
    }

    // Normalise camelCase / snake_case inputs.
    const addGoods = Array.isArray(body.add_goods)
      ? body.add_goods.map((g: any) => ({
          hsCode: g.hs_code || g.hsCode,
          quantity: Number(g.quantity),
          unitValueUsd: Number(g.unit_value_usd ?? g.unitValueUsd),
          originCountry: g.origin_country || g.originCountry,
        }))
      : Array.isArray(body.addGoods)
      ? body.addGoods.map((g: any) => ({
          hsCode: g.hsCode || g.hs_code,
          quantity: Number(g.quantity),
          unitValueUsd: Number(g.unitValueUsd ?? g.unit_value_usd),
          originCountry: g.originCountry || g.origin_country,
        }))
      : undefined;

    const result = await amendDeclaration(id, {
      form4PermitId: body.form4_permit_id || body.form4PermitId,
      addGoods,
      brokerGtid: body.broker_gtid || body.brokerGtid,
      notes: body.notes,
    });

    return NextResponse.json({
      ok: true,
      declaration_id: result.declarationId,
      form4_permit_id: result.form4PermitId,
      goods_count: result.goodsCount,
      total_payable_usd: result.totalPayableUsd,
    });
  } catch (err: any) {
    logger.error("[api/sgtx/imports/declaration/[id]] PATCH failed", { error: err?.message });
    const status = err?.message?.startsWith("DECLARATION_NOT_FOUND")
      ? 404
      : err?.message?.startsWith("DECLARATION_LOCKED")
      ? 409
      : 500;
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status },
    );
  }
}
