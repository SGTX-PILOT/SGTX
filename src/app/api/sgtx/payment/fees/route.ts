// 6.9 — Late Fee Check
import { NextRequest, NextResponse } from "next/server";
import { calculateLateFees } from "@/lib/sgtx/payment-orchestration";

export async function POST() {
  const result = await calculateLateFees();
  return NextResponse.json(result);
}
