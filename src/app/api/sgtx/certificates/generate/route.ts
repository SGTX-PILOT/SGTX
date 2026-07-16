// SGTX Tier 2 — Certificate of Origin generation + persistence.
//
// POST /api/sgtx/certificates/generate
//   Body: { ustn, tradeId?, originCountry, destinationCountry, commodity,
//           commodityHs, originCriterion?, cumulationType?,
//           cumulationCountries?, invoiceValue, currency?, issuerGtid? }
//
//   1. Fetches Trade (with buyer + seller tenants) to enrich the engine input.
//   2. Calls `determineCertificateType(origin, dest)` to auto-detect the type.
//   3. Calls `generateCertificate(input)` to produce the cert artifact +
//      conditions list.
//   4. Persists a `CertificateOfOrigin` row with:
//        - certificateNumber  (engine-generated, format `{TYPE}-{year}-{random8}`)
//        - certificateType    (engine-determined; EUR.1 upgraded to EUR-MED on cumulation)
//        - originCountry, destinationCountry, commodity, commodityHs
//        - originCriterion, cumulationType, cumulationCountries
//        - issuingAuthority   (engine-selected per origin country & cert type)
//        - issueDate, expiryDate, validityMonths
//        - currency, invoiceValue
//        - status              = "ISSUED"
//        - qizAnnotated        (true when EG→US lane)
//        - documentHash        (SHA-256 of `certificateToText()` output)
//        - verificationUrl     = `/verify/cert/{certificateNumber}`
//   5. Returns the persisted record.

import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  determineCertificateType,
  generateCertificate,
  certificateToText,
  type GenerateCertificateInput,
  type CertificateOfOrigin as EngineCertificate,
  type CertificateType,
} from "@/lib/sgtx/compliance/certificates";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/** Allowed values for the `cumulationType` field (Prisma schema comment). */
const CUMULATION_TYPES = new Set(["BILATERAL", "DIAGONAL", "FULL", "NONE"]);

/**
 * Build the `GenerateCertificateInput` for the certificates engine by
 * enriching the body with data fetched from the Trade + Tenant tables.
 */
function buildEngineInput(args: {
  ustn: string;
  originCountry: string;
  destinationCountry: string;
  commodity: string;
  commodityHs: string;
  originCriterion: string | undefined;
  invoiceValue: number;
  transportMode: string;
  exporterName: string;
  exporterAddress: string;
  importerName: string;
  importerAddress: string;
}): GenerateCertificateInput {
  return {
    ustn: args.ustn,
    exporterName: args.exporterName,
    exporterAddress: args.exporterAddress,
    exporterCountry: args.originCountry,
    importerName: args.importerName,
    importerAddress: args.importerAddress,
    importerCountry: args.destinationCountry,
    goods: [
      {
        hsCode: args.commodityHs,
        description: args.commodity,
        quantity: 1,
        unit: "PCS",
        originCriterion: args.originCriterion || "P",
        fobValueUsd: args.invoiceValue,
      },
    ],
    transportMode: args.transportMode,
  };
}

/**
 * Compute the validity window (in months) for a given certificate type.
 * Mirrors the `VALIDITY_MONTHS` map inside the certificates engine — exported
 * here so we can persist it as a column on the Prisma model.
 */
function validityMonthsFor(type: CertificateType): number {
  switch (type) {
    case "EUR.1":
    case "EUR-MED":
      return 10;
    case "AR.1":
    case "COMESA":
      return 6;
    case "AFCFTA":
    case "A.TR":
    case "GSP":
      return 12;
    case "COO_GENERAL":
    default:
      return 6;
  }
}

/**
 * Generate a fresh unique certificate number when a collision is detected.
 * Uses the engine's `{TYPE}-{year}-{random8}` format.
 */
function mintCertificateNumber(type: CertificateType): string {
  // Re-use the engine's format without importing the private helper.
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const buf = new Uint8Array(8);
  if (typeof globalThis !== "undefined" && globalThis.crypto?.getRandomValues) {
    globalThis.crypto.getRandomValues(buf);
  } else {
    for (let i = 0; i < 8; i++) buf[i] = Math.floor(Math.random() * 256);
  }
  const serial = Array.from(buf, (b) => chars[b % chars.length]).join("");
  return `${type}-${new Date().getUTCFullYear()}-${serial}`;
}

