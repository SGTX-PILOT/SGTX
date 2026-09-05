# SGTX Security Audit — API Endpoint Authorization + Credential Scan

**Task ID:** AUDIT-3
**Date:** 2025-09-04
**Scope:** `src/app/api/sgtx/**` (1,351 routes), `src/middleware.ts`, `src/lib/v1/auth.ts`, `prisma.config.ts`, `src/lib/db.ts`, `src/lib/db-fresh.ts`, `src/lib/sgtx/ai/providers.ts`, `scripts/**`
**Method:** Sample-based audit (40 routes across 4 categories) + pattern detection + credential grep
**Mode:** Research-only — NO code changes made.

---

## EXECUTIVE SUMMARY

**Verdict:** The platform has a hardened **perimeter** (JWT verification, CSRF, rate limiting, security headers) but **systematically absent route-level authorization**. The middleware trusts JWT identity but route handlers almost universally trust tenant identity from the request **body** rather than from the verified session. Combined with:

1. A **P0 production database credential (Turso JWT)** committed in plaintext to git in **31 files**, including the live Prisma client and 6 backup scripts.
2. A **P0 universal backdoor password** (`"sgtx-demo"`) accepted in production for any employee without a stored password hash.
3. A **P0 dev-mode auth bypass** in middleware — any non-`production` `NODE_ENV` makes every protected route reachable with no token at all.
4. A massive **public-route surface** (≈700 routes in `PUBLIC_ROUTES` + `isPublicPattern()` catch-all) covering financial mutations, customs filings, and constitutional amendments.

| Severity | Count | Description |
|----------|-------|-------------|
| **P0 — Critical / actively exploitable** | **5** | Live secrets in git, backdoor password, dev-mode auth bypass, missing auth on admin impersonation, missing auth on constitutional module reload |
| **P1 — High / class-wide issue** | **4** | Body-supplied tenant identity (no session-binding), missing canonical Loom events on mutations, missing idempotency on financial mutations, broad `isPublicPattern()` catch-all |
| **P2 — Medium / defense-in-depth gap** | **3** | Dev fallback secrets, in-memory rate limiter (per-instance, not Redis), demo portal placeholders (`whsec_stripe_sim_v1`) |

---

## PART A — Endpoint Authorization Audit (40 sampled routes)

### A.0 Perimeter understanding

`src/middleware.ts` (1,289 lines) implements:

1. **JWT verification** (Edge Web Crypto HMAC-SHA256) for any route not in `PUBLIC_ROUTES` and not matched by `isPublicPattern()`.
2. **CSRF check** — `X-CSRF-Token` header must equal the JWT's `csrf` claim, for all state-changing methods on protected, non-auth-bootstrap routes.
3. **Rate limiting** — two in-memory Maps: 50 req/min anonymous API, 200 req/min authenticated API, 200/600 req/min anonymous/authenticated pages.
4. **Cron secret** (`CRON_SECRET`) check for `/api/sgtx/*cron` routes.
5. **Identity injection** — `x-tenant-gtid`, `x-employee-id`, `x-role`, `x-mfa-verified` headers set on protected routes from the verified JWT.

`src/lib/v1/auth.ts` provides:
- `signToken` / `verifyToken` (HMAC-SHA256 JWT, in-memory revocation list by `jti`)
- `generateCsrfToken` / `validateCsrfToken`
- `hashPassword` / `verifyPassword` (PBKDF2-SHA256, 100k iters)
- `verifyTotp` (RFC 6238)
- Production fail-fast: `requireSecret("SGTX_SESSION_SECRET", ...)` throws if env var missing or <32 chars when `NODE_ENV=production`.

`src/lib/api-error.ts` provides a recommended (not enforced) `ApiError` + `errorResponse` pattern with `correlationId` and stack-trace masking.

### A.1 Critical perimeter weaknesses

**1. Dev-mode auth bypass (lines 973–980 of middleware.ts):**
```ts
if (!token) {
  if (isProd) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }
  // Dev mode: allow with warning header (for demo flow compatibility)
  response.headers.set("X-Auth-Warning", "no-auth-token-dev");
  return response;     // ← request proceeds WITHOUT a verified JWT
}
```
If `NODE_ENV !== "production"` (e.g., unset, "development", "staging", "preview", "test"), **every** protected route is reachable with no token at all. Vercel preview deployments, CI, and any misconfigured prod environment are wide open. The middleware sets the `X-Auth-Warning` header but does NOT inject `x-tenant-gtid` — so route handlers that read that header will silently fall through to body-supplied identity.

**2. `isPublicPattern()` catch-all (lines 1099–1208 of middleware.ts):**
A regex/path-prefix function that whitelists **entire route trees** as public, regardless of method:

```ts
if (path.startsWith("/api/sgtx/transport/"))  return true;   // 60+ routes
if (path.startsWith("/api/sgtx/finance/"))    return true;   // 70+ routes
if (path.startsWith("/api/sgtx/completion/")) return true;   // 60+ routes
if (path.startsWith("/api/sgtx/integrations/")) return true; // 50+ routes
if (path.startsWith("/api/sgtx/regulatory/")) return true;   // 30+ routes
if (path.startsWith("/api/sgtx/readiness/"))  return true;   // 20+ routes
if (path.startsWith("/api/sgtx/constitutional/")) return true; // 30+ routes
```

These include high-stakes mutations:
- `/api/sgtx/finance/payments/[id]/reverse` (reversal of settled payments)
- `/api/sgtx/finance/guarantees/[id]/call` (calling a bank guarantee)
- `/api/sgtx/finance/insurance/[id]/claim` (filing an insurance claim)
- `/api/sgtx/finance/lc-lifecycles/[id]/pay` (paying out a letter of credit)
- `/api/sgtx/completion/claims/[id]/accept` (accepting a claim)
- `/api/sgtx/constitutional/settlement/submit/[instructionId]` (settlement submission)
- `/api/sgtx/constitutional/exposure/reopen` (reopening financial exposure)
- `/api/sgtx/constitutional/bank-gateway/[id]/process` (bank gateway processing)

