// @ts-nocheck
/**
 * SGTX v17 §20 — TBT Engine API
 * GET /api/sgtx/engines/tbt
 *   No params → list all TBT rules
 *   ?action=getRequirements&hsCode=X&dest=Y → mandatory TBT measures
 *   ?action=validate&hsCode=X&dest=Y&productSpec=A,B,C → TBT compliance check
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getTbtRequirements, validateTbtCompliance, listAllTbtRules,
} from "@/lib/sgtx/engines/tbt-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllTbtRules(), note: "Use ?action=getRequirements|validate" });
    }
    if (action === "getRequirements") {
      return NextResponse.json({
        ok: true,
        result: getTbtRequirements(searchParams.get("hsCode") || "", searchParams.get("dest") || ""),
      });
    }
    if (action === "validate") {
      const specs = (searchParams.get("productSpec") || "").split(",").map((s) => s.trim()).filter(Boolean);
      return NextResponse.json({
        ok: true,
        result: validateTbtCompliance(searchParams.get("hsCode") || "", searchParams.get("dest") || "", specs),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllTbtRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/tbt] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "getRequirements") {
      return NextResponse.json({
        ok: true,
        result: getTbtRequirements(body.hsCode || "", body.dest || ""),
      });
    }
    if (action === "validate") {
      const specs = Array.isArray(body.productSpec) ? body.productSpec : [];
      return NextResponse.json({
        ok: true,
        result: validateTbtCompliance(body.hsCode || "", body.dest || "", specs),
      });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/tbt] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
