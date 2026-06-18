import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/jurisdictions — full jurisdiction matrix (Part 1.7)
export async function GET() {
  const jurisdictions = await db.jurisdiction.findMany({ orderBy: { countryCode: "asc" } });
  return NextResponse.json(jurisdictions);
}
