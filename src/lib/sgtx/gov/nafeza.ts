// @ts-nocheck
// SGTX Part 7 — Nafeza (Egyptian Customs) Single Window integration client stub.
//
// Nafeza is the Egyptian National Single Window for Foreign Trade (e.g. the ACI
// pre-arrival declaration regime). This module is a TypeScript STUB that
// simulates the outbound calls the SGTX platform would make to Nafeza's REST
// API (mTLS / OAuth2 in production) and records every interaction in the
// `IntegrationConnectorLog` table for audit, retry and observability.
//
// The stubs intentionally never make a real network call — they generate
// deterministic-ish identifiers, log the OUTBOUND payload + simulated response,
// and return a successful result so the platform workflow (Phases 4 → 6) can
// proceed end-to-end in non-production environments.
//
// In production each function below would be wrapped with:
//   - mTLS credentials (Nafeza-issued client certificate + key)
//   - Signed JWT bearer token minted via the Nafeza OAuth2 token endpoint
//   - Idempotency-Key header derived from the SHA-256 of the canonical payload
//   - Exponential backoff retry policy (handled by IntegrationConnectorLog)

import { createHash } from "crypto";
import { db } from "@/lib/db";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** SHA-256 hex digest of a canonicalised payload (used for idempotency keys). */
function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** Stable JSON canonicalisation (sorted keys) so idempotency keys are stable. */
function canonical(obj: unknown): string {
  return JSON.stringify(obj, Object.keys(obj ?? {}).sort());
}

/**
 * Persist an OUTBOUND connector log row.
 *
 * The task spec describes a logical schema of { connectorName, direction,
 * ustn, payload, responseStatus, idempotencyKey } which we map onto the
 * physical `IntegrationConnectorLog` model:
 *   - connectorName → apiName
 *   - direction "OUTBOUND" → encoded into the endpoint prefix
 *   - payload → requestBody
 *   - responseStatus → statusCode + status
 *   - idempotencyKey → SHA-256 of payload (first 32 hex chars, matches
 *     the existing RELEASE_WEBHOOK pattern in src/lib/sgtx/release/index.ts)
 */
async function logOutbound(params: {
  connectorName: string;
  endpoint: string;
  ustn?: string;
  payload: unknown;
  response?: unknown;
  statusCode?: number;
  status?: string;
  errorMessage?: string;
}): Promise<void> {
  const bodyStr = typeof params.payload === "string"
    ? params.payload
    : canonical(params.payload);
  const respStr = params.response === undefined
    ? null
    : (typeof params.response === "string" ? params.response : canonical(params.response));

  // Unique logId — connector name + timestamp + short hash suffix.
  const logId = `LOG-${params.connectorName}-${Date.now()}-${sha256Hex(bodyStr).slice(0, 6)}`;

  try {
    await db.integrationConnectorLog.create({
      data: {
        logId,
        apiName: params.connectorName,
        endpoint: `OUTBOUND ${params.endpoint}`,
        ustn: params.ustn ?? null,
        idempotencyKey: sha256Hex(bodyStr).slice(0, 32),
        requestBody: bodyStr,
        responseBody: respStr,
        statusCode: params.statusCode ?? 200,
        status: params.status ?? "SUCCESS",
        errorMessage: params.errorMessage ?? null,
      },
    });
  } catch (e) {
    // Logging must never break the calling workflow — fail soft.
    logger.error(`[nafeza/logOutbound] failed for ${params.connectorName}:`, e);
  }
}

// ---------------------------------------------------------------------------
// 1. submitDeclaration — file an ACI (Advance Cargo Information) declaration
// ---------------------------------------------------------------------------

