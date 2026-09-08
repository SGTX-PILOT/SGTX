// @ts-nocheck
/**
 * SGTX v17 §20 — Permit Engine API
 * GET /api/sgtx/engines/permit
 *   No params → list all permit rules
 *   ?action=checkRequired&hsCode=X&origin=Y&dest=Z → check permit requirement
 *   ?action=validate&permitNumber=X&hsCode=Y&country=Z → validate permit number
 *   ?action=getTypes&hsCode=X&country=Y → list permit types per (HS, country)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  checkPermitRequired, validatePermit, getPermitTypes, listAllPermitRules,
} from "@/lib/sgtx/engines/permit-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllPermitRules(), note: "Use ?action=checkRequired|validate|getTypes" });
    }
    if (action === "checkRequired") {
      return NextResponse.json({
        ok: true,
        result: checkPermitRequired(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
        ),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validatePermit(
          searchParams.get("permitNumber") || "",
          searchParams.get("hsCode") || "",
          searchParams.get("country") || "",
        ),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({
        ok: true,
        result: getPermitTypes(searchParams.get("hsCode") || "", searchParams.get("country") || ""),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllPermitRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/permit] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "checkRequired") {
      return NextResponse.json({
        ok: true,
        result: checkPermitRequired(body.hsCode || "", body.origin || "", body.dest || ""),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validatePermit(body.permitNumber || "", body.hsCode || "", body.country || ""),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({ ok: true, result: getPermitTypes(body.hsCode || "", body.country || "") });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/permit] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
