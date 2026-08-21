// @ts-nocheck
// §5 Transport Documents — GET single document by document number
// GET /api/sgtx/transport/documents/by-number/[documentNumber]
import { NextResponse } from "next/server";
import { getDocumentByNumber } from "@/lib/sgtx/transport-documents";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ documentNumber: string }> },
) {
  try {
    const { documentNumber } = await params;
    if (!documentNumber) {
      return NextResponse.json(
        { error: "documentNumber required" },
        { status: 400 },
      );
    }
    const document = await getDocumentByNumber(documentNumber);
    if (!document) {
      return NextResponse.json(
        { error: "document not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ document });
  } catch (err: any) {
    logger.error(
      "[api/transport/documents/by-number/[documentNumber]] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
