// @ts-nocheck
// §4 Change Approval Pipeline — GET changes awaiting deployment (APPROVED or COMPILED)
// GET /api/sgtx/regulatory/pipeline/awaiting-deployment
import { NextResponse } from "next/server";
import { getChangesAwaitingDeployment } from "@/lib/sgtx/change-approval";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const changes = await getChangesAwaitingDeployment();
    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/awaiting-deployment] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
