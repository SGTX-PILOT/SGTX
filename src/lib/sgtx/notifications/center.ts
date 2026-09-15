// @ts-nocheck
// =============================================================================
// SGTX v17 §16 — Notification Center
// -----------------------------------------------------------------------------
// Multi-channel notification dispatch (In-App / Email / SMS / Push / WhatsApp),
// Quiet Hours, Category Priority Rules, and Daily/Weekly digests.
//
// Channels:
//   • IN_APP   — persisted to InboxItem (real, surfaced in the Smart Inbox)
//   • EMAIL    — simulated (no SMTP gateway) — writes to NotificationLog only
//   • SMS      — simulated (no SMS gateway) — writes to NotificationLog only
//   • PUSH     — simulated (no FCM/APNs gateway) — writes to NotificationLog only
//   • WHATSAPP — simulated (no WhatsApp Business API) — writes to NotificationLog only
//
// Quiet Hours: persisted in ConfigurationHistory with key
//   `quiet_hours:{tenantGtid}` — JSON { enabled, start, end, days[], exceptions[] }
//
// Category Priority Rules: persisted in ConfigurationHistory with key
//   `category_priority_rules:{tenantGtid}` — JSON array of
//   { category, priority, overrideQuietHours }
//
// All non-In-App channels are SIMULATED — see deliveryStatus field in
// NotificationLog rows. To wire a real gateway, replace the corresponding
// branch in `dispatchChannel` with a real provider call.
// =============================================================================
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

export type NotificationChannel = "IN_APP" | "EMAIL" | "SMS" | "PUSH" | "WHATSAPP";
export type NotificationPriority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type NotificationType =
  | "GENERAL"
  | "COMPLIANCE"
  | "NEGOTIATION"
  | "FINANCE"
  | "LOGISTICS"
  | "DISPUTE"
  | "SYSTEM"
  | "APPROVAL"
  | "TRADE_EVENT";

export interface NotificationRequest {
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  channels: NotificationChannel[];
  ctaLabel?: string;
  ctaTab?: string;
  ustn?: string;
  metadata?: any;
}

export interface NotificationResult {
  notificationId: string;
  sentChannels: NotificationChannel[];
  failedChannels: NotificationChannel[];
}

export interface NotificationRecord {
  id: string;
  channel: NotificationChannel;
  type: NotificationType;
  title: string;
  body: string;
  priority: NotificationPriority;
  deliveryStatus: string;
  sentAt: string;
}

export interface NotificationFilters {
  type?: NotificationType;
  priority?: NotificationPriority;
  channel?: NotificationChannel;
  from?: string; // ISO date
  to?: string; // ISO date
  limit?: number;
}

export interface QuietHoursConfig {
  enabled: boolean;
  start: string; // "HH:MM" 24h
  end: string; // "HH:MM" 24h
  days: number[]; // 0=Sun .. 6=Sat
  exceptions: { date: string; reason: string }[];
}

export interface CategoryPriorityRule {
  category: string;
  priority: NotificationPriority;
  overrideQuietHours: boolean;
}

export const DEFAULT_QUIET_HOURS: QuietHoursConfig = {
  enabled: false,
  start: "22:00",
  end: "07:00",
  days: [0, 1, 2, 3, 4], // Sun–Thu quiet; Fri/Sat active
  exceptions: [],
};

export const DEFAULT_CATEGORY_RULES: CategoryPriorityRule[] = [
  { category: "COMPLIANCE",    priority: "CRITICAL", overrideQuietHours: true  },
  { category: "APPROVAL",      priority: "HIGH",     overrideQuietHours: true  },
  { category: "DISPUTE",       priority: "HIGH",     overrideQuietHours: true  },
  { category: "FINANCE",       priority: "HIGH",     overrideQuietHours: false },
  { category: "TRADE_EVENT",   priority: "MEDIUM",   overrideQuietHours: false },
  { category: "NEGOTIATION",   priority: "MEDIUM",   overrideQuietHours: false },
  { category: "LOGISTICS",     priority: "MEDIUM",   overrideQuietHours: false },
  { category: "SYSTEM",        priority: "LOW",      overrideQuietHours: false },
  { category: "GENERAL",       priority: "LOW",      overrideQuietHours: false },
];

const PRIORITY_SCORE: Record<NotificationPriority, number> = {
  LOW: 30, MEDIUM: 60, HIGH: 85, CRITICAL: 95,
};

