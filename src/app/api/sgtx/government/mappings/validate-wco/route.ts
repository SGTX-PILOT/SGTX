// @ts-nocheck
// SGTX Phase 4 §3 — Single Window API
//   POST /api/sgtx/government/mappings/validate-wco — validate against WCO Data Model
//   Body: { payload }
//   Calls validateAgainstWcoDataModel(payload) — sanity-checks the payload
//   against the WCO Data Model 3.0+ top-level required fields. This is NOT a
//   full WCO schema validator; it checks the universally-required fields.
//   Returns { valid, errors, warnings }.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { validateAgainstWcoDataModel } from "@/lib/sgtx/single-window";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (body.payload === undefined || body.payload === null) {
      return NextResponse.json(
        { error: "payload required" },
        { status: 400 },
      );
    }
    const result = await validateAgainstWcoDataModel(body.payload);
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/government/mappings/validate-wco] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
