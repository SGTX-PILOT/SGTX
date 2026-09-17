// @ts-nocheck
// SGTX Part 14 — Security & Threat Model
//
// Production stack (per blueprint Part 14):
//   - Cilium (eBPF) — L7 network policies, service mesh mTLS
//   - Falco          — runtime syscall anomaly detection (Container Threat Detection)
//   - Wazuh          — HIDS file-integrity + log analysis
//   - Trivy          — container image CVE scanning
//   - Prometheus Alertmanager — security alert routing
//   - SoftHSM (production: Thales Luna HSM) — root key custody
//   - Sigstore + Rekor — software supply-chain attestation
//
// This module simulates:
//   - STRIDE threat analysis per component × trust boundary (Part 14.1)
//   - MITRE ATT&CK TTP mapping (Part 14.2) — coverage matrix
//   - HSM key inventory + custody audit trail (Part 14.3)
//   - Certificate inventory across ALL services (gov adapters, mTLS mesh,
//     signing certs, webhook HMAC keys)
//   - Security incident tracking — wraps the existing Incident table for
//     security-specific views
//   - Key rotation (Ed25519 / Dilithium3 / RSA-2048 / mTLS) — Part 14.4
//   - STRIDE rescan — re-runs the threat model simulation
//
// All cryptographic operations are SIMULATED — no real key material is stored.
// Key fingerprints are SHA256 hashes of stable identifiers.
//
// Persistence:
//   - Key rotation events → ConfigurationHistory (configKey = `hsm_key.<purpose>`)
//   - Security incidents  → Incident table (severity P0-P3)
//   - Threat findings     → ThreatFinding table (existing, Part 24.3)

import { createHash, randomBytes } from "crypto";
import { freshDb } from "@/lib/db-fresh";
import { db as _maritimeDb } from "@/lib/db";
import { logger as _maritimeLogger } from "@/lib/sgtx/logger";

// ──────────────────────────────────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────────────────────────────────

export type StrideCategory =
  | "Spoofing"
  | "Tampering"
  | "Repudiation"
  | "Information_Disclosure"
  | "Denial_of_Service"
  | "Elevation_of_Privilege";

export type StrideSeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
export type StrideStatus = "MITIGATED" | "PARTIAL" | "ACCEPTED" | "OPEN";

export interface StrideThreat {
  category: StrideCategory;
  threatId: string; // STRIDE-<asset>-<category>-<n>
  description: string;
  severity: StrideSeverity;
  status: StrideStatus;
  mitigation: string;
  residualRisk: StrideSeverity;
  trustBoundary: string; // "Internet→DMZ" | "DMZ→Platform" | "Platform→HSM" | etc.
}

export interface StrideAsset {
  assetId: string;
  name: string;
  component: string; // "Governor Service" | "FeeLock KV" | "Container Release API" | etc.
  trustBoundary: string;
  description: string;
  threats: StrideThreat[];
  coverageScore: number; // 0-100 — % of STRIDE categories with mitigations
}

export interface MitreMapping {
  tacticId: string; // TA0001 — Initial Access
  tactic: string;
  techniqueId: string; // T1078 — Valid Accounts
  technique: string;
  relevantAssets: string[];
  detectionControls: string[];
  mitigationControls: string[];
  coverage: "FULL" | "PARTIAL" | "NONE";
}

export type HSMKeyType = "Ed25519" | "Dilithium3" | "RSA-2048" | "ECDSA-P256" | "HMAC-SHA256" | "Kyber768";
export type HSMKeyPurpose =
  | "GOVERNOR_SIGNING"
  | "GOVERNOR_LOOM_ANCHOR"
  | "PSP_WEBHOOK_HMAC"
  | "GOV_ADAPTER_MTLS"
  | "WASM_MODULE_SIGNING"
  | "RESERVE_PROOF"
  | "CONSTITUTIONAL_ANCHOR"
  | "TOKEN_ISSUANCE";
export type HSMKeyStatus = "ACTIVE" | "ROTATING" | "ARCHIVED" | "COMPROMISED";

export interface HSMKey {
  keyId: string; // HSM-<purpose>-<seq>
  label: string;
  purpose: HSMKeyPurpose;
  algorithm: HSMKeyType;
  status: HSMKeyStatus;
  fingerprint: string; // sha256:<64hex>
  createdAt: string;
  rotatedAt: string | null;
  rotationDueAt: string;
  usageCount: number;
  hsmSlot: number;
  custodyQuorum: number; // # of approvers required to use
  lastAuditAt: string;
}

export interface HSMStatus {
  keys: HSMKey[];
  hsmType: "SoftHSM" | "Luna";
  status: "OPERATIONAL" | "DEGRADED";
  lastAuditAt: string;
  totalKeys: number;
  activeKeys: number;
  rotatingKeys: number;
  compromisedKeys: number;
  pendingRotations: number;
}

export interface KeyRotationResult {
  ok: boolean;
  keyId: string;
  oldKeyId: string;
  newKeyId: string;
  algorithm: HSMKeyType;
  purpose: HSMKeyPurpose;
  oldFingerprint: string;
  newFingerprint: string;
  rotatedAt: string;
  rotationDueAt: string;
  loomAnchor: string;
  auditTrailId: string;
  reason: string;
}

export interface SecurityIncident {
  id: string;
  severity: string; // P0 | P1 | P2 | P3
  status: string; // OPEN | INVESTIGATING | RESOLVED | CLOSED
  title: string;
  description: string;
  affectedSystems: string[];
  rootCause: string | null;
  resolution: string | null;
  openedAt: string;
  resolvedAt: string | null;
  mitreTactic?: string;
  mitreTechnique?: string;
  strideCategory?: StrideCategory;
}

export interface SecurityIncidentsResult {
  incidents: SecurityIncident[];
  openCount: number;
  criticalCount: number;
  total: number;
}

export interface Cert {
  certId: string;
  subject: string;
  issuer: string;
  service: string; // "Nafeza Adapter" | "CargoX Adapter" | "Governor Service" | ...
  purpose: string; // "mTLS" | "QES Signing" | "Webhook HMAC" | "mTLS Mesh"
  algorithm: HSMKeyType | "RSA-4096";
  serialNumber: string;
  fingerprint: string;
  validFrom: string;
  validUntil: string;
  daysUntilExpiry: number;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ROTATING";
  ca: string;
  rotationRecommended: boolean;
}

export interface CertificateInventory {
  certificates: Cert[];
  expiringIn30Days: Cert[];
  expired: Cert[];
  total: number;
  activeCount: number;
  rotatingCount: number;
  byService: Record<string, number>;
  checkedAt: string;
}

export interface KeyRotationPolicy {
  rotationIntervalDays: number;
  lastRotation: string;
  nextRotation: string;
  algorithms: HSMKeyType[];
  byAlgorithm: Record<string, { intervalDays: number; lastRotation: string; nextRotation: string; count: number }>;
  policy: string;
}

export interface StrideScanResult {
  ok: boolean;
  assetsScanned: number;
  threatsIdentified: number;
  mitigationsApplied: number;
  newThreats: number;
  resolvedThreats: number;
  scanDurationMs: number;
  startedAt: string;
  finishedAt: string;
  scannedBy: string;
  coverageScore: number;
}

export interface ThreatModel {
  strideAnalysis: StrideAsset[];
  mitreMappings: MitreMapping[];
  lastUpdated: string;
  totalAssets: number;
  totalThreats: number;
  mitigatedThreats: number;
  openThreats: number;
  criticalThreats: number;
  coverageScore: number;
}

// ──────────────────────────────────────────────────────────────────────────
// STRIDE threat model — fixed baseline (Part 14.1)
// ──────────────────────────────────────────────────────────────────────────

