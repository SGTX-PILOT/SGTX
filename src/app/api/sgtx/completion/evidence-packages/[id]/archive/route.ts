// @ts-nocheck
// §5 Evidence Packages — archive (SEALED → ARCHIVED, read-only retention). No body.
// POST /api/sgtx/completion/evidence-packages/[id]/archive
import { NextResponse } from "next/server";
import { archiveEvidencePackage } from "@/lib/sgtx/evidence-package";
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
    const pkg = await archiveEvidencePackage(id);
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error(
      "[api/completion/evidence-packages/[id]/archive] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
