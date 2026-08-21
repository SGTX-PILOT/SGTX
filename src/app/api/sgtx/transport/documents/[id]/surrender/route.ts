// @ts-nocheck
// §5 Transport Documents — surrender a document (ISSUED → SURRENDERED).
// POST /api/sgtx/transport/documents/[id]/surrender
import { NextResponse } from "next/server";
import { surrenderDocument } from "@/lib/sgtx/transport-documents";
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
    const result = await surrenderDocument(id);
    if (result && result.ok === false) {
      const status = result.error === "DOCUMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ document: result });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/surrender] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
