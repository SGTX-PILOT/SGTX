// @ts-nocheck
/**
 * SGTX v17 §20 — Certificate Engine API
 * GET /api/sgtx/engines/certificate
 *   No params → list all certificate rules
 *   ?action=getRequired&hsCode=X&origin=Y&dest=Z&transportMode=SEA → required certificates
 *   ?action=validate&certificateNumber=X&type=Y → validate certificate number
 *   ?action=getTypes&hsCode=X&country=Y → list certificate types per (HS, country)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getRequiredCertificates, validateCertificate, getCertificateTypes, listAllCertificateRules,
  type TransportMode,
} from "@/lib/sgtx/engines/certificate-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllCertificateRules(), note: "Use ?action=getRequired|validate|getTypes" });
    }
    if (action === "getRequired") {
      return NextResponse.json({
        ok: true,
        result: getRequiredCertificates(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
          (searchParams.get("transportMode") || "SEA") as TransportMode,
        ),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validateCertificate(
          searchParams.get("certificateNumber") || "",
          searchParams.get("type") || "",
        ),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({
        ok: true,
        result: getCertificateTypes(searchParams.get("hsCode") || "", searchParams.get("country") || ""),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllCertificateRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/certificate] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    if (action === "getRequired") {
      return NextResponse.json({
        ok: true,
        result: getRequiredCertificates(body.hsCode || "", body.origin || "", body.dest || "", body.transportMode || "SEA"),
      });
    }
    if (action === "validate") {
      return NextResponse.json({
        ok: true,
        result: validateCertificate(body.certificateNumber || "", body.type || ""),
      });
    }
    if (action === "getTypes") {
      return NextResponse.json({ ok: true, result: getCertificateTypes(body.hsCode || "", body.country || "") });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/certificate] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
