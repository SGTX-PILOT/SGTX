import { NextRequest, NextResponse } from "next/server";

// GET /api/sgtx/criticality/rules
// Part 4.11 — Trade Criticality routing rules per level (ROUTINE / PRIORITY / CRITICAL)
// Returns the operational implications + approval routing + Smart Inbox priority ranges
// so the form can preview what each criticality level means before the buyer selects.

interface CriticalityRule {
  level: "ROUTINE" | "PRIORITY" | "CRITICAL";
  icon: string;
  description: string;
  useCases: string;
  smartInboxPriority: { min: number; max: number };
  approvalSlaHours: number;
  approvers: string[];
  escalationFirstDays: number;
  escalationSecondDays: number;
  escalationThirdDays: number;
  monitoringFrequencyHours: number;
  logisticsBufferDays: number;
  logisticsBooking: string;
  financingPriority: string;
  customsClearance: string;
  notificationChannels: string[];
}

const RULES: CriticalityRule[] = [
  {
    level: "ROUTINE",
    icon: "📋",
    description: "Standard trade with normal operational handling",
    useCases: "Regular commodities, low value, established relationships",
    smartInboxPriority: { min: 50, max: 60 },
    approvalSlaHours: 48,
    approvers: ["Manager"],
    escalationFirstDays: 7,
    escalationSecondDays: 10,
    escalationThirdDays: 14,
    monitoringFrequencyHours: 24,
    logisticsBufferDays: 4,
    logisticsBooking: "Standard",
    financingPriority: "Standard",
    customsClearance: "Standard",
    notificationChannels: ["In-app"],
  },
  {
    level: "PRIORITY",
    icon: "⭐",
    description: "Important trade requiring expedited handling",
    useCases: "Time-sensitive commodities, medium-high value, strategic relationships",
    smartInboxPriority: { min: 70, max: 80 },
    approvalSlaHours: 24,
    approvers: ["Manager", "Finance"],
    escalationFirstDays: 3,
    escalationSecondDays: 5,
    escalationThirdDays: 7,
    monitoringFrequencyHours: 6,
    logisticsBufferDays: 2,
    logisticsBooking: "Expedited",
    financingPriority: "Expedited",
    customsClearance: "Expedited (where available)",
    notificationChannels: ["In-app", "Email"],
  },
  {
    level: "CRITICAL",
    icon: "🔴",
    description: "Urgent trade requiring immediate attention",
    useCases: "Perishable goods, high-value, urgent deadlines, regulatory-sensitive",
    smartInboxPriority: { min: 90, max: 100 },
    approvalSlaHours: 4,
    approvers: ["Manager", "Finance", "Director (or Executive Committee if > $1M)"],
    escalationFirstDays: 0.5,
    escalationSecondDays: 1,
    escalationThirdDays: 2,
    monitoringFrequencyHours: 1,
    logisticsBufferDays: 1,
    logisticsBooking: "Immediate (fastest available)",
    financingPriority: "Immediate",
    customsClearance: "Priority lane (where available)",
    notificationChannels: ["In-app", "Email", "SMS", "Push"],
  },
];

export async function GET(_req: NextRequest) {
  return NextResponse.json({ ok: true, rules: RULES });
}

// POST /api/sgtx/criticality/rules — AI-suggested criticality (A1, advisory)
// Body: { commodity, hsCode, tradeValue, deliveryWindowDays, originCountry, destCountry, incoterm, inspectionType }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      commodity, hsCode, tradeValue = 0, deliveryWindowDays = 30,
      destCountry, incoterm, inspectionType,
    } = body || {};

    let level: "ROUTINE" | "PRIORITY" | "CRITICAL" = "ROUTINE";
    const factors: string[] = [];

    // Commodity perishability (heuristic — A2 RIA would do this with HS classification)
    const perishable = /fresh|frozen|chilled|fruit|vegetable|meat|fish|dairy|flower|perishable/i.test(commodity || "");
    if (perishable) { factors.push("Time-sensitive commodity"); }

    // Trade value thresholds
    if (tradeValue > 250000) { factors.push(`High trade value ($${tradeValue.toLocaleString()})`); }
    else if (tradeValue >= 50000) { factors.push(`Medium-high trade value ($${tradeValue.toLocaleString()})`); }

    // Delivery window
    if (deliveryWindowDays < 15) { factors.push(`Tight delivery window (${deliveryWindowDays} days)`); }
    else if (deliveryWindowDays <= 30) { factors.push(`Moderate delivery window (${deliveryWindowDays} days)`); }

    // Destination risk (simple heuristic)
    const highRiskDest = ["NG", "IR", "KP", "SY", "AF", "CU"];
    if (highRiskDest.includes(destCountry)) { factors.push(`High-risk destination (${destCountry})`); }

    // Incoterm
    if (incoterm && ["CIF", "CIP", "DDP"].includes(incoterm)) { factors.push(`Incoterm ${incoterm} requires seller risk`); }

    // Inspection
    if (/third.?party|joint|sgs|bureau/i.test(inspectionType || "")) { factors.push("Third-party inspection required"); }

    // Scoring
    let score = 0;
    if (perishable) score += 25;
    if (tradeValue > 250000) score += 25;
    else if (tradeValue >= 50000) score += 15;
    if (deliveryWindowDays < 15) score += 25;
    else if (deliveryWindowDays <= 30) score += 10;
    if (highRiskDest.includes(destCountry)) score += 15;
    if (incoterm && ["CIF", "CIP", "DDP"].includes(incoterm)) score += 10;
    if (/third.?party|joint/i.test(inspectionType || "")) score += 5;

    if (score >= 60) level = "CRITICAL";
    else if (score >= 30) level = "PRIORITY";
    else level = "ROUTINE";

    const confidence = Math.min(95, Math.max(50, score + 30));

    return NextResponse.json({
      ok: true,
      suggested: level,
      confidence,
      factors,
      score,
      recommendedSla: level === "CRITICAL" ? "4 hours" : level === "PRIORITY" ? "24 hours" : "48 hours",
      recommendedApproval: level === "CRITICAL" ? "Manager + Finance + Director" : level === "PRIORITY" ? "Manager + Finance" : "Manager",
    });
  } catch (e: any) {
    console.error("[criticality/rules POST] error:", e);
    return NextResponse.json({ error: e.message || "Failed to suggest criticality" }, { status: 500 });
  }
}
