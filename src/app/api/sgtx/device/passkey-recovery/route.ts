import { NextRequest, NextResponse } from "next/server";
import { initiatePasskeyRecovery } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await initiatePasskeyRecovery(body);
  return NextResponse.json(result);
}
