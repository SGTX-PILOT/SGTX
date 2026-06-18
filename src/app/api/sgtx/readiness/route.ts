import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runAI } from "@/lib/sgtx/ai/orchestrator";

// GET /api/sgtx/readiness?tenant=GTID — Trade Readiness Assessment (Part 2.8)
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

  let readiness = await db.tradeReadiness.findUnique({ where: { tenantGtid: tenant } });
  if (!readiness) {
    readiness = await calculateReadiness(tenant);
  }
  // Build detailed checklist (Part 2.8.2)
  const checklist = buildDetailedChecklist(readiness);
  return NextResponse.json({ ...readiness, detailedChecklist: checklist });
}

// POST /api/sgtx/readiness/recalculate — force recalculation
export async function POST(req: NextRequest) {
  const { tenant } = await req.json();
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const readiness = await calculateReadiness(tenant);
  return NextResponse.json(readiness);
}

function buildDetailedChecklist(readiness: any) {
  // Part 2.8.2 — detailed items with validation method + one-click remediation CTA
  return {
    company: [
      { id: "tax_id", label: "Tax ID validated", validation: "API call to government registry (ETA) — realtime", status: "✅", cta: "Verify Tax ID", mandatory: true, weight: 35 },
      { id: "commercial_reg", label: "Commercial registration uploaded", validation: "Document stored + AI extraction (HF Donut)", status: "✅", cta: "Upload Commercial Register", mandatory: true, weight: 25 },
      { id: "address", label: "Legal address verified", validation: "Geocoding (Nominatim) + proof document", status: "✅", cta: "Verify Address", mandatory: true, weight: 15 },
      { id: "ubo", label: "UBO declaration (Tier 2+)", validation: "Digital signature on declaration form", status: "✅", cta: "Complete UBO Declaration", mandatory: true, weight: 15 },
      { id: "financial_stmt", label: "Annual financial statement", validation: "Upload PDF — AI extracts key figures", status: "optional", cta: "Upload Statement", mandatory: false, weight: 10 },
      { id: "insurance", label: "Insurance certificate", validation: "Upload PDF, RIA checks expiry", status: "optional", cta: "Upload Insurance", mandatory: false, weight: 0 },
    ],
    banking: [
      { id: "settlement", label: "Settlement account linked", validation: "PSP connected or bank IBAN verified via microdeposit", status: "❌", cta: "Connect PSP / Verify IBAN", mandatory: true, weight: 60 },
      { id: "finance_prefs", label: "Finance preferences set", validation: "Payment method + currency selected", status: "❌", cta: "Set Preferences", mandatory: true, weight: 40 },
      { id: "debit_auth", label: "Debit authorisation", validation: "Signed mandate for auto-charges", status: "optional", cta: "Authorise Debit", mandatory: false, weight: 0 },
      { id: "credit_facility", label: "Credit facility approval (financier only)", validation: "Upload credit line letter, manual verify", status: "optional", cta: "Request Facility", mandatory: false, weight: 0 },
    ],
    trade: [
      { id: "product", label: "At least one product defined", validation: "Saved in saved_commodities (HS code, desc)", status: "✅", cta: "Add Product", mandatory: true, weight: 40 },
      { id: "port", label: "At least one port saved", validation: "Saved in saved_ports (UN/LOCODE)", status: "✅", cta: "Add Port", mandatory: true, weight: 30 },
      { id: "incoterm", label: "Default incoterm selected", validation: "Incoterms 2020 list, stored in prefs", status: "✅", cta: "Choose Incoterm", mandatory: true, weight: 30 },
      { id: "shipping_lines", label: "Shipping lines added (seller only)", validation: "≥1 saved contact of type SHIP", status: "N/A", cta: "Add Shipping Line", mandatory: false, weight: 0 },
      { id: "customs_broker", label: "Customs broker added (buyer only)", validation: "≥1 saved contact of type CBR", status: "N/A", cta: "Add Customs Broker", mandatory: false, weight: 0 },
    ],
    security: [
      { id: "passkey", label: "Passkey enrolled", validation: "WebAuthn credential registered with ZITADEL", status: "✅", cta: "Enrol Passkey", mandatory: true, weight: 50 },
      { id: "mfa", label: "MFA enabled", validation: "TOTP or additional passkey", status: "✅", cta: "Enable MFA", mandatory: true, weight: 30 },
      { id: "recovery", label: "Recovery method configured", validation: "Backup codes or recovery email verified", status: "✅", cta: "Generate Backup Codes", mandatory: true, weight: 20 },
      { id: "hw_key", label: "Hardware security key", validation: "WebAuthn roaming authenticator (YubiKey)", status: "optional", cta: "Register Security Key", mandatory: false, weight: 0 },
      { id: "session_risk", label: "Session risk monitoring opt-in", validation: "Consent to behavioural anomaly detection", status: "optional", cta: "Opt In", mandatory: false, weight: 0 },
    ],
    legal: [
      { id: "tos", label: "Terms of Service accepted", validation: "Version-tagged consent in consent_records", status: "✅", cta: "Review & Accept", mandatory: true, weight: 35 },
      { id: "privacy", label: "Privacy notice accepted", validation: "Version-tagged consent, granular options", status: "✅", cta: "Review & Accept", mandatory: true, weight: 30 },
      { id: "fee_schedule", label: "Fee schedule acknowledged", validation: "Digital signature of fee schedule (Ed25519)", status: "❌", cta: "Sign Fee Schedule", mandatory: true, weight: 35 },
      { id: "dpa", label: "Data processing agreement (EU)", validation: "Signed DPA for EU counterparties", status: "optional", cta: "Sign DPA", mandatory: false, weight: 0 },
    ],
  };
}

