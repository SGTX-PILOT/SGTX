# Task impl-p5-p6-gaps — Part 5 + Part 6 Gaps Implementation

## Summary
Implemented all 7 gaps from the task description: 3 Part 5 endpoints (packing-plan/lock, invoice/generate, customs-declaration/generate), 1 frontend wiring (Lock Packing Plan button), 2 new Prisma models (FeeLock + PaymentAttempt), 2 new Part 6 library modules (fealock.ts, psp-split.ts), 1 existing endpoint update (payment/pay → activates FeeLock), 1 dispute fix (fileDispute → freezeFeeLock), 2 new cron endpoints (late-fee/cron, deferred/cron).

## Files Created
- `prisma/schema.prisma` — added FeeLock + PaymentAttempt models (lines 1677-1723)
- `src/lib/sgtx/payment/fealock.ts` — 175 lines (activateFeeLock, freezeFeeLock, releaseFeeLock, getFeeLock)
- `src/lib/sgtx/payment/psp-split.ts` — 200 lines (processPspSplit with idempotency + validation)
- `src/app/api/sgtx/packing-plan/lock/route.ts` — 200 lines (Loom hash + SSCC-18 inline + Activity log)
- `src/app/api/sgtx/invoice/generate/route.ts` — 140 lines (Invoice row + UBL 2.1 XML via eta.ts)
- `src/app/api/sgtx/customs-declaration/generate/route.ts` — 150 lines (CustomsDeclaration + SAD XML via nafeza.ts)
- `src/app/api/sgtx/payment/late-fee/cron/route.ts` — 120 lines (0.1%/day, capped 100%, priority-90 reminders)
- `src/app/api/sgtx/payment/deferred/cron/route.ts` — 180 lines (3-step escalation + container block + auto-charge)

## Files Modified
- `src/lib/sgtx/dispute/index.ts` — fileDispute now calls freezeFeeLock() from fealock.ts (was direct db.feePaymentRequest.updateMany)
- `src/app/api/sgtx/payment/pay/route.ts` — added activateFeeLock call when Stage 1 settlement completes
- `src/components/portals/PortalContent.tsx` — QuoteBuilderScreen "Lock Packing Plan" button now calls /api/sgtx/packing-plan/lock (was useState no-op)

## Verification
- ESLint: 0 errors, 0 warnings on all 7 touched paths
- `bun run db:push` succeeded
- All endpoints compile + run (curl smoke tests confirm validation + DB step reached)
- DB writes fail only with pre-existing sandbox "readonly database" env issue (identical to existing endpoints)
- Cron endpoints return success with processed:0 (no matching records in DB — correct)

## Key Design Decisions
1. **Inlined SSCC-18 generator** in packing-plan/lock instead of self-HTTP-calling /api/sgtx/barcodes/generate — keeps the route atomic + avoids a circular HTTP dependency.
2. **FeeLock status lifecycle**: PENDING → ACTIVE → (DISPUTED | RELEASED | CANCELLED). activateFeeLock is idempotent (returns existing ACTIVE lock without re-creating). freezeFeeLock is idempotent (returns existing DISPUTED lock).
3. **processPspSplit idempotency**: keyed on pspTransactionId. If a SUCCEEDED PaymentAttempt with the same txn ID exists, returns it without re-processing.
4. **Dispute fix preserves backwards compat**: still calls db.feePaymentRequest.updateMany to set feeLockStatus=FROZEN on legacy field, in addition to the new freezeFeeLock() call.
5. **Late fee cron**: 1 LateFeeEvent per day (idempotent via existingEvents count check). Cap at 100% of original fee.
6. **Deferred cron**: 3-step escalation tracked via `expiryActionTaken` field (reminded | alerted | expired_charged | expired_blocked). Container release blocked via releaseStatus=HOLD + holdReason=MANDATORY_PAYMENT_PENDING.
7. **Tenant taxId**: Tenant model has no `taxId` field, so invoice/customs endpoints derive a stable 10-char hex from `sha256(gtid).slice(0,10).toUpperCase()` (clearly commented).
