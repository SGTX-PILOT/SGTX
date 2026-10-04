// @ts-nocheck
// =============================================================================
// SGTX v18 §3 — Constitutional Foundation (Layer 0 — Immutable)
// -----------------------------------------------------------------------------
// This module is the canonical source of truth for the seven Governor
// Principles (G1–G7), the 38-Point Transaction Constitution (Points 1–29 +
// 30–38), the AI Authority Ladder (A0–A5), the AI Agent Registry, and the
// three-tier fallback chains. It is consumed by:
//
//   • /api/v1/constitution               — public canonical mirror
//   • /api/sgtx/constitution             — internal mirror (auth required)
//   • /admin (Constitutional Policies panel) — for visualisation
//   • Governor service                   — for enforcement metadata
//
// Every entry matches v18 §3 exactly. Layer 0 invariants may not be modified
// at runtime; amendment requires 3-of-5 multisig plus 30-day notice (§3.6).
// =============================================================================

// ============ v18 §3.1 — Governor Principles (G1–G7) ============

export interface GovernorPrinciple {
  id: string; // "G1".."G7"
  name: string;
  statement: string;
  enforcement: string;
  fullText: string; // long-form enforcement paragraph
}

export const GOVERNOR_PRINCIPLES: GovernorPrinciple[] = [
  {
    id: "G1",
    name: "Execution Always Gated",
    statement:
      "Every irreversible action requires Governor approval before execution",
    enforcement: "All mutating API endpoints call governorDecide()",
    fullText:
      "The Governor is a Rust Axum service that intercepts every API request that modifies state. Every mutating endpoint calls `governorDecide()` with the actor, the action, and the full transactional context before any state change is committed. The API Gateway routes all mutating traffic through the Governor proxy, so an ungated state change cannot be constructed — there is no administrative bypass and no direct database path that skips the Governor.",
  },
  {
    id: "G2",
    name: "OPA Enforced",
    statement: "Open Policy Agent evaluates every decision against authored policies",
    enforcement: "OPA sidecar; DENY is blocking",
    fullText:
      "Open Policy Agent (OPA) evaluates every decision against authored Rego policies running as a sidecar next to the Governor. A DENY verdict from OPA is blocking; no downstream component can override it. Policies can be hot-reloaded only after multisig approval, and the policy version used in each decision is recorded with that decision.",
  },
  {
    id: "G3",
    name: "WasmEdge Constitutional",
    statement: "Constitutional rules execute as deterministic WebAssembly modules",
    enforcement: "Compiled from Layer 0; cannot be overridden",
    fullText:
      "Constitutional rules execute as deterministic WebAssembly (WASM) modules in the WasmEdge runtime. The modules are compiled from Layer 0, signed by the Platform Governance Authority, sandboxed with no network or filesystem access, and bounded by a hard 50 ms execution timeout. They cannot be overridden by any user, administrator, or application code.",
  },
  {
    id: "G4",
    name: "Loom Audited",
    statement: "Every decision appended to the SHA-256 hash-chained Loom audit log",
    enforcement: "Immutable, append-only, externally verifiable",
    fullText:
      "Every Governor decision is appended to the Loom audit log — a purpose-built, SHA-256 hash-chained, append-only ledger. The chain is externally verifiable: any tenant or external auditor holding a verification token can replay it from genesis. A background verifier recalculates the full chain every hour; any mismatch raises a P0 incident and alerts the Platform Governance Authority.",
  },
  {
    id: "G5",
    name: "Multisig for Irreversible",
    statement: "Irreversible actions require multisig (2-of-3 standard, 3-of-5 constitutional)",
    enforcement: "Qualified Electronic Signature required",
    fullText:
      "Irreversible actions require multisignature approval — 2-of-3 for standard irreversible actions and 3-of-5 for constitutional (Layer 0) changes — with a Qualified Electronic Signature (QES) required where the action carries legal effect.",
  },
  {
    id: "G6",
    name: "AI Advisory Only",
    statement:
      "AI (A1–A3) proposes, explains, classifies, escalates — never executes",
    enforcement: "A4 is deterministic policy execution, not AI autonomy",
    fullText:
      "AI at authority levels A1–A3 proposes, explains, classifies, and escalates; it never executes. Level A4 is deterministic policy execution by the Governor, OPA, and WasmEdge under pre-authorised rules — not AI autonomy. Level A5 (autonomous AI execution) is constitutionally prohibited and blocked at WASM compile time.",
  },
  {
    id: "G7",
    name: "Bank-Authoritative Settlement",
    statement: "Banks confirm settlement; SGTX orchestrates but never settles",
    enforcement: "Bank Settlement Gateway is non-custodial",
    fullText:
      "Banks confirm settlement. SGTX orchestrates payment instructions through the non-custodial Bank Settlement Gateway but never holds, moves, or settles customer funds itself (see Sections 13 and 19).",
  },
];

