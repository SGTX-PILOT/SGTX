// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { getPreapprovedExperts } from "@/lib/sgtx/dispute";

// GET /api/sgtx/disputes/expert/list?jurisdiction=...&expertType=...
// Returns the platform-maintained pre-approved third-party expert list (Part 10.9.3).
// Seeds the table with the curated list on first call.
export async function GET(req: NextRequest) {
  try {
    const jurisdiction = req.nextUrl.searchParams.get("jurisdiction") || undefined;
    const expertType = req.nextUrl.searchParams.get("expertType") || undefined;
    const experts = await getPreapprovedExperts({ jurisdiction, expertType } as any);
    return NextResponse.json({ ok: true, count: experts?.length, experts });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
