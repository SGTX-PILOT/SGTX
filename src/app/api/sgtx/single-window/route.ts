// @ts-nocheck
/**
 * SGTX Part 32 — Single Window API
 * GET /api/sgtx/single-window?country=<CC>
 *   Returns: SingleWindowCapabilities
 * GET /api/sgtx/single-window
 *   Returns: list of supported countries + protocols
 * POST /api/sgtx/single-window
 *   Body: { countryCode, declarationType, data }
 *   Returns: SubmissionResult
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getSingleWindowCapabilities,
  submitViaSingleWindow,
  listSupportedCountries,
  listProtocols,
} from "@/lib/sgtx/single-window";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    if (!country) {
      return NextResponse.json({
        ok: true,
        countries: listSupportedCountries(),
        protocols: listProtocols(),
      });
    }
    const caps = await getSingleWindowCapabilities(country);
    return NextResponse.json({ ok: true, capabilities: caps });
  } catch (err: any) {
    logger.error("[api/single-window] GET failed", { error: err?.message });
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
    if (!body.countryCode) {
      return NextResponse.json(
        { ok: false, error: "countryCode is required" },
        { status: 400 },
      );
    }
    if (!body.declarationType) {
      return NextResponse.json(
        { ok: false, error: "declarationType is required" },
        { status: 400 },
      );
    }
    const result = await submitViaSingleWindow(
      body.countryCode,
      body.declarationType,
      body.data || {},
    );
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/single-window] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
