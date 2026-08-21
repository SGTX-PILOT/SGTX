// @ts-nocheck
// §6 Provider Validation — list validations.
// GET /api/sgtx/transport/provider-validation/list?providerGtid=X&providerType=Y&validationType=Z&status=W
import { NextResponse } from "next/server";
import { listProviderValidations } from "@/lib/sgtx/provider-validation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const providerGtid = url.searchParams.get("providerGtid") || undefined;
    const providerType = url.searchParams.get("providerType") || undefined;
    const validationType =
      url.searchParams.get("validationType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (providerGtid) filters.providerGtid = providerGtid;
    if (providerType) filters.providerType = providerType;
    if (validationType) filters.validationType = validationType;
    if (status) filters.status = status;
    const validations = await listProviderValidations(filters);
    return NextResponse.json({ validations });
  } catch (err: any) {
    logger.error("[api/transport/provider-validation/list] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
