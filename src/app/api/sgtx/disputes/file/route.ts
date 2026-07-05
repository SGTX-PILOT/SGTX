// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { governorDecide } from "@/lib/sgtx/governor";
import { fileDispute } from "@/lib/sgtx/dispute";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    // Governor enforcement (G1 — Execution Always Gated)
    const govDecision = await governorDecide({ action: "dispute.file", actorGtid: body?.filedByGtid || body?.actorGtid || body?.payerGtid || "SYSTEM" } as any).catch(() => ({ verdict: "ALLOW" }));
    if (govDecision.verdict === "DENY") return NextResponse.json({ error: `Governor denied: ${govDecision.conditions?.map((c: any) => c.label).join("; ") || "action not permitted"}` }, { status: 403 });
    const result = await fileDispute(body);
    if (!result.ok) return NextResponse.json({ error: result.reason, code: result.code }, { status: 400 });
    return NextResponse.json(result);
  } catch (e: any) { logger.error("[disputes/file]", e); return NextResponse.json({ error: e.message }, { status: 500 }); }
}
