// 6.11 — PSP Responsibility Matrix
import { NextResponse } from "next/server";
import { PSP_RESPONSIBILITY_MATRIX } from "@/lib/sgtx/payment-orchestration";

export async function GET() {
  return NextResponse.json(PSP_RESPONSIBILITY_MATRIX);
}
