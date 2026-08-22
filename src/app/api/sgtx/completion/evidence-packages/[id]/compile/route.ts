// @ts-nocheck
// §5 Evidence Packages — compile (load all 26 sections). No body.
// POST /api/sgtx/completion/evidence-packages/[id]/compile
import { NextResponse } from "next/server";
import { compileEvidencePackage } from "@/lib/sgtx/evidence-package";
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
    const pkg = await compileEvidencePackage(id);
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages/[id]/compile] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
