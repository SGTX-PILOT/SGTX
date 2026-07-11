import { NextRequest, NextResponse } from "next/server";
import { getPortStatus, getAllPortStatuses, checkPortForceMajeure } from "@/lib/sgtx/compliance/nowlun-integration";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const port = searchParams.get("port");
  const checkFm = searchParams.get("forceMajeure") === "true";
  if (port) {
    if (checkFm) {
      const fm = await checkPortForceMajeure(port);
      return NextResponse.json({ ok: true, ...fm });
    }
    const status = await getPortStatus(port);
    return NextResponse.json({ ok: true, status });
  }
  const all = await getAllPortStatuses();
  return NextResponse.json({ ok: true, count: all.length, ports: all });
}
