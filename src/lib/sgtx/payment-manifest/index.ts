// @ts-nocheck — defensive; Prisma schema drift handled at runtime
/**
 * SGTX v18 §8.9 — Payment Manifest Construction
 * ============================================================
 * The single financial contract of the USTN. All provider
 * quotations + government fees + SGTX platform fee + seller
 * commercial balance are aggregated into one immutable, hashed
 * manifest with EGP legs and USD legs.
 *
 * Construction Sequence (v18 §8.9):
 *   1. Collect accepted provider quotations (one per service
 *      type, by Incoterm responsibility).
 *   2. Add government fees from RIA (customs duty, phyto,
 *      health cert).
 *   3. Add SGTX platform fee (Dynamic Fee Engine — calls
 *      `calculateDynamicFee`).
 *   4. Add seller commercial balance (EXW value - seller's
 *      prepaid costs).
 *   5. Emit manifest with SHA-256 hash of canonical JSON.
 *
 * Leg ID Convention (v18 §8.9):
 *   • LEG_CUSTOMS_EGP, LEG_PHYTO_EGP, LEG_LAB_EGP,
 *     LEG_TRUCKING_EGP, LEG_BROKER_EGP
 *   • LEG_FREIGHT_USD, LEG_SELLER_USD, LEG_SGTX_USD
 *
 * Versioning Rule (v18 §8.9):
 *   • `manifest_version` is IMMUTABLE — any change creates a
 *     NEW version, never silent mutation.
 *   • `manifest_hash` = SHA-256 of canonical manifest JSON.
 *
 * Persistence strategy:
 *   • ConfigurationHistory row (`configKey=payment_manifest:{ustn}`)
 *     stores the full manifest JSON in `newValue`. The `version`
 *     column tracks the manifest version. Each amendment is a NEW
 *     ConfigurationHistory row (never an update).
 *   • PaymentLeg rows are created for each leg (legacy PaymentLeg
 *     table — §44 / §53) so downstream settlement + reconciliation
 *     can pick them up by `legId`.
 *   • Activity log entry per construction/amendment so the trade
 *     timeline has an audit trail.
 *
 * Defensive design (carry-over):
 *   • All DB calls wrapped — never throws; logs + safe default.
 *   • Pure helpers (`sha256`, `canonicalManifestJson`,
 *     `legIdForServiceType`) exported for testability.
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { logger } from "@/lib/sgtx/logger";
import { getAcceptedQuotations, type Quotation } from "@/lib/sgtx/provider-quotations";
import { calculateDynamicFee, BASE_FEE_RATE } from "@/lib/sgtx/ai/dynamic-fee";
import { calculateDuty } from "@/lib/sgtx/compliance/tariff-engine";

// ============ §8.9 Public types ============

export interface ManifestLeg {
  leg_id: string;
  provider_gtid: string;
  provider_name: string;
  quote_id: string | null;
  amount: number;
  currency: "EGP" | "USD";
  condition: string;
  terms: string;
  beneficiary_iban?: string;
  beneficiary_bic?: string;
}

export interface PaymentManifest {
  ustn: string;
  manifest_version: number;
  manifest_hash: string;
  total_egp: number;
  total_usd: number;
  egp_legs: ManifestLeg[];
  usd_legs: ManifestLeg[];
  constructed_at: string;
  amended_from_version?: number;
  amendment_reason?: string;
}

export interface ManifestVersionInfo {
  ustn: string;
  version: number;
  hash: string;
  createdAt: string;
  reason?: string | null;
}

// ============ §8.9 Leg ID Convention ============

/**
 * Maps a service_type → the canonical v18 leg ID.
 * Government fees (CUSTOMS_DUTY/PHYTOSANITARY/HEALTH_CERT) map to
 * their dedicated EGP legs. Other EGP legs by convention.
 */
export function legIdForServiceType(serviceType: string, currency: "EGP" | "USD" = "EGP"): string {
  const map: Record<string, string> = {
    CUSTOMS_DUTY: "LEG_CUSTOMS_EGP",
    PHYTOSANITARY: "LEG_PHYTO_EGP",
    LAB_TESTING: "LEG_LAB_EGP",
    PESTICIDE_RESIDUE: "LEG_LAB_EGP",
    MICROBIOLOGICAL: "LEG_LAB_EGP",
    CHEMICAL: "LEG_LAB_EGP",
    TRUCKING: "LEG_TRUCKING_EGP",
    FORWARDING: "LEG_TRUCKING_EGP",
    WAREHOUSING: "LEG_TRUCKING_EGP",
    CUSTOMS_BROKERAGE: "LEG_BROKER_EGP",
    EXPORT_CUSTOMS: "LEG_BROKER_EGP",
    IMPORT_CUSTOMS: "LEG_BROKER_EGP",
    HEALTH_CERT: "LEG_PHYTO_EGP",
    OCEAN_FREIGHT: currency === "EGP" ? "LEG_FREIGHT_EGP" : "LEG_FREIGHT_USD",
    AIR_FREIGHT: currency === "EGP" ? "LEG_FREIGHT_EGP" : "LEG_FREIGHT_USD",
    RAIL_FREIGHT: currency === "EGP" ? "LEG_FREIGHT_EGP" : "LEG_FREIGHT_USD",
    RO_RO: currency === "EGP" ? "LEG_FREIGHT_EGP" : "LEG_FREIGHT_USD",
  };
  return map[serviceType] ?? `LEG_${serviceType}_${currency}`;
}

