// @ts-nocheck
// §5 Transport Documents — verify a document's integrity (SHA-256 hash recompute).
// POST /api/sgtx/transport/documents/[id]/verify  body: { verifiedBy }
//
// Returns:
//   • valid: true iff the document exists, has a hash, and the recomputed
//            hash matches.
//   • hashMatch: true iff the hashes match (regardless of doc existence).
//   • reason: human-readable explanation.
import { NextResponse } from "next/server";
import { verifyDocument } from "@/lib/sgtx/transport-documents";
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
    const body = await req.json().catch(() => ({}));
    const verifiedBy = body?.verifiedBy || "system";
    const result = await verifyDocument(id, verifiedBy);
    if (result.reason === "DOCUMENT_NOT_FOUND") {
      return NextResponse.json(
        { error: "document not found" },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/verify] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
