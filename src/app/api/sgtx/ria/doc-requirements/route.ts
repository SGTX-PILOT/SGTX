// Part 4.1 — Country Physical Document Requirements
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const countryCode = req.nextUrl.searchParams.get("countryCode");
  if (!countryCode) return NextResponse.json({ error: "countryCode required" }, { status: 400 });
  const reqs = await db.countryPhysicalDocumentRequirement.findMany({ where: { countryCode } });
  return NextResponse.json({ requirements: reqs, total: reqs.length });
}
