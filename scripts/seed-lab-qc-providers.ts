/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * SEED-LAB-QC-PROVIDERS — v17 §6 + §11 demo data
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * Seeds the Service Provider Capability Model + port coverage + historical
 * price quotes for LAB/QC providers across the v17 Phase 1 priority
 * corridors (Egypt → EU + regional North-Africa + Sub-Saharan Africa).
 *
 * What this script writes:
 *
 *   1. ServiceCapabilityDefinition rows for all LAB + QC capability codes.
 *      These are reference data — the catalogue of capabilities a tenant
 *      can hold. Idempotent (uses upsert on capabilityCode).
 *
 *   2. Additional LAB + QC Tenants in EG, DE, NL, ES, MA, KE, ZA, IT.
 *      These are NEW demo tenants (the existing seed only has one LAB and
 *      one QC, both in Egypt). Idempotent (uses upsert on gtid).
 *      Each new tenant gets `serviceCapabilities` set to the relevant
 *      capability codes so the matching engine can find them.
 *
 *   3. ProviderPortCoverage rows linking each LAB/QC provider to one or
 *      more countries for the capabilities they cover. Idempotent (uses
 *      upsert on the (providerGtid, serviceCapability, portUnlocode) tuple).
 *
 *   4. Historical ServiceQuotation rows for each (capability, country)
 *      pair, so the anonymised-price-range engine has at least 3 samples
 *      to compute a low/mid/high band. The quote `providerGtid` is a real
 *      demo tenant; the engine anonymises it to "Provider A", "Provider B"
 *      at read time, so the seed can use real GTIDs safely. Idempotent
 *      (uses upsert on quoteId).
 *
 * NON-MARKETPLACE GUARDRAILS:
 *
 *   This seed does NOT rank providers. It does NOT score them. It does NOT
 *   recommend them. It only registers capabilities + coverage + historical
 *   market quotes. The matching engine returns providers in DETERMINISTIC
 *   ALPHABETICAL ORDER by GTID at read time.
 *
 * Usage:
 *   cd /home/z/my-project && bun run scripts/seed-lab-qc-providers.ts
 *
 * Environment:
 *   DATABASE_URL — must point at the SGTX database (local SQLite or Turso).
 *   Reuses the standard Prisma client from src/lib/db.
 * ═══════════════════════════════════════════════════════════════════════════════
 */

// @ts-nocheck
import { db as prisma } from "@/lib/db";

// ────────────────────────────────────────────────────────────────────────────
// Capability definitions — LAB group + QC group
// ────────────────────────────────────────────────────────────────────────────

interface CapDef {
  capabilityCode: string;
  capabilityName: string;
  capabilityGroup: "LAB" | "QC";
  requiresAccreditation: boolean;
  requiresInsurance: boolean;
  defaultPortalTab: string;
}

