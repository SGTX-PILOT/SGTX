import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/threats/mitigate — Mark a threat finding as mitigated (Part 24.3)
// Body: { threatId: string, remediationNotes?: string }
export async function POST(req: NextRequest) {
  const { threatId, remediationNotes } = await req.json();
  if (!threatId) {
    return NextResponse.json({ error: "threatId is required" }, { status: 400 });
  }
  try {
    const threat = await db.threatFinding.findUnique({ where: { id: threatId } });
    if (!threat) return NextResponse.json({ error: "Threat not found" }, { status: 404 });
    if (threat.status === "MITIGATED") {
      return NextResponse.json({ error: "Threat already mitigated" }, { status: 409 });
    }
    const updated = await db.threatFinding.update({
      where: { id: threatId },
      data: {
        status: "MITIGATED",
        remediatedAt: new Date(),
        description: remediationNotes
          ? `${threat.description}\n\n[Remediation]: ${remediationNotes}`
          : threat.description,
      },
    });
    return NextResponse.json({ ok: true, threat: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
