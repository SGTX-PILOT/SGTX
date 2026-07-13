import { NextResponse } from "next/server";
import { getUniqueRoutes } from "@/lib/sgtx/compliance/shipping-lines-scraper";
export const dynamic = "force-dynamic";
export async function GET() {
  const routes = await getUniqueRoutes();
  return NextResponse.json({ ok: true, count: routes.length, routes });
}
