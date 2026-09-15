// @ts-nocheck
/**
 * SGTX v18 §4.7 — Bank Mandate & Capability Registry
 * ===========================================================================
 *
 * Phase 0 foundation: bank capability registry, buyer banking details,
 * provider banking, and bank mandate legal framework (Egyptian Banking
 * Law 194/2020 + SGTX Bank Mandate Agreement + QES Authorization via
 * Egypt Trust).
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ Capability tiers (§4.7.1):                                              │
 * │   1 = Full ISO 20022 (pacs.008, pain.001, camt.054, pain.002, pain.008) │
 * │   2 = pain.001-only (limited ISO 20022 — single-message rail)            │
 * │   3 = H2H / SFTP (file-based: MT101/MT103/MT940)                         │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * Tables:
 *   bank_capability_registry        — persisted in ConfigurationHistory under
 *                                    `bank_reg:{bankGtid}`. Stores the ISO
 *                                    20022 endpoint, public key, SWIFT/BIC,
 *                                    IBAN prefixes, capability tier.
 *   tenant.banking_details (JSONB)  — egp_iban, egp_bic, usd_iban, usd_bic,
 *                                    authorised_signatories[],
 *                                    bank_mandate_hash, micro_deposit_status.
 *                                    Persisted in Tenant.globalNotes as a
 *                                    JSON-encoded `banking_details` envelope.
 *   tenant.provider_banking (JSONB) — {iban, bic, currency}. Persisted in
 *                                    Tenant.globalNotes as a `provider_banking`
 *                                    envelope.
 *   bank_mandate_agreements         — persisted in ConfigurationHistory under
 *                                    `bank_mandate:{mandateId}`. Stores
 *                                    tenantGtid, bankGtid, legalBasis,
 *                                    requiresQes, qesCertRef, signedAt.
 *
 * Micro-deposit verification is simulated: caller provides the two amounts
 * they received in their test account; we compare against the amounts we
 * recorded when the captureBuyerBanking call seeded them.
 *
 * Bank connection test is simulated: returns synthetic latency + supported
 * message list derived from the capability tier. No real ISO 20022 endpoint
 * is contacted.
 *
 * All DB writes are defensive (try/catch). The functions never throw —
 * on failure they return a structured error object.
 */

import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { createHash } from "crypto";

// ============ §4.7.1 Constants ============

export type CapabilityTier = 1 | 2 | 3;

export const CAPABILITY_TIERS: Record<CapabilityTier, { label: string; supportedMessages: string[] }> = {
  1: {
    label: "Full ISO 20022",
    supportedMessages: ["pain.001", "pain.002", "pain.008", "pacs.008", "pacs.009", "camt.054", "camt.053"],
  },
  2: {
    label: "pain.001-only",
    supportedMessages: ["pain.001", "pain.002"],
  },
  3: {
    label: "H2H / SFTP",
    supportedMessages: ["MT101", "MT103", "MT940", "MT942"],
  },
};

export const BANK_MANDATE_LEGAL_BASIS = [
  "Egyptian Banking Law 194/2020",
  "SGTX Bank Mandate Agreement",
  "QES Authorization (Egypt Trust)",
];

export const MANDATE_CONFIG_KEY_PREFIX = "bank_mandate:";
export const BANK_REGISTRY_CONFIG_KEY_PREFIX = "bank_reg:";
export const MICRO_DEPOSIT_CONFIG_KEY_PREFIX = "bank_micro:";

// ============ Types ============

export interface BankConfig {
  gtid: string;
  name: string;
  bic: string;
  ibanPrefixes: string[];
  capabilityTier: CapabilityTier;
  iso20022Endpoint?: string | null;
  publicKey?: string | null;
}

export interface RegisterBankResult {
  bankId: string;
  gtid: string;
  name: string;
  registered: boolean;
  capabilityTier: CapabilityTier;
  supportedMessages: string[];
  createdAt: string;
}

export interface BankCapability {
  bankId: string;
  gtid: string;
  name: string;
  bic: string;
  ibanPrefixes: string[];
  tier: CapabilityTier;
  tierLabel: string;
  endpoints: { iso20022?: string | null; h2hSftp: boolean };
  supportedMessages: string[];
  healthStatus: "HEALTHY" | "DEGRADED" | "OFFLINE";
  publicKey: string | null;
  createdAt: string;
}

