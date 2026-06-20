"use client";

import { motion } from "framer-motion";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ExecutiveCards, ShipmentsVault, ActivityFeed, DocumentsList, InvoicesList, QuickActions, SectionHeader, HealthBadge } from "@/components/sgtx/widgets";
import type { ExecCard } from "@/components/sgtx/widgets";
import { LoadingGuideWidget, GovernorDecisionPanel, InferenceLogScreen } from "@/components/sgtx/ai-widgets";
import { GovernorDecisionScreen, LoomVerificationScreen, JurisdictionMatrixScreen, NetworkScreen, ReadinessScreen, SarScreen } from "@/components/sgtx/governance-screens";
import { OpaPolicyScreen, QesScreen, DeviceTrustScreen, EvidencePackageScreen, ComplianceScreeningScreen } from "@/components/sgtx/constitutional-screens";
import { OrgGraphScreen, LifecycleScreen, RoleJourneyScreen, TrustPassportScreen } from "@/components/sgtx/identity-screens";
import { UstnMasterScreen } from "@/components/sgtx/ustn-screens";
import { FinancingBorrowerScreen, FinancingOpportunitiesScreen, FinancierPortfolioScreen, FinancierPreferencesScreen } from "@/components/sgtx/financing-screens";
import {
  AdminCommandCenter, AdminMetricsScreen, AdminIncidentsScreen, AdminThreatsScreen,
  AdminMultisigScreen, AdminAddOnsScreen, AdminIntegrationsScreen, AdminSlaScreen, AdminAuditScreen,
} from "@/components/sgtx/admin-screens";
import {
  MarketplaceCommandCenter, MarketplaceLeadsScreen, MarketplaceWebhooksScreen,
  MarketplaceRevenueScreen, MarketplaceApiKeysScreen, MarketplaceSandboxScreen,
  MarketplaceAgreementScreen, MarketplaceCompanyAdminScreen,
} from "@/components/sgtx/marketplace-screens";
import {
  ProviderPerformanceScreen,
  DispatchPlannerScreen,
  BookingRequestsScreen,
  WarehouseDashboardScreen,
  ContractRateManagerScreen,
  ReInspectionScreen,
  PhysicalJobsScreen,
} from "@/components/sgtx/provider-screens";
import { fmtUsd, fmtDate, fmtKg, statusColor, healthComponents, PHASE_LABELS } from "@/lib/sgtx/format";
import type { PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Store, Ship, FileText, Banknote, ShieldCheck, AlertTriangle, TrendingUp,
  Users, Container, FlaskConical, MapPin, Building2, Plus, Send, Gavel, Landmark,
  Activity, DollarSign, Package, CheckCircle2, Clock, Sparkles, Cpu, Globe2, Lock, Loader2,
  HeartHandshake, Trash2, Megaphone, Tag,
  Scale, RefreshCw, AlertCircle, Truck, PackageCheck, Inbox, Crown, ClipboardList,
  ChevronRight, Plane, Train, FileCheck, StickyNote, Rocket, Zap,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

type Data = any;

// ============ UNIVERSAL COMMAND CENTER (Part 12G) ============
// Part 12G.1 — Executive Summary Cards (clickable to navigate),
// Readiness Card (12G.1.2), role-specific cards (12G.1.3), trend indicators (12G.1.4),
// mobile-adapted grid (12G.9).
export function CommandCenter({ portal, data }: { portal: PortalConfig; data: Data }) {
  const openTcc = useAppStore((s) => s.openTcc);
  const setView = useAppStore((s) => s.setView);
  const setActiveTab: (t: string) => void = (data?._setActiveTab as any) || (() => {});
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
  const activeTrades = trades.filter((t) => t.status === "IN_EXECUTION" || t.status === "CONTRACT_SIGNED");
  const totalValue = trades.reduce((s, t) => s + t.tradeValueUsd, 0);
  const pendingInvoices = data.invoices?.filter((i) => i.status === "PENDING") || [];
  const overdueAmount = pendingInvoices.reduce((s, i) => s + i.amountUsd, 0);

  // Lightweight role-specific metric fetches (Part 12G.1.3 — Compliance Alerts, Distressed, etc.)
  const tenantGtid = portal.defaultTenantGtid;
  const { data: complianceScreenings } = useQuery({
    queryKey: ["cc-compliance", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/compliance/list?tenant=${tenantGtid}`)).json(); }
      catch { return []; }
    },
    enabled: ["trader-buyer", "trader-seller"].includes(portal.id),
    staleTime: 60_000,
  });
  const { data: distressedListings } = useQuery({
    queryKey: ["cc-distressed", tenantGtid],
    queryFn: async () => {
      try { const j = await (await fetch(`/api/sgtx/distressed/listings?sellerGtid=${tenantGtid}`)).json(); return j.listings || []; }
      catch { return []; }
    },
    enabled: portal.id === "trader-seller",
    staleTime: 60_000,
  });
  const { data: liquidationAlerts } = useQuery({
    queryKey: ["cc-liquidation", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/financing/liquidation-alerts?financierGtid=${tenantGtid}`)).json(); }
      catch { return []; }
    },
    enabled: portal.id === "bank" || portal.id === "pfi",
    staleTime: 60_000,
  });
  const { data: repaymentSchedule } = useQuery({
    queryKey: ["cc-repayments", tenantGtid],
    queryFn: async () => {
      try {
        const r = await (await fetch(`/api/sgtx/financing/repay?financierGtid=${tenantGtid}`)).json();
        // repay route returns { repayments: [...] } — we count "due soon" by looking at
        // financier's active loans (ACCEPTED bids) and treating the count as a proxy.
        return { repayments: r?.repayments || [], dueSoon: 0 };
      } catch { return { repayments: [], dueSoon: 0 }; }
    },
    enabled: portal.id === "bank" || portal.id === "pfi",
    staleTime: 60_000,
  });

  // Helper for nav clicks (also surfaces toast per 12G.1.4 "Click card → navigates")
  const nav = (tab: string, label: string) => () => {
    setActiveTab(tab);
    toast.success(`Opening ${label}…`, { description: `Switched to "${tab}" tab.` });
  };

  // Active disputes (already loaded by dashboard route for TRD tenants)
  const activeDisputes = (data.disputes || []).filter((d: any) => d.status === "FILED" || d.status === "MEDIATION" || d.status === "ARBITRATION");
  // Compliance alerts (non-clear screenings) — fallback to inbox COMPLIANCE category
  const complianceAlerts = (complianceScreenings || []).filter((c: any) => c.verdict && c.verdict !== "CLEAR").length
    || (data.inbox || []).filter((i: any) => i.category === "COMPLIANCE").length;
  // Distressed listings (active status)
  const distressedAlerts = (distressedListings || []).filter((l: any) => l.status === "ACTIVE" || l.status === "TRIAGED").length;
  // Logistics quotes pending (seller's inbound service quotations awaiting acceptance)
  const logisticsQuotesPending = (data.tradesAsSeller || []).reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0) > 0
    ? Math.min(3, (data.inbox || []).filter((i: any) => i.category === "NEW_OFFER" || i.category === "NEGOTIATION").length)
    : 0;
  // LSP open RFQs + active jobs
  const lspOpenRfqs = (data.inbox || []).filter((i: any) => i.category === "NEW_OFFER").length;
  const lspActiveJobs = (data.shipmentsCarrier || []).filter((s: any) => s.status === "IN_TRANSIT" || s.status === "DEPARTED" || s.status === "LOADED").length;
  // SHIP pending bookings + eBL signatures
  const shipPendingBookings = (data.shipmentsCarrier || []).filter((s: any) => s.status === "PLANNED").length;
  const shipEblSignatures = (data.shipmentsCarrier || []).filter((s: any) => s.status === "LOADED" || s.status === "DEPARTED").length;
  // Financier margin calls + repayments due
  const marginCalls = Array.isArray(liquidationAlerts) ? liquidationAlerts.filter((p: any) => p.risk?.status === "LIQUIDATION_RISK").length : 0;
  // Repayments due = active loans count (proxy: ACCEPTED bids), then subtract recent repayments.
  const activeLoansCount = (data.financingBids || []).filter((b: any) => b.status === "ACCEPTED").length;
  const repaidCount = (repaymentSchedule as any)?.repayments?.length ?? 0;
  const repaymentsDue = Math.max(0, activeLoansCount - repaidCount);
  // Government pending clearances + multi-agency approvals
  const govPendingClearances = (data.customsDecls || []).filter((c: any) => c.status === "SUBMITTED" || c.status === "ASSESSED").length
    || (data.inbox || []).filter((i: any) => i.category === "NEEDS_APPROVAL").length;
  const govMultiAgency = (data.inbox || []).filter((i: any) => i.category === "COMPLIANCE" && i.priority >= 80).length;

  // Role-specific executive cards (Part 12G.1.2 standard + 12G.1.3 role-specific)
  const cards: ExecCard[] = (() => {
    switch (portal.id) {
      case "trader-buyer":
        return [
          { label: "Open Trades", value: String(activeTrades.length), sub: `${trades.length} total`, icon: ShoppingBag, accent: "#1a6fb0", trend: activeTrades.length > 0 ? "active" : undefined, trendDir: "flat", onClick: nav("new-trade", "New Trade Request"), clickableHint: "Open new trade form" },
          { label: "Active Shipments", value: String(data.tradesAsBuyer?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Ship, accent: "#0ea5e9", onClick: nav("shipments", "Shipments Vault"), clickableHint: "View shipments vault" },
          { label: "Pending Approvals", value: String(data.inbox?.length), icon: Clock, accent: "#fbbf24", trend: data.inbox?.length > 5 ? "+3 today" : undefined, trendDir: data.inbox?.length > 5 ? "up" : "flat", onClick: nav("invoices", "Invoices & Payments"), clickableHint: "Review pending invoices" },
          { label: "Outstanding", value: fmtUsd(overdueAmount), sub: `${pendingInvoices.length} invoices`, icon: Banknote, accent: "#f87171", trendDir: "flat", onClick: nav("invoices", "Invoices"), clickableHint: "View invoices" },
          { label: "Compliance Alerts", value: String(complianceAlerts), sub: "sanctions · KYB · docs", icon: ShieldCheck, accent: "#9333ea", trend: complianceAlerts > 0 ? "needs review" : "all clear", trendDir: complianceAlerts > 0 ? "up" : "flat", onClick: nav("compliance", "Compliance"), clickableHint: "Open compliance screen" },
          { label: "Active Disputes", value: String(activeDisputes.length), sub: activeDisputes.length > 0 ? "filed / mediating" : "none active", icon: Gavel, accent: "#dc2626", trendDir: activeDisputes.length > 0 ? "up" : "flat", onClick: nav("disputes", "Disputes"), clickableHint: "View disputes" },
        ];
      case "trader-seller":
        return [
          { label: "Outbound Trades", value: String(data.tradesAsSeller?.length || 0), sub: `${activeTrades.length} active`, icon: Store, accent: "#d4321a", onClick: nav("requests", "Pending Requests"), clickableHint: "View inbound requests" },
          { label: "Containers", value: String(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Container, accent: "#c2410c", onClick: nav("shipments", "Shipments"), clickableHint: "View shipments" },
          { label: "Trade Value", value: fmtUsd(totalValue), icon: DollarSign, accent: "#10b981", trend: "+12%", trendDir: "up", onClick: nav("invoices", "Invoices"), clickableHint: "View invoices" },
          { label: "SGTX Fees Paid", value: fmtUsd(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.sgtxFeeUsd || 0), 0)), sub: "1.5% per side", icon: ShieldCheck, accent: "#a78bfa", trendDir: "flat" },
          { label: "Distressed Alerts", value: String(distressedAlerts), sub: distressedAlerts > 0 ? "needs triage" : "none active", icon: Megaphone, accent: "#fb923c", trend: distressedAlerts > 0 ? "urgent" : undefined, trendDir: distressedAlerts > 0 ? "up" : "flat", onClick: nav("distressed", "Distressed Cargo"), clickableHint: "Open distressed listings" },
          { label: "Logistics Quotes Pending", value: String(logisticsQuotesPending), sub: "RFQs awaiting", icon: FileText, accent: "#0ea5e9", trendDir: logisticsQuotesPending > 0 ? "up" : "flat", onClick: nav("quote-builder", "Quote Builder"), clickableHint: "Open quote builder" },
        ];
      case "lsp":
        return [
          { label: "Assignments", value: String(data.shipmentsCarrier?.length || 0), sub: "active", icon: Package, accent: "#c2410c", onClick: nav("assignments", "Assignments"), clickableHint: "View assignments" },
          { label: "In Transit", value: String(data.shipmentsCarrier?.filter((s: any) => s.status === "IN_TRANSIT").length || 0), icon: Truck, accent: "#ea580c", trendDir: "flat", onClick: nav("milestones", "Milestones"), clickableHint: "Track milestones" },
          { label: "Milestones Due", value: String(data.inbox?.length), icon: Clock, accent: "#fbbf24", onClick: nav("milestones", "Milestones"), clickableHint: "Confirm milestones" },
          { label: "Revenue (mo)", value: fmtUsd(8420), icon: Banknote, accent: "#10b981", trend: "+5%", trendDir: "up" },
          { label: "Open RFQs", value: String(lspOpenRfqs), sub: "awaiting response", icon: Inbox, accent: "#0ea5e9", trendDir: lspOpenRfqs > 0 ? "up" : "flat", onClick: nav("assignments", "RFQ Queue"), clickableHint: "Review open RFQs" },
          { label: "Active Jobs", value: String(lspActiveJobs), sub: "in execution", icon: Activity, accent: "#10b981", trendDir: "flat", onClick: nav("dispatch-planner", "Dispatch Planner"), clickableHint: "Open dispatch planner" },
        ];
      case "ship":
        return [
          { label: "Vessels Active", value: "3", sub: "2 in transit", icon: Ship, accent: "#0d6efd", onClick: nav("vessels", "Vessel Fleet"), clickableHint: "View vessel fleet" },
          { label: "Containers", value: String(data.shipmentsCarrier?.length || 0), icon: Container, accent: "#0ea5e9", onClick: nav("containers", "Container Release"), clickableHint: "Container release (CRA)" },
          { label: "Releases Pending", value: String(data.shipmentsCarrier?.filter((s: any) => s.status === "ARRIVED").length || 0), icon: ShieldCheck, accent: "#fbbf24", onClick: nav("containers", "Container Release"), clickableHint: "Authorise releases" },
          { label: "B/L Issued", value: String(data.shipmentsCarrier?.length || 0), icon: FileText, accent: "#a78bfa", onClick: nav("bl", "Bill of Lading"), clickableHint: "Manage B/L" },
          { label: "Pending Bookings", value: String(shipPendingBookings), sub: "awaiting confirm", icon: PackageCheck, accent: "#fbbf24", trendDir: shipPendingBookings > 0 ? "up" : "flat", onClick: nav("booking-requests", "Booking Requests"), clickableHint: "Confirm bookings" },
          { label: "eBL Signatures", value: String(shipEblSignatures), sub: "pending signature", icon: FileText, accent: "#9333ea", trendDir: shipEblSignatures > 0 ? "up" : "flat", onClick: nav("bl", "Bill of Lading"), clickableHint: "Sign eBLs" },
        ];
      case "lab":
        return [
          { label: "Test Requests", value: String(data.labTests?.length || 0), icon: FlaskConical, accent: "#16a34a", onClick: nav("requests", "Test Requests"), clickableHint: "View test requests" },
          { label: "In Testing", value: String(data.labTests?.filter((l: any) => l.status === "TESTING" || l.status === "SAMPLING").length || 0), icon: Cpu, accent: "#fbbf24", onClick: nav("queue", "Sampling Queue"), clickableHint: "Open sampling queue" },
          { label: "Reports Issued", value: String(data.labTests?.filter((l: any) => l.status === "COMPLETED").length || 0), icon: FileText, accent: "#10b981", onClick: nav("reports", "Reports"), clickableHint: "View reports" },
          { label: "Pass Rate", value: "94%", icon: CheckCircle2, accent: "#a78bfa", trend: "+2%", trendDir: "up" },
        ];
      case "qc":
        return [
          { label: "Inspections", value: String(data.qcInspections?.length || 0), icon: ShieldCheck, accent: "#9333ea", onClick: nav("schedule", "Inspection Schedule"), clickableHint: "View schedule" },
          { label: "Scheduled", value: String(data.qcInspections?.filter((q: any) => q.status === "SCHEDULED").length || 0), icon: Clock, accent: "#fbbf24", onClick: nav("schedule", "Schedule"), clickableHint: "Scheduled inspections" },
          { label: "Pass Rate", value: "97%", sub: "0 defects avg", icon: CheckCircle2, accent: "#10b981", trend: "+1%", trendDir: "up" },
          { label: "Field Reports", value: String(data.qcInspections?.filter((q: any) => q.status === "COMPLETED").length || 0), icon: FileText, accent: "#0ea5e9", onClick: nav("reports", "Reports"), clickableHint: "View field reports" },
        ];
      case "cbr":
        return [
          { label: "Declarations", value: String(data.customsDecls?.length || 0), icon: Landmark, accent: "#ca8a04", onClick: nav("declarations", "Declarations"), clickableHint: "View declarations" },
          { label: "Cleared", value: String(data.customsDecls?.filter((c: any) => c.status === "CLEARED").length || 0), icon: CheckCircle2, accent: "#10b981", trendDir: "up" },
          { label: "Pending Nafeza", value: String(data.customsDecls?.filter((c: any) => c.status === "SUBMITTED").length || 0), icon: Clock, accent: "#fbbf24", trendDir: "flat", onClick: nav("clearance", "Clearance Status"), clickableHint: "Track Nafeza" },
          { label: "Certificates", value: String(data.customsDecls?.length || 0), icon: FileText, accent: "#a78bfa", onClick: nav("certificates", "Certificates of Origin"), clickableHint: "Issue certificates" },
        ];
      case "bank":
      case "pfi":
        return [
          { label: "Open RFQs", value: String(data.openFinancingRequests?.length || 0), icon: Banknote, accent: portal.accent, trendDir: data.openFinancingRequests?.length > 0 ? "up" : "flat", onClick: nav("opportunities", "Financing Opportunities"), clickableHint: "View RFQs" },
          { label: "My Bids", value: String(data.financingBids?.length || 0), icon: TrendingUp, accent: "#10b981", onClick: nav("portfolio", "My Bids & Loans"), clickableHint: "View portfolio" },
          { label: "Exposure", value: fmtUsd(data.financingBids?.reduce((s: number, b: any) => s + (b.amountOffered || 0), 0)), icon: DollarSign, accent: "#fbbf24", trendDir: "flat" },
          { label: "Active Loans", value: String(data.financingBids?.filter((b: any) => b.status === "ACCEPTED").length || 0), icon: Activity, accent: "#0ea5e9", onClick: nav("portfolio", "Loans"), clickableHint: "View active loans" },
          { label: "Margin Calls", value: String(marginCalls), sub: marginCalls > 0 ? "urgent action" : "none active", icon: Scale, accent: "#f87171", trend: marginCalls > 0 ? "at risk" : undefined, trendDir: marginCalls > 0 ? "up" : "flat", onClick: nav("collateral", "Collateral & Margin"), clickableHint: "Manage collateral" },
          { label: "Repayments Due", value: String(repaymentsDue), sub: "next 7 days", icon: RefreshCw, accent: "#fb923c", trendDir: repaymentsDue > 0 ? "up" : "flat", onClick: nav("portfolio", "Repayments"), clickableHint: "View repayment schedule" },
        ];
      case "gov":
        return [
          { label: "National Trades", value: String(trades.length), sub: "tracked", icon: Globe2, accent: "#b45309", trendDir: "flat", onClick: nav("trade-flow", "National Trade Flow"), clickableHint: "View trade flow" },
          { label: "Cross-border Flow", value: fmtUsd(totalValue), sub: "monitored", icon: DollarSign, accent: "#15803d", onClick: nav("fx", "FX & Settlement"), clickableHint: "FX monitoring" },
          { label: "Customs Pending", value: String((data.inbox || []).filter((i: any) => i.category === "NEEDS_APPROVAL").length), icon: Landmark, accent: "#ca8a04", onClick: nav("customs", "Customs Assessment"), clickableHint: "Assess declarations" },
          { label: "FX Alerts", value: String((data.inbox || []).filter((i: any) => i.category === "COMPLIANCE").length), icon: AlertTriangle, accent: "#f87171", onClick: nav("fx", "FX"), clickableHint: "View FX alerts" },
          { label: "Pending Clearances", value: String(govPendingClearances), sub: "awaiting decision", icon: ClipboardList, accent: "#fbbf24", trendDir: govPendingClearances > 0 ? "up" : "flat", onClick: nav("customs", "Customs"), clickableHint: "Clear shipments" },
          { label: "Multi-Agency Approvals", value: String(govMultiAgency), sub: "inter-agency", icon: Building2, accent: "#9333ea", trendDir: govMultiAgency > 0 ? "up" : "flat", onClick: nav("food-safety", "Food Safety"), clickableHint: "Multi-agency queue" },
        ];
      default:
        return [];
    }
  })();

  const quickActions = (() => {
    switch (portal.id) {
      case "trader-buyer": return [{ label: "New Trade Request", icon: Plus, tab: "new-trade" }, { label: "Approve Invoice", icon: CheckCircle2, tab: "invoices" }, { label: "Upload Document", icon: FileText, tab: "documents" }, { label: "Track Shipment", icon: MapPin, tab: "shipments" }];
      case "trader-seller": return [{ label: "Submit Quote", icon: Store, tab: "quote-builder" }, { label: "Confirm Pickup", icon: Package, tab: "shipments" }, { label: "Sign Addendum", icon: ShieldCheck, tab: "contract" }, { label: "File Dispute", icon: Gavel, tab: "disputes" }];
      case "lsp": return [{ label: "Assign Driver", icon: Users, tab: "assignments" }, { label: "Confirm Milestone", icon: CheckCircle2, tab: "milestones" }, { label: "Upload CMR", icon: FileText, tab: "addenda" }, { label: "Track Fleet", icon: Truck, tab: "fleet" }];
      case "ship": return [{ label: "Issue B/L", icon: FileText, tab: "bl" }, { label: "Authorise Release", icon: ShieldCheck, tab: "containers" }, { label: "Update AIS", icon: MapPin, tab: "schedules" }, { label: "Add Vessel", icon: Plus, tab: "vessels" }];
      case "lab": return [{ label: "Start Sampling", icon: FlaskConical, tab: "queue" }, { label: "Release Report", icon: FileText, tab: "reports" }, { label: "Schedule Pickup", icon: Package, tab: "requests" }, { label: "Calibrate", icon: Cpu, tab: "requests" }];
      case "qc": return [{ label: "Start Inspection", icon: ShieldCheck, tab: "schedule" }, { label: "Log Defect", icon: AlertTriangle, tab: "field" }, { label: "Upload Photos", icon: FileText, tab: "field" }, { label: "Issue Report", icon: CheckCircle2, tab: "reports" }];
      case "cbr": return [{ label: "File Declaration", icon: Landmark, tab: "declarations" }, { label: "Issue EUR.1", icon: FileText, tab: "certificates" }, { label: "Track Nafeza", icon: Globe2, tab: "clearance" }, { label: "Clear Shipment", icon: CheckCircle2, tab: "clearance" }];
      case "bank": case "pfi": return [{ label: "Submit Bid", icon: Banknote, tab: "opportunities" }, { label: "Review RFQ", icon: FileText, tab: "opportunities" }, { label: "Margin Call", icon: AlertTriangle, tab: "collateral" }, { label: "Proof of Reserves", icon: Lock, tab: "collateral" }];
      case "gov": return [{ label: "Assess Declaration", icon: Landmark, tab: "customs" }, { label: "Reconcile FX", icon: DollarSign, tab: "fx" }, { label: "Food Safety Alert", icon: AlertTriangle, tab: "food-safety" }, { label: "View Trade Map", icon: Globe2, tab: "trade-flow" }];
      default: return [];
    }
  })();

  const handleQuickAction = (a: { label: string; tab?: string }) => {
    console.log("[QuickAction]", portal.id, a.label, "→ tab:", a.tab);
    if (a.tab) {
      setActiveTab(a.tab);
      toast.success(`Opening ${a.label}…`, { description: `Switched to "${a.tab}" tab.` });
    } else {
      toast.info(a.label);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <SectionHeader title={`${portal.shortName} Command Center`} subtitle="Universal Command Center · Part 12G · primary landing for all authenticated users" />
        {/* Part 12G.1.2 — Readiness Card (shown for all portals) */}
        <ReadinessCard portal={portal} tenantGtid={portal.defaultTenantGtid} onOpen={() => nav("readiness", "Trade Readiness")()} />
      </div>

      <div>
        <SectionHeader title="Executive Summary" subtitle="Part 12G.1 · click any card to drill into the filtered view · trend indicators show direction" />
        <ExecutiveCards cards={cards} />
      </div>

      <div>
        <SectionHeader title="Quick Actions" subtitle="One-click irreversible actions · voice commands count as zero clicks" />
        {/* Part 12G.9 — Quick Actions grid is horizontal-scroll on mobile (≤768px), 4 cols on ≥sm */}
        <div className="-mx-1 px-1 overflow-x-auto scroll-gold sm:overflow-visible">
          <div className="grid grid-cols-2 min-w-[480px] sm:min-w-0 sm:grid-cols-4 gap-2.5">
            {quickActions.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.label}
                  onClick={() => handleQuickAction(a)}
                  className="glass-panel rounded-xl p-3 text-left hover:ring-gold transition-all group"
                >
                  <Icon className="w-4.5 h-4.5 mb-2" style={{ color: portal.accent }} />
                  <p className="text-xs font-medium text-foreground group-hover:text-gold transition-colors">{a.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ShipmentsVault trades={trades} role={portal.id.includes("buyer") ? "buyer" : "seller"} title="Open Trades" />
          <ActivityFeed activities={data.activities} />
        </div>
        <div className="space-y-4">
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Sparkles className="w-4 h-4 text-gold" /> AI Operations Summary</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {data.inbox?.length > 0 ? (
                <>You have <span className="text-gold font-semibold">{data.inbox.length} pending actions</span>, {data.inbox.filter((i: any) => i.priority >= 80).length} high priority. {activeTrades.length} trades in execution worth {fmtUsd(activeTrades.reduce((s, t) => s + t.tradeValueUsd, 0))}. </>
              ) : "You're all caught up. "}
              {overdueAmount > 0 && <span className="text-red-400">{fmtUsd(overdueAmount)} in outstanding payments.</span>}
              No counterparty recommendations — SGTX is a non-marketplace system.
            </p>
          </Card>
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Governor & Integrations</h3>
            <IntegrationsMini />
          </Card>
          {portal.dualMode && (
            <Card className="p-4 border-gold/30 bg-gold/5">
              <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-1">Dual-Mode Active</p>
              <p className="text-xs text-foreground/80">You operate as both Buyer and Seller. Use the toggle in the top bar to switch context. OPA policies enforce mode-appropriate actions.</p>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// Part 12G.1.2 — Readiness Card: shows readiness score with link to readiness tab.
// Clicking opens the readiness tab (one-click drill-down per blueprint 12G.1.4).
function ReadinessCard({ portal, tenantGtid, onOpen }: { portal: PortalConfig; tenantGtid: string; onOpen: () => void }) {
  const { data: readiness, isLoading } = useQuery({
    queryKey: ["cc-readiness", tenantGtid],
    queryFn: async () => {
      try { return await (await fetch(`/api/sgtx/readiness?tenant=${tenantGtid}`)).json(); }
      catch { return null; }
    },
    staleTime: 60_000,
  });
  const score = readiness?.score ?? 0;
  const status = score >= 85 ? "Fully Ready" : score >= 70 ? "Mostly Ready" : score >= 50 ? "Partially Ready" : "Not Ready";
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#fbbf24" : score >= 40 ? "#fb923c" : "#f87171";
  const cat: { label: string; val: number; weight: number }[] = readiness ? [
    { label: "Company", val: readiness.companyScore ?? 0, weight: 35 },
    { label: "Banking", val: readiness.bankingScore ?? 0, weight: 25 },
    { label: "Trade", val: readiness.tradeScore ?? 0, weight: 20 },
    { label: "Security", val: readiness.securityScore ?? 0, weight: 15 },
    { label: "Legal", val: readiness.legalScore ?? 0, weight: 5 },
  ] : [];

  return (
    <Card
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className="relative p-4 sm:p-5 mb-4 overflow-hidden cursor-pointer hover:border-gold/50 hover:shadow-lg hover:shadow-gold/10 transition-all group focus-visible:ring-2 focus-visible:ring-gold/60 focus-visible:outline-none"
    >
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{ background: `radial-gradient(ellipse at top right, ${color}, transparent 60%)` }} />
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* Score ring */}
        <div className="flex items-center gap-4">
          <div className="relative w-16 h-16 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-16 h-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="2.5" className="text-muted/30" />
              <circle cx="18" cy="18" r="15.5" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round"
                strokeDasharray={`${(score / 100) * 97.4} 97.4`} />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /> :
                <span className="text-base font-bold font-display" style={{ color }}>{score}<span className="text-[0.6rem] text-muted-foreground">%</span></span>}
            </div>
          </div>
          <div>
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold flex items-center gap-1.5">
              <ShieldCheck className="w-3 h-3 text-gold" /> Trade Readiness
              <span className="hidden sm:inline text-gold/60">·</span>
              <span className="hidden sm:inline text-gold/60 normal-case tracking-normal">Part 12G.1.2</span>
            </p>
            <p className="text-sm font-bold" style={{ color }}>{status}</p>
            <p className="text-[0.6rem] text-muted-foreground mt-0.5">
              {score >= 70 ? "Governor allows trade.create" : "Governor blocks trade.create < 70%"}
            </p>
          </div>
        </div>

        {/* Sub-scores */}
        <div className="flex-1 grid grid-cols-5 gap-2 min-w-0">
          {cat.length === 0 && !isLoading ? (
            <p className="col-span-5 text-[0.65rem] text-muted-foreground italic">Readiness data unavailable.</p>
          ) : cat.length === 0 ? (
            <p className="col-span-5 text-[0.65rem] text-muted-foreground italic">Calculating…</p>
          ) : cat.map((c) => (
            <div key={c.label} className="min-w-0">
              <div className="flex items-baseline justify-between mb-0.5">
                <span className="text-[0.55rem] text-muted-foreground truncate">{c.label}</span>
                <span className="text-[0.55rem] text-muted-foreground/70">{c.weight}%</span>
              </div>
              <div className="h-1 rounded-full bg-muted overflow-hidden mb-0.5">
                <div className="h-full rounded-full" style={{ width: `${c.val}%`, background: c.val >= 80 ? "#10b981" : c.val >= 60 ? "#fbbf24" : "#f87171" }} />
              </div>
              <span className="text-[0.6rem] font-semibold" style={{ color: c.val >= 80 ? "#10b981" : c.val >= 60 ? "#fbbf24" : "#f87171" }}>{c.val}%</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div className="flex-shrink-0 hidden md:flex items-center">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-gold/10 text-gold border border-gold/30 hover:bg-gold/20 transition-colors"
          >
            View Readiness <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </Card>
  );
}

function IntegrationsMini() {
  const { data: integ } = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/sgtx/integrations")).json() });
  if (!integ) return <p className="text-xs text-muted-foreground">Loading…</p>;
  return (
    <div className="space-y-1.5">
      {integ.slice(0, 5).map((i: any) => {
        const color = statusColor(i.status);
        return (
          <div key={i.id} className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{i.name}</span>
            <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} /><span style={{ color }}>{i.status}</span></span>
          </div>
        );
      })}
    </div>
  );
}

// ============ NEW TRADE REQUEST (Buyer) ============
// ============ NEW TRADE REQUEST (Buyer) — Full Phase 1 Implementation ============
const INCOTERM_REFERENCE: Record<string, { sellerLogisticsTo: string; sellerFreight: boolean; sellerDestCharges: boolean; sellerDuties: boolean; mandatoryServices: string[] }> = {
  EXW: { sellerLogisticsTo: "Seller's premises", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: [] },
  FCA: { sellerLogisticsTo: "Named place (carrier)", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: [] },
  FOB: { sellerLogisticsTo: "Loading on vessel", sellerFreight: false, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Export clearance"] },
  CFR: { sellerLogisticsTo: "Destination port", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Ocean freight", "Export clearance"] },
  CIF: { sellerLogisticsTo: "Destination port + insurance", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Ocean freight", "Insurance", "Export clearance"] },
  CPT: { sellerLogisticsTo: "Named place", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Main carriage", "Export clearance"] },
  CIP: { sellerLogisticsTo: "Named place + insurance", sellerFreight: true, sellerDestCharges: false, sellerDuties: false, mandatoryServices: ["Main carriage", "Insurance", "Export clearance"] },
  DAP: { sellerLogisticsTo: "Named place", sellerFreight: true, sellerDestCharges: true, sellerDuties: false, mandatoryServices: ["Main carriage", "Destination charges", "Export clearance"] },
  DPU: { sellerLogisticsTo: "Terminal", sellerFreight: true, sellerDestCharges: true, sellerDuties: false, mandatoryServices: ["Main carriage", "Terminal charges", "Export clearance"] },
  DDP: { sellerLogisticsTo: "Named place (duties paid)", sellerFreight: true, sellerDestCharges: true, sellerDuties: true, mandatoryServices: ["Main carriage", "Destination charges", "Import duties", "Export clearance"] },
};

const COMMODITY_TYPES = ["Fresh Fruits", "Fresh Vegetables", "Frozen Fruits", "Frozen Vegetables", "Grains", "Dairy", "Meat", "Seafood", "Other"];
const PRODUCTS_BY_TYPE: Record<string, { name: string; hs: string }[]> = {
  "Fresh Fruits": [{ name: "Valencia Oranges", hs: "0805.10" }, { name: "Navel Oranges", hs: "0805.10" }, { name: "Eureka Lemons", hs: "0805.50" }, { name: "Strawberries (Fresh)", hs: "0810.10" }],
  "Frozen Fruits": [{ name: "Frozen Strawberries (IQF)", hs: "0811.10" }, { name: "Frozen Raspberries", hs: "0811.20" }, { name: "Frozen Mangoes", hs: "0811.90" }],
  "Fresh Vegetables": [{ name: "Fresh Onions", hs: "0703.10" }, { name: "Fresh Tomatoes", hs: "0702.00" }, { name: "Fresh Potatoes", hs: "0701.90" }],
  "Frozen Vegetables": [{ name: "Frozen Peas", hs: "0710.21" }, { name: "Frozen Spinach", hs: "0710.30" }],
  "Grains": [{ name: "Rice", hs: "1006.30" }, { name: "Wheat", hs: "1001.99" }],
  "Dairy": [{ name: "Cheese", hs: "0406.90" }, { name: "Butter", hs: "0405.10" }],
  "Meat": [{ name: "Frozen Beef", hs: "0202.30" }, { name: "Frozen Chicken", hs: "0207.14" }],
  "Seafood": [{ name: "Frozen Shrimp", hs: "0306.17" }, { name: "Fresh Salmon", hs: "0302.12" }],
  "Other": [],
};

export function NewTradeRequestScreen() {
  // ── Step navigation ────────────────────────────────────────────────
  const [step, setStep] = useState(1);
  const STEPS = [
    { id: 1, label: "Parties & Incoterm", desc: "Seller + trade terms" },
    { id: 2, label: "Commodity & Spec", desc: "Product + packaging" },
    { id: 3, label: "Containers & Cargo", desc: "Cargo + commodities" },
    { id: 4, label: "Documentation", desc: "Trigger-driven docs" },
    { id: 5, label: "Transport & Logistics", desc: "Mode + delivery window" },
    { id: 6, label: "Insurance", desc: "Requirement + party" },
    { id: 7, label: "Commercial Settlement", desc: "Structure + payment" },
    { id: 8, label: "Criticality & Readiness", desc: "Routing + score" },
    { id: 9, label: "Shipments & Notes", desc: "Schedule + instructions" },
    { id: 10, label: "Governor & Submit", desc: "Pre-screen + review" },
  ];

  // ── Step 1: Parties & Incoterm ─────────────────────────────────────
  const [sellerSearch, setSellerSearch] = useState("");
  const [sellerResults, setSellerResults] = useState<any[]>([]);
  const [selectedSeller, setSelectedSeller] = useState<any>({ name: "Strawberry Export Co.", gtid: "SGTX-EG-TRD-002139-7F3A", trust: 92, sanctions: true });
  const [showContactModal, setShowContactModal] = useState(false);
  const [showTrustPortrait, setShowTrustPortrait] = useState(false);
  const [trustPortrait, setTrustPortrait] = useState<string | null>(null);
  const [trustPortraitLoading, setTrustPortraitLoading] = useState(false);
  const [searchDebounce, setSearchDebounce] = useState<any>(null);
  const [keyboardIndex, setKeyboardIndex] = useState(-1);
  const [gtidValid, setGtidValid] = useState<boolean | null>(null);
  const [incoterm, setIncoterm] = useState("CIF");
  const [incotermSummary, setIncotermSummary] = useState<string | null>(null);
  const [incotermLoading, setIncotermLoading] = useState(false);

  // ── Step 2: Commodity & Product Spec ───────────────────────────────
  const [expressMode, setExpressMode] = useState(false);
  const [expressText, setExpressText] = useState("");
  const [expressParsed, setExpressParsed] = useState<any>(null);
  const [expressParsing, setExpressParsing] = useState(false);
  const [commodityType, setCommodityType] = useState("Frozen Fruits");
  const [productName, setProductName] = useState("Frozen Strawberries (IQF)");
  const [hsCode, setHsCode] = useState("0811.10");
  // AI HS Code detection (Part 4.3)
  const [productSearch, setProductSearch] = useState("");
  const [hsDetection, setHsDetection] = useState<any>(null);
  const [hsDetectionLoading, setHsDetectionLoading] = useState(false);
  const hsDetectTimer = useRef<any>(null);
  const detectHsCode = async (query: string) => {
    if (!query.trim() || query.trim().length < 3) { setHsDetection(null); return; }
    setHsDetectionLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/detect-hs-code", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ product: query.trim() }) });
      const d = await res.json();
      if (d.ok && d.detection) {
        setHsDetection(d.detection);
        if (d.detection.hsCode && d.detection.hsCode !== "Unknown" && d.detection.confidence >= 0.5) {
          setHsCode(d.detection.hsCode);
          if (d.detection.description) setProductName(d.detection.description);
        }
      }
    } catch {} finally { setHsDetectionLoading(false); }
  };
  const onProductSearchChange = (val: string) => {
    setProductSearch(val);
    if (hsDetectTimer.current) clearTimeout(hsDetectTimer.current);
    hsDetectTimer.current = setTimeout(() => detectHsCode(val), 600);
  };
  const [productForm, setProductForm] = useState<any>(null);
  const [productFormLoading, setProductFormLoading] = useState(false);
  const [recentProducts] = useState<any[]>([{ name: "Frozen Strawberries (IQF)", hs: "0811.10", date: "2026-03-15" }, { name: "Frozen Raspberries", hs: "0811.20", date: "2026-02-20" }]);
  const [packaging, setPackaging] = useState<string>("Cartons (12.5 kg)");
  const [coldChain, setColdChain] = useState("yes");

  // ── Step 3: Containers & Cargo ──────────────────────────────────────
  // Each container has a containerSize ("40ft"|"20ft") set in Step 4 when orderBy=container
  const [containers, setContainers] = useState<any[]>([{ id: 1, originCountry: "EG", destCountry: "DE", port: "Hamburg (DEHAM)", palletized: true, palletSize: "EUR", destOverride: "", notes: "", containerSize: "40ft", commodities: [{ id: 1, type: "Frozen Fruits", product: "Frozen Strawberries (IQF)", hs: "0811.10", packaging: "Cartons (12.5 kg)", pallets: 20, netWeight: 10, grossWeight: 10.5, notes: "" }] }]);
  const [activeContainer, setActiveContainer] = useState(0);
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showDestOverride, setShowDestOverride] = useState<Record<number, boolean>>({});
  const [showRemoveConfirm, setShowRemoveConfirm] = useState<number | null>(null);
  const [containerAdvice, setContainerAdvice] = useState<any>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);

  // ── Step 4: Commercial Terms ────────────────────────────────────────
  // orderBy determines UI: "container" → per-container 40ft/20ft; "cartons"|"packaging"|"weight" → global single value
  const [orderBy, setOrderBy] = useState<string>("container");
  const [orderValue, setOrderValue] = useState<string>("20000");
  const [paymentTerms, setPaymentTerms] = useState<string>("");
  const [paymentTermsDetails, setPaymentTermsDetails] = useState<string>("");

  // ── Step 5: Shipments & Notes ──────────────────────────────────────
  const [multiShipment, setMultiShipment] = useState(false);
  const [shipments, setShipments] = useState<any[]>([{ id: 1, deliveryDate: "", port: "Hamburg (DEHAM)", containers: 1 }]);
  const [globalNotes, setGlobalNotes] = useState("");
  const [aiNotesSuggestion, setAiNotesSuggestion] = useState<string | null>(null);
  const [aiNotesLoading, setAiNotesLoading] = useState(false);
  const [attribution, setAttribution] = useState<any>(null);
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");

  // ── Step 6: Compliance & Submit ────────────────────────────────────
  const [prescreen, setPrescreen] = useState<{ verdict: string; conditions: string[]; content: string } | null>(null);
  const [prescreenLoading, setPrescreenLoading] = useState(false);
  const [prescreenProvider, setPrescreenProvider] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);

  // ── Step 4: Documentation Requirements (Part 4.5) ──────────────────
  const [docRequirements, setDocRequirements] = useState<any[]>([]);
  const [docRequirementsLoading, setDocRequirementsLoading] = useState(false);
  const [docOverride, setDocOverride] = useState<Record<string, { mandatory?: boolean; trigger?: string; format?: string; notes?: string }>>({});

  // ── Step 5: Transport & Logistics (Part 4.7) ──────────────────────
  const [transportMode, setTransportMode] = useState<string>("OCEAN");
  const [equipmentType, setEquipmentType] = useState<string>("");
  const [equipmentCount, setEquipmentCount] = useState<number>(1);
  const [altPorts, setAltPorts] = useState<string>("");
  const [earliestDeliveryDate, setEarliestDeliveryDate] = useState<string>("");
  const [preferredDeliveryDate, setPreferredDeliveryDate] = useState<string>("");
  const [latestDeliveryDate, setLatestDeliveryDate] = useState<string>("");
  const [transitTimeDays, setTransitTimeDays] = useState<number | null>(null);
  const [criticalityRules, setCriticalityRules] = useState<any[]>([]);

  const EQUIPMENT_BY_MODE: Record<string, { value: string; label: string }[]> = {
    OCEAN: [
      { value: "STANDARD", label: "Standard Dry (20ft/40ft)" },
      { value: "HC", label: "High Cube (40ft HC)" },
      { value: "REEFER", label: "Reefer (temperature-controlled)" },
      { value: "OPEN_TOP", label: "Open Top" },
      { value: "FLAT_RACK", label: "Flat Rack" },
      { value: "TANK", label: "Tank Container" },
    ],
    AIR: [
      { value: "ULD_PALLET", label: "ULD Pallet" },
      { value: "ULD_CONTAINER", label: "ULD Container (LD3/LD7)" },
      { value: "BULK", label: "Bulk Cargo" },
    ],
    RAIL: [
      { value: "BOX_WAGON", label: "Box Wagon" },
      { value: "FLAT_WAGON", label: "Flat Wagon" },
      { value: "TANK_WAGON", label: "Tank Wagon" },
      { value: "REEFER_WAGON", label: "Reefer Wagon" },
    ],
    TRUCK: [
      { value: "DRY_VAN", label: "Dry Van Trailer" },
      { value: "REEFER_TRUCK", label: "Reefer Truck" },
      { value: "FLATBED", label: "Flatbed Trailer" },
      { value: "CURTAIN_SIDE", label: "Curtain Side Trailer" },
    ],
    MULTIMODAL: [
      { value: "STANDARD", label: "Container (ISO)" },
      { value: "REEFER", label: "Reefer Container" },
      { value: "FLAT_RACK", label: "Flat Rack" },
    ],
  };

  // ── Step 6: Insurance Requirements (Part 4.8) ─────────────────────
  const [insuranceRequirement, setInsuranceRequirement] = useState<string>("");
  const [insuranceType, setInsuranceType] = useState<string>("");
  const [insuranceResponsibleParty, setInsuranceResponsibleParty] = useState<string>("ACCORDING_TO_INCOTERM");
  const [insuranceCoveragePct, setInsuranceCoveragePct] = useState<number>(110);
  const [insuranceCurrency, setInsuranceCurrency] = useState<string>("USD");

  // ── Step 7: Commercial Settlement (Part 4.9) ──────────────────────
  const [commercialPriority, setCommercialPriority] = useState<string>("");
  const [settlementStructure, setSettlementStructure] = useState<string>("");
  const [paymentTiming, setPaymentTiming] = useState<string>("");
  const [creditPeriod, setCreditPeriod] = useState<string>("");
  const [creditPeriodCustomDays, setCreditPeriodCustomDays] = useState<number | null>(null);
  const [settlementCurrency, setSettlementCurrency] = useState<string>("USD");
  const [financingInterest, setFinancingInterest] = useState<string>("");
  const [bankInstrument, setBankInstrument] = useState<string>("NONE");
  const [settlementFlexibility, setSettlementFlexibility] = useState<string>("");
  const [balanceTiming, setBalanceTiming] = useState<string>("");
  const [settlementDocuments, setSettlementDocuments] = useState<string[]>(["COMMERCIAL_INVOICE", "PACKING_LIST", "BILL_LADING"]);
  const [originalDocsRequired, setOriginalDocsRequired] = useState<boolean>(true);
  const [documentLanguage, setDocumentLanguage] = useState<string>("EN");

  // ── Step 8: Trade Criticality & Readiness (Part 4.10 + 4.11) ──────
  const [tradeCriticality, setTradeCriticality] = useState<string>("ROUTINE");
  const [criticalitySuggested, setCriticalitySuggested] = useState<any>(null);
  const [criticalityLoading, setCriticalityLoading] = useState(false);
  const [readiness, setReadiness] = useState<{ score: number; missing: any[]; components: Record<string, number>; isReadyForSubmission: boolean } | null>(null);
  const [readinessLoading, setReadinessLoading] = useState(false);

  // ── Step 9: Special Trade Instructions (Part 4.6) ─────────────────
  const [specialInstructions, setSpecialInstructions] = useState<string>("");
  const [instructionCategories, setInstructionCategories] = useState<any[]>([]);
  const INSTRUCTION_TEMPLATES = [
    "Phytosanitary certificate required",
    "Reefer pre-cooling required before loading",
    "Arabic labels mandatory on all cartons",
    "No wooden pallets (ISPM-15 compliant only)",
    "Temperature logger required in each container",
    "Original Bill of Lading to be sent by DHL",
    "Inspection must be witnessed by buyer's representative",
    "Arbitration: DIFC-LCIA, Dubai",
    "SGS inspection required at origin",
    "Direct call required (no transshipment)",
  ];

  // ── Draft autosave (cross-step) ────────────────────────────────────
  const [draftSaved, setDraftSaved] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [draftExpiry] = useState({ daysLeft: 11, reminders: [11, 13] });
  const incotermConfig = INCOTERM_REFERENCE[incoterm] || INCOTERM_REFERENCE.CIF;
  const allContacts = [
    { name: "Strawberry Export Co.", gtid: "SGTX-EG-TRD-002139-7F3A", trust: 92, sanctions: true, lastTrade: "2026-03-15", logo: "#d4321a" },
    { name: "Mekong Fresh", gtid: "SGTX-VN-TRD-005521-3D9E", trust: 85, sanctions: true, lastTrade: "2026-01-20", logo: "#0f9d58" },
    { name: "Nile Foods Group", gtid: "SGTX-EG-TRD-008842-1A2B", trust: 79, sanctions: true, lastTrade: "2025-11-10", logo: "#7b3fa0" },
    { name: "Delta Freight & Forwarding", gtid: "SGTX-EG-LSP-000120-4C7D", trust: 84, sanctions: true, lastTrade: "2026-02-05", logo: "#c2410c" },
  ];
  const onSellerSearch = (query: string) => {
    setSellerSearch(query); setGtidValid(null);
    if (searchDebounce) clearTimeout(searchDebounce);
    const timer = setTimeout(() => {
      if (!query.trim()) { setSellerResults([]); return; }
      const q = query.toLowerCase();
      setSellerResults(allContacts.filter(c => c.name.toLowerCase().includes(q) || c.gtid.toLowerCase().includes(q)));
      if (query.match(/^SGTX-[A-Z]{2}-[A-Z]{3}-\d{6}-[A-F0-9]{4}$/i)) setGtidValid(true);
      else if (query.startsWith("SGTX-") && query.length > 10) setGtidValid(false);
    }, 300);
    setSearchDebounce(timer);
  };
  const selectSeller = (s: any) => { setSelectedSeller(s); setSellerSearch(""); setSellerResults([]); setKeyboardIndex(-1); };
  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setKeyboardIndex(i => Math.min(i + 1, sellerResults.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setKeyboardIndex(i => Math.max(i - 1, -1)); }
    else if (e.key === "Enter" && keyboardIndex >= 0 && sellerResults[keyboardIndex]) { e.preventDefault(); selectSeller(sellerResults[keyboardIndex]); }
  };
  const trustColor = (s: number) => s >= 80 ? "#10b981" : s >= 50 ? "#fbbf24" : "#f87171";
  const loadTrustPortrait = async (gtid: string) => {
    setShowTrustPortrait(true); setTrustPortraitLoading(true);
    try { const res = await fetch("/api/sgtx/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: gtid, message: "Generate a 360 degree Trust Portrait summary of this tenant." }) }); const d = await res.json(); setTrustPortrait(d.content); } catch { setTrustPortrait("Unavailable."); } finally { setTrustPortraitLoading(false); }
  };
  const loadIncotermSummary = async () => { if (incotermLoading || incotermSummary) return; setIncotermLoading(true); try { const res = await fetch("/api/sgtx/ai/incoterm-summary", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ incoterm, buyerCountry: "DE", sellerCountry: "EG" }) }); const d = await res.json(); setIncotermSummary(d.content); } catch {} finally { setIncotermLoading(false); } };
  const onProductSelect = (name: string) => { setProductName(name); const p = (PRODUCTS_BY_TYPE[commodityType] || []).find(x => x.name === name); if (p) setHsCode(p.hs); loadProductForm(commodityType, name, p?.hs || hsCode); };
  const onHsCodeInput = (hs: string) => { setHsCode(hs); const p = Object.values(PRODUCTS_BY_TYPE).flat().find(x => x.hs === hs); if (p) setProductName(p.name); loadProductForm(commodityType, p?.name || productName, hs); };
  const loadProductForm = async (ct: string, pn: string, hs: string) => {
    if (productFormLoading) return;
    setProductFormLoading(true);
    try {
      const container = containers[activeContainer];
      const res = await fetch("/api/sgtx/ai/product-form", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commodityType: ct, productName: pn, hsCode: hs, origin: container?.originCountry, dest: container?.destCountry, port: container?.port, useRia: true }),
      });
      const d = await res.json();
      if (d.schema) {
        setProductForm(d.schema);
      } else {
        try { const m = d.content?.match(/\{[\s\S]*\}/); if (m) setProductForm(JSON.parse(m[0])); } catch {}
      }
    } catch {} finally { setProductFormLoading(false); }
  };
  const parseExpressMode = async () => {
    if (!expressText.trim() || expressParsing) return;
    setExpressParsing(true);
    try {
      const res = await fetch("/api/sgtx/ai/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant: "SGTX-DE-TRD-001234-5B6C", message: `Parse this trade request into JSON with fields: containers [{originCountry, destCountry, port, palletized, palletSize, commodities [{type, product, hs, packaging, pallets, netWeight, grossWeight}]}], incoterm, multiShipment [{deliveryDate, port, containers}], globalNotes. Text: ${expressText}` }),
      });
      const d = await res.json();
      try { const m = d.content.match(/\{[\s\S]*\}/); if (m) { const parsed = JSON.parse(m[0]); setExpressParsed(parsed); } } catch {}
    } catch {} finally { setExpressParsing(false); }
  };
  const checkAttribution = async (sellerGtid: string) => {
    try {
      const res = await fetch(`/api/sgtx/trade-request/attribution?buyerGtid=SGTX-DE-TRD-001234-5B6C&sellerGtid=${sellerGtid}`);
      const d = await res.json();
      if (d.found) setAttribution(d.attribution);
    } catch {}
  };
  const loadContainerAdvice = async () => { const tp = containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + com.pallets, 0), 0); if (adviceLoading || !tp) return; setAdviceLoading(true); try { const res = await fetch("/api/sgtx/ai/container-advisor", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ palletCount: tp, palletType: containers[0]?.palletSize || "EUR" }) }); const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setContainerAdvice(JSON.parse(m[0])); } catch {} } catch {} finally { setAdviceLoading(false); } };
  const loadAiNotes = async () => { if (aiNotesLoading) return; setAiNotesLoading(true); try { const res = await fetch("/api/sgtx/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: "SGTX-DE-TRD-001234-5B6C", message: `Suggest common trade notes for: commodity=${productName}, origin=EG, destination=DE, incoterm=${incoterm}. 3 bullet points only.` }) }); const d = await res.json(); setAiNotesSuggestion(d.content); } catch {} finally { setAiNotesLoading(false); } };
  const runPrescreen = async () => {
    if (prescreenLoading) return;
    setPrescreenLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/governor-prescreen", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity: productName, hsCode,
          buyerCountry: "DE", sellerCountry: "EG",
          value: 100000,
          incoterm,
          transportMode, equipmentType,
          insuranceRequirement, insuranceType,
          settlementStructure, paymentTiming, currency: settlementCurrency,
          tradeCriticality,
          earliestDeliveryDate, preferredDeliveryDate, latestDeliveryDate,
          documentationMandatoryCount: docRequirements.filter(d => d.mandatory).length,
          documentationMandatorySelected: docRequirements.filter(d => d.mandatory).length,
        }),
      });
      const d = await res.json();
      setPrescreen({ verdict: d.verdict, conditions: d.conditions || [], content: d.content });
      setPrescreenProvider(d.provider);
    } catch { setPrescreen({ verdict: "ALLOW", conditions: [], content: "Unavailable." }); }
    finally { setPrescreenLoading(false); }
  };
  // Part 4.5 — resolve documentation requirements from RIA rules
  const resolveDocs = async () => {
    if (docRequirementsLoading) return;
    setDocRequirementsLoading(true);
    try {
      const first = containers[0] || {};
      const res = await fetch("/api/sgtx/trade-request/documentation-requirements", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCode,
          originCountry: first.originCountry,
          destCountry: first.destCountry,
          incoterm,
          transportMode,
          coldChain: coldChain === "yes",
          lcSelected: settlementStructure === "DOCUMENTARY_CREDIT" || bankInstrument === "LC" || bankInstrument === "SBLC" || bankInstrument === "DLC",
          financingRequested: financingInterest && financingInterest !== "NONE",
          preferenceAgreement: false,
        }),
      });
      const d = await res.json();
      if (d.ok && Array.isArray(d.requirements)) {
        // Apply local overrides
        const merged = d.requirements.map((r: any) => {
          const ov = docOverride[r.docType];
          return ov ? { ...r, ...ov } : r;
        });
        setDocRequirements(merged);
        toast.success(`${merged.length} documents resolved (${merged.filter((x: any) => x.mandatory).length} mandatory)`);
      }
    } catch { toast.error("Failed to resolve documentation requirements"); }
    finally { setDocRequirementsLoading(false); }
  };
  // Part 4.8 — Incoterm-driven insurance auto-configuration
  useEffect(() => {
    if (incoterm === "CIF" || incoterm === "CIP") {
      setInsuranceRequirement("REQUIRED");
      setInsuranceResponsibleParty("SELLER");
    } else if (incoterm === "EXW" || incoterm === "FOB" || incoterm === "CFR" || incoterm === "CPT") {
      // do not force — leave buyer's choice
    }
  }, [incoterm]);
  // Part 4.9 — Incoterm-driven settlement defaults
  useEffect(() => {
    if (!incoterm) return;
    if ((incoterm === "CIF" || incoterm === "CIP") && !settlementStructure) {
      setSettlementStructure("DOCUMENTARY_CREDIT");
      setPaymentTiming("AGAINST_DOCUMENTS");
      setCreditPeriod("30_DAYS");
      setBankInstrument("LC");
    } else if ((incoterm === "FOB" || incoterm === "CFR" || incoterm === "CPT" || incoterm === "DAP" || incoterm === "DPU") && !settlementStructure) {
      setSettlementStructure("DOCUMENTARY_COLLECTION");
      setPaymentTiming("AGAINST_DOCUMENTS");
      setCreditPeriod("0_DAYS");
    }
  }, [incoterm]);
  // Part 4.7 — Equipment type resets when transport mode changes
  useEffect(() => { setEquipmentType(""); }, [transportMode]);
  // Part 4.11 — Fetch criticality routing rules on mount
  useEffect(() => {
    fetch("/api/sgtx/criticality/rules").then(r => r.json()).then(d => { if (d.ok && d.rules) setCriticalityRules(d.rules); }).catch(() => {});
  }, []);
  const suggestCriticality = async () => {
    if (criticalityLoading) return;
    setCriticalityLoading(true);
    try {
      const first = containers[0] || {};
      const windowDays = earliestDeliveryDate && latestDeliveryDate
        ? Math.max(1, Math.round((new Date(latestDeliveryDate).getTime() - new Date(earliestDeliveryDate).getTime()) / (1000 * 60 * 60 * 24)))
        : 30;
      const res = await fetch("/api/sgtx/criticality/rules", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          commodity: productName, hsCode,
          tradeValue: 100000,
          deliveryWindowDays: windowDays,
          originCountry: first.originCountry,
          destCountry: first.destCountry,
          incoterm,
          inspectionType: docRequirements.some(d => d.docType === "INSPECTION_CERT") ? "third-party" : "none",
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setCriticalitySuggested(d);
        toast.success(`AI suggested: ${d.suggested} (${d.confidence}% confidence)`);
      }
    } catch { toast.error("Failed to suggest criticality"); }
    finally { setCriticalityLoading(false); }
  };
  // Part 4.10 — Calculate readiness (live)
  const calcReadiness = async () => {
    setReadinessLoading(true);
    try {
      const first = containers[0] || {};
      const res = await fetch("/api/sgtx/trade-request/readiness", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sellerSelected: !!selectedSeller?.gtid,
          incoterm,
          commodity: productName, hsCode,
          containersConfigured: containers.filter(c => c.originCountry && c.destCountry && c.port && c.commodities.every((com: any) => com.product)).length,
          containersTotal: containers.length,
          documentationMandatoryCount: docRequirements.filter(d => d.mandatory).length,
          documentationMandatorySelected: docRequirements.filter(d => d.mandatory).length,
          documentationComplete: docRequirements.length > 0,
          transportMode, equipmentType,
          insuranceRequirement, insuranceType,
          settlementStructure, paymentTiming, creditPeriod,
          currency: settlementCurrency,
          financingInterest, settlementFlexibility, commercialPriority,
          tradeCriticality,
          earliestDeliveryDate, preferredDeliveryDate, latestDeliveryDate,
          specialInstructions,
          originCountry: first.originCountry,
          destCountry: first.destCountry,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setReadiness({ score: d.score, missing: d.missing, components: d.components, isReadyForSubmission: d.isReadyForSubmission });
      }
    } catch { /* silent */ }
    finally { setReadinessLoading(false); }
  };
  useEffect(() => { calcReadiness(); }, [selectedSeller, incoterm, productName, hsCode, containers, docRequirements, transportMode, equipmentType, insuranceRequirement, insuranceType, settlementStructure, paymentTiming, creditPeriod, settlementCurrency, financingInterest, settlementFlexibility, commercialPriority, tradeCriticality, earliestDeliveryDate, preferredDeliveryDate, latestDeliveryDate, specialInstructions]);
  // Part 4.6 — Save special instructions on change (debounced, advisory only)
  useEffect(() => {
    if (!specialInstructions) { setInstructionCategories([]); return; }
    const t = setTimeout(() => {
      // Heuristic categorization — same as backend
      const lines = specialInstructions.split(/\r?\n+/).map(l => l.trim()).filter(Boolean);
      const cats: Record<string, string[]> = {};
      for (const line of lines) {
        const lower = line.toLowerCase();
        let cat = "Other";
        if (/label|barcode|mark|stick|arabic|english/.test(lower)) cat = "Labeling & Marking";
        else if (/halal|kosher|organic|gots|iso|certif/.test(lower)) cat = "Certifications";
        else if (/pallet|wooden|ispm|temperature|humidity|logger|packaging|carton/.test(lower)) cat = "Packaging & Handling";
        else if (/vessel|transship|direct call|p&i|dhl|fedex|freight/.test(lower)) cat = "Shipping & Logistics";
        else if (/bill of lading|b\/l|invoice|packing list|legalis|chamber|translation/.test(lower)) cat = "Documentation";
        else if (/inspect|sgs|bureau|witness|photo/.test(lower)) cat = "Quality & Inspection";
        else if (/arbitration|difc|lcia|governing law|penalty|uae law|egypt/.test(lower)) cat = "Dispute & Compliance";
        (cats[cat] = cats[cat] || []).push(line);
      }
      setInstructionCategories(Object.entries(cats).map(([category, snippets]) => ({ category, snippets })));
    }, 400);
    return () => clearTimeout(t);
  }, [specialInstructions]);
  useEffect(() => {
    const i = setInterval(() => {
      setDraftSaved(new Date().toLocaleTimeString());
      fetch("/api/sgtx/trade-request/draft", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ draftId, buyerGtid: "SGTX-DE-TRD-001234-5B6C", sellerGtid: selectedSeller?.gtid, incoterm, parsedSpecs: { containers, commodityType, productName, hsCode }, multiShipmentSchedule: multiShipment ? shipments : null, globalNotes }),
      }).then(r => r.json()).then(d => { if (d.draftId && !draftId) setDraftId(d.draftId); }).catch(() => {});
    }, 30000);
    return () => clearInterval(i);
  }, [containers, shipments, incoterm, multiShipment, globalNotes, selectedSeller, draftId]);
  useEffect(() => { if (selectedSeller?.gtid) checkAttribution(selectedSeller.gtid); }, [selectedSeller]);
  const cloneContainer = () => { if (containers.length >= 50) return; const src = containers[activeContainer]; setContainers(c => [...c.slice(0, activeContainer + 1), { ...JSON.parse(JSON.stringify(src)), id: c.length + 1, notes: "", commodities: src.commodities.map((com: any) => ({ ...com, id: Date.now() + Math.random() })) }, ...c.slice(activeContainer + 1).map((c2, i) => ({ ...c2, id: c.length + 2 + i }))]); };
  const removeContainer = (idx: number) => { setShowRemoveConfirm(idx); };
  const confirmRemoveContainer = () => { if (showRemoveConfirm !== null) { setContainers(c => c.filter((_, i) => i !== showRemoveConfirm).map((c, i) => ({ ...c, id: i + 1 }))); if (activeContainer >= containers.length - 1) setActiveContainer(Math.max(0, containers.length - 2)); setShowRemoveConfirm(null); } };
  const cloneShipment = (id: number) => { const src = shipments.find(s => s.id === id); if (src) setShipments(s => [...s, { ...src, id: s.length + 1 }]); };
  const bulkShiftDates = (days: number) => setShipments(ss => ss.map(s => { const d = new Date(s.deliveryDate || new Date().toISOString().slice(0, 10)); d.setDate(d.getDate() + days); return { ...s, deliveryDate: d.toISOString().slice(0, 10) }; }));
  const getTotalWeightKg = () => containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + (com.pallets * (com.netWeight || 0) * 40), 0), 0);
  const completionPercent = Math.round((containers.filter(c => c.originCountry && c.destCountry && c.port && c.commodities.every((com: any) => com.product)).length / containers.length) * 100);
  const addCommodity = (ci: number) => setContainers(cs => cs.map((c, i) => i === ci ? { ...c, commodities: [...c.commodities, { id: Date.now(), type: "Other", product: "", hs: "", packaging: "Cartons", pallets: 1, netWeight: 0, grossWeight: 0, notes: "" }] } : c));
  const updateContainer = (idx: number, f: string, v: any) => setContainers(cs => cs.map((c, i) => i === idx ? { ...c, [f]: v } : c));
  const updateCommodity = (ci: number, cmi: number, f: string, v: any) => setContainers(cs => cs.map((c, i) => i === ci ? { ...c, commodities: c.commodities.map((com, j) => j === cmi ? { ...com, [f]: v } : com) } : c));
  const addShipment = () => setShipments(s => [...s, { id: s.length + 1, deliveryDate: "", port: "Hamburg (DEHAM)", containers: 1 }]);
  const removeShipment = (id: number) => setShipments(s => s.filter(x => x.id !== id));
  const configuredContainers = containers.filter(c => c.originCountry && c.destCountry && c.port && c.commodities.every((com: any) => com.product)).length;
  const portsByCountry: Record<string, string[]> = { EG: ["Alexandria (EGALX)", "Damietta (EGDAM)", "Cairo (EGCAI)"], DE: ["Hamburg (DEHAM)", "Bremerhaven (DEBRV)"], VN: ["Can Tho (VNCAN)", "Ho Chi Minh (VNSGN)"], US: ["New York (USNYC)", "Los Angeles (USLAX)"], CN: ["Shanghai (CNSHA)", "Shenzhen (CNSZX)"] };

  // ── Step 4 helper: update per-container size (40ft/20ft) ────────────
  const updateContainerSize = (idx: number, size: string) => setContainers(cs => cs.map((c, i) => i === idx ? { ...c, containerSize: size } : c));

  // ── Live order calculation ─────────────────────────────────────────
  const totalPallets = containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + (Number(com.pallets) || 0), 0), 0);
  const totalGrossKg = containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + (Number(com.grossWeight) || 0) * (Number(com.pallets) || 0), 0), 0);
  const totalNetKg = containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + (Number(com.netWeight) || 0) * (Number(com.pallets) || 0), 0), 0);
  const container40ftCount = containers.filter(c => c.containerSize === "40ft").length;
  const container20ftCount = containers.filter(c => c.containerSize === "20ft").length;

  // ── Step validation gates ──────────────────────────────────────────
  const stepValid: Record<number, boolean> = {
    1: !!selectedSeller?.gtid && !!incoterm,
    2: expressMode ? !!expressText.trim() : (!!productName && !!hsCode),
    3: configuredContainers === containers.length && containers.length > 0,
    4: docRequirements.length > 0, // documentation requirements resolved
    5: !!transportMode && !!equipmentType, // transport mode + equipment selected
    6: !!insuranceRequirement, // insurance requirement selected
    7: !!settlementStructure && !!paymentTiming && !!settlementCurrency, // commercial settlement minimums
    8: !!tradeCriticality, // criticality selected (defaults to ROUTINE)
    9: true, // shipments & notes are optional
    10: true, // prescreen is optional, submit always allowed
  };

  // ── Submit handler — POST to /api/sgtx/trade-request ───────────────
  const handleSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);
    setSubmitResult(null);
    try {
      const first = containers[0] || {};
      const res = await fetch("/api/sgtx/trade-request", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          buyerGtid: "SGTX-DE-TRD-001234-5B6C",
          sellerGtid: selectedSeller?.gtid,
          commodity: productName,
          commodityHs: hsCode,
          incoterm,
          originPort: first.port,
          destPort: first.port,
          originCountry: first.originCountry,
          destCountry: first.destCountry,
          grossWeightKg: totalGrossKg,
          netWeightKg: totalNetKg,
          coldChain: coldChain === "yes",
          multiShipment,
          containers: containers.map((c, i) => ({ ...c, sequence: i + 1, containerSize: orderBy === "container" ? c.containerSize : null })),
          shipments: multiShipment ? shipments : [],
          orderBy,
          orderValue: orderBy === "container" ? null : orderValue,
          paymentTerms,
          paymentTermsDetails,
          packaging,
          globalNotes,
          // Part 4.5 — Documentation requirements
          documentRequirements: docRequirements,
          // Part 4.6 — Special trade instructions
          specialInstructions,
          // Part 4.7 — Transport & Logistics
          transportMode,
          equipmentType,
          equipmentCount,
          alternativePorts: altPorts ? altPorts.split(",").map((p: string) => p.trim()).filter(Boolean) : null,
          earliestDeliveryDate: earliestDeliveryDate || null,
          preferredDeliveryDate: preferredDeliveryDate || null,
          latestDeliveryDate: latestDeliveryDate || null,
          transitTimeDays,
          // Part 4.8 — Insurance
          insuranceRequirement,
          insuranceType: insuranceRequirement === "REQUIRED" ? insuranceType : null,
          insuranceResponsibleParty,
          insuranceCoveragePct,
          insuranceCurrency,
          // Part 4.9 — Commercial settlement
          settlementStructure,
          paymentTiming,
          creditPeriod,
          creditPeriodCustomDays: creditPeriod === "CUSTOM" ? creditPeriodCustomDays : null,
          commercialPriority,
          financingInterest,
          bankInstrument,
          settlementFlexibility,
          balanceTiming,
          settlementDocuments,
          originalDocsRequired,
          documentLanguage,
          currency: settlementCurrency,
          // Part 4.10 — Readiness (advisory)
          readinessScore: readiness?.score,
          readinessMissing: readiness?.missing,
          // Part 4.11 — Trade criticality
          tradeCriticality,
          criticalitySuggested: criticalitySuggested?.suggested,
          criticalityConfidence: criticalitySuggested?.confidence,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSubmitResult({ ok: true, ustn: d.ustn, message: d.message });
        toast.success(`Trade request submitted! USTN: ${d.ustn}`);
      } else {
        setSubmitResult({ ok: false, error: d.error || "Submission failed" });
        toast.error(d.error || "Submission failed");
      }
    } catch (e: any) {
      setSubmitResult({ ok: false, error: e.message });
      toast.error("Network error during submission");
    } finally { setSubmitting(false); }
  };

  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="New Trade Request" subtitle="Phase 1 — Parties → Commodity & Spec → Containers → Commercial Terms → Shipments & Notes → Compliance & Submit" />
      {draftSaved && <div className="text-[0.6rem] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /> Draft auto-saved at {draftSaved} · Expires in {draftExpiry.daysLeft} days (reminders at day {draftExpiry.reminders.join(", ")})</div>}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1 scroll-gold">
          {STEPS.map((s, i) => (
            <div key={s.id} className="flex items-center gap-2 flex-1 min-w-[130px]">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 flex-shrink-0 ${step > s.id ? "bg-emerald-500/20 border-emerald-500 text-emerald-400" : step === s.id ? "bg-gold/20 border-gold text-gold" : "border-border text-muted-foreground"}`}>{step > s.id ? "✓" : s.id}</div>
              <div className="min-w-0">
                <p className={`text-xs leading-tight ${step === s.id ? "text-foreground font-medium" : "text-muted-foreground"}`}>{s.label}</p>
                <p className="text-[0.55rem] text-muted-foreground leading-tight hidden sm:block">{s.desc}</p>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border min-w-[8px]" />}
            </div>
          ))}
        </div>
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Step 1 — Parties & Incoterm</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Identify the seller via GTID or saved contacts, then select the Incoterm 2020 that defines each party's logistics responsibilities.</p>
            </div>
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2"><Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" /><p className="text-xs text-foreground/80">Step 1.1: Method A — Direct GTID entry with autocomplete (debounced 300ms, keyboard nav, real-time validation). Method B — Search Saved Contacts with fuzzy search. Trust indicators, sanctions icons, avatars, ARIA-compliant.</p></div>
            <div className="relative">
              <Label className="text-xs">Seller GTID or Company Name (autocomplete, debounced 300ms)</Label>
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Input value={sellerSearch} onChange={(e) => onSellerSearch(e.target.value)} onKeyDown={onSearchKeyDown} placeholder="Type GTID (SGTX-EG-TRD-...) or company name…" className="font-mono text-sm" aria-label="Seller search" aria-expanded={sellerResults.length > 0} aria-controls="seller-results" />
                  {gtidValid === true && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-400 text-xs">✓ Valid</span>}
                  {gtidValid === false && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-red-400 text-xs">✗ Invalid</span>}
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowContactModal(true)} aria-label="Browse saved contacts"><Users className="w-3.5 h-3.5 mr-1" /> Contacts</Button>
              </div>
              {sellerResults.length > 0 && (
                <div id="seller-results" className="absolute z-50 mt-1 w-full bg-card border border-border rounded-lg shadow-xl max-h-60 overflow-y-auto scroll-gold" role="listbox">
                  {sellerResults.map((r, i) => (
                    <button key={r.gtid} onClick={() => selectSeller(r)} onMouseEnter={() => setKeyboardIndex(i)} className={`w-full flex items-center gap-2 p-2 text-left hover:bg-muted/30 ${keyboardIndex === i ? "bg-gold/10" : ""}`} role="option" aria-selected={keyboardIndex === i}>
                      {r.logo && <div className="w-7 h-7 rounded-md flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ background: r.logo }}>{r.name.charAt(0)}</div>}
                      <div className="flex-1 min-w-0"><p className="text-xs font-medium">{r.name}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{r.gtid}</p></div>
                      <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold" style={{ color: trustColor(r.trust), background: `${trustColor(r.trust)}1a` }}>{r.trust}</span>
                      {r.sanctions && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                      {r.lastTrade && <span className="text-[0.5rem] text-muted-foreground">Last: {r.lastTrade}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedSeller && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gold-gradient flex items-center justify-center text-sovereign font-bold">{selectedSeller.name.charAt(0)}</div>
                <div className="flex-1"><p className="text-sm font-medium">{selectedSeller.name}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{selectedSeller.gtid}</p></div>
                <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ color: trustColor(selectedSeller.trust), background: `${trustColor(selectedSeller.trust)}1a` }}>{selectedSeller.trust}</span>
                {selectedSeller.sanctions && <Badge variant="outline" className="text-[0.55rem] text-emerald-400"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Sanctions cleared</Badge>}
                <Badge variant="outline" className="text-[0.55rem] text-gold">Saved Contact</Badge>
                <button onClick={() => loadTrustPortrait(selectedSeller.gtid)} className="text-[0.65rem] text-gold hover:underline">View 360° Trust Portrait</button>
              </div>
            )}
            {showTrustPortrait && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTrustPortrait(false)}>
                <Card className="p-5 max-w-lg w-full" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4 text-gold" /> 360° Trust Portrait (AI · advisory only)</h3>
                  {trustPortraitLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground py-4"><Loader2 className="w-3 h-3 animate-spin" /> Generating portrait…</div> : <p className="text-xs text-foreground/80 leading-relaxed">{trustPortrait}</p>}
                  <Button size="sm" variant="outline" className="mt-3 h-7" onClick={() => setShowTrustPortrait(false)}>Close</Button>
                </Card>
              </div>
            )}
            {showContactModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowContactModal(false)}>
                <Card className="p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm mb-3">Saved Contacts (Network Feature)</h3>
                  <Input placeholder="Fuzzy search by name or GTID…" className="mb-3 text-xs" onChange={(e) => onSellerSearch(e.target.value)} />
                  <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
                    {allContacts.map(c => (
                      <button key={c.gtid} onClick={() => { selectSeller(c); setShowContactModal(false); }} className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-muted/30 text-left">
                        {c.logo && <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold" style={{ background: c.logo }}>{c.name.charAt(0)}</div>}
                        <div className="flex-1 min-w-0"><p className="text-xs font-medium">{c.name}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{c.gtid}</p></div>
                        <span className="px-1.5 py-0.5 rounded-full text-[0.55rem] font-bold" style={{ color: trustColor(c.trust), background: `${trustColor(c.trust)}1a` }}>{c.trust}</span>
                        {c.sanctions && <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />}
                        <span className="text-[0.5rem] text-muted-foreground">Last: {c.lastTrade}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[0.55rem] text-muted-foreground mt-2 text-center">🔐 No discovery — only contacts you've already added</p>
                </Card>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div><Label className="text-xs">Incoterm (Incoterms 2020) — auto-configures seller services</Label><Select value={incoterm} onValueChange={(v) => { setIncoterm(v); setIncotermSummary(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(INCOTERM_REFERENCE).map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Incoterm Reference: {incoterm}</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Seller logistics to:</span><p className="font-medium">{incotermConfig.sellerLogisticsTo}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Ocean/air freight:</span><p className={incotermConfig.sellerFreight ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerFreight ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Destination charges:</span><p className={incotermConfig.sellerDestCharges ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerDestCharges ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Duties:</span><p className={incotermConfig.sellerDuties ? "text-emerald-400" : "text-muted-foreground"}>{incotermConfig.sellerDuties ? "✓ Seller" : "✗ Buyer"}</p></div>
              </div>
              <div className="mt-2 flex items-center gap-2 flex-wrap"><span className="text-[0.6rem] text-muted-foreground">Seller's mandatory logistics services (Phase 2):</span>{incotermConfig.mandatoryServices.map((s: string) => <Badge key={s} variant="outline" className="text-[0.55rem] text-gold border-gold/30">{s}</Badge>)}</div>
              <div className="mt-2 flex items-center gap-2">{!incotermSummary && !incotermLoading && <button onClick={loadIncotermSummary} className="text-[0.65rem] text-gold hover:underline">🧠 Generate AI responsibility summary</button>}{incotermLoading && <span className="text-[0.65rem] text-muted-foreground flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Generating…</span>}{incotermSummary && <p className="text-xs text-foreground/80 flex items-center gap-1"><Sparkles className="w-3 h-3 text-gold" /> {incotermSummary}</p>}</div>
            </div>
            <div className="flex justify-end"><Button onClick={() => setStep(2)} disabled={!stepValid[1]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Package className="w-4 h-4 text-gold" /> Step 2 — Commodity & Product Spec</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Define the commodity (or use Express Mode AI parsing), review the AI Product Form, then set the default packaging and cold-chain requirement.</p>
            </div>
            <div className="flex items-center gap-3 p-2 rounded-lg bg-muted/20"><Label className="text-xs flex items-center gap-2"><input type="checkbox" checked={expressMode} onChange={e => setExpressMode(e.target.checked)} className="rounded" /> Express Mode (free-text AI parsing)</Label>{!expressMode && <span className="text-[0.6rem] text-muted-foreground">Structured form (default) — precise trade execution</span>}</div>
            {expressMode ? (
              <Card className="p-4">
                <Label className="text-xs">Describe your trade in natural language…</Label>
                <Textarea value={expressText} onChange={e => setExpressText(e.target.value)} placeholder="e.g., 20,000 kg frozen strawberries IQF, 2 containers, Alexandria to Hamburg, CIF, EUR pallets, -18°C cold chain…" className="min-h-[100px]" />
                <div className="flex items-center gap-2 mt-2">
                  <Button size="sm" variant="outline" className="h-7" onClick={parseExpressMode} disabled={expressParsing || !expressText.trim()}>
                    {expressParsing ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Parsing…</> : <><Sparkles className="w-3 h-3 mr-1" /> Parse with AI (A2)</>}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setExpressMode(false)}>Switch to Structured Form</Button>
                </div>
                {expressParsed && (
                  <div className="mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
                    <p className="text-[0.6rem] text-emerald-400 font-semibold mb-1">✓ AI Parsed Preview (verify and edit below):</p>
                    <pre className="text-[0.6rem] whitespace-pre-wrap max-h-40 overflow-y-auto">{JSON.stringify(expressParsed, null, 2)}</pre>
                    <Button size="sm" className="bg-gold-gradient text-sovereign h-7 mt-2" onClick={() => {
                      if (expressParsed.containers) { setContainers(expressParsed.containers.map((c: any, i: number) => ({ ...c, id: i + 1 }))); }
                      if (expressParsed.incoterm) setIncoterm(expressParsed.incoterm);
                      if (expressParsed.multiShipment) { setMultiShipment(true); setShipments(expressParsed.multiShipment); }
                      if (expressParsed.globalNotes) setGlobalNotes(expressParsed.globalNotes);
                      setExpressMode(false);
                    }}>Apply to Structured Form</Button>
                  </div>
                )}
                <p className="text-[0.55rem] text-muted-foreground mt-2">Governance G1U2/G1U3: Express Mode is advisory. The Governor does not accept a trade request based solely on AI parsing — buyer must review and confirm.</p>
              </Card>
            ) : (
              <>
                {recentProducts.length > 0 && (
                  <div className="flex items-center gap-2 flex-wrap"><span className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Recent (your history):</span>{recentProducts.map((p, i) => <button key={i} onClick={() => { setProductName(p.name); setHsCode(p.hs); loadProductForm("Frozen Fruits", p.name, p.hs); }} className="px-2 py-0.5 rounded-full text-[0.6rem] bg-muted/50 text-muted-foreground hover:bg-gold/15 hover:text-gold border border-border" aria-label={`Recent product ${p.name}`}>{p.name} <span className="text-[0.5rem] opacity-60">({p.date})</span></button>)}</div>
                )}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div><Label className="text-xs">Commodity Type (filters products)</Label><Select value={commodityType} onValueChange={(v) => { setCommodityType(v); setProductName(""); setHsCode(""); setProductForm(null); }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{COMMODITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">Product (dropdown — syncs HS code)</Label><Select value={productName} onValueChange={onProductSelect}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{(PRODUCTS_BY_TYPE[commodityType] || []).map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-xs">HS Code (type — syncs product name)</Label><Input value={hsCode} onChange={(e) => onHsCodeInput(e.target.value)} className="font-mono text-sm" placeholder="0811.10" /></div>
                </div>
                {/* AI HS Code Detection (Part 4.3) */}
                <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI HS Code Auto-Detection (Free · HuggingFace + z-ai)</p>
                    {hsDetection && <Badge variant="outline" className={`text-[0.55rem] ${hsDetection.confidence >= 0.85 ? "text-emerald-400 border-emerald-500/30" : hsDetection.confidence >= 0.6 ? "text-amber-400 border-amber-500/30" : "text-red-400 border-red-500/30"}`}>{Math.round(hsDetection.confidence * 100)}% confidence · {hsDetection.source}</Badge>}
                  </div>
                  <div className="flex gap-2">
                    <Input value={productSearch} onChange={(e) => onProductSearchChange(e.target.value)} placeholder="Type any product description… e.g. 'frozen IQF strawberries', 'fresh valencia oranges', 'organic quinoa'" className="text-sm flex-1" />
                    {hsDetectionLoading && <Loader2 className="w-4 h-4 animate-spin text-gold self-center" />}
                  </div>
                  {hsDetection && hsDetection.hsCode !== "Unknown" && (
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <Badge variant="outline" className="text-[0.6rem] font-mono text-gold border-gold/30">{hsDetection.hsCode}</Badge>
                      <span className="text-[0.65rem] text-foreground/80">{hsDetection.description}</span>
                      <span className="text-[0.55rem] text-muted-foreground">· {hsDetection.category}</span>
                      <button onClick={() => { setHsCode(hsDetection.hsCode); setProductName(hsDetection.description); loadProductForm(hsDetection.category, hsDetection.description, hsDetection.hsCode); toast.success(`HS Code detected: ${hsDetection.hsCode} (${Math.round(hsDetection.confidence * 100)}% confidence)`); }} className="ml-auto text-[0.6rem] text-gold hover:underline font-medium">Apply →</button>
                    </div>
                  )}
                  <p className="text-[0.55rem] text-muted-foreground mt-1.5">Type a product name and the AI will automatically detect the WTO HS code using a 150+ product database + AI classification. No manual lookup needed.</p>
                </div>
                <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
                  <div className="flex items-center justify-between mb-2"><p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Product Form Agent (A2 · advisory)</p><div className="flex items-center gap-2">{productForm && <><button className="text-[0.55rem] text-gold hover:underline" onClick={() => loadProductForm(commodityType, productName, hsCode)}>Reset to AI</button><button className="text-[0.55rem] text-blue-400 hover:underline">Save as template</button></>}</div></div>
                  {productFormLoading ? (<div className="space-y-2"><div className="h-4 bg-muted/40 rounded animate-pulse" /><div className="h-4 bg-muted/40 rounded w-3/4 animate-pulse" /><div className="h-4 bg-muted/40 rounded w-1/2 animate-pulse" /><p className="text-[0.6rem] text-muted-foreground">Generating dynamic specifications…</p></div>
                  ) : productForm ? (<div className="space-y-2">{productForm.dynamic_fields && (<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{productForm.dynamic_fields.map((f: any, i: number) => (<div key={i}><Label className="text-[0.6rem]">{f.name}{f.mandatory ? " *" : ""}</Label>{f.type === "dropdown" ? <Select defaultValue={f.default}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(f.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select> : <Input type={f.type === "number" ? "number" : "text"} defaultValue={f.default} className="h-8 text-xs" />}</div>))}</div>)}{productForm.required_documents && <div className="flex items-center gap-2 flex-wrap">{productForm.required_documents.map((d: any, i: number) => <Badge key={i} variant="outline" className="text-[0.55rem] text-amber-400 border-amber-500/30">{d.type}{d.mandatory ? " *" : ""}</Badge>)}</div>}{productForm.special_conditions && productForm.special_conditions.map((c: string, i: number) => <p key={i} className="text-[0.65rem] text-amber-400">⚠ {c}</p>)}</div>
                  ) : (<p className="text-[0.65rem] text-muted-foreground">Select a product or enter HS code to trigger the AI Product Form Agent.</p>)}
                </div>
                <div className="pt-3 border-t border-border">
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Packaging & Cold Chain</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label className="text-xs">Default Packaging Type (applies to all containers)</Label><Select value={packaging} onValueChange={v => { setPackaging(v); setContainers(cs => cs.map(c => ({ ...c, commodities: c.commodities.map((com: any) => ({ ...com, packaging: v })) }))); }}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent>{["Cartons (12.5 kg)","Cartons (10 kg)","Boxes (5 kg)","Mesh bags","Plastic crates","Pallet wrap","Drums","Barrels","Bales","Bins","Carton bags","Jumbo bags","Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                    <div><Label className="text-xs">Cold Chain</Label><Select value={coldChain} onValueChange={v => setColdChain(v)}><SelectTrigger className="h-9"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Required (-18°C)</SelectItem><SelectItem value="no">Not required</SelectItem></SelectContent></Select></div>
                  </div>
                  <p className="text-[0.55rem] text-muted-foreground mt-2">Container count, per-container cargo, and commercial terms (order by / payment) are configured in Steps 3 & 4.</p>
                </div>
              </>
            )}
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(1)}>← Back</Button><Button onClick={() => setStep(3)} disabled={!stepValid[2]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Container className="w-4 h-4 text-gold" /> Step 3 — Containers & Commodities</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Set the container count, configure each container's route and pallets, then detail the commodities inside each. Use Bulk Edit for 10+ containers.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 rounded-lg bg-muted/20 border border-border">
              <div><Label className="text-xs">Number of Containers (1–50)</Label><Input type="number" min={1} max={50} value={containers.length} onChange={e => { const n = Math.min(50, Math.max(1, Number(e.target.value) || 1)); if (n > containers.length) { const src = containers[containers.length - 1]; const toAdd = n - containers.length; const newOnes = Array.from({ length: toAdd }, (_, i) => ({ ...JSON.parse(JSON.stringify(src)), id: containers.length + i + 1, notes: "", commodities: src.commodities.map((com: any) => ({ ...com, id: Date.now() + Math.random() + i })) })); setContainers(c => [...c, ...newOnes]); } else if (n < containers.length) { setContainers(c => c.slice(0, n).map((c2, i) => ({ ...c2, id: i + 1 }))); if (activeContainer >= n) setActiveContainer(n - 1); } }} className="h-9" /></div>
              <div className="flex items-end gap-2 pb-1">
                <div className="flex-1 text-[0.6rem] text-muted-foreground leading-tight"><span className="font-semibold text-foreground">{configuredContainers}/{containers.length}</span> fully configured · {containers.reduce((s, c) => s + c.commodities.reduce((cs: number, com: any) => cs + com.pallets, 0), 0)} pallets total · Est. {getTotalWeightKg().toLocaleString()} kg</div>
              </div>
            </div>
            <div className="flex items-center justify-between"><h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Container Configuration</h4><div className="flex gap-2">{containers.length >= 3 && <Button size="sm" variant="outline" onClick={() => setShowBulkEdit(true)} className="h-7 text-xs">Bulk Edit</Button>}<Button size="sm" variant="outline" onClick={cloneContainer} className="h-7 text-xs">Clone Container</Button><Button size="sm" variant="outline" onClick={() => setContainers(c => [...c, { id: c.length + 1, originCountry: "EG", destCountry: "DE", port: "Hamburg (DEHAM)", palletized: true, palletSize: "EUR", destOverride: "", notes: "", commodities: [{ id: Date.now(), type: "Other", product: "", hs: "", packaging: "Cartons", pallets: 1, netWeight: 0, grossWeight: 0, notes: "" }] }])} className="h-7 text-xs">+ Add Container</Button></div></div>
            <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-emerald-500 transition-all" style={{ width: `${(configuredContainers / containers.length) * 100}%` }} /></div>
            <div className="flex gap-1 flex-wrap">{containers.map((c, i) => <button key={c.id} onClick={() => setActiveContainer(i)} className={`px-3 py-1 rounded-lg text-xs font-medium ${activeContainer === i ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground"}`}>Container {i + 1} {c.commodities.every((com: any) => com.product) ? "✓" : "…"}</button>)}</div>
            {containers[activeContainer] && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold">Container {activeContainer + 1}</span>{containers.length > 1 && <button onClick={() => removeContainer(activeContainer)} className="text-[0.6rem] text-red-400 hover:underline">Remove Container</button>}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><Label className="text-[0.6rem]">Country of Origin</Label><Select value={containers[activeContainer].originCountry} onValueChange={v => updateContainer(activeContainer, "originCountry", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["EG","VN","DE","US","CN"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Destination Country</Label><Select value={containers[activeContainer].destCountry} onValueChange={v => updateContainer(activeContainer, "destCountry", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["DE","EG","US","CN","VN"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Port of Discharge (dependent)</Label><Select value={containers[activeContainer].port} onValueChange={v => updateContainer(activeContainer, "port", v)} disabled={!containers[activeContainer].destCountry}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(portsByCountry[containers[activeContainer].destCountry] || []).map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Palletized?</Label><Select value={containers[activeContainer].palletized ? "yes" : "no"} onValueChange={v => updateContainer(activeContainer, "palletized", v === "yes")}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="yes">Yes</SelectItem><SelectItem value="no">No</SelectItem></SelectContent></Select></div>
                  {containers[activeContainer].palletized ? <div><Label className="text-[0.6rem]">Pallet Size</Label><Select value={containers[activeContainer].palletSize} onValueChange={v => updateContainer(activeContainer, "palletSize", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="EUR">EUR (800x1200mm)</SelectItem><SelectItem value="ISO">ISO (1000x1200mm)</SelectItem><SelectItem value="Custom">Custom</SelectItem></SelectContent></Select></div> : null}
                  {!showDestOverride[activeContainer] ? <button onClick={() => setShowDestOverride(s => ({ ...s, [activeContainer]: true }))} className="text-[0.6rem] text-gold hover:underline self-end pb-1">+ Override destination</button> : <div><Label className="text-[0.6rem]">Destination Override</Label><Input value={containers[activeContainer].destOverride} onChange={e => updateContainer(activeContainer, "destOverride", e.target.value)} className="h-8 text-xs" placeholder="e.g., Alexandria Free Zone" /></div>}
                  <div><Label className="text-[0.6rem]">Notes (per container)</Label><Input value={containers[activeContainer].notes} onChange={e => updateContainer(activeContainer, "notes", e.target.value)} className="h-8 text-xs" placeholder="e.g., Expedite customs" /></div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between"><p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Commodities ({containers[activeContainer].commodities.length})</p><button onClick={() => addCommodity(activeContainer)} className="text-[0.6rem] text-gold hover:underline">+ Add another commodity</button></div>
                  {containers[activeContainer].commodities.map((com: any, comIdx: number) => (
                    <div key={com.id} className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-2 rounded bg-background/40">
                      <div><Label className="text-[0.55rem]">Product</Label><Input value={com.product} onChange={e => updateCommodity(activeContainer, comIdx, "product", e.target.value)} className="h-7 text-xs" placeholder="Product name" /></div>
                      <div><Label className="text-[0.55rem]">HS Code</Label><Input value={com.hs} onChange={e => updateCommodity(activeContainer, comIdx, "hs", e.target.value)} className="h-7 text-xs font-mono" placeholder="0811.10" /></div>
                      <div><Label className="text-[0.55rem]">Packaging</Label><Select value={com.packaging} onValueChange={v => updateCommodity(activeContainer, comIdx, "packaging", v)}><SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["Boxes","Mesh bags","Plastic crates","Pallet wrap","Drums","Barrels","Bales","Bins","Carton bags","Jumbo bags","Other"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
                      <div><Label className="text-[0.55rem]">Pallets</Label><Input type="number" value={com.pallets} onChange={e => updateCommodity(activeContainer, comIdx, "pallets", Number(e.target.value))} className="h-7 text-xs" /></div>
                      <div><Label className="text-[0.55rem]">Net Wt/Unit (kg)</Label><Input type="number" value={com.netWeight} onChange={e => { updateCommodity(activeContainer, comIdx, "netWeight", Number(e.target.value)); updateCommodity(activeContainer, comIdx, "grossWeight", Number(e.target.value) * 1.05); }} className="h-7 text-xs" /></div>
                      <div><Label className="text-[0.55rem]">Gross Wt/Unit (auto+5%)</Label><Input type="number" value={com.grossWeight} onChange={e => updateCommodity(activeContainer, comIdx, "grossWeight", Number(e.target.value))} className="h-7 text-xs" /></div>
                      {containers[activeContainer].commodities.length > 1 && <button onClick={() => setContainers(cs => cs.map((c, i) => i === activeContainer ? { ...c, commodities: c.commodities.filter((_, j) => j !== comIdx) } : c))} className="text-[0.6rem] text-red-400 self-end pb-1">✕ Remove</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {showBulkEdit && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowBulkEdit(false)}>
                <Card className="p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm mb-3">Bulk Edit (10+ containers)</h3>
                  <div className="space-y-2 text-xs">
                    <button className="w-full text-left p-2 rounded-lg bg-muted/20 hover:bg-muted/30" onClick={() => { const src = containers[activeContainer]; setContainers(cs => cs.map((c, i) => i !== activeContainer ? { ...c, commodities: JSON.parse(JSON.stringify(src.commodities)) } : c)); toast.success("Commodities copied to all containers"); }}>Apply commodity to all containers</button>
                    <button className="w-full text-left p-2 rounded-lg bg-muted/20 hover:bg-muted/30" onClick={() => { const src = containers[activeContainer]; setContainers(cs => cs.map((c, i) => i !== activeContainer ? { ...c, originCountry: src.originCountry, destCountry: src.destCountry, port: src.port, palletized: src.palletized, palletSize: src.palletSize } : c)); toast.success("Settings copied to all containers"); }}>Copy container settings to selected containers</button>
                    <button className="w-full text-left p-2 rounded-lg bg-muted/20 hover:bg-muted/30" onClick={() => { setContainers(cs => cs.map((c, i) => ({ ...c, destOverride: `Warehouse ${String.fromCharCode(65 + i)}${i + 1}` }))); toast.success("Destination overrides generated"); }}>Increment destination override (pattern: Warehouse A1, A2, …)</button>
                  </div>
                  <p className="text-[0.55rem] text-muted-foreground mt-2">Changes applied immediately · Undo by reverting manually</p>
                  <Button size="sm" variant="outline" className="mt-2 h-7" onClick={() => setShowBulkEdit(false)}>Close</Button>
                </Card>
              </div>
            )}
            {showRemoveConfirm !== null && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowRemoveConfirm(null)}>
                <Card className="p-4 max-w-sm w-full" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm mb-2">Remove Container?</h3>
                  <p className="text-xs text-muted-foreground mb-3">Are you sure you want to remove Container {showRemoveConfirm + 1}? This action cannot be undone.</p>
                  <div className="flex gap-2">
                    <Button size="sm" variant="destructive" className="h-7" onClick={confirmRemoveContainer}>Remove</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setShowRemoveConfirm(null)}>Cancel</Button>
                  </div>
                </Card>
              </div>
            )}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20"><div className="flex items-center justify-between mb-1"><p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">🧠 AI Container Advisor (A1 · advisory)</p>{!containerAdvice && !adviceLoading && <button onClick={loadContainerAdvice} className="text-[0.65rem] text-gold hover:underline">Get advice</button>}</div>{adviceLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing pallet configuration…</div> : containerAdvice ? <div className="flex items-center gap-2"><p className="text-xs text-foreground/90 flex-1">{containerAdvice.suggestion} — {containerAdvice.reason}</p>{containerAdvice.adjust_needed && <Button size="sm" className="h-6 text-[0.6rem] bg-gold-gradient text-sovereign">Adjust</Button>}<button className="text-[0.6rem] text-muted-foreground hover:underline">Ignore</button></div> : <p className="text-[0.65rem] text-muted-foreground">Click "Get advice" for a container configuration suggestion.</p>}</div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(2)}>← Back</Button><Button onClick={() => setStep(4)} disabled={!stepValid[3]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><FileCheck className="w-4 h-4 text-gold" /> Step 4 — Documentation Requirements</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">RIA pre-selects mandatory documents based on commodity, origin, destination, incoterm, and transport mode. One source of truth — no duplication across phases.</p>
            </div>
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs text-foreground/80 mb-2">RIA-driven pre-selection evaluates HS code chapters, incoterm obligations, transport mode, and cold-chain requirement to auto-resolve the required document set.</p>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={resolveDocs} disabled={docRequirementsLoading}>
                  {docRequirementsLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Resolving…</> : <><FileCheck className="w-3 h-3 mr-1" /> {docRequirements.length > 0 ? "Re-resolve documents" : "Resolve from RIA"}</>}
                </Button>
              </div>
            </div>
            {docRequirements.length > 0 ? (
              <div className="space-y-2 max-h-[420px] overflow-y-auto scroll-gold pr-1">
                {(["SHIPMENT", "SETTLEMENT", "CUSTOMS", "FINANCING"] as const).map(trigger => {
                  const docs = docRequirements.filter(d => d.trigger === trigger);
                  if (docs.length === 0) return null;
                  return (
                    <div key={trigger} className="p-3 rounded-lg bg-muted/20 border border-border">
                      <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">{trigger} trigger</p>
                      <div className="space-y-1.5">
                        {docs.map(d => (
                          <div key={d.docType} className="flex items-start gap-2 p-2 rounded bg-background/40">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-xs font-medium">{d.docName}</p>
                                {d.mandatory ? <Badge variant="outline" className="text-[0.5rem] text-red-400 border-red-500/30">MANDATORY</Badge> : <Badge variant="outline" className="text-[0.5rem] text-muted-foreground">OPTIONAL</Badge>}
                              </div>
                              <p className="text-[0.55rem] text-muted-foreground mt-0.5">
                                Authority: <span className="font-medium">{d.issuingAuthority || "—"}</span>
                                {d.format ? <> · Format: <span className="font-medium">{d.format}</span></> : null}
                              </p>
                              {d.notes && <p className="text-[0.55rem] text-muted-foreground italic mt-0.5">{d.notes}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })}
                <div className="p-2 rounded bg-background/40 text-[0.6rem] text-muted-foreground flex items-center gap-3">
                  <span><strong className="text-foreground">{docRequirements.length}</strong> total</span>
                  <span><strong className="text-red-400">{docRequirements.filter(d => d.mandatory).length}</strong> mandatory</span>
                  <span><strong className="text-emerald-400">{docRequirements.filter(d => !d.mandatory).length}</strong> optional</span>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg border border-dashed border-border text-center text-[0.65rem] text-muted-foreground">
                No documents resolved yet. Click "Resolve from RIA" to generate the trigger-driven document checklist.
              </div>
            )}
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(3)}>← Back</Button><Button onClick={() => setStep(5)} disabled={!stepValid[4]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Truck className="w-4 h-4 text-gold" /> Step 5 — Transport & Logistics</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Select transport mode → equipment type loads dynamically. Specify a realistic delivery window (earliest / preferred / latest).</p>
            </div>
            {/* Transport mode */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Transport Mode</p>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {[
                  { v: "OCEAN", icon: Ship, label: "Ocean" },
                  { v: "AIR", icon: Plane, label: "Air" },
                  { v: "RAIL", icon: Train, label: "Rail" },
                  { v: "TRUCK", icon: Truck, label: "Truck" },
                  { v: "MULTIMODAL", icon: Globe2, label: "Multimodal" },
                ].map(o => {
                  const Icon = o.icon;
                  return (
                    <button key={o.v} onClick={() => setTransportMode(o.v)} className={`p-2.5 rounded-lg border text-center transition-colors ${transportMode === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                      <Icon className="w-4 h-4 mx-auto mb-1" />
                      <p className="text-xs font-medium">{o.label}</p>
                    </button>
                  );
                })}
              </div>
              <p className="text-[0.55rem] text-muted-foreground">
                {transportMode === "OCEAN" && "🌊 Ocean — 10-45 days transit, lowest cost, ideal for bulk/non-urgent cargo."}
                {transportMode === "AIR" && "✈️ Air — 1-5 days transit, highest cost, ideal for urgent/perishable/high-value."}
                {transportMode === "RAIL" && "🚂 Rail — 5-15 days transit, medium cost, ideal for landlocked bulk routes."}
                {transportMode === "TRUCK" && "🚛 Truck — 1-7 days transit, medium cost, ideal for regional door-to-door."}
                {transportMode === "MULTIMODAL" && "🚚 Multimodal — combined modes for optimal cost/time balance."}
              </p>
            </div>
            {/* Equipment type */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Equipment Type (dynamic for {transportMode})</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {(EQUIPMENT_BY_MODE[transportMode] || []).map(eq => (
                  <button key={eq.value} onClick={() => setEquipmentType(eq.value)} className={`p-2 rounded-lg border text-left transition-colors ${equipmentType === eq.value ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{eq.label}</p>
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[0.6rem]">Equipment Count</Label>
                  <Input type="number" min={1} value={equipmentCount} onChange={e => setEquipmentCount(Math.max(1, Number(e.target.value)))} className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Alternative Ports (comma-separated UN/LOCODE)</Label>
                  <Input value={altPorts} onChange={e => setAltPorts(e.target.value)} placeholder="e.g., DEBRV, NLRTM" className="h-8 text-xs" />
                </div>
              </div>
            </div>
            {/* Delivery window */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Delivery Window (Earliest ≤ Preferred ≤ Latest)</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div><Label className="text-[0.6rem]">Earliest Acceptable</Label><Input type="date" value={earliestDeliveryDate} onChange={e => setEarliestDeliveryDate(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-[0.6rem]">Preferred</Label><Input type="date" value={preferredDeliveryDate} onChange={e => setPreferredDeliveryDate(e.target.value)} className="h-8 text-xs" /></div>
                <div><Label className="text-[0.6rem]">Latest Acceptable</Label><Input type="date" value={latestDeliveryDate} onChange={e => setLatestDeliveryDate(e.target.value)} className="h-8 text-xs" /></div>
              </div>
              {earliestDeliveryDate && latestDeliveryDate && (() => {
                const e = new Date(earliestDeliveryDate).getTime();
                const l = new Date(latestDeliveryDate).getTime();
                const days = Math.round((l - e) / (1000 * 60 * 60 * 24));
                const inOrder = e <= (preferredDeliveryDate ? new Date(preferredDeliveryDate).getTime() : e) && (preferredDeliveryDate ? new Date(preferredDeliveryDate).getTime() : l) <= l;
                const future = e > Date.now() && l > Date.now();
                const valid = days > 0 && days <= 60 && inOrder && future;
                return (
                  <div className={`p-2 rounded text-[0.6rem] ${valid ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-400"}`}>
                    {valid ? `✅ Window: ${days} days. Within max 60-day limit.` : `⚠️ Window invalid: ${days <= 0 ? "earliest must be before latest" : days > 60 ? `window exceeds 60 days (${days})` : !inOrder ? "order must be earliest ≤ preferred ≤ latest" : "dates must be in the future"}`}
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-2">
                <div><Label className="text-[0.6rem]">Transit Time (days, optional)</Label><Input type="number" min={1} value={transitTimeDays ?? ""} onChange={e => setTransitTimeDays(e.target.value ? Number(e.target.value) : null)} className="h-8 text-xs" placeholder="e.g., 14" /></div>
              </div>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(4)}>← Back</Button><Button onClick={() => setStep(6)} disabled={!stepValid[5]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Step 6 — Insurance Requirements</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Specify insurance arrangements. CIF/CIP incoterms require mandatory seller-arranged insurance — the form auto-configures this.</p>
            </div>
            {(incoterm === "CIF" || incoterm === "CIP") && (
              <div className="p-2 rounded-lg bg-gold/5 border border-gold/20 text-[0.65rem] text-foreground/80 flex items-center gap-2">
                <Sparkles className="w-3 h-3 text-gold" />
                Incoterm <strong>{incoterm}</strong> requires mandatory insurance arranged by the seller. Insurance requirement has been auto-set to <strong>REQUIRED</strong>.
              </div>
            )}
            {/* Insurance requirement */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Insurance Requirement</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "REQUIRED", label: "Required" },
                  { v: "OPTIONAL", label: "Optional" },
                  { v: "NOT_REQUIRED", label: "Not Required" },
                ].map(o => (
                  <button key={o.v} onClick={() => setInsuranceRequirement(o.v)} className={`p-2 rounded-lg border text-center transition-colors ${insuranceRequirement === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Responsible party */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Responsible Party</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "BUYER", label: "Buyer" },
                  { v: "SELLER", label: "Seller" },
                  { v: "ACCORDING_TO_INCOTERM", label: "Per Incoterm" },
                ].map(o => (
                  <button key={o.v} onClick={() => setInsuranceResponsibleParty(o.v)} className={`p-2 rounded-lg border text-center transition-colors ${insuranceResponsibleParty === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Insurance type (if required) */}
            {insuranceRequirement === "REQUIRED" && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Insurance Type</p>
                <Select value={insuranceType} onValueChange={v => setInsuranceType(v)}>
                  <SelectTrigger className="h-9"><SelectValue placeholder="Select insurance type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_RISKS">All Risks</SelectItem>
                    <SelectItem value="ICC_A">Institute Cargo Clauses (A)</SelectItem>
                    <SelectItem value="ICC_B">Institute Cargo Clauses (B)</SelectItem>
                    <SelectItem value="ICC_C">Institute Cargo Clauses (C)</SelectItem>
                    <SelectItem value="FPA">FPA (Free of Particular Average)</SelectItem>
                    <SelectItem value="WA">WA (With Average)</SelectItem>
                    <SelectItem value="REEFER">Reefer Cargo Coverage</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-[0.55rem] text-muted-foreground">All Risks / ICC (A) recommended for perishable, food, electronics. FPA acceptable for bulk commodities.</p>
              </div>
            )}
            {/* Coverage */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Coverage Amount & Currency</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[0.6rem]">Coverage % of invoice value</Label>
                  <Select value={String(insuranceCoveragePct)} onValueChange={v => setInsuranceCoveragePct(Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {[100, 110, 120, 130, 150].map(p => <SelectItem key={p} value={String(p)}>{p}%</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-[0.6rem]">Coverage Currency</Label>
                  <Select value={insuranceCurrency} onValueChange={v => setInsuranceCurrency(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["USD", "EUR", "GBP", "AED", "SAR", "EGP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <p className="text-[0.55rem] text-muted-foreground">Standard coverage is 110% of invoice value (100% goods + 10% expected profit).</p>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(5)}>← Back</Button><Button onClick={() => setStep(7)} disabled={!stepValid[6]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 7 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Banknote className="w-4 h-4 text-gold" /> Step 7 — Commercial Settlement</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Complete commercial foundation: priority, settlement structure, payment timing, credit period, currency, financing interest, bank instrument, flexibility, and documentary requirements.</p>
            </div>
            {/* Order By (cargo quantification, kept here for context) */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Order By (cargo quantification)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { v: "container", label: "Container", desc: "Per-container 40ft/20ft" },
                  { v: "cartons", label: "Cartons", desc: "Single global count" },
                  { v: "packaging", label: "Packaging", desc: "Single global qty" },
                  { v: "weight", label: "Weight (kg)", desc: "Single global weight" },
                ].map(o => (
                  <button key={o.v} onClick={() => setOrderBy(o.v)} className={`p-2 rounded-lg border text-left transition-colors ${orderBy === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-semibold">{o.label}</p>
                    <p className="text-[0.55rem] text-muted-foreground">{o.desc}</p>
                  </button>
                ))}
              </div>
              {orderBy === "container" ? (
                <div className="pt-2 border-t border-border">
                  <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-2">Container Sizes (per container)</p>
                  <div className="space-y-1.5 max-h-40 overflow-y-auto scroll-gold">
                    {containers.map((c, i) => (
                      <div key={c.id} className="flex items-center gap-3 p-1.5 rounded bg-background/40">
                        <span className="text-xs font-semibold min-w-[90px]">Container {i + 1}</span>
                        <span className="text-[0.6rem] text-muted-foreground flex-1 min-w-0 truncate">{c.originCountry} → {c.destCountry} · {c.port}</span>
                        <div className="flex gap-1">
                          <button onClick={() => updateContainerSize(i, "40ft")} className={`px-3 py-1 rounded text-xs font-medium ${c.containerSize === "40ft" ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground hover:bg-muted/70"}`}>40 ft</button>
                          <button onClick={() => updateContainerSize(i, "20ft")} className={`px-3 py-1 rounded text-xs font-medium ${c.containerSize === "20ft" ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground hover:bg-muted/70"}`}>20 ft</button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="pt-2 border-t border-border">
                  <Label className="text-[0.6rem]">{orderBy === "cartons" ? "Total Cartons" : orderBy === "packaging" ? "Total Packaging Units" : "Total Weight (kg)"}</Label>
                  <Input type="number" value={orderValue} onChange={e => setOrderValue(e.target.value)} className="h-8 text-xs" placeholder={orderBy === "cartons" ? "2000" : orderBy === "packaging" ? "1600" : "20000"} />
                </div>
              )}
            </div>
            {/* Commercial Priority */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Commercial Priority (guides negotiation AI)</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { v: "LOWEST_COST", label: "Lowest Cost" },
                  { v: "FASTEST_SETTLEMENT", label: "Fastest Settlement" },
                  { v: "FINANCING_FRIENDLY", label: "Financing Friendly" },
                  { v: "BALANCED", label: "Balanced" },
                ].map(o => (
                  <button key={o.v} onClick={() => setCommercialPriority(o.v)} className={`p-2 rounded-lg border text-center transition-colors ${commercialPriority === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Settlement structure */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Preferred Settlement Structure</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { v: "DOCUMENTARY_CREDIT", label: "Documentary Credit (LC)" },
                  { v: "DOCUMENTARY_COLLECTION", label: "Documentary Collection" },
                  { v: "BANK_TRANSFER", label: "Bank Transfer (SWIFT/SEPA)" },
                  { v: "OPEN_ACCOUNT", label: "Open Account (trust-based)" },
                  { v: "TO_BE_NEGOTIATED", label: "To Be Negotiated" },
                ].map(o => (
                  <button key={o.v} onClick={() => setSettlementStructure(o.v)} className={`p-2 rounded-lg border text-left transition-colors ${settlementStructure === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Payment timing */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Preferred Payment Timing</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {[
                  { v: "ADVANCE", label: "Advance" },
                  { v: "PARTIAL_ADVANCE", label: "Partial Advance" },
                  { v: "AGAINST_DOCUMENTS", label: "Against Documents" },
                  { v: "AGAINST_SHIPMENT", label: "Against Shipment" },
                  { v: "AGAINST_DELIVERY", label: "Against Delivery" },
                  { v: "DEFERRED", label: "Deferred" },
                  { v: "TO_BE_NEGOTIATED", label: "To Be Negotiated" },
                ].map(o => (
                  <button key={o.v} onClick={() => setPaymentTiming(o.v)} className={`p-2 rounded-lg border text-center transition-colors ${paymentTiming === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
              {paymentTiming === "PARTIAL_ADVANCE" && (
                <Input value={balanceTiming} onChange={e => setBalanceTiming(e.target.value)} placeholder="Balance timing — e.g., 70% against documents" className="h-8 text-xs" />
              )}
            </div>
            {/* Credit period + currency + financing + bank instrument + flexibility */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Credit Period</p>
                <Select value={creditPeriod} onValueChange={v => setCreditPeriod(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select credit period" /></SelectTrigger>
                  <SelectContent>
                    {["0_DAYS", "15_DAYS", "30_DAYS", "45_DAYS", "60_DAYS", "90_DAYS", "CUSTOM"].map(p => <SelectItem key={p} value={p}>{p.replace("_", " ").toLowerCase()}</SelectItem>)}
                  </SelectContent>
                </Select>
                {creditPeriod === "CUSTOM" && (
                  <Input type="number" min={1} value={creditPeriodCustomDays ?? ""} onChange={e => setCreditPeriodCustomDays(e.target.value ? Number(e.target.value) : null)} placeholder="Custom days (e.g., 45)" className="h-8 text-xs" />
                )}
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Currency</p>
                <Select value={settlementCurrency} onValueChange={v => setSettlementCurrency(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["USD", "EUR", "GBP", "AED", "SAR", "EGP"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Financing Interest</p>
                <div className="grid grid-cols-2 gap-1">
                  {[
                    { v: "BUYER", label: "Buyer" },
                    { v: "SELLER", label: "Seller" },
                    { v: "EITHER_PARTY", label: "Either" },
                    { v: "NONE", label: "None" },
                  ].map(o => (
                    <button key={o.v} onClick={() => setFinancingInterest(o.v)} className={`p-1.5 rounded border text-xs ${financingInterest === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>{o.label}</button>
                  ))}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Bank Instrument</p>
                <Select value={bankInstrument} onValueChange={v => setBankInstrument(v)}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["NONE", "LC", "SBLC", "DLC", "BG"].map(b => <SelectItem key={b} value={b}>{b === "NONE" ? "None" : b === "LC" ? "LC (Letter of Credit)" : b === "SBLC" ? "SBLC (Standby LC)" : b === "DLC" ? "DLC (Documentary LC)" : "BG (Bank Guarantee)"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {/* Settlement flexibility */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Settlement Flexibility</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "FIXED", label: "Fixed" },
                  { v: "FLEXIBLE", label: "Flexible" },
                  { v: "OPEN_TO_ALTERNATIVES", label: "Open To Alternatives" },
                ].map(o => (
                  <button key={o.v} onClick={() => setSettlementFlexibility(o.v)} className={`p-2 rounded-lg border text-center transition-colors ${settlementFlexibility === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                    <p className="text-xs font-medium">{o.label}</p>
                  </button>
                ))}
              </div>
            </div>
            {/* Settlement documentary requirements */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Settlement Documentary Requirements</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                {["COMMERCIAL_INVOICE", "PACKING_LIST", "BILL_LADING", "COO", "INSPECTION_CERT", "INSURANCE_CERT"].map(d => (
                  <label key={d} className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={settlementDocuments.includes(d)} onChange={e => setSettlementDocuments(prev => e.target.checked ? [...prev, d] : prev.filter(x => x !== d))} />
                    <span>{d.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase())}</span>
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <Label className="text-[0.6rem]">Original Documents Required?</Label>
                  <div className="flex gap-1">
                    <button onClick={() => setOriginalDocsRequired(true)} className={`flex-1 p-1.5 rounded border text-xs ${originalDocsRequired ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border"}`}>Yes</button>
                    <button onClick={() => setOriginalDocsRequired(false)} className={`flex-1 p-1.5 rounded border text-xs ${!originalDocsRequired ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border"}`}>No</button>
                  </div>
                </div>
                <div>
                  <Label className="text-[0.6rem]">Document Language</Label>
                  <Select value={documentLanguage} onValueChange={v => setDocumentLanguage(v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["EN", "AR", "DE", "FR", "ZH", "ES"].map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(6)}>← Back</Button><Button onClick={() => setStep(8)} disabled={!stepValid[7]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 8 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Zap className="w-4 h-4 text-gold" /> Step 8 — Trade Criticality & Readiness</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Set trade criticality (drives workflow routing, approval urgency, alerting) and review the live advisory readiness score.</p>
            </div>
            {/* AI suggestion */}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2">
              <Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-xs font-medium text-gold mb-1">AI Suggested Criticality (A1, advisory)</p>
                {criticalitySuggested ? (
                  <div className="space-y-1">
                    <p className="text-xs text-foreground/80"><strong>{criticalitySuggested.suggested}</strong> ({criticalitySuggested.confidence}% confidence)</p>
                    {criticalitySuggested.factors?.length > 0 && (
                      <ul className="text-[0.6rem] text-muted-foreground list-disc ml-4">
                        {criticalitySuggested.factors.map((f: string, i: number) => <li key={i}>{f}</li>)}
                      </ul>
                    )}
                    <Button size="sm" variant="outline" className="h-6 text-[0.65rem] mt-1" onClick={() => setTradeCriticality(criticalitySuggested.suggested)}>Apply recommendation</Button>
                  </div>
                ) : (
                  <Button size="sm" variant="outline" className="h-6 text-[0.65rem]" onClick={suggestCriticality} disabled={criticalityLoading}>
                    {criticalityLoading ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Analyzing…</> : "Suggest criticality"}
                  </Button>
                )}
              </div>
            </div>
            {/* Criticality selector */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Select Trade Criticality</p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: "ROUTINE", icon: ClipboardList, label: "Routine" },
                  { v: "PRIORITY", icon: Rocket, label: "Priority" },
                  { v: "CRITICAL", icon: AlertCircle, label: "Critical" },
                ].map(o => {
                  const Icon = o.icon;
                  return (
                    <button key={o.v} onClick={() => setTradeCriticality(o.v)} className={`p-3 rounded-lg border text-center transition-colors ${tradeCriticality === o.v ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                      <Icon className="w-5 h-5 mx-auto mb-1" />
                      <p className="text-xs font-semibold">{o.label}</p>
                    </button>
                  );
                })}
              </div>
              {criticalityRules.length > 0 && (() => {
                const rule = criticalityRules.find(r => r.level === tradeCriticality);
                if (!rule) return null;
                return (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2 text-[0.6rem]">
                    <div className="p-1.5 rounded bg-background/40"><span className="text-muted-foreground">Smart Inbox:</span> <span className="font-medium">{rule.smartInboxPriority.min}-{rule.smartInboxPriority.max}</span></div>
                    <div className="p-1.5 rounded bg-background/40"><span className="text-muted-foreground">Approval SLA:</span> <span className="font-medium">{rule.approvalSlaHours}h</span></div>
                    <div className="p-1.5 rounded bg-background/40"><span className="text-muted-foreground">Approvers:</span> <span className="font-medium">{rule.approvers.join(", ")}</span></div>
                    <div className="p-1.5 rounded bg-background/40"><span className="text-muted-foreground">Notifications:</span> <span className="font-medium">{rule.notificationChannels.join(", ")}</span></div>
                  </div>
                );
              })()}
            </div>
            {/* Readiness */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold">Trade Request Readiness (advisory, non-blocking)</p>
                {readinessLoading && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
              </div>
              {readiness ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 h-3 rounded-full bg-muted overflow-hidden">
                      <div className="h-full transition-all" style={{ width: `${readiness.score}%`, background: readiness.score >= 70 ? "#10b981" : readiness.score >= 40 ? "#fbbf24" : "#f87171" }} />
                    </div>
                    <span className="text-sm font-bold" style={{ color: readiness.score >= 70 ? "#10b981" : readiness.score >= 40 ? "#fbbf24" : "#f87171" }}>{readiness.score}/100</span>
                  </div>
                  <p className="text-[0.6rem] text-muted-foreground">
                    {readiness.isReadyForSubmission ? "✅ Ready for submission" : "⚠️ Not yet ready — address missing items below (advisory only)"}
                  </p>
                  {readiness.missing.length > 0 && (
                    <div className="space-y-1 max-h-40 overflow-y-auto scroll-gold">
                      {readiness.missing.map((m: any, i: number) => (
                        <div key={i} className={`text-[0.6rem] flex items-start gap-1.5 ${m.severity === "BLOCKER" ? "text-red-400" : m.severity === "WARNING" ? "text-amber-400" : "text-muted-foreground"}`}>
                          <span>{m.severity === "BLOCKER" ? "⛔" : m.severity === "WARNING" ? "⚠️" : "ℹ️"}</span>
                          <span>{m.message}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Component breakdown */}
                  <details className="text-[0.6rem] text-muted-foreground">
                    <summary className="cursor-pointer">Component breakdown</summary>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-1 mt-1">
                      {Object.entries(readiness.components).map(([k, v]: [string, any]) => (
                        <div key={k} className="flex justify-between p-1 rounded bg-background/40">
                          <span>{k}</span>
                          <span className="font-medium">{v}%</span>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ) : (
                <p className="text-[0.6rem] text-muted-foreground">Calculating readiness…</p>
              )}
            </div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(7)}>← Back</Button><Button onClick={() => setStep(9)} disabled={!stepValid[8]} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 9 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><Ship className="w-4 h-4 text-gold" /> Step 9 — Shipments, Notes & Special Instructions</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Optionally split delivery across multiple shipments, add trade-wide notes, capture special trade instructions (Part 4.6), and review marketplace attribution.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/20 border border-border"><div className="flex items-center justify-between mb-2"><Label className="text-xs flex items-center gap-2"><input type="checkbox" checked={multiShipment} onChange={e => setMultiShipment(e.target.checked)} className="rounded" /> Request multi-shipment contract</Label>{multiShipment && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-blue-400" onClick={() => bulkShiftDates(7)}>+7d</Button><Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-blue-400" onClick={() => bulkShiftDates(-7)}>-7d</Button><Button size="sm" variant="outline" onClick={addShipment} className="h-7 text-xs">+ Add</Button></div>}</div>{multiShipment ? <p className="text-[0.6rem] text-muted-foreground mb-2">Split the order across multiple delivery dates / ports. Each shipment references containers configured in Step 3.</p> : <p className="text-[0.6rem] text-muted-foreground">Single shipment — all containers delivered together to the destination port.</p>}{multiShipment && shipments.map((s, i) => <div key={s.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-2 p-2 rounded-lg bg-background/40"><div><Label className="text-[0.6rem]">Shipment #{i + 1}</Label></div><div><Label className="text-[0.6rem]">Delivery Date</Label><Input type="date" value={s.deliveryDate} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, deliveryDate: e.target.value } : x))} className="h-8 text-xs" /></div><div><Label className="text-[0.6rem]">Port</Label><Input value={s.port} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, port: e.target.value } : x))} className="h-8 text-xs" /></div><div><Label className="text-[0.6rem]">Containers</Label><Input type="number" value={s.containers} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, containers: Number(e.target.value) } : x))} className="h-8 text-xs" /></div><div className="flex items-end gap-1"><button className="text-[0.6rem] text-gold hover:underline pb-1" onClick={() => toast.info("Commodity override modal opens per shipment")}>Edit</button><button className="text-[0.6rem] text-blue-400 hover:underline pb-1" onClick={() => cloneShipment(s.id)}>Clone</button>{shipments.length > 1 && <button onClick={() => removeShipment(s.id)} className="text-[0.6rem] text-red-400 pb-1">✕</button>}</div></div>)}</div>
            <div className="p-3 rounded-lg bg-muted/20 border border-border"><div className="flex items-center justify-between mb-1"><Label className="text-xs">Global Notes (for entire trade) — max 2000 chars</Label><button onClick={loadAiNotes} disabled={aiNotesLoading} className="text-[0.6rem] text-gold hover:underline flex items-center gap-1">{aiNotesLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />} AI Suggest</button></div><Textarea value={globalNotes} onChange={e => setGlobalNotes(e.target.value.slice(0, 2000))} placeholder="e.g., Seller to provide phytosanitary certificate. Insurance required. Reefers precooled to 4°C." className="min-h-[60px] text-xs" /><p className="text-[0.55rem] text-muted-foreground text-right mt-0.5">{globalNotes.length}/2000 chars</p>{aiNotesSuggestion && <div className="mt-1 p-2 rounded bg-gold/5 border border-gold/20 text-[0.65rem] text-foreground/80"><p className="font-semibold text-gold mb-0.5">AI Suggestions:</p><pre className="whitespace-pre-wrap">{aiNotesSuggestion}</pre><button onClick={() => setGlobalNotes(aiNotesSuggestion)} className="text-gold hover:underline mt-1">Accept all</button></div>}</div>
            {/* Part 4.6 — Special Trade Instructions */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-xs flex items-center gap-1.5"><StickyNote className="w-3.5 h-3.5 text-gold" /> Special Trade Instructions (Part 4.6 — free-text + AI categorization)</Label>
                <span className="text-[0.55rem] text-muted-foreground">{specialInstructions.length} chars</span>
              </div>
              <p className="text-[0.55rem] text-muted-foreground">Add specific requirements, conditions, or operational notes. Visible to seller, logistics, customs, and other parties.</p>
              <Textarea value={specialInstructions} onChange={e => setSpecialInstructions(e.target.value.slice(0, 5000))} placeholder="e.g., Arabic labels mandatory on all cartons. No wooden pallets (ISPM-15 compliant only). Halal certification required. Temperature logger in each container. Original B/L by DHL. Inspection witnessed by buyer. Arbitration: DIFC-LCIA, Dubai." className="min-h-[100px] text-xs" />
              <div className="flex flex-wrap gap-1">
                <span className="text-[0.55rem] text-muted-foreground self-center mr-1">Templates:</span>
                {INSTRUCTION_TEMPLATES.slice(0, 6).map(t => (
                  <button key={t} onClick={() => setSpecialInstructions(prev => (prev ? prev + "\n" : "") + t)} className="text-[0.55rem] px-1.5 py-0.5 rounded border border-border bg-background/40 hover:bg-gold/10 hover:border-gold/30 text-foreground/70">+ {t}</button>
                ))}
              </div>
              {instructionCategories.length > 0 && (
                <div className="pt-2 border-t border-border">
                  <p className="text-[0.55rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1.5">AI Categorization (heuristic)</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                    {instructionCategories.map((c, i) => (
                      <div key={i} className="p-1.5 rounded bg-background/40">
                        <p className="text-[0.6rem] font-semibold text-gold">{c.category}</p>
                        {c.snippets.map((s: string, j: number) => <p key={j} className="text-[0.55rem] text-foreground/70">• {s}</p>)}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {attribution && <div className="p-3 rounded-lg bg-blue-500/5 border border-blue-500/20"><p className="text-[0.6rem] tracking-widest text-blue-400 uppercase font-semibold mb-1">Marketplace Attribution</p><p className="text-xs text-foreground/80">This trade will be attributed to <span className="font-semibold">{attribution.partnerName || attribution.partner}</span> because you first connected through them on {attribution.firstTradeDate?.slice(0, 10) || attribution.date}. Revenue share: {attribution.revenueSharePct || attribution.revenueShare}%. You have 72 hours to dispute.</p><div className="flex gap-2 mt-2"><Button size="sm" variant="outline" className="h-7 text-xs">Continue</Button><Button size="sm" variant="ghost" className="h-7 text-xs text-amber-400" onClick={() => setShowDisputeModal(true)}>Dispute Attribution</Button></div></div>}
            {showDisputeModal && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowDisputeModal(false)}>
                <Card className="p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
                  <h3 className="font-semibold text-sm mb-2">Dispute Marketplace Attribution</h3>
                  <Textarea value={disputeReason} onChange={e => setDisputeReason(e.target.value)} placeholder="Why do you dispute this attribution?" className="min-h-[70px] text-xs mb-3" />
                  <div className="flex gap-2">
                    <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => { toast.success("Dispute submitted for review"); setShowDisputeModal(false); setDisputeReason(""); }}>Submit Dispute</Button>
                    <Button size="sm" variant="outline" className="h-7" onClick={() => setShowDisputeModal(false)}>Cancel</Button>
                  </div>
                </Card>
              </div>
            )}
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(8)}>← Back</Button><Button onClick={() => setStep(10)} className="bg-gold-gradient text-sovereign">Continue →</Button></div>
          </div>
        )}
        {step === 10 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Step 10 — Governor Pre-Screen & Submit</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Run the Governor's expanded pre-screen (Part 4.15: permissions, jurisdiction, dual-use, transport, insurance, settlement, delivery window, documentation completeness), review the full trade summary, then submit to the seller.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border"><div className="flex items-center justify-between mb-1.5"><p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Governor Pre-Screen (Part 4.15 · expanded · A4 + A2 constraining)</p>{!prescreen && !prescreenLoading && <button onClick={runPrescreen} className="text-[0.65rem] text-gold hover:underline">Run AI pre-screen</button>}{prescreenProvider && <span className="text-[0.55rem] text-muted-foreground">via {prescreenProvider}</span>}</div>{prescreenLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Running expanded pre-screen (G1U1-G1U33)…</div> : prescreen ? <div className="space-y-1 text-xs"><div className="flex items-center gap-2">{prescreen.verdict === "ALLOW" ? <CheckCircle2 className="w-3 h-3 text-emerald-400" /> : <AlertTriangle className="w-3 h-3 text-amber-400" />}<span className="font-semibold" style={{ color: prescreen.verdict === "ALLOW" ? "#10b981" : "#fbbf24" }}>Verdict: {prescreen.verdict}</span></div>{prescreen.conditions?.map((c: string, i: number) => <div key={i} className="ml-5 text-amber-400">⚠ {c}</div>)}</div> : <p className="text-xs text-muted-foreground">Expanded 33-gate matrix: permissions, jurisdiction, ports, incoterm, transport mode/equipment (G1U18-G1U20), insurance (G1U20a-d), settlement (G1U9-G1U17), criticality (G1U11a-e), documentation (G1U21-G1U22), delivery window (G1U20), packing consistency, dual-use, GNN sanctions.</p>}</div>
            <div className="p-4 rounded-lg bg-muted/30 space-y-2 text-sm">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase font-semibold mb-1">Trade Summary</p>
              <div className="flex justify-between"><span className="text-muted-foreground">Buyer</span><span>European Importer GmbH</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seller</span><span>{selectedSeller?.name || "Strawberry Export Co."}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Commodity</span><span>{productName} ({hsCode})</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Packaging</span><span>{packaging}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Incoterm</span><span className="font-semibold">{incoterm} — seller handles: {incotermConfig.mandatoryServices.join(", ") || "none"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Containers</span><span>{containers.length} × containers, {totalPallets} pallets · {totalGrossKg.toLocaleString()} kg gross</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Order By</span><span>{orderBy === "container" ? `${container40ftCount} × 40ft + ${container20ftCount} × 20ft` : orderBy === "weight" ? `Weight: ${orderValue} kg` : orderBy === "cartons" ? `Cartons: ${orderValue}` : `Packaging units: ${orderValue}`}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cold Chain</span><span>{coldChain === "yes" ? "Required (-18°C)" : "Not required"}</span></div>
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Documentation</span><span className="font-medium">{docRequirements.length} docs · {docRequirements.filter(d => d.mandatory).length} mandatory</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Transport</span><span className="font-medium">{transportMode || "—"} · {equipmentType || "—"} × {equipmentCount}</span></div>
              {earliestDeliveryDate && latestDeliveryDate && <div className="flex justify-between"><span className="text-muted-foreground">Delivery Window</span><span className="text-xs">{earliestDeliveryDate} → {preferredDeliveryDate || "—"} → {latestDeliveryDate}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Insurance</span><span className="font-medium">{insuranceRequirement || "—"} {insuranceType ? `· ${insuranceType}` : ""}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Settlement</span><span className="font-medium">{settlementStructure?.replace(/_/g, " ").toLowerCase() || "—"} · {paymentTiming?.replace(/_/g, " ").toLowerCase() || "—"} · {settlementCurrency}</span></div>
              {creditPeriod && <div className="flex justify-between"><span className="text-muted-foreground">Credit Period</span><span className="text-xs">{creditPeriod === "CUSTOM" ? `${creditPeriodCustomDays} days` : creditPeriod.replace("_", " ").toLowerCase()}</span></div>}
              {bankInstrument && bankInstrument !== "NONE" && <div className="flex justify-between"><span className="text-muted-foreground">Bank Instrument</span><span className="text-xs">{bankInstrument}</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Trade Criticality</span><span className="font-medium">{tradeCriticality}</span></div>
              {readiness && <div className="flex justify-between"><span className="text-muted-foreground">Readiness</span><span className="font-medium" style={{ color: readiness.score >= 70 ? "#10b981" : readiness.score >= 40 ? "#fbbf24" : "#f87171" }}>{readiness.score}/100</span></div>}
              <div className="flex justify-between"><span className="text-muted-foreground">Multi-shipment</span><span>{multiShipment ? `${shipments.length} shipments` : "Single shipment"}</span></div>
              {globalNotes && <div className="flex justify-between"><span className="text-muted-foreground">Global Notes</span><span className="text-xs max-w-xs truncate">{globalNotes}</span></div>}
              {specialInstructions && <div className="flex justify-between"><span className="text-muted-foreground">Special Instructions</span><span className="text-xs max-w-xs truncate">{specialInstructions}</span></div>}
              <div className="flex justify-between border-t border-border pt-2"><span className="text-muted-foreground">Estimated SGTX Fee (1.5%)</span><span className="text-gold font-semibold">On quote</span></div>
            </div>
            {submitResult && (
              <div className={`p-3 rounded-lg border ${submitResult.ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
                {submitResult.ok ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 className="w-4 h-4" /><p className="text-sm font-semibold">Trade Request Submitted!</p></div>
                    <p className="text-xs text-foreground/80">{submitResult.message}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">USTN: {submitResult.ustn}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-400"><AlertTriangle className="w-4 h-4" /><p className="text-sm">{submitResult.error}</p></div>
                )}
              </div>
            )}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/30 flex items-start gap-2"><Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" /><p className="text-xs">On submit: trade request sent to seller (priority 75 Smart Inbox). USTN generated at contract lock — not now. No data re-entry across phases. Draft auto-saved every 30s.</p></div>
            <div className="flex justify-between"><Button variant="outline" onClick={() => setStep(9)}>← Back</Button><Button onClick={handleSubmit} disabled={submitting} className="bg-gold-gradient text-sovereign">{submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</> : <><Send className="w-3.5 h-3.5 mr-1.5" />Submit Trade Request</>}</Button></div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ QUOTE BUILDER (Seller) — Full Phase 2 Implementation ============
const LOGISTICS_SERVICES_BY_INCOTERM: Record<string, { service: string; mandatory: boolean }[]> = {
  EXW: [{ service: "Trucking (origin to port)", mandatory: false }, { service: "Export customs", mandatory: false }, { service: "Ocean freight", mandatory: false }],
  FOB: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: false }],
  CFR: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: true }],
  CIF: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "THC (origin port)", mandatory: true }, { service: "Ocean freight", mandatory: true }, { service: "Insurance", mandatory: true }],
  CPT: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }],
  CIP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Insurance", mandatory: true }],
  DAP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Destination charges", mandatory: true }],
  DPU: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Terminal charges", mandatory: true }],
  DDP: [{ service: "Trucking (origin to port)", mandatory: true }, { service: "Export customs", mandatory: true }, { service: "Main carriage", mandatory: true }, { service: "Destination charges", mandatory: true }, { service: "Import duties", mandatory: true }],
  FCA: [{ service: "Trucking (origin to carrier)", mandatory: true }, { service: "Export customs", mandatory: true }],
};

export function QuoteBuilderScreen() {
  // 3B.3.2 Loading Origin
  const [loadingCountry, setLoadingCountry] = useState("EG");
  const [loadingPort, setLoadingPort] = useState("Alexandria (EGALX)");

  // 3B.3.3 EXW Price Lock
  const [exwPrice, setExwPrice] = useState("5.00");
  const [priceUnit, setPriceUnit] = useState("kg"); // kg | ton | unit
  const [weightUnit, setWeightUnit] = useState("metric"); // metric | imperial
  const [band, setBand] = useState<{ low?: number; mid?: number; high?: number; rationale?: string } | null>(null);
  const [bandLoading, setBandLoading] = useState(false);
  const [bandProvider, setBandProvider] = useState<string | null>(null);
  const [deviation, setDeviation] = useState<any>(null);
  const [deviationLoading, setDeviationLoading] = useState(false);
  const [justification, setJustification] = useState("");

  // 3B.3.4 Packing
  const [layers, setLayers] = useState([{ id: 1, cartonsPerLayer: 80, numLayers: 10, layerHeight: 15, orientation: "standard" }, { id: 2, cartonsPerLayer: 40, numLayers: 1, layerHeight: 15, orientation: "rotated" }]);
  const [packingLocked, setPackingLocked] = useState(false);
  const [ecoResult, setEcoResult] = useState<any>(null);
  const [ecoLoading, setEcoLoading] = useState(false);
  const [carbonFootprint, setCarbonFootprint] = useState({ scope1: 120, scope2: 45, scope3: 380, total: 545, cbamApplicable: true });
  const [appliedEco, setAppliedEco] = useState<string | null>(null);
  const [selectedAltPort, setSelectedAltPort] = useState<string | null>(null);

  // 3B.3.9 Submit Quote
  const [submitting, setSubmitting] = useState(false);
  const [submitResult, setSubmitResult] = useState<any>(null);
  const handleSubmitQuote = async () => {
    if (submitting || !packingLocked || missingMandatory.length > 0) return;
    setSubmitting(true); setSubmitResult(null);
    try {
      // Calculate total cartons and weight from packing layers
      const totalCartons = layers.reduce((s, l) => s + l.cartonsPerLayer * l.numLayers, 0);
      const exwTotal = Number(exwPrice) * (priceUnit === "kg" ? 20000 : priceUnit === "ton" ? 20 : totalCartons);
      const logisticsTotal = Object.entries(modeA).reduce((s, [, v]) => s + Number(v), 0);
      const sgtxFee = Math.round((exwTotal + logisticsTotal) * 0.015 * 100) / 100;
      const totalQuote = exwTotal + logisticsTotal + sgtxFee;

      const res = await fetch("/api/sgtx/quote/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: "SGTX-1234B6C-002139F-20260415120000-A1B2C3D4", // demo trade
          sellerGtid: "SGTX-EG-TRD-002139-7F3A",
          exwPrice: Number(exwPrice), priceUnit, loadingCountry, loadingPort,
          packingLayers: layers, totalCartons,
          logisticsModeA: modeA, incoterm,
          exwTotal, logisticsTotal, sgtxFee, totalQuote,
          carbonFootprint,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSubmitResult({ ok: true, message: d.message || "Quote submitted to buyer.", quoteId: d.quoteId });
        toast.success("Quote submitted to buyer (priority 75 Smart Inbox)");
      } else {
        setSubmitResult({ ok: false, error: d.error || "Submission failed" });
        toast.error(d.error || "Quote submission failed");
      }
    } catch (e: any) {
      setSubmitResult({ ok: false, error: e.message });
      toast.error("Network error during quote submission");
    } finally { setSubmitting(false); }
  };

  // 3B.3.5 Logistics Modes
  const [incoterm, setIncoterm] = useState("CIF");
  const [modeA, setModeA] = useState<Record<string, string>>({ "Trucking (origin to port)": "900", "Export customs": "600", "THC (origin port)": "300", "Ocean freight": "4200", Insurance: "450" });
  const [shipQuotes, setShipQuotes] = useState<any[]>([]);
  const [shipQuoteLoading, setShipQuoteLoading] = useState(false);
  const [selectedQuotes, setSelectedQuotes] = useState<Record<string, any>>({});
  const [rfqSent, setRfqSent] = useState(false);

  // 3B.3.6 Alternative Ports
  const [altPorts, setAltPorts] = useState<any[]>([]);
  const [altPortLoading, setAltPortLoading] = useState(false);

  // 3B.3.7 MultiShipment response
  const [multiShipResponse, setMultiShipResponse] = useState<"accept" | "modify" | "reject" | null>(null);

  // 3B.3.8 SGTX Fee
  const exwTotal = parseFloat(exwPrice) * 20000; // 20,000 kg
  const logisticsTotal = Object.values(modeA).reduce((s, v) => s + (parseFloat(v) || 0), 0) + Object.values(selectedQuotes).reduce((s: number, q: any) => s + (q?.totalFee || 0), 0);
  const tradeValue = exwTotal + logisticsTotal;
  const sgtxFee = tradeValue * 0.015;
  const finalPrice = tradeValue + sgtxFee;

  const incotermServices = LOGISTICS_SERVICES_BY_INCOTERM[incoterm] || LOGISTICS_SERVICES_BY_INCOTERM.CIF;
  const missingMandatory = incotermServices.filter(s => s.mandatory && !modeA[s.service] && !selectedQuotes[s.service]);

  // AI price band
  const loadBand = async () => {
    if (bandLoading) return;
    setBandLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/price-band", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries IQF", hsCode: "0811.10.00", originCountry: "EG", destCountry: "DE" }) });
      const d = await res.json(); setBandProvider(d.provider);
      try { const m = d.content.match(/\{[\s\S]*\}/); if (m) { const p = JSON.parse(m[0]); setBand({ low: p.low, mid: p.mid, high: p.high, rationale: p.rationale }); checkDeviation(parseFloat(exwPrice), p.low, p.high); } } catch {}
    } catch {} finally { setBandLoading(false); }
  };

  // Price deviation check
  const checkDeviation = async (price: number, low: number, high: number) => {
    if (!low || !high) return;
    setDeviationLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/price-deviation", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries", enteredPrice: price, aiBandLow: low, aiBandHigh: high }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setDeviation(JSON.parse(m[0])); } catch {}
    } catch {} finally { setDeviationLoading(false); }
  };

  const onPriceChange = (v: string) => { setExwPrice(v); if (band) checkDeviation(parseFloat(v) || 0, band.low!, band.high!); };

  // Unit conversion
  const convertPrice = (price: number, from: string, to: string) => {
    if (from === to) return price;
    if (from === "kg" && to === "ton") return price * 1000;
    if (from === "ton" && to === "kg") return price / 1000;
    if (from === "kg" && to === "unit") return price * 12.5; // 12.5 kg per carton
    if (from === "unit" && to === "kg") return price / 12.5;
    if (from === "ton" && to === "unit") return price * 80; // 80 cartons per ton
    if (from === "unit" && to === "ton") return price / 80;
    return price;
  };

  // Ecological packaging
  const loadEco = async () => {
    if (ecoLoading) return;
    setEcoLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/eco-packaging", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ commodity: "Frozen Strawberries IQF", currentPackaging: "Corrugated cartons + plastic strapping", containerCount: 2 }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setEcoResult(JSON.parse(m[0])); } catch {}
    } catch {} finally { setEcoLoading(false); }
  };

  // Mode C: Send to shipping lines
  const sendToShipLines = async () => {
    setShipQuoteLoading(true);
    try {
      const res = await fetch("/api/sgtx/ship-quote/request", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sellerGtid: "SGTX-EG-TRD-002139-7F3A", baseServiceType: "OCEAN_FREIGHT", originPort: loadingPort, destinationPort: "Hamburg (DEHAM)", containerDetails: { type: "40ft Reefer", count: 2 }, addOnServices: ["TRUCKING", "CUSTOMS_BROKER"], targetLines: ["SGTX-EG-SHP-000031-9E8F", "SGTX-DE-SHP-000058-2B3C"] }) });
      const d = await res.json(); setShipQuotes(d.quotes || []);
    } catch {} finally { setShipQuoteLoading(false); }
  };

  const selectQuote = async (quoteId: string, service: string) => {
    await fetch("/api/sgtx/ship-quote/select", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ quoteId }) });
    const quote = shipQuotes.find(q => q.id === quoteId);
    if (quote) setSelectedQuotes(s => ({ ...s, [service]: quote }));
  };

  // Alternative ports
  const loadAltPorts = async () => {
    if (altPortLoading) return;
    setAltPortLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/alt-ports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destCountry: "DE", commodity: "Frozen Strawberries", currentPort: "Hamburg (DEHAM)" }) });
      const d = await res.json(); try { const m = d.content.match(/\{[\s\S]*\}/); if (m) setAltPorts(JSON.parse(m[0]).suggestions || []); } catch {}
    } catch {} finally { setAltPortLoading(false); }
  };

  // Packing calculations
  const totalCartons = layers.reduce((s, l) => s + l.cartonsPerLayer * l.numLayers, 0);
  const netWeight = totalCartons * 12.5;
  const grossWeight = netWeight + totalCartons * 0.5;

  const exw = parseFloat(exwPrice) || 0;
  const withinBand = band && exw >= band.low! && exw <= band.high!;
  const bandPos = band ? Math.max(0, Math.min(100, ((exw - band.low!) / (band.high! - band.low!)) * 100)) : 50;

  return (
    <div className="space-y-4 max-w-6xl">
      <SectionHeader title="Quote, Packing & Logistics Orchestration" subtitle="Phase 2 — EXW lock · non-uniform packing · 3 logistics modes (A/B/C) · alternative ports · SGTX fee · one-click submit" />

      {/* 3B.3.1 Read-only Buyer Request View */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">3B.3.1 Buyer Request (Read-Only)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-2 rounded-lg bg-muted/20">
          <div><span className="text-[0.6rem] text-muted-foreground">Commodity:</span> Frozen Strawberries IQF (0811.10)</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Incoterm:</span> CIF</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Containers:</span> 2 × 40ft</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Multi-shipment:</span> 2 shipments</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Net Weight:</span> 20,000 kg</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Route:</span> EG → DE (Hamburg)</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Cold chain:</span> -18°C</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Pallets:</span> 20 EUR</div>
        </div>
      </Card>

      {/* 3B.3.2 Loading Origin */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.3.2 Loading Origin</h3>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div><Label className="text-xs">Country of Loading</Label><Select value={loadingCountry} onValueChange={setLoadingCountry}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["EG","VN","DE","US","CN"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Port of Loading</Label><Select value={loadingPort} onValueChange={setLoadingPort}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["Alexandria (EGALX)","Damietta (EGDAM)","Cairo (EGCAI)"].map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent></Select></div>
          <div><Label className="text-xs">Alternative Loading Point (map picker)</Label><Input placeholder="Geocoded via Nominatim…" className="h-8 text-xs" /></div>
          <div><Label className="text-xs">Distance to port (auto)</Label><Input defaultValue="215 km (OSRM)" disabled className="h-8 text-xs" /></div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* 3B.3.3 EXW Price Lock */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.3 EXW Price Lock</h3>
            <div className="flex gap-1">
              <button onClick={() => setPriceUnit("kg")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "kg" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per kg</button>
              <button onClick={() => setPriceUnit("ton")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "ton" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per ton</button>
              <button onClick={() => setPriceUnit("unit")} className={`px-2 py-0.5 rounded text-[0.6rem] ${priceUnit === "unit" ? "bg-gold text-sovereign" : "bg-muted text-muted-foreground"}`}>Per unit</button>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-xs">EXW Price (USD/{priceUnit})</Label><Input value={exwPrice} onChange={(e) => onPriceChange(e.target.value)} type="number" className="h-8 text-xs" /></div>
            <div><Label className="text-xs">Currency</Label><Select defaultValue="USD"><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["USD","EUR","GBP","EGP","AED","CNY"].map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent></Select></div>
            <div><Label className="text-xs">Weight Unit</Label><div className="flex gap-1 mt-1"><button onClick={() => setWeightUnit("metric")} className={`px-2 py-0.5 rounded text-[0.6rem] ${weightUnit === "metric" ? "bg-gold text-sovereign" : "bg-muted"}`}>Metric (kg/t)</button><button onClick={() => setWeightUnit("imperial")} className={`px-2 py-0.5 rounded text-[0.6rem] ${weightUnit === "imperial" ? "bg-gold text-sovereign" : "bg-muted"}`}>Imperial (lb)</button></div></div>
          </div>
          {/* Equivalent prices */}
          <div className="flex gap-2 text-[0.65rem] text-muted-foreground">
            <span>= ${convertPrice(exw, priceUnit, "kg").toFixed(2)}/kg</span>
            <span>= ${convertPrice(exw, priceUnit, "ton").toFixed(0)}/ton</span>
            <span>= ${convertPrice(exw, priceUnit, "unit").toFixed(2)}/unit</span>
          </div>
          {/* AI Price Band */}
          <div className="p-3 rounded-lg bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">🧠 AI Market Intelligence (A1)</p>
              {!band && !bandLoading && <button onClick={loadBand} className="text-[0.65rem] text-gold hover:underline">Get market band</button>}
              {bandProvider && <span className="text-[0.55rem] text-muted-foreground">via {bandProvider}</span>}
            </div>
            {bandLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing market…</div>
            : band ? <>
                <div className="flex items-center justify-between text-xs"><span className="text-red-400">${band.low?.toFixed(2)}</span><div className="flex-1 mx-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/40 via-emerald-500/40 to-red-500/40 relative"><div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold border-2 border-background" style={{ left: `calc(${bandPos}% - 6px)` }} /></div><span className="text-red-400">${band.high?.toFixed(2)}</span></div>
                <div className="flex items-center gap-2 mt-1"><p className="text-[0.65rem] text-muted-foreground flex-1">${exw.toFixed(2)}/kg is <span className={withinBand ? "text-emerald-400 font-semibold" : "text-amber-400 font-semibold"}>{withinBand ? "within" : "outside"} band</span>. {band.rationale}</p>{band && <button onClick={() => { setExwPrice(String(band.mid)); onPriceChange(String(band.mid)); }} className="text-[0.6rem] bg-gold/15 text-gold px-2 py-0.5 rounded hover:bg-gold/25">Use fair price</button>}</div>
              </>
            : <p className="text-[0.65rem] text-muted-foreground">30-day market chart + AI fair price band (FAO, USDA, World Bank feeds).</p>}
          </div>
          {/* Price deviation */}
          {deviation && deviation.requires_justification && (
            <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <p className="text-[0.6rem] text-amber-400 font-semibold uppercase mb-1">⚠ Price Deviation: {deviation.deviation_pct}% from band — Justification Required</p>
              <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Enter justification (min 20 chars)…" className="h-8 text-xs" />
              {justification.length < 20 && <p className="text-[0.55rem] text-amber-400 mt-1">{justification.length}/20 chars</p>}
            </div>
          )}
          {deviation && !deviation.requires_justification && deviation.advisory && <p className="text-[0.65rem] text-amber-400">⚠ {deviation.advisory}</p>}
          {/* Total EXW */}
          <div className="p-2 rounded-lg bg-muted/20 flex justify-between text-xs"><span className="text-muted-foreground">Total EXW Value:</span><span className="font-bold text-gold">${exwTotal.toLocaleString()}</span></div>
        </Card>

        {/* 3B.3.4 Packing Module */}
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.4 Packing (Non-Uniform Layers)</h3><Badge variant="outline" className="text-[0.55rem]">{packingLocked ? "🔒 LOCKED" : "Draft"}</Badge></div>
          {/* Weight calc */}
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Total Cartons</p><p className="font-bold">{totalCartons}</p></div>
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Net Weight</p><p className="font-bold">{netWeight.toLocaleString()} kg</p></div>
            <div className="p-1.5 rounded bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Gross Weight</p><p className="font-bold">{grossWeight.toLocaleString()} kg</p></div>
          </div>
          {/* Layer patterns */}
          <div className="space-y-1.5">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Layer Patterns (Non-Uniform Stacking)</p>
            {layers.map((l, i) => (
              <div key={l.id} className="grid grid-cols-5 gap-1 items-center p-1.5 rounded bg-muted/20">
                <span className="text-[0.6rem] text-muted-foreground">Pattern {i + 1}</span>
                <Input type="number" value={l.cartonsPerLayer} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, cartonsPerLayer: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Cartons/layer" />
                <Input type="number" value={l.numLayers} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, numLayers: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Layers" />
                <Input type="number" value={l.layerHeight} onChange={e => setLayers(ls => ls.map(x => x.id === l.id ? { ...x, layerHeight: Number(e.target.value) } : x))} className="h-7 text-xs" placeholder="Height (cm)" />
                <button onClick={() => setLayers(ls => ls.filter(x => x.id !== l.id))} className="text-[0.6rem] text-red-400">✕</button>
              </div>
            ))}
            <button onClick={() => setLayers(ls => [...ls, { id: Date.now(), cartonsPerLayer: 40, numLayers: 1, layerHeight: 15, orientation: "standard" }])} className="text-[0.6rem] text-gold hover:underline">+ Add Layer Pattern</button>
          </div>
          {/* 3B.3.4.2 Optimise solver + 3B.3.4.3 Collaborative + 3B.3.4.4 3D viewer */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs"><Cpu className="w-3 h-3 mr-1" /> Optimise (OR-Tools)</Button>
            <Badge variant="outline" className="text-[0.5rem] text-blue-400">🔄 Collaborative (Yjs)</Badge>
            <Badge variant="outline" className="text-[0.5rem] text-purple-400">📦 3D Viewer + Heatmap</Badge>
          </div>
          {/* Ecological advisor */}
          <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1"><p className="text-[0.6rem] text-emerald-400 font-semibold uppercase">🌱 Ecological Advisor (A1)</p>{!ecoResult && !ecoLoading && <button onClick={loadEco} className="text-[0.6rem] text-emerald-400 hover:underline">Get suggestions</button>}</div>
            {ecoLoading ? <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing…</div>
            : ecoResult?.alternatives ? <div className="space-y-1">{ecoResult.alternatives.map((a: any, i: number) => {
              const isApplied = appliedEco === a.material;
              return (
                <div key={i} className="flex items-center gap-2 text-[0.65rem]">
                  <span className="flex-1">{a.material}: {a.description}</span>
                  <Badge variant="outline" className="text-[0.5rem] text-emerald-400">-{a.carbon_saving_kg}kg CO2</Badge>
                  {isApplied ? (
                    <Badge variant="outline" className="text-[0.5rem] text-emerald-400 border-emerald-500/40">✓ Applied</Badge>
                  ) : (
                    <button
                      onClick={() => {
                        setAppliedEco(a.material);
                        // Subtract the carbon saving from the total (applied once)
                        const saving = Number(a.carbon_saving_kg) || 0;
                        setCarbonFootprint((c) => ({
                          ...c,
                          scope3: Math.max(0, c.scope3 - Math.round(saving * 0.7)),
                          total: Math.max(0, c.total - saving),
                        }));
                        toast.success(`Eco-packaging applied`, { description: `${a.material} · -${a.carbon_saving_kg}kg CO2e` });
                      }}
                      className="text-emerald-400 hover:underline"
                    >Apply</button>
                  )}
                </div>
              );
            })}</div>
            : <p className="text-[0.6rem] text-muted-foreground">Suggests sustainable packaging alternatives with carbon savings.</p>}
          </div>
          {/* Carbon footprint */}
          <div className="p-2 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1">Carbon Footprint (ISO 14067)</p>
            <div className="grid grid-cols-4 gap-1 text-[0.65rem]">
              <div><span className="text-muted-foreground">Scope 1:</span> {carbonFootprint.scope1} kg</div>
              <div><span className="text-muted-foreground">Scope 2:</span> {carbonFootprint.scope2} kg</div>
              <div><span className="text-muted-foreground">Scope 3:</span> {carbonFootprint.scope3} kg</div>
              <div><span className="text-muted-foreground">Total:</span> <span className="font-bold">{carbonFootprint.total} kg CO2</span></div>
            </div>
            {carbonFootprint.cbamApplicable && <p className="text-[0.6rem] text-amber-400 mt-1">⚠ CBAM report required for EU-bound shipment</p>}
          </div>
          {/* Lock packing */}
          {!packingLocked ? <Button onClick={() => setPackingLocked(true)} size="sm" className="w-full bg-gold-gradient text-sovereign h-8"><Lock className="w-3 h-3 mr-1.5" /> Lock Packing Plan</Button>
          : <div className="p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-3 h-3" /> Packing plan locked · SSCC18 barcodes generated · Loom hash recorded</div>}
          {/* 3B.3.3.6 Post-Lock Price Watch (Background, A2) */}
          {packingLocked && (
            <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs">
              <p className="text-[0.6rem] tracking-widest text-blue-400 uppercase font-semibold mb-0.5">Post-Lock Price Watch (A2 · background)</p>
              <p className="text-[0.65rem] text-muted-foreground">NATS subscription monitors daily market price changes. If market moves &gt;10% from locked price, you'll receive a Smart Inbox item: "Market price moved +12% — reopen pricing?" with one-click "Reopen" button.</p>
              <div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="text-[0.5rem] text-blue-400">🔄 NATS live</Badge><Badge variant="outline" className="text-[0.5rem]">Threshold: ±10%</Badge></div>
            </div>
          )}
        </Card>
      </div>

      {/* 3B.3.5 Logistics Cost Entry — Three Modes */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.5 Logistics Costs — Three Modes (A/B/C)</h3>
          <div className="flex items-center gap-2"><Label className="text-xs">Incoterm:</Label><Select value={incoterm} onValueChange={setIncoterm}><SelectTrigger className="w-20 h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent>{Object.keys(LOGISTICS_SERVICES_BY_INCOTERM).map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}</SelectContent></Select></div>
        </div>
        {/* Service table with incoterm filtering */}
        <div className="overflow-x-auto scroll-gold">
          <table className="w-full text-xs">
            <thead><tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase"><th className="text-left px-2 py-1.5">Service</th><th className="text-left px-2 py-1.5">Mandatory?</th><th className="text-left px-2 py-1.5">Mode A (Manual)</th><th className="text-left px-2 py-1.5">Mode B (RFQ)</th><th className="text-left px-2 py-1.5">Mode C (Ship Line)</th><th className="text-left px-2 py-1.5">Selected</th></tr></thead>
            <tbody>
              {incotermServices.map(s => (
                <tr key={s.service} className="border-b border-border/40">
                  <td className="px-2 py-2 font-medium">{s.service}</td>
                  <td className="px-2 py-2">{s.mandatory ? <Badge variant="outline" className="text-[0.5rem] text-red-400 border-red-500/30">MANDATORY</Badge> : <span className="text-[0.6rem] text-muted-foreground">Optional</span>}</td>
                  <td className="px-2 py-2"><Input value={modeA[s.service] || ""} onChange={e => setModeA(m => ({ ...m, [s.service]: e.target.value }))} className="h-7 text-xs w-24" placeholder="$ amount" /></td>
                  <td className="px-2 py-2">{rfqSent ? <span className="text-[0.6rem] text-emerald-400">✓ RFQ sent</span> : <button onClick={() => setRfqSent(true)} className="text-[0.6rem] text-gold hover:underline">Send RFQ</button>}</td>
                  <td className="px-2 py-2">{shipQuotes.length > 0 ? <span className="text-[0.6rem] text-emerald-400">{shipQuotes.length} quotes</span> : <button onClick={sendToShipLines} disabled={shipQuoteLoading} className="text-[0.6rem] text-gold hover:underline disabled:opacity-50">{shipQuoteLoading ? "…" : "Send to lines"}</button>}</td>
                  <td className="px-2 py-2">{selectedQuotes[s.service] ? <Badge variant="outline" className="text-[0.5rem] text-emerald-400">${selectedQuotes[s.service].totalFee}</Badge> : modeA[s.service] ? <Badge variant="outline" className="text-[0.5rem]">${modeA[s.service]}</Badge> : <span className="text-[0.6rem] text-red-400">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Mode C quotes */}
        {shipQuotes.length > 0 && (
          <div className="p-2 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Compare Quotes Panel — All Modes (A+B+C) Unified</p>
            <div className="space-y-1">
              {/* Mode A entries */}
              {incotermServices.filter(s => modeA[s.service]).map(s => (
                <div key={s.service} className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-blue-400 border-blue-500/30">Mode A</Badge>
                  <span className="flex-1">{s.service}</span>
                  <span className="font-bold text-gold">${modeA[s.service]}</span>
                  {selectedQuotes[s.service] ? <span className="text-[0.6rem] text-emerald-400">✓ Selected</span> : <span className="text-[0.6rem] text-muted-foreground">Manual entry</span>}
                </div>
              ))}
              {/* Mode C entries */}
              {shipQuotes.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-purple-400 border-purple-500/30">Mode C</Badge>
                  <span className="font-mono text-[0.6rem] text-muted-foreground">{q.shipperLineGtid.slice(0, 18)}…</span>
                  <span className="flex-1">Base: ${q.baseFee} · Add-ons: {q.addOnFees ? JSON.parse(q.addOnFees).TRUCKING || 0 : 0} + {q.addOnFees ? JSON.parse(q.addOnFees).CUSTOMS_BROKER || 0 : 0}</span>
                  <span className="font-bold text-gold">${q.totalFee}</span>
                  <button onClick={() => selectQuote(q.id, "Ocean freight")} className="text-[0.6rem] text-emerald-400 hover:underline">Select</button>
                </div>
              ))}
              {/* Mode B placeholder */}
              {rfqSent && (
                <div className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-amber-400 border-amber-500/30">Mode B</Badge>
                  <span className="flex-1 text-muted-foreground">RFQ sent to LSPs — awaiting quotes…</span>
                </div>
              )}
              {/* Aggregated total */}
              <div className="flex items-center gap-2 p-1.5 rounded bg-gold/10 border border-gold/20 text-xs mt-1">
                <span className="flex-1 font-semibold text-gold">Aggregated Selected Costs (Mixed Mode):</span>
                <span className="font-bold text-gold">${logisticsTotal.toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}
        {missingMandatory.length > 0 && <div className="p-2 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400 flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> Missing mandatory services: {missingMandatory.map(s => s.service).join(", ")}</div>}
        {/* Mode B clarification request */}
        {rfqSent && (
          <div className="p-2 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs">
            <p className="text-[0.6rem] text-blue-400 font-semibold uppercase mb-1">Mode B: RFQ Details & Clarification</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><span className="text-[0.6rem] text-muted-foreground">Pickup Address:</span> Cairo Cold Store, 5th District, New Cairo</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Distribution:</span> <Badge variant="outline" className="text-[0.5rem] text-amber-400">Directed</Badge> <Badge variant="outline" className="text-[0.5rem] text-blue-400">Anonymous Broadcast</Badge></div>
              <div><span className="text-[0.6rem] text-muted-foreground">Match Score (A1):</span> 87/100 (route + commodity + service type)</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Multi-stop VRP:</span> OR-Tools optimiser active</div>
            </div>
            <p className="text-[0.65rem] text-muted-foreground">Providers can click "Ask Clarification" (dangerous goods, access restrictions). Seller answers via Smart Inbox (one click per answer). All Q&A logged.</p>
            <button className="text-[0.6rem] text-blue-400 hover:underline mt-1">View 0 clarification requests</button>
          </div>
        )}
        {/* Mode C addon checkboxes + details */}
        {shipQuotes.length > 0 && (
          <div className="p-2 rounded-lg bg-muted/20 text-xs">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1">Mode C: Shipping Line Request Details</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><span className="text-[0.6rem] text-muted-foreground">Base Service:</span> OCEAN_FREIGHT</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Container:</span> 40ft Reefer × 2</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Sailing Window:</span> 2026-04-16 to 2026-04-22</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Temperature:</span> -18°C (reefer)</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Target Lines:</span> Maersk Levant, Hapag-Lloyd</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Quote Style:</span> <Badge variant="outline" className="text-[0.5rem]">Bundled</Badge> <Badge variant="outline" className="text-[0.5rem]">Line-item</Badge></div>
            </div>
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1 mt-2">Add-on Services (checkboxes)</p>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-[0.65rem]">Trucking (door-to-door)</span></label>
              <label className="flex items-center gap-1"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-[0.65rem]">Customs Broker (in-house)</span></label>
              <label className="flex items-center gap-1"><input type="checkbox" className="rounded" /> <span className="text-[0.65rem]">Insurance (partner)</span></label>
              <label className="flex items-center gap-1"><input type="checkbox" className="rounded" /> <span className="text-[0.65rem]">Destination handling (THC)</span></label>
            </div>
            <p className="text-[0.55rem] text-muted-foreground mt-1">Lines can quote bundled or line-item. Lines may decline specific addons (e.g., "we don't offer trucking in this region").</p>
          </div>
        )}
        {/* 3B.3.5.5 Advanced Professional Options */}
        <div className="p-2 rounded-lg bg-muted/20 text-xs">
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1">3B.3.5.5 Advanced Professional Options (All Modes)</p>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="flex items-center gap-1"><input type="checkbox" defaultChecked className="rounded" /> <span className="text-[0.65rem]">Special equipment: Reefer temp (-18°C)</span></label>
            <label className="flex items-center gap-1"><input type="checkbox" className="rounded" /> <span className="text-[0.65rem]">Tail lift required</span></label>
            <label className="flex items-center gap-1"><input type="checkbox" className="rounded" /> <span className="text-[0.65rem]">Time-defined loading window with demurrage protection</span></label>
            <label className="flex items-center gap-1"><span className="text-[0.65rem]">Quote validity:</span><Input type="number" defaultValue={48} className="h-7 w-12 text-xs" /> <span className="text-[0.65rem]">hrs</span></label>
            <label className="flex items-center gap-1"><input type="checkbox" className="rounded" /> <span className="text-[0.65rem]">AI "should-cost" model for quote comparison</span></label>
            <button className="text-[0.65rem] text-gold hover:underline">💬 Direct negotiation with providers via Trade Room</button>
            <button className="text-[0.65rem] text-gold hover:underline">📦 Batch RFQ for multiple containers (Mode B only)</button>
          </div>
        </div>
      </Card>

      {/* 3B.3.6 Alternative Ports */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold text-sm">3B.3.6 Alternative Delivery Ports</h3>{!altPorts.length && !altPortLoading && <button onClick={loadAltPorts} className="text-[0.65rem] text-gold hover:underline">🧠 Get AI suggestions</button>}</div>
        {altPortLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing ports…</div>
        : altPorts.length > 0 ? <div className="space-y-1">{altPorts.map((p, i) => {
          const isUsed = selectedAltPort === p.port;
          return (
            <div key={i} className="flex items-center gap-2 p-1.5 rounded bg-muted/20 text-xs">
              <span className="font-medium flex-1">{p.port} ({p.un_locode})</span>
              <span className="text-muted-foreground">{p.transit_time_days}d transit</span>
              <span className={p.cost_delta_usd >= 0 ? "text-red-400" : "text-emerald-400"}>${p.cost_delta_usd > 0 ? "+" : ""}{p.cost_delta_usd}</span>
              <Badge variant="outline" className="text-[0.5rem]">{p.congestion_level}</Badge>
              {isUsed ? (
                <Badge variant="outline" className="text-[0.5rem] text-emerald-400 border-emerald-500/40">✓ Selected</Badge>
              ) : (
                <button
                  onClick={() => {
                    setSelectedAltPort(p.port);
                    toast.success(`Switched delivery port`, { description: `${p.port} (${p.un_locode}) · ${p.transit_time_days}d transit · $${p.cost_delta_usd > 0 ? "+" : ""}${p.cost_delta_usd}` });
                  }}
                  className="text-gold hover:underline"
                >Use</button>
              )}
            </div>
          );
        })}</div>
        : <p className="text-[0.65rem] text-muted-foreground">AI suggests alternative ports based on historical cost savings, transit time, congestion.</p>}
      </Card>

      {/* 3B.3.7 MultiShipment Response */}
      <Card className="p-4 space-y-2">
        <h3 className="font-semibold text-sm">3B.3.7 MultiShipment Schedule Response</h3>
        <p className="text-xs text-muted-foreground">Buyer requested 2-shipment schedule. Seller can accept, modify, or reject.</p>
        <div className="flex gap-2">
          <button onClick={() => setMultiShipResponse("accept")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "accept" ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40" : "bg-muted/50 text-muted-foreground"}`}>Accept as proposed</button>
          <button onClick={() => setMultiShipResponse("modify")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "modify" ? "bg-amber-500/20 text-amber-400 border border-amber-500/40" : "bg-muted/50 text-muted-foreground"}`}>Propose modifications</button>
          <button onClick={() => setMultiShipResponse("reject")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "reject" ? "bg-red-500/20 text-red-400 border border-red-500/40" : "bg-muted/50 text-muted-foreground"}`}>Reject (single shipment)</button>
        </div>
      </Card>

      {/* 3B.3.8 SGTX Fee Calculation */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.3.8 SGTX Fee Calculation (Automatic)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">EXW Total</p><p className="font-bold">${exwTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Logistics Total</p><p className="font-bold">${logisticsTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-gold/10 border border-gold/20"><p className="text-[0.6rem] text-gold">SGTX Fee (1.5%)</p><p className="font-bold text-gold">${sgtxFee.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"><p className="text-[0.6rem] text-emerald-400">Final Price</p><p className="font-bold text-emerald-400">${finalPrice.toLocaleString()}</p></div>
        </div>
      </Card>

      {/* 3B.3.9 Submit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">3B.3.9 Submit Quote</h3>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">Governor validates: mandatory fields, packing locked, mandatory services selected, fee calculated.</p>
            {!packingLocked && <p className="text-[0.65rem] text-amber-400 mt-1">⚠ Packing plan must be locked first</p>}
            {missingMandatory.length > 0 && <p className="text-[0.65rem] text-red-400 mt-1">⚠ Missing {missingMandatory.length} mandatory services</p>}
          </div>
          <Button className="bg-gold-gradient text-sovereign" disabled={!packingLocked || missingMandatory.length > 0 || submitting} onClick={handleSubmitQuote}>
            {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</> : <><Send className="w-3.5 h-3.5 mr-1.5" />Submit Quote</>}
          </Button>
        </div>
        {submitResult && (
          <div className={`mt-3 p-2 rounded-lg border ${submitResult.ok ? "bg-emerald-500/10 border-emerald-500/30" : "bg-red-500/10 border-red-500/30"}`}>
            {submitResult.ok ? (
              <div className="text-xs">
                <p className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Quote Submitted!</p>
                <p className="text-foreground/80 mt-0.5">{submitResult.message}</p>
                {submitResult.quoteId && <p className="text-[0.6rem] text-muted-foreground font-mono">Quote ID: {submitResult.quoteId}</p>}
              </div>
            ) : (
              <p className="text-xs text-red-400 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {submitResult.error}</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ SELLER PENDING REQUESTS (Phase 1 → 2 connection) ============
// Lists trades where THIS seller is the seller and status === "INITIATED"
// (i.e. buyer has submitted a trade request and is awaiting the seller's quote).
// Each pending request is rendered as a card with: buyer name, commodity, HS code,
// quantity, incoterm, container count, plus a "Prepare Quote" button that navigates
// the seller to the quote-builder tab.
export function SellerPendingRequestsScreen({ data }: { data: Data }) {
  const setActiveTab: (t: string) => void = (data?._setActiveTab as any) || (() => {});
  const tenantGtid = data?.tenant?.gtid;

  // Filter to trades awaiting this seller's quote (status INITIATED).
  const pendingRequests: any[] = (data?.tradesAsSeller || []).filter(
    (t: any) => t.status === "INITIATED",
  );

  const prepareQuote = (t: any) => {
    if (setActiveTab) {
      setActiveTab("quote-builder");
      toast.success("Opening Quote Builder", {
        description: `Preparing quote for ${t.commodity} · USTN ${t.ustn?.slice(0, 24)}…`,
      });
    } else {
      toast.info("Switch to the Quote Builder tab to prepare your quote.", {
        description: `USTN ${t.ustn?.slice(0, 24)}… · ${t.commodity}`,
      });
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Pending Requests"
        subtitle="Inbound trade requests from buyers awaiting your quote — Phase 1 → Phase 2 handoff"
      />

      <Card className="p-4 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gold/15 flex items-center justify-center">
            <Inbox className="w-5 h-5 text-gold" />
          </div>
          <div>
            <p className="text-sm font-semibold">
              {pendingRequests.length} pending request{pendingRequests.length === 1 ? "" : "s"} awaiting your quote
            </p>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">
              {tenantGtid ? `Seller ${tenantGtid}` : "Seller"} · Accept by submitting a quote via the Quote Builder
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-[0.65rem] text-gold border-gold/30">
          {pendingRequests.length} pending
        </Badge>
      </Card>

      {pendingRequests.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Inbox className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
          No pending trade requests.
          <p className="text-[0.65rem] mt-1">
            When a buyer submits a trade request targeting you as the seller, it will appear here
            with status <span className="font-mono">INITIATED</span>.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {pendingRequests.map((t) => {
            const buyer = t.buyer;
            const shipments = t.shipments || [];
            const containerCount =
              t.containerCount ||
              shipments.reduce((s: number, sh: any) => s + (sh.containerCount || 1), 0) ||
              1;
            return (
              <Card key={t.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {t.commodity || "Unnamed commodity"}
                    </p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5 truncate">
                      {t.ustn}
                    </p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30 whitespace-nowrap">
                    {t.status.replace(/_/g, " ")}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Buyer</p>
                    <p className="font-medium truncate">{buyer?.legalName || t.buyerGtid}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">HS Code</p>
                    <p className="font-medium font-mono">{t.commodityHs || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Quantity</p>
                    <p className="font-medium">{fmtKg(t.netWeightKg || t.grossWeightKg || 0)}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Incoterm</p>
                    <p className="font-medium">{t.incoterm || "—"}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Containers</p>
                    <p className="font-medium">{containerCount}</p>
                  </div>
                  <div>
                    <p className="text-[0.55rem] text-muted-foreground uppercase tracking-wide">Route</p>
                    <p className="font-medium truncate">
                      {t.originPort || t.originCountry || "—"} → {t.destPort || t.destCountry || "—"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <p className="text-[0.6rem] text-muted-foreground">
                    Requested {fmtDate(t.createdAt)}
                  </p>
                  <Button
                    size="sm"
                    className="bg-gold-gradient text-sovereign h-8 text-xs"
                    onClick={() => prepareQuote(t)}
                  >
                    <Send className="w-3 h-3 mr-1" /> Prepare Quote
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============ QUOTE REVIEW (Buyer) ============
export function QuoteReviewScreen({ data }: { data: Data }) {
  const queryClient = useQueryClient();
  const setActiveTab: (t: string) => void = (data?._setActiveTab as any) || (() => {});
  const [showNegotiation, setShowNegotiation] = useState(false);
  const [showPartialAccept, setShowPartialAccept] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [negotiationMode, setNegotiationMode] = useState<"negotiate" | "amend" | null>(null);
  const [counterAmount, setCounterAmount] = useState("");
  const [counterReason, setCounterReason] = useState("");
  const [extensionDuration, setExtensionDuration] = useState("24");
  const [extensionReason, setExtensionReason] = useState("");
  const [mutualConfirmed, setMutualConfirmed] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [acceptingUstn, setAcceptingUstn] = useState<string | null>(null);
  const [acceptedUstn, setAcceptedUstn] = useState<string | null>(null);
  // Active trade for the negotiation panel (Phase 2 → 3 connection)
  const [negotiationUstn, setNegotiationUstn] = useState<string | null>(null);

  // Real QUOTED trades from dashboard data — these are trades where the seller
  // has submitted a quote and the buyer must now accept/negotiate/amend.
  const quotedTrades: any[] = (data?.tradesAsBuyer || []).filter((t: any) => t.status === "QUOTED");

  // Map quoted trades to delivery-option rows for the comparison table.
  const deliveryOptions = quotedTrades.map((t: any) => {
    const sellerName = t.seller?.legalName || t.sellerGtid;
    const eta = t.shipments?.[0]?.eta;
    const transit = eta
      ? `${Math.max(1, Math.ceil((new Date(eta).getTime() - Date.now()) / 86400000))} days`
      : "TBD";
    return {
      ustn: t.ustn,
      sellerName,
      commodity: t.commodity,
      port: t.destPort || "TBD",
      transit,
      total: Math.round(t.tradeValueUsd || 0),
      fee: Math.round(t.sgtxFeeUsd || (t.tradeValueUsd || 0) * 0.015),
      isPrimary: true,
    };
  });

  // Active trade context for the negotiation panel
  const negotiationTrade = quotedTrades.find((t) => t.ustn === negotiationUstn) || quotedTrades[0] || null;

  const loadAiSummary = async () => {
    if (aiLoading || aiSummary) return;
    setAiLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tenant: "SGTX-DE-TRD-001234-5B6C", message: "Summarize the best delivery option: Alexandria 14 days $105,700 vs Damietta 16 days $105,190. Which saves money vs time?" }) });
      const d = await res.json(); setAiSummary(d.content);
    } catch {} finally { setAiLoading(false); }
  };

  // Accept the quote via POST /api/sgtx/quote/accept
  const acceptQuote = async (ustn: string | null, deliveryPort?: string) => {
    if (!ustn) {
      setMutualConfirmed(true);
      toast.info("No real quote to accept", { description: "When a seller submits a quote, it will appear here." });
      return;
    }
    setAcceptingUstn(ustn);
    try {
      const res = await fetch("/api/sgtx/quote/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn, deliveryPort }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Accept failed");
      setMutualConfirmed(true);
      setAcceptedUstn(ustn);
      toast.success("Quote accepted - proceed to contract signing", {
        description: d.message || `Trade status: ${d.tradeStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      // Auto-navigate to contract tab after a short delay
      setTimeout(() => setActiveTab("contract"), 800);
    } catch (e: any) {
      toast.error("Could not accept quote", { description: e?.message || "Please try again." });
    } finally {
      setAcceptingUstn(null);
    }
  };

  // Open the negotiation panel with the real trade context
  const openNegotiation = (ustn: string | null, mode: "negotiate" | "amend") => {
    if (!ustn) {
      toast.info("No real quote to negotiate", { description: "When a seller submits a quote, it will appear here." });
      return;
    }
    setNegotiationUstn(ustn);
    setShowNegotiation(true);
    setNegotiationMode(mode);
    if (mode === "amend") setShowDiff(true);
    else setShowDiff(false);
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Quote Review & Negotiation" subtitle="Phase 3 — Compare delivery options · negotiate · partial acceptance · deadline extension · mutual confirmation" />

      {deliveryOptions.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          <Inbox className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
          No quotes pending review.
          <p className="text-[0.65rem] mt-1">
            When a seller submits a quote, it will appear here with status{" "}
            <span className="font-mono">QUOTED</span>.
          </p>
        </Card>
      ) : (
        <>
          {/* 3B.4.1 Quote Comparison Table */}
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="font-semibold text-sm">Delivery Options Comparison</h3>
              <Badge variant="outline" className="text-[0.6rem] text-gold border-gold/30">
                {deliveryOptions.length} quote{deliveryOptions.length === 1 ? "" : "s"} pending review
              </Badge>
            </div>
            <div className="overflow-x-auto scroll-gold">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-[0.65rem] text-muted-foreground uppercase">
                    <th className="text-left px-4 py-2">Seller / Commodity</th>
                    <th className="text-left px-3 py-2">Delivery Port</th>
                    <th className="text-left px-3 py-2">Transit Time</th>
                    <th className="text-right px-3 py-2">Total Quote</th>
                    <th className="text-right px-3 py-2 hidden sm:table-cell">SGTX Fee</th>
                    <th className="text-left px-3 py-2">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deliveryOptions.map((opt, i) => {
                    const isAccepted = !!acceptedUstn && opt.ustn === acceptedUstn;
                    const isAccepting = !!acceptingUstn && opt.ustn === acceptingUstn;
                    return (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/20">
                        <td className="px-4 py-3">
                          <span className="text-xs font-medium block">{opt.sellerName}</span>
                          <span className="text-[0.6rem] text-muted-foreground block">{opt.commodity}</span>
                          {opt.ustn && <p className="text-[0.55rem] font-mono text-muted-foreground mt-0.5">{opt.ustn.slice(0, 24)}…</p>}
                          {opt.isPrimary && <Badge variant="outline" className="text-[0.5rem] ml-1 text-gold border-gold/30">PRIMARY</Badge>}
                        </td>
                        <td className="px-3 py-3 text-xs">{opt.port}</td>
                        <td className="px-3 py-3 text-xs text-muted-foreground">{opt.transit}</td>
                        <td className="px-3 py-3 text-right text-xs font-semibold">${opt.total.toLocaleString()}</td>
                        <td className="px-3 py-3 text-right text-xs text-gold hidden sm:table-cell">${opt.fee.toLocaleString()}</td>
                        <td className="px-3 py-3"><div className="flex gap-1.5">
                          {isAccepted ? (
                            <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[0.6rem] h-7 px-2"><CheckCircle2 className="w-3 h-3 mr-1" />Accepted</Badge>
                          ) : (
                            <Button size="sm" className="h-7 bg-gold-gradient text-sovereign text-xs" disabled={isAccepting} onClick={() => acceptQuote(opt.ustn, opt.port)}>
                              {isAccepting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Accepting…</> : <><CheckCircle2 className="w-3 h-3 mr-1" />Accept</>}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openNegotiation(opt.ustn, "negotiate")}>Negotiate</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openNegotiation(opt.ustn, "amend")}>Amend</Button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="px-4 py-2 border-t border-border bg-muted/20 text-[0.6rem] text-muted-foreground flex items-center justify-between flex-wrap gap-2">
              <button onClick={loadAiSummary} disabled={aiLoading} className="text-gold hover:underline disabled:opacity-50">
                {aiLoading ? "Analyzing…" : aiSummary ? "🧠 AI summary ready" : "🧠 Generate AI summary"}
              </button>
              {aiSummary && <span className="text-[0.55rem] truncate max-w-md">{aiSummary.slice(0, 80)}…</span>}
            </div>
          </Card>

          {/* Negotiation panel header — anchored to real trade context */}
          {showNegotiation && negotiationTrade && (
            <Card className="p-3 bg-gold/5 border border-gold/20">
              <p className="text-[0.65rem] text-gold uppercase tracking-wide font-semibold">
                Negotiating · USTN <span className="font-mono">{negotiationTrade.ustn?.slice(0, 24)}…</span>
              </p>
              <p className="text-xs mt-0.5">
                {negotiationTrade.seller?.legalName || negotiationTrade.sellerGtid} ·{" "}
                {negotiationTrade.commodity} ·{" "}
                ${Math.round(negotiationTrade.tradeValueUsd || 0).toLocaleString()} ·{" "}
                {negotiationTrade.incoterm} {negotiationTrade.destPort}
              </p>
            </Card>
          )}
        </>
      )}

      {/* 3B.4.2 Negotiation Panel */}
      {showNegotiation && (
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Negotiation Panel — {negotiationMode === "negotiate" ? "Price Negotiation" : "Amendment"} (3-Column Real-Time)</h3>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            {/* Left: Offer History */}
            <div className="space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Offer History</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><div className="flex justify-between"><span className="font-medium text-blue-400">Seller →</span><span className="text-[0.55rem] text-muted-foreground">10:30 UTC</span></div><p>$105,700 (CIF Alexandria)</p><Badge variant="outline" className="text-[0.5rem] mt-1">PENDING</Badge></div>
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><div className="flex justify-between"><span className="font-medium text-amber-400">Buyer →</span><span className="text-[0.55rem] text-muted-foreground">11:15 UTC</span></div><p>Counter: $104,000</p><p className="text-[0.55rem] text-muted-foreground">Reason: Market index shows $4.90/kg avg</p></div>
              </div>
            </div>
            {/* Middle: Current Offer & Controls */}
            <div className="space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Current Offer & Controls</p>
              <div className="p-3 rounded-lg bg-muted/20 space-y-2">
                <p className="text-xs"><span className="text-muted-foreground">Latest from seller:</span> <span className="font-semibold">$105,700</span></p>
                <div><Label className="text-[0.6rem]">Counter Amount ($)</Label><Input value={counterAmount} onChange={(e) => setCounterAmount(e.target.value)} type="number" className="h-8 text-xs" placeholder="104000" /></div>
                {/* 3B.4.2.3 Counter-offer reason (mandatory ≥20 chars) */}
                <div><Label className="text-[0.6rem]">Reason (mandatory, ≥20 chars)</Label><Textarea value={counterReason} onChange={(e) => setCounterReason(e.target.value)} className="min-h-[40px] text-xs" placeholder="e.g., Market index shows lower average price for this commodity…" /></div>
                {counterReason.length < 20 && counterReason.length > 0 && <p className="text-[0.5rem] text-amber-400">{counterReason.length}/20 chars required</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-7 bg-gold-gradient text-sovereign text-xs" disabled={counterReason.length < 20}>Send Counter</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Accept</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Reject</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Request Info</Button>
                  {/* 3B.4.2.2 Partial Acceptance */}
                  <Button size="sm" variant="outline" className="h-7 text-xs text-blue-400" onClick={() => setShowPartialAccept(true)}>Partial Acceptance</Button>
                  {/* 3B.4.2.4 Deadline Extension */}
                  <Button size="sm" variant="outline" className="h-7 text-xs text-amber-400" onClick={() => setShowExtension(true)}>Request Extension</Button>
                </div>
                <p className="text-[0.55rem] text-muted-foreground">⏱ Offer expires in 2h 45m</p>
              </div>
            </div>
            {/* Right: Trade Room Chat */}
            <div className="space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Trade Room Chat (tagged to offers)</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><p className="font-medium text-amber-400">Buyer</p><p>Can you match $104,000? Market index supports it.</p></div>
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><p className="font-medium text-blue-400">Seller</p><p>We can offer $104,500 with Damietta port instead. Saves you $510.</p></div>
              </div>
              <p className="text-[0.5rem] text-muted-foreground">🧠 A1 auto-translates messages into each party's language</p>
            </div>
          </div>
          {/* 3B.4.2.5 Visual Diff for Amendments */}
          {showDiff && negotiationMode === "amend" && (
            <div className="mt-3 p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Visual Diff — Proposed Amendments</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-red-500/5 border border-red-500/20"><p className="text-[0.6rem] text-red-400">Original</p><p>Port: Alexandria</p><p>Delivery: 2026-05-04</p><p>Price: $105,700</p></div>
                <div className="p-2 rounded bg-emerald-500/5 border border-emerald-500/20"><p className="text-[0.6rem] text-emerald-400">Proposed</p><p>Port: Damietta</p><p>Delivery: 2026-05-06</p><p>Price: $105,190</p></div>
              </div>
              <div className="flex gap-2 mt-2"><Button size="sm" className="h-7 bg-gold-gradient text-sovereign text-xs">Apply Diff</Button><Button size="sm" variant="outline" className="h-7 text-xs">Reject All</Button></div>
            </div>
          )}
        </Card>
      )}

      {/* 3B.4.2.2 Partial Acceptance Modal */}
      {showPartialAccept && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowPartialAccept(false)}>
          <Card className="p-4 max-w-lg w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-3">Partial Acceptance — Multi-Shipment</h3>
            <div className="space-y-2">
              {[{ id: 1, qty: "20,000 kg", price: "$30,360", action: "accept" }, { id: 2, qty: "15,000 kg (proposed)", price: "Re-quote", action: "negotiate" }, { id: 3, qty: "20,000 kg", price: "$30,360", action: "cancel" }].map(s => (
                <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 text-xs">
                  <span className="font-medium">Shipment {s.id}</span>
                  <span className="flex-1 text-muted-foreground">{s.qty} · {s.price}</span>
                  <Select defaultValue={s.action}><SelectTrigger className="w-28 h-7 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="accept">☑ Accept</SelectItem><SelectItem value="negotiate">☐ Negotiate</SelectItem><SelectItem value="cancel">☐ Cancel</SelectItem></SelectContent></Select>
                </div>
              ))}
            </div>
            <div className="mt-3"><Label className="text-[0.6rem]">Reason for partial acceptance (mandatory, ≥20 chars)</Label><Textarea className="min-h-[40px] text-xs" placeholder="e.g., We only need 35,000 kg for Q2 demand forecast…" /></div>
            <div className="flex gap-2 mt-3"><Button size="sm" className="bg-gold-gradient text-sovereign h-7">Submit Counter</Button><Button size="sm" variant="outline" className="h-7" onClick={() => setShowPartialAccept(false)}>Cancel</Button></div>
          </Card>
        </div>
      )}

      {/* 3B.4.2.4 Deadline Extension Modal */}
      {showExtension && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowExtension(false)}>
          <Card className="p-4 max-w-md w-full" onClick={e => e.stopPropagation()}>
            <h3 className="font-semibold text-sm mb-3">Request Deadline Extension</h3>
            <div className="space-y-3">
              <div><Label className="text-xs">Proposed new deadline</Label><Select value={extensionDuration} onValueChange={setExtensionDuration}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="24">+24 hours</SelectItem><SelectItem value="48">+48 hours</SelectItem><SelectItem value="168">+7 days</SelectItem></SelectContent></Select></div>
              <div><Label className="text-xs">Reason (recommended)</Label><Textarea value={extensionReason} onChange={(e) => setExtensionReason(e.target.value)} className="min-h-[40px] text-xs" placeholder="e.g., Need approval from finance director for amounts >$100k" /></div>
            </div>
            <div className="flex gap-2 mt-3"><Button size="sm" className="bg-gold-gradient text-sovereign h-7">Send Request</Button><Button size="sm" variant="outline" className="h-7" onClick={() => setShowExtension(false)}>Cancel</Button></div>
            <p className="text-[0.55rem] text-muted-foreground mt-2">Counterparty receives Smart Inbox item · Can Approve (1 click) or Reject (with reason) · Logged as Governor decision</p>
          </Card>
        </div>
      )}

      {/* 3B.4.3 Mutual Confirmation */}
      {mutualConfirmed && (
        <Card className="p-4 border-emerald-500/30 bg-emerald-500/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-emerald-400">Mutual Confirmation Recorded</p>
              <p className="text-xs text-muted-foreground">Pre-contract snapshot created (immutable JSONB) · Governor decision_type = 'mutual_confirmation' · Cannot be undone without mutual cancellation</p>
            </div>
            <Button className="bg-gold-gradient text-sovereign h-8" onClick={() => setActiveTab("contract")}>Proceed to Contract</Button>
          </div>
        </Card>
      )}
    </div>
  );
}

// ============ CONTRACT SIGNING (Phase 3 — Full Implementation) ============
export function ContractSigningScreen({ data }: { data?: Data }) {
  const queryClient = useQueryClient();
  const [clause, setClause] = useState<string | null>(null);
  const [clauseLoading, setClauseLoading] = useState(false);
  const [clauseProvider, setClauseProvider] = useState<string | null>(null);
  const [clauseArticle, setClauseArticle] = useState("Article 4 — SGTX Fee and Non-Custodial Settlement");
  const [showUploadOwn, setShowUploadOwn] = useState(false);
  const [feePaid, setFeePaid] = useState(false);
  const [payingFee, setPayingFee] = useState(false);
  const [deferredFees, setDeferredFees] = useState<Record<string, boolean>>({});
  const [releaseAcknowledged, setReleaseAcknowledged] = useState(false);
  const [buyerSigned, setBuyerSigned] = useState(false);
  const [sellerSigned, setSellerSigned] = useState(false);
  const [signing, setSigning] = useState<"BUYER" | "SELLER" | null>(null);
  const [locking, setLocking] = useState(false);
  const [lockedUstn, setLockedUstn] = useState<string | null>(null);
  const [contractLocked, setContractLocked] = useState(false);
  const [showScheduleMod, setShowScheduleMod] = useState(false);
  // 3B.4.7 Schedule Modification form state
  const [modShipment, setModShipment] = useState("2");
  const [modDate, setModDate] = useState("");
  const [modPort, setModPort] = useState("Bremerhaven (DEBRV)");
  const [modContainerCount, setModContainerCount] = useState(1);
  const [modReason, setModReason] = useState("");
  const [sendingMod, setSendingMod] = useState(false);
  // Legacy fallback IDs — only used when no real QUOTE_ACCEPTED/CONTRACT_SIGNED
  // trade is available from the dashboard. All real flows use `activeUstn` /
  // `activeBuyerGtid` / `activeSellerGtid` derived from `data.tradesAsBuyer`.
  const FALLBACK_TRADE_USTN = "SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4";
  const FALLBACK_BUYER_GTID = "SGTX-DE-TRD-001234-5B6C";
  const FALLBACK_SELLER_GTID = "SGTX-EG-TRD-002139-7F3A";

  // Real contracts ready to sign from dashboard data — Phase 2 → 3 connection.
  // Per the blueprint, only trades with status QUOTE_ACCEPTED (buyer has accepted
  // the seller's quote) or CONTRACT_SIGNED (already locked, awaiting signatures
  // on addenda / milestone setup) should be eligible for the contract signing screen.
  const readyTrades: any[] = (data?.tradesAsBuyer || []).filter(
    (t: any) => t.status === "QUOTE_ACCEPTED" || t.status === "CONTRACT_SIGNED",
  );
  const [selectedUstn, setSelectedUstn] = useState<string>(readyTrades[0]?.ustn || "");
  const activeUstn = selectedUstn || readyTrades[0]?.ustn || FALLBACK_TRADE_USTN;
  const hasRealTrade = readyTrades.length > 0 && !!selectedUstn;
  const activeTrade = readyTrades.find((t) => t.ustn === activeUstn);
  const activeBuyerGtid = activeTrade?.buyerGtid || FALLBACK_BUYER_GTID;
  const activeSellerGtid = activeTrade?.sellerGtid || FALLBACK_SELLER_GTID;

  const sendModificationRequest = async () => {
    if (sendingMod) return;
    if (modReason.trim().length < 20) {
      toast.error("Reason must be ≥20 characters", { description: "Provide a clear justification for the schedule change." });
      return;
    }
    setSendingMod(true);
    try {
      const res = await fetch("/api/sgtx/trade/modify-schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: activeUstn,
          shipmentSequence: Number(modShipment) || undefined,
          newDeliveryDate: modDate || undefined,
          newPort: modPort || undefined,
          containerCount: Number(modContainerCount) || undefined,
          reason: modReason,
          requestedByGtid: activeBuyerGtid,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Request failed");
      toast.success("Modification request sent", {
        description: `Counterparty notified · ${d.changeSummary || "schedule change"}.`,
      });
      setShowScheduleMod(false);
      setModReason("");
      setModDate("");
    } catch (e: any) {
      toast.error("Could not send modification request", { description: e?.message || "Please try again." });
    } finally {
      setSendingMod(false);
    }
  };

  const forge = async () => {
    if (clauseLoading) return;
    setClauseLoading(true);
    try {
      const res = await fetch("/api/sgtx/ai/clause-forge", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ustn: activeUstn, article: clauseArticle }) });
      const d = await res.json(); setClause(d.content); setClauseProvider(d.provider);
    } catch { setClause("Clause generation unavailable."); }
    finally { setClauseLoading(false); }
  };

  // Pay the SGTX fee via real PSP route - activates FeeLock
  const payFee = async () => {
    setPayingFee(true);
    try {
      const res = await fetch("/api/sgtx/payment/pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: activeUstn, stage: "STAGE1", pspProvider: "FAWRY" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Payment failed");
      setFeePaid(true);
      toast.success("Fee paid - FeeLock ACTIVE", {
        description: `Stage 1 · PSP ${d.pspProvider || "FAWRY"} · ${d.processed ? "Processed" : "Queued"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Payment failed", { description: e?.message || "Please try again." });
    } finally {
      setPayingFee(false);
    }
  };

  // Sign contract via real QES route
  const signContract = async (role: "BUYER" | "SELLER") => {
    setSigning(role);
    try {
      const signerGtid = role === "BUYER" ? activeBuyerGtid : activeSellerGtid;
      const res = await fetch("/api/sgtx/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: activeUstn, signerGtid, signerRole: role, signatureType: "QES" }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Signature failed");
      if (role === "BUYER") setBuyerSigned(true);
      else setSellerSigned(true);
      toast.success(`${role} signed via QES`, {
        description: `Legal effect: ${d.legalEffect}. Document hash: ${d.documentHash?.slice(0, 16)}...`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error(`Could not sign as ${role}`, { description: e?.message || "Please try again." });
    } finally {
      setSigning(null);
    }
  };

  // Lock the contract via real route
  const lockContract = async () => {
    setLocking(true);
    try {
      const res = await fetch("/api/sgtx/contract/lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: activeUstn,
          buyerSigned,
          sellerSigned,
          feePaid,
          releaseAcknowledged,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Lock failed");
      setContractLocked(true);
      setLockedUstn(activeUstn);
      toast.success("Contract LOCKED", {
        description: d.message || `USTN ${activeUstn} is now immutable.`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not lock contract", { description: e?.message || "Please try again." });
    } finally {
      setLocking(false);
    }
  };

  const canLock = feePaid && buyerSigned && sellerSigned && releaseAcknowledged;

  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="Contract Signing" subtitle="Phase 3 — Clause Forge (A2) · SGTX Witness Clause · own-contract upload · logistics addenda · fee payment · deferred fees · container release · digital signatures · USTN generation" />

      {/* Empty state — no real QUOTE_ACCEPTED / CONTRACT_SIGNED trade available */}
      {readyTrades.length === 0 && (
        <Card className="p-6 text-center border-amber-500/30 bg-amber-500/5">
          <FileText className="w-6 h-6 mx-auto mb-2 text-amber-400" />
          <p className="text-sm font-semibold text-amber-400">No trades ready for contract signing</p>
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            Trades will appear here once the buyer accepts a seller&apos;s quote (status{" "}
            <span className="font-mono">QUOTE_ACCEPTED</span>) or after the contract is locked
            (status <span className="font-mono">CONTRACT_SIGNED</span>). Visit the Quote Review
            tab to accept a pending quote.
          </p>
        </Card>
      )}

      {/* Trade selector */}
      {readyTrades.length > 0 && (
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <Label className="text-xs whitespace-nowrap">Active Trade</Label>
            <Select value={selectedUstn} onValueChange={setSelectedUstn}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {readyTrades.map((t) => (
                  <SelectItem key={t.ustn} value={t.ustn}>
                    {t.ustn.slice(0, 24)}… · {t.commodity} · {t.status}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {activeTrade && (
              <Badge variant="outline" className="text-[0.6rem] whitespace-nowrap">{activeTrade.status}</Badge>
            )}
          </div>
        </Card>
      )}

      {/* Real trade context banner — replaces the legacy SC-2026-0491 placeholder when real data is available */}
      {hasRealTrade && activeTrade && (
        <Card className="p-4 bg-gold/5 border border-gold/20">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <p className="text-[0.65rem] text-gold uppercase tracking-wide font-semibold">Active contract</p>
              <p className="text-sm font-semibold mt-0.5">
                {activeTrade.commodity} · {activeTrade.incoterm} {activeTrade.destPort}
              </p>
              <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5">{activeTrade.ustn}</p>
            </div>
            <div className="text-right">
              <p className="text-[0.6rem] text-muted-foreground">Trade value</p>
              <p className="text-sm font-semibold">{fmtUsd(activeTrade.tradeValueUsd)}</p>
              <p className="text-[0.6rem] text-gold mt-0.5">SGTX fee {fmtUsd(activeTrade.sgtxFeeUsd || (activeTrade.tradeValueUsd || 0) * 0.015)}</p>
            </div>
          </div>
        </Card>
      )}

      {/* 3B.4.4 Contract Assembly with SGTX Witness Clause */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div><p className="font-semibold text-sm">Sales Contract SC-2026-0491</p><p className="text-[0.65rem] text-muted-foreground">Clause Forge (A2) generated · 312 KB · SHA-256 verified · Status: PENDING_SIGNATURES</p></div>
          <Badge className="bg-amber-500/15 text-amber-400 border-amber-500/30">PENDING SIGNATURES</Badge>
        </div>
        {/* Contract articles preview */}
        <div className="space-y-2 text-xs max-h-40 overflow-y-auto scroll-gold p-3 rounded-lg bg-muted/20 border border-border">
          <p><strong>Article 1 — Parties.</strong> Strawberry Export Co. (SGTX-EG-TRD-002139-7F3A) and European Importer GmbH (SGTX-DE-TRD-001234-5B6C)…</p>
          <p className="mt-2"><strong>Article 2 — Commodity.</strong> 20,000 kg Frozen Strawberries (Senga Sengana, IQF), HS 0811.10.00, Brix ≥ 9.0°…</p>
          <p className="mt-2"><strong>Article 3 — Commercial Terms.</strong> CIF Hamburg (Incoterms 2020). Total USD 105,700. Payment via PSP split…</p>
          <p className="mt-2 bg-gold/5 p-2 rounded border border-gold/20"><strong>Article 4 — SGTX Witness Clause (MANDATORY, NON-REMOVABLE).</strong> The parties acknowledge that SGTX Platform has facilitated the execution of this contract as a non-custodial witness. SGTX is not a party to the underlying trade but provides cryptographic milestone tracking, AI-assisted logistics, and settlement instructions. The platform's fee of 1.5% of the trade value ($1,500) is due upfront before contract lock for single-shipment. The platform's signature serves as evidence of its role as witness and its right to collect the fee.</p>
          <p className="mt-2"><strong>Article 5 — Multi-shipment.</strong> 2 shipments, MSC Amsterdam (16 Apr) and Maersk Levant (22 Apr)…</p>
        </div>

        {/* Clause Forge */}
        <div className="mt-4 p-3 rounded-lg bg-gold/5 border border-gold/20">
          <div className="flex items-center justify-between mb-2"><p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> Clause Forge (A2 · HF local)</p>{clauseProvider && <span className="text-[0.55rem] text-muted-foreground">via {clauseProvider}</span>}</div>
          <div className="flex items-center gap-2 mb-2">
            <select value={clauseArticle} onChange={(e) => { setClauseArticle(e.target.value); setClause(null); }} className="flex-1 bg-muted/50 rounded-lg px-2 py-1.5 text-xs outline-none border border-border">
              <option>Article 4 — SGTX Fee and Non-Custodial Settlement</option>
              <option>Article 6 — Cold Chain Obligations</option>
              <option>Article 7 — Dispute Resolution</option>
              <option>Article 8 — Force Majeure</option>
              <option>SGTX Witness Clause (Full Text)</option>
            </select>
            {!clause && !clauseLoading && <Button size="sm" onClick={forge} className="h-7 bg-gold-gradient text-sovereign">Draft clause</Button>}
          </div>
          {clauseLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Forging clause…</div>
          : clause ? <div className="text-xs text-foreground/90 leading-relaxed whitespace-pre-wrap p-2 rounded-lg bg-background/40">{clause}</div>
          : <p className="text-[0.65rem] text-muted-foreground">Click "Draft clause" to generate a precise legal clause with the AI Clause Forge (🧠 A2).</p>}
        </div>

        {/* 3B.4.5 Upload Own Contract */}
        <div className="mt-4 p-3 rounded-lg bg-muted/20 border border-border">
          <div className="flex items-center justify-between"><p className="text-xs font-semibold">3B.4.5 Upload Own Contract (Optional)</p><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowUploadOwn(!showUploadOwn)}>Upload my own contract</Button></div>
          {showUploadOwn && (
            <div className="mt-2 space-y-2 text-xs">
              <div className="p-3 rounded-lg border-2 border-dashed border-border text-center"><p className="text-muted-foreground">Drop PDF here (max 10 MB)</p><p className="text-[0.55rem] text-muted-foreground mt-1">🧠 A2 (HF Donut) will extract: parties, goods, price, incoterm, governing law, delivery terms, payment terms</p></div>
              <p className="text-[0.6rem] text-amber-400">⚠ Mandatory: You must also sign a separate SGTX FEES Addendum (auto-generated, contains Witness Clause + fee terms). Non-negotiable.</p>
              <p className="text-[0.55rem] text-muted-foreground">Governor validates uploaded contract does not contradict SGTX fee clause. If contradiction → Decision Panel.</p>
            </div>
          )}
        </div>
      </Card>

      {/* 3B.4.6 Logistics Addenda */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.4.6 Logistics Addenda Signing (One Click per Provider)</h3>
        <div className="space-y-2">
          {[{ name: "Delta Freight — Trucking Addendum", status: "SIGNED", provider: "SGTX-EG-LSP-000120-4C7D" }, { name: "Maersk Levant — Ocean B/L Addendum", status: "SIGNED", provider: "SGTX-EG-SHP-000031-9E8F" }, { name: "Cairo Cold Store — Warehousing Addendum", status: "PENDING", provider: "SGTX-EG-LSP-000120-4C7D" }].map((a) => (
            <div key={a.name} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs">
              <FileText className="w-4 h-4 text-muted-foreground" />
              <div className="flex-1 min-w-0"><p className="font-medium">{a.name}</p><p className="text-[0.55rem] text-muted-foreground font-mono">{a.provider}</p></div>
              {a.status === "SIGNED" ? <Badge variant="outline" className="text-emerald-400 border-emerald-500/30 text-[0.6rem]">✓ SIGNED (ZITADEL passkey)</Badge>
              : <div className="flex gap-2"><Badge variant="outline" className="text-amber-400 border-amber-500/30 text-[0.6rem]">PENDING</Badge><Button size="sm" variant="outline" className="h-7 text-xs text-gold">Remind</Button></div>}
            </div>
          ))}
        </div>
        <p className="text-[0.55rem] text-muted-foreground mt-2">Each provider receives Smart Inbox: "Sign logistics addendum for trade USTN …". One click to sign with passkey. Contract cannot proceed until all required providers signed. Addendum includes: USTN placeholder, obligation not to release without SGTX confirmation, USTN+GTID on all docs, penalty clause.</p>
      </Card>

      {/* 3B.4.7 MultiShipment Schedule Modification After Lock */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2"><h3 className="font-semibold text-sm">3B.4.7 MultiShipment Schedule Modification (After Master Lock)</h3><Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setShowScheduleMod(!showScheduleMod)}>Request Modification</Button></div>
        {showScheduleMod && (
          <div className="space-y-2 text-xs">
            <p className="text-muted-foreground">Modify future shipments only (already-locked shipments are immutable). Counterparty receives diff view → Accept/Reject/Counter (1 click each).</p>
            <div className="grid grid-cols-2 gap-2">
              <div><Label className="text-[0.6rem]">Select Shipment</Label><Select value={modShipment} onValueChange={setModShipment}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="2">Shipment 2 (not yet locked)</SelectItem><SelectItem value="3">Shipment 3 (not yet locked)</SelectItem></SelectContent></Select></div>
              <div><Label className="text-[0.6rem]">New Delivery Date</Label><Input type="date" value={modDate} onChange={(e) => setModDate(e.target.value)} className="h-8 text-xs" /></div>
              <div><Label className="text-[0.6rem]">New Port (same country)</Label><Input className="h-8 text-xs" value={modPort} onChange={(e) => setModPort(e.target.value)} /></div>
              <div><Label className="text-[0.6rem]">Container Count</Label><Input type="number" value={modContainerCount} onChange={(e) => setModContainerCount(Number(e.target.value) || 0)} className="h-8 text-xs" /></div>
            </div>
            <div><Label className="text-[0.6rem]">Reason (mandatory, ≥20 chars)</Label><Textarea className="min-h-[40px] text-xs" placeholder="e.g., Buyer requests delay due to warehouse capacity constraints…" value={modReason} onChange={(e) => setModReason(e.target.value)} /></div>
            {modReason.length > 0 && modReason.length < 20 && <p className="text-[0.55rem] text-amber-400">{modReason.length}/20 chars</p>}
            <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={sendModificationRequest} disabled={sendingMod}>
              {sendingMod ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</> : "Send Modification Request"}
            </Button>
            <p className="text-[0.55rem] text-muted-foreground">If accepted: schedule addendum created, signed by both parties (Governor decision). Master contract updated, locked shipments unaffected.</p>
          </div>
        )}
      </Card>

      {/* 3B.4.8 SGTX Fee Payment */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.4.8 SGTX Fee Payment ($1,500 · 1.5%)</h3>
        {!feePaid ? (
          <div className="space-y-3">
            {/* 3B.4.8.3 Deferred Government Fee Payment */}
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Deferred Fee Options (Jurisdiction-Aware)</p>
              <div className="space-y-1.5">
                {[{ fee: "SGTX Platform Fee", amount: "$1,500", deferrable: false }, { fee: "Import duties (DE)", amount: "$5,000", deferrable: true }, { fee: "Customs clearance", amount: "$600", deferrable: false }].map(f => (
                  <div key={f.fee} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{f.fee}</span><span className="font-semibold">{f.amount}</span>
                    {f.deferrable ? <label className="flex items-center gap-1"><input type="checkbox" checked={deferredFees[f.fee] || false} onChange={(e) => setDeferredFees(d => ({ ...d, [f.fee]: e.target.checked }))} className="rounded" /> <span className="text-[0.6rem] text-amber-400">Defer</span></label> : <span className="text-[0.6rem] text-muted-foreground">Due now</span>}
                  </div>
                ))}
              </div>
              {Object.values(deferredFees).some(v => v) && <p className="text-[0.55rem] text-amber-400 mt-1">⚠ Deferred fees held as PSP guarantee (or LC). Auto-triggered on milestone "Customs cleared". Governor blocks container release if guarantee expires.</p>}
            </div>
            {/* 3B.4.8.4 Late fee info */}
            <div className="p-2 rounded-lg bg-muted/20 text-[0.6rem] text-muted-foreground">
              <p>Due: 7 days after contract lock OR 24h after loading confirmation (whichever earlier).</p>
              <p>Late fee: 0.1% of unpaid fee per full day, capped at 100%. Daily cron job. Smart Inbox reminders (priority 90).</p>
            </div>
            <Button onClick={payFee} disabled={payingFee} className="bg-gold-gradient text-sovereign">
              {payingFee ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> Processing PSP payment…</> : <><Banknote className="w-3.5 h-3.5 mr-1.5" /> Pay Fee ($1,500)</>}
            </Button>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> FeeLock ACTIVE · Payment verified via PSP webhook · Fee paid in full. Late fee: $0.</div>
        )}
      </Card>

      {/* 3B.4.9 Container Release Confirmation */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">3B.4.9 Container Release Confirmation</h3>
        {!releaseAcknowledged ? (
          <div className="flex items-center gap-3">
            <p className="text-xs text-muted-foreground flex-1">Release token sent to primary LSP (Delta Freight). Email (co-branded: "Strawberry Export Co. via SGTX") with one-time token (UUID, valid 72h). Provider must acknowledge.</p>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setReleaseAcknowledged(true)}>Simulate Acknowledgment</Button>
          </div>
        ) : <div className="text-xs text-emerald-400 flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Release acknowledged · Token logged · Container can be gated out (CRA API ready)</div>}
      </Card>

      {/* 3B.4.10 Digital Signatures & Contract Lock */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.4.10 Digital Signatures & Contract Lock</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div className={`p-3 rounded-lg border ${buyerSigned ? "bg-emerald-500/5 border-emerald-500/20" : "bg-muted/20 border-border"}`}>
            <p className="text-[0.6rem] text-muted-foreground uppercase">Buyer Signature</p>
            {buyerSigned ? <p className="text-sm font-semibold text-emerald-400 mt-1">✓ Buyer · ZITADEL passkey · QES</p> : <Button size="sm" className="mt-2 bg-gold-gradient text-sovereign h-7" disabled={signing === "BUYER"} onClick={() => signContract("BUYER")}>{signing === "BUYER" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Signing…</> : <><ShieldCheck className="w-3 h-3 mr-1" />Sign with passkey</>}</Button>}
          </div>
          <div className={`p-3 rounded-lg border ${sellerSigned ? "bg-emerald-500/5 border-emerald-500/20" : "bg-gold/5 border-gold/30"}`}>
            <p className="text-[0.6rem] text-gold uppercase">Seller Signature</p>
            {sellerSigned ? <p className="text-sm font-semibold text-emerald-400 mt-1">✓ Seller · ZITADEL passkey · QES</p> : <Button size="sm" className="mt-2 bg-gold-gradient text-sovereign h-7" disabled={signing === "SELLER"} onClick={() => signContract("SELLER")}>{signing === "SELLER" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Signing…</> : <><ShieldCheck className="w-3 h-3 mr-1" />Sign with passkey</>}</Button>}
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border">
            <p className="text-[0.6rem] text-muted-foreground uppercase">Governor Witness</p>
            <p className="text-sm font-semibold text-emerald-400 mt-1">✓ SGTX Governor · Ed25519 · Automatic</p>
          </div>
        </div>
        {contractLocked && lockedUstn ? (
          <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-emerald-400" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-emerald-400">Contract LOCKED</p>
                <p className="text-xs text-muted-foreground">USTN <span className="font-mono text-foreground">{lockedUstn}</span> is now immutable & embedded in all downstream documents.</p>
              </div>
            </div>
            {/* 3B.4.11 Post-Lock Actions */}
            <div className="mt-2 text-[0.6rem] text-muted-foreground">
              <p>✓ USTN appears on all documents · Packing plan USTN FK updated</p>
              <p>✓ Smart Inbox: Seller — "Contract locked – USTN generated. Shipment tracking active."</p>
              <p>✓ Smart Inbox: Buyer — "Contract locked – USTN generated. Awaiting shipment milestones."</p>
              <p>✓ Phase 4 (Financing): Locked contract eligible for financing</p>
              <p>✓ Phase 5 (Execution): USTN + packing plan used for loading, scanning, release</p>
            </div>
          </div>
        ) : canLock ? (
          <div className="p-3 rounded-lg bg-gold/10 border border-gold/30">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-gold" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-gold">Ready to Lock Contract</p>
                <p className="text-xs text-muted-foreground">All 4 conditions met. Lock to make USTN <span className="font-mono text-foreground">{activeUstn}</span> immutable and trigger shipment tracking.</p>
              </div>
              <Button onClick={lockContract} disabled={locking} className="bg-gold-gradient text-sovereign">
                {locking ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Locking…</> : <><Lock className="w-3.5 h-3.5 mr-1.5" />Lock Contract</>}
              </Button>
            </div>
          </div>
        ) : (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-amber-400">
            <p>⚠ Cannot lock contract until: {!feePaid && "Fee paid · "}{!buyerSigned && "Buyer signed · "}{!sellerSigned && "Seller signed · "}{!releaseAcknowledged && "Release acknowledged"}</p>
          </div>
        )}
      </Card>
    </div>
  );
}

// ============ SHIPMENTS & MILESTONES (Phase 5 — Milestone Confirmation) ============
export function ShipmentsMilestoneScreen({ data }: { data: Data }) {
  const queryClient = useQueryClient();
  const tenantGtid = data?.tenant?.gtid;
  // Active trades = CONTRACT_SIGNED or IN_EXECUTION
  const activeTrades: any[] = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])]
    .filter((t: any) => t.status === "CONTRACT_SIGNED" || t.status === "IN_EXECUTION" || t.status === "DELIVERED" || t.status === "SETTLED");
  const [selectedUstn, setSelectedUstn] = useState<string | null>(activeTrades[0]?.ustn || null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const { data: milestonesData, isLoading } = useQuery({
    queryKey: ["milestones", selectedUstn],
    queryFn: async () => {
      if (!selectedUstn) return null;
      const res = await fetch(`/api/sgtx/milestones?ustn=${encodeURIComponent(selectedUstn)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load milestones");
      return d;
    },
    enabled: !!selectedUstn,
    staleTime: 5_000,
  });

  const confirmMilestone = async (milestone: string) => {
    if (!selectedUstn || !tenantGtid) return;
    setConfirming(milestone);
    try {
      const res = await fetch("/api/sgtx/milestone/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: selectedUstn, milestone, confirmedByGtid: tenantGtid }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Confirm failed");
      toast.success(`Milestone confirmed: ${milestone.replace(/_/g, " ")}`, {
        description: `Shipment status: ${d.shipmentStatus?.replace(/_/g, " ") || "updated"}`,
      });
      queryClient.invalidateQueries({ queryKey: ["milestones", selectedUstn] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not confirm milestone", { description: e?.message || "Please try again." });
    } finally {
      setConfirming(null);
    }
  };

  // Find the next PENDING milestone
  const nextPending = milestonesData?.milestoneTimeline?.find((m: any) => m.status === "PENDING")?.milestone || null;

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Shipments & Milestone Tracking"
        subtitle="Phase 5 — Confirm shipment milestones (CONTAINER_LOADED → DELIVERED) · counterparty notified automatically"
      />

      {activeTrades.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No active shipments. Trades with CONTRACT_SIGNED or IN_EXECUTION status will appear here.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Label className="text-xs whitespace-nowrap">Select Trade</Label>
            <Select value={selectedUstn || ""} onValueChange={setSelectedUstn}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Choose a trade" /></SelectTrigger>
              <SelectContent>
                {activeTrades.map((t) => (
                  <SelectItem key={t.ustn} value={t.ustn}>
                    {t.ustn.slice(0, 24)}… · {t.commodity} · {t.status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {selectedUstn && isLoading && (
        <Card className="p-4 text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" /> Loading milestones…
        </Card>
      )}

      {milestonesData && (
        <>
          {/* Trade status summary */}
          <Card className="p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <p className="text-[0.65rem] text-muted-foreground uppercase">Trade Status</p>
                <p className="text-sm font-semibold mt-0.5">
                  <Badge variant="outline" className="text-[0.6rem]">{milestonesData.tradeStatus?.replace(/_/g, " ")}</Badge>
                  <span className="text-[0.65rem] text-muted-foreground ml-2">Phase {milestonesData.phase}</span>
                </p>
              </div>
              <div className="text-xs text-muted-foreground">
                {milestonesData.shipments?.length || 0} shipment(s) · USTN <span className="font-mono">{selectedUstn?.slice(0, 24)}…</span>
              </div>
            </div>
          </Card>

          {/* Milestone timeline */}
          <Card className="p-4">
            <h3 className="font-semibold text-sm mb-3">Milestone Timeline</h3>
            <div className="space-y-2">
              {milestonesData.milestoneTimeline?.map((m: any) => {
                const isPending = m.status === "PENDING";
                const isNext = m.milestone === nextPending;
                const isConfirming = confirming === m.milestone;
                return (
                  <div
                    key={m.milestone}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      m.status === "CONFIRMED"
                        ? "bg-emerald-500/5 border-emerald-500/20"
                        : isNext
                          ? "bg-gold/5 border-gold/30"
                          : "bg-muted/20 border-border"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      m.status === "CONFIRMED" ? "bg-emerald-500/20 text-emerald-400" : "bg-muted text-muted-foreground"
                    }`}>
                      {m.status === "CONFIRMED" ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold">{m.label}</p>
                      <p className="text-[0.6rem] text-muted-foreground">
                        {m.status === "CONFIRMED"
                          ? `Confirmed · ${m.confirmedAt ? new Date(m.confirmedAt).toLocaleString() : "just now"}`
                          : `Expected shipment status: ${m.expectedShipmentStatus.replace(/_/g, " ")}`}
                      </p>
                      {/* Per-shipment status badges */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.shipmentStatuses?.map((s: any, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={`text-[0.5rem] ${s.confirmed ? "text-emerald-400 border-emerald-500/30" : "text-muted-foreground"}`}
                          >
                            Shipment {s.shipmentSequence}: {s.shipmentStatus.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    {isPending && (
                      isNext ? (
                        <Button
                          size="sm"
                          className="h-7 bg-gold-gradient text-sovereign text-xs"
                          disabled={isConfirming}
                          onClick={() => confirmMilestone(m.milestone)}
                        >
                          {isConfirming ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Confirming…</> : "Confirm"}
                        </Button>
                      ) : (
                        <Badge variant="outline" className="text-[0.6rem] text-muted-foreground">Queued</Badge>
                      )
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-[0.6rem] text-muted-foreground mt-3">
              Milestones must be confirmed in order. Counterparty is notified (priority 70 Smart Inbox) on each confirmation.
            </p>
          </Card>
        </>
      )}
    </div>
  );
}

// ============ SETTLEMENT (Phase 6 — Settlement Approval) ============
export function SettlementScreen({ data }: { data: Data }) {
  const queryClient = useQueryClient();
  const tenantGtid = data?.tenant?.gtid;
  // Trades eligible for settlement: IN_EXECUTION or DELIVERED (not yet SETTLED)
  const settlementTrades: any[] = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])]
    .filter((t: any) => t.status === "IN_EXECUTION" || t.status === "DELIVERED" || t.status === "SETTLED");
  const [selectedUstn, setSelectedUstn] = useState<string | null>(settlementTrades[0]?.ustn || null);
  const [approving, setApproving] = useState<string | null>(null);

  const approveSettlement = async (stage: "STAGE1" | "STAGE2") => {
    if (!selectedUstn || !tenantGtid) return;
    setApproving(stage);
    try {
      const res = await fetch("/api/sgtx/settlement/approve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: selectedUstn, approverGtid: tenantGtid, stage }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Approval failed");
      toast.success(`${stage} settlement approved`, {
        description: d.message || `Trade status: ${d.tradeStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not approve settlement", { description: e?.message || "Please try again." });
    } finally {
      setApproving(null);
    }
  };

  // Quick-test via the convenience workflow/advance endpoint
  const advanceWorkflow = async () => {
    if (!selectedUstn || !tenantGtid) return;
    setApproving("WORKFLOW");
    try {
      const res = await fetch("/api/sgtx/workflow/advance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: selectedUstn,
          action: "APPROVE_SETTLEMENT",
          approverGtid: tenantGtid,
          stage: "STAGE2",
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Workflow advance failed");
      toast.success("Workflow advanced", {
        description: d.message || `Trade status: ${d.tradeStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not advance workflow", { description: e?.message || "Please try again." });
    } finally {
      setApproving(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader
        title="FX & Settlement"
        subtitle="Phase 6 — Non-custodial FeeLock release · Stage 1 + Stage 2 approval · CBE integration · PSP split"
      />

      {settlementTrades.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          No trades ready for settlement. Trades with IN_EXECUTION or DELIVERED status will appear here.
        </Card>
      ) : (
        <Card className="p-4">
          <div className="flex items-center gap-3 mb-3">
            <Label className="text-xs whitespace-nowrap">Select Trade</Label>
            <Select value={selectedUstn || ""} onValueChange={setSelectedUstn}>
              <SelectTrigger className="h-8 text-xs flex-1"><SelectValue placeholder="Choose a trade" /></SelectTrigger>
              <SelectContent>
                {settlementTrades.map((t) => (
                  <SelectItem key={t.ustn} value={t.ustn}>
                    {t.ustn.slice(0, 24)}… · {t.commodity} · {t.status.replace(/_/g, " ")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </Card>
      )}

      {selectedUstn && (
        <Card className="p-4 space-y-3">
          <div>
            <p className="text-[0.65rem] text-muted-foreground uppercase">USTN</p>
            <p className="text-xs font-mono mt-0.5">{selectedUstn}</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] text-muted-foreground uppercase">Stage 1 Settlement</p>
              <p className="text-[0.65rem] text-muted-foreground mt-1">Releases Stage 1 FeeLock (origin fees + SGTX fee). Required before milestone confirmation.</p>
              <Button
                size="sm"
                className="mt-2 h-7 bg-gold-gradient text-sovereign text-xs w-full"
                disabled={approving === "STAGE1"}
                onClick={() => approveSettlement("STAGE1")}
              >
                {approving === "STAGE1" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Approving…</> : "Approve Stage 1"}
              </Button>
            </div>

            <div className="p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] text-muted-foreground uppercase">Stage 2 Settlement</p>
              <p className="text-[0.65rem] text-muted-foreground mt-1">Releases Stage 2 FeeLock (ocean freight + destination THC). Marks trade as SETTLED when both stages complete.</p>
              <Button
                size="sm"
                className="mt-2 h-7 bg-gold-gradient text-sovereign text-xs w-full"
                disabled={approving === "STAGE2"}
                onClick={() => approveSettlement("STAGE2")}
              >
                {approving === "STAGE2" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Approving…</> : "Approve Stage 2"}
              </Button>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-gold/5 border border-gold/20">
            <p className="text-[0.65rem] text-gold uppercase font-semibold mb-1">One-click Workflow Advance</p>
            <p className="text-[0.65rem] text-muted-foreground mb-2">Calls <code className="font-mono">POST /api/sgtx/workflow/advance</code> with <code>APPROVE_SETTLEMENT</code> action.</p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs text-gold border-gold/30"
              disabled={approving === "WORKFLOW"}
              onClick={advanceWorkflow}
            >
              {approving === "WORKFLOW" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Advancing…</> : <><RefreshCw className="w-3 h-3 mr-1" />Advance Workflow</>}
            </Button>
          </div>

          <p className="text-[0.6rem] text-muted-foreground">
            Settlement is non-custodial: SGTX never holds funds. The PSP split instruction is executed and the FeeLock state transitions from ACTIVE → RELEASED on approval. Both parties receive a Smart Inbox notification (priority 80) on completion.
          </p>
        </Card>
      )}
    </div>
  );
}

// ============ DISTRESSED CARGO ============
const DISTRESSED_SELLER_GTID = "SGTX-EG-TRD-002139-7F3A";

export function DistressedCargoScreen({ data }: { data: Data }) {
  const queryClient = useQueryClient();

  // ── Declare form state ─────────────────────────────────────────
  const [ustn, setUstn] = useState("SGTX-1397F3A-2345B6C-20260415120000-A1B2C3D4");
  const [commodity, setCommodity] = useState("Frozen Strawberries IQF");
  const [quantityKg, setQuantityKg] = useState(18000);
  const [conditionScore, setConditionScore] = useState(80);
  const [conditionNotes, setConditionNotes] = useState(
    "Cold chain interrupted ~6h during port transhipment. Top pallets show partial thaw; lower pallets intact. Sell-by window shortened to 5 days."
  );
  const [originalValueUsd, setOriginalValueUsd] = useState(24000);
  const [privacyLevel, setPrivacyLevel] = useState<"ANONYMOUS" | "DISCLOSED">("ANONYMOUS");

  const [declaring, setDeclaring] = useState(false);
  const [declareError, setDeclareError] = useState<string | null>(null);
  const [declareResult, setDeclareResult] = useState<any | null>(null);

  // ── Listings query ────────────────────────────────────────────
  const { data: listingsData, isLoading: listingsLoading, error: listingsError } = useQuery({
    queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID],
    queryFn: async () => {
      const res = await fetch(
        `/api/sgtx/distressed/listings?sellerGtid=${encodeURIComponent(DISTRESSED_SELLER_GTID)}`
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Failed to load distressed listings");
      return d as { listings: any[]; count: number };
    },
  });
  const listings: any[] = listingsData?.listings || [];

  // ── Per-listing action state ──────────────────────────────────
  const [assessments, setAssessments] = useState<Record<string, any>>({});
  const [assessingId, setAssessingId] = useState<string | null>(null);
  const [assessError, setAssessError] = useState<Record<string, string>>({});
  const [assessOpenId, setAssessOpenId] = useState<string | null>(null);
  const [outreachPending, setOutreachPending] = useState<Record<string, boolean>>({});
  const [acceptPending, setAcceptPending] = useState<Record<string, boolean>>({});

  // ── Handlers ──────────────────────────────────────────────────
  const handleDeclare = async () => {
    setDeclaring(true);
    setDeclareError(null);
    try {
      const res = await fetch("/api/sgtx/distressed/declare", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tradeId: "SGTX-DEMO-TRADE-001",
          ustn,
          sellerGtid: DISTRESSED_SELLER_GTID,
          commodity,
          quantityKg: Number(quantityKg),
          conditionScore: Number(conditionScore),
          conditionNotes,
          originalValueUsd: Number(originalValueUsd),
          privacyLevel,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Declaration failed");
      setDeclareResult(d);
      toast.success("Distressed cargo declared", {
        description: `AI suggested $${Number(d.suggestedPrice).toLocaleString()} (${d.suggestedDiscountPct}% off · ${d.conditionBand})`,
      });
      queryClient.invalidateQueries({ queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID] });
    } catch (e: any) {
      setDeclareError(e?.message || "Declaration failed");
      toast.error("Could not declare distressed cargo", { description: e?.message || "Please try again." });
    } finally {
      setDeclaring(false);
    }
  };

  const handleAssess = async (listingId: string) => {
    if (assessingId) return;
    setAssessingId(listingId);
    setAssessError((p) => ({ ...p, [listingId]: "" }));
    try {
      const res = await fetch("/api/sgtx/distressed/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Assessment failed");
      setAssessments((p) => ({ ...p, [listingId]: d }));
      setAssessOpenId(listingId);
      toast.success("AI condition assessment complete", {
        description: `Recommended: ${d.recommendedAction} · $${Number(d.dynamicPricing?.suggestedPriceUsd).toLocaleString()}`,
      });
      queryClient.invalidateQueries({ queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID] });
    } catch (e: any) {
      setAssessError((p) => ({ ...p, [listingId]: e?.message || "Assessment failed" }));
      toast.error("AI assessment failed", { description: e?.message });
    } finally {
      setAssessingId(null);
    }
  };

  const handleOutreach = async (listingId: string, privacy: string) => {
    setOutreachPending((p) => ({ ...p, [listingId]: true }));
    try {
      const res = await fetch("/api/sgtx/distressed/outreach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, privacyLevel: privacy }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Outreach failed");
      const count = Number(d.contactedCount ?? 0);
      if (count === 0) {
        toast.warning("Outreach sent — no saved contacts", {
          description: "Add counterparties to your Saved Contacts list to broadcast future distressed listings.",
        });
      } else {
        toast.success(`Accelerated outreach started — ${count} contact${count === 1 ? "" : "s"} notified`, {
          description: `Privacy: ${d.privacyLevel || privacy} · 48h response window`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID] });
    } catch (e: any) {
      toast.error("Could not start outreach", { description: e?.message });
    } finally {
      setOutreachPending((p) => ({ ...p, [listingId]: false }));
    }
  };

  const handleAcceptOffer = async (offerId: string) => {
    setAcceptPending((p) => ({ ...p, [offerId]: true }));
    try {
      const res = await fetch("/api/sgtx/distressed/accept-offer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Accept failed");
      toast.success("Offer accepted — microcontract locked", {
        description: `microUSTN ${(d.microUstn || "").slice(0, 26)}… · fee $${Number(d.distressedFeeUsd).toLocaleString()}`,
      });
      queryClient.invalidateQueries({ queryKey: ["distressed-listings", DISTRESSED_SELLER_GTID] });
    } catch (e: any) {
      toast.error("Could not accept offer", { description: e?.message });
    } finally {
      setAcceptPending((p) => ({ ...p, [offerId]: false }));
    }
  };

  // ── Helpers ───────────────────────────────────────────────────
  const conditionBadge = (score: number) => {
    if (score >= 80) return { color: "#10b981", bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.35)", label: "GOOD" };
    if (score >= 50) return { color: "#f59e0b", bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.35)", label: "FAIR" };
    return { color: "#ef4444", bg: "rgba(239,68,68,0.12)", border: "rgba(239,68,68,0.35)", label: "POOR" };
  };

  const listingStatusColor = (status: string) => {
    switch (status) {
      case "ACTIVE": return "#f59e0b";
      case "TRIAGED": return "#0ea5e9";
      case "OUTREACH": return "#a855f7";
      case "MICROCONTRACT_LOCKED": return "#10b981";
      case "COMPLETED": return "#10b981";
      case "CANCELLED": return "#6b7280";
      default: return "#6b7280";
    }
  };

  // ── Triage path cards ─────────────────────────────────────────
  const triagePaths = [
    {
      key: "SELL",
      icon: DollarSign,
      title: "Sell on Platform",
      desc: "Condition ≥ 50. Discount band applied (10% / 25% / 40% / 60%). Accelerated outreach to saved contacts.",
      accent: "#10b981",
    },
    {
      key: "DONATE",
      icon: HeartHandshake,
      title: "Donate",
      desc: "Condition 30-49. Recovery value limited. Coordinate donation with a recognised charity; document for ESG / tax credit.",
      accent: "#f59e0b",
    },
    {
      key: "ABANDON",
      icon: Trash2,
      title: "Abandon",
      desc: "Condition < 30. Critical. Documented disposal cheaper than continued storage or sale attempts.",
      accent: "#ef4444",
    },
  ];

  return (
    <div className="space-y-4">
      <SectionHeader
        title="Distressed Cargo"
        subtitle="Phase 7 — Declare · AI triage · Accelerated outreach to saved contacts only (non-marketplace)"
      />

      {/* ── Triage Dashboard ────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {triagePaths.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.key} className="p-4 border-l-4" style={{ borderLeftColor: p.accent }}>
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
                     style={{ background: `${p.accent}1a` }}>
                  <Icon className="w-4.5 h-4.5" style={{ color: p.accent }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-display text-sm font-bold text-foreground">{p.title}</p>
                    <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0"
                           style={{ color: p.accent, borderColor: `${p.accent}55` }}>{p.key}</Badge>
                  </div>
                  <p className="text-[0.7rem] text-muted-foreground mt-1 leading-snug">{p.desc}</p>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* ── Two-column: Declare form (left) + Active Listings (right) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* LEFT: Declare form */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-gold" />
            </div>
            <div>
              <h3 className="font-display text-sm font-bold text-foreground">Declare Distressed Cargo</h3>
              <p className="text-[0.65rem] text-muted-foreground">AI condition assessment + dynamic pricing on submit</p>
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <Label className="text-xs">Trade USTN</Label>
              <Input value={ustn} onChange={(e) => setUstn(e.target.value)} className="mt-1 font-mono text-xs h-9" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Commodity</Label>
                <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} className="mt-1 h-9" />
              </div>
              <div>
                <Label className="text-xs">Quantity (kg)</Label>
                <Input
                  type="number"
                  value={quantityKg}
                  onChange={(e) => setQuantityKg(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Condition Score</Label>
                <span className="text-xs font-semibold" style={{ color: conditionBadge(conditionScore).color }}>
                  {conditionScore}/100 · {conditionBadge(conditionScore).label}
                </span>
              </div>
              <Slider
                value={[conditionScore]}
                onValueChange={(v) => setConditionScore(v[0] ?? 0)}
                min={0}
                max={100}
                step={1}
                className="mt-3"
              />
              <div className="flex justify-between text-[0.6rem] text-muted-foreground mt-1">
                <span>0 · Critical</span><span>50 · Fair</span><span>100 · Perfect</span>
              </div>
            </div>

            <div>
              <Label className="text-xs">Condition Notes</Label>
              <Textarea
                value={conditionNotes}
                onChange={(e) => setConditionNotes(e.target.value)}
                rows={3}
                className="mt-1 text-xs"
                placeholder="Describe the deterioration observed, root cause, time window remaining…"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Original Value (USD)</Label>
                <Input
                  type="number"
                  value={originalValueUsd}
                  onChange={(e) => setOriginalValueUsd(Number(e.target.value))}
                  className="mt-1 h-9"
                />
              </div>
              <div>
                <Label className="text-xs">Privacy Level</Label>
                <Select value={privacyLevel} onValueChange={(v: "ANONYMOUS" | "DISCLOSED") => setPrivacyLevel(v)}>
                  <SelectTrigger className="mt-1 h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ANONYMOUS">ANONYMOUS — hide seller ID</SelectItem>
                    <SelectItem value="DISCLOSED">DISCLOSED — reveal seller ID</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <Button
              onClick={handleDeclare}
              disabled={declaring}
              className="w-full bg-gold-gradient text-sovereign font-semibold h-10"
            >
              {declaring ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Declaring…</>
              ) : (
                <><Plus className="w-4 h-4 mr-2" /> Declare Distressed</>
              )}
            </Button>

            {declareError && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{declareError}</span>
              </div>
            )}

            {declareResult && (
              <div className="mt-2 p-4 rounded-lg bg-gold/5 border border-gold/30 space-y-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-gold" />
                  <p className="text-xs font-semibold text-gold uppercase tracking-wider">AI Assessment Complete</p>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">Suggested Price</p>
                    <p className="font-semibold text-foreground">${Number(declareResult.suggestedPrice).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">Discount</p>
                    <p className="font-semibold text-foreground">{declareResult.suggestedDiscountPct}%</p>
                  </div>
                  <div>
                    <p className="text-[0.6rem] text-muted-foreground">Band</p>
                    <p className="font-semibold text-foreground">{declareResult.conditionBand}</p>
                  </div>
                </div>
                <div className="pt-1 border-t border-gold/15">
                  <p className="text-[0.6rem] text-muted-foreground mb-1">Pricing rationale</p>
                  <p className="text-[0.7rem] text-foreground/80 leading-snug">{declareResult.pricingRationale}</p>
                </div>
                <div>
                  <p className="text-[0.6rem] text-muted-foreground mb-1">Condition narrative</p>
                  <p className="text-[0.7rem] text-foreground/80 leading-snug">{declareResult.aiAssessment}</p>
                </div>
                <p className="text-[0.6rem] text-muted-foreground pt-1">
                  Listing ID <span className="font-mono text-foreground/70">{declareResult.listingId}</span> · Privacy {declareResult.privacyLevel}
                </p>
              </div>
            )}
          </div>
        </Card>

        {/* RIGHT: Active Listings */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gold/15 flex items-center justify-center">
                <Package className="w-4 h-4 text-gold" />
              </div>
              <div>
                <h3 className="font-display text-sm font-bold text-foreground">Active Listings</h3>
                <p className="text-[0.65rem] text-muted-foreground">
                  Seller <span className="font-mono">{DISTRESSED_SELLER_GTID}</span>
                </p>
              </div>
            </div>
            {listings.length > 0 && (
              <Badge className="bg-gold/15 text-gold border border-gold/30">{listings.length} active</Badge>
            )}
          </div>

          {listingsLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="w-6 h-6 animate-spin mb-2 text-gold" />
              <p className="text-xs">Loading distressed listings…</p>
            </div>
          ) : listingsError ? (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-xs text-red-400">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">Could not load listings</p>
                <p className="text-[0.7rem] opacity-90">{(listingsError as Error)?.message}</p>
              </div>
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-10 px-4">
              <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                <Package className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium text-foreground">No distressed listings yet</p>
              <p className="text-[0.7rem] text-muted-foreground mt-1 max-w-xs mx-auto">
                Declare cargo as distressed using the form on the left. SGTX will run AI triage, suggest a fair
                discount, and let you start accelerated outreach to your saved contacts.
              </p>
            </div>
          ) : (
            <ScrollArea className="max-h-[640px] pr-3">
              <div className="space-y-3">
                {listings.map((l: any) => {
                  const cb = conditionBadge(Number(l.conditionScore ?? 0));
                  const sc = listingStatusColor(l.status);
                  const assess = assessments[l.id];
                  const aErr = assessError[l.id];
                  const isAssessing = assessingId === l.id;
                  const offers: any[] = l.offers || [];
                  const lockable = l.status === "MICROCONTRACT_LOCKED" || l.status === "COMPLETED";
                  return (
                    <Card key={l.id} className="p-4 border-l-4" style={{ borderLeftColor: cb.color }}>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground truncate">{l.commodity}</p>
                          <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5 truncate">
                            {(l.ustn || "").slice(0, 30)}…
                          </p>
                        </div>
                        <Badge variant="outline" className="text-[0.6rem] px-2 py-0.5 shrink-0"
                               style={{ color: sc, borderColor: `${sc}55` }}>
                          {l.status.replace(/_/g, " ")}
                        </Badge>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                        <div>
                          <p className="text-[0.6rem] text-muted-foreground">Quantity</p>
                          <p className="font-semibold">{fmtKg(l.quantityKg)}</p>
                        </div>
                        <div>
                          <p className="text-[0.6rem] text-muted-foreground">Condition</p>
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[0.65rem] font-semibold"
                                style={{ color: cb.color, background: cb.bg, border: `1px solid ${cb.border}` }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: cb.color }} />
                            {l.conditionScore} · {cb.label}
                          </span>
                        </div>
                        <div>
                          <p className="text-[0.6rem] text-muted-foreground">Original</p>
                          <p className="font-semibold">{fmtUsd(l.originalValueUsd)}</p>
                        </div>
                        <div>
                          <p className="text-[0.6rem] text-muted-foreground">Suggested</p>
                          <p className="font-semibold text-gold">{fmtUsd(l.listingPriceUsd)}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mt-2">
                        <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0">
                          <Lock className="w-2.5 h-2.5 mr-1" />
                          {l.privacyLevel}
                        </Badge>
                        {l.microUstn && (
                          <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0 font-mono">
                            microUSTN {(l.microUstn).slice(0, 20)}…
                          </Badge>
                        )}
                        <Badge variant="outline" className="text-[0.6rem] px-1.5 py-0">
                          <Tag className="w-2.5 h-2.5 mr-1" />
                          {l.offerCount || 0} offer{(l.offerCount || 0) === 1 ? "" : "s"}
                        </Badge>
                      </div>

                      {l.conditionNotes && (
                        <p className="text-[0.65rem] text-muted-foreground mt-2 leading-snug line-clamp-2">
                          {l.conditionNotes}
                        </p>
                      )}

                      {/* AI Assess result (inline expanding section) */}
                      {assess && assessOpenId === l.id && (
                        <div className="mt-3 p-3 rounded-lg bg-gold/5 border border-gold/30 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <p className="text-[0.65rem] font-semibold text-gold uppercase tracking-wider flex items-center gap-1">
                              <Sparkles className="w-3 h-3" /> AI Assessment
                            </p>
                            <button onClick={() => setAssessOpenId(null)}
                                    className="text-[0.6rem] text-muted-foreground hover:text-foreground">✕ close</button>
                          </div>
                          <p className="text-[0.7rem] text-foreground/80 leading-snug">{assess.assessment}</p>
                          <div className="grid grid-cols-3 gap-2 text-[0.7rem] pt-1 border-t border-gold/15">
                            <div>
                              <p className="text-[0.55rem] text-muted-foreground">Action</p>
                              <p className="font-semibold" style={{ color: assess.recommendedAction === "SELL" ? "#10b981" : assess.recommendedAction === "DONATE" ? "#f59e0b" : "#ef4444" }}>
                                {assess.recommendedAction}
                              </p>
                            </div>
                            <div>
                              <p className="text-[0.55rem] text-muted-foreground">Suggested $</p>
                              <p className="font-semibold">{fmtUsd(assess.dynamicPricing?.suggestedPriceUsd)}</p>
                            </div>
                            <div>
                              <p className="text-[0.55rem] text-muted-foreground">Discount</p>
                              <p className="font-semibold">{assess.dynamicPricing?.discountPct}%</p>
                            </div>
                          </div>
                          <p className="text-[0.6rem] text-muted-foreground italic leading-snug pt-1">
                            {assess.dynamicPricing?.rationale}
                          </p>
                        </div>
                      )}
                      {aErr && (
                        <p className="text-[0.65rem] text-red-400 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3" /> {aErr}
                        </p>
                      )}

                      {/* Offers (View Offers) */}
                      {offers.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Offers (top first)</p>
                          {offers.map((o: any) => (
                            <div key={o.id}
                                 className="flex items-center justify-between p-2 rounded-md bg-muted/40 border border-border/60">
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-foreground">{fmtUsd(o.offerAmountUsd)}</p>
                                <p className="text-[0.6rem] text-muted-foreground font-mono truncate">
                                  {o.buyerGtid}
                                  {o.expressNegotiation && <span className="ml-1 text-gold">⚡ EXPRESS</span>}
                                </p>
                              </div>
                              {o.status === "PENDING" && !lockable ? (
                                <Button
                                  size="sm"
                                  onClick={() => handleAcceptOffer(o.id)}
                                  disabled={!!acceptPending[o.id]}
                                  className="bg-gold-gradient text-sovereign h-7 text-xs"
                                >
                                  {acceptPending[o.id] ? (
                                    <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Accepting…</>
                                  ) : (
                                    <><CheckCircle2 className="w-3 h-3 mr-1" /> Accept</>
                                  )}
                                </Button>
                              ) : (
                                <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0"
                                       style={{ color: o.status === "ACCEPTED" ? "#10b981" : o.status === "REJECTED" ? "#ef4444" : "#6b7280",
                                                borderColor: "currentColor" }}>
                                  {o.status}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Action buttons */}
                      <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border/50">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAssess(l.id)}
                          disabled={isAssessing || lockable}
                          className="h-7 text-xs"
                        >
                          {isAssessing ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Assessing…</>
                          ) : (
                            <><Sparkles className="w-3 h-3 mr-1" /> AI Assess</>
                          )}
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleOutreach(l.id, l.privacyLevel || privacyLevel)}
                          disabled={!!outreachPending[l.id] || lockable}
                          className="h-7 text-xs"
                        >
                          {outreachPending[l.id] ? (
                            <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</>
                          ) : (
                            <><Megaphone className="w-3 h-3 mr-1" /> Start Outreach</>
                          )}
                        </Button>
                        <Badge variant="outline" className="h-7 text-[0.65rem] px-2 py-0 flex items-center">
                          <Tag className="w-3 h-3 mr-1" /> {offers.length} offer{offers.length === 1 ? "" : "s"}
                        </Badge>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          )}
        </Card>
      </div>
    </div>
  );
}

// ============ DISPUTES ============
export function DisputesScreen({ data }: { data: Data }) {
  const disputes = data.disputes || [];
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [roots, setRoots] = useState<Record<string, { content: string; provider: string }>>({});
  // 10.5 Mediation log modal state
  const [medOpen, setMedOpen] = useState(false);
  const [medLoading, setMedLoading] = useState(false);
  const [medDispute, setMedDispute] = useState<any | null>(null);
  const [medMessages, setMedMessages] = useState<any[]>([]);

  const analyze = async (disputeId: string) => {
    if (analyzing) return;
    setAnalyzing(disputeId);
    try {
      const res = await fetch("/api/sgtx/ai/dispute-root-cause", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ disputeId }),
      });
      const d = await res.json();
      setRoots((r) => ({ ...r, [disputeId]: { content: d.content, provider: d.provider } }));
    } catch { setRoots((r) => ({ ...r, [disputeId]: { content: "Analysis unavailable.", provider: "static" } })); }
    finally { setAnalyzing(null); }
  };

  // Fetch mediation log (blueprint 10.5) and open the modal
  const openMediation = async (dispute: any) => {
    setMedDispute(dispute);
    setMedOpen(true);
    setMedLoading(true);
    setMedMessages([]);
    try {
      const res = await fetch(`/api/sgtx/disputes/mediation?disputeId=${encodeURIComponent(dispute.id)}`);
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "fetch failed");
      setMedMessages(d.messages || []);
      if ((d.messages || []).length === 0) {
        toast.info("Mediation log opened", { description: "No mediation messages yet — be the first to post." });
      } else {
        toast.success(`Mediation log loaded · ${d.count} messages`);
      }
    } catch (e: any) {
      toast.error("Could not load mediation log", { description: e?.message || "Please try again." });
    } finally {
      setMedLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Disputes" subtitle="Phase 8 — Evidence compiler · Causal inference (A3) · Mediation → Arbitration · FeeLock frozen" action={<Button size="sm" className="bg-gold-gradient text-sovereign"><Gavel className="w-3.5 h-3.5 mr-1.5" />File Dispute</Button>} />
      {disputes.length === 0 ? (
        <Card className="p-8 text-center"><p className="text-sm text-muted-foreground">No open disputes. 🛡 All trades in good standing.</p></Card>
      ) : (
        <div className="space-y-3">
          {disputes.map((d: any) => (
            <Card key={d.id} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status), borderColor: `${statusColor(d.status)}55` }}>{d.status}</Badge>
                    <Badge variant="outline" className="text-[0.6rem]">{d.type.replace(/_/g, " ")}</Badge>
                    <span className="text-[0.6rem] text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 22)}…</span>
                  </div>
                  <p className="text-sm text-foreground">{d.description}</p>
                  {(roots[d.id] || d.aiRootCause) && (
                    <div className="mt-2 p-2.5 rounded-lg bg-gold/5 border border-gold/20">
                      <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1 mb-1"><Sparkles className="w-3 h-3" /> AI Root Cause (A3) {roots[d.id] && <span className="text-muted-foreground normal-case tracking-normal">· via {roots[d.id].provider}</span>}</p>
                      <p className="text-xs text-foreground/90">{roots[d.id]?.content || d.aiRootCause}</p>
                    </div>
                  )}
                  {d.resolution && <p className="text-xs text-emerald-400 mt-2">✓ {d.resolution}</p>}
                  <div className="flex items-center gap-4 mt-2 text-[0.65rem] text-muted-foreground"><span>Claim: {fmtUsd(d.claimAmountUsd)}</span><span>Evidence: {d.evidenceCount} items</span><span>Filed {fmtDate(d.createdAt)}</span></div>
                  {d.status !== "RESOLVED" && !roots[d.id] && !d.aiRootCause && (
                    <button onClick={() => analyze(d.id)} disabled={analyzing === d.id} className="mt-2 text-[0.65rem] text-gold hover:underline disabled:opacity-50 flex items-center gap-1">
                      {analyzing === d.id ? <><Loader2 className="w-3 h-3 animate-spin" /> Analyzing root cause…</> : <>🧠 Run causal analysis (A3)</>}
                    </button>
                  )}
                </div>
                {d.status !== "RESOLVED" && <Button size="sm" variant="outline" className="h-7" onClick={() => openMediation(d)}>Open Mediation</Button>}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Mediation log modal (blueprint 10.5) */}
      {medOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Mediation log">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMedOpen(false)} />
          <Card className="relative z-10 w-full max-w-2xl max-h-[80vh] flex flex-col p-0 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <div>
                <h3 className="font-semibold text-sm flex items-center gap-2"><Gavel className="w-4 h-4 text-gold" /> Mediation Log</h3>
                <p className="text-[0.65rem] text-muted-foreground">
                  {medDispute?.type?.replace(/_/g, " ")} · Claim {fmtUsd(medDispute?.claimAmountUsd || 0)} · USTN {medDispute?.trade?.ustn?.slice(0, 22)}…
                </p>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setMedOpen(false)}>✕</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 scroll-gold">
              {medLoading ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground py-6 justify-center">
                  <Loader2 className="w-3 h-3 animate-spin" /> Loading mediation log…
                </div>
              ) : medMessages.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-6">No mediation messages yet. Use the dispute API to post the first AI proposal.</p>
              ) : (
                medMessages.map((m: any) => (
                  <div key={m.id} className={`p-2.5 rounded-lg text-xs ${m.senderRole === "AI_MEDIATOR" || m.senderRole === "GOVERNOR" ? "bg-gold/5 border border-gold/20" : "bg-muted/30"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-foreground">{m.senderName}</span>
                      <span className="text-[0.55rem] text-muted-foreground uppercase">{m.messageType?.replace(/_/g, " ")}</span>
                    </div>
                    {m.messageText && <p className="text-foreground/90">{m.messageText}</p>}
                    {m.offerAmountUsd != null && <p className="text-gold font-semibold mt-1">Offer: {fmtUsd(m.offerAmountUsd)}</p>}
                    <p className="text-[0.55rem] text-muted-foreground mt-1">{fmtDate(m.createdAt)} · {m.sentimentFlag || "neutral"}</p>
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ============ COMPLIANCE ============
export function ComplianceScreen({ data }: { data: Data }) {
  const t = data.tenant;
  return (
    <div className="space-y-4">
      <SectionHeader title="Compliance & KYB" subtitle="Egyptian PDPL (Law 151/2020) · Sanctions · Consent management" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">KYB Status</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Tier</span><span className="font-semibold">{t?.kybTier} / 3</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Lifecycle</span><span className="text-emerald-400">{t?.lifecycleState}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sanctions</span><span className="text-emerald-400">✓ Cleared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GNN proximity</span><span className="text-emerald-400">&gt; 2 hops</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">PQC signatures</span><span className="text-emerald-400">Dilithium3</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Consent (PDPL)</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">GTID resolution</span><span className="text-emerald-400">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Trust score sharing</span><span className="text-emerald-400">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bank details</span><span className="text-muted-foreground">Not shared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cross-border</span><span className="text-emerald-400">EG → DE allowed</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Regulatory Reports</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">Nafeza filings</span><span className="font-semibold">12 this month</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">ETA invoices</span><span className="font-semibold">18 this month</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">CBE FX reports</span><span className="font-semibold">Auto-linked</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">NFSA certs</span><span className="font-semibold">3 active</span></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============ AUDIT TRAIL ============
export function AuditScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Trail" subtitle="Loom chain · RLS-filtered · immutable · quantum-safe archival (PQC)" />
      <Card className="p-4">
        <div className="space-y-1">
          {data.activities?.map((a: any, i: number) => (
            <div key={a.id} className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/20 text-xs">
              <span className="font-mono text-[0.6rem] text-muted-foreground mt-0.5 w-8 text-right">#{String(data.activities.length - i).padStart(4, "0")}</span>
              <div className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0" style={{ background: a.type === "SUCCESS" ? "#10b981" : a.type === "WARNING" ? "#fbbf24" : a.type === "CRITICAL" ? "#f87171" : "#60a5fa" }} />
              <div className="flex-1">
                <p className="text-foreground">{a.description}</p>
                <p className="text-[0.6rem] text-muted-foreground">{a.actor?.legalName || "System"} · {fmtDate(a.createdAt)} · hash {a.id.slice(0, 12)}…</p>
              </div>
              <Lock className="w-3 h-3 text-muted-foreground mt-1" />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ============ COMPANY ADMIN ============
export function CompanyAdminScreen({ data }: { data: Data }) {
  return (
    <div className="space-y-4">
      <SectionHeader title="Company Admin" subtitle="Employees · Roles · Data scopes · Approval chains · Branding · Exit Centre" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Employees</h3>
          <div className="space-y-1.5">
            {data.tenant?.employees?.map((e: any) => (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/30">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: e.avatarColor || "#475569" }}>{e.fullName.charAt(0)}</div>
                <div className="flex-1 min-w-0"><p className="text-xs font-medium truncate">{e.fullName}</p><p className="text-[0.6rem] text-muted-foreground truncate">{e.email}</p></div>
                <Badge variant="outline" className="text-[0.6rem]">{e.role}</Badge>
                {e.allowRoleSwitching && <Badge className="text-[0.6rem] bg-gold/15 text-gold">Switch</Badge>}
              </div>
            ))}
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Approval Chains</h3>
          <div className="space-y-2 text-xs">
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Contract signing</p><p className="text-[0.65rem] text-muted-foreground">Owner → (auto) Governor</p></div>
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Payment &gt; $50k</p><p className="text-[0.65rem] text-muted-foreground">Operator → Owner → QES</p></div>
            <div className="p-2 rounded-lg bg-muted/20"><p className="font-medium">Dispute filing</p><p className="text-[0.65rem] text-muted-foreground">Any role → Owner approval</p></div>
          </div>
        </Card>
      </div>
    </div>
  );
}

// ============ FINANCING SCREENS (Phase 4) ============
// All financing screens have been moved to src/components/sgtx/financing-screens.tsx
// Exports: FinancingBorrowerScreen, FinancingOpportunitiesScreen,
//          FinancierPortfolioScreen, FinancierPreferencesScreen

// ============ LAB: Test Requests / Queue / Reports ============
export function LabScreens({ data, tab }: { data: Data; tab: string }) {
  const tests = data.labTests || [];
  if (tab === "requests" || tab === "queue") {
    return (
      <div className="space-y-4">
        <SectionHeader title={tab === "requests" ? "Test Requests" : "Sampling Queue"} subtitle="Receive USTN-linked test requests · perform sampling · release reports" />
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="font-semibold text-sm">{tests.length} tests</h3></div>
          <div className="divide-y divide-border/40">
            {tests.map((t: any) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 flex items-center justify-center"><FlaskConical className="w-4 h-4 text-emerald-400" /></div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">{t.testType.replace(/_/g, " ")} · {t.sampleRef}</p>
                  <p className="text-[0.6rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 22)}… · {t.trade?.seller?.legalName}</p>
                </div>
                <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(t.status), borderColor: `${statusColor(t.status)}55` }}>{t.status}</Badge>
                {t.status === "COMPLETED" ? <Button size="sm" variant="outline" className="h-7">View Report</Button> : <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Start</Button>}
              </div>
            ))}
            {tests.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tests in queue.</p>}
          </div>
        </Card>
      </div>
    );
  }
  // reports
  return (
    <div className="space-y-4">
      <SectionHeader title="Reports & Results" subtitle="USTN-linked · pass/fail · MRL comparison · PDF/A-3 export" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {tests.filter((t: any) => t.status === "COMPLETED").map((t: any) => (
          <Card key={t.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{t.testType.replace(/_/g, " ")}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 22)}…</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(t.passFail), borderColor: `${statusColor(t.passFail)}55` }}>{t.passFail}</Badge>
            </div>
            <p className="text-xs text-muted-foreground">{t.result}</p>
            {t.parameters && (
              <div className="mt-2 p-2 rounded-lg bg-muted/20 text-[0.65rem] space-y-0.5">
                {Object.entries(JSON.parse(t.parameters)).map(([k, v]: any) => <div key={k} className="flex justify-between"><span className="text-muted-foreground capitalize">{k}</span><span>{v}</span></div>)}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}

// ============ QC: Schedule / Field / Reports ============
export function QcScreens({ data, tab }: { data: Data; tab: string }) {
  const insp = data.qcInspections || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "schedule" ? "Inspection Schedule" : tab === "field" ? "Field Inspections" : "QC Reports"} subtitle="Pre-shipment · loading · discharge · conditional pass with action plan" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {insp.map((q: any) => (
          <Card key={q.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{q.inspectionType.replace(/_/g, " ")}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{q.trade?.ustn?.slice(0, 22)}… · {q.trade?.seller?.legalName}</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(q.result || q.status), borderColor: `${statusColor(q.result || q.status)}55` }}>{q.result || q.status}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><p className="text-[0.6rem] text-muted-foreground">Inspector</p><p className="font-medium">{q.inspectorName}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Defects</p><p className="font-medium">{q.defectCount}</p></div>
            </div>
            {q.notes && <p className="text-xs text-muted-foreground mt-2">{q.notes}</p>}
            {q.actionPlan && <p className="text-xs text-amber-400 mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Action plan: {q.actionPlan}</p>}
          </Card>
        ))}
        {insp.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-2">No inspections.</Card>}
      </div>
    </div>
  );
}

// ============ CBR: Declarations / Certificates / Clearance ============
export function CbrScreens({ data, tab }: { data: Data; tab: string }) {
  const decls = data.customsDecls || [];
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "declarations" ? "Customs Declarations (Nafeza)" : tab === "certificates" ? "Certificates of Origin" : "Clearance Status"} subtitle="File SAD via Nafeza · EUR.1 · idempotency keys · mTLS" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {decls.map((d: any) => (
            <div key={d.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <div className="w-9 h-9 rounded-lg bg-amber-500/15 flex items-center justify-center"><Landmark className="w-4 h-4 text-amber-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">{d.regime} · {d.declarationNo}</p>
                <p className="text-[0.6rem] text-muted-foreground font-mono">{d.trade?.ustn?.slice(0, 22)}… · {d.trade?.seller?.legalName} → {d.trade?.buyer?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">Nafeza: {d.nafezaStatus}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status), borderColor: `${statusColor(d.status)}55` }}>{d.status}</Badge>
            </div>
          ))}
          {decls.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No declarations.</p>}
        </div>
      </Card>
    </div>
  );
}

// ============ SHIP: Vessels / Containers / B/L ============
export function ShipScreens({ data, tab }: { data: Data; tab: string }) {
  const shipments = data.shipmentsCarrier || [];
  const [issuingId, setIssuingId] = useState<string | null>(null);
  const [issuedBLs, setIssuedBLs] = useState<Record<string, { blNumber: string; hashSha256: string }>>({});
  const queryClient = useQueryClient();
  const tenant = data?.tenant;

  const issueBL = async (s: any) => {
    if (issuingId) return;
    setIssuingId(s.id);
    try {
      const res = await fetch("/api/sgtx/ship/bl-issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          shipmentId: s.id,
          ustn: s.trade?.ustn,
          tradeId: s.tradeId,
          carrierGtid: s.carrierGtid,
          issuerGtid: tenant?.gtid || s.carrierGtid,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Issue failed");
      setIssuedBLs((m) => ({ ...m, [s.id]: { blNumber: d.blNumber, hashSha256: d.hashSha256 } }));
      toast.success(`B/L ${d.blNumber} issued`, {
        description: `Hash ${d.hashSha256?.slice(0, 22)}… · USTN ${(d.ustn || "").slice(0, 22)}…`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not issue B/L", { description: e?.message || "Please try again." });
    } finally {
      setIssuingId(null);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "vessels" ? "Vessel Fleet" : tab === "containers" ? "Container Release Authorisation (CRA)" : tab === "bl" ? "Bill of Lading" : "Schedules & AIS"} subtitle="mTLS digital signatures · terminal integration · AIS tracking" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {shipments.map((s: any) => (
          <Card key={s.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <div><p className="text-sm font-semibold">{s.vesselName || "TBD"} · Shipment {s.sequence}</p><p className="text-[0.6rem] text-muted-foreground font-mono">{s.trade?.ustn?.slice(0, 22)}…</p></div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status), borderColor: `${statusColor(s.status)}55` }}>{s.status.replace(/_/g, " ")}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mt-2">
              <div><p className="text-[0.6rem] text-muted-foreground">Container</p><p className="font-mono">{s.containerNo}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">IMO</p><p className="font-mono">{s.vesselImo}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Position</p><p className="font-mono">{s.lat?.toFixed(2)}, {s.lng?.toFixed(2)}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">ETA</p><p>{fmtDate(s.eta)}</p></div>
            </div>
            {tab === "containers" && s.status === "ARRIVED" && (
              <Button size="sm" className="w-full mt-3 bg-gold-gradient text-sovereign h-7"><ShieldCheck className="w-3 h-3 mr-1" />Authorise Release (CRA)</Button>
            )}
            {tab === "bl" && (
              issuedBLs[s.id] ? (
                <div className="w-full mt-3 p-2 rounded-lg bg-emerald-500/5 border border-emerald-500/20 text-xs">
                  <p className="text-emerald-400 font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> B/L Issued: <span className="font-mono">{issuedBLs[s.id].blNumber}</span></p>
                  <p className="text-[0.6rem] text-muted-foreground font-mono mt-0.5">{issuedBLs[s.id].hashSha256?.slice(0, 32)}…</p>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full mt-3 h-7"
                  onClick={() => issueBL(s)}
                  disabled={issuingId === s.id}
                >
                  {issuingId === s.id ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Issuing…</> : <><FileText className="w-3 h-3 mr-1" />Issue B/L</>}
                </Button>
              )
            )}
          </Card>
        ))}
        {shipments.length === 0 && <Card className="p-8 text-center text-sm text-muted-foreground col-span-2">No shipments assigned.</Card>}
      </div>
    </div>
  );
}

// ============ LSP: Assignments / Milestones / Addenda ============
export function LspScreens({ data, tab }: { data: Data; tab: string }) {
  const shipments = data.shipmentsCarrier || [];
  const tenantGtid = data?.tenant?.gtid;

  // Phase 2 → LSP connection: fetch pending service quotations (RFQs) targeting this provider.
  // Sellers send RFQs for trucking / forwarding / warehouse services when they
  // configure logistics Mode A/B during quote preparation.
  const { data: quotationsData, isLoading: quotationsLoading } = useQuery({
    queryKey: ["lsp-rfq-inbox", tenantGtid],
    queryFn: async () => {
      if (!tenantGtid) return { quotes: [] as any[], total: 0 };
      try {
        const r = await fetch(
          `/api/sgtx/providers/quotations?providerGtid=${encodeURIComponent(tenantGtid)}&status=PENDING`,
        );
        if (!r.ok) return { quotes: [], total: 0 };
        return r.json();
      } catch {
        return { quotes: [], total: 0 };
      }
    },
    enabled: !!tenantGtid && tab === "assignments",
    staleTime: 30_000,
  });

  const pendingRfqs: any[] = quotationsData?.quotes || [];

  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "assignments" ? "Assignments & RFQ Inbox" : tab === "milestones" ? "Milestone Confirmation" : tab === "addenda" ? "Logistics Addenda" : "Fleet & Drivers"} subtitle="Container pickup · trucking · milestone confirmations · offline-capable driver app" />

      {tab === "assignments" && (
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-2">
            <div>
              <h3 className="font-semibold text-sm flex items-center gap-2">
                <Inbox className="w-4 h-4 text-gold" />
                Pending RFQs
              </h3>
              <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                Service-quotations from sellers awaiting your response
              </p>
            </div>
            <Badge variant="outline" className="text-[0.6rem] text-gold border-gold/30">
              {pendingRfqs.length} pending RFQ{pendingRfqs.length === 1 ? "" : "s"}
            </Badge>
          </div>
          <div className="divide-y divide-border/40">
            {quotationsLoading ? (
              <div className="px-4 py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> Loading RFQs…
              </div>
            ) : pendingRfqs.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No pending RFQs. When a seller requests a service quotation during quote preparation, it will appear here.
              </p>
            ) : (
              pendingRfqs.map((q: any) => (
                <div key={q.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
                  <div className="w-9 h-9 rounded-lg bg-gold/15 flex items-center justify-center">
                    <ClipboardList className="w-4 h-4 text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">
                      {q.serviceType?.replace(/_/g, " ") || "Service"} · {q.quoteId}
                    </p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">
                      USTN {q.ustn?.slice(0, 22) || "—"}…
                    </p>
                    <p className="text-[0.6rem] text-muted-foreground">
                      {q.trade?.commodity || "—"} · requested {fmtDate(q.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[0.6rem] text-muted-foreground">Fee</p>
                    <p className="text-xs font-semibold text-gold">{fmtUsd(q.feeUsd || 0)}</p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem] text-amber-400 border-amber-500/30">
                    {q.status}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Active Assignments</h3>
          <p className="text-[0.6rem] text-muted-foreground mt-0.5">Containers assigned to your fleet</p>
        </div>
        <div className="divide-y divide-border/40">
          {shipments.map((s: any) => (
            <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30">
              <div className="w-9 h-9 rounded-lg bg-orange-500/15 flex items-center justify-center"><Package className="w-4 h-4 text-orange-400" /></div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Container {s.containerNo} · {s.vesselName}</p>
                <p className="text-[0.6rem] text-muted-foreground font-mono">{s.trade?.ustn?.slice(0, 22)}… · {s.trade?.seller?.legalName}</p>
                <p className="text-[0.6rem] text-muted-foreground">{s.originPort} → {s.destPort} · ETA {fmtDate(s.eta)}</p>
              </div>
              <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status), borderColor: `${statusColor(s.status)}55` }}>{s.status.replace(/_/g, " ")}</Badge>
              {tab === "milestones" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Confirm</Button>}
            </div>
          ))}
          {shipments.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No assignments.</p>}
        </div>
      </Card>
      {tab === "assignments" && shipments.length > 0 && (
        <LoadingGuideWidget commodity={shipments[0].trade?.commodity || "Frozen Strawberries"} containerCount={shipments[0].containerCount || 1} coldChain={shipments[0].trade?.coldChain || false} />
      )}
    </div>
  );
}

// ============ GOV: Trade Flow / Customs / FX / Food Safety ============
export function GovScreens({ data, tab }: { data: Data; tab: string }) {
  // GOV tenant is typically not a buyer or seller of any trade — fetch real trades
  // from the broad /api/sgtx/trade/list endpoint (Phase 2 → GOV monitoring connection).
  // Falls back to dashboard trades if the GOV tenant is also a trade party (rare).
  const dashboardTrades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];
  const tenantGtid = data?.tenant?.gtid;

  const { data: tradeListData, isLoading: tradesLoading } = useQuery({
    queryKey: ["gov-trade-list", tenantGtid],
    queryFn: async () => {
      try {
        const r = await fetch(`/api/sgtx/trade/list?limit=100${tenantGtid ? `&tenant=${encodeURIComponent(tenantGtid)}` : ""}`);
        if (!r.ok) return { trades: [] as any[], total: 0 };
        return r.json();
      } catch {
        return { trades: [], total: 0 };
      }
    },
    staleTime: 30_000,
  });

  // Use dashboard trades if present, otherwise fall back to the broad trade list.
  const trades: any[] = dashboardTrades.length > 0
    ? dashboardTrades
    : (tradeListData?.trades || []);

  if (tab === "integrations") {
    return (
      <div className="space-y-4">
        <SectionHeader title="External Integrations Health" subtitle="Nafeza · CargoX · ETA · PSPs · CBE · AIS — real-time monitoring" />
        <IntegrationsFull />
        <InferenceLogScreen />
      </div>
    );
  }
  if (tab === "fx") {
    return (
      <div className="space-y-4">
        <SectionHeader title="FX & Settlement (CBE)" subtitle="Cross-border flow monitoring · USTN-linked · reconcile every dollar/pound" />
        <ExecutiveCards cards={[
          { label: "Inbound FX (30d)", value: fmtUsd(trades.reduce((s, t) => s + (t.tradeValueUsd || 0), 0)), icon: DollarSign, accent: "#10b981", trend: trades.length ? "+live" : undefined },
          { label: "Outbound FX (30d)", value: fmtUsd(trades.reduce((s, t) => s + (t.sgtxFeeUsd || 0), 0)), icon: DollarSign, accent: "#fbbf24" },
          { label: "Pending Reconciliation", value: String(trades.filter((t) => t.status !== "SETTLED").length), icon: Clock, accent: "#60a5fa" },
          { label: "AML Flags", value: "0", icon: ShieldCheck, accent: "#10b981" },
        ]} />
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Recent Cross-border Flows</h3>
          <div className="space-y-2 max-h-96 overflow-y-auto scroll-gold">
            {trades.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-8">
                No cross-border flows recorded yet. Trades will appear here as they move through SGTX.
              </p>
            ) : trades.map((t) => (
              <div key={t.id} className="flex items-center gap-3 p-2 rounded-lg bg-muted/20 text-xs">
                <span className="font-mono text-[0.6rem] text-muted-foreground flex-1 truncate">{t.ustn.slice(0, 24)}…</span>
                <span>{t.originCountry} → {t.destCountry}</span>
                <span className="font-semibold">{fmtUsd(t.tradeValueUsd)}</span>
                <Badge variant="outline" className="text-[0.6rem]">{t.status === "SETTLED" ? "RECONCILED" : t.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    );
  }
  if (tab === "food-safety") {
    return (
      <div className="space-y-4">
        <SectionHeader title="Food Safety (NFSA)" subtitle="Phytosanitary · health certificates · lab report oversight" />
        <Card className="p-4"><h3 className="font-semibold text-sm mb-3">Active Certificates</h3><div className="space-y-2 text-xs">
          {[{ t: "Phytosanitary — Strawberries", s: "ISSUED" }, { t: "Health Certificate HC-118", s: "ISSUED" }, { t: "Cold Treatment Certificate", s: "PENDING" }].map((c) => (
            <div key={c.t} className="flex items-center justify-between p-2 rounded-lg bg-muted/20"><span>{c.t}</span><Badge variant="outline" className="text-[0.6rem]">{c.s}</Badge></div>
          ))}
        </div></Card>
      </div>
    );
  }
  if (tab === "customs") {
    return (
      <div className="space-y-4">
        <SectionHeader title="Customs Assessment" subtitle="Nafeza declarations · assess · clear · hold" />
        <Card className="p-4"><p className="text-xs text-muted-foreground">View and assess all declarations filed via Nafeza. Each is USTN-linked for full traceability.</p></Card>
      </div>
    );
  }
  // trade-flow (default)
  return (
    <div className="space-y-4">
      <SectionHeader title="National Trade Flow" subtitle="Real-time visibility of every cross-border trade moving through SGTX" />
      {tradesLoading && dashboardTrades.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-4 h-4 animate-spin text-gold" /> Loading live trade monitor…
        </Card>
      ) : (
        <>
          <ExecutiveCards cards={[
            { label: "Active Trades", value: String(trades.length), icon: Globe2, accent: "#b45309" },
            { label: "Total Value", value: fmtUsd(trades.reduce((s, t) => s + t.tradeValueUsd, 0)), icon: DollarSign, accent: "#15803d" },
            { label: "Customs Cleared", value: String(trades.filter((t) => t.phase >= 5).length), icon: CheckCircle2, accent: "#10b981" },
            { label: "Revenue Collected", value: fmtUsd(trades.reduce((s, t) => s + (t.sgtxFeeUsd || 0), 0)), icon: Landmark, accent: "#ca8a04" },
          ]} />
          {trades.length === 0 ? (
            <Card className="p-8 text-center text-sm text-muted-foreground">
              <Globe2 className="w-6 h-6 mx-auto mb-2 text-muted-foreground/50" />
              No live trades to display.
              <p className="text-[0.65rem] mt-1">
                Trades will appear here in real time as buyers and sellers submit trade requests through SGTX.
              </p>
            </Card>
          ) : (
            <ShipmentsVault trades={trades} role="gov" title="All Tracked Trades" />
          )}
        </>
      )}
    </div>
  );
}

function IntegrationsFull() {
  const { data: integ } = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/sgtx/integrations")).json() });
  if (!integ) return <Card className="p-8 text-center text-sm text-muted-foreground">Loading integrations…</Card>;
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {integ.map((i: any) => {
        const color = statusColor(i.status);
        return (
          <Card key={i.id} className="p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-semibold text-sm">{i.name}</h3>
              <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold" style={{ color, background: `${color}1a` }}>{i.status}</span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div><p className="text-[0.6rem] text-muted-foreground">Latency</p><p className="font-semibold">{i.latencyMs}ms</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Error rate</p><p className="font-semibold">{i.errorRate}%</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Uptime 30d</p><p className="font-semibold">{i.uptime30d}%</p></div>
            </div>
            <p className="text-[0.6rem] text-muted-foreground mt-2">{i.lastIncident}</p>
          </Card>
        );
      })}
    </div>
  );
}

// ============ MAIN DISPATCHER ============
export function PortalContent({ portal, data }: { portal: PortalConfig; data: Data }) {
  const tab = data._activeTab || portal.tabs[0].id;
  const trades = [...(data.tradesAsBuyer || []), ...(data.tradesAsSeller || [])];

  // Universal screens (shared across portals)
  if (tab === "command") return <CommandCenter portal={portal} data={data} />;
  if (tab === "shipments") return <div className="space-y-4"><SectionHeader title={portal.id.includes("seller") ? "Outbound Shipments" : "Shipments"} subtitle="Shared Shipments Vault · click any USTN to open the Trade Command Center" /><ShipmentsVault trades={trades} role={portal.id.includes("buyer") ? "buyer" : "seller"} /></div>;
  if (tab === "documents") return <div className="space-y-4"><SectionHeader title="Documents" subtitle="USTN-linked · PDF/A-3 · verify · upload · request" /><DocumentsList documents={trades.flatMap((t: any) => t.documents || [])} /></div>;
  if (tab === "invoices") return <div className="space-y-4"><SectionHeader title="Invoices & Payments" subtitle="ETA-compliant XML · PSP split · non-custodial FeeLock" /><InvoicesList invoices={data.invoices || []} perspective={portal.id.includes("seller") ? "payee" : "payer"} /></div>;
  if (tab === "milestones") return <ShipmentsMilestoneScreen data={data} />;
  if (tab === "settlement") return <SettlementScreen data={data} />;
  if (tab === "audit") return <AuditScreen data={data} />;
  if (tab === "admin") return <CompanyAdminScreen data={data} />;
  if (tab === "compliance") return <ComplianceScreen data={data} />;
  if (tab === "disputes") return <DisputesScreen data={data} />;
  if (tab === "distressed") return <DistressedCargoScreen data={data} />;
  if (tab === "network") return <NetworkScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "readiness") return <ReadinessScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "lifecycle") return <LifecycleScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "org-graph") return <OrgGraphScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "passport") return <TrustPassportScreen tenantGtid={portal.defaultTenantGtid} />;

  // Trader-buyer specific
  if (portal.id === "trader-buyer") {
    if (tab === "new-trade") return <NewTradeRequestScreen />;
    if (tab === "quotes") return <QuoteReviewScreen data={data} />;
    if (tab === "contract") return <ContractSigningScreen data={data} />;
    if (tab === "financing") return <FinancingBorrowerScreen />;
  }

  // Trader-seller specific
  if (portal.id === "trader-seller") {
    if (tab === "requests") return <SellerPendingRequestsScreen data={data} />;
    if (tab === "quote-builder") return <QuoteBuilderScreen />;
    if (tab === "contract") return <ContractSigningScreen data={data} />;
    if (tab === "financing") return <FinancingBorrowerScreen />;
  }

  // LSP
  if (portal.id === "lsp") {
    if (["assignments", "milestones", "addenda", "fleet"].includes(tab)) return <LspScreens data={data} tab={tab} />;
    if (tab === "dispatch-planner") return <DispatchPlannerScreen tenantGtid={portal.defaultTenantGtid} data={data} />;
    if (tab === "warehouse") return <WarehouseDashboardScreen data={data} />;
    if (tab === "performance") return <ProviderPerformanceScreen providerGtid={portal.defaultTenantGtid} />;
  }

  // SHIP
  if (portal.id === "ship") {
    if (["vessels", "containers", "bl", "schedules"].includes(tab)) return <ShipScreens data={data} tab={tab} />;
    if (tab === "booking-requests") return <BookingRequestsScreen tenantGtid={portal.defaultTenantGtid} />;
    if (tab === "contract-rates") return <ContractRateManagerScreen data={data} />;
    if (tab === "performance") return <ProviderPerformanceScreen providerGtid={portal.defaultTenantGtid} />;
  }

  // LAB
  if (portal.id === "lab") {
    if (["requests", "queue", "reports"].includes(tab)) return <LabScreens data={data} tab={tab} />;
    if (tab === "performance") return <ProviderPerformanceScreen providerGtid={portal.defaultTenantGtid} />;
  }

  // QC
  if (portal.id === "qc") {
    if (["schedule", "field", "reports"].includes(tab)) return <QcScreens data={data} tab={tab} />;
    if (tab === "re-inspections") return <ReInspectionScreen data={data} />;
    if (tab === "performance") return <ProviderPerformanceScreen providerGtid={portal.defaultTenantGtid} />;
  }

  // CBR
  if (portal.id === "cbr") {
    if (["declarations", "certificates", "clearance"].includes(tab)) return <CbrScreens data={data} tab={tab} />;
    if (tab === "physical-jobs") return <PhysicalJobsScreen data={data} />;
    if (tab === "performance") return <ProviderPerformanceScreen providerGtid={portal.defaultTenantGtid} />;
  }

  // BANK / PFI
  if (portal.id === "bank" || portal.id === "pfi") {
    if (tab === "opportunities") return <FinancingOpportunitiesScreen />;
    if (tab === "portfolio") return <FinancierPortfolioScreen />;
    if (tab === "defi") return <FinancierPortfolioScreen initialTab="defi" />;
    if (tab === "preferences") return <FinancierPreferencesScreen />;
    if (tab === "borrowers") return <div className="space-y-4"><SectionHeader title="Financed Companies" subtitle="Historical borrower data · repayment performance · non-marketplace" /><Card className="p-4 text-xs text-muted-foreground">Borrower history available for companies you've previously financed.</Card></div>;
    if (tab === "collateral") return <div className="space-y-4"><SectionHeader title="Collateral & Margin Calls" subtitle="FeeLock-secured · ZK proof-of-reserves" /><Card className="p-4 text-xs text-muted-foreground">All loans are over-collateralised via FeeLock. No margin calls currently active.</Card></div>;
    if (tab === "settlement") return <SettlementScreen data={data} />;
  }

  // GOV
  if (portal.id === "gov") {
    if (["trade-flow", "customs", "fx", "food-safety", "integrations"].includes(tab)) return <GovScreens data={data} tab={tab} />;
    if (tab === "governor") return <GovernorDecisionScreen />;
    if (tab === "opa") return <OpaPolicyScreen />;
    if (tab === "loom") return <LoomVerificationScreen />;
    if (tab === "jurisdictions") return <JurisdictionMatrixScreen />;
    if (tab === "qes") return <QesScreen />;
    if (tab === "device") return <DeviceTrustScreen tenantGtid={portal.defaultTenantGtid} />;
    if (tab === "evidence") return <EvidencePackageScreen />;
    if (tab === "compliance-screen") return <ComplianceScreeningScreen tenantGtid={portal.defaultTenantGtid} />;
    if (tab === "sar") return <SarScreen />;
    if (tab === "ustn") return <UstnMasterScreen />;
    if (tab === "journey") return <RoleJourneyScreen />;
  }

  // ADMIN (Part 12C.11 — Platform Admin)
  if (portal.id === "admin") {
    if (tab === "command-center") return <AdminCommandCenter />;
    if (tab === "metrics") return <AdminMetricsScreen />;
    if (tab === "incidents") return <AdminIncidentsScreen />;
    if (tab === "threats") return <AdminThreatsScreen />;
    if (tab === "multisig") return <AdminMultisigScreen />;
    if (tab === "add-ons") return <AdminAddOnsScreen />;
    if (tab === "integrations") return <AdminIntegrationsScreen />;
    if (tab === "sla") return <AdminSlaScreen />;
    if (tab === "audit") return <AdminAuditScreen />;
  }

  // MARKETPLACE PARTNER (Part 12C.12)
  if (portal.id === "marketplace-partner") {
    if (tab === "command-center") return <MarketplaceCommandCenter />;
    if (tab === "leads") return <MarketplaceLeadsScreen />;
    if (tab === "webhooks") return <MarketplaceWebhooksScreen />;
    if (tab === "revenue") return <MarketplaceRevenueScreen />;
    if (tab === "api-keys") return <MarketplaceApiKeysScreen />;
    if (tab === "sandbox") return <MarketplaceSandboxScreen />;
    if (tab === "agreement") return <MarketplaceAgreementScreen />;
    if (tab === "company-admin") return <MarketplaceCompanyAdminScreen />;
  }

  // Fallback
  return <CommandCenter portal={portal} data={data} />;
}
