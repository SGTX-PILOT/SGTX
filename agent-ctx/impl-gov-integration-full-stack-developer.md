# Task impl-gov-integration — Work Record

**Agent**: full-stack-developer
**Task ID**: impl-gov-integration
**Task**: Implement Part 7 government integration client stubs (Nafeza, CargoX, ETA, CBE)

## Context review
- Read `/home/z/my-project/worklog.md` — confirmed SGTX project, Part 7 reference, schema models
  `IntegrationConnectorLog` (lines 973–989) and `BankSettlementInstruction` (lines 991–1010) already
  exist from the Batch 2 schema push.
- Read existing `src/lib/sgtx/release/index.ts` to learn the established pattern for
  `db.integrationConnectorLog.create()` (apiName, endpoint, ustn, idempotencyKey, requestBody,
  responseBody, statusCode, status) — this matches the schema exactly and is what the platform uses
  for outbound webhook logging.
- Read existing `src/app/api/sgtx/distressed/declare/route.ts` to learn the route conventions
  (NextRequest, NextResponse, validation patterns, try/catch with console.error, 400/500 status).

## Schema mapping decision
The task spec described a logical schema { connectorName, direction, payload, responseStatus,
idempotencyKey }. The physical `IntegrationConnectorLog` model uses different field names. I made
the explicit mapping:
- `connectorName` → `apiName`
- `direction "OUTBOUND"` → encoded into the `endpoint` field as `OUTBOUND ${endpoint}` prefix
- `payload` (JSON) → `requestBody` (stringified canonical JSON)
- `responseStatus` → `statusCode` (HTTP code) + `status` (string)
- `idempotencyKey` → SHA-256 hex of canonicalised payload, sliced to 32 chars (matches the
  RELEASE_WEBHOOK pattern in `release/index.ts` line 187)

## Files created (5 lib + 7 routes = 12 files)

### Lib (5 files)
1. `src/lib/sgtx/gov/nafeza.ts` — Nafeza customs client stub
   - `submitDeclaration(ustn, declarationData)` → declaration ID `NAFEZA-${Date.now()}`, ACID,
     status "SUBMITTED", logs OUTBOUND
   - `requestCertificate(declarationId, certificateType)` → certificate ID, pdfUrl, status "ISSUED",
     logs OUTBOUND
   - `getDeclarationStatus(declarationId)` → age-based state machine (SUBMITTED → ASSESSED → CLEARED),
     logs OUTBOUND
   - `generateSadXml(tradeData)` → simplified SAD XML (Header, Parties, Transport, Financial, Items
     with HS code, weights, origin, value)
2. `src/lib/sgtx/gov/cargox.ts` — CargoX document notarization stub
   - `submitDocument(ustn, documentHash, documentType)` → ACID, blockchain seal (SHA-256 of
     txHash|acid|documentHash), status "NOTARIZED"
   - `getDocumentStatus(acid)` → verified: true, timestamp, confirmations: 12
   - `verifyDocument(documentHash, blockchainSeal)` → format validation + cross-check round-trip
     (synchronous, no DB needed)
3. `src/lib/sgtx/gov/eta.ts` — ETA e-invoice client stub
   - `submitInvoice(ustn, invoiceData)` → randomUUID, simplified QR (base64 JSON), status "ACCEPTED"
   - `generateUblXml(invoiceData)` → UBL 2.1 Invoice XML (cac + cbc namespaces, supplier/customer,
     TaxTotal, LegalMonetaryTotal, InvoiceLine)
   - `getInvoiceStatus(uuid)` → status "ACCEPTED", acceptedAt
   - `generateInvoiceQr(invoiceData)` → simplified base64 JSON QR payload (NOT real TLV — clearly
     marked as stub)
