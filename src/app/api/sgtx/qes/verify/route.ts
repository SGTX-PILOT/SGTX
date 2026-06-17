import { NextRequest, NextResponse } from "next/server";
import { verifyQesSignature } from "@/lib/sgtx/governor/constitutional-addons";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = await verifyQesSignature(body);
  return NextResponse.json(result);
}
