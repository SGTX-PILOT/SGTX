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
  });

  // Smart Inbox to trader (if trade exists, notify the relevant party)
  if (input.tradeId) {
    const trade = await db.trade.findUnique({ where: { id: input.tradeId } });
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
      });
    }
  }

  return { ok: true, quoteId };
}

export async function acceptQuote(input: {
  quoteId: string;
  acceptedByGtid: string;
  notes?: string;
}): Promise<{ ok: true; quoteId: string; invoiceId?: string; paymentStage?: string } | { ok: false; reason: string }> {
  const quote = await db.serviceQuotation.findUnique({ where: { quoteId: input.quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found." };
  if (quote.status !== "PENDING") return { ok: false, reason: `Quote is ${quote.status}.` };
  if (quote.validUntil && new Date() > quote.validUntil) return { ok: false, reason: "Quote has expired." };

  await db.serviceQuotation.update({
    where: { quoteId: input.quoteId },
    data: { status: "ACCEPTED", acceptedByGtid: input.acceptedByGtid, acceptedAt: new Date(), notes: input.notes || quote.notes },
  });

  // Smart Inbox to provider
  await db.inboxItem.create({
    data: {
      tenantGtid: quote.providerGtid, tradeId: quote.tradeId,
      category: "NEW_OFFER", priority: 85,
      title: `Quote accepted — ${quote.quoteId}`,
      description: `${quote.serviceType} quote ($${quote.feeUsd}) accepted by ${input.acceptedByGtid}. Invoice will be generated and added to ${quote.paymentStage} payment plan.`,
      ctaLabel: "View Details",
    },
  });

  return { ok: true, quoteId: input.quoteId, paymentStage: quote.paymentStage };
}

export async function declineQuote(input: {
  quoteId: string;
  declinedByGtid: string;
  reason?: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const quote = await db.serviceQuotation.findUnique({ where: { quoteId: input.quoteId } });
  if (!quote) return { ok: false, reason: "Quote not found." };
  if (quote.status !== "PENDING") return { ok: false, reason: `Quote is ${quote.status}.` };

  await db.serviceQuotation.update({
    where: { quoteId: input.quoteId },
    data: { status: "REJECTED" },
  });

  await db.inboxItem.create({
    data: {
      tenantGtid: quote.providerGtid, tradeId: quote.tradeId,
      category: "COMPLIANCE", priority: 60,
      title: `Quote declined — ${quote.quoteId}`,
      description: `${quote.serviceType} quote was declined. Reason: ${input.reason || "No reason provided."}`,
    },
  });

  return { ok: true };
}

// ============ 9.7: Incoterm-Based Service Filtering ============
export async function getIncotermServices(incoterm: string): Promise<{
  services: { service: string; requirement: string }[];
  missing: string[];
}> {
  const mapping = await db.incotermServiceMapping.findUnique({ where: { incoterm } });
  if (!mapping) return { services: [], missing: [] };

  const servicesMap = JSON.parse(mapping.servicesJson);
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
  });

  const stillMissing = missing.filter(m => !acceptedServices.includes(m));
  return { ok: stillMissing.length === 0, missing: stillMissing };
}

// ============ 9.8: Provider Performance ============
export async function getProviderPerformance(providerGtid: string) {
  const perf = await db.providerPerformance.findUnique({ where: { providerGtid } });
  if (!perf) return null;
  return {
    ...perf,
    quartileLabel: perf.benchmarkQuartile === 1 ? "Top 25%" : perf.benchmarkQuartile === 2 ? "Above Average" : perf.benchmarkQuartile === 3 ? "Below Average" : "Bottom 25%",
  };
}

// ============ Service Catalogue ============
export async function getProviderCatalogue(providerGtid: string) {
  return db.providerServiceCatalogue.findMany({ where: { providerGtid }, orderBy: { serviceName: "asc" } });
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
  });
}
