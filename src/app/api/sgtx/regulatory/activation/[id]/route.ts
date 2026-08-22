// @ts-nocheck
// §1 Country Activation — GET workflow by DB id OR by workflowId (CAW-…)
// GET /api/sgtx/regulatory/activation/[id]
import { NextResponse } from "next/server";
import { getActivationWorkflow } from "@/lib/sgtx/country-activation";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    const workflow = await getActivationWorkflow(id);
    if (!workflow) {
      return NextResponse.json(
        { error: "workflow not found" },
        { status: 404 },
      );
    }
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error("[api/sgtx/regulatory/activation/[id]] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
