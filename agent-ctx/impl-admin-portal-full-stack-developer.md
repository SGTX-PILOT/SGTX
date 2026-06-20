# Task impl-admin-portal — Admin Portal UI (Part 12C.11)

**Agent**: full-stack-developer
**Task ID**: impl-admin-portal
**Task**: Implement the missing Admin Portal UI (Part 12C.11) — portal config + 9 screens + wiring + launcher fix.

## Context review
- Read `/home/z/my-project/worklog.md` and `src/lib/sgtx/portal-config.ts` to confirm the Admin Portal (Part 12C.11) was entirely missing from PORTALS even though `PortalLauncher.tsx` already had a hardcoded admin card calling `enterPortal("admin", ...)`. The call silently failed because `PORTAL_MAP["admin"]` was undefined, so `page.tsx`'s `portal = PORTAL_MAP[activePortalId]` returned null and the PortalShell never mounted.
- Reviewed `PortalContent.tsx` (2496 lines) dispatcher pattern: shared screens first, then per-portal blocks, then CommandCenter fallback.
- Reviewed `PortalShell.tsx` — uses `portal.defaultTenantGtid` to load `/api/sgtx/dashboard?tenant=...`. For the admin authority GTID `SGTX-XX-ADM-000001-CORE` (not a real tenant row) the dashboard returns `tenant: null` + empty arrays — the shell still mounts, and the admin screens fetch their own data.
- Audited existing backend APIs: `/api/sgtx/admin/metrics`, `/incidents`, `/threats`, `/sla`, `/multisig`, `/gnn/risk`, `/pqc/public-key`, `/zk/reserve-proof`, `/federated/status`, `/metrics`, `/health`, `/status`, `/integrations`, `/causal/analyze`. Confirmed response shapes against route handlers + prisma schema.
- Discovered the existing `incidents/route.ts`, `multisig/route.ts`, `threats/route.ts` each declared a second handler (`POST_resolve`, `POST_approve`, `POST_mitigate`) as dead code — Next.js App Router only recognises named HTTP verbs. Also no `/api/sgtx/governor/decisions` (plural) route existed.

## Files created (5)

### 1. `src/components/sgtx/admin-screens.tsx` (1634 lines, 9 exported screens + 8 shared helpers)

| Export | Purpose |
|---|---|
| `AdminCommandCenter` | Fetches `/api/sgtx/admin/metrics` (30s auto-refresh). Sovereign banner + 7 grouped section cards (Platform / Security / Operations / Compliance / Logistics / Intelligence / Monitoring) with 18 StatTiles covering every metric the task requested. |
| `AdminMetricsScreen` | Fetches `/api/sgtx/metrics?format=json`, `/api/sgtx/health`, raw Prometheus text from `/api/sgtx/metrics`. Health banner + check breakdown + 8 metric tiles + Component Availability card + Prometheus `<pre>` preview. |
| `AdminIncidentsScreen` | List + filter (ALL/OPEN/INVESTIGATING/RESOLVED/CLOSED). Create form (P0–P3 severity, title, description, affected systems). Resolve modal collects rootCause + resolution, calls `/api/sgtx/incidents/resolve`, renders returned AI post-mortem. P0/P1 escalation warning. |
| `AdminThreatsScreen` | List + source (trivy/falco/wazuh/pentest/manual) + status filters. Severity/source/CVE/MITRE badges. Mitigate button → `/api/sgtx/threats/mitigate`. |
| `AdminMultisigScreen` | List + status filter. Create form (requestType POLICY_UPDATE/ADDON_ACTIVATE/SPECIAL_RATE/CONFIG_ROLLBACK/IMPERSONATION, requesterGtid, JSON payload, requiredApprovals). Quorum progress bar + approval chips. Approve button → `/api/sgtx/multisig/approve`. Approver-GTID input defaults to `SGTX-XX-ADM-000001-CORE`. |
| `AdminAddOnsScreen` | 5 add-on cards in 2-col grid: GNN (fetch risk), PQC (fetch public key), ZK (test reserve proof with inputs), Federated (fetch 3 model cards), Causal (test analyse with sample dispute). Each has status badge. |
| `AdminIntegrationsScreen` | Fetches `/api/sgtx/integrations`. Cards with category-coloured icon, status pill, latency/error/uptime tiles. "Test All" button sequentially hits Nafeza/CargoX/ETA/CBE endpoints and records per-integration reachability. |
| `AdminSlaScreen` | Fetches `/api/sgtx/sla` + `/api/sgtx/status`. Overall-status banner + Component Status grid + Active Incidents list + Upcoming Maintenance list + SLA Metrics table with credits-eligible badge. |
| `AdminAuditScreen` | Fetches `/api/sgtx/governor/decisions` with action/verdict/limit filters. Loom explainer card + filter controls + scrollable decision cards showing action/verdict/actor/USTN/conditions/decisionId/loomHash/signature/AI confidence + tenant-message `<details>`. |

