# SGTX Final Certification Report

**Generated:** 2026-09-04
**Auditor:** Z.ai Code (Lead Platform Architect / CTO / Security Engineer / QA Director)
**Repository:** `SGTX-PILOT/SGTX` @ commit pre-push (post CERT-3, CERT-4, CERT-13, CERT-23, CERT-24, CERT-26, CERT-27, CERT-32 fixes)
**Method:** 4 parallel audit subagents (AUDIT-1 baseline, AUDIT-2 portal matrix, AUDIT-3 security, AUDIT-4 architectural) + 1 main agent (code fixes + test framework + CI + report)

---

## Executive Verdict

# ❌ NOT READY

The SGTX platform is **NOT production-ready**. Three P0 security issues were fixed in this cycle, but two P0 issues remain open and six P1 residual risks are documented. The platform has the structural foundations (396 Prisma models, 1,351 API routes, 12 portals, 204 tabs, canonical event spine, Governor library, OPA Rego policies, WasmEdge simulator) but several critical governance chains are not actually wired end-to-end.

### Why NOT READY

1. **P0 #4 — Admin impersonation endpoint accepts body-supplied `adminGtid`** with no session verification. Any authenticated user (or any user of the demo-login endpoint in non-prod) can contaminate the audit log with fake admin impersonation entries.
2. **P0 #5 — Constitutional WASM module reload defaults `multisigApproved = true`**. Any logged-in user can hot-reload `fee_gate.wasm` or `constitutional_rules.wasm`.
3. **P0 #1 (ROTATION REQUIRED) — The live Turso production JWT was committed to git in 31 files**. The 3 production runtime files are now clean, but ~25 `scripts/` files still contain the literal. **The token must be rotated on the Turso dashboard immediately and re-set as the Vercel `TURSO_AUTH_TOKEN` env var.** Until rotated, anyone with read access to the public `SGTX-PILOT/SGTX` repo can authenticate to the production database with `rw` scope.
4. **P1 — 39/40 sampled `/api/sgtx/*` routes source tenant GTID from the request body, not the verified session.** Any authenticated user can act as any tenant.
5. **P1 — Governor gates are not enforced on 8/14 lifecycle transitions; OPA policies are not loaded; WasmEdge is a TS simulation.** Critical business actions (trade creation, contract lock, customs, payment, dispute) run without constitutional enforcement.
6. **P1 — 30/32 mutation routes do not emit canonical Loom events.** The hash chain is incomplete; reconciliation and post-closure observation cannot work.
7. **P1 — State vector (4 clocks) is not wired to mutations.** UI collapses to a single `Trade.status` which is lossy.
8. **P1 — 13/14 lifecycle transitions don't emit canonical events.** Side paths (REVERSAL, CORRECTION, LEGAL_REVIEW) not modeled.
9. **P1 — 6 of 8 golden flows not tested.** Only #7 (unauthorized) and #8 (cross-tenant) have static-analysis tests.
10. **P1 — USTN lineage breaks at the quote/submission/dispute layer.**

### What IS Proven

* The 3 most critical P0 security issues (backdoor password, dev-mode middleware bypass, Turso JWT in production runtime) ARE fixed and tested.
* The canonical navigation registry validates (12 portals, 204 tabs, no duplicate IDs, no invalid permissions).
* The silent PortalContent fallback is replaced with an explicit error + telemetry.
* The dead File Dispute button is wired to the real, governed modal.
* CI is certification-grade (8 hard gates, no `continue-on-error`).
* 39 tests pass; lint passes; secrets scan passes.
* Local dev server: HTTP 200, Brain OS auto-init succeeds.

---

## Exact Scorecard

