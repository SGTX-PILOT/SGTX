// @ts-nocheck
// §6 Insurance — list (GET) + create (POST)
// GET  /api/sgtx/finance/insurance?ustn=X&insuranceType=Y&currentStep=Z&status=W
// POST /api/sgtx/finance/insurance  body: CreateInsuranceInput
import { NextResponse } from "next/server";
import {
  listInsuranceLifecycles,
  createInsuranceLifecycle,
} from "@/lib/sgtx/insurance-lifecycle";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const insuranceType = url.searchParams.get("insuranceType") || undefined;
    const currentStep = url.searchParams.get("currentStep") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (insuranceType) filters.insuranceType = insuranceType;
    if (currentStep) filters.currentStep = currentStep;
    if (status) filters.status = status;
    const lifecycles = await listInsuranceLifecycles(filters);
    return NextResponse.json({ lifecycles });
  } catch (err: any) {
    logger.error("[api/finance/insurance] GET failed", {
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
    if (!body.insuranceType) {
      return NextResponse.json(
        { error: "insuranceType required" },
        { status: 400 },
      );
    }
    if (!body.insuredGtid) {
      return NextResponse.json(
        { error: "insuredGtid required" },
        { status: 400 },
      );
    }
    const lifecycle = await createInsuranceLifecycle(body);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