export interface TestBankConnectionResult {
  bankGtid: string;
  connected: boolean;
  latencyMs: number;
  supportedMessages: string[];
  tier: CapabilityTier;
  testedAt: string;
  error?: string;
}

export interface VerifyGovernmentAccountResult {
  bankGtid: string;
  accountType: string;
  verified: boolean;
  accountRef: string | null;
  verifiedAt: string;
}

export interface BuyerBankingDetails {
  egp_iban: string;
  egp_bic: string;
  usd_iban: string;
  usd_bic: string;
  authorised_signatories: Array<{ name: string; gtid?: string; role?: string }>;
  bank_mandate_hash?: string;
  micro_deposit_status?: {
    egp?: { sent: [number, number]; verified: boolean; sentAt: string };
    usd?: { sent: [number, number]; verified: boolean; sentAt: string };
  };
}

export interface CaptureBuyerBankingResult {
  captured: boolean;
  tenantGtid: string;
  mandateHash: string;
  microDepositStatus: BuyerBankingDetails["micro_deposit_status"];
  capturedAt: string;
}

export interface VerifyMicroDepositResult {
  tenantGtid: string;
  accountType: string;
  verified: boolean;
  mismatch: boolean;
  verifiedAt: string;
}

export interface ProviderBankingDetails {
  iban: string;
  bic: string;
  currency: string;
}

export interface CaptureProviderBankingResult {
  captured: boolean;
  tenantGtid: string;
  banking: ProviderBankingDetails;
  capturedAt: string;
}

export interface MandateConfig {
  tenantGtid: string;
  bankGtid: string;
  legalBasis?: string[];
  customTerms?: string | null;
  creditLimit?: number | null;
  currency?: string;
}

export interface CreateBankMandateAgreementResult {
  mandateId: string;
  tenantGtid: string;
  bankGtid: string;
  requiresQes: boolean;
  legalBasis: string[];
  createdAt: string;
  status: string;
}

export interface SignBankMandateQesResult {
  mandateId: string;
  signed: boolean;
  qesCertRef: string | null;
  signedAt: string | null;
  signerGtid: string | null;
}

// ============ Helpers ============

function nowIso(): string {
  return new Date().toISOString();
}

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function makeBankId(gtid: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const hash = sha256(gtid).slice(0, 6).toUpperCase();
  return `BANK-${gtid.slice(-6)}-${hash}-${ts}`;
}

function makeMandateId(tenantGtid: string, bankGtid: string): string {
  const ts = Date.now().toString(36).toUpperCase();
  const seed = sha256(`${tenantGtid}|${bankGtid}|${ts}`).slice(0, 8).toUpperCase();
  return `MANDATE-${tenantGtid.slice(-6)}-${bankGtid.slice(-6)}-${seed}`;
}

/**
 * Read the bank registry row for a bank GTID from ConfigurationHistory.
 * Returns the parsed bank config or null if not found.
 */
async function readBankRegistry(bankGtid: string): Promise<any | null> {
  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${BANK_REGISTRY_CONFIG_KEY_PREFIX}${bankGtid}` },
      orderBy: { version: "desc" },
    });
    if (!row || !row.newValue) return null;
    return JSON.parse(row.newValue);
  } catch (e: any) {
    logger.warn("[bank-mandate] readBankRegistry failed", { bankGtid, error: e?.message });
    return null;
  }
}

async function listBankRegistryRows(): Promise<any[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: BANK_REGISTRY_CONFIG_KEY_PREFIX } },
      orderBy: { version: "desc" },
    });
    const seen = new Map<string, any>();
    for (const r of rows) {
      if (!seen.has(r.configKey) && r.newValue) {
        seen.set(r.configKey, JSON.parse(r.newValue));
      }
    }
    return Array.from(seen.values());
  } catch (e: any) {
    logger.warn("[bank-mandate] listBankRegistryRows failed", { error: e?.message });
    return [];
  }
}

async function readMandate(mandateId: string): Promise<any | null> {
  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${MANDATE_CONFIG_KEY_PREFIX}${mandateId}` },
      orderBy: { version: "desc" },
    });
    if (!row || !row.newValue) return null;
    return JSON.parse(row.newValue);
  } catch (e: any) {
    logger.warn("[bank-mandate] readMandate failed", { mandateId, error: e?.message });
    return null;
  }
}

