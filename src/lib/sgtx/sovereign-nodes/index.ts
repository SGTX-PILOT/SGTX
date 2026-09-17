// @ts-nocheck
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v17 §24 Phase 4 — Sovereign Nodes (regional deployments)
// ═══════════════════════════════════════════════════════════════════════════════
//
// Per v17 §24 Phase 4 (Years 3-5): "sovereign nodes per region, mutual USTN
// recognition". Each region (Cairo, Dubai, Frankfurt, Singapore, São Paulo,
// Nairobi…) gets its own sovereign node — a self-contained K3s cluster with
// local PostgreSQL replica + local NATS JetStream + local HSM partition.
//
// Sovereign nodes are NOT cloud regions — they are bare-metal installations in
// specific countries, with data residency enforced by local law. The Cairo
// node is the primary. The Dubai node is the secondary (sync PostgreSQL
// replica). The Frankfurt node is the tertiary (async replica + EU data
// residency). Singapore serves APAC. São Paulo serves LATAM. Nairobi serves
// Africa.
//
// When a trade touches a country, SGTX dispatches to the NEAREST sovereign
// node first (lowest latency) — falling back to the next-nearest if the
// primary is degraded or in maintenance. The "nearest" determination is
// based on the country's region matching the node's region.
//
// Each sovereign node has its own jurisdiction (the country it lives in) +
// data residency profile (which personal data may be stored there + which
// export controls apply). The mutual-USTN lib (sibling) uses this to verify
// that a USTN issued by one node is recognised by all the others.
//
// The existing `monitoring/infrastructure.ts` lib has its own `SovereignNode`
// interface + `buildSovereignNodes()` — those continue to be the production
// architecture spec for the Cairo/Dubai/Frankfurt 3-region cluster. This
// sovereign-nodes lib EXTENDS that with:
//   - getNearestSovereignNode(countryCode) — region-match dispatch
//   - deploySovereignNode(region, config) — simulated deployment workflow
//   - getNodeCapabilities(nodeId) — USTN recognition + jurisdiction + data residency
//
// Functions exposed:
//   - getSovereignNodes()                 → SovereignNode[]
//   - getNearestSovereignNode(countryCode) → SovereignNode
//   - deploySovereignNode(region, config)  → { nodeId, status, endpoints }
//   - getNodeCapabilities(nodeId)          → { ustnRecognition, jurisdiction, dataResidency }
// ═══════════════════════════════════════════════════════════════════════════════

import { logger } from "@/lib/sgtx/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SovereignNode {
  id: string;
  hostname: string;
  region: string;
  country: string;
  role: "primary" | "secondary" | "tertiary" | "witness" | "regional";
  status: "OPERATIONAL" | "DEGRADED" | "OUTAGE" | "MAINTENANCE" | "PROVISIONING";
  k3sVersion: string;
  cpuCores: number;
  memoryGb: number;
  diskTb: number;
  networkGbps: number;
  latencyToPrimaryMs: number;
  lastHeartbeatAt: string;
  endpoints: {
    api: string;
    ws: string;
    nats: string;
    postgres: string;
  };
}

export interface SovereignNodeCapabilities {
  nodeId: string;
  ustnRecognition: {
    canIssue: boolean;          // can this node issue new USTNs?
    canVerify: boolean;         // can this node verify USTNs from other nodes?
    recognizedNodes: string[]; // node IDs whose USTNs this node recognises
  };
  jurisdiction: {
    country: string;            // ISO alpha-2 of the country the node lives in
    region: string;
    legalSystem: string;        // e.g. "Civil Law (Egypt)", "Common Law (UK)"
    supervisoryAuthority: string;
  };
  dataResidency: {
    classification: "EU_GDPR" | "PDPL_EG" | "CCPA_US" | "PIPL_CN" | "LGPD_BR" | "POPIA_ZA" | "PDPA_SG" | "DEFAULT";
    dataLocalizationRequired: boolean;
    crossBorderTransferAllowed: boolean;
    retentionDays: number;
  };
}

export interface DeploySovereignNodeResult {
  nodeId: string;
  status: "PROVISIONING" | "OPERATIONAL" | "FAILED";
  endpoints: {
    api: string;
    ws: string;
    nats: string;
    postgres: string;
  };
  message: string;
}