All reachable with NO JWT check — only the 50 req/min anonymous API bucket applies.

**3. Tenant identity is sourced from the request body, not the verified session, in essentially every sampled route.**
The middleware sets `x-tenant-gtid` from the JWT `tenantGtid` claim, but only one sampled route (`/api/sgtx/trade` GET — Fix 1 IDOR check) actually reads it. The other 39 sampled routes read `buyerGtid`, `sellerGtid`, `signerGtid`, `actorGtid`, `payerGtid`, `brokerGtid`, `issuedBy`, `closedBy`, `requestedByGtid`, `approverGtid`, or `adminGtid` from `await req.json()`. There is no comparison to the session's tenant GTID. A logged-in buyer can act as any seller, a non-broker can submit customs declarations under any broker GTID, and a non-admin can invoke admin impersonation logging.

### A.2 40-route sample

#### Trade mutations (10)

| # | Route | Methods | Auth checked | Tenant from session | Canonical event (Loom) | Idempotency | Risk |
|---|-------|---------|--------------|---------------------|-------------------------|-------------|------|
| 1 | `src/app/api/sgtx/trade/route.ts` | GET | Middleware JWT (protected) + **in-route IDOR check** (reads `x-tenant-gtid` from header) | YES (only route in sample that does) | No (only `eventBus.publish` brain-os) | N/A (read) | P2 |
| 2 | `src/app/api/sgtx/trade/list/route.ts` | GET | Middleware JWT (protected) | No — optional `?tenant=` query | No | N/A (read) | P1 — any tenant can list ALL trades by omitting `?tenant=` (comment admits "GOV portal passes its own GTID but is typically not a trade party, so when no matches exist the route returns all trades for monitoring purposes") |
| 3 | `src/app/api/sgtx/trade/modify-schedule/route.ts` | POST | Middleware JWT (protected) | No — body supplies `requestedByGtid` (any value) | No | No | **P0** — anyone can request schedule modifications on any USTN as any party |
| 4 | `src/app/api/sgtx/trade-request/route.ts` | POST | Middleware JWT (protected) | No — body supplies `buyerGtid` + `sellerGtid` (any value) | No — `eventBus.publish("trade.created")` is brain-os, NOT Loom | YES (`withIdempotency`) | **P0** — anyone can create a trade AS any buyer and AGAINST any seller, with auto-inbox to both parties + Gov |
| 5 | `src/app/api/sgtx/quote/submit/route.ts` | POST | Middleware JWT (protected) | No — body supplies `sellerGtid` | No | YES (`withIdempotency`) | P0 — anyone can submit a quote on behalf of any seller; mutates Trade.status → QUOTED + creates ServiceQuotation rows for arbitrary LSP/SHIP GTIDs (broadcast RFQ) |
| 6 | `src/app/api/sgtx/quote/accept/route.ts` | POST | Middleware JWT (protected) | No — body supplies only `ustn`; route uses `trade.buyerGtid` as the actor with NO session comparison | No | YES (`withIdempotency`) | **P0** — anyone can accept any quote on behalf of the actual buyer; mutates Trade.status → QUOTE_ACCEPTED/BUYER_SUBMITTED |
| 7 | `src/app/api/sgtx/contract/sign/route.ts` | POST | Middleware JWT (protected) + Brain prescreen + Governor G1 | Partially — body supplies `signerGtid`; route DOES verify `signerGtid === trade.{buyer,seller}Gtid`, but does NOT verify session's tenantGtid === signerGtid | No (`eventBus.publish("trade.contract.signed")` is brain-os) | YES (explicit `qesSignature.findFirst` lookup) | P0 — anyone who knows the buyer/seller GTID can sign the contract as them; produces a legal-effect "SIGNED_CONTRACT" QES record |
| 8 | `src/app/api/sgtx/ustn-close/route.ts` | POST | Middleware JWT (protected) | No — body supplies `closedBy` | **YES** — calls `appendEvent({eventType:"USTN_CLOSED"})` to the canonical event-spine | Partial — idempotency key is derived `ustn-close:${ustn}:${closureState}` (deterministic, NOT caller-supplied) | P0 — anyone can close any USTN as any party; emits a canonical event (only route in sample that does) |
| 9 | `src/app/api/sgtx/micro-contract/lock/route.ts` | POST | Middleware JWT (protected) | No — body supplies `buyer_gtid`, `seller_gtid` | No | No | **P0** — anyone can lock a distressed micro-contract for any parent USTN as any buyer; mutates the distressed-cargo flow + creates inbox for arbitrary GTIDs |
| 10 | `src/app/api/sgtx/micro-contract/route.ts` (root) | GET | (file under `/micro-contract/route.ts` — sampled list endpoint) | No | No | N/A | P1 — read without tenant scoping |

#### Payment / financial mutations (10)

