# Task: impl-p8-p10-gaps — Part 8 (Container Release) + Part 10 (TRI/Disputes) gap implementation

## Scope
8 gaps spanning Part 8 (Container Release Authorisation API) and Part 10 (Dispute Management & Reputation Engine):
1. Add 6 missing hold reasons to queryReleaseAuthorisation
2. Add USED + EXPIRED lifecycle states
3. Add autoRevokeOnEvent() + POST /api/sgtx/release/auto-revoke endpoint
4. Add rate limiting to /api/sgtx/release/authorization (60/min terminal, 30/min IP, 429+Retry-After)
5. Fix calculateTri() to use real DB queries (remove Math.random)
6. Create POST /api/sgtx/tri/cron (recalculate TRI for all TRD tenants)
7. Fix FeeLock freeze on dispute filing (use freezeFeeLock + direct FeePaymentRequest update)
8. Create GET /api/sgtx/tri/privileges (Premier/Advanced/Limited privileges)

## Files Modified
- src/lib/sgtx/release/index.ts — added 6 hold reasons, USED/EXPIRED lifecycle, autoRevokeOnEvent, defensive milestone
- src/lib/sgtx/dispute/index.ts — FeeLock freeze fix, complete calculateTri rewrite, courtesy TS fixes
- src/app/api/sgtx/release/authorization/route.ts — added in-memory rate limiter

## Files Created
- src/app/api/sgtx/release/auto-revoke/route.ts — POST endpoint for auto-revoke
- src/app/api/sgtx/tri/cron/route.ts — POST endpoint for daily TRI recalculation
- src/app/api/sgtx/tri/privileges/route.ts — GET endpoint for TRI-based privileges

## Notes for Other Agents
- PaymentAttempt model is NOT in our schema. calculateTri uses FeePaymentRequest (closest analog with dueDate+paidAt+status) for settlementReliability.
- Dispute model has no resolvedAt field; calculateTri uses updatedAt as proxy for resolution timestamp (only on RESOLVED disputes).
- The Milestone Prisma model does not exist; recordGateOut wraps the milestone creation in try/catch + (db as any).milestone?.create to degrade gracefully.
- src/lib/sgtx/payment/fealock.ts was concurrently created by impl-p30-tcn agent — fileDispute now uses freezeFeeLock() from there.
- All rate-limit state is in-memory (Maps). Won't survive server restarts but is sufficient for the 60s window.
- Rate limit buckets: terminalKey = terminal_id query param OR IP (fallback); ipKey = x-forwarded-for first IP OR x-real-ip OR "unknown".

## Verification
- ESLint (required command): 0 errors, 0 warnings on all 4 directories
- TypeScript: 0 new errors in modified files (5 pre-existing errors fixed as courtesy)
- Live curl tests: privileges endpoint returns Premier Trusted (908) → GREEN lane; rate limiter returns 429 + Retry-After:60 after 30 rapid requests; auto-revoke + cron endpoints reach DB layer (only fail on sandbox readonly DB which is environmental, not code)
