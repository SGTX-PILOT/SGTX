import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/evidence/list?ustn=...
export async function GET(req: NextRequest) {
  const ustn = req.nextUrl.searchParams.get("ustn");
  if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });
  const packages = await db.evidencePackage.findMany({ where: { ustn }, orderBy: { createdAt: "desc" } });
  return NextResponse.json(packages);
}
