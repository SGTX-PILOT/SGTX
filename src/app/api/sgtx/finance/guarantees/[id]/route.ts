// @ts-nocheck
// §5 Guarantees — GET single guarantee by database id
// GET /api/sgtx/finance/guarantees/[id]
import { NextResponse } from "next/server";
import { getGuarantee } from "@/lib/sgtx/guarantee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const guarantee = await getGuarantee(id);
    if (!guarantee) {
      return NextResponse.json(
        { error: "guarantee not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
