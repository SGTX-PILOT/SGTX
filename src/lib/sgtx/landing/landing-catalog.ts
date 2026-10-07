// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 — Landing Page Canonical Catalog
// ═══════════════════════════════════════════════════════════════════════════════
//
// Single source of truth for ALL landing-page section data.
// Sourced from v18 spec:
//   §2  Executive Summary & Platform Identity
//   §3  Constitutional Foundation (Layer 0)
//   §4  Identity, Tenancy & Access Architecture
//   §5  USTN Canonical Trade Namespace
//   §6-§14 Phase Workflow (Buyer → Seller → Negotiation → Finance → Physical → Settlement → Post-Trade)
//   §15 Governor Gates & Constitutional Enforcement
//   §16 Portal Architecture & Universal Command Center
//   §17 Complete Data Model
//   §18 API Endpoint Index
//   §19 Canonical Transaction State & Settlement Architecture
//   §20 Global Trade Graph, Jurisdiction Fabric & Transport Engines
//   §21 Platform Guarantees: Security, Availability & Privacy
//   §22 Platform Add-Ons & Extended Capabilities (28 add-ons)
//   §23 Network Effects, Trade Corridor Network & Workflow Examples
//   §24 Canonical Terminology & Implementation Roadmap
//
// Consumed by: src/app/_components/landing/*.tsx