| Dimension | Coverage | Status |
|---|---|---|
| Portal coverage | 12/12 portals registered | ✅ DONE |
| Route coverage | 1,351 API routes; 40 sampled, 3/5 P0 fixed | ⚠️ IN-PROGRESS |
| Tab coverage | 204/204 tabs in canonical registry | ✅ DONE |
| Screen coverage | ~80% of tabs have explicit dispatcher resolvers; 20% via conditional sub-screen blocks | ⚠️ PARTIAL |
| API coverage | 40/1,351 routes sampled (3%); 5 P0 + 4 P1 + 3 P2 issues | ⚠️ PARTIAL |
| Authorization coverage | Middleware JWT verification enforced in ALL environments; 39/40 routes still trust body-supplied tenant IDs | ❌ P1 RESIDUAL |
| Tenant isolation | Login route derives tenant from DB record; demo-login mints bound JWTs; 39/40 `/api/sgtx/*` routes still trust body | ❌ P1 RESIDUAL |
| USTN continuity | Minted at contract lock; breaks at quote/submission/dispute layer; hardcoded in 5+ components | ❌ P1 RESIDUAL |
| TCC continuity | USTN-canonical at the overlay layer; not threaded to workspace content | ⚠️ P2 RESIDUAL |
| Lifecycle coverage | Preconditions ✅, audit ✅, Governor ❌ on 8/14, canonical events ❌ on 13/14 | ❌ P1 RESIDUAL |
| Event coverage | 30/32 mutation routes don't emit canonical events | ❌ P1 RESIDUAL |
| Notification coverage | Not audited in this cycle | ⚠️ UNVERIFIED |
| Governor coverage | ~6 mutations call `governorDecide`; 8/14 transitions skip it; constitutional gates never wired | ❌ P1 RESIDUAL |
| OPA coverage | 8 Rego files exist on disk; NOT loaded by the running app | ❌ P1 RESIDUAL |
| WasmEdge coverage | TS simulation only; no `.wasm` bytecode, no runtime, no Ed25519, no real hot-reload | ❌ P1 RESIDUAL |
| Test coverage | 39 tests, 5 files; 2 of 8 golden flows; 0 of 12 portal functional tests | ⚠️ IN-PROGRESS |
| CI coverage | 8 hard gates (lint, typecheck, build, prisma, secrets-scan, mock-detector, registry-validate, tests) | ✅ DONE |
| Production verification | Local dev HTTP 200; Vercel NOT re-verified post-CERT-32 | ⚠️ UNVERIFIED |

---

## Finding Table

