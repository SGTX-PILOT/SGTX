// @ts-nocheck
// §1 Country Activation — POST suspend workflow (IN_PROGRESS → SUSPENDED)
// POST /api/sgtx/regulatory/activation/[id]/suspend  body: { reason }
import { NextResponse } from "next/server";
import { suspendWorkflow } from "@/lib/sgtx/country-activation";
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
    const body = await req.json().catch(() => ({}));
    const reason =
      (body && typeof body === "object" && body.reason) || "manual suspend";
    const workflow = await suspendWorkflow(id, String(reason));
    return NextResponse.json({ workflow });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/activation/[id]/suspend] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
