// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Platform Admin Control Panel Data
// ═══════════════════════════════════════════════════════════════════════════════
//
// §3 Constitutional Foundation + §15 Governor Gates + §16.8.6.11 Admin Portal +
// §21 Security + §22 Add-Ons
//
// Single source of truth for the Platform Admin Control Panel — the
// platform owner's command center. Covers:
//   • System overview KPIs + live decision feed
//   • 38-point constitution state + 3-of-5 multisig status
//   • Tenant registry (view/suspend/revoke)
//   • Governor G1-G7 decision log
//   • Loom hash chain audit
//   • AI agent registry + fallback chains + A0-A5 authority
//   • Security attack surface + ZTA/DEL + passkey recovery queue
//   • Feature flags + fee bounds + add-on activation
//   • Cron/Inngest job monitor
//   • System diagnostics (DB, AI providers, integrations)
//
// COMPLEMENTS the existing portal-adm-data.ts (which is the Admin PORTAL
// dashboard for a single ADM user). This is the PLATFORM OWNER control panel
// — cross-tenant, cross-portal, system-level.
// ═══════════════════════════════════════════════════════════════════════════════

import type { LucideIcon } from "lucide-react";
import {
  Activity, Server, Database, Cpu, ShieldCheck, Users, Globe2,
  Scale, Gavel, GitBranch, KeyRound, Eye, AlertTriangle,
  CheckCircle2, Clock, DollarSign, Settings, Layers, Zap,
  Brain, Network, Lock, FileText, TrendingUp, TrendingDown,
  Building2, Banknote, Truck, Ship, FlaskConical, ClipboardCheck,
  Store, Landmark, Wallet, Crosshair, CircuitBoard, Atom,
  Bug, ShieldHalf, ShieldAlert, BellRing, HardDrive, Cloud,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// 1. SYSTEM OVERVIEW KPIs
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemKPI {
  label: string;
  value: string;
  delta: string;
  trend: "up" | "down" | "flat";
  icon: LucideIcon;
  color: string;
}

export const SYSTEM_KPIs: SystemKPI[] = [
  { label: "Trades settled (24h)", value: "1,847", delta: "+12.4%", trend: "up", icon: TrendingUp, color: "#34d399" },
  { label: "Value routed (24h)", value: "$84.2M", delta: "+8.7%", trend: "up", icon: DollarSign, color: "#34d399" },
  { label: "Active tenants", value: "185,432", delta: "+342", trend: "up", icon: Users, color: "#60a5fa" },
  { label: "Governor decisions (24h)", value: "5,293", delta: "+0.3%", trend: "up", icon: Gavel, color: "#a78bfa" },
  { label: "Avg decision latency", value: "47ms", delta: "-3ms", trend: "down", icon: Clock, color: "#34d399" },
  { label: "Loom chain height", value: "847,392", delta: "+5,293", trend: "up", icon: GitBranch, color: "#22d3ee" },
  { label: "AI inferences (24h)", value: "142,883", delta: "+18.2%", trend: "up", icon: Brain, color: "#fbbf24" },
  { label: "System uptime", value: "99.97%", delta: "30-day", trend: "flat", icon: Activity, color: "#34d399" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 2. SYSTEM HEALTH (per-component)
// ─────────────────────────────────────────────────────────────────────────────

export interface SystemComponent {
  name: string;
  status: "operational" | "degraded" | "down";
  latency: string;
  uptime: string;
  icon: LucideIcon;
  details: string;
}

export const SYSTEM_HEALTH: SystemComponent[] = [
  { name: "Governor Decision Engine", status: "operational", latency: "47ms", uptime: "99.97%", icon: Gavel, details: "Rust + NATS · all 7 gates (G1-G7) live" },
  { name: "Loom Hash Chain", status: "operational", latency: "2ms", uptime: "100%", icon: GitBranch, details: "SHA-256 chained · height 847,392 · 0 reorgs" },
  { name: "OPA Policy Engine", status: "operational", latency: "12ms", uptime: "99.99%", icon: Scale, details: "Rego policies · 1,247 rules loaded" },
  { name: "WasmEdge Sandbox", status: "operational", latency: "8ms", uptime: "99.98%", icon: CircuitBoard, details: "A5 forbidden blocked at compile-time · 0 violations" },
  { name: "QES Signing (Ed25519)", status: "operational", latency: "5ms", uptime: "100%", icon: KeyRound, details: "Egypt Trust CA · 2,847 signatures today" },
  { name: "ISO 20022 Bank Settlement", status: "operational", latency: "1.2s", uptime: "99.95%", icon: Banknote, details: "147 banks connected · pacs.008/009 native" },
  { name: "AI Compliance (z-ai)", status: "operational", latency: "340ms", uptime: "99.92%", icon: Brain, details: "GLM-4-plus primary · Groq/Ollama fallback" },
  { name: "Sanctions Monitor", status: "operational", latency: "89ms", uptime: "99.99%", icon: ShieldCheck, details: "OFAC + UN + EU + HMT · 24/7 refresh" },
  { name: "Prisma DB (Turso)", status: "operational", latency: "23ms", uptime: "99.97%", icon: Database, details: "libsql · 403 models · 8.2M rows" },
  { name: "Inngest Background Jobs", status: "degraded", latency: "1.8s", uptime: "98.4%", icon: Clock, details: "10 jobs · job #7 (SAR detection) queue backed up" },
  { name: "Vercel Cron Fallback", status: "operational", latency: "—", uptime: "99.99%", icon: Cloud, details: "5 cron jobs · fallback for Inngest" },
  { name: "ZTA/DEL Security", status: "operational", latency: "3ms", uptime: "100%", icon: Lock, details: "Zero Trust · Device Evidence Layer · 0 breaches" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 3. LIVE GOVERNOR DECISION FEED (last 8)
// ─────────────────────────────────────────────────────────────────────────────

export interface GovernorDecision {
  id: string;
  time: string;
  gtid: string;
  action: string;
  gate: string;
  verdict: "ALLOW" | "CONDITIONAL" | "DENY";
  latency: string;
  aiAuthority: string;
}

export const LIVE_GOVERNOR_FEED: GovernorDecision[] = [
  { id: "1", time: "14:23:47", gtid: "SGTX-EG-26-NH3T-0042", action: "Contract Lock", gate: "G3", verdict: "ALLOW", latency: "47ms", aiAuthority: "A4" },
  { id: "2", time: "14:23:42", gtid: "SGTX-IT-26-LSP-0117", action: "Milestone Release", gate: "G5", verdict: "ALLOW", latency: "52ms", aiAuthority: "A4" },
  { id: "3", time: "14:23:38", gtid: "SGTX-VN-26-FIN-0091", action: "Financing Request", gate: "G2", verdict: "CONDITIONAL", latency: "340ms", aiAuthority: "A2" },
  { id: "4", time: "14:23:31", gtid: "SGTX-KE-26-TRD-0233", action: "Sanctions Screen", gate: "G1", verdict: "DENY", latency: "89ms", aiAuthority: "A2" },
  { id: "5", time: "14:23:24", gtid: "SGTX-SA-26-ADM-0007", action: "Constitutional Edit", gate: "L0", verdict: "CONDITIONAL", latency: "1.2s", aiAuthority: "A3" },
  { id: "6", time: "14:23:18", gtid: "SGTX-EG-26-CBR-0441", action: "Customs Release", gate: "G5", verdict: "ALLOW", latency: "44ms", aiAuthority: "A4" },
  { id: "7", time: "14:23:11", gtid: "SGTX-IT-26-LAB-0088", action: "MRL Validation", gate: "G5", verdict: "ALLOW", latency: "38ms", aiAuthority: "A0" },
  { id: "8", time: "14:23:03", gtid: "SGTX-DE-26-TRD-0512", action: "Closure Seal", gate: "G7", verdict: "ALLOW", latency: "61ms", aiAuthority: "A4" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 4. TENANT REGISTRY (platform-level view)
// ─────────────────────────────────────────────────────────────────────────────

export interface TenantRecord {
  gtid: string;
  legalName: string;
  type: string;
  country: string;
  kybTier: number;
  status: "active" | "suspended" | "pending" | "revoked";
  tradeVolume: string;
  joined: string;
  trustScore: number;
}

export const TENANT_REGISTRY: TenantRecord[] = [
  { gtid: "SGTX-EG-26-NH3T", legalName: "Nile Harvest Trading Co.", type: "TRD", country: "EG", kybTier: 3, status: "active", tradeVolume: "$2.4M", joined: "2026-01-15", trustScore: 78 },
  { gtid: "SGTX-EG-26-SEXP", legalName: "Sahara Exports Ltd.", type: "TRD", country: "EG", kybTier: 3, status: "active", tradeVolume: "$1.8M", joined: "2026-02-03", trustScore: 82 },
  { gtid: "SGTX-IT-26-MLNO", legalName: "Milano Logistics S.p.A.", type: "LSP", country: "IT", kybTier: 3, status: "active", tradeVolume: "$890K", joined: "2026-01-22", trustScore: 85 },
  { gtid: "SGTX-IT-26-MEDB", legalName: "Mediterranean Bank", type: "FIN/BANK", country: "IT", kybTier: 4, status: "active", tradeVolume: "$12.4M", joined: "2026-01-08", trustScore: 91 },
  { gtid: "SGTX-US-26-JPMG", legalName: "JPMorgan Chase NA", type: "FIN/BANK", country: "US", kybTier: 4, status: "active", tradeVolume: "$28.7M", joined: "2026-01-03", trustScore: 95 },
  { gtid: "SGTX-SG-26-DBSS", legalName: "DBS Bank Ltd", type: "FIN/BANK", country: "SG", kybTier: 4, status: "active", tradeVolume: "$18.2M", joined: "2026-01-11", trustScore: 93 },
  { gtid: "SGTX-AE-26-EMRT", legalName: "Emirates Trading FZ-LLC", type: "TRD", country: "AE", kybTier: 3, status: "active", tradeVolume: "$4.1M", joined: "2026-02-14", trustScore: 80 },
  { gtid: "SGTX-IN-26-TATA", legalName: "Tata Global Beverages", type: "TRD", country: "IN", kybTier: 4, status: "active", tradeVolume: "$6.7M", joined: "2026-01-19", trustScore: 88 },
  { gtid: "SGTX-KE-26-NAIR", legalName: "Nairobi Imports Ltd", type: "TRD", country: "KE", kybTier: 2, status: "pending", tradeVolume: "$0", joined: "2026-03-01", trustScore: 0 },
  { gtid: "SGTX-CN-26-SINO", legalName: "Sinochem Group", type: "TRD", country: "CN", kybTier: 4, status: "active", tradeVolume: "$15.3M", joined: "2026-01-05", trustScore: 76 },
  { gtid: "SGTX-BR-26-PTRB", legalName: "Petrobras Logistica", type: "TRD", country: "BR", kybTier: 3, status: "active", tradeVolume: "$9.2M", joined: "2026-01-27", trustScore: 84 },
  { gtid: "SGXT-NG-26-DANG", legalName: "Dangote Industries", type: "TRD", country: "NG", kybTier: 3, status: "suspended", tradeVolume: "$3.1M", joined: "2026-02-20", trustScore: 65 },
];

// ─────────────────────────────────────────────────────────────────────────────
// 5. CONSTITUTIONAL FOUNDATION (38 points state)
// ─────────────────────────────────────────────────────────────────────────────

export interface ConstitutionPoint {
  number: number;
  category: string;
  principle: string;
  layer: "L0" | "L1" | "L2";
  status: "active" | "amendment-proposed" | "under-review";
  lastModified: string;
}

export const CONSTITUTION_STATE: ConstitutionPoint[] = [
  { number: 1, category: "Non-Custody", principle: "No funds table shall exist in the canonical data model", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 2, category: "Non-Custody", principle: "SGTX shall never take title to goods", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 3, category: "Non-Custody", principle: "All settlement direct bank-to-bank (ISO 20022)", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 4, category: "AI Authority", principle: "AI may advise/constrain/escalate/execute-within-bounds; A5 forbidden", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 5, category: "AI Authority", principle: "Forbidden actions (A5) blocked at WASM compile time", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 6, category: "AI Authority", principle: "Every AI inference logged with provider/model/latency/confidence", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 7, category: "Jurisdiction", principle: "Strictest rule among all applicable jurisdictions always applies", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 8, category: "Jurisdiction", principle: "RIA continuously updates jurisdiction matrix", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 9, category: "Identity", principle: "Every actor identified by GTID with verifiable checksum", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 10, category: "Identity", principle: "KYB tier gates portal access", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 15, category: "Governance", principle: "Layer 0 changes require 3-of-5 multisig + 30-day public notice", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 16, category: "Governance", principle: "Platform Governance Authority bound by its own rules", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 19, category: "Non-Marketplace", principle: "Platform never suggests unknown counterparty or ranks providers", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 20, category: "Non-Marketplace", principle: "All relationships from explicit invitations between known parties", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 23, category: "Fees", principle: "Dynamic Fee Engine: 0.03%-1.50% effective rate", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 24, category: "Fees", principle: "No subscriptions, no per-seat, no infrastructure licensing", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 25, category: "Signatures", principle: "Every contract signed with QES", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 27, category: "Closure", principle: "Closure is earned; all 7 conditions must be true", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 33, category: "Resilience", principle: "Platform air-gap capable; open-source; self-hostable", layer: "L0", status: "active", lastModified: "2026-01-01" },
  { number: 38, category: "Recovery", principle: "Passkey recovery requires notarised ID + 2 signatories + 3-of-5 multisig", layer: "L0", status: "amendment-proposed", lastModified: "2026-10-08" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 6. MULTISIG KEYHOLDER REGISTRY (3-of-5)
// ─────────────────────────────────────────────────────────────────────────────

export interface MultisigKeyholder {
  id: string;
  name: string;
  role: string;
  country: string;
  publicKey: string;
  status: "available" | "signing" | "offline";
  lastSeen: string;
}

export const MULTISIG_KEYHOLDERS: MultisigKeyholder[] = [
  { id: "KH-001", name: "Dr. Amira Hassan", role: "Chief Governance Officer", country: "EG", publicKey: "ed25519:9f3a...c7e2", status: "available", lastSeen: "2s ago" },
  { id: "KH-002", name: "Marcus Chen", role: "Chief Technology Officer", country: "SG", publicKey: "ed25519:4b8c...1a9f", status: "available", lastSeen: "5s ago" },
  { id: "KH-003", name: "Sofia Romano", role: "Chief Compliance Officer", country: "IT", publicKey: "ed25519:7d2e...5b31", status: "available", lastSeen: "1s ago" },
  { id: "KH-004", name: "James Okonkwo", role: "Chief Risk Officer", country: "NG", publicKey: "ed25519:2c6f...8e4a", status: "offline", lastSeen: "2h ago" },
  { id: "KH-005", name: "Priya Sharma", role: "Chief Financial Officer", country: "IN", publicKey: "ed25519:5a1b...3f7c", status: "available", lastSeen: "8s ago" },
];

export const MULTISIG_PENDING_CEREMONIES = [
  { id: "MSIG-2026-0042", title: "Amendment #38: Passkey Recovery Enhancement", signers: 2, required: 3, status: "awaiting-signature", initiated: "2026-10-08", noticeEnds: "2026-11-07" },
  { id: "MSIG-2026-0041", title: "Fee bounds adjustment (0.04%-1.40%)", signers: 3, required: 3, status: "signed", initiated: "2026-10-01", noticeEnds: "2026-10-31" },
  { id: "MSIG-2026-0040", title: "Add-on #7 (Expanded ZK Proofs) activation", signers: 1, required: 3, status: "awaiting-signature", initiated: "2026-10-05", noticeEnds: "2026-11-04" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 7. AI AGENT REGISTRY
// ─────────────────────────────────────────────────────────────────────────────

export interface AIAgentRecord {
  id: string;
  name: string;
  authority: "A0" | "A1" | "A2" | "A3" | "A4";
  primary: string;
  fallback1: string;
  fallback2: string;
  terminal: string;
  inferences24h: number;
  avgLatency: string;
  fallbackRate: string;
  status: "operational" | "degraded";
}

export const AI_AGENT_REGISTRY: AIAgentRecord[] = [
  { id: "A1", name: "Narrative Generator", authority: "A1", primary: "z-ai (glm-4-plus)", fallback1: "Groq (llama3-70b)", fallback2: "Ollama (llama3.2:3b)", terminal: "Static templates", inferences24h: 89234, avgLatency: "340ms", fallbackRate: "2.1%", status: "operational" },
  { id: "A2", name: "Classifier/Scorer", authority: "A2", primary: "Hugging Face (local)", fallback1: "Ollama", fallback2: "Static thresholds", terminal: "Static thresholds", inferences24h: 34521, avgLatency: "180ms", fallbackRate: "0.8%", status: "operational" },
  { id: "A3", name: "Escalation Agent", authority: "A3", primary: "Rules + human", fallback1: "Multisig queue", fallback2: "Static escalation", terminal: "Static escalation", inferences24h: 142, avgLatency: "1.2s", fallbackRate: "0%", status: "operational" },
  { id: "A4", name: "Deterministic Executor", authority: "A4", primary: "OPA + WasmEdge", fallback1: "Static policy", fallback2: "Deny", terminal: "Deny", inferences24h: 18986, avgLatency: "12ms", fallbackRate: "0.01%", status: "operational" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 8. SECURITY ATTACK SURFACE
// ─────────────────────────────────────────────────────────────────────────────

export interface AttackSurfaceItem {
  surface: string;
  threat: string;
  mitigation: string;
  status: "protected" | "monitoring" | "investigating";
  icon: LucideIcon;
}

export const ATTACK_SURFACE: AttackSurfaceItem[] = [
  { surface: "Governor API", threat: "Replay attack on irreversible actions", mitigation: "Idempotency keys + nonce + timestamp window (5s)", status: "protected", icon: Gavel },
  { surface: "QES Signing", threat: "Key compromise / theft", mitigation: "HSM-bound keys + WebAuthn L2 + biometric + device-bound", status: "protected", icon: KeyRound },
  { surface: "Loom Chain", threat: "Hash chain tampering", mitigation: "SHA-256 chained + external verification endpoint + 3-node replication", status: "protected", icon: GitBranch },
  { surface: "AI Inference", threat: "Prompt injection / model evasion", mitigation: "Input sanitization + output filtering + A5 compile-time block", status: "protected", icon: Brain },
  { surface: "Bank Settlement", threat: "Fraudulent payment instruction", mitigation: "ISO 20022 signature + 2-eyes + Governor G6 gate", status: "protected", icon: Banknote },
  { surface: "Tenant Data", threat: "Cross-tenant data leakage", mitigation: "Per-tenant encryption keys + RLS at database + ZTA network", status: "protected", icon: Lock },
  { surface: "Passkey Recovery", threat: "Social engineering recovery", mitigation: "Notarised ID + 2 signatories + 3-of-5 multisig + registered mail", status: "monitoring", icon: ShieldAlert },
  { surface: "Sanctions Evasion", threat: "Shell-company obfuscation", mitigation: "UBO declaration + GNN risk graph + 50% rule aggregation", status: "monitoring", icon: Eye },
  { surface: "Crypto Settlement", threat: "Mixing service contamination", mitigation: "Chainalysis KYT + address screening + Travel Rule", status: "investigating", icon: Atom },
];

export const PASSKEY_RECOVERY_QUEUE = [
  { id: "REC-2026-0034", tenant: "Nile Harvest Trading Co.", gtid: "SGTX-EG-26-NH3T", reason: "Lost device", stage: "Notarised ID verified", signers: 1, required: 2, initiated: "2026-10-09" },
  { id: "REC-2026-0033", tenant: "Milano Logistics S.p.A.", gtid: "SGTX-IT-26-MLNO", reason: "Key rotation", stage: "Awaiting 2nd signer", signers: 1, required: 2, initiated: "2026-10-07" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 9. CONFIGURATION: FEATURE FLAGS + FEE BOUNDS
// ─────────────────────────────────────────────────────────────────────────────

export interface FeatureFlag {
  key: string;
  label: string;
  enabled: boolean;
  category: string;
  lastToggled: string;
  requiresMultisig: boolean;
}

export const FEATURE_FLAGS: FeatureFlag[] = [
  { key: "crypto_settlement", label: "Crypto Settlement (USDC/USDT/BTC/ETH)", enabled: true, category: "Payments", lastToggled: "2026-09-15", requiresMultisig: false },
  { key: "open_banking_psd2", label: "Open Banking (PSD2 EU)", enabled: true, category: "Payments", lastToggled: "2026-08-01", requiresMultisig: false },
  { key: "open_banking_cfpb", label: "Open Banking (CFPB 1033 US)", enabled: true, category: "Payments", lastToggled: "2026-10-01", requiresMultisig: false },
  { key: "zk_proofs", label: "Expanded ZK Proofs (Plonky3)", enabled: false, category: "Privacy", lastToggled: "2026-07-20", requiresMultisig: true },
  { key: "federated_learning", label: "Federated Learning", enabled: true, category: "AI", lastToggled: "2026-06-15", requiresMultisig: false },
  { key: "gnn_risk_engine", label: "GNN Risk Engine", enabled: true, category: "AI", lastToggled: "2026-05-10", requiresMultisig: false },
  { key: "post_quantum_crypto", label: "Post-Quantum Cryptography", enabled: true, category: "Security", lastToggled: "2026-08-22", requiresMultisig: false },
  { key: "auto_pen_testing", label: "Automated Penetration Testing", enabled: true, category: "Security", lastToggled: "2026-04-01", requiresMultisig: false },
  { key: "self_healing_infra", label: "Self-Healing Infrastructure", enabled: true, category: "Operations", lastToggled: "2026-03-15", requiresMultisig: false },
  { key: "causal_inference", label: "Causal Inference Engine", enabled: true, category: "AI", lastToggled: "2026-06-20", requiresMultisig: false },
];

export const FEE_BOUNDS = {
  currentMin: 0.03,
  currentMax: 1.50,
  proposedMin: 0.04,
  proposedMax: 1.40,
  effectiveRate: 0.144,
  averageRate: 0.087,
  floor: 0.01,
  ceiling: 2.00,
  lastAdjustment: "2026-09-01",
  nextReview: "2026-12-01",
};

// ─────────────────────────────────────────────────────────────────────────────
// 10. CRON / INNGEST JOB MONITOR
// ─────────────────────────────────────────────────────────────────────────────

export interface CronJob {
  id: string;
  name: string;
  schedule: string;
  lastRun: string;
  nextRun: string;
  status: "success" | "running" | "failed" | "queued";
  duration: string;
  mode: "inngest" | "vercel-cron";
}

export const CRON_JOBS: CronJob[] = [
  { id: "late-fee", name: "Late Fee Calculation", schedule: "0 1 * * *", lastRun: "01:00 UTC", nextRun: "tomorrow 01:00", status: "success", duration: "2.3s", mode: "vercel-cron" },
  { id: "audit", name: "Governor Audit Chain Seal", schedule: "0 2 * * *", lastRun: "02:00 UTC", nextRun: "tomorrow 02:00", status: "success", duration: "4.1s", mode: "vercel-cron" },
  { id: "tri", name: "TRI Recalculation", schedule: "0 3 * * *", lastRun: "03:00 UTC", nextRun: "tomorrow 03:00", status: "success", duration: "12.8s", mode: "vercel-cron" },
  { id: "brain", name: "Brain OS Dataset Collection", schedule: "0 4 * * *", lastRun: "04:00 UTC", nextRun: "tomorrow 04:00", status: "success", duration: "8.4s", mode: "vercel-cron" },
  { id: "eu-pesticides", name: "EU Pesticides MRL Sync", schedule: "0 5 * * *", lastRun: "05:00 UTC", nextRun: "tomorrow 05:00", status: "success", duration: "3.7s", mode: "vercel-cron" },
  { id: "ustn-closure", name: "USTN Closure Check", schedule: "*/15 * * * *", lastRun: "14:15 UTC", nextRun: "14:30 UTC", status: "success", duration: "1.2s", mode: "inngest" },
  { id: "repayment", name: "Repayment Reminder", schedule: "0 9 * * 1", lastRun: "Mon 09:00", nextRun: "next Mon", status: "success", duration: "5.6s", mode: "inngest" },
  { id: "sar-detection", name: "SAR Detection", schedule: "*/30 * * * *", lastRun: "14:00 UTC", nextRun: "14:30 UTC", status: "queued", duration: "—", mode: "inngest" },
  { id: "fee-anomaly", name: "Fee Anomaly Check", schedule: "0 */6 * * *", lastRun: "12:00 UTC", nextRun: "18:00 UTC", status: "success", duration: "0.8s", mode: "inngest" },
  { id: "compliance-refresh", name: "Compliance Cache Refresh", schedule: "0 0 * * 0", lastRun: "Sun 00:00", nextRun: "next Sun", status: "success", duration: "15.2s", mode: "inngest" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 11. ADD-ON ACTIVATION (28 add-ons)
// ─────────────────────────────────────────────────────────────────────────────

export interface AddOnActivation {
  number: number;
  name: string;
  status: "Built-in" | "Specified" | "Optional" | "Reserved";
  enabled: boolean;
  aiAuthority: string;
  category: string;
}

export const ADDON_ACTIVATIONS: AddOnActivation[] = [
  { number: 1, name: "GNN Risk Engine", status: "Built-in", enabled: true, aiAuthority: "A2/A3", category: "Foundation" },
  { number: 2, name: "Federated Learning", status: "Built-in", enabled: true, aiAuthority: "A2", category: "Foundation" },
  { number: 3, name: "Causal Inference Engine", status: "Built-in", enabled: true, aiAuthority: "A1", category: "Foundation" },
  { number: 4, name: "Self-Healing Infrastructure", status: "Built-in", enabled: true, aiAuthority: "A4", category: "Foundation" },
  { number: 5, name: "Automated Penetration Testing", status: "Built-in", enabled: true, aiAuthority: "A4", category: "Foundation" },
  { number: 6, name: "Post-Quantum Cryptography", status: "Built-in", enabled: true, aiAuthority: "A4", category: "Foundation" },
  { number: 7, name: "Expanded ZK Proofs (Plonky3)", status: "Built-in", enabled: false, aiAuthority: "A4", category: "Foundation" },
  { number: 8, name: "Customs Bond & Guarantee", status: "Specified", enabled: true, aiAuthority: "A4", category: "Trade Finance" },
  { number: 9, name: "Demurrage & Detention", status: "Specified", enabled: true, aiAuthority: "A4", category: "Logistics" },
  { number: 10, name: "Cargo Insurance Marketplace", status: "Optional", enabled: true, aiAuthority: "A4", category: "Insurance" },
  { number: 14, name: "Currency Risk Management", status: "Optional", enabled: true, aiAuthority: "A2", category: "Finance" },
  { number: 15, name: "Government API Sandbox", status: "Optional", enabled: true, aiAuthority: "A0", category: "Government" },
  { number: 16, name: "FTA Preference Management", status: "Optional", enabled: true, aiAuthority: "A1", category: "Compliance" },
  { number: 17, name: "Piracy & Security Risk Engine", status: "Optional", enabled: true, aiAuthority: "A2", category: "Security" },
  { number: 18, name: "Trade Compliance Calendar", status: "Optional", enabled: true, aiAuthority: "A1", category: "Compliance" },
  { number: 26, name: "Trade Memory Layer (differential privacy)", status: "Reserved", enabled: false, aiAuthority: "A2", category: "AI" },
];

// ─────────────────────────────────────────────────────────────────────────────
// 12. PLATFORM METRICS SUMMARY
// ─────────────────────────────────────────────────────────────────────────────

export const PLATFORM_METRICS = {
  totalTenants: 185432,
  activeTenants: 184012,
  pendingTenants: 892,
  suspendedTenants: 342,
  revokedTenants: 86,
  totalTrades: 2847291,
  totalValueRouted: 24_000_000_000, // $24B
  totalGovernorDecisions: 847392,
  totalLoomBlocks: 847392,
  totalAIVerified: 4_283_947,
  totalSanctionsClear: 2_847_291,
  totalQESSignatures: 2_847_291,
  constitutionalPoints: 38,
  activeAmendments: 1,
  multisigKeyholders: 5,
  multisigThreshold: 3,
  addOnsActive: 22,
  addOnsTotal: 28,
  cronJobsActive: 10,
  featureFlagsOn: 9,
  featureFlagsTotal: 10,
};

// ─────────────────────────────────────────────────────────────────────────────
// 13. ADMIN CONTROL PANEL TABS
// ─────────────────────────────────────────────────────────────────────────────

export interface AdminTab {
  id: string;
  label: string;
  icon: LucideIcon;
  badge?: string;
}

export const ADMIN_TABS: AdminTab[] = [
  { id: "overview", label: "Overview", icon: Activity, badge: "live" },
  { id: "constitution", label: "Constitution", icon: Scale, badge: "38" },
  { id: "tenants", label: "Tenants", icon: Users, badge: "185K" },
  { id: "governor", label: "Governor", icon: Gavel, badge: "G1-G7" },
  { id: "loom", label: "Loom Chain", icon: GitBranch, badge: "847K" },
  { id: "ai", label: "AI Agents", icon: Brain, badge: "A0-A4" },
  { id: "security", label: "Security", icon: ShieldCheck },
  { id: "multisig", label: "Multisig", icon: KeyRound, badge: "3/5" },
  { id: "config", label: "Config", icon: Settings },
  { id: "diagnostics", label: "Diagnostics", icon: Server },
];

// ─────────────────────────────────────────────────────────────────────────────
// COLOR HELPERS
// ─────────────────────────────────────────────────────────────────────────────
export const STATUS_COLOR: Record<string, string> = {
  operational: "#34d399",
  degraded: "#fbbf24",
  down: "#f87171",
  active: "#34d399",
  suspended: "#fbbf24",
  pending: "#60a5fa",
  revoked: "#f87171",
  protected: "#34d399",
  monitoring: "#fbbf24",
  investigating: "#f87171",
  success: "#34d399",
  running: "#60a5fa",
  failed: "#f87171",
  queued: "#fbbf24",
  available: "#34d399",
  signing: "#60a5fa",
  offline: "#94a3b8",
  "awaiting-signature": "#fbbf24",
  signed: "#34d399",
  "amendment-proposed": "#fbbf24",
  "under-review": "#60a5fa",
};

export const VERDICT_COLOR: Record<string, string> = {
  ALLOW: "#34d399",
  CONDITIONAL: "#fbbf24",
  DENY: "#f87171",
};
