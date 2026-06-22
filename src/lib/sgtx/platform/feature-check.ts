// SGTX Platform Feature Toggle Helper
// Allows Platform Admin to activate/deactivate core features for maintenance/upgrades.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { freshDb } from "@/lib/db-fresh";

const _db = (freshDb ?? db) as typeof db;

// In-memory cache (5 minute TTL in production, 2 seconds in dev for faster
// feedback during HMR). We stash the cache on `globalThis` so that multiple
// module instances created by Next.js dev-mode HMR share a single source of
// truth — otherwise toggling a feature in one module instance wouldn't
// invalidate the cache in another.
const CACHE_KEY = "__sgtxFeatureToggleCache";
type FeatureCache = { data: Record<string, boolean>; expiresAt: number };

function getCacheStore(): FeatureCache {
  if (!(globalThis as any)[CACHE_KEY]) {
    (globalThis as any)[CACHE_KEY] = { data: {}, expiresAt: 0 } as FeatureCache;
  }
  return (globalThis as any)[CACHE_KEY] as FeatureCache;
}

const IS_DEV = process.env.NODE_ENV !== "production";
const CACHE_TTL_MS = IS_DEV ? 2_000 : 300_000; // 2s dev / 5min prod

async function loadCache(): Promise<Record<string, boolean>> {
  const cache = getCacheStore();
  const now = Date.now();
  if (cache.expiresAt > now) return cache.data;
  try {
    const toggles = await _db.platformFeatureToggle.findMany({ select: { featureKey: true, isActive: true } });
    cache.data = {};
    for (const t of toggles) cache.data[t.featureKey] = t.isActive;
    cache.expiresAt = now + CACHE_TTL_MS;
  } catch {
    // If DB fails, assume all features are active (fail-open for platform availability)
    cache.data = {};
    cache.expiresAt = now + 60_000;
  }
  return cache.data;
}

export function invalidateFeatureCache() {
  const cache = getCacheStore();
  cache.expiresAt = 0;
  cache.data = {};
}

export async function isFeatureActive(featureKey: string): Promise<boolean> {
  const features = await loadCache();
  // If feature not in DB, assume active (fail-open)
  return features[featureKey] !== false;
}

export async function requireFeature(featureKey: string): Promise<void> {
  const active = await isFeatureActive(featureKey);
  if (!active) {
    throw new Error(`Feature "${featureKey}" is currently deactivated by the Platform Administrator.`);
  }
}

// Returns a NextResponse (503) if the feature is deactivated, or null if active.
// Usage: const gate = await featureGateResponse("financing"); if (gate) return gate;
export async function featureGateResponse(featureKey: string): Promise<NextResponse | null> {
  const active = await isFeatureActive(featureKey);
  if (!active) {
    return NextResponse.json(
      {
        error: `Feature "${featureKey}" is currently deactivated by the Platform Administrator.`,
        featureKey,
      },
      { status: 503 },
    );
  }
  return null;
}

// Feature definitions
export const PLATFORM_FEATURES: { key: string; name: string; category: string; canDeactivate: boolean }[] = [
  // CORE (cannot deactivate)
  { key: "trade_request", name: "Trade Request", category: "CORE", canDeactivate: false },
  { key: "quote_submission", name: "Quote Submission", category: "CORE", canDeactivate: false },
  { key: "contract_signing", name: "Contract Signing", category: "CORE", canDeactivate: false },
  { key: "payment", name: "Payment & FeeLock", category: "CORE", canDeactivate: false },
  { key: "milestone_tracking", name: "Milestone Tracking", category: "CORE", canDeactivate: false },
  { key: "settlement", name: "Settlement", category: "CORE", canDeactivate: false },
  // FINANCE
  { key: "financing", name: "Trade Financing", category: "FINANCE", canDeactivate: true },
  { key: "trade_finance", name: "Trade Finance (RFQ)", category: "FINANCE", canDeactivate: true },
  { key: "defi", name: "DeFi Protocol", category: "FINANCE", canDeactivate: true },
  // LOGISTICS
  { key: "distressed_cargo", name: "Distressed Cargo", category: "LOGISTICS", canDeactivate: true },
  { key: "roro_corridors", name: "RoRo Corridors (TCN)", category: "LOGISTICS", canDeactivate: true },
  { key: "digital_twin", name: "Trade Digital Twin", category: "LOGISTICS", canDeactivate: true },
  { key: "barcodes", name: "Barcode Generation", category: "LOGISTICS", canDeactivate: true },
  // COMPLIANCE
  { key: "disputes", name: "Dispute Resolution", category: "COMPLIANCE", canDeactivate: true },
  { key: "pdpl", name: "PDPL Compliance", category: "COMPLIANCE", canDeactivate: true },
  { key: "trade_memory", name: "Trade Memory Layer", category: "COMPLIANCE", canDeactivate: true },
  // SECURITY
  { key: "self_healing", name: "Self-Healing Infrastructure", category: "SECURITY", canDeactivate: true },
  { key: "pentest", name: "Automated Pentesting", category: "SECURITY", canDeactivate: true },
  // AI
  { key: "gnn_risk", name: "GNN Risk Engine", category: "AI", canDeactivate: true },
  { key: "causal_inference", name: "Causal Inference Engine", category: "AI", canDeactivate: true },
  { key: "federated_learning", name: "Federated Learning", category: "AI", canDeactivate: true },
  // ADDON
  { key: "pqc", name: "Post-Quantum Cryptography", category: "ADDON", canDeactivate: true },
  { key: "zk_proofs", name: "Zero-Knowledge Proofs", category: "ADDON", canDeactivate: true },
  { key: "marketplace", name: "Marketplace Partner", category: "ADDON", canDeactivate: true },
  { key: "sandbox", name: "Sandbox Environment", category: "ADDON", canDeactivate: true },
  { key: "courier_tracking", name: "Courier Tracking", category: "ADDON", canDeactivate: true },
  { key: "gtid_chat", name: "GTID Chat", category: "ADDON", canDeactivate: true },
];

export async function seedFeatureToggles() {
  let created = 0;
  for (const feat of PLATFORM_FEATURES) {
    const existing = await _db.platformFeatureToggle.findUnique({ where: { featureKey: feat.key } });
    if (!existing) {
      await _db.platformFeatureToggle.create({
        data: {
          featureKey: feat.key,
          featureName: feat.name,
          featureCategory: feat.category,
          isActive: true,
          canDeactivate: feat.canDeactivate,
        },
      });
      created++;
    }
  }
  invalidateFeatureCache();
  return { ok: true, created, total: PLATFORM_FEATURES.length };
}