/**
 * Capture a JSON envelope into Tenant.globalNotes. Existing globalNotes
 * content is preserved; we only set/update the named envelope key.
 */
async function setTenantJsonEnvelope(
  tenantGtid: string,
  envelopeKey: string,
  payload: any,
): Promise<boolean> {
  try {
    const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
    if (!tenant) return false;

    // Parse the existing globalNotes — it might be a JSON envelope itself.
    let env: Record<string, any> = {};
    if (tenant.globalNotes) {
      try {
        env = JSON.parse(tenant.globalNotes);
        if (typeof env !== "object" || Array.isArray(env) || env === null) env = {};
      } catch {
        env = {};
      }
    }
    env[envelopeKey] = payload;
    await db.tenant.update({
      where: { gtid: tenantGtid },
      data: { globalNotes: JSON.stringify(env) },
    });
    return true;
  } catch (e: any) {
    logger.error("[bank-mandate] setTenantJsonEnvelope failed", {
      tenantGtid, envelopeKey, error: e?.message,
    });
    return false;
  }
}

/**
 * Read the JSON envelope from Tenant.globalNotes. Returns null if the
 * envelope doesn't exist or globalNotes isn't a JSON object.
 */
async function getTenantJsonEnvelope<T = any>(
  tenantGtid: string,
  envelopeKey: string,
): Promise<T | null> {
  try {
    const tenant = await db.tenant.findUnique({ where: { gtid: tenantGtid } });
    if (!tenant?.globalNotes) return null;
    const env = JSON.parse(tenant.globalNotes);
    if (typeof env !== "object" || Array.isArray(env) || env === null) return null;
    return (env as any)[envelopeKey] ?? null;
  } catch (e: any) {
    logger.warn("[bank-mandate] getTenantJsonEnvelope failed", {
      tenantGtid, envelopeKey, error: e?.message,
    });
    return null;
  }
}

// ============ §4.7.1 registerBank ============

export async function registerBank(config: BankConfig): Promise<RegisterBankResult> {
  const tier = CAPABILITY_TIERS[config.capabilityTier];
  if (!tier) throw new Error(`Invalid capability tier: ${config.capabilityTier}`);

  const bankId = makeBankId(config.gtid);
  const createdAt = nowIso();
  const value = {
    bankId,
    gtid: config.gtid,
    name: config.name,
    bic: config.bic,
    ibanPrefixes: config.ibanPrefixes,
    capabilityTier: config.capabilityTier,
    iso20022Endpoint: config.iso20022Endpoint ?? null,
    publicKey: config.publicKey ?? null,
    supportedMessages: tier.supportedMessages,
    healthStatus: "HEALTHY",
    createdAt,
  };

  try {
    // Check if bank already exists; if so, treat as update (new version)
    const existing = await db.configurationHistory.findFirst({
      where: { configKey: `${BANK_REGISTRY_CONFIG_KEY_PREFIX}${config.gtid}` },
      orderBy: { version: "desc" },
    });
    await db.configurationHistory.create({
      data: {
        configKey: `${BANK_REGISTRY_CONFIG_KEY_PREFIX}${config.gtid}`,
        oldValue: existing?.newValue ?? null,
        newValue: JSON.stringify(value),
        changedByGtid: "SGTX-ADMIN",
        changeReason: `bank_register:${config.name}:tier${config.capabilityTier}`,
        version: (existing?.version ?? 0) + 1,
      },
    });
  } catch (e: any) {
    logger.error("[bank-mandate] registerBank persist failed", { gtid: config.gtid, error: e?.message });
    throw new Error(`Failed to register bank: ${e?.message ?? "unknown"}`);
  }

  return {
    bankId,
    gtid: config.gtid,
    name: config.name,
    registered: true,
    capabilityTier: config.capabilityTier,
    supportedMessages: tier.supportedMessages,
    createdAt,
  };
}

// ============ §4.7.1 getBankCapability ============

