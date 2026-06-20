import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// POST /api/sgtx/trade-request/readiness
// Body: either { tradeRequestId } OR a full trade-request payload object
//   { tradeRequestId?, sellerSelected, incoterm, commodity, hsCode, containersConfigured,
//     documentationComplete, transportMode, equipmentType, insuranceRequirement, insuranceType,
//     settlementStructure, paymentTiming, creditPeriod, currency, financingInterest,
//     settlementFlexibility, commercialPriority, multiShipmentValid, specialInstructions }
// Returns: { score (0-100), missing: [{ field, severity, message }], components: { ... } }
// Part 4.10 — Trade Request Readiness (advisory, non-blocking)

interface ReadinessInput {
  tradeRequestId?: string;
  sellerSelected?: boolean;
  incoterm?: string | null;
  commodity?: string | null;
  hsCode?: string | null;
  containersConfigured?: number; // count of fully-configured containers
  containersTotal?: number;
  documentationComplete?: boolean;
  documentationMandatoryCount?: number;
  documentationMandatorySelected?: number;
  transportMode?: string | null;
  equipmentType?: string | null;
  insuranceRequirement?: string | null;
  insuranceType?: string | null;
  settlementStructure?: string | null;
  paymentTiming?: string | null;
  creditPeriod?: string | null;
  currency?: string | null;
  financingInterest?: string | null;
  settlementFlexibility?: string | null;
  commercialPriority?: string | null;
  tradeCriticality?: string | null;
  earliestDeliveryDate?: string | null;
  preferredDeliveryDate?: string | null;
  latestDeliveryDate?: string | null;
  multiShipmentValid?: boolean;
  specialInstructions?: string | null;
}

interface MissingItem {
  field: string;
  severity: "BLOCKER" | "WARNING" | "INFO";
  message: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as ReadinessInput;
    let input = body;

    // If tradeRequestId provided, fetch from DB and merge with body
    if (body.tradeRequestId) {
      const trade = await db.trade.findUnique({
        where: { id: body.tradeRequestId },
        include: { containers: true, documentRequirements: true },
      });
      if (trade) {
        input = {
          ...body,
          sellerSelected: true, // trade exists → seller was selected
          incoterm: body.incoterm ?? trade.incoterm,
          commodity: body.commodity ?? trade.commodity,
          hsCode: body.hsCode ?? trade.commodityHs,
          containersConfigured: trade.containers.length,
          containersTotal: trade.containers.length,
          documentationMandatoryCount: trade.documentRequirements.filter(d => d.mandatory).length,
          documentationMandatorySelected: trade.documentRequirements.filter(d => d.mandatory).length,
          documentationComplete: trade.documentRequirements.some(d => d.mandatory),
          transportMode: body.transportMode ?? trade.transportMode,
          equipmentType: body.equipmentType ?? trade.equipmentType,
          insuranceRequirement: body.insuranceRequirement ?? trade.insuranceRequirement,
          insuranceType: body.insuranceType ?? trade.insuranceType,
          settlementStructure: body.settlementStructure ?? trade.settlementStructure,
          paymentTiming: body.paymentTiming ?? trade.paymentTiming,
          creditPeriod: body.creditPeriod ?? trade.creditPeriod,
          currency: body.currency ?? trade.currency,
          financingInterest: body.financingInterest ?? trade.financingInterest,
          settlementFlexibility: body.settlementFlexibility ?? trade.settlementFlexibility,
          commercialPriority: body.commercialPriority ?? trade.commercialPriority,
          tradeCriticality: body.tradeCriticality ?? trade.tradeCriticality,
          earliestDeliveryDate: body.earliestDeliveryDate ?? (trade.earliestDeliveryDate?.toISOString() ?? null),
          preferredDeliveryDate: body.preferredDeliveryDate ?? (trade.preferredDeliveryDate?.toISOString() ?? null),
          latestDeliveryDate: body.latestDeliveryDate ?? (trade.latestDeliveryDate?.toISOString() ?? null),
          specialInstructions: body.specialInstructions ?? trade.specialInstructions,
        };
      }
    }

    const result = calculateReadiness(input);

    // Persist score if trade exists
    if (body.tradeRequestId) {
      try {
        await db.trade.update({
          where: { id: body.tradeRequestId },
          data: {
            readinessScore: result.score,
            readinessMissing: JSON.stringify(result.missing),
          },
        });
      } catch (persistErr) {
        console.error("[readiness] persist error (non-blocking):", persistErr);
      }
    }

    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    console.error("[readiness] error:", e);
    return NextResponse.json({ error: e.message || "Failed to calculate readiness" }, { status: 500 });
  }
}

