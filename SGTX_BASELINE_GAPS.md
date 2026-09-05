# SGTX Baseline Inventory — Gap Analysis (AUDIT-1)

**Task ID**: AUDIT-1
**Auditor**: Z.ai Code (research-only audit)
**Date**: 2025-09-03
**Scope**: Machine-readable baseline inventory of `/home/z/my-project` (the SGTX repository)
**Companion file**: `SGTX_BASELINE_INVENTORY.json`

This document lists the **Top 15 gaps** identified while building the baseline inventory. Each gap includes a severity (P0/P1/P2), concrete evidence (file:line), and a remediation recommendation.

> **Honour note**: Numbers below were re-verified at audit time using `rg`/`Grep`. Where a previous worklog claimed a number that I could not reproduce, I marked the discrepancy explicitly rather than parroting the prior figure.

---

## Inventory size — summary

| Dimension | Count | Source of truth |
|---|---:|---|
| Portals (in `portal-config.ts`) | 12 | `src/lib/sgtx/portal-config.ts` (lines 47–510) |
| Total tabs across all portals | 204 | Sum of `tabs[]` per portal |
| API routes (`route.ts` files) | 1,351 | `find src/app/api -name route.ts` |
| Routes under `/api/sgtx/*` | 1,334 | Same |
| Routes under `/api/v1/*` | 15 | Same |
| Other (`/api/route.ts`, `/api/openapi.json/route.ts`) | 2 | Same |
| Prisma models in `prisma/schema.prisma` | 396 | `grep -E '^model ' prisma/schema.prisma` |
| Components (`.tsx` under `src/components/`) | 123 | `find src/components -name '*.tsx'` |
| `PortalContent.tsx` size | 680 KB / 11,149 lines | `ls -la` + `wc -l` |
| Canonical event types (`EVENT_TYPES`) | 60 | `src/lib/sgtx/event-spine/index.ts` |
| RBAC roles | 4 (`OWNER`, `ADMIN`, `OPERATOR`, `USER`) | `src/lib/sgtx/governor/policies.ts` + `governor/index.ts` |
| RBAC actions | 6 canonical (`contract.sign`, `trade.create`, `fee.collect`, `financing.request`, `dispute.file`, `settlement.approve`) | Same |
| Customs-gateway adapter files | 12 (10 country + 1 EU gateway w/ 3 sub-files) | `src/lib/sgtx/customs-gateway/adapters/` |
| Shipping-client files | 6 | `src/lib/sgtx/shipping/` |
| Files containing a hardcoded GTID | 66 (192 occurrences total) | `rg 'SGTX-[A-Z]{2}-[A-Z]{3}-\d{6}-[A-F0-9]{4}'` |
| Files starting with `@ts-nocheck` | 882 | `rg -l '@ts-nocheck' src/` |
| Truly-empty catch blocks `catch (e) {}` | 1 | `rg -U 'catch\s*\([^)]*\)\s*\{\s*\}'` |
| Catch blocks with comment-only body | 87 | `rg -U 'catch\s*\([^)]*\)\s*\{\s*//'` |
| Test files (`*.test.*`, `*.spec.*`) | **0** | Glob search |
| CI workflow files | 1 (`.github/workflows/ci.yml`) | `ls .github/workflows/` |
| Genuine `TODO` / `FIXME` markers | 4 | `rg -i 'TODO\|FIXME'` |

---

## Top 15 gaps

### G1 — P0 — Zero automated test coverage

**Evidence**
- `find / -name '*.test.*' -o -name '*.spec.*'` (excluding `node_modules`) → **0 files**.
- No `jest.config.*`, `vitest.config.*`, `playwright.config.*`, or `cypress.config.*` exists in the repo.
- `package.json` `scripts` contains only `dev`, `build`, `start`, `lint`, and `db:*` — **no `test` script**.
- `.github/workflows/ci.yml` has three jobs (`lint-typecheck`, `build`, `db-check`) but **no `test` job**.

