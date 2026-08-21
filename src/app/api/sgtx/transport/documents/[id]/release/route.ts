// @ts-nocheck
// §5 Transport Documents — release a document (SURRENDERED → RELEASED).
// POST /api/sgtx/transport/documents/[id]/release  body: { releasedBy }
import { NextResponse } from "next/server";
import { releaseDocument } from "@/lib/sgtx/transport-documents";
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
    if (!body?.releasedBy) {
      return NextResponse.json(
        { error: "releasedBy required" },
        { status: 400 },
      );
    }
    const result = await releaseDocument(id, body.releasedBy);
    if (result && result.ok === false) {
      const status = result.error === "DOCUMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ document: result });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/release] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