| # | Route | Methods | Auth checked | Tenant from session | Canonical event (Loom) | Idempotency | Risk |
|---|-------|---------|--------------|---------------------|-------------------------|-------------|------|
| 11 | `src/app/api/sgtx/payment/pay/route.ts` | POST | Middleware JWT (protected) + Governor G1 (`actorGtid` from body) | No — body supplies `actorGtid`/`payerGtid` | No | Partial — `processPspSplit` generates an internal `idempotencyKey` but the route itself doesn't dedup | **P0** — anyone can trigger PSP split (Stage 1/2) on any USTN; mutates FeeLock state |
| 12 | `src/app/api/sgtx/payment/status/route.ts` | GET | Middleware JWT (protected) | No — `?ustn=` query | No | N/A | P1 — any tenant can read any other tenant's FeeLock + PaymentAttempt history |
| 13 | `src/app/api/sgtx/payment/retry/route.ts` | POST + GET | Middleware JWT (protected) | No — `ustn` from body, no caller identity | No | Partial — `withRetry` generates an internal idempotency key per external call | P1 — anyone can run arbitrary external API call retries against any registered PSP / integration |
| 14 | `src/app/api/sgtx/payment/idempotency-key/route.ts` | POST + GET | Middleware JWT (protected) | No — body has `body` (any payload) | No | N/A (helper) | P2 |
| 15 | `src/app/api/sgtx/payment/stage1/route.ts` | POST | Middleware JWT (protected) | No — body supplies `payerGtid` | No | No | **P0** — anyone can initiate Stage 1 pre-shipment payment as any payer on any USTN |
| 16 | `src/app/api/sgtx/payment/stage2/route.ts` | POST | Middleware JWT (protected) | No — body supplies `payerGtid` | No | No | **P0** — anyone can initiate Stage 2 post-departure payment + creates a `FeePaymentRequest` row as any payer |
| 17 | `src/app/api/sgtx/payment/psp/[provider]/intent/route.ts` | POST + GET | Middleware JWT (protected) | No — body supplies `payerGtid` | No | Partial — body supplies `idempotencyKey` (caller-chosen; format not strictly enforced) | P0 — anyone can create a payment intent at any PSP for any payer + any USTN |
| 18 | `src/app/api/sgtx/payment/psp/[provider]/confirm/route.ts` | POST | Middleware JWT (protected) | No — body supplies `intentId` | No | **No** | **P0** — anyone can confirm/capture any payment intent if they know its ID |
| 19 | `src/app/api/sgtx/payment/fealock/freeze/route.ts` | POST | Middleware JWT (protected) | No — body has only `ustn` + `reason` (no caller identity at all); activity log uses `trade.buyerGtid` as actor | No | No | **P0** — anyone can freeze any FeeLock (blocks container release) for any USTN |
| 20 | `src/app/api/sgtx/payment/fealock/release/route.ts` | POST | Middleware JWT (protected) | No — body has only `ustn` | No | No | **P0** — anyone can release any FeeLock on any USTN; should require settlement or governor approval |

#### Customs Gateway mutations (10)

| # | Route | Methods | Auth checked | Tenant from session | Canonical event (Loom) | Idempotency | Risk |
|---|-------|---------|--------------|---------------------|-------------------------|-------------|------|
| 21 | `src/app/api/sgtx/customs-gateway/declaration/route.ts` | GET + POST | Middleware JWT (protected) | No — body supplies `brokerGtid` | No (lib `createDeclaration` does not emit) | No | **P0** — anyone can create a customs declaration for any USTN as any broker |
| 22 | `src/app/api/sgtx/customs-gateway/declaration/[id]/route.ts` | GET + PATCH | Middleware JWT (protected) | No — body supplies `actorGtid` | No | No | **P0** — anyone can transition any declaration to any valid next state as any broker; comment claims "Governor-required transitions verify a recorded GovernorDecision before applying" but the route handler itself does NOT verify |
| 23 | `src/app/api/sgtx/customs-gateway/declaration/[id]/submit/route.ts` | POST | Middleware JWT (protected) + Governor G1 inside lib | No — declaration ID in path; broker GTID is implicit from declaration | No | YES (`idempotency_key` in `IntegrationConnectorLog` per doc) | P0 — submitter is bound by the declaration's stored broker, not by session; first person to call wins |
| 24 | `src/app/api/sgtx/customs-gateway/authorize/route.ts` | POST + GET | Middleware JWT (protected) | No — body supplies `brokerGtid`, `governorDecisionId`, `adapterId` | No | No | **P0** — the `register_profile`/`activate_profile`/`authorize_relationship`/`record_governor_decision`/`revoke_relationship` actions all take any `brokerGtid` from the body — anyone can authorize or revoke broker-USTN relationships; comment admits "Filer code is NEVER used as the authorization mechanism" but that's the only check the route does NOT do — it doesn't check the CALLER either |
| 25 | `src/app/api/sgtx/customs-gateway/holds/route.ts` | GET + POST + PATCH | Middleware JWT (protected) | No — body supplies `issuedBy` (any value, e.g. "US-CBP", "FDA") | No | No | **P0** — anyone can issue a CUSTOMS_HOLD or PGA_HOLD as any government authority on any USTN; comment says "SGTX NEVER issues a hold on its own behalf — `issuedBy` MUST carry the authority identifier" but the route does NOT verify the caller is that authority |
| 26 | `src/app/api/sgtx/customs-gateway/fee-dispute/route.ts` | GET + POST | Middleware JWT (protected) | No — body supplies `brokerGtid`, `traderGtid` | YES (lib `createDisputeCase` calls `appendEvent`) | No | P0 — anyone can create a CRITICAL-fee-dispute against any broker; auto-escalates to Governor |
| 27 | `src/app/api/sgtx/customs-gateway/credentials/route.ts` | GET + POST + DELETE | Middleware JWT (protected) | No — body supplies `brokerGtid`, `governorDecisionId` | No | No | **P0** — anyone can register/suspend/reinstate/rotate/activate/revoke broker BYOC credentials for any broker; the `verify` action takes any `id` from the body |
| 28 | `src/app/api/sgtx/customs-gateway/compliance-check/route.ts` | GET | Middleware JWT (protected) | No — `?ustn=` query | No | N/A | P1 — anyone can run a customs compliance check on any USTN (info disclosure of internal verification state) |
| 29 | `src/app/api/sgtx/customs-gateway/webhook/[adapterId]/route.ts` | POST | NO middleware auth — relies on HMAC-SHA256 webhook signature + replay protection | N/A (external caller) | Indirect (`processGovernmentEvent` pipeline may emit) | YES (`X-Idempotency-Key` + `checkReplayProtection` by `event_id`) | P1 — properly secured by webhook signature, BUT the secret is loaded from env `SGTX_WEBHOOK_SECRET_<ADAPTER>` and falls back to `SGTX_WEBHOOK_DEV_SECRET` — if the dev secret is set or env is missing, anyone can forge webhooks |
| 30 | `src/app/api/sgtx/customs-gateway/onboarding/route.ts` | GET + POST | Middleware JWT (protected) | No — body/query supplies `brokerGtid` | No | No | P0 — anyone can `start`/`complete`/`fail`/`reset`/`startStep` the broker onboarding flow for any broker; mutates onboarding state |

