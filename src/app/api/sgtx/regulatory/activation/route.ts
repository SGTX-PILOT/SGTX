// @ts-nocheck
// §1 Country Activation — list (GET) + create (POST)
// GET  /api/sgtx/regulatory/activation?status=X&currentStep=Y&countryCode=Z
//      → listActivationWorkflows
// POST /api/sgtx/regulatory/activation  body: { countryCode, countryName?, owner? }
//      → createActivationWorkflow
import { NextResponse } from "next/server";
import {
  listActivationWorkflows,
  createActivationWorkflow,
} from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const status = url.searchParams.get("status") || undefined;
    const currentStepRaw = url.searchParams.get("currentStep");
    const countryCode = url.searchParams.get("countryCode") || undefined;
    if (status) filters.status = status;
    if (currentStepRaw) {
      const n = Number(currentStepRaw);
      if (Number.isInteger(n) && n > 0) filters.currentStep = n;
    }
    if (countryCode) filters.countryCode = countryCode;
    const workflows = await listActivationWorkflows(filters);
    return NextResponse.json({ workflows });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/activation] GET failed", {
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
    if (!body.countryCode || typeof body.countryCode !== "string") {
      return NextResponse.json(
        { error: "countryCode required" },
        { status: 400 },
      );
    }
    const workflow = await createActivationWorkflow(
      body.countryCode,
      body.countryName,
      body.owner,
    );
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/activation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
