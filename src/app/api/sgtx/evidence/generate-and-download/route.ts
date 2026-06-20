import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { compileEvidenceBundle, EVIDENCE_PACKAGE_TYPES, ARBITRATION_JURISDICTIONS } from "@/lib/sgtx/governor/constitutional-addons";

// POST /api/sgtx/evidence/generate-and-download
// Blueprint Part 1.10.4 — One-Click Generation.
// Body: { ustn, packageType?, jurisdiction?, generatedBy? }
// Compiles the full 11-item evidence bundle, persists a summary record, and
// returns the bundle as a downloadable JSON file (Content-Disposition: attachment).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { ustn, packageType, jurisdiction, generatedBy } = body;
    if (!ustn) return NextResponse.json({ error: "ustn required" }, { status: 400 });

    const pkgType = packageType || "ZIP";
    const juris = jurisdiction || "EGYPT";

    // Compile the bundle (all 11 items)
    const bundle = await compileEvidenceBundle({
      ustn,
      packageType: pkgType,
      jurisdiction: juris,
      generatedBy: generatedBy || null,
    });

    // Persist a summary record so /api/sgtx/evidence/list shows the package
    const pkg = await db.evidencePackage.create({
      data: {
        ustn,
        packageType: pkgType,
        jurisdiction: juris,
        contents: JSON.stringify(bundle.contents),
        fileSizeKb: bundle.fileSizeKb,
        loomHash: bundle.loomHash,
        generatedBy: generatedBy || null,
      },
    });

    // Attach the persistent id
    const fullBundle = { ...bundle, id: pkg.id };

    // Return as a downloadable JSON file
    const filename = `sgtx-evidence-${ustn}-${pkgType.toLowerCase()}-${pkg.id}.json`;
    const json = JSON.stringify(fullBundle, null, 2);

    return new NextResponse(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-SGTX-Evidence-Id": pkg.id,
        "X-SGTX-Loom-Hash": bundle.loomHash,
        "X-SGTX-Missing-Items": bundle.missing.join(",") || "none",
      },
    });
  } catch (e: any) {
    console.error("[evidence/generate-and-download] error:", e);
    return NextResponse.json(
      { error: e?.message || "Evidence package generation failed" },
      { status: 500 },
    );
  }
}

// GET /api/sgtx/evidence/generate-and-download — return package types + jurisdictions
// (mirror of /api/sgtx/evidence/generate GET for convenience)
export async function GET() {
  return NextResponse.json({
    packageTypes: EVIDENCE_PACKAGE_TYPES,
    jurisdictions: ARBITRATION_JURISDICTIONS,
    requiredItems: [
      "contract",
      "signatures",
      "loom_chain",
      "audit_logs",
      "payment_logs",
      "communication_logs",
      "document_hashes",
      "milestone_timeline",
      "sensor_data",
      "qc_report_with_overrides",
      "causal_analysis",
    ],
  });
}
