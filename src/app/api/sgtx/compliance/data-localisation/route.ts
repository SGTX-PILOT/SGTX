// @ts-nocheck
/**
 * G-16 — Data Localisation Enforcement API route
 * POST /api/sgtx/compliance/data-localisation
 *   Body: {
 *     action: "classify" | "check",
 *     elementName?, elementValue?, jurisdiction?, data?, sourceJurisdiction?, targetJurisdiction?
 *   }
 * GET /api/sgtx/compliance/data-localisation?country=EG
 *   Returns localisation rules for a country (or all if country omitted).
 */

import { NextRequest, NextResponse } from "next/server";
import {
  classifyDataElement,
  checkDataResidency,
  getDataLocalisationRules,
  listSupportedJurisdictions,
} from "@/lib/sgtx/compliance/data-localisation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    if (country) {
      const rules = getDataLocalisationRules(country.toUpperCase());
      return NextResponse.json({ ok: true, rules });
    }
    // List all jurisdictions
    const jurisdictions = listSupportedJurisdictions().map((cc) =>
      getDataLocalisationRules(cc),
    );
    return NextResponse.json({
      ok: true,
      jurisdictions,
      count: jurisdictions.length,
    });
  } catch (err: any) {
    logger.error("[api/compliance/data-localisation] GET failed", {
      error: err?.message,
    });
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
    const action = (body.action || "").toLowerCase();
    if (action === "classify") {
      if (!body.elementName) {
        return NextResponse.json(
          { ok: false, error: "elementName is required for action=classify" },
          { status: 400 },
        );
      }
      if (!body.jurisdiction) {
        return NextResponse.json(
          { ok: false, error: "jurisdiction is required for action=classify" },
          { status: 400 },
        );
      }
      const classification = classifyDataElement(
        body.elementName,
        body.elementValue,
        body.jurisdiction,
      );
      return NextResponse.json({
        ok: true,
        action: "classify",
        elementName: body.elementName,
        jurisdiction: body.jurisdiction,
        classification,
      });
    }
    if (action === "check") {
      if (!body.data || typeof body.data !== "object") {
        return NextResponse.json(
          { ok: false, error: "data (object) is required for action=check" },
          { status: 400 },
        );
      }
      if (!body.sourceJurisdiction || !body.targetJurisdiction) {
        return NextResponse.json(
          {
            ok: false,
            error:
              "sourceJurisdiction and targetJurisdiction are required for action=check",
          },
          { status: 400 },
        );
      }
      const result = checkDataResidency(
        body.data,
        body.sourceJurisdiction,
        body.targetJurisdiction,
      );
      return NextResponse.json({ ok: true, action: "check", result });
    }
    return NextResponse.json(
      {
        ok: false,
        error: `unknown action: ${action}. Valid: classify | check`,
      },
      { status: 400 },
    );
  } catch (err: any) {
    logger.error("[api/compliance/data-localisation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
