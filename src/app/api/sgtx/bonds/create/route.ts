// POST /api/sgtx/bonds/create — Create a new customs bond
// GET  /api/sgtx/bonds/create — route info
//
// Body:
//   tenantGtid      (required)
//   bondType        (required: CASH_DEPOSIT | BANK_GUARANTEE | INSURANCE_BOND | GENERAL_BOND)
//   amount          (required, > 0)
//   jurisdiction    (required: EG | EU | US | AE | SA | GB)
//   currency        (optional, default EGP)
//   aeoStatus       (optional, default false)
//   bondReference   (optional)
//   issuerName      (optional)
//   issuerGtid      (optional)
//   coveragePercentage (optional)
//   validFrom       (optional ISO date)
//   validTo         (optional ISO date)
//   issuedDate      (optional ISO date)
//   certificateUrl  (optional)
//
// On create the bond is in DRAFT status and unverified — the tenant must
// call /verify before allocating it to a USTN.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  calculateBondRequirement,
  getAvailableBondTypes,
  normaliseJurisdiction,
  type BondType,
} from "@/lib/sgtx/bonds";

export const dynamic = "force-dynamic";

const ALLOWED_BOND_TYPES = new Set([
  "CASH_DEPOSIT",
  "BANK_GUARANTEE",
  "INSURANCE_BOND",
  "GENERAL_BOND",
]);

function toIsoDate(v: unknown): Date | undefined {
  if (!v || typeof v !== "string") return undefined;
  const d = new Date(v);
  return isNaN(d.getTime()) ? undefined : d;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Invalid JSON body" },
        { status: 400 },
      );
    }
    const {
      tenantGtid,
      bondType,
      amount,
      jurisdiction,
      currency = "EGP",
      aeoStatus = false,
      bondReference,
      issuerName,
      issuerGtid,
      coveragePercentage,
      validFrom,
      validTo,
      issuedDate,
      certificateUrl,
    } = body as Record<string, unknown>;

    if (!tenantGtid || typeof tenantGtid !== "string") {
      return NextResponse.json(
        { ok: false, error: "tenantGtid is required" },
        { status: 400 },
      );
    }
    if (!bondType || !ALLOWED_BOND_TYPES.has(bondType as string)) {
      return NextResponse.json(
        {
          ok: false,
          error: `bondType must be one of: ${Array.from(ALLOWED_BOND_TYPES).join(", ")}`,
        },
        { status: 400 },
      );
    }
    const amt = typeof amount === "string" ? parseFloat(amount) : Number(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      return NextResponse.json(
        { ok: false, error: "amount must be a positive number" },
        { status: 400 },
      );
    }
    const j = normaliseJurisdiction(String(jurisdiction || ""));
    if (!j) {
      return NextResponse.json(
        { ok: false, error: "jurisdiction must be one of: EG, EU, US, AE, SA, GB" },
        { status: 400 },
      );
    }
    const available = getAvailableBondTypes(j);
    if (!available.includes(bondType as BondType)) {
      return NextResponse.json(
        {
          ok: false,
          error: `bondType ${bondType} is not available in jurisdiction ${j}. Available: ${available.join(", ")}`,
        },
        { status: 400 },
      );
    }

    const bond = await db.customsBond.create({
      data: {
        tenantGtid,
        bondType: bondType as string,
        amount: amt,
        currency: typeof currency === "string" ? currency : "EGP",
        jurisdiction: j,
        aeoStatus: Boolean(aeoStatus),
        bondReference: typeof bondReference === "string" ? bondReference : null,
        issuerName: typeof issuerName === "string" ? issuerName : null,
        issuerGtid: typeof issuerGtid === "string" ? issuerGtid : null,
        coveragePercentage:
          typeof coveragePercentage === "number" ? coveragePercentage : null,
        validFrom: toIsoDate(validFrom),
        validTo: toIsoDate(validTo),
        issuedDate: toIsoDate(issuedDate),
        certificateUrl: typeof certificateUrl === "string" ? certificateUrl : null,
        status: "DRAFT",
        verified: false,
      },
    });

    logger.info("Bond created", { bondId: bond.id, tenantGtid, jurisdiction: j });

    // Enrich the response with the required-bond calculation so the UI can
    // show whether the created amount is sufficient for a typical duty.
    const calc = calculateBondRequirement({
      dutyAmount: amt,
      jurisdiction: j,
      aeoStatus: Boolean(aeoStatus),
    });

    return NextResponse.json({ ok: true, bond, calculation: calc });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[bonds/create] error", { msg, raw: String(e) });
    return NextResponse.json(
      { ok: false, error: msg || "create failed" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    route: "/api/sgtx/bonds/create",
    description: "Create a new customs bond (DRAFT, unverified)",
    methods: ["POST"],
    fields: {
      tenantGtid: "string (required)",
      bondType: "CASH_DEPOSIT | BANK_GUARANTEE | INSURANCE_BOND | GENERAL_BOND",
      amount: "number (required, > 0)",
      jurisdiction: "EG | EU | US | AE | SA | GB (required)",
      currency: "string (default EGP)",
      aeoStatus: "boolean (default false)",
      bondReference: "string (optional)",
      issuerName: "string (optional)",
      issuerGtid: "string (optional)",
      coveragePercentage: "number (optional)",
      validFrom: "ISO date (optional)",
      validTo: "ISO date (optional)",
      issuedDate: "ISO date (optional)",
      certificateUrl: "string (optional)",
    },
  });
}
