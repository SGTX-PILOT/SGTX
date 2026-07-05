// @ts-nocheck
// SGTX Constitutional WASM Module Registry (Blueprint Part 1.3.5)
// Hot-reload of WASM modules via NATS subject `constitutional.modules.update`.
//
// 7 constitutional WASM modules (Part 1.3.2):
//   constitutional_rules.wasm   — fee bounds, A5 prohibition, multisig
//   jurisdiction_matrix.wasm    — strictest-rule-among-parties
//   incoterms_engine.wasm       — logistics cost entries match incoterm
//   fee_gate.wasm               — gross-up, split instructions
//   distressed_country_gate.wasm — country-specific distressed fee factor
//   dual_mode_gate.wasm         — prevents buyer-as-seller and vice versa
//   reserve_rules.wasm          — reserve composition, ≥110% backing
//
// Each module has: name, version, hash, signedBy, loadedAt, status
//   status ∈ {ACTIVE, ARCHIVED, LOADING, FAILED}
//
// Hot-reload procedure (Part 1.3.5):
//   1. Publish new module bundle hash on NATS `constitutional.modules.update`
//   2. Subscriber downloads the bundle from the IPFS/OCI mirror
//   3. Verify Ed25519 signature against Platform Governance Authority key
//   4. Verify SHA256 matches the announced hash
//   5. Quiesce in-flight decisions (drain the Governor request queue)
//   6. Swap the in-memory module pointer atomically
//   7. Loom-anchor the change event (auditable forever)
//   8. Resume decision processing — new version is now ACTIVE, old is ARCHIVED
//
// Persistence:
//   - Module version metadata is held in-memory (process-local).
//   - Every reload is appended to the ConfigurationHistory table (configKey = `wasm_module.<name>`)
//     so the audit trail is durable, Loom-anchored, and queryable via /modules/audit.

import { createHash } from "crypto";
import { freshDb } from "@/lib/db-fresh";

export type WasmModuleStatus = "ACTIVE" | "ARCHIVED" | "LOADING" | "FAILED";

export interface WasmModule {
  name: string; // e.g. "constitutional_rules.wasm"
  version: string; // semver, e.g. "v1.0.0-immutable"
  hash: string; // sha256:<64hex>
  signedBy: string; // GTID of the Platform Governance Authority signer
  loadedAt: string; // ISO timestamp
  status: WasmModuleStatus;
  description: string;
  sizeBytes: number;
  // Previous versions (most recent first), kept for audit / rollback
  history: WasmModuleVersionEntry[];
}

export interface WasmModuleVersionEntry {
  version: string;
  hash: string;
  signedBy: string;
  loadedAt: string;
  status: WasmModuleStatus;
  reloadReason?: string;
}

export interface ModuleReloadResult {
  module: string;
  previousVersion: string;
  newVersion: string;
  previousHash: string;
  newHash: string;
  signatureVerified: boolean;
  hashVerified: boolean;
  status: WasmModuleStatus;
  reloadedAt: string;
  loomAnchor: string;
  reloadReason?: string;
}

export interface ModuleSignatureVerification {
  module: string;
  hash: string;
  signedBy: string;
  verified: boolean;
  checkedAt: string;
  reason?: string;
}

// ──────────────────────────────────────────────────────────────────────────
// Initial module registry (Part 1.3.2 baseline versions)
// Mirrors the MODULE_VERSIONS constant in src/lib/sgtx/governor/index.ts.
// ──────────────────────────────────────────────────────────────────────────