#### Disputes + Governor high-stakes (10)

| # | Route | Methods | Auth checked | Tenant from session | Canonical event (Loom) | Idempotency | Risk |
|---|-------|---------|--------------|---------------------|-------------------------|-------------|------|
| 31 | `src/app/api/sgtx/disputes/trigger/route.ts` | POST | Middleware JWT (protected) | No — body has `triggerSource`, `ustn`, optional `severity`, `suggestedClaimAmountUsd` | No (lib `triggerAdvisoryDispute` does not emit) | No | P0 — anyone can trigger an ADVISORY dispute on any USTN as the system; mutates the affected party's inbox |
| 32 | `src/app/api/sgtx/disputes/evidence/route.ts` | POST | Middleware JWT (protected) | No — body has only `disputeId` | No (lib `compileEvidence` does not emit) | No | P0 — anyone can compile evidence for any dispute |
| 33 | `src/app/api/sgtx/disputes/arbitration/route.ts` | POST | Middleware JWT (protected) | No — body has `disputeId`, `arbitrationBody`, `claimLanguage` | No (lib `prepareArbitrationCase` does not emit) | No | P0 — anyone can prepare an arbitration case for any dispute at any arbitration body |
| 34 | `src/app/api/sgtx/disputes/expert/route.ts` | POST + GET | Middleware JWT (protected) | No — body supplies `expertGtid`, `invitedByGtid`, `expertName` | No | No | P0 — anyone can invite a "third-party expert" to any dispute and **generate a "secure one-time link" `https://sgtx.io/expert/<token>` that is a deterministic concatenation of `disputeId-Date.now()-Math.random()` — not cryptographically random, predictable** |
| 35 | `src/app/api/sgtx/disputes/mediation/route.ts` | GET + POST | Middleware JWT (protected) | No — `postMediationMessage(body)` takes the whole body | No | No | P0 — anyone can post mediation messages into any dispute |
| 36 | `src/app/api/sgtx/disputes/proposal/route.ts` | POST | Middleware JWT (protected) | No — body has `disputeId` (and `action:"accept"` branch takes whatever else) | No | No | P0 — anyone can generate OR accept a settlement proposal on any dispute |
| 37 | `src/app/api/sgtx/disputes/partial-release/approve/route.ts` | POST | Middleware JWT (protected) | No — body supplies `approverGtid`, `approverRole` ("COUNTERPARTY" \| "GOVERNOR"), `governorDecisionId` | No | No | **P0** — anyone can claim to be a "GOVERNOR" approver and approve a partial FeeLock release; the body itself contains the role claim — no verification |
| 38 | `src/app/api/sgtx/governor/decision/route.ts` | POST | Middleware JWT (protected) | No — body supplies `action`, `actorGtid`, `traderMode`, `resourceUstn`, `payload` (whole governor input) | YES (governor internally Loom-anchors every decision) | Partial — governor decisions are hashed into Loom, but the route accepts the same `action`+`actorGtid` repeatedly with no caller-side dedup | P0 — anyone can submit any Governor decision input; governor will run and emit a Loom-anchored decision for any actor |
| 39 | `src/app/api/sgtx/governor/generate-token/route.ts` | POST | Middleware JWT (protected) | No — body has `ustn` | No | No | **P0** — anyone can mint a 90-day Loom verification token for ANY USTN; the token grants read access to the immutable audit trail for any trade — useful for reconnaissance |
| 40 | `src/app/api/sgtx/governor/modules/[name]/reload/route.ts` | POST | Middleware JWT (protected) + `multisigApproved` body field (defaults to `true` if omitted!) | No — body supplies `signedBy` (Platform Governance Authority GTID) | Indirect (`reloadModule` claims "Loom-anchors the change event" — not verified) | No | **P0** — anyone can hot-reload a constitutional WASM module (`fee_gate.wasm`, `constitutional_rules.wasm`, …). The `multisigApproved` check defaults to TRUE if the field is absent. This is the single highest-impact mutation in the platform — a successful call swaps the in-memory pointer to constitutional enforcement logic. The route's only real gate is the middleware JWT, which any logged-in tenant has. |

### A.3 Additional findings from sampling

- **`/api/sgtx/admin/tenant/impersonate/route.ts`** (not in the 40 but checked because of high impact): NO auth check beyond middleware. Body supplies `targetTenantGtid`, `adminGtid`, `reason`. Creates an Activity log row `TENANT_IMPERSONATION` attributed to arbitrary `adminGtid` — **anyone can contaminate the audit log with fake admin impersonation entries**, and a downstream consumer of this Activity log could be tricked into issuing a real impersonation session. Returns `sessionId` + `expiresAt` — a forged impersonation session identifier.

---

## PART B — Credential / Secret Scan

### B.1 P0 findings — live production credentials committed to git

**Finding B.1 — Turso production database JWT (CRITICAL)**

The same EdDSA-signed Turso auth JWT is hardcoded as a fallback (or inline value) in **31 files**, all committed to git and pushed to `github.com/SGTX-PILOT/SGTX`:

