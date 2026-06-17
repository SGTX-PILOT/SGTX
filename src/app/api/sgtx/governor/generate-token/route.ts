import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/governor/generate-token  { ustn }
// Creates a Loom verification token (90-day expiry) for a USTN
export async function POST(req: NextRequest) {
  const { ustn } = await req.json();
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

  const trade = await db.trade.findUnique({ where: { ustn } });
  if (!trade) return NextResponse.json({ error: "trade not found" }, { status: 404 });

  const token = await db.loomVerificationToken.create({
    data: { ustn, expiresAt: new Date(Date.now() + 90 * 86400 * 1000) },
  });
  return NextResponse.json({ token: token.token, ustn, expiresAt: token.expiresAt });
}
