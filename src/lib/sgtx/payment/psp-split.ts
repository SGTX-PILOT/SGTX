// SGTX Part 6.1-6.5 — PSP Split Instruction Generator & Payment Orchestrator
// Non-custodial: SGTX only creates split instructions and passes them to the PSP.
// The licensed PSP (Fawry, PayMob, Stripe, CBE IPN) holds funds and executes transfers.
//
// Two-stage model:
//   STAGE1 (pre-shipment): SGTX fee + customs + phyto + NFSA + COO + lab + broker + LSP + port + CargoX + insurance
//   STAGE2 (post-departure): Ocean freight + destination THC + import clearance
//
// Idempotency Key Standard (Part 6.12): SHA256(canonical_body + utc_second)
// Format: idempotency_key = SHA256(JSON.stringify(body) + ISO_UTC_second)

import { db } from "@/lib/db";
import { createHash } from "crypto";
import { createFeeLock, activateFeeLock } from "./fealock";

// ============ Payee Reference Map (Part 6.1.1) ============
// Each payee has an IBAN/account reference used in the split instruction.
// These mirror the Egyptian government / commercial payee accounts.
const PAYEE_ACCOUNTS: Record<string, { iban?: string; account?: string; bic?: string; type: string }> = {
  "SGTX-PLATFORM":     { iban: "EG1001000005001", account: "SGTX-OPS-USD-001", bic: "NBEGEGCX", type: "platform" },
  "EG-CUSTOMS":        { iban: "EG380010000000000123456", account: "EGY-CUSTOMS-REV", bic: "NBEGEGCX", type: "government" },
  "EG-PLANT-QUARANTINE": { iban: "EG380010000000000234567", account: "PQ-EGY-REV", bic: "NBEGEGCX", type: "government" },
  "EG-NFSA":           { iban: "EG380010000000000345678", account: "NFSA-EGY-REV", bic: "NBEGEGCX", type: "government" },
  "EG-CHAMBER":        { iban: "EG380010000000000456789", account: "CHAMBER-COO-REV", bic: "NBEGEGCX", type: "government" },
  "EG-PORT":           { iban: "EG380010000000000567890", account: "PORT-THC-REV", bic: "NBEGEGCX", type: "port" },
  "CARGOX":            { iban: "EG380010000000000678901", account: "CARGOX-ACI-REV", bic: "NBEGEGCX", type: "aci" },
  "INSURECO":          { iban: "EG380010000000000789012", account: "INSURECO-CARGO", bic: "NBEGEGCX", type: "insurance" },
};

// PSP provider list (Part 6.5.2)
export const PSP_PROVIDERS = ["FAWRY", "PAYMOB", "STRIPE", "CBE_IPN"] as const;
export type PspProvider = typeof PSP_PROVIDERS[number];

// ============ M5: Optional services 3% platform fee (blueprint fee model) ============
// Optional services (lab add-ons, QC upgrades, etc.) carry a 3% SGTX platform commission
// ON TOP OF the 1.5% per-side base fee. The 3% is calculated against the optional-service
// quotation amount the buyer opted into at trade-request time.
export const OPTIONAL_SERVICES_PLATFORM_FEE_RATE = 0.03;

/**
 * Sums feeUsd for accepted optional-service quotations and returns 3% of that sum as the
 * SGTX platform fee. Optional services are identified by providerType LAB/QC AND a
 * serviceType marker (OPTIONAL / UPGRADE / ADDON / EXTRA). When the trade record carries
 * an explicit `optionalServicesTotalUsd` (collected by the trade-request wizard), that
 * value is preferred when it exceeds the sum-of-quotations total — this covers trades
 * where the UI captured the opt-in directly without per-test quotations.
 */
