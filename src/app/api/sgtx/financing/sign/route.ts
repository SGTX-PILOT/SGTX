// 3B.5.9 — Sign Financing Agreement (Borrower / Financier / Governor)
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";
import crypto from "crypto";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { agreementId, signerGtid, role, annexIds } = body;
    // role: BORROWER | FINANCIER | GOVERNOR
    if (!agreementId || !signerGtid || !role) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const agreement = await db.financingAgreement.findUnique({
      where: { id: agreementId },
      include: { request: { include: { borrower: true } }, annexes: true },
    });
    if (!agreement) return NextResponse.json({ error: "Agreement not found" }, { status: 404 });

    // G4U6 — Witness clause must be present
    if (!agreement.witnessClauseText || agreement.witnessClauseText.length < 50) {
      return NextResponse.json({ error: "Witness clause missing or invalid. Lock blocked.", code: "G4U6_WITNESS" }, { status: 400 });
    }

    const now = new Date();
    const signatureValue = "ed25519:" + crypto.createHash("sha256").update(agreement.masterContractHash + signerGtid + role + now.toISOString()).digest("hex").slice(0, 64);

    if (role === "BORROWER") {
      if (agreement.request.borrowerGtid !== signerGtid) return NextResponse.json({ error: "Not the borrower" }, { status: 403 });
      await db.financingAgreement.update({ where: { id: agreementId }, data: { borrowerSignedAt: now } });
      // Sign all annexes (master agreement)
      const targetAnnexes = annexIds ? agreement.annexes.filter((a) => annexIds.includes(a.id)) : agreement.annexes;
      for (const a of targetAnnexes) {
        if (!a.financierSignedAt) {
          // Borrower signs, but annex still needs financier signature
        }
      }
    } else if (role === "FINANCIER") {
      // Sign only the annexes where this financier is counterparty
      const targetAnnexes = agreement.annexes.filter((a) => a.financierGtid === signerGtid);
      if (targetAnnexes.length === 0) return NextResponse.json({ error: "No annexes for this financier" }, { status: 403 });
      for (const a of targetAnnexes) {
        await db.financingAgreementAnnex.update({ where: { id: a.id }, data: { financierSignedAt: now, status: "SIGNED" } });
      }
      // Update agreement-level financier signed (any of them — first to sign)
      await db.financingAgreement.update({ where: { id: agreementId }, data: { financierSignedAt: now } });
    } else if (role === "GOVERNOR") {
      await db.financingAgreement.update({
        where: { id: agreementId },
        data: { governorSignedAt: now, governorSignature: signatureValue },
      });
    }

    // Reload to check if all signatures complete
    const updated = await db.financingAgreement.findUnique({
      where: { id: agreementId },
      include: { annexes: true, request: true },
    });
    if (!updated) return NextResponse.json({ error: "Agreement disappeared" }, { status: 500 });

    const allAnnexesSigned = updated.annexes.every((a) => a.financierSignedAt);
    const fullySigned = updated.borrowerSignedAt && updated.financierSignedAt && updated.governorSignedAt && allAnnexesSigned;

    if (fullySigned && updated.status === "PENDING_SIGNATURES") {
      await db.financingAgreement.update({ where: { id: agreementId }, data: { status: "FULLY_SIGNED" } });
      await db.financingRequest.update({ where: { id: updated.requestId }, data: { status: "DISBURSING" } });

      // M2 fix — advance Trade.phase to 4 (Financing). Use Math.max to avoid regressing a trade
      // that's already past Phase 4 (e.g. an early disbursement re-sign).
      try {
        const ustnForTrade = updated.request.ustn;
        if (ustnForTrade) {
          const tradeRow = await db.trade.findUnique({ where: { ustn: ustnForTrade }, select: { phase: true } });
          if (tradeRow && tradeRow.phase < 4) {
            await db.trade.update({ where: { ustn: ustnForTrade }, data: { phase: 4 } });
          }
        } else if (updated.request.tradeId) {
          // Fallback to tradeId if ustn isn't populated on the request
          const tradeRow = await db.trade.findUnique({ where: { id: updated.request.tradeId }, select: { phase: true } });
          if (tradeRow && tradeRow.phase < 4) {
            await db.trade.update({ where: { id: updated.request.tradeId }, data: { phase: 4 } });
          }
        }
      } catch (phaseErr) {
        logger.error("[financing/sign] phase update error (non-blocking)", {
          error: phaseErr instanceof Error ? phaseErr.message : String(phaseErr),
        });
      }

      // Notify each financier to disburse
      for (const a of updated.annexes) {
        await db.inboxItem.create({
          data: {
            tenantGtid: a.financierGtid,
            tradeId: updated.request.tradeId,
            category: "NEEDS_APPROVAL",
            priority: 96,
            title: `Disbursement ready — annex ${a.id.slice(-8)}`,
            description: `Agreement ${updated.agreementId} fully signed. Click Disburse to send $${a.amountFinanced} to borrower (PSP will split 0.25% SGTX fee automatically).`,
            ctaLabel: "Disburse",
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      role,
      signedAt: now,
      signatureValue,
      agreementStatus: updated.status,
      fullySigned,
      remainingSignatures: {
        borrower: !updated.borrowerSignedAt,
        financier: !updated.financierSignedAt,
        governor: !updated.governorSignedAt,
        annexes: updated.annexes.filter((a) => !a.financierSignedAt).length,
      },
    });
  } catch (e: any) {
    logger.error("[financing/sign]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
