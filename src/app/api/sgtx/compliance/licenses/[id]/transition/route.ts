// @ts-nocheck
// SGTX Phase 3 §1 — License Engine API
//   POST /api/sgtx/compliance/licenses/[id]/transition
//   Body: { newState, notes? }
//   Returns: the updated TradeLicense row.
import { NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { transitionLicenseState, LICENSE_STATES } from "@/lib/sgtx/license";

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
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { error: "request body required" },
        { status: 400 },
      );
    }
    const newState = typeof body.newState === "string" ? body.newState : "";
    if (!newState) {
      return NextResponse.json(
        { error: "newState required" },
        { status: 400 },
      );
    }
    if (!LICENSE_STATES.includes(newState)) {
      return NextResponse.json(
        {
          error: `invalid newState "${newState}"; allowed: ${LICENSE_STATES.join(",")}`,
        },
        { status: 400 },
      );
    }
    const notes =
      typeof body.notes === "string" && body.notes.length > 0
        ? body.notes
        : undefined;
    const license = await transitionLicenseState(id, newState, notes);
    return NextResponse.json({ license });
  } catch (err: any) {
    logger.error(
      "[api/sgtx/compliance/licenses/[id]/transition] POST failed",
      { error: err?.message },
    );
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
