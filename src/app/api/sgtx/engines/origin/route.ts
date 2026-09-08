// @ts-nocheck
/**
 * SGTX v17 §20 — Origin Engine API
 * GET /api/sgtx/engines/origin
 *   No params → list FTA rules
 *   ?action=validateCertificate&certificateId=X → validate a Certificate of Origin
 *   ?action=getPreferential&ftaCode=X&hsCode=Y&origin=Z&dest=W → check preferential eligibility
 *
 * POST /api/sgtx/engines/origin
 *   Body: { action, goods, manufacturingCountry, materials: [{name, hsCode, originCountry, valueUsd}] }
 *   → determineOrigin
 */

import { NextRequest, NextResponse } from "next/server";
import {
  determineOrigin, validateOriginCertificate, getPreferentialOrigin, listFtaRules,
  type Material,
} from "@/lib/sgtx/engines/origin-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, ftaRules: listFtaRules(), note: "Use ?action=validateCertificate, ?action=getPreferential, or POST action=determine" });
    }
    if (action === "validateCertificate") {
      return NextResponse.json({ ok: true, result: validateOriginCertificate(searchParams.get("certificateId") || "") });
    }
    if (action === "getPreferential") {
      return NextResponse.json({
        ok: true,
        result: getPreferentialOrigin(
          searchParams.get("ftaCode") || "",
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
        ),
      });
    }
    if (action === "listFtaRules") {
      return NextResponse.json({ ok: true, result: listFtaRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/origin] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "determine") {
      const materials: Material[] = Array.isArray(body.materials) ? body.materials : [];
      return NextResponse.json({
        ok: true,
        result: determineOrigin(body.goods || "", body.manufacturingCountry || "", materials),
      });
    }
    if (action === "validateCertificate") {
      return NextResponse.json({ ok: true, result: validateOriginCertificate(body.certificateId || "") });
    }
    if (action === "getPreferential") {
      return NextResponse.json({
        ok: true,
        result: getPreferentialOrigin(body.ftaCode || "", body.hsCode || "", body.origin || "", body.dest || ""),
      });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/origin] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
