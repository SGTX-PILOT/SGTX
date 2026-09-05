// ═══════════════════════════════════════════════════════════════════════════════
// COCKPIT-Phase 7: Seed all 12 demo tenants + employees into the local DB.
// ═════════════════════════════════════════════════════════════════════════════════
//
// Run via: `bun run scripts/seed-cockpit-demo.ts`
//
// Creates the 12 demo tenants + their demo employees so the cockpit
// /login route's demo-login buttons work out of the box. Idempotent —
// safe to run multiple times (uses upsert).
//
// This script targets the LOCAL SQLite DB (file:./db/custom.db) which is
// the dev database. It does NOT touch the Turso production database.

import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";

const adapter = new PrismaLibSql({ url: "file:./db/custom.db" });
const db = new PrismaClient({ adapter, log: ["error"] } as any);

const DEMO_TENANTS = [
  { gtid: "SGTX-DE-TRD-001234-5B6C", legalName: "European Importer GmbH", type: "TRD", country: "DE", role: "TRADER_BUYER", email: "demo.buyer@sgtx.demo", fullName: "Demo Buyer" },
  { gtid: "SGTX-EG-TRD-002139-7F3A", legalName: "Strawberry Export Co.", type: "TRD", country: "EG", role: "TRADER_SELLER", email: "demo.seller@sgtx.demo", fullName: "Demo Seller" },
  { gtid: "SGTX-EG-LSP-000120-4C7D", legalName: "Delta Freight", type: "LSP", country: "EG", role: "LSP", email: "demo.lsp@sgtx.demo", fullName: "Demo LSP" },
  { gtid: "SGTX-EG-SHP-000031-9E8F", legalName: "Maersk Levant", type: "SHIP", country: "EG", role: "CARRIER", email: "demo.ship@sgtx.demo", fullName: "Demo Shipping Line" },
  { gtid: "SGTX-EG-LAB-000014-6F4D", legalName: "Cairo Analytical", type: "LAB", country: "EG", role: "LAB", email: "demo.lab@sgtx.demo", fullName: "Demo Lab" },
  { gtid: "SGTX-EG-QC-000022-8A1C", legalName: "Nile Quality", type: "QC", country: "EG", role: "QC", email: "demo.qc@sgtx.demo", fullName: "Demo QC" },
  { gtid: "SGTX-EG-CBR-000009-5E7B", legalName: "Pyramid Customs", type: "CBR", country: "EG", role: "CUSTOMS_BROKER", email: "demo.cbr@sgtx.demo", fullName: "Demo Customs Broker" },
  { gtid: "SGTX-EG-BNK-000007-1F8D", legalName: "Commercial International Bank", type: "BANK", country: "EG", role: "BANK", email: "demo.bank@sgtx.demo", fullName: "Demo Bank" },
  { gtid: "SGTX-EG-PFI-000011-3C2E", legalName: "Sovereign Capital", type: "PFI", country: "EG", role: "PRIVATE_FINANCIER", email: "demo.pfi@sgtx.demo", fullName: "Demo Private Financier" },
  { gtid: "SGTX-EG-GOV-000001-9A0B", legalName: "Egyptian Customs Authority", type: "GOV", country: "EG", role: "REGULATOR", email: "demo.gov@sgtx.demo", fullName: "Demo Government" },
  { gtid: "SGTX-ZZ-ADM-000001-A1B2", legalName: "Platform Admin", type: "ADM", country: "ZZ", role: "PLATFORM_ADMIN", email: "demo.admin@sgtx.demo", fullName: "Demo Platform Admin" },
  { gtid: "SGTX-ZZ-MKT-000001-C3D4", legalName: "Marketplace Partner", type: "MP", country: "ZZ", role: "MARKETPLACE_PARTNER", email: "demo.mp@sgtx.demo", fullName: "Demo Marketplace Partner" },
];

async function main() {
  console.log("Seeding 12 demo tenants + employees…");
  for (const t of DEMO_TENANTS) {
    await db.tenant.upsert({
      where: { gtid: t.gtid },
      create: { gtid: t.gtid, legalName: t.legalName, type: t.type, country: t.country, kybTier: 3, trustScore: 90, lifecycleState: "VERIFIED", sanctionsCleared: true },
      update: {},
    });
    await db.employee.upsert({
      where: { email: t.email },
      create: { tenantGtid: t.gtid, email: t.email, fullName: t.fullName, role: t.role, isActive: true },
      update: {},
    });
    console.log(`  ✅ ${t.gtid} — ${t.legalName}`);
  }
  const count = await db.tenant.count();
  console.log(`\nTotal tenants in DB: ${count}`);
  await db.$disconnect();
}

main().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
