// @ts-nocheck
// SGTX Phase 2 §6 OUTPUT — Regulatory Product Result compute endpoint
//   POST /api/sgtx/regulatory/compute
//   Body: { ustn?, tradeId?, productName?, hs6?, composition?, material?,
//           casNumbers?, jurisdictionCode, originCountry, customsValueUsd,
//           quantity?, netWeightKg?, agreementId?, claimPreferential?,
//           materials?, shippingTransshipment?, exporterApproved?,
//           effectiveDate? }
//   Returns: the full RegulatoryProductResult envelope.
//   The orchestrator NEVER throws — every sub-engine failure degrades into a
//   structured `{ error }` section. The result is also persisted (defensively).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { generateRegulatoryProductResult } from "@/lib/sgtx/regulatory-product";

export const dynamic = "force-dynamic";

function toNum(v: any): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function parseDate(v: any): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (
      !body.jurisdictionCode ||
      !body.originCountry ||
      body.customsValueUsd == null
    ) {
      return NextResponse.json(
        {
          error:
            "jurisdictionCode, originCountry and customsValueUsd required",
        },
        { status: 400 },
      );
    }
    const customsValueUsd = Number(body.customsValueUsd);
    if (!Number.isFinite(customsValueUsd) || customsValueUsd < 0) {
      return NextResponse.json(
        { error: "customsValueUsd must be a non-negative number" },
        { status: 400 },
      );
    }
    const result = await generateRegulatoryProductResult({
      ustn: body.ustn || undefined,
      tradeId: body.tradeId || undefined,
      productName: body.productName || undefined,
      hs6: body.hs6 || undefined,
      composition: body.composition || undefined,
      material: body.material || undefined,
      casNumbers: Array.isArray(body.casNumbers) ? body.casNumbers : undefined,
      jurisdictionCode: String(body.jurisdictionCode),
      originCountry: String(body.originCountry),
      customsValueUsd,
      quantity: toNum(body.quantity),
      netWeightKg: toNum(body.netWeightKg),
      agreementId: body.agreementId || undefined,
      claimPreferential:
        typeof body.claimPreferential === "boolean"
          ? body.claimPreferential
          : undefined,
      materials: Array.isArray(body.materials) ? body.materials : undefined,
      shippingTransshipment:
        typeof body.shippingTransshipment === "boolean"
          ? body.shippingTransshipment
          : undefined,
      exporterApproved:
        typeof body.exporterApproved === "boolean"
          ? body.exporterApproved
          : undefined,
      effectiveDate: parseDate(body.effectiveDate),
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/compute] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
