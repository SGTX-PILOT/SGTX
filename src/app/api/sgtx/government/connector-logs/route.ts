// 7.7 — Connector Logs (audit trail for all government API calls)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const apiName = req.nextUrl.searchParams.get("apiName");
  const status = req.nextUrl.searchParams.get("status");
  const ustn = req.nextUrl.searchParams.get("ustn");
  const where: any = {};
  if (apiName) where.apiName = apiName;
  if (status) where.status = status;
  if (ustn) where.ustn = ustn;
  const logs = await db.integrationConnectorLog.findMany({ where, orderBy: { createdAt: "desc" }, take: 50 });
  return NextResponse.json({ logs, total: logs.length });
}
