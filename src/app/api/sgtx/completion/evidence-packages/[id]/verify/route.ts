// @ts-nocheck
// §5 Evidence Packages — verify hash (recompute + compare to stored packageHash)
// GET /api/sgtx/completion/evidence-packages/[id]/verify
import { NextResponse } from "next/server";
import { verifyPackageHash } from "@/lib/sgtx/evidence-package";
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
    const verification = await verifyPackageHash(id);
    return NextResponse.json({ verification });
  } catch (err: any) {
    logger.error(
      "[api/completion/evidence-packages/[id]/verify] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
