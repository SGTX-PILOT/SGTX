// @ts-nocheck
// SGTX Phase 2 §3 — Tariff Engine compute API
//   POST /api/sgtx/regulatory/tariff/compute
//   Body: { hs6, hsCode?, jurisdictionCode, originCountry, customsValueUsd,
//           quantity?, netWeightKg?, agreementId?, effectiveDate? }
//   Returns: TariffResult (lines, totalDutyUsd, appliedRate, confidence, ...).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { computeTariff } from "@/lib/sgtx/tariff";

export const dynamic = "force-dynamic";

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
      !body.hs6 ||
      !body.jurisdictionCode ||
      !body.originCountry ||
      body.customsValueUsd == null
    ) {
      return NextResponse.json(
        {
          error:
            "hs6, jurisdictionCode, originCountry, customsValueUsd required",
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
    const result = await computeTariff({
      hs6: String(body.hs6),
      hsCode: body.hsCode || undefined,
      jurisdictionCode: String(body.jurisdictionCode),
      originCountry: String(body.originCountry),
      customsValueUsd,
      quantity:
        body.quantity != null ? Number(body.quantity) : undefined,
      netWeightKg:
        body.netWeightKg != null ? Number(body.netWeightKg) : undefined,
      agreementId: body.agreementId || undefined,
      effectiveDate: parseDate(body.effectiveDate),
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/tariff/compute] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
