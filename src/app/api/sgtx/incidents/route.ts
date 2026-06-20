import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/incidents — List incidents (blueprint Part 24.6)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const incidents = await db.incident.findMany({
    where: status ? { status } : undefined,
    orderBy: { openedAt: "desc" },
    take: 50,
  });
  return NextResponse.json({ incidents });
}

// POST /api/sgtx/incidents — Create an incident
export async function POST(req: NextRequest) {
  const { severity, title, description, affectedSystems } = await req.json();
  if (!severity || !title) return NextResponse.json({ error: "severity and title required" }, { status: 400 });
  const incident = await db.incident.create({
    data: {
      severity, // P0 | P1 | P2 | P3
      title,
      description: description || "",
      affectedSystems: affectedSystems ? JSON.stringify(affectedSystems) : null,
      status: "OPEN",
    },
  });
  // Smart Inbox to Platform Governance Authority for P0/P1
  if (severity === "P0" || severity === "P1") {
    await db.inboxItem.create({
      data: {
        tenantGtid: "SGTX-EG-GOV-000001-9A0B",
        category: "COMPLIANCE",
        priority: severity === "P0" ? 100 : 90,
        title: `${severity} Incident: ${title}`,
        description: `${description || ""} Incident ID: ${incident.id}`,
        ctaLabel: "Investigate",
      },
    });
  }
  return NextResponse.json({ ok: true, incident });
}

// POST /api/sgtx/incidents/resolve — Resolve + AI post-mortem
export async function POST_resolve(req: NextRequest) {
  const { incidentId, rootCause, resolution } = await req.json();
  const incident = await db.incident.findUnique({ where: { id: incidentId } });
  if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });

  // AI post-mortem generation (A1)
  let postMortem = "";
  try {
    const aiRes = await callAI({
      agent: "general",
      prompt: `Generate a post-mortem for this incident: ${incident.title}. Description: ${incident.description}. Root cause: ${rootCause}. Resolution: ${resolution}. Format: Summary, Timeline, Root Cause, Impact, Action Items. Under 300 words.`,
    });
    postMortem = aiRes.content;
  } catch { postMortem = `Root cause: ${rootCause}. Resolution: ${resolution}.`; }

  const updated = await db.incident.update({
    where: { id: incidentId },
    data: {
      status: "RESOLVED",
      rootCause,
      resolution,
      postMortemText: postMortem,
      resolvedAt: new Date(),
    },
  });
  return NextResponse.json({ ok: true, incident: updated, postMortem });
}
