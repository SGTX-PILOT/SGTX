// @ts-nocheck
// §5 Transport Documents — all documents for a leg.
// GET /api/sgtx/transport/documents/leg/[legId]
import { NextResponse } from "next/server";
import { getDocumentsForLeg } from "@/lib/sgtx/transport-documents";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ legId: string }> },
) {
  try {
    const { legId } = await params;
    if (!legId) {
      return NextResponse.json({ error: "legId required" }, { status: 400 });
    }
    const documents = await getDocumentsForLeg(legId);
    return NextResponse.json({ documents });
  } catch (err: any) {
    logger.error("[api/transport/documents/leg/[legId]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
