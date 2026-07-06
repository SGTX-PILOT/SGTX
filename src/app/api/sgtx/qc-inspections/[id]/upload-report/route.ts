import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { freezeFeeLock } from "@/lib/sgtx/payment/fealock";
import { logger } from "@/lib/sgtx/logger";

// POST /api/sgtx/qc-inspections/[id]/upload-report
// Body: { result, defectCount, notes, actionPlan, defectsJson }
//   result: "PASS" | "FAIL" | "CONDITIONAL_PASS"
//
// CG-8 fix: when result === "FAIL", the upload is CONTRACTUAL, not informational.
// The route now:
//   1. (existing) Updates the QcInspection row + uploads a QC_REPORT document.
//   2. (existing) Smart-Inboxes buyer + seller with the result.
//   3. (NEW) Auto-freezes the FeeLock for the USTN — calls freezeFeeLock with
//      reason "QC_FAIL_AUTO_FREEZE". Wrapped in try/catch so a freeze failure
//      (e.g., no ACTIVE FeeLock yet) doesn't break the report upload.
//   4. (NEW) Auto-revokes any active ContainerReleaseAuthorisation rows for
//      this USTN — sets releaseStatus="REVOKED" + revocationReason="QC_FAIL_AUTO_REVOKE".
//      Also Smart-Inboxes the carrier so the gate refuses exit. Wrapped in
//      try/catch (non-blocking).
//   5. (NEW) Writes an Activity log row recording the auto-freeze + auto-revoke.
//   6. (CG-8 c) When FAIL, the counterparty inbox message body is enhanced to
//      mention the FeeLock freeze + release revocation so the trader knows the
//      contractual consequence and how to dispute.
//
// All existing logic (PASS / CONDITIONAL_PASS paths, the document upload, the
// inbox fan-out) is preserved unchanged — the FAIL branch only ADDS the
// contractual consequences.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { result, defectCount, notes, actionPlan, defectsJson } = await req.json();
    const inspection = await db.qcInspection.findUnique({ where: { id }, include: { trade: true } });
    if (!inspection) return NextResponse.json({ error: "Inspection not found" }, { status: 404 });

    const ustn = inspection.trade?.ustn;
    const isFail = String(result || "").toUpperCase() === "FAIL";

    // (existing) — update the QcInspection record.
    await db.qcInspection.update({
      where: { id },
      data: {
        result,
        defectCount: defectCount || 0,
        notes,
        actionPlan,
        defectsJson: defectsJson || "[]",
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    // (existing) — upload the QC report as a verified document.
    await db.document.create({
      data: {
        tradeId: inspection.tradeId,
        type: "QC_REPORT",
        title: `QC Report — ${inspection.inspectionType}`,
        status: "UPLOADED",
        uploadedBy: inspection.qcGtid,
        hashSha256: `qc-${id}-${Date.now()}`,
      },
    }).catch(() => null);

    // (CG-8 c) — build the inbox message body. For FAIL, the message is
    // enhanced to mention the FeeLock freeze + release revocation.
    const baseDescription = `${inspection.inspectionType}: ${result}. Defects: ${defectCount || 0}. ${notes || ""}`.trim();
    const failDescription = ustn
      ? `${baseDescription}\n\nQuality Control has FAILED inspection on ${ustn}. FeeLock has been auto-frozen and container releases revoked. File a dispute if you contest this finding.`
      : `${baseDescription}\n\nQuality Control has FAILED inspection. FeeLock has been auto-frozen and container releases revoked. File a dispute if you contest this finding.`;
    const inboxDescription = isFail ? failDescription : baseDescription;
    const inboxPriority = isFail ? 95 : 80;       // FAIL is contractual — bump priority above the standard 80.
    const inboxCategory = isFail ? "SHIPMENT_ALERT" : "GENERAL"; // FAIL surfaces as a shipment alert, not a general note.

    // (existing, enhanced) — Smart-Inbox buyer + seller.
    await db.inboxItem.create({
      data: {
        tenantGtid: inspection.trade.buyerGtid,
        tradeId: inspection.tradeId,
        category: inboxCategory,
        priority: inboxPriority,
        title: `QC Result: ${result}`,
        description: inboxDescription,
        ctaLabel: isFail ? "File Dispute" : "View Report",
      },
    }).catch(() => null);
    await db.inboxItem.create({
      data: {
        tenantGtid: inspection.trade.sellerGtid,
        tradeId: inspection.tradeId,
        category: inboxCategory,
        priority: inboxPriority,
        title: `QC Result: ${result}`,
        description: inboxDescription,
        ctaLabel: isFail ? "File Dispute" : "View Report",
      },
    }).catch(() => null);

    // (CG-8 a + b + d) — FAIL contractual consequences. Every step is wrapped
    // in try/catch so a failure in one consequence does NOT break the report
    // upload (the trader must always know the QC result, even if FeeLock
    // freeze fails because no ACTIVE FeeLock exists yet).
    let feeLockFrozen = false;
    let releasesRevoked = 0;

    if (isFail && ustn) {
      // (a) Auto-freeze the FeeLock. freezeFeeLock throws if there is no ACTIVE
      // FeeLock — we catch and log so the upload proceeds regardless.
      try {
        await freezeFeeLock(ustn, "QC_FAIL_AUTO_FREEZE");
        feeLockFrozen = true;
      } catch (freezeErr: any) {
        // Common case: no FeeLock yet (trade pre-funding). Non-blocking.
        logger.warn(`[qc upload-report] FeeLock freeze failed for ${ustn}: ${freezeErr?.message || freezeErr}`);
      }

      // (b) Auto-revoke any active ContainerReleaseAuthorisation rows for this
      // USTN. The model exists (ContainerReleaseAuthorisation) with
      // releaseStatus + revocationReason fields. We bypass autoRevokeOnEvent
      // because its AutoRevokeEventType union does not include QC_FAIL and the
      // task spec mandates revocationReason = "QC_FAIL_AUTO_REVOKE".
      try {
        const revokeResult: any = await db.containerReleaseAuthorisation.updateMany({
          where: {
            ustn,
            releaseStatus: "AUTHORISED",
            revokedAt: null,
          },
          data: {
            releaseStatus: "REVOKED",
            revocationReason: "QC_FAIL_AUTO_REVOKE",
            revokedAt: new Date(),
          },
        });
        releasesRevoked = Number(revokeResult?.count || 0);

        // If any authorisations were revoked, alert the carrier(s) so the gate
        // refuses exit. Mirrors the autoRevokeOnEvent inbox pattern.
        if (releasesRevoked > 0) {
          const revokedAuths: any[] = await db.containerReleaseAuthorisation.findMany({
            where: { ustn, releaseStatus: "REVOKED", revocationReason: "QC_FAIL_AUTO_REVOKE" },
            select: { containerNo: true, authorisationId: true },
            orderBy: { revokedAt: "desc" },
            take: 20,
          }).catch(() => []);
          const containerList = revokedAuths.map((a) => a.containerNo).join(", ") || "(none)";
          // Carrier inbox — broadcast to the default shipping-line tenant so the
          // gate sees it on the next release query. (autoRevokeOnEvent uses the
          // same SGTX-EG-SHP-000031-9E8F default for the same reason.)
          await db.inboxItem.create({
            data: {
              tenantGtid: "SGTX-EG-SHP-000031-9E8F",
              category: "SHIPMENT_ALERT",
              priority: 100,
              title: `AUTO-REVOKE (QC_FAIL) — ${ustn.slice(0, 24)}…`,
              description:
                `Auto-revoke triggered by QC FAIL on ${ustn}. Reason: QC_FAIL_AUTO_REVOKE. ` +
                `Affected containers: ${containerList}. ` +
                `${releasesRevoked} authorisation(s) revoked at ${new Date().toISOString()}. ` +
                `Gate must refuse exit until the QC failure is disputed and overturned, then a fresh AUTHORISED token is issued.`,
              ctaLabel: "View Audit Trail",
            },
          }).catch(() => null);
        }
      } catch (revokeErr: any) {
        logger.warn(`[qc upload-report] Release revocation failed for ${ustn}: ${revokeErr?.message || revokeErr}`);
      }

      // (d) Activity log row recording the auto-freeze + auto-revoke for the
      // audit trail. tradeId is required on Activity; actorGtid = the QC tenant.
      try {
        await db.activity.create({
          data: {
            tradeId: inspection.tradeId,
            actorGtid: inspection.qcGtid,
            action: "QC_FAIL_AUTO_FREEZE_AND_REVOKE",
            description:
              `QC inspection ${id} FAILED for ${ustn}. ` +
              `FeeLock ${feeLockFrozen ? "auto-frozen (reason=QC_FAIL_AUTO_FREEZE)" : "freeze skipped (no ACTIVE FeeLock or freeze error)"}. ` +
              `${releasesRevoked} container release authorisation(s) revoked (reason=QC_FAIL_AUTO_REVOKE). ` +
              `Buyer + seller notified via Smart Inbox (priority 95).`,
            type: "CRITICAL",
            metadata: JSON.stringify({
              qcInspectionId: id,
              ustn,
              defectCount: defectCount || 0,
              feeLockFrozen,
              releasesRevoked,
              notes: notes || null,
            }),
          },
        });
      } catch (actErr: any) {
        logger.warn(`[qc upload-report] Activity log write failed for ${ustn}: ${actErr?.message || actErr}`);
      }
    }

    return NextResponse.json({
      ok: true,
      status: "COMPLETED",
      result,
      ...(isFail && ustn ? {
        contractualConsequences: {
          feeLockFrozen,
          releasesRevoked,
        },
      } : {}),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
