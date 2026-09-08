// @ts-nocheck
/**
 * SGTX v17 §20 — Document Consistency Engine API
 * GET /api/sgtx/engines/document-consistency
 *   No params → engine info
 *   ?action=validate&ustn=X → cross-validate all trade documents + SPS measures
 *   ?action=checkSet&ustn=X → check required document set + completeness
 *
 * POST /api/sgtx/engines/document-consistency
 *   Body: { ustn, action, documents?: [...] }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateDocumentConsistency, checkDocumentSet,
} from "@/lib/sgtx/engines/document-consistency-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const action = (searchParams.get("action") || "").trim();
    const ustn = searchParams.get("ustn") || "";

    if (!action) {
      return NextResponse.json({
        ok: true,
        engine: "document-consistency",
        description: "Cross-validates all trade documents (invoice, packing list, BL, COO, SPS, controlled-goods license) + checks USTN present on all docs.",
        actions: ["validate", "checkSet"],
        note: "Use ?action=validate&ustn=X or ?action=checkSet&ustn=X. USTN must reference an existing Trade.",
      });
    }
    if (action === "validate") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await validateDocumentConsistency(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "checkSet") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await checkDocumentSet(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/document-consistency] GET failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const action = (body.action || "").trim();
    const ustn = body.ustn || "";
    if (action === "validate") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const r = await validateDocumentConsistency(ustn);
      return NextResponse.json({ ok: true, result: r });
    }
    if (action === "checkSet") {
      if (!ustn) return NextResponse.json({ ok: false, error: "ustn is required" }, { status: 400 });
      const docs = Array.isArray(body.documents) ? body.documents : undefined;
      const r = await checkDocumentSet(ustn, docs);
      return NextResponse.json({ ok: true, result: r });
    }
    return NextResponse.json({ ok: false, error: `Unknown action "${action}"` }, { status: 400 });
  } catch (err: any) {
    logger.error("[api/sgtx/engines/document-consistency] POST failed", { error: err?.message });
    return NextResponse.json({ ok: false, error: err?.message || "internal error" }, { status: 500 });
  }
}