| ID | Severity | Portal | Component | Evidence | Root Cause | Fix | Test | Status |
|---|---|---|---|---|---|---|---|---|
| F-01 | **P0** | ALL | prisma.config.ts, src/lib/db.ts, src/lib/db-fresh.ts, scripts/* | `SGTX_SECURITY_AUDIT.md` finding #1; 31 files contain Turso JWT literal `eyJhbGciOiJFZERTQSIs...` with `rw` scope on `libsql://sgtx-fortleem.aws-us-east-1.turso.io` | Hardcoded credential as a "fallback" for missing env var | Removed from 3 production runtime files; replaced with `process.env.TURSO_AUTH_TOKEN` (throws if missing in prod). ~25 scripts/ files still contain the token | `tests/security/cert-32-fixes.test.ts` (4 tests) + `scripts/cert/secrets-scan.sh` | **PARTIALLY FIXED** — production clean, scripts/ pending; **ROTATION REQUIRED** |
| F-02 | **P0** | ALL | src/app/api/v1/auth/login/route.ts:34-46 | `if (password === "sgtx-demo") { valid = true; ... }` — universal backdoor for any employee without passwordHash | "Demo password" treated as safe because of KYB_PENDING assumption (incorrect — admin/gov accounts still had read access) | Removed the backdoor; employees without passwordHash now cannot authenticate via this endpoint; demo logins routed through separate dev-only `/api/v1/auth/demo-login` endpoint | `tests/security/cert-32-fixes.test.ts` (3 tests) | **FIXED** |
| F-03 | **P0** | ALL | src/middleware.ts:973-980 | `if (!isProd) { response.headers.set("X-Auth-Warning", ...); return response; }` — any non-prod NODE_ENV bypassed JWT verification | Dev-mode convenience that was active in Vercel previews, staging, CI, and misconfigured prod | Removed the bypass; authentication enforced in ALL environments; demo logins routed through dev-only endpoint | `tests/security/cert-32-fixes.test.ts` + `tests/security/golden-flow-7-unauthorized.test.ts` | **FIXED** |
| F-04 | **P0** | ALL | src/middleware.ts:866-884 | Cron routes allowed unsigned requests in non-prod (`if (!cronSecret) { response.headers.set("X-Auth-Warning", ...); }`) | Same dev-mode bypass pattern as F-03, applied to cron endpoints | Fail-closed in ALL environments; no CRON_SECRET = 503 | (covered by F-03 test) | **FIXED** |
| F-05 | **P0** | ALL | src/app/api/sgtx/admin/tenant/impersonate/route.ts | Endpoint accepts body-supplied `adminGtid` with no session/admin verification | Missing authorization check on admin action | NOT FIXED — requires adding session verification + admin role check | None | **NOT FIXED** |
| F-06 | **P0** | ALL | src/app/api/sgtx/governor/modules/[name]/reload/route.ts:58 | `multisigApproved` defaults to `true` — any logged-in user can hot-reload constitutional WASM modules | Default value should be `false`; multisig approval should be required | NOT FIXED — requires changing the default to `false` + adding a multisig verification step | None | **NOT FIXED** |
| F-07 | **P1** | ALL | 39/40 sampled `/api/sgtx/*` routes | Tenant GTID sourced from request body, not verified session | Routes trust client-supplied identity | NOT FIXED — requires touching ~1,300 routes to derive tenant from JWT claim | `tests/tenant-isolation/golden-flow-8-cross-tenant.test.ts` (documents the residual risk) | **DOCUMENTED RESIDUAL** |
| F-08 | **P1** | ALL | 30/32 sampled mutation routes | No canonical Loom event emission on mutation | `appendEvent` not called in route handlers | NOT FIXED — requires wiring `appendEvent` into every mutation | None | **DOCUMENTED RESIDUAL** |
| F-09 | **P1** | ALL | ~25/32 sampled mutation routes | No idempotency keys for mutations | Idempotency middleware not applied broadly | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-10 | **P1** | trader-buyer, trader-seller | src/components/portals/PortalContent.tsx:10010 | Silent fallback `return <CommandCenter portal={portal} data={data} />;` hid missing tabs from audits | Developer convenience that masked configuration errors | Replaced with `PortalTabResolutionError` component that renders explicit error + emits telemetry | `tests/security/cert-32-fixes.test.ts` ("Silent PortalContent fallback removed") | **FIXED** |
| F-11 | **P1** | trader-buyer, trader-seller, gov | src/components/portals/PortalContent.tsx:8163,8177 | Dead "File Dispute" button with empty `onClick={() => {/* opens dispute modal */}}` | Modal existed but was orphaned (never imported) | Wired the button to the real `FileDisputeModal` that POSTs to the governed `/api/sgtx/disputes/file` endpoint | `tests/security/cert-32-fixes.test.ts` ("File Dispute workflow is wired") | **FIXED** |
| F-12 | **P1** | ALL | 8/14 lifecycle transitions | Governor `governorDecide` not called | Missing Governor calls in route handlers | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-13 | **P1** | ALL | OPA Rego files in /core/governor/policies/*.rego | 8 Rego files exist on disk but NOT loaded by the running app | No OPA WASM runtime integrated | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-14 | **P1** | ALL | src/lib/sgtx/governor/wasm-modules.ts | WasmEdge is a TS simulation (no `.wasm` bytecode, no runtime, no Ed25519) | Stubs not replaced with real WASM runtime | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-15 | **P1** | ALL | State vector (12-domain lib) | No lifecycle mutation calls `updateStateDomain` — vector stays at F0/PENDING forever | Wiring missing | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-16 | **P1** | ALL | 13/14 lifecycle transitions | No canonical event emission | `appendEvent` not called | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-17 | **P1** | ALL | USTN lineage | USTN minted at contract lock fans out only to Trade + Shipment; ServiceQuotation, BuyerSubmission, pre-lock Dispute retain placeholder `SGTX-PEND-{ts}-{rand6}` | Partial propagation | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-18 | **P2** | PortalContent.tsx | 680KB / 11,260 lines monolith | Maintainability risk | Incremental refactor needed | NOT FIXED (plan documented) | None | **DOCUMENTED RESIDUAL** |
| F-19 | **P2** | bank, pfi | PortalContent.tsx inline `<Card>` placeholders for `bank.collateral`, `pfi.borrowers` tabs | Inline placeholder text instead of real screens | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-20 | **P2** | ALL | 30/32 mutation routes don't emit canonical events | (Same as F-08) | — | — | **DOCUMENTED RESIDUAL** |
| F-21 | **P2** | ALL | Observability | No dashboards for failed commands / auth denials | Aggregation layer missing | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-22 | **P2** | ALL | Error handling | Existing routes may still return raw exception text in `catch (e: any) { return ... e.message }` | Pattern not retrofitted | NOT FIXED | None | **DOCUMENTED RESIDUAL** |
| F-23 | **P1** | ALL | Test coverage | 0 test files existed before this cycle | No test framework | Added vitest + 5 test files + 39 tests + 2 golden flows (#7, #8) | `bun run test` 39/39 PASS | **PARTIALLY FIXED** — 2 of 8 golden flows |
| F-24 | **P1** | ALL | CI/CD | `tsc --noEmit` ran with `continue-on-error: true`; no test job; no secrets-scan; no registry-validate | Non-blocking CI | Rewrote `.github/workflows/ci.yml` — 8 hard gates | Local: all gates PASS | **FIXED** |
| F-25 | **P1** | ALL | Canonical navigation registry | No registry; portal definitions duplicated across portal-config.ts and PortalContent.tsx dispatcher | Drift undetectable | Created `src/lib/sgtx/canonical-navigation-registry.ts` + `scripts/cert/validate-registry.ts` | `tests/unit/canonical-registry.test.ts` (11 tests) + `tests/route-coverage/registry-coverage.test.ts` (5 tests) | **FIXED** |

---

## Explicit Unverified Items

The following items were NOT verified in this certification cycle and are reported as **UNVERIFIED**:

1. **Section 14 — Quick actions semantic correctness.** No audit was performed on whether Command Center quick-action buttons accurately represent their behavior (navigation vs. true command execution).
2. **Section 15 — Buyer/Seller dual mode symmetry.** No audit was performed on terminology, permissions, lifecycle paths, APIs, notifications, documents, financial/settlement semantics, or dispute semantics.
3. **Section 17 — Company Admin / Organizational Administration.** `CompanyAdminScreen` exists at `PortalContent.tsx:8320` but its action handlers were not audited for governance or persistence.
4. **Section 18 — Smart Inbox / Worklist / Notifications.** No audit was performed on whether events generate notifications that reach the correct recipient, with deduplication, retry, and cross-portal propagation.
5. **Section 20 — Offline / Mobile / Field Operations.** No audit was performed on offline detection, local durable queue, signed operations, replay protection, conflict handling, or sync.
6. **Section 22 — External Integration Reality.** External adapters were not classified as real/sandbox/simulated/mocked/fixture/placeholder.
7. **Section 31 — Debug Endpoint Security Hardening.** Debug/diagnostic APIs were not audited for credential leakage.
8. **Section 33 — Production Environment Verification.** The Vercel production deployment was NOT re-verified after the CERT-32 changes. The changes are not yet pushed to GitHub. Local dev server: HTTP 200, Brain OS auto-init succeeds.

---

## Production Blockers

These are the **only** unresolved real blockers preventing production readiness:

### P0 Blockers (must fix BEFORE production)

1. **F-05 — Admin impersonation endpoint** (`src/app/api/sgtx/admin/tenant/impersonate/route.ts`) accepts body-supplied `adminGtid` with no session verification. **Fix:** add session verification + admin role check; reject body-supplied `adminGtid`; derive from the verified JWT.
2. **F-06 — Constitutional WASM module reload** (`src/app/api/sgtx/governor/modules/[name]/reload/route.ts:58`) defaults `multisigApproved = true`. **Fix:** default to `false`; require explicit multisig approval.
3. **F-01 — Turso token rotation.** The token is still in ~25 `scripts/` files committed to the public repo. **Fix:** rotate the token on the Turso dashboard, update the Vercel `TURSO_AUTH_TOKEN` env var, then remove the token from the `scripts/` files (replace with `process.env.TURSO_AUTH_TOKEN`).

### P1 Residual Risks (documented, not blocking but should be tracked)

These do NOT block production IF the platform is operated in a controlled demo / pilot environment. They DO block production at scale or in a regulated context.

4. **F-07 — Tenant isolation:** 39/40 routes trust body-supplied tenant IDs.
5. **F-08 — Canonical event emission:** 30/32 mutation routes don't emit Loom events.
6. **F-12 — Governor enforcement:** 8/14 lifecycle transitions skip the Governor.
7. **F-13 + F-14 — OPA / WasmEdge:** policies not loaded; runtime is a TS simulation.
8. **F-15 — State vector:** not wired to mutations.
9. **F-16 — Lifecycle events:** 13/14 transitions don't emit canonical events.
10. **F-17 — USTN lineage:** breaks at quote/submission/dispute layer.
11. **F-23 — Test coverage:** 6 of 8 golden flows not tested.

---

## Residual Risk

### Honest Assessment

The SGTX platform has the architectural skeleton of a governed trade execution engine (396 Prisma models, Governor library, OPA Rego policies, WasmEdge module registry, canonical event spine, Loom hash chain, FeeLock non-custodial design, 12 portals, 204 tabs). It also has working demo flows (verified end-to-end on Vercel production in the previous cycle).

What it does NOT have is the **wiring** that makes the governance real:

* The Governor library exists but is not called by most mutations.
* The OPA Rego policies exist on disk but no runtime evaluates them.
* The WasmEdge module registry is metadata; no `.wasm` bytecode is loaded.
* The canonical event spine exists but mutations don't emit events.
* The state vector exists in the schema but is not written to.
* The USTN is minted but only propagates to 2 of 5+ related entities.
* The lifecycle is modeled in code but 13/14 transitions don't emit canonical events.
* The 4 clocks (execution/financial/legal/physical) exist as fields but stay at F0/PENDING.

This means the SGTX platform, as it stands, is a **well-structured demo** that renders 12 portals with realistic data and lets a user walk through a trade, but the **governance guarantees the blueprint describes are not enforced**. A malicious or compromised authenticated user can:

* Sign a contract as any party (body-supplied tenant ID).
* File a customs declaration as any broker.
* Freeze any FeeLock.
* Issue admin impersonation audit entries.
* Hot-reload constitutional WASM modules.
* Trigger mutations that don't appear in the Loom hash chain.

### What a Production-Ready SGTX Requires

1. **Fix the 3 P0 blockers** (admin impersonation, WASM reload, token rotation).
2. **Wire the Governor** into the 8 transitions that skip it; pass `traderMode`+`actorRole`+`payload` to `governorDecide`.
3. **Load the OPA Rego policies** via an OPA WASM runtime (e.g. `@open-policy-agent/opa-wasm`).
4. **Replace the WasmEdge TS simulation** with real `.wasm` bytecode + Ed25519 signatures + multisig.
5. **Wire `appendEvent`** into every mutation so the Loom hash chain is complete.
6. **Wire `updateStateDomain`** into every lifecycle mutation so the state vector is real.
7. **Propagate the USTN** to ServiceQuotation, BuyerSubmission, and pre-lock Dispute entities.
8. **Derive the tenant from the JWT** (not the body) in all 1,300+ `/api/sgtx/*` routes.
9. **Implement the 6 missing golden flows** as Playwright E2E tests.
10. **Add per-portal functional tests** for all 12 portals.

Each of these is a multi-day to multi-week workstream. The platform is NOT a "few bug fixes away from production" — it requires a sustained engineering investment to close the gap between the architectural skeleton and the governed execution chain the blueprint describes.

### Final Statement

**SGTX is NOT production-ready.**

This report does not downgrade any severity to reach a PASS verdict. The 3 P0 fixes (backdoor password, dev-mode bypass, Turso JWT in production runtime) are real and tested. The 2 remaining P0 blockers (admin impersonation, WASM reload) and the 6 P1 residual risks are documented honestly. The 8 unverified sections are reported as UNVERIFIED, not as PASS.

The next remediation cycle must:
1. Fix the 3 P0 blockers.
2. Wire the Governor / OPA / WasmEdge / event-spine / state-vector / USTN propagation chains.
3. Derive tenant from the JWT in all routes.
4. Implement the 6 missing golden flows + 12 portal functional tests.
5. Re-run this certification report.

Until then, the platform is suitable for **controlled demo and pilot use only**, with the explicit understanding that the governance guarantees the blueprint describes are not yet enforced.
