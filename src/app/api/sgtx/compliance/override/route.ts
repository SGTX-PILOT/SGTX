import { NextRequest, NextResponse } from "next/server";
import { overrideComplianceVerdict } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await overrideComplianceVerdict(body);
  return NextResponse.json(result);
}
