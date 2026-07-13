// SGTX Tier 2 — Certificate of Origin single-record operations.
//
// GET   /api/sgtx/certificates/[id]
//   Returns the certificate (or 404).
//
// PATCH /api/sgtx/certificates/[id]
//   Updates mutable fields. Used to transition status (PRESENTED / VERIFIED /
//   REJECTED / EXPIRED / REVOKED), set qizNumber, pdfUrl, etc.
//
//   Body: any subset of { status, qizAnnotated, qizNumber, pdfUrl,
//                         documentHash, verificationUrl, expiryDate,
//                         verifiedBy, verifiedAt, originCriterion,
//                         cumulationType, cumulationCountries }.
//
//   Note: verification workflow (`VERIFIED` + `verifiedBy` + `verifiedAt`) has
//   a dedicated endpoint at /api/sgtx/certificates/[id]/verify. PATCH can
//   still set the same fields for batch admin tooling.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/** Allowed values for the `status` field (mirrors Prisma schema comment). */
const STATUSES = new Set([
  "ISSUED",
  "PRESENTED",
  "VERIFIED",
  "REJECTED",
  "EXPIRED",
  "REVOKED",
]);

/** Fields a PATCH caller is allowed to update. */
const PATCHABLE_FIELDS = new Set([
  "status",
  "qizAnnotated",
  "qizNumber",
  "pdfUrl",
  "documentHash",
  "verificationUrl",
  "expiryDate",
  "verifiedBy",
  "verifiedAt",
  "originCriterion",
  "cumulationType",
  "cumulationCountries",
  "issuerGtid",
]);

/**
 * GET handler — fetch a single certificate by id.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const certificate = await db.certificateOfOrigin.findUnique({ where: { id } });
    if (!certificate) {
      return NextResponse.json(
        { error: `Certificate ${id} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, certificate });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/[id]/GET] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/**
 * PATCH handler — update mutable fields on a certificate.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await req.json()) as Record<string, unknown>;

    const updates: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (PATCHABLE_FIELDS.has(key)) {
        updates[key] = value;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { error: "No patchable fields supplied" },
        { status: 400 },
      );
    }

    if (typeof updates.status === "string" && !STATUSES.has(updates.status)) {
      return NextResponse.json(
        { error: `status must be one of: ${Array.from(STATUSES).join(", ")}` },
        { status: 400 },
      );
    }

    // Date conversion for date-typed fields.
    for (const f of ["expiryDate", "verifiedAt"]) {
      if (f in updates && typeof updates[f] === "string" && updates[f]) {
        const d = new Date(updates[f] as string);
        if (isNaN(d.getTime())) {
          return NextResponse.json(
            { error: `Field "${f}" is not a valid date: ${updates[f]}` },
            { status: 400 },
          );
        }
        updates[f] = d;
      }
    }

    // `qizAnnotated` must be boolean.
    if ("qizAnnotated" in updates && typeof updates.qizAnnotated !== "boolean") {
      return NextResponse.json(
        { error: "qizAnnotated must be a boolean" },
        { status: 400 },
      );
    }

    const updated = await db.certificateOfOrigin.update({
      where: { id },
      data: updates as never,
    });

    return NextResponse.json({ ok: true, certificate: updated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/[id]/PATCH] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