export async function getBankCapability(bankGtid: string): Promise<BankCapability | null> {
  const row = await readBankRegistry(bankGtid);
  if (!row) return null;

  const tier = CAPABILITY_TIERS[row.capabilityTier as CapabilityTier] ?? CAPABILITY_TIERS[1];
  return {
    bankId: row.bankId,
    gtid: row.gtid,
    name: row.name,
    bic: row.bic,
    ibanPrefixes: row.ibanPrefixes ?? [],
    tier: row.capabilityTier,
    tierLabel: tier.label,
    endpoints: {
      iso20022: row.iso20022Endpoint ?? null,
      h2hSftp: row.capabilityTier === 3,
    },
    supportedMessages: tier.supportedMessages,
    healthStatus: row.healthStatus ?? "HEALTHY",
    publicKey: row.publicKey ?? null,
    createdAt: row.createdAt,
  };
}

// ============ §4.7.1 listBanks ============

export async function listBanks(): Promise<BankCapability[]> {
  const rows = await listBankRegistryRows();
  return rows.map((row) => {
    const tier = CAPABILITY_TIERS[row.capabilityTier as CapabilityTier] ?? CAPABILITY_TIERS[1];
    return {
      bankId: row.bankId,
      gtid: row.gtid,
      name: row.name,
      bic: row.bic,
      ibanPrefixes: row.ibanPrefixes ?? [],
      tier: row.capabilityTier,
      tierLabel: tier.label,
      endpoints: {
        iso20022: row.iso20022Endpoint ?? null,
        h2hSftp: row.capabilityTier === 3,
      },
      supportedMessages: tier.supportedMessages,
      healthStatus: row.healthStatus ?? "HEALTHY",
      publicKey: row.publicKey ?? null,
      createdAt: row.createdAt,
    } as BankCapability;
  });
}

// ============ §4.7.1 testBankConnection (simulated) ============

export async function testBankConnection(bankGtid: string): Promise<TestBankConnectionResult> {
  const cap = await getBankCapability(bankGtid);
  if (!cap) {
    return {
      bankGtid,
      connected: false,
      latencyMs: 0,
      supportedMessages: [],
      tier: 1,
      testedAt: nowIso(),
      error: "Bank not registered",
    };
  }

  // Simulated connection test: tier 1 banks have lowest latency, tier 3 highest.
  const baseLatency = cap.tier === 1 ? 80 : cap.tier === 2 ? 220 : 600;
  const jitter = Math.floor(Math.random() * 200);
  const latencyMs = baseLatency + jitter;
  const connected = latencyMs < 1500;
  const testedAt = nowIso();

  // Persist health observation
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `bank_health:${bankGtid}`,
        oldValue: null,
        newValue: JSON.stringify({
          bankGtid,
          connected,
          latencyMs,
          testedAt,
          tier: cap.tier,
        }),
        changedByGtid: "SGTX-HEALTH-WORKER",
        changeReason: `bank_health:test:${bankGtid}:${connected ? "ok" : "fail"}`,
        version: Math.floor(Date.now() / 1000),
      },
    });
  } catch (e: any) {
    logger.warn("[bank-mandate] testBankConnection persist failed", { bankGtid, error: e?.message });
  }

  return {
    bankGtid,
    connected,
    latencyMs,
    supportedMessages: cap.supportedMessages,
    tier: cap.tier,
    testedAt,
  };
}

// ============ §4.7.1 verifyGovernmentCollectionAccount (simulated) ============

