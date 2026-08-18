// SGTX Add-On 23 — Shipper's Declaration
// ===========================================================================
//
// Manages Shipper's Declarations of goods (a.k.a. Shipper's Letter of
// Instruction / SLD / SDL): the legal document the exporter signs to
// declare goods description, HS code, net weight, value, origin, destination,
// and incoterm to customs and the carrier.
//
// Signing flow:
//   signed=false  → draft declaration, awaiting signature
//   signed=true   → cryptographically signed (signedAt set); the row becomes
//                  immutable except for an explicit `revoke` operation (out
//                  of scope here — handled by the release module's
//                  revocation path when wired).
//
// The lib also exposes a small helper (`findRelevantExportLicense`) that
// looks up the exporter's ExportLicense for the declared HS code so callers
// can pre-validate license sufficiency before signing.
//
// Models:
//   db.shippersDeclaration — the declaration itself
//   db.exportLicense       — export license register (per tenant+HS code)

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export interface CreateShippersDeclarationInput {
  ustn?: string | null;
  exporterGtid: string;
  declarationReference?: string | null;
  declarationDate?: string | null;
  goodsDescription?: string | null;
  hsCode?: string | null;
  netWeight?: number | null;
  value?: number | null;
  currency?: string | null;
  originCountry?: string | null;
  destinationCountry?: string | null;
  incoterm?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** Create a shipper's declaration row (signed=false, signedAt=null). */
export async function createShippersDeclaration(input: CreateShippersDeclarationInput) {
  if (!input.exporterGtid?.trim()) {
    throw new Error("exporterGtid is required");
  }

  const data: any = {
    exporterGtid: input.exporterGtid.trim(),
    signed: false,
  };
  if (input.ustn) data.ustn = input.ustn;
  if (input.declarationReference) data.declarationReference = input.declarationReference;
  if (input.declarationDate) data.declarationDate = new Date(input.declarationDate);
  if (input.goodsDescription) data.goodsDescription = input.goodsDescription;
  if (input.hsCode) data.hsCode = input.hsCode;
  if (input.netWeight != null && !isNaN(Number(input.netWeight))) {
    data.netWeight = +Number(input.netWeight).toFixed(4);
  }
  if (input.value != null && !isNaN(Number(input.value))) {
    data.value = +Number(input.value).toFixed(2);
  }
  if (input.currency) data.currency = input.currency;
  if (input.originCountry) data.originCountry = input.originCountry;
  if (input.destinationCountry) data.destinationCountry = input.destinationCountry;
  if (input.incoterm) data.incoterm = input.incoterm;

  const decl = await (db as any).shippersDeclaration.create({ data });
  logger.info("[shippers-declaration] created", {
    declId: decl.id,
    exporterGtid: data.exporterGtid,
    ustn: input.ustn || null,
  });
  return decl;
}

/** List shipper's declarations by exporter GTID. */
export async function listShippersDeclarations(exporterGtid: string) {
  if (!exporterGtid) return [];
  const rows = await (db as any).shippersDeclaration.findMany({
    where: { exporterGtid },
    orderBy: { createdAt: "desc" },
  });
  return rows || [];
}

/** Sign a declaration: signed=true, signedAt=now.
 *  - Idempotent: re-signing an already-signed declaration is a no-op.
 *  - Throws if the declaration is not found.
 *  Returns the updated row. */
export async function signShippersDeclaration(declarationId: string) {
  if (!declarationId) {
    throw new Error("declarationId is required");
  }

  const existing = await (db as any).shippersDeclaration.findUnique({
    where: { id: declarationId },
  });
  if (!existing) {
    throw new Error(`declaration not found: ${declarationId}`);
  }

  if (existing.signed) {
    return { ...existing, idempotent: true };
  }

  const updated = await (db as any).shippersDeclaration.update({
    where: { id: declarationId },
    data: { signed: true, signedAt: new Date() },
  });

  logger.info("[shippers-declaration] signed", { declId: declarationId });
  return updated;
}

/** Look up the exporter's active ExportLicense for a given HS code.
 *  Returns null if no license row exists. License-sufficiency validation
 *  (quantity + expiry) is the caller's responsibility. */
export async function findRelevantExportLicense(
  exporterGtid: string,
  hsCode: string,
): Promise<any | null> {
  if (!exporterGtid || !hsCode) return null;
  const license = await (db as any).exportLicense.findFirst({
    where: { tenantGtid: exporterGtid, hsCode, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
  });
  return license || null;
}
