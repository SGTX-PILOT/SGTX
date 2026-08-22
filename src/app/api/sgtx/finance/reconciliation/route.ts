// @ts-nocheck
// §9 Reconciliation — list (GET) + create (POST)
// GET  /api/sgtx/finance/reconciliation?ustn=X&reconciliationType=Y&status=Z&period=W
// POST /api/sgtx/finance/reconciliation  body: CreateReconInput
import { NextResponse } from "next/server";
import {
  listReconciliations,
  createReconciliation,
} from "@/lib/sgtx/reconciliation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const reconciliationType =
      url.searchParams.get("reconciliationType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const period = url.searchParams.get("period") || undefined;
    if (ustn) filters.ustn = ustn;
    if (reconciliationType) filters.reconciliationType = reconciliationType;
    if (status) filters.status = status;
    if (period) filters.period = period;
    const reconciliations = await listReconciliations(filters);
    return NextResponse.json({ reconciliations });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation] GET failed", {
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
    if (!body.reconciliationType) {
      return NextResponse.json(
        { error: "reconciliationType required" },
        { status: 400 },
      );
    }
    const reconciliation = await createReconciliation(body);
    return NextResponse.json({ reconciliation });
  } catch (err: any) {
    logger.error("[api/finance/reconciliation] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
