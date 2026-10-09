// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Portal #11: Admin Workflow Data
// Creative: Constitutional impact blast radius + multisig signing ceremony +
// tenant impersonation countdown + config diff viewer + incident post-mortem timeline
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Scale, Eye, KeyRound, Server, GitBranch,
  CheckCircle2, AlertTriangle, Clock, ShieldAlert,
  FileText, Users, Zap, Gavel, FileCheck,
  RotateCcw, DollarSign, Settings, Globe2,
} from "lucide-react";

export interface FormField {
  key: string; label: string; type: "text" | "select" | "radio" | "number" | "textarea" | "smart" | "toggle" | "slider";
  options?: string[]; placeholder?: string; aiAssist?: string; defaultValue?: string; required?: boolean;
  min?: number; max?: number; step?: number;
}
export interface WorkflowStep {
  number: number; id: string; name: string; specRef: string; purpose: string; icon: LucideIcon;
  fields: FormField[]; aiSuggestion?: string; governorGate?: string; creativeFeature?: string;
}

export const ADM_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    number: 1, id: "amendment-proposal", name: "Constitutional Amendment Proposal",
    specRef: "§3.6", purpose: "Propose amendment to Layer 0 (immutable) constitution. Requires 3-of-5 multisig + 30-day public notice. A1 generates plain-language summary of impact.",
    icon: Scale, governorGate: "L0 (constitutional)", creativeFeature: "SVG constitutional impact blast radius visualization",
    aiSuggestion: "Proposal: Expand A5 forbidden list — add 'autonomous collateral liquidation' to forbidden actions. Currently A5 = autonomous fund movement, autonomous contract execution, autonomous sanctions bypass. New addition: autonomous collateral liquidation (human must approve all collateral sales). Impact: 3 portals affected (FIN Bank, FIN PFI, GOV). 14 trades in pipeline need review. Timeline: 30-day notice + 3-of-5 multisig.",
    fields: [
      { key: "proposal", label: "Amendment Summary", type: "textarea", defaultValue: "Expand A5 forbidden list: add 'autonomous collateral liquidation' to constitutionally forbidden AI actions. Human compliance officer must approve all collateral sales. Prevents AI from auto-liquidating collateral without human oversight." },
      { key: "layer", label: "Constitutional Layer", type: "radio", options: ["L0 — Immutable (requires 3-of-5 multisig + 30-day notice)", "L1 — Architectural (versioned change control)", "L2 — Implementation (standard review)"], defaultValue: "L0 — Immutable (requires 3-of-5 multisig + 30-day notice)", required: true },
      { key: "a1-summary", label: "A1 Plain-Language Summary (auto-generated)", type: "textarea", defaultValue: "This amendment prevents AI from automatically selling collateral without human approval. Currently, the AI can advise on collateral liquidation but cannot execute it autonomously. This amendment makes that prohibition explicit in the constitution (Layer 0, immutable). Affects: Bank portal, PFI portal, Government portal (where collateral liquidation occurs)." },
    ],
  },
  {
    number: 2, id: "impact-simulation", name: "Impact Simulation (Blast Radius Analysis)",
    specRef: "§3.6, §16.8.6.11", purpose: "Simulate the amendment's impact across the platform. Which portals affected? How many trades impacted? What's the timeline? AI predicts blast radius.",
    icon: Eye, governorGate: "A2 (impact analysis)", creativeFeature: "SVG blast radius showing affected portals + trade count + timeline",
    aiSuggestion: "BLAST RADIUS ANALYSIS:\n• Portals affected: 3 (FIN Bank, FIN PFI, GOV)\n• Trades in pipeline: 14 (8 FIN Bank + 4 FIN PFI + 2 GOV)\n• WASM modules to recompile: 3 (FIN, PFI, GOV policy modules)\n• Timeline: 30-day public notice → multisig → WASM compile → hot reload → verify (total ~35 days)\n• Risk: LOW (amendment restricts AI, doesn't expand — always safer to restrict)\n• Rollback available: previous WASM module archived + hash recorded",
    fields: [
      { key: "portals-affected", label: "Portals Affected", type: "text", defaultValue: "3 portals: FIN Bank (8 trades), FIN PFI (4 trades), GOV (2 trades) = 14 total" },
      { key: "wasm-recompile", label: "WASM Modules to Recompile", type: "text", defaultValue: "3 modules: FIN policy, PFI policy, GOV policy (each ~2KB Rego → WASM)" },
      { key: "timeline", label: "Estimated Timeline", type: "text", defaultValue: "30-day notice → 3-of-5 multisig (instant) → WASM compile (2h) → hot reload (5min) → verify (1h) = ~35 days total" },
      { key: "risk", label: "Risk Assessment", type: "radio", options: ["LOW — amendment restricts AI (safer to restrict than expand)", "MEDIUM — changes enforcement behavior", "HIGH — expands AI authority"], defaultValue: "LOW — amendment restricts AI (safer to restrict than expand)", required: true },
      { key: "rollback", label: "Rollback Available", type: "toggle", options: ["Yes — previous WASM module archived + hash recorded", "No — irreversible"], defaultValue: "Yes — previous WASM module archived + hash recorded", required: true },
    ],
  },
  {
    number: 3, id: "public-notice", name: "Public Notice (30-Day + Comment Period)",
    specRef: "§3.6", purpose: "30-day public notice posted on status page + emailed to all tenants. Comments collected. A1 summarizes feedback. No amendment can proceed until notice period expires.",
    icon: Clock, governorGate: "§3.6 (amendment procedure)", creativeFeature: "SVG countdown timer + public comment tracker",
    aiSuggestion: "PUBLIC NOTICE STARTED.\n• Posted: status.sgtx.platform/amendment/A5-expansion\n• Emailed: 247 tenants (all KYB T2+)\n• Comments received: 3 (2 supportive, 1 concern from PFI about liquidity)\n• A1 summary: 'Majority supportive. PFI concern: restricting autonomous liquidation may slow distressed cargo resolution. Response: human can approve within 2h (same as current avg).'\n• Notice expires: 2026-10-09 23:59 EET (30 days from now)\n• Cannot proceed to multisig until notice expires.",
    fields: [
      { key: "notice-status", label: "Public Notice Status", type: "toggle", options: ["POSTED — 30-day countdown started (expires Oct 9)", "Pending"], defaultValue: "POSTED — 30-day countdown started (expires Oct 9)", required: true },
      { key: "comments", label: "Comments Received", type: "text", defaultValue: "3 comments (2 supportive, 1 concern from PFI about liquidity speed)" },
      { key: "a1-feedback", label: "A1 Feedback Summary", type: "textarea", defaultValue: "'Majority supportive. PFI concern: restricting autonomous liquidation may slow distressed cargo resolution. Response: human compliance officer can approve within 2h (same as current average approval time). No material impact on resolution speed.'" },
      { key: "expires", label: "Notice Expires", type: "text", defaultValue: "2026-10-09 23:59 EET (30 days from Sep 19)" },
    ],
  },
  {
    number: 4, id: "multisig-ceremony", name: "Multisig Signing Ceremony (3-of-5)",
    specRef: "§3.5.9, §3.6", purpose: "After 30-day notice: 3-of-5 multisig members must sign. Visual ceremony: 5 key holders, their approval status, tipping point when 3rd signature collected. A5 forbidden — no autonomous signing.",
    icon: KeyRound, governorGate: "§3.5.9 (multisig 3-of-5)", creativeFeature: "SVG multisig signing ceremony with key holders + tipping point",
    aiSuggestion: "MULTISIG CEREMONY:\n• Member 1 (You): SIGNED ✓ (passkey + biometric, timestamp 09:52)\n• Member 2: SIGNED ✓ (passkey + biometric, timestamp 10:15)\n• Member 3: PENDING (awaiting signature)\n• Member 4: NOT YET REQUESTED\n• Member 5: NOT YET REQUESTED\n• Required: 3-of-5 (2/5 signed, 1 more needed)\n• TIPPING POINT: When Member 3 signs → amendment approved → WASM compilation triggered\n• A5 FORBIDDEN: no autonomous signing, no AI signing, human passkey + biometric only",
    fields: [
      { key: "member1", label: "Member 1 (You)", type: "toggle", options: ["SIGNED ✓ (passkey + biometric, 09:52)", "Pending"], defaultValue: "SIGNED ✓ (passkey + biometric, 09:52)", required: true },
      { key: "member2", label: "Member 2", type: "toggle", options: ["SIGNED ✓ (passkey + biometric, 10:15)", "Pending"], defaultValue: "SIGNED ✓ (passkey + biometric, 10:15)" },
      { key: "member3", label: "Member 3", type: "toggle", options: ["SIGNED ✓ — TIPPING POINT REACHED (3/5)", "Pending — awaiting signature"], defaultValue: "SIGNED ✓ — TIPPING POINT REACHED (3/5)", required: true },
      { key: "a5-forbidden", label: "A5 Forbidden (no AI signing)", type: "toggle", options: ["Confirmed — human passkey + biometric only, AI cannot sign", "N/A"], defaultValue: "Confirmed — human passkey + biometric only, AI cannot sign", required: true },
    ],
  },
  {
    number: 5, id: "wasm-compile", name: "WASM Module Compilation & Signing",
    specRef: "§3.5.5, §3.6", purpose: "After multisig approval: compile new WASM module from Rego policy. Module signed by multisig. Previous module archived + hash recorded. Ready for hot reload.",
    icon: Server, governorGate: "§3.5.5 (WasmEdge engine)", creativeFeature: "SVG compilation pipeline (Rego → WASM → sign → archive)",
    aiSuggestion: "WASM COMPILATION:\n• Source: Rego policy (FIN + PFI + GOV — 3 modules, ~6KB total)\n• Compiler: OPA → WasmEdge (2h compile time)\n• Signing: multisig Ed25519 signature on compiled module\n• Previous module: archived (hash 0xa3b2...c7d9 recorded permanently)\n• New module hash: 0xf8e1...4b2c\n• Ready for hot reload\n• Rollback: if issue detected, swap to archived module (instant, 5min verify)",
    fields: [
      { key: "compile", label: "WASM Compilation", type: "toggle", options: ["Complete ✓ (3 modules compiled, 2h)", "In progress...", "Failed"], defaultValue: "Complete ✓ (3 modules compiled, 2h)", required: true },
      { key: "signing", label: "Module Signing (multisig Ed25519)", type: "toggle", options: ["Signed ✓ (3-of-5 multisig signature)", "Pending"], defaultValue: "Signed ✓ (3-of-5 multisig signature)", required: true },
      { key: "archive", label: "Previous Module Archived", type: "toggle", options: ["Archived ✓ (hash 0xa3b2...c7d9, permanent record)", "Pending"], defaultValue: "Archived ✓ (hash 0xa3b2...c7d9, permanent record)", required: true },
      { key: "new-hash", label: "New Module Hash", type: "text", defaultValue: "0xf8e1...4b2c (ready for hot reload)" },
    ],
  },
  {
    number: 6, id: "hot-reload", name: "Hot Reload Deployment (Zero Downtime)",
    specRef: "§3.6, §16.8.6.11", purpose: "Deploy new WASM module via hot reload. Zero downtime. Active trades continue under old policy until they complete. New trades use new policy. Verify enforcement.",
    icon: Zap, governorGate: "§3.5.5 (WasmEdge hot reload)", creativeFeature: "SVG deployment pipeline (archive → load → activate → verify)",
    aiSuggestion: "HOT RELOAD DEPLOYMENT:\n• Method: WasmEdge hot reload (zero downtime, no restart)\n• Active trades: 14 continue under OLD policy (archived module) until completion\n• New trades: use NEW policy (A5 expanded — autonomous collateral liquidation forbidden)\n• Verification: test trade submitted with autonomous liquidation request → BLOCKED ✓ (A5 enforced)\n• Rollback window: 24h (if issue detected, swap to archived module, instant)\n• All 8 platform services: healthy during reload (0 disruption)",
    fields: [
      { key: "reload", label: "Hot Reload", type: "toggle", options: ["Complete ✓ (zero downtime, 5min)", "In progress...", "Failed"], defaultValue: "Complete ✓ (zero downtime, 5min)", required: true },
      { key: "active-trades", label: "Active Trades (under old policy)", type: "text", defaultValue: "14 trades continue under OLD policy until completion (grandfathered)" },
      { key: "new-trades", label: "New Trades (under new policy)", type: "text", defaultValue: "All new trades use NEW policy (A5 expanded — autonomous liquidation blocked)" },
      { key: "verify", label: "Enforcement Verification", type: "toggle", options: ["Verified ✓ (test trade with auto-liquidation → BLOCKED, A5 enforced)", "Failed"], defaultValue: "Verified ✓ (test trade with auto-liquidation → BLOCKED, A5 enforced)", required: true },
      { key: "rollback-window", label: "Rollback Window", type: "text", defaultValue: "24h (swap to archived module if issue detected, instant, 5min verify)" },
    ],
  },
  {
    number: 7, id: "tenant-impersonation", name: "Tenant Impersonation (Readonly — if needed)",
    specRef: "§16.8.6.11", purpose: "If investigation requires: impersonate tenant in readonly mode. 30-min timeout. Full audit logging. Tenant notified after session. No write actions. Multisig 3/5 required to initiate.",
    icon: Eye, governorGate: "§16.8.6.11 (impersonation — readonly)", creativeFeature: "SVG readonly session with countdown timer + audit trail",
    aiSuggestion: "TENANT IMPersonation (if needed for investigation):\n• Target: Delta Agro (fraud investigation, SAR pending)\n• Mode: READONLY (all data visible, all write actions BLOCKED)\n• Timeout: 30 minutes (auto-ends, cannot extend without new multisig)\n• Audit: every action logged to Loom (even reads)\n• Notification: Delta Agro notified AFTER session ends (not during, for investigation integrity)\n• Multisig: 3/5 required to initiate (Member 1 + 2 + 3 approved)\n• NOT NEEDED for this amendment workflow — included for completeness",
    fields: [
      { key: "needed", label: "Impersonation Needed?", type: "toggle", options: ["No — not needed for this amendment (included for completeness)", "Yes — investigation requires readonly access"], defaultValue: "No — not needed for this amendment (included for completeness)", required: true },
      { key: "target", label: "Target (if needed)", type: "text", defaultValue: "Delta Agro (GTID SGTX-EG-26-DA2F-0014) — fraud investigation" },
      { key: "mode", label: "Mode", type: "radio", options: ["READONLY (all data visible, all writes BLOCKED)", "Write (FORBIDDEN — A5, never allowed)"], defaultValue: "READONLY (all data visible, all writes BLOCKED)" },
      { key: "timeout", label: "Session Timeout", type: "text", defaultValue: "30 minutes (auto-ends, cannot extend without new multisig 3/5)" },
    ],
  },
  {
    number: 8, id: "config-diff", name: "Configuration Diff & Rollback Verification",
    specRef: "§16.8.6.11", purpose: "Verify all configuration changes. Side-by-side diff (before/after). Rollback tested. Previous config archived. Diff sealed to Loom. All changes auditable.",
    icon: GitBranch, governorGate: "§16.8.6.11 (config history)", creativeFeature: "SVG side-by-side config diff viewer",
    aiSuggestion: "CONFIGURATION DIFF:\n• Before: A5 = [autonomous_fund_movement, autonomous_contract_execution, autonomous_sanctions_bypass]\n• After: A5 = [autonomous_fund_movement, autonomous_contract_execution, autonomous_sanctions_bypass, autonomous_collateral_liquidation]\n• Change: +1 entry (autonomous_collateral_liquidation added to forbidden list)\n• Rollback tested: swap to archived module → all 8 services healthy → A5 = 3 entries (original) ✓\n• Previous config: archived (hash 0xa3b2...c7d9)\n• New config: sealed (hash 0xf8e1...4b2c)\n• Diff sealed to Loom (immutable audit)",
    fields: [
      { key: "diff", label: "Configuration Diff", type: "textarea", defaultValue: "BEFORE: A5_forbidden = [autonomous_fund_movement, autonomous_contract_execution, autonomous_sanctions_bypass]\nAFTER:  A5_forbidden = [autonomous_fund_movement, autonomous_contract_execution, autonomous_sanctions_bypass, autonomous_collateral_liquidation]\nCHANGE: +1 entry (autonomous_collateral_liquidation — NEW)" },
      { key: "rollback-tested", label: "Rollback Tested", type: "toggle", options: ["Tested ✓ (swap to archived → 8 services healthy → A5 = 3 entries original)", "Failed"], defaultValue: "Tested ✓ (swap to archived → 8 services healthy → A5 = 3 entries original)", required: true },
      { key: "archived", label: "Previous Config Archived", type: "toggle", options: ["Archived ✓ (hash 0xa3b2...c7d9, permanent)", "Pending"], defaultValue: "Archived ✓ (hash 0xa3b2...c7d9, permanent)" },
      { key: "sealed", label: "Diff Sealed to Loom", type: "toggle", options: ["Sealed ✓ (immutable audit, hash 0xf8e1...4b2c)", "Pending"], defaultValue: "Sealed ✓ (immutable audit, hash 0xf8e1...4b2c)", required: true },
    ],
  },
  {
    number: 9, id: "loom-seal", name: "Constitutional Amendment Sealed (Loom Immutable)",
    specRef: "§3.6, §3.5.13", purpose: "Amendment sealed on Loom (immutable). Previous module permanently archived. Amendment record published. All tenants notified. Public verification endpoint updated.",
    icon: CheckCircle2, governorGate: "L0 + G7 (constitutional closure)", creativeFeature: "SVG constitutional seal + amendment record",
    aiSuggestion: "CONSTITUTIONAL AMENDMENT SEALED.\n• Amendment: A5 expansion (autonomous_collateral_liquidation forbidden)\n• Loom hash: 0xd4a9...e1f7 (immutable, permanent record)\n• Previous WASM: archived (0xa3b2...c7d9, rollback available)\n• New WASM: deployed (0xf8e1...4b2c, active)\n• Tenants notified: 247 tenants emailed 'Constitutional amendment A5-expansion deployed'\n• Public verify: status.sgtx.platform/amendment/A5-expansion (Loom hash verifiable)\n• Timeline: 35 days total (30-day notice + multisig + compile + deploy + verify)\n• Rollback window: 24h expired (amendment now permanent — requires new amendment to reverse)",
    fields: [
      { key: "sealed", label: "Amendment Sealed on Loom", type: "toggle", options: ["Sealed ✓ (hash 0xd4a9...e1f7, immutable, permanent)", "Pending"], defaultValue: "Sealed ✓ (hash 0xd4a9...e1f7, immutable, permanent)", required: true },
      { key: "previous-archived", label: "Previous WASM Permanently Archived", type: "toggle", options: ["Archived ✓ (0xa3b2...c7d9, rollback available within 24h)", "N/A"], defaultValue: "Archived ✓ (0xa3b2...c7d9, rollback available within 24h)" },
      { key: "tenants-notified", label: "All Tenants Notified", type: "toggle", options: ["Yes ✓ (247 tenants emailed, public status page updated)", "No"], defaultValue: "Yes ✓ (247 tenants emailed, public status page updated)", required: true },
      { key: "public-verify", label: "Public Verification Endpoint", type: "toggle", options: ["Updated ✓ (Loom hash verifiable by any external party)", "Pending"], defaultValue: "Updated ✓ (Loom hash verifiable by any external party)" },
      { key: "timeline", label: "Total Timeline", type: "text", defaultValue: "35 days (30-day notice + multisig instant + 2h compile + 5min deploy + 1h verify)" },
    ],
  },
];

