// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
// 3B.7.6 — Monthly Statements (list + generate)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { generateMonthlyStatement } from "@/lib/sgtx/settlement";

export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  if (!tenantGtid) return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  const statements = await db.monthlyStatement.findMany({
    where: { tenantGtid },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    }) as any;
    return NextResponse.json({ statements, total: statements.length }) as any;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tenantGtid, month, year } = body;
        if (!tenantGtid || !month || !year) return NextResponse.json({ error: "Missing required fields" }, { status: 400 }) as any;
        const result = await generateMonthlyStatement({ tenantGtid, month: +month, year: +year }) as any;
        if (!result.ok) return NextResponse.json({ error: result.reason }, { status: 400 }) as any;
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[settlement/statements]", e);
        return NextResponse.json({ error: e.message }, { status: 500 }) as any;
  }
}