// ============ v18 §3.2 — The 29-Point Transaction Constitution ============

export interface ConstitutionalPoint {
  number: number; // 1..29
  point: string;
  enforcement: string;
  category: "non-intermediary" | "enforcement-architecture" | "financial-discipline" | "trade-semantics";
}

export const CONSTITUTIONAL_POINTS_1_29: ConstitutionalPoint[] = [
  // ── Points 1–8 — Non-intermediary boundaries (what SGTX never is) ──
  { number: 1, point: "Non-custodial — never holds customer funds", enforcement: "No funds table; FeeLock is instruction only", category: "non-intermediary" },
  { number: 2, point: "Non-marketplace — never matches buyers with sellers", enforcement: "Relationship-controlled only; no discovery", category: "non-intermediary" },
  { number: 3, point: "Non-title-taking — never takes title to goods", enforcement: "Title governed by Incoterm and applicable law", category: "non-intermediary" },
  { number: 4, point: "Non-carrier — orchestrates through approved carriers", enforcement: "No transport assets held", category: "non-intermediary" },
  { number: 5, point: "Non-customs-authority — interfaces with customs, never replaces", enforcement: "Government integrations are one-directional", category: "non-intermediary" },
  { number: 6, point: "Non-bank — orchestrates payment instructions only", enforcement: "Bank Settlement Gateway is instructional only", category: "non-intermediary" },
  { number: 7, point: "Non-deposit-taking — all funds flow through connected banks", enforcement: "Connected banks execute the actual funds movement", category: "non-intermediary" },
  { number: 8, point: "Non-government — infrastructure, not a government system", enforcement: "GOV is a tenant type like any other", category: "non-intermediary" },
  // ── Points 9–16 — Enforcement architecture ──
  { number: 9, point: "AI-assisted — AI provides advisory (A1), constraining (A2), escalation (A3)", enforcement: "A4 is deterministic policy execution", category: "enforcement-architecture" },
  { number: 10, point: "Governor-governed — every irreversible action passes through Governor", enforcement: "G1–G7 enforced", category: "enforcement-architecture" },
  { number: 11, point: "OPA-enforced — Open Policy Agent evaluates every decision", enforcement: "OPA sidecar", category: "enforcement-architecture" },
  { number: 12, point: "WasmEdge-enforced — constitutional rules execute as deterministic WASM", enforcement: "Sandboxed modules", category: "enforcement-architecture" },
  { number: 13, point: "Loom-audited — every decision appended to SHA-256 hash-chained audit log", enforcement: "Hourly verification", category: "enforcement-architecture" },
  { number: 14, point: "USTN-centric — USTN is the canonical namespace for every trade", enforcement: "Every document references USTN", category: "enforcement-architecture" },
  { number: 15, point: "Jurisdiction-aware — every trade evaluated against applicable regulatory profile", enforcement: "RIA-driven jurisdiction matrix", category: "enforcement-architecture" },
  { number: 16, point: "Relationship-controlled — counterparty relationships explicitly established", enforcement: "Network / Saved-Contacts model", category: "enforcement-architecture" },
  // ── Points 17–21 — Financial discipline ──
  { number: 17, point: "Closure-is-earned — USTN closed only when all 7 conditions met", enforcement: "Cannot be forced", category: "financial-discipline" },
  { number: 18, point: "Recovery ≠ erasure — recovery restores state but never erases audit history", enforcement: "Loom is immutable", category: "financial-discipline" },
  { number: 19, point: "USTN as namespace, not override — USTN does not override external authoritative systems", enforcement: "External identifiers preserved", category: "financial-discipline" },
  { number: 20, point: "Bank-authoritative settlement — banks confirm settlement; SGTX orchestrates only", enforcement: "Bank Settlement Gateway", category: "financial-discipline" },
  { number: 21, point: "Non-custody is architectural — an architectural property, not a legal classification", enforcement: "Assessed per jurisdiction", category: "financial-discipline" },
  // ── Points 22–29 — Trade semantics + honesty rules ──
  { number: 22, point: "GNN non-marketplace bounded — GNN provides trust analytics for known parties only", enforcement: "Never recommends or ranks", category: "trade-semantics" },
  { number: 23, point: "Direct API = first-party connector — the worldwide adapter fabric is extensibility, not over-claim", enforcement: "No over-claim of readiness", category: "trade-semantics" },
  { number: 24, point: "RoRo is first-class — Roll-on/Roll-off is a distinct transport mode", enforcement: "Not a sub-mode of ocean container", category: "trade-semantics" },
  { number: 25, point: "Mode-specific government applicability — integrations have mode-specific rules", enforcement: "Nafeza applicability varies by mode", category: "trade-semantics" },
  { number: 26, point: "External readiness is 4-dimensional — TECHNICAL, LEGAL, OPERATIONAL, COMMERCIAL", enforcement: "All four required for 'Connected'", category: "trade-semantics" },
  { number: 27, point: "Production-readiness vocabulary — CORE_READY, PRODUCTION_CONNECTED, LEGAL_AUTHORIZATION_REQUIRED", enforcement: "No WORLDWIDE_INTEGRATED claim without evidence", category: "trade-semantics" },
  { number: 28, point: "Manual fallback is governed — authenticated, attributable, timestamped, hashed, Loom-logged", enforcement: "Same controls as automated paths", category: "trade-semantics" },
  { number: 29, point: "Evidence is sealed at closure — final evidence package (26 categories) sealed at USTN closure", enforcement: "Post-closure may add but never modify", category: "trade-semantics" },
];