import type { LucideIcon } from "lucide-react";
import {
  Lock, Brain, Scale, ShieldCheck, Database, Network, Globe2,
  Cpu, Activity, Server, KeyRound, Fingerprint, Eye, FileCheck,
  Truck, Ship, FlaskConical, ClipboardCheck, Building2, Banknote,
  Landmark, Store, Users, Inbox, LayoutDashboard, Search, Repeat,
  ArrowRight, ArrowLeftRight, GitBranch, ShieldAlert, Layers,
  Zap, Crosshair, Microscope, Boxes, Container, Anchor, Wallet,
  FileSignature, Gavel, ScrollText, BadgeCheck, FileText,
  Radar, Wifi, Cloud, HardDrive, Cog, Timer, AlertTriangle,
  TrendingUp, Coins, BarChart3, Sparkles, GitGraph, Workflow,
  ListChecks, Gauge, Binary,
  KeySquare, LockKeyhole, ScanLine, QrCode, PackageCheck,
  Stethoscope, Bug, ShieldHalf, Atom, CircuitBoard,
  BrainCog, LineChart, MessageSquare, BellRing, IdCard,
  Map, Hash, ThermometerSnowflake, CalendarClock, Shield, Award,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// §2.2 — THREE UNSHAKABLE PILLARS
// ─────────────────────────────────────────────────────────────────────────────
export interface Pillar {
  roman: string;
  title: string;
  principle: string;
  enforcement: string;
  icon: LucideIcon;
}

export const PILLARS: Pillar[] = [
  {
    roman: "I",
    title: "Non-Custodial by Structure",
    principle: "No funds table exists; FeeLock is an instruction, never a holding",
    enforcement: "Structural — verified by absence of any funds-holding table in the canonical data model (§17).",
    icon: Lock,
  },
  {
    roman: "II",
    title: "AI May Block, Never Force",
    principle: "AI (A1–A3) advises and constrains; A4 is deterministic policy execution; A5 is constitutionally forbidden",
    enforcement: "Constitutional — A5 actions are blocked at WASM compile time; never implemented.",
    icon: Brain,
  },
  {
    roman: "III",
    title: "Sovereign Jurisdiction Supremacy",
    principle: "The strictest rule among buyer, seller, logistics, financier, and governing-law jurisdictions always applies",
    enforcement: "Runtime — RIA (Regulatory Intelligence Agent) computes the strictest-applicable rule per action.",
    icon: Scale,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §2.4 — KEY ARCHITECTURAL CAPABILITIES (9 capabilities)
// ─────────────────────────────────────────────────────────────────────────────
export interface Capability {
  name: string;
  description: string;
  specRef: string;
  icon: LucideIcon;
}

export const CAPABILITIES: Capability[] = [
  {
    name: "Conditional Financing Reference (CFR)",
    description: "Two-phase financing: non-binding pre-clearance before contract lock; binding formal execution after lock. Eliminates 'signed but unfundable' contracts.",
    specRef: "§7, §10",
    icon: Wallet,
  },
  {
    name: "Data-Sovereign Financing Declarations",
    description: "The buyer declares only the buyer's financing needs; the seller declares only the seller's financing needs. No cross-contamination of financing intent between counterparties.",
    specRef: "§7.2",
    icon: ShieldCheck,
  },
  {
    name: "Unified Service Provider Capability Model",
    description: "A single GTID can offer any combination of services (e.g. Trucking + Customs Brokerage). Portal tabs render dynamically from the service_capabilities array.",
    specRef: "§11",
    icon: Layers,
  },
  {
    name: "Geographically-Aware QC Inspection",
    description: "Provider coverage validation, seller contact advisory, and anonymised historical price ranges prevent inspection requests where no inspector exists.",
    specRef: "§11.5",
    icon: Map,
  },
  {
    name: "Explicit Lab Test Requirements",
    description: "Mandatory, recommended, and optional tests are explicit, RIA-driven, and priced transparently at request time.",
    specRef: "§11.4",
    icon: FlaskConical,
  },
  {
    name: "Canonical Workflow Order",
    description: "Transport mode is selected before containers/units; Incoterm and settlement structure are captured together; the AI Container Advisor runs after transport mode selection.",
    specRef: "§6.3, §8.4",
    icon: Workflow,
  },
  {
    name: "USTN Canonical Namespace",
    description: "One immutable, globally unique shipment identifier binds every document, payment, milestone, and event of a trade.",
    specRef: "§5",
    icon: Hash,
  },
  {
    name: "Earned Closure",
    description: "A USTN closes only when all seven closure conditions evaluate true; closure can never be forced.",
    specRef: "§5.10",
    icon: BadgeCheck,
  },
  {
    name: "Sealed Evidence",
    description: "A final evidence package across 26 categories is sealed at closure and can be extended but never modified afterwards.",
    specRef: "§5.10, §19",
    icon: FileCheck,
  },
];



// ─────────────────────────────────────────────────────────────────────────────
// §2.5 — PLATFORM-WIDE EXECUTION COMPONENTS (4 shared components)
// ─────────────────────────────────────────────────────────────────────────────
export interface ExecutionComponent {
  key: string;
  title: string;
  description: string;
  specRef: string;
  properties: { label: string; value: string }[];
  icon: LucideIcon;
}

export const EXECUTION_COMPONENTS: ExecutionComponent[] = [
  {
    key: "smart-inbox",
    title: "Smart Inbox",
    description: "Default, action-first landing page for every authenticated user. Each item is a governed instruction rendered in a fixed four-part structure: WHAT, WHY, DEADLINE, ACTION.",
    specRef: "§2.5.1, §16.2",
    properties: [
      { label: "Priority bands", value: "High 80–100, Medium 50–79, Low 0–49 (collapsible)" },
      { label: "Scoring", value: "Deterministic (A4) urgency rules; titles/descriptions by AI (A1)" },
      { label: "Categories", value: "NEEDS_SIGNATURE, NEEDS_APPROVAL, NEEDS_DOCUMENT, NEEDS_PAYMENT, SHIPMENT_ALERT, NEW_OFFER, NEGOTIATION, COMPLIANCE, GENERAL" },
      { label: "Snooze", value: "2h / 4h / 8h / 24h; reappears early if urgency rises ≥10 pts" },
      { label: "Sync", value: "NATS events; all sessions real-time; last-write-wins with losing-write logged" },
    ],
    icon: Inbox,
  },
  {
    key: "tcc",
    title: "Trade Command Center",
    description: "Universal landing dashboard that opens on every USTN click. Single-screen view of trade state, milestones, documents, payments, disputes, and Governor decisions.",
    specRef: "§2.5.2, §16.3",
    properties: [
      { label: "Trigger", value: "Opens on any USTN click — one identifier, one screen" },
      { label: "Scope", value: "State-vector, milestones, documents, payments, disputes, evidence" },
      { label: "Real-time", value: "NATS WebSocket updates; no manual refresh" },
      { label: "Role-aware", value: "Columns and actions adapt to active role + trader-mode context" },
    ],
    icon: LayoutDashboard,
  },
  {
    key: "dual-mode",
    title: "Dual Trader-Mode Context",
    description: "Tenants operate in BUY, SELL, or DUAL trader mode. Every session carries an active trader-mode context as a JWT claim; context switch is explicit and audited.",
    specRef: "§2.5.3, §4.6",
    properties: [
      { label: "Modes", value: "BUY, SELL, DUAL (with always-visible toggle)" },
      { label: "Switch", value: "POST /v1/employee/switch-context — audited" },
      { label: "Enforcement", value: "OPA policies prevent cross-mode actions; Smart Inbox + TCC filter on active context" },
      { label: "JWT claim", value: "active_trader_mode in every session token" },
    ],
    icon: ArrowLeftRight,
  },
  {
    key: "universal-search",
    title: "Universal Search & USTN Resolution",
    description: "Single search box resolves GTIDs, USTNs, request references, contract IDs, shipment IDs, document hashes, and public Loom hashes to the correct workspace.",
    specRef: "§2.5.4, §16.13.10",
    properties: [
      { label: "Resolves", value: "GTID, USTN, Request Ref, Contract ID, Shipment ID, Loom hash" },
      { label: "Speed", value: "Sub-200ms for cached lookups; sub-1s for cold" },
      { label: "Privacy", value: "Scoped to caller's tenant + role + active trader-mode" },
      { label: "AI assist", value: "A1 suggests likely targets on ambiguous queries" },
    ],
    icon: Search,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §2.3 — CANONICAL EXECUTION SEQUENCE (12 phases)
// ─────────────────────────────────────────────────────────────────────────────
export interface ExecutionPhase {
  order: number;
  name: string;
  specSection: string;
  description: string;
  governorGate: string;
}

export const EXECUTION_SEQUENCE: ExecutionPhase[] = [
  { order: 1, name: "Trade Intent", specSection: "§6", description: "Buyer submits a structured trade request (13 sections).", governorGate: "G1U1–G1U8" },
  { order: 2, name: "Feasibility", specSection: "§6.10", description: "Governor pre-screens against sanctions, jurisdiction, and RIA.", governorGate: "G1U1–G1U8" },
  { order: 3, name: "Financing Pre-Clearance", specSection: "§7", description: "Non-binding CFR — buyer + seller each declare financing needs (data-sovereign).", governorGate: "G2" },
  { order: 4, name: "Quote", specSection: "§8", description: "Seller locks EXW price, designs packing, gets 3-mode logistics quotes.", governorGate: "G3" },
  { order: 5, name: "Negotiation", specSection: "§9.1", description: "Counter-offers; AI-assisted clause drafting (Clause Forge).", governorGate: "G3" },
  { order: 6, name: "Contract", specSection: "§9.2", description: "Both parties sign with QES; contract immutable post-signature.", governorGate: "G3" },
  { order: 7, name: "Fee & Lock", specSection: "§9.27", description: "Dynamic Fee Engine computes bounded fee; FeeLock instruction created.", governorGate: "G4" },
  { order: 8, name: "USTN Generation", specSection: "§5.1", description: "Canonical shipment identifier minted at authoritative lock.", governorGate: "G4" },
  { order: 9, name: "Execution", specSection: "§12", description: "Physical movement; milestone-gated payments; LSP/SHIP/LAB/QC/CBR portals active.", governorGate: "G5" },
  { order: 10, name: "Settlement", specSection: "§13", description: "ISO 20022 native bank settlement; deferred payment guarantees honored.", governorGate: "G6" },
  { order: 11, name: "Reconciliation", specSection: "§13.5", description: "Auto-reconcile at ≥95% confidence; exceptions surface to Smart Inbox.", governorGate: "G6" },
  { order: 12, name: "Closure", specSection: "§5.10, §14", description: "Earned closure — all 7 conditions true; 26-category evidence package sealed.", governorGate: "G7" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.1 — GOVERNOR PRINCIPLES (G1–G7)
// ─────────────────────────────────────────────────────────────────────────────
export interface GovernorPrinciple {
  gate: string;
  name: string;
  scope: string;
  description: string;
  icon: LucideIcon;
}

export const GOVERNOR_PRINCIPLES: GovernorPrinciple[] = [
  { gate: "G1", name: "Identity & Intent", scope: "Pre-trade", description: "Verifies actor identity, tenant status, KYB tier, and intent consistency before any trade action.", icon: Fingerprint },
  { gate: "G2", name: "Financing Pre-Clearance", scope: "Pre-contract", description: "Validates CFR (Conditional Financing Reference) declarations are data-sovereign and pre-cleared before contract lock.", icon: Wallet },
  { gate: "G3", name: "Contract & Negotiation", scope: "Contract phase", description: "Enforces canonical workflow order, QES signature integrity, and Clause Forge compliance at contract formation.", icon: FileSignature },
  { gate: "G4", name: "Fee & Lock", scope: "Lock event", description: "Computes Dynamic Fee Engine output within constitutional bounds; mints USTN at authoritative lock.", icon: Lock },
  { gate: "G5", name: "Execution", scope: "Physical movement", description: "Gates every milestone, document, and payment release against the state-vector; physical evidence required.", icon: Truck },
  { gate: "G6", name: "Settlement & Reconciliation", scope: "Payment phase", description: "ISO 20022 bank settlement; reconciliation at ≥95% confidence; deferred payment guarantees honored.", icon: Banknote },
  { gate: "G7", name: "Closure", scope: "Post-trade", description: "Earned closure — all 7 closure conditions evaluate true; 26-category evidence package sealed immutably.", icon: BadgeCheck },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.2 + §3.2.1 — THE 38-POINT TRANSACTION CONSTITUTION
// ─────────────────────────────────────────────────────────────────────────────
export interface ConstitutionalPoint {
  number: number;
  category: string;
  principle: string;
  layer: "L0";
}

export const CONSTITUTIONAL_POINTS: ConstitutionalPoint[] = [
  // §3.2 — Points 1–29
  { number: 1, category: "Non-Custody", principle: "No funds table shall exist in the canonical data model; FeeLock is an instruction, never a holding.", layer: "L0" },
  { number: 2, category: "Non-Custody", principle: "SGTX shall never take title to goods, act as a carrier, bank, customs authority, or government.", layer: "L0" },
  { number: 3, category: "Non-Custody", principle: "All settlement shall be direct bank-to-bank (ISO 20022 native); SGTX never intermediates funds.", layer: "L0" },
  { number: 4, category: "AI Authority", principle: "AI may advise (A1), constrain (A2), escalate (A3), or execute within bounds (A4); A5 is forbidden.", layer: "L0" },
  { number: 5, category: "AI Authority", principle: "Forbidden actions (A5) shall be blocked at WASM compile time and never implemented.", layer: "L0" },
  { number: 6, category: "AI Authority", principle: "Every AI inference shall be logged with provider, model, latency, fallback_used, and confidence.", layer: "L0" },
  { number: 7, category: "Jurisdiction", principle: "The strictest rule among all applicable jurisdictions shall always apply.", layer: "L0" },
  { number: 8, category: "Jurisdiction", principle: "RIA (Regulatory Intelligence Agent) shall continuously update the jurisdiction matrix.", layer: "L0" },
  { number: 9, category: "Identity", principle: "Every actor shall be identified by a GTID with a verifiable checksum.", layer: "L0" },
  { number: 10, category: "Identity", principle: "KYB tier shall gate portal access; no tenant may act above their verified tier.", layer: "L0" },
  { number: 11, category: "USTN", principle: "Every shipment shall be identified by a USTN generated at authoritative lock.", layer: "L0" },
  { number: 12, category: "USTN", principle: "A USTN shall be immutable once generated; it can never be reused or reassigned.", layer: "L0" },
  { number: 13, category: "Audit", principle: "Every irreversible action shall be appended to the Loom hash-chained audit log.", layer: "L0" },
  { number: 14, category: "Audit", principle: "The Loom chain shall be verifiable by any external party via the public verification endpoint.", layer: "L0" },
  { number: 15, category: "Governance", principle: "Layer 0 (constitutional) changes require 3-of-5 multisig and 30-day public notice.", layer: "L0" },
  { number: 16, category: "Governance", principle: "The Platform Governance Authority is bound by its own rules; no unilateral override.", layer: "L0" },
  { number: 17, category: "Transparency", principle: "Every DENY/CONDITIONAL shall produce a plain-language tenant message.", layer: "L0" },
  { number: 18, category: "Transparency", principle: "Court-admissible evidence packages shall be generated on demand.", layer: "L0" },
  { number: 19, category: "Non-Marketplace", principle: "The platform shall never suggest an unknown counterparty or rank providers.", layer: "L0" },
  { number: 20, category: "Non-Marketplace", principle: "All trade relationships originate from explicit invitations between known parties.", layer: "L0" },
  { number: 21, category: "Financing", principle: "Financing declarations shall be data-sovereign; no cross-contamination of intent.", layer: "L0" },
  { number: 22, category: "Financing", principle: "CFR pre-clearance shall be non-binding; formal execution is binding post-lock.", layer: "L0" },
  { number: 23, category: "Fees", principle: "The Dynamic Fee Engine shall produce a fairness-driven effective rate between 0.03% and 1.50%.", layer: "L0" },
  { number: 24, category: "Fees", principle: "No subscriptions, no per-seat fees, and no infrastructure licensing shall be charged.", layer: "L0" },
  { number: 25, category: "Signatures", principle: "Every contract shall be signed with Qualified Electronic Signature (QES).", layer: "L0" },
  { number: 26, category: "Signatures", principle: "Passkey (WebAuthn) + biometric + device-bound key shall be required for irreversible actions.", layer: "L0" },
  { number: 27, category: "Closure", principle: "Closure shall be earned; all 7 closure conditions must evaluate true.", layer: "L0" },
  { number: 28, category: "Closure", principle: "Evidence package across 26 categories shall be sealed at closure; extensible, never modifiable.", layer: "L0" },
  { number: 29, category: "Closure", principle: "Post-closure behavior shall be governed by §19 canonical transaction-state architecture.", layer: "L0" },
  // §3.2.1 — Extended Points 30–38
  { number: 30, category: "Privacy", principle: "ZK proofs shall reveal only what is necessary for verification; nothing more.", layer: "L0" },
  { number: 31, category: "Privacy", principle: "Trade Memory Layer shall use differential privacy (ε ≤ 0.1) for all aggregates.", layer: "L0" },
  { number: 32, category: "Privacy", principle: "Tenant data shall be encrypted at rest with per-tenant keys; RLS enforced at the database.", layer: "L0" },
  { number: 33, category: "Resilience", principle: "The platform shall be air-gap capable; all components open-source and self-hostable.", layer: "L0" },
  { number: 34, category: "Resilience", principle: "Mobile field apps shall queue actions offline and sync on reconnection; no scan, milestone, or inspection lost.", layer: "L0" },
  { number: 35, category: "Compliance", principle: "Automated SAR generation shall require human compliance officer approval before filing.", layer: "L0" },
  { number: 36, category: "Compliance", principle: "Sanctions screening shall run on every trade initiation and financing request.", layer: "L0" },
  { number: 37, category: "Recovery", principle: "Passkey recovery shall require notarised ID, two authorised signatories, 3-of-5 multisig, and registered-mail delivery.", layer: "L0" },
  { number: 38, category: "Recovery", principle: "Recovery shall revoke all previous devices and log the event in governor_decisions.", layer: "L0" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.3 — AI AUTHORITY LADDER (A0–A5)
// ─────────────────────────────────────────────────────────────────────────────
export interface AIAuthorityLevel {
  level: string;
  name: string;
  meaning: string;
  examples: string;
  color: string;
  forbidden: boolean;
}

export const AI_AUTHORITY_LADDER: AIAuthorityLevel[] = [
  { level: "A0", name: "None", meaning: "No AI involvement.", examples: "Static config lookups, deterministic routing.", color: "text-slate-400", forbidden: false },
  { level: "A1", name: "Advisory", meaning: "AI generates summaries, explanations, and notifications; no decision influence.", examples: "Smart Inbox titles, tenant messages, narrative generation.", color: "text-blue-400", forbidden: false },
  { level: "A2", name: "Constraining", meaning: "AI produces scores or classifications that can constrain an outcome to CONDITIONAL; never autonomous.", examples: "Sanctions scoring, GNN risk, cold-chain anomaly, credit scoring.", color: "text-yellow-400", forbidden: false },
  { level: "A3", name: "Escalation", meaning: "AI escalates to human or multisig approval.", examples: "SAR draft creation, Federated Learning activation, model approval.", color: "text-orange-400", forbidden: false },
  { level: "A4", name: "Execution (within bounds)", meaning: "AI orchestrates execution inside deterministic, Governor-gated bounds.", examples: "Fee engine, reconciliation, OPA + WasmEdge enforcement, add-on activation.", color: "text-green-400", forbidden: false },
  { level: "A5", name: "FORBIDDEN", meaning: "Blocked at WASM compile time; never implemented.", examples: "Autonomous fund movement, autonomous contract execution, autonomous sanctions bypass.", color: "text-red-400", forbidden: true },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.4 — AI AGENT REGISTRY & FALLBACK CHAINS
// ─────────────────────────────────────────────────────────────────────────────
export interface AIAgent {
  id: string;
  name: string;
  authority: string;
  primary: string;
  fallback1: string;
  fallback2: string;
  terminal: string;
  purpose: string;
}

export const AI_AGENTS: AIAgent[] = [
  { id: "A1", name: "Narrative Generator", authority: "A1", primary: "z-ai (glm-4-plus)", fallback1: "Groq (llama3-70b-8192)", fallback2: "Ollama (llama3.2:3b)", terminal: "Static templates", purpose: "Plain-language tenant messages, Smart Inbox titles, decision narratives." },
  { id: "A2", name: "Classifier/Scorer", authority: "A2", primary: "Hugging Face (local)", fallback1: "Ollama", fallback2: "Static thresholds", terminal: "Static thresholds", purpose: "Sanctions scoring, cold-chain anomaly, QC defect detection, credit scoring." },
  { id: "A3", name: "Escalation Agent", authority: "A3", primary: "Rules + human", fallback1: "Multisig queue", fallback2: "Static escalation", terminal: "Static escalation", purpose: "SAR drafting, model approval, high-risk action escalation." },
  { id: "A4", name: "Deterministic Executor", authority: "A4", primary: "OPA + WasmEdge", fallback1: "Static policy", fallback2: "Deny", terminal: "Deny", purpose: "Fee engine, reconciliation, Governor enforcement, add-on activation." },
];

// ─────────────────────────────────────────────────────────────────────────────
// §3.5 — CONSTITUTIONAL ENFORCEMENT STACK
// ─────────────────────────────────────────────────────────────────────────────
export interface EnforcementLayer {
  order: number;
  name: string;
  technology: string;
  role: string;
  icon: LucideIcon;
}

export const ENFORCEMENT_STACK: EnforcementLayer[] = [
  { order: 1, name: "Governor Service", technology: "Rust + NATS", role: "Single point of truth — every irreversible action passes through the Governor.", icon: Gavel },
  { order: 2, name: "OPA Policy Engine", technology: "Rego policies", role: "Declarative policy evaluation — expresses constitutional rules as code.", icon: ScrollText },
  { order: 3, name: "WasmEdge Engine", technology: "WASM sandbox", role: "Deterministic execution — A5 forbidden actions blocked at compile time.", icon: CircuitBoard },
  { order: 4, name: "Loom Hash Chain", technology: "SHA-256 chained", role: "Immutable audit log — every decision and state change appended.", icon: GitBranch },
  { order: 5, name: "Jurisdiction Supremacy", technology: "RIA + Jurisdiction Fabric", role: "Strictest-applicable rule computation per action.", icon: Scale },
  { order: 6, name: "QES Signing", technology: "Ed25519 + Egypt Trust", role: "Qualified Electronic Signature on every contract and payment mandate.", icon: FileSignature },
];

// ─────────────────────────────────────────────────────────────────────────────
// §4.1 — GTID FORMAT & ENTITY TYPES
// ─────────────────────────────────────────────────────────────────────────────
export interface EntityType {
  code: string;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const ENTITY_TYPES: EntityType[] = [
  { code: "TRD", name: "Trader", description: "Importers, exporters, procurement, sales (Buyer/Seller/Dual).", icon: Store },
  { code: "LSP", name: "Logistics Service Provider", description: "Trucking, forwarding, warehousing.", icon: Truck },
  { code: "SHIP", name: "Shipping Line", description: "Ocean carriers, NVOCCs, vessel operators.", icon: Ship },
  { code: "LAB", name: "Laboratory", description: "ISO 17025 accredited testing laboratories.", icon: FlaskConical },
  { code: "QC", name: "QC Inspection", description: "ISO 17020 accredited inspection providers.", icon: ClipboardCheck },
  { code: "CBR", name: "Customs Broker", description: "Licensed customs brokers.", icon: Building2 },
  { code: "FIN", name: "Financier", description: "Banks (sub_type=BANK) and Private Financiers (sub_type=PRIVATE).", icon: Banknote },
  { code: "GOV", name: "Government", description: "Customs, port authorities, trade ministries.", icon: Landmark },
  { code: "ADM", name: "Admin", description: "Platform Governance Authority multisig members.", icon: ShieldCheck },
  { code: "MP", name: "Marketplace Partner", description: "External platforms integrating via Marketplace API.", icon: Network },
];

// GTID format: SGTX-{country}-{year}-{trader}-{seq} e.g. SGTX-EG-26-F3A-1
export const GTID_FORMAT = {
  pattern: "SGTX-{CC}-{YY}-{TRADER}-{SEQ}",
  example: "SGTX-EG-26-F3A-0001",
  components: [
    { code: "SGTX", meaning: "Platform prefix" },
    { code: "CC", meaning: "ISO 3166-1 alpha-2 country code (e.g. EG, IT, SA)" },
    { code: "YY", meaning: "Year (last 2 digits, e.g. 26)" },
    { code: "TRADER", meaning: "Trader ID (4-char alphanumeric, base-36)" },
    { code: "SEQ", meaning: "Sequence number (zero-padded, per country+year+trader)" },
  ],
  checksum: "Luhn-mod-37 over the full identifier",
};

// ─────────────────────────────────────────────────────────────────────────────
// §4.2 — KYB TIERS
// ─────────────────────────────────────────────────────────────────────────────
export interface KYBTier {
  tier: number;
  name: string;
  maxTransactionValue: string;
  portals: string[];
  requirements: string[];
}

export const KYB_TIERS: KYBTier[] = [
  {
    tier: 1,
    name: "Sandbox",
    maxTransactionValue: "$0 (no real trades)",
    portals: ["Sandbox only"],
    requirements: ["Email verification", "Organization name"],
  },
  {
    tier: 2,
    name: "Basic KYB",
    maxTransactionValue: "$50,000 per trade",
    portals: ["Trader Portal (limited)"],
    requirements: ["Business registration number", "Director ID", "Sanctions screening", "PEP screening"],
  },
  {
    tier: 3,
    name: "Full KYB",
    maxTransactionValue: "$500,000 per trade",
    portals: ["Trader Portal (full)", "LSP/SHIP/LAB/QC/CBR (limited)"],
    requirements: ["Notarised incorporation docs", "UBO declaration", "Two authorised signatories", "Bank account verification (micro-deposit)"],
  },
  {
    tier: 4,
    name: "Enhanced KYB",
    maxTransactionValue: "Unlimited",
    portals: ["All portals", "Financier Portal", "Government Portal", "Admin Portal"],
    requirements: ["On-site verification", "Source-of-funds documentation", "Multisig approval (3-of-5)", "Annual re-verification"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §5 — USTN CANONICAL NAMESPACE
// ─────────────────────────────────────────────────────────────────────────────
export const USTN_SPEC = {
  pattern: "SGTX-{country}-{year}-{trader}-{seq}",
  example: "SGTX-EG-26-F3A-1",
  generatedAt: "Authoritative Lock (Fee & Lock phase, G4)",
  immutable: true,
  binds: [
    "Every document (contract, BL, invoice, certificate)",
    "Every payment (fee, settlement, deferred)",
    "Every milestone (pickup, departure, arrival, delivery)",
    "Every event (Governor decision, Loom append, external fact)",
    "Every shipment sub-record in multi-shipment trades",
  ],
  statuses: ["INITIATED", "QUOTE", "NEGOTIATION", "CONTRACT", "LOCKED", "EXECUTING", "IN_TRANSIT", "ARRIVED", "DELIVERED", "SETTLED", "RECONCILED", "DISPUTED", "EXCEPTION", "DISTRESSED", "CLOSING", "COMPLETED"],
  closureConditions: [
    "All milestones confirmed",
    "All documents verified",
    "All payments settled",
    "Reconciliation ≥95% confidence",
    "No open disputes",
    "No open exceptions",
    "Evidence package sealed (26 categories)",
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// §6 — BUYER WORKFLOW (Phase 1) — 13 SECTIONS
// ─────────────────────────────────────────────────────────────────────────────
export interface TradeRequestSection {
  number: number;
  name: string;
  description: string;
  icon: LucideIcon;
}

export const BUYER_TRADE_REQUEST_SECTIONS: TradeRequestSection[] = [
  { number: 1, name: "Seller Selection", description: "Saved contact or explicit GTID invitation. Non-marketplace — no suggestions.", icon: Users },
  { number: 2, name: "Incoterm + Commercial Foundation", description: "Incoterm 2020 selection; settlement structure captured together.", icon: Users },
  { number: 3, name: "Transport Mode & Equipment", description: "Mode selected BEFORE containers (canonical workflow order).", icon: Truck },
  { number: 4, name: "Container/Unit & Commodity", description: "HS code, weight, volume, special stock flags.", icon: Container },
  { number: 5, name: "Lab Test Requirements", description: "Mandatory/recommended/optional tests — RIA-driven, transparent pricing.", icon: FlaskConical },
  { number: 6, name: "QC Inspection Request", description: "Geographically-aware: coverage validated before request accepted.", icon: ClipboardCheck },
  { number: 7, name: "AI Container Advisor", description: "Runs AFTER transport mode selection (canonical order).", icon: BrainCog },
  { number: 8, name: "Documentation Requirements", description: "Per-jurisdiction document list (commercial, transport, customs, cert).", icon: FileText },
  { number: 9, name: "Insurance Requirements", description: "Cargo, marine, brokerage — provider relationships required.", icon: ShieldCheck },
  { number: 10, name: "Delivery Window & Special Instructions", description: "Earliest/latest shipment dates; handling instructions.", icon: Timer },
  { number: 11, name: "Trade Criticality", description: "Classification drives fee engine and Governor scrutiny.", icon: AlertTriangle },
  { number: 12, name: "Draft Auto-Save", description: "Encrypted draft; recovers on re-login; Governor-stamped on submit.", icon: Database },
  { number: 13, name: "Submit", description: "G1U1–G1U8 pre-screening runs; Smart Inbox items generated for seller.", icon: ArrowRight },
];

// ─────────────────────────────────────────────────────────────────────────────
// §8 — SELLER WORKFLOW (Phase 2)
// ─────────────────────────────────────────────────────────────────────────────
export const SELLER_WORKFLOW_STEPS = [
  { number: 1, name: "Receive & Review Buyer Request", description: "Smart Inbox item priority 75. Seller reviews 13-section structured request." },
  { number: 2, name: "Loading Origin", description: "Seller specifies EXW loading address + GPS coordinates." },
  { number: 3, name: "EXW Price Lock", description: "Seller locks EXW price; recorded in FeeLock instruction; immutable post-lock." },
  { number: 4, name: "Packing & Containerisation", description: "Packing plan designed; AI Container Advisor validates; SSCC pallet labels generated." },
  { number: 5, name: "Logistics Orchestration (3 Modes)", description: "Mode A: RFQ to 3 LSPs. Mode B: Direct to SHIP. Mode C: Direct to SHIP with seller-managed." },
  { number: 6, name: "Alternative Delivery Ports", description: "Seller proposes alternative ports with reason and cost delta." },
  { number: 7, name: "Multi-Shipment Response", description: "If buyer requested multi-shipment, seller responds per shipment with schedule." },
  { number: 8, name: "SGTX Fee Calculation", description: "Dynamic Fee Engine computes bounded fee; buyer sees transparent breakdown." },
];

// ─────────────────────────────────────────────────────────────────────────────
// §15 — GOVERNOR GATE MATRIX (42 gates across 7 groups)
// ─────────────────────────────────────────────────────────────────────────────
export interface GovernorGate {
  id: string;
  group: string;
  description: string;
  verdicts: string[];
}

export const GOVERNOR_GATE_GROUPS = [
  { group: "G1", name: "Identity & Intent", count: 8, gates: ["G1U1 Identity verified", "G1U2 KYB tier sufficient", "G1U3 Sanctions clear", "G1U4 PEP screened", "G1U5 Trader-mode valid", "G1U6 Intent consistent", "G1U7 Rate limit ok", "G1U8 Step-up auth passed"] },
  { group: "G2", name: "Financing Pre-Clearance", count: 5, gates: ["G2U1 CFR declared", "G2U2 Data-sovereign", "G2U3 Pre-cleared", "G2U4 Financier matched", "G2U5 Capacity verified"] },
  { group: "G3", name: "Contract & Negotiation", count: 7, gates: ["G3U1 Workflow order", "G3U2 Clause Forge", "G3U3 QES valid", "G3U4 Both parties signed", "G3U5 Immutable post-sign", "G3U6 Fee within bounds", "G3U7 Lock authorized"] },
  { group: "G4", name: "Fee & Lock", count: 6, gates: ["G4U1 Fee computed", "G4U2 Within 0.03-1.50%", "G4U3 FeeLock instruction created", "G4U4 USTN minted", "G4U5 Loom appended", "G4U6 Notification sent"] },
  { group: "G5", name: "Execution", count: 8, gates: ["G5U1 Milestone valid", "G5U2 Document uploaded", "G5U3 External fact reconciled", "G5U4 Payment authorized", "G5U5 Carrier confirmed", "G5U6 Customs cleared", "G5U7 QC passed", "G5U8 Lab results in"] },
  { group: "G6", name: "Settlement & Reconciliation", count: 5, gates: ["G6U1 ISO 20022 sent", "G6U2 Bank confirmed", "G6U3 Reconciliation ≥95%", "G6U4 Exceptions surfaced", "G6U5 Deferred guarantee honored"] },
  { group: "G7", name: "Closure", count: 3, gates: ["G7U1 All 7 conditions true", "G7U2 Evidence sealed (26 categories)", "G7U3 Loom closure hash published"] },
];

// ─────────────────────────────────────────────────────────────────────────────
// §16.1.2 — THE TWELVE PORTALS
// ─────────────────────────────────────────────────────────────────────────────
export interface Portal {
  number: number;
  name: string;
  role: string;
  tenantType: string;
  devicePriority: "Mobile-First" | "Web-First" | "Hybrid";
  companionApp: string;
  icon: LucideIcon;
}

export const TWELVE_PORTALS: Portal[] = [
  { number: 1, name: "Trader Portal — Buyer Mode", role: "Importers and procurement", tenantType: "TRD (BUY)", devicePriority: "Hybrid", companionApp: "React Native (Smart Inbox, approvals, voice settlement)", icon: Store },
  { number: 2, name: "Trader Portal — Seller Mode", role: "Exporters and sales", tenantType: "TRD (SELL)", devicePriority: "Hybrid", companionApp: "React Native (Smart Inbox, approvals, voice settlement)", icon: Store },
  { number: 3, name: "LSP Portal", role: "Trucking, forwarding, warehousing", tenantType: "LSP", devicePriority: "Hybrid", companionApp: "LSP Driver App (trucking, offline)", icon: Truck },
  { number: 4, name: "Shipping Line (SHIP) Portal", role: "Ocean carriers, NVOCCs, vessel operators", tenantType: "SHIP", devicePriority: "Web-First", companionApp: "Responsive web (milestone updates via API)", icon: Ship },
  { number: 5, name: "Laboratory (LAB) Portal", role: "ISO 17025 accredited testing labs", tenantType: "LAB", devicePriority: "Web-First", companionApp: "Responsive web", icon: FlaskConical },
  { number: 6, name: "QC Inspection Portal", role: "ISO 17020 accredited inspection providers", tenantType: "QC", devicePriority: "Hybrid", companionApp: "QC Inspector App (offline-first, AR, defect detection)", icon: ClipboardCheck },
  { number: 7, name: "Customs Broker (CBR) Portal", role: "Licensed customs brokers", tenantType: "CBR", devicePriority: "Hybrid", companionApp: "CBR Document Receipt App (QR scanning, GPS stamp)", icon: Building2 },
  { number: 8, name: "Financier (Bank) Portal", role: "Banks (FIN, sub_type=BANK)", tenantType: "FIN/BANK", devicePriority: "Web-First", companionApp: "Responsive web", icon: Banknote },
  { number: 9, name: "Financier (PFI) Portal", role: "Private financiers (FIN, sub_type=PRIVATE)", tenantType: "FIN/PRIVATE", devicePriority: "Web-First", companionApp: "Responsive web", icon: Landmark },
  { number: 10, name: "Government Portal", role: "Customs, port authorities, trade ministries", tenantType: "GOV", devicePriority: "Web-First", companionApp: "Responsive web", icon: ShieldHalf },
  { number: 11, name: "Admin Portal", role: "Platform Governance Authority multisig members", tenantType: "ADM", devicePriority: "Web-First", companionApp: "Responsive web", icon: ShieldCheck },
  { number: 12, name: "Marketplace Partner Portal", role: "External platforms (Marketplace API)", tenantType: "MP", devicePriority: "Web-First", companionApp: "Responsive web", icon: Network },
];

// ─────────────────────────────────────────────────────────────────────────────
// §16.1.6 — UNIFIED PORTAL NAVIGATION
// ─────────────────────────────────────────────────────────────────────────────
export const PORTAL_NAV = {
  header: [
    { label: "SGTX Logo", desc: "Always returns to home/Smart Inbox" },
    { label: "Universal Search", desc: "GTID, USTN, Request Ref, Contract ID, Shipment ID, Loom hash" },
    { label: "Notifications", desc: "Bell with unread badge (Smart Inbox + system)" },
    { label: "Dual-Mode Toggle", desc: "Trader portals only (BUY/SELL/DUAL)" },
    { label: "Avatar", desc: "Profile menu, logout, mode preferences" },
  ],
  commonSidebar: [
    { label: "Smart Inbox", desc: "Default landing tab" },
    { label: "Shipments", desc: "Shared Shipments Vault (role-filtered)" },
    { label: "Disputes", desc: "Role-filtered" },
    { label: "Notifications", desc: "System + broadcast" },
    { label: "Task Center", desc: "Per-role task queue" },
    { label: "Help Center", desc: "Self-serve + customer care chatbot" },
    { label: "Company Admin", desc: "Tenant settings, employees, billing" },
  ],
};

// ─────────────────────────────────────────────────────────────────────────────
// §22.1.2 — COMPLETE ADD-ON CATALOGUE (28 add-ons)
// ─────────────────────────────────────────────────────────────────────────────
export interface AddOn {
  number: number;
  name: string;
  priority: "Foundation" | "P0" | "P1" | "P2" | "P3" | "—";
  status: "Built-in" | "Complete" | "Specified" | "Optional" | "Reserved";
  class: "Foundation" | "Specified" | "Optional" | "Reserved";
  purpose: string;
  aiAuthority: string;
  icon: LucideIcon;
}

export const ADD_ONS: AddOn[] = [
  { number: 1, name: "GNN Risk Engine", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Sanctions & adversarial risk detection + Institutional Trade Graph (trust-based mapping).", aiAuthority: "A2/A3", icon: GitGraph },
  { number: 2, name: "Federated Learning", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Shares encrypted model updates, never raw trade data; no recommendations.", aiAuthority: "A2", icon: Network },
  { number: 3, name: "Causal Inference Engine", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Reports factual contribution percentages; never suggests 'switch provider'.", aiAuthority: "A1", icon: GitBranch },
  { number: 4, name: "Self-Healing Infrastructure", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Chaos engineering + automated recovery; purely operational.", aiAuthority: "A4", icon: Cog },
  { number: 5, name: "Automated Penetration Testing", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Targets infrastructure, never tenant data.", aiAuthority: "A4", icon: Bug },
  { number: 6, name: "Post-Quantum Cryptography", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Quantum-resistant key exchange and signatures.", aiAuthority: "A4", icon: Atom },
  { number: 7, name: "Expanded ZK Proofs", priority: "Foundation", status: "Built-in", class: "Foundation", purpose: "Confidential terms + private settlement proofs (Plonky3).", aiAuthority: "A4", icon: Eye },
  { number: 8, name: "Customs Bond & Guarantee", priority: "P0", status: "Specified", class: "Specified", purpose: "Bond factor management, guarantee lifecycle, claim evidence.", aiAuthority: "A4", icon: ShieldCheck },
  { number: 9, name: "Demurrage & Detention", priority: "P0", status: "Specified", class: "Specified", purpose: "Free time norms, calculation audit trail, dispute evidence.", aiAuthority: "A4", icon: Timer },
  { number: 10, name: "Broker Liability & Insurance", priority: "P0", status: "Specified", class: "Specified", purpose: "Broker liability tracking, insurance package binding.", aiAuthority: "A4", icon: ShieldAlert },
  { number: 11, name: "Customs Valuation Intelligence", priority: "P1", status: "Specified", class: "Specified", purpose: "RIA-driven valuation guidance per jurisdiction.", aiAuthority: "A1/A2", icon: BarChart3 },
  { number: 12, name: "Cold Chain Quality Management", priority: "P1", status: "Specified", class: "Specified", purpose: "Telemetry hypertables, anomaly detection, excursion evidence.", aiAuthority: "A2", icon: ThermometerSnowflake },
  { number: 13, name: "Inspection Agency Accreditation", priority: "P1", status: "Specified", class: "Specified", purpose: "ISO 17020 accreditation tracking, coverage validation.", aiAuthority: "A2", icon: Stethoscope },
  { number: 14, name: "Currency Risk Management", priority: "P1", status: "Specified", class: "Specified", purpose: "FX exposure tracking, forward booking advisory.", aiAuthority: "A1", icon: Coins },
  { number: 15, name: "Government API Sandbox", priority: "P1", status: "Specified", class: "Specified", purpose: "Nafeza/CargoX/ETA/CBE sandbox integration testing.", aiAuthority: "A4", icon: Landmark },
  { number: 16, name: "FTA Preference Management", priority: "P1", status: "Specified", class: "Specified", purpose: "Free Trade Agreement rule application, certificate issuance.", aiAuthority: "A4", icon: Award },
  { number: 17, name: "Piracy & Security Risk Engine", priority: "P1", status: "Specified", class: "Specified", purpose: "Maritime security risk scoring, route advisories.", aiAuthority: "A2", icon: Radar },
  { number: 18, name: "Trade Compliance Calendar", priority: "P1", status: "Specified", class: "Specified", purpose: "Deadline-driven follow-up tasks, regulatory change tracking.", aiAuthority: "A1", icon: CalendarClock },
  { number: 19, name: "Cargo Insurance Integration", priority: "P2", status: "Specified", class: "Specified", purpose: "Policy binding, claims lifecycle, evidence packaging.", aiAuthority: "A4", icon: Shield },
  { number: 20, name: "Trade Finance Documentation", priority: "P2", status: "Specified", class: "Specified", purpose: "LC/DC document generation, presentation tracking.", aiAuthority: "A4", icon: FileText },
  { number: 21, name: "Back-to-Back LC Management", priority: "P2", status: "Specified", class: "Specified", purpose: "Master/sub LC linkage, mismatch detection.", aiAuthority: "A4", icon: Repeat },
  { number: 22, name: "Force Majeure Handling", priority: "P2", status: "Specified", class: "Specified", purpose: "FM event declaration, obligation suspension, evidence.", aiAuthority: "A3", icon: AlertTriangle },
  { number: 23, name: "Shipper's Declaration & Export Docs", priority: "P2", status: "Specified", class: "Specified", purpose: "Export declaration generation, customs filing.", aiAuthority: "A4", icon: FileSignature },
  { number: 24, name: "Port & Terminal Integration", priority: "P2", status: "Specified", class: "Specified", purpose: "Terminal operating system integration, gate-out webhooks.", aiAuthority: "A4", icon: Anchor },
  { number: 25, name: "Payment Guarantee Confirmation", priority: "P3", status: "Optional", class: "Optional", purpose: "Optional confirmation of payment guarantee validity.", aiAuthority: "A4", icon: BadgeCheck },
  { number: 26, name: "Demurrage Dispute Resolution", priority: "P3", status: "Specified", class: "Specified", purpose: "Compiles evidence from Add-On 9 calculation audit trail.", aiAuthority: "A3", icon: Gavel },
  { number: 27, name: "(Reserved)", priority: "—", status: "Reserved", class: "Reserved", purpose: "Reserved for future enhancements.", aiAuthority: "—", icon: Lock },
  { number: 28, name: "GRiRE Engine", priority: "Foundation", status: "Specified", class: "Foundation", purpose: "Auto-configures bond factors, free time norms, cold chain params, FTA rules, document checklists.", aiAuthority: "A4", icon: Cpu },
];



// ─────────────────────────────────────────────────────────────────────────────
// §23.1.2 — TRUST FLYWHEEL (7 stages)
// ─────────────────────────────────────────────────────────────────────────────
export const TRUST_FLYWHEEL = [
  { stage: 1, label: "MORE TRADES", desc: "Every executed trade enters the Trade Memory Layer." },
  { stage: 2, label: "MORE DATA", desc: "Trade Memory, disputes, delays, documents — anonymised, differential-privacy protected." },
  { stage: 3, label: "BETTER TRUST PASSPORTS & TRI SCORES", desc: "Portable, verified reputation tenants carry everywhere." },
  { stage: 4, label: "BETTER AI RISK MODELS", desc: "GNN, Causal Inference, Credit Scoring improve with every trade." },
  { stage: 5, label: "LOWER FINANCING RISK", desc: "Fewer defaults, more accurate pricing, tighter spreads." },
  { stage: 6, label: "MORE BANKS & INSTITUTIONS", desc: "Financiers, insurers, logistics providers join the network." },
  { stage: 7, label: "MORE TRADE VOLUME", desc: "Network effects compound; lower costs; higher retention. Loop continues." },
];

// ─────────────────────────────────────────────────────────────────────────────
// §23.1.3 — MOAT LAYERS (cannot copy vs can copy)
// ─────────────────────────────────────────────────────────────────────────────
export const MOAT_LAYERS = [
  { layer: "Trade Memory", why: "Proprietary historical trade data (anonymised, differential privacy) accumulated over years.", copyable: false, icon: Database },
  { layer: "Trust Passport & TRI", why: "Portable, verified reputation that tenants carry and competitors cannot forge.", copyable: false, icon: IdCard },
  { layer: "Institutional Trade Graph", why: "Network density of tenants, providers, financiers, and governments.", copyable: false, icon: GitGraph },
  { layer: "Zero-Cost Infrastructure", why: "Self-hosted, open-source stack removes the cost floor competitors must charge.", copyable: false, icon: HardDrive },
  { layer: "Government Mandates", why: "Government nodes, corridor certification, and jurisdiction supremacy create legal lock-in.", copyable: false, icon: Landmark },
  { layer: "Full-Disclosure Financing", why: "Financiers see verified, evidence-backed trades — trust that only a governed execution graph produces.", copyable: false, icon: ShieldCheck },
  { layer: "Non-Custodial Architecture", why: "Structural (no funds table) — competitors that hold funds carry regulatory and counterparty risk the platform structurally avoids.", copyable: false, icon: Lock },
  { layer: "UI / Portal Structure", why: "Commodity layer — any well-funded competitor can replicate. Deliberately kept thin and standard.", copyable: true, icon: LayoutDashboard },
  { layer: "Workflow Forms", why: "Commodity layer — standard data entry screens.", copyable: true, icon: FileText },
  { layer: "Tracking Screens", why: "Commodity layer — standard map + milestone views.", copyable: true, icon: PackageCheck },
];

// ─────────────────────────────────────────────────────────────────────────────
// §23.1.5 — ECONOMIC MOAT
// ─────────────────────────────────────────────────────────────────────────────
export const ECONOMIC_MOAT = {
  annualCostAdvantage: "$2M+ / year",
  versus: "cloud-based proprietary competitor paying SaaS licences, cloud AI APIs, and managed queues at equivalent scale",
  feeModel: "Single transparent trade fee — fairness-driven effective rate 0.03%–1.50% of Canonical Fee Basis",
  noSubscriptions: true,
  noPerSeatFees: true,
  noInfrastructureLicensing: true,
  institutionalPricing: "Sublinear institutional pricing for bulk, essential, and special-stock flows (§9.27)",
};

// ─────────────────────────────────────────────────────────────────────────────
// §23.1.9 — COMPETITIVE THREAT MATRIX
// ─────────────────────────────────────────────────────────────────────────────
export const COMPETITIVE_THREATS = [
  { threat: "Cloud incumbent replicates the workflow layer", mitigation: "Zero-cost economic moat; moat layers cannot be copied", icon: Cloud },
  { threat: "Marketplace adds execution features", mitigation: "Non-marketplace constitution; structural neutrality", icon: Store },
  { threat: "Bank-owned trade platform", mitigation: "Counterparty neutrality; jurisdiction supremacy", icon: Banknote },
  { threat: "Government-mandated national systems", mitigation: "TCN integration model — mandates become moat", icon: Landmark },
  { threat: "Regulatory change", mitigation: "RIA continuous updates; jurisdiction matrix (§20)", icon: ScrollText },
  { threat: "Key-person / governance capture", mitigation: "Multisig 3-of-5 governance; constitutional amendment process (§3.6)", icon: Users },
];

// ─────────────────────────────────────────────────────────────────────────────
// §23.2 — TRADE CORRIDOR NETWORK (TCN)
// ─────────────────────────────────────────────────────────────────────────────
export const TRADE_CORRIDORS = [
  { corridor: "Egypt ↔ Italy", status: "Production", certification: "Certified", lanes: "Alexandria → Genoa, Damietta → Naples", icon: Ship },
  { corridor: "Egypt ↔ Saudi Arabia", status: "Production", certification: "Certified", lanes: "Alexandria → Jeddah, Damietta → Dammam", icon: Ship },
  { corridor: "Egypt ↔ UAE", status: "Active", certification: "Strategic", lanes: "Alexandria → Jebel Ali", icon: Ship },
  { corridor: "Egypt ↔ Turkey", status: "Active", certification: "Strategic", lanes: "Alexandria → Mersin, Izmir ↔ Damietta", icon: Ship },
  { corridor: "Egypt ↔ China", status: "Emerging", certification: "Developing", lanes: "Shanghai → Alexandria, Shenzhen → Damietta", icon: Ship },
  { corridor: "Egypt ↔ Kenya", status: "Emerging", certification: "Developing", lanes: "Mombasa → Alexandria", icon: Ship },
];

// ─────────────────────────────────────────────────────────────────────────────
// §21.1.6 — ATTACK SURFACE INVENTORY (21 surfaces)
// ─────────────────────────────────────────────────────────────────────────────
export interface AttackSurface {
  number: number;
  surface: string;
  exposure: string;
  protection: string;
}

export const ATTACK_SURFACES: AttackSurface[] = [
  { number: 1, surface: "Public API (/v1/*)", exposure: "Internet", protection: "Nginx rate-limit, WasmEdge JWT, OPA + Governor gating, WAF (OWASP Coraza)" },
  { number: 2, surface: "Governor Proxy (single ingress)", exposure: "Internal cluster", protection: "Active-active, circuit-breaker, mTLS, TLS 1.3" },
  { number: 3, surface: "NATS JetStream", exposure: "Internal (not exposed)", protection: "CiliumNetworkPolicy; encrypted at rest" },
  { number: 4, surface: "Temporal Server", exposure: "Internal", protection: "K3s service mesh; least-privilege SA" },
  { number: 5, surface: "WasmEdge Runtime", exposure: "Internal (sandboxed)", protection: "No network/FS access; pre-compiled modules with known hashes" },
  { number: 6, surface: "PostgreSQL", exposure: "Internal", protection: "RLS enforced; TLS; pgaudit logging" },
  { number: 7, surface: "ClickHouse", exposure: "Internal", protection: "Separate credentials; read-only for analytics" },
  { number: 8, surface: "ZITADEL (identity)", exposure: "Internet (login)", protection: "WebAuthn/RSA; rate-limit; brute-force protection" },
  { number: 9, surface: "Mobile & Web Frontends", exposure: "Internet (HTTPS)", protection: "CSP headers; no client-side sensitive logic; server validation" },
  { number: 10, surface: "Partner API (marketplace)", exposure: "Internet", protection: "Ed25519 signatures; rate-limit per partner; scope-limited JWT" },
  { number: 11, surface: "Bank Integration", exposure: "Outbound to banks", protection: "mTLS with bank certs; credentials encrypted at rest" },
  { number: 12, surface: "DNS / Infrastructure", exposure: "Internet", protection: "DNSSEC; Anycast; IaC (Ansible); immutable configs" },
  { number: 13, surface: "Smart Inbox WebSocket", exposure: "Internal + tenant-facing", protection: "Authenticated NATS WS; JWT; scoped to tenant" },
  { number: 14, surface: "Tenant Impersonation (Admin)", exposure: "Admin Portal only", protection: "Multisig 3/5; read-only; 30-min timeout; full audit" },
  { number: 15, surface: "Dual-Mode Toggle", exposure: "Trader Portal header", protection: "JWT claim enforcement; OPA rejects cross-mode" },
  { number: 16, surface: "Container Release API", exposure: "Terminal-facing", protection: "mTLS; PKCS#7 signed; rate-limit per terminal" },
  { number: 17, surface: "Logistics Mode C (Direct to SHIP)", exposure: "SHIP Portal + API", protection: "SHIP auth; quote signing; eBL webhook verification" },
  { number: 18, surface: "Conditional QC", exposure: "QC Portal + Mobile", protection: "Inspector passkey; action plan hashed; override reason mandatory" },
  { number: 19, surface: "Deferred Payment", exposure: "Payment Orchestrator", protection: "pain.008 signature; Governor triggers post-milestone" },
  { number: 20, surface: "ZK Proofs", exposure: "Financier + Trader", protection: "Plonky3 verification; no raw data transmitted" },
  { number: 21, surface: "Trust Passport", exposure: "Public (verifiable credential)", protection: "Ed25519 signature; revocation list; rate-limited verify" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §21.1.7 — ZERO-COST SECURITY TOOLCHAIN
// ─────────────────────────────────────────────────────────────────────────────
export const SECURITY_TOOLCHAIN = [
  { category: "Vulnerability scanning", tools: "Trivy, OWASP ZAP, nuclei, OpenVAS", license: "Apache 2.0 / MIT / GPL" },
  { category: "Container runtime security", tools: "Falco (eBPF)", license: "Apache 2.0" },
  { category: "Network security", tools: "Cilium (eBPF)", license: "Apache 2.0" },
  { category: "Identity & access", tools: "ZITADEL", license: "Apache 2.0" },
  { category: "Policy enforcement", tools: "OPA, WasmEdge", license: "Apache 2.0 / MIT" },
  { category: "Secrets management", tools: "HashiCorp Vault (self-hosted)", license: "MPL 2.0" },
  { category: "Logging & monitoring", tools: "Prometheus, Grafana, Loki, Jaeger", license: "Apache 2.0" },
  { category: "Intrusion detection", tools: "CrowdSec (community)", license: "MIT" },
  { category: "Threat intelligence feeds", tools: "AlienVault OTX, MISP", license: "Open" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §21 — PLATFORM-WIDE STATS (used in stats section)
// ─────────────────────────────────────────────────────────────────────────────
export const PLATFORM_STATS = [
  { value: "42", label: "Governor Gates", detail: "G1U1–G1U42 across 7 groups (§15)" },
  { value: "38", label: "Constitutional Points", detail: "Layer 0 immutable invariants (§3.2, §3.2.1)" },
  { value: "6", label: "AI Authority Levels", detail: "A0–A5 with 3-tier fallback (§3.3)" },
  { value: "12", label: "Portals", detail: "Role-specific workspaces (§16.1.2)" },
  { value: "28", label: "Platform Add-Ons", detail: "Foundation + Specified + Optional (§22)" },
  { value: "16", label: "USTN Statuses", detail: "INITIATED → COMPLETED (§5)" },
  { value: "7", label: "Closure Conditions", detail: "All must be true — earned closure (§5.10)" },
  { value: "26", label: "Evidence Categories", detail: "Sealed at closure; extensible, never modifiable (§5.10)" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §2.5 / §16.5 — SHARED SHIPMENTS VAULT (role-filtered columns)
// ─────────────────────────────────────────────────────────────────────────────
export const SHARED_SHIPMENTS_VAULT = [
  { role: "Trader (Buyer/Seller)", columns: "USTN, Counterparty, Commodity, Milestone, Next Action, Fee Status" },
  { role: "LSP", columns: "USTN, Pickup, Delivery, Equipment, Driver, Milestone, ETD/ETA" },
  { role: "Shipping Line", columns: "USTN, Vessel, Voyage, B/L, Container, Gate-in/out, Milestone" },
  { role: "Laboratory", columns: "USTN, Sample, Test Panel, Result, Certificate, Pass/Fail" },
  { role: "QC Inspector", columns: "USTN, Inspection Type, AQL Plan, Result, Defects, Photo Evidence" },
  { role: "Customs Broker", columns: "USTN, Declaration, HS Code, Duty, Clearance Status, Exception" },
  { role: "Financier", columns: "USTN, Facility, Drawdown, Repayment, Exposure, Risk Score" },
  { role: "Government", columns: "USTN, Declaration, Sanctions, Valuation, Revenue, Audit Trail" },
];

// ─────────────────────────────────────────────────────────────────────────────
// §19 — CANONICAL TRANSACTION STATE-VECTOR
// ─────────────────────────────────────────────────────────────────────────────
export const TRANSACTION_CLOCKS = [
  { clock: "State Clock", desc: "Canonical phase of the trade (12 phases)." },
  { clock: "Evidence Clock", desc: "Sealed evidence package progression (26 categories)." },
  { clock: "Payment Clock", desc: "ISO 20022 payment lifecycle (fee, settlement, deferred)." },
  { clock: "Document Clock", desc: "Document authenticity verification progression." },
  { clock: "Milestone Clock", desc: "Physical execution milestones (pickup → delivery)." },
  { clock: "Dispute Clock", desc: "Open dispute lifecycle (raise → tri → resolve)." },
  { clock: "Reconciliation Clock", desc: "Reconciliation confidence progression (0% → 100%)." },
  { clock: "Closure Clock", desc: "7 closure conditions (all must be true)." },
];

// ─────────────────────────────────────────────────────────────────────────────
// §20 — GLOBAL TRADE GRAPH & JURISDICTION FABRIC
// ─────────────────────────────────────────────────────────────────────────────
export const JURISDICTION_FABRIC = [
  { dimension: "Sanctions", desc: "OFAC SDN, EU, UK HMT, UN Consolidated, local lists — strictest applies." },
  { dimension: "PEP", desc: "Politically Exposed Persons screening (domestic + international)." },
  { dimension: "Tax Residency", desc: "FATCA, CRS, bilateral tax treaties." },
  { dimension: "Customs", desc: "HS classification, valuation, origin, preferential tariffs." },
  { dimension: "Trade Controls", desc: "Dual-use, end-use, end-user, export controls." },
  { dimension: "Banking", desc: "AML, KYC, payment routing, correspondent banking rules." },
  { dimension: "Data Residency", desc: "PDPL (Egypt), GDPR (EU), data localization laws." },
  { dimension: "Maritime", desc: "SOLAS, MARPOL, IMDG, carrier liability regimes." },
];

// ─────────────────────────────────────────────────────────────────────────────
// §16.5.1 — MOBILE APP SPECS
// ─────────────────────────────────────────────────────────────────────────────
export const MOBILE_APPS = [
  {
    name: "LSP Driver App",
    stack: "React Native + Expo, WatermelonDB, ZXingC++, Vosk, OSRM",
    features: ["Offline sync indicator", "Barcode scanning (SSCC)", "Offline turn-by-turn navigation", "Geofence alerts", "Push-to-talk (WebRTC)"],
    icon: Truck,
  },
  {
    name: "QC Inspector App",
    stack: "React Native + Expo, WatermelonDB, HF ViT, ZXingC++, Vosk, AR.js",
    features: ["Offline sync indicator", "On-device defect detection (HF ViT)", "AR overlay of expected pallet positions", "AQL sampling enforcement", "Batch scan mode"],
    icon: ClipboardCheck,
  },
  {
    name: "CBR Document Receipt App",
    stack: "React Native + Expo, ZXingC++, GPS",
    features: ["QR code scanning", "GPS location stamping", "Offline queue", "Photo capture for stamped docs"],
    icon: ScanLine,
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// §24 — IMPLEMENTATION ROADMAP PHASES
// ─────────────────────────────────────────────────────────────────────────────
export const ROADMAP_PHASES = [
  { phase: "Phase 1", name: "Constitutional Core", timeline: "Q1 2026", scope: "Governor, Loom, OPA, WasmEdge, QES, GTID, USTN, Smart Inbox, TCC." },
  { phase: "Phase 2", name: "Trade Initiation", timeline: "Q2 2026", scope: "Buyer workflow (13 sections), Seller workflow (8 steps), Clause Forge, Fee Engine." },
  { phase: "Phase 3", name: "Financing & Settlement", timeline: "Q3 2026", scope: "CFR, Formal Trade Finance, ISO 20022 bank settlement, Reconciliation engine." },
  { phase: "Phase 4", name: "Physical Execution", timeline: "Q4 2026", scope: "LSP/SHIP/LAB/QC/CBR portals, mobile apps, milestone-gated payments." },
  { phase: "Phase 5", name: "Post-Trade & Add-Ons", timeline: "Q1 2027", scope: "Distressed cargo, disputes, reconciliation, 28 add-ons, TCN." },
  { phase: "Phase 6", name: "Network Effects", timeline: "Q2 2027+", scope: "Trust Passport, TRI, GNN, Causal Inference, Federated Learning, Trade Memory." },
];

// ─────────────────────────────────────────────────────────────────────────────
// LIVE STATUS (used in sidebar / status widgets)
// ─────────────────────────────────────────────────────────────────────────────
export const LIVE_DECISIONS = [
  { type: "Contract Lock", gtid: "SGTX-VN-TRD-0002199-F53A", verdict: "ALLOW", color: "text-green-400", dot: "bg-green-500" },
  { type: "Financing Request", gtid: "SGTX-KE-FIN-001223-981C", verdict: "CONDITIONAL", color: "text-yellow-400", dot: "bg-yellow-500" },
  { type: "Trade Request", gtid: "SGTX-EG-TRD-002456-6A7D", verdict: "DENY", color: "text-red-400", dot: "bg-red-500" },
  { type: "Milestone Release", gtid: "SGTX-IT-LSP-000884-2B5E", verdict: "ALLOW", color: "text-green-400", dot: "bg-green-500" },
  { type: "Closure Seal", gtid: "SGTX-SA-TRD-000117-77A1", verdict: "CONDITIONAL", color: "text-yellow-400", dot: "bg-yellow-500" },
];

export const SYSTEM_COMPONENTS = [
  "Governor Decision Engine",
  "Sanctions & Jurisdiction Monitor",
  "AI Compliance Intelligence",
  "Trade Execution Layer",
  "Security & Identity (ZTA/DEL)",
  "Loom Hash Chain Verifier",
  "ISO 20022 Bank Settlement",
  "Dynamic Fee Engine",
];

export const GLOBAL_COVERAGE = [
  { v: "212", l: "Countries" },
  { v: "185K+", l: "Verified Entities" },
  { v: "98.7%", l: "Sanctions Clear" },
  { v: "24/7", l: "Governed" },
  { v: "6", l: "Trade Corridors" },
  { v: "12", l: "Portals" },
];
