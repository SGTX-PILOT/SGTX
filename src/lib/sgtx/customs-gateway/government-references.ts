// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
export interface GovernmentReference { externalReferenceId: string; ustn: string; gtid: string; system: string; country: string; authority: string; referenceType: string; referenceValue: string; issuedAt: Date; status: string; source: string; evidenceId: string; }
const refs: GovernmentReference[] = [];
export async function createGovernmentReference(data: any): Promise<GovernmentReference> {
  const ref = { ...data, externalReferenceId: `GOVREF-${Date.now()}-${Math.random().toString(36).slice(2,6).toUpperCase()}`, issuedAt: new Date() };
  refs.push(ref); return ref;
}
export async function getGovernmentReferences(ustn: string): Promise<GovernmentReference[]> {
  return refs.filter(r => r.ustn === ustn);
}
export async function getReferenceByValue(referenceType: string, referenceValue: string): Promise<GovernmentReference | null> {
  return refs.find(r => r.referenceType === referenceType && r.referenceValue === referenceValue) || null;
}
export async function getMultiJurisdictionDeclarations(ustn: string): Promise<any[]> {
  try { return await db.customsDeclaration.findMany({ where: { ustn } }).catch(() => []); } catch { return []; }
}
