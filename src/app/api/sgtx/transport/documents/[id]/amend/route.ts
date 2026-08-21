// @ts-nocheck
// §5 Transport Documents — amend a document (ISSUED → AMENDED).
// POST /api/sgtx/transport/documents/[id]/amend  body: { amendments }
//
// Snapshots the pre-amendment payload into `attachments` JSON for audit,
// then applies the new amendments. Re-computes the verificationHash.
import { NextResponse } from "next/server";
import { amendDocument } from "@/lib/sgtx/transport-documents";
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
    if (!body || !body.amendments) {
      return NextResponse.json(
        { error: "amendments required" },
        { status: 400 },
      );
    }
    const result = await amendDocument(id, body.amendments);
    if (result && result.ok === false) {
      const status = result.error === "DOCUMENT_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ document: result });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]/amend] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