| File | Line | Role |
|------|------|------|
| `prisma.config.ts` | 7 | Runtime Prisma config (production) |
| `src/lib/db.ts` | 10, 37 | Runtime Prisma client (production) |
| `src/lib/db-fresh.ts` | 5, 26 | Runtime fresh-DB Prisma client (production) |
| `scripts/db-push.sh` | 3 | `prisma db push` automation (exports to env) |
| `scripts/phase5-backup.ts` | 3 | Backup script |
| `scripts/phase5-create-tables.ts` | 8 (URL only) | Table creation |
| `scripts/phase5-seed.ts` | 21 (URL only) | Seeding |
| `scripts/phase6-backup.ts` | 3 | Backup script |
| `scripts/phase6-create-tables.ts` | 9 (URL only) | Table creation |
| `scripts/phase6-seed.ts` | 24 (URL only) | Seeding |
| `scripts/phase7-backup.ts` | 3 | Backup script |
| `scripts/phase7-create-tables.ts` | 8 (URL only) | Table creation |
| `scripts/phase7-seed.ts` | 21 (URL only) | Seeding |
| `scripts/phase8-backup.ts` | 3 | Backup script |
| `scripts/phase8-create-tables.ts` | 8 (URL only) | Table creation |
| `scripts/phase8-seed.ts` | 33 (URL only) | Seeding |
| `scripts/phase9-backup.ts` | 3 | Backup script |
| `scripts/phase9-create-tables.ts` | 8 (URL only) | Table creation |
| `scripts/phase9-seed.ts` | 18 (URL only) | Seeding |
| `scripts/phase10-backup.ts` | 3 | Backup script |
| `scripts/phase10-create-tables.ts` | 8 (URL only) | Table creation |
| `scripts/phase10-fixtures.ts` | 14 (URL only) | Fixtures |
| `scripts/push-dcsa-tables.ts` | 3 (URL only) | DCSA table push |
| `scripts/amendment-create-tables.ts` | 10 (URL only) | Amendment table creation |
| `scripts/create-road-tables.ts` | 54 (URL only) | Road table creation |
| `scripts/create-air-tables.ts` | 63 (URL only) | Air table creation |
| `scripts/create-engine-tables.ts` | 53 (URL only) | Engine table creation |
| `scripts/create-jurisdiction-tables.ts` | 39 (URL only) | Jurisdiction table creation |
| `scripts/create-addon-tables.ts` | 55 (URL only) | Add-on table creation |
| `scripts/turso-migrate-data.ts` | 6 (URL only) | Data migration |
| `scripts/turso-migrate-routes.ts` | 6 (URL only) | Routes migration |

**Token:** `eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODYwNDkwNjAsImlkIjoiMDE5ZmQ4ZDEtNDQwMS03MTUwLWIzMjctZWU3NmE5YTcxODkyIiwia2lkIjoiMlNGbjFBZlVSdTVMUXlrTGRzR3djNXdWV1V2RGVxV2FWODZRdlhST0MxYyIsInJpZCI6ImQ0YjkzOWVhLTdmYzgtNGI5Mi04OGRkLTI1ODQyMjE0NTY4YSJ9.ChmrdozQVoOIOsTHvai6fAb5HlTst4vaBlFFIZ4OLlDVOOR8SXkWWNHv84sS7U5KHgwhoP07nYFzniHiu2LhDA`

**Target:** `libsql://sgtx-fortleem.aws-us-east-1.turso.io` — the **production** Turso database (420 tables, 1,785 indexes — verified in worklog Task DEPLOY-FIX-VERIFICATION).

**Verification that this is the production credential:**
- The most recent worklog entry (DEPLOY-FIX-VERIFICATION) states: "Turso: confirmed provided token authenticates against `libsql://sgtx-fortleem.aws-us-east-1.turso.io`. The libsql client returned `{"ok":1}`. The schema was already in sync from a prior session; verified state: 420 tables + 1785 indexes". The token verified in that task is the same token hardcoded in these files.
- The token's JWT payload (`iat: 1786049060` = 2026-09-04) is fresh (issued today).
- The token grants `rw` (`"a":"rw"`) — full read/write.

**Git history:** Introduced in commit `8bf3dfb fix(db): hardcoded Turso token fallback (Vercel env injection fails)` and persists across every subsequent commit. All 31 files are tracked by `git ls-files`.

**Severity: P0** — the production database is fully compromised. Anyone with read access to the repo (or anyone who scrapes a deployed Vercel bundle, since the token ships in the build) can read/write any row of any table, including: tenant PII, password hashes, KYB documents, customs declarations, payment records, governor decisions, the entire Loom hash chain.

**Required remediation:** (a) rotate the Turso token immediately in the Turso dashboard; (b) purge the token from git history (BFG / git-filter-repo) and force-push; (c) remove the fallback constants from `db.ts`/`db-fresh.ts`/`prisma.config.ts` and fail-fast if `TURSO_AUTH_TOKEN` env var is missing; (d) the `scripts/*` files should be deleted or rewritten to read the token from a `.env` file that is gitignored.

---

**Finding B.2 — Universal backdoor password `"sgtx-demo"` (CRITICAL)**

`src/app/api/v1/auth/login/route.ts` (lines 34–46):
```ts
if (employee.passwordHash) {
  valid = verifyPassword(password, employee.passwordHash);
} else {
  // No password set — accept "sgtx-demo" and auto-hash it
  if (password === "sgtx-demo") {
    valid = true;
    // Auto-hash and persist so future logins use real verification
    await db.employee.update({ where: { id: employee.id }, data: { passwordHash: hashPassword("sgtx-demo") } });
  }
}
```

The comment claims "this is safe because the employee must already exist (created during onboarding) and the account is in KYB_PENDING state (can't trade yet)" — but the route handler does NOT verify `tenant.lifecycleState === "KYB_PENDING"` before accepting the backdoor. Any employee row created via onboarding — including demo tenants seeded by `scripts/seed-demo-tenants.ts` (the worklog confirms seeded demo tenants exist in production) — is reachable with `email + "sgtx-demo"`. This issues a full session JWT with `csrf` claim and tenant context.

**Severity: P0** — production login bypass for any account without a stored password hash.

**Required remediation:** delete the `sgtx-demo` branch entirely; require `passwordHash` to be set during onboarding completion; fail-closed if `passwordHash` is null.

