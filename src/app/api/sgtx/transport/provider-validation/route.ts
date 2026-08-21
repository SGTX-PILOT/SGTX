// @ts-nocheck
// §6 Provider Validation — GET single validation (by query params) +
// POST upsert a validation row.
// GET  /api/sgtx/transport/provider-validation?providerGtid=X&validationType=Y
// POST /api/sgtx/transport/provider-validation  body: UpsertValidationInput
import { NextResponse } from "next/server";
import {
  getProviderValidation,
  upsertProviderValidation,
} from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const providerGtid = url.searchParams.get("providerGtid");
    const validationType = url.searchParams.get("validationType");
    if (!providerGtid || !validationType) {
      return NextResponse.json(
        { error: "providerGtid and validationType required" },
        { status: 400 },
      );
    }
    const validation = await getProviderValidation(
      providerGtid,
      validationType,
    );
    if (!validation) {
      return NextResponse.json(
        { error: "validation not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ validation });
  } catch (err: any) {
    logger.error("[api/transport/provider-validation] GET failed", {
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
    if (!body.providerGtid) {
      return NextResponse.json(
        { error: "providerGtid required" },
        { status: 400 },
      );
    }
    if (!body.validationType) {
      return NextResponse.json(
        { error: "validationType required" },
        { status: 400 },
      );
    }
    const result = await upsertProviderValidation(body);
    if (result && result.ok === false) {
      return NextResponse.json(
        { error: result.error || "upsertProviderValidation failed" },
        { status: 400 },
      );
    }
    return NextResponse.json({ validation: result });
  } catch (err: any) {
    logger.error("[api/transport/provider-validation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
