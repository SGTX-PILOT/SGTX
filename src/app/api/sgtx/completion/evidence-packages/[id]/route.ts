// @ts-nocheck
// §5 Evidence Packages — GET by database id
// GET /api/sgtx/completion/evidence-packages/[id]
import { NextResponse } from "next/server";
import { getEvidencePackage } from "@/lib/sgtx/evidence-package";
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
    const pkg = await getEvidencePackage(id);
    if (!pkg) {
      return NextResponse.json(
        { error: "evidence package not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