4. `src/lib/sgtx/gov/cbe.ts` — CBE FX/settlement stub
   - `getFxRate(from, to)` → static CBE_FX_RATES map (USD/EGP=48.5, EUR/EGP=52.3, GBP/EGP=61.4,
     SAR/AED/CNY/JPY/CHF-EGP, plus USD cross-rate fallback for unknown pairs)
   - `createSettlementInstruction(ustn, amount, currency, beneficiaryIban)` → creates
     `db.bankSettlementInstruction.create()` row (status "PENDING"), logs OUTBOUND, returns
     instructionId
   - `getSettlementStatus(instructionId)` → looks up the persisted row, returns status + settledAt
5. `src/lib/sgtx/gov/index.ts` — barrel re-export `export * from "./{nafeza,cargox,eta,cbe}"`

### Routes (7 files)
1. `POST /api/sgtx/gov/nafeza/declare/route.ts` — calls `submitDeclaration`, optional SAD XML
   generation via `generateSadXml`
2. `POST /api/sgtx/gov/nafeza/certificate/route.ts` — calls `requestCertificate`
3. `POST /api/sgtx/gov/cargox/submit/route.ts` — calls `submitDocument` (validates SHA-256 format)
4. `GET /api/sgtx/gov/cargox/verify/route.ts` — calls `getDocumentStatus` (if `?acid=`) OR
   `verifyDocument` (if `?documentHash=&blockchainSeal=`)
5. `POST /api/sgtx/gov/eta/invoice/route.ts` — calls `submitInvoice`, optional `generateUbl`
   flag to also return UBL XML; always returns decoded QR payload
6. `GET /api/sgtx/gov/cbe/fx-rate/route.ts` — calls `getFxRate(from, to)`
7. `POST /api/sgtx/gov/cbe/settlement/route.ts` — calls `createSettlementInstruction` (validates
   positive amount, required fields, normalises IBAN whitespace)

## Verification
- `cd /home/z/my-project && npx eslint src/lib/sgtx/gov/ src/app/api/sgtx/gov/` → EXIT 0, 0 errors,
  0 warnings (verified twice).
- `npx tsc --noEmit` (project-wide) → zero errors in any `sgtx/gov` file. Fixed one initial TS
  error in `cargox/verify/route.ts` (was reading `result.acid` which doesn't exist on the
  `getDocumentStatus` return type — changed to use the local `acid` variable instead).
- Pre-existing TS errors elsewhere in the project (disputes/prediction, financing/liquidation-alerts,
  governor/constitutional-addons, etc.) are NOT introduced by this task — they were present before.
- Dev log checked — no errors related to gov routes. Dev server was slow on first compile of new
  routes (Turbopack), which is environmental and not a code issue.

## Stage Summary
- 4 government-integration client stub modules created under `src/lib/sgtx/gov/` (Nafeza, CargoX,
  ETA, CBE) + 1 barrel `index.ts`.
- 13 functions exported total: 3 Nafeza + 3 CargoX + 4 ETA + 3 CBE = 13. Every outbound function
  logs to `IntegrationConnectorLog` with connectorName (apiName), direction (OUTBOUND prefix in
  endpoint), ustn, payload (canonical JSON), responseStatus (statusCode + status), and
  idempotencyKey (SHA-256 of payload, sliced to 32 hex chars — matching the existing RELEASE_WEBHOOK
  pattern in `src/lib/sgtx/release/index.ts`).
- 7 API routes created under `src/app/api/sgtx/gov/`: nafeza/declare, nafeza/certificate,
  cargox/submit, cargox/verify (GET), eta/invoice, cbe/fx-rate (GET), cbe/settlement.
- CBE `createSettlementInstruction` persists a real `BankSettlementInstruction` row (status
  PENDING) so downstream settlement status polling has a real DB row to look up.
- All routes follow established conventions: NextRequest/NextResponse, try/catch with
  console.error prefixed by route tag, 400 for validation errors with explicit missing-field list,
  500 for internal errors.
- All stubs are clearly marked as stubs in module headers — production callers know they need to
  swap in real mTLS/OAuth2/signed XML/blockchain implementations before going live.
- ESLint: 0 errors, 0 warnings. TypeScript: 0 errors in any new file.
