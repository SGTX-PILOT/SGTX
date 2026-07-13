/**
 * POST /api/sgtx/execution/vgm
 *   Submit a SOLAS Verified Gross Mass for a packed container.
 *   Body: see SubmitVgmInput in src/lib/sgtx/execution/vgm.ts.
 *
 * GET /api/sgtx/execution/vgm?containerId=... | ?ustn=...
 *   List VGM verifications filtered by container or trade.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { submitVgm } from "@/lib/sgtx/execution/vgm";
import type { SubmitVgmInput } from "@/lib/sgtx/execution/vgm";

export const dynamic = "force-dynamic";

/**
 * Submit a VGM (SOLAS Verified Gross Mass) for a packed container.
 * Creates a `VgmVerification` record and updates the parent `TradeContainer`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<SubmitVgmInput>;
    const {
      containerId,
      ustn,
      vgmKg,
      vgmMethod,
      tareKg,
      cargoKg,
      dunnageKg,
      weighingEquipment,
      weigherName,
      weigherGtid,
      weigherLicense,
      notes,
    } = body;

    if (!containerId || !ustn) {
      return NextResponse.json(
        { ok: false, error: "containerId and ustn are required" },
        { status: 400 },
      );
    }
    if (vgmKg == null || vgmMethod == null) {
      return NextResponse.json(
        { ok: false, error: "vgmKg and vgmMethod are required" },
        { status: 400 },
      );
    }

    const result = await submitVgm({
      containerId,
      ustn,
      vgmKg,
      vgmMethod,
      tareKg,
      cargoKg,
      dunnageKg,
      weighingEquipment,
      weigherName,
      weigherGtid,
      weigherLicense,
      notes,
    });

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
    });
  } catch (e) {
    logger.error("[execution/vgm/POST]", { error: (e as Error)?.message });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/**
 * List VGM verifications by containerId or USTN. Returns newest first.
 */
export async function GET(req: NextRequest) {
  try {
    const containerId = req.nextUrl.searchParams.get("containerId");
    const ustn = req.nextUrl.searchParams.get("ustn");

    if (!containerId && !ustn) {
      return NextResponse.json(
        { ok: false, error: "containerId or ustn query parameter is required" },
        { status: 400 },
      );
    }

    const where: { containerId?: string; ustn?: string } = {};
    if (containerId) where.containerId = containerId;
    if (ustn) where.ustn = ustn;

    const records = await db.vgmVerification.findMany({
      where,
      orderBy: { verifiedAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ ok: true, verifications: records });
  } catch (e) {
    logger.error("[execution/vgm/GET]", { error: (e as Error)?.message });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
