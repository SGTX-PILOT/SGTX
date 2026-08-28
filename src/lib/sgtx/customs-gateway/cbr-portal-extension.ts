// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function getCBRDashboard(brokerGtid: string): Promise<any> {
  try {
    const declarations = await db.customsDeclaration.findMany({ where: { brokerGtid }, take: 20, orderBy: { createdAt: "desc" } }).catch(() => []);
    const inbox = await db.inboxItem.findMany({ where: { tenantGtid: brokerGtid, category: { in: ["CUSTOMS", "COMPLIANCE"] } }, take: 10, orderBy: { priority: "desc" } }).catch(() => []);
    return { activeDeclarations: (declarations as any[]).filter(d => !["ACCEPTED", "REJECTED", "CANCELLED", "EXPIRED"].includes(d.status)), pendingCertifications: [], credentialStatus: [], submissionMonitoring: [], governmentStatus: {}, recentEvents: inbox };
  } catch (e: any) { logger.error("[cbr-portal] error:", e); return { activeDeclarations: [], pendingCertifications: [], credentialStatus: [], submissionMonitoring: [], governmentStatus: {}, recentEvents: [] }; }
}

export async function getBrokerDeclarations(brokerGtid: string, filter?: any): Promise<any[]> {
  try { return await db.customsDeclaration.findMany({ where: { brokerGtid, ...filter }, take: 50, orderBy: { createdAt: "desc" } }); } catch { return []; }
}

export async function getPendingCertifications(brokerGtid: string): Promise<any[]> {
  try { return await db.customsDeclaration.findMany({ where: { brokerGtid, status: "BROKER_REVIEW" }, take: 20 }); } catch { return []; }
}

export async function getBrokerCredentials(brokerGtid: string): Promise<any[]> {
  try { return await db.tenant.findMany({ where: { gtid: brokerGtid } }); } catch { return []; }
}

export async function getSubmissionMonitoring(brokerGtid: string): Promise<any[]> {
  try { return await db.customsDeclaration.findMany({ where: { brokerGtid, status: { in: ["SUBMITTED", "ACKNOWLEDGED", "PROCESSING"] } }, take: 20 }); } catch { return []; }
}

export async function getGovernmentStatusSummary(brokerGtid: string): Promise<any> {
  return { accepted: 0, rejected: 0, held: 0, processing: 0, pending: 0 };
}

export async function requestCertification(declarationId: string, brokerGtid: string): Promise<any> {
  try { return await db.customsDeclaration.update({ where: { id: declarationId }, data: { status: "BROKER_REVIEW" } }); } catch { return null; }
}

export async function reviewDeclaration(declarationId: string, brokerGtid: string, action: string, notes: string): Promise<void> {
  try {
    const newStatus = action === "CERTIFY" ? "BROKER_CERTIFIED" : "BROKER_REJECTED";
    await db.customsDeclaration.update({ where: { id: declarationId }, data: { status: newStatus } });
    await db.activity.create({ data: { tradeId: null, action: `DECLARATION_${action}ED`, type: action === "CERTIFY" ? "SUCCESS" : "WARNING", description: `Broker ${brokerGtid} ${action}ED declaration ${declarationId}. Notes: ${notes}`, actorGtid: brokerGtid } });
  } catch (e: any) { logger.error("[cbr-portal] reviewDeclaration error:", e); }
}

export async function getCustomsNotifications(tenantGtid: string): Promise<any[]> {
  try { return await db.inboxItem.findMany({ where: { tenantGtid, category: { in: ["CUSTOMS", "COMPLIANCE", "REGULATORY_OVERSIGHT"] } }, take: 20, orderBy: { priority: "desc" } }); } catch { return []; }
}
