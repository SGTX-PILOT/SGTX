import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/feedback — List feedback tickets (blueprint 12A.8)
export async function GET(req: NextRequest) {
  const tenantGtid = req.nextUrl.searchParams.get("tenantGtid");
  const tickets = await db.feedbackTicket.findMany({
    where: tenantGtid ? { tenantGtid } : undefined,
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ tickets });
}

// POST /api/sgtx/feedback — Submit feedback (Bug/Feature/Help)
export async function POST(req: NextRequest) {
  const { tenantGtid, type, subject, description, priority, url, userAgent } = await req.json();
  if (!tenantGtid || !type || !subject) return NextResponse.json({ error: "tenantGtid, type, subject required" }, { status: 400 });
  const ticket = await db.feedbackTicket.create({
    data: {
      tenantGtid,
      type, // BUG | FEATURE | HELP
      subject,
      description: description || "",
      priority: priority || "NORMAL",
      url: url || null,
      userAgent: userAgent || null,
      status: "OPEN",
    },
  });
  // Smart Inbox to support team
  await db.inboxItem.create({
    data: {
      tenantGtid: "SGTX-EG-GOV-000001-9A0B",
      category: "GENERAL",
      priority: type === "BUG" ? 70 : 50,
      title: `${type} ticket: ${subject}`,
      description: `${description || ""} From: ${tenantGtid}`,
      ctaLabel: "Review",
    },
  });
  return NextResponse.json({ ok: true, ticket });
}
