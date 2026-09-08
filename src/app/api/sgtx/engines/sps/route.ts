// @ts-nocheck
/**
 * SGTX v17 §20 — SPS Engine API
 * GET /api/sgtx/engines/sps
 *   No params → list all SPS rules
 *   ?action=getRequirements&hsCode=X&origin=Y&dest=Z → mandatory SPS measures
 *   ?action=validate&hsCode=X&origin=Y&dest=Z&documents=A,B,C → SPS compliance check
 *
 * POST /api/sgtx/engines/sps
 *   Body: { action, hsCode, origin, dest, documents: [] }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSpsRequirements, validateSpsCompliance, listAllSpsRules,
} from "@/lib/sgtx/engines/sps-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();

    if (!action) {
      return NextResponse.json({ ok: true, rules: listAllSpsRules(), note: "Use ?action=getRequirements|validate" });
    }
    if (action === "getRequirements") {
      return NextResponse.json({
        ok: true,
        result: getSpsRequirements(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
        ),
      });
    }
    if (action === "validate") {
      const docs = (searchParams.get("documents") || "").split(",").map((s) => s.trim()).filter(Boolean);
      return NextResponse.json({
        ok: true,
        result: validateSpsCompliance(
          searchParams.get("hsCode") || "",
          searchParams.get("origin") || "",
          searchParams.get("dest") || "",
          docs,
        ),
      });
    }
    if (action === "listAll") {
      return NextResponse.json({ ok: true, result: listAllSpsRules() });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/sps] GET failed", { error: err?.message });
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
        result: getSpsRequirements(body.hsCode || "", body.origin || "", body.dest || ""),
      });
    }
    if (action === "validate") {
      const docs = Array.isArray(body.documents) ? body.documents : [];
      return NextResponse.json({
        ok: true,
        result: validateSpsCompliance(body.hsCode || "", body.origin || "", body.dest || "", docs),
      });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/sps] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
