// @ts-nocheck
// §5 Evidence Packages — amend (creates a NEW version with one section
// overridden). Body: { section, newEvidence, amendedBy }
// POST /api/sgtx/completion/evidence-packages/[id]/amend
import { NextResponse } from "next/server";
import { amendEvidencePackage } from "@/lib/sgtx/evidence-package";
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
    if (!body.section) {
      return NextResponse.json(
        { error: "section required (one of the 26 canonical sections)" },
        { status: 400 },
      );
    }
    if (!body.amendedBy) {
      return NextResponse.json(
        { error: "amendedBy required" },
        { status: 400 },
      );
    }
    const pkg = await amendEvidencePackage(
      id,
      body.section,
      body.newEvidence,
      body.amendedBy,
    );
    return NextResponse.json({ package: pkg });
  } catch (err: any) {
    logger.error("[api/completion/evidence-packages/[id]/amend] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
