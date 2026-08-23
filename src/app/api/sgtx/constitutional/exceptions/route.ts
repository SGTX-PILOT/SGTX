// @ts-nocheck
// §68-73 Exception Engine — raise a new exception + list exceptions for a USTN
// POST /api/sgtx/constitutional/exceptions        body: full RaiseExceptionInput
// GET  /api/sgtx/constitutional/exceptions?ustn=X&status=OPEN&category=OPERATIONAL&minSeverity=3
import { NextResponse } from "next/server";
import { raiseException, getExceptions } from "@/lib/sgtx/exception-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (!body || !body.exceptionCategory || !body.exceptionType) {
      return NextResponse.json(
        { error: "exceptionCategory and exceptionType required" },
        { status: 400 },
      );
    }
    const exception = await raiseException(body);
    if (!exception) {
      return NextResponse.json(
        { error: "raiseException failed — see logs" },
        { status: 500 },
      );
    }
    return NextResponse.json({ exception });
  } catch (err: any) {
    logger.error("[api/constitutional/exceptions] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const ustn = url.searchParams.get("ustn") || undefined;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const statusParam = url.searchParams.get("status");
    const categoryParam = url.searchParams.get("category");
    const minSeverityRaw = url.searchParams.get("minSeverity");
    const filters: any = {};
    if (statusParam) filters.status = statusParam.split(",");
    if (categoryParam) filters.category = categoryParam.split(",");
    if (minSeverityRaw) {
      const n = Number(minSeverityRaw);
      if (!Number.isNaN(n)) filters.minSeverity = n;
    }
    const exceptions = await getExceptions(ustn, filters);
    return NextResponse.json({ exceptions, count: exceptions.length });
  } catch (err: any) {
    logger.error("[api/constitutional/exceptions] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
