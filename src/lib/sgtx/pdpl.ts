// SGTX Platform — Egyptian PDPL Compliance (Part 18)
// Shared helpers for routing Smart Inbox notifications to the appropriate
// compliance / governance authority. Because the InboxItem model has a
// foreign key on Tenant.gtid, we MUST resolve a real tenant before creating
// any compliance inbox items.

import { db } from "@/lib/db";

// Preferred GTIDs for the Platform Governance Authority / Compliance Officer.
// The first existing tenant in this list wins; otherwise we fall back to any
// ADM tenant, then any GOV tenant. Returns null if none exist (caller should
// skip the inbox write rather than crash on FK violation).
const PREFERRED_GOVERNANCE_GTIDS = [
  "SGTX-EG-ADM-000001-0000", // reserved platform governance authority
  "SGTX-EG-GOV-000001-9A0B", // Egyptian Customs Authority (seeded fallback)
];

let cachedGovernanceGtid: string | null | undefined;

export async function getPlatformGovernanceGtid(): Promise<string | null> {
  if (cachedGovernanceGtid !== undefined) return cachedGovernanceGtid;

  for (const gtid of PREFERRED_GOVERNANCE_GTIDS) {
    const t = await db.tenant.findUnique({ where: { gtid }, select: { gtid: true } });
    if (t) {
      cachedGovernanceGtid = gtid;
      return gtid;
    }
  }

  const adm = await db.tenant.findFirst({ where: { type: "ADM" }, select: { gtid: true } });
  if (adm) {
    cachedGovernanceGtid = adm.gtid;
    return adm.gtid;
  }

  const gov = await db.tenant.findFirst({ where: { type: "GOV" }, select: { gtid: true } });
  cachedGovernanceGtid = gov ? gov.gtid : null;
  return cachedGovernanceGtid;
}

// Valid PDPL consent purposes (Part 18).
export const PDPL_PURPOSES = [
  "marketing",
  "analytics",
  "govt_sharing",
  "cross_border",
  "voice_biometric",
  "trade_memory",
] as const;

export function isValidPurpose(p: unknown): p is (typeof PDPL_PURPOSES)[number] {
  return typeof p === "string" && (PDPL_PURPOSES as readonly string[]).includes(p);
}

// Valid DSR request types (Part 18).
export const DSR_TYPES = [
  "ACCESS",
  "RECTIFICATION",
  "ERASURE",
  "RESTRICTION",
  "PORTABILITY",
  "OBJECTION",
] as const;

export function isValidDsrType(t: unknown): t is (typeof DSR_TYPES)[number] {
  return typeof t === "string" && (DSR_TYPES as readonly string[]).includes(t);
}

// Valid breach severities (Part 18).
export const BREACH_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;

export function isValidSeverity(s: unknown): s is (typeof BREACH_SEVERITIES)[number] {
  return typeof s === "string" && (BREACH_SEVERITIES as readonly string[]).includes(s);
}

// 72-hour PDPL notification threshold for DPC (Data Protection Centre).
export function requiresDpcNotification(severity: string): boolean {
  return severity === "HIGH" || severity === "CRITICAL";
}

// Bump semantic version "1.0" -> "1.1", "1.9" -> "1.10".
export function nextVersion(current: string | null | undefined): string {
  if (!current) return "1.0";
  const parts = current.split(".");
  if (parts.length !== 2) return "1.0";
  const minor = parseInt(parts[1], 10);
  if (Number.isNaN(minor)) return "1.0";
  return `${parts[0]}.${minor + 1}`;
}