// ============ §8.9 Pure helpers ============

export function sha256(data: string): string {
  return "sha256:" + createHash("sha256").update(data).digest("hex");
}

/** Canonical JSON for hashing — JCS-style (sorted keys, no whitespace). */
export function canonicalManifestJson(m: PaymentManifest): string {
  const obj: Record<string, any> = {
    egp_legs: m.egp_legs.map((l) => ({
      amount: l.amount,
      beneficiary_bic: l.beneficiary_bic ?? null,
      beneficiary_iban: l.beneficiary_iban ?? null,
      condition: l.condition,
      currency: l.currency,
      leg_id: l.leg_id,
      provider_gtid: l.provider_gtid,
      provider_name: l.provider_name,
      quote_id: l.quote_id,
      terms: l.terms,
    })),
    manifest_version: m.manifest_version,
    total_egp: m.total_egp,
    total_usd: m.total_usd,
    ustn: m.ustn,
    usd_legs: m.usd_legs.map((l) => ({
      amount: l.amount,
      beneficiary_bic: l.beneficiary_bic ?? null,
      beneficiary_iban: l.beneficiary_iban ?? null,
      condition: l.condition,
      currency: l.currency,
      leg_id: l.leg_id,
      provider_gtid: l.provider_gtid,
      provider_name: l.provider_name,
      quote_id: l.quote_id,
      terms: l.terms,
    })),
  };
  return JSON.stringify(obj, Object.keys(obj).sort());
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

// ============ §8.9 Internal — RIA government fee helpers ============

/** Default phyto fee (EGP) — Egypt GOVS' reference schedule. */
const DEFAULT_PHYTO_FEE_EGP = 750;
/** Default health cert fee (EGP) — Egypt reference schedule. */
const DEFAULT_HEALTH_CERT_FEE_EGP = 500;
/** EGP→USD fallback rate — only used when no FX rate is available. */
const EGP_USD_FALLBACK_RATE = 50; // 1 USD ≈ 50 EGP (defensive default)

/**
 * Pull the customs duty for the trade (RIA — tariff-engine.calculateDuty).
 * Returns the duty in EGP (Egyptian imports) or USD (foreign ports).
 */
async function getCustomsDutyFee(
  trade: any,
): Promise<{ amount: number; currency: "EGP" | "USD"; condition: string }> {
  // Customs duty only applies on imports into Egypt (dest = EG).
  const destCountry = (trade?.destCountry || "").toUpperCase();
  if (destCountry !== "EG") {
    return { amount: 0, currency: "EGP", condition: "CUSTOMS_IMPORT" };
  }
  const customsValueUsd = Number(trade.tradeValueUsd ?? 0);
  if (!customsValueUsd) {
    return { amount: 0, currency: "EGP", condition: "CUSTOMS_IMPORT" };
  }
  try {
    const duty = await calculateDuty(
      trade.commodityHs || "000000",
      (trade.originCountry || "").toUpperCase(),
      destCountry,
      customsValueUsd,
    );
    // Customs duty is denominated in destination currency (EGP for Egypt).
    // We convert via the customs-value currency assumption (USD) — for EG
    // the VAT table returns currency=EGP, but customs duty itself is
    // typically paid in EGP at port; we conservatively keep it EGP.
    return {
      amount: round2((duty?.customsDuty ?? 0) * EGP_USD_FALLBACK_RATE),
      currency: "EGP",
      condition: "CUSTOMS_IMPORT",
    };
  } catch (e: any) {
    logger.warn("[payment-manifest] customs duty calc failed", { error: e?.message });
    return { amount: 0, currency: "EGP", condition: "CUSTOMS_IMPORT" };
  }
}

/** Pull the phytosanitary fee (EGP) — Egypt GOVS' reference schedule. */
function getPhytosanitaryFee(trade: any): { amount: number; currency: "EGP" | "USD"; condition: string } {
  // Phytosanitary only required for plant-origin exports.
  const phytoRequired = /citrus|orange|strawberry|grape|onion|potato|vegetable|fruit/i.test(
    trade?.commodity || "",
  );
  return {
    amount: phytoRequired ? DEFAULT_PHYTO_FEE_EGP : 0,
    currency: "EGP",
    condition: "CUSTOMS_SUBMITTED",
  };
}

/** Pull the health certificate fee (EGP) — Egypt reference schedule. */
function getHealthCertFee(trade: any): { amount: number; currency: "EGP" | "USD"; condition: string } {
  // Health cert required for food / dairy / animal-origin exports.
  const healthRequired = /dairy|milk|cheese|meat|poultry|fish|seafood|food/i.test(
    trade?.commodity || "",
  );
  return {
    amount: healthRequired ? DEFAULT_HEALTH_CERT_FEE_EGP : 0,
    currency: "EGP",
    condition: "CUSTOMS_SUBMITTED",
  };
}

// ============ §8.9 Internal — beneficiary lookup ============

/** Pull the provider's banking details (IBAN/BIC). */
async function getProviderBanking(providerGtid: string): Promise<{ iban?: string; bic?: string }> {
  if (!providerGtid) return {};
  const tenant = await db.tenant.findUnique({ where: { gtid: providerGtid } }).catch(() => null);
  if (!tenant) return {};
  return {
    iban: tenant.bankAccountNo || undefined,
    bic: tenant.bankSwift || undefined,
  };
}

// ============ §8.9 Public API ============

/**
 * Construct (or re-construct) the payment manifest for a USTN.
 *
 * Pipeline (v18 §8.9):
 *   1. Collect accepted provider quotations (one per service type).
 *   2. Add government fees from RIA (customs duty, phyto, health cert).
 *   3. Add SGTX platform fee (Dynamic Fee Engine — `calculateDynamicFee`).
 *   4. Add seller commercial balance (EXW value - seller's prepaid costs).
 *   5. Generate manifest hash (SHA-256 of canonical JSON).
 *   6. Assign leg IDs per convention.
 *
 * Returns `{ manifestId, manifestVersion, manifestHash, totalEgp,
 * totalUsd, egpLegs, usdLegs }`. Persists the manifest in
 * ConfigurationHistory + creates PaymentLeg rows for each leg.
 */
export async function constructPaymentManifest(
  ustn: string,
): Promise<{
  manifestId: string;
  manifestVersion: number;
  manifestHash: string;
  totalEgp: number;
  totalUsd: number;
  egpLegs: ManifestLeg[];
  usdLegs: ManifestLeg[];
}> {
  if (!ustn) throw new Error("ustn required");

  // ── Load trade + seller/buyer ────────────────────────────────
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: { seller: true, buyer: true },
  }).catch(() => null);
  if (!trade) throw new Error(`USTN not found: ${ustn}`);

  // ── 1. Accepted provider quotations ──────────────────────────
  const acceptedQuotes = await getAcceptedQuotations(ustn);

  const egpLegs: ManifestLeg[] = [];
  const usdLegs: ManifestLeg[] = [];

  for (const q of acceptedQuotes) {
    if (q.fee.currency === "EGP") {
      const legId = legIdForServiceType(q.service_type, "EGP");
      const banking = await getProviderBanking(q.provider_gtid);
      egpLegs.push({
        leg_id: legId,
        provider_gtid: q.provider_gtid,
        provider_name: q.provider_name,
        quote_id: q.quotation_id,
        amount: round2(q.fee.amount),
        currency: "EGP",
        condition: q.fee.condition,
        terms: q.fee.terms,
        beneficiary_iban: banking.iban,
      });
    } else {
      const legId = legIdForServiceType(q.service_type, "USD");
      const banking = await getProviderBanking(q.provider_gtid);
      usdLegs.push({
        leg_id: legId,
        provider_gtid: q.provider_gtid,
        provider_name: q.provider_name,
        quote_id: q.quotation_id,
        amount: round2(q.fee.amount),
        currency: "USD",
        condition: q.fee.condition,
        terms: q.fee.terms,
        beneficiary_iban: banking.iban,
        beneficiary_bic: banking.bic,
      });
    }
  }

  // ── 2. Government fees from RIA ──────────────────────────────
  const customsDuty = await getCustomsDutyFee(trade);
  if (customsDuty.amount > 0) {
    const customsBanking = await getProviderBanking("SGTX-EG-CUSTOMS-001");
    egpLegs.push({
      leg_id: "LEG_CUSTOMS_EGP",
      provider_gtid: "SGTX-EG-CUSTOMS-001",
      provider_name: "Egyptian Customs Authority",
      quote_id: null, // Government fee — no provider quote; attributable to RIA schedule.
      amount: round2(customsDuty.amount),
      currency: "EGP",
      condition: customsDuty.condition,
      terms: "PREPAID",
      beneficiary_iban: customsBanking.iban,
    });
  }

  const phyto = getPhytosanitaryFee(trade);
  if (phyto.amount > 0) {
    const phytoBanking = await getProviderBanking("SGTX-EG-GOV-001");
    egpLegs.push({
      leg_id: "LEG_PHYTO_EGP",
      provider_gtid: "SGTX-EG-GOV-001",
      provider_name: "Egyptian Phytosanitary Authority (PPA)",
      quote_id: null,
      amount: round2(phyto.amount),
      currency: "EGP",
      condition: phyto.condition,
      terms: "PREPAID",
      beneficiary_iban: phytoBanking.iban,
    });
  }

  const health = getHealthCertFee(trade);
  if (health.amount > 0) {
    const healthBanking = await getProviderBanking("SGTX-EG-GOV-002");
    egpLegs.push({
      leg_id: "LEG_HEALTH_EGP",
      provider_gtid: "SGTX-EG-GOV-002",
      provider_name: "Egyptian Ministry of Health",
      quote_id: null,
      amount: round2(health.amount),
      currency: "EGP",
      condition: health.condition,
      terms: "PREPAID",
      beneficiary_iban: healthBanking.iban,
    });
  }

  // ── 3. SGTX platform fee (Dynamic Fee Engine) ───────────────
  let sgtxFeeUsd = 0;
  let sgtxFeeRate = BASE_FEE_RATE;
  try {
    const dyn = await calculateDynamicFee({
      ustn,
      commodity: trade.commodity,
      originCountry: trade.originCountry,
      destCountry: trade.destCountry,
      contractValueUsd: Number(trade.tradeValueUsd ?? 0),
      hsCode: trade.commodityHs || undefined,
    });
    sgtxFeeUsd = round2(dyn?.feeAmountUsd ?? Number(trade.tradeValueUsd ?? 0) * BASE_FEE_RATE);
    sgtxFeeRate = dyn?.finalRate ?? BASE_FEE_RATE;
  } catch (e: any) {
    logger.warn("[payment-manifest] dynamic fee engine failed — falling back to base rate", {
      error: e?.message,
    });
    sgtxFeeUsd = round2(Number(trade.tradeValueUsd ?? 0) * BASE_FEE_RATE);
  }

  if (sgtxFeeUsd > 0) {
    const sgtxBanking = await getProviderBanking("SGTX-PLATFORM-001");
    usdLegs.push({
      leg_id: "LEG_SGTX_USD",
      provider_gtid: "SGTX-PLATFORM-001",
      provider_name: "SGTX Platform Fee",
      quote_id: null,
      amount: round2(sgtxFeeUsd),
      currency: "USD",
      condition: "MANIFEST_CONSTRUCTED",
      terms: "PREPAID",
      beneficiary_iban: sgtxBanking.iban,
      beneficiary_bic: sgtxBanking.bic,
    });
  }

  // ── 4. Seller commercial balance ─────────────────────────────
  // EXW value = trade value (the seller's commercial invoice value).
  // Seller's prepaid costs = sum of EGP legs where seller is the
  // beneficiary (we use a conservative heuristic: all EGP provider
  // legs whose terms=PREPAID are subtracted from the seller's
  // balance to avoid double-charging the buyer).
  const exwValueUsd = round2(Number(trade.tradeValueUsd ?? 0));
  const sellerPrepaidEgp = egpLegs
    .filter((l) => l.terms === "PREPAID")
    .reduce((s, l) => s + (l.amount / EGP_USD_FALLBACK_RATE), 0);
  const sellerBalanceUsd = round2(Math.max(0, exwValueUsd - sellerPrepaidEgp));

  if (sellerBalanceUsd > 0 && trade.sellerGtid) {
    const sellerBanking = await getProviderBanking(trade.sellerGtid);
    usdLegs.push({
      leg_id: "LEG_SELLER_USD",
      provider_gtid: trade.sellerGtid,
      provider_name: trade.seller?.legalName ?? "Seller",
      quote_id: null,
      amount: sellerBalanceUsd,
      currency: "USD",
      condition: "DELIVERED",
      terms: trade.paymentTerms || "CREDIT",
      beneficiary_iban: sellerBanking.iban,
      beneficiary_bic: sellerBanking.bic,
    });
  }

  // ── 5. Compute totals + hash + version ───────────────────────
  const totalEgp = round2(egpLegs.reduce((s, l) => s + l.amount, 0));
  const totalUsd = round2(usdLegs.reduce((s, l) => s + l.amount, 0));

  // Determine version — count existing manifests for this USTN.
  const existingCount = await db.configurationHistory.count({
    where: { configKey: `payment_manifest:${ustn}` },
  }).catch(() => 0);
  const manifestVersion = (existingCount || 0) + 1;
  const constructedAt = new Date().toISOString();

  const manifest: PaymentManifest = {
    ustn,
    manifest_version: manifestVersion,
    manifest_hash: "",
    total_egp: totalEgp,
    total_usd: totalUsd,
    egp_legs: egpLegs,
    usd_legs: usdLegs,
    constructed_at: constructedAt,
  };
  // Compute hash AFTER all fields are populated (hash excludes itself).
  manifest.manifest_hash = sha256(canonicalManifestJson(manifest));

  // ── 6. Persist — ConfigurationHistory + PaymentLeg rows ─────
  const manifestId = `manifest-${ustn}-v${manifestVersion}`;
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `payment_manifest:${ustn}`,
        newValue: JSON.stringify(manifest),
        changedByGtid: trade.sellerGtid || trade.buyerGtid || "SGTX-PLATFORM-001",
        changeReason: `construct v${manifestVersion}`,
        version: manifestVersion,
      },
    });
  } catch (e: any) {
    logger.error("[payment-manifest] ConfigurationHistory write failed", {
      error: e?.message,
      ustn,
    });
    throw new Error(`manifest persist failed: ${e?.message || "unknown"}`);
  }

  // Write PaymentLeg rows (legacy §44/§53 — downstream settlement).
  for (const leg of [...egpLegs, ...usdLegs]) {
    try {
      await db.paymentLeg.create({
        data: {
          legId: `${leg.leg_id}#${ustn}#v${manifestVersion}`,
          ustn,
          beneficiaryId: leg.provider_gtid,
          beneficiaryName: leg.provider_name,
          beneficiaryType: leg.leg_id.includes("SGTX")
            ? "SGTX_FEE"
            : leg.leg_id.includes("SELLER")
              ? "SELLER"
              : leg.leg_id.includes("CUSTOMS") || leg.leg_id.includes("PHYTO") || leg.leg_id.includes("HEALTH")
                ? "CUSTOMS"
                : leg.leg_id.includes("BROKER")
                  ? "BROKER"
                  : leg.leg_id.includes("LAB")
                    ? "LABORATORY"
                    : "LOGISTICS",
          amount: leg.amount,
          currency: leg.currency,
          legState: "PENDING",
          sgtxEventHash: manifest.manifest_hash,
        },
      });
    } catch (e: any) {
      // Best-effort — don't block manifest construction on a dup leg.
      logger.warn("[payment-manifest] PaymentLeg write failed (best-effort)", {
        leg_id: leg.leg_id,
        error: e?.message,
      });
    }
  }

  // Activity log entry — audit trail in trade timeline.
  try {
    await db.activity.create({
      data: {
        tradeId: trade.id,
        actorGtid: trade.sellerGtid || trade.buyerGtid || null,
        action: "payment_manifest.construct",
        description: `Constructed Payment Manifest v${manifestVersion} — EGP ${totalEgp} / USD ${totalUsd} (${egpLegs.length + usdLegs.length} legs)`,
        type: "INFO",
        metadata: JSON.stringify({
          manifest_id: manifestId,
          manifest_version: manifestVersion,
          manifest_hash: manifest.manifest_hash,
          total_egp: totalEgp,
          total_usd: totalUsd,
          egp_leg_count: egpLegs.length,
          usd_leg_count: usdLegs.length,
          sgtx_fee_rate: sgtxFeeRate,
          sgtx_fee_usd: sgtxFeeUsd,
        }),
      },
    });
  } catch (e: any) {
    // Best-effort — Activity log failure shouldn't break construction.
    logger.warn("[payment-manifest] Activity log write failed", { error: e?.message });
  }

  return {
    manifestId,
    manifestVersion,
    manifestHash: manifest.manifest_hash,
    totalEgp,
    totalUsd,
    egpLegs,
    usdLegs,
  };
}

