// @ts-nocheck
// SGTX Phase 2 §7 — A2 Assist API
//   GET /api/sgtx/regulatory/classification/a2-assist?productName=X
//   Returns: A2Suggestion[] — up to 5 fuzzy classification suggestions.
//   A2 is ADVISORY ONLY — it never writes verdicts (A4 enforces).
//
//   Optional query params (all passed to a2AssistClassification as ClassifyInput):
//     ?productName=X &hs6=Y &composition=Z &material=W &casNumbers=A,B &jurisdictionCode=EG
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { a2AssistClassification } from "@/lib/sgtx/classification";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const productName = url.searchParams.get("productName") || undefined;
    const hs6 = url.searchParams.get("hs6") || undefined;
    const composition = url.searchParams.get("composition") || undefined;
    const material = url.searchParams.get("material") || undefined;
    const jurisdictionCode = url.searchParams.get("jurisdictionCode") || undefined;
    const casRaw = url.searchParams.get("casNumbers") || undefined;
    const casNumbers = casRaw
      ? casRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    if (!productName && !hs6 && !composition) {
      return NextResponse.json(
        { error: "at least one of productName, hs6, composition required" },
        { status: 400 },
      );
    }

    const suggestions = await a2AssistClassification({
      productName,
      hs6,
      composition,
      material,
      casNumbers,
      jurisdictionCode,
    });
    return NextResponse.json({ suggestions, count: suggestions.length });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/classification/a2-assist] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
