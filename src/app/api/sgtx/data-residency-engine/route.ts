// @ts-nocheck
/**
 * SGTX Parts 89+90 — Data Residency Engine API
 * GET /api/sgtx/data-residency-engine?objectType=<TYPE>&jurisdiction=<CC>
 *   Returns: DataClassification
 * GET /api/sgtx/data-residency-engine
 *   Returns: lists of object types, tiers, verdicts
 * POST /api/sgtx/data-residency-engine
 *   Body: { data, sourceJurisdiction, targetJurisdiction }
 *   Returns: ResidencyCheck
 */

import { NextRequest, NextResponse } from "next/server";
import {
  classifyDataObject,
  checkResidencyCompliance,
  listObjectTypes,
  listTiers,
  listVerdicts,
  isEgyptDrContradictionResolved,
} from "@/lib/sgtx/data-residency-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const objectType = searchParams.get("objectType");
    const jurisdiction = searchParams.get("jurisdiction");
    if (objectType && jurisdiction) {
      const classification = await classifyDataObject(objectType, jurisdiction);
      return NextResponse.json({ ok: true, classification });
    }
    return NextResponse.json({
      ok: true,
      objectTypes: listObjectTypes(),
      tiers: listTiers(),
      verdicts: listVerdicts(),
      egyptDrContradictionResolved: isEgyptDrContradictionResolved(),
      note: "Egypt DR contradiction resolved — Egypt production → storage → backup → DR all in-country; no foreign replication.",
    });
  } catch (err: any) {
    logger.error("[api/data-residency-engine] GET failed", { error: err?.message });
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
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { ok: false, error: "data (object) is required" },
        { status: 400 },
      );
    }
    if (!body.sourceJurisdiction || !body.targetJurisdiction) {
      return NextResponse.json(
        { ok: false, error: "sourceJurisdiction and targetJurisdiction are required" },
        { status: 400 },
      );
    }
    const result = await checkResidencyCompliance(
      body.data,
      body.sourceJurisdiction,
      body.targetJurisdiction,
    );
    return NextResponse.json({ ok: true, result });
  } catch (err: any) {
    logger.error("[api/data-residency-engine] POST failed", { error: err?.message });
    return NextResponse.json(
      { ok: false, error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