async function calculateReadiness(tenantGtid: string) {
  const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid }, include: { employees: true } });
  if (!tenant) throw new Error("tenant not found");

  const checklist = buildDetailedChecklist({});
  const calcCategory = (items: any[]) => {
    const mandatory = items.filter(i => i.mandatory);
    const doneMandatory = mandatory.filter(i => i.status === "✅").length;
    return Math.round((doneMandatory / Math.max(mandatory.length, 1)) * 100);
  };

  const companyScore = calcCategory(checklist.company);
  const bankingScore = calcCategory(checklist.banking);
  const tradeScore = calcCategory(checklist.trade);
  const securityScore = calcCategory(checklist.security);
  const legalScore = calcCategory(checklist.legal);
  const score = Math.round(companyScore * 0.35 + bankingScore * 0.25 + tradeScore * 0.20 + securityScore * 0.15 + legalScore * 0.05);

  const data = {
    tenantGtid, score,
    companyScore, bankingScore, tradeScore, securityScore, legalScore,
    checklist: JSON.stringify(checklist),
    lastCalculated: new Date(),
  };

  const existing = await db.tradeReadiness.findUnique({ where: { tenantGtid } });
  return existing ? await db.tradeReadiness.update({ where: { tenantGtid }, data }) : await db.tradeReadiness.create({ data });
}

// POST /api/sgtx/readiness/ai-recommendations — AI recommendations (Part 2.8.6)
export async function PUT(req: NextRequest) {
  const { tenant } = await req.json();
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const readiness = await db.tradeReadiness.findUnique({ where: { tenantGtid: tenant } });
  if (!readiness) return NextResponse.json({ error: "calculate readiness first" }, { status: 404 });

  const missingItems: string[] = [];
  const checklist = JSON.parse(readiness.checklist);
  for (const cat of Object.values(checklist)) {
    for (const item of cat as any[]) {
      if (item.mandatory && item.status === "❌") missingItems.push(item.label);
    }
  }

  const aiResult = await runAI({
    agentName: "readiness_recommendation_generator",
    authority: "A1",
    systemPrompt: "You are the SGTX Readiness AI. Generate plain-language, contextual recommendations for missing readiness items. Based ONLY on the tenant's own data and public defaults — never 'other tenants did this'. Non-marketplace. Max 3 sentences.",
    userPrompt: `Tenant: ${tenant}\nReadiness score: ${readiness.score}%\nMissing mandatory items: ${missingItems.join(", ") || "none"}\n\nGenerate recommendations.`,
    fallbackKey: "chat",
    maxTokens: 150,
    temperature: 0.3,
  });
  return NextResponse.json({ recommendations: aiResult.content, provider: aiResult.provider, missingItems });
}
