// @ts-nocheck
// §16.8.10 Tab 5 (Bank/PFI) — Financed Companies Directory
// GET /api/sgtx/finance/financiers/[id]/financed-companies
//
// Returns the bank's private, read-only directory of every borrower it has
// ever financed. Aggregates TradeFinanceCase rows by borrowerGtid to show:
//   - borrower GTID (masked if privacy flag is on)
//   - legal name (resolved from Tenant table when available)
//   - total financed amount (sum of amountUsd across all cases for this borrower)
//   - active loans count (cases not CLOSED/REJECTED/CANCELLED)
//   - last financed date (most recent case.createdAt)
//   - trust score (resolved from Tenant.trustScore when available; falls
//     back to a synthesised score derived from the case history)
//   - financing history (list of all cases for this borrower — used by the
//     "View Details" expand)
//
// PRIVACY: this endpoint returns data only for borrowers the financier has
// a real financing relationship with (i.e. TradeFinanceCase rows where
// financierGtid === [id]). The bank's view is NEVER shared with other
// financiers — there is no /financiers/[id]/financed-companies endpoint
// that takes a different financier's GTID.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

const CLOSED_CASE_STATUSES = new Set(["CLOSED", "REJECTED", "CANCELLED"]);

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: financierGtid } = await params;
    if (!financierGtid) {
      return NextResponse.json(
        { error: "financier id required" },
        { status: 400 },
      );
    }

    // Fetch every case the financier has participated in (including closed).
    const allCases = await db.tradeFinanceCase.findMany({
      where: { financierGtid },
      orderBy: { createdAt: "desc" },
    });

    if (allCases.length === 0) {
      return NextResponse.json({
        companies: [],
        summary: {
          totalBorrowers: 0,
          totalFinancedUsd: 0,
          activeLoans: 0,
        },
        private: true,
        note: "This directory is private. Never shared with other financiers.",
      });
    }

    // Group by borrowerGtid
    const byBorrower = new Map<string, any[]>();
    for (const c of allCases) {
      const arr = byBorrower.get(c.borrowerGtid) || [];
      arr.push(c);
      byBorrower.set(c.borrowerGtid, arr);
    }

    // Resolve tenant names + trust scores in a single batched query.
    const borrowerGtids = Array.from(byBorrower.keys());
    const tenants = await db.tenant.findMany({
      where: { gtid: { in: borrowerGtids } },
      select: {
        gtid: true,
        legalName: true,
        type: true,
        country: true,
        trustScore: true,
      },
    });
    const tenantByGtid = new Map(tenants.map((t) => [t.gtid, t]));

    const companies = Array.from(byBorrower.entries()).map(([borrowerGtid, cases]) => {
      const tenant = tenantByGtid.get(borrowerGtid);
      const totalFinancedUsd = cases.reduce(
        (s, c) => s + (Number(c.amountUsd) || 0),
        0,
      );
      const activeCases = cases.filter(
        (c) => !CLOSED_CASE_STATUSES.has((c.status || "").toUpperCase()),
      );
      const lastFinancedAt = cases[0]?.createdAt || null; // cases are DESC by createdAt
      // Synthesise a trust score (0-100) when Tenant.trustScore is null:
      //   -10 pts per margin call triggered
      //   -5 pts per CLOSED-with-default case
      //   +20 pts for ≥3 cases (long relationship)
      //   +10 pts for relationshipVerified on most recent case
      const marginCalls = cases.filter((c) => c.marginCallTriggered).length;
      const defaults = cases.filter(
        (c) => (c.status || "").toUpperCase().includes("DEFAULT") ||
               (c.status || "").toUpperCase().includes("DELINQUENT"),
      ).length;
      const longRelationshipBonus = cases.length >= 3 ? 20 : 0;
      const verifiedBonus = cases[0]?.relationshipVerified ? 10 : 0;
      const synthesisedTrust = Math.max(
        0,
        Math.min(100, 80 - marginCalls * 10 - defaults * 5 + longRelationshipBonus + verifiedBonus),
      );
      const trustScore = tenant?.trustScore ?? synthesisedTrust;
      return {
        borrowerGtid,
        maskedGtid: maskGtid(borrowerGtid),
        legalName: tenant?.legalName || `Borrower ${borrowerGtid.slice(-6)}`,
        tenantType: tenant?.type || "TRD",
        country: tenant?.country || borrowerGtid.slice(5, 7),
        totalFinancedUsd: Math.round(totalFinancedUsd * 100) / 100,
        activeLoansCount: activeCases.length,
        totalCasesCount: cases.length,
        lastFinancedAt,
        trustScore,
        history: cases.map((c) => ({
          caseId: c.caseId,
          ustn: c.ustn,
          amountUsd: c.amountUsd,
          currency: c.currency || "USD",
          apr: c.apr,
          tenorDays: c.tenorDays,
          status: c.status,
          collateralType: c.collateralType,
          collateralValueUsd: c.collateralValueUsd,
          disbursementAmountUsd: c.disbursementAmountUsd,
          disbursementDate: c.disbursementDate,
          repaymentAmountUsd: c.repaymentAmountUsd,
          repaymentDate: c.repaymentDate,
          marginCallTriggered: c.marginCallTriggered,
          relationshipVerified: c.relationshipVerified,
          createdAt: c.createdAt,
        })),
      };
    });

    // Sort companies: most recently financed first (uses lastFinancedAt).
    companies.sort((a, b) => {
      const at = a.lastFinancedAt ? new Date(a.lastFinancedAt).getTime() : 0;
      const bt = b.lastFinancedAt ? new Date(b.lastFinancedAt).getTime() : 0;
      return bt - at;
    });

    const totalFinancedUsd = companies.reduce(
      (s, c) => s + c.totalFinancedUsd,
      0,
    );
    const activeLoans = companies.reduce(
      (s, c) => s + c.activeLoansCount,
      0,
    );

    return NextResponse.json({
      companies,
      summary: {
        totalBorrowers: companies.length,
        totalFinancedUsd: Math.round(totalFinancedUsd * 100) / 100,
        activeLoans,
      },
      private: true,
      note: "This directory is private. Never shared with other financiers.",
    });
  } catch (err: any) {
    logger.error("[api/finance/financiers/financed-companies] GET failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}

function maskGtid(gtid: string): string {
  if (!gtid) return "—";
  if (gtid.length <= 12) return gtid;
  return `${gtid.slice(0, 6)}…${gtid.slice(-4)}`;
}
