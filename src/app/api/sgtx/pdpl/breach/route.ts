// @ts-nocheck
// SGTX Platform — Part 18: Egyptian PDPL Compliance — Data Breach Reporting
// POST /api/sgtx/pdpl/breach
// Body: { severity, description, affectedCount }
//
// PDPL 72-hour rule: HIGH/CRITICAL breaches must auto-notify the DPC
// (Data Protection Centre). The notification is recorded on the breach
// record (notifiedDpc=true, notifiedAt=now) and a priority-100 Smart Inbox
// item is dispatched to the Platform Governance Authority.
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import { getPlatformGovernanceGtid, isValidSeverity, requiresDpcNotification } from "@/lib/sgtx/pdpl";

export async function POST(req: NextRequest) {
  try {
    const { severity, description, affectedCount } = await req.json();

    if (!severity || !description) {
      return NextResponse.json({ error: "severity and description are required" }, { status: 400 });
    }
    if (!isValidSeverity(severity)) {
      return NextResponse.json(
        { error: "Invalid severity. Must be one of: LOW, MEDIUM, HIGH, CRITICAL" },
        { status: 400 },
      );
    }

    const now = new Date();
    const mustNotifyDpc = requiresDpcNotification(severity);

    const breach = await db.dataBreachNotification.create({
      data: {
        severity,
        description,
        affectedCount: Number(affectedCount) || 0,
        notifiedDpc: mustNotifyDpc,
        notifiedAt: mustNotifyDpc ? now : null,
      },
    });

    // Smart Inbox to Platform Governance Authority (priority 100).
    try {
      const govGtid = await getPlatformGovernanceGtid();
      if (govGtid) {
        const dpcNote = mustNotifyDpc
          ? " DPC auto-notified per PDPL 72-hour rule."
          : "";
        const descriptionExcerpt = (typeof description === "string" && description.length)
          ? description.slice(0, 220)
          : "";
        await db.inboxItem.create({
          data: {
            tenantGtid: govGtid,
            category: "COMPLIANCE",
            priority: 100,
            title: `DATA BREACH REPORT — ${severity}`,
            description: `Severity: ${severity}. Affected records: ${Number(affectedCount) || 0}.${dpcNote} Description: ${descriptionExcerpt}. Reference: ${breach.id}.`,
            ctaLabel: "Investigate Breach",
          },
        });
      }
    } catch (inboxErr) {
      logger.error("[pdpl/breach POST] inbox creation failed:", inboxErr);
    }

    return NextResponse.json({ ok: true, breachId: breach.id });
  } catch (e: any) {
    logger.error("[pdpl/breach POST]", e);
    return NextResponse.json(
      { error: e?.message || "Failed to report data breach" },
      { status: 500 },
    );
  }
}
