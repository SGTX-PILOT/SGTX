// @ts-nocheck
// §5 Transport Documents — cancel a document (any non-VOID → CANCELLED).
// POST /api/sgtx/transport/documents/[id]/cancel  body: { reason }
import { NextResponse } from "next/server";
import { cancelDocument } from "@/lib/sgtx/transport-documents";
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
    if (!body?.reason) {
      return NextResponse.json(
        { error: "reason required" },
        { status: 400 },
      );
    }
    const result = await cancelDocument(id, body.reason);
    if (result && result.ok === false) {
      const status = result.error === "DOCUMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ document: result });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/cancel] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
