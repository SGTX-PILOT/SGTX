import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  const integrations = await db.integrationHealth.findMany({ orderBy: { category: "asc" } });
  return NextResponse.json(integrations);
}