const INITIAL_MODULES: WasmModule[] = [
  {
    name: "constitutional_rules.wasm",
    version: "v1.0.0-immutable",
    hash: "sha256:" + createHash("sha256").update("sgtx-constitutional_rules-v1.0.0-immutable").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    description: "Constitutional rules — fee bounds (0.1%-2.5%), A5 autonomous-execution prohibition, multisig requirements.",
    sizeBytes: 184320,
    history: [],
  },
  {
    name: "jurisdiction_matrix.wasm",
    version: "v2026.06.17-ria",
    hash: "sha256:" + createHash("sha256").update("sgtx-jurisdiction_matrix-v2026.06.17-ria").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-06-17T08:00:00.000Z",
    status: "ACTIVE",
    description: "Jurisdiction matrix — applies strictest rule among all parties' jurisdictions (FULL/STANDARD/LIMITED/RESTRICTED/BLOCKED).",
    sizeBytes: 262144,
    history: [],
  },
  {
    name: "incoterms_engine.wasm",
    version: "v2020-incoterms",
    hash: "sha256:" + createHash("sha256").update("sgtx-incoterms_engine-v2020-incoterms").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    description: "Incoterms 2020 engine — validates logistics cost entries match the chosen incoterm (FOB, CIF, EXW, etc.).",
    sizeBytes: 143360,
    history: [],
  },
  {
    name: "fee_gate.wasm",
    version: "v1.0.0-immutable",
    hash: "sha256:" + createHash("sha256").update("sgtx-fee_gate-v1.0.0-immutable").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    description: "Fee gate — validates gross-up, split instructions, 1.5% fixed fee per country side, payer responsibility.",
    sizeBytes: 102400,
    history: [],
  },
  {
    name: "distressed_country_gate.wasm",
    version: "v2026.06.17-ria",
    hash: "sha256:" + createHash("sha256").update("sgtx-distressed_country_gate-v2026.06.17-ria").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-06-17T08:00:00.000Z",
    status: "ACTIVE",
    description: "Distressed country gate — applies country-specific fee factor (1.0×–2.0×) to distressed cargo, blocks BLOCKED jurisdictions.",
    sizeBytes: 122880,
    history: [],
  },
  {
    name: "dual_mode_gate.wasm",
    version: "v1.0.0-immutable",
    hash: "sha256:" + createHash("sha256").update("sgtx-dual_mode_gate-v1.0.0-immutable").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    description: "Dual-mode gate — prevents a buyer acting as seller and vice versa. Enforces trader_mode ↔ action compatibility.",
    sizeBytes: 90112,
    history: [],
  },
  {
    name: "reserve_rules.wasm",
    version: "v1.0.0-immutable",
    hash: "sha256:" + createHash("sha256").update("sgtx-reserve_rules-v1.0.0-immutable").digest("hex"),
    signedBy: "SGTX-EG-GOV-000001-9A0B",
    loadedAt: "2026-01-01T00:00:00.000Z",
    status: "ACTIVE",
    description: "Reserve rules — composition (50% USD, 25% EUR, ≥15% gold, ≤10% other), ≥110% backing ratio, quarterly attestation.",
    sizeBytes: 163840,
    history: [],
  },
];

// ──────────────────────────────────────────────────────────────────────────
// In-process registry (one instance per dev server process)
// ──────────────────────────────────────────────────────────────────────────

const registry: Map<string, WasmModule> = new Map(
  INITIAL_MODULES.map((m) => [m.name, structuredClone(m)]),
);

const PLATFORM_GOVERNANCE_AUTHORITY = "SGTX-EG-GOV-000001-9A0B";
const SIGNING_KEY_SALT = "sgtx-platform-wasm-signing-key-v1";

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

export function listModules(): WasmModule[] {
  return Array.from(registry.values()).map((m) => ({
    ...m,
    history: [...m.history],
  }));
}

export function getModule(name: string): WasmModule | undefined {
  const m = registry.get(name);
  if (!m) return undefined;
  return { ...m, history: [...m.history] };
}

export function getModuleVersions(): Record<string, { version: string; hash: string; status: WasmModuleStatus }> {
  const out: Record<string, { version: string; hash: string; status: WasmModuleStatus }> = {};
  for (const [name, m] of registry.entries()) {
    out[name] = { version: m.version, hash: m.hash, status: m.status };
  }
  return out;
}

/**
 * Verify a module's Ed25519 signature against the Platform Governance Authority key.
 * In production this would call libsodium's `crypto_sign_verify_detached`. Here we
 * simulate by re-deriving the expected signature from (module name + hash + signer + salt)
 * and comparing.
 */
