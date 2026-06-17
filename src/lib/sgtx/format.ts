// SGTX formatting & status helpers

export function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

export function fmtKg(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${n.toLocaleString("en-US")} kg`;
}

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export function timeAgo(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const s = Math.floor((Date.now() - date.getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export const PHASE_LABELS = [
  "Foundation", "Initiation", "Quote & Logistics", "Contracting",
  "Financing", "Execution", "Settlement", "Distressed", "Dispute",
];

export const STATUS_COLORS: Record<string, string> = {
  INITIATED: "#60a5fa", QUOTED: "#60a5fa", NEGOTIATING: "#fbbf24", CONTRACT_SIGNED: "#a78bfa",
  IN_EXECUTION: "#34d399", DELIVERED: "#10b981", SETTLED: "#10b981", DISPUTED: "#f87171", DISTRESSED: "#fb923c",
  VERIFIED: "#10b981", UPLOADED: "#60a5fa", REQUIRED: "#fbbf24", MISSING: "#f87171", REJECTED: "#f87171",
  PAID: "#10b981", PENDING: "#fbbf24", APPROVED: "#60a5fa", OVERDUE: "#f87171", DISPUTED_I: "#f87171",
  PASS: "#10b981", FAIL: "#f87171", CONDITIONAL_PASS: "#fbbf24", CONDITIONAL: "#fbbf24",
  PLANNED: "#94a3b8", LOADED: "#60a5fa", DEPARTED: "#a78bfa", IN_TRANSIT: "#a78bfa",
  ARRIVED: "#34d399", RELEASED: "#10b981", DELIVERED_S: "#10b981",
  OPERATIONAL: "#10b981", DEGRADED: "#fbbf24", OUTAGE: "#f87171",
  CLEARED: "#10b981", SUBMITTED: "#60a5fa", ASSESSED: "#a78bfa", HELD: "#f87171", DRAFT: "#94a3b8",
  OPEN: "#60a5fa", BIDDING: "#fbbf24", FUNDED: "#10b981", FILED: "#f87171",
  MEDIATION: "#fbbf24", ARBITRATION: "#fb923c", RESOLVED: "#10b981", ESCALATED: "#f87171",
  ACCEPTED: "#10b981", SUBMITTED_B: "#60a5fa", REJECTED_B: "#f87171",
  REQUESTED: "#fbbf24", SAMPLING: "#60a5fa", TESTING: "#a78bfa", COMPLETED: "#10b981",
  SCHEDULED: "#fbbf24", IN_PROGRESS: "#a78bfa",
};

export function statusColor(status: string): string {
  return STATUS_COLORS[status] || "#94a3b8";
}

export function healthColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#fbbf24";
  if (score >= 40) return "#fb923c";
  return "#f87171";
}

export function healthBand(score: number): string {
  if (score >= 85) return "Healthy";
  if (score >= 70) return "On Track";
  if (score >= 50) return "At Risk";
  if (score >= 30) return "Critical";
  return "Blocked";
}

// Trade Health Score components (Part 12G.7)
export function healthComponents(trade: any) {
  const docsTotal = (trade.documents?.length || 0) + 1;
  const docsVerified = trade.documents?.filter((d: any) => d.status === "VERIFIED").length || 0;
  const documentation = Math.round((docsVerified / Math.max(docsTotal, 1)) * 100);
  const compliance = trade.buyer?.sanctionsCleared && trade.seller?.sanctionsCleared ? 95 : 70;
  const logistics = trade.shipments?.some((s: any) => s.status === "IN_TRANSIT") ? 80 : trade.shipments?.some((s: any) => s.status === "DELIVERED") ? 100 : 65;
  const payment = trade.invoices?.some((i: any) => i.status === "PAID") ? 90 : 55;
  const risk = 100 - (trade.disputes?.length || 0) * 25;
  const timeline = trade.timeline?.filter((t: any) => t.completed).length / Math.max(trade.timeline?.length || 1, 1) * 100;
  const score = Math.round(documentation * 0.2 + compliance * 0.2 + logistics * 0.15 + payment * 0.15 + risk * 0.2 + timeline * 0.1);
  return { documentation, compliance, logistics, payment, risk: Math.max(risk, 0), timeline: Math.round(timeline), score };
}

export function priorityColor(p: number): string {
  if (p >= 80) return "#f87171";
  if (p >= 50) return "#fbbf24";
  return "#60a5fa";
}

export function categoryIcon(cat: string): string {
  const map: Record<string, string> = {
    NEEDS_SIGNATURE: "✍", NEEDS_APPROVAL: "✓", NEEDS_DOCUMENT: "📄", NEEDS_PAYMENT: "💳",
    SHIPMENT_ALERT: "🚢", NEW_OFFER: "💸", NEGOTIATION: "🤝", COMPLIANCE: "🛡", GENERAL: "•",
  };
  return map[cat] || "•";
}
