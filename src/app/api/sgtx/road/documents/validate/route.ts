// @ts-nocheck
// POST /api/sgtx/road/documents/validate
// Body: { ustn }
// Validates document consistency (§11) — checks that every document attached
// to the USTN agrees on the core trade facts (shipper, consignee, origin,
// destination, gross weight, cargo description).
import { NextRequest, NextResponse } from "next/server";
import { validateDocumentConsistency } from "@/lib/sgtx/road-corridor";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body?.ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await validateDocumentConsistency(body.ustn);
    return NextResponse.json(result);
  } catch (err: any) {
    logger.error("[api/road/documents/validate] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
