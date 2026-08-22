// @ts-nocheck
// §5 Transport Documents — issue a document (DRAFT → ISSUED).
// POST /api/sgtx/transport/documents/[id]/issue  body: { documentNumber, payload? }
//
// Computes the SHA-256 verificationHash of the final payload + metadata.
import { NextResponse } from "next/server";
import { issueDocument } from "@/lib/sgtx/transport-documents";
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
    if (!body.documentNumber) {
      return NextResponse.json(
        { error: "documentNumber required" },
        { status: 400 },
      );
    }
    const result = await issueDocument(id, body.documentNumber, body.payload);
    if (result && result.ok === false) {
      const status = result.error === "DOCUMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ document: result });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/issue] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
