// SGTX seed — Egyptian strawberry export scenario (Blueprint Part 12D Example 1)
// Run with: bun run scripts/seed.ts
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  console.log("🌱 Seeding SGTX platform...");
  // Clean slate (idempotent)
  await db.incotermServiceMapping.deleteMany();
  await db.providerPerformance.deleteMany();
  await db.providerServiceCatalogue.deleteMany();
  await db.stablecoinStatus.deleteMany();
  await db.deFiPosition.deleteMany();
  await db.deFiProtocol.deleteMany();
  await db.financingRepayment.deleteMany();
  await db.financingAgreementAnnex.deleteMany();
  await db.financingAgreement.deleteMany();
  await db.financingRfqLog.deleteMany();
  await db.financierPreference.deleteMany();
  await db.tradeMessage.deleteMany();
  await db.timelineEvent.deleteMany();
  await db.dispute.deleteMany();
  await db.financingBid.deleteMany();
  await db.financingRequest.deleteMany();
  await db.serviceQuotation.deleteMany();
  await db.customsDeclaration.deleteMany();
  await db.qcInspection.deleteMany();
  await db.labTest.deleteMany();
  await db.invoice.deleteMany();
  await db.inboxItem.deleteMany();
  await db.activity.deleteMany();
  await db.document.deleteMany();
  await db.shipment.deleteMany();
  await db.trade.deleteMany();
  await db.employee.deleteMany();
  await db.tenant.deleteMany();
  await db.integrationHealth.deleteMany();
  await db.governorDecision.deleteMany();
  await db.loomVerificationToken.deleteMany();
  await db.jurisdiction.deleteMany();
  await db.suspiciousActivityReport.deleteMany();
  await db.savedContact.deleteMany();
  await db.tradeReadiness.deleteMany();
  console.log("  ✓ cleared existing data");

  // ---------- TENANTS ----------
  const tenants = [
    { gtid: "SGTX-EG-TRD-002139-7F3A", legalName: "Strawberry Export Co.", type: "TRD", country: "EG", traderMode: "SELL", kybTier: 2, trustScore: 92, city: "Cairo", sector: "Frozen Fruit Export", logoColor: "#d4321a" },
    { gtid: "SGTX-DE-TRD-001234-5B6C", legalName: "European Importer GmbH", type: "TRD", country: "DE", traderMode: "BUY", kybTier: 2, trustScore: 88, city: "Hamburg", sector: "Food Import", logoColor: "#1a6fb0" },
    { gtid: "SGTX-VN-TRD-005521-3D9E", legalName: "Mekong Fresh", type: "TRD", country: "VN", traderMode: "DUAL", kybTier: 2, trustScore: 85, city: "Can Tho", sector: "Citrus Export", logoColor: "#0f9d58" },
    { gtid: "SGTX-EG-TRD-008842-1A2B", legalName: "Nile Foods Group", type: "TRD", country: "EG", traderMode: "BUY", kybTier: 1, trustScore: 79, city: "Alexandria", sector: "Food Distribution", logoColor: "#7b3fa0" },
    { gtid: "SGTX-EG-LSP-000120-4C7D", legalName: "Delta Freight & Forwarding", type: "LSP", country: "EG", kybTier: 2, trustScore: 84, city: "Alexandria", sector: "Trucking & Forwarding", logoColor: "#c2410c" },
    { gtid: "SGTX-EG-SHP-000031-9E8F", legalName: "Maersk Levant Line", type: "SHIP", country: "EG", kybTier: 3, trustScore: 95, city: "Alexandria", sector: "Ocean Container", logoColor: "#0d6efd" },
    { gtid: "SGTX-DE-SHP-000058-2B3C", legalName: "Hapag-Lloyd Northern", type: "SHIP", country: "DE", kybTier: 3, trustScore: 93, city: "Hamburg", sector: "Ocean Container", logoColor: "#0ea5e9" },
    { gtid: "SGTX-EG-LAB-000014-6F4D", legalName: "Cairo Analytical Laboratory", type: "LAB", country: "EG", kybTier: 2, trustScore: 90, city: "Cairo", sector: "Food & Pesticide Testing", logoColor: "#16a34a" },
    { gtid: "SGTX-EG-QC-000022-8A1C", legalName: "Nile Quality Inspectors", type: "QC", country: "EG", kybTier: 2, trustScore: 87, city: "Cairo", sector: "Pre-shipment Inspection", logoColor: "#9333ea" },
    { gtid: "SGTX-EG-CBR-000009-5E7B", legalName: "Pyramid Customs Brokers", type: "CBR", country: "EG", kybTier: 3, trustScore: 91, city: "Cairo", sector: "Customs Clearance", logoColor: "#ca8a04" },
    { gtid: "SGTX-EG-BNK-000007-1F8D", legalName: "Commercial International Bank", type: "BANK", country: "EG", kybTier: 3, trustScore: 96, city: "Cairo", sector: "Trade Finance", logoColor: "#1e40af", defiAllowed: true },
    { gtid: "SGTX-EG-PFI-000011-3C2E", legalName: "Sovereign Capital Partners", type: "PFI", country: "EG", kybTier: 2, trustScore: 82, city: "Giza", sector: "Private Trade Finance", logoColor: "#be185d" },
    { gtid: "SGTX-EG-GOV-000001-9A0B", legalName: "Egyptian Customs Authority", type: "GOV", country: "EG", kybTier: 3, trustScore: 99, city: "Cairo", sector: "Customs & Revenue", logoColor: "#b45309" },
    { gtid: "SGTX-EG-GOV-000004-2D6E", legalName: "Central Bank of Egypt", type: "GOV", country: "EG", kybTier: 3, trustScore: 99, city: "Cairo", sector: "Monetary & Settlement", logoColor: "#15803d" },
    { gtid: "SGTX-EG-GOV-000012-7F3A", legalName: "National Food Safety Authority", type: "GOV", country: "EG", kybTier: 3, trustScore: 97, city: "Cairo", sector: "Food Safety", logoColor: "#a16207" },
  ];

  for (const t of tenants) await db.tenant.create({ data: t as any });
  console.log(`  ✓ ${tenants.length} tenants`);

  const employees = [
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", fullName: "Mohamed Eltonsy", email: "m.eltonsy@strawberryexport.eg", role: "OWNER", allowRoleSwitching: false, avatarColor: "#d4321a" },
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", fullName: "Sarah Ahmed", email: "s.ahmed@strawberryexport.eg", role: "OPERATOR", avatarColor: "#f59e0b" },
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", fullName: "Klaus Bergmann", email: "k.bergmann@euroimport.de", role: "OWNER", avatarColor: "#1a6fb0" },
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", fullName: "Lena Hoffmann", email: "l.hoffmann@euroimport.de", role: "OPERATOR", avatarColor: "#0ea5e9" },
    { tenantGtid: "SGTX-EG-LSP-000120-4C7D", fullName: "Omar Khairy", email: "o.khairy@deltafreight.eg", role: "ADMIN", avatarColor: "#c2410c" },
    { tenantGtid: "SGTX-EG-LSP-000120-4C7D", fullName: "Hassan Mahmoud", email: "h.mahmoud@deltafreight.eg", role: "DRIVER", avatarColor: "#ea580c" },
    { tenantGtid: "SGTX-EG-SHP-000031-9E8F", fullName: "Captain Yara Farouk", email: "y.farouk@maersklevant.eg", role: "ADMIN", avatarColor: "#0d6efd" },
    { tenantGtid: "SGTX-EG-LAB-000014-6F4D", fullName: "Dr. Amira Said", email: "a.said@cairoanalytical.eg", role: "ANALYST", avatarColor: "#16a34a" },
    { tenantGtid: "SGTX-EG-QC-000022-8A1C", fullName: "Tarek Mansour", email: "t.mansour@nileqc.eg", role: "INSPECTOR", avatarColor: "#9333ea" },
    { tenantGtid: "SGTX-EG-CBR-000009-5E7B", fullName: "Nour El-Din", email: "n.eldin@pyramidcustoms.eg", role: "OFFICER", avatarColor: "#ca8a04" },
    { tenantGtid: "SGTX-EG-BNK-000007-1F8D", fullName: "Reem Adel", email: "r.adel@cib.eg", role: "OFFICER", avatarColor: "#1e40af" },
    { tenantGtid: "SGTX-EG-GOV-000001-9A0B", fullName: "General Khaled Soliman", email: "k.soliman@customs.eg", role: "OFFICER", avatarColor: "#b45309" },
    { tenantGtid: "SGTX-EG-GOV-000004-2D6E", fullName: "Dr. Mona Rashad", email: "m.rashad@cbe.eg", role: "OFFICER", avatarColor: "#15803d" },
  ];
  for (const e of employees) await db.employee.create({ data: e });
  console.log(`  ✓ ${employees.length} employees`);

  // ---------- TRADE 1: Strawberry Export (main scenario) ----------
  const ustn1 = "SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4";
  const trade1 = await db.trade.create({
    data: {
      ustn: ustn1, buyerGtid: "SGTX-DE-TRD-001234-5B6C", sellerGtid: "SGTX-EG-TRD-002139-7F3A",
      commodity: "Frozen Strawberries (Senga Sengana, IQF)", commodityHs: "0811.10.00", incoterm: "CIF",
      grossWeightKg: 21500, netWeightKg: 20000, tradeValueUsd: 100000, currency: "USD",
      originPort: "Alexandria (EGALX)", destPort: "Hamburg (DEHAM)", originCountry: "EG", destCountry: "DE",
      phase: 5, status: "IN_EXECUTION", healthScore: 88, multiShipment: true, sgtxFeeUsd: 1500, coldChain: true, containerCount: 2,
    },
  });

  await db.shipment.create({ data: { tradeId: trade1.id, ustn: ustn1, sequence: 1, vesselName: "MSC Amsterdam", vesselImo: "IMO 9778601", containerNo: "MSCU 4471823", containerCount: 1, carrierGtid: "SGTX-EG-SHP-000031-9E8F", status: "IN_TRANSIT", originPort: "Alexandria (EGALX)", destPort: "Hamburg (DEHAM)", etd: new Date("2026-04-16"), eta: new Date("2026-05-04"), departedAt: new Date("2026-04-16T08:00:00Z"), coldChainTemp: -18.2, lat: 37.6, lng: 14.8 } });
  await db.shipment.create({ data: { tradeId: trade1.id, ustn: ustn1, sequence: 2, vesselName: "Maersk Levant", vesselImo: "IMO 9778712", containerNo: "MAEU 7812094", containerCount: 1, carrierGtid: "SGTX-EG-SHP-000031-9E8F", status: "LOADED", originPort: "Alexandria (EGALX)", destPort: "Hamburg (DEHAM)", etd: new Date("2026-04-22"), eta: new Date("2026-05-10"), coldChainTemp: -18.0, lat: 31.2, lng: 29.85 } });

  const docs = [
    { type: "COMMERCIAL_INVOICE", title: "Commercial Invoice CI-2026-0491", status: "VERIFIED", uploadedBy: "SGTX-EG-TRD-002139-7F3A", fileSizeKb: 142 },
    { type: "PACKING_LIST", title: "Packing List PL-0491", status: "VERIFIED", uploadedBy: "SGTX-EG-TRD-002139-7F3A", fileSizeKb: 88 },
    { type: "CERTIFICATE_ORIGIN", title: "EUR.1 Movement Certificate", status: "UPLOADED", uploadedBy: "SGTX-EG-CBR-000009-5E7B", fileSizeKb: 64 },
    { type: "PHYTO", title: "Phytosanitary Certificate", status: "VERIFIED", uploadedBy: "SGTX-EG-GOV-000012-7F3A", fileSizeKb: 71 },
    { type: "HEALTH_CERT", title: "Health Certificate HC-2026-118", status: "VERIFIED", uploadedBy: "SGTX-EG-LAB-000014-6F4D", fileSizeKb: 95 },
    { type: "BILL_LADING", title: "Bill of Lading B/L-MSCU-4471823", status: "UPLOADED", uploadedBy: "SGTX-EG-SHP-000031-9E8F", fileSizeKb: 120 },
    { type: "CUSTOMS_DECL", title: "Export Declaration EX-2026-88231", status: "VERIFIED", uploadedBy: "SGTX-EG-CBR-000009-5E7B", fileSizeKb: 156 },
    { type: "LAB_REPORT", title: "Pesticide Residue Report", status: "VERIFIED", uploadedBy: "SGTX-EG-LAB-000014-6F4D", fileSizeKb: 210 },
    { type: "QC_REPORT", title: "Pre-shipment QC Report", status: "UPLOADED", uploadedBy: "SGTX-EG-QC-000022-8A1C", fileSizeKb: 178 },
    { type: "CONTRACT", title: "Sales Contract SC-2026-0491", status: "VERIFIED", uploadedBy: "SGTX-EG-TRD-002139-7F3A", fileSizeKb: 312 },
    { type: "COLD_CHAIN", title: "Cold Chain Temperature Log", status: "REQUIRED" },
  ];
  for (const d of docs) await db.document.create({ data: { ...d, tradeId: trade1.id } as any });

  const phases = [
    { phase: 0, label: "Foundation", description: "KYB verified, GTID issued, both parties onboarded", completed: true, cd: "2026-03-20" },
    { phase: 1, label: "Trade Initiation", description: "Buyer submitted trade request via Dynamic Product Form", completed: true, cd: "2026-04-01" },
    { phase: 2, label: "Quote, Packing & Logistics", description: "Seller locked EXW price, packing plan, selected Delta Freight & Maersk Levant", completed: true, cd: "2026-04-08" },
    { phase: 3, label: "Contracting & Fee Collection", description: "Contract signed (QES), SGTX fee $1,500 collected via PSP split", completed: true, cd: "2026-04-15" },
    { phase: 4, label: "Financing", description: "Not requested by seller", completed: true, cd: "2026-04-15" },
    { phase: 5, label: "Physical Execution", description: "Shipment 1 in transit (MSC Amsterdam). Shipment 2 loaded.", completed: false, cd: null },
    { phase: 6, label: "Settlement", description: "Pending delivery & customs clearance", completed: false, cd: null },
    { phase: 7, label: "Distressed Cargo", description: "Not applicable", completed: true, cd: "2026-04-15" },
    { phase: 8, label: "Dispute", description: "No disputes filed", completed: true, cd: "2026-04-15" },
  ];
  for (const p of phases) await db.timelineEvent.create({ data: { phase: p.phase, label: p.label, description: p.description, tradeId: trade1.id, actorGtid: p.completed ? "SGTX-EG-TRD-002139-7F3A" : null, completed: p.completed, completedAt: p.cd ? new Date(p.cd) : null } as any });

  const acts = [
    { actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "SUBMITTED_TRADE_REQUEST", description: "Submitted trade request for 20,000 kg frozen strawberries", type: "INFO" },
    { actorGtid: "SGTX-EG-TRD-002139-7F3A", action: "SUBMITTED_QUOTE", description: "Seller submitted quote: $5.00/kg EXW Cairo, CIF Hamburg", type: "INFO" },
    { actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "ACCEPTED_QUOTE", description: "Buyer accepted quote after negotiation (round 2)", type: "SUCCESS" },
    { actorGtid: "SGTX-EG-TRD-002139-7F3A", action: "SIGNED_CONTRACT", description: "Contract SC-2026-0491 signed via ZITADEL passkey (QES)", type: "SUCCESS" },
    { actorGtid: "SGTX-DE-TRD-001234-5B6C", action: "SIGNED_CONTRACT", description: "Counterparty signature confirmed — contract locked, USTN generated", type: "SUCCESS" },
    { actorGtid: null, action: "COLLECTED_FEE", description: "SGTX fee $1,500 collected via PSP split (non-custodial FeeLock)", type: "SUCCESS" },
    { actorGtid: "SGTX-EG-LSP-000120-4C7D", action: "CONFIRMED_MILESTONE", description: "Pallets loaded into container MSCU 4471823 at Cairo warehouse", type: "INFO" },
    { actorGtid: "SGTX-EG-QC-000022-8A1C", action: "PASSED_INSPECTION", description: "Pre-shipment QC inspection: PASS (0 defects, brix 9.2)", type: "SUCCESS" },
    { actorGtid: "SGTX-EG-LAB-000014-6F4D", action: "ISSUED_REPORT", description: "Pesticide residue report issued: PASS (all < MRL)", type: "SUCCESS" },
    { actorGtid: "SGTX-EG-CBR-000009-5E7B", action: "SUBMITTED_DECLARATION", description: "Export declaration EX-2026-88231 filed with Nafeza (SAD)", type: "INFO" },
    { actorGtid: "SGTX-EG-SHP-000031-9E8F", action: "DEPARTED", description: "MSC Amsterdam departed Alexandria → Hamburg (IMO 9778601)", type: "INFO" },
    { actorGtid: null, action: "DOC_MISSING", description: "Cold Chain Temperature Log required for shipment 1 (auto-detected)", type: "WARNING" },
  ];
  for (let i = 0; i < acts.length; i++) {
    const a = acts[i];
    await db.activity.create({ data: { ...a, tradeId: trade1.id, createdAt: new Date(Date.now() - (acts.length - i) * 3600 * 1000 * 4) } as any });
  }

  const inv = [
    { type: "COMMERCIAL", number: "INV-2026-0491", amountUsd: 100000, status: "APPROVED", payerGtid: "SGTX-DE-TRD-001234-5B6C", payeeGtid: "SGTX-EG-TRD-002139-7F3A", dueDate: "2026-05-15", paidAt: null },
    { type: "SGTX_FEE", number: "SGTX-FEE-0491", amountUsd: 1500, status: "PAID", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-PLATFORM", dueDate: null, paidAt: "2026-04-15" },
    { type: "LOGISTICS", number: "LSP-2026-0491", amountUsd: 4200, status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-LSP-000120-4C7D", dueDate: "2026-05-01", paidAt: null },
    { type: "BROKER", number: "CBR-2026-0491", amountUsd: 350, status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-CBR-000009-5E7B", dueDate: "2026-05-01", paidAt: null },
    { type: "LAB", number: "LAB-2026-0491", amountUsd: 280, status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-LAB-000014-6F4D", dueDate: "2026-05-01", paidAt: null },
    { type: "QC", number: "QC-2026-0491", amountUsd: 220, status: "PENDING", payerGtid: "SGTX-EG-TRD-002139-7F3A", payeeGtid: "SGTX-EG-QC-000022-8A1C", dueDate: "2026-05-01", paidAt: null },
  ];
  for (const x of inv) await db.invoice.create({ data: { type: x.type, number: x.number, amountUsd: x.amountUsd, status: x.status, payerGtid: x.payerGtid, payeeGtid: x.payeeGtid, tradeId: trade1.id, dueDate: x.dueDate ? new Date(x.dueDate) : null, paidAt: x.paidAt ? new Date(x.paidAt) : null } as any });

  await db.labTest.create({ data: { tradeId: trade1.id, labGtid: "SGTX-EG-LAB-000014-6F4D", testType: "PESTICIDE_RESIDUE", sampleRef: "SMP-0491-A", status: "COMPLETED", result: "All compounds below MRL thresholds", passFail: "PASS", parameters: JSON.stringify({ chlorpyrifos: "0.01 mg/kg (MRL 0.05)", boscalid: "0.32 mg/kg (MRL 3.0)", captan: "0.04 mg/kg (MRL 0.05)" }), completedAt: new Date("2026-04-12") } });
  await db.qcInspection.create({ data: { tradeId: trade1.id, qcGtid: "SGTX-EG-QC-000022-8A1C", inspectionType: "PRE_SHIPMENT", inspectorName: "Tarek Mansour", status: "COMPLETED", result: "PASS", defectCount: 0, notes: "Brix 9.2°, uniform size 25-32mm, color consistent, no signs of mould or bruising.", completedAt: new Date("2026-04-14") } });
  await db.customsDeclaration.create({ data: { tradeId: trade1.id, brokerGtid: "SGTX-EG-CBR-000009-5E7B", declarationNo: "EX-2026-88231", regime: "EXPORT", status: "CLEARED", dutyUsd: 0, nafezaStatus: "ACCEPTED", clearedAt: new Date("2026-04-16") } });

  await db.serviceQuotation.create({ data: { quoteId: "SQ-20260415-001", tradeId: trade1.id, ustn: ustn1, providerGtid: "SGTX-EG-CBR-000009-5E7B", providerType: "CBR", serviceType: "CERTIFICATION", feeUsd: 350, status: "ACCEPTED", description: "Customs clearance & EUR.1 certification", paymentStage: "STAGE1", acceptedByGtid: "SGTX-EG-TRD-002139-7F3A", acceptedAt: new Date("2026-04-10") } });
  await db.serviceQuotation.create({ data: { quoteId: "SQ-20260415-002", tradeId: trade1.id, ustn: ustn1, providerGtid: "SGTX-EG-LAB-000014-6F4D", providerType: "LAB", serviceType: "PESTICIDE_PANEL", feeUsd: 280, status: "ACCEPTED", description: "Pesticide residue panel (240 compounds)", sampleInstructions: "Send 500g frozen sample to Cairo lab, keep frozen, include USTN label.", paymentStage: "STAGE1", acceptedByGtid: "SGTX-EG-TRD-002139-7F3A", acceptedAt: new Date("2026-04-10") } });
  await db.serviceQuotation.create({ data: { quoteId: "SQ-20260415-003", tradeId: trade1.id, ustn: ustn1, providerGtid: "SGTX-EG-QC-000022-8A1C", providerType: "QC", serviceType: "PRE_SHIPMENT_INSPECTION", feeUsd: 220, status: "ACCEPTED", description: "Pre-shipment quality inspection at Cairo cold store", inspectionLocation: "Cairo Cold Store", paymentStage: "STAGE1", acceptedByGtid: "SGTX-EG-TRD-002139-7F3A", acceptedAt: new Date("2026-04-10") } });

  const msgs = [
    { senderGtid: "SGTX-DE-TRD-001234-5B6C", senderName: "Klaus Bergmann", message: "Good morning, we'd like to confirm the brix spec for the Senga Sengana lot. Target ≥ 9.0°." },
    { senderGtid: "SGTX-EG-TRD-002139-7F3A", senderName: "Mohamed Eltonsy", message: "Morning Klaus. Latest sample reads 9.2° — we can guarantee ≥ 9.0 across the lot." },
    { senderGtid: "SGTX-DE-TRD-001234-5B6C", senderName: "Klaus Bergmann", message: "Perfect. Proceed with 2-shipment schedule, CIF Hamburg as agreed." },
    { senderGtid: "SGTX-EG-TRD-002139-7F3A", senderName: "Mohamed Eltonsy", message: "Confirmed. Contract SC-2026-0491 ready for your signature." },
    { senderGtid: "AI", senderName: "SGTX Assistant", message: "Both parties have signed. USTN SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4 is now locked and embedded in all downstream documents.", isAi: true },
  ];
  for (let i = 0; i < msgs.length; i++) await db.tradeMessage.create({ data: { ...msgs[i], tradeId: trade1.id, createdAt: new Date(Date.now() - (msgs.length - i) * 3600 * 1000 * 8) } as any });

  // ---------- TRADE 2: Mekong Fresh lemons (distressed) ----------
  const ustn2 = "SGTX-3455B6C-9E3D1A2-20260502090000-X9Y8Z7W6";
  const trade2 = await db.trade.create({
    data: {
      ustn: ustn2, buyerGtid: "SGTX-EG-TRD-008842-1A2B", sellerGtid: "SGTX-VN-TRD-005521-3D9E",
      commodity: "Fresh Lemons (Distressed Lot)", commodityHs: "0805.50.00", incoterm: "FOB",
      grossWeightKg: 1440, netWeightKg: 1344, tradeValueUsd: 5400, currency: "USD",
      originPort: "Can Tho (VNCAN)", destPort: "Alexandria (EGALX)", originCountry: "VN", destCountry: "EG",
      phase: 7, status: "DISTRESSED", healthScore: 42, multiShipment: false, sgtxFeeUsd: 81, coldChain: false, containerCount: 1,
    },
  });
  await db.shipment.create({ data: { tradeId: trade2.id, ustn: ustn2, sequence: 1, containerNo: "CMAU 5510228", containerCount: 1, carrierGtid: "SGTX-EG-SHP-000031-9E8F", status: "ARRIVED", originPort: "Can Tho (VNCAN)", destPort: "Alexandria (EGALX)", eta: new Date("2026-05-08"), arrivedAt: new Date("2026-05-08"), lat: 31.19, lng: 29.86 } });
  await db.timelineEvent.create({ data: { tradeId: trade2.id, phase: 7, label: "Distressed Cargo", description: "Condition score 35, remaining shelf life 5 days. Accelerated outreach initiated to 3 saved buyers.", actorGtid: "SGTX-VN-TRD-005521-3D9E", completed: true, completedAt: new Date() } as any });

  // ---------- TRADE 3: Nile Foods multi-shipment ----------
  const ustn3 = "SGTX-8842A2B-5213D9E-20260418070000-P5Q6R7S8";
  const trade3 = await db.trade.create({
    data: {
      ustn: ustn3, buyerGtid: "SGTX-EG-TRD-008842-1A2B", sellerGtid: "SGTX-VN-TRD-005521-3D9E",
      commodity: "Fresh Citrus (Navel Oranges)", commodityHs: "0805.10.00", incoterm: "CFR",
      grossWeightKg: 63000, netWeightKg: 60000, tradeValueUsd: 24000, currency: "USD",
      originPort: "Can Tho (VNCAN)", destPort: "Alexandria (EGALX)", originCountry: "VN", destCountry: "EG",
      phase: 5, status: "IN_EXECUTION", healthScore: 76, multiShipment: true, sgtxFeeUsd: 360, containerCount: 3,
    },
  });
  const t3etd = ["2026-04-18", "2026-04-25", "2026-05-02"];
  const t3eta = ["2026-05-06", "2026-05-13", "2026-05-20"];
  for (let s = 1; s <= 3; s++) {
    await db.shipment.create({ data: { tradeId: trade3.id, ustn: ustn3, sequence: s, vesselName: s === 1 ? "MSC Amsterdam" : "Maersk Levant", containerNo: `CMAU ${5510000 + s}`, containerCount: 1, carrierGtid: "SGTX-EG-SHP-000031-9E8F", status: s === 1 ? "IN_TRANSIT" : "PLANNED", originPort: "Can Tho (VNCAN)", destPort: s === 2 ? "Port Said (EGPSD)" : "Alexandria (EGALX)", etd: new Date(t3etd[s - 1]), eta: new Date(t3eta[s - 1]), departedAt: s === 1 ? new Date("2026-04-18") : null, lat: 34.5 + s, lng: 20.0 + s } });
  }

  // ---------- TRADE 4: settled ----------
  const ustn4 = "SGTX-1234B6C-002139F-20260210060000-T1U2V3W4";
  const trade4 = await db.trade.create({
    data: {
      ustn: ustn4, buyerGtid: "SGTX-DE-TRD-001234-5B6C", sellerGtid: "SGTX-EG-TRD-002139-7F3A",
      commodity: "Frozen Strawberries (Senga Sengana)", commodityHs: "0811.10.00", incoterm: "CIF",
      grossWeightKg: 10750, netWeightKg: 10000, tradeValueUsd: 48000, currency: "USD",
      originPort: "Alexandria (EGALX)", destPort: "Hamburg (DEHAM)", originCountry: "EG", destCountry: "DE",
      phase: 6, status: "SETTLED", healthScore: 95, multiShipment: false, sgtxFeeUsd: 720, containerCount: 1,
    },
  });
  await db.shipment.create({ data: { tradeId: trade4.id, ustn: ustn4, sequence: 1, vesselName: "Hapag Vessel", containerNo: "HLXU 8821001", containerCount: 1, carrierGtid: "SGTX-DE-SHP-000058-2B3C", status: "DELIVERED", originPort: "Alexandria (EGALX)", destPort: "Hamburg (DEHAM)", eta: new Date("2026-02-28"), arrivedAt: new Date("2026-02-28"), releasedAt: new Date("2026-03-01") } });

  const fr = await db.financingRequest.create({ data: {
    requestId: "FR-20260502-001", tradeId: trade3.id, borrowerGtid: "SGTX-VN-TRD-005521-3D9E", shipmentSeq: 1, ustn: ustn3,
    amountUsd: 100000, totalTradeValue: 24000, financingType: "PRE_SHIPMENT", tenorDays: 60,
    preferredSettlement: "BANK_TRANSFER", preferredCurrency: "USD", collateralType: "GOODS",
    specialInstructions: "Seller needs working capital before harvest", status: "BIDDING_OPEN",
    creditScore: 84, defaultProbability: 7.5, recommendedLtv: 70,
    creditIntelligence: JSON.stringify({
      signals: {
        trade_performance: { on_time_payments: 12, dispute_rate: 0.0, doc_accuracy: 0.98 },
        corporate: { ubo_structure: "Single UBO, clean", sanctions_proximity: "LOW", pep_exposure: "NONE" },
        market: { country_risk: "STANDARD", commodity_trend: "+2.1% YoY" },
        behavioural: { responsiveness: "FAST", negotiation_style: "COOPERATIVE" }
      },
      narrative: "Borrower has 12 prior on-time repayments. Strong trade history with low sanctions proximity. Recommended 70% LTV."
    }),
    biddingWindowEndsAt: new Date(Date.now() + 4 * 3600 * 1000),
  } });
  await db.financingBid.create({ data: {
    bidId: "BID-20260502-001", requestId: fr.id, financierGtid: "SGTX-EG-BNK-000007-1F8D",
    amountOffered: 60000, apr: 4.8, settlementMethod: "BANK_TRANSFER", collateralRequired: "GOODS",
    noteToBorrower: "Standard pre-shipment facility against goods collateral.", isDeFi: false,
    matchScore: 94, encryptedPayload: "base64:enc-stub-bank-001", status: "SUBMITTED",
  } });
  await db.financingBid.create({ data: {
    bidId: "BID-20260502-002", requestId: fr.id, financierGtid: "SGTX-EG-PFI-000011-3C2E",
    amountOffered: 40000, apr: 5.2, settlementMethod: "BANK_TRANSFER", collateralRequired: "GOODS",
    noteToBorrower: "Co-financing tranche.", isDeFi: false,
    matchScore: 87, encryptedPayload: "base64:enc-stub-pfi-002", status: "SUBMITTED",
  } });

  // RFQ broadcast log (Part 3B.5.3)
  await db.financingRfqLog.create({ data: { requestId: fr.id, financierGtid: "SGTX-EG-BNK-000007-1F8D", matchScore: 94, deliveredVia: "INBOX", status: "VIEWED" } });
  await db.financingRfqLog.create({ data: { requestId: fr.id, financierGtid: "SGTX-EG-PFI-000011-3C2E", matchScore: 87, deliveredVia: "INBOX", status: "DELIVERED" } });

  // Financier preferences (Part 3B.5.3)
  await db.financierPreference.create({ data: {
    financierGtid: "SGTX-EG-BNK-000007-1F8D",
    acceptedBorrowerCountries: JSON.stringify(["EG", "VN", "DE", "AE", "SA"]),
    minTrustScore: 75, minTradeValue: 5000, maxFinancedPerRequest: 500000,
    preferredFinancingTypes: JSON.stringify(["PRE_SHIPMENT", "POST_SHIPMENT", "INVOICE_FINANCING"]),
    preferredSettlementMethods: JSON.stringify(["BANK_TRANSFER", "STABLECOIN"]),
    excludedCommodities: JSON.stringify([]),
    geographicMode: "ALL", minTrancheSize: 10000, defaultAprBenchmark: 5.0,
    enableDeFi: true, notificationsEnabled: true,
  } });
  await db.financierPreference.create({ data: {
    financierGtid: "SGTX-EG-PFI-000011-3C2E",
    acceptedBorrowerCountries: JSON.stringify(["EG", "VN", "DE"]),
    minTrustScore: 70, minTradeValue: 2000, maxFinancedPerRequest: 200000,
    preferredFinancingTypes: JSON.stringify(["PRE_SHIPMENT", "POST_SHIPMENT"]),
    preferredSettlementMethods: JSON.stringify(["BANK_TRANSFER"]),
    excludedCommodities: JSON.stringify([]),
    geographicMode: "ALL", minTrancheSize: 5000, defaultAprBenchmark: 5.5,
    enableDeFi: false, notificationsEnabled: true,
  } });

  // DeFi protocols (Part 3B.5.12)
  await db.deFiProtocol.create({ data: { name: "AAVE_V3", displayName: "Aave V3", chain: "Ethereum", riskScore: 88, tvlUsd: 9200000000, auditStatus: "AUDITED", governanceActivity: "ACTIVE", healthColor: "GREEN", contractAddress: "0x87870Bca3F3f6D5b2Bf7f8e8e8e8e8e8e8e8e8e8" } });
  await db.deFiProtocol.create({ data: { name: "COMPOUND", displayName: "Compound V3", chain: "Ethereum", riskScore: 82, tvlUsd: 2400000000, auditStatus: "AUDITED", governanceActivity: "ACTIVE", healthColor: "GREEN" } });
  await db.deFiProtocol.create({ data: { name: "MAKERDAO", displayName: "MakerDAO Spark", chain: "Ethereum", riskScore: 79, tvlUsd: 8100000000, auditStatus: "AUDITED", governanceActivity: "ACTIVE", healthColor: "YELLOW", lastExploit: "2024-03 — minor DSR adjustment dispute" } });

  // Stablecoin peg status
  await db.stablecoinStatus.create({ data: { symbol: "USDC", pegUsd: 1.0, deviationPct: 0.02, oracle: "CoinGecko", freezeNewPositions: false } });
  await db.stablecoinStatus.create({ data: { symbol: "USDT", pegUsd: 1.0, deviationPct: 0.08, oracle: "CoinGecko", freezeNewPositions: false } });
  await db.stablecoinStatus.create({ data: { symbol: "DAI", pegUsd: 1.0, deviationPct: 0.15, oracle: "CoinGecko", freezeNewPositions: false } });

  const inbox = [
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", tradeId: trade1.id, category: "NEEDS_DOCUMENT", priority: 92, title: "Cold Chain Temperature Log required", description: "Shipment 1 (MSC Amsterdam) is in transit but the cold chain log is missing.", ctaLabel: "Upload Log", deadline: new Date(Date.now() + 2 * 86400 * 1000) },
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", tradeId: trade1.id, category: "SHIPMENT_ALERT", priority: 78, title: "Shipment 1 crossed Suez checkpoint", description: "MSC Amsterdam passed the Suez Canal — 14 days to Hamburg.", ctaLabel: "View Map" },
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", tradeId: trade1.id, category: "NEEDS_PAYMENT", priority: 70, title: "Commercial invoice due in 6 days", description: "INV-2026-0491 for $100,000 is due 15 May. Settlement approval required.", ctaLabel: "Approve Settlement" },
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", tradeId: trade1.id, category: "NEEDS_SIGNATURE", priority: 88, title: "Logistics addendum awaiting signature", description: "Delta Freight addendum for trucking Cairo→Alexandria pending.", ctaLabel: "Sign Addendum", deadline: new Date(Date.now() + 1 * 86400 * 1000) },
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", tradeId: trade1.id, category: "NEEDS_APPROVAL", priority: 64, title: "QC conditional report uploaded", description: "Nile Quality Inspectors submitted the pre-shipment report for review.", ctaLabel: "Review Report" },
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", tradeId: trade1.id, category: "NEW_OFFER", priority: 55, title: "Container release authorised", description: "Maersk Levant authorised release of container MAEU 7812094 at Alexandria.", ctaLabel: "Confirm Pickup" },
    { tenantGtid: "SGTX-VN-TRD-005521-3D9E", tradeId: trade2.id, category: "NEW_OFFER", priority: 95, title: "Offer received for distressed lemons", description: "Nile Foods Group offered $4,020 for the 1,344 kg distressed lot (5 days shelf life).", ctaLabel: "Accept Offer", deadline: new Date(Date.now() + 18 * 3600 * 1000) },
    { tenantGtid: "SGTX-EG-LSP-000120-4C7D", tradeId: trade1.id, category: "NEEDS_APPROVAL", priority: 80, title: "Container pickup scheduled", description: "Pickup container MSCU 4471823 from Cairo cold store — 16 Apr 06:00.", ctaLabel: "Assign Driver" },
    { tenantGtid: "SGTX-EG-LAB-000014-6F4D", tradeId: trade1.id, category: "NEEDS_APPROVAL", priority: 60, title: "Lab report ready for release", description: "Pesticide residue panel complete — PASS. Release to seller?", ctaLabel: "Release Report" },
    { tenantGtid: "SGTX-EG-QC-000022-8A1C", tradeId: trade1.id, category: "NEEDS_DOCUMENT", priority: 72, title: "Upload inspection photos", description: "Pre-shipment inspection completed — 6 photos pending upload.", ctaLabel: "Upload Photos" },
    { tenantGtid: "SGTX-EG-CBR-000009-5E7B", tradeId: trade1.id, category: "COMPLIANCE", priority: 66, title: "EUR.1 certificate pending stamp", description: "Certificate of Origin awaiting chamber of commerce stamp.", ctaLabel: "Track Status" },
    { tenantGtid: "SGTX-EG-BNK-000007-1F8D", tradeId: trade3.id, category: "NEW_OFFER", priority: 58, title: "Financing bid window closing", description: "Mekong Fresh pre-shipment financing ($100,000) — bid window closes in 4h.", ctaLabel: "Review RFQ" },
    { tenantGtid: "SGTX-VN-TRD-005521-3D9E", tradeId: trade3.id, category: "NEW_OFFER", priority: 90, title: "2 financing bids received — accept co-financing", description: "BIDDING_OPEN for FR-20260502-001 ($100,000 pre-shipment). Bank $60k @4.8% + PFI $40k @5.2% = blended 4.96%. Window closes in 4h.", ctaLabel: "Review Bids", deadline: new Date(Date.now() + 4 * 3600 * 1000) },
    { tenantGtid: "SGTX-EG-PFI-000011-3C2E", tradeId: trade3.id, category: "NEW_OFFER", priority: 62, title: "New financing RFQ match (score 87)", description: "Mekong Fresh requests $100,000 pre-shipment financing. Your tranche size up to $200k matches.", ctaLabel: "View RFQ" },
    { tenantGtid: "SGTX-EG-GOV-000001-9A0B", tradeId: trade1.id, category: "NEEDS_APPROVAL", priority: 74, title: "Export declaration awaiting assessment", description: "EX-2026-88231 (Strawberry Export Co.) submitted via Nafeza — assess.", ctaLabel: "Open Declaration" },
    { tenantGtid: "SGTX-EG-GOV-000004-2D6E", tradeId: trade1.id, category: "COMPLIANCE", priority: 50, title: "FX settlement instruction received", description: "$100,000 cross-border flow flagged for CBE monitoring (USTN-linked).", ctaLabel: "Reconcile" },
  ];
  for (const it of inbox) await db.inboxItem.create({ data: it as any });
  console.log(`  ✓ ${inbox.length} inbox items`);

  const integ = [
    { name: "Nafeza (Customs)", category: "CUSTOMS", status: "OPERATIONAL", latencyMs: 380, errorRate: 0.3, uptime30d: 99.96, lastIncident: "No incidents in 30 days" },
    { name: "CargoX (Documents)", category: "DOCS", status: "OPERATIONAL", latencyMs: 520, errorRate: 0.5, uptime30d: 99.92, lastIncident: "Minor delay 2 days ago" },
    { name: "ETA (e-Invoice)", category: "PAYMENT", status: "OPERATIONAL", latencyMs: 290, errorRate: 0.2, uptime30d: 99.98, lastIncident: "None" },
    { name: "PSP — Visa", category: "PAYMENT", status: "DEGRADED", latencyMs: 1450, errorRate: 3.1, uptime30d: 98.80, lastIncident: "Elevated latency since 09:12 UTC" },
    { name: "PSP — Mastercard", category: "PAYMENT", status: "OPERATIONAL", latencyMs: 410, errorRate: 0.4, uptime30d: 99.94, lastIncident: "None" },
    { name: "CBE Settlement", category: "BANK", status: "OPERATIONAL", latencyMs: 680, errorRate: 0.1, uptime30d: 99.99, lastIncident: "None" },
    { name: "AIS Vessel Tracking", category: "LOGISTICS", status: "OPERATIONAL", latencyMs: 240, errorRate: 0.6, uptime30d: 99.91, lastIncident: "Satellite gap 6 days ago" },
  ];
  for (const x of integ) await db.integrationHealth.create({ data: x as any });
  console.log(`  ✓ ${integ.length} integrations`);

  await db.dispute.create({ data: { tradeId: trade4.id, type: "QUALITY", status: "RESOLVED", filedByGtid: "SGTX-DE-TRD-001234-5B6C", claimAmountUsd: 960, description: "2 pallets showed minor frost build-up on arrival. Claimed 2% of invoice.", evidenceCount: 5, aiRootCause: "Reefer set to -18°C vs contract -20°C; carrier accepted liability.", resolution: "Carrier credited $960 to buyer via PSP split. Trade settled." } });

  // ---------- JURISDICTION MATRIX (Part 1.7) ----------
  const jurisdictions = [
    { countryCode: "EG", countryName: "Egypt", tier: "STANDARD", defiAllowed: false, pspList: JSON.stringify(["PayMob", "Fawry", "CBE-IPN"]), notes: "DeFi prohibited by CBE regulation" },
    { countryCode: "DE", countryName: "Germany", tier: "FULL", defiAllowed: true, pspList: JSON.stringify(["Visa", "Mastercard", "SEPA"]), notes: "EU MiCA compliant" },
    { countryCode: "VN", countryName: "Vietnam", tier: "STANDARD", defiAllowed: true, pspList: JSON.stringify(["VNPay", "Visa"]), notes: null },
    { countryCode: "US", countryName: "United States", tier: "FULL", defiAllowed: true, pspList: JSON.stringify(["Visa", "Mastercard", "FedNow"]), notes: "FinCEN registered" },
    { countryCode: "AE", countryName: "UAE", tier: "LIMITED", defiAllowed: true, pspList: JSON.stringify(["Network International"]), notes: "Pre-approved corridors only" },
    { countryCode: "IR", countryName: "Iran", tier: "BLOCKED", defiAllowed: false, pspList: JSON.stringify([]), notes: "OFAC sanctioned — all requests DENY" },
    { countryCode: "SY", countryName: "Syria", tier: "BLOCKED", defiAllowed: false, pspList: JSON.stringify([]), notes: "OFAC/UN sanctioned" },
    { countryCode: "RU", countryName: "Russia", tier: "RESTRICTED", defiAllowed: false, pspList: JSON.stringify(["MIR"]), notes: "Enhanced due diligence required" },
    { countryCode: "CN", countryName: "China", tier: "STANDARD", defiAllowed: true, pspList: JSON.stringify(["UnionPay", "Alipay"]), notes: null },
    { countryCode: "SA", countryName: "Saudi Arabia", tier: "STANDARD", defiAllowed: true, pspList: JSON.stringify(["mada", "Visa"]), notes: null },
  ];
  for (const j of jurisdictions) await db.jurisdiction.create({ data: j as any });
  console.log(`  ✓ ${jurisdictions.length} jurisdictions`);

  // ---------- SAVED CONTACTS (Part 2.6) ----------
  const contacts = [
    { ownerGtid: "SGTX-EG-TRD-002139-7F3A", contactGtid: "SGTX-DE-TRD-001234-5B6C", contactName: "European Importer GmbH", contactType: "TRD", relationship: "buyer", trustPortrait: "European Importer GmbH has been a reliable buyer for 8 months. On-time payment rate 100%.", healthScore: 88, totalTrades: 2 },
    { ownerGtid: "SGTX-DE-TRD-001234-5B6C", contactGtid: "SGTX-EG-TRD-002139-7F3A", contactName: "Strawberry Export Co.", contactType: "TRD", relationship: "seller", trustPortrait: "Strawberry Export Co. has delivered 3 shipments with 98% quality acceptance. Reliable exporter.", healthScore: 92, totalTrades: 2 },
    { ownerGtid: "SGTX-EG-TRD-002139-7F3A", contactGtid: "SGTX-EG-LSP-000120-4C7D", contactName: "Delta Freight & Forwarding", contactType: "LSP", relationship: "provider", trustPortrait: "Delta Freight has handled 5 container pickups with zero delays.", healthScore: 84, totalTrades: 5 },
    { ownerGtid: "SGTX-EG-TRD-002139-7F3A", contactGtid: "SGTX-EG-SHP-000031-9E8F", contactName: "Maersk Levant Line", contactType: "SHIP", relationship: "provider", trustPortrait: "Maersk Levant has shipped 8 containers with 100% on-time arrival.", healthScore: 95, totalTrades: 8 },
    { ownerGtid: "SGTX-EG-TRD-002139-7F3A", contactGtid: "SGTX-EG-CBR-000009-5E7B", contactName: "Pyramid Customs Brokers", contactType: "CBR", relationship: "provider", trustPortrait: "Pyramid Customs has cleared 12 declarations with zero holds.", healthScore: 91, totalTrades: 12 },
    { ownerGtid: "SGTX-VN-TRD-005521-3D9E", contactGtid: "SGTX-EG-TRD-008842-1A2B", contactName: "Nile Foods Group", contactType: "TRD", relationship: "buyer", trustPortrait: "Nile Foods accepted a distressed lot offer within 6 hours. Responsive buyer.", healthScore: 79, totalTrades: 1 },
  ];
  for (const c of contacts) await db.savedContact.create({ data: c as any });
  console.log(`  ✓ ${contacts.length} saved contacts`);

  // ---------- TRADE READINESS (Part 2.8) ----------
  const readiness = [
    { tenantGtid: "SGTX-EG-TRD-002139-7F3A", score: 87, companyScore: 100, bankingScore: 50, tradeScore: 100, securityScore: 100, legalScore: 0, checklist: JSON.stringify({ company: "4/4 done", banking: "1/2 — settlement pending", trade: "3/3 done", security: "2/2 done", legal: "fee ack pending" }), lastCalculated: new Date() },
    { tenantGtid: "SGTX-DE-TRD-001234-5B6C", score: 72, companyScore: 100, bankingScore: 50, tradeScore: 100, securityScore: 100, legalScore: 0, checklist: JSON.stringify({ company: "4/4", banking: "1/2", trade: "3/3", security: "2/2", legal: "pending" }), lastCalculated: new Date() },
    { tenantGtid: "SGTX-VN-TRD-005521-3D9E", score: 95, companyScore: 100, bankingScore: 100, tradeScore: 100, securityScore: 100, legalScore: 100, checklist: JSON.stringify({ company: "4/4", banking: "2/2", trade: "3/3", security: "2/2", legal: "done" }), lastCalculated: new Date() },
  ];
  for (const r of readiness) await db.tradeReadiness.create({ data: r as any });
  console.log(`  ✓ ${readiness.length} readiness records`);

  // ---------- SAR (Part 1.12) ----------
  await db.suspiciousActivityReport.create({ data: { reportType: "EG_AML", detectionRule: "value_mismatch", involvedUstns: JSON.stringify([ustn3]), parties: JSON.stringify({ buyer_gtid: "SGTX-EG-TRD-008842-1A2B", seller_gtid: "SGTX-VN-TRD-005521-3D9E" }), narrative: "Trade value $24,000 for 60,000 kg citrus shows unit price of $0.40/kg, significantly below market average of $0.65/kg. Potential under-invoicing for customs evasion. Recommend enhanced review of commercial invoice and cross-reference with public market indices.", draftStatus: "DRAFT" } });
  console.log(`  ✓ 1 SAR draft`);

  // ---------- PART 9 — Provider Service Catalogue + Performance + Incoterm Mapping ----------
  const catalogues = [
    { providerGtid: "SGTX-EG-LSP-000120-4C7D", providerType: "LSP", serviceName: "Beheira → Damietta (Reefer)", serviceType: "TRUCKING", route: "Beheira → Damietta", vehicleType: "Reefer", feeUsd: 0.85, feeUnit: "per_km", transitDays: 0 },
    { providerGtid: "SGTX-EG-LSP-000120-4C7D", providerType: "LSP", serviceName: "Cairo → Alexandria (Dry van)", serviceType: "TRUCKING", route: "Cairo → Alexandria", vehicleType: "Dry van", feeUsd: 0.65, feeUnit: "per_km", transitDays: 0 },
    { providerGtid: "SGTX-EG-SHP-000031-9E8F", providerType: "SHIP", serviceName: "Damietta → Hamburg (40ft Reefer)", serviceType: "OCEAN_FREIGHT", route: "Damietta → Hamburg", containerType: "40ft Reefer", feeUsd: 4200, feeUnit: "per_container", transitDays: 14, sailingFreq: "Weekly" },
    { providerGtid: "SGTX-EG-SHP-000031-9E8F", providerType: "SHIP", serviceName: "Alexandria → Rotterdam (20ft Dry)", serviceType: "OCEAN_FREIGHT", route: "Alexandria → Rotterdam", containerType: "20ft Dry", feeUsd: 2800, feeUnit: "per_container", transitDays: 12, sailingFreq: "Twice weekly" },
    { providerGtid: "SGTX-EG-LAB-000014-6F4D", providerType: "LAB", serviceName: "Pesticide Panel (Basic)", serviceType: "PESTICIDE_PANEL", feeUsd: 200, feeUnit: "per_test", analytes: JSON.stringify(["Cypermethrin", "Chlorpyrifos", "Thiabendazole"]) },
    { providerGtid: "SGTX-EG-LAB-000014-6F4D", providerType: "LAB", serviceName: "Microbiological Panel", serviceType: "MICROBIOLOGICAL", feeUsd: 150, feeUnit: "per_test", analytes: JSON.stringify(["E. coli", "Salmonella", "Listeria"]) },
    { providerGtid: "SGTX-EG-QC-000022-8A1C", providerType: "QC", serviceName: "Fresh Fruit Visual Inspection", serviceType: "VISUAL_INSPECTION", feeUsd: 500, feeUnit: "flat", aqlLevel: "General Level II" },
    { providerGtid: "SGTX-EG-CBR-000009-5E7B", providerType: "CBR", serviceName: "Certification Service", serviceType: "CERTIFICATION", feeUsd: 150, feeUnit: "flat" },
    { providerGtid: "SGTX-EG-CBR-000009-5E7B", providerType: "CBR", serviceName: "Physical Document Handling", serviceType: "PHYSICAL_HANDLING", feeUsd: 85, feeUnit: "flat" },
  ];
  for (const c of catalogues) await db.providerServiceCatalogue.create({ data: c });
  console.log(`  ✓ ${catalogues.length} service catalogue entries`);

  const performances = [
    { providerGtid: "SGTX-EG-LSP-000120-4C7D", onTimeDeliveryPct: 92, disputeRate: 0.02, invoiceAccuracyPct: 98, riskScore: 84, totalJobs: 45, completedJobs: 42, avgTurnaroundDays: 1.5, benchmarkQuartile: 1, performanceSummary: "Your on-time performance is 92%, placing you in the top quartile for trucking providers in Egypt. Invoice accuracy is excellent at 98%." },
    { providerGtid: "SGTX-EG-SHP-000031-9E8F", onTimeDeliveryPct: 95, disputeRate: 0.01, invoiceAccuracyPct: 99, riskScore: 95, totalJobs: 120, completedJobs: 116, avgTurnaroundDays: 14, benchmarkQuartile: 1, performanceSummary: "On-time departure rate 95% across 120 shipments. eBL issuance latency averages 2.1 hours — excellent performance." },
    { providerGtid: "SGTX-EG-LAB-000014-6F4D", onTimeDeliveryPct: 88, disputeRate: 0.03, invoiceAccuracyPct: 96, riskScore: 90, totalJobs: 67, completedJobs: 65, avgTurnaroundDays: 2.5, benchmarkQuartile: 2, performanceSummary: "Average turnaround 2.5 days for pesticide panels. Dispute rate 3% (1 disputed result in last 67 tests). ISO 17025 accredited." },
    { providerGtid: "SGTX-EG-QC-000022-8A1C", onTimeDeliveryPct: 85, disputeRate: 0.05, invoiceAccuracyPct: 94, riskScore: 87, totalJobs: 34, completedJobs: 32, avgTurnaroundDays: 1, benchmarkQuartile: 2, performanceSummary: "Override rate 8% (3 of 34 inspections had AI findings overridden). All overrides had valid reasons ≥10 chars." },
    { providerGtid: "SGTX-EG-CBR-000009-5E7B", onTimeDeliveryPct: 97, disputeRate: 0.01, invoiceAccuracyPct: 99, riskScore: 91, totalJobs: 89, completedJobs: 88, avgTurnaroundDays: 0.5, benchmarkQuartile: 1, performanceSummary: "Certification accuracy 97% (2 customs rejections in 89 declarations). Average handling time 0.5 days." },
  ];
  for (const p of performances) await db.providerPerformance.create({ data: p });
  console.log(`  ✓ ${performances.length} performance records`);

  // Incoterm service mapping (spec 9.7 table)
  const incotermMappings = [
    { incoterm: "EXW", servicesJson: JSON.stringify({ trucking: "optional", export_customs: "optional", thc: "no", ocean_freight: "no", insurance: "optional", destination_charges: "no", duties: "no" }) },
    { incoterm: "FOB", servicesJson: JSON.stringify({ trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "no", insurance: "optional", destination_charges: "no", duties: "no" }) },
    { incoterm: "CFR", servicesJson: JSON.stringify({ trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "no", duties: "no" }) },
    { incoterm: "CIF", servicesJson: JSON.stringify({ trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "mandatory", destination_charges: "no", duties: "no" }) },
    { incoterm: "DAP", servicesJson: JSON.stringify({ trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "no" }) },
    { incoterm: "DDP", servicesJson: JSON.stringify({ trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "mandatory" }) },
  ];
  for (const m of incotermMappings) await db.incotermServiceMapping.create({ data: m });
  console.log(`  ✓ ${incotermMappings.length} incoterm service mappings`);

  console.log("✅ SGTX seed complete.");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => db.$disconnect());
