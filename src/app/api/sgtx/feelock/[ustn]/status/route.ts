// @ts-nocheck
/**
 * POST /api/sgtx/feelock/[ustn]/status
 *
 * Body: { newStatus, evidence?: { kind, ref } }
 *
 * Transitions the FeeLock KV status (§13.4.9).
 *
 * CRITICAL (§13.4.9 + Golden Principle):
 *   - PENDING → ACTIVE is REFUSED unless evidence.kind ∈
 *     {CAMT054_CONFIRMATION, SWIFT_GPI_UETR_SETTLED}.
 *   - PAYMENT_BUTTON_CLICKED evidence is recorded for audit but the
 *     transition is still REFUSED.
 *
 * Returns: { updated, previousStatus, newStatus, reason? }
 */
import { NextRequest, NextResponse } from "next/server";
import { updateFeeLockStatus } from "@/lib/sgtx/feelock-nats";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const body = await req.json();
    const { newStatus, evidence } = body;
    if (!newStatus) {
      return NextResponse.json(
        { error: "newStatus required" },
        { status: 400 },
      );
    }
    const validStatuses = [
      "PENDING",
      "ACTIVE",
      "PARTIALLY_RELEASED",
      "DISPUTED",
      "CANCELLED",
    ];
    if (!validStatuses.includes(newStatus)) {
      return NextResponse.json(
        { error: `newStatus must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }
    const result = await updateFeeLockStatus(ustn, newStatus, evidence);
    if (!result.updated) {
      return NextResponse.json(result, { status: 409 });
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
