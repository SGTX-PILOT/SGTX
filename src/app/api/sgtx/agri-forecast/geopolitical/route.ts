import { NextResponse } from "next/server";
import { getActiveGeopoliticalEvents } from "@/lib/sgtx/compliance/agri-commodity-forecast";
export const dynamic = "force-dynamic";
export async function GET() {
  return NextResponse.json({ ok: true, events: await getActiveGeopoliticalEvents() });
}