const STRIDE_ASSETS: StrideAsset[] = [
  {
    assetId: "STRIDE-GOV-001",
    name: "Governor Decision Service",
    component: "Governor Service",
    trustBoundary: "Platform→HSM",
    description:
      "The constitutional Governor evaluates every platform decision through 7 WASM modules and emits a Loom-anchored verdict (ALLOW/CONDITIONAL/DENY). Private signing key lives in HSM slot 0.",
    coverageScore: 92,
    threats: [
      {
        category: "Spoofing",
        threatId: "STRIDE-GOV-001-S-1",
        description:
          "Attacker submits a forged Governor decision with a valid signature (key exfiltration or signing oracle abuse).",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Ed25519 signing key held in HSM slot 0 with 3-of-5 custody quorum. All decisions Loom-anchored; replay verifier detects tamper within 1h.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Tampering",
        threatId: "STRIDE-GOV-001-T-1",
        description:
          "Constitutional WASM module is replaced with a malicious build at deploy time (supply-chain attack).",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Modules signed by Platform Governance Authority (Ed25519). SHA256 + signature verified on every hot-reload (Part 1.3.5). Sigstore + Rekor transparency log.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-GOV-001-R-1",
        description: "Actor disputes having triggered a Governor action (e.g. break-glass deny-all).",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Every decision carries actorGtid + signature + Loom hash. The Loom chain is append-only and verifiable via /api/sgtx/governor/loom/replay.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-GOV-001-I-1",
        description: "Governor decision payload contains PII (buyer/seller GTID, trade value) leaked via logs.",
        severity: "MEDIUM",
        status: "PARTIAL",
        mitigation:
          "Logs redact PII via structured logging. Loki retention 30d. PII fields encrypted at rest with AES-256-GCM.",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-GOV-001-D-1",
        description: "Adversary floods Governor with decision requests, exhausting the WASM pool and stalling critical trades.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Per-tenant rate limit (1000 req/min). NATS JetStream queue absorbs bursts. WasmEdge runtime is preemptible; excess requests return 429.",
        residualRisk: "LOW",
        trustBoundary: "DMZ→Platform",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-GOV-001-E-1",
        description: "Operator escalates to Platform Governance Authority via a buggy permission check.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "OPA Rego `permissions.rego` enforces RBAC. Dual-mode context (BUY/SELL/DUAL) prevents cross-context actions. Marketplace-buyer ban enforced in constitution.",
        residualRisk: "LOW",
        trustBoundary: "DMZ→Platform",
      },
    ],
  },
  {
    assetId: "STRIDE-FEALOCK-002",
    name: "FeeLock KV (NATS JetStream)",
    component: "FeeLock KV",
    trustBoundary: "Platform→PSP",
    description:
      "Non-custodial FeeLock holds 1.5% fee split across PSP intents until settlement confirmation. Backed by NATS JetStream KV with strong consistency.",
    coverageScore: 88,
    threats: [
      {
        category: "Tampering",
        threatId: "STRIDE-FEALOCK-002-T-1",
        description: "PSP webhook forges a settlement-confirmation message, releasing FeeLock funds to the wrong party.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Each PSP webhook has a distinct HMAC algorithm (FAWRY=HMAC-SHA256, PAYMOB=SHA-512, STRIPE=t=,v1=, CBE_IPN=mTLS fingerprint). Webhook signatures verified in `/api/sgtx/payment/psp/[provider]/webhook`.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-FEALOCK-002-R-1",
        description: "Buyer disputes fee deduction claiming it was never authorized.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "FeeLock freeze/release is Loom-anchored with PSP intent reference. Reconciliation report (Part 5) cross-reconciles PSP statements weekly.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-FEALOCK-002-D-1",
        description: "JetStream KV partition exhaustion through malformed fee splits.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "KV max entry size 1MB enforced. Per-USTN idempotency key dedup. NATS stream replicated 3x across sovereign nodes.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-FEALOCK-002-I-1",
        description: "Fee split structure leaks counterparty identity to PSP.",
        severity: "MEDIUM",
        status: "PARTIAL",
        mitigation:
          "PSP receives only `{amount, currency, intent_id}`. Buyer/seller GTIDs never sent. KYC handled inside SGTX only.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
      {
        category: "Spoofing",
        threatId: "STRIDE-FEALOCK-002-S-1",
        description: "Adversary impersonates the SGTX payment service to the PSP and requests a refund.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "PSP API calls use mTLS with Egypt Trust CA-issued client certs (Part 7.2). API key rotated every 90 days.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-FEALOCK-002-E-1",
        description: "Internal operator triggers manual FeeLock release without authorization.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Manual release requires 3-of-5 multisig (MultisigRequest table). All releases Loom-anchored with reason code.",
        residualRisk: "LOW",
        trustBoundary: "Platform→PSP",
      },
    ],
  },
  {
    assetId: "STRIDE-RELEASE-003",
    name: "Container Release API",
    component: "Container Release API",
    trustBoundary: "Platform→Port",
    description:
      "Issues Container Release Letters (CRL) to shipping lines / port authorities. Authoritative signal for physical cargo release at port of discharge.",
    coverageScore: 85,
    threats: [
      {
        category: "Spoofing",
        threatId: "STRIDE-RELEASE-003-S-1",
        description: "Fraudster requests a CRL with a forged B/L and re-routes a container to a wrong consignee.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "CRL requires: (1) verified B/L from shipping line webhook, (2) customs clearance from Nafeza, (3) FeeLock confirmation. All three must agree on USTN + container number.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Port",
      },
      {
        category: "Tampering",
        threatId: "STRIDE-RELEASE-003-T-1",
        description: "Insider tampers with the CRL PDF after generation, changing the container number.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "CRL PDF is PAdES-LT signed (QES). SHA256 of signed PDF is Loom-anchored. Port authority verifies signature + hash via /api/sgtx/release/crl/verify.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Port",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-RELEASE-003-R-1",
        description: "Shipping line claims they never received the release authorization.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Release webhook (POST to shipping line) returns signed acknowledgment. Delivery logged in WebhookDeliveryLog with retry history.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Port",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-RELEASE-003-D-1",
        description: "Botnet floods the release webhook endpoint, delaying legitimate releases.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Cilium L7 rate limit (100 req/min per source IP). Webhook signature verification drops invalid requests at the edge.",
        residualRisk: "LOW",
        trustBoundary: "Internet→DMZ",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-RELEASE-003-E-1",
        description: "Customs broker triggers release without the shipping line's countersignature.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Release authorization requires dual signatures: customs broker + shipping line. OPA policy `logistics.rego` enforces both signatures before CRL issuance.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Port",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-RELEASE-003-I-1",
        description: "CRL PDF is leaked to a competitor revealing trade counterparty + cargo.",
        severity: "MEDIUM",
        status: "PARTIAL",
        mitigation:
          "CRL encrypted to recipient's public key (PGP or JWE). Access logged. PII redaction option for non-port recipients.",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→Port",
      },
    ],
  },
  {
    assetId: "STRIDE-GOVADAPTER-004",
    name: "Government Adapter Layer (Nafeza/CargoX/ETA/CBE)",
    component: "Government Adapter Layer",
    trustBoundary: "Platform→Government",
    description:
      "Integrates with sovereign government systems: Nafeza (customs), CargoX (B/L), ETA (e-invoice), CBE (settlement). Each adapter has its own mTLS cert + rate limit + idempotency window.",
    coverageScore: 90,
    threats: [
      {
        category: "Spoofing",
        threatId: "STRIDE-GOVADAPTER-004-S-1",
        description: "Adversary operates a fake Nafeza endpoint and intercepts declarations.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "mTLS with Egypt Trust CA G2 (cert pinning). Endpoint URLs hardcoded, not configurable. DNS-over-HTTPS for resolution.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Government",
      },
      {
        category: "Tampering",
        threatId: "STRIDE-GOVADAPTER-004-T-1",
        description: "Man-in-the-middle modifies the ACI declaration payload in transit.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "mTLS provides transport integrity. Payloads additionally signed with platform Ed25519 key; signature verified at Nafeza side.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Government",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-GOVADAPTER-004-R-1",
        description: "Government claims a declaration was never submitted; we cannot prove it.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Every adapter call persists `X-Request-ID` + USTN + response to Activity table. Idempotency key store (Part 6.12) allows exact replay.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Government",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-GOVADAPTER-004-D-1",
        description: "Adapter rate-limit hit (Nafeza 100/min, CBE 30/min) blocks critical declarations during peak.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "NATS JetStream queue per adapter (`gov.nafeza.declaration`). 3-retry exponential backoff (1s/2s/4s). Priority lane for P0 USTNs.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Government",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-GOVADAPTER-004-I-1",
        description: "Government adapter response (containing full customs declaration) leaks via logs.",
        severity: "HIGH",
        status: "PARTIAL",
        mitigation:
          "Response payloads redacted in logs (only status + reference retained). Full payload encrypted at rest, accessible only via break-glass with 3-of-5 multisig.",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→Government",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-GOVADAPTER-004-E-1",
        description: "Operator uses the CBE settlement adapter to drain the reserve account.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Settlement requires dual authorization (Operations + Finance). Reserve withdrawal capped at 5% per day. OPA `reserve.rego` enforces 110% backing ratio post-withdrawal.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Government",
      },
    ],
  },
  {
    assetId: "STRIDE-PORTAL-005",
    name: "Trader & Role Portals (Next.js)",
    component: "Portal Frontend",
    trustBoundary: "Internet→DMZ",
    description:
      "10 role portals (Trader, LSP, SHIP, LAB, QC, CBR, BANK, PFI, GOV, Admin) + Universal Command Center. Passkey-based auth with optional WebAuthn step-up.",
    coverageScore: 87,
    threats: [
      {
        category: "Spoofing",
        threatId: "STRIDE-PORTAL-005-S-1",
        description: "Credential-stuffing attack against trader logins.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Passkeys (WebAuthn) primary auth. Password-based fallback behind 2FA. Account lockout after 5 failed attempts. Cilium L7 detects credential-spray patterns.",
        residualRisk: "LOW",
        trustBoundary: "Internet→DMZ",
      },
      {
        category: "Tampering",
        threatId: "STRIDE-PORTAL-005-T-1",
        description: "Malicious browser extension modifies trade-request payload client-side.",
        severity: "HIGH",
        status: "PARTIAL",
        mitigation:
          "Server-side OPA re-validates every action. CSP + SRI prevent unsigned script execution. Trade-request signing required for amounts >$100k.",
        residualRisk: "MEDIUM",
        trustBoundary: "Internet→DMZ",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-PORTAL-005-R-1",
        description: "Trader claims a contract was signed without their consent.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "QES signing (Part 4.5) for master contracts. Each signature timestamped via TSA + Loom-anchored. Signed PDF retained 7 years (PDPL).",
        residualRisk: "LOW",
        trustBoundary: "Internet→DMZ",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-PORTAL-005-I-1",
        description: "Cross-tenant data leak through buggy RLS policy.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "PostgreSQL 18 Row-Level Security per-tenant. Every query carries `tenant_gtid` from session. Automated RLS test suite (50 cases) runs in CI.",
        residualRisk: "LOW",
        trustBoundary: "DMZ→Platform",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-PORTAL-005-D-1",
        description: "Botnet floods the Universal Command Center, degrading service for legitimate traders.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Cloudflare in front (Anycast). Cilium L7 rate limit. Next.js ISR cache for static surfaces. WebSocket connections capped at 5 per session.",
        residualRisk: "LOW",
        trustBoundary: "Internet→DMZ",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-PORTAL-005-E-1",
        description: "Trader exploits an IDOR to view another tenant's trade.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Every API route checks `req.tenantGtid === resource.tenantGtid`. OPA `permissions.rego` enforces data-scope rules. Bug bounty program (HackerOne).",
        residualRisk: "LOW",
        trustBoundary: "DMZ→Platform",
      },
    ],
  },
  {
    assetId: "STRIDE-HSM-006",
    name: "SoftHSM / Luna HSM (Root Key Custody)",
    component: "HSM",
    trustBoundary: "Platform→HSM",
    description:
      "Hardware Security Module holds the root signing keys (Governor Ed25519, WASM module signing, reserve proof). Production: Thales Luna 7 with FIPS 140-2 Level 3. Dev: SoftHSM.",
    coverageScore: 95,
    threats: [
      {
        category: "Tampering",
        threatId: "STRIDE-HSM-006-T-1",
        description: "Insider attempts to extract the Governor signing key from HSM.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "HSM enforces non-exportable keys. 3-of-5 custody quorum required for any signing operation. Tamper-evident casing (Luna). All HSM operations logged to immutable audit trail.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-HSM-006-D-1",
        description: "HSM offline — Governor cannot sign decisions, halting all trades.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "HSM HA pair (active-active). SoftHSM fallback in dev. Break-glass mode allows unsigned decisions under P0 incident + 4-of-5 multisig (time-boxed 1h).",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-HSM-006-E-1",
        description: "HSM admin quorum collusion to sign unauthorized transactions.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "5 custodians across 3 jurisdictions (Cairo, Dubai, Frankfurt). Smart-card based authentication. Annual third-party custody audit (Big Four).",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Spoofing",
        threatId: "STRIDE-HSM-006-S-1",
        description: "Stolen custodian smart-card used to authorize HSM operation.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Each custodian requires smart-card + PIN + biometric. PIN changes every 90 days. Failed attempts trigger lockout + P0 incident.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-HSM-006-R-1",
        description: "Custodian denies having authorized a key rotation.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Every HSM operation produces a signed audit entry (custodian ID + timestamp + op + key ID). Audit log replicated to 3 sovereign nodes + Loom-anchored daily.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-HSM-006-I-1",
        description: "Side-channel attack on HSM reveals signing key material.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Luna 7 with side-channel countermeasures (DPA/SPA resistant). HSM physically isolated in sovereign datacenter. No remote admin — on-prem console only.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
    ],
  },
  {
    assetId: "STRIDE-LOOM-007",
    name: "Loom Append-Only Audit Chain",
    component: "Loom Verifier",
    trustBoundary: "Platform→Audit",
    description:
      "Every Governor decision is hashed + Loom-anchored to form an append-only chain. Tamper detection within 1h via hourly replay verifier (Part 1.6).",
    coverageScore: 93,
    threats: [
      {
        category: "Tampering",
        threatId: "STRIDE-LOOM-007-T-1",
        description: "Adversary with DB write access backdates or rewrites a Governor decision row.",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Each decision's hash incorporates the previous hash (chain). Replay verifier recomputes all hashes hourly; mismatch triggers P0 incident + halts new trades.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Audit",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-LOOM-007-D-1",
        description: "Adversary fills the Loom chain with junk decisions, slowing replay.",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Replay is O(n) but each decision <2KB. 1M decisions replay in <60s (benchmarked). Sharding by month planned for v12.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Audit",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-LOOM-007-R-1",
        description: "Actor claims a Loom-anchored decision was retroactively inserted.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Each Loom hash includes the previous hash + timestamp. External Loom-anchor exports allow third-party verification via `/api/sgtx/governor/loom/export`.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Audit",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-LOOM-007-I-1",
        description: "Loom chain contains PII (trade values, GTIDs) — data subject requests erasure.",
        severity: "MEDIUM",
        status: "ACCEPTED",
        mitigation:
          "Loom chain is append-only by design — erasure is impossible. PDPL Art. 17 exemption for audit logs applies. PII minimized at signing time.",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→Audit",
      },
      {
        category: "Spoofing",
        threatId: "STRIDE-LOOM-007-S-1",
        description: "Adversary submits a forged decision with a fake signature.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Signature verification uses HSM-stored Ed25519 public key. Forge requires the HSM private key — non-exportable.",
        residualRisk: "LOW",
        trustBoundary: "Platform→Audit",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-LOOM-007-E-1",
        description: "Operator with DB write access inserts a benign-looking decision to bypass the chain.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Replay verifier checks signature on every decision. Unsigned or invalid-signature decisions trigger P0 incident. DB write access restricted to 2 operators (4-eyes).",
        residualRisk: "LOW",
        trustBoundary: "Platform→Audit",
      },
    ],
  },
  {
    assetId: "STRIDE-WASM-008",
    name: "Constitutional WASM Modules (7)",
    component: "Constitutional Engine",
    trustBoundary: "Platform→HSM",
    description:
      "7 immutable WASM modules enforce constitutional rules: fee bounds, jurisdiction matrix, incoterms, fee gate, distressed country gate, dual-mode gate, reserve rules. Hot-reloadable via NATS subject `constitutional.modules.update`.",
    coverageScore: 91,
    threats: [
      {
        category: "Tampering",
        threatId: "STRIDE-WASM-008-T-1",
        description: "Hot-reload pushes a malicious WASM bundle (compromised Platform Governance Authority signer).",
        severity: "CRITICAL",
        status: "MITIGATED",
        mitigation:
          "Bundle signed by Platform Governance Authority (Ed25519). SHA256 + signature verified on every reload (Part 1.3.5). 3-of-5 multisig required for reload.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Denial_of_Service",
        threatId: "STRIDE-WASM-008-D-1",
        description: "Malformed WASM module crashes WasmEdge runtime on load.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "WasmEdge runtime is sandboxed (no host I/O). Module load test suite in CI (200 cases). Atomic swap — old module remains ACTIVE until new one passes smoke tests.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Elevation_of_Privilege",
        threatId: "STRIDE-WASM-008-E-1",
        description: "Constitutional rule bypass via crafted input that triggers an edge-case.",
        severity: "HIGH",
        status: "PARTIAL",
        mitigation:
          "Property-based testing (300 cases) for each module. Bug bounty program. Fuzzer runs nightly. All edge-case denials audited.",
        residualRisk: "MEDIUM",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Repudiation",
        threatId: "STRIDE-WASM-008-R-1",
        description: "Module version dispute — which version was active when decision was made?",
        severity: "MEDIUM",
        status: "MITIGATED",
        mitigation:
          "Each Governor decision logs the active module versions (ModuleVersions snapshot). Hot-reload events Loom-anchored via ConfigurationHistory.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Information_Disclosure",
        threatId: "STRIDE-WASM-008-I-1",
        description: "WASM module is reverse-engineered, revealing internal rule logic.",
        severity: "LOW",
        status: "ACCEPTED",
        mitigation:
          "Constitutional rules are public (Part 1.2). WASM is the enforcement artifact; logic is documented in the blueprint. No proprietary algorithms.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
      {
        category: "Spoofing",
        threatId: "STRIDE-WASM-008-S-1",
        description: "Fake WASM module registry serves an old compromised version.",
        severity: "HIGH",
        status: "MITIGATED",
        mitigation:
          "Module registry is in-process (no remote). On cold start, modules loaded from signed OCI artifacts only. Version manifest Loom-anchored at genesis.",
        residualRisk: "LOW",
        trustBoundary: "Platform→HSM",
      },
    ],
  },
];

// ──────────────────────────────────────────────────────────────────────────
// MITRE ATT&CK mapping (Part 14.2) — coverage matrix for enterprise tactics
// ──────────────────────────────────────────────────────────────────────────

const MITRE_MAPPINGS: MitreMapping[] = [
  {
    tacticId: "TA0001",
    tactic: "Initial Access",
    techniqueId: "T1078",
    technique: "Valid Accounts",
    relevantAssets: ["Portal Frontend", "Governor Service"],
    detectionControls: [
      "Passkey-based auth (WebAuthn) — no passwords to phish",
      "Falco syscall anomaly detection on login events",
      "Cilium L7 detects credential-spray patterns",
    ],
    mitigationControls: [
      "Account lockout after 5 failed attempts",
      "OPA `permissions.rego` enforces RBAC + dual-mode context",
      "Session risk scoring — step-up auth for high-risk actions",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0001",
    tactic: "Initial Access",
    techniqueId: "T1190",
    technique: "Exploit Public-Facing Application",
    relevantAssets: ["Portal Frontend", "Container Release API"],
    detectionControls: [
      "Cloudflare WAF + rate limit",
      "Falco detects unusual API call patterns",
      "Snyk + Trivy scan in CI for known CVEs",
    ],
    mitigationControls: [
      "Cilium L7 network policies (zero-trust east-west)",
      "Next.js ISR cache + CSP + SRI",
      "Bug bounty program (HackerOne)",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0002",
    tactic: "Execution",
    techniqueId: "T1059",
    technique: "Command and Scripting Interpreter",
    relevantAssets: ["Constitutional Engine", "Governor Service"],
    detectionControls: [
      "WasmEdge sandbox — no shell execution possible",
      "Falco syscall trace on wasm runtime",
    ],
    mitigationControls: [
      "No `eval` / `child_process` in production code",
      "WASM modules sandboxed (no host I/O)",
      "Cilium blocks egress from WASM runtime",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0003",
    tactic: "Persistence",
    techniqueId: "T1098",
    technique: "Account Manipulation",
    relevantAssets: ["Portal Frontend", "HSM"],
    detectionControls: [
      "Alert on role escalation (Falco + Loki rule)",
      "HSM quorum changes logged to ConfigurationHistory",
      "MultisigRequest table tracks all permission grants",
    ],
    mitigationControls: [
      "3-of-5 multisig for admin role grants",
      "4-of-5 multisig for HSM custodian changes",
      "Annual third-party custody audit (Big Four)",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0004",
    tactic: "Privilege Escalation",
    techniqueId: "T1068",
    technique: "Exploitation for Privilege Escalation",
    relevantAssets: ["Portal Frontend", "Government Adapter Layer"],
    detectionControls: [
      "Falco detects setuid / capability escalation",
      "Trivy scans container images for SUID binaries",
      "OPA policy denies privileged pods",
    ],
    mitigationControls: [
      "Containers run as non-root (uid 1000)",
      "K3s PodSecurityPolicy: restricted",
      "No hostPath mounts in production",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0005",
    tactic: "Defense Evasion",
    techniqueId: "T1027",
    technique: "Obfuscated Files or Information",
    relevantAssets: ["Constitutional Engine"],
    detectionControls: [
      "WASM modules hashed + signed — tamper evident",
      "Loom replay verifier detects hash mismatch within 1h",
      "Falco detects runtime patching of wasm binaries",
    ],
    mitigationControls: [
      "Module registry in-process (no remote updates)",
      "Hot-reload requires 3-of-5 multisig",
      "Sigstore + Rekor transparency log for builds",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0006",
    tactic: "Credential Access",
    techniqueId: "T1552",
    technique: "Unsecured Credentials",
    relevantAssets: ["HSM", "Government Adapter Layer"],
    detectionControls: [
      "Falco detects secrets in env vars / files",
      "Trivy scans for hardcoded secrets in images",
      "HSM key usage audit trail",
    ],
    mitigationControls: [
      "All secrets in HSM or Kubernetes Secrets (encrypted at rest)",
      "No long-lived API keys — short-lived JWT (5min TTL)",
      "PSP API keys rotated every 90 days",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0007",
    tactic: "Discovery",
    techniqueId: "T1046",
    technique: "Network Service Discovery",
    relevantAssets: ["Portal Frontend", "Container Release API"],
    detectionControls: [
      "Cilium L7 logs all east-west connections",
      "Falco detects port-scan syscall patterns",
      "Cloudflare blocks known scanner IPs",
    ],
    mitigationControls: [
      "Zero-trust east-west (default deny)",
      "mTLS between all services (Cilium service mesh)",
      "No public admin endpoints",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0008",
    tactic: "Lateral Movement",
    techniqueId: "T1021",
    technique: "Remote Services",
    relevantAssets: ["Government Adapter Layer", "FeeLock KV"],
    detectionControls: [
      "Cilium service mesh — all east-west mTLS",
      "Falco detects unusual service-to-service calls",
      "Loki logs every inter-service request",
    ],
    mitigationControls: [
      "Network policies per namespace (K3s + Cilium)",
      "No shared service accounts — per-pod identity",
      "OPA `permissions.rego` enforces data-scope",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0009",
    tactic: "Collection",
    techniqueId: "T1213",
    technique: "Data from Information Repositories",
    relevantAssets: ["Governor Service", "Loom Verifier"],
    detectionControls: [
      "PostgreSQL 18 audit log (pgaudit) — all SELECTs logged",
      "Falco detects bulk exports",
      "Break-glass required for raw DB access",
    ],
    mitigationControls: [
      "Row-Level Security per tenant",
      "Break-glass 4-eyes + 1h time-box",
      "Encrypted backups (AES-256-GCM)",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0010",
    tactic: "Exfiltration",
    techniqueId: "T1041",
    technique: "Exfiltration Over C2 Channel",
    relevantAssets: ["Portal Frontend", "Government Adapter Layer"],
    detectionControls: [
      "Cilium egress allow-list (egress only to known endpoints)",
      "Falco detects large outbound transfers",
      "Cloudflare egress analytics",
    ],
    mitigationControls: [
      "No direct internet egress from internal services",
      "All egress via Cilium-allowed endpoints",
      "DLP scan on outbound attachments",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0011",
    tactic: "Command and Control",
    techniqueId: "T1071",
    technique: "Application Layer Protocol",
    relevantAssets: ["Portal Frontend"],
    detectionControls: [
      "Cilium L7 — DNS allow-list",
      "Falco detects DNS tunneling",
      "Cloudflare blocks known C2 domains",
    ],
    mitigationControls: [
      "DNS-over-HTTPS enforced on all nodes",
      "No raw IP egress",
      "Cilium policy: deny unknown protocols",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0040",
    tactic: "Impact",
    techniqueId: "T1485",
    technique: "Data Destruction",
    relevantAssets: ["Loom Verifier", "HSM"],
    detectionControls: [
      "Loom replay verifier detects deletion / tamper",
      "HSM operations audit trail",
      "Wazuh HIDS on DB nodes",
    ],
    mitigationControls: [
      "Loom chain is append-only (no deletes)",
      "Daily encrypted backups to 3 sovereign regions",
      "HSM non-destructive key operations only",
    ],
    coverage: "FULL",
  },
  {
    tacticId: "TA0040",
    tactic: "Impact",
    techniqueId: "T1498",
    technique: "Network Denial of Service",
    relevantAssets: ["Portal Frontend", "Container Release API"],
    detectionControls: [
      "Cloudflare Anycast absorbs volumetric DDoS",
      "Cilium L7 rate limit",
      "Prometheus alert on p99 latency spike",
    ],
    mitigationControls: [
      "Cloudflare in front (Anycast, 200+ PoPs)",
      "K3s horizontal autoscaling",
      "Circuit breakers on outbound PSP / gov calls",
    ],
    coverage: "PARTIAL",
  },
];

// ──────────────────────────────────────────────────────────────────────────
// HSM key inventory (Part 14.3) — simulated SoftHSM keys
// ──────────────────────────────────────────────────────────────────────────

const NOW_ISO = () => new Date().toISOString();
const DAYS = (n: number) => n * 24 * 60 * 60 * 1000;

const HSM_SALT = "sgtx-hsm-custody-v1";

function fingerprintFor(purpose: HSMKeyPurpose, algorithm: HSMKeyType, seq: number): string {
  return "sha256:" + createHash("sha256")
    .update(`sgtx-hsm|${purpose}|${algorithm}|${seq}|${HSM_SALT}`)
    .digest("hex");
}

const INITIAL_HSM_KEYS: HSMKey[] = [
  {
    keyId: "HSM-GOVERNOR_SIGNING-001",
    label: "Governor Decision Signing Key",
    purpose: "GOVERNOR_SIGNING",
    algorithm: "Ed25519",
    status: "ACTIVE",
    fingerprint: fingerprintFor("GOVERNOR_SIGNING", "Ed25519", 1),
    createdAt: "2026-01-01T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() + DAYS(180)).toISOString(),
    usageCount: 142389,
    hsmSlot: 0,
    custodyQuorum: 3,
    lastAuditAt: new Date(Date.now() - DAYS(7)).toISOString(),
  },
  {
    keyId: "HSM-GOVERNOR_LOOM_ANCHOR-001",
    label: "Loom Chain Anchor Key",
    purpose: "GOVERNOR_LOOM_ANCHOR",
    algorithm: "Ed25519",
    status: "ACTIVE",
    fingerprint: fingerprintFor("GOVERNOR_LOOM_ANCHOR", "Ed25519", 1),
    createdAt: "2026-01-01T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() + DAYS(180)).toISOString(),
    usageCount: 142389,
    hsmSlot: 0,
    custodyQuorum: 3,
    lastAuditAt: new Date(Date.now() - DAYS(7)).toISOString(),
  },
  {
    keyId: "HSM-PSP_WEBHOOK_HMAC-FAWRY-001",
    label: "FAWRY Webhook HMAC Key",
    purpose: "PSP_WEBHOOK_HMAC",
    algorithm: "HMAC-SHA256",
    status: "ACTIVE",
    fingerprint: fingerprintFor("PSP_WEBHOOK_HMAC", "HMAC-SHA256", 1),
    createdAt: "2026-02-15T00:00:00.000Z",
    rotatedAt: "2026-05-15T00:00:00.000Z",
    rotationDueAt: new Date(Date.now() + DAYS(45)).toISOString(),
    usageCount: 8421,
    hsmSlot: 1,
    custodyQuorum: 2,
    lastAuditAt: new Date(Date.now() - DAYS(3)).toISOString(),
  },
  {
    keyId: "HSM-PSP_WEBHOOK_HMAC-PAYMOB-001",
    label: "PAYMOB Webhook HMAC Key",
    purpose: "PSP_WEBHOOK_HMAC",
    algorithm: "HMAC-SHA256",
    status: "ACTIVE",
    fingerprint: fingerprintFor("PSP_WEBHOOK_HMAC", "HMAC-SHA256", 2),
    createdAt: "2026-02-20T00:00:00.000Z",
    rotatedAt: "2026-05-20T00:00:00.000Z",
    rotationDueAt: new Date(Date.now() + DAYS(40)).toISOString(),
    usageCount: 5234,
    hsmSlot: 1,
    custodyQuorum: 2,
    lastAuditAt: new Date(Date.now() - DAYS(3)).toISOString(),
  },
  {
    keyId: "HSM-PSP_WEBHOOK_HMAC-STRIPE-001",
    label: "STRIPE Webhook HMAC Key",
    purpose: "PSP_WEBHOOK_HMAC",
    algorithm: "HMAC-SHA256",
    status: "ACTIVE",
    fingerprint: fingerprintFor("PSP_WEBHOOK_HMAC", "HMAC-SHA256", 3),
    createdAt: "2026-03-01T00:00:00.000Z",
    rotatedAt: "2026-06-01T00:00:00.000Z",
    rotationDueAt: new Date(Date.now() + DAYS(30)).toISOString(),
    usageCount: 3127,
    hsmSlot: 1,
    custodyQuorum: 2,
    lastAuditAt: new Date(Date.now() - DAYS(2)).toISOString(),
  },
  {
    keyId: "HSM-WASM_MODULE_SIGNING-001",
    label: "Constitutional WASM Module Signing Key",
    purpose: "WASM_MODULE_SIGNING",
    algorithm: "Ed25519",
    status: "ACTIVE",
    fingerprint: fingerprintFor("WASM_MODULE_SIGNING", "Ed25519", 1),
    createdAt: "2026-01-01T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() + DAYS(365)).toISOString(),
    usageCount: 7, // 7 modules, signed once each
    hsmSlot: 2,
    custodyQuorum: 4,
    lastAuditAt: new Date(Date.now() - DAYS(14)).toISOString(),
  },
  {
    keyId: "HSM-RESERVE_PROOF-001",
    label: "Reserve Proof Signing Key",
    purpose: "RESERVE_PROOF",
    algorithm: "Dilithium3",
    status: "ACTIVE",
    fingerprint: fingerprintFor("RESERVE_PROOF", "Dilithium3", 1),
    createdAt: "2026-01-15T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() + DAYS(90)).toISOString(),
    usageCount: 4, // quarterly attestations
    hsmSlot: 3,
    custodyQuorum: 4,
    lastAuditAt: new Date(Date.now() - DAYS(30)).toISOString(),
  },
  {
    keyId: "HSM-CONSTITUTIONAL_ANCHOR-001",
    label: "Constitutional Anchor Key (Post-Quantum)",
    purpose: "CONSTITUTIONAL_ANCHOR",
    algorithm: "Dilithium3",
    status: "ACTIVE",
    fingerprint: fingerprintFor("CONSTITUTIONAL_ANCHOR", "Dilithium3", 1),
    createdAt: "2026-01-01T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() + DAYS(730)).toISOString(),
    usageCount: 1,
    hsmSlot: 3,
    custodyQuorum: 5,
    lastAuditAt: new Date(Date.now() - DAYS(60)).toISOString(),
  },
  {
    keyId: "HSM-TOKEN_ISSUANCE-001",
    label: "Session JWT Signing Key",
    purpose: "TOKEN_ISSUANCE",
    algorithm: "Ed25519",
    status: "ACTIVE",
    fingerprint: fingerprintFor("TOKEN_ISSUANCE", "Ed25519", 1),
    createdAt: "2026-01-01T00:00:00.000Z",
    rotatedAt: "2026-04-01T00:00:00.000Z",
    rotationDueAt: new Date(Date.now() - DAYS(5)).toISOString(), // OVERDUE
    usageCount: 892341,
    hsmSlot: 4,
    custodyQuorum: 2,
    lastAuditAt: new Date(Date.now() - DAYS(1)).toISOString(),
  },
  {
    keyId: "HSM-GOV_ADAPTER_MTLS-ROOT-001",
    label: "Egypt Trust CA Root (Client mTLS)",
    purpose: "GOV_ADAPTER_MTLS",
    algorithm: "RSA-2048",
    status: "ROTATING",
    fingerprint: fingerprintFor("GOV_ADAPTER_MTLS", "RSA-2048", 1),
    createdAt: "2025-01-01T00:00:00.000Z",
    rotatedAt: null,
    rotationDueAt: new Date(Date.now() - DAYS(2)).toISOString(), // OVERDUE
    usageCount: 42391,
    hsmSlot: 5,
    custodyQuorum: 4,
    lastAuditAt: new Date(Date.now() - DAYS(1)).toISOString(),
  },
];

// ──────────────────────────────────────────────────────────────────────────
// Certificate inventory (Part 14.5) — aggregates across all services
// ──────────────────────────────────────────────────────────────────────────

function certFingerprint(service: string, serial: string): string {
  return "sha256:" + createHash("sha256").update(`sgtx-cert|${service}|${serial}`).digest("hex");
}

function daysUntil(iso: string): number {
  return Math.floor((new Date(iso).getTime() - Date.now()) / DAYS(1));
}

function randomHex(bytes: number): string {
  return randomBytes(bytes).toString("hex").toUpperCase();
}

function buildCertificateInventory(): Cert[] {
  const certs: Cert[] = [];

  // Government adapter mTLS certs (from adapter-auth.ts)
  const govAdapters = [
    { name: "Nafeza Adapter", subject: "CN=sgtx-platform.nafeza.gov.eg,O=SGTX Platform,L=Cairo,C=EG", valid: ["2026-01-01T00:00:00Z", "2027-12-31T23:59:59Z"], serial: "0A:1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9", algorithm: "RSA-2048" as const },
    { name: "CargoX Adapter", subject: "CN=sgtx-platform.cargox.com,O=SGTX Platform,L=Cairo,C=EG", valid: ["2026-02-15T00:00:00Z", "2028-02-14T23:59:59Z"], serial: "1B:2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A", algorithm: "ECDSA-P256" as const },
    { name: "ETA Adapter", subject: "CN=sgtx-platform.eta.gov.eg,O=SGTX Platform,L=Cairo,C=EG", valid: ["2026-03-01T00:00:00Z", "2027-08-31T23:59:59Z"], serial: "2C:3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B", algorithm: "RSA-2048" as const },
    { name: "CBE Adapter", subject: "CN=sgtx-platform.cbe.org.eg,O=SGTX Platform,L=Cairo,C=EG", valid: ["2026-04-10T00:00:00Z", "2027-04-10T23:59:59Z"], serial: "3D:4E:5F:60:71:82:93:A4:B5:C6:D7:E8:F9:0A:1B:2C", algorithm: "ECDSA-P256" as const },
  ];
  for (const a of govAdapters) {
    const d = daysUntil(a.valid[1]);
    certs.push({
      certId: `CERT-GOV-${a.name.split(" ")[0].toUpperCase()}`,
      subject: a.subject,
      issuer: "CN=Egypt Trust CA G2,O=Egypt Trust for Digital Security,C=EG",
      service: a.name,
      purpose: "mTLS (Government Adapter)",
      algorithm: a.algorithm,
      serialNumber: a.serial,
      fingerprint: certFingerprint(a.name, a.serial),
      validFrom: a.valid[0],
      validUntil: a.valid[1],
      daysUntilExpiry: d,
      status: d < 0 ? "EXPIRED" : d < 30 ? "ROTATING" : "ACTIVE",
      ca: "Egypt Trust CA G2",
      rotationRecommended: d < 60,
    });
  }

  // PSP mTLS / HMAC certs
  const psps = [
    { name: "FAWRY", valid: ["2026-01-15T00:00:00Z", "2026-12-15T23:59:59Z"], serial: "F1:AW:RY:00:01" },
    { name: "PAYMOB", valid: ["2026-02-20T00:00:00Z", "2027-02-19T23:59:59Z"], serial: "P1:AY:MO:B0:01" },
    { name: "STRIPE", valid: ["2026-03-01T00:00:00Z", "2027-02-28T23:59:59Z"], serial: "S1:TR:IP:E0:01" },
    { name: "CBE_IPN", valid: ["2026-04-01T00:00:00Z", "2026-10-01T23:59:59Z"], serial: "C1:BE:I0:PN:01" },
  ];
  for (const p of psps) {
    const d = daysUntil(p.valid[1]);
    certs.push({
      certId: `CERT-PSP-${p.name}`,
      subject: `CN=sgtx-platform.${p.name.toLowerCase()}.com,O=SGTX Platform,L=Cairo,C=EG`,
      issuer: "CN=SGTX Internal CA,O=SGTX Platform,C=EG",
      service: `${p.name} PSP Adapter`,
      purpose: "PSP API mTLS",
      algorithm: "ECDSA-P256",
      serialNumber: p.serial,
      fingerprint: certFingerprint(p.name, p.serial),
      validFrom: p.valid[0],
      validUntil: p.valid[1],
      daysUntilExpiry: d,
      status: d < 0 ? "EXPIRED" : d < 30 ? "ROTATING" : "ACTIVE",
      ca: "SGTX Internal CA",
      rotationRecommended: d < 60,
    });
  }

  // Internal service mesh mTLS (Cilium service mesh)
  const meshServices = [
    "Governor Service",
    "FeeLock KV",
    "Container Release API",
    "Trade Memory Service",
    "AI Orchestrator",
    "Smart Inbox Service",
    "PDPL Compliance Service",
    "Payment Orchestrator",
    "Dispute Resolution Service",
    "Identity Service",
  ];
  const meshValid = ["2026-05-01T00:00:00Z", "2026-11-01T23:59:59Z"];
  for (let i = 0; i < meshServices.length; i++) {
    const d = daysUntil(meshValid[1]);
    certs.push({
      certId: `CERT-MESH-${i.toString().padStart(3, "0")}`,
      subject: `CN=${meshServices[i].toLowerCase().replace(/ /g, ".")},O=SGTX Platform Mesh,C=EG`,
      issuer: "CN=SGTX Mesh CA,O=SGTX Platform,C=EG",
      service: meshServices[i],
      purpose: "mTLS Mesh (Cilium)",
      algorithm: "ECDSA-P256",
      serialNumber: `MESH-${i.toString().padStart(4, "0")}-${randomHex(8)}`,
      fingerprint: certFingerprint(meshServices[i], `mesh-${i}`),
      validFrom: meshValid[0],
      validUntil: meshValid[1],
      daysUntilExpiry: d,
      status: d < 0 ? "EXPIRED" : d < 30 ? "ROTATING" : "ACTIVE",
      ca: "SGTX Mesh CA",
      rotationRecommended: d < 60,
    });
  }

  // QES signing certs (Part 4.5)
  const qesValid = ["2026-01-10T00:00:00Z", "2028-01-09T23:59:59Z"];
  const d = daysUntil(qesValid[1]);
  certs.push({
    certId: "CERT-QES-001",
    subject: "CN=sgtx-qes.issuing.ca,O=SGTX Platform QES,C=EG",
    issuer: "CN=Egypt Trust CA G2 - QES,O=Egypt Trust for Digital Security,C=EG",
    service: "QES Issuing Service",
    purpose: "QES Signing (PAdES-LT)",
    algorithm: "RSA-2048",
    serialNumber: `QES-001-${randomHex(12)}`,
    fingerprint: certFingerprint("QES", "qes-001"),
    validFrom: qesValid[0],
    validUntil: qesValid[1],
    daysUntilExpiry: d,
    status: d < 0 ? "EXPIRED" : d < 30 ? "ROTATING" : "ACTIVE",
    ca: "Egypt Trust CA G2 - QES",
    rotationRecommended: d < 60,
  });

  return certs;
}

// ──────────────────────────────────────────────────────────────────────────
// In-process key registry (process-local, mirrors HSM slots)
// ──────────────────────────────────────────────────────────────────────────

const hsmKeyRegistry: Map<string, HSMKey> = new Map(
  INITIAL_HSM_KEYS.map((k) => [k.keyId, { ...k }]),
);

let lastThreatModelUpdate = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1h ago

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export function getThreatModel(): ThreatModel {
  const totalAssets = STRIDE_ASSETS.length;
  const allThreats = STRIDE_ASSETS.flatMap((a) => a.threats);
  const totalThreats = allThreats.length;
  const mitigatedThreats = allThreats.filter((t) => t.status === "MITIGATED").length;
  const openThreats = allThreats.filter((t) => t.status === "OPEN" || t.status === "PARTIAL").length;
  const criticalThreats = allThreats.filter(
    (t) => t.severity === "CRITICAL" && t.status !== "MITIGATED",
  ).length;
  const coverageScore = Math.round(
    STRIDE_ASSETS.reduce((s, a) => s + a.coverageScore, 0) / totalAssets,
  );

  return {
    strideAnalysis: STRIDE_ASSETS.map((a) => ({ ...a, threats: [...a.threats] })),
    mitreMappings: MITRE_MAPPINGS.map((m) => ({ ...m })),
    lastUpdated: lastThreatModelUpdate,
    totalAssets,
    totalThreats,
    mitigatedThreats,
    openThreats,
    criticalThreats,
    coverageScore,
  };
}

export function getHSMStatus(): HSMStatus {
  const keys = Array.from(hsmKeyRegistry.values()).map((k) => ({ ...k }));
  const active = keys.filter((k) => k.status === "ACTIVE").length;
  const rotating = keys.filter((k) => k.status === "ROTATING").length;
  const compromised = keys.filter((k) => k.status === "COMPROMISED").length;
  const pendingRotations = keys.filter(
    (k) => new Date(k.rotationDueAt).getTime() < Date.now(),
  ).length;
  const lastAuditAt = keys
    .map((k) => k.lastAuditAt)
    .sort()
    .reverse()[0];

  return {
    keys,
    hsmType: "SoftHSM",
    status: compromised > 0 ? "DEGRADED" : "OPERATIONAL",
    lastAuditAt,
    totalKeys: keys.length,
    activeKeys: active,
    rotatingKeys: rotating,
    compromisedKeys: compromised,
    pendingRotations,
  };
}

export async function rotateKey(
  keyId: string,
  opts?: { reason?: string; multisigApproved?: boolean; newAlgorithm?: HSMKeyType },
): Promise<KeyRotationResult> {
  const oldKey = hsmKeyRegistry.get(keyId);
  if (!oldKey) {
    throw new Error(`HSM key not found: ${keyId}`);
  }

  if (opts?.multisigApproved === false) {
    throw new Error("Multisig approval required to rotate an HSM key");
  }

  const now = new Date();
  const rotatedAt = now.toISOString();
  const algorithm = opts?.newAlgorithm ?? oldKey.algorithm;

  // Derive the new key ID by bumping the sequence suffix
  const m = keyId.match(/^(HSM-.+-\d+)$/);
  const baseKeyId = m ? m[1] : keyId;
  const seqMatch = baseKeyId.match(/-(\d+)$/);
  const newSeq = seqMatch ? Number(seqMatch[1]) + 1 : 1;
  const newKeyId = baseKeyId.replace(/-\d+$/, `-${String(newSeq).padStart(3, "0")}`);

  const newFingerprint =
    "sha256:" +
    createHash("sha256")
      .update(`sgtx-hsm|${oldKey.purpose}|${algorithm}|${newSeq}|${HSM_SALT}|rotated`)
      .digest("hex");

  const rotationDueAt = new Date(now.getTime() + rotationIntervalFor(oldKey.purpose)).toISOString();

  // Install new key as ACTIVE
  const newKey: HSMKey = {
    ...oldKey,
    keyId: newKeyId,
    algorithm,
    status: "ACTIVE",
    fingerprint: newFingerprint,
    createdAt: rotatedAt,
    rotatedAt,
    rotationDueAt,
    usageCount: 0,
    lastAuditAt: rotatedAt,
  };

  // Archive the old key
  const archivedOld: HSMKey = {
    ...oldKey,
    status: "ARCHIVED",
    rotatedAt,
  };
  hsmKeyRegistry.set(oldKey.keyId, archivedOld);
  hsmKeyRegistry.set(newKeyId, newKey);

  // Persist the rotation to ConfigurationHistory (Loom-anchored audit trail)
  const loomAnchor =
    "sha256:" +
    createHash("sha256")
      .update(`hsm-rotate|${oldKey.keyId}|${newKeyId}|${rotatedAt}|${newFingerprint}`)
      .digest("hex");

  let auditTrailId = "";
  try {
    const configKey = `hsm_key.${oldKey.purpose}`;
    const last = await freshDb.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;
    const row = await freshDb.configurationHistory.create({
      data: {
        configKey,
        oldValue: JSON.stringify({
          keyId: oldKey.keyId,
          fingerprint: oldKey.fingerprint,
          algorithm: oldKey.algorithm,
          status: oldKey.status,
        }),
        newValue: JSON.stringify({
          keyId: newKeyId,
          fingerprint: newFingerprint,
          algorithm,
          status: "ACTIVE",
          rotatedAt,
          loomAnchor,
          reason: opts?.reason ?? "scheduled_rotation",
        }),
        changedByGtid: "SGTX-EG-GOV-000001-9A0B",
        changeReason: opts?.reason ?? "scheduled_rotation",
        version: nextVersion,
      },
    });
    auditTrailId = row.id;
  } catch (e) {
    logger.error("[security/rotateKey] audit trail persist failed:", e);
  }

  return {
    ok: true,
    keyId: newKeyId,
    oldKeyId: oldKey.keyId,
    newKeyId,
    algorithm,
    purpose: oldKey.purpose,
    oldFingerprint: oldKey.fingerprint,
    newFingerprint,
    rotatedAt,
    rotationDueAt,
    loomAnchor,
    auditTrailId,
    reason: opts?.reason ?? "scheduled_rotation",
  };
}

export async function getSecurityIncidents(filter?: {
  severity?: string;
  status?: string;
  limit?: number;
}): Promise<SecurityIncidentsResult> {
  const where: any = {};
  if (filter?.severity) where.severity = filter.severity;
  if (filter?.status) where.status = filter.status;

  const rows = await freshDb.incident.findMany({
    where,
    orderBy: { openedAt: "desc" },
    take: filter?.limit ?? 50,
  });

  const incidents: SecurityIncident[] = rows.map((r: any) => {
    let affectedSystems: string[] = [];
    try {
      affectedSystems = r.affectedSystems ? JSON.parse(r.affectedSystems) : [];
    } catch {
      affectedSystems = [];
    }
    return {
      id: r.id,
      severity: r.severity,
      status: r.status,
      title: r.title,
      description: r.description,
      affectedSystems,
      rootCause: r.rootCause,
      resolution: r.resolution,
      openedAt: r.openedAt.toISOString(),
      resolvedAt: r.resolvedAt ? r.resolvedAt.toISOString() : null,
    };
  });

  const openCount = incidents.filter(
    (i) => i.status === "OPEN" || i.status === "INVESTIGATING",
  ).length;
  const criticalCount = incidents.filter((i) => i.severity === "P0").length;

  return {
    incidents,
    openCount,
    criticalCount,
    total: incidents.length,
  };
}

export function runStrideScan(): StrideScanResult {
  const startedAt = new Date();
  const startMs = startedAt.getTime();

  // Simulate the scan — re-walk assets, count threats, count mitigations
  const assetsScanned = STRIDE_ASSETS.length;
  const allThreats = STRIDE_ASSETS.flatMap((a) => a.threats);
  const threatsIdentified = allThreats.length;
  const mitigationsApplied = allThreats.filter(
    (t) => t.status === "MITIGATED" || t.status === "PARTIAL",
  ).length;
  const newThreats = 0; // baseline scan — no new threats since last scan
  const resolvedThreats = 0;
  const coverageScore = Math.round(
    STRIDE_ASSETS.reduce((s, a) => s + a.coverageScore, 0) / assetsScanned,
  );

  // Simulate scan duration: ~125ms per asset
  const scanDurationMs = 50 + assetsScanned * 125;
  const finishedAt = new Date(startMs + scanDurationMs);

  lastThreatModelUpdate = finishedAt.toISOString();

  return {
    ok: true,
    assetsScanned,
    threatsIdentified,
    mitigationsApplied,
    newThreats,
    resolvedThreats,
    scanDurationMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    scannedBy: "stride-scanner-v2",
    coverageScore,
  };
}

export function getCertificateInventory(): CertificateInventory {
  const certificates = buildCertificateInventory();
  const expiringIn30Days = certificates.filter(
    (c) => c.daysUntilExpiry >= 0 && c.daysUntilExpiry < 30,
  );
  const expired = certificates.filter((c) => c.daysUntilExpiry < 0);
  const activeCount = certificates.filter((c) => c.status === "ACTIVE").length;
  const rotatingCount = certificates.filter((c) => c.status === "ROTATING").length;

  const byService: Record<string, number> = {};
  for (const c of certificates) {
    byService[c.service] = (byService[c.service] ?? 0) + 1;
  }

  return {
    certificates,
    expiringIn30Days,
    expired,
    total: certificates.length,
    activeCount,
    rotatingCount,
    byService,
    checkedAt: NOW_ISO(),
  };
}

export function getKeyRotationPolicy(): KeyRotationPolicy {
  const keys = Array.from(hsmKeyRegistry.values());
  const algorithms = Array.from(new Set(keys.map((k) => k.algorithm)));
  const lastRotation = keys
    .map((k) => k.rotatedAt ?? k.createdAt)
    .sort()
    .reverse()[0];

  const byAlgorithm: Record<string, any> = {};
  for (const alg of algorithms) {
    const algKeys = keys.filter((k) => k.algorithm === alg);
    const intervalDays = rotationIntervalDaysFor(alg);
    const lastAlgRotation = algKeys
      .map((k) => k.rotatedAt ?? k.createdAt)
      .sort()
      .reverse()[0];
    byAlgorithm[alg] = {
      intervalDays,
      lastRotation: lastAlgRotation,
      nextRotation: new Date(
        new Date(lastAlgRotation).getTime() + DAYS(intervalDays),
      ).toISOString(),
      count: algKeys.length,
    };
  }

  const overallInterval = 90; // default quarterly
  const nextRotation = new Date(
    new Date(lastRotation).getTime() + DAYS(overallInterval),
  ).toISOString();

  return {
    rotationIntervalDays: overallInterval,
    lastRotation,
    nextRotation,
    algorithms,
    byAlgorithm,
    policy:
      "HSM keys rotated on a per-algorithm cadence (Ed25519=180d, HMAC=90d, Dilithium3=365d, RSA-2048=180d). " +
      "Rotations require 3-of-5 Platform Governance Authority multisig. All rotations Loom-anchored via ConfigurationHistory.",
  };
}

export async function triggerKeyRotation(opts?: {
  keyId?: string;
  reason?: string;
  multisigApproved?: boolean;
}): Promise<{
  ok: boolean;
  rotations: KeyRotationResult[];
  policy: KeyRotationPolicy;
}> {
  // If a specific keyId is provided, rotate only that one.
  // Otherwise, rotate all keys whose rotationDueAt has passed.
  const keys = Array.from(hsmKeyRegistry.values());
  const overdue = opts?.keyId
    ? keys.filter((k) => k.keyId === opts.keyId)
    : keys.filter((k) => new Date(k.rotationDueAt).getTime() < Date.now());

  if (overdue.length === 0) {
    return {
      ok: true,
      rotations: [],
      policy: getKeyRotationPolicy(),
    };
  }

  const rotations: KeyRotationResult[] = [];
  for (const k of overdue) {
    try {
      const r = await rotateKey(k.keyId, {
        reason: opts?.reason ?? "policy_rotation",
        multisigApproved: opts?.multisigApproved ?? true,
      });
      rotations.push(r);
    } catch (e) {
      logger.error(`[security] failed to rotate key ${k.keyId}:`, e);
    }
  }

  return {
    ok: rotations.length === overdue.length,
    rotations,
    policy: getKeyRotationPolicy(),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

function rotationIntervalFor(purpose: HSMKeyPurpose): number {
  switch (purpose) {
    case "GOVERNOR_SIGNING":
    case "GOVERNOR_LOOM_ANCHOR":
      return DAYS(180);
    case "PSP_WEBHOOK_HMAC":
      return DAYS(90);
    case "WASM_MODULE_SIGNING":
      return DAYS(365);
    case "RESERVE_PROOF":
      return DAYS(90);
    case "CONSTITUTIONAL_ANCHOR":
      return DAYS(730);
    case "TOKEN_ISSUANCE":
      return DAYS(90);
    case "GOV_ADAPTER_MTLS":
      return DAYS(180);
    default:
      return DAYS(90);
  }
}

function rotationIntervalDaysFor(algorithm: HSMKeyType): number {
  switch (algorithm) {
    case "Ed25519":
      return 180;
    case "Dilithium3":
      return 365;
    case "RSA-2048":
      return 180;
    case "ECDSA-P256":
      return 180;
    case "HMAC-SHA256":
      return 90;
    case "Kyber768":
      return 365;
    default:
      return 90;
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Add-On 17 — Piracy & Maritime Security Risk Engine
//
// Maritime-domain security risk scoring for shipping corridors. This is a
// SEPARATE concern from the cybersecurity STRIDE/HSM module above: this
// section tracks real-world piracy, armed-robbery, conflict-zone, and
// weather-related maritime incidents and derives a corridor security score
// + insurance premium impact + recommended security measures.
//
// Models (already in schema.prisma — Add-On 17):
//   MaritimeSecurityIncident — piracy / armed robbery / conflict / weather
//                              incidents with lat/lng + severity
//   CorridorSecurityScore    — per-corridor security score + risk level +
//                              recommended measures + insurance premium impact
//
// All DB calls are wrapped in try/catch (defensive). The library never throws
// — it returns null / empty arrays on failure and logs a warning.
// ──────────────────────────────────────────────────────────────────────────

export interface MaritimeSecurityIncidentInput {
  incidentType: string;       // PIRACY | ARMED_ROBBERY | CONFLICT | WEATHER | STOWAWAY | CYBER | OTHER
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  severity: string;           // LOW | MEDIUM | HIGH | CRITICAL
  occurredAt?: Date | string | null;
  source?: string | null;     // IMB | MDAT-GoG | ReCAAP | local authority | tenant report
}

export interface CorridorSecurityScoreResult {
  corridorCode: string;
  securityScore: number;            // 0..100 (100 = safest)
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  lastIncidentAt: Date | null;
  recentIncidentCount: number;       // incidents in last 90 days
  recommendedSecurityMeasures: string[];
  insurancePremiumImpact: number;   // percentage points added to baseline premium
  validUntil: Date;
  explanation: string;
  cachedScoreId: string | null;     // persisted row id, if any
}

// Severity weighting — used to aggregate corridor risk from incident history.
const SEVERITY_WEIGHTS: Record<string, number> = {
  CRITICAL: 25,
  HIGH: 12,
  MEDIUM: 5,
  LOW: 1,
};

const INCIDENT_LOOKBACK_DAYS = 90;

// Recommended measures per risk level — drawn from BMP5 (Best Management
// Practices for Protection against Somalia-based Piracy) and ReCAAP guidance
// for Southeast Asia.
const RECOMMENDED_MEASURES: Record<string, string[]> = {
  LOW: [
    "Maintain standard AIS transmission",
    "Conduct routine bridge watches per STCW",
  ],
  MEDIUM: [
    "Increase bridge watch rotation to 2-officer standard",
    "Activate enhanced lighting at night",
    "Brief crew on piracy reporting procedures (IMB PRC)",
    "Consider fire hoses ready on main deck",
  ],
  HIGH: [
    "Embark Private Maritime Security Contractors (PMSC)",
    "Follow BMP5 routing recommendations for the corridor",
    "Reduce speed only in established escort zones",
    "Conduct daily crew drills for piracy response",
    "Register voyage with MDAT-GoG (Gulf of Guinea) or MSCHOA (Indian Ocean)",
  ],
  CRITICAL: [
    "Avoid corridor until further notice — reroute via Cape or alternate lane",
    "Mandatory PMSC embarkation with 4+ armed guards",
    "Implement full citadel readiness + drills",
    "Coordinate with naval escort forces (CTF-151 / EUNAVFOR)",
    "Notify hull & machinery underwriter before transit",
  ],
};

// Insurance premium impact (percentage points added to baseline H&M premium).
const PREMIUM_IMPACT_PCT: Record<string, number> = {
  LOW: 0,
  MEDIUM: 0.5,
  HIGH: 2.0,
  CRITICAL: 7.5,
};

function deriveRiskLevelFromScore(score: number): "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" {
  if (score >= 85) return "LOW";
  if (score >= 60) return "MEDIUM";
  if (score >= 35) return "HIGH";
  return "CRITICAL";
}

/**
 * Fetch recent maritime security incidents within the corridor's incident
 * lookback window (default 90 days). Defensive — returns [] on failure.
 *
 * The corridorCode is matched against the `source` field on the incident
 * (we store the corridor as the incident source to avoid a separate
 * corridorCode column on MaritimeSecurityIncident). Incidents with no
 * corridor attribution are also returned when the caller passes "*".
 */
export async function getMaritimeSecurityIncidents(input: {
  corridorCode?: string;
  severity?: string;        // optional severity filter
  take?: number;
}): Promise<any[]> {
  try {
    const where: any = {};
    if (input.severity) where.severity = input.severity.toUpperCase();
    if (input.corridorCode && input.corridorCode !== "*") {
      where.source = { contains: input.corridorCode.toUpperCase() };
    }
    return await (_maritimeDb as any).maritimeSecurityIncident.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: Math.min(500, input.take ?? 100),
    });
  } catch (e: any) {
    _maritimeLogger.warn("[security/maritime] getMaritimeSecurityIncidents failed", {
      error: e?.message || String(e),
    });
    return [];
  }
}

/**
 * Report a new maritime security incident. Defensive — returns null on failure.
 */
export async function reportMaritimeSecurityIncident(
  input: MaritimeSecurityIncidentInput,
): Promise<{ id: string } | null> {
  try {
    const row = await (_maritimeDb as any).maritimeSecurityIncident.create({
      data: {
        incidentType: input.incidentType.toUpperCase(),
        latitude: input.latitude ?? null,
        longitude: input.longitude ?? null,
        description: input.description ?? null,
        severity: input.severity.toUpperCase(),
        occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
        source: input.source ?? null,
      },
    });
    return { id: row.id };
  } catch (e: any) {
    _maritimeLogger.error("[security/maritime] reportMaritimeSecurityIncident failed", {
      error: e?.message || String(e),
    });
    return null;
  }
}

/**
 * Assess the security risk for a shipping corridor.
 *
 * Algorithm:
 *   1. Load the most recent CorridorSecurityScore row (cached). If fresh
 *      (< 24h old) and not forced, return it.
 *   2. Otherwise: load maritime incidents attributed to this corridor in the
 *      last 90 days, compute a weighted severity score, derive the risk
 *      level, and persist a new CorridorSecurityScore row.
 *
 * The score starts at 100 (perfectly safe) and is decremented by the sum of
 * (severityWeight × recencyFactor) for each incident in the lookback window.
 * Recency factor decays linearly: 1.0 today → 0.0 at 90 days ago.
 *
 * Pure-ish: 1–2 DB reads + 1 write. Defensive — returns a synthesized result
 * on any DB failure.
 */
export async function assessCorridorRisk(
  corridorCode: string,
  opts?: { forceRefresh?: boolean },
): Promise<CorridorSecurityScoreResult> {
  const corridor = corridorCode.toUpperCase();
  const now = new Date();
  const validUntil = new Date(now.getTime() + 24 * 3_600_000); // 24h validity

  // 1) Check for a fresh cached score (< 24h).
  if (!opts?.forceRefresh) {
    try {
      const cached = await (_maritimeDb as any).corridorSecurityScore.findFirst({
        where: { corridorCode: corridor },
        orderBy: { createdAt: "desc" },
      });
      if (cached && cached.createdAt) {
        const ageMs = now.getTime() - new Date(cached.createdAt).getTime();
        if (ageMs < 24 * 3_600_000) {
          const measures = safeParseJsonArray(cached.recommendedSecurityMeasures);
          return {
            corridorCode: corridor,
            securityScore: cached.securityScore,
            riskLevel: cached.riskLevel,
            lastIncidentAt: cached.lastIncidentAt ? new Date(cached.lastIncidentAt) : null,
            recentIncidentCount: 0,
            recommendedSecurityMeasures: measures,
            insurancePremiumImpact: cached.insurancePremiumImpact ?? 0,
            validUntil: cached.validUntil ? new Date(cached.validUntil) : validUntil,
            explanation: `Cached corridor score (age ${(ageMs / 3_600_000).toFixed(1)}h).`,
            cachedScoreId: cached.id,
          };
        }
      }
    } catch (e: any) {
      _maritimeLogger.warn("[security/maritime] cached score lookup failed", {
        corridorCode: corridor,
        error: e?.message || String(e),
      });
    }
  }

  // 2) Load recent incidents for this corridor (lookback window).
  const lookbackStart = new Date(now.getTime() - INCIDENT_LOOKBACK_DAYS * 86_400_000);
  let incidents: any[] = [];
  try {
    incidents = await (_maritimeDb as any).maritimeSecurityIncident.findMany({
      where: {
        source: { contains: corridor },
        occurredAt: { gte: lookbackStart },
      },
      orderBy: { occurredAt: "desc" },
      take: 200,
    });
  } catch (e: any) {
    _maritimeLogger.warn("[security/maritime] incident lookup failed", {
      corridorCode: corridor,
      error: e?.message || String(e),
    });
  }

  // 3) Compute weighted score (100 - sum of severity × recency).
  let scoreDecrement = 0;
  let lastIncidentAt: Date | null = null;
  for (const inc of incidents) {
    const weight = SEVERITY_WEIGHTS[String(inc.severity || "").toUpperCase()] ?? 1;
    const occurredAt = inc.occurredAt ? new Date(inc.occurredAt) : now;
    const ageDays = Math.max(0, (now.getTime() - occurredAt.getTime()) / 86_400_000);
    const recencyFactor = Math.max(0, 1 - ageDays / INCIDENT_LOOKBACK_DAYS);
    scoreDecrement += weight * recencyFactor;
    if (!lastIncidentAt || occurredAt > lastIncidentAt) lastIncidentAt = occurredAt;
  }
  const securityScore = Math.max(0, Math.min(100, Math.round(100 - scoreDecrement)));
  const riskLevel = deriveRiskLevelFromScore(securityScore);
  const recommendedSecurityMeasures = RECOMMENDED_MEASURES[riskLevel] ?? RECOMMENDED_MEASURES.LOW;
  const insurancePremiumImpact = PREMIUM_IMPACT_PCT[riskLevel] ?? 0;

  // 4) Persist a new CorridorSecurityScore row (defensive).
  let cachedScoreId: string | null = null;
  try {
    const row = await (_maritimeDb as any).corridorSecurityScore.create({
      data: {
        corridorCode: corridor,
        securityScore,
        riskLevel,
        lastIncidentAt,
        recommendedSecurityMeasures: JSON.stringify(recommendedSecurityMeasures),
        insurancePremiumImpact,
        validUntil,
      },
    });
    cachedScoreId = row.id;
  } catch (e: any) {
    _maritimeLogger.error("[security/maritime] persist corridor score failed", {
      corridorCode: corridor,
      error: e?.message || String(e),
    });
  }

  const explanation =
    incidents.length === 0
      ? `No maritime security incidents reported for ${corridor} in the last ${INCIDENT_LOOKBACK_DAYS} days — corridor assessed as ${riskLevel}.`
      : `${incidents.length} maritime incident${incidents.length === 1 ? "" : "s"} in the last ${INCIDENT_LOOKBACK_DAYS} days → score ${securityScore}/100 (${riskLevel}). Insurance premium impact: +${insurancePremiumImpact.toFixed(2)} pts.`;

  return {
    corridorCode: corridor,
    securityScore,
    riskLevel,
    lastIncidentAt,
    recentIncidentCount: incidents.length,
    recommendedSecurityMeasures,
    insurancePremiumImpact,
    validUntil,
    explanation,
    cachedScoreId,
  };
}

function safeParseJsonArray(s: string | null): string[] {
  if (!s) return [];
  try {
    const parsed = JSON.parse(s);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

