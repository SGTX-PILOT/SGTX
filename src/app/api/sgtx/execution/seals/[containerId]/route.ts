/**
 * GET  /api/sgtx/execution/seals/[containerId]
 *   Fetch seal info for a specific container.
 *
 * PATCH /api/sgtx/execution/seals/[containerId]
 *   Update seal info. Currently supported patch actions:
 *     - { action: "recordBreak", sealBreakReason }
 *         Sets sealBrokenAt = now() + the break reason.
 *     - { action: "updateNumbers", sealNumber1?, sealNumber2?, verifiedBy? }
 *         Re-records new seal numbers (e.g. after a customs inspection broke
 *         the original seal). Resets sealVerifiedAt = now().
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Container-seals GET. */
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

    const container = await db.tradeContainer.findUnique({
      where: { id: containerId },
      select: {
        id: true,
        sealNumber1: true,
        sealNumber2: true,
        sealVerifiedAt: true,
        sealVerifiedBy: true,
        sealBrokenAt: true,
        sealBreakReason: true,
      },
    });
    if (!container) {
      return NextResponse.json(
        { ok: false, error: `Container ${containerId} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, container });
  } catch (e) {
    logger.error("[execution/seals/[containerId]/GET]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/** Container-seals PATCH — record a seal break, or update seal numbers. */
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
      action?: "recordBreak" | "updateNumbers";
      sealBreakReason?: string;
      sealNumber1?: string;
      sealNumber2?: string | null;
      verifiedBy?: string | null;
    };

    if (!body.action) {
      return NextResponse.json(
        { ok: false, error: 'action is required ("recordBreak" | "updateNumbers")' },
        { status: 400 },
      );
    }

    const existing = await db.tradeContainer.findUnique({
      where: { id: containerId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json(
        { ok: false, error: `Container ${containerId} not found` },
        { status: 404 },
      );
    }

    if (body.action === "recordBreak") {
      if (!body.sealBreakReason || !body.sealBreakReason.trim()) {
        return NextResponse.json(
          { ok: false, error: "sealBreakReason is required for recordBreak" },
          { status: 400 },
        );
      }
      const updated = await db.tradeContainer.update({
        where: { id: containerId },
        data: {
          sealBrokenAt: new Date(),
          sealBreakReason: body.sealBreakReason.trim(),
        },
      });
      logger.info("[seals] break recorded", { containerId });
      return NextResponse.json({ ok: true, container: updated });
    }

    if (body.action === "updateNumbers") {
      if (!body.sealNumber1 || !body.sealNumber1.trim()) {
        return NextResponse.json(
          { ok: false, error: "sealNumber1 is required for updateNumbers" },
          { status: 400 },
        );
      }
      const updated = await db.tradeContainer.update({
        where: { id: containerId },
        data: {
          sealNumber1: body.sealNumber1.trim(),
          sealNumber2: body.sealNumber2?.trim() || null,
          sealVerifiedAt: new Date(),
          sealVerifiedBy: body.verifiedBy?.trim() || null,
          // Reset break fields — new seals invalidate prior break record.
          sealBrokenAt: null,
          sealBreakReason: null,
        },
      });
      logger.info("[seals] numbers updated", { containerId });
      return NextResponse.json({ ok: true, container: updated });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${body.action}` },
      { status: 400 },
    );
  } catch (e) {
    logger.error("[execution/seals/[containerId]/PATCH]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
