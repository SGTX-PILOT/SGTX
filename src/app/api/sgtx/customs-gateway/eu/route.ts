// @ts-nocheck
/**
 * SGTX Customs Gateway — EU Customs Gateway API
 * ===========================================================================
 *
 * GET  /api/sgtx/customs-gateway/eu
 *   Returns the EU gateway descriptor + the status of every EU-wide system.
 *
 * POST /api/sgtx/customs-gateway/eu
 *   Submit an EU customs declaration via the EU Customs Gateway.
 *   Body: { declaration: {...}, memberStateCode: "DE", transactionType?: "IMPORT"|"EXPORT"|"TRANSIT"|"ENS" }
 *
 * Architecture (§5):
 *   SGTX → EU Customs Gateway → EU-wide services + Member-State Adapter Framework → National customs
 *
 * L0: NON-MARKETPLACE — this endpoint NEVER auto-selects a Member-State adapter.
 *     The caller (broker + Governor) chooses the Member State. If the chosen
 *     Member State is NOT_ACTIVE, the endpoint returns a MANUAL_FALLBACK hint
 *     pointing at the national customs portal URL.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  getEUGatewayInfo,
  getEUSystemStatus,
  EU_SYSTEMS,
} from "@/lib/sgtx/customs-gateway/adapters/eu-gateway";
import { submitEUCustoms, getEUCustomsStatus } from "@/lib/sgtx/customs-gateway/adapters/eu-gateway/eu-adapter";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const mrn = searchParams.get("mrn");

    // If ?mrn=<MRN> is provided, return the EU customs status for that MRN.
    if (mrn) {
      const status = await getEUCustomsStatus(mrn);
      return NextResponse.json({
        ok: true,
        mrn,
        status,
      });
    }

    // Default: return the EU gateway descriptor + system status table.
    const info = getEUGatewayInfo();
    const systems = getEUSystemStatus();
    return NextResponse.json({
      ok: true,
      gateway: info,
      systems,
      systemCount: EU_SYSTEMS.length,
      note:
        "EU Customs Gateway coordinates EU-wide services (ICS2, NCTS, AES, CDS, EORI, TARIC, " +
        "EBTI, AEO, PoUS, CSW-CERTEX). Each system is CORE_READY — no production EU API connected. " +
        "National filing is routed via the Member-State Adapter Framework (see /eu/member-states).",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/eu] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "invalid body — JSON object expected" },
        { status: 400 },
      );
    }

    const declaration = body.declaration || body.data || body;
    const memberStateCode = body.memberStateCode || body.memberState || declaration?.memberState;
    const transactionType =
      body.transactionType || declaration?.transactionType || declaration?.regime || "IMPORT";

    if (!declaration) {
      return NextResponse.json(
        { ok: false, error: "declaration is required (body.declaration or body.data)" },
        { status: 400 },
      );
    }
    if (!memberStateCode) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "memberStateCode is required (body.memberStateCode or body.memberState). " +
            "NON-MARKETPLACE: the caller must choose the destination Member State.",
        },
        { status: 400 },
      );
    }

    // Augment the declaration with the resolved transactionType so the adapter
    // routes to the correct EU-wide service.
    const declarationWithType = {
      ...declaration,
      transactionType,
      memberState: memberStateCode,
    };

    const result = await submitEUCustoms(declarationWithType, memberStateCode);
    return NextResponse.json({ ok: result.ok, result });
  } catch (err: any) {
    logger.error("[api/customs-gateway/eu] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