Shared helpers: `jfetch<T>`, `StatTile`, `SectionCard`, `StatusPill`, `SeverityBadge` (P0–P3 + CRITICAL/HIGH/MEDIUM/LOW), `EmptyHint`, `QueryLoading`, `QueryError`.

### 2–5. Supporting API routes (thin wrappers, ~30 lines each)
| Route | Method | Purpose |
|---|---|---|
| `src/app/api/sgtx/governor/decisions/route.ts` | GET | List GovernorDecision records with `?limit` (max 200), `?action`, `?verdict`, `?actorGtid` filters. Returns `{ decisions, total }`. |
| `src/app/api/sgtx/incidents/resolve/route.ts` | POST | `{ incidentId, rootCause, resolution }` → status=RESOLVED + `callAI({ agent: "general", prompt: … })` generates post-mortem (Summary/Timeline/Root Cause/Impact/Action Items, <300 words) stored in `postMortemText`. |
| `src/app/api/sgtx/multisig/approve/route.ts` | POST | `{ requestId, approverGtid }` → pushes to approvals array (rejects duplicates 409), marks APPROVED + executedAt once `approvals.length >= requiredApprovals`. |
| `src/app/api/sgtx/threats/mitigate/route.ts` | POST | `{ threatId, remediationNotes? }` → status=MITIGATED + remediatedAt + appends notes to description. |

## Files modified (4)

| File | Change |
|---|---|
| `src/lib/sgtx/portal-config.ts` | Added 7 icon imports + appended admin PORTALS entry (id=admin, name="Platform Admin", tenantGtid=SGTX-XX-ADM-000001-CORE, icon=Crown, accent=#ca8a04, 9 tabs grouped into Overview/Monitoring/Security/Governance/Platform). |
| `src/store/app-store.ts` | Corrected `PORTAL_DEFAULT_TENANT["admin"]` from `SGTX-EG-GOV-000001-9A0B` (Government's GTID — wrong) to `SGTX-XX-ADM-000001-CORE`. |
| `src/components/sgtx/PortalLauncher.tsx` | Filtered admin out of `PORTALS.map(...)` loop (avoid double-render); rewrote dedicated admin card to pull config from `PORTAL_MAP["admin"]` with proper `defaultTenantGtid`; preserved distinct "constitutional" gold-dashed styling. |
| `src/components/portals/PortalContent.tsx` | Added import block for 9 admin screens; added `if (portal.id === "admin") { … }` dispatcher block before the fallback, mapping each of the 9 tabs to its screen. Admin's first tab is `command-center` (not `command`) so no collision with the shared `if (tab === "command")` handler. |

## Verification
- `cd /home/z/my-project && npx eslint src/lib/sgtx/portal-config.ts src/components/sgtx/admin-screens.tsx src/components/portals/PortalContent.tsx` → **EXIT 0, 0 errors, 0 warnings** (the exact command the task asked for).
- Also ran ESLint on the 4 new API routes, PortalLauncher, and app-store → all clean.
- `npx tsc --noEmit` project-wide → 36 pre-existing errors, **0 in any file I created or modified**. Verified the 3 TS errors in `PortalContent.tsx` (lines 152, 157 — CommandCenter's `cards`/`quickActions` union narrowing) and `PortalLauncher.tsx` (line 114 — `tenant.logoColor`) are pre-existing by confirming they're in code I didn't touch.
- Dev server log shows only `GET / 200` and the environmental `EADDRINUSE` warning (second instance trying to start) — no compilation errors related to admin portal.

## Stage Summary
- Admin Portal (Part 12C.11) is now fully implemented end-to-end and reachable from the launcher's "Platform Admin · Constitutional" card.
- 5 new files (1 screen module + 4 API routes), 4 modified files (portal-config, app-store, PortalLauncher, PortalContent).
- 9 dedicated screens covering: command center, metrics & health, incidents (with AI post-mortem), threats (with mitigate), multisig (with create/approve + quorum progress), add-ons (GNN/PQC/ZK/Federated/Causal with live test buttons), integrations (with Test All button), SLA & status (with maintenance windows), governor audit trail (Loom hash chain).
- All screens match the existing SGTX gold/sovereign theme (`bg-gold-gradient text-sovereign`, `text-gold`, `border-gold/30 bg-gold/5`, `font-display`, tight `text-[0.6rem]/[0.65rem]/[0.7rem]` typography, Framer Motion staggered entrances).
- Uses `useQuery`/`useQueryClient` from @tanstack/react-query for all reads, `toast` from sonner for all feedback, existing shadcn/ui components (Card, Button, Badge, Input, Label, Select, Textarea), Lucide icons.