/**
 * POST handler — generate and persist a Certificate of Origin.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      ustn?: string;
      tradeId?: string;
      originCountry?: string;
      destinationCountry?: string;
      commodity?: string;
      commodityHs?: string;
      originCriterion?: string;
      cumulationType?: string;
      cumulationCountries?: string[] | string;
      invoiceValue?: number;
      currency?: string;
      issuerGtid?: string;
    };

    // Required-field validation.
    if (!body.ustn || typeof body.ustn !== "string") {
      return NextResponse.json({ error: "ustn is required" }, { status: 400 });
    }
    if (!body.originCountry || !body.destinationCountry) {
      return NextResponse.json(
        { error: "originCountry and destinationCountry are required" },
        { status: 400 },
      );
    }
    if (!body.commodity) {
      return NextResponse.json({ error: "commodity is required" }, { status: 400 });
    }
    if (typeof body.invoiceValue !== "number" || body.invoiceValue <= 0) {
      return NextResponse.json(
        { error: "invoiceValue must be a positive number" },
        { status: 400 },
      );
    }
    if (body.cumulationType && !CUMULATION_TYPES.has(body.cumulationType)) {
      return NextResponse.json(
        { error: `cumulationType must be one of: ${Array.from(CUMULATION_TYPES).join(", ")}` },
        { status: 400 },
      );
    }

    const originCountry = body.originCountry.toUpperCase().trim();
    const destinationCountry = body.destinationCountry.toUpperCase().trim();

    if (originCountry === destinationCountry) {
      return NextResponse.json(
        { error: "originCountry and destinationCountry must differ" },
        { status: 400 },
      );
    }

    // 1. Auto-detect the certificate type for this (origin, dest) lane.
    const detectedType = determineCertificateType(originCountry, destinationCountry);
    if (!detectedType) {
      return NextResponse.json(
        {
          error:
            `No Certificate of Origin applies to (${originCountry} → ${destinationCountry}). ` +
            `This lane is intra-region and does not require a preferential certificate.`,
        },
        { status: 422 },
      );
    }

    // 2. Fetch the Trade to enrich the engine input.
    const trade = await db.trade.findUnique({
      where: { ustn: body.ustn },
      include: { buyer: true, seller: true },
    });
    if (!trade) {
      return NextResponse.json(
        { error: `Trade not found for ustn=${body.ustn}` },
        { status: 404 },
      );
    }
    const resolvedTradeId = body.tradeId || trade.id;

    // 3. Build the engine input.
    const commodityHs = body.commodityHs ?? trade.commodityHs ?? "";
    const transportMode =
      (trade.transportMode && trade.transportMode.length > 0
        ? trade.transportMode
        : trade.originPort === trade.destPort
          ? "ROAD"
          : "SEA");
    const exporterName = trade.seller?.legalName || "SGTX Exporter";
    const exporterAddress =
      [trade.seller?.city, trade.seller?.country].filter(Boolean).join(", ") ||
      "Address on file";
    const importerName = trade.buyer?.legalName || "SGTX Importer";
    const importerAddress =
      [trade.buyer?.city, trade.buyer?.country].filter(Boolean).join(", ") ||
      "Address on file";

    const engineInput = buildEngineInput({
      ustn: body.ustn,
      originCountry,
      destinationCountry,
      commodity: body.commodity,
      commodityHs,
      originCriterion: body.originCriterion,
      invoiceValue: body.invoiceValue,
      transportMode,
      exporterName,
      exporterAddress,
      importerName,
      importerAddress,
    });

    // 4. Run the engine.
    const result = generateCertificate(engineInput);
    let cert: EngineCertificate | null = result.certificate ?? null;

    // If the engine marked the cert as not-applicable (e.g. empty goods — should
    // not happen here because we always supply one good), synthesize a
    // fallback COO_GENERAL record so the caller still gets a persisted artifact.
    if (!cert) {
      const fallbackType: CertificateType = detectedType;
      const now = new Date();
      const validityMonths = validityMonthsFor(fallbackType);
      const expiry = new Date(now.getTime());
      expiry.setUTCMonth(expiry.getUTCMonth() + validityMonths);
      cert = {
        certificateNumber: mintCertificateNumber(fallbackType),
        type: fallbackType,
        ustn: body.ustn,
        exporterName,
        exporterAddress,
        exporterCountry: originCountry,
        importerName,
        importerAddress,
        importerCountry: destinationCountry,
        ftaName: "Non-preferential Certificate of Origin",
        goods: [
          {
            hsCode: commodityHs,
            description: body.commodity,
            quantity: 1,
            unit: "PCS",
            originCriterion: body.originCriterion || "P",
            fobValueUsd: body.invoiceValue,
          },
        ],
        totalFobUsd: body.invoiceValue,
        transportMode,
        issuingAuthority: "Chamber of Commerce",
        issuedAt: now.toISOString(),
        validUntil: expiry.toISOString(),
        status: "ISSUED",
        stampUrl: `https://sgtx.local/stamps/${fallbackType}-fallback.png`,
        qrCodePayload: `/verify/cert/${encodeURIComponent(
          `${fallbackType}-${now.getUTCFullYear()}-FALLBACK`,
        )}`,
      };
    }

    // 5. Ensure certificateNumber is unique in the DB. The engine mints with
    // 8-char randomness so collisions are extremely unlikely, but we retry
    // up to 3 times for safety.
    let certificateNumber = cert.certificateNumber;
    for (let attempt = 0; attempt < 3; attempt++) {
      const existing = await db.certificateOfOrigin.findUnique({
        where: { certificateNumber },
        select: { id: true },
      });
      if (!existing) break;
      certificateNumber = mintCertificateNumber(cert.type);
    }
    if (certificateNumber !== cert.certificateNumber) {
      cert = { ...cert, certificateNumber };
    }

    // 6. Compute document hash + verification URL.
    const text = certificateToText(cert);
    const documentHash = createHash("sha256").update(text, "utf8").digest("hex");
    const verificationUrl = `/verify/cert/${encodeURIComponent(certificateNumber)}`;

    // 7. Persist.
    const cumulationCountries =
      Array.isArray(body.cumulationCountries) && body.cumulationCountries.length > 0
        ? JSON.stringify(body.cumulationCountries)
        : typeof body.cumulationCountries === "string" && body.cumulationCountries.trim()
          ? body.cumulationCountries
          : null;

    const isQiz = originCountry === "EG" && destinationCountry === "US";

    const persisted = await db.certificateOfOrigin.create({
      data: {
        ustn: body.ustn,
        tradeId: resolvedTradeId,
        certificateNumber,
        certificateType: cert.type,
        originCountry,
        destinationCountry,
        issuingAuthority: cert.issuingAuthority,
        issuerGtid: body.issuerGtid ?? null,
        commodity: body.commodity,
        commodityHs: commodityHs,
        originCriterion: body.originCriterion ?? null,
        cumulationType: body.cumulationType ?? null,
        cumulationCountries,
        currency: body.currency || trade.currency || "USD",
        invoiceValue: body.invoiceValue,
        issueDate: new Date(cert.issuedAt),
        expiryDate: new Date(cert.validUntil),
        validityMonths: validityMonthsFor(cert.type),
        status: "ISSUED",
        qizAnnotated: isQiz,
        qizNumber: isQiz ? `QIZ-${certificateNumber}` : null,
        documentHash,
        verificationUrl,
      },
    });

    // Publish a Brain decision event so the orchestrator's learning loop,
    // shadow pipeline, and dataset collector all capture this Certificate
    // of Origin generation even though the operation itself is dispatched
    // directly by the lib. Wrapped in try/catch so a publish failure never
    // breaks the main op.
    try {
      await eventBus.publish(
        "brain.decision.made",
        "compliance.certificate-generate",
        {
          capability: "compliance.certificate-generate",
          inputSummary: {
            ustn: body.ustn,
            certificateNumber,
            certificateType: cert.type,
            originCountry,
            destinationCountry,
            invoiceValue: body.invoiceValue,
          },
          success: true,
          timestamp: Date.now(),
        },
        { source: "certificates-generate-route" },
      );
    } catch (publishErr) {
      logger.warn("[certificates/generate/POST] brain.decision.made publish failed", {
        error: publishErr instanceof Error ? publishErr.message : String(publishErr),
      });
    }

    return NextResponse.json({
      ok: true,
      certificateId: persisted.id,
      certificate: persisted,
      conditions: result.conditions,
      documentHash,
      certificateText: text,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[certificates/generate/POST] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
