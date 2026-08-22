// @ts-nocheck
// §5 Guarantees — issue. Body: { guaranteeNumber }
// POST /api/sgtx/finance/guarantees/[id]/issue
import { NextResponse } from "next/server";
import { issueGuarantee } from "@/lib/sgtx/guarantee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.guaranteeNumber) {
      return NextResponse.json(
        { error: "guaranteeNumber required" },
        { status: 400 },
      );
    }
    const guarantee = await issueGuarantee(id, body.guaranteeNumber);
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]/issue] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