// GET /api/sgtx/trade-request/readiness?tradeRequestId=...
export async function GET(req: NextRequest) {
  const tradeRequestId = req.nextUrl.searchParams.get("tradeRequestId");
  if (!tradeRequestId) return NextResponse.json({ error: "tradeRequestId required" }, { status: 400 });
  const trade = await db.trade.findUnique({
    where: { id: tradeRequestId },
    include: { containers: true, documentRequirements: true },
  });
  if (!trade) return NextResponse.json({ error: `Trade ${tradeRequestId} not found` }, { status: 404 });
  const input: ReadinessInput = {
    tradeRequestId,
    sellerSelected: true,
    incoterm: trade.incoterm,
    commodity: trade.commodity,
    hsCode: trade.commodityHs,
    containersConfigured: trade.containers.length,
    containersTotal: trade.containers.length,
    documentationMandatoryCount: trade.documentRequirements.filter(d => d.mandatory).length,
    documentationMandatorySelected: trade.documentRequirements.filter(d => d.mandatory).length,
    documentationComplete: trade.documentRequirements.some(d => d.mandatory),
    transportMode: trade.transportMode,
    equipmentType: trade.equipmentType,
    insuranceRequirement: trade.insuranceRequirement,
    insuranceType: trade.insuranceType,
    settlementStructure: trade.settlementStructure,
    paymentTiming: trade.paymentTiming,
    creditPeriod: trade.creditPeriod,
    currency: trade.currency,
    financingInterest: trade.financingInterest,
    settlementFlexibility: trade.settlementFlexibility,
    commercialPriority: trade.commercialPriority,
    tradeCriticality: trade.tradeCriticality,
    earliestDeliveryDate: trade.earliestDeliveryDate?.toISOString() ?? null,
    preferredDeliveryDate: trade.preferredDeliveryDate?.toISOString() ?? null,
    latestDeliveryDate: trade.latestDeliveryDate?.toISOString() ?? null,
    specialInstructions: trade.specialInstructions,
  };
  const result = calculateReadiness(input);
  return NextResponse.json({ ok: true, ...result, persistedScore: trade.readinessScore });
}

interface ReadinessResult {
  score: number;
  missing: MissingItem[];
  components: Record<string, number>;
  isReadyForSubmission: boolean;
}