export function calculateOptionalServicesFee(
  quotations: Array<{ providerType: string; serviceType?: string | null; status: string; feeUsd: number }>,
  fallbackTotal?: number | null,
): number {
  const accepted = quotations.filter(q => q.status === "ACCEPTED");
  let optionalTotal = 0;
  for (const q of accepted) {
    const isOptionalType = q.providerType === "LAB" || q.providerType === "QC";
    const isOptionalService =
      (q.serviceType && /OPTIONAL|UPGRADE|ADDON|EXTRA/i.test(q.serviceType)) || false;
    if (isOptionalType && isOptionalService) {
      optionalTotal += q.feeUsd || 0;
    }
  }
  if (typeof fallbackTotal === "number" && fallbackTotal > optionalTotal) {
    optionalTotal = fallbackTotal;
  }
  return Math.round(optionalTotal * OPTIONAL_SERVICES_PLATFORM_FEE_RATE * 100) / 100;
}

// ============ 6.1.1: calculateStage1Fees ============
// Queries Trade + ServiceQuotation + LabTest/QcInspection/CustomsDeclaration
// Returns the full Stage 1 fee breakdown per Part 6.1.1.
export async function calculateStage1Fees(ustn: string): Promise<{
  sgtxFee: number;
  optionalServicesPlatformFee: number;
  customsFee: number;
  quarantineFee: number;
  nfsaFee: number;
  chamberFee: number;
  labFee: number;
  brokerFee: number;
  lspFee: number;
  portFee: number;
  cargoxFee: number;
  insuranceFee: number;
  total: number;
  tradeValueUsd: number;
  containerCount: number;
  originCountry: string;
}> {
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: {
      shipments: true,
      quotations: true,
      customsDecls: true,
      labTests: true,
      qcInspections: true,
    },
  });
  if (!trade) throw new Error(`TRADE_NOT_FOUND for USTN ${ustn}`);

  const containerCount = Math.max(1, trade.containerCount);

  // SGTX platform fee = 1.5% of trade value (Part 6.0 fee model)
  const sgtxFee = trade.sgtxFeeUsd ?? trade.tradeValueUsd * 0.015;

  // M5 fix — 3% platform fee on optional services (lab add-ons, QC upgrades) per blueprint.
  // Optional-services total comes from accepted LAB/QC quotations marked as optional, OR
  // from trade.optionalServicesTotalUsd when the trade-request wizard captured it directly.
  const optionalServicesPlatformFee = calculateOptionalServicesFee(
    trade.quotations as unknown as Array<{ providerType: string; serviceType?: string | null; status: string; feeUsd: number }>,
    trade.optionalServicesTotalUsd ?? null,
  );

  // Customs inspection fee — $200 per container (Part 6.1.1)
  const customsFee = 200 * containerCount;

  // Phytosanitary certificate — $50 per trade
  const quarantineFee = 50;

  // NFSA health certificate — $40 per trade
  const nfsaFee = 40;

  // Chamber of Commerce Certificate of Origin — $25 per trade
  const chamberFee = 25;

  // Port Terminal Handling Charge (THC) — $150 per container
  const portFee = 150 * containerCount;

  // CargoX ACI filing fee — $30 per trade
  const cargoxFee = 30;

  // Insurance — $200 default if cold chain (perishable)
  const insuranceFee = trade.coldChain ? 200 : 0;

  // Service quotation-derived fees (lab / broker / LSP)
  // Pick the most recent ACCEPTED quotation per provider type.
  const acceptedQuotes = trade.quotations.filter(q => q.status === "ACCEPTED");
  const pickQuote = (type: string) => {
    const matches = acceptedQuotes.filter(q => q.providerType === type);
    if (matches.length === 0) return 0;
    matches.sort((a, b) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0));
    return matches[0].feeUsd;
  };

  const labFee = pickQuote("LAB") || (trade.labTests.length > 0 ? 200 : 0);
  const brokerFee = pickQuote("CBR") || (trade.customsDecls.some(d => d.brokerGtid) ? 150 : 0);
  const lspFee = pickQuote("LSP") || 300;

  const total =
    sgtxFee + optionalServicesPlatformFee + customsFee + quarantineFee + nfsaFee + chamberFee +
    labFee + brokerFee + lspFee + portFee + cargoxFee + insuranceFee;

  return {
    sgtxFee,
    optionalServicesPlatformFee,
    customsFee,
    quarantineFee,
    nfsaFee,
    chamberFee,
    labFee,
    brokerFee,
    lspFee,
    portFee,
    cargoxFee,
    insuranceFee,
    total,
    tradeValueUsd: trade.tradeValueUsd,
    containerCount,
    originCountry: trade.originCountry,
  };
}