export interface DownstreamPhase {
  phase: string; name: string; specRef: string; status: "complete" | "active" | "pending" | "blocked";
  description: string; governorGate: string; icon: LucideIcon;
}

export const ADM_DOWNSTREAM_PHASES: DownstreamPhase[] = [
  { phase: "Phase 1", name: "Amendment Proposed", specRef: "§3.6", status: "complete", description: "A5 expansion: add autonomous_collateral_liquidation to forbidden. L0 immutable. A1 summary generated.", governorGate: "L0", icon: Scale },
  { phase: "Phase 2", name: "Impact Simulated (Blast Radius)", specRef: "§3.6", status: "complete", description: "3 portals affected (FIN/PFI/GOV). 14 trades in pipeline. 3 WASM modules. 35-day timeline. Risk LOW.", governorGate: "A2", icon: Eye },
  { phase: "Phase 3", name: "Public Notice (30-Day Countdown)", specRef: "§3.6", status: "complete", description: "Posted + emailed 247 tenants. 3 comments (2 supportive, 1 PFI concern). A1 summary: no material impact.", governorGate: "§3.6", icon: Clock },
  { phase: "Phase 4", name: "Multisig 3-of-5 Signed", specRef: "§3.5.9", status: "complete", description: "Member 1+2+3 signed. Tipping point reached. A5 forbidden (human passkey + biometric only).", governorGate: "§3.5.9", icon: KeyRound },
  { phase: "Phase 5", name: "WASM Compiled + Signed", specRef: "§3.5.5", status: "complete", description: "3 modules compiled (2h). Multisig Ed25519 signed. Previous archived (0xa3b2). New hash 0xf8e1.", governorGate: "§3.5.5", icon: Server },
  { phase: "Phase 6", name: "Hot Reload Deployed", specRef: "§3.6", status: "active", description: "Zero downtime. 14 active trades grandfathered (old policy). New trades use new A5. Verified ✓.", governorGate: "§3.5.5", icon: Zap },
  { phase: "Phase 7", name: "Tenant Impersonation (if needed)", specRef: "§16.8.6.11", status: "pending", description: "Not needed for this amendment. Included for completeness: readonly, 30-min, audit, multisig 3/5.", governorGate: "§16.8.6.11", icon: Eye },
  { phase: "Phase 8", name: "Config Diff + Rollback Verified", specRef: "§16.8.6.11", status: "pending", description: "Diff: +1 A5 entry. Rollback tested (swap → 8 services healthy). Previous archived. Loom sealed.", governorGate: "§16.8.6.11", icon: GitBranch },
  { phase: "Phase 9", name: "Constitutional Seal (Loom)", specRef: "§3.6, §3.5.13", status: "pending", description: "Sealed 0xd4a9. Previous WASM archived. 247 tenants notified. Public verify updated. 35-day total.", governorGate: "L0 + G7", icon: CheckCircle2 },
];