// ============ v18 §3.2.1 — Extended Constitutional Principles (30–38) ============

export const CONSTITUTIONAL_POINTS_30_38: ConstitutionalPoint[] = [
  {
    number: 30,
    point: "A timeout never creates finality — no timeout may create financial, legal, or closure finality in any domain",
    enforcement: "Timeout produces UNKNOWN states subject to reconciliation, never success or failure",
    category: "trade-semantics",
  },
  {
    number: 31,
    point: "Settlement does not equal closure — settlement completion is one closure condition, not the closure condition",
    enforcement: "canClose predicate evaluates all seven conditions (Section 5.10)",
    category: "financial-discipline",
  },
  {
    number: 32,
    point: "Evidence integrity is not legal authority — a hash-verified, tamper-evident record does not by itself constitute a legal fact",
    enforcement: "Authority level stored separately from verification state (Section 19.32)",
    category: "trade-semantics",
  },
  {
    number: 33,
    point: "An assertion is not a confirmation — a party statement or internal command is never equivalent to an external authoritative confirmation",
    enforcement: "Assertion vs confirmation distinction enforced in the state vector (Section 19.31)",
    category: "trade-semantics",
  },
  {
    number: 34,
    point: "External-system divergence must be represented, never silently overwritten — when an authoritative external system contradicts internal state, both are recorded and reconciled",
    enforcement: "Reconciliation control plane (Section 19.26); historical events immutable",
    category: "trade-semantics",
  },
  {
    number: 35,
    point: "No subsystem may silently redefine canonical transaction truth — service-local statuses are operational projections only",
    enforcement: "Canonical state derived from events + external facts + policy (Section 19.26)",
    category: "enforcement-architecture",
  },
  {
    number: 36,
    point: "Financial exposure must be represented independently of transaction state — exposure may remain open after settlement and must remain visible",
    enforcement: "Economic exposure engine (Section 19.64); exposure blocks closure where policy requires",
    category: "financial-discipline",
  },
  {
    number: 37,
    point: "Fail closed on authoritative uncertainty — compliance decisions must fail closed where required authoritative state cannot be established",
    enforcement: "Compliance cache freshness discipline (Section 6.3); UNKNOWN is not compliant",
    category: "enforcement-architecture",
  },
  {
    number: 38,
    point: "No false prevention claims — the platform must never claim to prevent financing outside the data sources and registries it actually controls",
    enforcement: "Double-financing claim boundary (Section 10.61.1)",
    category: "financial-discipline",
  },
];

// Convenience: full 38-point array (1..29 then 30..38)
export const ALL_CONSTITUTIONAL_POINTS: ConstitutionalPoint[] = [
  ...CONSTITUTIONAL_POINTS_1_29,
  ...CONSTITUTIONAL_POINTS_30_38,
];

// ============ v18 §3.3 — AI Authority Ladder (A0–A5) ============

export interface AiAuthorityLevel {
  level: string; // "A0".."A5"
  name: string;
  authority: string;
  boundary: string;
}

