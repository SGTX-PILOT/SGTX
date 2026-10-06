// @ts-nocheck
import { logger } from "@/lib/sgtx/logger";
let inngestClient: any = null;
export async function getInngestClient(): Promise<any | null> {
  if (inngestClient) return inngestClient;
  const eventKey = process.env.INNGEST_EVENT_KEY;
  if (!eventKey) { logger.info("[inngest] not configured — Vercel cron fallback"); return null; }
  try { const { Inngest } = await import("inngest"); inngestClient = new Inngest({ id: process.env.INNGEST_APP_ID || "sgtx-platform", eventKey, signingKey: process.env.INNGEST_SIGNING_KEY }); return inngestClient; }
  catch (e: any) { logger.warn("[inngest] init failed:", { error: e?.message }); return null; }
}
export async function sendInngestEvent(name: string, data: any = {}): Promise<boolean> {
  const client = await getInngestClient(); if (!client) return false;
  try { await client.send({ name, data }); return true; } catch (e: any) { logger.warn("[inngest] send failed:", { name, error: e?.message }); return false; }
}
export const SGTX_JOBS = { LATE_FEE_CALC:"sgtx/late-fee.calculate", GOVERNOR_AUDIT:"sgtx/governor.audit-chain", TRI_RECALC:"sgtx/tri.recalculate", BRAIN_LEARNING:"sgtx/brain.dataset-collect", EU_PESTICIDES_SYNC:"sgtx/eu-pesticides.sync", USTN_CLOSURE_CHECK:"sgtx/ustn.closure-check", REPAYMENT_REMINDER:"sgtx/financing.repayment-reminder", SAR_DETECTION:"sgtx/sar.detect", FEE_ANOMALY:"sgtx/fee.anomaly-check", COMPLIANCE_REFRESH:"sgtx/compliance.refresh-cache" } as const;
export function isInngestConfigured(): boolean { return !!process.env.INNGEST_EVENT_KEY; }
export async function getInngestStatus(): Promise<{configured:boolean;clientReady:boolean;jobsCount:number}> {
  const configured = isInngestConfigured(); const client = await getInngestClient();
  return { configured, clientReady: client !== null, jobsCount: Object.keys(SGTX_JOBS).length };
}
