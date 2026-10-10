// @ts-nocheck
import { NextResponse } from "next/server";
import { buildFinanceApprovalChecklist, getFinanceApprovalSummary } from "@/lib/sgtx/payments/finance-approval-matrix";

// GET /api/sgtx/payments/finance-checklist/:country?destination=XX&financier=BANK|PFI|BOTH
// Returns the full finance-approval checklist for the borrower jurisdiction.

export async function GET(
  req: Request,
  { params }: { params: Promise<{ country: string }> }
) {
  const { country } = await params;
  const url = new URL(req.url);
  const destination = url.searchParams.get("destination") || undefined;
  const financier = (url.searchParams.get("financier") as "BANK" | "PFI" | "BOTH") || "BOTH";

  if (country.toLowerCase() === "summary" || country.toLowerCase() === "stats") {
    return NextResponse.json({ ok: true, summary: getFinanceApprovalSummary() });
  }

  const checklist = buildFinanceApprovalChecklist(country, destination, financier);
  if (!checklist) {
    return NextResponse.json(
      { ok: false, error: `Country '${country}' not in finance-approval matrix` },
      { status: 404 }
    );
  }

  return NextResponse.json({ ok: true, checklist });
}
