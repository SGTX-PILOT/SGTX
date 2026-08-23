// @ts-nocheck
// §70 Exception Engine — re-evaluate the resolution action for an exception
// POST /api/sgtx/constitutional/exceptions/[id]/evaluate
import { NextResponse } from "next/server";
import { evaluateExceptionResolution } from "@/lib/sgtx/exception-engine";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "exceptionId required" },
        { status: 400 },
      );
    }
    const result = await evaluateExceptionResolution(id);
    return NextResponse.json({ evaluation: result });
  } catch (err: any) {
    logger.error(
      "[api/constitutional/exceptions/[id]/evaluate] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
