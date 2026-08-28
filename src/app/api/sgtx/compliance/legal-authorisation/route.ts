// @ts-nocheck
/**
 * G-17 — Legal Authorisation Report API route
 * GET /api/sgtx/compliance/legal-authorisation?country=EG
 *   Returns authorisation status for a single country, or the full roadmap if omitted.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getJurisdictionAuthorisationStatus,
  getAuthorisationRoadmap,
  listSupportedJurisdictions,
} from "@/lib/sgtx/compliance/legal-authorisation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const country = searchParams.get("country");
    if (country) {
      const status = getJurisdictionAuthorisationStatus(country.toUpperCase());
      return NextResponse.json({ ok: true, status });
    }
    const roadmap = getAuthorisationRoadmap();
    return NextResponse.json({ ok: true, roadmap });
  } catch (err: any) {
    logger.error("[api/compliance/legal-authorisation] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

/** POST — same as GET but accepts JSON body for programmatic callers. */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body?.country) {
      const status = getJurisdictionAuthorisationStatus(
        body.country.toUpperCase(),
      );
      return NextResponse.json({ ok: true, status });
    }
    if (body?.action === "list") {
      return NextResponse.json({
        ok: true,
        jurisdictions: listSupportedJurisdictions(),
      });
    }
    const roadmap = getAuthorisationRoadmap();
    return NextResponse.json({ ok: true, roadmap });
  } catch (err: any) {
    logger.error("[api/compliance/legal-authorisation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
