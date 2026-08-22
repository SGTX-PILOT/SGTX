// @ts-nocheck
// §5 Guarantees — list (GET) + create (POST)
// GET  /api/sgtx/finance/guarantees?ustn=X&guaranteeType=Y&status=Z&issuerGtid=W
// POST /api/sgtx/finance/guarantees  body: CreateGuaranteeInput
import { NextResponse } from "next/server";
import {
  listGuarantees,
  createGuarantee,
} from "@/lib/sgtx/guarantee-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const guaranteeType = url.searchParams.get("guaranteeType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    const issuerGtid = url.searchParams.get("issuerGtid") || undefined;
    if (ustn) filters.ustn = ustn;
    if (guaranteeType) filters.guaranteeType = guaranteeType;
    if (status) filters.status = status;
    if (issuerGtid) filters.issuerGtid = issuerGtid;
    const guarantees = await listGuarantees(filters);
    return NextResponse.json({ guarantees });
  } catch (err: any) {
    logger.error("[api/finance/guarantees] GET failed", {
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
    if (!body.guaranteeType) {
      return NextResponse.json(
        { error: "guaranteeType required" },
        { status: 400 },
      );
    }
    if (!(Number(body.amountUsd) > 0)) {
      return NextResponse.json(
        { error: "amountUsd must be positive" },
        { status: 400 },
      );
    }
    const guarantee = await createGuarantee(body);
    return NextResponse.json({ guarantee });
  } catch (err: any) {
    logger.error("[api/finance/guarantees] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
