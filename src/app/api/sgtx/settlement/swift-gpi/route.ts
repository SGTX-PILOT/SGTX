// @ts-nocheck
/**
 * POST /api/sgtx/settlement/swift-gpi
 *
 * Body: { uetr, status }
 *
 * Ingests a SWIFT gpi UETR status update for USD legs (§13.4.6). Matches the
 * leg by externalPaymentRef=UETR. On SETTLED: marks the leg SETTLED, creates
 * a SettlementConfirmation.
 *
 * status: "ACK" | "IN_PROGRESS" | "SETTLED" | "REJECTED"
 */
import { NextRequest, NextResponse } from "next/server";
import { ingestSwiftGpiUetr } from "@/lib/sgtx/direct-bank-settlement";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { uetr, status } = body;
    if (!uetr || !status) {
      return NextResponse.json(
        { error: "uetr and status required" },
        { status: 400 },
      );
    }
    const validStatuses = ["ACK", "IN_PROGRESS", "SETTLED", "REJECTED"];
    if (!validStatuses.includes(status)) {
      return NextResponse.json(
        { error: `status must be one of: ${validStatuses.join(", ")}` },
        { status: 400 },
      );
    }
    const result = await ingestSwiftGpiUetr(uetr, status);
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