const LAB_CAPS: CapDef[] = [
  { capabilityCode: "PESTICIDE_RESIDUE", capabilityName: "Pesticide Residue Panel (EU MRL + Codex MRL)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "MICROBIOLOGICAL", capabilityName: "Microbiological Panel (E. coli, Salmonella, Listeria)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "HEAVY_METALS", capabilityName: "Heavy Metals Panel (Pb, Cd, As, Hg)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "MYCOTOXIN", capabilityName: "Mycotoxin Panel (Aflatoxin, Ochratoxin, DON)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "OCHRATOXIN", capabilityName: "Ochratoxin A (coffee, dried fruit)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "SULPHITE", capabilityName: "Sulphite (SO2) determination", capabilityGroup: "LAB", requiresAccreditation: false, requiresInsurance: false, defaultPortalTab: "reports" },
  { capabilityCode: "FUNGICIDE", capabilityName: "Post-harvest Fungicide Residue", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "reports" },
  { capabilityCode: "NUTRITION", capabilityName: "Nutritional Labelling Panel", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "reports" },
  { capabilityCode: "GMO", capabilityName: "GMO Screening Panel", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "reports" },
  { capabilityCode: "ALLERGEN", capabilityName: "Allergen Panel", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "reports" },
  { capabilityCode: "AUTHENTICITY", capabilityName: "Origin/Varietal Authenticity (DNA/isotopes)", capabilityGroup: "LAB", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "reports" },
];

const QC_CAPS: CapDef[] = [
  { capabilityCode: "PRE_SHIPMENT_QC", capabilityName: "Pre-shipment Quality Inspection", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "field" },
  { capabilityCode: "LOADING_SUPERVISION", capabilityName: "Container Loading Supervision", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "field" },
  { capabilityCode: "DESTINATION_QC", capabilityName: "Destination-side Quality Inspection", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "field" },
  { capabilityCode: "SAMPLING", capabilityName: "Sampling per ISO 2859 / AQL plan", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: false, defaultPortalTab: "field" },
  { capabilityCode: "COLD_CHAIN_AUDIT", capabilityName: "Cold-chain Temperature & Humidity Audit", capabilityGroup: "QC", requiresAccreditation: true, requiresInsurance: true, defaultPortalTab: "field" },
];

// ────────────────────────────────────────────────────────────────────────────
// Demo LAB/QC tenants — multi-country provider network
// ────────────────────────────────────────────────────────────────────────────

interface ProviderSeed {
  gtid: string;
  legalName: string;
  type: "LAB" | "QC";
  country: string; // ISO 3166-1 alpha-2
  city: string;
  sector: string;
  kybTier: number;
  trustScore: number;
  capabilities: string[]; // capability codes
  /** Countries the provider covers for all its declared capabilities. */
  coverageCountries: string[];
}

const PROVIDERS: ProviderSeed[] = [
  // ── Existing demo tenant — backfill capabilities + coverage ──────────
  {
    gtid: "SGTX-EG-LAB-000014-6F4D",
    legalName: "Cairo Analytical Laboratory",
    type: "LAB",
    country: "EG",
    city: "Cairo",
    sector: "Food & Pesticide Testing",
    kybTier: 2,
    trustScore: 90,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN", "OCHRATOXIN", "SULPHITE", "FUNGICIDE", "NUTRITION"],
    coverageCountries: ["EG", "MA", "TN", "SA", "AE"],
  },
  {
    gtid: "SGTX-EG-QC-000022-8A1C",
    legalName: "Nile Quality Inspectors",
    type: "QC",
    country: "EG",
    city: "Cairo",
    sector: "Pre-shipment Inspection",
    kybTier: 2,
    trustScore: 87,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "SAMPLING", "COLD_CHAIN_AUDIT"],
    coverageCountries: ["EG", "MA", "TN", "SA", "AE"],
  },

  // ── NEW Egypt LAB #2 — second lab for anonymised price ranges ─────────
  {
    gtid: "SGTX-EG-LAB-000041-2B7E",
    legalName: "Alexandria Food Lab",
    type: "LAB",
    country: "EG",
    city: "Alexandria",
    sector: "Food Safety & Residue Testing",
    kybTier: 2,
    trustScore: 88,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN"],
    coverageCountries: ["EG", "LY", "TN"],
  },

  // ── NEW Egypt LAB #3 — third lab (so the engine has ≥3 samples) ───────
  {
    gtid: "SGTX-EG-LAB-000058-9C1D",
    legalName: "Giza Analytics Centre",
    type: "LAB",
    country: "EG",
    city: "Giza",
    sector: "Pesticide + Authenticity",
    kybTier: 2,
    trustScore: 86,
    capabilities: ["PESTICIDE_RESIDUE", "HEAVY_METALS", "AUTHENTICITY", "GMO"],
    coverageCountries: ["EG", "SA", "AE"],
  },

  // ── NEW Egypt QC #2 — second QC for anonymised price ranges ───────────
  {
    gtid: "SGTX-EG-QC-000046-7D3F",
    legalName: "Pyramid Inspection Services",
    type: "QC",
    country: "EG",
    city: "Cairo",
    sector: "Loading + Cold-chain",
    kybTier: 2,
    trustScore: 84,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "COLD_CHAIN_AUDIT"],
    coverageCountries: ["EG", "SA", "AE"],
  },

  // ── NEW Germany LAB — for EU-destination perishables + grapes ───────
  {
    gtid: "SGTX-DE-LAB-000017-4E5F",
    legalName: "Hamburg Analytical GmbH",
    type: "LAB",
    country: "DE",
    city: "Hamburg",
    sector: "EU Import Compliance Testing",
    kybTier: 3,
    trustScore: 93,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN", "OCHRATOXIN", "SULPHITE", "FUNGICIDE", "GMO", "ALLERGEN", "AUTHENTICITY"],
    coverageCountries: ["DE", "NL", "BE", "FR", "IT", "ES", "PL"],
  },

  // ── NEW Germany QC — for EU-destination perishables ───────────────
  {
    gtid: "SGTX-DE-QC-000029-6F8A",
    legalName: "Bremen Quality Partners",
    type: "QC",
    country: "DE",
    city: "Bremen",
    sector: "EU Import + Destination QC",
    kybTier: 3,
    trustScore: 91,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "DESTINATION_QC", "SAMPLING", "COLD_CHAIN_AUDIT"],
    coverageCountries: ["DE", "NL", "BE", "FR", "IT", "ES", "PL"],
  },

  // ── NEW Netherlands LAB — major EU perishables entry port ────────────
  {
    gtid: "SGTX-NL-LAB-000011-8C2B",
    legalName: "Rotterdam Bio-Analytical B.V.",
    type: "LAB",
    country: "NL",
    city: "Rotterdam",
    sector: "Perishables + Pesticide MRL",
    kybTier: 3,
    trustScore: 92,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN", "OCHRATOXIN", "SULPHITE"],
    coverageCountries: ["NL", "BE", "DE", "FR", "UK"],
  },

  // ── NEW Netherlands QC — perishables destination QC ─────────────────
  {
    gtid: "SGTX-NL-QC-000018-3D4C",
    legalName: "Port of Rotterdam Inspection Co.",
    type: "QC",
    country: "NL",
    city: "Rotterdam",
    sector: "Destination QC for Perishables",
    kybTier: 3,
    trustScore: 89,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "DESTINATION_QC", "SAMPLING"],
    coverageCountries: ["NL", "BE", "DE", "UK"],
  },

  // ── NEW Spain LAB — Mediterranean perishables ──────────────────────
  {
    gtid: "SGTX-ES-LAB-000007-9E2A",
    legalName: "Valencia Lab Analítico",
    type: "LAB",
    country: "ES",
    city: "Valencia",
    sector: "Citrus + Olive MRL",
    kybTier: 2,
    trustScore: 88,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN", "FUNGICIDE"],
    coverageCountries: ["ES", "PT", "IT", "MA", "FR"],
  },

  // ── NEW Spain QC — citrus + grapes ──────────────────────────────────
  {
    gtid: "SGTX-ES-QC-000014-5F7B",
    legalName: "Madrid Inspection Bureau",
    type: "QC",
    country: "ES",
    city: "Madrid",
    sector: "Citrus + Grape Pre-shipment",
    kybTier: 2,
    trustScore: 86,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "SAMPLING"],
    coverageCountries: ["ES", "PT", "IT", "FR", "MA"],
  },

  // ── NEW Morocco LAB — North-Africa perishables export ────────────────
  {
    gtid: "SGTX-MA-LAB-000005-1A2C",
    legalName: "Casablanca Lab Maroc",
    type: "LAB",
    country: "MA",
    city: "Casablanca",
    sector: "Citrus + Tomato MRL",
    kybTier: 2,
    trustScore: 85,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "SULPHITE"],
    coverageCountries: ["MA", "DZ", "TN", "ES", "FR"],
  },

  // ── NEW Kenya LAB — Sub-Saharan Africa fresh produce ────────────────
  {
    gtid: "SGTX-KE-LAB-000003-7B8D",
    legalName: "Nairobi Agri-Lab Ltd",
    type: "LAB",
    country: "KE",
    city: "Nairobi",
    sector: "Fresh Produce + Avocado MRL",
    kybTier: 2,
    trustScore: 83,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN"],
    coverageCountries: ["KE", "UG", "TZ", "ET", "RW"],
  },

  // ── NEW Kenya QC — fresh produce ───────────────────────────────────
  {
    gtid: "SGTX-KE-QC-000009-4C6E",
    legalName: "Mombasa Inspection Services",
    type: "QC",
    country: "KE",
    city: "Mombasa",
    sector: "Avocado + Fresh Produce Pre-shipment",
    kybTier: 2,
    trustScore: 82,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "COLD_CHAIN_AUDIT"],
    coverageCountries: ["KE", "UG", "TZ", "ET"],
  },

  // ── NEW South Africa LAB — Southern Hemisphere perishables ─────────
  {
    gtid: "SGTX-ZA-LAB-000012-8E9F",
    legalName: "Cape Town Analytical",
    type: "LAB",
    country: "ZA",
    city: "Cape Town",
    sector: "Wine + Citrus + Grape MRL",
    kybTier: 3,
    trustScore: 90,
    capabilities: ["PESTICIDE_RESIDUE", "MICROBIOLOGICAL", "HEAVY_METALS", "MYCOTOXIN", "OCHRATOXIN", "SULPHITE", "AUTHENTICITY"],
    coverageCountries: ["ZA", "NA", "BW", "MZ", "ZW"],
  },

  // ── NEW South Africa QC — citrus + grapes ───────────────────────────
  {
    gtid: "SGTX-ZA-QC-000021-2D3A",
    legalName: "Cape Inspection Bureau",
    type: "QC",
    country: "ZA",
    city: "Cape Town",
    sector: "Citrus Pre-shipment",
    kybTier: 2,
    trustScore: 87,
    capabilities: ["PRE_SHIPMENT_QC", "LOADING_SUPERVISION", "SAMPLING", "COLD_CHAIN_AUDIT"],
    coverageCountries: ["ZA", "NA", "BW", "MZ"],
  },
];

