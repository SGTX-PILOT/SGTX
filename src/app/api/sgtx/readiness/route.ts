import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// GET /api/sgtx/readiness?tenant=GTID — Trade Readiness Assessment (Part 2.8)
export async function GET(req: NextRequest) {
  const tenant = req.nextUrl.searchParams.get("tenant");
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });

  let readiness = await db.tradeReadiness.findUnique({ where: { tenantGtid: tenant } });
  if (!readiness) {
    // Calculate initial readiness
    readiness = await calculateReadiness(tenant);
  }
  return NextResponse.json(readiness);
}

// POST /api/sgtx/readiness/recalculate — force recalculation
export async function POST(req: NextRequest) {
  const { tenant } = await req.json();
  if (!tenant) return NextResponse.json({ error: "tenant required" }, { status: 400 });
  const readiness = await calculateReadiness(tenant);
  return NextResponse.json(readiness);
}

async function calculateReadiness(tenantGtid: string) {
  const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid }, include: { employees: true } });
  if (!tenant) throw new Error("tenant not found");

  // Part 2.8.2 checklist items (5 categories)
  const checklist = {
    company: [
      { id: "tax_id", label: "Tax ID verified", weight: 35, done: true, mandatory: true },
      { id: "registration", label: "Commercial register verified", weight: 25, done: true, mandatory: true },
      { id: "address", label: "Office address geocoded", weight: 15, done: true, mandatory: true },
      { id: "ubo", label: "UBO declaration filed", weight: 15, done: tenant.kybTier >= 2, mandatory: true },
      { id: "lei", label: "LEI verified (optional)", weight: 10, done: false, mandatory: false },
    ],
    banking: [
      { id: "settlement", label: "Settlement account linked", weight: 60, done: false, mandatory: true },
      { id: "psp", label: "PSP connected", weight: 40, done: false, mandatory: true },
    ],
    trade: [
      { id: "products", label: "≥1 saved commodity", weight: 40, done: true, mandatory: true },
      { id: "ports", label: "≥1 saved port", weight: 30, done: true, mandatory: true },
      { id: "incoterm", label: "Default incoterm set", weight: 30, done: true, mandatory: true },
    ],
    security: [
      { id: "passkey", label: "Passkey enrolled", weight: 50, done: true, mandatory: true },
      { id: "mfa", label: "MFA enabled", weight: 50, done: true, mandatory: true },
    ],
    legal: [
      { id: "fee_ack", label: "Fee schedule acknowledged", weight: 100, done: false, mandatory: true },
    ],
  };

  // Calculate category scores
  const calcCategory = (items: any[]) => {
    const mandatory = items.filter(i => i.mandatory);
    const doneMandatory = mandatory.filter(i => i.done).length;
    return Math.round((doneMandatory / Math.max(mandatory.length, 1)) * 100);
  };

  const companyScore = calcCategory(checklist.company);
  const bankingScore = calcCategory(checklist.banking);
  const tradeScore = calcCategory(checklist.trade);
  const securityScore = calcCategory(checklist.security);
  const legalScore = calcCategory(checklist.legal);

  // Overall = weighted (Part 2.8.1: Company 35%, Banking 25%, Trade 20%, Security 15%, Legal 5%)
  const score = Math.round(companyScore * 0.35 + bankingScore * 0.25 + tradeScore * 0.20 + securityScore * 0.15 + legalScore * 0.05);

  const data = {
    tenantGtid,
    score,
    companyScore, bankingScore, tradeScore, securityScore, legalScore,
    checklist: JSON.stringify(checklist),
    lastCalculated: new Date(),
  };

  const existing = await db.tradeReadiness.findUnique({ where: { tenantGtid } });
  if (existing) {
    return await db.tradeReadiness.update({ where: { tenantGtid }, data });
  }
  return await db.tradeReadiness.create({ data });
}
