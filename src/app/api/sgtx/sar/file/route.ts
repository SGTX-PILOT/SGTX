// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { fileSarWithFiu } from "@/lib/sgtx/sar/fiu-filing";

// POST /api/sgtx/sar/file
// Blueprint Part 1.12.3.6 + v17 §3.5 — file a SAR with the FIU.
//
// Body: { sarId, fiuJurisdiction? }
//
// Delegates to src/lib/sgtx/sar/fiu-filing.ts (the canonical FIU filing engine).
// The lib handles:
//   - jurisdiction resolution (explicit override > derived from reportType)
//   - simulated FIU submission (real FIU integration would POST to the
//     FIU's secure endpoint — FinCEN BSA E-Filing, FIU.NET goXML, Egypt MLCU
//     portal upload, etc.)
//   - filing reference generation (FIU-{JUR}-{YYYYMMDD}-{8-hex})
//   - ack receipt generation
//   - Loom-anchoring the filing event
//   - persisting the filing state on the SuspiciousActivityReport row
//
// Returns:
//   {
//     ok: true,
//     filed: true,
//     filingId, filingReference, ackReceipt,
//     filedAt, fiuAuthority, fiuEndpoint, loomHash,
//     status: "ACK_RECEIVED",
//     simulated: true
//   }
//
// The existing /api/sgtx/sar/file endpoint also feeds the Smart Inbox
// (compliance officer gets a priority-70 alert that the SAR was filed).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { sarId, fiuJurisdiction } = body;
    if (!sarId) {
      return NextResponse.json({ error: "sarId required" }, { status: 400 });
    }

    const result = await fileSarWithFiu(sarId, fiuJurisdiction);

    // Smart Inbox back to the compliance officer (SGTX-EG-GOV-000001-9A0B)
    const COMPLIANCE_OFFICER_GTID = "SGTX-EG-GOV-000001-9A0B";
    try {
      const { db } = await import("@/lib/db");
      await db.inboxItem.create({
        data: {
          tenantGtid: COMPLIANCE_OFFICER_GTID,
          category: "COMPLIANCE",
          priority: 70,
          title: `SAR ${sarId} filed with FIU · ${result.filingReference}`,
          description:
            `SAR ${sarId} was electronically filed with ${result.fiuAuthority} ` +
            `(jurisdiction=${fiuJurisdiction ?? "auto"}). Filing reference: ${result.filingReference}. ` +
            `Ack receipt: ${result.ackReceipt}. The Loom hash of the final report is anchored ` +
            `(${result.loomHash.slice(0, 24)}…) and the filing is recorded in the audit log per Part 1.12.5.`,
          ctaLabel: "View Filing Receipt",
        },
      });
    } catch (inboxErr) {
      logger.error("[sar/file] Smart Inbox creation error (non-blocking):", inboxErr);
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[sar/file] error:", { error: e?.message || String(e) });
    const status =
      e?.message?.includes("not found") ? 404 :
      e?.message?.includes("already FILED") || e?.message?.includes("REJECTED") || e?.message?.includes("APPROVED_FOR_FILING") ? 409 :
      500;
    return NextResponse.json({ error: e?.message || "SAR filing failed" }, { status });
  }
}
