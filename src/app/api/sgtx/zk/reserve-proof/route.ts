import { NextRequest, NextResponse } from "next/server";
import { generateReserveProof } from "@/lib/sgtx/addons";

// POST /api/sgtx/zk/reserve-proof
// Body: { reserveAmount: number, liabilities: number }
// Returns a simulated ZK proof that reserves ≥ 1.1× liabilities (Part 11.5).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.reserveAmount !== "number" || typeof body.liabilities !== "number") {
    return NextResponse.json(
      { error: "reserveAmount (number) and liabilities (number) are required" },
      { status: 400 },
    );
  }
  const result = generateReserveProof(body.reserveAmount, body.liabilities);
  return NextResponse.json(result);
}
