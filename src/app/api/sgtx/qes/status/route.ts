import { NextRequest, NextResponse } from "next/server";
import { getQesStatus } from "@/lib/sgtx/governor/constitutional-addons";

export async function GET(req: NextRequest) {
  const requestId = req.nextUrl.searchParams.get("requestId");
  if (!requestId) return NextResponse.json({ error: "requestId required" }, { status: 400 });
  const result = await getQesStatus(requestId);
  return NextResponse.json(result);
}