**Impact**
Any regression in the 1,351 API routes, 396 Prisma models, 123 components, or the 60-event spine is undetectable until it surfaces in production. The 204 portal tabs and 12 portal dispatchers rely entirely on manual smoke-testing (the screenshots in `audit-screenshots/` are the only evidence of UI behaviour).

**Remediation**
- Add `vitest` (unit) + `playwright` (e2e for the 12 portals × 204 tabs).
- Add a CI `test` job that gates merges on at least: (a) every `governor/index.ts` `actionPerms` entry must be hit by a test, (b) every `EVENT_TYPES` entry must be hit by an append/scan test, (c) every portal tab id in `portal-config.ts` must be a key in the dispatcher switch in `PortalContent.tsx`.
- Re-enable `tsc --noEmit` as a hard CI gate once test coverage exists to catch the type errors that will surface.

---

### G2 — P0 — `PortalContent.tsx` dispatcher has a silent fallback that masks unknown tabs

**Evidence**
- `src/components/portals/PortalContent.tsx:10009` — `// Fallback`
- `src/components/portals/PortalContent.tsx:10010` — `return <CommandCenter portal={portal} data={data} />;`

The dispatcher `PortalContent({portal, data})` (defined at line 9,671) walks ~3,300 lines of `if (tab === "...")` branches and falls through to rendering `<CommandCenter>` if no branch matches. There is no `console.warn`, no error boundary, no telemetry — a misspelled tab id (e.g. typo in `portal-config.ts` or stale persisted `activeTab` in the Zustand store) renders the Command Center silently.

**Impact**
The `audit-screenshots/nav-audit-v2/*-errors.txt` artefacts in the repo already show per-portal error dumps — this fallback is exactly the kind of fault that would hide them in production.

**Remediation**
Replace the final fallback with:
```ts
console.warn(`[PortalContent] Unknown tab "${tab}" for portal "${portal.id}"`);
return <UnknownTabScreen tab={tab} portalId={portal.id} />;
```
(or throw to the nearest error boundary). Add a test that asserts every `portal.tabs[].id` resolves to a non-fallback branch.

---

### G3 — P0 — `src/app/page.tsx` has no fallback for an unknown `view` state

**Evidence**
- `src/app/page.tsx:24–65` — 7 view states are checked with `view === "..."` but no `else` branch.
- If `useAppStore.getState().view` is `undefined` (e.g. persisted state from an old schema after an upgrade) the SPA renders **nothing** with no diagnostic.

**Impact**
A user with a stale `localStorage` payload (the store uses `persist`) sees a blank screen on load — no error, no recovery path.

**Remediation**
Add a default `<UnknownViewState />` fallback that calls `useAppStore.getState().reset()` to return to `"landing"`. Also pin a `version` field in the persisted store schema (`persist({version: 1, migrate: ...})`) so old payloads migrate or reset cleanly.

---

### G4 — P1 — No canonical route registry — 1,351 routes are file-based only

**Evidence**
- The only manifest is `/api/openapi.json/route.ts` (a single file), generated ad-hoc at request time.
- There is no central table mapping `route path → handler file → required permission → middleware chain → tags`.
- `src/lib/sgtx/integration-catalog/index.ts` exists for **external** integrations (per worklog), but no equivalent for SGTX's own routes.

**Impact**
- Cannot run a single audit asserting "every route that mutates state calls `governorDecide()`".
- Cannot grep for "which routes require `OWNER` role" without scanning 1,351 files.
- Cannot detect orphaned routes (a tab id whose API route was deleted).

**Remediation**
Build `src/lib/sgtx/route-registry.ts` exporting an array of `{ path, file, methods, requiredRole, governorAction, tags }`. Generate it from a per-route JSDoc annotation (`@route META` block) parsed at build time. Wire `readiness/governor-coverage/route.ts` to read from it.

