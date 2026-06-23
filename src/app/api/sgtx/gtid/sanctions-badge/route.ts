import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/gtid/sanctions-badge?gtid=SGTX-EG-TRD-002139-7F3A  (Part 2.1.7.3)
//
// Returns the sanctions status badge per blueprint 2.1.7.3:
//   ✅ Cleared    (Green)  — No sanctions, no PEP flags
//   ⚠️ Enhanced DD (Amber) — PEP detected; enhanced due diligence required
//   ❌ Blocked    (Red)    — Sanctions hit; trade blocked
//
// AI Authority: A2 (HF local / simulated here) performs sanctions screening.
// The badge is informational — never auto-blocks; the Governor (A4) makes the
// final enforcement decision. Used by the GTID resolution response and the
// Trader Portal header to display the badge prominently.

export async function GET(req: NextRequest) {
  const gtid = (req.nextUrl.searchParams.get("gtid") || "").trim().toUpperCase();
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "GTID_NOT_FOUND" }, { status: 404 });

  // Determine badge state from tenant.pepStatus + sanctionsCleared + most
  // recent ComplianceScreening row. Default: CLEAR when sanctionsCleared=true.
  let badge: "CLEARED" | "ENHANCED_DD" | "BLOCKED";
  let color: "green" | "amber" | "red";
  let meaning: string;

  const pep = (tenant.pepStatus || "CLEAR").toUpperCase();
  const lastScreening = await db.complianceScreening.findFirst({
    where: { tenantGtid: gtid },
    orderBy: { createdAt: "desc" },
  }).catch(() => null);

  // Priority: BLOCKED > ENHANCED_DD > CLEARED
  if (!tenant.sanctionsCleared || pep === "BLOCKED" || lastScreening?.verdict === "BLOCKED") {
    badge = "BLOCKED";
    color = "red";
    meaning = "Sanctions hit; trade blocked";
  } else if (pep === "ENHANCED_DD" || lastScreening?.verdict === "ENHANCED_DUE_DILIGENCE") {
    badge = "ENHANCED_DD";
    color = "amber";
    meaning = "PEP detected; enhanced due diligence required";
  } else {
    badge = "CLEARED";
    color = "green";
    meaning = "No sanctions, no PEP flags";
  }

  return NextResponse.json({
    gtid,
    badge,
    color,
    meaning,
    icon: badge === "CLEARED" ? "✅" : badge === "ENHANCED_DD" ? "⚠️" : "❌",
    sanctions_cleared: tenant.sanctionsCleared,
    pep_status: tenant.pepStatus || "CLEAR",
    last_screening_verdict: lastScreening?.verdict || null,
    last_screening_at: lastScreening?.createdAt?.toISOString() || null,
    ai_authority: "A2",
    informational_only: true,
    note: "Badge is informational. The Governor (A4) makes the final enforcement decision via OPA policy.",
  });
}