// ============ 6.2: calculateStage2Fees ============
// Post-departure: ocean freight + destination THC + import clearance
export async function calculateStage2Fees(ustn: string): Promise<{
  oceanFreight: number;
  destinationThc: number;
  importClearance: number;
  total: number;
  tradeValueUsd: number;
  incoterm: string;
  creditTerms: boolean;
}> {
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: { shipments: true, quotations: true },
  });
  if (!trade) throw new Error(`TRADE_NOT_FOUND for USTN ${ustn}`);

  // Ocean freight — from accepted SHIP quotation, default $4,200 per container
  const shipQuote = trade.quotations
    .filter(q => q.providerType === "SHIP" && q.status === "ACCEPTED")
    .sort((a, b) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0))[0];
  const oceanFreight = shipQuote?.feeUsd ?? 4200 * Math.max(1, trade.containerCount);

  // Destination THC — applies for DAP/DPU/DDP incoterms
  const ddpLike = ["DAP", "DPU", "DDP"].includes(trade.incoterm);
  const destinationThc = ddpLike ? 300 * Math.max(1, trade.containerCount) : 0;

  // Import clearance broker (if buyer-selected)
  const cbrQuote = trade.quotations
    .filter(q => q.providerType === "CBR" && q.serviceType === "IMPORT_CLEARANCE" && q.status === "ACCEPTED")
    .sort((a, b) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0))[0];
  const importClearance = cbrQuote?.feeUsd ?? (ddpLike ? 200 : 0);

  // Credit terms — freight often on 30-day credit
  const creditTerms = trade.paymentTerms === "LC" || trade.paymentTerms === "CAD";

  return {
    oceanFreight,
    destinationThc,
    importClearance,
    total: oceanFreight + destinationThc + importClearance,
    tradeValueUsd: trade.tradeValueUsd,
    incoterm: trade.incoterm,
    creditTerms,
  };
}