---

### G5 — P1 — RBAC permission map is duplicated in two places that can drift

**Evidence**
- `src/lib/sgtx/governor/policies.ts` lines 1–80 — Rego source: `permissions := { "OWNER": {...}, "ADMIN": {...}, "OPERATOR": {...} }` (the canonical OPA policy).
- `src/lib/sgtx/governor/index.ts` lines 233–240 — TypeScript mirror: `const actionPerms = { "contract.sign": ["OWNER","ADMIN","OPERATOR"], ... }` (6 actions).
- The two maps have **inconsistent shapes** (Rego is `role → action → bool`; TS is `action → role[]`) and the TS one has fewer actions than the Rego one. There is no test asserting equality.

**Impact**
A Rego change that grants a new permission can land in production while the TS gate still denies it (or vice-versa). The Governor's RBAC verdict can disagree with OPA's verdict on the same input.

**Remediation**
- Generate `governor/index.ts` `actionPerms` from `policies.ts` at build time (parse Rego with `@openapolicy/regokt` or hand-roll).
- Add a CI test that runs `opa eval` on the canonical Rego and `governorDecide()` on the same input for every `action × role` combination and asserts identical verdicts.

---

### G6 — P1 — `tsc --noEmit` runs with `continue-on-error: true` in CI

**Evidence**
- `.github/workflows/ci.yml:52` — `continue-on-error: true` for the `Type check (tsc --noEmit)` step.
- The surrounding comment explicitly says: *"TODO(IMPL-11): tighten this to `continue-on-error: false` once the pre-existing TypeScript errors in `scripts/` and `upload/` (flagged in IMPL-2/IMPL-3/IMPL-5/IMPL-8 worklogs) are resolved."*
- 882 files in `src/` start with `@ts-nocheck` (re-verified: `rg -l '@ts-nocheck' src/ | wc -l` → 882).

**Impact**
Type-safety is effectively opt-in. A typo in a route handler (e.g. `req.tenantGtid` vs `req.tenantgtid`) ships to production as long as the file has `@ts-nocheck`. The previous worklog already documented this but it remains unresolved.

**Remediation**
- Track the 882-file cleanup in a quarterly project; convert in batches by domain (e.g. all `pdpl/` routes first, then `transport/`, then `regulatory/`).
- Make `continue-on-error: false` the goal for `IMPL-11`. Until then, add a "Type Error Count" metric to CI that fails if the count grows (delta from main).

---

### G7 — P1 — `PortalContent.tsx` is a 680 KB / 11,149-line monolith

**Evidence**
- `ls -la src/components/portals/PortalContent.tsx` → 680,525 bytes
- `wc -l src/components/portals/PortalContent.tsx` → 11,149 lines
- `src/components/portals/lazy-portals.tsx:5–8` (comment) acknowledges the file is a "8,300-LOC" (now 11,149) single-file dispatcher and explicitly lists 8 heavyweight screens that should be extracted.
- `next.config` Babel warning during `bun run lint` (per prior worklog) flags this file as >500 KB.

**Impact**
- Every code change to any single screen forces re-bundling of the entire 680 KB chunk.
- The `lazy-portals.tsx` `dynamic()` wrappers do **not** achieve code-splitting today — they all `import("./PortalContent")`, which still pulls the whole file.
- Code-review on a 11,149-line file is impractical; defects (e.g. the G2 silent fallback) survive undetected.

**Remediation**
- Physically extract the 8 wrapped screens in `lazy-portals.tsx` (`CommandCenter`, `NewTradeRequestScreen`, `QuoteBuilderScreen`, `ContractSigningScreen`, `ShipmentsMilestoneScreen`, `SettlementScreen`, `DistressedCargoScreen`, `DisputesScreen`) into `src/components/portals/screens/<Name>.tsx` files.
- Swap each `() => import("./PortalContent").then(m => m.X)` to `() => import("./screens/X")` (one-line change per the lazy-portals.tsx comment).
- Target: `PortalContent.tsx` < 2,000 lines, one file per screen.

