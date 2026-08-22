// @ts-nocheck
// §4 Landed Cost — update a single cost component on a breakdown row.
// POST /api/sgtx/transport/landed-cost/[id]/component  body: { component, amount, source? }
import { NextResponse } from "next/server";
import { updateCostComponent } from "@/lib/sgtx/landed-cost";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const body = await req.json();
    if (!body?.component) {
      return NextResponse.json(
        { error: "component required" },
        { status: 400 },
      );
    }
    if (body.amount == null || isNaN(Number(body.amount))) {
      return NextResponse.json(
        { error: "amount (number) required" },
        { status: 400 },
      );
    }
    const result = await updateCostComponent(
      id,
      body.component,
      Number(body.amount),
      body.source,
    );
    if (result && result.ok === false) {
      const status = result.error === "BREAKDOWN_NOT_FOUND" ? 404 : 400;
      return NextResponse.json(
        { error: result.error, detail: result },
        { status },
      );
    }
    return NextResponse.json({ breakdown: result });
  } catch (err: any) {
    logger.error("[api/transport/landed-cost/[id]/component] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
