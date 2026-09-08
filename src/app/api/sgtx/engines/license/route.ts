// @ts-nocheck
/**
 * SGTX v17 §20 — License Engine API
 * GET /api/sgtx/engines/license
 *   No params → list all license rules
 *   ?action=checkRequired&hsCode=X&origin=Y&dest=Z&txType=IMPORT → check license requirement
 *   ?action=validate&licenseNumber=X&hsCode=Y&country=Z → validate license number
 *   ?action=getTypes&hsCode=X&country=Y → list license types per (HS, country)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  checkLicenseRequired, validateLicense, getLicenseTypes, listAllLicenseRules,
  type TransactionType,
} from "@/lib/sgtx/engines/license-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllLicenseRules(), note: "Use ?action=checkRequired|validate|getTypes" });
    }
    if (action === "checkRequired") {
      return NextResponse.json({
        ok: true,
        result: checkLicenseRequired(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
          (searchParams.get("txType") || "IMPORT") as TransactionType,
        ),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validateLicense(
          searchParams.get("licenseNumber") || "",
          searchParams.get("hsCode") || "",
          searchParams.get("country") || "",
        ),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({
        ok: true,
        result: getLicenseTypes(searchParams.get("hsCode") || "", searchParams.get("country") || ""),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllLicenseRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/license] GET failed", { error: err?.message });
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
        result: checkLicenseRequired(body.hsCode || "", body.origin || "", body.dest || "", body.txType || "IMPORT"),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validateLicense(body.licenseNumber || "", body.hsCode || "", body.country || ""),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({ ok: true, result: getLicenseTypes(body.hsCode || "", body.country || "") });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/license] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
