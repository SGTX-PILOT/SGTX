/**
 * GET  /api/sgtx/execution/dangerous-goods/[containerId]
 *   Fetch the latest DG declaration for a container + denormalised DG fields.
 *
 * PATCH /api/sgtx/execution/dangerous-goods/[containerId]
 *   Update a DG declaration. Currently supported patch actions:
 *     - { action: "sign", declarationId? }
 *         Marks declarantSigned=true + signedAt=now(). If declarationId is
 *         omitted, signs the latest declaration for the container.
 */
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { getDgDeclaration, signDgDeclaration } from "@/lib/sgtx/execution/dangerous-goods";

export const dynamic = "force-dynamic";

/** Container-DG GET — latest declaration + denormalised container fields. */
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

    const declaration = await getDgDeclaration(containerId);
    const container = await db.tradeContainer.findUnique({
      where: { id: containerId },
      select: {
        id: true,
        isDangerous: true,
        imdgClass: true,
        unNumber: true,
        properShippingName: true,
        packingGroup: true,
        flashpointC: true,
        marinePollutant: true,
        dgDeclarationDocId: true,
        segregationCode: true,
        emergencyContact: true,
        limitedQuantities: true,
      },
    });

    if (!container && !declaration) {
      return NextResponse.json(
        { ok: false, error: `Container ${containerId} not found` },
        { status: 404 },
      );
    }

    return NextResponse.json({ ok: true, declaration, container });
  } catch (e) {
    logger.error("[execution/dangerous-goods/[containerId]/GET]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}

/** Container-DG PATCH — sign declaration. */
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
      action?: "sign" | "linkDoc";
      declarationId?: string;
      dgDeclarationDocId?: string;
    };

    if (!body.action) {
      return NextResponse.json(
        { ok: false, error: 'action is required ("sign" | "linkDoc")' },
        { status: 400 },
      );
    }

    if (body.action === "sign") {
      let declarationId = body.declarationId;
      if (!declarationId) {
        const latest = await getDgDeclaration(containerId);
        if (!latest) {
          return NextResponse.json(
            { ok: false, error: "No DG declaration to sign for this container" },
            { status: 404 },
          );
        }
        declarationId = latest.id;
      }
      const result = await signDgDeclaration(declarationId);
      if (!result.ok) {
        return NextResponse.json(
          { ok: false, error: result.reason, code: result.code },
          { status: 400 },
        );
      }
      return NextResponse.json({ ok: true, declaration: result.declaration });
    }

    if (body.action === "linkDoc") {
      if (!body.dgDeclarationDocId) {
        return NextResponse.json(
          { ok: false, error: "dgDeclarationDocId is required for linkDoc" },
          { status: 400 },
        );
      }
      const updated = await db.tradeContainer.update({
        where: { id: containerId },
        data: { dgDeclarationDocId: body.dgDeclarationDocId },
      });
      return NextResponse.json({ ok: true, container: updated });
    }

    return NextResponse.json(
      { ok: false, error: `Unsupported action: ${body.action}` },
      { status: 400 },
    );
  } catch (e) {
    logger.error("[execution/dangerous-goods/[containerId]/PATCH]", {
      error: (e as Error)?.message,
    });
    return NextResponse.json(
      { ok: false, error: (e as Error)?.message || "Internal server error" },
      { status: 500 },
    );
  }
}