// ============ 6.1.3: generateSplitInstruction ============
// Returns the PSP split JSON array per Part 6.1.3 schema:
//   { payee_gtid, amount, description, iban, account, type, stage }
export async function generateSplitInstruction(
  ustn: string,
  stage: "STAGE1" | "STAGE2"
): Promise<{
  ustn: string;
  stage: string;
  total_amount: number;
  currency: string;
  splits: Array<{
    payee_gtid: string;
    amount: number;
    description: string;
    iban?: string;
    account?: string;
    bic?: string;
    type: string;
    stage: string;
    terms?: string;
    due_date?: string;
  }>;
}> {
  if (stage === "STAGE1") {
    const f = await calculateStage1Fees(ustn);
    const trade = await db.trade.findUnique({ where: { ustn } });
    const sellerGtid = trade?.sellerGtid ?? "SGTX-EG-TRD-002139-7F3A";

    // Lab/broker/LSP payee GTIDs come from accepted quotations
    const acceptedQuotes = (trade ? await db.serviceQuotation.findMany({
      where: { ustn, status: "ACCEPTED" },
    }) : []);
    const quoteByType = (type: string) =>
      acceptedQuotes
        .filter(q => q.providerType === type)
        .sort((a, b) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0))[0];

    const labQuote = quoteByType("LAB");
    const brokerQuote = quoteByType("CBR");
    const lspQuote = quoteByType("LSP");

    const payeeRef = (key: string) => PAYEE_ACCOUNTS[key] ?? { type: "commercial" };

    const splits = [
      { payee_gtid: "SGTX-PLATFORM", amount: f.sgtxFee, description: "SGTX platform fee (1.5%)", ...payeeRef("SGTX-PLATFORM"), stage: "STAGE1" },
      ...(f.optionalServicesPlatformFee > 0 ? [{
        payee_gtid: "SGTX-PLATFORM",
        amount: f.optionalServicesPlatformFee,
        description: `SGTX platform fee (${(OPTIONAL_SERVICES_PLATFORM_FEE_RATE * 100).toFixed(0)}% optional services)`,
        ...payeeRef("SGTX-PLATFORM"),
        stage: "STAGE1",
      }] : []),
      { payee_gtid: "EG-CUSTOMS", amount: f.customsFee, description: "Customs inspection fee", ...payeeRef("EG-CUSTOMS"), stage: "STAGE1" },
      { payee_gtid: "EG-PLANT-QUARANTINE", amount: f.quarantineFee, description: "Phytosanitary certificate", ...payeeRef("EG-PLANT-QUARANTINE"), stage: "STAGE1" },
      { payee_gtid: "EG-NFSA", amount: f.nfsaFee, description: "Health certificate", ...payeeRef("EG-NFSA"), stage: "STAGE1" },
      { payee_gtid: "EG-CHAMBER", amount: f.chamberFee, description: "Certificate of Origin", ...payeeRef("EG-CHAMBER"), stage: "STAGE1" },
      { payee_gtid: labQuote?.providerGtid ?? "SGTX-EG-LAB-001", amount: f.labFee, description: "Laboratory test panel", type: "lab", stage: "STAGE1" },
      { payee_gtid: brokerQuote?.providerGtid ?? "SGTX-EG-CBR-001", amount: f.brokerFee, description: "Broker certification", type: "broker", stage: "STAGE1" },
      { payee_gtid: lspQuote?.providerGtid ?? "SGTX-EG-LSP-001", amount: f.lspFee, description: "Trucking (farm to port)", type: "lsp", stage: "STAGE1" },
      { payee_gtid: "EG-PORT", amount: f.portFee, description: "Terminal Handling Charge (THC)", ...payeeRef("EG-PORT"), stage: "STAGE1" },
      { payee_gtid: "CARGOX", amount: f.cargoxFee, description: "ACI filing fee", ...payeeRef("CARGOX"), stage: "STAGE1" },
      ...(f.insuranceFee > 0 ? [{ payee_gtid: "INSURECO", amount: f.insuranceFee, description: "Cargo insurance", ...payeeRef("INSURECO"), stage: "STAGE1" }] : []),
    ];

    return {
      ustn,
      stage: "STAGE1",
      total_amount: f.total,
      currency: "USD",
      splits,
    };
  }

  // STAGE2
  const f = await calculateStage2Fees(ustn);
  const trade = await db.trade.findUnique({
    where: { ustn },
    include: { shipments: true, quotations: true },
  });
  const shipQuote = (trade?.quotations ?? [])
    .filter((q: any) => q.providerType === "SHIP" && q.status === "ACCEPTED")
    .sort((a: any, b: any) => (b.acceptedAt?.getTime() ?? 0) - (a.acceptedAt?.getTime() ?? 0))[0];
  const shipGtid = shipQuote?.providerGtid ?? "SGTX-EG-SHIP-001";

  const splits: any[] = [{
    payee_gtid: shipGtid,
    amount: f.oceanFreight,
    description: "Ocean freight",
    type: "shipping",
    stage: "STAGE2",
    terms: f.creditTerms ? "CREDIT" : "MANDATORY",
    due_date: f.creditTerms ? new Date(Date.now() + 30 * 86400 * 1000).toISOString().slice(0, 10) : undefined,
  }];
  if (f.destinationThc > 0) {
    splits.push({ payee_gtid: "EG-PORT", amount: f.destinationThc, description: "Destination THC", ...PAYEE_ACCOUNTS["EG-PORT"], stage: "STAGE2" });
  }
  if (f.importClearance > 0) {
    splits.push({ payee_gtid: "SGTX-DE-CBR-001", amount: f.importClearance, description: "Import clearance", type: "broker", stage: "STAGE2" });
  }

  return {
    ustn,
    stage: "STAGE2",
    total_amount: f.total,
    currency: "USD",
    splits,
  };
}

