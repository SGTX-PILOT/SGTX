// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import {
  sendNotification,
  getNotifications,
} from "@/lib/sgtx/notifications/center";
import { logger } from "@/lib/sgtx/logger";

export const dynamic = "force-dynamic";

// GET /api/sgtx/notifications?tenantGtid=X[&type=T][&priority=P][&channel=C][&from=ISO][&to=ISO][&limit=N]
// List notifications for a tenant (v17 §16 — Notification Center).
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tenantGtid = sp.get("tenantGtid");
  if (!tenantGtid) {
    return NextResponse.json({ error: "tenantGtid required" }, { status: 400 });
  }
  try {
    const result = await getNotifications(tenantGtid, {
      type: (sp.get("type") as any) || undefined,
      priority: (sp.get("priority") as any) || undefined,
      channel: (sp.get("channel") as any) || undefined,
      from: sp.get("from") || undefined,
      to: sp.get("to") || undefined,
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    });
    return NextResponse.json(result);
  } catch (e: any) {
    logger.error("[api/notifications] GET failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "fetch failed" }, { status: 500 });
  }
}

// POST /api/sgtx/notifications — Multi-channel send (v17 §16).
// Body: { tenantGtid, type, title, body, priority, channels: ["IN_APP","EMAIL","SMS","PUSH","WHATSAPP"], ctaLabel?, ustn? }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const { tenantGtid, type, title, body: message, priority, channels, ctaLabel, ustn, metadata } = body;
  if (!tenantGtid || !title || !channels || !Array.isArray(channels)) {
    return NextResponse.json(
      { error: "tenantGtid, title, channels[] are required" },
      { status: 400 },
    );
  }
  if (channels.length === 0) {
    return NextResponse.json({ error: "channels[] cannot be empty" }, { status: 400 });
  }
  try {
    const result = await sendNotification(tenantGtid, {
      type: type || "GENERAL",
      title,
      body: message || body?.body || "",
      priority: priority || "MEDIUM",
      channels,
      ctaLabel,
      ustn,
      metadata,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    logger.error("[api/notifications] POST send failed:", e?.message || e);
    return NextResponse.json({ error: e?.message || "send failed" }, { status: 500 });
  }
}