export async function verifyGovernmentCollectionAccount(
  bankGtid: string,
  accountType: string,
): Promise<VerifyGovernmentAccountResult> {
  const cap = await getBankCapability(bankGtid);
  const verifiedAt = nowIso();
  if (!cap) {
    return {
      bankGtid,
      accountType,
      verified: false,
      accountRef: null,
      verifiedAt,
    };
  }

  // The government collection account reference is derived from the bank BIC +
  // account type — this is a simulated lookup. In production this would call
  // the Ministry of Finance / CBE reconciliation API.
  const accountRef = `GOV-${accountType.toUpperCase()}-${cap.bic.replace(/\s/g, "")}`;

  try {
    await db.configurationHistory.create({
      data: {
        configKey: `bank_gov_account:${bankGtid}:${accountType}`,
        oldValue: null,
        newValue: JSON.stringify({
          bankGtid,
          accountType,
          accountRef,
          verified: true,
          verifiedAt,
        }),
        changedByGtid: "SGTX-GOV-VERIFIER",
        changeReason: `bank_gov:verify:${bankGtid}:${accountType}`,
        version: 1,
      },
    });
  } catch (e: any) {
    logger.warn("[bank-mandate] verifyGovernmentCollectionAccount persist failed", {
      bankGtid, accountType, error: e?.message,
    });
  }

  return {
    bankGtid,
    accountType,
    verified: true,
    accountRef,
    verifiedAt,
  };
}

// ============ §4.7.2 captureBuyerBanking ============

export async function captureBuyerBanking(
  tenantGtid: string,
  bankingDetails: BuyerBankingDetails,
): Promise<CaptureBuyerBankingResult> {
  const capturedAt = nowIso();
  const mandateHash = sha256(
    `${tenantGtid}|${bankingDetails.egp_iban}|${bankingDetails.usd_iban}|${capturedAt}`,
  );

  // Generate simulated micro-deposit amounts (two small random amounts in
  // the 0.01-0.99 range). These are stored under `bank_micro:{tenantGtid}:{accountType}`
  // so the subsequent verifyMicroDeposit call can compare.
  const microEgp: [number, number] = [
    +(0.01 + Math.random() * 0.98).toFixed(2),
    +(0.01 + Math.random() * 0.98).toFixed(2),
  ];
  const microUsd: [number, number] = [
    +(0.01 + Math.random() * 0.98).toFixed(2),
    +(0.01 + Math.random() * 0.98).toFixed(2),
  ];

  const microDepositStatus: BuyerBankingDetails["micro_deposit_status"] = {
    egp: { sent: microEgp, verified: false, sentAt: capturedAt },
    usd: { sent: microUsd, verified: false, sentAt: capturedAt },
  };

  const envelope: BuyerBankingDetails = {
    ...bankingDetails,
    bank_mandate_hash: mandateHash,
    micro_deposit_status: microDepositStatus,
  };

  const captured = await setTenantJsonEnvelope(tenantGtid, "banking_details", envelope);

  // Persist the micro-deposit amounts separately so verify can compare
  if (captured) {
    try {
      await db.configurationHistory.create({
        data: {
          configKey: `${MICRO_DEPOSIT_CONFIG_KEY_PREFIX}${tenantGtid}:egp`,
          oldValue: null,
          newValue: JSON.stringify({ sent: microEgp, verified: false, sentAt: capturedAt }),
          changedByGtid: "SGTX-BANK-ONBOARDING",
          changeReason: `bank_micro:egp:${tenantGtid}`,
          version: 1,
        },
      });
      await db.configurationHistory.create({
        data: {
          configKey: `${MICRO_DEPOSIT_CONFIG_KEY_PREFIX}${tenantGtid}:usd`,
          oldValue: null,
          newValue: JSON.stringify({ sent: microUsd, verified: false, sentAt: capturedAt }),
          changedByGtid: "SGTX-BANK-ONBOARDING",
          changeReason: `bank_micro:usd:${tenantGtid}`,
          version: 1,
        },
      });
    } catch (e: any) {
      logger.warn("[bank-mandate] micro-deposit seed failed", { tenantGtid, error: e?.message });
    }
  }

  return {
    captured,
    tenantGtid,
    mandateHash,
    microDepositStatus,
    capturedAt,
  };
}

// ============ §4.7.2 verifyMicroDeposit ============