export const ADM_VALIDATION_GATES = [
  { gate: "L0", name: "Constitutional Layer", description: "Amendment to L0 (immutable). Requires 3-of-5 multisig + 30-day public notice.", status: "pass" },
  { gate: "§3.5.9", name: "Multisig 3-of-5", description: "3 of 5 members signed (passkey + biometric). A5 forbidden — no AI signing.", status: "pass" },
  { gate: "§3.6", name: "Public Notice", description: "30-day notice completed. 3 comments reviewed. No blocking objections.", status: "pass" },
  { gate: "§3.5.5", name: "WASM Compiled + Signed", description: "3 modules compiled, multisig Ed25519 signed, previous archived.", status: "pass" },
  { gate: "§3.5.5", name: "Hot Reload", description: "Zero downtime deployed. 14 trades grandfathered. New A5 enforced. Verified ✓.", status: "pass" },
  { gate: "§16.8.6.11", name: "Config Diff", description: "Diff: +1 A5 entry. Rollback tested. Previous archived. Loom sealed.", status: "pass" },
  { gate: "A5", name: "A5 Forbidden (AI signing)", description: "Confirmed — human passkey + biometric only. AI cannot sign constitutional amendments.", status: "pass" },
  { gate: "G7", name: "Constitutional Closure", description: "Amendment sealed on Loom (0xd4a9). Permanent. Public verify endpoint updated.", status: "pass" },
];

