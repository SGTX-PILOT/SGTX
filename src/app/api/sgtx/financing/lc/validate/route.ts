// SGTX Tier 2 — UCP 600 Document Pre-Validation API.
//
// POST /api/sgtx/financing/lc/validate
//   Body: { letterOfCreditId, documents: LcDocument[] }
//
//   1. Fetches the `LetterOfCredit` record by ID.
//   2. Maps it to the `LcTerms` interface (the shape the UCP 600 engine expects).
//   3. Calls `validateLcDocuments(lcTerms, documents)` from the rules engine.
//   4. Persists the validation result back onto the L/C row:
//        - lastValidationAt = now
//        - lastValidationResult = JSON { verdict, discrepancies, warnings, examinationNotes, examinedAt }
//        - discrepancyCount  = number of 'discrepant' findings
//   5. Returns { verdict, discrepancies, warnings, examinationNotes, examinedAt }.

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import {
  validateLcDocuments,
  type LcTerms,
  type LcDocument,
  type LcDocumentType,
  type Discrepancy,
} from "@/lib/sgtx/compliance/ucp600";
import { eventBus } from "@/lib/sgtx/brain-os";

export const dynamic = "force-dynamic";

/** Allowed document-type strings (mirror of `LcDocumentType` in ucp600.ts). */
const ALLOWED_DOC_TYPES = new Set<LcDocumentType>([
  "commercial_invoice",
  "bill_of_lading",
  "air_waybill",
  "insurance",
  "certificate_of_origin",
  "inspection_certificate",
  "packing_list",
  "other",
]);

/** Shape of each element in the `documents` array of the POST body. */
interface IncomingDocument {
  type?: string;
  content?: string;
  signed?: boolean;
  dated?: string;
  issuer?: string;
  issuedTo?: string;
  original?: boolean | number;
  currency?: string;
  amount?: number;
  portOfLoading?: string;
  portOfDischarge?: string;
  docId?: string;
  data?: Record<string, unknown>;
}

/**
 * Coerce a possibly-unknown document-type string into the typed union
 * accepted by the UCP 600 engine. Unknown values default to `"other"`.
 */
function coerceDocType(raw: unknown): LcDocumentType {
  if (typeof raw === "string" && ALLOWED_DOC_TYPES.has(raw as LcDocumentType)) {
    return raw as LcDocumentType;
  }
  return "other";
}

/**
 * Map an incoming body document to the `LcDocument` shape used by the engine.
 *
 * The body uses the spec's simplified fields (`content`, `signed`, `dated`,
 * `issuer`, `original`) — we project those onto the engine's richer schema
 * (with `data.content` preserved so refusal-notice wording can quote it).
 */
function mapDocument(doc: IncomingDocument): LcDocument {
  const originalCount =
    typeof doc.original === "number"
      ? doc.original
      : doc.original === true
        ? 1
        : undefined;

  return {
    type: coerceDocType(doc.type),
    docId: doc.docId,
    issuedBy: doc.issuer,
    issuedTo: doc.issuedTo,
    date: doc.dated,
    currency: doc.currency,
    amount: typeof doc.amount === "number" ? doc.amount : undefined,
    portOfLoading: doc.portOfLoading,
    portOfDischarge: doc.portOfDischarge,
    originalCount,
    signed: doc.signed === true,
    data: { ...(doc.data ?? {}), content: doc.content ?? "" },
  };
}

/**
 * Map a persisted `LetterOfCredit` row to the `LcTerms` interface.
 *
 * `requiredDocuments` is stored as a JSON string on the Prisma model; we parse
 * it back into an array (falling back to an empty array on parse failure).
 */
function mapLcTerms(lc: {
  lcNumber: string;
  applicantName: string;
  applicantAddress: string | null;
  beneficiaryName: string;
  beneficiaryAddress: string | null;
  currency: string;
  amount: number;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  latestShipmentDate: Date | null;
  expiryDate: Date;
  requiredDocuments: string;
  partialShipments: string;
  transshipments: string;
}): LcTerms {
  let requiredDocuments: string[] = [];
  try {
    const parsed = JSON.parse(lc.requiredDocuments || "[]");
    if (Array.isArray(parsed)) {
      requiredDocuments = parsed.map((s) => String(s));
    }
  } catch {
    requiredDocuments = [];
  }

  return {
    lcNumber: lc.lcNumber,
    applicantName: lc.applicantName,
    applicantAddress: lc.applicantAddress ?? undefined,
    beneficiaryName: lc.beneficiaryName,
    beneficiaryAddress: lc.beneficiaryAddress ?? undefined,
    currency: lc.currency,
    amount: lc.amount,
    portOfLoading: lc.portOfLoading ?? undefined,
    portOfDischarge: lc.portOfDischarge ?? undefined,
    latestShipmentDate: lc.latestShipmentDate
      ? lc.latestShipmentDate.toISOString().slice(0, 10)
      : undefined,
    expiryDate: lc.expiryDate.toISOString().slice(0, 10),
    requiredDocuments,
    partialShipmentAllowed: lc.partialShipments === "ALLOWED",
    transshipmentAllowed: lc.transshipments === "ALLOWED",
  };
}