// ============ 6.12: Idempotency Key ============
// SHA256(canonical_body + utc_second_truncated)
export function generateIdempotencyKey(body: any): string {
  const canonical = JSON.stringify(body, Object.keys(body).sort());
  const tsSecond = new Date().toISOString().slice(0, 19) + "Z";
  return createHash("sha256").update(canonical + tsSecond).digest("hex");
}

// ============ 6.5.1: PSP Router (A2 LightGBM + Groq) ============
// Selects optimal PSP based on payer country, amount, currency, real-time health.
// Simplified deterministic router — in production this calls the A2 inference engine.
export async function selectOptimalPsp(
  payerCountry: string,
  amount: number,
  currency: string
): Promise<{ provider: PspProvider; reason: string; fallbackChain: PspProvider[] }> {
  // Egypt EGP — Fawry primary (lowest cost)
  if (payerCountry === "EG" && currency === "EGP") {
    return { provider: "FAWRY", reason: "Lowest cost for EGP transactions. Settlement 1-2 days.", fallbackChain: ["PAYMOB", "CBE_IPN"] };
  }
  // Egypt USD — Stripe primary (international)
  if (payerCountry === "EG" && currency === "USD") {
    return { provider: "STRIPE", reason: "Best USD routing for Egyptian exporters. Direct SWIFT settlement.", fallbackChain: ["PAYMOB"] };
  }
  // EU / Germany
  if (["DE", "FR", "IT", "ES", "NL"].includes(payerCountry)) {
    return { provider: "STRIPE", reason: "SEPA + card network coverage. Lowest FX spread for EUR.", fallbackChain: ["PAYMOB"] };
  }
  // UAE
  if (payerCountry === "AE") {
    return { provider: "STRIPE", reason: "UAE-licensed USD corridor.", fallbackChain: ["PAYMOB"] };
  }
  // Default — large amounts use CBE IPN for direct bank-to-bank
  if (amount > 50000) {
    return { provider: "CBE_IPN", reason: "High-value instant bank-to-bank transfer.", fallbackChain: ["FAWRY", "PAYMOB"] };
  }
  return { provider: "STRIPE", reason: "Default international routing.", fallbackChain: ["PAYMOB", "FAWRY"] };
}

