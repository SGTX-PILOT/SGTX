# impl-p6 — full-stack-developer

## Task
Implement Part 6 of the SGTX blueprint: One-Click Payment Orchestration & FeeLock state machine.

## Scope delivered
1. **Prisma schema** — Added 3 new models to `prisma/schema.prisma`:
   - `FeeLock` (status PENDING|ACTIVE|FROZEN|RELEASED|EXPIRED, kvVersion mirroring NATS KV revisions, frozenReason, activatedAt/frozenAt/releasedAt timestamps)
   - `PaymentAttempt` (idempotencyKey @unique per Part 6.12, stage STAGE1|STAGE2, pspProvider FAWRY|PAYMOB|STRIPE|CBE_IPN, status PENDING|PROCESSING|COMPLETED|FAILED|REFUNDED, splitJson)
   - `FeeCalculation` (audit trail of every fee computation)
   - Ran `bun run db:push` — schema synced, Prisma client regenerated.

2. **Library files** under `src/lib/sgtx/payment/`:
   - `fealock.ts` — FeeLock state machine. 6 exported functions:
     - `createFeeLock(ustn, tradeId, totalAmount, sgtxFee, providerFees)` → PENDING (idempotent if non-terminal lock already exists)
     - `activateFeeLock(ustn)` → PENDING → ACTIVE (mirrors to FeePaymentRequest.feeLockStatus for backward compat)
     - `freezeFeeLock(ustn, reason)` → ACTIVE → FROZEN (Smart Inbox alert)
     - `releaseFeeLock(ustn)` → FROZEN/ACTIVE → RELEASED
     - `expireFeeLock(ustn)` → PENDING → EXPIRED (Part 6.8.2 deferred guarantee)
     - `getFeeLockStatus(ustn)` / `checkFeeLockActive(ustn)` (used by release authorization API)
   - `psp-split.ts` — PSP split instruction generator + payment orchestrator:
     - `calculateStage1Fees(ustn)` → returns { sgtxFee, customsFee, quarantineFee, nfsaFee, chamberFee, labFee, brokerFee, lspFee, portFee, cargoxFee, insuranceFee, total, tradeValueUsd, containerCount, originCountry } (queries Trade + accepted ServiceQuotations + LabTest + CustomsDeclaration)
     - `calculateStage2Fees(ustn)` → ocean freight + destination THC + import clearance (incoterm-aware)
     - `generateSplitInstruction(ustn, stage)` → full Part 6.1.3 JSON with payee_gtid + amount + description + iban + account + bic + type + stage
     - `generateIdempotencyKey(body)` → SHA256(canonical_body + utc_second) per Part 6.12
     - `selectOptimalPsp(country, amount, currency)` → A2 LightGBM-simulated router with fallback chain
     - `processPspSplit(ustn, stage, pspProvider)` → creates PaymentAttempt (idempotent), simulates PSP processing, activates FeeLock on success, persists FeeCalculation, sends Smart Inbox
   - `reconciliation.ts` — Reconciliation engine:
     - `reconcilePayment(ustn, bankStatementData)` → matches bank lines against PaymentAttempt with confidence scoring (USTN pattern +50, amount +30, currency +10, date +10; ≥90 auto-reconciled). Detects AMOUNT_MISMATCH / DUPLICATE_PAYMENT / ORPHAN_PAYMENT / MISSING_PAYMENT discrepancies. Creates Smart Inbox alert for unmatched lines.
     - `generateReconciliationReport(ustn)` → on-disk snapshot when no bank data provided.

3. **API routes** under `src/app/api/sgtx/payment/`:
   - `POST /api/sgtx/payment/calculate` — body { ustn } → Stage 1 + Stage 2 + grand_total
   - `POST /api/sgtx/payment/pay` — body { ustn, stage, pspProvider } → processes PSP split, activates FeeLock
   - `GET  /api/sgtx/payment/status?ustn=...` → FeeLock + PaymentAttempt[] + FeeCalculation[]
   - `POST /api/sgtx/payment/fealock/freeze` — body { ustn, reason } → ACTIVE → FROZEN
   - `POST /api/sgtx/payment/fealock/release` — body { ustn } → FROZEN/ACTIVE → RELEASED
   - `GET  /api/sgtx/payment/breakdown?ustn=...` → per-payee split JSON with IBAN/account/BIC
   - `POST /api/sgtx/payment/reconcile` — body { ustn, bankStatementData } → reconciliation report

4. **Release authorization wiring** — Updated `src/lib/sgtx/release/index.ts`:
   - Replaced simulated `stage1?.feeLockStatus === "ACTIVE"` check with real `checkFeeLockActive(ustn)` call.
   - Added FROZEN-state branch returning HOLD with reason `FEELOCK_FROZEN` (Part 6.6.3 dispute impact).
   - Backward compat: falls back to PaymentAttempt.splitJson for unpaid_invoices list when no FeePaymentRequest row exists.

5. **Side-fix** — `src/lib/sgtx/portal-config.ts`: lucide-react no longer exports `FlaskBeaker`. Aliased to `FlaskConical as FlaskBeaker`. This was blocking the entire Next.js dev server with 500 errors.

## Verification
All 7 endpoints smoke-tested end-to-end via curl against the seeded strawberry-export USTN `SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4` (tradeValue $100k, 2 containers, CIF):
- `calculate` → Stage1 $3,475 + Stage2 $8,400 = grand_total $11,875 ✓
- `pay` (FAWRY, STAGE1) → PaymentAttempt COMPLETED, FeeLock ACTIVE, kvVersion 2, idempotencyKey returned ✓
- `status` → returns FeeLock + PaymentAttempt + FeeCalculation ✓
- `fealock/freeze` → ACTIVE → FROZEN with reason ✓
- `fealock/release` → FROZEN → RELEASED ✓
- `breakdown` → 11 payees with IBAN/account/BIC ✓
- `reconcile` → bank line matched to PaymentAttempt with confidence 100 (ustn_reference + amount + currency + date_window) ✓

## Final lint
```
bun run db:push        → ✔ schema synced, Prisma client regenerated
npx eslint src/lib/sgtx/payment/ src/app/api/sgtx/payment/ → exit 0 (zero errors)
```

## Files created/modified
- `prisma/schema.prisma` (added 3 models, +45 lines)
- `src/lib/sgtx/payment/fealock.ts` (new, 199 lines)
- `src/lib/sgtx/payment/psp-split.ts` (new, 281 lines)
- `src/lib/sgtx/payment/reconciliation.ts` (new, 295 lines)
- `src/app/api/sgtx/payment/calculate/route.ts` (new)
- `src/app/api/sgtx/payment/pay/route.ts` (new)
- `src/app/api/sgtx/payment/status/route.ts` (new)
- `src/app/api/sgtx/payment/fealock/freeze/route.ts` (new)
- `src/app/api/sgtx/payment/fealock/release/route.ts` (new)
- `src/app/api/sgtx/payment/breakdown/route.ts` (new)
- `src/app/api/sgtx/payment/reconcile/route.ts` (new)
- `src/lib/sgtx/release/index.ts` (modified — wired in checkFeeLockActive + FROZEN branch)
- `src/lib/sgtx/portal-config.ts` (side-fix — FlaskBeaker → FlaskConical alias)
