import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/corridor/list
// Query params: country, type, status, verificationStatus, operationalStatus
// Lists all corridors (filterable by country, type, status).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const country = sp.get("country");
  const type = sp.get("type");
  const status = sp.get("status");
  const verificationStatus = sp.get("verificationStatus");
  const operationalStatus = sp.get("operationalStatus");

  const where: any = {};
  if (country) {
    where.OR = [
      { originCountry: country.toUpperCase() },
      { destCountry: country.toUpperCase() },
    ];
  }
  if (type) where.corridorType = type.toUpperCase();
  if (status) where.status = status.toUpperCase();
  if (verificationStatus) where.verificationStatus = verificationStatus.toUpperCase();
  if (operationalStatus) where.operationalStatus = operationalStatus.toUpperCase();

  const corridors = await db.tradeCorridor.findMany({
    where,
    orderBy: { corridorCode: "asc" },
  });

  return NextResponse.json({
    count: corridors.length,
    filters: { country, type, status, verificationStatus, operationalStatus },
    corridors,
  });
}
