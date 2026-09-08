// @ts-nocheck
/**
 * SGTX v17 §20 — Trade Agreement Engine API
 * GET /api/sgtx/engines/trade-agreement
 *   No params → list all FTAs
 *   ?action=list&countryA=EG&countryB=DE → FTAs between EG and DE
 *   ?action=coverage&ftaCode=EG_EU → FTA coverage details
 *   ?action=eligibility&ftaCode=X&hsCode=Y&origin=Z&dest=W → eligibility check
 *
 * POST /api/sgtx/engines/trade-agreement
 *   Body: { action, ... }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listTradeAgreements, getAgreementCoverage, checkAgreementEligibility, listAllAgreements,
} from "@/lib/sgtx/engines/trade-agreement-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, agreements: listAllAgreements(), note: "Use ?action=list|coverage|eligibility" });
    }
    if (action === "list") {
      return NextResponse.json({ ok: true, result: listTradeAgreements(searchParams.get("countryA") || "", searchParams.get("countryB") || "") });
    }
    if (action === "coverage") {
      const r = getAgreementCoverage(searchParams.get("ftaCode") || "");
      if (!r) return NextResponse.json({ ok: false, error: "Unknown FTA code" }, { status: 400 });
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "eligibility") {
      return NextResponse.json({
        ok: true,
        result: checkAgreementEligibility(
          searchParams.get("ftaCode") || "",
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
        ),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllAgreements() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/trade-agreement] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "list") {
      return NextResponse.json({ ok: true, result: listTradeAgreements(body.countryA || "", body.countryB || "") });
    }
    if (action === "coverage") {
      const r = getAgreementCoverage(body.ftaCode || "");
      if (!r) return NextResponse.json({ ok: false, error: "Unknown FTA code" }, { status: 400 });
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "eligibility") {
      return NextResponse.json({ ok: true, result: checkAgreementEligibility(body.ftaCode || "", body.hsCode || "", body.origin || "", body.dest || "") });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/trade-agreement] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