/**
 * Compute the overall verdict of a validation run.
 *
 *   - "COMPLIANT" — zero discrepancies and zero warnings (clean presentation).
 *   - "WARNING"   — zero discrepant findings, but ≥1 warning.
 *   - "DISCREPANT" — ≥1 discrepant finding (will cause a bank refusal under Art. 16).
 */
function computeVerdict(discrepancies: Discrepancy[]): "COMPLIANT" | "WARNING" | "DISCREPANT" {
  const discrepant = discrepancies.filter((d) => d.severity === "discrepant").length;
  const warnings = discrepancies.filter((d) => d.severity === "warning").length;
  if (discrepant > 0) return "DISCREPANT";
  if (warnings > 0) return "WARNING";
  return "COMPLIANT";
}

/**
 * POST handler — validate L/C documents against UCP 600.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      letterOfCreditId?: string;
      documents?: IncomingDocument[];
    };

    if (!body.letterOfCreditId) {
      return NextResponse.json(
        { error: "letterOfCreditId is required" },
        { status: 400 },
      );
    }
    if (!Array.isArray(body.documents)) {
      return NextResponse.json(
        { error: "documents must be an array" },
        { status: 400 },
      );
    }

    const lc = await db.letterOfCredit.findUnique({
      where: { id: body.letterOfCreditId },
    });
    if (!lc) {
      return NextResponse.json(
        { error: `Letter of Credit ${body.letterOfCreditId} not found` },
        { status: 404 },
      );
    }

    const terms = mapLcTerms(lc);
    const documents = body.documents.map(mapDocument);
    const result = validateLcDocuments(terms, documents);

    const discrepancies: Discrepancy[] = result.discrepancies;
    const warnings = discrepancies.filter((d) => d.severity === "warning");
    const verdict = computeVerdict(discrepancies);
    const discrepancyCount = discrepancies.filter((d) => d.severity === "discrepant").length;

    const persistedPayload = {
      verdict,
      cleanPresentation: result.cleanPresentation,
      discrepancies,
      warnings,
      examinationNotes: result.examinationNotes,
      examinedAt: result.examinedAt,
    };

    await db.letterOfCredit.update({
      where: { id: lc.id },
      data: {
        lastValidationAt: new Date(result.examinedAt),
        lastValidationResult: JSON.stringify(persistedPayload),
        discrepancyCount,
      },
    });

    // Publish a Brain decision event so the orchestrator's learning loop,
    // shadow pipeline, and dataset collector all capture this UCP 600 L/C
    // document validation even though the operation itself is dispatched
    // directly by the lib. Wrapped in try/catch so a publish failure never
    // breaks the main op.
    try {
      await eventBus.publish(
        "brain.decision.made",
        "compliance.ucp600-validate",
        {
          capability: "compliance.ucp600-validate",
          inputSummary: {
            letterOfCreditId: lc.id,
            lcNumber: lc.lcNumber,
            documentCount: documents.length,
            verdict,
            discrepancyCount,
          },
          success: true,
          timestamp: Date.now(),
        },
        { source: "financing-lc-validate-route" },
      );
    } catch (publishErr) {
      logger.warn("[lc/validate/POST] brain.decision.made publish failed", {
        error: publishErr instanceof Error ? publishErr.message : String(publishErr),
      });
    }

    return NextResponse.json({
      ok: true,
      letterOfCreditId: lc.id,
      lcNumber: lc.lcNumber,
      verdict,
      cleanPresentation: result.cleanPresentation,
      discrepancies,
      warnings,
      examinationNotes: result.examinationNotes,
      examinedAt: result.examinedAt,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    logger.error("[lc/validate/POST] error:", { msg, raw: String(e) });
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
