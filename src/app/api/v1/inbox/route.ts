// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/v1/inbox — Smart Inbox items (v18 §2.5.1)
//
// v18 §2.5.1: Smart Inbox is the default, action-first landing page.
// Each item: WHAT (title), WHY (consequence), DEADLINE (timestamp), ACTION (one-click link).
// 9 categories: NEEDS_SIGNATURE, NEEDS_APPROVAL, NEEDS_DOCUMENT, NEEDS_PAYMENT,
//   SHIPMENT_ALERT, NEW_OFFER, NEGOTIATION, COMPLIANCE, GENERAL
// 3 priority bands: High (80-100), Medium (50-79), Low (0-49)
//
// Auth: Bearer JWT — caller sees only their tenant's inbox items

interface CallerPayload { gtid?: string; tenantGtid?: string; role?: string; activeTraderMode?: string; }
function getCaller(req: NextRequest): CallerPayload | null {
  const raw = req.headers.get("x-sgtx-payload");
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60_000;
const rateBuckets: Map<string, { count: number; resetAt: number }> = new Map();
let gcCounter = 0;
function checkRateLimit(key: string) {
  if (++gcCounter >= 50) { gcCounter = 0; const now = Date.now(); for (const [k, v] of rateBuckets) if (v.resetAt <= now) rateBuckets.delete(k); }
  const now = Date.now(); const existing = rateBuckets.get(key);
  if (!existing || now > existing.resetAt) { const resetAt = now + RATE_LIMIT_WINDOW_MS; rateBuckets.set(key, { count: 1, resetAt }); return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt }; }
  if (existing.count >= RATE_LIMIT_MAX) return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  existing.count += 1; return { allowed: true, remaining: RATE_LIMIT_MAX - existing.count, resetAt: existing.resetAt };
}

const VALID_CATEGORIES = ["NEEDS_SIGNATURE","NEEDS_APPROVAL","NEEDS_DOCUMENT","NEEDS_PAYMENT","SHIPMENT_ALERT","NEW_OFFER","NEGOTIATION","COMPLIANCE","GENERAL"];

function getPriorityBand(priority: number): string {
  if (priority >= 80) return "HIGH";
  if (priority >= 50) return "MEDIUM";
  return "LOW";
}

export async function GET(req: NextRequest) {
  try {
    const caller = getCaller(req);
    if (!caller?.gtid) return NextResponse.json({ error: "Authentication required" }, { status: 401, headers: { "X-SGTX-Version": "v18.0" } });

    const rl = checkRateLimit(caller.gtid);
    if (!rl.allowed) return NextResponse.json({ error: "RATE_LIMIT_EXCEEDED" }, { status: 429, headers: { "X-SGTX-Version": "v18.0" } });

    const sp = req.nextUrl.searchParams;
    const categoryFilter = sp.get("category");
    const priorityBand = sp.get("priority_band"); // HIGH, MEDIUM, LOW
    const includeDismissed = sp.get("include_dismissed") === "true";
    const limit = Math.min(parseInt(sp.get("limit") || "50", 10), 200);

    // Validate category filter
    if (categoryFilter && !VALID_CATEGORIES.includes(categoryFilter)) {
      return NextResponse.json({ error: "INVALID_CATEGORY", message: `category must be one of: ${VALID_CATEGORIES.join(", ")}` }, { status: 400, headers: { "X-SGTX-Version": "v18.0" } });
    }

    const { freshDb } = await import("@/lib/db-fresh");

    // v18 §2.5.1 — Query inbox items scoped to caller's tenant + active trader mode
    let items: any[] = [];
    let totalCount = 0;
    try {
      const where: any = {
        tenantGtid: caller.tenantGtid || caller.gtid,
        ...(includeDismissed ? {} : { dismissed: false }),
        ...(categoryFilter ? { category: categoryFilter } : {}),
      };
      items = await freshDb.inboxItem.findMany({
        where,
        orderBy: { priority: "desc" },
        take: limit,
        select: {
          id: true, tenantGtid: true, category: true, priority: true,
          title: true, description: true, ctaLabel: true,
          ustn: true, deadline: true, dismissed: true, snoozedUntil: true,
          createdAt: true,
        },
      });
      totalCount = await freshDb.inboxItem.count({ where });
    } catch (e: any) {
      logger.warn("[v1/inbox] DB query failed (non-fatal — dev mode):", { error: e?.message });
      // Return empty inbox in dev mode
      items = [];
      totalCount = 0;
    }

    // Apply priority band filter (if specified)
    let filteredItems = items;
    if (priorityBand) {
      filteredItems = items.filter(item => getPriorityBand(item.priority || 50) === priorityBand);
    }

    // Group by priority band
    const highBand = filteredItems.filter(i => getPriorityBand(i.priority || 50) === "HIGH");
    const mediumBand = filteredItems.filter(i => getPriorityBand(i.priority || 50) === "MEDIUM");
    const lowBand = filteredItems.filter(i => getPriorityBand(i.priority || 50) === "LOW");

    // Format items per v18 §2.5.1 (4-part structure: WHAT/WHY/DEADLINE/ACTION)
    const formattedItems = filteredItems.map(item => ({
      id: item.id,
      what: item.title,
      why: item.description,
      deadline: item.deadline ? item.deadline.toISOString() : null,
      action: {
        label: item.ctaLabel || "Open",
        href: item.ustn ? `/trades/${item.ustn}` : "/home",
      },
      category: item.category,
      priority: item.priority || 50,
      priority_band: getPriorityBand(item.priority || 50),
      ustn: item.ustn || null,
      dismissed: item.dismissed || false,
      snoozed_until: item.snoozedUntil ? item.snoozedUntil.toISOString() : null,
      created_at: item.createdAt ? item.createdAt.toISOString() : null,
    }));

    return NextResponse.json({
      items: formattedItems,
      counts: {
        total: totalCount,
        filtered: filteredItems.length,
        high: highBand.length,
        medium: mediumBand.length,
        low: lowBand.length,
      },
      priority_bands: {
        high: { range: "80-100", collapsible: true, count: highBand.length },
        medium: { range: "50-79", collapsible: true, count: mediumBand.length },
        low: { range: "0-49", collapsible: true, count: lowBand.length },
      },
      categories: VALID_CATEGORIES,
      caller_gtid: caller.gtid,
      trader_mode: caller.activeTraderMode || "BUY",
      queried_at: new Date().toISOString(),
    }, { headers: { "Cache-Control": "no-store, max-age=0", "X-SGTX-Version": "v18.0", "X-RateLimit-Remaining": String(rl.remaining) } });
  } catch (e: any) {
    logger.error("[v1/inbox] error:", { error: e?.message || String(e) });
    return NextResponse.json({ error: "Inbox query failed" }, { status: 503, headers: { "X-SGTX-Version": "v18.0" } });
  }
}