export const AI_AUTHORITY_LADDER: AiAuthorityLevel[] = [
  {
    level: "A0",
    name: "None",
    authority: "No AI involvement — pure deterministic rules",
    boundary: "No AI subsystem invoked",
  },
  {
    level: "A1",
    name: "Advisory",
    authority: "Explain, translate, suggest, summarise, notify, generate draft instructions",
    boundary: "Never makes decisions; never blocks; never forces",
  },
  {
    level: "A2",
    name: "Constraining",
    authority:
      "Classify, detect anomalies, predict delays, compare images, estimate ETA, optimise, analyse",
    boundary: "Proposes constraints; Governor decides whether to enforce",
  },
  {
    level: "A3",
    name: "Escalation",
    authority: "Escalate to human review, flag for enhanced due diligence, trigger compliance review",
    boundary: "Escalates; never resolves autonomously",
  },
  {
    level: "A4",
    name: "Execution (within bounds)",
    authority: "Deterministic policy automation by Governor + OPA + WasmEdge under pre-authorised rules",
    boundary: "AI never acquires independent execution authority",
  },
  {
    level: "A5",
    name: "FORBIDDEN",
    authority: "Autonomous AI decision-making without human authorisation",
    boundary: "Constitutionally prohibited; any attempt triggers a SEV-0 incident",
  },
];

// ============ v18 §3.3.2 — AI Authority Quick Reference ============

export interface AiAuthorityQuickRef {
  level: string;
  providerChain: string;
  agents: string;
  capability: string;
}

export const AI_AUTHORITY_QUICK_REFERENCE: AiAuthorityQuickRef[] = [
  {
    level: "A1 — Advisory",
    providerChain: "Groq → Ollama → Static",
    agents:
      "Container Advisor, Criticality Suggestion, Insurance Recommender, Settlement Readiness, Settlement Structure Recommender, Tenant Message Generator",
    capability: "Suggestions only. Cannot block actions.",
  },
  {
    level: "A2 — Constraining",
    providerChain: "HF local → Ollama → Static + escalation",
    agents:
      "Product Form Agent, Intent Parser, Commodity Classification, Schedule Optimiser, Readiness Score, Quality Assessment, Document Requirement Extractor, Special Instructions Extractor, Port Congestion Detection, Fraud Detection",
    capability: "Can block with CONDITIONAL. Requires human to resolve.",
  },
  {
    level: "A3 — Escalation",
    providerChain: "HF local + Groq → Ollama → Human",
    agents: "Regulatory Intelligence Agent (RIA)",
    capability: "Forces human review. Cannot decide autonomously.",
  },
  {
    level: "A4 — Governance",
    providerChain: "OPA + WasmEdge",
    agents: "All Governor validation gates (G1U1–G1U33)",
    capability: "Auto-executes within constitutional bounds.",
  },
  {
    level: "A5 — FORBIDDEN",
    providerChain: "—",
    agents: "None",
    capability: "Blocked at WASM compile. Any attempt is logged as constitutional violation.",
  },
];

// ============ v18 §3.4.1 — AI Agent Registry (representative agents) ============

export interface AgentRegistryEntry {
  authority: string;
  representativeAgents: string[];
  capability: string;
}

export const AI_AGENT_REGISTRY: AgentRegistryEntry[] = [
  {
    authority: "A1 — Advisory (Groq → Ollama → Static)",
    representativeAgents: [
      "Container Advisor",
      "Criticality Suggestion",
      "Insurance Recommender",
      "Settlement Readiness",
      "Settlement Structure Recommender",
      "Tenant Message Generator",
      "AI Operations Assistant",
    ],
    capability: "Suggestions only; cannot block actions",
  },
  {
    authority: "A2 — Constraining (HF local → Ollama → Static + escalation)",
    representativeAgents: [
      "Product Form Agent",
      "Intent Parser",
      "Commodity Classification",
      "Schedule Optimiser",
      "Readiness Score",
      "Quality Assessment",
      "Document Requirement Extractor",
      "Special Instructions Extractor",
      "Port Congestion Detection",
      "Fraud Detection",
      "Route Oracle",
      "Risk Radar",
      "Pricing Dynamics",
      "Packing Solver",
    ],
    capability: "Can block with CONDITIONAL; requires human resolution",
  },
  {
    authority: "A3 — Escalation (HF local + Groq → Ollama → Human)",
    representativeAgents: ["Regulatory Intelligence Agent (RIA)"],
    capability: "Forces human review; cannot decide autonomously",
  },
  {
    authority: "A4 — Governance (OPA + WasmEdge)",
    representativeAgents: [
      "All Governor validation gates (G1U1–G1U33 and phase gates)",
    ],
    capability: "Auto-executes within constitutional bounds",
  },
  {
    authority: "A5 — FORBIDDEN",
    representativeAgents: ["None"],
    capability: "Blocked at WASM compile; any attempt is logged as a constitutional violation",
  },
];

