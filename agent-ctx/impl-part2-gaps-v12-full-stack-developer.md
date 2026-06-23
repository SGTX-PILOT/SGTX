# Task: impl-part2-gaps-v12 — Part 2 audit + gap implementation

## Scope
Audit Part 2 (Identity, Tenants & Internal Authority) of the SGTX blueprint v12
(sub-sections 2.0–2.13) against existing implementation, then close every gap
found.

## Source of truth
- `/tmp/blueprint_part2.txt` — 87KB Part 2 text (the ONLY source of truth)
- `/home/z/my-project/worklog.md` — prior agent work records
- Existing implementation under `src/lib/sgtx/identity/`,
  `src/app/api/sgtx/{gtid,onboarding,employee,lifecycle,contacts,readiness,
  trust-passport,sandbox,device}/`, `src/components/sgtx/{OnboardingWizard,
  RegistrationGateway}.tsx`, `prisma/schema.prisma`

## Gaps found + implemented

### Schema (prisma/schema.prisma)
- Extended `Tenant` model: legalNameAr, financierSubtype, lspSubtype, kybStatus,
  pepStatus, trustConfidence, qesCertificateRef, readinessScore,
  readinessLastCalculated, defaultIncoterm, preferredLanguage,
  preferredCurrency, consentSettings, taxId, commercialRegister,
  contactEmail, officeAddress (Part 2.1.10 + 2.11)
- New model `GtidSequence` — atomic per (country, type) sequence counter
  (Part 2.1.4 + 2.1.10)
- New model `GtidRevocationLog` — Part 2.1.8.3 audit trail
- New model `GtidResolutionLog` — Part 2.1.8.2 audit log
- New model `TenantOnboardingState` — 6-step wizard progress (Part 2.2 + 2.11)
- New model `ReadinessChecklistItem` — per-item status for one-click
  remediation (Part 2.8 + 2.11)
- New model `RoleJourneyCompletion` — per-employee journey tracking (Part 2.9
  + 2.11)
- `bun run db:push` synced successfully.

### Library (src/lib/sgtx/identity/gtid.ts) — NEW
- `crc32`, `calculateChecksum`, `formatGtid`, `parseGtid`, `verifyGtid`
- `ENTITY_TYPE_CODES` + `LEGACY_ENTITY_ALIASES` (BANK/PFI → FIN, ADM → GOV,
  MKT → MP), `FINANCIER_SUBTYPES`, `LSP_SUBTYPES`
- `acquireNextSequence`, `generateGtid` — atomic sequence acquisition via
  GtidSequence upsert
- In-memory resolution cache (L1, 5-min TTL, cache key
  `gtid:{gtid}:v:{includeVerified}`) + `invalidateGtidCache`
- `revokeGtid`, `isGtidRevoked`, `reactivateGtid` — Part 2.1.8.3
- `logGtidResolution` — Part 2.1.8.2 audit logging
- Re-exported from `identity/index.ts` via `export * from "./gtid"`

### API routes — NEW
- `POST/GET /api/sgtx/gtid/autocomplete` (A1) — Part 2.1.7.1
- `GET /api/sgtx/gtid/trust-explanation` (A1) — Part 2.1.7.2
- `GET /api/sgtx/gtid/sanctions-badge` (A2) — Part 2.1.7.3
- `POST /api/sgtx/gtid/revoke` — Part 2.1.8.3
- `GET/PUT /api/sgtx/onboarding/state` — Part 2.2 + 2.11
- `GET/POST /api/sgtx/role-journey` — Part 2.9 (9 role journeys, all steps)
- `POST/GET /api/sgtx/trust-passport/revoke` — Part 2.10.4
- `GET /api/sgtx/trust-passport/public-key` — Part 2.10.5 (Ed25519 + Dilithium3)
- `POST /api/sgtx/org-graph/approval-policy` — Part 2.4.2 (AI-assisted
  authoring + create)

### API routes — REWRITTEN/EXTENDED
- `GET /api/sgtx/gtid/resolve` — format+checksum validation, 100/min-tenant +
  30/min-IP rate limits, all 15+ blueprint fields, consent-gated verified
  identifiers, in-memory cache, audit logging, 404 ARCHIVED / 403 SUSPENDED
- `POST /api/sgtx/employee/switch-context` — supports employee lookup,
  allowRoleSwitching=false → 403 SWITCHING_DISABLED, DUAL/VERIFIED/TRD checks,
  rate limit 10/60s, simulated JWT with active_trader_mode_context claim
- `GET/POST /api/sgtx/readiness` — pulls per-item status from
  ReadinessChecklistItem, one-click remediation POST, caches score on Tenant,
  returns band + canCreateTrade + restrictions per Part 2.8.3

### Governor gates (src/lib/sgtx/ai/orchestrator.ts)
- `enforceDualModeGate(input)` — Part 2.3.5. Enforces BUY_ONLY/SELL_ONLY/
  BOTH_MODE action sets. Returns DENY with one-click "Switch to {mode} mode"
  action_url per 2.3.5.2. Handles allowRoleSwitching=false (no switch
  suggestion) and self-sign block for contract.sign.