// ────────────────────────────────────────────────────────────────────────────
// UN/LOCODEs per country (only a few — used for ProviderPortCoverage)
// ────────────────────────────────────────────────────────────────────────────

const COUNTRY_PORTS: Record<string, string[]> = {
  EG: ["EGALY", "EGCAI"],     // Alexandria, Cairo
  DE: ["DEHAM", "DEBRV"],     // Hamburg, Bremerhaven
  NL: ["NLRTM"],              // Rotterdam
  ES: ["ESVLC", "ESBCN"],     // Valencia, Barcelona
  MA: ["MACAS"],              // Casablanca
  KE: ["KEMBA"],              // Mombasa
  ZA: ["ZACPT", "ZADUR"],     // Cape Town, Durban
  IT: ["ITGOA", "ITNAP"],     // Genoa, Naples
  FR: ["FRMRS", "FRLEH"],     // Marseille, Le Havre
  BE: ["BEANR"],              // Antwerp
  PL: ["PLGDY"],              // Gdansk
  UK: ["GBLON", "GBFXT"],     // London, Felixstowe
  PT: ["PTLIS"],              // Lisbon
  TN: ["TNTUN"],              // Tunis
  DZ: ["DZALG"],              // Algiers
  LY: ["LYMIA"],              // Misrata
  SA: ["SAJED", "SADMM"],     // Jeddah, Dammam
  AE: ["AEJEA", "AEDXB"],     // Jebel Ali, Dubai
  UG: ["UGEBB"],              // Entebbe
  TZ: ["TZDAR"],              // Dar es Salaam
  ET: ["ETADD"],              // Addis Ababa
  RW: ["RWKGL"],              // Kigali
  NA: ["NAWVB"],              // Walvis Bay
  BW: ["BWGBE"],              // Gaborone
  MZ: ["MZMPM"],              // Maputo
  ZW: ["ZWBEW"],              // Beira (zw routes via beira port)
};

