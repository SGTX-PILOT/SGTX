// @ts-nocheck
// §3 LC Lifecycle — list (GET) + create (POST)
// GET  /api/sgtx/finance/lc-lifecycles?ustn=X&currentStep=Y&status=Z
// POST /api/sgtx/finance/lc-lifecycles  body: CreateLcInput
import { NextResponse } from "next/server";
import {
  listLcLifecycles,
  createLcLifecycle,
} from "@/lib/sgtx/lc-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const currentStep = url.searchParams.get("currentStep") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (currentStep) filters.currentStep = currentStep;
    if (status) filters.status = status;
    const lifecycles = await listLcLifecycles(filters);
    return NextResponse.json({ lifecycles });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles] GET failed", {
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
    if (!body.lcNumber) {
      return NextResponse.json(
        { error: "lcNumber required" },
        { status: 400 },
      );
    }
    const lifecycle = await createLcLifecycle(body);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/lc-lifecycles] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
