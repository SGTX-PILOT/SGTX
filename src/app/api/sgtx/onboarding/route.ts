// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/sgtx/logger";
import { db } from "@/lib/db";

// POST /api/sgtx/onboarding
// Body: { country, type, legalName, createTenant? } → generates provisional GTID with CRC32 checksum
// If createTenant=true, also creates a Tenant record with lifecycle_state=REGISTERED
export async function POST(req: NextRequest) {
  const { country, type, legalName, createTenant } = await req.json();
  if (!country || !type) return NextResponse.json({ error: "country + type required" }, { status: 400 });

  // Find next sequence for (country, type)
  const existing = await db.tenant.findMany({
    where: { country, type },
    select: { gtid: true },
  });
  // Extract sequences and find max
  let maxSeq = 0;
  for (const t of existing) {
    const match = t.gtid.match(/SGTX-\w{2}-\w{3}-(\d{6})-/);
    if (match) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  const sequence = String(maxSeq + 1).padStart(6, "0");

  // CRC32-ISO-HDLC checksum (4 hex digits)
  const checksum = crc32(`${country}${type}${sequence}`).toString(16).toUpperCase().padStart(4, "0").slice(0, 4);
  const gtid = `SGTX-${country}-${type}-${sequence}-${checksum}`;

  // Create Tenant record if requested (blueprint 2.2.2 Step 1)
  if (createTenant) {
    const existingTenant = await db.tenant.findUnique({ where: { gtid } });
    if (!existingTenant) {
      await db.tenant.create({
        data: {
          gtid,
          legalName: legalName || `New ${type} Tenant`,
          type,
          country,
          trustScore: 50,
          sanctionsCleared: false,
          lifecycleState: "REGISTERED",
          kybTier: 0,
        },
      });

      // Smart Inbox welcome message
      await db.inboxItem.create({
        data: {
          tenantGtid: gtid,
          category: "GENERAL",
          priority: 50,
          title: "Welcome to SGTX — Complete your onboarding",
          description: `Your GTID ${gtid} has been registered. Complete KYB verification to unlock trade execution capabilities.`,
          ctaLabel: "Continue Onboarding",
        },
      });

      // Activity log
      await db.activity.create({
        data: {
          action: "TENANT_REGISTERED",
          type: "SUCCESS",
          description: `Tenant ${gtid} registered (${legalName || type}). Lifecycle state: REGISTERED.`,
        },
      });
    }
  }

  return NextResponse.json({ gtid, country, type, sequence, checksum, legalName, tenantCreated: !!createTenant });
}

// PUT /api/sgtx/onboarding
// Blueprint Part 2.2.3 — Step 2 Organization Details + Step 3 Bank Details.
// Body: { gtid, legalName, taxId, commercialRegister, sector, city?, contactEmail?, officeAddress?,
//         bankSwift?, bankName?, bankBranch?, bankCity?, bankAccountName?, bankAccountNo?,
//         bankCurrency?, bankIbanFormat? }
// Updates the Tenant record with the captured organization identifiers AND bank details.
// Bank details fields are persisted on the Tenant record per the new schema fields
// (bankSwift, bankName, bankBranch, bankCity, bankAccountName, bankAccountNo, bankCurrency,
// bankIbanFormat).
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      gtid,
      legalName,
      taxId,
      commercialRegister,
      sector,
      city,
      contactEmail,
      officeAddress,
      bankSwift,
      bankName,
      bankBranch,
      bankCity,
      bankAccountName,
      bankAccountNo,
      bankCurrency,
      bankIbanFormat,
    } = body;
    if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });

    const existing = await db.tenant.findUnique({ where: { gtid } });
    if (!existing) return NextResponse.json({ error: "tenant not found" }, { status: 404 });

    const data: any = {};
    if (legalName) data.legalName = legalName;
    if (sector) data.sector = sector;
    if (city) data.city = city;
    if (officeAddress && !data.city) data.city = officeAddress;
    // Bank details (Step 3)
    if (bankSwift) data.bankSwift = bankSwift;
    if (bankName) data.bankName = bankName;
    if (bankBranch !== undefined) data.bankBranch = bankBranch;
    if (bankCity !== undefined) data.bankCity = bankCity;
    if (bankAccountName !== undefined) data.bankAccountName = bankAccountName;
    if (bankAccountNo) data.bankAccountNo = bankAccountNo;
    if (bankCurrency) data.bankCurrency = bankCurrency;
    if (bankIbanFormat !== undefined) data.bankIbanFormat = bankIbanFormat;

    const updated = await db.tenant.update({
      where: { gtid },
      data,
    });

    // Activity log capturing the full submission
    const isBankSubmission = !!bankSwift;
    await db.activity.create({
      data: {
        actorGtid: gtid,
        action: isBankSubmission ? "BANK_DETAILS_SUBMITTED" : "ORG_DETAILS_SUBMITTED",
        type: "INFO",
        description: isBankSubmission
          ? `Step 3 bank details submitted by ${gtid}. bank=${bankName}, SWIFT=${bankSwift}, ` +
            `account=${bankAccountNo ? bankAccountNo.slice(0, 4) + "****" + bankAccountNo.slice(-4) : "—"}, ` +
            `currency=${bankCurrency || "—"}.`
          : `Step 2 organization details submitted by ${gtid}. ` +
            `legalName=${legalName || existing.legalName}, taxId=${taxId || "—"}, ` +
            `commercialRegister=${commercialRegister || "—"}, sector=${sector || "—"}, ` +
            `contactEmail=${contactEmail || "—"}, officeAddress=${officeAddress || "—"}.`,
        metadata: JSON.stringify({
          taxId, commercialRegister, contactEmail, officeAddress,
          bankSwift, bankName, bankBranch, bankCity, bankAccountName, bankCurrency,
        }),
      },
    });

    // Smart Inbox to compliance officer — KYB document review queue
    const COMPLIANCE_OFFICER_GTID = "SGTX-EG-GOV-000001-9A0B";
    try {
      await db.inboxItem.create({
        data: {
          tenantGtid: COMPLIANCE_OFFICER_GTID,
          category: "COMPLIANCE",
          priority: 60,
          title: `KYB review · ${gtid} · ${legalName || existing.legalName}`,
          description:
            `Tenant ${gtid} submitted organization details (taxId=${taxId || "—"}, ` +
            `CR=${commercialRegister || "—"}, sector=${sector || "—"}). Cross-reference ` +
            `with government registries (ETA + commercial register) before approving KYB Tier 2.`,
          ctaLabel: "Review KYB",
        },
      });
    } catch (inboxErr) {
      logger.error("[onboarding PUT] inbox error:", inboxErr);
    }

    return NextResponse.json({
      ok: true,
      tenant: {
        gtid: updated.gtid,
        legalName: updated.legalName,
        sector: updated.sector,
        city: updated.city,
        lifecycleState: updated.lifecycleState,
        bankSwift: updated.bankSwift,
        bankName: updated.bankName,
        bankCity: updated.bankCity,
        bankCurrency: updated.bankCurrency,
      },
      submittedFields: { taxId, commercialRegister, sector, contactEmail, officeAddress },
      bankDetails: bankSwift ? { bankSwift, bankName, bankBranch, bankCity, bankCurrency, maskedAccount: bankAccountNo ? bankAccountNo.slice(0, 4) + "****" + bankAccountNo.slice(-4) : null } : null,
    });
  } catch (e: any) {
    logger.error("[onboarding PUT] error:", e);
    return NextResponse.json({ error: e?.message || "Failed to update organization details" }, { status: 500 });
  }
}

// GET /api/sgtx/onboarding?gtid=... — fetch onboarding state for a tenant
export async function GET(req: NextRequest) {
  const gtid = req.nextUrl.searchParams.get("gtid");
  if (!gtid) return NextResponse.json({ error: "gtid required" }, { status: 400 });
  const tenant = await db.tenant.findUnique({ where: { gtid } });
  if (!tenant) return NextResponse.json({ error: "tenant not found" }, { status: 404 });
  return NextResponse.json({
    gtid: tenant.gtid,
    legalName: tenant.legalName,
    type: tenant.type,
    country: tenant.country,
    sector: tenant.sector,
    city: tenant.city,
    kybTier: tenant.kybTier,
    lifecycleState: tenant.lifecycleState,
    traderMode: tenant.traderMode,
  });
}

// CRC32-ISO-HDLC (polynomial 0xEDB88320, same as ZIP/PNG)
function crc32(str: string): number {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xEDB88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
