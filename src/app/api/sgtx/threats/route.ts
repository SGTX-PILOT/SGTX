import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/threats — List threat findings (blueprint Part 24.3)
export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const source = req.nextUrl.searchParams.get("source");
  const threats = await db.threatFinding.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(source ? { source } : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return NextResponse.json({ threats });
}

// POST /api/sgtx/threats — Report a threat finding
export async function POST(req: NextRequest) {
  const { source, severity, title, description, cveId, mitreTactic, mitreTechnique } = await req.json();
  if (!source || !severity || !title) return NextResponse.json({ error: "source, severity, title required" }, { status: 400 });
  const threat = await db.threatFinding.create({
    data: {
      source, // trivy | falco | wazuh | pentest | manual
      severity, // LOW | MEDIUM | HIGH | CRITICAL
      title,
      description: description || "",
      cveId: cveId || null,
      mitreTactic: mitreTactic || null,
      mitreTechnique: mitreTechnique || null,
      status: "OPEN",
    },
  });
  // Smart Inbox for HIGH/CRITICAL
  if (severity === "HIGH" || severity === "CRITICAL") {
    await db.inboxItem.create({
      data: {
        tenantGtid: "SGTX-EG-GOV-000001-9A0B",
        category: "COMPLIANCE",
        priority: severity === "CRITICAL" ? 95 : 85,
        title: `${severity} Threat: ${title}`,
        description: `${description || ""} Source: ${source}${cveId ? `, CVE: ${cveId}` : ""}${mitreTechnique ? `, MITRE: ${mitreTactic}/${mitreTechnique}` : ""}`,
        ctaLabel: "Investigate",
      },
    });
  }
  return NextResponse.json({ ok: true, threat });
}

// POST /api/sgtx/threats/mitigate — Mark threat mitigated
export async function POST_mitigate(req: NextRequest) {
  const { threatId, remediationNotes } = await req.json();
  const threat = await db.threatFinding.update({
    where: { id: threatId },
    data: { status: "MITIGATED", remediatedAt: new Date() },
  });
  return NextResponse.json({ ok: true, threat });
}
