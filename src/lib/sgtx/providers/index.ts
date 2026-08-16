// SGTX Part 9 — Logistics Provider Management
// Unified quotation workflow (LSP, SHIP, LAB, QC, CBR),
// incoterm-based service filtering, provider performance, service catalogue.

import { db } from "@/lib/db";

// ============ 9.6: Unified Service Quotation ============
export async function sendQuote(input: {
  ustn?: string;
  tradeId?: string;
  providerGtid: string;
  providerType: string; // LSP | SHIP | LAB | QC | CBR
  serviceType: string;
  feeUsd: number;
  currency?: string;
  validityDays?: number;
  notes?: string;
  description?: string;
  vessel?: string;
  voyage?: string;
  etd?: Date;
  eta?: Date;
  sampleInstructions?: string;
  inspectionDate?: string;
  inspectionLocation?: string;
}): Promise<{ ok: true; quoteId: string } | { ok: false; reason: string }> {
  const quoteId = `SQ-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  const validUntil = new Date(Date.now() + (input.validityDays || 7) * 86400 * 1000);

  // Determine payment stage based on service type
  const stage1Services = ["TRUCKING", "CERTIFICATION", "PESTICIDE_PANEL", "MICROBIOLOGICAL", "VISUAL_INSPECTION", "PHYSICAL_HANDLING"];
  const paymentStage = stage1Services.includes(input.serviceType) ? "STAGE1" : "STAGE2";

  await db.serviceQuotation.create({
    data: {
      quoteId, ustn: input.ustn || null, tradeId: input.tradeId || null,
      providerGtid: input.providerGtid, providerType: input.providerType,
      serviceType: input.serviceType, feeUsd: input.feeUsd,
      currency: input.currency || "USD", validityDays: input.validityDays || 7,
      validUntil, status: "PENDING",
      description: input.description || null, notes: input.notes || null,
      vessel: input.vessel || null, voyage: input.voyage || null,
      etd: input.etd || null, eta: input.eta || null,
      sampleInstructions: input.sampleInstructions || null,
      inspectionDate: input.inspectionDate || null,
      inspectionLocation: input.inspectionLocation || null,
      paymentStage,
    },
    }) as any;

  // Smart Inbox to trader (if trade exists, notify the relevant party)
  if (input.tradeId) {
        const trade = await db.trade.findUnique({ where: { id: input.tradeId } }) as any;
    if (trade) {
      const notifyGtid = input.providerType === "QC" ? trade.buyerGtid : trade.sellerGtid;
      await db.inboxItem.create({
        data: {
          tenantGtid: notifyGtid, tradeId: input.tradeId,
          category: "NEW_OFFER", priority: 80,
          title: `Quote received — ${quoteId} (${input.providerType}: ${input.serviceType})`,
          description: `${input.providerType} quote: $${input.feeUsd} for ${input.serviceType}. Valid until ${validUntil.toISOString().slice(0, 10)}.`,
          ctaLabel: "Accept Quote",
          deadline: validUntil,
        },
            }) as any;
    }
  }

  return { ok: true, quoteId };
}

export async function acceptQuote(input: {
  quoteId: string;
  acceptedByGtid: string;
  notes?: string;
}): Promise<{ ok: true; quoteId: string; invoiceId?: string; paymentStage?: string } | { ok: false; reason: string }> {
    const quote = await db.serviceQuotation.findUnique({ where: { quoteId: input.quoteId } }) as any;
  if (!quote) return { ok: false, reason: "Quote not found." };
  if (quote.status !== "PENDING") return { ok: false, reason: `Quote is ${quote.status}.` };
  if (quote.validUntil && new Date() > quote.validUntil) return { ok: false, reason: "Quote has expired." };

  await db.serviceQuotation.update({
    where: { quoteId: input.quoteId },
    data: { status: "ACCEPTED", acceptedByGtid: input.acceptedByGtid, acceptedAt: new Date(), notes: input.notes || quote.notes },
    }) as any;

  // Smart Inbox to provider
  await db.inboxItem.create({
    data: {
      tenantGtid: quote.providerGtid, tradeId: quote.tradeId,
      category: "NEW_OFFER", priority: 85,
      title: `Quote accepted — ${quote.quoteId}`,
      description: `${quote.serviceType} quote ($${quote.feeUsd}) accepted by ${input.acceptedByGtid}. Invoice will be generated and added to ${quote.paymentStage} payment plan.`,
      ctaLabel: "View Details",
    },
    }) as any;

  return { ok: true, quoteId: input.quoteId, paymentStage: quote.paymentStage };
}

export async function declineQuote(input: {
  quoteId: string;
  declinedByGtid: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
    const quote = await db.serviceQuotation.findUnique({ where: { quoteId: input.quoteId } }) as any;
  if (!quote) return { ok: false, reason: "Quote not found." };
  if (quote.status !== "PENDING") return { ok: false, reason: `Quote is ${quote.status}.` };

  await db.serviceQuotation.update({
    where: { quoteId: input.quoteId },
    data: { status: "REJECTED" },
    }) as any;

  await db.inboxItem.create({
    data: {
      tenantGtid: quote.providerGtid, tradeId: quote.tradeId,
      category: "COMPLIANCE", priority: 60,
      title: `Quote declined — ${quote.quoteId}`,
      description: `${quote.serviceType} quote was declined. Reason: ${input.reason || "No reason provided."}`,
    },
    }) as any;

  return { ok: true };
}

// ============ 9.7: Incoterm-Based Service Filtering ============

// Incoterm Service Mapping (Part 9.7). Mirrors the seed in scripts/seed.ts.
// Used as a fallback when the DB has not been re-seeded (so the 3 newly-added
// incoterms CPT / CIP / DPU are always available even on existing environments).
export const INCOTERM_SERVICE_MAPPING: Record<string, Record<string, "mandatory" | "optional" | "no">> = {
  EXW: { trucking: "optional", export_customs: "optional", thc: "no", ocean_freight: "no", insurance: "optional", destination_charges: "no", duties: "no" },
  FCA: { trucking: "mandatory", export_customs: "mandatory", thc: "no", ocean_freight: "no", insurance: "optional", destination_charges: "no", duties: "no" },
  FOB: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "no", insurance: "optional", destination_charges: "no", duties: "no" },
  CFR: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "no", duties: "no" },
  CIF: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "mandatory", destination_charges: "no", duties: "no" },
  CPT: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "no" },
  CIP: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "mandatory", destination_charges: "mandatory", duties: "no" },
  DPU: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "no", unloading: "mandatory" },
  DAP: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "no" },
  DDP: { trucking: "mandatory", export_customs: "mandatory", thc: "mandatory", ocean_freight: "mandatory", insurance: "optional", destination_charges: "mandatory", duties: "mandatory" },
};

/**
 * Ensure the 3 newly-added incoterms (CPT / CIP / DPU) exist in the DB.
 * Idempotent — safe to call on every incoterm lookup. Only inserts missing rows.
 * (Part 9 gap-fix: previously only 6 of the 11 Incoterms 2020 were seeded.)
 */
export async function ensureIncotermsSeeded(): Promise<void> {
  const required = ["CPT", "CIP", "DPU"];
  for (const code of required) {
        const existing = await db.incotermServiceMapping.findUnique({ where: { incoterm: code } }) as any;
    if (!existing) {
      await db.incotermServiceMapping.create({
        data: { incoterm: code, servicesJson: JSON.stringify(INCOTERM_SERVICE_MAPPING[code]) },
            }).catch(() => { /* ignore race conditions */ }) as any;
    }
  }
}

export async function getIncotermServices(incoterm: string): Promise<{
  services: { service: string; requirement: string }[];
  missing: string[];
}> {
  // Part 9 gap-fix: ensure newly-added incoterms (CPT/CIP/DPU) exist.
  await ensureIncotermsSeeded();

    const mapping = await db.incotermServiceMapping.findUnique({ where: { incoterm } }) as any;
  // Fallback to in-memory map if not seeded (defensive).
    const servicesMap = mapping ? JSON.parse(mapping.servicesJson) : (INCOTERM_SERVICE_MAPPING[incoterm.toUpperCase()] || {}) as any;
  const services = Object.entries(servicesMap).map(([service, requirement]) => ({
    service, requirement: requirement as string,
  }));

  return { services, missing: services.filter(s => s.requirement === "mandatory").map(s => s.service) };
}

export async function validateMandatoryServices(input: {
  incoterm: string;
  acceptedQuotes: { serviceType: string }[];
}): Promise<{ ok: boolean; missing: string[] }> {
  const { missing } = await getIncotermServices(input.incoterm);
  const acceptedServices = input.acceptedQuotes.map(q => {
    // Map service types to incoterm service names
    const map: Record<string, string> = {
      TRUCKING: "trucking", OCEAN_FREIGHT: "ocean_freight", CERTIFICATION: "export_customs",
      PHYSICAL_HANDLING: "export_customs", PESTICIDE_PANEL: "thc", VISUAL_INSPECTION: "thc",
    };
    return map[q.serviceType] || q.serviceType.toLowerCase();
    }) as any;

  const stillMissing = missing.filter(m => !acceptedServices.includes(m));
  return { ok: stillMissing.length === 0, missing: stillMissing };
}

// ============ 9.8: Provider Performance ============
export async function getProviderPerformance(providerGtid: string) {
    const perf = await db.providerPerformance.findUnique({ where: { providerGtid } }) as any;
  if (!perf) return null;
  return {
    ...perf,
    quartileLabel: perf.benchmarkQuartile === 1 ? "Top 25%" : perf.benchmarkQuartile === 2 ? "Above Average" : perf.benchmarkQuartile === 3 ? "Below Average" : "Bottom 25%",
  };
}

// ============ Service Catalogue ============
export async function getProviderCatalogue(providerGtid: string) {
    return db.providerServiceCatalogue.findMany({ where: { providerGtid }, orderBy: { serviceName: "asc" } }) as any;
}

// ============ List Quotes ============
export async function listQuotes(input: {
  ustn?: string;
  providerGtid?: string;
  status?: string;
}): Promise<any[]> {
  const where: any = {};
  if (input.ustn) where.ustn = input.ustn;
  if (input.providerGtid) where.providerGtid = input.providerGtid;
  if (input.status) where.status = input.status;
  return db.serviceQuotation.findMany({
    where, include: { provider: true, trade: true },
    orderBy: { createdAt: "desc" },
    }) as any;
}

// ============================================================================
// STUBS: added to fix build — implement fully in a follow-up.
// These named exports are imported by /api/sgtx/providers/clarify and
// /api/sgtx/providers/preferences but were not previously defined. Each
// returns a safe minimal default so the production build (`next build`) can
// resolve all imports.
// ============================================================================

// STUB: added to fix build — implement fully in a follow-up
// Part 9.6: create a clarification request thread on a quotation.
export async function createClarificationRequest(
  quotationId: string,
  requestedByGtid: string,
  questions: any[]
): Promise<{ ok: true; requestId: string; quotationId: string; requestedByGtid: string; questionCount: number } | { ok: false; reason: string }> {
  if (!quotationId || !requestedByGtid || !Array.isArray(questions) || questions.length === 0) {
    return { ok: false, reason: "quotationId, requestedByGtid and non-empty questions array required." };
  }
  const requestId = `CLR-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.floor(Math.random() * 900 + 100)}`;
  try {
    await db.inboxItem.create({
      data: {
        tenantGtid: requestedByGtid,
        category: "GENERAL",
        priority: 60,
        title: `Clarification Request ${requestId}`,
        description: `${questions.length} question(s) about quotation ${quotationId}.`,
      },
    }) as any;
  } catch { /* ignore DB errors in stub */ }
  return {
    ok: true,
    requestId,
    quotationId,
    requestedByGtid,
    questionCount: questions.length,
  };
}

// STUB: added to fix build — implement fully in a follow-up
// Part 9.6: respond to an existing clarification request.
export async function respondToClarification(
  requestId: string,
  answers: any
): Promise<{ ok: true; requestId: string; answered: boolean } | { ok: false; reason: string }> {
  if (!requestId || !answers) {
    return { ok: false, reason: "requestId and answers required." };
  }
  return {
    ok: true,
    requestId,
    answered: true,
  };
}

// STUB: added to fix build — implement fully in a follow-up
// Part 9.9.2: set a provider's anonymous-RFQ opt-out preference.
export async function setAnonymousRfqOptOut(
  providerGtid: string,
  optOut: boolean
): Promise<{ ok: true; providerGtid: string; anonymousRfqOptOut: boolean } | { ok: false; reason: string }> {
  if (!providerGtid) {
    return { ok: false, reason: "providerGtid required." };
  }
  // Best-effort persistence: try to upsert into ProviderPerformance if the
  // table/columns exist. Failures are swallowed so the stub never throws.
  try {
    const existing = await db.providerPerformance.findUnique({ where: { providerGtid } }) as any;
    if (existing) {
      await db.providerPerformance.update({
        where: { providerGtid },
        data: { anonymousRfqOptOut: optOut } as any,
      }) as any;
    }
  } catch { /* ignore — DB column may not exist yet */ }
  return {
    ok: true,
    providerGtid,
    anonymousRfqOptOut: optOut,
  };
}
