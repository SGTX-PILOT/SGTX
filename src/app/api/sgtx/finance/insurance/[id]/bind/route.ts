// @ts-nocheck
// §6 Insurance — bind policy. Body: { policyNumber }
// POST /api/sgtx/finance/insurance/[id]/bind
import { NextResponse } from "next/server";
import { bindPolicy } from "@/lib/sgtx/insurance-lifecycle";
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
    if (!body?.policyNumber) {
      return NextResponse.json(
        { error: "policyNumber required" },
        { status: 400 },
      );
    }
    const lifecycle = await bindPolicy(id, body.policyNumber);
    return NextResponse.json({ lifecycle });
  } catch (err: any) {
    logger.error("[api/finance/insurance/[id]/bind] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