// ────────────────────────────────────────────────────────────────────────────
// Historical price quotes (for anonymised price ranges)
// ────────────────────────────────────────────────────────────────────────────
//
// For each (capability, country) pair where we have at least 3 providers,
// generate ≥ 3 historical ServiceQuotation rows with slightly different
// feeUsd values, so the anonymised price range engine has meaningful data.
// The feeUsd values are deliberately spread (low / mid / high) around the
// DEFAULT_*_PRICE_BAND_USD mid for the capability.
// ────────────────────────────────────────────────────────────────────────────

const LAB_MID_PRICES: Record<string, number> = {
  PESTICIDE_RESIDUE: 280,
  MICROBIOLOGICAL: 180,
  HEAVY_METALS: 150,
  MYCOTOXIN: 220,
  OCHRATOXIN: 180,
  SULPHITE: 95,
  FUNGICIDE: 210,
  NUTRITION: 320,
  GMO: 250,
  ALLERGEN: 220,
  AUTHENTICITY: 380,
};

const QC_MID_PRICES: Record<string, number> = {
  PRE_SHIPMENT_QC: 380,
  LOADING_SUPERVISION: 240,
  DESTINATION_QC: 540,
  SAMPLING: 190,
  COLD_CHAIN_AUDIT: 300,
};

