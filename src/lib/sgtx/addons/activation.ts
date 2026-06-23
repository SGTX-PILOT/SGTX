// SGTX Part 11.8 — Addon Activation Workflow (Admin Portal)
// Blueprint Part 11.8 requires that each of the 7 addons can be toggled on/off
// via the Admin Portal, with config persistence and (where required) multisig
// approval. The AddonActivation table is the single source of truth.
//
// This module exposes the documented API:
//   - listAddons()                 → returns all 7 addon cards with status + config
//   - activateAddon(addonId, ...)  → flips isActive=true (requires multisig if applicable)
//   - deactivateAddon(addonId, ...)→ flips isActive=false
//   - getAddonConfig(addonId)      → returns the JSON config blob
//   - updateAddonConfig(addonId, config) → replaces the JSON config blob
//
// Per Part 11.11 AI authority: A4 for activation toggles; A1 for notifications.

import { db } from "@/lib/db";

export type AddonId =
  | "gnn"
  | "federated"
  | "causal"
  | "self_healing"
  | "pentest"
  | "pqc"
  | "zk";

export interface AddonDescriptor {
  addonId: AddonId;
  name: string;
  description: string;
  category: "INTELLIGENCE" | "PRIVACY" | "SECURITY" | "RESILIENCE";
  authorityLevel: "A1" | "A2" | "A3" | "A4";
  multisigRequired: boolean;
  blueprintRef: string;
  defaultConfig: Record<string, unknown>;
}

// The 7 canonical addon descriptors (blueprint Part 11.0 summary table).
export const ADDON_DESCRIPTORS: AddonDescriptor[] = [
  {
    addonId: "gnn",
    name: "GNN Risk Engine & Institutional Trade Graph",
    description:
      "Graph Neural Network for sanctions-proximity detection (UBO 2-hop) and trust-based trade-graph mapping.",
    category: "INTELLIGENCE",
    authorityLevel: "A2",
    multisigRequired: true, // Part 11.1.7 — initial model download requires multisig
    blueprintRef: "Part 11.1",
    defaultConfig: {
      riskEngine: true,
      trustGraph: false, // off by default per 11.1.7
      fallback: "rule_based",
    },
  },
  {
    addonId: "federated",
    name: "Federated Learning Network",
    description:
      "Train fraud/margin/credit models across sovereign nodes without raw data sharing.",
    category: "INTELLIGENCE",
    authorityLevel: "A2",
    multisigRequired: true, // Part 11.2.4 — coordinator setup requires multisig
    blueprintRef: "Part 11.2",
    defaultConfig: {
      coordinatorNodeGtid: "SGTX-EG-GOV-000001-9A0B",
      models: ["fraud_detection", "margin_estimation", "credit_scoring"],
      schedule: "weekly",
      differentialPrivacyEpsilon: 0.5,
    },
  },
  {
    addonId: "causal",
    name: "Causal Inference Engine",
    description:
      "DoWhy + EconML root-cause attribution for disputes, milestone breaches, and quality failures.",
    category: "INTELLIGENCE",
    authorityLevel: "A2",
    multisigRequired: false,
    blueprintRef: "Part 11.3",
    defaultConfig: {
      autoTriggerOnDispute: true,
      autoTriggerOnDelayHours: 24,
      methodology: "double_ml",
    },
  },
  {
    addonId: "self_healing",
    name: "Self-Healing Infrastructure & Chaos Engineering",
    description:
      "K3s pod auto-healing, LSTM disk-failure prediction, weekly chaos experiments.",
    category: "RESILIENCE",
    authorityLevel: "A2",
    multisigRequired: false, // staging chaos: no multisig; production chaos: separate multisig per 11.4.4
    blueprintRef: "Part 11.4",
    defaultConfig: {
      selfHealingAgent: true,
      chaosSchedule: "Sunday 03:00 UTC",
      chaosNamespace: "staging",
      lstmDiskFailureThreshold: 0.7,
    },
  },
  {
    addonId: "pentest",
    name: "Automated Penetration Testing",
    description:
      "Weekly Trivy + OWASP ZAP + nuclei + OpenVAS scans. CRITICAL findings block CI/CD.",
    category: "SECURITY",
    authorityLevel: "A4",
    multisigRequired: false,
    blueprintRef: "Part 11.5",
    defaultConfig: {
      schedule: "Friday 23:00 UTC",
      targetEnvironment: "staging",
      tools: ["trivy", "owasp_zap", "nuclei", "openvas"],
      blockCiCdOnCritical: true,
    },
  },
  {
    addonId: "pqc",
    name: "Post-Quantum Cryptography (Dilithium3)",
    description:
      "Quantum-safe signatures on long-lived records (contracts, eBL, settlement proofs).",
    category: "SECURITY",
    authorityLevel: "A3",
    multisigRequired: true, // Part 11.6.4 — key generation ceremony requires multisig
    blueprintRef: "Part 11.6",
    defaultConfig: {
      algorithm: "CRYSTAL-Dilithium3",
      dualSignature: true, // Ed25519 + Dilithium3
      resignerSchedule: "weekly",
      keyValidityYears: 10,
    },
  },
  {
    addonId: "zk",
    name: "Zero-Knowledge Proofs & Proof of Reserves",
    description:
      "Plonky3 ZK proofs for financier reserves, confidential pricing, private settlement.",
    category: "PRIVACY",
    authorityLevel: "A4",
    multisigRequired: false,
    blueprintRef: "Part 11.7",
    defaultConfig: {
      reserveProofs: true,
      confidentialPricing: true,
      privateSettlement: true,
      proofSystem: "plonky3",
      reserveRatioMin: 1.1, // constitutional rule
    },
  },
];

