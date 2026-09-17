// @ts-nocheck
// SGTX Phase 3 §1 — License Engine API
//   GET  /api/sgtx/compliance/licenses         — list TradeLicense rows
//        Query: ?licenseType=&state=&hs6=&jurisdictionId=&applicantGtid=
//   POST /api/sgtx/compliance/licenses         — upsert a TradeLicense
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { listTradeLicenses, upsertTradeLicense } from "@/lib/sgtx/license";

export const dynamic = "force-dynamic";

// GET — list TradeLicense rows filtered by type / state / hs6 / jurisdiction / applicant.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const licenseType = url.searchParams.get("licenseType") || undefined;
    const state = url.searchParams.get("state") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const applicantGtid = url.searchParams.get("applicantGtid") || undefined;

    const licenses = await listTradeLicenses({
      licenseType,
      state,
      hs6,
      jurisdictionId,
      applicantGtid,
    });
    return NextResponse.json({ licenses, count: licenses.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/licenses] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a TradeLicense row. Body = UpsertLicenseInput.
// Calls upsertTradeLicense (find-then-upsert keyed on
// licenseType + hs6 + jurisdictionId + applicantGtid).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.licenseType) {
      return NextResponse.json(
        { error: "licenseType required" },
        { status: 400 },
      );
    }
    const license = await upsertTradeLicense(body);
    return NextResponse.json({ license });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/licenses] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
