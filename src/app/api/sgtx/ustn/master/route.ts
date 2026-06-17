import { NextRequest, NextResponse } from "next/server";
import { buildUstnMasterObject } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/master?ustn=...  (Part 3.3 — full master object)
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const result = await buildUstnMasterObject(ustn);
  if (!result) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(result);
}