export const ADM_SETTLEMENT_SUMMARY = {
  amendment: "A5 expansion — autonomous_collateral_liquidation added to forbidden list",
  layer: "L0 (immutable constitutional)",
  portalsAffected: "3 (FIN Bank, FIN PFI, GOV)",
  tradesInPipeline: "14 (8 FIN Bank + 4 FIN PFI + 2 GOV — grandfathered under old policy)",
  wasmModules: "3 compiled + multisig signed (hash 0xf8e1...4b2c)",
  previousWasm: "Archived (hash 0xa3b2...c7d9, rollback available 24h)",
  publicNotice: "30 days (Sep 19 → Oct 9), 3 comments (2 supportive, 1 PFI concern resolved)",
  multisigSignatures: "3-of-5 (Members 1+2+3, passkey + biometric, A5 forbidden)",
  deployment: "Hot reload, zero downtime, 5min, 14 trades grandfathered",
  enforcementVerified: "Test trade with auto-liquidation → BLOCKED (A5 enforced)",
  rollbackTested: "Swap to archived → 8 services healthy → A5 = 3 entries (original)",
  totalTimeline: "35 days (30-day notice + multisig instant + 2h compile + 5min deploy + 1h verify)",
  loomSealHash: "0xd4a9...e1f7 (immutable, permanent constitutional record)",
  tenantsNotified: "247 tenants emailed + public status page updated",
  publicVerifyEndpoint: "status.sgtx.platform/amendment/A5-expansion (Loom hash verifiable)",
};

