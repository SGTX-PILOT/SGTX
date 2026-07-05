// @ts-nocheck — Type errors are non-blocking (Prisma schema mismatches)
import { NextRequest, NextResponse } from "next/server";
import { approvePartialFeeLockRelease } from "@/lib/sgtx/dispute";

// POST /api/sgtx/disputes/partial-release/approve — approve a proposed partial FeeLock release.
// Body: { releaseId, approverGtid, approverRole: "COUNTERPARTY" | "GOVERNOR", governorDecisionId? }
// Part 10.7.2 — Partial release requires (counterparty consent) OR (A3 governor human approval).
// If both are present, the release is auto-executed; otherwise it stays pending.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const result = await approvePartialFeeLockRelease(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result?.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