/**
 * Ensure every addon has a row in AddonActivation. Idempotent — first call
 * seeds the table from ADDON_DESCRIPTORS; subsequent calls are no-ops.
 */
export async function ensureAddonsSeeded(): Promise<void> {
  for (const d of ADDON_DESCRIPTORS) {
    try {
      await db.addonActivation.upsert({
        where: { addonId: d.addonId },
        create: {
          addonId: d.addonId,
          name: d.name,
          description: d.description,
          category: d.category,
          isActive: false,
          multisigRequired: d.multisigRequired,
          multisigApproved: !d.multisigRequired,
          config: JSON.stringify(d.defaultConfig),
          authorityLevel: d.authorityLevel,
        },
        update: {},
      });
    } catch (e) {
      console.error("[activation] seed failed for", d.addonId, e);
    }
  }
}

export interface AddonCard extends AddonDescriptor {
  isActive: boolean;
  multisigApproved: boolean;
  config: Record<string, unknown>;
  activatedAt: string | null;
  deactivatedAt: string | null;
  activatedByGtid: string | null;
}

/**
 * List all 7 addons with their activation status + config (Part 11.8 step 2).
 */
export async function listAddons(): Promise<{ ok: boolean; addons: AddonCard[] }> {
  await ensureAddonsSeeded();
  const rows = await db.addonActivation.findMany({ orderBy: { addonId: "asc" } });
  const byId = new Map(rows.map((r) => [r.addonId, r]));
  const addons: AddonCard[] = ADDON_DESCRIPTORS.map((d) => {
    const row = byId.get(d.addonId);
    return {
      ...d,
      isActive: row?.isActive ?? false,
      multisigApproved: row?.multisigApproved ?? !d.multisigRequired,
      config: row ? safeParseConfig(row.config) : d.defaultConfig,
      activatedAt: row?.activatedAt?.toISOString() ?? null,
      deactivatedAt: row?.deactivatedAt?.toISOString() ?? null,
      activatedByGtid: row?.activatedByGtid ?? null,
    };
  });
  return { ok: true, addons };
}

function safeParseConfig(s: string | null | undefined): Record<string, unknown> {
  if (!s) return {};
  try {
    return JSON.parse(s) as Record<string, unknown>;
  } catch {
    return {};
  }
}

/**
 * Activate an addon (Part 11.8 step 3-4).
 *
 * For addons with `multisigRequired=true`, the caller must pass either:
 *   - `multisigApproved: true` (the multisig has already approved), OR
 *   - a `multisigRequestId` referencing a MultisigRequest row in APPROVED state.
 *
 * Returns the updated AddonCard, or `{ ok: false, error }` if the multisig
 * requirement is not met.
 */
