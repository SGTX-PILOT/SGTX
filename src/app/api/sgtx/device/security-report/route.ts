import { NextRequest, NextResponse } from "next/server";
import { exportSecurityReport } from "@/lib/sgtx/governor/constitutional-addons";

export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const result = await exportSecurityReport(tenant);
  return NextResponse.json(result);
}