---

### G8 — P1 — Hardcoded actor GTIDs in production API routes

**Evidence** (all are routes that write to the database / send notifications)
- `src/app/api/sgtx/sar/route.ts:67` — `const COMPLIANCE_OFFICER_GTID = "SGTX-EG-GOV-000001-9A0B";`
- `src/app/api/sgtx/sar/file/route.ts:76` — `const COMPLIANCE_OFFICER_GTID = "SGTX-EG-GOV-000001-9A0B";`
- `src/app/api/sgtx/gov/certificates/route.ts:75` — `actorGtid: "SGTX-ZZ-ADM-000001-A1B2"` (literal, not from `getCaller(req)`)
- `src/app/api/sgtx/qc-inspections/[id]/upload-report/route.ts:152` — `tenantGtid: "SGTX-EG-SHP-000031-9E8F"` (literal default for the actor)
- `src/app/api/sgtx/release/override/route.ts:21` — `data: { tenantGtid: "SGTX-EG-GOV-000001-9A0B", ... }`

**Impact**
- These routes attribute mutations to a fixed demo tenant instead of the authenticated caller. The Loom hash chain (which the blueprint says is the immutable audit trail) records the wrong actor.
- A real Platform Governance Authority tenant (replacing `SGTX-ZZ-ADM-000001-A1B2`) will never see its actions in the audit trail; the demo tenant will accumulate unearned activity.

**Remediation**
- Replace each literal with `const caller = getCaller(req); const actorGtid = caller.tenantGtid ?? <env-configured fallback>;`
- For SAR/compliance-officer cases, look up the officer GTID from a `PlatformConfig` Prisma model rather than a constant.

---

### G9 — P1 — `trader-dual` GTID defined in store but no matching portal entry

**Evidence**
- `src/store/app-store.ts:41–55` — `PORTAL_DEFAULT_TENANT` has 13 keys, including `"trader-dual": "SGTX-VN-TRD-005521-3D9E"`.
- `src/lib/sgtx/portal-config.ts` defines exactly 12 portals (no `trader-dual`).
- `trader-seller.dualMode: true` exists (`portal-config.ts:129`), so dual-mode is a *toggle within* `trader-seller`, not a separate portal.

**Impact**
- The dual-mode toggle in `PortalShell.tsx:505/782` swaps between `SGTX-DE-TRD-001234-5B6C` (buyer) and `SGTX-EG-TRD-002139-7F3A` (seller) — **never** the `trader-dual` GTID. The `SGTX-VN-TRD-005521-3D9E` key is dead data.
- New developers will assume `trader-dual` is a real portal and waste time hunting for its tab set.

**Remediation**
- Delete the `"trader-dual"` key from `PORTAL_DEFAULT_TENANT` if it has no live consumer.
- OR document in a comment that it is a reserved GTID for a future "Dual Trader" tenant type and wire `PortalShell.tsx`'s dual-mode toggle to use it (the blueprint's trader-dual intent).

---

### G10 — P1 — `governor/policy-author/route.ts` has a stubbed permission lookup

**Evidence**
- `src/app/api/sgtx/governor/policy-author/route.ts:52` — `# TODO: implement permission lookup`
- The endpoint accepts a policy-author request but does not actually evaluate whether the caller has permission to author policies. It returns a placeholder.

**Impact**
Any caller can hit this route and bypass policy-author RBAC. The Governor — which the blueprint says is the **constitutional layer** that no actor can override — silently allows an unauthorised author to submit a policy.

**Remediation**
Implement the lookup using `getCaller(req)` + the canonical `actionPerms` map (after fixing G5). Reject with a `403` if `caller.role` is not in `["OWNER"]` for policy-author actions.

---

### G11 — P1 — `passkey.ts` stores WebAuthn credentials in-memory instead of in a Prisma model

