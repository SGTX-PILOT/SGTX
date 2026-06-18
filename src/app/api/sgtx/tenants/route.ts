import { NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/tenants — all tenants for portal launcher
export async function GET() {
  const tenants = await db.tenant.findMany({ orderBy: { type: "asc" } });
  return NextResponse.json(tenants);
}