// ── Region → node mapping ─────────────────────────────────────────────────────
//
// Each ISO country is mapped to a primary region. When a trade touches that
// country, SGTX dispatches to the sovereign node for that region.
const COUNTRY_TO_REGION: Record<string, string> = {
  // MEA (Middle East + Africa — primary in Cairo)
  EG: "cairo",
  JO: "cairo",
  PS: "cairo",
  IQ: "cairo",
  SD: "cairo",
  LY: "cairo",
  YE: "cairo",
  LB: "cairo",
  SY: "cairo",

  // GCC (Gulf — primary in Dubai)
  AE: "dubai",
  SA: "dubai",
  QA: "dubai",
  KW: "dubai",
  BH: "dubai",
  OM: "dubai",

  // EU (European Union — primary in Frankfurt)
  DE: "frankfurt",
  IT: "frankfurt",
  NL: "frankfurt",
  ES: "frankfurt",
  FR: "frankfurt",
  BE: "frankfurt",
  AT: "frankfurt",
  PL: "frankfurt",
  IE: "frankfurt",
  PT: "frankfurt",
  GR: "frankfurt",
  CZ: "frankfurt",
  HU: "frankfurt",
  RO: "frankfurt",
  BG: "frankfurt",
  HR: "frankfurt",
  SK: "frankfurt",
  SI: "frankfurt",
  LT: "frankfurt",
  LV: "frankfurt",
  EE: "frankfurt",
  FI: "frankfurt",
  SE: "frankfurt",
  DK: "frankfurt",
  LU: "frankfurt",
  MT: "frankfurt",
  CY: "frankfurt",

  // UK (post-Brexit — kept in Frankfurt region for proximity)
  GB: "frankfurt",

  // APAC (Asia-Pacific — primary in Singapore)
  SG: "singapore",
  MY: "singapore",
  TH: "singapore",
  ID: "singapore",
  PH: "singapore",
  VN: "singapore",
  JP: "singapore",
  KR: "singapore",
  AU: "singapore",
  NZ: "singapore",
  HK: "singapore",
  TW: "singapore",
  IN: "mumbai",
  BD: "mumbai",
  PK: "mumbai",
  LK: "mumbai",
  CN: "shanghai",

  // LATAM (Latin America — primary in São Paulo)
  BR: "saopaulo",
  AR: "saopaulo",
  CL: "saopaulo",
  CO: "saopaulo",
  PE: "saopaulo",
  MX: "saopaulo",
  UY: "saopaulo",
  PY: "saopaulo",
  BO: "saopaulo",
  EC: "saopaulo",
  VE: "saopaulo",

  // NAFTA / North America — primary in Virginia
  US: "virginia",
  CA: "virginia",

  // Africa (sub-Saharan — primary in Nairobi)
  KE: "nairobi",
  UG: "nairobi",
  TZ: "nairobi",
  RW: "nairobi",
  NG: "nairobi",
  GH: "nairobi",
  ET: "nairobi",
  ZA: "capetown",
  ZW: "capetown",
  ZM: "capetown",
  BW: "capetown",
  NA: "capetown",
  MZ: "capetown",

  // Turkey — region: Istanbul (sits between EU + MEA)
  TR: "istanbul",
};

const REGION_TO_HOSTNAME: Record<string, string> = {
  cairo: "sgtx-cairo-01.sovereign.sgtx.io",
  dubai: "sgtx-dubai-01.sovereign.sgtx.io",
  frankfurt: "sgtx-frankfurt-01.sovereign.sgtx.io",
  singapore: "sgtx-singapore-01.sovereign.sgtx.io",
  mumbai: "sgtx-mumbai-01.sovereign.sgtx.io",
  shanghai: "sgtx-shanghai-01.sovereign.sgtx.io",
  saopaulo: "sgtx-saopaulo-01.sovereign.sgtx.io",
  virginia: "sgtx-virginia-01.sovereign.sgtx.io",
  nairobi: "sgtx-nairobi-01.sovereign.sgtx.io",
  capetown: "sgtx-capetown-01.sovereign.sgtx.io",
  istanbul: "sgtx-istanbul-01.sovereign.sgtx.io",
};

const REGION_TO_COUNTRY: Record<string, string> = {
  cairo: "EG",
  dubai: "AE",
  frankfurt: "DE",
  singapore: "SG",
  mumbai: "IN",
  shanghai: "CN",
  saopaulo: "BR",
  virginia: "US",
  nairobi: "KE",
  capetown: "ZA",
  istanbul: "TR",
};

