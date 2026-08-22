// @ts-nocheck
// §5 Guarantees — release (discharge obligation)
// POST /api/sgtx/finance/guarantees/[id]/release
import { NextResponse } from "next/server";
import { releaseGuarantee } from "@/lib/sgtx/guarantee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const guarantee = await releaseGuarantee(id);
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees/[id]/release] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