**Evidence**
- `src/lib/v1/passkey.ts:139` — `* persist to a 'Passkey' Prisma model (TODO); for now we keep an in-memory`
- The `prisma/schema.prisma` inventory has 396 models, but no `Passkey` model (verified by `grep -E '^model Passkey' prisma/schema.prisma` → empty).

**Impact**
- Passkey (WebAuthn) credentials are lost on every serverless cold-boot (Vercel functions are stateless).
- A user who registered a passkey in one Vercel instance cannot authenticate against it on the next request if it lands on a different instance.
- This is a **production-breaking** bug for passkey-only auth flows (the blueprint's strong-auth path).

**Remediation**
- Add `model Passkey { id String @id @default(cuid()); userId String; credentialId String @unique; publicKey Bytes; counter Int; transports String[]; createdAt DateTime @default(now()); }` to `prisma/schema.prisma`.
- Replace the in-memory map in `passkey.ts` with `prisma.passkey.findUnique/create/update`.

---

### G12 — P2 — Caller role is read from a header that downstream code trusts without re-verifying JWT

**Evidence**
- `src/middleware.ts:1041–1048` — middleware injects `x-role`, `x-tenant-gtid`, `x-employee-id`, `x-mfa-verified` from the verified JWT into request headers.
- `src/lib/sgtx/auth/caller.ts:14` — `const role = req.headers.get("x-role") || "USER";`
- The middleware matcher (`src/middleware.ts:1285–1287`) excludes only static files — every API route goes through middleware, so the header is **normally** set by middleware.

**Impact**
- If a route handler is ever invoked through a path that bypasses middleware (internal server-to-server call, a future `rewrite` in `next.config`, an Edge function not on the matcher), the `x-role` header becomes forgeable by the client.
- A malicious client sending `x-role: OWNER` to a route that skips middleware would be treated as `OWNER`.

**Remediation**
- Either pass the verified `CallerIdentity` object through `req.auth` (Next.js custom property) instead of headers, OR
- Document the invariant "every API route must run under the middleware matcher" in a CI check that fails if `next.config.js` adds a `rewrites` rule pointing at `/api/*` without also extending the matcher.

---

### G13 — P2 — Dual-mode toggle in `PortalShell.tsx` hardcodes the buyer/seller GTID pair

**Evidence**
- `src/components/sgtx/PortalShell.tsx:505` — `const targetTenantGtid = newMode === "BUY" ? "SGTX-DE-TRD-001234-5B6C" : "SGTX-EG-TRD-002139-7F3A";`
- `src/components/sgtx/PortalShell.tsx:782` — same pattern repeated.
- The blueprint's dual-mode toggle is meant for one tenant that has both buyer and seller roles — not for switching to a *different* demo tenant.

**Impact**
In production, a real dual-mode trader (say, GTID `SGTX-VN-TRD-005521-3D9E`) toggling to BUY would suddenly become the German buyer demo tenant (`SGTX-DE-TRD-001234-5B6C`) instead of staying in their own tenant context with buyer role.

**Remediation**
Use `useAppStore.getState().tenantGtid` as the target, and change `setDualMode(mode)` to update the **role context** within the same tenant, not swap the tenant itself. The demo GTIDs belong only in `PORTAL_DEFAULT_TENANT` for unauthenticated demo logins.

---

### G14 — P2 — External adapters list is asymmetric — no unified adapter contract

**Evidence**
- `src/lib/sgtx/customs-gateway/adapters/` has 10 country adapters (`australia-adapter.ts`, `brazil-adapter.ts`, `chile-adapter.ts`, `colombia-adapter.ts`, `egypt-adapter.ts`, `india-adapter.ts`, `singapore-adapter.ts`, `south-korea-adapter.ts`, `us-ace-adapter.ts`, plus `eu-gateway/` w/ 3 files).
- `src/lib/sgtx/shipping/` has 6 client files (`searates-client.ts`, `shipping-lines-db.ts`, `unlocode-full-sync.ts`, `unlocode-sync.ts`, `vessel-finder-client.ts`, `worldwide-port-routes.ts`).
- No shared interface declaration (e.g. `CustomsAdapter`, `ShippingClient`) was found at `src/lib/sgtx/customs-gateway/adapters/index.ts` or in shipping/. Each adapter appears bespoke.

**Impact**
- Adding a new country adapter requires copy-paste from a sibling, with no compile-time guarantee that the new adapter implements all required methods.
- Testing each adapter in isolation is impossible without mocking the bespoke surface.

**Remediation**
Define `export interface CustomsAdapter { submitDeclaration(...): Promise<...>; trackStatus(...): Promise<...>; ... }` in `src/lib/sgtx/customs-gateway/adapters/types.ts` and have each country adapter `implements CustomsAdapter`. Same for shipping clients (`ShippingClient` interface).

---

### G15 — P2 — Inventory-count discrepancy vs prior worklog claims

**Evidence**
This audit re-verified three numbers previously reported in the worklog and found discrepancies:

| Metric | Prior worklog claim | This audit (re-verified) | Verdict |
|---|---:|---:|---|
| Empty catch blocks | 252 | 1 truly empty (`rg -U 'catch\s*\([^)]*\)\s*\{\s*\}'`); 87 with comment-only body | **UNVERIFIED — prior count inflated**. The literal empty pattern matches 1 file; the broader "comment-only swallows" count is 87. |
| `@ts-nocheck` files | 882 | 882 (exact match) | **VERIFIED** |
| Brain OS module files | 30 | not in scope of this audit | UNVERIFIED |
| 1,351 API routes / 396 Prisma models / 204 tabs / 123 components | (stated in this task's brief) | 1,351 / 396 / 204 / 123 (exact match) | **VERIFIED** |

**Impact**
The "252 empty catch blocks" claim in prior worklogs appears to be inflated. Decisions made on that number (e.g. "we have 252 silent failures") will overstate the problem.

**Remediation**
- Re-issue the prior worklog entry correcting the empty-catch count to **1 truly empty + 87 comment-only swallows**.
- Adopt a single canonical measurement command (`rg -U 'catch\s*\([^)]*\)\s*\{\s*//' src/ | wc -l` = 87) for future audits.

---

## Honesty caveats / UNVERIFIED items

- **Brain OS module count (30 files, 43 modules, 74 capabilities)** — claimed in prior worklog, not re-verified by this audit (out of scope).
- **"52/52 blueprint features implemented"** — claimed in prior worklog; this audit did not re-walk the 52 features. The presence of corresponding files (e.g. `RoRoScreen.tsx`, `AirCargoScreen.tsx`, `RailScreen.tsx`, `RoadCorridorScreen.tsx`) was confirmed but the **functional completeness** of each was not assessed.
- **Vercel production HTTP 200 on 12 portals** — claimed in prior worklog; this audit did not make any HTTP calls.
- **"252 empty catch blocks"** — re-measured at **1 truly empty** + **87 comment-only** swallows. The prior figure is likely measuring a different (broader) pattern; recommend aligning on a single regex before re-stating.
- **Loom hash chain (616 references), Ed25519 (424 references), FeeLock (226 references)** — prior worklog numbers, not re-verified by this audit.
- The 488 `placeholder` hits and 135 `mock` hits found by `rg -i` are **mostly legitimate** — JSX `placeholder=` attributes (UI hint text) and mock-data test helpers, not gaps. Only 4 genuine `TODO`/`FIXME` markers exist; they are itemised in gap G10/G11 and the JSON inventory.

---

## File produced by this audit

- `SGTX_BASELINE_INVENTORY.json` (66.9 KB) — full machine-readable inventory.
- `SGTX_BASELINE_GAPS.md` (this file).
