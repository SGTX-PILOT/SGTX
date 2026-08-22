// @ts-nocheck
// §2 Regulatory Changes — list (GET) + detect/create (POST)
// GET  /api/sgtx/regulatory/changes?changeCategory=X&jurisdictionCode=Y&pipelineStatus=Z&impactSeverity=W
//      → listRegulatoryChanges
// POST /api/sgtx/regulatory/changes  body: DetectChangeInput  → detectRegulatoryChange
import { NextResponse } from "next/server";
import {
  listRegulatoryChanges,
  detectRegulatoryChange,
  isValidChangeCategory,
  isValidChangeType,
} from "@/lib/sgtx/regulatory-change";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const changeCategory = url.searchParams.get("changeCategory") || undefined;
    const jurisdictionCode =
      url.searchParams.get("jurisdictionCode") || undefined;
    const pipelineStatus = url.searchParams.get("pipelineStatus") || undefined;
    const impactSeverity =
      url.searchParams.get("impactSeverity") || undefined;
    const effectiveDateFrom = url.searchParams.get("effectiveDateFrom");
    const effectiveDateTo = url.searchParams.get("effectiveDateTo");
    if (changeCategory) filters.changeCategory = changeCategory;
    if (jurisdictionCode) filters.jurisdictionCode = jurisdictionCode;
    if (pipelineStatus) filters.pipelineStatus = pipelineStatus;
    if (impactSeverity) filters.impactSeverity = impactSeverity;
    if (effectiveDateFrom) filters.effectiveDateFrom = new Date(effectiveDateFrom);
    if (effectiveDateTo) filters.effectiveDateTo = new Date(effectiveDateTo);
    const changes = await listRegulatoryChanges(filters);
    return NextResponse.json({ changes });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/changes] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "invalid body" }, { status: 400 });
    }
    if (!body.changeCategory || !isValidChangeCategory(body.changeCategory)) {
      return NextResponse.json(
        { error: "valid changeCategory required" },
        { status: 400 },
      );
    }
    if (!body.changeType || !isValidChangeType(body.changeType)) {
      return NextResponse.json(
        { error: "valid changeType required" },
        { status: 400 },
      );
    }
    if (!body.title || typeof body.title !== "string") {
      return NextResponse.json({ error: "title required" }, { status: 400 });
    }
    if (!body.jurisdictionCode || typeof body.jurisdictionCode !== "string") {
      return NextResponse.json(
        { error: "jurisdictionCode required" },
        { status: 400 },
      );
    }
    const change = await detectRegulatoryChange(body);
    return NextResponse.json({ change });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/changes] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
