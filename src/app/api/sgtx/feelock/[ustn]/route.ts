// @ts-nocheck
/**
 * GET /api/sgtx/feelock/[ustn]
 *   → Returns the FeeLock KV status (hydrates from Prisma on cold start).
 *
 * POST /api/sgtx/feelock/[ustn]
 *   Body: { feeUsd, tradeId?, payerGtid?, sgtxFeeUsd?, providerFees?, forceReset? }
 *   → Creates/updates the FeeLock KV entry. Status starts at PENDING.
 *     CRITICAL: this NEVER activates the lock — only an external camt.054 /
 *     SWIFT gpi UETR SETTLED confirmation does (see /status route).
 */
import { NextRequest, NextResponse } from "next/server";
import { getFeeLock, setFeeLock } from "@/lib/sgtx/feelock-nats";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ ustn: string }> },
) {
  try {
    const { ustn } = await params;
    if (!ustn) {
      return NextResponse.json({ error: "ustn required" }, { status: 400 });
    }
    const result = await getFeeLock(ustn);
    if (!result) {
      return NextResponse.json(
        { error: "FEELOCK_NOT_FOUND", ustn },
        { status: 404 },
      );
    }
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

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
    if (typeof body.feeUsd !== "number") {
      return NextResponse.json(
        { error: "feeUsd (number) required" },
        { status: 400 },
      );
    }
    const result = await setFeeLock(
      ustn,
      {
        feeUsd: body.feeUsd,
        tradeId: body.tradeId || null,
        payerGtid: body.payerGtid || null,
        sgtxFeeUsd: body.sgtxFeeUsd,
        providerFees: body.providerFees,
      },
      !!body.forceReset,
    );
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
