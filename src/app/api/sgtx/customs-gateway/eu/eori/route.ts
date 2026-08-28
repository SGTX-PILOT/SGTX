// @ts-nocheck
/**
 * SGTX Customs Gateway — EU EORI Validation API
 * ===========================================================================
 *
 * GET /api/sgtx/customs-gateway/eu/eori?number=<EORI>
 *   Validates an EU EORI number (§36, §49) via the EU Customs Gateway.
 *   Returns: { ok, valid, name, country, type }
 *
 * EORI (Economic Operator Registration & Identification) is the unique EU-wide
 * identifier for economic operators. Format:
 *   <ISO-2 country code><national identifier>  e.g.  DE123456789012345
 *
 * CORE_READY: this endpoint validates the EORI format deterministically and
 * returns a synthetic operator record. PRODUCTION would call the Commission's
 * public EORI validation service
 *   https://ec.europa.eu/taxation_customs/dds2/eos/eori_validation.jsp
 *
 * L0: NON-MARKETPLACE — EORI validation is a public registry lookup; it does
 *     NOT authorise a broker or select an adapter. Authorisation is enforced
 *     separately via broker-routing.ts + Governor G1.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { checkEORI } from "@/lib/sgtx/customs-gateway/adapters/eu-gateway";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const eoriNumber = searchParams.get("number");

    if (!eoriNumber) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "EORI number is required. Use: ?number=<EORI>  (e.g. ?number=DE123456789012345)",
        },
        { status: 400 },
      );
    }

    const result = await checkEORI(eoriNumber);
    return NextResponse.json({
      ok: true,
      eori: eoriNumber.toUpperCase().trim(),
      ...result,
      note:
        "EORI validation (§36, §49). CORE_READY — production would call the Commission public " +
        "EORI validation service. This is a registry lookup only — it does NOT authorise the " +
        "broker or select a Member-State adapter (NON-MARKETPLACE).",
    });
  } catch (err: any) {
    logger.error("[api/customs-gateway/eu/eori] GET failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
