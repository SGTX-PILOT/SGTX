import { NextRequest, NextResponse } from "next/server";
import { getCorridorPassport } from "@/lib/sgtx/corridor";

// GET /api/sgtx/corridor/{code} — corridor details + passport
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!code) {
    return NextResponse.json({ error: "corridor code required" }, { status: 400 });
  }
  const passport = await getCorridorPassport(code.toUpperCase());
  if (!passport) {
    return NextResponse.json({ error: "corridor not found" }, { status: 404 });
  }
  return NextResponse.json(passport);
}
