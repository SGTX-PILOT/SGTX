// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
export interface ReconciliationConflict { source1: string; source2: string; field: string; value1: string; value2: string; severity: string; }
export interface ReconciliationResult { ustn: string; expectedState: string; brokerSubmission: string; governmentAcknowledgement: string; governmentFinalResponse: string; paymentEvidence: string; bankConfirmation: string; physicalEvidence: string; allMatch: boolean; conflicts: ReconciliationConflict[]; reconciledAt: Date; }
export async function reconcileCustoms(ustn: string): Promise<ReconciliationResult> {
  try {
    const declarations = await db.customsDeclaration.findMany({ where: { ustn } }).catch(() => []);
    const conflicts: ReconciliationConflict[] = [];
    const expectedState = "ACCEPTED";
    const brokerSubmission = declarations.length > 0 ? (declarations[0] as any).status || "UNKNOWN" : "NO_DECLARATION";
    const govAck = (declarations[0] as any)?.governmentStatus || "UNKNOWN";
    const allMatch = brokerSubmission === expectedState && govAck === expectedState;
    if (!allMatch) conflicts.push({ source1: "SGTX_EXPECTED", source2: "GOVERNMENT", field: "status", value1: expectedState, value2: govAck, severity: "MEDIUM" });
    return { ustn, expectedState, brokerSubmission, governmentAcknowledgement: govAck, governmentFinalResponse: govAck, paymentEvidence: "NOT_CHECKED", bankConfirmation: "NOT_CHECKED", physicalEvidence: "NOT_CHECKED", allMatch, conflicts, reconciledAt: new Date() };
  } catch (e: any) { return { ustn, expectedState: "UNKNOWN", brokerSubmission: "UNKNOWN", governmentAcknowledgement: "UNKNOWN", governmentFinalResponse: "UNKNOWN", paymentEvidence: "UNKNOWN", bankConfirmation: "UNKNOWN", physicalEvidence: "UNKNOWN", allMatch: false, conflicts: [], reconciledAt: new Date() }; }
}
export async function getReconciliationStatus(ustn: string): Promise<{ reconciled: boolean; lastReconciledAt: Date; openConflicts: number }> {
  const r = await reconcileCustoms(ustn); return { reconciled: r.allMatch, lastReconciledAt: r.reconciledAt, openConflicts: r.conflicts.length };
}
export async function autoReconcilePending(): Promise<{ checked: number; reconciled: number; conflicts: number }> {
  return { checked: 0, reconciled: 0, conflicts: 0 };
}
