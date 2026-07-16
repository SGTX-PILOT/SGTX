/**
 * POST /api/sgtx/execution/dangerous-goods
 *   Create a Dangerous Goods Declaration (IMDG Code) for a container.
 *   Body: see DeclareDgInput in src/lib/sgtx/execution/dangerous-goods.ts.
 *
 * GET /api/sgtx/execution/dangerous-goods?containerId=... | ?ustn=...
 *   List DG declarations filtered by container or trade.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { declareDangerousGoods } from "@/lib/sgtx/execution/dangerous-goods";
import type { DeclareDgInput } from "@/lib/sgtx/execution/dangerous-goods";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/**
 * Create a Dangerous Goods Declaration. Marks the container `isDangerous`
 * and mirrors IMDG class / UN number / packing group / etc. for fast lookup.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Partial<DeclareDgInput>;
    const required: Array<keyof DeclareDgInput> = [
      "containerId",
      "ustn",
      "shippingName",
      "imdgClass",
      "unNumber",
      "packingGroup",
      "marinePollutant",
      "limitedQuantities",
      "emergencyContact",
      "declarantName",
      "declarantGtid",
    ];
    const missing = required.filter((k) => body[k] == null || body[k] === "");
    if (missing.length > 0) {
      return NextResponse.json(
        { ok: false, error: `Missing required fields: ${missing.join(", ")}` },
        { status: 400 },
      );
    }

    const result = await declareDangerousGoods(body as DeclareDgInput);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.reason, code: result.code },
        { status: 400 },
      );
    }

    // Publish a Brain decision event so the orchestrator's learning loop,
    // shadow pipeline, and dataset collector all capture this DG declaration
    // even though the operation itself is dispatched directly by the lib.
    // Wrapped in try/catch so a publish failure never breaks the main op.
    try {
      const inputSummary: Record<string, unknown> = {
        containerId: body.containerId,
        ustn: body.ustn,
        imdgClass: body.imdgClass,
        unNumber: body.unNumber,
      };
      await eventBus.publish(
        "brain.decision.made",
        "execution.dg-declare",
        {
          capability: "execution.dg-declare",
          inputSummary,
          success: true,
          timestamp: Date.now(),
        },
        { source: "execution-dangerous-goods-route" },
      );
    } catch (publishErr) {
      logger.warn("[execution/dangerous-goods/POST] brain.decision.made publish failed", {
        error: publishErr instanceof Error ? publishErr.message : String(publishErr),
      });
    }

    return NextResponse.json({
      ok: true,
      declaration: result.declaration,
      container: result.container,
    });
  } catch (e) {
    logger.error("[execution/dangerous-goods/POST]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/** List DG declarations by containerId or USTN (newest first). */
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

    const records = await db.dangerousGoodsDeclaration.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    return NextResponse.json({ ok: true, declarations: records });
  } catch (e) {
    logger.error("[execution/dangerous-goods/GET]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
