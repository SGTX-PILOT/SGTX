/**
 * POST /api/sgtx/execution/seals
 *   Record container seal numbers (anti-pilferage chain of custody).
 *   Body: { containerId, sealNumber1, sealNumber2?, verifiedBy? }
 *   Sets sealVerifiedAt = now() on the container.
 *
 * GET /api/sgtx/execution/seals?containerId=...
 *   Fetch seal info for a container.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Body for the POST record-seals endpoint. */
interface RecordSealsBody {
  containerId?: string;
  sealNumber1?: string;
  sealNumber2?: string | null;
  verifiedBy?: string | null;
}

/**
 * Record the primary (and optional secondary) seal numbers for a container.
 * Sets `sealVerifiedAt = now()` to confirm the seals were affixed + verified.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RecordSealsBody;
    if (!body.containerId) {
      return NextResponse.json(
        { ok: false, error: "containerId is required" },
        { status: 400 },
      );
    }
    if (!body.sealNumber1 || !body.sealNumber1.trim()) {
      return NextResponse.json(
        { ok: false, error: "sealNumber1 is required" },
        { status: 400 },
      );
    }

    const container = await db.tradeContainer.findUnique({
      where: { id: body.containerId },
      select: { id: true, sealNumber1: true, sealVerifiedAt: true },
    });
    if (!container) {
      return NextResponse.json(
        { ok: false, error: `Container ${body.containerId} not found` },
        { status: 404 },
      );
    }

    const updated = await db.tradeContainer.update({
      where: { id: body.containerId },
      data: {
        sealNumber1: body.sealNumber1.trim(),
        sealNumber2: body.sealNumber2?.trim() || null,
        sealVerifiedAt: new Date(),
        sealVerifiedBy: body.verifiedBy?.trim() || null,
      },
    });

    logger.info("[seals] recorded", {
      containerId: body.containerId,
      sealNumber1: body.sealNumber1,
      hasSecondary: !!body.sealNumber2,
    });

    return NextResponse.json({ ok: true, container: updated });
  } catch (e) {
    logger.error("[execution/seals/POST]", { error: (e as Error)?.message });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/** Fetch seal info for a container. */
export async function GET(req: NextRequest) {
  try {
    const containerId = req.nextUrl.searchParams.get("containerId");
    if (!containerId) {
      return NextResponse.json(
        { ok: false, error: "containerId query parameter is required" },
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
    logger.error("[execution/seals/GET]", { error: (e as Error)?.message });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