// ============ v18 §3.4.2 — Fallback Chain by Authority ============

export interface FallbackChain {
  authority: string;
  primary: string;
  secondary: string;
  terminal: string;
}

export const FALLBACK_CHAINS: FallbackChain[] = [
  {
    authority: "A1 — Advisory",
    primary: "Groq (model `llama3-70b-8192`)",
    secondary: "Ollama (model `llama3.2:3b`)",
    terminal: "Static templates",
  },
  {
    authority: "A2 — Constraining",
    primary: "HF local models (self-hosted Hugging Face inference)",
    secondary: "Ollama",
    terminal: "Static templates, plus escalation to human review",
  },
  {
    authority: "A3 — Escalation",
    primary: "HF local + Groq",
    secondary: "Ollama",
    terminal: "Human review — the human is the terminal authority",
  },
  {
    authority: "A4 — Governance",
    primary: "OPA + WasmEdge (deterministic evaluation; no inference)",
    secondary: "—",
    terminal: "—",
  },
  {
    authority: "A5 — FORBIDDEN",
    primary: "No chain — prohibited at compile time",
    secondary: "—",
    terminal: "—",
  },
];

// ============ v18 §3.3.1 — Forbidden Actions (A5) ============

export const AI_FORBIDDEN_ACTIONS = {
  level: "A5",
  name: "FORBIDDEN",
  description:
    "Autonomous AI decision-making without human authorisation is constitutionally prohibited (A5).",
  enforcement:
    "The prohibition is enforced mechanically: A5 behaviour is blocked at WASM compile time, so no deployable module can contain it; any attempt is logged as a constitutional violation, and any live attempt triggers a SEV-0 incident. The prohibition is total — it applies to every AI subsystem without exception, and no configuration, jurisdiction, or operational emergency permits autonomous AI execution.",
  severity: "SEV-0",
} as const;

// ============ v18 §3.5 — Constitutional Enforcement Stack (overview) ============

export const ENFORCEMENT_STACK_COMPONENTS = [
  { name: "Governor Service", role: "Single point of truth — merges OPA + WasmEdge + AI suggestions into a final ALLOW/DENY/CONDITIONAL verdict", section: "§3.5.2" },
  { name: "OPA Policy Engine", role: "Rego policy evaluation — DENY is blocking", section: "§3.5.4" },
  { name: "WasmEdge Constitutional Engine", role: "Deterministic WASM execution — sandboxed, 50ms timeout, signed by Platform Governance Authority", section: "§3.5.5" },
  { name: "Loom Audit Chain", role: "SHA-256 hash-chained append-only ledger — externally verifiable, hourly background verifier", section: "§3.5.6" },
  { name: "AI Orchestrator (Rig + Rust)", role: "Selects provider by authority level + fallback chain; logs every inference to ai_inference_records", section: "§3.4" },
] as const;

// ============ Convenience: full canonical constitution payload ============

export function getConstitutionPayload() {
  return {
    governor_principles: GOVERNOR_PRINCIPLES,
    constitutional_points_1_29: CONSTITUTIONAL_POINTS_1_29,
    constitutional_points_30_38: CONSTITUTIONAL_POINTS_30_38,
    all_constitutional_points: ALL_CONSTITUTIONAL_POINTS,
    ai_authority_ladder: AI_AUTHORITY_LADDER,
    ai_authority_quick_reference: AI_AUTHORITY_QUICK_REFERENCE,
    ai_agent_registry: AI_AGENT_REGISTRY,
    fallback_chains: FALLBACK_CHAINS,
    ai_forbidden_actions: AI_FORBIDDEN_ACTIONS,
    enforcement_stack_components: ENFORCEMENT_STACK_COMPONENTS,
    counts: {
      governor_principles: GOVERNOR_PRINCIPLES.length, // 7
      constitutional_points_1_29: CONSTITUTIONAL_POINTS_1_29.length, // 29
      constitutional_points_30_38: CONSTITUTIONAL_POINTS_30_38.length, // 9
      all_constitutional_points: ALL_CONSTITUTIONAL_POINTS.length, // 38
      ai_authority_levels: AI_AUTHORITY_LADDER.length, // 6 (A0..A5)
      ai_agent_registry_entries: AI_AGENT_REGISTRY.length, // 5
      fallback_chains: FALLBACK_CHAINS.length, // 5
      enforcement_stack_components: ENFORCEMENT_STACK_COMPONENTS.length, // 5
    },
    layer: "L0 — Immutable",
    amendment_path:
      "Layer 0 changes require 3-of-5 multisig and 30-day notice (Section 3.6)",
  };
}
