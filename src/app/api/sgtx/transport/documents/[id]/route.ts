// @ts-nocheck
// §5 Transport Documents — GET single document by id
// GET /api/sgtx/transport/documents/[id]
import { NextResponse } from "next/server";
import { getTransportDocument } from "@/lib/sgtx/transport-documents";
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
    const document = await getTransportDocument(id);
    if (!document) {
      return NextResponse.json(
        { error: "document not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ document });
  } catch (err: any) {
    logger.error("[api/transport/documents/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
