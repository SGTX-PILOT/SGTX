import { NextRequest, NextResponse } from "next/server";
import { verifyTrustPassport } from "@/lib/sgtx/identity";

// GET /api/sgtx/trust-passport/verify?token=...  (public endpoint — Part 2.10)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });
  const result = await verifyTrustPassport(token);
  if (result.error) return NextResponse.json(result, { status: 403 });
  return NextResponse.json(result);
}