const REGION_LEGAL_SYSTEM: Record<string, string> = {
  cairo: "Civil Law (Egypt)",
  dubai: "Civil Law (UAE)",
  frankfurt: "Civil Law (Germany)",
  singapore: "Common Law (Singapore)",
  mumbai: "Common Law (India)",
  shanghai: "Civil Law (China)",
  saopaulo: "Civil Law (Brazil)",
  virginia: "Common Law (United States)",
  nairobi: "Common Law (Kenya)",
  capetown: "Mixed (South Africa — Roman-Dutch + Common Law)",
  istanbul: "Civil Law (Turkey)",
};

const REGION_SUPERVISORY_AUTHORITY: Record<string, string> = {
  cairo: "FRA (Financial Regulatory Authority) + NTRA",
  dubai: "DFSA (Dubai Financial Services Authority)",
  frankfurt: "BaFin (Federal Financial Supervisory Authority)",
  singapore: "MAS (Monetary Authority of Singapore)",
  mumbai: "RBI (Reserve Bank of India) + SEBI",
  shanghai: "PBOC (People's Bank of China) + CBIRC",
  saopaulo: "BACEN (Central Bank of Brazil) + CVM",
  virginia: "OCC + Federal Reserve + SEC",
  nairobi: "CBK (Central Bank of Kenya) + CMA",
  capetown: "SARB (South African Reserve Bank) + FSCA",
  istanbul: "BDDK (Banking Regulation and Supervision Agency)",
};

const REGION_DATA_RESIDENCY: Record<
  string,
  { classification: string; dataLocalizationRequired: boolean; crossBorderTransferAllowed: boolean; retentionDays: number }
> = {
  cairo: { classification: "PDPL_EG", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 1825 },
  dubai: { classification: "DEFAULT", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2190 },
  frankfurt: { classification: "EU_GDPR", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2555 },
  singapore: { classification: "PDPA_SG", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2190 },
  mumbai: { classification: "DEFAULT", dataLocalizationRequired: true, crossBorderTransferAllowed: false, retentionDays: 2555 },
  shanghai: { classification: "PIPL_CN", dataLocalizationRequired: true, crossBorderTransferAllowed: false, retentionDays: 2555 },
  saopaulo: { classification: "LGPD_BR", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2555 },
  virginia: { classification: "CCPA_US", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2555 },
  nairobi: { classification: "DEFAULT", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2190 },
  capetown: { classification: "POPIA_ZA", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2555 },
  istanbul: { classification: "DEFAULT", dataLocalizationRequired: false, crossBorderTransferAllowed: true, retentionDays: 2555 },
};

// ── Default latency from each region to Cairo (primary), in ms ──────────────
const REGION_LATENCY_TO_PRIMARY_MS: Record<string, number> = {
  cairo: 0,
  dubai: 12,
  frankfurt: 38,
  singapore: 165,
  mumbai: 142,
  shanghai: 198,
  saopaulo: 215,
  virginia: 105,
  nairobi: 88,
  capetown: 175,
  istanbul: 24,
};

// ── In-memory registry of sovereign nodes (mutable for deploy) ──────────────

const NODES: Map<string, SovereignNode> = new Map();