// =============================================================================
// Core: sendNotification (multi-channel)
// =============================================================================
export async function sendNotification(
  tenantGtid: string,
  notif: NotificationRequest,
): Promise<NotificationResult> {
  const notificationId = `NOTIF-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const sentChannels: NotificationChannel[] = [];
  const failedChannels: NotificationChannel[] = [];

  // Apply quiet hours + category rules to determine effective priority + delivery
  const effectivePriority = await applyCategoryRules(tenantGtid, notif);
  const withinQuietHours = await isInQuietHours(tenantGtid);
  const shouldSuppress =
    withinQuietHours &&
    effectivePriority !== "CRITICAL" &&
    !(await categoryOverridesQuietHours(tenantGtid, notif.type));

  for (const channel of notif.channels) {
    try {
      if (shouldSuppress && channel !== "IN_APP") {
        // Even when suppressed, IN_APP keeps the inbox row (so user can read
        // it later). Other channels are deferred.
        logger.info(
          `[notifications] suppressed (quiet hours) — tenant=${tenantGtid} channel=${channel} title=${notif.title}`,
        );
        failedChannels.push(channel);
        continue;
      }
      await dispatchChannel(tenantGtid, notificationId, channel, notif, effectivePriority);
      sentChannels.push(channel);
    } catch (e: any) {
      logger.error(`[notifications] channel ${channel} dispatch failed:`, e?.message || e);
      failedChannels.push(channel);
    }
  }

  return { notificationId, sentChannels, failedChannels };
}

async function dispatchChannel(
  tenantGtid: string,
  notificationId: string,
  channel: NotificationChannel,
  notif: NotificationRequest,
  priority: NotificationPriority,
): Promise<void> {
  if (channel === "IN_APP") {
    // Real — persisted to InboxItem, surfaced in Smart Inbox.
    await db.inboxItem.create({
      data: {
        tenantGtid,
        tradeId: notif.ustn || null,
        category: notif.type,
        priority: PRIORITY_SCORE[priority],
        title: notif.title,
        description: notif.body,
        ctaLabel: notif.ctaLabel || undefined,
      },
    }).catch((e: any) => {
      logger.error("[notifications] InboxItem create failed:", e?.message || e);
    });
  }

  // Always log to NotificationLog (audit trail for all channels).
  // For non-IN_APP channels this is the SIMULATED delivery record.
  const deliveryStatus = channel === "IN_APP" ? "DELIVERED" : "SIMULATED";
  await db.notificationLog.create({
    data: {
      tenantGtid,
      channel,
      category: notif.type,
      title: notif.title,
      message: notif.body,
      deliveryStatus,
    },
  }).catch((e: any) => {
    logger.error("[notifications] NotificationLog create failed:", e?.message || e);
  });

  if (channel !== "IN_APP") {
    logger.info(
      `[notifications] SIMULATED ${channel} — tenant=${tenantGtid} title=${notif.title} body=${notif.body.slice(0, 120)}`,
    );
  }
}

// =============================================================================
// Category Rules + Quiet Hours
// =============================================================================
async function applyCategoryRules(
  tenantGtid: string,
  notif: NotificationRequest,
): Promise<NotificationPriority> {
  const rules = await getCategoryPriorityRules(tenantGtid);
  const match = rules.find((r) => r.category === notif.type);
  if (match) {
    // Category rule overrides the requested priority (if higher).
    const reqScore = PRIORITY_SCORE[notif.priority];
    const ruleScore = PRIORITY_SCORE[match.priority];
    return ruleScore >= reqScore ? match.priority : notif.priority;
  }
  return notif.priority;
}

async function categoryOverridesQuietHours(tenantGtid: string, category: string): Promise<boolean> {
  const rules = await getCategoryPriorityRules(tenantGtid);
  const match = rules.find((r) => r.category === category);
  return !!(match && match.overrideQuietHours);
}

export async function isInQuietHours(tenantGtid: string): Promise<boolean> {
  const cfg = await getQuietHours(tenantGtid);
  if (!cfg.enabled) return false;

  const now = new Date();
  const day = now.getDay();
  if (!cfg.days.includes(day)) return false;

  // Check exceptions (specific date overrides).
  const today = now.toISOString().slice(0, 10);
  if (cfg.exceptions.some((e) => e.date === today)) return false;

  const minutesNow = now.getHours() * 60 + now.getMinutes();
  const [startH, startM] = cfg.start.split(":").map(Number);
  const [endH, endM] = cfg.end.split(":").map(Number);
  const startMin = startH * 60 + startM;
  const endMin = endH * 60 + endM;

  // Handle overnight window (e.g. 22:00 → 07:00).
  if (startMin <= endMin) {
    return minutesNow >= startMin && minutesNow < endMin;
  }
  return minutesNow >= startMin || minutesNow < endMin;
}

export async function getQuietHours(tenantGtid: string): Promise<QuietHoursConfig> {
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `quiet_hours:${tenantGtid}` },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return { ...DEFAULT_QUIET_HOURS };
  try {
    return { ...DEFAULT_QUIET_HOURS, ...JSON.parse(row.newValue) };
  } catch {
    return { ...DEFAULT_QUIET_HOURS };
  }
}

export async function setQuietHours(
  tenantGtid: string,
  config: Partial<QuietHoursConfig>,
  changedByGtid: string = "system",
): Promise<QuietHoursConfig> {
  const current = await getQuietHours(tenantGtid);
  const merged = { ...current, ...config };
  await db.configurationHistory.create({
    data: {
      configKey: `quiet_hours:${tenantGtid}`,
      oldValue: JSON.stringify(current),
      newValue: JSON.stringify(merged),
      changedByGtid,
      changeReason: "Quiet Hours config update",
      version: (await nextConfigVersion(`quiet_hours:${tenantGtid}`)),
    },
  }).catch((e: any) => logger.error("[notifications] setQuietHours failed:", e?.message));
  return merged;
}

export async function getCategoryPriorityRules(tenantGtid: string): Promise<CategoryPriorityRule[]> {
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `category_priority_rules:${tenantGtid}` },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return [...DEFAULT_CATEGORY_RULES];
  try {
    const parsed = JSON.parse(row.newValue);
    if (!Array.isArray(parsed)) return [...DEFAULT_CATEGORY_RULES];
    return parsed;
  } catch {
    return [...DEFAULT_CATEGORY_RULES];
  }
}

export async function setCategoryPriorityRules(
  tenantGtid: string,
  rules: CategoryPriorityRule[],
  changedByGtid: string = "system",
): Promise<CategoryPriorityRule[]> {
  const current = await getCategoryPriorityRules(tenantGtid);
  await db.configurationHistory.create({
    data: {
      configKey: `category_priority_rules:${tenantGtid}`,
      oldValue: JSON.stringify(current),
      newValue: JSON.stringify(rules),
      changedByGtid,
      changeReason: "Category Priority Rules update",
      version: (await nextConfigVersion(`category_priority_rules:${tenantGtid}`)),
    },
  }).catch((e: any) => logger.error("[notifications] setCategoryPriorityRules failed:", e?.message));
  return rules;
}

async function nextConfigVersion(configKey: string): Promise<number> {
  const last = await db.configurationHistory.findFirst({
    where: { configKey },
    orderBy: { version: "desc" },
    select: { version: true },
  }).catch(() => null);
  return (last?.version || 0) + 1;
}

// =============================================================================
// getNotifications + markNotificationRead
// =============================================================================
export async function getNotifications(
  tenantGtid: string,
  filters: NotificationFilters = {},
): Promise<{ notifications: NotificationRecord[]; count: number }> {
  const where: any = { tenantGtid };
  if (filters.channel) where.channel = filters.channel;
  if (filters.type) where.category = filters.type;
  if (filters.from || filters.to) {
    where.sentAt = {};
    if (filters.from) where.sentAt.gte = new Date(filters.from);
    if (filters.to) where.sentAt.lte = new Date(filters.to);
  }

  const limit = Math.min(filters.limit || 100, 500);

  const [logRows, inboxRows] = await Promise.all([
    db.notificationLog.findMany({ where, orderBy: { sentAt: "desc" }, take: limit }),
    db.inboxItem.findMany({
      where: { tenantGtid, ...(filters.type ? { category: filters.type } : {}) },
      orderBy: { createdAt: "desc" },
      take: limit,
    }).catch(() => []),
  ]);

  const records: NotificationRecord[] = [];

  // NotificationLog records (Email/SMS/Push/WhatsApp/IN_APP audit row).
  for (const r of logRows) {
    records.push({
      id: r.id,
      channel: r.channel as NotificationChannel,
      type: r.category as NotificationType,
      title: r.title,
      body: r.message,
      priority: inferPriorityFromScore(undefined),
      deliveryStatus: r.deliveryStatus,
      sentAt: r.sentAt.toISOString(),
    });
  }

  // Inbox items (real-time In-App surface).
  for (const i of inboxRows) {
    records.push({
      id: i.id,
      channel: "IN_APP",
      type: i.category as NotificationType,
      title: i.title,
      body: i.description,
      priority: inferPriorityFromScore(i.priority),
      deliveryStatus: i.dismissed ? "READ" : "DELIVERED",
      sentAt: i.createdAt.toISOString(),
    });
  }
  // Dedupe by id (NotificationLog + InboxItem use different id spaces so no collision).
  const filtered = filterByTypeAndPriority(records, filters);
  return { notifications: filtered, count: filtered.length };
}

function inferPriorityFromScore(score: number | undefined): NotificationPriority {
  if (score == null) return "LOW";
  if (score >= 90) return "CRITICAL";
  if (score >= 75) return "HIGH";
  if (score >= 50) return "MEDIUM";
  return "LOW";
}

/** Synchronous category→priority lookup against the DEFAULT_CATEGORY_RULES (no DB). */
function inferPriorityFromCategory(_tenantGtid: string, category: string): NotificationPriority {
  const match = DEFAULT_CATEGORY_RULES.find((r) => r.category === category);
  return (match?.priority as NotificationPriority) || "LOW";
}

function filterByTypeAndPriority(records: NotificationRecord[], filters: NotificationFilters): NotificationRecord[] {
  return records.filter((r) => {
    if (filters.type && r.type !== filters.type) return false;
    if (filters.priority && r.priority !== filters.priority) return false;
    return true;
  });
}

export async function markNotificationRead(notificationId: string): Promise<{ ok: boolean; channel: string }> {
  // Try InboxItem first (In-App).
  const inbox = await db.inboxItem.findUnique({ where: { id: notificationId } }).catch(() => null);
  if (inbox) {
    await db.inboxItem.update({
      where: { id: notificationId },
      data: { dismissed: true },
    }).catch(() => null);
    return { ok: true, channel: "IN_APP" };
  }
  // Otherwise NotificationLog (Email/SMS/Push/WhatsApp).
  const log = await db.notificationLog.findUnique({ where: { id: notificationId } }).catch(() => null);
  if (log) {
    await db.notificationLog.update({
      where: { id: notificationId },
      data: { deliveryStatus: "READ" },
    }).catch(() => null);
    return { ok: true, channel: log.channel };
  }
  return { ok: false, channel: "UNKNOWN" };
}

// =============================================================================
// Digests — Daily / Weekly
// =============================================================================
export async function getDailyDigest(tenantGtid: string): Promise<{
  summary: string;
  count: number;
  byPriority: Record<NotificationPriority, number>;
  byChannel: Record<string, number>;
  byCategory: Record<string, number>;
  window: { from: string; to: string };
}> {
  return computeDigest(tenantGtid, 24 * 60 * 60 * 1000, "daily");
}

export async function getWeeklyDigest(tenantGtid: string): Promise<{
  summary: string;
  count: number;
  byPriority: Record<NotificationPriority, number>;
  byChannel: Record<string, number>;
  byCategory: Record<string, number>;
  window: { from: string; to: string };
}> {
  return computeDigest(tenantGtid, 7 * 24 * 60 * 60 * 1000, "weekly");
}

async function computeDigest(
  tenantGtid: string,
  windowMs: number,
  label: string,
): Promise<{
  summary: string;
  count: number;
  byPriority: Record<NotificationPriority, number>;
  byChannel: Record<string, number>;
  byCategory: Record<string, number>;
  window: { from: string; to: string };
}> {
  const now = new Date();
  const from = new Date(now.getTime() - windowMs);
  const rows = await db.notificationLog.findMany({
    where: { tenantGtid, sentAt: { gte: from, lte: now } },
    orderBy: { sentAt: "desc" },
    take: 5000,
  }).catch(() => []);

  const byPriority: Record<NotificationPriority, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  const byChannel: Record<string, number> = {};
  const byCategory: Record<string, number> = {};

  for (const r of rows) {
    // NotificationLog has no priority column — infer via category rules.
    const pri = inferPriorityFromCategory(tenantGtid, r.category);
    if (pri in byPriority) byPriority[pri]++;
    byChannel[r.channel] = (byChannel[r.channel] || 0) + 1;
    byCategory[r.category] = (byCategory[r.category] || 0) + 1;
  }

  const criticalCount = byPriority.CRITICAL;
  const summary =
    `${label.toUpperCase()} digest: ${rows.length} notification${rows.length === 1 ? "" : "s"} ` +
    `(${criticalCount} critical, ${byPriority.HIGH} high, ${byPriority.MEDIUM} medium, ${byPriority.LOW} low). ` +
    `Channels: ${Object.entries(byChannel).map(([k, v]) => `${k}=${v}`).join(", ") || "none"}.`;

  return {
    summary,
    count: rows.length,
    byPriority,
    byChannel,
    byCategory,
    window: { from: from.toISOString(), to: now.toISOString() },
  };
}