export async function submitDeclaration(
  ustn: string,
  declarationData: any
): Promise<{ declarationId: string; status: string; acid?: string }> {
  const declarationId = `NAFEZA-${Date.now()}`;
  const acid = `ACID-${Date.now()}`; // Advance Cargo Information identifier

  const response = {
    declarationId,
    status: "SUBMITTED" as const,
    acid,
    submittedAt: new Date().toISOString(),
  };

  await logOutbound({
    connectorName: "NAFEZA_DECLARATION",
    endpoint: "POST /v1/nafeza/declarations",
    ustn,
    payload: { ustn, declarationData },
    response,
    statusCode: 202,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 2. requestCertificate — request a customs certificate (e.g. Form-D, origin)
// ---------------------------------------------------------------------------

export async function requestCertificate(
  declarationId: string,
  certificateType: string
): Promise<{ certificateId: string; status: string; pdfUrl?: string }> {
  const certificateId = `CERT-${declarationId}-${certificateType.toUpperCase()}-${Date.now().toString(36)}`;
  const pdfUrl = `https://nafeza.gov.eg/certificates/${certificateId}.pdf`;

  const response = {
    certificateId,
    status: "ISSUED" as const,
    pdfUrl,
    issuedAt: new Date().toISOString(),
    certificateType,
  };

  await logOutbound({
    connectorName: "NAFEZA_CERTIFICATE",
    endpoint: `POST /v1/nafeza/declarations/${declarationId}/certificates`,
    payload: { declarationId, certificateType },
    response,
    statusCode: 201,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 3. getDeclarationStatus — poll the declaration lifecycle
// ---------------------------------------------------------------------------

export async function getDeclarationStatus(
  declarationId: string
): Promise<{ status: string; clearanceStatus?: string }> {
  // Simulated deterministic state machine — cycles based on age of declaration id.
  // Production would query GET /v1/nafeza/declarations/{id}.
  const ts = parseInt(declarationId.replace(/^NAFEZA-/, ""), 10) || Date.now();
  const ageMin = Math.max(0, Math.floor((Date.now() - ts) / 60_000));

  let status = "SUBMITTED";
  let clearanceStatus: string | undefined;
  if (ageMin >= 60) {
    status = "ASSESSED";
    clearanceStatus = "PENDING_INSPECTION";
  }
  if (ageMin >= 180) {
    status = "CLEARED";
    clearanceStatus = "CLEARED";
  }

  const response = { declarationId, status, clearanceStatus };

  await logOutbound({
    connectorName: "NAFEZA_STATUS",
    endpoint: `GET /v1/nafeza/declarations/${declarationId}/status`,
    payload: { declarationId },
    response,
    statusCode: 200,
    status: "SUCCESS",
  });

  return response;
}

// ---------------------------------------------------------------------------
// 4. generateSadXml — emit a simplified Single Administrative Document (SAD) XML
// ---------------------------------------------------------------------------

/** Escape XML special characters. */
function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Generate a simplified SAD (Single Administrative Document) XML payload from
 * SGTX trade data. This is NOT a full EU/Egypt SAD — it's a minimal subset
 * carrying the fields Nafeza ACI requires: exporter, importer, HS code, value,
 * currency, gross/net weight, country of origin, container numbers.
 *
 * In production the platform would map the full Trade model to the Nafeza XSD
 * and sign it before submission.
 */
export function generateSadXml(tradeData: any): string {
  const t = tradeData ?? {};
  const items: any[] = Array.isArray(t.items) ? t.items : [];

  const itemsXml = items
    .map(
      (it, i) => `    <LineItem>
      <LineNumber>${i + 1}</LineNumber>
      <HsCode>${xmlEscape(it.hsCode ?? "")}</HsCode>
      <Description>${xmlEscape(it.description ?? "")}</Description>
      <Quantity unit="${xmlEscape(it.unit ?? "KGM")}">${Number(it.quantity ?? 0).toString()}</Quantity>
      <GrossWeight>${Number(it.grossWeightKg ?? 0).toString()}</GrossWeight>
      <NetWeight>${Number(it.netWeightKg ?? 0).toString()}</NetWeight>
      <OriginCountry>${xmlEscape(it.originCountry ?? "")}</OriginCountry>
      <Value currency="${xmlEscape(it.currency ?? "USD")}">${Number(it.value ?? 0).toString()}</Value>
    </LineItem>`
    )
    .join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<SadDocument xmlns="urn:sgtx:nafeza:sad:1.0">
  <Header>
    <Ustn>${xmlEscape(t.ustn ?? "")}</Ustn>
    <DeclarationType>${xmlEscape(t.declarationType ?? "IM")}</DeclarationType>
    <OfficeOfDeclaration>${xmlEscape(t.customsOffice ?? "EGDAM")}</OfficeOfDeclaration>
    <GeneratedAt>${new Date().toISOString()}</GeneratedAt>
  </Header>
  <Parties>
    <Exporter>
      <Name>${xmlEscape(t.exporter?.name ?? "")}</Name>
      <Country>${xmlEscape(t.exporter?.country ?? "")}</Country>
      <TaxId>${xmlEscape(t.exporter?.taxId ?? "")}</TaxId>
    </Exporter>
    <Importer>
      <Name>${xmlEscape(t.importer?.name ?? "")}</Name>
      <Country>${xmlEscape(t.importer?.country ?? "")}</Country>
      <TaxId>${xmlEscape(t.importer?.taxId ?? "")}</TaxId>
    </Importer>
  </Parties>
  <Transport>
    <Mode>${xmlEscape(t.transportMode ?? "SEA")}</Mode>
    <ContainerNumbers>${(Array.isArray(t.containers) ? t.containers : []).map((c: string) => xmlEscape(c)).join(",")}</ContainerNumbers>
    <BillOfLading>${xmlEscape(t.billOfLading ?? "")}</BillOfLading>
  </Transport>
  <Financial>
    <TotalValue currency="${xmlEscape(t.currency ?? "USD")}">${Number(t.totalValue ?? 0).toString()}</TotalValue>
    <Incoterm>${xmlEscape(t.incoterm ?? "CIF")}</Incoterm>
    <Currency>${xmlEscape(t.currency ?? "USD")}</Currency>
  </Financial>
  <Items>
${itemsXml}
  </Items>
</SadDocument>`;

  return xml;
}
