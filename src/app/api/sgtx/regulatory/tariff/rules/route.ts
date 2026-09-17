// @ts-nocheck
// SGTX Phase 2 §7 ADMIN — Tariff Rules API
//   GET  /api/sgtx/regulatory/tariff/rules — list rules
//       Query: ?hs6=&jurisdictionId=&originCountry=&tariffType=&agreementId=
//   POST /api/sgtx/regulatory/tariff/rules — upsert a rule
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTariffRules, upsertTariffRule } from "@/lib/sgtx/tariff";

export const dynamic = "force-dynamic";

// GET — list TariffRule rows (only IN_FORCE within effective date window).
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const originCountry = url.searchParams.get("originCountry") || undefined;
    const tariffType = url.searchParams.get("tariffType") || undefined;
    const agreementId = url.searchParams.get("agreementId") || undefined;

    const rules = await listTariffRules({
      hs6,
      jurisdictionId,
      originCountry,
      tariffType,
      agreementId,
    });
    return NextResponse.json({ rules, count: rules.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/tariff/rules] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a TariffRule (find-then-upsert keyed on
// (tariffType, hsCode, jurisdictionId, originCountry, agreementId)).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.tariffType || !body.hsCode || !body.hs6) {
      return NextResponse.json(
        { error: "tariffType, hsCode and hs6 required" },
        { status: 400 },
      );
    }
    const rule = await upsertTariffRule(body);
    return NextResponse.json({ rule });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/tariff/rules] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
