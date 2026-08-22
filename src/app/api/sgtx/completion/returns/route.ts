// @ts-nocheck
// §3 Returns — list (GET) + create (POST)
// GET  /api/sgtx/completion/returns?ustn=X&parentUstn=Y&returnType=Z&status=W
// POST /api/sgtx/completion/returns  body: CreateReturnInput
import { NextResponse } from "next/server";
import { listReturns, createReturn } from "@/lib/sgtx/returns";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const filters: any = {};
    const ustn = url.searchParams.get("ustn") || undefined;
    const parentUstn = url.searchParams.get("parentUstn") || undefined;
    const returnType = url.searchParams.get("returnType") || undefined;
    const status = url.searchParams.get("status") || undefined;
    if (ustn) filters.ustn = ustn;
    if (parentUstn) filters.parentUstn = parentUstn;
    if (returnType) filters.returnType = returnType;
    if (status) filters.status = status;
    const returns = await listReturns(filters);
    return NextResponse.json({ returns });
  } catch (err: any) {
    logger.error("[api/completion/returns] GET failed", {
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
    if (!body.parentUstn) {
      return NextResponse.json(
        { error: "parentUstn required" },
        { status: 400 },
      );
    }
    if (!body.returnType) {
      return NextResponse.json(
        { error: "returnType required" },
        { status: 400 },
      );
    }
    const record = await createReturn(body);
    return NextResponse.json({ return: record });
  } catch (err: any) {
    logger.error("[api/completion/returns] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
