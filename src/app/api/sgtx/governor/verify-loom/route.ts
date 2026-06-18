import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { verifyLoomChain } from "@/lib/sgtx/governor";

// GET /api/sgtx/governor/verify-loom?token=...  (Part 1.11 public endpoint)
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const tokenRec = await db.loomVerificationToken.findUnique({ where: { token } });
  if (!tokenRec) return NextResponse.json({ error: "invalid token" }, { status: 403 });
  if (tokenRec.revoked) return NextResponse.json({ error: "token revoked" }, { status: 403 });
  if (tokenRec.expiresAt < new Date()) return NextResponse.json({ error: "token expired" }, { status: 403 });

  const result = await verifyLoomChain(tokenRec.ustn);
  return NextResponse.json(result);
}
