// POST /api/sgtx/shippers-declaration/sign — sign a shipper's declaration
//
// Body:
//   { declarationId: string }
//
// Sets signed=true, signedAt=now. Idempotent: re-signing an already-signed
// declaration returns 200 with idempotent=true.
//
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { declarationId } = body || {};

    if (!declarationId) {
      return NextResponse.json({ error: "Missing required field: declarationId" }, { status: 400 });
    }

    const existing = await (db as any).shippersDeclaration.findUnique({
      where: { id: declarationId },
    });
    if (!existing) {
      return NextResponse.json({ error: "declaration not found" }, { status: 404 });
    }

    if (existing.signed) {
      return NextResponse.json({
        ok: true,
        declarationId: existing.id,
        signed: true,
        signedAt: existing.signedAt,
        idempotent: true,
      });
    }

    const updated = await (db as any).shippersDeclaration.update({
      where: { id: declarationId },
      data: { signed: true, signedAt: new Date() },
    });

    logger.info("[shippers-declaration/sign] signed", { declId: declarationId });

    return NextResponse.json({
      ok: true,
      declarationId: updated.id,
      signed: true,
      signedAt: updated.signedAt,
    });
  } catch (e: any) {
    logger.error("[shippers-declaration/sign] error", { error: e?.message || String(e) });
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}