---

**Finding B.3 — Dev-mode auth bypass in middleware (CRITICAL)**

`src/middleware.ts` (lines 973–980) — described in A.1 above. If `NODE_ENV !== "production"`, every protected route is reachable without a JWT. This was likely introduced for the "demo portal" flow, but it is a global bypass — there is no per-route or per-IP restriction.

**Severity: P0** — any non-prod deployment (Vercel preview, staging, CI, dev) has zero authentication on all protected routes.

**Required remediation:** remove the dev-mode bypass; introduce a separate demo-portal login that mints real (limited-scope) JWTs without requiring password entry, but never skip JWT verification entirely.

---

**Finding B.4 — Admin impersonation endpoint accepts body-supplied adminGtid (CRITICAL)**

`src/app/api/sgtx/admin/tenant/impersonate/route.ts` — described in A.3 above. No verification that the caller's session `x-tenant-gtid` is `ADM` type or matches the supplied `adminGtid`.

**Severity: P0** — anyone with a session can write fake admin impersonation entries into the audit Activity log and obtain `sessionId`/`expiresAt` values that downstream systems may trust.

**Required remediation:** require `x-tenant-gtid` from session, look up the caller's tenant type, reject unless `type === "ADM"`; require the `targetTenantGtid` to be in scope of the admin's authority; never accept `adminGtid` from body.

---

**Finding B.5 — Constitutional WASM module reload accepts body-supplied `multisigApproved` (CRITICAL)**

`src/app/api/sgtx/governor/modules/[name]/reload/route.ts` (line 58):
```ts
const multisigApproved = body?.multisigApproved !== false; // default true
```
If the field is absent in the body, `multisigApproved` is `true`. The check then passes. Anyone with a session can hot-reload `fee_gate.wasm`, `constitutional_rules.wasm`, `jurisdiction_matrix.wasm`, `incoterms_engine.wasm`, `distressed_country_gate.wasm`, `dual_mode_gate.wasm`, or `reserve_rules.wasm`.

**Severity: P0** — single most dangerous mutation in the platform reachable by any logged-in user. Even if `reloadModule` itself verifies the Ed25519 signature against the Platform Governance Authority key (unverified in this audit), the multisig gate is a no-op when the field is missing.

**Required remediation:** require `multisigApproved: true` to be EXPLICITLY set in the body, verify it against an actual multisig transaction record (≥3 distinct ADM/GOV signatures), and require the caller's `x-tenant-gtid` to be of type `GOV` or `ADM` with a specific Platform Governance Authority scope.

---

### B.2 P1 findings — placeholders / dev fallbacks that weaken production

**Finding B.6 — Dev-only session/refresh secret fallbacks**

`src/lib/v1/auth.ts` (lines 152–153) and `src/middleware.ts` (lines 34–35):
```ts
export const SESSION_SECRET = requireSecret("SGTX_SESSION_SECRET", "sgtx-dev-secret-key-2026-DO-NOT-USE-IN-PROD");
export const REFRESH_SECRET = requireSecret("SGTX_REFRESH_SECRET", "sgtx-dev-refresh-secret-2026-DO-NOT-USE-IN-PROD");
```

`requireSecret` throws in production if the env var is missing OR <32 chars (lines 138–150). The dev fallbacks are deterministic and shipped in git. Anyone who can run the codebase in non-production mode (Vercel preview, CI) can forge valid JWTs signed with these known secrets.

**Severity: P1** — production is safe (fail-fast), but every non-production environment has a forgable session secret.

**Required remediation:** remove the literal fallback strings; throw in all environments if env var is missing; document a `make-dev-secrets` script that generates random secrets into `.env.local`.

---

**Finding B.7 — Dev-only Ed25519 platform private key**

`src/lib/sgtx/crypto/platform-key.ts` (line 14):
```ts
const DEV_PRIVATE_KEY_HEX = "9d2d2f2e2b3a4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e";
```

`getPrivateKey()` throws in production if `SGTX_PLATFORM_KEY` is missing (line 18), but `signWithPlatformKeySync` (line 62) and `verifyPlatformSignatureSync` (line 71) silently fall back to `DEV_PRIVATE_KEY_HEX` even in production. Any code path that uses the sync variants is signing with a publicly-known private key.

**Severity: P1** — sync fallbacks are dangerous; the async variants are correct.

**Required remediation:** make the sync variants throw in production if `SGTX_PLATFORM_KEY` is missing (matching `getPrivateKey()`); delete the literal `DEV_PRIVATE_KEY_HEX`.

---

**Finding B.8 — Webhook signature dev fallback**

`src/app/api/sgtx/customs-gateway/webhook/[adapterId]/route.ts` (lines 43–61):
The per-adapter secret is loaded from `SGTX_WEBHOOK_SECRET_<ADAPTER_ID>` env var. If absent, the config's `secretRef` falls back to `SGTX_WEBHOOK_DEV_SECRET`. The downstream `verifyWebhookSignature` will fail if neither is set, but if `SGTX_WEBHOOK_DEV_SECRET` is set to anything predictable (likely in dev environments), anyone can forge customs webhook events.

**Severity: P1** — verify behavior of `verifyWebhookSignature` against an unset or dev secret; require all production adapters to have a real per-adapter secret.

---

### B.3 P2 findings — acceptable placeholders / demo values

**Finding B.9 — Stripe webhook secret simulation placeholder**

`src/lib/sgtx/payment/psp-adapters.ts` (line 335):
```ts
private readonly webhookSecret = "whsec_stripe_sim_v1";
```
This is the SIMULATED Stripe adapter — clearly a placeholder, not a real Stripe key. The route is reachable, but the adapter does not call Stripe; it sleeps + returns a synthetic result. **Severity: P2** — acceptable as long as the Stripe adapter is never wired to a real Stripe secret without replacing this constant.

**Finding B.10 — Demo payment sample bodies**

