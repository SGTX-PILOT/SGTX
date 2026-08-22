// @ts-nocheck
// §14 Run-All-Tests — the comprehensive readiness sweep.
// POST /api/sgtx/readiness/run-all-tests   body: { ustn?, generatedBy? }
//
// Runs every Phase 10 verification (§1-§10) + generates a fresh
// ProductionReadinessReport (§11-§12). Returns a summary object:
//   { e2e, multimodal, countries, governmentConnectivity, financialRecon,
//     dataRecon, gapCenter, securityAudit, governorCoverage, loomTraceability,
//     report, summary }
//
// Each individual verification is wrapped in its own try/catch so a failure
// in one block does NOT abort the sweep — the failed block returns
// { error: <message>, ok: false } and the sweep continues.
import { NextResponse } from "next/server";
import {
  validateE2ETradeGraph,
  runMultimodalTests,
  runCountryReadinessTests,
  verifyGovernmentConnectivity,
  verifyFinancialReconciliation,
  verifyDataReconciliation,
  verifyAdminGapCenter,
  runSecurityAudit,
  verifyGovernorCoverage,
  verifyLoomTraceability,
  generateProductionReadinessReport,
} from "@/lib/sgtx/production-readiness";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

async function safe<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ ok: true; result: T } | { ok: false; error: string }> {
  try {
    const result = await fn();
    return { ok: true, result };
  } catch (err: any) {
    logger.error(`[api/sgtx/readiness/run-all-tests] ${label} failed`, {
      error: err?.message,
    });
    return { ok: false, error: err?.message || "internal error" };
  }
}

export async function POST(req: Request) {
  try {
    let ustn: string | undefined;
    let generatedBy: string | undefined;
    try {
      const body = await req.json();
      if (body && typeof body === "object") {
        if (typeof body.ustn === "string") ustn = body.ustn;
        if (typeof body.generatedBy === "string") generatedBy = body.generatedBy;
      }
    } catch {
      // body optional
    }

    // §1 E2E Trade Graph — only run if a USTN was provided (else skip).
    const e2e = ustn
      ? await safe("e2e", () => validateE2ETradeGraph(ustn as string))
      : { ok: true, result: null, skipped: true } as any;

    // §2 Multimodal tests
    const multimodal = await safe("multimodal", () => runMultimodalTests());

    // §3 Country readiness tests
    const countries = await safe("countries", () => runCountryReadinessTests());

    // §4 Government connectivity
    const governmentConnectivity = await safe("governmentConnectivity", () =>
      verifyGovernmentConnectivity(),
    );

    // §5 Financial reconciliation
    const financialRecon = await safe("financialRecon", () =>
      verifyFinancialReconciliation(ustn),
    );

    // §6 Data reconciliation
    const dataRecon = await safe("dataRecon", () =>
      verifyDataReconciliation(ustn),
    );

    // §7 Admin gap center
    const gapCenter = await safe("gapCenter", () => verifyAdminGapCenter());

    // §8 Security audit
    const securityAudit = await safe("securityAudit", () => runSecurityAudit());

    // §9 Governor coverage
    const governorCoverage = await safe("governorCoverage", () =>
      verifyGovernorCoverage(),
    );

    // §10 Loom traceability
    const loomTraceability = await safe("loomTraceability", () =>
      verifyLoomTraceability(ustn),
    );

    // §11-§12 Production readiness report (always generated — aggregates all).
    const report = await safe("report", () =>
      generateProductionReadinessReport(generatedBy),
    );

    // Build a summary from the individual results.
    const blocks = {
      e2e,
      multimodal,
      countries,
      governmentConnectivity,
      financialRecon,
      dataRecon,
      gapCenter,
      securityAudit,
      governorCoverage,
      loomTraceability,
      report,
    };
    const passedCount = Object.values(blocks).filter(
      (b: any) => b?.ok === true,
    ).length;
    const failedCount = Object.values(blocks).filter(
      (b: any) => b?.ok === false,
    ).length;
    const summary = {
      total: Object.keys(blocks).length,
      passed: passedCount,
      failed: failedCount,
      overallReady:
        report.ok === true &&
        report.result?.overallReadiness === "PRODUCTION_CONNECTED",
      overallReadiness:
        report.ok === true ? report.result?.overallReadiness : null,
      readinessScore:
        report.ok === true ? report.result?.readinessScore : null,
      terminology: report.ok === true ? report.result?.terminology : null,
      ranAt: new Date().toISOString(),
      ustn: ustn || null,
      generatedBy: generatedBy || null,
    };

    return NextResponse.json({ ...blocks, summary });
  } catch (err: any) {
    logger.error("[api/sgtx/readiness/run-all-tests] POST failed", {
      error: err?.message,
    });
    return NextResponse.json(
      { error: err?.message || "internal error" },
      { status: 500 },
    );
  }
}