// ============ 6.1.2: processPspSplit ============
// Creates PaymentAttempt (idempotent), simulates PSP processing,
// activates FeeLock on success. Persists FeeCalculation for audit.
export async function processPspSplit(
  ustn: string,
  stage: "STAGE1" | "STAGE2",
  pspProvider: PspProvider
): Promise<{
  ok: boolean;
  paymentAttemptId: string;
  pspReference: string;
  idempotencyKey: string;
  feeLockStatus: string;
  splitInstruction: any;
  processed: boolean;
}> {
  // 1. Generate split instruction
  const splitInstruction = await generateSplitInstruction(ustn, stage);

  // 2. Idempotency key (Part 6.12)
  const idempotencyKey = generateIdempotencyKey({ ustn, stage, pspProvider, total: splitInstruction.total_amount });

  // 3. Check for existing attempt with same key — idempotent return
  const existing = await db.paymentAttempt.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return {
      ok: existing.status === "COMPLETED",
      paymentAttemptId: existing.id,
      pspReference: existing.pspReference ?? "",
      idempotencyKey,
      feeLockStatus: (await db.feeLock.findFirst({ where: { ustn }, orderBy: { createdAt: "desc" } }))?.status ?? "PENDING",
      splitInstruction,
      processed: false,
    };
  }

  // 4. For STAGE1 — ensure a FeeLock exists (PENDING state) before processing
  let feeLockId: string | null = null;
  if (stage === "STAGE1") {
    const providerFees = splitInstruction.splits
      .filter((s: any) => s.payee_gtid !== "SGTX-PLATFORM")
      .map((s: any) => ({ payee: s.payee_gtid, amount: s.amount, stage: s.stage }));
    // Sum ALL SGTX-PLATFORM splits (1.5% base fee + 3% optional-services fee) for FeeLock.
    const sgtxFee = splitInstruction.splits
      .filter((s: any) => s.payee_gtid === "SGTX-PLATFORM")
      .reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
    const trade = await db.trade.findUnique({ where: { ustn } });
    const feeLock = await createFeeLock(ustn, trade?.id ?? null, splitInstruction.total_amount, sgtxFee, providerFees);
    feeLockId = feeLock.id;
  }

  // 5. Create PaymentAttempt
  const pspReference = `${pspProvider}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
  const paymentAttempt = await db.paymentAttempt.create({
    data: {
      ustn,
      feeLockId,
      stage,
      amountUsd: splitInstruction.total_amount,
      currency: "USD",
      pspProvider,
      pspReference,
      status: "PROCESSING",
      splitJson: JSON.stringify(splitInstruction.splits),
      idempotencyKey,
    },
  });

  // 6. Persist FeeCalculation for audit (Part 6 schema)
  const trade = await db.trade.findUnique({ where: { ustn } });
  if (trade) {
    // Sum ALL SGTX-PLATFORM splits (1.5% base fee + 3% optional-services fee) for audit.
    const sgtxFee = splitInstruction.splits
      .filter((s: any) => s.payee_gtid === "SGTX-PLATFORM")
      .reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
    const providerFeesJson = JSON.stringify(
      splitInstruction.splits
        .filter((s: any) => s.payee_gtid !== "SGTX-PLATFORM")
        .map((s: any) => ({ payee: s.payee_gtid, amount: s.amount, description: s.description }))
    );
    await db.feeCalculation.create({
      data: {
        ustn,
        tradeValueUsd: trade.tradeValueUsd,
        sgtxFeeUsd: sgtxFee,
        providerFeesJson,
        totalFeesUsd: splitInstruction.total_amount,
        stage,
      },
    });
  }

  // 7. Simulate PSP processing — success unless we're in a simulated fault path
  //    (In production this is the PSP webhook roundtrip.)
  const simulatedSuccess = true;
  const completedAt = new Date();

  await db.paymentAttempt.update({
    where: { id: paymentAttempt.id },
    data: {
      status: simulatedSuccess ? "COMPLETED" : "FAILED",
      completedAt,
    },
  });

  // 8. Activate FeeLock (PENDING → ACTIVE) on STAGE1 success (Part 6.1.2 step 8)
  let feeLockStatus = "PENDING";
  if (simulatedSuccess && stage === "STAGE1") {
    const activated = await activateFeeLock(ustn);
    feeLockStatus = activated.status;

    // Smart Inbox to seller — payment successful
    await db.inboxItem.create({
      data: {
        tenantGtid: trade?.sellerGtid ?? "SGTX-EG-TRD-002139-7F3A",
        category: "NEW_OFFER",
        priority: 90,
        title: `Stage 1 payment confirmed — ${ustn.slice(0, 24)}…`,
        description: `Total $${splitInstruction.total_amount.toFixed(2)} split across ${splitInstruction.splits.length} payees via ${pspProvider}. PSP ref ${pspReference}. FeeLock ACTIVE — container release now authorised.`,
        ctaLabel: "View Breakdown",
      },
    });
  } else if (!simulatedSuccess) {
    feeLockStatus = "PENDING";
  }

  return {
    ok: simulatedSuccess,
    paymentAttemptId: paymentAttempt.id,
    pspReference,
    idempotencyKey,
    feeLockStatus,
    splitInstruction,
    processed: true,
  };
}