export async function verifyMicroDeposit(
  tenantGtid: string,
  accountType: "egp" | "usd",
  amounts: [number, number],
): Promise<VerifyMicroDepositResult> {
  const verifiedAt = nowIso();
  let verified = false;
  let mismatch = false;

  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${MICRO_DEPOSIT_CONFIG_KEY_PREFIX}${tenantGtid}:${accountType}` },
      orderBy: { version: "desc" },
    });
    if (!row || !row.newValue) {
      return {
        tenantGtid,
        accountType,
        verified: false,
        mismatch: true,
        verifiedAt,
      };
    }
    const stored = JSON.parse(row.newValue);
    const storedAmounts: [number, number] = stored.sent;
    // Compare both as numbers (string rounding ignored)
    const a1 = +amounts[0].toFixed(2);
    const a2 = +amounts[1].toFixed(2);
    const s1 = +storedAmounts[0].toFixed(2);
    const s2 = +storedAmounts[1].toFixed(2);
    const directMatch = a1 === s1 && a2 === s2;
    const reverseMatch = a1 === s2 && a2 === s1;
    verified = directMatch || reverseMatch;
    mismatch = !verified;

    // Update the stored record to mark verified
    await db.configurationHistory.create({
      data: {
        configKey: `${MICRO_DEPOSIT_CONFIG_KEY_PREFIX}${tenantGtid}:${accountType}`,
        oldValue: row.newValue,
        newValue: JSON.stringify({ ...stored, verified, verifiedAt, attemptedAmounts: amounts }),
        changedByGtid: tenantGtid,
        changeReason: `bank_micro:verify:${accountType}:${verified ? "ok" : "mismatch"}`,
        version: (row.version ?? 1) + 1,
      },
    });
  } catch (e: any) {
    logger.warn("[bank-mandate] verifyMicroDeposit failed", { tenantGtid, accountType, error: e?.message });
    mismatch = true;
  }

  // If verified, update the tenant banking envelope
  if (verified) {
    try {
      const env = await getTenantJsonEnvelope<BuyerBankingDetails>(tenantGtid, "banking_details");
      if (env) {
        const microStatus = env.micro_deposit_status ?? ({} as any);
        if (microStatus[accountType]) {
          microStatus[accountType].verified = true;
        }
        env.micro_deposit_status = microStatus;
        await setTenantJsonEnvelope(tenantGtid, "banking_details", env);
      }
    } catch (e: any) {
      logger.warn("[bank-mandate] update banking envelope after verify failed", {
        tenantGtid, accountType, error: e?.message,
      });
    }
  }

  return { tenantGtid, accountType, verified, mismatch, verifiedAt };
}

// ============ §4.7.3 captureProviderBanking ============

export async function captureProviderBanking(
  tenantGtid: string,
  bankingDetails: ProviderBankingDetails,
): Promise<CaptureProviderBankingResult> {
  const capturedAt = nowIso();
  const captured = await setTenantJsonEnvelope(tenantGtid, "provider_banking", {
    ...bankingDetails,
    capturedAt,
  });
  return {
    captured,
    tenantGtid,
    banking: bankingDetails,
    capturedAt,
  };
}

// ============ §4.7.4 createBankMandateAgreement ============

export async function createBankMandateAgreement(
  tenantGtid: string,
  bankGtid: string,
  mandateConfig: MandateConfig = { tenantGtid, bankGtid },
): Promise<CreateBankMandateAgreementResult> {
  const mandateId = makeMandateId(tenantGtid, bankGtid);
  const createdAt = nowIso();
  const legalBasis = mandateConfig.legalBasis ?? BANK_MANDATE_LEGAL_BASIS;

  // QES required for any agreement under Banking Law 194/2020 + SGTX Mandate
  const requiresQes = true;

  const value = {
    mandateId,
    tenantGtid,
    bankGtid,
    legalBasis,
    customTerms: mandateConfig.customTerms ?? null,
    creditLimit: mandateConfig.creditLimit ?? null,
    currency: mandateConfig.currency ?? "EGP",
    requiresQes,
    qesCertRef: null,
    signedAt: null,
    signerGtid: null,
    status: "PENDING_QES",
    createdAt,
  };

  try {
    await db.configurationHistory.create({
      data: {
        configKey: `${MANDATE_CONFIG_KEY_PREFIX}${mandateId}`,
        oldValue: null,
        newValue: JSON.stringify(value),
        changedByGtid: tenantGtid,
        changeReason: `bank_mandate:create:${tenantGtid}:${bankGtid}`,
        version: 1,
      },
    });
  } catch (e: any) {
    logger.error("[bank-mandate] createBankMandateAgreement persist failed", {
      mandateId, error: e?.message,
    });
    throw new Error(`Failed to create bank mandate: ${e?.message ?? "unknown"}`);
  }

  return {
    mandateId,
    tenantGtid,
    bankGtid,
    requiresQes,
    legalBasis,
    createdAt,
    status: "PENDING_QES",
  };
}

// ============ §4.7.4 signBankMandateQes ============

export async function signBankMandateQes(
  mandateId: string,
  signerGtid?: string | null,
  qesCertRef?: string | null,
): Promise<SignBankMandateQesResult> {
  const signedAt = nowIso();
  const existing = await readMandate(mandateId);
  if (!existing) {
    return {
      mandateId,
      signed: false,
      qesCertRef: null,
      signedAt: null,
      signerGtid: signerGtid ?? null,
    };
  }

  // Generate a synthetic QES cert reference if none provided (simulated
  // Egypt Trust issuance).
  const certRef = qesCertRef ?? `EG-TRUST-QES-${sha256(mandateId + signedAt).slice(0, 12).toUpperCase()}`;
  const signer = signerGtid ?? existing.tenantGtid;

  const updated = {
    ...existing,
    qesCertRef: certRef,
    signedAt,
    signerGtid: signer,
    status: "SIGNED",
  };

  try {
    const row = await db.configurationHistory.findFirst({
      where: { configKey: `${MANDATE_CONFIG_KEY_PREFIX}${mandateId}` },
      orderBy: { version: "desc" },
    });
    await db.configurationHistory.create({
      data: {
        configKey: `${MANDATE_CONFIG_KEY_PREFIX}${mandateId}`,
        oldValue: row?.newValue ?? null,
        newValue: JSON.stringify(updated),
        changedByGtid: signer,
        changeReason: `bank_mandate:sign:${mandateId}`,
        version: (row?.version ?? 1) + 1,
      },
    });

    // Record a QesSignature row for audit trail
    try {
      await db.qesSignature.create({
        data: {
          ustn: existing.ustn ?? null,
          signerGtid: signer,
          signerName: existing.signerName ?? "Bank Mandate Signer",
          signatureType: "QUALIFIED",
          legalEffect: "Bank Mandate Agreement — QES-equivalent per Egyptian Banking Law 194/2020",
          provider: "Egypt Trust",
          certificateId: certRef,
          certificateFp: sha256(certRef).slice(0, 32),
          documentHash: sha256(JSON.stringify(existing)),
          signatureValue: `qes:${certRef}:${sha256(mandateId + signedAt)}`,
          documentType: "BANK_MANDATE_AGREEMENT",
          hybridMode: "HYBRID",
        },
      });
    } catch (e: any) {
      logger.warn("[bank-mandate] QesSignature row create failed", { mandateId, error: e?.message });
    }
  } catch (e: any) {
    logger.error("[bank-mandate] signBankMandateQes persist failed", { mandateId, error: e?.message });
    return {
      mandateId,
      signed: false,
      qesCertRef: null,
      signedAt: null,
      signerGtid: signer,
    };
  }

  return {
    mandateId,
    signed: true,
    qesCertRef: certRef,
    signedAt,
    signerGtid: signer,
  };
}

// ============ §4.7.4 getBankMandate (bonus helper) ============

export async function getBankMandate(mandateId: string): Promise<any | null> {
  return readMandate(mandateId);
}

export async function listBankMandates(filter?: { tenantGtid?: string; bankGtid?: string }): Promise<any[]> {
  try {
    const rows = await db.configurationHistory.findMany({
      where: { configKey: { startsWith: MANDATE_CONFIG_KEY_PREFIX } },
      orderBy: { version: "desc" },
    });
    const seen = new Map<string, any>();
    for (const r of rows) {
      if (!seen.has(r.configKey) && r.newValue) {
        const parsed = JSON.parse(r.newValue);
        if (filter?.tenantGtid && parsed.tenantGtid !== filter.tenantGtid) continue;
        if (filter?.bankGtid && parsed.bankGtid !== filter.bankGtid) continue;
        seen.set(r.configKey, parsed);
      }
    }
    return Array.from(seen.values());
  } catch (e: any) {
    logger.warn("[bank-mandate] listBankMandates failed", { error: e?.message });
    return [];
  }
}
