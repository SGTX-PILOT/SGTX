// @ts-nocheck
// §4 Documentary Matching — list. Optional ?ustn=X&lcNumber=Y&matchStatus=Z&readyForPresentation=true
// GET /api/sgtx/finance/documentary-match
import { NextResponse } from "next/server";
import { listDocumentaryMatches } from "@/lib/sgtx/documentary-matching";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const lcNumber = url.searchParams.get("lcNumber") || undefined;
    const matchStatus = url.searchParams.get("matchStatus") || undefined;
    const readyParam = url.searchParams.get("readyForPresentation");
    if (ustn) filters.ustn = ustn;
    if (lcNumber) filters.lcNumber = lcNumber;
    if (matchStatus) filters.matchStatus = matchStatus;
    if (readyParam != null) {
      filters.readyForPresentation = readyParam === "true";
    }
    const matches = await listDocumentaryMatches(filters);
    return NextResponse.json({ matches });
  } catch (err: any) {
    logger.error("[api/finance/documentary-match] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
