// @ts-nocheck
/**
 * SGTX Customs Gateway — US ACE API
 * ===================================
 * POST /api/sgtx/customs-gateway/us-ace              — submit a declaration to ACE
 *   body: { declaration, action: "submit" | "amend" | "cancel" | "isf", isfData? }
 * GET  /api/sgtx/customs-gateway/us-ace?entry=<N>     — poll ACE status
 * GET  /api/sgtx/customs-gateway/us-ace?pga=1&hs=<HS>&desc=<DESC> — PGA routing
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitACE,
  getACEStatus,
  amendACE,
  cancelACE,
  submitISF,
  checkPGARequirements,
} from "@/lib/sgtx/customs-gateway/adapters/us-ace-adapter";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }
    const action = body.action || "submit";
    if (action === "submit") {
      const result = await submitACE(body.declaration || body);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (action === "amend") {
      const result = await amendACE(body.declaration || body);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (action === "cancel") {
      const entryNumber = body.entryNumber || body.externalRef;
      if (!entryNumber) {
        return NextResponse.json(
          { ok: false, error: "entryNumber is required for cancel" },
          { status: 400 },
        );
      }
      const result = await cancelACE(entryNumber);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (action === "isf") {
      const result = await submitISF(body.isfData || body);
      return NextResponse.json({ ok: result.ok, result });
    }
    return NextResponse.json(
      { ok: false, error: `unknown action: ${action}` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/us-ace] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const entryNumber = searchParams.get("entry");
    const pgaMode = searchParams.get("pga");
    const hsCode = searchParams.get("hs") || "";
    const desc = searchParams.get("desc") || "";

    if (pgaMode === "1") {
      const reqs = await checkPGARequirements(hsCode, desc);
      return NextResponse.json({ ok: true, hsCode, pgaRequirements: reqs });
    }

    if (entryNumber) {
      const status = await getACEStatus(entryNumber);
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({
      ok: true,
      adapterId: "US_ACE",
      usage: {
        submit: "POST with { action: 'submit', declaration: {...} }",
        amend: "POST with { action: 'amend', declaration: { entryNumber, ... } }",
        cancel: "POST with { action: 'cancel', entryNumber }",
        isf: "POST with { action: 'isf', isfData: {...} }",
        status: "GET ?entry=<ENTRY_NUMBER>",
        pga: "GET ?pga=1&hs=<HS_CODE>&desc=<PRODUCT_DESCRIPTION>",
      },
      status: "CORE_READY",
      mode: "SIMULATION",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/us-ace] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