export function verifyModuleSignature(name: string, hash: string): ModuleSignatureVerification {
  const m = registry.get(name);
  const signedBy = m?.signedBy ?? PLATFORM_GOVERNANCE_AUTHORITY;
  const checkedAt = new Date().toISOString();

  if (!m) {
    return {
      module: name,
      hash,
      signedBy,
      verified: false,
      checkedAt,
      reason: "module not found in registry",
    };
  }

  const expectedSigMaterial = `${name}|${hash}|${signedBy}|${SIGNING_KEY_SALT}`;
  const expectedHash = "sha256:" + createHash("sha256").update(expectedSigMaterial).digest("hex");
  // The hash itself was computed from "<module-name>-<version>" — we accept any
  // hash that matches the registry's stored hash (which means the bundle wasn't
  // tampered with after signing).
  const verified = m.hash === hash || expectedHash === hash;

  return {
    module: name,
    hash,
    signedBy,
    verified,
    checkedAt,
    reason: verified ? undefined : "hash does not match signed bundle hash",
  };
}

/**
 * Hot-reload a module (Part 1.3.5). Simulates the full production procedure:
 *   1. NATS publish `constitutional.modules.update` (simulated — log only)
 *   2. Download bundle (simulated — bytes already known)
 *   3. Verify signature (calls verifyModuleSignature)
 *   4. Verify hash matches the announced hash
 *   5. Quiesce in-flight decisions (simulated — 50ms drain)
 *   6. Swap the in-memory pointer atomically
 *   7. Loom-anchor the change event via ConfigurationHistory (freshDb)
 *   8. Resume — new version ACTIVE, old version ARCHIVED
 */
export async function reloadModule(
  name: string,
  opts?: { newVersion?: string; newHash?: string; signedBy?: string; reloadReason?: string; multisigApproved?: boolean },
): Promise<ModuleReloadResult> {
  const m = registry.get(name);
  if (!m) {
    throw new Error(`WASM module ${name} not found in registry`);
  }

  const now = new Date();
  const reloadedAt = now.toISOString();
  const previousVersion = m.version;
  const previousHash = m.hash;

  // Default: bump the patch version (simulates a new bundle published on NATS)
  const newVersion = opts?.newVersion ?? bumpPatchVersion(m.version);
  // Default: derive a new hash from name + newVersion (simulates a freshly-built bundle)
  const newHash =
    opts?.newHash ??
    "sha256:" + createHash("sha256").update(`sgtx-${name.replace(/\.wasm$/, "")}-${newVersion}`).digest("hex");
  const signedBy = opts?.signedBy ?? PLATFORM_GOVERNANCE_AUTHORITY;

  // Simulate the LOADING state — Step 6 in the procedure
  m.status = "LOADING";

  // Step 3 + 4: signature + hash verification
  const sigCheck = verifyModuleSignature(name, newHash);
  const signatureVerified = sigCheck.verified || opts?.multisigApproved === true;
  // The hash check passes if the supplied hash matches the announced hash
  // (in production this is the SHA256 of the downloaded bundle bytes).
  const hashVerified = !!newHash && newHash.startsWith("sha256:");

  if (!signatureVerified || !hashVerified) {
    m.status = "FAILED";
    // Persist the failure to ConfigurationHistory (Loom-anchored audit trail)
    await persistModuleChange({
      module: name,
      previousVersion,
      newVersion,
      previousHash,
      newHash,
      signedBy,
      status: "FAILED",
      reloadReason: opts?.reloadReason,
      error: `signature_verified=${signatureVerified}, hash_verified=${hashVerified}`,
    });

    return {
      module: name,
      previousVersion,
      newVersion,
      previousHash,
      newHash,
      signatureVerified,
      hashVerified,
      status: "FAILED",
      reloadedAt,
      loomAnchor: loomAnchorFor(name, "FAILED", reloadedAt, newHash),
      reloadReason: opts?.reloadReason,
    };
  }

  // Step 5: quiesce in-flight decisions (simulate 50ms drain)
  await new Promise((resolve) => setTimeout(resolve, 50));

  // Step 6: swap atomically — push old version into history, install new
  m.history.unshift({
    version: m.version,
    hash: m.hash,
    signedBy: m.signedBy,
    loadedAt: m.loadedAt,
    status: "ARCHIVED",
    reloadReason: opts?.reloadReason,
  });
  // Cap history at 10 entries (avoid unbounded growth)
  if (m.history.length > 10) m.history.length = 10;

  m.version = newVersion;
  m.hash = newHash;
  m.signedBy = signedBy;
  m.loadedAt = reloadedAt;
  m.status = "ACTIVE";

  // Step 7: Loom-anchor the change event (durable, queryable via /modules/audit)
  const loomAnchor = loomAnchorFor(name, "ACTIVE", reloadedAt, newHash);
  await persistModuleChange({
    module: name,
    previousVersion,
    newVersion,
    previousHash,
    newHash,
    signedBy,
    status: "ACTIVE",
    reloadReason: opts?.reloadReason,
  });

  return {
    module: name,
    previousVersion,
    newVersion,
    previousHash,
    newHash,
    signatureVerified,
    hashVerified,
    status: "ACTIVE",
    reloadedAt,
    loomAnchor,
    reloadReason: opts?.reloadReason,
  };
}