- `enforceReadinessGate(input)` — Part 2.8.6. 4-band enforcement: ≥100 ALLOW
  (Fully Ready), 85-99 ALLOW (Mostly Ready), 70-84 CONDITIONAL (limited to
  pre-approved corridors OR <$10k trades), <70 DENY (Not Ready).

### Pre-existing TS errors fixed (touched during this audit)
- `readiness/remediate/route.ts` — `label` specified more than once via spread
- `sandbox/reset/route.ts` — `uploaderGtid` doesn't exist on Document; switched
  to `uploadedBy`

## Verification

### Lint
```
npx eslint src/lib/sgtx/identity/ src/app/api/sgtx/gtid/ src/app/api/sgtx/onboarding/
  src/app/api/sgtx/employee/ src/app/api/sgtx/lifecycle/ src/app/api/sgtx/contacts/
  src/app/api/sgtx/readiness/ src/app/api/sgtx/trust-passport/ src/app/api/sgtx/sandbox/
  src/app/api/sgtx/device/ src/app/api/sgtx/role-journey/ src/app/api/sgtx/org-graph/
  src/lib/sgtx/ai/orchestrator.ts
→ exit 0
```

### TypeScript
```
npx tsc --noEmit --skipLibCheck 2>&1 |
  grep -E "(identity|gtid/|onboarding|employee|lifecycle|contacts|readiness|trust-passport|sandbox|device|orchestrator|role-journey|org-graph)"
→ 0 errors in Part 2 paths
```

### Curl tests (all passed)
- POST /api/v1/onboarding/start → GTID issued (SGTX-EG-TRD-008845-6F22)
- GET /api/sgtx/gtid/resolve → 200 with all 15+ fields
- GET /api/sgtx/gtid/resolve?include_verified_ids=true → consent_notice + []
- GET /api/sgtx/gtid/autocomplete → suggestion from recent resolution + ai_hint
- GET /api/sgtx/gtid/trust-explanation → A1 plain-language tooltip (zai)
- GET /api/sgtx/gtid/sanctions-badge → BLOCKED (red, sanctionsCleared=false)
- POST /api/sgtx/gtid/revoke (PLATFORM_SUSPENSION) → REGISTERED→SUSPENDED
- GET /api/sgtx/gtid/resolve after revoke → 403 ACCOUNT_SUSPENDED
- POST /api/sgtx/gtid/revoke (MANUAL_OVERRIDE) → SUSPENDED→ARCHIVED
- GET /api/sgtx/gtid/resolve after archive → 404
- GET/PUT /api/sgtx/onboarding/state → step persistence working
- POST /api/sgtx/employee/switch-context (SELL on DUAL tenant) → JWT issued
- POST /api/sgtx/employee/switch-context (INVALID mode) → 400 INVALID_MODE
- 11 rapid switches → 429 RATE_LIMITED with retry_after
- POST /api/sgtx/org-graph/approval-policy (ai_draft) → A1 draft JSON
- POST /api/sgtx/org-graph/approval-policy (create) → policy persisted
- POST /api/sgtx/trust-passport/generate → triScore + credentialHash
- POST /api/sgtx/trust-passport/share → token issued
- POST /api/sgtx/trust-passport/revoke → token revoked
- GET /api/sgtx/trust-passport/verify?token=… → 403 {valid:false, error:"token revoked"}
- GET /api/sgtx/trust-passport/public-key → Ed25519 + Dilithium3 keys
- GET /api/sgtx/readiness → score 0, band="Not Ready", canCreateTrade=false
- POST /api/sgtx/readiness (mark tax_id COMPLETED) → score recalc
- After all 15 mandatory items COMPLETED → score 100, "Fully Ready"
- GET /api/sgtx/role-journey → 9 journeys, 0% progress initially
- POST /api/sgtx/role-journey (mark step completed) → upserted
- GET /api/sgtx/lifecycle/history → currentState + 8 states enum
- POST /api/sgtx/sandbox/reset (confirm=false) → 400 (expected)
- POST /api/sgtx/device/register → device state=NEW

### Bun script tests for new governor gates (11 cases)
- BUY + trade.request.create → ALLOW
- SELL + trade.request.create → DENY required_mode=BUY
- SELL + exw.lock → ALLOW
- BUY + exw.lock → DENY
- BUY + contract.sign → ALLOW
- contract.sign + self-sign → DENY
- switching disabled → DENY condition_id=switching_disabled
- readiness 100 → ALLOW
- readiness 80 + $5k → CONDITIONAL
- readiness 80 + $50k → DENY
- readiness 50 → DENY

## Out of scope (next iteration)
- Frontend wiring: call /api/sgtx/onboarding/state from OnboardingWizard,
  call /api/sgtx/role-journey from Company Admin, add aria-live announcer +
  radio group semantics to the dual-mode toggle in PortalShell.tsx. These UI
  components already exist and function; this task was backend gap closure.
- Migrating existing ~880 tenants to the new GtidSequence counter (legacy
  count-based generation in /lib/v1/auth.ts still works alongside).
