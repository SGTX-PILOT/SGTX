// @ts-nocheck
// SGTX v17 §16.8.12 — QC Inspector App · submit endpoint
// POST /api/sgtx/mobile/inspector/submit
//   body: {
//     inspectionId: string,
//     result: {
//       pass: boolean,
//       deficiencies: string[],
//       photos: [{ hash: string, label?: string }],
//       sensorData?: object,
//       conditionalPass?: boolean
//     },
//     inspectorGtid?: string
//   }
//   → 200 {
//        ok,
//        submitted: boolean,
//        actionPlanRequired: boolean,
//        actionPlanId?: string,
//        reason?: string
//      }
//
// Updates the QcInspection row + creates a QcActionPlan if the result is
// FAIL or CONDITIONAL_PASS (which blocks settlement per v17 §12.5).

import { NextRequest, NextResponse } from "next/server";
import { submitInspection, capturePhoto } from "@/lib/sgtx/mobile";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    const inspectionId = String(body.inspectionId ?? "");
    if (!inspectionId) {
      return NextResponse.json({ ok: false, error: "inspectionId required" }, { status: 400 });
    }
    const result = body.result;
    if (!result || typeof result.pass !== "boolean") {
      return NextResponse.json(
        { ok: false, error: "result.pass (boolean) required" },
        { status: 400 },
      );
    }

    // Optional: capture photo if photoBase64 was supplied inline
    if (Array.isArray(body.capturePhotos)) {
      for (const p of body.capturePhotos) {
        if (p.photoBase64) {
          const cap = capturePhoto(inspectionId, p.photoBase64, p.metadata);
          if (!Array.isArray(result.photos)) result.photos = [];
          result.photos.push({ hash: cap.hash, label: p.label });
        }
      }
    }

    const submitResult = await submitInspection(
      inspectionId,
      {
        pass: result.pass,
        deficiencies: Array.isArray(result.deficiencies) ? result.deficiencies : [],
        photos: Array.isArray(result.photos) ? result.photos : [],
        sensorData: result.sensorData,
        conditionalPass: Boolean(result.conditionalPass),
      },
      body.inspectorGtid ? String(body.inspectorGtid) : undefined,
    );
    return NextResponse.json({ ok: true, ...submitResult });
  } catch (err) {
    logger.error("mobile.inspector.submit.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "submit failed" }, { status: 500 });
  }
}

// Photo capture endpoint (POST with photoBase64 → hash)
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ ok: false, error: "invalid JSON body" }, { status: 400 });
    }
    if (!body.photoBase64) {
      return NextResponse.json({ ok: false, error: "photoBase64 required" }, { status: 400 });
    }
    const cap = capturePhoto(
      String(body.inspectionId ?? ""),
      String(body.photoBase64),
      body.metadata,
    );
    return NextResponse.json({ ok: true, ...cap });
  } catch (err) {
    logger.error("mobile.inspector.capture.route.failed", { err: String(err) });
    return NextResponse.json({ ok: false, error: "capture failed" }, { status: 500 });
  }
}
