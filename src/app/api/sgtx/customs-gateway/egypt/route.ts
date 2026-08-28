// @ts-nocheck
/**
 * SGTX Customs Gateway — Egypt API
 * ===================================
 * POST /api/sgtx/customs-gateway/egypt              — submit to Nafeza/CargoX/ETA/CBE
 *   body: { adapter: "nafeza" | "cargox" | "eta" | "cbe", data: {...} }
 * GET  /api/sgtx/customs-gateway/egypt?ref=<REF>     — poll Egypt status (any sub-adapter)
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  submitNafeza,
  getNafezaStatus,
  submitCargoX,
  submitETA,
  submitCBE,
  getEgyptStatus,
} from "@/lib/sgtx/customs-gateway/adapters/egypt-adapter";

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
    const adapter = (body.adapter || body.subAdapter || "").toLowerCase();
    const data = body.data || body;

    if (adapter === "nafeza") {
      const result = await submitNafeza(data);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (adapter === "cargox") {
      const result = await submitCargoX(data);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (adapter === "eta") {
      const result = await submitETA(data);
      return NextResponse.json({ ok: result.ok, result });
    }
    if (adapter === "cbe") {
      const result = await submitCBE(data);
      return NextResponse.json({ ok: result.ok, result });
    }
    return NextResponse.json(
      { ok: false, error: `unknown adapter: ${adapter}. Use one of: nafeza, cargox, eta, cbe` },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/customs-gateway/egypt] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ref = searchParams.get("ref");
    const nafezaOnly = searchParams.get("nafeza");

    if (ref) {
      if (nafezaOnly === "1") {
        const status = await getNafezaStatus(ref);
        return NextResponse.json({ ok: true, status });
      }
      const status = await getEgyptStatus(ref);
      return NextResponse.json({ ok: true, status });
    }

    return NextResponse.json({
      ok: true,
      adapterId: "EG_NAFEZA",
      usage: {
        nafeza: "POST with { adapter: 'nafeza', data: { ustn, acid, ... } }",
        cargox: "POST with { adapter: 'cargox', data: { ustn, shipperTaxId, ... } }",
        eta: "POST with { adapter: 'eta', data: { ustn, invoiceXml, invoiceNumber } }",
        cbe: "POST with { adapter: 'cbe', data: { ustn, fromIban, toIban, amountUsd } }",
        status: "GET ?ref=<EXTERNAL_REF> (any sub-adapter reference)",
      },
      status: "CORE_READY",
      mode: "SIMULATION",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/egypt] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
