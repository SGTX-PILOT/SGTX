/**
 * GET  /api/sgtx/execution/vgm/[containerId]
 *   Fetch the latest VGM verification for a container + the container's
 *   denormalised vgm* fields.
 *
 * PATCH /api/sgtx/execution/vgm/[containerId]
 *   Update a VGM record. Currently supported patch actions:
 *     - { action: "submitToCarrier", carrierGtid }
 *         Generates a submissionRef + sets submittedToCarrier/submittedAt.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { getVgm, submitVgmToCarrier } from "@/lib/sgtx/execution/vgm";

export const dynamic = "force-dynamic";

/** Container-VGM GET — latest VGM + denormalised container fields. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ containerId: string }> },
) {
  try {
    const { containerId } = await params;
    if (!containerId) {
      return NextResponse.json(
        { ok: false, error: "containerId path segment is required" },
        { status: 400 },
      );
    }

    const verification = await getVgm(containerId);
    const container = await db.tradeContainer.findUnique({
      where: { id: containerId },
      select: {
        id: true,
        vgmKg: true,
        vgmMethod: true,
        vgmVerifiedAt: true,
        vgmVerifiedBy: true,
        vgmSubmissionRef: true,
        vgmExempt: true,
      },
    });

    if (!container && !verification) {
      return NextResponse.json(
        { ok: false, error: `Container ${containerId} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, verification, container });
  } catch (e) {
    logger.error("[execution/vgm/[containerId]/GET]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/** Container-VGM PATCH — submit-to-carrier, set exemption, etc. */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ containerId: string }> },
) {
  try {
    const { containerId } = await params;
    if (!containerId) {
      return NextResponse.json(
        { ok: false, error: "containerId path segment is required" },
        { status: 400 },
      );
    }

    const body = (await req.json()) as {
      action?: "submitToCarrier" | "setExempt";
      carrierGtid?: string;
      exempt?: boolean;
    };

    if (!body.action) {
      return NextResponse.json(
        { ok: false, error: 'action is required ("submitToCarrier" | "setExempt")' },
        { status: 400 },
      );
    }

    if (body.action === "submitToCarrier") {
      if (!body.carrierGtid) {
        return NextResponse.json(
          { ok: false, error: "carrierGtid is required for submitToCarrier" },
          { status: 400 },
        );
      }
      const result = await submitVgmToCarrier(containerId, body.carrierGtid);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.reason, code: result.code },
          { status: 400 },
        );
      }
      return NextResponse.json({
        ok: true,
        verification: result.verification,
        container: result.container,
        submissionRef: result.submissionRef,
      });
    }

    if (body.action === "setExempt") {
      const updated = await db.tradeContainer.update({
        where: { id: containerId },
        data: {
          vgmExempt: body.exempt ?? true,
          // If marking exempt, keep vgmKg untouched — exemption is independent
          // of any prior (possibly erroneous) verification.
        },
      });
      return NextResponse.json({ ok: true, container: updated });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${body.action}` },
      { status: 400 },
    );
  } catch (e) {
    logger.error("[execution/vgm/[containerId]/PATCH]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
