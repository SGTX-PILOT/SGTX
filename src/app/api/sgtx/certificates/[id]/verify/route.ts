// SGTX Tier 2 — Certificate of Origin verification endpoint (customs authority).
//
// POST /api/sgtx/certificates/[id]/verify
//   Body: { verifiedBy }
//
//   Sets `status = "VERIFIED"`, `verifiedBy`, `verifiedAt = now()`. The
//   caller (typically a customs-authority integration) is identified by the
//   `verifiedBy` GTID/string.
//
//   Idempotency: calling verify twice on an already-VERIFIED certificate is
//   allowed — the verifiedAt timestamp is refreshed and verifiedBy updated.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

/**
 * POST handler — mark a certificate as VERIFIED by a customs authority.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id is required" }, { status: 400 });
    }

    const body = (await req.json()) as { verifiedBy?: string };
    if (!body.verifiedBy || typeof body.verifiedBy !== "string") {
      return NextResponse.json(
        { error: "verifiedBy is required (customs authority GTID or name)" },
        { status: 400 },
      );
    }

    const existing = await db.certificateOfOrigin.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!existing) {
      return NextResponse.json(
        { error: `Certificate ${id} not found` },
        { status: 404 },
      );
    }

    // Revoked or rejected certificates cannot be verified.
    if (existing.status === "REVOKED" || existing.status === "REJECTED") {
      return NextResponse.json(
        { error: `Certificate ${id} is ${existing.status} and cannot be verified` },
        { status: 409 },
      );
    }

    const now = new Date();
    const updated = await db.certificateOfOrigin.update({
      where: { id },
      data: {
        status: "VERIFIED",
        verifiedBy: body.verifiedBy,
        verifiedAt: now,
      },
    });

    return NextResponse.json({
      ok: true,
      certificateId: updated.id,
      status: updated.status,
      verifiedBy: updated.verifiedBy,
      verifiedAt: updated.verifiedAt,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/[id]/verify/POST] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
