// @ts-nocheck
// §8 ERP Adapters — list (GET) + create (POST)
// GET  /api/sgtx/finance/erp-adapters?traderGtid=X&erpType=Y&status=Z
// POST /api/sgtx/finance/erp-adapters  body: CreateErpInput
import { NextResponse } from "next/server";
import {
  listErpAdapters,
  createErpAdapter,
} from "@/lib/sgtx/erp-adapter";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const traderGtid = url.searchParams.get("traderGtid") || undefined;
    const erpType = url.searchParams.get("erpType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (traderGtid) filters.traderGtid = traderGtid;
    if (erpType) filters.erpType = erpType;
    if (status) filters.status = status;
    const adapters = await listErpAdapters(filters);
    return NextResponse.json({ adapters });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters] GET failed", {
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
    if (!body.traderGtid) {
      return NextResponse.json(
        { error: "traderGtid required" },
        { status: 400 },
      );
    }
    if (!body.erpType) {
      return NextResponse.json(
        { error: "erpType required" },
        { status: 400 },
      );
    }
    const adapter = await createErpAdapter(body);
    return NextResponse.json({ adapter });
  } catch (err: any) {
    logger.error("[api/finance/erp-adapters] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