function seedDefaultNodes(): void {
  if (NODES.size > 0) return;
  const now = Date.now();
  const defaultRegions: Array<{ region: string; role: SovereignNode["role"]; status: SovereignNode["status"]; cpu: number; mem: number; disk: number; net: number }> = [
    { region: "cairo", role: "primary", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "dubai", role: "secondary", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "frankfurt", role: "tertiary", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "singapore", role: "regional", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "mumbai", role: "regional", status: "OPERATIONAL", cpu: 96, mem: 384, disk: 6, net: 80 },
    { region: "shanghai", role: "regional", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "saopaulo", role: "regional", status: "OPERATIONAL", cpu: 96, mem: 384, disk: 6, net: 80 },
    { region: "virginia", role: "regional", status: "OPERATIONAL", cpu: 128, mem: 512, disk: 8, net: 100 },
    { region: "nairobi", role: "regional", status: "OPERATIONAL", cpu: 64, mem: 256, disk: 4, net: 40 },
    { region: "capetown", role: "regional", status: "OPERATIONAL", cpu: 64, mem: 256, disk: 4, net: 40 },
    { region: "istanbul", role: "regional", status: "OPERATIONAL", cpu: 96, mem: 384, disk: 6, net: 80 },
  ];

  for (const r of defaultRegions) {
    const region = r.region;
    const nodeId = `NODE-${region.toUpperCase()}-01`;
    const hostname = REGION_TO_HOSTNAME[region] || `sgtx-${region}-01.sovereign.sgtx.io`;
    NODES.set(nodeId, {
      id: nodeId,
      hostname,
      region,
      country: REGION_TO_COUNTRY[region] || "—",
      role: r.role,
      status: r.status,
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: r.cpu,
      memoryGb: r.mem,
      diskTb: r.disk,
      networkGbps: r.net,
      latencyToPrimaryMs: REGION_LATENCY_TO_PRIMARY_MS[region] ?? 999,
      lastHeartbeatAt: new Date(now - 5000).toISOString(),
      endpoints: {
        api: `https://${hostname}/api`,
        ws: `wss://${hostname}/ws`,
        nats: `nats://${hostname}:4222`,
        postgres: `postgres://${hostname}:5432`,
      },
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns all sovereign nodes (regional deployments). The Cairo node is the
 * primary. The Dubai node is the secondary. The Frankfurt node is the tertiary.
 * All others are regional nodes for their respective regions.
 */
export function getSovereignNodes(): SovereignNode[] {
  try {
    seedDefaultNodes();
    return Array.from(NODES.values()).sort((a, b) => {
      // Sort by role priority (primary first), then by region name
      const rolePriority: Record<string, number> = { primary: 0, secondary: 1, tertiary: 2, regional: 3, witness: 4 };
      const ra = rolePriority[a.role] ?? 99;
      const rb = rolePriority[b.role] ?? 99;
      if (ra !== rb) return ra - rb;
      return a.region.localeCompare(b.region);
    });
  } catch (err: any) {
    logger.error("[sovereign-nodes] getSovereignNodes failed", { error: err?.message });
    return [];
  }
}

/**
 * Find the nearest sovereign node for a country.
 *
 * Looks up the country in the COUNTRY_TO_REGION map. If the country has a
 * dedicated regional node, returns that. If the node is not OPERATIONAL,
 * falls back to the next-nearest node by latency. If the country is not in
 * the map, returns the primary (Cairo) as the default.
 */
export function getNearestSovereignNode(countryCode: string): SovereignNode | null {
  try {
    seedDefaultNodes();
    const code = (countryCode || "").toUpperCase().trim();
    const region = COUNTRY_TO_REGION[code];

    if (!region) {
      // Unknown country — return the primary node (Cairo)
      const primary = Array.from(NODES.values()).find((n) => n.role === "primary");
      return primary || null;
    }

    // Find nodes for that region, sorted by latency to primary (closest first)
    const candidates = Array.from(NODES.values())
      .filter((n) => n.region === region)
      .sort((a, b) => a.latencyToPrimaryMs - b.latencyToPrimaryMs);

    if (candidates.length === 0) {
      // Region has no node — fall back to primary
      const primary = Array.from(NODES.values()).find((n) => n.role === "primary");
      return primary || null;
    }

    // Prefer the first OPERATIONAL node
    const operational = candidates.find((n) => n.status === "OPERATIONAL");
    if (operational) return operational;

    // All region nodes are degraded/maintenance — fall back to the next-nearest
    // operational node globally
    const fallback = Array.from(NODES.values())
      .filter((n) => n.status === "OPERATIONAL")
      .sort((a, b) => a.latencyToPrimaryMs - b.latencyToPrimaryMs);
    return fallback[0] || candidates[0];
  } catch (err: any) {
    logger.error("[sovereign-nodes] getNearestSovereignNode failed", {
      error: err?.message,
      countryCode,
    });
    return null;
  }
}

/**
 * Deploy a new sovereign node (simulated). The node starts in PROVISIONING
 * state, with the provisioned endpoints prepared. The actual provisioning
 * (K3s install, Postgres replica setup, NATS cluster join, HSM partition
 * creation) would take ~30 minutes in production — here we just register the
 * node and mark it as PROVISIONING. The operator can call this API again to
 * flip the status to OPERATIONAL after the install completes.
 *
 * Returns the new node ID + status + endpoints.
 */
export function deploySovereignNode(
  region: string,
  config: {
    country?: string;
    role?: SovereignNode["role"];
    cpuCores?: number;
    memoryGb?: number;
    diskTb?: number;
    networkGbps?: number;
    autoActivate?: boolean;  // if true, deploy as OPERATIONAL immediately (dev only)
  } = {},
): DeploySovereignNodeResult {
  try {
    seedDefaultNodes();
    const r = (region || "").toLowerCase().trim();
    if (!r) {
      return {
        nodeId: "",
        status: "FAILED",
        endpoints: { api: "", ws: "", nats: "", postgres: "" },
        message: "region is required",
      };
    }

    // Generate a node ID. If a node already exists for the region, append
    // a numeric suffix.
    let nodeId = `NODE-${r.toUpperCase()}-01`;
    let suffix = 1;
    while (NODES.has(nodeId)) {
      suffix++;
      nodeId = `NODE-${r.toUpperCase()}-${String(suffix).padStart(2, "0")}`;
    }

    const hostname = REGION_TO_HOSTNAME[r] || `sgtx-${r}-01.sovereign.sgtx.io`;
    const country = config.country || REGION_TO_COUNTRY[r] || "—";
    const role = config.role || "regional";
    const status: SovereignNode["status"] = config.autoActivate ? "OPERATIONAL" : "PROVISIONING";

    const endpoints = {
      api: `https://${hostname}/api`,
      ws: `wss://${hostname}/ws`,
      nats: `nats://${hostname}:4222`,
      postgres: `postgres://${hostname}:5432`,
    };

    const node: SovereignNode = {
      id: nodeId,
      hostname,
      region: r,
      country,
      role,
      status,
      k3sVersion: "v1.31.0+k3s1",
      cpuCores: config.cpuCores ?? 128,
      memoryGb: config.memoryGb ?? 512,
      diskTb: config.diskTb ?? 8,
      networkGbps: config.networkGbps ?? 100,
      latencyToPrimaryMs: REGION_LATENCY_TO_PRIMARY_MS[r] ?? 999,
      lastHeartbeatAt: new Date().toISOString(),
      endpoints,
    };

    NODES.set(nodeId, node);

    logger.info("[sovereign-nodes] deployed new node", {
      nodeId,
      region: r,
      country,
      role,
      status,
    });

    return {
      nodeId,
      status,
      endpoints,
      message: config.autoActivate
        ? `Node ${nodeId} deployed + auto-activated (dev mode). Provisioning time: ~0s (simulated).`
        : `Node ${nodeId} deployed in PROVISIONING state. Estimated time to OPERATIONAL: ~30 minutes (K3s install + Postgres replica setup + NATS cluster join + HSM partition creation).`,
    };
  } catch (err: any) {
    logger.error("[sovereign-nodes] deploySovereignNode failed", { error: err?.message, region });
    return {
      nodeId: "",
      status: "FAILED",
      endpoints: { api: "", ws: "", nats: "", postgres: "" },
      message: err?.message || "internal error",
    };
  }
}

/**
 * Get the capabilities of a sovereign node — what USTNs it can issue/verify,
 * its jurisdiction (country, region, legal system, supervisory authority),
 * and its data residency profile.
 *
 * Defaults: every node can issue + verify USTNs (full mutual recognition
 * model per Phase 4). Recognized nodes = all currently-deployed node IDs.
 */
export function getNodeCapabilities(nodeId: string): SovereignNodeCapabilities | null {
  try {
    seedDefaultNodes();
    const node = NODES.get(nodeId);
    if (!node) return null;

    const region = node.region;
    const residency = REGION_DATA_RESIDENCY[region] || {
      classification: "DEFAULT",
      dataLocalizationRequired: false,
      crossBorderTransferAllowed: true,
      retentionDays: 2190,
    };

    return {
      nodeId: node.id,
      ustnRecognition: {
        canIssue: true,
        canVerify: true,
        recognizedNodes: Array.from(NODES.keys()),
      },
      jurisdiction: {
        country: node.country,
        region,
        legalSystem: REGION_LEGAL_SYSTEM[region] || "Mixed",
        supervisoryAuthority: REGION_SUPERVISORY_AUTHORITY[region] || "—",
      },
      dataResidency: {
        classification: residency.classification as any,
        dataLocalizationRequired: residency.dataLocalizationRequired,
        crossBorderTransferAllowed: residency.crossBorderTransferAllowed,
        retentionDays: residency.retentionDays,
      },
    };
  } catch (err: any) {
    logger.error("[sovereign-nodes] getNodeCapabilities failed", { error: err?.message, nodeId });
    return null;
  }
}

// ── Test helper: reset (only used by tests / dev) ────────────────────────────
export function _resetSovereignNodes(): void {
  NODES.clear();
}
