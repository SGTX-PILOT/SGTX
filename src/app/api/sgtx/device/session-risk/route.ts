import { NextRequest, NextResponse } from "next/server";
import { evaluateSessionRisk } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await evaluateSessionRisk(body);
  return NextResponse.json(result);
}
