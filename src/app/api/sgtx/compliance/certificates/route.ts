// @ts-nocheck
// SGTX Phase 3 §3 — Certificate Engine API
//   GET  /api/sgtx/compliance/certificates       — list RegulatoryCertificate rows
//        Query: ?certificateType=&state=&hs6=&jurisdictionId=&applicantGtid=
//   POST /api/sgtx/compliance/certificates       — upsert a RegulatoryCertificate
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import {
  listRegulatoryCertificates,
  upsertRegulatoryCertificate,
} from "@/lib/sgtx/certificate";

export const dynamic = "force-dynamic";

// GET — list RegulatoryCertificate rows filtered by type / state / hs6 /
// jurisdiction / applicant.
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const certificateType = url.searchParams.get("certificateType") || undefined;
    const state = url.searchParams.get("state") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const jurisdictionId = url.searchParams.get("jurisdictionId") || undefined;
    const applicantGtid = url.searchParams.get("applicantGtid") || undefined;

    const certificates = await listRegulatoryCertificates({
      certificateType,
      state,
      hs6,
      jurisdictionId,
      applicantGtid,
    });
    return NextResponse.json({ certificates, count: certificates.length });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/certificates] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

// POST — upsert a RegulatoryCertificate row. Body = UpsertCertificateInput.
// Calls upsertRegulatoryCertificate (find-then-upsert keyed on
// certificateType + hs6 + jurisdictionId + applicantGtid).
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    if (!body.certificateType) {
      return NextResponse.json(
        { error: "certificateType required" },
        { status: 400 },
      );
    }
    const certificate = await upsertRegulatoryCertificate(body);
    return NextResponse.json({ certificate });
  } catch (err: any) {
    logger.error("[api/sgtx/compliance/certificates] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
