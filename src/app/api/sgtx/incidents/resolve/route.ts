import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { callAI } from "@/lib/sgtx/ai/orchestrator";

// POST /api/sgtx/incidents/resolve — Resolve an incident + AI post-mortem (Part 24.6)
// Body: { incidentId: string, rootCause: string, resolution: string }
export async function POST(req: NextRequest) {
  const { incidentId, rootCause, resolution } = await req.json();
  if (!incidentId || !rootCause || !resolution) {
    return NextResponse.json(
      { error: "incidentId, rootCause, resolution are required" },
      { status: 400 },
    );
  }
  try {
    const incident = await db.incident.findUnique({ where: { id: incidentId } });
    if (!incident) return NextResponse.json({ error: "Incident not found" }, { status: 404 });
    if (incident.status === "RESOLVED" || incident.status === "CLOSED") {
      return NextResponse.json({ error: "Incident already resolved" }, { status: 409 });
    }

    // AI post-mortem generation (A1)
    let postMortem = "";
    try {
      const aiRes = await callAI({
        agent: "general",
        prompt:
          `Generate a post-mortem for this incident: ${incident.title}. ` +
          `Description: ${incident.description}. ` +
          `Root cause: ${rootCause}. Resolution: ${resolution}. ` +
          `Format: Summary, Timeline, Root Cause, Impact, Action Items. Under 300 words.`,
      });
      postMortem = aiRes.content;
    } catch {
      postMortem = `Root cause: ${rootCause}. Resolution: ${resolution}.`;
    }

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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
