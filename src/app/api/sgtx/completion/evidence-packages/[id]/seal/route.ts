// @ts-nocheck
// §5 Evidence Packages — seal (DRAFT → SEALED, computes packageHash). Body: { sealedBy }
// POST /api/sgtx/completion/evidence-packages/[id]/seal
// Returns the packageHash along with the sealed package.
import { NextResponse } from "next/server";
import { sealEvidencePackage } from "@/lib/sgtx/evidence-package";
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
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.sealedBy) {
      return NextResponse.json(
        { error: "sealedBy required" },
        { status: 400 },
      );
    }
    const pkg = await sealEvidencePackage(id, body.sealedBy);
    return NextResponse.json({
      package: pkg,
      packageHash: pkg?.packageHash ?? null,
    });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages/[id]/seal] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
