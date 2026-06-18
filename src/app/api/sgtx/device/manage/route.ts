import { NextRequest, NextResponse } from "next/server";
import { manageDevice } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await manageDevice(body);
  return NextResponse.json(result);
}
