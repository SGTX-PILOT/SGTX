// @ts-nocheck
// §5 Evidence Packages — section evidence (parsed array for one of 26 sections)
// GET /api/sgtx/completion/evidence-packages/[id]/section?section=X
import { NextResponse } from "next/server";
import { getSectionEvidence } from "@/lib/sgtx/evidence-package";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const url = new URL(req.url);
    const section = url.searchParams.get("section") || undefined;
    if (!section) {
      return NextResponse.json(
        { error: "section query parameter required" },
        { status: 400 },
      );
    }
    const evidence = await getSectionEvidence(id, section);
    return NextResponse.json({ section, evidence });
  } catch (err: any) {
    logger.error(
      "[api/completion/evidence-packages/[id]/section] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
