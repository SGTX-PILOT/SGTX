import { NextRequest, NextResponse } from "next/server";
import { generateTrustPassport } from "@/lib/sgtx/identity";

// POST /api/sgtx/trust-passport/generate  { tenantGtid }
export async function POST(req: NextRequest) {
  const { tenantGtid } = await req.json();
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const result = await generateTrustPassport(tenantGtid);
  return NextResponse.json(result);
}