export const ADM_CLOSURE_CONDITIONS = [
  { name: "Amendment proposed + A1 summary generated", status: "pending" as const },
  { name: "Impact simulated (blast radius: 3 portals, 14 trades, 35-day timeline)", status: "pending" as const },
  { name: "30-day public notice completed (3 comments reviewed)", status: "pending" as const },
  { name: "Multisig 3-of-5 signed (passkey + biometric, A5 forbidden)", status: "pending" as const },
  { name: "WASM compiled + signed + previous archived", status: "pending" as const },
  { name: "Hot reload deployed (zero downtime, enforcement verified)", status: "pending" as const },
  { name: "Constitutional seal on Loom (immutable, public verify available)", status: "pending" as const },
];

// SVG DATA: Constitutional impact blast radius (portals affected)
export const BLAST_RADIUS_PORTALS = [
  { name: "FIN Bank", x: 20, y: 30, affected: true, trades: 8, severity: "medium" },
  { name: "FIN PFI", x: 50, y: 20, affected: true, trades: 4, severity: "low" },
  { name: "GOV", x: 80, y: 30, affected: true, trades: 2, severity: "low" },
  { name: "Trader Buyer", x: 15, y: 60, affected: false, trades: 0, severity: "none" },
  { name: "Trader Seller", x: 35, y: 65, affected: false, trades: 0, severity: "none" },
  { name: "LSP", x: 55, y: 65, affected: false, trades: 0, severity: "none" },
  { name: "SHIP", x: 75, y: 65, affected: false, trades: 0, severity: "none" },
  { name: "LAB", x: 90, y: 60, affected: false, trades: 0, severity: "none" },
];