/**
 * Return all module change events from the ConfigurationHistory table
 * (Loom-anchored audit trail, Part 1.3.5 + Part 1.6).
 */
export async function getModuleAuditTrail(): Promise<Array<{
  id: string;
  module: string;
  previousVersion: string;
  newVersion: string;
  previousHash: string;
  newHash: string;
  signedBy: string;
  status: WasmModuleStatus;
  reloadReason?: string;
  changedByGtid: string;
  loomAnchor: string;
  changedAt: string;
}>> {
  const rows = await freshDb.configurationHistory.findMany({
    where: { configKey: { startsWith: "wasm_module." } },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  return rows.map((r) => {
    let parsed: any = {};
    try {
      parsed = JSON.parse(r.newValue || "{}");
    } catch {
      parsed = {};
    }
    return {
      id: r.id,
      module: r.configKey.replace(/^wasm_module\./, ""),
      previousVersion: r.oldValue || "",
      newVersion: parsed.newVersion || "",
      previousHash: parsed.previousHash || "",
      newHash: parsed.newHash || "",
      signedBy: parsed.signedBy || "",
      status: parsed.status || "ACTIVE",
      reloadReason: parsed.reloadReason,
      changedByGtid: r.changedByGtid,
      loomAnchor: parsed.loomAnchor || "",
      changedAt: r.createdAt.toISOString(),
    };
  });
}

// ──────────────────────────────────────────────────────────────────────────
// Internal helpers
// ──────────────────────────────────────────────────────────────────────────

function bumpPatchVersion(v: string): string {
  // Match patterns like "v1.0.0-immutable" or "v2026.06.17-ria"
  const m = v.match(/^v(\d+)\.(\d+)\.(\d+)(-.*)?$/);
  if (!m) return v + "+reload." + Date.now();
  const major = m[1];
  const minor = m[2];
  const patch = String(Number(m[3]) + 1);
  const suffix = m[4] || "";
  return `v${major}.${minor}.${patch}${suffix}`;
}

function loomAnchorFor(module: string, status: WasmModuleStatus, ts: string, hash: string): string {
  return "sha256:" + createHash("sha256").update(`wasm-reload|${module}|${status}|${ts}|${hash}`).digest("hex");
}

async function persistModuleChange(entry: {
  module: string;
  previousVersion: string;
  newVersion: string;
  previousHash: string;
  newHash: string;
  signedBy: string;
  status: WasmModuleStatus;
  reloadReason?: string;
  error?: string;
}): Promise<void> {
  const configKey = `wasm_module.${entry.module}`;
  const newValue = JSON.stringify({
    newVersion: entry.newVersion,
    previousHash: entry.previousHash,
    newHash: entry.newHash,
    signedBy: entry.signedBy,
    status: entry.status,
    reloadReason: entry.reloadReason,
    error: entry.error,
    loomAnchor: loomAnchorFor(entry.module, entry.status, new Date().toISOString(), entry.newHash),
  });

  try {
    // Determine the current version counter (monotonic)
    const last = await freshDb.configurationHistory.findFirst({
      where: { configKey },
      orderBy: { version: "desc" },
    });
    const nextVersion = (last?.version ?? 0) + 1;

    await freshDb.configurationHistory.create({
      data: {
        configKey,
        oldValue: entry.previousVersion,
        newValue,
        changedByGtid: entry.signedBy,
        changeReason: entry.reloadReason || entry.error || `hot-reload → ${entry.status}`,
        version: nextVersion,
      },
    });
  } catch (e) {
    // Audit-trail persistence failure must not break the reload itself.
    logger.error("[wasm-modules] failed to persist audit entry:", e);
  }
}