export function calculateReadiness(input: ReadinessInput): ReadinessResult {
  const components: Record<string, number> = {};
  const missing: MissingItem[] = [];

  // 1. Seller Selection (5%)
  components.seller = input.sellerSelected ? 100 : 0;
  if (!input.sellerSelected) missing.push({ field: "seller", severity: "BLOCKER", message: "Seller not selected" });

  // 2. Incoterm Selection (5%)
  components.incoterm = input.incoterm ? 100 : 0;
  if (!input.incoterm) missing.push({ field: "incoterm", severity: "BLOCKER", message: "Incoterm not selected" });

  // 3. Containers (10%) — at least 1 fully-configured
  const total = input.containersTotal ?? 0;
  const configured = input.containersConfigured ?? 0;
  components.containers = total === 0 ? 0 : Math.round((configured / total) * 100);
  if (total === 0) missing.push({ field: "containers", severity: "BLOCKER", message: "No containers configured" });
  else if (configured < total) missing.push({ field: "containers", severity: "WARNING", message: `${total - configured} container(s) incomplete` });

  // 4. Commodities (15%)
  const hasCommodity = !!input.commodity && !!input.hsCode;
  components.commodities = hasCommodity ? 100 : (!!input.commodity ? 50 : 0);
  if (!input.commodity) missing.push({ field: "commodity", severity: "BLOCKER", message: "Commodity not specified" });
  else if (!input.hsCode) missing.push({ field: "hsCode", severity: "WARNING", message: "HS code not specified — affects RIA pre-selection" });

  // 5. Documentation (10%)
  const mandatoryDocs = input.documentationMandatoryCount ?? 0;
  const selectedDocs = input.documentationMandatorySelected ?? 0;
  components.documentation = mandatoryDocs === 0 ? 0 : Math.round((selectedDocs / mandatoryDocs) * 100);
  if (mandatoryDocs === 0) missing.push({ field: "documentation", severity: "WARNING", message: "Documentation requirements not yet resolved" });
  else if (selectedDocs < mandatoryDocs) missing.push({ field: "documentation", severity: "WARNING", message: `${mandatoryDocs - selectedDocs} mandatory document(s) not selected` });

  // 6. Transport & Logistics (10%)
  const hasTransport = !!input.transportMode && !!input.equipmentType;
  components.transport = hasTransport ? 100 : (!!input.transportMode ? 50 : 0);
  if (!input.transportMode) missing.push({ field: "transportMode", severity: "BLOCKER", message: "Transport mode not selected" });
  else if (!input.equipmentType) missing.push({ field: "equipmentType", severity: "WARNING", message: "Equipment type not selected" });

  // 6b. Delivery window (sub-check)
  const hasDeliveryWindow = !!input.earliestDeliveryDate && !!input.preferredDeliveryDate && !!input.latestDeliveryDate;
  components.deliveryWindow = hasDeliveryWindow ? 100 : 0;
  if (!hasDeliveryWindow) missing.push({ field: "deliveryWindow", severity: "WARNING", message: "Delivery window (earliest/preferred/latest) not fully specified" });

  // 7. Insurance (5%)
  const hasInsurance = !!input.insuranceRequirement;
  components.insurance = hasInsurance ? 100 : 0;
  if (!hasInsurance) missing.push({ field: "insuranceRequirement", severity: "BLOCKER", message: "Insurance requirement not selected" });
  else if (input.insuranceRequirement === "REQUIRED" && !input.insuranceType) {
    missing.push({ field: "insuranceType", severity: "WARNING", message: "Insurance type not selected (required when insurance is REQUIRED)" });
    components.insurance = 50;
  }

  // 8. Commercial Settlement (10%)
  let settlementFields = 0;
  let settlementTotal = 5; // structure, timing, credit, currency, flexibility
  if (input.settlementStructure) settlementFields++;
  if (input.paymentTiming) settlementFields++;
  if (input.creditPeriod) settlementFields++;
  if (input.currency) settlementFields++;
  if (input.settlementFlexibility) settlementFields++;
  components.settlement = Math.round((settlementFields / settlementTotal) * 100);
  if (!input.settlementStructure) missing.push({ field: "settlementStructure", severity: "BLOCKER", message: "Settlement structure not selected" });
  if (!input.paymentTiming) missing.push({ field: "paymentTiming", severity: "BLOCKER", message: "Payment timing not selected" });
  if (!input.creditPeriod) missing.push({ field: "creditPeriod", severity: "WARNING", message: "Credit period not selected" });
  if (!input.currency) missing.push({ field: "currency", severity: "BLOCKER", message: "Currency not selected" });
  if (!input.settlementFlexibility) missing.push({ field: "settlementFlexibility", severity: "WARNING", message: "Settlement flexibility not selected" });
  if (!input.commercialPriority) missing.push({ field: "commercialPriority", severity: "WARNING", message: "Commercial priority not selected" });

  // 9. Trade Criticality (sub-check, not in headline scoring)
  components.criticality = input.tradeCriticality ? 100 : 0;
  if (!input.tradeCriticality) missing.push({ field: "tradeCriticality", severity: "WARNING", message: "Trade criticality not selected — defaults to ROUTINE" });

  // 10. Special instructions (INFO only)
  if (!input.specialInstructions || input.specialInstructions.trim().length === 0) {
    missing.push({ field: "specialInstructions", severity: "INFO", message: "No special instructions provided (optional)" });
  }

  // 11. Multi-shipment validity (if applicable)
  if (input.multiShipmentValid === false) {
    missing.push({ field: "multiShipment", severity: "WARNING", message: "Multi-shipment schedule has invalid entries" });
  }

  // Weighted score per Part 4.10.1.1
  const weighted =
    (components.seller || 0) * 0.05 +
    (components.incoterm || 0) * 0.05 +
    (components.containers || 0) * 0.10 +
    (components.commodities || 0) * 0.15 +
    (components.documentation || 0) * 0.10 +
    (components.transport || 0) * 0.10 +
    (components.insurance || 0) * 0.05 +
    (components.settlement || 0) * 0.10 +
    (components.deliveryWindow || 0) * 0.10 +
    (components.criticality || 0) * 0.05 +
    (components.deliveryWindow || 0) * 0.05;

  // Clamp 0-100, advisory threshold 70
  const score = Math.max(0, Math.min(100, Math.round(weighted)));

  return {
    score,
    missing,
    components,
    isReadyForSubmission: score >= 70,
  };
}
