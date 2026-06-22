// Part 4.10 — Draft Recovery (get single draft by ID)
import { NextRequest, NextResponse } from "next/server";
import { getDraft } from "@/lib/sgtx/ria";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const draft = await getDraft(id);
  if (!draft) return NextResponse.json({ error: "Draft not found or expired" }, { status: 404 });
  return NextResponse.json({ draft });
}
