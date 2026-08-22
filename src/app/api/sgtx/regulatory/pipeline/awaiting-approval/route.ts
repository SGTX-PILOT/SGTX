// @ts-nocheck
// §4 Change Approval Pipeline — GET changes awaiting approval (SIMULATED, ready for APPROVED)
// GET /api/sgtx/regulatory/pipeline/awaiting-approval
import { NextResponse } from "next/server";
import { getChangesAwaitingApproval } from "@/lib/sgtx/change-approval";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const changes = await getChangesAwaitingApproval();
    return NextResponse.json({ changes, count: changes.length });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/regulatory/pipeline/awaiting-approval] GET failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
