import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { replayChain, recordVerificationRun } from "@/lib/sgtx/governor/loom-verifier";
import { freshDb } from "@/lib/db-fresh";

// POST /api/sgtx/governor/loom/replay — trigger full Loom chain replay verification
//
// Blueprint Part 1.6 — replays the Loom chain from genesis, recomputes every
// Governor decision hash, and reports any mismatches. Mismatches are tamper
// events and must raise a P0 incident — this endpoint returns the mismatch
// details; the caller (admin UI or cron job) is responsible for incident
// creation. (The existing /api/sgtx/governor/audit-cron endpoint does this
// automatically on its hourly schedule.)
//
// Body (optional):
//   { ustn?: string, triggeredBy?: "cron" | "admin" | "external_verify" }
//
// Query params (alternative):
//   ?ustn=SGTX-…    (scope the replay to a single trade)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const ustn = body?.ustn || req.nextUrl.searchParams.get("ustn") || undefined;
    const triggeredBy = (body?.triggeredBy as string) || "admin";

    const result = await replayChain(ustn);

    // Persist the verification run summary so /loom/stats can report "last verified at"
    await recordVerificationRun(result);

    // If the chain is intact, return immediately — no incident needed.
    if (result.chainVerified) {
      return NextResponse.json({
        ...result,
        triggeredBy,
        incidentCreated: false,
      });
    }

    // Chain integrity failure → create a P0 Incident + Smart Inbox alert.
    // (Mirrors the behavior of /api/sgtx/governor/audit-cron for consistency.)
    const PLATFORM_GOVERNANCE_AUTHORITY = "SGTX-EG-GOV-000001-9A0B";
    const mismatchSummary = result.mismatches
      .slice(0, 5)
      .map(
        (m) =>
          `decision ${m.decisionId} (${m.action}): stored=${m.storedHash}, recomputed=${m.recomputedHash}, reason=${m.reason}`,
      )
      .join("; ");

    const incident = await freshDb.incident.create({
      data: {
        severity: "P0",
        status: "OPEN",
        title: "Loom replay chain integrity failure",
        description:
          `The Loom replay verifier detected ${result.mismatches.length} mismatch(es) across ${result.decisionsChecked} Governor decisions. ` +
          `First mismatches: ${mismatchSummary}. ` +
          `Genesis=${result.genesisHash.slice(0, 24)}…, latest=${(result.latestHash || "").slice(0, 24)}…. ` +
          `Triggered by: ${triggeredBy}.`,
        affectedSystems: JSON.stringify(["governor", "loom", "constitutional-engine"]),
        rootCause:
          "Tamper detection — chain hash(es) do not match recomputed values or previous_hash linkage is broken.",
      },
    });

    await freshDb.inboxItem.create({
      data: {
        tenantGtid: PLATFORM_GOVERNANCE_AUTHORITY,
        category: "COMPLIANCE",
        priority: 100,
        title: "P0 · Loom replay detected chain integrity failure",
        description:
          `Replay verifier found ${result.mismatches.length} mismatch(es) across ${result.decisionsChecked} decisions. ` +
          `Incident ${incident.id} opened. Immediate forensic review required. New trades are paused until chain integrity is restored.`,
        ctaLabel: "Open Incident",
        deadline: new Date(Date.now() + 60 * 60 * 1000), // 1h SLA
      },
    });

    return NextResponse.json({
      ...result,
      triggeredBy,
      incidentCreated: true,
      incidentId: incident.id,
      incidentSeverity: "P0",
      inboxSentTo: PLATFORM_GOVERNANCE_AUTHORITY,
      inboxPriority: 100,
    });
  } catch (e: any) {
    logger.error("[governor/loom/replay POST] error:", e);
    return NextResponse.json(
      { error: e?.message || "Loom replay failed", chainVerified: false },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/governor/loom/replay — read-only replay preview (no incident)
export async function GET(req: NextRequest) {
  try {
    const ustn = req.nextUrl.searchParams.get("ustn") || undefined;
    const result = await replayChain(ustn);
    // Still record the run so /stats can reflect the latest verification, but
    // do NOT create incidents on a read-only preview.
    await recordVerificationRun(result);
    return NextResponse.json({ ...result, triggeredBy: "preview" });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Loom replay preview failed", chainVerified: false },
      { status: 500 },
    );
  }
}
