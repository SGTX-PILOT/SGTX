// @ts-nocheck
// §8 Security Audit — run the 11 security checks.
// POST /api/sgtx/readiness/security-audit
//      → runSecurityAudit() → returns SecurityAuditResult.
import { NextResponse } from "next/server";
import { runSecurityAudit } from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const result = await runSecurityAudit();
    return NextResponse.json({ result });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/security-audit] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