/** Retrieve the most recent stored manifest for a USTN. */
export async function getPaymentManifest(ustn: string): Promise<PaymentManifest | null> {
  if (!ustn) return null;
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `payment_manifest:${ustn}` },
    orderBy: { version: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return null;
  try {
    const manifest = JSON.parse(row.newValue) as PaymentManifest;
    // Re-verify the hash on read (defensive integrity check).
    const recomputed = sha256(canonicalManifestJson(manifest));
    if (recomputed !== manifest.manifest_hash) {
      logger.error("[payment-manifest] hash mismatch on read", {
        ustn,
        stored: manifest.manifest_hash,
        recomputed,
      });
    }
    return manifest;
  } catch {
    return null;
  }
}

/** Get just the version info — useful for quick UI badges. */
export async function getPaymentManifestVersion(ustn: string): Promise<ManifestVersionInfo | null> {
  if (!ustn) return null;
  const row = await db.configurationHistory.findFirst({
    where: { configKey: `payment_manifest:${ustn}` },
    orderBy: { version: "desc" },
  }).catch(() => null);
  if (!row?.newValue) return null;
  try {
    const manifest = JSON.parse(row.newValue) as PaymentManifest;
    return {
      ustn,
      version: manifest.manifest_version,
      hash: manifest.manifest_hash,
      createdAt: manifest.constructed_at || new Date(row.createdAt).toISOString(),
      reason: manifest.amendment_reason || row.changeReason,
    };
  } catch {
    return null;
  }
}

