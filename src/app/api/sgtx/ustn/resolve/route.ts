import { NextRequest, NextResponse } from "next/server";
import { resolveUSTN } from "@/lib/sgtx/ustn";

// GET /api/sgtx/ustn/resolve?ustn=...&role=buyer  (Part 3.5 — role-filtered)
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  const role = req.nextUrl.searchParams.get("role") || "buyer";
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const result = await resolveUSTN(ustn, role);
  if (result.error) return NextResponse.json(result, { status: 404 });
  return NextResponse.json(result);
}
