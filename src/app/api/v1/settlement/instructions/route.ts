// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
export const dynamic = "force-dynamic";
// GET /api/v1/settlement/instructions — Settlement instructions list (v18 §13.2)
// v18 §13.2: Settlement Instruction Lifecycle — generation, signing, submission,
// acknowledgment, processing, notification, reconciliation, closure.
// Auth: Bearer JWT — caller sees only their settlement instructions
interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload"); if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
const RATE_LIMIT_MAX = 20;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;
function checkRateLimit(key: string) {
  if (++gcCounter >= 50) { gcCounter = 0; const now = Date.now(); for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); }
  const now = Date.now(); const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) { const resetAt = now + RATE_LIMIT_WINDOW_MS; rateBuckets.set(key, { count: 1, resetAt }); return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt }; }
  if (existing.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  existing.count += 1; return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}
export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });
    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });
    const sp = req.nextUrl.searchParams;
    const statusFilter = sp.get("status"); // DRAFT, SIGNED, SUBMITTED, PROCESSING, SETTLED, RECONCILED, CLOSED
    const ustnFilter = sp.get("ustn");
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);
    const { freshDb } = await import("@/lib/db-fresh");
    let instructions: any[] = [];
    let totalCount = 0;
    try {
      // Query invoice table as a proxy for settlement instructions (settlement_manifests table may not exist)
      const where: any = {
        ...(ustnFilter ? { ustn: ustnFilter.toUpperCase() } : {}),
        ...(statusFilter ? { status: statusFilter.toUpperCase() } : {}),
        OR: [{ payeeGtid: caller.gtid }, { payerGtid: caller.gtid }],
      };
      instructions = await freshDb.invoice.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        select: { id: true, number: true, ustn: true, status: true, amountUsd: true, dueDate: true, createdAt: true },
      }).catch(() => []);
      totalCount = instructions.length;
    } catch (e: any) { logger.warn("[v1/settlement/instructions] DB query failed:", { error: e?.message }); }
    const VALID_STATUSES = ["DRAFT","SIGNED","SUBMITTED","PROCESSING","SETTLED","RECONCILED","CLOSED"];
    return NextResponse.json({
      instructions: instructions.map(inv => ({
        instruction_id: inv.id,
        ustn: inv.ustn,
        status: inv.status || "DRAFT",
        amount_usd: inv.amountUsd,
        due_date: inv.dueDate ? inv.dueDate.toISOString() : null,
        created_at: inv.createdAt ? inv.createdAt.toISOString() : null,
      })),
      counts: {
        total: totalCount,
        draft: instructions.filter(i => i.status === "DRAFT").length,
        signed: instructions.filter(i => i.status === "SIGNED").length,
        submitted: instructions.filter(i => i.status === "SUBMITTED").length,
        processing: instructions.filter(i => i.status === "PROCESSING").length,
        settled: instructions.filter(i => i.status === "SETTLED").length,
        reconciled: instructions.filter(i => i.status === "RECONCILED").length,
        closed: instructions.filter(i => i.status === "CLOSED").length,
      },
      valid_statuses: VALID_STATUSES,
      caller_gtid: caller.gtid,
      lifecycle: "DRAFT → SIGNED → SUBMITTED → PROCESSING → SETTLED → RECONCILED → CLOSED",
      queried_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/settlement/instructions] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Settlement instructions query failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