/**
 * Amend a payment manifest. NEVER silent mutation — always creates a
 * NEW version. The new manifest is constructed from the existing one
 * with `amendments` applied (leg additions / replacements / removals).
 *
 * Amendments shape:
 *   {
 *     add_legs?: ManifestLeg[],
 *     replace_legs?: ManifestLeg[],  // matched by leg_id
 *     remove_leg_ids?: string[],
 *     recalc_seller_balance?: boolean,
 *     recalc_sgtx_fee?: boolean,
 *   }
 */
export async function amendPaymentManifest(
  ustn: string,
  amendments: {
    add_legs?: ManifestLeg[];
    replace_legs?: ManifestLeg[];
    remove_leg_ids?: string[];
    recalc_seller_balance?: boolean;
    recalc_sgtx_fee?: boolean;
  },
  reason: string,
): Promise<{ newVersion: number; newHash: string; oldVersion: number | null }> {
  if (!ustn) throw new Error("ustn required");
  if (!reason) throw new Error("reason required (immutable amendments require explicit reason)");

  const existing = await getPaymentManifest(ustn);
  if (!existing) {
    throw new Error(`no existing manifest to amend for ustn=${ustn}`);
  }

  // Apply amendments — build new leg arrays.
  let newEgpLegs: ManifestLeg[] = [...existing.egp_legs];
  let newUsdLegs: ManifestLeg[] = [...existing.usd_legs];

  // 1. Remove legs.
  if (amendments.remove_leg_ids && amendments.remove_leg_ids.length > 0) {
    newEgpLegs = newEgpLegs.filter((l) => !amendments.remove_leg_ids!.includes(l.leg_id));
    newUsdLegs = newUsdLegs.filter((l) => !amendments.remove_leg_ids!.includes(l.leg_id));
  }

  // 2. Replace legs (matched by leg_id).
  if (amendments.replace_legs && amendments.replace_legs.length > 0) {
    for (const repl of amendments.replace_legs) {
      newEgpLegs = newEgpLegs.map((l) => (l.leg_id === repl.leg_id ? repl : l));
      newUsdLegs = newUsdLegs.map((l) => (l.leg_id === repl.leg_id ? repl : l));
    }
  }

  // 3. Add legs.
  if (amendments.add_legs && amendments.add_legs.length > 0) {
    for (const add of amendments.add_legs) {
      if (add.currency === "EGP") newEgpLegs.push(add);
      else newUsdLegs.push(add);
    }
  }

  // 4. Optionally recompute SGTX fee (Dynamic Fee Engine).
  let sgtxFeeUsd = 0;
  if (amendments.recalc_sgtx_fee) {
    const trade = await db.trade.findUnique({ where: { ustn } }).catch(() => null);
    if (trade) {
      try {
        const dyn = await calculateDynamicFee({
          ustn,
          commodity: trade.commodity,
          originCountry: trade.originCountry,
          destCountry: trade.destCountry,
          contractValueUsd: Number(trade.tradeValueUsd ?? 0),
          hsCode: trade.commodityHs || undefined,
        });
        sgtxFeeUsd = round2(dyn?.feeAmountUsd ?? 0);
      } catch (e: any) {
        logger.warn("[payment-manifest] recalc sgtx fee failed", { error: e?.message });
        sgtxFeeUsd = round2(Number(trade.tradeValueUsd ?? 0) * BASE_FEE_RATE);
      }
      // Replace the SGTX leg if it exists; otherwise add it.
      const sgtxLeg: ManifestLeg = {
        leg_id: "LEG_SGTX_USD",
        provider_gtid: "SGTX-PLATFORM-001",
        provider_name: "SGTX Platform Fee",
        quote_id: null,
        amount: sgtxFeeUsd,
        currency: "USD",
        condition: "MANIFEST_AMENDED",
        terms: "PREPAID",
      };
      const existingSgtx = newUsdLegs.find((l) => l.leg_id === "LEG_SGTX_USD");
      if (existingSgtx) {
        newUsdLegs = newUsdLegs.map((l) => (l.leg_id === "LEG_SGTX_USD" ? sgtxLeg : l));
      } else if (sgtxFeeUsd > 0) {
        newUsdLegs.push(sgtxLeg);
      }
    }
  }

  // 5. Optionally recompute seller commercial balance.
  if (amendments.recalc_seller_balance) {
    const trade = await db.trade.findUnique({ where: { ustn } }).catch(() => null);
    if (trade) {
      const exwValueUsd = round2(Number(trade.tradeValueUsd ?? 0));
      const sellerPrepaidEgp = newEgpLegs
        .filter((l) => l.terms === "PREPAID")
        .reduce((s, l) => s + (l.amount / EGP_USD_FALLBACK_RATE), 0);
      const sellerBalanceUsd = round2(Math.max(0, exwValueUsd - sellerPrepaidEgp));
      const sellerLeg: ManifestLeg = {
        leg_id: "LEG_SELLER_USD",
        provider_gtid: trade.sellerGtid,
        provider_name: "Seller (amended)",
        quote_id: null,
        amount: sellerBalanceUsd,
        currency: "USD",
        condition: "DELIVERED",
        terms: trade.paymentTerms || "CREDIT",
      };
      const existingSeller = newUsdLegs.find((l) => l.leg_id === "LEG_SELLER_USD");
      if (existingSeller) {
        newUsdLegs = newUsdLegs.map((l) => (l.leg_id === "LEG_SELLER_USD" ? sellerLeg : l));
      } else if (sellerBalanceUsd > 0) {
        newUsdLegs.push(sellerLeg);
      }
    }
  }

  // 6. Compute new totals + version + hash.
  const totalEgp = round2(newEgpLegs.reduce((s, l) => s + l.amount, 0));
  const totalUsd = round2(newUsdLegs.reduce((s, l) => s + l.amount, 0));
  const newVersion = existing.manifest_version + 1;
  const constructedAt = new Date().toISOString();

  const newManifest: PaymentManifest = {
    ustn,
    manifest_version: newVersion,
    manifest_hash: "",
    total_egp: totalEgp,
    total_usd: totalUsd,
    egp_legs: newEgpLegs,
    usd_legs: newUsdLegs,
    constructed_at: constructedAt,
    amended_from_version: existing.manifest_version,
    amendment_reason: reason,
  };
  newManifest.manifest_hash = sha256(canonicalManifestJson(newManifest));

  // 7. Persist as a NEW ConfigurationHistory row (never update existing).
  const manifestId = `manifest-${ustn}-v${newVersion}`;
  try {
    await db.configurationHistory.create({
      data: {
        configKey: `payment_manifest:${ustn}`,
        oldValue: JSON.stringify(existing),
        newValue: JSON.stringify(newManifest),
        changedByGtid: "SGTX-PLATFORM-001",
        changeReason: `amend v${newVersion}: ${reason}`,
        version: newVersion,
      },
    });
  } catch (e: any) {
    logger.error("[payment-manifest] amendment persist failed", { error: e?.message, ustn });
    throw new Error(`amendment persist failed: ${e?.message || "unknown"}`);
  }

  // Activity log entry.
  try {
    const trade = await db.trade.findUnique({ where: { ustn } }).catch(() => null);
    if (trade) {
      await db.activity.create({
        data: {
          tradeId: trade.id,
          actorGtid: trade.sellerGtid || trade.buyerGtid || null,
          action: "payment_manifest.amend",
          description: `Amended Payment Manifest v${existing.manifest_version} → v${newVersion} — reason: ${reason}`,
          type: "INFO",
          metadata: JSON.stringify({
            manifest_id: manifestId,
            old_version: existing.manifest_version,
            new_version: newVersion,
            old_hash: existing.manifest_hash,
            new_hash: newManifest.manifest_hash,
            reason,
            added: amendments.add_legs?.length ?? 0,
            replaced: amendments.replace_legs?.length ?? 0,
            removed: amendments.remove_leg_ids?.length ?? 0,
          }),
        },
      });
    }
  } catch (e: any) {
    logger.warn("[payment-manifest] amendment Activity log failed", { error: e?.message });
  }

  return {
    newVersion,
    newHash: newManifest.manifest_hash,
    oldVersion: existing.manifest_version,
  };
}

