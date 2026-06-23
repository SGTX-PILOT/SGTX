// Part 4.3 — MRLs (Maximum Residue Limits)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const hsCode = req.nextUrl.searchParams.get("hsCode");
  const countryCode = req.nextUrl.searchParams.get("countryCode");
  const where: any = {};
  if (hsCode) where.hsCode = hsCode;
  if (countryCode) where.countryCode = countryCode;
  const mrls = await db.countryMrl.findMany({ where });
  return NextResponse.json({ mrls, total: mrls.length });
}