`src/app/api/sgtx/payment/psp/[provider]/intent/route.ts` (lines 88–94) and similar routes contain a hardcoded sample `payerGtid: "SGTX-EG-TRD-002139-7F3A"` in the GET helper. This is a demo tenant GTID (matches the format example in the blueprint) — not a secret. **Severity: P2** — acceptable.

**Finding B.11 — Vercel / GitHub tokens absent from source**

Grep for `ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_` (30+ chars), `vcp_`, `vercel_` (30+ chars), `AKIA[A-Z0-9]{16}`, `sk_live_`, `sk_test_`, `pk_live_`, `whsec_` (excluding the Stripe sim), `rk_live_`, `sk-`, `gsk_`, `hf_`, `AIza`, `-----BEGIN` (PEM markers), `mongodb://user:pass@`, `postgres://user:pass@` — **NO matches** in the source tree. The git remote URL embedded in `.git/config` does contain a GitHub PAT (`x-access-token:ghp_...`) but this is not committed to the repo and was already auto-redacted by the shell environment at read time.

---

## PART C — Aggregated gap lists

### C.1 Sampled routes with NO auth check (potentially public, given dev-mode bypass)

All 40 sampled routes pass through `middleware.ts`. In **production mode** (and assuming the route is NOT in `PUBLIC_ROUTES` or matched by `isPublicPattern()`), the middleware rejects requests with no/invalid JWT. In **non-production** mode (Vercel preview, dev, CI, any misconfigured prod), the middleware sets `X-Auth-Warning` and forwards — meaning every one of the 40 routes is reachable without auth.

Routes that ALSO match `PUBLIC_ROUTES` or `isPublicPattern()` (no JWT check in ANY environment):

- (None of the 40 sampled routes are in `PUBLIC_ROUTES` directly, but several sit under prefixes covered by `isPublicPattern()` — e.g., none of `trade`, `payment`, `customs-gateway`, `dispute`, `governor` are caught by the catch-all, so they DO require a JWT in production.)

In **non-production** environments, all 40 routes are effectively public. In production, none are public — but the auth check is a JWT signature check only; the route handlers do NOT verify that the JWT's tenant matches the body-supplied actor. **Every one of the 40 routes is therefore vulnerable to cross-tenant action in production**: an authenticated attacker with their own valid JWT can act on any other tenant's behalf by supplying that tenant's GTID in the body.

### C.2 Sampled mutation routes that DO NOT emit a canonical Loom event

Of 32 mutation routes in the sample (POST/PATCH/DELETE), only **2** emit a canonical Loom event:

- `/api/sgtx/ustn-close` (directly calls `appendEvent`)
- `/api/sgtx/customs-gateway/fee-dispute` (lib calls `appendEvent` via `appendFeeDisputeLoomEvent`)

**The other 30 mutation routes do NOT emit a Loom event:**

```
/api/sgtx/trade/modify-schedule             /api/sgtx/trade-request
/api/sgtx/quote/submit                       /api/sgtx/quote/accept
/api/sgtx/contract/sign                     /api/sgtx/micro-contract/lock
/api/sgtx/payment/pay                       /api/sgtx/payment/retry
/api/sgtx/payment/idempotency-key           /api/sgtx/payment/stage1
/api/sgtx/payment/stage2                    /api/sgtx/payment/psp/[provider]/intent
/api/sgtx/payment/psp/[provider]/confirm    /api/sgtx/payment/fealock/freeze
/api/sgtx/payment/fealock/release           /api/sgtx/customs-gateway/declaration
/api/sgtx/customs-gateway/declaration/[id]  /api/sgtx/customs-gateway/declaration/[id]/submit
/api/sgtx/customs-gateway/authorize         /api/sgtx/customs-gateway/holds
/api/sgtx/customs-gateway/credentials       /api/sgtx/customs-gateway/compliance-check
/api/sgtx/customs-gateway/onboarding        /api/sgtx/disputes/trigger
/api/sgtx/disputes/evidence                 /api/sgtx/disputes/arbitration
/api/sgtx/disputes/expert                   /api/sgtx/disputes/mediation
/api/sgtx/disputes/proposal                 /api/sgtx/disputes/partial-release/approve
/api/sgtx/governor/decision (governor internal emits, route does not)
/api/sgtx/governor/generate-token           /api/sgtx/governor/modules/[name]/reload
/api/sgtx/governor/policy-author            /api/sgtx/admin/tenant/impersonate
```

These routes emit at most an `eventBus.publish(...)` (the in-process Brain OS bus, NOT the immutable Loom hash chain) or an Activity log row (mutable). The blueprint §12-18 specifies the event spine as "the single source of truth for everything that happened to a USTN" — most trade lifecycle events bypass it.

### C.3 Sampled mutation routes that DO NOT have idempotency

Of 32 mutation routes, only **5** implement idempotency:

- `/api/sgtx/trade-request` (`withIdempotency`)
- `/api/sgtx/quote/submit` (`withIdempotency`)
- `/api/sgtx/quote/accept` (`withIdempotency`)
- `/api/sgtx/contract/sign` (explicit `qesSignature.findFirst` lookup)
- `/api/sgtx/customs-gateway/declaration/[id]/submit` (lib `IntegrationConnectorLog.idempotency_key`)
- `/api/sgtx/customs-gateway/webhook/[adapterId]` (`checkReplayProtection`)
- `/api/sgtx/ustn-close` (deterministic derived idempotency key)

**The other ~25 mutation routes have NO idempotency:** any retry, double-click, or network replay creates duplicate state — duplicate trades, duplicate payments, duplicate FeeLock freezes, duplicate contract signatures on micro-contracts (which lack even the `qesSignature.findFirst` check), duplicate customs declarations, duplicate customs holds, duplicate broker credentials, duplicate disputes, duplicate expert invitations, duplicate governor decisions, duplicate constitutional module reloads, duplicate admin impersonation log entries.

