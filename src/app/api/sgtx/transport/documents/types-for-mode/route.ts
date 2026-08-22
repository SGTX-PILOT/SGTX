// @ts-nocheck
// §5 Transport Documents — document types applicable to a transport mode (pure).
// GET /api/sgtx/transport/documents/types-for-mode?mode=X
//
// e.g. mode=OCEAN → ["BILL_OF_LADING", "E_BL"]; mode=AIR → ["MAWB", "HAWB", "E_AWB"]; etc.
import { NextResponse } from "next/server";
import { getDocumentTypeForMode } from "@/lib/sgtx/transport-documents";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const mode = url.searchParams.get("mode");
    if (!mode) {
      return NextResponse.json(
        { error: "mode required" },
        { status: 400 },
      );
    }
    const documentTypes = getDocumentTypeForMode(mode);
    return NextResponse.json({ mode, documentTypes });
  } catch (err: any) {
    logger.error("[api/transport/documents/types-for-mode] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