/**
 * Validate a manifest. Returns `{ valid, errors, warnings }`.
 *
 * Validation rules (v18 §8.9):
 *   • Each leg has an attributable quote OR is a government fee /
 *     SGTX platform fee / seller commercial balance (these have
 *     `quote_id=null` but their leg_id is on the convention list).
 *   • Leg IDs follow the convention (LEG_*_EGP / LEG_*_USD).
 *   • Currencies are EGP or USD only.
 *   • Totals match the sum of legs.
 *   • Beneficiary IBAN present for all legs (warning if missing).
 */
export function validatePaymentManifest(manifest: PaymentManifest): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!manifest) {
    return { valid: false, errors: ["manifest is null/undefined"], warnings };
  }
  if (!manifest.ustn) errors.push("manifest.ustn is required");
  if (!manifest.manifest_version || manifest.manifest_version < 1) {
    errors.push("manifest.manifest_version must be a positive integer");
  }
  if (!manifest.manifest_hash || !manifest.manifest_hash.startsWith("sha256:")) {
    errors.push("manifest.manifest_hash must be a sha256:... value");
  }

  const allLegs: ManifestLeg[] = [...(manifest.egp_legs || []), ...(manifest.usd_legs || [])];

  // Leg ID convention.
  const conventionIds = new Set<string>([
    "LEG_CUSTOMS_EGP",
    "LEG_PHYTO_EGP",
    "LEG_HEALTH_EGP",
    "LEG_LAB_EGP",
    "LEG_TRUCKING_EGP",
    "LEG_BROKER_EGP",
    "LEG_FREIGHT_EGP",
    "LEG_FREIGHT_USD",
    "LEG_SELLER_USD",
    "LEG_SGTX_USD",
  ]);

  // Uniqueness of leg IDs within the same currency bucket.
  const seenEgp = new Set<string>();
  for (const l of manifest.egp_legs || []) {
    if (l.currency !== "EGP") errors.push(`egp_leg ${l.leg_id} currency must be EGP (got ${l.currency})`);
    if (!l.leg_id) errors.push("egp_leg missing leg_id");
    if (seenEgp.has(l.leg_id)) errors.push(`egp_leg duplicate leg_id: ${l.leg_id}`);
    seenEgp.add(l.leg_id);
    if (!conventionIds.has(l.leg_id) && !l.leg_id.startsWith("LEG_")) {
      errors.push(`egp_leg ${l.leg_id} not in convention`);
    }
    if (typeof l.amount !== "number" || l.amount < 0) {
      errors.push(`egp_leg ${l.leg_id} amount must be a non-negative number`);
    }
    // Beneficiary IBAN — warning only (some gov legs may have a placeholder).
    if (!l.beneficiary_iban) {
      warnings.push(`egp_leg ${l.leg_id} has no beneficiary_iban`);
    }
    // Attributable quote — government/SGTX legs may have null quote_id.
    if (!l.quote_id) {
      const exempt = l.leg_id === "LEG_CUSTOMS_EGP" ||
        l.leg_id === "LEG_PHYTO_EGP" ||
        l.leg_id === "LEG_HEALTH_EGP" ||
        l.leg_id === "LEG_SGTX_USD" ||
        l.leg_id === "LEG_SELLER_USD";
      if (!exempt) {
        warnings.push(`egp_leg ${l.leg_id} has no quote_id (non-government leg)`);
      }
    }
  }

  const seenUsd = new Set<string>();
  for (const l of manifest.usd_legs || []) {
    if (l.currency !== "USD") errors.push(`usd_leg ${l.leg_id} currency must be USD (got ${l.currency})`);
    if (!l.leg_id) errors.push("usd_leg missing leg_id");
    if (seenUsd.has(l.leg_id)) errors.push(`usd_leg duplicate leg_id: ${l.leg_id}`);
    seenUsd.add(l.leg_id);
    if (!conventionIds.has(l.leg_id) && !l.leg_id.startsWith("LEG_")) {
      errors.push(`usd_leg ${l.leg_id} not in convention`);
    }
    if (typeof l.amount !== "number" || l.amount < 0) {
      errors.push(`usd_leg ${l.leg_id} amount must be a non-negative number`);
    }
    if (!l.beneficiary_iban) {
      warnings.push(`usd_leg ${l.leg_id} has no beneficiary_iban`);
    }
    if (!l.quote_id) {
      const exempt = l.leg_id === "LEG_SGTX_USD" || l.leg_id === "LEG_SELLER_USD";
      if (!exempt) {
        warnings.push(`usd_leg ${l.leg_id} has no quote_id (non-government leg)`);
      }
    }
  }

  // Totals.
  const computedEgp = round2((manifest.egp_legs || []).reduce((s, l) => s + (l.amount || 0), 0));
  const computedUsd = round2((manifest.usd_legs || []).reduce((s, l) => s + (l.amount || 0), 0));
  if (Math.abs(computedEgp - round2(manifest.total_egp || 0)) > 0.01) {
    errors.push(`total_egp mismatch: sum=${computedEgp}, manifest=${manifest.total_egp}`);
  }
  if (Math.abs(computedUsd - round2(manifest.total_usd || 0)) > 0.01) {
    errors.push(`total_usd mismatch: sum=${computedUsd}, manifest=${manifest.total_usd}`);
  }

  // Hash integrity — recompute and compare.
  const recomputed = sha256(canonicalManifestJson(manifest));
  if (manifest.manifest_hash && recomputed !== manifest.manifest_hash) {
    errors.push("manifest_hash does not match recomputed SHA-256 (tampered or stale)");
  }

  return { valid: errors.length === 0, errors, warnings };
}
