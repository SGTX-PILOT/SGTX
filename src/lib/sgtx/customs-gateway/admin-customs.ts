// @ts-nocheck
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export async function getCustomsGatewayOverview(): Promise<any> {
  try {
    const declarations = await db.customsDeclaration.findMany({ take: 1000 }).catch(() => []);
    const total = declarations.length;
    const accepted = declarations.filter((d: any) => d.status === "ACCEPTED").length;
    const rejected = declarations.filter((d: any) => d.status === "REJECTED").length;
    const held = declarations.filter((d: any) => ["CUSTOMS_HOLD", "PGA_HOLD"].includes(d.status)).length;
    const errors = declarations.filter((d: any) => d.status === "EXTERNAL_SYSTEM_ERROR").length;
    return { totalAdapters: 5, activeConnections: 0, submissionsToday: total, successRate: total > 0 ? Math.round(accepted / total * 100) : 0, rejectionRate: total > 0 ? Math.round(rejected / total * 100) : 0, holdCount: held, errorCount: errors };
  } catch (e: any) { return { totalAdapters: 5, activeConnections: 0, submissionsToday: 0, successRate: 0, rejectionRate: 0, holdCount: 0, errorCount: 0 }; }
}

export async function getAdapterHealth(): Promise<any[]> {
  return [
    { adapterId: "US-CBP-ACE", jurisdiction: "US", status: "LEGAL_AUTHORIZATION_REQUIRED", lastSuccess: null, lastError: null, uptimePct: 0, avgLatencyMs: 0, totalSubmissions: 0, successful: 0, rejected: 0, held: 0 },
    { adapterId: "EG-NAFEZA", jurisdiction: "EG", status: "CORE_READY", lastSuccess: null, lastError: null, uptimePct: 0, avgLatencyMs: 0, totalSubmissions: 0, successful: 0, rejected: 0, held: 0 },
    { adapterId: "EG-CARGOX", jurisdiction: "EG", status: "CORE_READY", lastSuccess: null, lastError: null, uptimePct: 0, avgLatencyMs: 0, totalSubmissions: 0, successful: 0, rejected: 0, held: 0 },
    { adapterId: "EG-ETA", jurisdiction: "EG", status: "CORE_READY", lastSuccess: null, lastError: null, uptimePct: 0, avgLatencyMs: 0, totalSubmissions: 0, successful: 0, rejected: 0, held: 0 },
    { adapterId: "EG-CBE", jurisdiction: "EG", status: "CORE_READY", lastSuccess: null, lastError: null, uptimePct: 0, avgLatencyMs: 0, totalSubmissions: 0, successful: 0, rejected: 0, held: 0 },
  ];
}

export async function getBrokerConnections(): Promise<any[]> {
  try { return await db.tenant.findMany({ where: { type: "CBR" }, take: 50 }).catch(() => []); } catch { return []; }
}

export async function getFailedTransactions(): Promise<any[]> {
  try { return await db.customsDeclaration.findMany({ where: { status: "EXTERNAL_SYSTEM_ERROR" }, take: 20 }).catch(() => []); } catch { return []; }
}

export async function getDeadLetterQueue(): Promise<any[]> { return []; }
export async function getSchemaVersions(): Promise<any[]> {
  return [
    { adapterId: "US-CBP-ACE", adapterVersion: "1.0.0", apiVersion: "ACE ABI 5.0", schemaVersion: "CBP 2024", jurisdictionVersion: "US 2024" },
    { adapterId: "EG-NAFEZA", adapterVersion: "1.0.0", apiVersion: "Nafeza REST v2", schemaVersion: "WCO DM 2023", jurisdictionVersion: "EG 2024" },
  ];
}

export async function getCertificationReadiness(): Promise<any[]> {
  return [
    { adapterId: "US-CBP-ACE", lifecycleStage: "DEMO", certificationSteps: [], readyForProduction: false },
    { adapterId: "EG-NAFEZA", lifecycleStage: "DEMO", certificationSteps: [], readyForProduction: false },
  ];
}
