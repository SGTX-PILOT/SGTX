import { NextRequest, NextResponse } from "next/server";
import { freshDb as db } from "@/lib/db-fresh";
import { batchMrlCheck } from "@/lib/sgtx/compliance/eu-pesticides-capability";
import { batchMultiSourceCheck } from "@/lib/sgtx/compliance/multi-source-pesticides";
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { result, passFail, parameters, detectedResidues, productCode } = await req.json();
    const labTest = await db.labTest.findUnique({ where: { id }, include: { trade: true } });
    if (!labTest) return NextResponse.json({ error: "Lab test not found" }, { status: 404 });
    await db.labTest.update({ where: { id }, data: { result, passFail, parameters: parameters || null, status: "COMPLETED", completedAt: new Date() } });
    await db.document.create({ data: { tradeId: labTest.tradeId, type: "LAB_REPORT", title: `Lab Report — ${labTest.testType}`, status: "UPLOADED", uploadedBy: labTest.labGtid, hashSha256: `lab-${id}-${Date.now()}` } }).catch(() => null);

    // EU Pesticides MRL compliance check (if detected residues + product code provided)
    let mrlCompliance: any = null;
    let multiSourceCompliance: any = null;
    if (detectedResidues && Array.isArray(detectedResidues) && detectedResidues.length > 0) {
      try {
        // 1. EU-only check (if product code provided)
        if (productCode) {
          mrlCompliance = await batchMrlCheck(productCode, detectedResidues);
          if (mrlCompliance.overallVerdict === "NON_COMPLIANT" && passFail !== "FAIL") {
            await db.labTest.update({ where: { id }, data: { passFail: "FAIL", result: `EU MRL violation: ${mrlCompliance.summary}` } });
          }
        }
        // 2. Multi-source check (EU + Codex) — the Brain AI orchestrates both sources
        // Look up commodity name from the product code
        let commodityName: string | undefined;
        if (productCode) {
          const product = await db.euPesticideProduct.findUnique({ where: { productCode } }).catch(() => null);
          if (product) commodityName = product.productName;
        }
        if (commodityName || detectedResidues.length > 0) {
          multiSourceCompliance = await batchMultiSourceCheck(
            commodityName || "Citrus fruits", // fallback
            detectedResidues,
            productCode,
          );
          // Multi-source check is stricter — if NON_COMPLIANT, override
          if (multiSourceCompliance.overallVerdict === "NON_COMPLIANT" && passFail !== "FAIL") {
            await db.labTest.update({ where: { id }, data: { passFail: "FAIL", result: `MRL violation (EU+Codex): ${multiSourceCompliance.summary}` } });
          }
        }
        // Record compliance check as an activity
        await db.activity.create({
          data: {
            actorGtid: labTest.labGtid,
            tradeId: labTest.tradeId,
            action: "MULTI_SOURCE_MRL_CHECK",
            type: "MULTI_SOURCE_MRL_CHECK",
            description: multiSourceCompliance?.summary || mrlCompliance?.summary || "MRL check completed",
            metadata: JSON.stringify({
              productCode,
              commodityName,
              detectedCount: detectedResidues.length,
              euVerdict: mrlCompliance?.overallVerdict,
              multiSourceVerdict: multiSourceCompliance?.overallVerdict,
              sourcesUsed: multiSourceCompliance?.sourcesUsed || [],
              nonCompliant: multiSourceCompliance?.nonCompliantCount || mrlCompliance?.nonCompliantCount || 0,
            }),
          },
        }).catch(() => null);
      } catch (e: any) {
        // MRL check is non-fatal — lab result still recorded
        mrlCompliance = { error: e.message };
      }
    }

    // Auto-trigger Certificate of Analysis when lab test PASSES (Part 5.7)
    if (passFail === "PASS" || passFail === "CONDITIONAL") {
      const certNo = `CoA-${id.slice(-8).toUpperCase()}`;
      await db.document.create({ data: { tradeId: labTest.tradeId, type: "CERTIFICATE_OF_ANALYSIS", title: `Certificate of Analysis — ${certNo} — ${labTest.testType.replace(/_/g, " ")}`, status: "VERIFIED", uploadedBy: labTest.labGtid, hashSha256: `coa-${id}-${Date.now()}` } }).catch(() => null);
    }

    const mrlNote = multiSourceCompliance?.overallVerdict
      ? `. MRL: ${multiSourceCompliance.overallVerdict} (${multiSourceCompliance.summary})`
      : mrlCompliance?.overallVerdict
        ? `. EU MRL: ${mrlCompliance.overallVerdict} (${mrlCompliance.summary})`
        : "";
    const certNote = (passFail === "PASS" || passFail === "CONDITIONAL") ? ". Certificate of Analysis auto-issued." : "";
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.buyerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}${certNote}${mrlNote}`, ctaLabel: "View Results" } }).catch(() => null);
    await db.inboxItem.create({ data: { tenantGtid: labTest.trade.sellerGtid, tradeId: labTest.tradeId, category: "GENERAL", priority: 80, title: `Lab results: ${passFail}`, description: `${labTest.testType} result: ${result}. USTN: ${labTest.trade.ustn}${mrlNote}`, ctaLabel: "View Results" } }).catch(() => null);
    return NextResponse.json({ ok: true, status: "COMPLETED", passFail, certificateIssued: passFail === "PASS" || passFail === "CONDITIONAL", mrlCompliance, multiSourceCompliance });
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
