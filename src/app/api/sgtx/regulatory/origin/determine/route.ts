// @ts-nocheck
// SGTX Phase 2 §4 — Origin Engine determine API
//   POST /api/sgtx/regulatory/origin/determine
//   Body: { hs6, originCountry, jurisdictionCode, agreementId?,
//           materials?, transactionValueUsd?, nonOriginValueUsd?,
//           shippingTransshipment?, exporterApproved? }
//   Returns: OriginResult (nonPreferential, preferential?, qualifying, ...).
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { determineOrigin } from "@/lib/sgtx/origin";

export const dynamic = "force-dynamic";

function toNum(v: any): number | undefined {
  if (v == null) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
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
    if (!body.hs6 || !body.originCountry || !body.jurisdictionCode) {
      return NextResponse.json(
        { error: "hs6, originCountry and jurisdictionCode required" },
        { status: 400 },
      );
    }
    const result = await determineOrigin({
      hs6: String(body.hs6),
      originCountry: String(body.originCountry),
      jurisdictionCode: String(body.jurisdictionCode),
      agreementId: body.agreementId || undefined,
      materials: Array.isArray(body.materials) ? body.materials : undefined,
      transactionValueUsd: toNum(body.transactionValueUsd),
      nonOriginValueUsd: toNum(body.nonOriginValueUsd),
      buildUpValueUsd: toNum(body.buildUpValueUsd),
      shippingTransshipment:
        typeof body.shippingTransshipment === "boolean"
          ? body.shippingTransshipment
          : undefined,
      exporterApproved:
        typeof body.exporterApproved === "boolean"
          ? body.exporterApproved
          : undefined,
    });
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/origin/determine] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