// SVG DATA: Multisig key holders (5 members)
export const MULTISIG_HOLDERS = [
  { id: 1, name: "You", signed: true, timestamp: "09:52" },
  { id: 2, name: "Member 2", signed: true, timestamp: "10:15" },
  { id: 3, name: "Member 3", signed: true, timestamp: "10:42", tipping: true },
  { id: 4, name: "Member 4", signed: false, timestamp: "—" },
  { id: 5, name: "Member 5", signed: false, timestamp: "—" },
];

// SVG DATA: Config diff (before/after)
export const CONFIG_DIFF = {
  before: ["autonomous_fund_movement", "autonomous_contract_execution", "autonomous_sanctions_bypass"],
  after: ["autonomous_fund_movement", "autonomous_contract_execution", "autonomous_sanctions_bypass", "autonomous_collateral_liquidation"],
  added: ["autonomous_collateral_liquidation"],
  removed: [],
};

// SVG DATA: WASM compilation pipeline
export const WASM_PIPELINE = [
  { stage: "Rego Source", status: "complete", duration: "—" },
  { stage: "OPA Compile", status: "complete", duration: "1h 20m" },
  { stage: "WasmEdge Pack", status: "complete", duration: "25m" },
  { stage: "Multisig Sign", status: "complete", duration: "5m" },
  { stage: "Archive Previous", status: "complete", duration: "2m" },
  { stage: "Hot Reload", status: "complete", duration: "5m" },
  { stage: "Verify Enforcement", status: "complete", duration: "1h" },
];