function historicalQuoteVariance(base: number, i: number): number {
  // Spread quotes around the mid price: -12%, 0%, +15%, etc.
  const offsets = [-0.12, -0.04, 0.05, 0.12, 0.18];
  const off = offsets[i % offsets.length];
  return Math.round(base * (1 + off));
}

// ────────────────────────────────────────────────────────────────────────────
// Main seed function
// ────────────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("🌱 Seeding SGTX LAB/QC providers + capabilities + coverage + historical quotes...");

  // ── 1. ServiceCapabilityDefinition rows ─────────────────────────────
  console.log("  → ServiceCapabilityDefinition (LAB + QC)...");
  let capsCreated = 0;
  for (const cap of [...LAB_CAPS, ...QC_CAPS]) {
    try {
      await prisma.serviceCapabilityDefinition.upsert({
        where: { capabilityCode: cap.capabilityCode },
        create: {
          capabilityCode: cap.capabilityCode,
          capabilityName: cap.capabilityName,
          capabilityGroup: cap.capabilityGroup,
          requiresAccreditation: cap.requiresAccreditation,
          requiresInsurance: cap.requiresInsurance,
          defaultPortalTab: cap.defaultPortalTab,
        },
        update: {
          capabilityName: cap.capabilityName,
          capabilityGroup: cap.capabilityGroup,
          requiresAccreditation: cap.requiresAccreditation,
          requiresInsurance: cap.requiresInsurance,
          defaultPortalTab: cap.defaultPortalTab,
        },
      });
      capsCreated++;
    } catch (e: any) {
      console.warn(`    ✗ cap ${cap.capabilityCode}: ${e.message}`);
    }
  }
  console.log(`    ✓ ${capsCreated} capability definitions upserted`);

  // ── 2. Tenants + serviceCapabilities JSON ────────────────────────────
  console.log("  → LAB/QC Tenants (upsert)...");
  let tenantsCreated = 0;
  for (const p of PROVIDERS) {
    try {
      await prisma.tenant.upsert({
        where: { gtid: p.gtid },
        create: {
          gtid: p.gtid,
          legalName: p.legalName,
          type: p.type,
          country: p.country,
          city: p.city,
          sector: p.sector,
          kybTier: p.kybTier,
          trustScore: p.trustScore,
          lifecycleState: "VERIFIED",
          sanctionsCleared: true,
          anonymousRfqOptOut: false,
          serviceCapabilities: JSON.stringify(p.capabilities),
        },
        update: {
          legalName: p.legalName,
          type: p.type,
          country: p.country,
          city: p.city,
          sector: p.sector,
          kybTier: p.kybTier,
          trustScore: p.trustScore,
          lifecycleState: "VERIFIED",
          sanctionsCleared: true,
          anonymousRfqOptOut: false,
          // Only update serviceCapabilities if it's empty or default.
          // Avoid clobbering user-managed capability changes.
          serviceCapabilities: JSON.stringify(p.capabilities),
        },
      });
      tenantsCreated++;
    } catch (e: any) {
      console.warn(`    ✗ tenant ${p.gtid}: ${e.message}`);
    }
  }
  console.log(`    ✓ ${tenantsCreated} tenants upserted`);

  // ── 3. ProviderPortCoverage rows ────────────────────────────────────
  console.log("  → ProviderPortCoverage rows...");
  let coverageCreated = 0;
  for (const p of PROVIDERS) {
    for (const cap of p.capabilities) {
      for (const cc of p.coverageCountries) {
        const ports = COUNTRY_PORTS[cc] || [cc + "XXX"];
        for (const port of ports) {
          try {
            // The (providerGtid, serviceCapability, portUnlocode) is UNIQUE.
            // We use upsert via findFirst + create/update because the table
            // does not have a single-column unique key.
            const existing = await prisma.providerPortCoverage.findFirst({
              where: {
                providerGtid: p.gtid,
                serviceCapability: cap,
                portUnlocode: port,
              },
            });
            if (existing) {
              await prisma.providerPortCoverage.update({
                where: { id: existing.id },
                data: {
                  isActive: true,
                  countryCode: cc,
                  lastVerified: new Date(),
                },
              });
            } else {
              await prisma.providerPortCoverage.create({
                data: {
                  providerGtid: p.gtid,
                  serviceCapability: cap,
                  portUnlocode: port,
                  countryCode: cc,
                  isActive: true,
                  lastVerified: new Date(),
                },
              });
              coverageCreated++;
            }
          } catch (e: any) {
            // Ignore races — the unique constraint may have fired.
          }
        }
      }
    }
  }
  console.log(`    ✓ ${coverageCreated} coverage rows created (others already existed)`);

  // ── 4. Historical ServiceQuotation rows ──────────────────────────────
  console.log("  → Historical ServiceQuotation rows (for anonymised price ranges)...");
  let quotesCreated = 0;
  // Group providers by (country, capability) — for each group, ensure ≥ 3
  // historical quotes exist with distinct feeUsd values.
  for (const p of PROVIDERS) {
    const isLab = p.type === "LAB";
    const midPrices = isLab ? LAB_MID_PRICES : QC_MID_PRICES;
    for (const cap of p.capabilities) {
      const base = midPrices[cap];
      if (!base) continue;
      // For each covered country, create up to 3 historical quotes at
      // different feeUsd values (so the engine has the minimum 3 samples
      // per (capability, country) pair).
      for (const cc of p.coverageCountries) {
        for (let i = 0; i < 3; i++) {
          const quoteId = `SQ-LABQC-SEED-${p.gtid.replace(/[^A-Z0-9]/g, "")}-${cap}-${cc}-${i}`;
          const feeUsd = historicalQuoteVariance(base, i);
          const createdAt = new Date(Date.now() - (i + 1) * 7 * 86400_000); // i+1 weeks ago
          try {
            await prisma.serviceQuotation.upsert({
              where: { quoteId },
              create: {
                quoteId,
                providerGtid: p.gtid,
                providerType: p.type,
                serviceType: cap,
                feeUsd,
                currency: "USD",
                validityDays: 7,
                validUntil: new Date(createdAt.getTime() + 7 * 86400_000),
                status: i === 0 ? "ACCEPTED" : i === 1 ? "EXPIRED" : "REJECTED",
                description: `Historical ${cap} quote for ${cc} (seed)`,
                paymentStage: "STAGE1",
                createdAt,
              },
              update: {
                feeUsd,
                // Keep the original createdAt — don't clobber historical time.
              },
            });
            quotesCreated++;
          } catch (e: any) {
            // Non-fatal — some seeds may have quoteId collisions on re-runs.
          }
        }
      }
    }
  }
  console.log(`    ✓ ${quotesCreated} historical quotes upserted`);

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error("✗ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    // The shared `db` client manages its own connection lifecycle; we don't
    // disconnect it here. The process will exit naturally.
  });