The financial routes (`payment/pay`, `payment/stage1/2`, `payment/fealock/freeze`, `payment/fealock/release`, `payment/psp/[provider]/confirm`) are the most consequential — the blueprint's own Part 6.12 mandates the Idempotency Key Standard, but the route handlers don't enforce it (only the external API retry helper does, and only for outbound calls).

---

## PART D — Final verdict

| Severity | Count | Issues |
|----------|-------|--------|
| **P0** | **5** | B.1 Turso prod DB token in git (31 files); B.2 `"sgtx-demo"` universal backdoor password; B.3 dev-mode middleware auth bypass; B.4 admin impersonation accepts body-supplied adminGtid; B.5 constitutional WASM reload `multisigApproved` defaults to true |
| **P1** | **4** | B.6 dev-only session/refresh secret literals; B.7 sync platform-key falls back to dev private key in prod; B.8 webhook dev secret fallback; body-supplied tenant identity across 39/40 sampled routes (no session-binding); missing canonical Loom events on 30/32 mutation routes; missing idempotency on ~25/32 mutation routes |
| **P2** | **3** | B.9 Stripe sim webhook secret placeholder; B.10 demo payment sample bodies; B.11 Vercel/GitHub tokens absent from source |

### Recommended immediate actions (in order)

1. **Rotate the Turso token** in the Turso dashboard immediately. The current token's `iat` is today and it has full read/write; assume it is compromised.
2. **Remove the hardcoded Turso token from `prisma.config.ts`, `src/lib/db.ts`, `src/lib/db-fresh.ts`, `scripts/db-push.sh`, and all `scripts/phase*-backup.ts` / `scripts/phase*-seed.ts` / `scripts/phase*-create-tables.ts` / `scripts/create-*-tables.ts` files.** Replace with `process.env.TURSO_AUTH_TOKEN` and fail-fast in production if missing. Purge git history with `git-filter-repo` and force-push.
3. **Remove the `"sgtx-demo"` backdoor password** from `src/app/api/v1/auth/login/route.ts`. Require `passwordHash` to be set during onboarding completion.
4. **Remove the dev-mode auth bypass** from `src/middleware.ts` (lines 973–980). If a demo flow is needed, mint real (demo-scope) JWTs at login.
5. **Add session-to-body identity verification** to all 39 sampled routes that currently take `*Gtid`/`actorGtid`/`payerGtid`/`brokerGtid`/`signedBy`/`adminGtid` from the body — read `x-tenant-gtid` from the request header (set by middleware from the JWT) and reject if it doesn't match the body-supplied actor. For admin/gov-only mutations, look up the caller's tenant type and reject unless `type === "ADM"` or `type === "GOV"`.
6. **Remove the `multisigApproved` default-true behavior** in `governor/modules/[name]/reload/route.ts`; require an explicit multisig transaction reference with ≥3 distinct signatures.
7. **Audit the admin/tenant/impersonate route** — require `x-tenant-gtid` lookup of type `ADM`.
8. **Add canonical event-spine emission** to all 30 mutation routes that currently bypass it.
9. **Add idempotency** to all 25 mutation routes that currently lack it — use the existing `withIdempotency` middleware for route-level dedup, and the Part 6.12 SHA256(canonical_body + utc_second) format for external-facing mutations.
10. **Tighten `isPublicPattern()`** — the catch-all for `/transport/`, `/finance/`, `/completion/`, `/integrations/`, `/regulatory/`, `/readiness/`, `/constitutional/` makes hundreds of mutation routes JWT-exempt. Move mutation routes out of public patterns or require JWT on POST/PATCH/DELETE regardless.

### Routes whose risk rating is P0 (immediate attention)

```
src/app/api/sgtx/trade/modify-schedule/route.ts
src/app/api/sgtx/trade-request/route.ts
src/app/api/sgtx/quote/submit/route.ts
src/app/api/sgtx/quote/accept/route.ts
src/app/api/sgtx/contract/sign/route.ts
src/app/api/sgtx/ustn-close/route.ts
src/app/api/sgtx/micro-contract/lock/route.ts
src/app/api/sgtx/payment/pay/route.ts
src/app/api/sgtx/payment/stage1/route.ts
src/app/api/sgtx/payment/stage2/route.ts
src/app/api/sgtx/payment/psp/[provider]/intent/route.ts
src/app/api/sgtx/payment/psp/[provider]/confirm/route.ts
src/app/api/sgtx/payment/fealock/freeze/route.ts
src/app/api/sgtx/payment/fealock/release/route.ts
src/app/api/sgtx/customs-gateway/declaration/route.ts
src/app/api/sgtx/customs-gateway/declaration/[id]/route.ts
src/app/api/sgtx/customs-gateway/declaration/[id]/submit/route.ts
src/app/api/sgtx/customs-gateway/authorize/route.ts
src/app/api/sgtx/customs-gateway/holds/route.ts
src/app/api/sgtx/customs-gateway/fee-dispute/route.ts
src/app/api/sgtx/customs-gateway/credentials/route.ts
src/app/api/sgtx/customs-gateway/onboarding/route.ts
src/app/api/sgtx/disputes/trigger/route.ts
src/app/api/sgtx/disputes/evidence/route.ts
src/app/api/sgtx/disputes/arbitration/route.ts
src/app/api/sgtx/disputes/expert/route.ts
src/app/api/sgtx/disputes/mediation/route.ts
src/app/api/sgtx/disputes/proposal/route.ts
src/app/api/sgtx/disputes/partial-release/approve/route.ts
src/app/api/sgtx/governor/decision/route.ts
src/app/api/sgtx/governor/generate-token/route.ts
src/app/api/sgtx/governor/modules/[name]/reload/route.ts
src/app/api/sgtx/governor/policy-author/route.ts
src/app/api/sgtx/admin/tenant/impersonate/route.ts
```

---

*End of audit. Research-only — no code changes made. Findings documented for the next remediation agent.*