export async function activateAddon(params: {
  addonId: string;
  activatedByGtid?: string;
  multisigApproved?: boolean;
  multisigRequestId?: string;
}): Promise<{ ok: boolean; addon?: AddonCard; error?: string }> {
  const descriptor = ADDON_DESCRIPTORS.find((d) => d.addonId === params.addonId);
  if (!descriptor) return { ok: false, error: `unknown addon "${params.addonId}"` };

  await ensureAddonsSeeded();
  const existing = await db.addonActivation.findUnique({ where: { addonId: params.addonId } });
  if (!existing) return { ok: false, error: "addon row not found" };

  // Multisig enforcement (Part 11.8 step 3).
  let multisigApproved = existing.multisigApproved;
  if (descriptor.multisigRequired && !multisigApproved) {
    if (params.multisigApproved === true) {
      multisigApproved = true;
    } else if (params.multisigRequestId) {
      try {
        const req = await db.multisigRequest.findUnique({ where: { id: params.multisigRequestId } });
        if (req && req.status === "APPROVED") {
          multisigApproved = true;
        } else {
          return { ok: false, error: `multisig request ${params.multisigRequestId} not APPROVED (status=${req?.status ?? "missing"})` };
        }
      } catch (e) {
        return { ok: false, error: `multisig lookup failed: ${(e as Error).message}` };
      }
    } else {
      return {
        ok: false,
        error: `addon "${params.addonId}" requires multisig approval — pass multisigApproved=true or multisigRequestId`,
      };
    }
  }

  const now = new Date();
  const updated = await db.addonActivation.update({
    where: { addonId: params.addonId },
    data: {
      isActive: true,
      multisigApproved,
      activatedAt: now,
      deactivatedAt: null,
      activatedByGtid: params.activatedByGtid ?? null,
    },
  });

  return {
    ok: true,
    addon: {
      ...descriptor,
      isActive: updated.isActive,
      multisigApproved: updated.multisigApproved,
      config: safeParseConfig(updated.config),
      activatedAt: updated.activatedAt?.toISOString() ?? null,
      deactivatedAt: updated.deactivatedAt?.toISOString() ?? null,
      activatedByGtid: updated.activatedByGtid,
    },
  };
}

/**
 * Deactivate an addon (Part 11.8 — flip toggle off).
 * No multisig required for deactivation (only activation requires it per 11.8 step 3).
 */
export async function deactivateAddon(params: {
  addonId: string;
  deactivatedByGtid?: string;
}): Promise<{ ok: boolean; addon?: AddonCard; error?: string }> {
  const descriptor = ADDON_DESCRIPTORS.find((d) => d.addonId === params.addonId);
  if (!descriptor) return { ok: false, error: `unknown addon "${params.addonId}"` };

  await ensureAddonsSeeded();
  const existing = await db.addonActivation.findUnique({ where: { addonId: params.addonId } });
  if (!existing) return { ok: false, error: "addon row not found" };

  const updated = await db.addonActivation.update({
    where: { addonId: params.addonId },
    data: {
      isActive: false,
      deactivatedAt: new Date(),
      activatedByGtid: params.deactivatedByGtid ?? existing.activatedByGtid,
    },
  });

  return {
    ok: true,
    addon: {
      ...descriptor,
      isActive: updated.isActive,
      multisigApproved: updated.multisigApproved,
      config: safeParseConfig(updated.config),
      activatedAt: updated.activatedAt?.toISOString() ?? null,
      deactivatedAt: updated.deactivatedAt?.toISOString() ?? null,
      activatedByGtid: updated.activatedByGtid,
    },
  };
}

/**
 * Get the config blob for an addon (Part 11.8 — config panel read).
 */
export async function getAddonConfig(addonId: string): Promise<{
  ok: boolean;
  config?: Record<string, unknown>;
  error?: string;
}> {
  const descriptor = ADDON_DESCRIPTORS.find((d) => d.addonId === addonId);
  if (!descriptor) return { ok: false, error: `unknown addon "${addonId}"` };
  await ensureAddonsSeeded();
  const row = await db.addonActivation.findUnique({ where: { addonId } });
  return { ok: true, config: row ? safeParseConfig(row.config) : descriptor.defaultConfig };
}

/**
 * Update the config blob for an addon (Part 11.8 — config panel write).
 * Records a ConfigurationHistory entry (Part 12C.11) for audit trail.
 */
export async function updateAddonConfig(params: {
  addonId: string;
  config: Record<string, unknown>;
  changedByGtid?: string;
  changeReason?: string;
}): Promise<{ ok: boolean; config?: Record<string, unknown>; error?: string }> {
  const descriptor = ADDON_DESCRIPTORS.find((d) => d.addonId === params.addonId);
  if (!descriptor) return { ok: false, error: `unknown addon "${params.addonId}"` };
  if (!params.config || typeof params.config !== "object") {
    return { ok: false, error: "config must be a JSON object" };
  }
  await ensureAddonsSeeded();
  const existing = await db.addonActivation.findUnique({ where: { addonId: params.addonId } });
  if (!existing) return { ok: false, error: "addon row not found" };

  const oldConfig = existing.config;
  const newConfigJson = JSON.stringify(params.config);
  const updated = await db.addonActivation.update({
    where: { addonId: params.addonId },
    data: { config: newConfigJson },
  });

  // Record a ConfigurationHistory entry (Part 12C.11 audit trail).
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `addon.${params.addonId}.config`,
        oldValue: oldConfig,
        newValue: newConfigJson,
        changedByGtid: params.changedByGtid ?? "system",
        changeReason: params.changeReason ?? "addon config update",
      },
    });
  } catch (e) {
    console.error("[activation] ConfigurationHistory write failed:", e);
  }

  return { ok: true, config: safeParseConfig(updated.config) };
}
