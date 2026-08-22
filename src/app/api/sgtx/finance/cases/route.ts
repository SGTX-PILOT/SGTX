// @ts-nocheck
// §2 Trade Finance — list (GET) + create (POST)
// GET  /api/sgtx/finance/cases?ustn=X&borrowerGtid=Y&financierGtid=Z&status=W
// POST /api/sgtx/finance/cases  body: CreateCaseInput  → returns relationshipVerified flag
import { NextResponse } from "next/server";
import {
  listFinancingCases,
  createFinancingCase,
} from "@/lib/sgtx/trade-finance";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const borrowerGtid = url.searchParams.get("borrowerGtid") || undefined;
    const financierGtid = url.searchParams.get("financierGtid") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (borrowerGtid) filters.borrowerGtid = borrowerGtid;
    if (financierGtid) filters.financierGtid = financierGtid;
    if (status) filters.status = status;
    const cases = await listFinancingCases(filters);
    return NextResponse.json({ cases });
  } catch (err: any) {
    logger.error("[api/finance/cases] GET failed", { error: err?.message });
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
    if (!body.borrowerGtid) {
      return NextResponse.json(
        { error: "borrowerGtid required" },
        { status: 400 },
      );
    }
    if (!body.financierGtid) {
      return NextResponse.json(
        {
          error:
            "financierGtid required (non-marketplace §2 — explicit selection)",
        },
        { status: 400 },
      );
    }
    if (!(Number(body.amountUsd) > 0)) {
      return NextResponse.json(
        { error: "amountUsd must be positive" },
        { status: 400 },
      );
    }
    const createdCase = await createFinancingCase(body);
    return NextResponse.json({
      case: createdCase,
      relationshipVerified: createdCase?.relationshipVerified === true,
    });
  } catch (err: any) {
    logger.error("[api/finance/cases] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
