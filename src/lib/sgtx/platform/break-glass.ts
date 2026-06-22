// SGTX Break-Glass Emergency Access helpers (feature-toggles-zk-breakglass)
// Used by /api/sgtx/platform/break-glass/* endpoints.

import { db } from "@/lib/db";
import { createHash } from "crypto";

export type BreakGlassTrigger =
  | "ACCOUNT_LOCKOUT"
  | "SUSPICIOUS_ACTIVITY"
  | "COMPLIANCE_FREEZE"
  | "COURT_ORDER"
  | "TECHNICAL_EMERGENCY"
  | "GOVERNOR_OVERRIDE";

export type BreakGlassSeverity = "HIGH" | "CRITICAL";
export type BreakGlassStatus = "ACTIVE" | "RESOLVED" | "EXPIRED";

export const TRIGGER_META: Record<
  BreakGlassTrigger,
  { label: string; color: string; defaultSeverity: BreakGlassSeverity; description: string }
> = {
  ACCOUNT_LOCKOUT: {
    label: "Account Lockout",
    color: "#f59e0b",
    defaultSeverity: "HIGH",
    description: "Tenant user locked out — emergency credential reset required.",
  },
  SUSPICIOUS_ACTIVITY: {
    label: "Suspicious Activity",
    color: "#f97316",
    defaultSeverity: "HIGH",
    description: "Anomalous transactions detected — immediate freeze while investigated.",
  },
  COMPLIANCE_FREEZE: {
    label: "Compliance Freeze",
    color: "#9333ea",
    defaultSeverity: "HIGH",
    description: "Regulatory or sanctions-related compliance freeze.",
  },
  COURT_ORDER: {
    label: "Court Order",
    color: "#dc2626",
    defaultSeverity: "CRITICAL",
    description: "Judicial order to suspend operations pending litigation.",
  },
  TECHNICAL_EMERGENCY: {
    label: "Technical Emergency",
    color: "#0891b2",
    defaultSeverity: "HIGH",
    description: "Critical technical incident requiring immediate tenant isolation.",
  },
  GOVERNOR_OVERRIDE: {
    label: "Governor Override",
    color: "#dc2626",
    defaultSeverity: "CRITICAL",
    description: "Constitutional Governor override — DENY all actions for this tenant.",
  },
};

/**
 * Generates the next sequential break-glass event ID for the given date:
 *   BG-YYYYMMDD-NNN  (NNN zero-padded, monotonic per day)
 */
export async function generateBreakGlassEventId(now: Date = new Date()): Promise<string> {
  const yyyymmdd = now.toISOString().slice(0, 10).replace(/-/g, "");
  const prefix = `BG-${yyyymmdd}-`;
  // Count existing events for today (any status) to compute the next sequence.
  const count = await db.breakGlassEvent.count({
    where: { eventId: { startsWith: prefix } },
  });
  const seq = String(count + 1).padStart(3, "0");
  return `${prefix}${seq}`;
}

/**
 * Anchors a break-glass event in the Loom hash chain by chaining from the latest
 * GovernorDecision's loomHash. The returned hash is stored on the BreakGlassEvent
 * so the audit trail can be reconstructed.
 */
export function computeBreakGlassLoomHash(
  previousHash: string | null,
  eventPayload: object,
): string {
  const genesis = previousHash || "genesis";
  const payloadJson = JSON.stringify(eventPayload);
  return "sha256:" + createHash("sha256").update(`${genesis}|${payloadJson}`).digest("hex");
}

/**
 * Returns the latest loom hash from the Governor decision chain so the new
 * break-glass event can be chained onto it.
 */
export async function getLatestLoomHash(): Promise<string | null> {
  const last = await db.governorDecision.findFirst({
    orderBy: { createdAt: "desc" },
    select: { loomHash: true },
  });
  return last?.loomHash ?? null;
}
