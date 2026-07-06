// @ts-nocheck
// SGTX Didit KYB Integration — Business verification via Didit API
// 
// Flow:
// 1. Backend creates a session: POST https://verification.didit.me/v3/session/
// 2. Frontend opens the verification URL (SDK modal / iframe / redirect)
// 3. Didit sends a signed webhook when verification is complete
// 4. Backend verifies HMAC signature and updates tenant KYB status

import { db } from "@/lib/db";
import crypto from "crypto";

const DIDIT_API_KEY = process.env.DIDIT_API_KEY || "";
const DIDIT_KYB_WORKFLOW_ID = process.env.DIDIT_KYB_WORKFLOW_ID || "b5a20cc6-1199-494d-bcfd-efe50f1070cd";
const DIDIT_API_BASE = "https://verification.didit.me/v3";

export interface DiditSession {
  url: string;
  session_id: string;
}

/**
 * Create a KYB verification session for a tenant.
 * The returned URL should be opened in the browser (SDK modal or redirect).
 */
export async function createKybSession(params: {
  tenantGtid: string;
  legalName: string;
  callbackUrl?: string;
}): Promise<DiditSession> {
  const { tenantGtid, legalName, callbackUrl } = params;

  const response = await fetch(`${DIDIT_API_BASE}/session/`, {
    method: "POST",
    headers: {
      "x-api-key": DIDIT_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      workflow_id: DIDIT_KYB_WORKFLOW_ID,
      vendor_data: tenantGtid, // Our stable tenant GTID
      callback: callbackUrl || `${process.env.NEXT_PUBLIC_APP_URL || "https://sgtx.io"}/onboarding/kyb-complete`,
      metadata: {
        tenant_gtid: tenantGtid,
        legal_name: legalName,
        platform: "SGTX",
      },
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Didit session creation failed: ${response.status} ${errorBody}`);
  }

  const data = await response.json();
  
  // Store session ID in database for tracking
  try {
    await (db as any).kybVerification?.create({
      data: {
        tenantGtid,
        sessionId: data.session_id,
        sessionUrl: data.url,
        status: "NOT_STARTED",
        workflowId: DIDIT_KYB_WORKFLOW_ID,
      },
    }).catch(async () => {
      // Table may not exist — store in Tenant.globalNotes
      const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
      if (tenant) {
        const notes = tenant.globalNotes ? JSON.parse(tenant.globalNotes) : {};
        if (!notes.diditSessions) notes.diditSessions = [];
        notes.diditSessions.push({
          sessionId: data.session_id,
          url: data.url,
          status: "NOT_STARTED",
          createdAt: new Date().toISOString(),
        });
        await db.tenant.update({
          where: { gtid: tenantGtid },
          data: { globalNotes: JSON.stringify(notes) },
        });
      }
    });
  } catch { /* non-fatal */ }

  return { url: data.url, session_id: data.session_id };
}

/**
 * Get the decision from a completed KYB session.
 */
export async function getSessionDecision(sessionId: string): Promise<any> {
  const response = await fetch(`${DIDIT_API_BASE}/session/${sessionId}/decision/`, {
    headers: { "x-api-key": DIDIT_API_KEY },
  });

  if (!response.ok) {
    throw new Error(`Didit decision fetch failed: ${response.status}`);
  }

  return response.json();
}

/**
 * Verify the webhook HMAC signature.
 * Uses X-Signature-V2 (recommended by Didit).
 */
export function verifyWebhookSignature(
  body: string,
  signature: string,
  timestamp: string,
  secret: string,
): boolean {
  // Check timestamp freshness (5 min window)
  const now = Math.floor(Date.now() / 1000);
  const ts = parseInt(timestamp, 10);
  if (Math.abs(now - ts) > 300) return false;

  // Canonicalize body: parse JSON, sort keys, shorten floats, stringify
  try {
    const parsed = JSON.parse(body);
    const canonical = JSON.stringify(sortKeys(shortenFloats(parsed)));
    const expected = crypto
      .createHmac("sha256", secret)
      .update(canonical, "utf8")
      .digest("hex");
    
    // Constant-time comparison
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

/**
 * Process a Didit webhook event and update the tenant's KYB status.
 */
export async function processWebhookEvent(event: any): Promise<{ processed: boolean; tenantGtid: string | null; action: string }> {
  const { session_id, status, vendor_data, decision } = event;
  const tenantGtid = vendor_data;

  if (!tenantGtid) {
    return { processed: false, tenantGtid: null, action: "no_vendor_data" };
  }

  switch (status) {
    case "Approved":
      // KYB approved — update tenant to VERIFIED
      await db.tenant.update({
        where: { gtid: tenantGtid },
        data: {
          lifecycleState: "VERIFIED",
          kybTier: 3, // Didit KYB = highest tier
          sanctionsCleared: true,
          trustScore: 70,
        },
      }).catch(() => null);

      // Store decision data
      await storeDecision(tenantGtid, session_id, decision, "APPROVED");

      // Notify tenant
      await db.inboxItem.create({
        data: {
          tenantGtid,
          category: "GENERAL",
          priority: 100,
          title: "KYB Verification Approved",
          description: `Your business verification (Didit) has been approved. KYB Tier 3 granted. Trading is now fully enabled.`,
          ctaLabel: "Go to Dashboard",
        },
      }).catch(() => null);

      return { processed: true, tenantGtid, action: "approved" };

    case "Declined":
      await db.tenant.update({
        where: { gtid: tenantGtid },
        data: {
          lifecycleState: "KYB_PENDING",
          kybTier: 0,
        },
      }).catch(() => null);

      await storeDecision(tenantGtid, session_id, decision, "DECLINED");
      await db.inboxItem.create({
        data: {
          tenantGtid,
          category: "COMPLIANCE",
          priority: 95,
          title: "KYB Verification Declined",
          description: `Your business verification was declined. Please review the requirements and resubmit. Reason: ${decision?.reason || "Not specified"}.`,
          ctaLabel: "Resubmit KYB",
        },
      }).catch(() => null);

      return { processed: true, tenantGtid, action: "declined" };

    case "In Review":
      await db.tenant.update({
        where: { gtid: tenantGtid },
        data: { lifecycleState: "KYB_PENDING" },
      }).catch(() => null);
      await storeDecision(tenantGtid, session_id, decision, "IN_REVIEW");
      return { processed: true, tenantGtid, action: "in_review" };

    case "In Progress":
    case "Awaiting User":
      return { processed: true, tenantGtid, action: "in_progress" };

    case "Abandoned":
      await db.inboxItem.create({
        data: {
          tenantGtid,
          category: "GENERAL",
          priority: 70,
          title: "KYB Verification Incomplete",
          description: "Your business verification was not completed. Please resume when ready.",
          ctaLabel: "Resume KYB",
        },
      }).catch(() => null);
      return { processed: true, tenantGtid, action: "abandoned" };

    case "Expired":
      return { processed: true, tenantGtid, action: "expired" };

    default:
      return { processed: true, tenantGtid, action: `status:${status}` };
  }
}

/**
 * Store the KYB decision in the database.
 */
async function storeDecision(tenantGtid: string, sessionId: string, decision: any, status: string): Promise<void> {
  try {
    await (db as any).kybDecision?.create({
      data: { tenantGtid, sessionId, status, decision: JSON.stringify(decision) },
    }).catch(async () => {
      // Table doesn't exist — store in Tenant.globalNotes
      const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
      if (tenant) {
        const notes = tenant.globalNotes ? JSON.parse(tenant.globalNotes) : {};
        if (!notes.kybDecisions) notes.kybDecisions = [];
        notes.kybDecisions.push({ sessionId, status, decision, timestamp: new Date().toISOString() });
        await db.tenant.update({
          where: { gtid: tenantGtid },
          data: { globalNotes: JSON.stringify(notes) },
        });
      }
    });
  } catch { /* non-fatal */ }

  // Log to activity
  await db.activity.create({
    data: {
      actorGtid: tenantGtid,
      action: "KYB_DECISION_RECEIVED",
      type: status === "APPROVED" ? "SUCCESS" : "WARNING",
      description: `Didit KYB ${status} for ${tenantGtid}. Session: ${sessionId}`,
      metadata: JSON.stringify({ sessionId, status, decision }),
    },
  }).catch(() => null);
}

// Helper: sort object keys recursively
function sortKeys(obj: any): any {
  if (Array.isArray(obj)) return obj.map(sortKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).sort().reduce((sorted: any, key) => {
      sorted[key] = sortKeys(obj[key]);
      return sorted;
    }, {});
  }
  return obj;
}

// Helper: shorten floats to remove trailing zeros
function shortenFloats(obj: any): any {
  if (Array.isArray(obj)) return obj.map(shortenFloats);
  if (obj !== null && typeof obj === "object") {
    return Object.keys(obj).reduce((result: any, key) => {
      result[key] = shortenFloats(obj[key]);
      return result;
    }, {});
  }
  if (typeof obj === "number" && !Number.isInteger(obj)) {
    return parseFloat(obj.toFixed(6));
  }
  return obj;
}
