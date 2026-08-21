// @ts-nocheck
// POST /api/sgtx/road/seals/{id}/verify
// Body: { verifiedBy, verifiedLocation }
// Verifies a previously-applied seal (§18).
import { NextRequest, NextResponse } from "next/server";
import { verifySeal } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "seal id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.verifiedBy || !body?.verifiedLocation) {
      return NextResponse.json(
        { error: "verifiedBy and verifiedLocation required" },
        { status: 400 },
      );
    }
    const seal = await verifySeal(id, body.verifiedBy, body.verifiedLocation);
    return NextResponse.json({ seal });
  } catch (err: any) {
    logger.error("[api/road/seals/[id]/verify] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
