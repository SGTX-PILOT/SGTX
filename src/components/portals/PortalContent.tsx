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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
import { GtidChatScreen } from "@/components/sgtx/common-components";
import { BrainDecisionPanel, type BrainDecision } from "@/components/sgtx/BrainDecisionPanel";
import { LoomChainVisualization, deriveLoomEntriesFromActivities } from "@/components/sgtx/LoomChainVisualization";
import { WorldwideRoutesDashboard } from "@/components/sgtx/WorldwideRoutesDashboard";
import { PortPairReference } from "@/components/sgtx/PortPairReference";
import { ContainerCompliancePanel } from "@/components/sgtx/ContainerCompliancePanel";
import { LetterOfCreditPanel } from "@/components/sgtx/LetterOfCreditPanel";
import { CertificateOfOriginPanel } from "@/components/sgtx/CertificateOfOriginPanel";
import { ReeferTelemetryPanel } from "@/components/sgtx/ReeferTelemetryPanel";
import { LotManagementPanel } from "@/components/sgtx/LotManagementPanel";
import { Skeleton, CommandCenterSkeleton, TableSkeleton, CardListSkeleton, EmptyState, TradeLifecycleStepper, ResponsiveTable, SgtxLoader } from "@/components/sgtx/premium-ui";
import type { PortalConfig } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ShoppingBag, Store, Ship, FileText, Banknote, ShieldCheck, AlertTriangle, TrendingUp,
  Users, Container, FlaskConical, MapPin, Building2, Plus, Send, Gavel, Landmark,
  Activity, DollarSign, Package, CheckCircle2, Clock, Sparkles, Cpu, Globe2, Lock, Loader2,
  HeartHandshake, Trash2, Megaphone, Tag,
  Scale, RefreshCw, AlertCircle, Truck, PackageCheck, Inbox, Crown, ClipboardList,
  ChevronRight, ChevronDown, ChevronUp, Plane, Train, FileCheck, StickyNote, Rocket, Zap,
  User, Mail, Phone, Copy,
  CheckCheck, UserPlus, Stamp,
} from "lucide-react";
import { useState, useEffect, useRef, useMemo } from "react";
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
          { label: "Open Trades", value: String(activeTrades.length), sub: `${trades.length} total`, icon: ShoppingBag, accent: "#1a6fb0", trend: activeTrades.length > 0 ? "active" : undefined, trendDir: "flat", onClick: nav("new-trade", "New Trade Request"), clickableHint: "Open new trade form", primaryAction: { label: "+ New Trade Request", onClick: nav("new-trade", "New Trade Request") } },
          { label: "Active Shipments", value: String(data.tradesAsBuyer?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Ship, accent: "#0ea5e9", onClick: nav("shipments", "Shipments Vault"), clickableHint: "View shipments vault" },
          { label: "Pending Approvals", value: String(data.inbox?.length), icon: Clock, accent: "#fbbf24", trend: data.inbox?.length > 5 ? "+3 today" : undefined, trendDir: data.inbox?.length > 5 ? "up" : "flat", onClick: nav("invoices", "Invoices & Payments"), clickableHint: "Review pending invoices", primaryAction: { label: "View Inbox", onClick: nav("invoices", "Invoices & Payments") } },
          { label: "Outstanding", value: fmtUsd(overdueAmount), sub: `${pendingInvoices.length} invoices`, icon: Banknote, accent: "#f87171", trendDir: "flat", onClick: nav("invoices", "Invoices"), clickableHint: "View invoices" },
          { label: "Compliance Alerts", value: String(complianceAlerts), sub: "sanctions · KYB · docs", icon: ShieldCheck, accent: "#9333ea", trend: complianceAlerts > 0 ? "needs review" : "all clear", trendDir: complianceAlerts > 0 ? "up" : "flat", onClick: nav("compliance", "Compliance"), clickableHint: "Open compliance screen" },
          { label: "Active Disputes", value: String(activeDisputes.length), sub: activeDisputes.length > 0 ? "filed / mediating" : "none active", icon: Gavel, accent: "#dc2626", trendDir: activeDisputes.length > 0 ? "up" : "flat", onClick: nav("disputes", "Disputes"), clickableHint: "View disputes" },
        ];
      case "trader-seller":
        return [
          { label: "Outbound Trades", value: String(data.tradesAsSeller?.length || 0), sub: `${activeTrades.length} active`, icon: Store, accent: "#d4321a", onClick: nav("requests", "Pending Requests"), clickableHint: "View inbound requests", primaryAction: { label: "+ Build Quote", onClick: nav("quote-builder", "Quote Builder") } },
          { label: "Containers", value: String(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.shipments?.length || 0), 0)), icon: Container, accent: "#c2410c", onClick: nav("shipments", "Shipments"), clickableHint: "View shipments" },
          { label: "Trade Value", value: fmtUsd(totalValue), icon: DollarSign, accent: "#10b981", trend: "+12%", trendDir: "up", onClick: nav("invoices", "Invoices"), clickableHint: "View invoices" },
          { label: "SGTX Fees Paid", value: fmtUsd(data.tradesAsSeller?.reduce((s: number, t: any) => s + (t.sgtxFeeUsd || 0), 0)), sub: "1.5% per side", icon: ShieldCheck, accent: "#a78bfa", trendDir: "flat" },
          { label: "Distressed Alerts", value: String(distressedAlerts), sub: distressedAlerts > 0 ? "needs triage" : "none active", icon: Megaphone, accent: "#fb923c", trend: distressedAlerts > 0 ? "urgent" : undefined, trendDir: distressedAlerts > 0 ? "up" : "flat", onClick: nav("distressed", "Distressed Cargo"), clickableHint: "Open distressed listings" },
          { label: "Logistics Quotes Pending", value: String(logisticsQuotesPending), sub: "RFQs awaiting", icon: FileText, accent: "#0ea5e9", trendDir: logisticsQuotesPending > 0 ? "up" : "flat", onClick: nav("quote-builder", "Quote Builder"), clickableHint: "Open quote builder", primaryAction: { label: "+ Build Quote", onClick: nav("quote-builder", "Quote Builder") } },
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
        <SectionHeader
          title={portal.id === "gov" ? "Regulatory Oversight" : `${portal.shortName} Command Center`}
          subtitle={portal.id === "gov"
            ? "Sovereign regulatory oversight · cross-border trade visibility · customs · FX · food safety"
            : "Universal Command Center · Part 12G · primary landing for all authenticated users"}
        />
        {/* Part 12G.1.2 — Readiness Card (shown for all portals) */}
        <ReadinessCard portal={portal} tenantGtid={portal.defaultTenantGtid} onOpen={() => nav("readiness", "Trade Readiness")()} />
      </div>

      <div>
        <SectionHeader title="Executive Summary" subtitle="Part 12G.1 · click any card to drill into the filtered view · trend indicators show direction" />
        <ExecutiveCards cards={cards} />
      </div>

      {/* Trade Lifecycle Stepper — unique SGTX phase indicator */}
      {trades.length > 0 && (
        <div>
          <SectionHeader title="Trade Lifecycle" subtitle="Phase 0-8 progression · current phase highlighted in gold" />
          <Card className="p-4 sm:p-6">
            <TradeLifecycleStepper
              currentPhase={Math.max(...trades.map(t => t.phase || 0))}
              phases={[
                { id: 0, label: "Onboard", shortLabel: "Onboard", icon: Users },
                { id: 1, label: "Initiate", shortLabel: "Initiate", icon: ShoppingBag },
                { id: 2, label: "Quote", shortLabel: "Quote", icon: Store },
                { id: 3, label: "Contract", shortLabel: "Contract", icon: ShieldCheck },
                { id: 4, label: "Finance", shortLabel: "Finance", icon: Banknote },
                { id: 5, label: "Execute", shortLabel: "Execute", icon: Ship },
                { id: 6, label: "Settle", shortLabel: "Settle", icon: CheckCircle2 },
                { id: 7, label: "Dispute", shortLabel: "Dispute", icon: Gavel },
                { id: 8, label: "Close", shortLabel: "Close", icon: CheckCircle2 },
              ]}
            />
          </Card>
        </div>
      )}

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
              {overdueAmount > 0 && <span className="text-destructive">{fmtUsd(overdueAmount)} in outstanding payments.</span>}
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

const COMMODITY_TYPES = ["Fresh Fruits", "Fresh Vegetables", "Frozen Fruits", "Frozen Vegetables", "Grains", "Dairy", "Meat", "Seafood", "Beverages", "Textiles", "Chemicals", "Electronics", "Machinery", "Vehicles", "Other"];
const PRODUCTS_BY_TYPE: Record<string, { name: string; hs: string }[]> = {
  "Fresh Fruits": [{ name: "Valencia Oranges", hs: "0805.10" }, { name: "Navel Oranges", hs: "0805.10" }, { name: "Eureka Lemons", hs: "0805.50" }, { name: "Strawberries (Fresh)", hs: "0810.10" }, { name: "Grapes", hs: "0806.10" }, { name: "Mangoes", hs: "0804.50" }, { name: "Bananas", hs: "0803.90" }, { name: "Apples", hs: "0808.10" }, { name: "Pomegranates", hs: "0810.60" }],
  "Frozen Fruits": [{ name: "Frozen Strawberries (IQF)", hs: "0811.10" }, { name: "Frozen Raspberries", hs: "0811.20" }, { name: "Frozen Mangoes", hs: "0811.90" }, { name: "Frozen Blueberries", hs: "0811.90" }, { name: "Frozen Mixed Berries", hs: "0811.90" }],
  "Fresh Vegetables": [{ name: "Fresh Onions", hs: "0703.10" }, { name: "Fresh Tomatoes", hs: "0702.00" }, { name: "Fresh Potatoes", hs: "0701.90" }, { name: "Fresh Garlic", hs: "0703.20" }, { name: "Fresh Bell Peppers", hs: "0709.60" }],
  "Frozen Vegetables": [{ name: "Frozen Peas", hs: "0710.21" }, { name: "Frozen Spinach", hs: "0710.30" }, { name: "Frozen Mixed Vegetables", hs: "0710.90" }],
  "Grains": [{ name: "Rice", hs: "1006.30" }, { name: "Wheat", hs: "1001.99" }, { name: "Corn", hs: "1005.90" }, { name: "Barley", hs: "1003.00" }],
  "Dairy": [{ name: "Cheese", hs: "0406.90" }, { name: "Butter", hs: "0405.10" }, { name: "Milk Powder", hs: "0402.10" }],
  "Meat": [{ name: "Frozen Beef", hs: "0202.30" }, { name: "Frozen Chicken", hs: "0207.14" }, { name: "Frozen Lamb", hs: "0204.30" }],
  "Seafood": [{ name: "Frozen Shrimp", hs: "0306.17" }, { name: "Fresh Salmon", hs: "0302.12" }, { name: "Frozen Fish Fillets", hs: "0304.61" }, { name: "Canned Tuna", hs: "1604.14" }],
  "Beverages": [{ name: "Orange Juice", hs: "2009.11" }, { name: "Bottled Water", hs: "2201.10" }, { name: "Tea", hs: "0902.30" }, { name: "Coffee", hs: "0901.21" }],
  "Textiles": [{ name: "Cotton T-Shirts", hs: "6109.10" }, { name: "Cotton Fabric", hs: "5208.52" }, { name: "Polyester Yarn", hs: "5402.33" }],
  "Chemicals": [{ name: "Fertilizers", hs: "3102.10" }, { name: "Plastics", hs: "3901.10" }, { name: "Pharmaceuticals", hs: "3004.90" }],
  "Electronics": [{ name: "Smartphones", hs: "8517.13" }, { name: "Laptops", hs: "8471.30" }, { name: "LED Lights", hs: "9405.42" }],
  "Machinery": [{ name: "Industrial Pumps", hs: "8413.70" }, { name: "Electric Motors", hs: "8501.10" }, { name: "Construction Equipment", hs: "8429.52" }],
  "Vehicles": [{ name: "Passenger Cars", hs: "8703.23" }, { name: "Trucks", hs: "8704.21" }, { name: "Auto Parts", hs: "8708.99" }],
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
    { id: 10, label: "Compliance Gates", desc: "EUDR · CBAM · sanctions · FM" },
    { id: 11, label: "Governor & Submit", desc: "Pre-screen + review" },
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

  // ── Step 10 (FIX-10): Compliance Gates — runs the SGTX Brain pre-submission
  // compliance gate (EUDR + CBAM + sanctions + force majeure) and renders the
  // per-module checklist + BrainDecisionPanel. When `complianceResult.overallVerdict`
  // is DENY, the Submit button on Step 11 is disabled.
  const [complianceResult, setComplianceResult] = useState<any>(null);
  const [complianceLoading, setComplianceLoading] = useState(false);
  const [complianceError, setComplianceError] = useState<string | null>(null);

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
    RO_RO: [
      { value: "VEHICLE", label: "Vehicle (car/truck/bus)" },
      { value: "HEAVY_MACHINERY", label: "Heavy Machinery (construction/mining)" },
      { value: "TRAILER", label: "Trailer / Semi-Trailer" },
      { value: "ROLLING_STOCK", label: "Rolling Stock (rail/locomotive)" },
      { value: "BREAKBULK_ROLLABLE", label: "Breakbulk (rollable)" },
      { value: "MAFI_TRAILER", label: "Mafi Trailer (low-bed)" },
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
  // Part 3.12 / 4.9a — Bill of Lading type + Optional buyer-requested services
  const [blType, setBlType] = useState<string>("ORIGINAL"); // ORIGINAL | EB_L — Phase 3.12 B/L type
  const [optionalQcInspection, setOptionalQcInspection] = useState<boolean>(false);
  const [qcInspectionType, setQcInspectionType] = useState<string>("PRE_SHIPMENT");
  const [qcInspectionFeeUsd, setQcInspectionFeeUsd] = useState<number>(350); // estimated default
  // Lab tests — pesticides is FREE (baseline food-safety); microbiology + heavy metals are extra-cost
  const [labTestsRequested, setLabTestsRequested] = useState<any[]>([
    { testType: "PESTICIDE_RESIDUE", feeUsd: 0, isExtraCost: false, selected: true, label: "Pesticide Residue Panel", description: "Baseline food-safety — included free" },
  ]);
  const LAB_TEST_CATALOG = [
    { testType: "PESTICIDE_RESIDUE", feeUsd: 0, isExtraCost: false, label: "Pesticide Residue Panel", description: "Baseline food-safety — included free (MRLs per Codex)" },
    { testType: "MICROBIOLOGICAL", feeUsd: 180, isExtraCost: true, label: "Microbiological Panel", description: "E. coli, Salmonella, Listeria, TPC, Yeast & Mould — extra cost" },
    { testType: "HEAVY_METAL", feeUsd: 240, isExtraCost: true, label: "Heavy Metals Panel", description: "Pb, Cd, As, Hg — extra cost (ICP-MS)" },
    { testType: "BRIX", feeUsd: 90, isExtraCost: true, label: "Brix / Sugar Content", description: "Sweetness indicator — extra cost" },
    { testType: "SUGAR_CONTENT", feeUsd: 110, isExtraCost: true, label: "Detailed Sugar Profile", description: "Glucose, fructose, sucrose breakdown — extra cost" },
  ];
  const labTestsFeeUsd = labTestsRequested.filter((t: any) => t.selected && t.isExtraCost).reduce((s: number, t: any) => s + (t.feeUsd || 0), 0);
  const optionalServicesTotalUsd = (optionalQcInspection ? qcInspectionFeeUsd : 0) + labTestsFeeUsd;

  // CG-7 fix — QC / LAB provider pickers. Previously the trade-request API
  // hardcoded a single Egyptian QC provider and a single Egyptian LAB provider,
  // which gave those two providers a monopoly and silently blocked
  // destination-side inspections. The buyer can now SELECT the QC and LAB
  // provider from a dropdown populated by /api/sgtx/providers/list. When the
  // buyer omits a choice, the route falls back to the first active provider of
  // that type (so the workflow never silently breaks).
  const [qcProviders, setQcProviders] = useState<any[]>([]);
  const [labProviders, setLabProviders] = useState<any[]>([]);
  const [qcProviderGtid, setQcProviderGtid] = useState<string>("");
  const [labProviderGtid, setLabProviderGtid] = useState<string>("");
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [qcRes, labRes] = await Promise.all([
          fetch("/api/sgtx/providers/list?type=QC"),
          fetch("/api/sgtx/providers/list?type=LAB"),
        ]);
        const [qcData, labData] = await Promise.all([qcRes.json(), labRes.json()]);
        if (!mounted) return;
        const qcList: any[] = qcData?.providers || [];
        const labList: any[] = labData?.providers || [];
        setQcProviders(qcList);
        setLabProviders(labList);
        // Pre-select the top-ranked provider of each type (highest trustScore)
        // so the buyer sees a sensible default but can change it.
        if (qcList.length > 0) setQcProviderGtid(qcList[0].gtid);
        if (labList.length > 0) setLabProviderGtid(labList[0].gtid);
      } catch {
        // Non-blocking — the route has its own fallback if the picker is empty.
      }
    })();
    return () => { mounted = false; };
  }, []);

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
  const portsByCountry: Record<string, string[]> = {
    EG: ["Alexandria (EGALX)", "Damietta (EGDAM)", "Cairo (EGCAI)", "Port Said (EGPSD)", "Safaga (EGSGF)"],
    DE: ["Hamburg (DEHAM)", "Bremerhaven (DEBRV)"],
    VN: ["Can Tho (VNCAN)", "Ho Chi Minh (VNSGN)", "Hai Phong (VNHPH)"],
    US: ["New York (USNYC)", "Los Angeles (USLAX)", "Houston (USHOU)", "Savannah (USSAV)"],
    CN: ["Shanghai (CNSHA)", "Shenzhen (CNSZX)", "Ningbo (CNNGB)", "Qingdao (CNTAO)"],
    AE: ["Jebel Ali (AEJEA)", "Khalifa (AEKHL)"],
    SA: ["Jeddah (SAJED)", "Yanbu (SAYNB)", "Dammam (SADMM)"],
    IT: ["Trieste (ITTRS)", "Livorno (ITLIV)", "Genoa (ITGOA)"],
    FR: ["Marseille (FRMRS)", "Le Havre (FRLEH)"],
    GB: ["Felixstowe (GBFXT)", "Southampton (GBSOU)"],
    NL: ["Rotterdam (NLRTM)", "Amsterdam (NLAMS)"],
    ES: ["Valencia (ESVLC)", "Barcelona (ESBCN)"],
    TR: ["Istanbul (TRIST)", "Mersin (TRMER)"],
    IN: ["Mumbai (INBOM)", "Chennai (INMAA)", "Nhava Sheva (INNSA)"],
    JP: ["Tokyo (JPTYO)", "Yokohama (JPYOK)"],
    KR: ["Busan (KRPUS)", "Incheon (KRINC)"],
    BR: ["Santos (BRSSZ)", "Itajai (BRITJ)"],
    ZA: ["Durban (ZADUR)", "Cape Town (ZACPT)"],
    KE: ["Mombasa (KEMBA)"],
    NG: ["Lagos (NGLOS)"],
    MA: ["Tanger Med (MATNG)", "Casablanca (MACAS)"],
    JO: ["Aqaba (JOAQJ)"],
    KW: ["Shuwaikh (KWKWI)", "Shuaiba (KWSAA)"],
    QA: ["Hamad (QAHMD)"],
    OM: ["Sultan Qaboos (OMSLL)", "Sohar (OMSOH)"],
    BH: ["Khalifa Bin Salman (BAKBS)"],
    TH: ["Laem Chabang (THLCH)", "Bangkok (THBKK)"],
    ID: ["Tanjung Priok (IDJKT)", "Surabaya (IDSUB)"],
    MY: ["Port Klang (MYPKG)", "Tanjung Pelepas (MYTPP)"],
    SG: ["Singapore (SGSIN)"],
    AU: ["Sydney (AUSYD)", "Melbourne (AUMEL)"],
    CA: ["Vancouver (CAVAN)", "Montreal (CAMTR)"],
    MX: ["Manzanillo (MXMZL)", "Veracruz (MXVER)"],
  };

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
    10: true, // Compliance Gates — advisory; run when ready
    11: true, // prescreen is optional, submit allowed (gated by compliance verdict in render)
  };

  // ── Submit handler — POST to /api/sgtx/trade-request ───────────────
  const handleSubmit = async () => {
    if (submitting) return;
    // FIX-10: hard-block submission when the Brain compliance gate returned
    // DENY on the last compliance-check run. The operator must clear the
    // blocking condition(s) and re-run the compliance gate.
    if (complianceResult && complianceResult.overallVerdict === "DENY") {
      toast.error("Cannot submit — compliance gate failed", {
        description: "The SGTX Brain AI returned a DENY verdict on the last compliance run. Clear the blocking conditions and re-run the compliance gate.",
      });
      return;
    }
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
          blType, // EB_L | ORIGINAL — Phase 3.12 B/L type
          // Part 4.9a — Optional buyer-requested services (extra fees)
          optionalQcInspection,
          qcInspectionType: optionalQcInspection ? qcInspectionType : null,
          qcInspectionFeeUsd: optionalQcInspection ? qcInspectionFeeUsd : null,
          // CG-7 fix — pass caller-selected QC / LAB provider GTIDs to the route.
          // When empty, the route falls back to the first active provider of the
          // matching type. Previously these were hardcoded inside the route.
          qcProviderGtid: optionalQcInspection ? qcProviderGtid : null,
          labTestsRequested: labTestsRequested.filter((t: any) => t.selected).map((t: any) => ({ testType: t.testType, feeUsd: t.feeUsd, isExtraCost: t.isExtraCost })),
          labTestsFeeUsd,
          labProviderGtid: labTestsRequested.some((t: any) => t.selected) ? labProviderGtid : null,
          optionalServicesTotalUsd,
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

  // ── FIX-10: Compliance Gates runner — calls the pre-submission compliance
  // endpoint (autoCheckCompliance + assessEudr + assessTradeForceMajeure +
  // screenForSanctions) and stores the combined result for the wizard's
  // Compliance Gates step. Idempotent — re-running replaces the previous
  // result. The endpoint is non-mutating.
  const runComplianceCheck = async () => {
    if (complianceLoading) return;
    setComplianceLoading(true);
    setComplianceError(null);
    try {
      const first = containers[0] || {};
      const res = await fetch("/api/sgtx/trade-request/compliance-check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          hsCode,
          originCountry: first.originCountry,
          destCountry: first.destCountry,
          buyerName: "European Importer GmbH", // demo buyer (matches Step 10 summary)
          sellerName: selectedSeller?.name,
          commodity: productName,
          weightTonnes: totalGrossKg ? totalGrossKg / 1000 : undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok || !d.ok) {
        setComplianceError(d.error || "Compliance check failed");
        setComplianceResult(null);
        toast.error("Compliance check failed", { description: d.error || "Please try again." });
        return;
      }
      setComplianceResult(d);
      const verdict = d.overallVerdict;
      if (verdict === "DENY") {
        toast.error("Compliance gate: DENY", {
          description: "Trade cannot be submitted until the blocking conditions are cleared.",
        });
      } else if (verdict === "CONDITIONAL") {
        toast.warning("Compliance gate: CONDITIONAL", {
          description: `${(d.conditions || []).filter((c: any) => c.status === "unmet").length} condition(s) require attention — submission still allowed.`,
        });
      } else {
        toast.success("Compliance gate: ALLOW", {
          description: `${(d.conditions || []).length} compliance check(s) ran — no blockers.`,
        });
      }
    } catch (e: any) {
      setComplianceError(e?.message || "Network error during compliance check");
      setComplianceResult(null);
      toast.error("Compliance check failed", { description: e?.message || "Network error" });
    } finally {
      setComplianceLoading(false);
    }
  };

  // Convenience flags used by the Compliance Gates step + the Submit button.
  const complianceBlocked =
    !!complianceResult && complianceResult.overallVerdict === "DENY";
  const complianceWarned =
    !!complianceResult && complianceResult.overallVerdict === "CONDITIONAL";

  return (
    <div className="space-y-4 max-w-5xl">
      <SectionHeader title="Trade Request Wizard" subtitle="Phase 1 — Parties → Commodity & Spec → Containers → Commercial Terms → Shipments & Notes → Compliance & Submit" />
      {draftSaved && <div className="text-[0.6rem] text-muted-foreground flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-success" /> Draft auto-saved at {draftSaved} · Expires in {draftExpiry.daysLeft} days (reminders at day {draftExpiry.reminders.join(", ")})</div>}
      <Card className="p-4">
        {/* Compact step indicator (FIX-6) — numbered dots + checkmark for done, gold for active, border-top connectors */}
        <div className="flex items-center gap-1 mb-5 overflow-x-auto pb-2 scroll-gold" aria-label="Trade request wizard progress">
          {STEPS.map((s, i) => {
            const done = step > s.id;
            const active = step === s.id;
            const isLast = i === STEPS.length - 1;
            return (
              <div key={s.id} className={isLast ? "flex items-center flex-shrink-0" : "flex items-center flex-1 min-w-[90px]"}>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-[0.65rem] font-bold border-2 flex-shrink-0 transition-all ${
                      done
                        ? "bg-emerald-500/20 border-emerald-500 text-emerald-400"
                        : active
                        ? "bg-gold/20 border-gold text-gold"
                        : "border-border text-muted-foreground"
                    }`}
                    aria-current={active ? "step" : undefined}
                  >
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : s.id}
                  </div>
                  <div className="min-w-0 max-w-[80px] overflow-hidden">
                    <p className={`text-[0.7rem] leading-tight truncate ${active ? "text-gold font-semibold" : done ? "text-foreground/80" : "text-muted-foreground"}`}>{s.label}</p>
                    <p className="text-[0.55rem] text-muted-foreground/70 leading-tight truncate hidden md:block">{s.desc}</p>
                  </div>
                </div>
                {!isLast && (
                  <div className={`flex-1 h-px mx-1.5 border-t min-w-[8px] ${done ? "border-emerald-500/40" : "border-border/60"}`} />
                )}
              </div>
            );
          })}
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
                  <Input value={sellerSearch} onChange={(e) => onSellerSearch(e.target.value)} onKeyDown={onSearchKeyDown} placeholder="Type GTID (SGTX-EG-TRD-...) or company name…" className="font-mono text-sm pr-16" aria-label="Seller search" aria-expanded={sellerResults.length > 0} aria-controls="seller-results" />
                  {gtidValid === true && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-success text-xs">✓ Valid</span>}
                  {gtidValid === false && <span className="absolute right-2 top-1/2 -translate-y-1/2 text-destructive text-xs">✗ Invalid</span>}
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
                      {r.sanctions && <ShieldCheck className="w-3.5 h-3.5 text-success" />}
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
                {selectedSeller.sanctions && <Badge variant="outline" className="text-[0.55rem] text-success"><ShieldCheck className="w-2.5 h-2.5 mr-0.5" /> Sanctions cleared</Badge>}
                <Badge variant="outline" className="text-[0.55rem] text-gold">Saved Contact</Badge>
                <button onClick={() => loadTrustPortrait(selectedSeller.gtid)} className="text-[0.65rem] text-gold hover:underline">View 360° Trust Portrait</button>
              </div>
            )}
            {showTrustPortrait && (
              <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTrustPortrait(false)}>
                <Card className="p-4 max-w-lg w-full" onClick={e => e.stopPropagation()}>
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
                        {c.sanctions && <ShieldCheck className="w-3.5 h-3.5 text-success" />}
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
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Ocean/air freight:</span><p className={incotermConfig.sellerFreight ? "text-success" : "text-muted-foreground"}>{incotermConfig.sellerFreight ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Destination charges:</span><p className={incotermConfig.sellerDestCharges ? "text-success" : "text-muted-foreground"}>{incotermConfig.sellerDestCharges ? "✓ Seller" : "✗ Buyer"}</p></div>
                <div className="p-1.5 rounded bg-background/40"><span className="text-[0.6rem] text-muted-foreground">Duties:</span><p className={incotermConfig.sellerDuties ? "text-success" : "text-muted-foreground"}>{incotermConfig.sellerDuties ? "✓ Seller" : "✗ Buyer"}</p></div>
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
                  <div className="mt-3 p-2 rounded-lg bg-success/5 border border-emerald-500/20">
                    <p className="text-[0.6rem] text-success font-semibold mb-1">✓ AI Parsed Preview (verify and edit below):</p>
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
                    {hsDetection && <Badge variant="outline" className={`text-[0.55rem] ${hsDetection.confidence >= 0.85 ? "text-success border-emerald-500/30" : hsDetection.confidence >= 0.6 ? "text-warning border-amber-500/30" : "text-destructive border-red-500/30"}`}>{Math.round(hsDetection.confidence * 100)}% confidence · {hsDetection.source}</Badge>}
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
                  <div className="flex items-center justify-between mb-2"><p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1"><Sparkles className="w-3 h-3" /> AI Product Form Agent (A2 · advisory)</p><div className="flex items-center gap-2">{productForm && <><button className="text-[0.55rem] text-gold hover:underline" onClick={() => loadProductForm(commodityType, productName, hsCode)}>Reset to AI</button><button className="text-[0.55rem] text-info hover:underline">Save as template</button></>}</div></div>
                  {productFormLoading ? (<div className="space-y-2"><div className="h-4 bg-muted/40 rounded animate-pulse" /><div className="h-4 bg-muted/40 rounded w-3/4 animate-pulse" /><div className="h-4 bg-muted/40 rounded w-1/2 animate-pulse" /><p className="text-[0.6rem] text-muted-foreground">Generating dynamic specifications…</p></div>
                  ) : productForm ? (<div className="space-y-2">{productForm.dynamic_fields && (<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{productForm.dynamic_fields.map((f: any, i: number) => (<div key={i}><Label className="text-[0.6rem]">{f.name}{f.mandatory ? " *" : ""}</Label>{f.type === "dropdown" ? <Select defaultValue={f.default}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{(f.options || []).map((o: string) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select> : <Input type={f.type === "number" ? "number" : "text"} defaultValue={f.default} className="h-8 text-xs" />}</div>))}</div>)}{productForm.required_documents && <div className="flex items-center gap-2 flex-wrap">{productForm.required_documents.map((d: any, i: number) => <Badge key={i} variant="outline" className="text-[0.55rem] text-warning border-amber-500/30">{d.type}{d.mandatory ? " *" : ""}</Badge>)}</div>}{productForm.special_conditions && productForm.special_conditions.map((c: string, i: number) => <p key={i} className="text-[0.65rem] text-warning">⚠ {c}</p>)}</div>
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
            <div className="h-1 rounded-full bg-muted overflow-hidden"><div className="h-full bg-success transition-all" style={{ width: `${(configuredContainers / containers.length) * 100}%` }} /></div>
            <div className="flex gap-1 flex-wrap">{containers.map((c, i) => <button key={c.id} onClick={() => setActiveContainer(i)} className={`px-3 py-1 rounded-lg text-xs font-medium ${activeContainer === i ? "bg-gold-gradient text-sovereign" : "bg-muted/50 text-muted-foreground"}`}>Container {i + 1} {c.commodities.every((com: any) => com.product) ? "✓" : "…"}</button>)}</div>
            {containers[activeContainer] && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border space-y-3">
                <div className="flex items-center justify-between"><span className="text-xs font-semibold">Container {activeContainer + 1}</span>{containers.length > 1 && <button onClick={() => removeContainer(activeContainer)} className="text-[0.6rem] text-destructive hover:underline">Remove Container</button>}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div><Label className="text-[0.6rem]">Country of Origin</Label><Select value={containers[activeContainer].originCountry} onValueChange={v => updateContainer(activeContainer, "originCountry", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["EG","VN","DE","US","CN","AE","SA","IT","FR","GB","NL","ES","TR","IN","JP","KR","BR","ZA","KE","NG","MA","JO","KW","QA","OM","BH","TH","ID","MY","SG","AU","CA","MX"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label className="text-[0.6rem]">Destination Country</Label><Select value={containers[activeContainer].destCountry} onValueChange={v => updateContainer(activeContainer, "destCountry", v)}><SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger><SelectContent>{["DE","EG","US","CN","VN","AE","SA","IT","FR","GB","NL","ES","TR","IN","JP","KR","BR","ZA","KE","NG","MA","JO","KW","QA","OM","BH","TH","ID","MY","SG","AU","CA","MX"].map(co => <SelectItem key={co} value={co}>{co}</SelectItem>)}</SelectContent></Select></div>
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
                      {containers[activeContainer].commodities.length > 1 && <button onClick={() => setContainers(cs => cs.map((c, i) => i === activeContainer ? { ...c, commodities: c.commodities.filter((_, j) => j !== comIdx) } : c))} aria-label={`Remove commodity ${comIdx + 1}`} className="text-[0.6rem] text-destructive self-end pb-1">✕ Remove</button>}
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
                                {d.mandatory ? <Badge variant="outline" className="text-[0.5rem] text-destructive border-red-500/30">MANDATORY</Badge> : <Badge variant="outline" className="text-[0.5rem] text-muted-foreground">OPTIONAL</Badge>}
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
                  <span><strong className="text-destructive">{docRequirements.filter(d => d.mandatory).length}</strong> mandatory</span>
                  <span><strong className="text-success">{docRequirements.filter(d => !d.mandatory).length}</strong> optional</span>
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
              <div className="grid grid-cols-2 sm:grid-cols-6 gap-2">
                {[
                  { v: "OCEAN", icon: Ship, label: "Ocean" },
                  { v: "AIR", icon: Plane, label: "Air" },
                  { v: "RAIL", icon: Train, label: "Rail" },
                  { v: "TRUCK", icon: Truck, label: "Truck" },
                  { v: "MULTIMODAL", icon: Globe2, label: "Multimodal" },
                  { v: "RO_RO", icon: Ship, label: "RoRo" },
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
                {transportMode === "RO_RO" && "🚢 Roll-on/Roll-off (RoRo) — vehicles, heavy machinery, and rolling cargo driven onto the vessel. Select a trade corridor below."}
              </p>
              {transportMode === "RO_RO" && (
                <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 space-y-2">
                  <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold">RoRo Trade Corridor Selection (Part 30)</p>
                  <p className="text-[0.65rem] text-muted-foreground">
                    RoRo shipments use designated trade corridors with pre-verified eligibility, government node oversight,
                    and port digital twins. Select the corridor that matches your origin → destination route.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[
                      { code: "EG-IT", label: "Egypt → Italy", desc: "Alexandria → Trieste" },
                      { code: "EG-SA", label: "Egypt → Saudi Arabia", desc: "Damietta → Jeddah" },
                      { code: "EG-AE", label: "Egypt → UAE", desc: "Alexandria → Jebel Ali" },
                    ].map(c => (
                      <button
                        key={c.code}
                        type="button"
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/sgtx/tcn/corridor/${c.code}/eligibility`);
                            const d = await res.json();
                            if (d.ok && d.eligible) {
                              toast.success(`${c.label} corridor eligible`, { description: `Transit: ${d.transitDays || "—"} days · Vessel schedules available` });
                            } else {
                              toast.warning(`${c.label} corridor check`, { description: d.reason || "Eligibility check completed" });
                            }
                          } catch {
                            toast.error("Corridor check failed");
                          }
                        }}
                        className="p-2.5 rounded-lg border border-border bg-background/40 hover:border-gold/40 transition-colors text-left"
                      >
                        <p className="text-xs font-semibold text-gold">{c.label}</p>
                        <p className="text-[0.55rem] text-muted-foreground">{c.desc}</p>
                        <p className="text-[0.5rem] text-muted-foreground mt-0.5">Click to check eligibility →</p>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 rounded-md bg-muted/30 border border-border/40">
                    <p className="text-[0.6rem] font-semibold mb-1">📋 RoRo Workflow Steps (what happens next):</p>
                    <ol className="text-[0.55rem] text-muted-foreground space-y-0.5 list-decimal list-inside">
                      <li>Trade request submitted with RO_RO transport mode + corridor code</li>
                      <li>Seller provides quote (EXW price + RoRo-specific logistics: vessel schedule booking, roll-on charges)</li>
                      <li>Contract signed → USTN generated → <strong>Customs broker assignment</strong> (both buyer + seller must designate their broker)</li>
                      <li>Fee payment (Stage 1: government fees, SGTX fee, CargoX ACID, Nafeza SAD)</li>
                      <li>RoRo vessel schedule booking → cargo manifest created → <strong>Roll-On</strong> milestone (cargo driven onto vessel)</li>
                      <li>Vessel departs → IN_TRANSIT → arrives at destination port</li>
                      <li><strong>Roll-Off</strong> milestone (cargo driven off vessel) → Customs clearance (broker files import declaration)</li>
                      <li>Delivery to buyer → Stage 2 payment → Settlement</li>
                    </ol>
                  </div>
                </div>
              )}
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
                  <div className={`p-2 rounded text-[0.6rem] ${valid ? "bg-success/10 text-success" : "bg-warning/10 text-warning"}`}>
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
                  <Label className="text-[0.6rem]">Bill of Lading Type (Part 3.12)</Label>
                  <div className="grid grid-cols-2 gap-1">
                    <button onClick={() => { setBlType("ORIGINAL"); setOriginalDocsRequired(true); }} className={`p-1.5 rounded border text-xs flex flex-col items-center gap-0.5 ${blType === "ORIGINAL" ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                      <FileText className="w-3 h-3" />
                      <span className="font-medium">Original B/L</span>
                      <span className="text-[0.5rem] text-muted-foreground">Paper · couriered</span>
                    </button>
                    <button onClick={() => { setBlType("EB_L"); setOriginalDocsRequired(false); }} className={`p-1.5 rounded border text-xs flex flex-col items-center gap-0.5 ${blType === "EB_L" ? "bg-gold/15 border-gold text-gold" : "bg-background/40 border-border hover:bg-muted/30"}`}>
                      <FileCheck className="w-3 h-3" />
                      <span className="font-medium">Electronic (eB/L)</span>
                      <span className="text-[0.5rem] text-muted-foreground">Paperless · MLETR 2017</span>
                    </button>
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
            {/* Part 4.9a — Optional Buyer-Requested Services (extra fees) */}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/30 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" /> Optional Buyer-Requested Services (Part 4.9a)
                  </p>
                  <p className="text-[0.55rem] text-muted-foreground mt-0.5">Add third-party QC inspection + lab tests at buyer's request. Pesticides panel is FREE (baseline food-safety); microbiology + heavy metals are extra-cost.</p>
                </div>
                <Badge variant="outline" className="text-[0.55rem] px-1.5 py-0 text-gold border-gold/40">
                  Total: ${optionalServicesTotalUsd.toFixed(0)}
                </Badge>
              </div>

              {/* Third-party QC inspection toggle */}
              <div className="p-2 rounded-lg bg-background/40 border border-border/60">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={optionalQcInspection}
                      onChange={e => setOptionalQcInspection(e.target.checked)}
                      className="rounded"
                    />
                    <ShieldCheck className="w-3.5 h-3.5 text-gold" />
                    <span className="font-medium">Third-Party QC Inspection</span>
                    <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-success border-emerald-500/40 ml-1">+${qcInspectionFeeUsd}</Badge>
                  </Label>
                  {optionalQcInspection && (
                    <Select value={qcInspectionType} onValueChange={v => setQcInspectionType(v)}>
                      <SelectTrigger className="h-7 text-[0.65rem] w-36"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRE_SHIPMENT" className="text-xs">Pre-Shipment</SelectItem>
                        <SelectItem value="LOADING" className="text-xs">Loading</SelectItem>
                        <SelectItem value="DISCHARGE" className="text-xs">Discharge</SelectItem>
                      </SelectContent>
                    </Select>
                  )}
                </div>
                {optionalQcInspection && (
                  <div className="flex items-center gap-2 mt-1">
                    <Label className="text-[0.6rem] text-muted-foreground">Inspection fee (USD):</Label>
                    <Input
                      type="number"
                      value={qcInspectionFeeUsd}
                      onChange={e => setQcInspectionFeeUsd(Number(e.target.value) || 0)}
                      className="h-7 text-xs w-24"
                      min={0}
                    />
                    <span className="text-[0.55rem] text-muted-foreground italic">Estimated — confirmed on quote acceptance</span>
                  </div>
                )}
                {/* CG-7 fix — QC provider picker (replaces hardcoded GTID). */}
                {optionalQcInspection && (
                  <div className="flex items-center gap-2 mt-1">
                    <Label className="text-[0.6rem] text-muted-foreground whitespace-nowrap">QC provider:</Label>
                    {qcProviders.length === 0 ? (
                      <span className="text-[0.55rem] text-muted-foreground italic">
                        No verified QC providers found — the platform will assign the first available.
                      </span>
                    ) : (
                      <Select value={qcProviderGtid} onValueChange={v => setQcProviderGtid(v)}>
                        <SelectTrigger className="h-7 text-[0.65rem] min-w-[14rem] flex-1"><SelectValue placeholder="Select QC provider" /></SelectTrigger>
                        <SelectContent>
                          {qcProviders.map((p: any) => (
                            <SelectItem key={p.gtid} value={p.gtid} className="text-xs">
                              {p.legalName} · {p.country}{p.city ? ` · ${p.city}` : ""} · trust {p.trustScore}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
                {!optionalQcInspection && (
                  <p className="text-[0.55rem] text-muted-foreground">No third-party QC inspection requested. Seller's standard pre-shipment inspection applies.</p>
                )}
              </div>

              {/* Lab tests selection */}
              <div className="p-2 rounded-lg bg-background/40 border border-border/60">
                <div className="flex items-center justify-between mb-1.5">
                  <Label className="text-xs flex items-center gap-1.5">
                    <FlaskConical className="w-3.5 h-3.5 text-gold" />
                    <span className="font-medium">Laboratory Tests</span>
                  </Label>
                  <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-muted-foreground">
                    {labTestsRequested.filter((t: any) => t.selected).length} selected · ${labTestsFeeUsd} extra
                  </Badge>
                </div>
                <div className="space-y-1">
                  {LAB_TEST_CATALOG.map((test) => {
                    const existing = labTestsRequested.find((t: any) => t.testType === test.testType);
                    const selected = existing?.selected === true;
                    return (
                      <label key={test.testType} className={`flex items-start gap-2 p-1.5 rounded border cursor-pointer transition-colors ${selected ? "bg-gold/10 border-gold/30" : "bg-background/30 border-border/40 hover:bg-muted/20"}`}>
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={e => {
                            if (existing) {
                              setLabTestsRequested(prev => prev.map((t: any) => t.testType === test.testType ? { ...t, selected: e.target.checked } : t));
                            } else {
                              setLabTestsRequested(prev => [...prev, { ...test, selected: e.target.checked }]);
                            }
                          }}
                          className="rounded mt-0.5"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs font-medium">{test.label}</span>
                            <code className="text-[0.5rem] font-mono text-muted-foreground">{test.testType}</code>
                            {test.isExtraCost ? (
                              <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-warning border-amber-500/40">+${test.feeUsd}</Badge>
                            ) : (
                              <Badge variant="outline" className="text-[0.5rem] px-1 py-0 text-success border-emerald-500/40">FREE</Badge>
                            )}
                          </div>
                          <p className="text-[0.55rem] text-muted-foreground mt-0.5">{test.description}</p>
                        </div>
                      </label>
                    );
                  })}
                </div>
                <p className="text-[0.5rem] text-muted-foreground italic mt-1.5">
                  ℹ️ Pesticide panel is mandatory (Codex Alimentarius MRLs) and free. Microbiology + heavy metals are buyer-optional add-ons with extra fees.
                </p>
                {/* CG-7 fix — LAB provider picker (replaces hardcoded GTID).
                    Shown only when at least one lab test is selected. */}
                {labTestsRequested.some((t: any) => t.selected) && (
                  <div className="flex items-center gap-2 mt-2">
                    <Label className="text-[0.6rem] text-muted-foreground whitespace-nowrap">Lab provider:</Label>
                    {labProviders.length === 0 ? (
                      <span className="text-[0.55rem] text-muted-foreground italic">
                        No verified LAB providers found — the platform will assign the first available.
                      </span>
                    ) : (
                      <Select value={labProviderGtid} onValueChange={v => setLabProviderGtid(v)}>
                        <SelectTrigger className="h-7 text-[0.65rem] min-w-[14rem] flex-1"><SelectValue placeholder="Select lab provider" /></SelectTrigger>
                        <SelectContent>
                          {labProviders.map((p: any) => (
                            <SelectItem key={p.gtid} value={p.gtid} className="text-xs">
                              {p.legalName} · {p.country}{p.city ? ` · ${p.city}` : ""} · trust {p.trustScore}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                )}
              </div>

              {/* Optional services total */}
              <div className="flex items-center justify-between p-2 rounded-lg bg-gold/10 border border-gold/30">
                <span className="text-xs font-semibold text-gold">Optional Services Total (estimated)</span>
                <span className="text-sm font-bold text-gold">${optionalServicesTotalUsd.toFixed(0)} <span className="text-[0.55rem] font-normal text-muted-foreground">USD</span></span>
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
                        <div key={i} className={`text-[0.6rem] flex items-start gap-1.5 ${m.severity === "BLOCKER" ? "text-destructive" : m.severity === "WARNING" ? "text-warning" : "text-muted-foreground"}`}>
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
            <div className="p-3 rounded-lg bg-muted/20 border border-border"><div className="flex items-center justify-between mb-2"><Label className="text-xs flex items-center gap-2"><input type="checkbox" checked={multiShipment} onChange={e => setMultiShipment(e.target.checked)} className="rounded" /> Request multi-shipment contract</Label>{multiShipment && <div className="flex gap-1"><Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-info" onClick={() => bulkShiftDates(7)}>+7d</Button><Button size="sm" variant="ghost" className="h-7 text-[0.6rem] text-info" onClick={() => bulkShiftDates(-7)}>-7d</Button><Button size="sm" variant="outline" onClick={addShipment} className="h-7 text-xs">+ Add</Button></div>}</div>{multiShipment ? <p className="text-[0.6rem] text-muted-foreground mb-2">Split the order across multiple delivery dates / ports. Each shipment references containers configured in Step 3.</p> : <p className="text-[0.6rem] text-muted-foreground">Single shipment — all containers delivered together to the destination port.</p>}{multiShipment && shipments.map((s, i) => <div key={s.id} className="grid grid-cols-2 sm:grid-cols-6 gap-2 mb-2 p-2 rounded-lg bg-background/40"><div><Label className="text-[0.6rem]">Shipment #{i + 1}</Label></div><div><Label className="text-[0.6rem]">Delivery Date</Label><Input type="date" value={s.deliveryDate} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, deliveryDate: e.target.value } : x))} className="h-8 text-xs" /></div><div><Label className="text-[0.6rem]">Port</Label><Input value={s.port} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, port: e.target.value } : x))} className="h-8 text-xs" /></div><div><Label className="text-[0.6rem]">Containers</Label><Input type="number" value={s.containers} onChange={e => setShipments(ss => ss.map(x => x.id === s.id ? { ...x, containers: Number(e.target.value) } : x))} className="h-8 text-xs" /></div><div className="flex items-end gap-1"><button className="text-[0.6rem] text-gold hover:underline pb-1" onClick={() => toast.info("Commodity override modal opens per shipment")}>Edit</button><button className="text-[0.6rem] text-info hover:underline pb-1" onClick={() => cloneShipment(s.id)}>Clone</button>{shipments.length > 1 && <button onClick={() => removeShipment(s.id)} aria-label={`Remove shipment ${i + 1}`} className="text-[0.6rem] text-destructive pb-1">✕</button>}</div></div>)}</div>
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
            {attribution && <div className="p-3 rounded-lg bg-info/5 border border-info/20"><p className="text-[0.6rem] tracking-widest text-info uppercase font-semibold mb-1">Marketplace Attribution</p><p className="text-xs text-foreground/80">This trade will be attributed to <span className="font-semibold">{attribution.partnerName || attribution.partner}</span> because you first connected through them on {attribution.firstTradeDate?.slice(0, 10) || attribution.date}. Revenue share: {attribution.revenueSharePct || attribution.revenueShare}%. You have 72 hours to dispute.</p><div className="flex gap-2 mt-2"><Button size="sm" variant="outline" className="h-7 text-xs">Continue</Button><Button size="sm" variant="ghost" className="h-7 text-xs text-warning" onClick={() => setShowDisputeModal(true)}>Dispute Attribution</Button></div></div>}
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
              <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Step 10 — Compliance Gates (SGTX Brain AI)</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Run the SGTX Brain pre-submission compliance gate: sanctions screening (buyer + seller), force majeure corridor assessment, EUDR (Regulation (EU) 2023/1115), and CBAM (Regulation (EU) 2023/956). A DENY verdict blocks submission until the blocking conditions are cleared.</p>
            </div>
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 flex items-start gap-2"><Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" /><p className="text-xs text-foreground/80">The Brain aggregates four modules — <span className="font-mono">autoCheckCompliance</span>, <span className="font-mono">assessEudr</span>, <span className="font-mono">assessTradeForceMajeure</span>, <span className="font-mono">screenForSanctions</span> — and returns an ALLOW / CONDITIONAL / DENY verdict with per-module conditions. The verdict is non-binding on the trade record (no audit entry is written here) but the DENY verdict will block the Submit button on the next step.</p></div>

            {/* Run gate button */}
            <div className="flex items-center gap-3">
              <Button onClick={runComplianceCheck} disabled={complianceLoading} className="bg-gold-gradient text-sovereign">
                {complianceLoading ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Running compliance gate…</> : <><ShieldCheck className="w-3.5 h-3.5 mr-1.5" />Run Compliance Gate</>}
              </Button>
              {complianceResult && !complianceLoading && (
                <Badge variant="outline" className={`text-[0.6rem] font-bold ${complianceBlocked ? "bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/30" : complianceWarned ? "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30" : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"}`}>
                  {complianceResult.overallVerdict}
                </Badge>
              )}
              {complianceResult && typeof complianceResult.aiConfidence === "number" && (
                <span className="text-[0.6rem] text-muted-foreground">AI confidence: {(complianceResult.aiConfidence * 100).toFixed(0)}%</span>
              )}
            </div>

            {/* Error callout */}
            {complianceError && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-red-500/30 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold">Compliance gate failed to evaluate</p>
                  <p className="text-[0.7rem] mt-0.5">{complianceError}</p>
                  <p className="text-[0.6rem] mt-1 text-muted-foreground">The trade can still be submitted (the gate is advisory on this error) but you should contact compliance before proceeding.</p>
                </div>
              </div>
            )}

            {/* Per-module checklist (rendered once a result is available) */}
            {complianceResult && !complianceLoading && (() => {
              const r = complianceResult;
              // Derive a per-module pass/condition/fail status for the checklist.
              // Module order matches the API response shape: sanctions, forceMajeure, eudr, cbam.
              const sanctionsClear = r.sanctions?.clear ?? true;
              const sanctionsHits = [
                ...(r.sanctions?.buyer?.hits || []),
                ...(r.sanctions?.seller?.hits || []),
              ];
              const fmAffected = r.forceMajeure?.affected === true;
              const fmAction = r.forceMajeure?.recommendedAction; // proceed | suspend | cancel
              const eudrApplicable = r.eudr?.applicable === true;
              const eudrUnmet = (r.eudr?.conditions || []).filter((c: any) => c.status === "unmet").length;
              const cbamApplicable = r.cbam?.applicable === true;
              const cbamUnmet = r.cbam?.condition && r.cbam.condition.status === "unmet";

              type ModuleStatus = "pass" | "warn" | "fail";
              const modules: { name: string; description: string; status: ModuleStatus; detail: string; conditions?: any[] }[] = [
                {
                  name: "Sanctions Screening",
                  description: "OFAC SDN · EU Consolidated · UK OFSI · UN 1267 (buyer + seller)",
                  status: sanctionsClear ? "pass" : "fail",
                  detail: sanctionsClear
                    ? `Counterparties cleared (${r.sanctions?.buyer ? "buyer screened" : "buyer skipped"}; ${r.sanctions?.seller ? "seller screened" : "seller skipped"}). Provider: ${r.sanctions?.buyer?.provider || r.sanctions?.seller?.provider || "seed-list"}.`
                    : `Sanctions hit detected — ${sanctionsHits.length} match(es). Top: ${sanctionsHits[0]?.entityName ?? "unknown"} (${sanctionsHits[0]?.list ?? "?"}, score ${sanctionsHits[0]?.matchScore ?? "?"}).`,
                },
                {
                  name: "Force Majeure",
                  description: `Corridor assessment · ${containers[0]?.originCountry || "?"} → ${containers[0]?.destCountry || "?"}`,
                  status: !fmAffected ? "pass" : fmAction === "cancel" ? "fail" : "warn",
                  detail: !fmAffected
                    ? "No active force majeure event on this corridor."
                    : `${(r.forceMajeure.events || []).length} overlapping event(s). Top: ${r.forceMajeure.events[0]?.title || "?"} (severity ${r.forceMajeure.events[0]?.severity || "?"}). Recommended action: ${fmAction}.`,
                  conditions: (r.forceMajeure?.conditions || []).filter((c: any) => c.status === "unmet"),
                },
                {
                  name: "EUDR (Regulation (EU) 2023/1115)",
                  description: eudrApplicable
                    ? `Applicable · commodity: ${r.eudr.commodity} · risk: ${r.eudr.riskLevel} · deadline ${r.eudr.deadline}`
                    : "Not applicable (HS code outside Annex I, EU destination not met, or intra-EU trade)",
                  status: !eudrApplicable ? "pass" : eudrUnmet > 0 ? "warn" : "pass",
                  detail: eudrApplicable
                    ? `${eudrUnmet} unmet condition(s) — geo-location data, Due Diligence Statement, deforestation-free declaration, legality, risk-mitigation.`
                    : "EUDR scope test: HS code is not in Annex I (cattle/cocoa/coffee/oil_palm/rubber/soy/wood & derivatives), destination is outside the EU, or this is intra-EU trade (out of scope).",
                  conditions: r.eudr?.conditions || [],
                },
                {
                  name: "CBAM (Regulation (EU) 2023/956)",
                  description: cbamApplicable
                    ? `Applicable · ${r.cbam.cbamGood} · definitive period begins 2026-01-01`
                    : "Not applicable (HS code is not a CBAM Annex I good, or destination is outside the EU)",
                  status: !cbamApplicable ? "pass" : cbamUnmet ? "warn" : "pass",
                  detail: cbamApplicable
                    ? cbamUnmet
                      ? "Production carbon emissions declaration required (kg CO2e/tonne). Not yet declared — provide `carbonIntensityKgCO2e` to clear."
                      : `Carbon declaration on file (${r.cbam.carbonIntensityKgCO2e} kg CO2e/tonne).`
                    : "CBAM scope test: HS code does not match any Annex I heading (cement, fertilisers, iron & steel, aluminium, hydrogen, ammonia, electricity), or destination is outside the EU customs territory.",
                  conditions: r.cbam?.condition ? [r.cbam.condition] : [],
                },
              ];

              return (
                <div className="space-y-3">
                  {/* Per-module checklist */}
                  <div className="space-y-2">
                    {modules.map((m) => (
                      <ComplianceGateRow
                        key={m.name}
                        name={m.name}
                        description={m.description}
                        status={m.status}
                        detail={m.detail}
                        conditions={m.conditions}
                      />
                    ))}
                  </div>

                  {/* BrainDecisionPanel — overall verdict */}
                  <BrainDecisionPanel
                    decision={{
                      verdict: r.overallVerdict,
                      aiConfidence: typeof r.aiConfidence === "number" ? r.aiConfidence : undefined,
                      brainModule: r.brainModule || "autoCheckCompliance",
                      conditions: r.conditions || [],
                      denialReason: r.overall?.denialReason,
                    }}
                    subtitle="Pre-submission compliance gate · New Trade Request wizard"
                    // For DENY, force expand; for ALLOW, default collapse; for CONDITIONAL, default expand.
                    defaultCollapsed={r.overallVerdict === "ALLOW"}
                  />

                  {/* Hard-block banner */}
                  {complianceBlocked && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-red-500/30 text-xs text-destructive flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold">Cannot proceed — compliance gate failed.</p>
                        <p className="text-[0.7rem] mt-0.5">The Brain returned a DENY verdict. The Submit button on Step 11 is disabled. Clear the blocking condition(s) above and re-run the compliance gate to retry.</p>
                      </div>
                    </div>
                  )}
                  {complianceWarned && (
                    <div className="p-3 rounded-lg bg-warning/10 border border-amber-500/30 text-xs text-warning flex items-start gap-2">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="font-semibold">Conditional — submission still allowed.</p>
                        <p className="text-[0.7rem] mt-0.5">The Brain flagged one or more unmet conditions. You may proceed to submit, but the trade will carry these conditions on its audit trail and downstream gates (B/L issuance, customs clearance, settlement) may require additional evidence.</p>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Empty-state hint before the first run */}
            {!complianceResult && !complianceLoading && !complianceError && (
              <div className="p-3 rounded-lg bg-muted/20 border border-border text-xs text-muted-foreground">
                <p>Click <strong>Run Compliance Gate</strong> to evaluate this trade against the four SGTX Brain compliance modules. The gate is <strong>advisory until you click Run</strong> — no audit entry is written until you submit on the next step.</p>
                <p className="mt-1">Inputs passed to the gate (derived from prior steps):</p>
                <ul className="mt-1 ml-4 list-disc text-[0.65rem] space-y-0.5">
                  <li>HS code: <span className="font-mono">{hsCode || "—"}</span></li>
                  <li>Origin: <span className="font-mono">{containers[0]?.originCountry || "—"}</span> · Destination: <span className="font-mono">{containers[0]?.destCountry || "—"}</span></li>
                  <li>Seller: <span className="font-mono">{selectedSeller?.name || "—"}</span> · Buyer: <span className="font-mono">European Importer GmbH</span></li>
                  <li>Commodity: <span className="font-mono">{productName || "—"}</span> · Weight: <span className="font-mono">{totalGrossKg ? `${(totalGrossKg / 1000).toFixed(2)} t` : "—"}</span></li>
                </ul>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(9)}>← Back</Button>
              <Button onClick={() => setStep(11)} className="bg-gold-gradient text-sovereign" disabled={complianceBlocked}>
                {complianceBlocked ? "Cannot proceed — compliance gate failed" : "Continue →"}
              </Button>
            </div>
          </div>
        )}
        {step === 11 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="w-4 h-4 text-gold" /> Step 11 — Governor Pre-Screen & Submit</h3>
              <p className="text-[0.65rem] text-muted-foreground mt-0.5">Run the Governor's expanded pre-screen (Part 4.15: permissions, jurisdiction, dual-use, transport, insurance, settlement, delivery window, documentation completeness), review the full trade summary, then submit to the seller.</p>
            </div>
            <div className="p-3 rounded-lg bg-muted/30 border border-border"><div className="flex items-center justify-between mb-1.5"><p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Governor Pre-Screen (Part 4.15 · expanded · A4 + A2 constraining)</p>{!prescreen && !prescreenLoading && <button onClick={runPrescreen} className="text-[0.65rem] text-gold hover:underline">Run AI pre-screen</button>}{prescreenProvider && <span className="text-[0.55rem] text-muted-foreground">via {prescreenProvider}</span>}</div>{prescreenLoading ? <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Running expanded pre-screen (G1U1-G1U33)…</div> : prescreen ? <div className="space-y-1 text-xs"><div className="flex items-center gap-2">{prescreen.verdict === "ALLOW" ? <CheckCircle2 className="w-3 h-3 text-success" /> : <AlertTriangle className="w-3 h-3 text-warning" />}<span className="font-semibold" style={{ color: prescreen.verdict === "ALLOW" ? "#10b981" : "#fbbf24" }}>Verdict: {prescreen.verdict}</span></div>{prescreen.conditions?.map((c: string, i: number) => <div key={i} className="ml-5 text-warning">⚠ {c}</div>)}</div> : <p className="text-xs text-muted-foreground">Expanded 33-gate matrix: permissions, jurisdiction, ports, incoterm, transport mode/equipment (G1U18-G1U20), insurance (G1U20a-d), settlement (G1U9-G1U17), criticality (G1U11a-e), documentation (G1U21-G1U22), delivery window (G1U20), packing consistency, dual-use, GNN sanctions.</p>}</div>
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
              <div className={`p-3 rounded-lg border ${submitResult.ok ? "bg-success/10 border-emerald-500/30" : "bg-destructive/10 border-red-500/30"}`}>
                {submitResult.ok ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-success"><CheckCircle2 className="w-4 h-4" /><p className="text-sm font-semibold">Trade Request Submitted!</p></div>
                    <p className="text-xs text-foreground/80">{submitResult.message}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">USTN: {submitResult.ustn}</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-destructive"><AlertTriangle className="w-4 h-4" /><p className="text-sm">{submitResult.error}</p></div>
                )}
              </div>
            )}
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/30 flex items-start gap-2"><Sparkles className="w-4 h-4 text-gold mt-0.5 flex-shrink-0" /><p className="text-xs">On submit: trade request sent to seller (priority 75 Smart Inbox). USTN generated at contract lock — not now. No data re-entry across phases. Draft auto-saved every 30s.</p></div>
            {/* FIX-10: compliance gate status banner — mirrors the verdict from
                Step 10 so the operator sees the Brain's view right before submit.
                When complianceBlocked === true, the Submit button below is disabled
                and the banner explains why. */}
            {complianceResult && (
              <div className={`p-3 rounded-lg border text-xs flex items-start gap-2 ${complianceBlocked ? "bg-destructive/10 border-red-500/30 text-destructive" : complianceWarned ? "bg-warning/10 border-amber-500/30 text-warning" : "bg-success/10 border-emerald-500/30 text-success"}`}>
                {complianceBlocked ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : complianceWarned ? <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" />}
                <div>
                  <p className="font-semibold">Compliance gate verdict: {complianceResult.overallVerdict}</p>
                  <p className="text-[0.7rem] mt-0.5">
                    {complianceBlocked
                      ? "Submission is blocked. Return to Step 10 (Compliance Gates) to clear the blocking condition(s) and re-run the gate."
                      : complianceWarned
                        ? "Conditions attached — submission allowed but the trade will carry these conditions on its audit trail."
                        : "All compliance modules cleared — no blockers."}
                    {" AI confidence: "}
                    {typeof complianceResult.aiConfidence === "number" ? `${(complianceResult.aiConfidence * 100).toFixed(0)}%` : "n/a"}.
                  </p>
                </div>
              </div>
            )}
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(10)}>← Back</Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || complianceBlocked}
                className="bg-gold-gradient text-sovereign"
              >
                {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</>
                  : complianceBlocked ? <><AlertTriangle className="w-3.5 h-3.5 mr-1.5" />Cannot submit — compliance gate failed</>
                  : <><Send className="w-3.5 h-3.5 mr-1.5" />Submit Trade Request</>}
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ComplianceGateRow — small collapsible row used by the New Trade Request
// wizard's Compliance Gates step (Step 10, FIX-10). Renders a single
// compliance module's pass/condition/fail status with expandable details
// (per-condition status icons ✓ / ⚠).
// ─────────────────────────────────────────────────────────────────────────────
function ComplianceGateRow({
  name,
  description,
  status,
  detail,
  conditions,
}: {
  name: string;
  description: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  conditions?: { condition_id: string; label: string; status: "met" | "unmet" }[];
}) {
  const [open, setOpen] = useState(false);
  const palette =
    status === "pass"
      ? { Icon: CheckCircle2, color: "#10b981", bg: "rgba(16,185,129,0.05)", border: "rgba(16,185,129,0.25)", label: "Pass" }
      : status === "warn"
        ? { Icon: AlertTriangle, color: "#f59e0b", bg: "rgba(245,158,11,0.06)", border: "rgba(245,158,11,0.30)", label: "Condition" }
        : { Icon: AlertTriangle, color: "#ef4444", bg: "rgba(239,68,68,0.06)", border: "rgba(239,68,68,0.35)", label: "Fail" };
  const SIcon = palette.Icon;
  const unmetCount = (conditions || []).filter((c) => c.status === "unmet").length;
  const hasDetails = (conditions && conditions.length > 0) || detail;

  return (
    <div
      className="rounded-lg border p-2.5 transition-colors"
      style={{ background: palette.bg, borderColor: palette.border }}
    >
      <button
        type="button"
        onClick={() => hasDetails && setOpen((o) => !o)}
        className={`w-full flex items-center gap-2 text-left ${hasDetails ? "cursor-pointer" : "cursor-default"}`}
        aria-expanded={open}
      >
        <SIcon className="w-4 h-4 flex-shrink-0" style={{ color: palette.color }} />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold leading-tight">{name}</p>
          <p className="text-[0.6rem] text-muted-foreground leading-tight mt-0.5">{description}</p>
        </div>
        <Badge
          variant="outline"
          className="text-[0.55rem] font-bold whitespace-nowrap"
          style={{ color: palette.color, borderColor: palette.border }}
        >
          {palette.label}
        </Badge>
        {conditions && conditions.length > 0 && (
          <span className="text-[0.55rem] text-muted-foreground whitespace-nowrap">
            {conditions.length - unmetCount}/{conditions.length}
          </span>
        )}
        {hasDetails && (
          <span className="text-muted-foreground flex-shrink-0">
            {open ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </span>
        )}
      </button>
      {open && hasDetails && (
        <div className="mt-2 pl-6 space-y-1.5">
          {detail && (
            <p className="text-[0.65rem] text-foreground/80 leading-snug">{detail}</p>
          )}
          {conditions && conditions.length > 0 && (
            <ul className="space-y-1">
              {conditions.map((c) => (
                <li key={c.condition_id} className="flex items-start gap-1.5 text-[0.65rem]">
                  {c.status === "met" ? (
                    <CheckCircle2 className="w-3 h-3 text-success flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-3 h-3 text-warning flex-shrink-0 mt-0.5" />
                  )}
                  <span className="text-foreground/80 leading-snug">{c.label}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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

// ============ MODE B/C RFQ PICKER (multi-GTID + RFQ-for-all) ============
// Phase 2.6 — Replaces the old single-GTID `<Select>` in the QuoteBuilder
// logistics table. For each Mode B (LSP) and Mode C (ship line) service,
// the seller can either:
//   (a) Select one or more specific GTIDs to receive the RFQ, OR
//   (b) Toggle "RFQ to all verified <LSPs|ship lines>" — broadcasts the
//       RFQ to every verified tenant of that type.
// Both options are mutually exclusive per service (enabling RFQ-for-all
// clears the specific selection and vice versa).
export function ModeRfqPicker({
  mode,
  service,
  tenants,
  selectedGtids,
  rfqAll,
  onSelectedChange,
  onRfqAllChange,
  onClear,
}: {
  mode: "B" | "C";
  service: string;
  tenants: any[];
  selectedGtids: string[];
  rfqAll: boolean;
  onSelectedChange: (gtids: string[]) => void;
  onRfqAllChange: (v: boolean) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);
  const tenantLabel = mode === "B" ? "LSP" : "ship line";
  const tenantLabelPlural = mode === "B" ? "LSPs" : "ship lines";
  const accentColor = mode === "B" ? "#f59e0b" : "#a855f7"; // amber for B, purple for C
  const verifiedCount = tenants.length;

  const toggleGtid = (gtid: string) => {
    if (selectedGtids.includes(gtid)) {
      onSelectedChange(selectedGtids.filter((g) => g !== gtid));
    } else {
      onSelectedChange([...selectedGtids, gtid]);
    }
  };

  // Trigger button summary
  let triggerLabel: string;
  let triggerColor: string;
  if (rfqAll) {
    triggerLabel = `📡 RFQ to all ${verifiedCount} ${tenantLabelPlural}`;
    triggerColor = accentColor;
  } else if (selectedGtids.length > 0) {
    triggerLabel = `${selectedGtids.length} ${tenantLabel}${selectedGtids.length === 1 ? "" : "s"} selected`;
    triggerColor = accentColor;
  } else {
    triggerLabel = `— Assign ${tenantLabel} GTID(s) —`;
    triggerColor = "#9ca3af"; // gray-400
  }

  return (
    <div className="flex flex-col gap-1 min-w-[170px]">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="h-7 px-2 text-[0.6rem] rounded-md border border-border bg-background hover:bg-muted/40 transition-colors flex items-center justify-between gap-1 text-left"
            style={{ color: triggerColor, borderColor: (rfqAll || selectedGtids.length > 0) ? `${accentColor}55` : undefined }}
          >
            <span className="truncate flex-1">{triggerLabel}</span>
            <ChevronRight className={`w-3 h-3 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
          </button>
        </PopoverTrigger>
        <PopoverContent className="w-80 p-0" align="start">
          <div className="p-3 border-b border-border">
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <p className="text-xs font-semibold flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full" style={{ background: accentColor }} />
                  Mode {mode} — {service}
                </p>
                <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                  {verifiedCount} verified {tenantLabelPlural} available
                </p>
              </div>
              {(rfqAll || selectedGtids.length > 0) && (
                <button
                  type="button"
                  onClick={() => { onClear(); setOpen(false); }}
                  className="text-[0.6rem] text-muted-foreground hover:text-destructive transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Two-choice toggle: Specific vs RFQ-for-all */}
            <div className="grid grid-cols-2 gap-1.5 p-1 rounded-md bg-muted/30">
              <button
                type="button"
                onClick={() => onRfqAllChange(false)}
                className={`px-2 py-1.5 rounded text-[0.65rem] font-medium transition-colors ${!rfqAll ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                style={!rfqAll ? { color: accentColor } : undefined}
              >
                <CheckCheck className="w-3 h-3 inline mr-1" />
                Select specific
              </button>
              <button
                type="button"
                onClick={() => onRfqAllChange(true)}
                className={`px-2 py-1.5 rounded text-[0.65rem] font-medium transition-colors ${rfqAll ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                style={rfqAll ? { color: accentColor } : undefined}
              >
                <Megaphone className="w-3 h-3 inline mr-1" />
                RFQ to all
              </button>
            </div>
          </div>

          {rfqAll ? (
            <div className="p-3">
              <div className="p-2.5 rounded-lg border border-dashed" style={{ borderColor: `${accentColor}55`, background: `${accentColor}08` }}>
                <p className="text-[0.65rem] font-semibold mb-1" style={{ color: accentColor }}>
                  📡 Broadcast RFQ to all {verifiedCount} verified {tenantLabelPlural}
                </p>
                <p className="text-[0.6rem] text-muted-foreground leading-relaxed">
                  When the quote is submitted, a separate ServiceQuotation RFQ will be created for every verified {tenantLabel} tenant. Each provider sees the RFQ in their portal&apos;s inbox and can respond with their fee. You pick the best response(s) later.
                </p>
              </div>
              {verifiedCount === 0 && (
                <p className="text-[0.6rem] text-destructive mt-2">⚠ No verified {tenantLabelPlural} are registered on the platform yet.</p>
              )}
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto scroll-gold">
              {verifiedCount === 0 ? (
                <div className="p-4 text-center text-[0.65rem] text-muted-foreground">
                  No verified {tenantLabelPlural} available.
                </div>
              ) : (
                tenants.map((t) => {
                  const checked = selectedGtids.includes(t.gtid);
                  return (
                    <label
                      key={t.gtid}
                      className="flex items-start gap-2 px-3 py-2 hover:bg-muted/40 cursor-pointer border-b border-border/30 last:border-0"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleGtid(t.gtid)}
                        className="mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-[0.7rem] font-medium truncate">{t.legalName}</p>
                        <p className="text-[0.55rem] text-muted-foreground font-mono truncate">{t.gtid}</p>
                        <p className="text-[0.55rem] text-muted-foreground mt-0.5">
                          {t.country} · {t.city || "—"} · trust {t.trustScore || "—"}
                        </p>
                      </div>
                    </label>
                  );
                })
              )}
            </div>
          )}

          {selectedGtids.length > 0 && !rfqAll && (
            <div className="p-2 border-t border-border bg-muted/20">
              <p className="text-[0.55rem] text-muted-foreground mb-1">
                {selectedGtids.length} {tenantLabel}{selectedGtids.length === 1 ? "" : "s"} will receive the RFQ on submit
              </p>
              <div className="flex flex-wrap gap-1">
                {selectedGtids.slice(0, 4).map((g) => {
                  const t = tenants.find((x) => x.gtid === g);
                  return (
                    <Badge key={g} variant="outline" className="text-[0.5rem]" style={{ color: accentColor, borderColor: `${accentColor}55` }}>
                      {t?.legalName?.slice(0, 18) || g.slice(0, 18)}…
                    </Badge>
                  );
                })}
                {selectedGtids.length > 4 && (
                  <Badge variant="outline" className="text-[0.5rem] text-muted-foreground">
                    +{selectedGtids.length - 4} more
                  </Badge>
                )}
              </div>
            </div>
          )}
        </PopoverContent>
      </Popover>
      {rfqAll ? (
        <span className="text-[0.55rem] flex items-center gap-0.5" style={{ color: accentColor }}>
          <Megaphone className="w-2.5 h-2.5" /> Broadcast pending
        </span>
      ) : selectedGtids.length > 0 ? (
        <span className="text-[0.55rem] flex items-center gap-0.5" style={{ color: accentColor }}>
          <Clock className="w-2.5 h-2.5" /> {selectedGtids.length} RFQ{selectedGtids.length === 1 ? "" : "s"} pending
        </span>
      ) : (
        <span className="text-[0.55rem] text-muted-foreground">No {tenantLabel} assigned</span>
      )}
    </div>
  );
}

export function QuoteBuilderScreen({ data }: { data?: Data }) {
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

  // Selected trade for quoting (from Pending Requests → "Prepare Quote" button)
  const sellerGtid = data?.tenant?.gtid || "SGTX-EG-TRD-002139-7F3A";
  const pendingRequests: any[] = (data?.tradesAsSeller || []).filter((t: any) => t.status === "INITIATED");
  const [selectedUstn, setSelectedUstn] = useState<string>("");
  const queryClient = useQueryClient();

  // Auto-select the first pending trade if none selected
  useEffect(() => {
    if (!selectedUstn && pendingRequests.length > 0) {
      setSelectedUstn(pendingRequests[0].ustn);
    }
  }, [pendingRequests, selectedUstn]);

  const selectedTrade = pendingRequests.find((t: any) => t.ustn === selectedUstn) || pendingRequests[0];

  const handleSubmitQuote = async () => {
    if (submitting || !packingLocked || missingMandatory.length > 0) return;
    if (!selectedUstn) { toast.error("No trade selected — go to Pending Requests tab first"); return; }
    setSubmitting(true); setSubmitResult(null);
    try {
      // Calculate total cartons and weight from packing layers
      const totalCartons = layers.reduce((s, l) => s + l.cartonsPerLayer * l.numLayers, 0);
      const tradeWeight = selectedTrade?.netWeightKg || selectedTrade?.grossWeightKg || 20000;
      const exwTotal = Number(exwPrice) * (priceUnit === "kg" ? tradeWeight : priceUnit === "ton" ? tradeWeight / 1000 : totalCartons);
      const logisticsTotal = Object.entries(modeA).reduce((s, [, v]) => s + Number(v), 0) + Object.values(selectedQuotes).reduce((s: number, q: any) => s + (q?.totalFee || 0), 0);
      const sgtxFee = Math.round((exwTotal + logisticsTotal) * 0.015 * 100) / 100;
      const totalQuote = exwTotal + logisticsTotal + sgtxFee;

      const res = await fetch("/api/sgtx/quote/submit", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: selectedUstn,
          sellerGtid,
          exwPrice: Number(exwPrice), priceUnit, loadingCountry, loadingPort,
          packingLayers: layers, totalCartons,
          logisticsModeA: modeA, incoterm,
          exwTotal, logisticsTotal, sgtxFee, totalQuote,
          carbonFootprint,
          selectedQuotes: Object.values(selectedQuotes),
          // Mode B/C GTID assignments + RFQ summary (Phase 2.6 — multi-GTID + RFQ-for-all)
          logisticsModeGtids: Object.fromEntries([
            ...Object.entries(modeBGtids)
              .filter(([, g]) => g && g.length > 0)
              .map(([s, gtids]) => [s, { gtids, mode: "B", status: "PENDING_RFQ", rfqAll: false }]),
            ...Object.entries(modeBRfqAll)
              .filter(([, v]) => v === true)
              .map(([s]) => [s, { gtids: [], mode: "B", status: "PENDING_RFQ", rfqAll: true }]),
            ...Object.entries(modeCGtids)
              .filter(([, g]) => g && g.length > 0)
              .map(([s, gtids]) => [s, { gtids, mode: "C", status: "PENDING_RFQ", rfqAll: false }]),
            ...Object.entries(modeCRfqAll)
              .filter(([, v]) => v === true)
              .map(([s]) => [s, { gtids: [], mode: "C", status: "PENDING_RFQ", rfqAll: true }]),
          ]),
          logisticsRfqSummary: {
            pendingCount:
              Object.values(modeBGtids).reduce((s, g) => s + (g?.length || 0), 0) +
              Object.values(modeCGtids).reduce((s, g) => s + (g?.length || 0), 0) +
              Object.values(modeBRfqAll).filter(Boolean).length * lspTenants.length +
              Object.values(modeCRfqAll).filter(Boolean).length * shipTenants.length,
            respondedCount: 0,
            lockedCount: 0,
            fullQuotePending:
              Object.values(modeBGtids).some(g => g && g.length > 0) ||
              Object.values(modeCGtids).some(g => g && g.length > 0) ||
              Object.values(modeBRfqAll).some(Boolean) ||
              Object.values(modeCRfqAll).some(Boolean),
          },
        }),
      });
      const d = await res.json();
      if (d.ok) {
        setSubmitResult({ ok: true, message: d.message || "Quote submitted to buyer.", quoteId: d.quoteId });
        toast.success("Quote submitted to buyer (priority 75 Smart Inbox)");
        // Invalidate dashboard to refresh trade status
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
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
  // Mode B/C GTID assignment — per-service specific LSP / ship-line GTIDs.
  // Phase 2.6 — Multi-GTID + RFQ-for-All support:
  //   modeBGtids[s]: string[]   → list of specific LSP GTIDs to receive the RFQ
  //   modeBRfqAll[s]: boolean   → if true, broadcast RFQ to ALL verified LSPs
  //   modeCGtids[s]: string[]   → list of specific ship-line GTIDs to receive the RFQ
  //   modeCRfqAll[s]: boolean   → if true, broadcast RFQ to ALL verified ship lines
  // Both options are available for both modes; the seller can mix-and-match
  // per service (e.g., Trucking → RFQ to all LSPs; Cold Storage → 2 specific LSPs).
  const [modeBGtids, setModeBGtids] = useState<Record<string, string[]>>({});
  const [modeBRfqAll, setModeBRfqAll] = useState<Record<string, boolean>>({});
  const [modeCGtids, setModeCGtids] = useState<Record<string, string[]>>({});
  const [modeCRfqAll, setModeCRfqAll] = useState<Record<string, boolean>>({});
  const [lspTenants, setLspTenants] = useState<any[]>([]);
  const [shipTenants, setShipTenants] = useState<any[]>([]);

  // Fetch LSP + ship-line tenants on mount (for Mode B/C GTID picker)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/sgtx/tenants");
        const all = await res.json();
        if (!mounted) return;
        setLspTenants((all || []).filter((t: any) => t.type === "LSP" && t.lifecycleState === "VERIFIED"));
        setShipTenants((all || []).filter((t: any) => t.type === "SHIP" && t.lifecycleState === "VERIFIED"));
      } catch {}
    })();
    return () => { mounted = false; };
  }, []);

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

      {/* Trade Selector — choose which pending request to quote */}
      <Card className="p-4 border-gold/20">
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm flex items-center gap-2"><ShoppingBag className="w-4 h-4 text-gold" /> Select Trade to Quote</h3>
          <Badge variant="outline" className="text-[0.55rem] text-gold border-gold/30">{pendingRequests.length} pending</Badge>
        </div>
        {pendingRequests.length === 0 ? (
          <EmptyState icon={ShoppingBag} title="No pending requests" description="When a buyer submits a trade request targeting you, it will appear here for quote preparation." />
        ) : (
          <Select value={selectedUstn} onValueChange={setSelectedUstn}>
            <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select a trade request..." /></SelectTrigger>
            <SelectContent>
              {pendingRequests.map((t: any) => (
                <SelectItem key={t.ustn} value={t.ustn} className="text-xs">
                  {t.commodity} · {t.buyer?.legalName || t.buyerGtid} · {t.ustn.slice(0, 24)}…
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </Card>

      {/* 3B.3.1 Read-only Buyer Request View */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-2">3B.3.1 Buyer Request (Read-Only)</h3>
        {selectedTrade ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs p-2 rounded-lg bg-muted/20">
          <div><span className="text-[0.6rem] text-muted-foreground">Commodity:</span> {selectedTrade.commodity || "—"} ({selectedTrade.commodityHs || "—"})</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Incoterm:</span> {selectedTrade.incoterm || "—"}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Containers:</span> {selectedTrade.containerCount || 1}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Multi-shipment:</span> {selectedTrade.multiShipment ? "Yes" : "No"}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Net Weight:</span> {fmtKg(selectedTrade.netWeightKg || 0)}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Route:</span> {selectedTrade.originCountry || "—"} → {selectedTrade.destCountry || "—"}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Buyer:</span> {selectedTrade.buyer?.legalName || selectedTrade.buyerGtid}</div>
          <div><span className="text-[0.6rem] text-muted-foreground">Cold Chain:</span> {selectedTrade.coldChain ? "Yes" : "No"}</div>
        </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-2">Select a trade above to view buyer request details</p>
        )}
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
                <div className="flex items-center justify-between text-xs"><span className="text-destructive">${band.low?.toFixed(2)}</span><div className="flex-1 mx-2 h-1.5 rounded-full bg-gradient-to-r from-red-500/40 via-emerald-500/40 to-red-500/40 relative"><div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-gold border-2 border-background" style={{ left: `calc(${bandPos}% - 6px)` }} /></div><span className="text-destructive">${band.high?.toFixed(2)}</span></div>
                <div className="flex items-center gap-2 mt-1"><p className="text-[0.65rem] text-muted-foreground flex-1">${exw.toFixed(2)}/kg is <span className={withinBand ? "text-success font-semibold" : "text-warning font-semibold"}>{withinBand ? "within" : "outside"} band</span>. {band.rationale}</p>{band && <button onClick={() => { setExwPrice(String(band.mid)); onPriceChange(String(band.mid)); }} className="text-[0.6rem] bg-gold/15 text-gold px-2 py-0.5 rounded hover:bg-gold/25">Use fair price</button>}</div>
              </>
            : <p className="text-[0.65rem] text-muted-foreground">30-day market chart + AI fair price band (FAO, USDA, World Bank feeds).</p>}
          </div>
          {/* Price deviation */}
          {deviation && deviation.requires_justification && (
            <div className="p-3 rounded-lg bg-warning/10 border border-amber-500/30">
              <p className="text-[0.6rem] text-warning font-semibold uppercase mb-1">⚠ Price Deviation: {deviation.deviation_pct}% from band — Justification Required</p>
              <Input value={justification} onChange={(e) => setJustification(e.target.value)} placeholder="Enter justification (min 20 chars)…" className="h-8 text-xs" />
              {justification.length < 20 && <p className="text-[0.55rem] text-warning mt-1">{justification.length}/20 chars</p>}
            </div>
          )}
          {deviation && !deviation.requires_justification && deviation.advisory && <p className="text-[0.65rem] text-warning">⚠ {deviation.advisory}</p>}
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
                <button onClick={() => setLayers(ls => ls.filter(x => x.id !== l.id))} aria-label={`Remove layer pattern ${i + 1}`} className="text-[0.6rem] text-destructive">✕</button>
              </div>
            ))}
            <button onClick={() => setLayers(ls => [...ls, { id: Date.now(), cartonsPerLayer: 40, numLayers: 1, layerHeight: 15, orientation: "standard" }])} className="text-[0.6rem] text-gold hover:underline">+ Add Layer Pattern</button>
          </div>
          {/* 3B.3.4.2 Optimise solver + 3B.3.4.3 Collaborative + 3B.3.4.4 3D viewer */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button size="sm" variant="outline" className="h-7 text-xs"><Cpu className="w-3 h-3 mr-1" /> Optimise (OR-Tools)</Button>
            <Badge variant="outline" className="text-[0.5rem] text-info">🔄 Collaborative (Yjs)</Badge>
            <Badge variant="outline" className="text-[0.5rem] text-purple-400">📦 3D Viewer + Heatmap</Badge>
          </div>
          {/* Ecological advisor */}
          <div className="p-2 rounded-lg bg-success/5 border border-emerald-500/20">
            <div className="flex items-center justify-between mb-1"><p className="text-[0.6rem] text-success font-semibold uppercase">🌱 Ecological Advisor (A1)</p>{!ecoResult && !ecoLoading && <button onClick={loadEco} className="text-[0.6rem] text-success hover:underline">Get suggestions</button>}</div>
            {ecoLoading ? <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground"><Loader2 className="w-3 h-3 animate-spin" /> Analyzing…</div>
            : ecoResult?.alternatives ? <div className="space-y-1">{ecoResult.alternatives.map((a: any, i: number) => {
              const isApplied = appliedEco === a.material;
              return (
                <div key={i} className="flex items-center gap-2 text-[0.65rem]">
                  <span className="flex-1">{a.material}: {a.description}</span>
                  <Badge variant="outline" className="text-[0.5rem] text-success">-{a.carbon_saving_kg}kg CO2</Badge>
                  {isApplied ? (
                    <Badge variant="outline" className="text-[0.5rem] text-success border-emerald-500/40">✓ Applied</Badge>
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
                      className="text-success hover:underline"
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
            {carbonFootprint.cbamApplicable && <p className="text-[0.6rem] text-warning mt-1">⚠ CBAM report required for EU-bound shipment</p>}
          </div>
          {/* Lock packing */}
          {!packingLocked ? <Button onClick={() => setPackingLocked(true)} size="sm" className="w-full bg-gold-gradient text-sovereign h-8"><Lock className="w-3 h-3 mr-1.5" /> Lock Packing Plan</Button>
          : <div className="p-2 rounded-lg bg-success/5 border border-emerald-500/20 text-xs text-success flex items-center gap-2"><CheckCircle2 className="w-3 h-3" /> Packing plan locked · SSCC18 barcodes generated · Loom hash recorded</div>}
          {/* 3B.3.3.6 Post-Lock Price Watch (Background, A2) */}
          {packingLocked && (
            <div className="p-2 rounded-lg bg-info/5 border border-info/20 text-xs">
              <p className="text-[0.6rem] tracking-widest text-info uppercase font-semibold mb-0.5">Post-Lock Price Watch (A2 · background)</p>
              <p className="text-[0.65rem] text-muted-foreground">NATS subscription monitors daily market price changes. If market moves &gt;10% from locked price, you'll receive a Smart Inbox item: "Market price moved +12% — reopen pricing?" with one-click "Reopen" button.</p>
              <div className="flex items-center gap-2 mt-1"><Badge variant="outline" className="text-[0.5rem] text-info">🔄 NATS live</Badge><Badge variant="outline" className="text-[0.5rem]">Threshold: ±10%</Badge></div>
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
          <ResponsiveTable minWidth={720}><table className="w-full text-xs">
            <thead><tr className="border-b border-border text-[0.6rem] text-muted-foreground uppercase"><th className="text-left px-2 py-1.5">Service</th><th className="text-left px-2 py-1.5">Mandatory?</th><th className="text-left px-2 py-1.5">Mode A (Manual)</th><th className="text-left px-2 py-1.5">Mode B (RFQ — assign LSP GTID)</th><th className="text-left px-2 py-1.5">Mode C (Ship Line — assign SHIP GTID)</th><th className="text-left px-2 py-1.5">Selected</th></tr></thead>
            <tbody>
              {incotermServices.map(s => (
                <tr key={s.service} className="border-b border-border/40">
                  <td className="px-2 py-2 font-medium">{s.service}</td>
                  <td className="px-2 py-2">{s.mandatory ? <Badge variant="outline" className="text-[0.5rem] text-destructive border-red-500/30">MANDATORY</Badge> : <span className="text-[0.6rem] text-muted-foreground">Optional</span>}</td>
                  <td className="px-2 py-2"><Input value={modeA[s.service] || ""} onChange={e => setModeA(m => ({ ...m, [s.service]: e.target.value }))} className="h-7 text-xs w-24" placeholder="$ amount" /></td>
                  <td className="px-2 py-2">
                    <ModeRfqPicker
                      mode="B"
                      service={s.service}
                      tenants={lspTenants}
                      selectedGtids={modeBGtids[s.service] || []}
                      rfqAll={modeBRfqAll[s.service] === true}
                      onSelectedChange={(gtids) => setModeBGtids(m => ({ ...m, [s.service]: gtids }))}
                      onRfqAllChange={(v) => {
                        setModeBRfqAll(m => ({ ...m, [s.service]: v }));
                        if (v) setModeBGtids(m => ({ ...m, [s.service]: [] }));
                      }}
                      onClear={() => {
                        setModeBGtids(m => ({ ...m, [s.service]: [] }));
                        setModeBRfqAll(m => ({ ...m, [s.service]: false }));
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">
                    <ModeRfqPicker
                      mode="C"
                      service={s.service}
                      tenants={shipTenants}
                      selectedGtids={modeCGtids[s.service] || []}
                      rfqAll={modeCRfqAll[s.service] === true}
                      onSelectedChange={(gtids) => setModeCGtids(m => ({ ...m, [s.service]: gtids }))}
                      onRfqAllChange={(v) => {
                        setModeCRfqAll(m => ({ ...m, [s.service]: v }));
                        if (v) setModeCGtids(m => ({ ...m, [s.service]: [] }));
                      }}
                      onClear={() => {
                        setModeCGtids(m => ({ ...m, [s.service]: [] }));
                        setModeCRfqAll(m => ({ ...m, [s.service]: false }));
                      }}
                    />
                  </td>
                  <td className="px-2 py-2">{selectedQuotes[s.service] ? <Badge variant="outline" className="text-[0.5rem] text-success">${selectedQuotes[s.service].totalFee}</Badge> : modeA[s.service] ? <Badge variant="outline" className="text-[0.5rem]">${modeA[s.service]}</Badge> : <span className="text-[0.6rem] text-destructive">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table></ResponsiveTable>
        </div>
        {/* Mode B/C pending RFQ summary banner — seller's full quote is pending
            until RFQs come back from assigned LSPs / ship lines. */}
        {(() => {
          const pendingB = Object.values(modeBGtids).reduce((s, g) => s + (g?.length || 0), 0)
            + Object.values(modeBRfqAll).filter(Boolean).length * lspTenants.length;
          const pendingC = Object.values(modeCGtids).reduce((s, g) => s + (g?.length || 0), 0)
            + Object.values(modeCRfqAll).filter(Boolean).length * shipTenants.length;
          const totalPending = pendingB + pendingC;
          if (totalPending === 0) return null;
          return (
            <div className="p-3 rounded-lg bg-warning/10 border border-amber-500/30 text-xs">
              <p className="text-[0.65rem] text-warning font-semibold uppercase mb-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Seller Full Quote Pending — {totalPending} logistics RFQ{totalPending === 1 ? "" : "s"} outstanding
              </p>
              <p className="text-[0.6rem] text-muted-foreground">
                {pendingB > 0 && <span>Mode B: {pendingB} LSP RFQ{pendingB === 1 ? "" : "s"} pending (assigned GTIDs will receive RFQ on submit). </span>}
                {pendingC > 0 && <span>Mode C: {pendingC} ship-line quote{pendingC === 1 ? "" : "s"} pending. </span>}
                The total quote shown to the buyer is provisional — final logistics costs will be locked when all RFQs respond. Mode A manual entries are not affected.
              </p>
            </div>
          );
        })()}
        {/* Mode C quotes */}
        {shipQuotes.length > 0 && (
          <div className="p-2 rounded-lg bg-muted/20">
            <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Compare Quotes Panel — All Modes (A+B+C) Unified</p>
            <div className="space-y-1">
              {/* Mode A entries */}
              {incotermServices.filter(s => modeA[s.service]).map(s => (
                <div key={s.service} className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-info border-info/30">Mode A</Badge>
                  <span className="flex-1">{s.service}</span>
                  <span className="font-bold text-gold">${modeA[s.service]}</span>
                  {selectedQuotes[s.service] ? <span className="text-[0.6rem] text-success">✓ Selected</span> : <span className="text-[0.6rem] text-muted-foreground">Manual entry</span>}
                </div>
              ))}
              {/* Mode C entries */}
              {shipQuotes.map((q, i) => (
                <div key={q.id} className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-purple-400 border-purple-500/30">Mode C</Badge>
                  <span className="font-mono text-[0.6rem] text-muted-foreground">{q.shipperLineGtid.slice(0, 18)}…</span>
                  <span className="flex-1">Base: ${q.baseFee} · Add-ons: {q.addOnFees ? JSON.parse(q.addOnFees).TRUCKING || 0 : 0} + {q.addOnFees ? JSON.parse(q.addOnFees).CUSTOMS_BROKER || 0 : 0}</span>
                  <span className="font-bold text-gold">${q.totalFee}</span>
                  <button onClick={() => selectQuote(q.id, "Ocean freight")} className="text-[0.6rem] text-success hover:underline">Select</button>
                </div>
              ))}
              {/* Mode B placeholder */}
              {rfqSent && (
                <div className="flex items-center gap-2 p-1.5 rounded bg-background/40 text-xs">
                  <Badge variant="outline" className="text-[0.5rem] text-warning border-amber-500/30">Mode B</Badge>
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
        {missingMandatory.length > 0 && <div className="p-2 rounded-lg bg-destructive/10 border border-red-500/30 text-xs text-destructive flex items-center gap-2"><AlertTriangle className="w-3 h-3" /> Missing mandatory services: {missingMandatory.map(s => s.service).join(", ")}</div>}
        {/* Mode B clarification request */}
        {rfqSent && (
          <div className="p-2 rounded-lg bg-info/5 border border-info/20 text-xs">
            <p className="text-[0.6rem] text-info font-semibold uppercase mb-1">Mode B: RFQ Details & Clarification</p>
            <div className="grid grid-cols-2 gap-2 mb-2">
              <div><span className="text-[0.6rem] text-muted-foreground">Pickup Address:</span> Cairo Cold Store, 5th District, New Cairo</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Distribution:</span> <Badge variant="outline" className="text-[0.5rem] text-warning">Directed</Badge> <Badge variant="outline" className="text-[0.5rem] text-info">Anonymous Broadcast</Badge></div>
              <div><span className="text-[0.6rem] text-muted-foreground">Route Score (A1):</span> 87/100 (route + commodity + service type)</div>
              <div><span className="text-[0.6rem] text-muted-foreground">Multi-stop VRP:</span> OR-Tools optimiser active</div>
            </div>
            <p className="text-[0.65rem] text-muted-foreground">Providers can click "Ask Clarification" (dangerous goods, access restrictions). Seller answers via Smart Inbox (one click per answer). All Q&A logged.</p>
            <button className="text-[0.6rem] text-info hover:underline mt-1">View 0 clarification requests</button>
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
              <span className={p.cost_delta_usd >= 0 ? "text-destructive" : "text-success"}>${p.cost_delta_usd > 0 ? "+" : ""}{p.cost_delta_usd}</span>
              <Badge variant="outline" className="text-[0.5rem]">{p.congestion_level}</Badge>
              {isUsed ? (
                <Badge variant="outline" className="text-[0.5rem] text-success border-emerald-500/40">✓ Selected</Badge>
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
          <button onClick={() => setMultiShipResponse("accept")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "accept" ? "bg-success/20 text-success border border-emerald-500/40" : "bg-muted/50 text-muted-foreground"}`}>Accept as proposed</button>
          <button onClick={() => setMultiShipResponse("modify")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "modify" ? "bg-warning/20 text-warning border border-amber-500/40" : "bg-muted/50 text-muted-foreground"}`}>Propose modifications</button>
          <button onClick={() => setMultiShipResponse("reject")} className={`px-3 py-1.5 rounded-lg text-xs ${multiShipResponse === "reject" ? "bg-destructive/20 text-destructive border border-red-500/40" : "bg-muted/50 text-muted-foreground"}`}>Reject (single shipment)</button>
        </div>
      </Card>

      {/* 3B.3.8 SGTX Fee Calculation */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.3.8 SGTX Fee Calculation (Automatic)</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">EXW Total</p><p className="font-bold">${exwTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-muted/20"><p className="text-[0.6rem] text-muted-foreground">Logistics Total</p><p className="font-bold">${logisticsTotal.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-gold/10 border border-gold/20"><p className="text-[0.6rem] text-gold">SGTX Fee (1.5%)</p><p className="font-bold text-gold">${sgtxFee.toLocaleString()}</p></div>
          <div className="p-2 rounded-lg bg-success/10 border border-emerald-500/20"><p className="text-[0.6rem] text-success">Final Price</p><p className="font-bold text-success">${finalPrice.toLocaleString()}</p></div>
        </div>
      </Card>

      {/* 3B.3.9 Submit */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-sm">3B.3.9 Submit Quote</h3>
            <p className="text-[0.65rem] text-muted-foreground mt-0.5">Governor validates: mandatory fields, packing locked, mandatory services selected, fee calculated.</p>
            {!packingLocked && <p className="text-[0.65rem] text-warning mt-1">⚠ Packing plan must be locked first</p>}
            {missingMandatory.length > 0 && <p className="text-[0.65rem] text-destructive mt-1">⚠ Missing {missingMandatory.length} mandatory services</p>}
            {(() => {
              const pendingB = Object.values(modeBGtids).reduce((s, g) => s + (g?.length || 0), 0)
                + Object.values(modeBRfqAll).filter(Boolean).length * lspTenants.length;
              const pendingC = Object.values(modeCGtids).reduce((s, g) => s + (g?.length || 0), 0)
                + Object.values(modeCRfqAll).filter(Boolean).length * shipTenants.length;
              const totalPending = pendingB + pendingC;
              if (totalPending === 0) return null;
              return (
                <p className="text-[0.65rem] text-warning mt-1 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Full quote pending — {totalPending} logistics RFQ{totalPending === 1 ? "" : "s"} outstanding ({pendingB} Mode B · {pendingC} Mode C). Buyer will see provisional total; final costs lock when RFQs respond.
                </p>
              );
            })()}
          </div>
          <Button className="bg-gold-gradient text-sovereign" disabled={!packingLocked || missingMandatory.length > 0 || submitting} onClick={handleSubmitQuote}>
            {submitting ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Submitting…</> : <><Send className="w-3.5 h-3.5 mr-1.5" />Submit Quote</>}
          </Button>
        </div>
        {submitResult && (
          <div className={`mt-3 p-2 rounded-lg border ${submitResult.ok ? "bg-success/10 border-emerald-500/30" : "bg-destructive/10 border-red-500/30"}`}>
            {submitResult.ok ? (
              <div className="text-xs">
                <p className="text-success font-semibold flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> Quote Submitted!</p>
                <p className="text-foreground/80 mt-0.5">{submitResult.message}</p>
                {submitResult.quoteId && <p className="text-[0.6rem] text-muted-foreground font-mono">Quote ID: {submitResult.quoteId}</p>}
              </div>
            ) : (
              <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> {submitResult.error}</p>
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
        <Card className="p-6 text-center text-sm text-muted-foreground">
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
                  <Badge variant="outline" className="text-[0.6rem] text-warning border-amber-500/30 whitespace-nowrap">
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
  // Phase 2.5 — Buyer Submission Form modal state
  const [showSubmissionForm, setShowSubmissionForm] = useState(false);
  const [submissionUstn, setSubmissionUstn] = useState<string | null>(null);

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
  // Phase 2.5 — Opening accept now opens the Buyer Submission Form modal first.
  // The buyer must submit consignee + notify parties + document dispatch
  // addresses as part of acceptance. On submit, the modal calls /api/sgtx/quote/accept
  // with the buyerSubmission payload and the trade status moves to BUYER_SUBMITTED.
  const acceptQuote = async (ustn: string | null, _deliveryPort?: string) => {
    if (!ustn) {
      setMutualConfirmed(true);
      toast.info("No real quote to accept", { description: "When a seller submits a quote, it will appear here." });
      return;
    }
    // Open the buyer submission form modal — the actual accept happens on submit.
    setSubmissionUstn(ustn);
    setShowSubmissionForm(true);
  };

  // Called when the BuyerSubmissionForm modal successfully submits
  const onBuyerSubmissionSubmitted = (_submissionId: string) => {
    setShowSubmissionForm(false);
    if (submissionUstn) {
      setAcceptedUstn(submissionUstn);
      setMutualConfirmed(true);
    }
    queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    // Auto-navigate to contract tab after a short delay
    setTimeout(() => setActiveTab("contract"), 800);
  };

  // Quick accept (no submission form) — kept for edge cases / re-acceptance.
  // Not used in the main flow but available if needed.
  const quickAccept = async (ustn: string | null, deliveryPort?: string) => {
    if (!ustn) {
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
        <Card className="p-6 text-center text-sm text-muted-foreground">
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
              <ResponsiveTable minWidth={640}><table className="w-full text-sm">
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
                            <Badge variant="outline" className="text-success border-emerald-500/30 text-[0.6rem] h-7 px-2"><CheckCircle2 className="w-3 h-3 mr-1" />Accepted</Badge>
                          ) : (
                            <Button size="sm" className="h-7 bg-gold-gradient text-sovereign text-xs" disabled={isAccepting} onClick={() => acceptQuote(opt.ustn, opt.port)}>
                              {isAccepting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Opening…</> : <><CheckCircle2 className="w-3 h-3 mr-1" />Accept & Submit Details</>}
                            </Button>
                          )}
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openNegotiation(opt.ustn, "negotiate")}>Negotiate</Button>
                          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => openNegotiation(opt.ustn, "amend")}>Amend</Button>
                        </div></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table></ResponsiveTable>
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
            <Card className="p-4 bg-gold/5 border border-gold/20">
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
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><div className="flex justify-between"><span className="font-medium text-info">Seller →</span><span className="text-[0.55rem] text-muted-foreground">10:30 UTC</span></div><p>$105,700 (CIF Alexandria)</p><Badge variant="outline" className="text-[0.5rem] mt-1">PENDING</Badge></div>
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><div className="flex justify-between"><span className="font-medium text-warning">Buyer →</span><span className="text-[0.55rem] text-muted-foreground">11:15 UTC</span></div><p>Counter: $104,000</p><p className="text-[0.55rem] text-muted-foreground">Reason: Market index shows $4.90/kg avg</p></div>
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
                {counterReason.length < 20 && counterReason.length > 0 && <p className="text-[0.5rem] text-warning">{counterReason.length}/20 chars required</p>}
                <div className="flex flex-wrap gap-1.5">
                  <Button size="sm" className="h-7 bg-gold-gradient text-sovereign text-xs" disabled={counterReason.length < 20}>Send Counter</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Accept</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Reject</Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs">Request Info</Button>
                  {/* 3B.4.2.2 Partial Acceptance */}
                  <Button size="sm" variant="outline" className="h-7 text-xs text-info" onClick={() => setShowPartialAccept(true)}>Partial Acceptance</Button>
                  {/* 3B.4.2.4 Deadline Extension */}
                  <Button size="sm" variant="outline" className="h-7 text-xs text-warning" onClick={() => setShowExtension(true)}>Request Extension</Button>
                </div>
                <p className="text-[0.55rem] text-muted-foreground">⏱ Offer expires in 2h 45m</p>
              </div>
            </div>
            {/* Right: Trade Room Chat */}
            <div className="space-y-2">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase">Trade Room Chat (tagged to offers)</p>
              <div className="space-y-1.5 max-h-48 overflow-y-auto scroll-gold">
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><p className="font-medium text-warning">Buyer</p><p>Can you match $104,000? Market index supports it.</p></div>
                <div className="p-2 rounded-lg bg-muted/20 text-xs"><p className="font-medium text-info">Seller</p><p>We can offer $104,500 with Damietta port instead. Saves you $510.</p></div>
              </div>
              <p className="text-[0.5rem] text-muted-foreground">🧠 A1 auto-translates messages into each party's language</p>
            </div>
          </div>
          {/* 3B.4.2.5 Visual Diff for Amendments */}
          {showDiff && negotiationMode === "amend" && (
            <div className="mt-3 p-3 rounded-lg bg-muted/20 border border-border">
              <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-2">Visual Diff — Proposed Amendments</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded bg-destructive/5 border border-red-500/20"><p className="text-[0.6rem] text-destructive">Original</p><p>Port: Alexandria</p><p>Delivery: 2026-05-04</p><p>Price: $105,700</p></div>
                <div className="p-2 rounded bg-success/5 border border-emerald-500/20"><p className="text-[0.6rem] text-success">Proposed</p><p>Port: Damietta</p><p>Delivery: 2026-05-06</p><p>Price: $105,190</p></div>
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
        <Card className="p-4 border-emerald-500/30 bg-success/5">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-success" />
            <div className="flex-1">
              <p className="font-semibold text-sm text-success">Mutual Confirmation Recorded</p>
              <p className="text-xs text-muted-foreground">Pre-contract snapshot created (immutable JSONB) · Governor decision_type = 'mutual_confirmation' · Cannot be undone without mutual cancellation</p>
            </div>
            <Button className="bg-gold-gradient text-sovereign h-8" onClick={() => setActiveTab("contract")}>Proceed to Contract</Button>
          </div>
        </Card>
      )}

      {/* Phase 2.5 — Buyer Submission Form modal */}
      {showSubmissionForm && submissionUstn && (
        <BuyerSubmissionForm
          data={data}
          ustn={submissionUstn}
          onClose={() => {
            setShowSubmissionForm(false);
            setSubmissionUstn(null);
          }}
          onSubmitted={onBuyerSubmissionSubmitted}
        />
      )}
    </div>
  );
}

// ============ BUYER SUBMISSION FORM (Phase 2.5 — Post-Quote Detail Capture) ============
// After the buyer receives the seller's quote, they must submit:
//   1. Consignee (auto-filled from buyer GTID, with "same as buyer" checkbox)
//   2. Notify parties (1 or more — B/L notify field)
//   3. Document dispatch addresses (1 or more — different docs go to different places)
// On submit, POST /api/sgtx/quote/accept with buyerSubmission payload → status BUYER_SUBMITTED.
export function BuyerSubmissionForm({
  data,
  ustn,
  onClose,
  onSubmitted,
}: {
  data: Data;
  ustn: string;
  onClose: () => void;
  onSubmitted: (submissionId: string) => void;
}) {
  const queryClient = useQueryClient();
  const tenant = data?.tenant || {};
  const buyerGtid = tenant.gtid || "";
  const buyerLegalName = tenant.legalName || buyerGtid;
  const buyerCountry = tenant.country || "";
  const buyerCity = tenant.city || "";
  const buyerAddress = buyerCity ? `${buyerCity}, ${buyerCountry}` : buyerCountry;

  // Consignee state
  const [consigneeSameAsBuyer, setConsigneeSameAsBuyer] = useState(true);
  const [consignee, setConsignee] = useState({
    name: "",
    address: "",
    country: "",
    city: "",
    postalCode: "",
    phone: "",
    email: "",
    taxId: "",
  });

  // Notify parties (start with one blank)
  const [notifyParties, setNotifyParties] = useState([
    { name: "", address: "", country: "", city: "", postalCode: "", phone: "", email: "" },
  ]);

  // Document dispatch addresses (start with one blank)
  const [dispatchAddresses, setDispatchAddresses] = useState([
    {
      label: "Headquarters",
      address: "",
      country: "",
      city: "",
      postalCode: "",
      attention: "",
      phone: "",
      documentTypes: [] as string[],
      courier: "DHL",
    },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);

  // All selectable document types
  const ALL_DOCUMENT_TYPES = [
    "Original Bill of Lading",
    "eB/L (Electronic B/L)",
    "Commercial Invoice",
    "Packing List",
    "Certificate of Origin",
    "Phytosanitary Certificate",
    "Health Certificate",
    "Fumigation Certificate",
    "Insurance Certificate",
    "Inspection Certificate (QC)",
    "Lab Report",
    "Customs Declaration",
    "Contract",
    "Logistics Addendum",
  ];

  const COURIERS = ["DHL", "UPS", "FEDEX", "OTHER"];

  // Validation
  const consigneeValid = consigneeSameAsBuyer || (consignee.name.trim() && consignee.address.trim());
  const notifyPartiesValid =
    notifyParties.length > 0 &&
    notifyParties.every((p) => p.name.trim() && p.address.trim());
  const dispatchValid =
    dispatchAddresses.length > 0 &&
    dispatchAddresses.every((d) => d.address.trim() && d.documentTypes.length > 0);
  const formValid = consigneeValid && notifyPartiesValid && dispatchValid;

  const addNotifyParty = () =>
    setNotifyParties((p) => [...p, { name: "", address: "", country: "", city: "", postalCode: "", phone: "", email: "" }]);
  const removeNotifyParty = (i: number) =>
    setNotifyParties((p) => p.filter((_, idx) => idx !== i));
  const updateNotifyParty = (i: number, field: string, value: string) =>
    setNotifyParties((p) => p.map((n, idx) => (idx === i ? { ...n, [field]: value } : n)));

  const addDispatchAddress = () =>
    setDispatchAddresses((p) => [
      ...p,
      { label: `Address ${p.length + 1}`, address: "", country: "", city: "", postalCode: "", attention: "", phone: "", documentTypes: [], courier: "DHL" },
    ]);
  const removeDispatchAddress = (i: number) =>
    setDispatchAddresses((p) => p.filter((_, idx) => idx !== i));
  const updateDispatchAddress = (i: number, field: string, value: any) =>
    setDispatchAddresses((p) => p.map((d, idx) => (idx === i ? { ...d, [field]: value } : d)));
  const toggleDocumentType = (i: number, docType: string) => {
    setDispatchAddresses((p) =>
      p.map((d, idx) => {
        if (idx !== i) return d;
        const has = d.documentTypes.includes(docType);
        return {
          ...d,
          documentTypes: has
            ? d.documentTypes.filter((t) => t !== docType)
            : [...d.documentTypes, docType],
        };
      }),
    );
  };

  // Submit handler — POST /api/sgtx/quote/accept with buyerSubmission payload
  const submit = async () => {
    setTouched(true);
    if (!formValid) {
      toast.error("Please complete all required fields", {
        description: !consigneeValid
          ? "Consignee name and address are required (or check 'same as buyer')."
          : !notifyPartiesValid
          ? "Each notify party needs at least a name and address."
          : "Each dispatch address needs an address and at least one document type.",
      });
      return;
    }
    setSubmitting(true);
    try {
      const resolvedConsignee = consigneeSameAsBuyer
        ? {
            name: buyerLegalName,
            address: buyerAddress,
            country: buyerCountry,
            city: buyerCity,
            postalCode: "",
            phone: "",
            email: "",
            taxId: buyerGtid,
          }
        : consignee;

      const res = await fetch("/api/sgtx/quote/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          buyerSubmission: {
            consigneeSameAsBuyer,
            consignee: resolvedConsignee,
            notifyParties,
            documentDispatchAddresses: dispatchAddresses,
          },
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Submission failed");
      toast.success("Buyer submission received — proceeding to contract signing", {
        description: `Submission ID: ${d.submissionId} · Trade status: ${d.tradeStatus}`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      onSubmitted(d.submissionId);
    } catch (e: any) {
      toast.error("Could not submit", { description: e?.message || "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <Card className="max-w-5xl w-full p-4 sm:p-6 my-4 max-h-[95vh] overflow-y-auto scroll-gold">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <ClipboardList className="w-5 h-5 text-gold" />
              Buyer Submission — Consignee, Notify Parties & Document Dispatch
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              USTN <span className="font-mono">{ustn?.slice(0, 32)}…</span> · Submitted by buyer · Auto-filled from your GTID
            </p>
          </div>
          <Button size="sm" variant="ghost" aria-label="Close dialog" onClick={onClose}>✕</Button>
        </div>

        {/* Buyer info auto-filled banner */}
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-3 mb-4">
          <p className="text-[0.6rem] tracking-widest text-gold uppercase font-semibold mb-2 flex items-center gap-1">
            <User className="w-3 h-3" /> Buyer (Auto-filled from GTID)
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div>
              <p className="text-[0.55rem] text-muted-foreground uppercase">Legal Name</p>
              <p className="font-medium">{buyerLegalName}</p>
            </div>
            <div>
              <p className="text-[0.55rem] text-muted-foreground uppercase">GTID</p>
              <p className="font-mono text-[0.65rem]">{buyerGtid}</p>
            </div>
            <div>
              <p className="text-[0.55rem] text-muted-foreground uppercase">Country</p>
              <p className="font-medium">{buyerCountry}</p>
            </div>
            <div>
              <p className="text-[0.55rem] text-muted-foreground uppercase">City</p>
              <p className="font-medium">{buyerCity || "—"}</p>
            </div>
          </div>
        </div>

        {/* Consignee section */}
        <div className="rounded-lg border border-border p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Building2 className="w-4 h-4 text-gold" /> Consignee
            </h3>
            <label className="flex items-center gap-2 cursor-pointer text-xs">
              <Checkbox
                checked={consigneeSameAsBuyer}
                onCheckedChange={(v) => setConsigneeSameAsBuyer(!!v)}
              />
              <span>Same as buyer</span>
            </label>
          </div>
          {consigneeSameAsBuyer ? (
            <div className="rounded-md bg-muted/30 p-3 text-xs text-muted-foreground">
              <p>Consignee will be set to the buyer:</p>
              <p className="font-medium text-foreground mt-1">{buyerLegalName} — {buyerAddress}</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <Label className="text-[0.65rem]">Consignee Name *</Label>
                <Input
                  value={consignee.name}
                  onChange={(e) => setConsignee((c) => ({ ...c, name: e.target.value }))}
                  placeholder="Consignee legal name"
                  className="h-8 text-xs"
                />
              </div>
              <div className="md:col-span-2">
                <Label className="text-[0.65rem]">Address *</Label>
                <Input
                  value={consignee.address}
                  onChange={(e) => setConsignee((c) => ({ ...c, address: e.target.value }))}
                  placeholder="Street address"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">Country</Label>
                <Input
                  value={consignee.country}
                  onChange={(e) => setConsignee((c) => ({ ...c, country: e.target.value }))}
                  placeholder="DE"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">City</Label>
                <Input
                  value={consignee.city}
                  onChange={(e) => setConsignee((c) => ({ ...c, city: e.target.value }))}
                  placeholder="Hamburg"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">Postal Code</Label>
                <Input
                  value={consignee.postalCode}
                  onChange={(e) => setConsignee((c) => ({ ...c, postalCode: e.target.value }))}
                  placeholder="20354"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">Tax ID / VAT</Label>
                <Input
                  value={consignee.taxId}
                  onChange={(e) => setConsignee((c) => ({ ...c, taxId: e.target.value }))}
                  placeholder="DE123456789"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">Phone</Label>
                <Input
                  value={consignee.phone}
                  onChange={(e) => setConsignee((c) => ({ ...c, phone: e.target.value }))}
                  placeholder="+49 40 1234567"
                  className="h-8 text-xs"
                />
              </div>
              <div>
                <Label className="text-[0.65rem]">Email</Label>
                <Input
                  value={consignee.email}
                  onChange={(e) => setConsignee((c) => ({ ...c, email: e.target.value }))}
                  placeholder="logistics@consignee.com"
                  className="h-8 text-xs"
                />
              </div>
            </div>
          )}
        </div>

        {/* Notify Parties section */}
        <div className="rounded-lg border border-border p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <Users className="w-4 h-4 text-gold" /> Notify Parties
              <Badge variant="outline" className="text-[0.55rem] ml-1">{notifyParties.length}</Badge>
            </h3>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addNotifyParty}>
              <Plus className="w-3 h-3 mr-1" /> Add Notify Party
            </Button>
          </div>
          <p className="text-[0.6rem] text-muted-foreground mb-2">
            Notify parties appear on the Bill of Lading. At least one is required. Add multiple parties (e.g., buyer's logistics team, customs broker, financing bank).
          </p>
          <div className="space-y-3">
            {notifyParties.map((p, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2.5 bg-muted/10">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">Notify Party #{i + 1}</span>
                  {notifyParties.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 text-[0.6rem] text-destructive hover:text-destructive/80 px-2" onClick={() => removeNotifyParty(i)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  <div className="md:col-span-2">
                    <Label className="text-[0.6rem]">Name *</Label>
                    <Input value={p.name} onChange={(e) => updateNotifyParty(i, "name", e.target.value)} placeholder="Notify party name" className="h-7 text-xs" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[0.6rem]">Address *</Label>
                    <Input value={p.address} onChange={(e) => updateNotifyParty(i, "address", e.target.value)} placeholder="Street address" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Country</Label>
                    <Input value={p.country} onChange={(e) => updateNotifyParty(i, "country", e.target.value)} placeholder="DE" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">City</Label>
                    <Input value={p.city} onChange={(e) => updateNotifyParty(i, "city", e.target.value)} placeholder="Hamburg" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Postal Code</Label>
                    <Input value={p.postalCode} onChange={(e) => updateNotifyParty(i, "postalCode", e.target.value)} placeholder="20354" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Phone</Label>
                    <Input value={p.phone} onChange={(e) => updateNotifyParty(i, "phone", e.target.value)} placeholder="+49 40 1234567" className="h-7 text-xs" />
                  </div>
                  <div className="md:col-span-2">
                    <Label className="text-[0.6rem]">Email</Label>
                    <Input value={p.email} onChange={(e) => updateNotifyParty(i, "email", e.target.value)} placeholder="notify@example.com" className="h-7 text-xs" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Document Dispatch Addresses section */}
        <div className="rounded-lg border border-border p-3 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gold" /> Document Dispatch Addresses
              <Badge variant="outline" className="text-[0.55rem] ml-1">{dispatchAddresses.length}</Badge>
            </h3>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addDispatchAddress}>
              <Plus className="w-3 h-3 mr-1" /> Add Dispatch Address
            </Button>
          </div>
          <p className="text-[0.6rem] text-muted-foreground mb-2">
            Different documents can be dispatched to different addresses. For each address, select which document types should be couriered there. Originals are sent by courier; eB/Ls are dispatched electronically.
          </p>
          <div className="space-y-3">
            {dispatchAddresses.map((d, i) => (
              <div key={i} className="rounded-md border border-border/60 p-2.5 bg-muted/10">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[0.65rem] font-semibold text-muted-foreground uppercase">Dispatch Address #{i + 1}</span>
                    <Input
                      value={d.label}
                      onChange={(e) => updateDispatchAddress(i, "label", e.target.value)}
                      className="h-6 w-32 text-[0.65rem] px-2"
                      placeholder="Label (e.g., HQ, Bank, Customs Broker)"
                    />
                  </div>
                  {dispatchAddresses.length > 1 && (
                    <Button size="sm" variant="ghost" className="h-6 text-[0.6rem] text-destructive hover:text-destructive/80 px-2" onClick={() => removeDispatchAddress(i)}>
                      <Trash2 className="w-3 h-3 mr-1" /> Remove
                    </Button>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                  <div className="md:col-span-2">
                    <Label className="text-[0.6rem]">Address *</Label>
                    <Input value={d.address} onChange={(e) => updateDispatchAddress(i, "address", e.target.value)} placeholder="Street address" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Country</Label>
                    <Input value={d.country} onChange={(e) => updateDispatchAddress(i, "country", e.target.value)} placeholder="DE" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">City</Label>
                    <Input value={d.city} onChange={(e) => updateDispatchAddress(i, "city", e.target.value)} placeholder="Hamburg" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Postal Code</Label>
                    <Input value={d.postalCode} onChange={(e) => updateDispatchAddress(i, "postalCode", e.target.value)} placeholder="20354" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Attention (Attn.)</Label>
                    <Input value={d.attention} onChange={(e) => updateDispatchAddress(i, "attention", e.target.value)} placeholder="Mr. Schmidt" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Phone</Label>
                    <Input value={d.phone} onChange={(e) => updateDispatchAddress(i, "phone", e.target.value)} placeholder="+49 40 1234567" className="h-7 text-xs" />
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Courier</Label>
                    <Select value={d.courier} onValueChange={(v) => updateDispatchAddress(i, "courier", v)}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COURIERS.map((c) => <SelectItem key={c} value={c} className="text-xs">{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Document type checklist */}
                <div className="mt-2">
                  <Label className="text-[0.6rem] mb-1 block">Documents to dispatch to this address * (select one or more)</Label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    {ALL_DOCUMENT_TYPES.map((dt) => {
                      const checked = d.documentTypes.includes(dt);
                      return (
                        <label key={dt} className={`flex items-center gap-1.5 p-1.5 rounded border text-[0.6rem] cursor-pointer transition ${checked ? "border-gold/40 bg-gold/10" : "border-border/50 hover:border-border"}`}>
                          <Checkbox checked={checked} onCheckedChange={() => toggleDocumentType(i, dt)} />
                          <span className={checked ? "text-gold" : ""}>{dt}</span>
                        </label>
                      );
                    })}
                  </div>
                  {touched && d.documentTypes.length === 0 && (
                    <p className="text-[0.55rem] text-destructive mt-1">Select at least one document type for this address.</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-3 border-t border-border">
          <div className="text-[0.6rem] text-muted-foreground">
            On submit: trade status → <span className="font-mono text-gold">BUYER_SUBMITTED</span> · phase → 3 · seller notified · proceed to contract signing.
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
            <Button size="sm" className="bg-gold-gradient text-sovereign" disabled={submitting} onClick={submit}>
              {submitting ? (
                <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting…</>
              ) : (
                <><Send className="w-3 h-3 mr-1" /> Accept Quote & Submit Details</>
              )}
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ============ CUSTOMS BROKER ASSIGNMENT CARD (Phase 3.13) ============
// Post-contract-lock customs broker assignment. Both buyer AND seller must
// designate a licensed customs broker for their side of clearance:
//   - Seller → EXPORT clearance
//   - Buyer  → IMPORT clearance
// They may designate either:
//   (a) Their freight forwarder (LSP) IF that forwarder also holds a customs
//       broker licence — common in many jurisdictions where forwarders dual-role.
//   (b) A dedicated customs broker (CBR tenant).
// The designated broker receives the USTN via Smart Inbox + a DRAFT
// CustomsDeclaration is created for them. They upload clearance documents
// later from the CBR portal. This is the primary mechanism while
// documentation is not yet fully digitalised — licensed customs brokers are
// required by law in virtually every country to file customs declarations.
export function CustomsBrokerAssignmentCard({
  ustn,
  buyerGtid,
  sellerGtid,
  buyerLegalName,
  sellerLegalName,
  viewerGtid,
  originCountry,
  destCountry,
  assignedForwarderGtid, // from Mode B logistics — used for "Use my forwarder" shortcut
  assignedForwarderName,
}: {
  ustn: string;
  buyerGtid: string;
  sellerGtid: string;
  buyerLegalName?: string;
  sellerLegalName?: string;
  viewerGtid: string;
  originCountry?: string;
  destCountry?: string;
  assignedForwarderGtid?: string;
  assignedForwarderName?: string;
}) {
  const queryClient = useQueryClient();
  const viewerRole: "BUYER" | "SELLER" | "OBSERVER" =
    viewerGtid === buyerGtid ? "BUYER" : viewerGtid === sellerGtid ? "SELLER" : "OBSERVER";

  // Fetch all verified CBR + LSP tenants (for the broker picker dropdown).
  // LSP tenants are included because freight forwarders often hold a customs
  // broker licence and dual-role. SHIP / LAB / QC / BANK / GOV tenants are
  // excluded — they cannot legally file customs declarations.
  const { data: brokerTenants, isLoading: brokersLoading } = useQuery<any[]>({
    queryKey: ["customs-broker-tenants"],
    queryFn: async () => {
      const res = await fetch("/api/sgtx/tenants");
      const all = await res.json();
      return (all || []).filter(
        (t: any) => (t.type === "CBR" || t.type === "LSP") && t.lifecycleState === "VERIFIED",
      );
    },
    staleTime: 60_000,
  });

  // Fetch the current customs broker assignments for this trade
  const { data: assignmentData, isLoading: assignmentLoading } = useQuery<any>({
    queryKey: ["customs-broker-assignment", ustn],
    queryFn: async () => {
      const res = await fetch(`/api/sgtx/contract/customs-broker-assign?ustn=${encodeURIComponent(ustn)}`);
      if (!res.ok) return null;
      const j = await res.json();
      return j;
    },
    enabled: !!ustn,
    staleTime: 10_000,
  });

  const [selectedBrokerGtid, setSelectedBrokerGtid] = useState<string>("");
  const [assigning, setAssigning] = useState<"BUYER" | "SELLER" | null>(null);
  const [notes, setNotes] = useState("");

  // Reset the local picker when the assignment data loads/changes (so the
  // picker shows the currently-assigned broker if there is one)
  useEffect(() => {
    if (!assignmentData) return;
    if (viewerRole === "BUYER" && assignmentData.buyer?.customsBroker?.gtid) {
      setSelectedBrokerGtid(assignmentData.buyer.customsBroker.gtid);
    } else if (viewerRole === "SELLER" && assignmentData.seller?.customsBroker?.gtid) {
      setSelectedBrokerGtid(assignmentData.seller.customsBroker.gtid);
    }
  }, [assignmentData, viewerRole]);

  const brokers = brokerTenants || [];
  const buyerBroker = assignmentData?.buyer?.customsBroker || null;
  const sellerBroker = assignmentData?.seller?.customsBroker || null;
  const declarations: any[] = assignmentData?.declarations || [];

  const assignBroker = async (role: "BUYER" | "SELLER") => {
    if (!selectedBrokerGtid) {
      toast.error("Select a customs broker first", {
        description: "Pick a verified CBR or your freight forwarder from the dropdown.",
      });
      return;
    }
    setAssigning(role);
    try {
      const assignerGtid = role === "BUYER" ? buyerGtid : sellerGtid;
      const selectedBroker = brokers.find((b) => b.gtid === selectedBrokerGtid);
      const brokerType =
        selectedBroker?.type === "CBR" ? "DEDICATED_CBR" : "FORWARDER_WITH_CBR";
      const res = await fetch("/api/sgtx/contract/customs-broker-assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          role,
          brokerGtid: selectedBrokerGtid,
          assignerGtid,
          brokerType,
          notes: notes.trim() || undefined,
        }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || "Assignment failed");
      toast.success(`${role === "SELLER" ? "Export" : "Import"} customs broker assigned`, {
        description: `${d.brokerLegalName} (${selectedBrokerGtid}) notified via Smart Inbox with USTN. DRAFT ${d.regime} declaration created.`,
      });
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["customs-broker-assignment", ustn] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      toast.error("Could not assign customs broker", { description: e?.message || "Please try again." });
    } finally {
      setAssigning(null);
    }
  };

  const canAssignBuyer = viewerRole === "BUYER" || viewerRole === "OBSERVER";
  const canAssignSeller = viewerRole === "SELLER" || viewerRole === "OBSERVER";

  return (
    <Card className="p-4 border-gold/20">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h3 className="font-semibold text-sm flex items-center gap-2">
            <Stamp className="w-4 h-4 text-gold" />
            Phase 3.13 — Customs Broker Assignment
          </h3>
          <p className="text-[0.65rem] text-muted-foreground mt-1 max-w-2xl">
            Licensed customs brokers are required by law in virtually every country to file customs
            declarations. After the contract is locked, both parties must designate their broker:
            seller assigns the <span className="font-medium text-foreground">export</span> broker,
            buyer assigns the <span className="font-medium text-foreground">import</span> broker.
            You may use your freight forwarder if they hold a broker licence, or a dedicated customs
            broker (CBR). The designated broker receives the USTN and uploads clearance documents later.
          </p>
        </div>
        <Badge variant="outline" className="text-[0.55rem] shrink-0">
          {buyerBroker && sellerBroker ? (
            <span className="text-success flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5" /> Both sides assigned</span>
          ) : (buyerBroker || sellerBroker) ? (
            <span className="text-warning">Partial — {buyerBroker ? "import" : "export"} done</span>
          ) : (
            <span className="text-muted-foreground">Pending assignment</span>
          )}
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* SELLER SIDE — EXPORT clearance */}
        <BrokerSideCard
          sideLabel="Seller — Export Clearance"
          sideRole="SELLER"
          regime="EXPORT"
          partyGtid={sellerGtid}
          partyLegalName={sellerLegalName}
          country={originCountry}
          broker={sellerBroker}
          brokers={brokers}
          brokersLoading={brokersLoading}
          canAssign={canAssignSeller}
          viewerRole={viewerRole}
          selectedBrokerGtid={viewerRole === "SELLER" ? selectedBrokerGtid : ""}
          onBrokerChange={viewerRole === "SELLER" ? setSelectedBrokerGtid : () => {}}
          notes={viewerRole === "SELLER" ? notes : ""}
          onNotesChange={viewerRole === "SELLER" ? setNotes : () => {}}
          assigning={assigning === "SELLER"}
          onAssign={() => assignBroker("SELLER")}
          assignedForwarderGtid={assignedForwarderGtid}
          assignedForwarderName={assignedForwarderName}
        />

        {/* BUYER SIDE — IMPORT clearance */}
        <BrokerSideCard
          sideLabel="Buyer — Import Clearance"
          sideRole="BUYER"
          regime="IMPORT"
          partyGtid={buyerGtid}
          partyLegalName={buyerLegalName}
          country={destCountry}
          broker={buyerBroker}
          brokers={brokers}
          brokersLoading={brokersLoading}
          canAssign={canAssignBuyer}
          viewerRole={viewerRole}
          selectedBrokerGtid={viewerRole === "BUYER" ? selectedBrokerGtid : ""}
          onBrokerChange={viewerRole === "BUYER" ? setSelectedBrokerGtid : () => {}}
          notes={viewerRole === "BUYER" ? notes : ""}
          onNotesChange={viewerRole === "BUYER" ? setNotes : () => {}}
          assigning={assigning === "BUYER"}
          onAssign={() => assignBroker("BUYER")}
        />
      </div>

      {/* Linked declarations */}
      {declarations.length > 0 && (
        <div className="mt-3 p-2.5 rounded-lg bg-muted/20 border border-border/40">
          <p className="text-[0.6rem] tracking-widest text-muted-foreground uppercase mb-1.5">
            Linked Customs Declarations (DRAFT — broker fills in details)
          </p>
          <div className="space-y-1">
            {declarations.map((d) => (
              <div key={d.id} className="flex items-center gap-2 text-[0.65rem]">
                <Badge variant="outline" className="text-[0.5rem]" style={{
                  color: d.regime === "EXPORT" ? "#d4321a" : "#1a6fb0",
                  borderColor: d.regime === "EXPORT" ? "#d4321a55" : "#1a6fb055",
                }}>
                  {d.regime}
                </Badge>
                <span className="font-mono text-muted-foreground">{d.brokerGtid?.slice(0, 22)}…</span>
                <span className="flex-1 truncate">
                  {d.declarationNo ? `Decl #${d.declarationNo}` : "Draft — awaiting broker filing"}
                </span>
                <Badge variant="outline" className="text-[0.5rem]" style={{
                  color: d.status === "CLEARED" ? "#16a34a" : d.status === "SUBMITTED" ? "#0891b2" : "#9ca3af",
                }}>
                  {d.status}
                </Badge>
                {d.dutyUsd != null && <span className="text-gold font-medium">${d.dutyUsd.toLocaleString()}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

// Sub-component for each side (buyer/seller) of the customs broker assignment
function BrokerSideCard({
  sideLabel,
  sideRole,
  regime,
  partyGtid,
  partyLegalName,
  country,
  broker,
  brokers,
  brokersLoading,
  canAssign,
  viewerRole,
  selectedBrokerGtid,
  onBrokerChange,
  notes,
  onNotesChange,
  assigning,
  onAssign,
  assignedForwarderGtid,
  assignedForwarderName,
}: {
  sideLabel: string;
  sideRole: "BUYER" | "SELLER";
  regime: "EXPORT" | "IMPORT";
  partyGtid: string;
  partyLegalName?: string;
  country?: string;
  broker: any | null;
  brokers: any[];
  brokersLoading: boolean;
  canAssign: boolean;
  viewerRole: "BUYER" | "SELLER" | "OBSERVER";
  selectedBrokerGtid: string;
  onBrokerChange: (g: string) => void;
  notes: string;
  onNotesChange: (n: string) => void;
  assigning: boolean;
  onAssign: () => void;
  assignedForwarderGtid?: string;
  assignedForwarderName?: string;
}) {
  const isAssigned = !!broker;
  const isMySide = viewerRole === sideRole;
  const accent = regime === "EXPORT" ? "#d4321a" : "#1a6fb0";

  return (
    <div
      className={`p-3 rounded-lg border ${isAssigned ? "bg-success/5 border-emerald-500/20" : isMySide ? "bg-gold/5 border-gold/30" : "bg-muted/20 border-border"}`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">{sideLabel}</p>
          <p className="text-xs font-medium mt-0.5">
            {partyLegalName || partyGtid.slice(0, 22) + "…"}
            {country && <span className="text-muted-foreground ml-1">· {country}</span>}
          </p>
        </div>
        {isAssigned ? (
          <Badge variant="outline" className="text-[0.55rem] text-success border-emerald-500/30">
            <CheckCircle2 className="w-2.5 h-2.5 mr-1" /> Assigned
          </Badge>
        ) : isMySide ? (
          <Badge variant="outline" className="text-[0.55rem] text-gold border-gold/40">Your action</Badge>
        ) : (
          <Badge variant="outline" className="text-[0.55rem] text-muted-foreground">Awaiting {sideRole.toLowerCase()}</Badge>
        )}
      </div>

      {isAssigned ? (
        <div className="text-xs space-y-1.5">
          <div className="flex items-center gap-2 p-2 rounded-md bg-success/5 border border-emerald-500/15">
            <Building2 className="w-4 h-4 text-success shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-medium truncate">{broker.legalName}</p>
              <p className="text-[0.6rem] text-muted-foreground font-mono truncate">{broker.gtid}</p>
            </div>
            <Badge variant="outline" className="text-[0.5rem]" style={{ color: accent, borderColor: `${accent}55` }}>
              {broker.type === "CBR" ? "Dedicated CBR" : "Forwarder+CBR"}
            </Badge>
          </div>
          {broker.assignedAt && (
            <p className="text-[0.6rem] text-muted-foreground">
              Assigned {fmtDate(broker.assignedAt)} · {regime.toLowerCase()} clearance
            </p>
          )}
          <p className="text-[0.6rem] text-muted-foreground">
            Broker has been notified via Smart Inbox with the USTN. They will file the {regime.toLowerCase()} declaration and upload documents from their CBR portal.
          </p>
        </div>
      ) : isMySide ? (
        <div className="space-y-2">
          {brokersLoading ? (
            <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading licensed brokers…
            </div>
          ) : (
            <>
              <div>
                <Label className="text-[0.6rem] text-muted-foreground">Select customs broker</Label>
                <Select value={selectedBrokerGtid} onValueChange={onBrokerChange}>
                  <SelectTrigger className="h-8 text-xs mt-0.5">
                    <SelectValue placeholder="— Pick a verified CBR or your forwarder —" />
                  </SelectTrigger>
                  <SelectContent>
                    {brokers.map((b) => (
                      <SelectItem key={b.gtid} value={b.gtid} className="text-xs">
                        <span className="font-medium">{b.legalName?.slice(0, 28)}</span>
                        <span className="text-muted-foreground ml-1">
                          · {b.type === "CBR" ? "CBR" : "LSP+CBR"} · {b.country}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quick-pick: use assigned forwarder (only on seller side if they assigned one in Mode B) */}
              {sideRole === "SELLER" && assignedForwarderGtid && (
                <button
                  type="button"
                  onClick={() => onBrokerChange(assignedForwarderGtid)}
                  className={`text-[0.6rem] text-gold hover:underline flex items-center gap-1 ${selectedBrokerGtid === assignedForwarderGtid ? "font-semibold" : ""}`}
                >
                  <UserPlus className="w-3 h-3" />
                  Use my assigned freight forwarder: {assignedForwarderName || assignedForwarderGtid.slice(0, 22) + "…"}
                </button>
              )}

              <div>
                <Label className="text-[0.6rem] text-muted-foreground">Notes to broker (optional)</Label>
                <Textarea
                  value={notes}
                  onChange={(e) => onNotesChange(e.target.value)}
                  placeholder={`e.g., Please coordinate with our warehouse for export docs. Commodity HS code: …`}
                  className="text-xs min-h-[44px] mt-0.5"
                />
              </div>

              <Button
                size="sm"
                className="bg-gold-gradient text-sovereign h-8 w-full"
                disabled={!selectedBrokerGtid || assigning}
                onClick={onAssign}
              >
                {assigning ? (
                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Notifying broker…</>
                ) : (
                  <><Send className="w-3 h-3 mr-1.5" />Assign & Notify Broker</>
                )}
              </Button>
              <p className="text-[0.55rem] text-muted-foreground leading-relaxed">
                Broker receives: USTN, commodity, route, weight, value. A DRAFT {regime.toLowerCase()} declaration is
                auto-created for them. They file it from their CBR portal and upload supporting documents
                (commercial invoice, packing list, certificate of origin, B/L).
              </p>
            </>
          )}
        </div>
      ) : (
        <div className="text-[0.65rem] text-muted-foreground py-2">
          Waiting for {sideRole.toLowerCase()} to designate their {regime.toLowerCase()} customs broker.
        </div>
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
  // FIX-8b — Brain AI decision returned by /api/sgtx/contract/sign (the route
  // is wrapped in `withBrainPrescreen(autoCheckCompliance, ...)`). Rendered as a
  // BrainDecisionPanel so the operator sees the Brain's verdict + conditions.
  // When the verdict is DENY, the panel is shown prominently (the signature did
  // not record). CONDITIONAL shows the panel as a warning. ALLOW shows a
  // collapsed summary.
  const [brainDecision, setBrainDecision] = useState<BrainDecision | null>(null);
  const [brainDecisionRole, setBrainDecisionRole] = useState<"BUYER" | "SELLER" | null>(null);
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
  // the seller's quote) or BUYER_SUBMITTED (buyer also submitted consignee + notify
  // parties + dispatch addresses — full Phase 2.5 completion) or CONTRACT_SIGNED
  // (already locked, awaiting signatures on addenda / milestone setup) should be
  // eligible for the contract signing screen.
  //
  // Phase 3.13 — Post-lock statuses (IN_EXECUTION, DELIVERED, SETTLED) are also
  // included so that the Customs Broker Assignment card remains accessible for
  // trades that are already locked. The seller may need to (re-)assign a broker
  // mid-flow, and the buyer needs to see the broker status on their side too.
  const readyTrades: any[] = [...(data?.tradesAsBuyer || []), ...(data?.tradesAsSeller || [])].filter(
    (t: any) => ["QUOTE_ACCEPTED", "BUYER_SUBMITTED", "CONTRACT_SIGNED", "IN_EXECUTION", "DELIVERED", "SETTLED"].includes(t.status),
  );
  const [selectedUstn, setSelectedUstn] = useState<string>(readyTrades[0]?.ustn || "");
  const activeUstn = selectedUstn || readyTrades[0]?.ustn || FALLBACK_TRADE_USTN;
  const hasRealTrade = readyTrades.length > 0 && !!selectedUstn;
  const activeTrade = readyTrades.find((t) => t.ustn === activeUstn);
  const activeBuyerGtid = activeTrade?.buyerGtid || FALLBACK_BUYER_GTID;
  const activeSellerGtid = activeTrade?.sellerGtid || FALLBACK_SELLER_GTID;

  // Phase 2.5 — Fetch the buyer submission (consignee + notify parties +
  // document dispatch addresses) for the active trade so it can be displayed
  // in the contract signing screen. The seller needs this info to draft the
  // contract correctly.
  const { data: buyerSubmissionData } = useQuery<any>({
    queryKey: ["buyer-submission", activeUstn],
    queryFn: async () => {
      if (!hasRealTrade) return null;
      try {
        const res = await fetch(`/api/sgtx/buyer-submission?ustn=${encodeURIComponent(activeUstn)}`);
        const j = await res.json();
        return j?.submission || null;
      } catch {
        return null;
      }
    },
    enabled: hasRealTrade,
  });
  const buyerSubmission = buyerSubmissionData || null;

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
    setBrainDecision(null);
    setBrainDecisionRole(null);
    try {
      const signerGtid = role === "BUYER" ? activeBuyerGtid : activeSellerGtid;
      const res = await fetch("/api/sgtx/contract/sign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ustn: activeUstn, signerGtid, signerRole: role, signatureType: "QES" }),
      });
      const d = await res.json();
      // The Brain prescreen HOC surfaces the verdict on BOTH the success path
      // (brainVerdict + brainConditions) and the DENY error path (verdict +
      // conditions + aiConfidence + brainModule). Capture both into a single
      // BrainDecision object so the BrainDecisionPanel can render either case.
      const decision: BrainDecision = res.ok
        ? {
            verdict: d.brainVerdict || "ALLOW",
            aiConfidence: typeof d.brainAiConfidence === "number" ? d.brainAiConfidence : undefined,
            brainModule: d.brainModule || "autoCheckCompliance",
            conditions: Array.isArray(d.brainConditions) ? d.brainConditions : [],
            rationale: d.brainRationale,
          }
        : {
            verdict: "DENY",
            aiConfidence: typeof d.aiConfidence === "number" ? d.aiConfidence : 0.97,
            brainModule: d.brainModule || "autoCheckCompliance",
            conditions: Array.isArray(d.conditions) ? d.conditions : [],
            denialReason: d.message || d.error || "SGTX Brain AI blocked this signature.",
          };
      setBrainDecision(decision);
      setBrainDecisionRole(role);

      if (!res.ok) {
        // DENY path — the signature was NOT recorded. Show the panel
        // prominently and surface a destructive toast.
        toast.error(`Brain blocked ${role} signature`, {
          description: decision.denialReason || "Compliance gate refused to clear this signature.",
        });
        return;
      }
      if (role === "BUYER") setBuyerSigned(true);
      else setSellerSigned(true);
      toast.success(`${role} signed via QES`, {
        description: `Legal effect: ${d.legalEffect}. Document hash: ${d.documentHash?.slice(0, 16)}...${
          decision.verdict === "CONDITIONAL" ? " · Brain: CONDITIONAL — see panel." : ""
        }`,
      });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e: any) {
      // Network / fetch error — synthesize a DENY BrainDecision so the panel
      // shows something useful (the operator sees the signature attempt failed).
      const decision: BrainDecision = {
        verdict: "DENY",
        aiConfidence: 0.0,
        brainModule: "autoCheckCompliance",
        conditions: [],
        denialReason: `Network error during signature attempt: ${e?.message || "unknown error"}. The Brain gate could not be evaluated.`,
      };
      setBrainDecision(decision);
      setBrainDecisionRole(role);
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
        <Card className="p-6 text-center border-amber-500/30 bg-warning/5">
          <FileText className="w-6 h-6 mx-auto mb-2 text-warning" />
          <EmptyState icon={ShieldCheck} title="No trades ready for signing" description="Trades with QUOTE_ACCEPTED status will appear here for contract execution." />
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            Trades will appear here once the buyer accepts a seller&apos;s quote (status{" "}
            <span className="font-mono">QUOTE_ACCEPTED</span> or{" "}
            <span className="font-mono">BUYER_SUBMITTED</span>) or after the contract is locked
            (status <span className="font-mono">CONTRACT_SIGNED</span>). Visit the Quote Review
            tab to accept a pending quote and submit consignee + dispatch details.
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

      {/* Phase 2.5 — Buyer Submission Summary card (consignee + notify + dispatch) */}
      {hasRealTrade && buyerSubmission && (
        <Card className="p-4 border border-emerald-500/30 bg-success/5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[0.65rem] text-success uppercase tracking-wide font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Buyer Submission Received
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Submission ID <span className="font-mono">{buyerSubmission.submissionId}</span> · {buyerSubmission.status}
              </p>
            </div>
            <Badge variant="outline" className="text-[0.55rem] text-success border-emerald-500/30">
              {buyerSubmission.consigneeSameAsBuyer ? "Consignee = Buyer" : "Custom Consignee"}
            </Badge>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            {/* Buyer + Consignee */}
            <div className="rounded-md p-2 bg-background/40">
              <p className="text-[0.6rem] text-muted-foreground uppercase mb-1 flex items-center gap-1"><User className="w-3 h-3" /> Buyer / Consignee</p>
              <p className="font-medium">{buyerSubmission.buyerLegalName}</p>
              <p className="text-[0.6rem] text-muted-foreground">{buyerSubmission.buyerCountry}{buyerSubmission.buyerCity ? ` · ${buyerSubmission.buyerCity}` : ""}</p>
              {!buyerSubmission.consigneeSameAsBuyer && buyerSubmission.consignee && (
                <div className="mt-1.5 pt-1.5 border-t border-border/40">
                  <p className="text-[0.55rem] text-muted-foreground">Consignee:</p>
                  <p className="font-medium text-[0.65rem]">{buyerSubmission.consignee.name}</p>
                  <p className="text-[0.55rem] text-muted-foreground">{buyerSubmission.consignee.address}</p>
                </div>
              )}
            </div>
            {/* Notify parties */}
            <div className="rounded-md p-2 bg-background/40">
              <p className="text-[0.6rem] text-muted-foreground uppercase mb-1 flex items-center gap-1"><Users className="w-3 h-3" /> Notify Parties ({(buyerSubmission.notifyParties || []).length})</p>
              <div className="space-y-1 max-h-20 overflow-y-auto scroll-gold">
                {(buyerSubmission.notifyParties || []).map((np: any, i: number) => (
                  <div key={i} className="text-[0.6rem]">
                    <p className="font-medium">{np.name}</p>
                    <p className="text-muted-foreground">{np.address}{np.country ? `, ${np.country}` : ""}</p>
                  </div>
                ))}
              </div>
            </div>
            {/* Document dispatch addresses */}
            <div className="rounded-md p-2 bg-background/40">
              <p className="text-[0.6rem] text-muted-foreground uppercase mb-1 flex items-center gap-1"><MapPin className="w-3 h-3" /> Dispatch Addresses ({(buyerSubmission.documentDispatchAddresses || []).length})</p>
              <div className="space-y-1 max-h-20 overflow-y-auto scroll-gold">
                {(buyerSubmission.documentDispatchAddresses || []).map((d: any, i: number) => (
                  <div key={i} className="text-[0.6rem]">
                    <p className="font-medium">{d.label} <span className="text-muted-foreground">· {d.courier}</span></p>
                    <p className="text-muted-foreground">{d.address}{d.city ? `, ${d.city}` : ""}</p>
                    <p className="text-[0.5rem] text-gold">{(d.documentTypes || []).length} doc type{(d.documentTypes || []).length === 1 ? "" : "s"}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      )}
      {/* Phase 2.5 — Pending submission warning (only if BUYER_SUBMITTED not yet) */}
      {hasRealTrade && activeTrade && activeTrade.status === "QUOTE_ACCEPTED" && !buyerSubmission && (
        <Card className="p-4 border border-amber-500/30 bg-warning/5">
          <p className="text-xs text-warning flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            <span>
              <strong>Buyer submission pending.</strong> The buyer has accepted the quote but has not yet
              submitted consignee + notify parties + document dispatch addresses. The contract can still
              be drafted, but these details will need to be added before B/L issuance.
            </span>
          </p>
        </Card>
      )}

      {/* 3B.4.4 Contract Assembly with SGTX Witness Clause */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-4">
          <div><p className="font-semibold text-sm">Sales Contract SC-2026-0491</p><p className="text-[0.65rem] text-muted-foreground">Clause Forge (A2) generated · 312 KB · SHA-256 verified · Status: PENDING_SIGNATURES</p></div>
          <Badge className="bg-warning/15 text-warning border-amber-500/30">PENDING SIGNATURES</Badge>
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
              <p className="text-[0.6rem] text-warning">⚠ Mandatory: You must also sign a separate SGTX FEES Addendum (auto-generated, contains Witness Clause + fee terms). Non-negotiable.</p>
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
              {a.status === "SIGNED" ? <Badge variant="outline" className="text-success border-emerald-500/30 text-[0.6rem]">✓ SIGNED (ZITADEL passkey)</Badge>
              : <div className="flex gap-2"><Badge variant="outline" className="text-warning border-amber-500/30 text-[0.6rem]">PENDING</Badge><Button size="sm" variant="outline" className="h-7 text-xs text-gold">Remind</Button></div>}
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
            {modReason.length > 0 && modReason.length < 20 && <p className="text-[0.55rem] text-warning">{modReason.length}/20 chars</p>}
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
                    {f.deferrable ? <label className="flex items-center gap-1"><input type="checkbox" checked={deferredFees[f.fee] || false} onChange={(e) => setDeferredFees(d => ({ ...d, [f.fee]: e.target.checked }))} className="rounded" /> <span className="text-[0.6rem] text-warning">Defer</span></label> : <span className="text-[0.6rem] text-muted-foreground">Due now</span>}
                  </div>
                ))}
              </div>
              {Object.values(deferredFees).some(v => v) && <p className="text-[0.55rem] text-warning mt-1">⚠ Deferred fees held as PSP guarantee (or LC). Auto-triggered on milestone "Customs cleared". Governor blocks container release if guarantee expires.</p>}
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
          <div className="p-3 rounded-lg bg-success/5 border border-emerald-500/20 text-xs text-success flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> FeeLock ACTIVE · Payment verified via PSP webhook · Fee paid in full. Late fee: $0.</div>
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
        ) : <div className="text-xs text-success flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Release acknowledged · Token logged · Container can be gated out (CRA API ready)</div>}
      </Card>

      {/* 3B.4.10 Digital Signatures & Contract Lock */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">3B.4.10 Digital Signatures & Contract Lock</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <div className={`p-3 rounded-lg border ${buyerSigned ? "bg-success/5 border-emerald-500/20" : "bg-muted/20 border-border"}`}>
            <p className="text-[0.6rem] text-muted-foreground uppercase">Buyer Signature</p>
            {buyerSigned ? <p className="text-sm font-semibold text-success mt-1">✓ Buyer · ZITADEL passkey · QES</p> : <Button size="sm" className="mt-2 bg-gold-gradient text-sovereign h-7" disabled={signing === "BUYER"} onClick={() => signContract("BUYER")}>{signing === "BUYER" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Signing…</> : <><ShieldCheck className="w-3 h-3 mr-1" />Sign with passkey</>}</Button>}
          </div>
          <div className={`p-3 rounded-lg border ${sellerSigned ? "bg-success/5 border-emerald-500/20" : "bg-gold/5 border-gold/30"}`}>
            <p className="text-[0.6rem] text-gold uppercase">Seller Signature</p>
            {sellerSigned ? <p className="text-sm font-semibold text-success mt-1">✓ Seller · ZITADEL passkey · QES</p> : <Button size="sm" className="mt-2 bg-gold-gradient text-sovereign h-7" disabled={signing === "SELLER"} onClick={() => signContract("SELLER")}>{signing === "SELLER" ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />Signing…</> : <><ShieldCheck className="w-3 h-3 mr-1" />Sign with passkey</>}</Button>}
          </div>
          <div className="p-3 rounded-lg bg-muted/20 border border-border">
            <p className="text-[0.6rem] text-muted-foreground uppercase">Governor Witness</p>
            <p className="text-sm font-semibold text-success mt-1">✓ SGTX Governor · Ed25519 · Automatic</p>
          </div>
        </div>
        {contractLocked && lockedUstn ? (
          <div className="p-3 rounded-lg bg-success/10 border border-emerald-500/30">
            <div className="flex items-center gap-3">
              <Lock className="w-5 h-5 text-success" />
              <div className="flex-1">
                <p className="font-semibold text-sm text-success">Contract LOCKED</p>
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
          <div className="p-3 rounded-lg bg-warning/10 border border-amber-500/30 text-xs text-warning">
            <p>⚠ Cannot lock contract until: {!feePaid && "Fee paid · "}{!buyerSigned && "Buyer signed · "}{!sellerSigned && "Seller signed · "}{!releaseAcknowledged && "Release acknowledged"}</p>
          </div>
        )}
      </Card>

      {/* FIX-8b — SGTX Brain AI Decision Panel. Renders whenever the Brain
          prescreen (autoCheckCompliance via withBrainPrescreen) has returned a
          verdict on a signature attempt. DENY → expanded + prominent (signature
          blocked). CONDITIONAL → expanded as a warning (signature recorded but
          conditions attached). ALLOW → collapsed summary. The panel is gated on
          `hasRealTrade` so the legacy placeholder flow is unaffected. */}
      {hasRealTrade && brainDecision && (
        <BrainDecisionPanel
          decision={brainDecision}
          subtitle={
            brainDecisionRole
              ? `Pre-contract compliance gate · ${brainDecisionRole} signature · USTN ${activeUstn?.slice(0, 24) ?? "—"}…`
              : `Pre-contract compliance gate · USTN ${activeUstn?.slice(0, 24) ?? "—"}…`
          }
        />
      )}

      {/* 3B.4.12 Phase 3.13 — Customs Broker Assignment (post-lock).
          Shows for any trade whose status is CONTRACT_SIGNED or later.
          Both buyer and seller see this card; the viewer's role (derived
          from data.tenant.gtid matching trade.buyerGtid / sellerGtid)
          determines which side is editable. The seller side also surfaces
          a "Use my assigned freight forwarder" shortcut when an LSP was
          assigned via Mode B logistics during quote preparation. */}
      {(() => {
        const lockedStatuses = ["CONTRACT_SIGNED", "IN_EXECUTION", "DELIVERED", "SETTLED"];
        const isLocked = contractLocked || lockedStatuses.includes(activeTrade?.status);
        if (!isLocked || !hasRealTrade) return null;

        // Parse logisticsModeGtids to find the first Mode B (LSP) assignment,
        // used for the "Use my assigned freight forwarder" shortcut.
        let assignedForwarderGtid: string | undefined;
        let assignedForwarderName: string | undefined;
        try {
          const raw = activeTrade?.logisticsModeGtids;
          if (raw) {
            const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
            for (const [, v] of Object.entries(parsed || {})) {
              const a = v as any;
              if (a?.mode === "B") {
                if (Array.isArray(a.gtids) && a.gtids.length > 0) {
                  assignedForwarderGtid = a.gtids[0];
                  break;
                } else if (typeof a.gtid === "string" && a.gtid) {
                  // Backward compat with legacy single-gtid format
                  assignedForwarderGtid = a.gtid;
                  break;
                }
              }
            }
          }
        } catch {}

        return (
          <CustomsBrokerAssignmentCard
            ustn={activeUstn}
            buyerGtid={activeBuyerGtid}
            sellerGtid={activeSellerGtid}
            buyerLegalName={activeTrade?.buyer?.legalName}
            sellerLegalName={activeTrade?.seller?.legalName}
            viewerGtid={data?.tenant?.gtid || ""}
            originCountry={activeTrade?.originCountry}
            destCountry={activeTrade?.destCountry}
            assignedForwarderGtid={assignedForwarderGtid}
            assignedForwarderName={assignedForwarderName}
          />
        );
      })()}
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
          No active shipments. Trades with CONTRACT_SIGNED or IN_EXECUTION status will appear here once containers are loaded.
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm">Milestone Timeline</h3>
              {milestonesData?.isRoRo && (
                <Badge variant="outline" className="text-[0.55rem] text-gold border-gold/30">
                  🚢 RoRo Mode · {milestonesData.transportMode}
                </Badge>
              )}
            </div>

            {/* Customs broker status banner (Part 3.13) */}
            {milestonesData?.customsBrokerStatus && !milestonesData.customsBrokerStatus.bothAssigned && (
              <div className="p-3 rounded-lg bg-warning/10 border border-amber-500/30 mb-3">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-warning mt-0.5 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-semibold text-warning">Customs Broker Assignment Required</p>
                    <p className="text-[0.6rem] text-muted-foreground mt-0.5">
                      Both buyer and seller must designate their licensed customs broker before customs clearance can proceed.
                      {!milestonesData.customsBrokerStatus.buyerBrokerGtid && " · Buyer broker: NOT ASSIGNED"}
                      {!milestonesData.customsBrokerStatus.sellerBrokerGtid && " · Seller broker: NOT ASSIGNED"}
                    </p>
                    <p className="text-[0.55rem] text-muted-foreground mt-1">
                      → Visit the <strong>Contract Signing</strong> tab → <strong>Phase 3.13 — Customs Broker Assignment</strong> section to assign your broker.
                      You can use your freight forwarder if they offer customs broker services, or a dedicated customs broker (CBR tenant).
                    </p>
                  </div>
                </div>
              </div>
            )}
            {milestonesData?.customsBrokerStatus?.bothAssigned && (
              <div className="p-2 rounded-lg bg-success/5 border border-emerald-500/20 mb-3 flex items-center gap-2">
                <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                <p className="text-[0.65rem] text-success">
                  Customs brokers assigned — Buyer: {milestonesData.customsBrokerStatus.buyerBrokerGtid?.slice(0, 20)}… · Seller: {milestonesData.customsBrokerStatus.sellerBrokerGtid?.slice(0, 20)}…
                </p>
              </div>
            )}

            <div className="space-y-2">
              {milestonesData.milestoneTimeline?.map((m: any) => {
                const isPending = m.status === "PENDING";
                const isNext = m.milestone === nextPending;
                const isConfirming = confirming === m.milestone;
                const needsBroker = m.requiresCustomsBroker && milestonesData?.customsBrokerStatus && !milestonesData.customsBrokerStatus.bothAssigned;
                return (
                  <div
                    key={m.milestone}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      m.status === "CONFIRMED"
                        ? "bg-success/5 border-emerald-500/20"
                        : isNext
                          ? "bg-gold/5 border-gold/30"
                          : "bg-muted/20 border-border"
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      m.status === "CONFIRMED" ? "bg-success/20 text-success" : "bg-muted text-muted-foreground"
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
                      {m.guidance && isPending && (
                        <p className="text-[0.55rem] text-muted-foreground mt-0.5 italic">💡 {m.guidance}</p>
                      )}
                      {needsBroker && isPending && (
                        <p className="text-[0.55rem] text-warning mt-0.5">⚠ Requires customs broker assignment before this milestone can be confirmed.</p>
                      )}
                      {/* Per-shipment status badges */}
                      <div className="flex flex-wrap gap-1 mt-1">
                        {m.shipmentStatuses?.map((s: any, idx: number) => (
                          <Badge
                            key={idx}
                            variant="outline"
                            className={`text-[0.5rem] ${s.confirmed ? "text-success border-emerald-500/30" : "text-muted-foreground"}`}
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
                          disabled={isConfirming || needsBroker}
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
              {milestonesData?.isRoRo
                ? "RoRo milestones: Roll-On → Depart → Transit → Arrive → Roll-Off → Customs Clearance → Delivery. Each milestone must be confirmed in order."
                : "Milestones must be confirmed in order. Counterparty is notified (priority 70 Smart Inbox) on each confirmation."}
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
          No trades ready for settlement. Trades with IN_EXECUTION or DELIVERED status will appear here once milestones are confirmed.
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
        <Card className="p-4">
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
              <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-red-500/30 text-xs text-destructive">
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
        <Card className="p-4">
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
            <div className="flex items-start gap-2 p-3 rounded-lg bg-destructive/10 border border-red-500/30 text-xs text-destructive">
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
                        <p className="text-[0.65rem] text-destructive mt-2 flex items-center gap-1">
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
        <EmptyState icon={ShieldCheck} title="No open disputes" description="All trades are in good standing. If a quality, delay, or payment issue arises, you can file a dispute here." actionLabel="File a Dispute" onAction={() => {/* opens dispute modal */}} />
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
                  {d.resolution && <p className="text-xs text-success mt-2">✓ {d.resolution}</p>}
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
              <Button variant="ghost" size="icon" aria-label="Close mediation log" className="h-8 w-8" onClick={() => setMedOpen(false)}>✕</Button>
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
            <div className="flex justify-between"><span className="text-muted-foreground">Lifecycle</span><span className="text-success">{t?.lifecycleState}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Sanctions</span><span className="text-success">✓ Cleared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">GNN proximity</span><span className="text-success">&gt; 2 hops</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">PQC signatures</span><span className="text-success">Dilithium3</span></div>
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold text-sm mb-3">Consent (PDPL)</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">GTID resolution</span><span className="text-success">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Trust score sharing</span><span className="text-success">Granted</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Bank details</span><span className="text-muted-foreground">Not shared</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Cross-border</span><span className="text-success">EG → DE allowed</span></div>
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
  // FIX A4 — Derive a deterministic Loom hash-chain visualization from the
  // existing activity feed. We try to fetch real Governor decisions for the
  // current tenant; if that fails or returns nothing, we derive mock hashes
  // from the activity IDs so the visualization always shows something.
  const loomEntries = useMemo(() => deriveLoomEntriesFromActivities(data.activities || []), [data.activities]);

  return (
    <div className="space-y-4">
      <SectionHeader title="Audit Trail" subtitle="Loom chain · RLS-filtered · immutable · quantum-safe archival (PQC)" />

      {/* FIX A4 — Visual hash-chain display above the flat activity list */}
      <LoomChainVisualization entries={loomEntries} compact />

      <Card className="p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-sm flex items-center gap-2"><Activity className="w-4 h-4 text-gold" /> Activity Log</h3>
          <Badge variant="outline" className="text-[0.6rem]">{data.activities?.length || 0} events</Badge>
        </div>
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
  const qc = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteName, setInviteName] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState("OPERATOR");
  const [inviteSwitch, setInviteSwitch] = useState(false);
  const [inviting, setInviting] = useState(false);

  const sendInvite = async () => {
    if (!inviteName.trim() || !inviteEmail.trim()) return;
    setInviting(true);
    try {
      const tenantGtid = data.tenant?.gtid;
      const res = await fetch("/api/sgtx/employee/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantGtid,
          fullName: inviteName,
          email: inviteEmail,
          role: inviteRole,
          allowRoleSwitching: inviteSwitch,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success(`Invitation sent to ${inviteEmail}`);
        setShowInvite(false);
        setInviteName("");
        setInviteEmail("");
        setInviteRole("OPERATOR");
        setInviteSwitch(false);
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } else {
        toast.error(d.error || "Failed to send invite");
      }
    } catch (e: any) {
      // If employee/invite endpoint doesn't exist, try direct employee creation
      try {
        const tenantGtid = data.tenant?.gtid;
        const res = await fetch("/api/sgtx/employee", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tenantGtid,
            fullName: inviteName,
            email: inviteEmail,
            role: inviteRole,
            allowRoleSwitching: inviteSwitch,
          }),
        });
        const d = await res.json();
        if (d.ok || d.id) {
          toast.success(`Employee ${inviteName} added`);
          setShowInvite(false);
          setInviteName("");
          setInviteEmail("");
          setInviteRole("OPERATOR");
          setInviteSwitch(false);
          qc.invalidateQueries({ queryKey: ["dashboard"] });
        } else {
          toast.error(d.error || "Failed to add employee");
        }
      } catch (e2: any) {
        toast.error("Failed to invite employee: " + e2.message);
      }
    } finally {
      setInviting(false);
    }
  };

  return (
    <div className="space-y-4">
      <SectionHeader title="Company Admin" subtitle="Employees · Roles · Data scopes · Approval chains · Branding · Exit Centre" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm flex items-center gap-2"><Users className="w-4 h-4 text-gold" /> Employees</h3>
            <Button size="sm" className="h-7 text-xs bg-gold-gradient text-sovereign" onClick={() => setShowInvite(!showInvite)}>
              <Plus className="w-3 h-3 mr-1" /> Invite Employee
            </Button>
          </div>

          {/* Invite form */}
          {showInvite && (
            <div className="p-3 rounded-lg bg-gold/5 border border-gold/20 space-y-2 mb-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[0.6rem]">Full Name</Label>
                  <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="John Doe" className="h-8 text-xs" />
                </div>
                <div>
                  <Label className="text-[0.6rem]">Email</Label>
                  <Input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="john@company.com" className="h-8 text-xs" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[0.6rem]">Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["OWNER", "ADMIN", "OPERATOR", "DRIVER", "INSPECTOR", "ANALYST", "OFFICER"].map(r => <SelectItem key={r} value={r} className="text-xs">{r}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer pb-1">
                    <input type="checkbox" checked={inviteSwitch} onChange={e => setInviteSwitch(e.target.checked)} className="rounded" />
                    Allow role switching
                  </label>
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs flex-1" onClick={sendInvite} disabled={inviting || !inviteName.trim() || !inviteEmail.trim()}>
                  {inviting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</> : <><Send className="w-3 h-3 mr-1" /> Send Invite</>}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowInvite(false)}>Cancel</Button>
              </div>
            </div>
          )}

          {/* Employee list */}
          <div className="space-y-1.5 max-h-80 overflow-y-auto">
            {data.tenant?.employees?.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-4">No employees yet. Invite your first team member.</p>
            )}
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
          <h3 className="font-semibold text-sm mt-4 mb-2">Roles & Permissions</h3>
          <div className="space-y-1 text-[0.65rem]">
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">OWNER</Badge> <span className="text-muted-foreground">Full access, can invite employees, manage company</span></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">ADMIN</Badge> <span className="text-muted-foreground">All operations except company deletion</span></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">OPERATOR</Badge> <span className="text-muted-foreground">Create trades, upload docs, confirm milestones</span></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">DRIVER</Badge> <span className="text-muted-foreground">LSP portal: milestone confirmations, addenda</span></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">INSPECTOR</Badge> <span className="text-muted-foreground">QC portal: field inspections, defect logging</span></div>
            <div className="flex items-center gap-2"><Badge variant="outline" className="text-[0.55rem]">ANALYST</Badge> <span className="text-muted-foreground">LAB portal: sampling, test results</span></div>
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [result, setResult] = useState("");
  const [passFail, setPassFail] = useState("PASS");
  const [params, setParams] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const uploadResults = async (testId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sgtx/lab-tests/${testId}/upload-results`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result, passFail, parameters: params || "{}" }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("Lab results uploaded");
        setUploadingId(null);
        setResult(""); setPassFail("PASS"); setParams("");
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } else { toast.error(d.error || "Upload failed"); }
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  if (tab === "requests" || tab === "queue") {
    return (
      <div className="space-y-4">
        <SectionHeader title={tab === "requests" ? "Test Requests" : "Sampling Queue"} subtitle="Receive USTN-linked test requests · perform sampling · release reports" />
        <Card className="overflow-hidden">
          <div className="px-4 py-3 border-b border-border"><h3 className="font-semibold text-sm">{tests.length} tests</h3></div>
          <div className="divide-y divide-border/40">
            {tests.map((t: any) => (
              <div key={t.id} className="px-4 py-3">
                <div className="flex items-center gap-3 hover:bg-muted/30 -mx-4 px-4 py-1 rounded">
                  <div className="w-9 h-9 rounded-lg bg-success/15 flex items-center justify-center"><FlaskConical className="w-4 h-4 text-success" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{t.testType.replace(/_/g, " ")} · {t.sampleRef}</p>
                    <p className="text-[0.6rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 22)}… · {t.trade?.seller?.legalName}</p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(t.status), borderColor: `${statusColor(t.status)}55` }}>{t.status}</Badge>
                  {t.status === "COMPLETED" ? <Button size="sm" variant="outline" className="h-7">View Report</Button> : <Button size="sm" className="bg-gold-gradient text-sovereign h-7" onClick={() => uploadingId === t.id ? setUploadingId(null) : setUploadingId(t.id)}>{uploadingId === t.id ? "Cancel" : "Upload Results"}</Button>}
                </div>
                {uploadingId === t.id && (
                  <div className="mt-2 p-3 rounded-lg bg-gold/5 border border-gold/20 space-y-2">
                    <div>
                      <Label className="text-[0.6rem]">Result Summary</Label>
                      <Textarea value={result} onChange={e => setResult(e.target.value)} placeholder="e.g., All pesticide residues below MRL limits. Chlorpyrifos: 0.01 mg/kg (MRL 0.05)…" className="text-xs min-h-[50px]" />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-[0.6rem]">Pass/Fail</Label>
                        <Select value={passFail} onValueChange={setPassFail}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="PASS" className="text-xs">PASS</SelectItem>
                            <SelectItem value="FAIL" className="text-xs">FAIL</SelectItem>
                            <SelectItem value="CONDITIONAL" className="text-xs">CONDITIONAL</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label className="text-[0.6rem]">Parameters (JSON)</Label>
                        <Input value={params} onChange={e => setParams(e.target.value)} placeholder='{"chlorpyrifos":"0.01","diazinon":"<0.01"}' className="h-8 text-xs font-mono" />
                      </div>
                    </div>
                    <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={() => uploadResults(t.id)} disabled={submitting || !result.trim()}>
                      {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Uploading…</> : <><Send className="w-3 h-3 mr-1" /> Submit Results</>}
                    </Button>
                  </div>
                )}
              </div>
            ))}
            {tests.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No tests in queue.</p>}
          </div>
        </Card>
      </div>
    );
  }

  // certificates — Certificates of Analysis (CoA) issued from completed lab tests
  if (tab === "certificates") {
    const issued = tests.filter((t: any) => t.status === "COMPLETED" && t.passFail);
    return (
      <div className="space-y-4">
        <SectionHeader
          title="Certificates of Analysis"
          subtitle="Issued from completed lab tests · USTN-linked · printable · PDF/A-3 embeddable"
        />
        {issued.length === 0 ? (
          <Card className="p-6 text-center">
            <FileCheck className="w-8 h-8 text-muted-foreground mx-auto mb-3" />
            <p className="text-sm font-medium">No certificates issued yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Certificates of Analysis are auto-issued when a lab test is marked COMPLETED with a Pass/Fail result.
              Upload results from the <span className="font-medium text-foreground">Test Requests</span> or <span className="font-medium text-foreground">Sampling Queue</span> tab to issue a certificate.
            </p>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {issued.map((t: any) => {
              const certNo = `CoA-${(t.id || "").slice(-8).toUpperCase()}`;
              const issuedAt = t.completedAt ? fmtDate(t.completedAt) : fmtDate(t.createdAt);
              const isPass = t.passFail === "PASS";
              const isCond = t.passFail === "CONDITIONAL";
              const accent = isPass ? "#16a34a" : isCond ? "#ca8a04" : "#dc2626";
              let params: Record<string, any> = {};
              try { params = t.parameters ? JSON.parse(t.parameters) : {}; } catch { params = {}; }
              return (
                <Card key={t.id} className="p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: `${accent}22` }}>
                        <FileCheck className="w-5 h-5" style={{ color: accent }} />
                      </div>
                      <div>
                        <p className="text-sm font-semibold leading-tight">{certNo}</p>
                        <p className="text-[0.65rem] text-muted-foreground font-mono">{t.trade?.ustn?.slice(0, 26) || "—"}…</p>
                      </div>
                    </div>
                    <Badge variant="outline" className="text-[0.6rem] shrink-0" style={{ color: accent, borderColor: `${accent}55` }}>
                      {t.passFail}
                    </Badge>
                  </div>

                  <div className="text-xs space-y-1.5">
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Test Type</span>
                      <span className="font-medium text-right">{t.testType?.replace(/_/g, " ") || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Sample Ref</span>
                      <span className="font-mono text-right">{t.sampleRef || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Commodity</span>
                      <span className="text-right">{t.trade?.commodity || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Seller</span>
                      <span className="text-right truncate max-w-[60%]">{t.trade?.seller?.legalName || "—"}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="text-muted-foreground">Issued</span>
                      <span className="text-right">{issuedAt}</span>
                    </div>
                  </div>

                  {t.result && (
                    <div className="p-2.5 rounded-lg bg-muted/30 border border-border/40">
                      <p className="text-[0.6rem] text-muted-foreground mb-1">Result Summary</p>
                      <p className="text-xs leading-relaxed">{t.result}</p>
                    </div>
                  )}

                  {Object.keys(params).length > 0 && (
                    <div className="p-2.5 rounded-lg bg-muted/20 border border-border/30">
                      <p className="text-[0.6rem] text-muted-foreground mb-1.5">Measured Parameters</p>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                        {Object.entries(params).map(([k, v]: any) => (
                          <div key={k} className="flex justify-between text-[0.65rem]">
                            <span className="text-muted-foreground capitalize">{k}</span>
                            <span className="font-mono">{String(v)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 mt-auto pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => {
                        const text = [
                          `Certificate of Analysis: ${certNo}`,
                          `USTN: ${t.trade?.ustn || "—"}`,
                          `Test Type: ${t.testType?.replace(/_/g, " ")}`,
                          `Sample Ref: ${t.sampleRef}`,
                          `Commodity: ${t.trade?.commodity || "—"}`,
                          `Result: ${t.passFail}`,
                          `Issued: ${issuedAt}`,
                          ``,
                          `Summary: ${t.result || "—"}`,
                          ``,
                          `Parameters:`,
                          ...Object.entries(params).map(([k, v]: any) => `  ${k}: ${v}`),
                        ].join("\n");
                        const blob = new Blob([text], { type: "text/plain" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = `${certNo}.txt`;
                        a.click();
                        URL.revokeObjectURL(url);
                        toast.success(`Certificate ${certNo} downloaded`);
                      }}
                    >
                      <FileText className="w-3 h-3 mr-1" /> Download
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs flex-1"
                      onClick={() => {
                        navigator.clipboard?.writeText(`${certNo} · ${t.trade?.ustn || "—"}`);
                        toast.success("Certificate reference copied");
                      }}
                    >
                      <Copy className="w-3 h-3 mr-1" /> Copy Ref
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
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [qcResult, setQcResult] = useState("PASS");
  const [defectCount, setDefectCount] = useState(0);
  const [qcNotes, setQcNotes] = useState("");
  const [actionPlan, setActionPlan] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const uploadReport = async (inspId: string) => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sgtx/qc-inspections/${inspId}/upload-report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ result: qcResult, defectCount: Number(defectCount), notes: qcNotes, actionPlan: qcResult === "CONDITIONAL_PASS" ? actionPlan : undefined }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("QC report uploaded");
        setUploadingId(null);
        setQcResult("PASS"); setDefectCount(0); setQcNotes(""); setActionPlan("");
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } else { toast.error(d.error || "Upload failed"); }
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

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
              <div><p className="text-[0.6rem] text-muted-foreground">Inspector</p><p className="font-medium">{q.inspectorName || "—"}</p></div>
              <div><p className="text-[0.6rem] text-muted-foreground">Defects</p><p className="font-medium">{q.defectCount}</p></div>
            </div>
            {q.notes && <p className="text-xs text-muted-foreground mt-2">{q.notes}</p>}
            {q.actionPlan && <p className="text-xs text-warning mt-2 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Action plan: {q.actionPlan}</p>}
            {q.status !== "COMPLETED" && (
              <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs mt-2 w-full" onClick={() => uploadingId === q.id ? setUploadingId(null) : setUploadingId(q.id)}>
                {uploadingId === q.id ? "Cancel" : "Upload Report"}
              </Button>
            )}
            {uploadingId === q.id && (
              <div className="mt-2 p-2 rounded-lg bg-gold/5 border border-gold/20 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[0.6rem]">Result</Label>
                    <Select value={qcResult} onValueChange={setQcResult}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PASS" className="text-xs">PASS</SelectItem>
                        <SelectItem value="FAIL" className="text-xs">FAIL</SelectItem>
                        <SelectItem value="CONDITIONAL_PASS" className="text-xs">CONDITIONAL PASS</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[0.6rem]">Defect Count</Label>
                    <Input type="number" value={defectCount} onChange={e => setDefectCount(Number(e.target.value))} className="h-8 text-xs" min={0} />
                  </div>
                </div>
                <div>
                  <Label className="text-[0.6rem]">Notes</Label>
                  <Textarea value={qcNotes} onChange={e => setQcNotes(e.target.value)} placeholder="Inspection findings, observations…" className="text-xs min-h-[40px]" />
                </div>
                {qcResult === "CONDITIONAL_PASS" && (
                  <div>
                    <Label className="text-[0.6rem]">Action Plan (required for conditional pass)</Label>
                    <Textarea value={actionPlan} onChange={e => setActionPlan(e.target.value)} placeholder="Remediation steps required before release…" className="text-xs min-h-[40px]" />
                  </div>
                )}
                <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs w-full" onClick={() => uploadReport(q.id)} disabled={submitting || (qcResult === "CONDITIONAL_PASS" && !actionPlan.trim())}>
                  {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Uploading…</> : <><Send className="w-3 h-3 mr-1" /> Submit Report</>}
                </Button>
              </div>
            )}
          </Card>
        ))}
        {insp.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground col-span-2">No inspections.</Card>}
      </div>
    </div>
  );
}

// ============ CBR / GOV: Shared Customs Clearance Action Row (CG-4 + CG-5) ============
// Renders one customs declaration with Clear / Hold / Reject action buttons.
// Each button opens a small Dialog with a notes/reason textarea, then POSTs to
// /api/sgtx/clearance/{approve|hold|reject}. Used by both CbrScreens (broker view)
// and GovScreens customs tab (regulator oversight view) — same actions, different context.
//
// Route body shapes (verified by reading approve/hold/reject route.ts):
//   approve: { ustn, approvedByGtid, notes }   — notes optional but recommended
//   hold:    { ustn, heldByGtid,    reason }   — reason REQUIRED (400 otherwise)
//   reject:  { ustn, rejectedByGtid, reason }  — reason REQUIRED (400 otherwise)
type ClearanceAction = "approve" | "hold" | "reject";

const CLEARANCE_ACTION_META: Record<ClearanceAction, { label: string; verb: string; field: "notes" | "reason"; required: boolean; icon: typeof CheckCircle2; accent: string }> = {
  approve: { label: "Clear", verb: "clear", field: "notes",  required: false, icon: CheckCircle2, accent: "text-success" },
  hold:    { label: "Hold",  verb: "hold",  field: "reason", required: true,  icon: AlertTriangle, accent: "text-warning" },
  reject:  { label: "Reject",verb: "reject",field: "reason", required: true,  icon: AlertCircle,   accent: "text-destructive" },
};

function ClearanceDeclarationRow({ d, actorGtid, perspective }: { d: any; actorGtid?: string; perspective: "cbr" | "gov" }) {
  const qc = useQueryClient();
  const [action, setAction] = useState<ClearanceAction | null>(null);
  const [text, setText] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const ustn = d?.trade?.ustn;
  const actionableStatuses = ["DRAFT", "SUBMITTED", "ASSESSED"];
  const isActionable = actionableStatuses.includes(d?.status);

  const submit = async () => {
    if (!action || !ustn) return;
    const meta = CLEARANCE_ACTION_META[action];
    if (meta.required && !text.trim()) {
      toast.error(`${meta.label} requires a reason`, { description: "Please enter a reason in the text area before confirming." });
      return;
    }
    setSubmitting(true);
    try {
      // Map action → route + body shape per the existing /api/sgtx/clearance/* routes.
      const body: Record<string, string> = { ustn };
      if (action === "approve") body.approvedByGtid = actorGtid || "";
      if (action === "hold")    body.heldByGtid     = actorGtid || "";
      if (action === "reject")  body.rejectedByGtid = actorGtid || "";
      body[meta.field] = text.trim();

      const res = await fetch(`/api/sgtx/clearance/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `${meta.label} failed`);
      toast.success(`Declaration ${meta.label.toLowerCase()}ed`, {
        description: `USTN ${ustn.slice(0, 24)}… · status → ${json.status || meta.label.toUpperCase()}`,
      });
      setAction(null);
      setText("");
      // Invalidate every query that might surface this declaration (dashboard + customs list).
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["customs-declaration-list"] });
    } catch (e: any) {
      toast.error(`Could not ${meta.label.toLowerCase()} declaration`, { description: e?.message || "Please try again." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-3 hover:bg-muted/30">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-warning/15 flex items-center justify-center shrink-0"><Landmark className="w-4 h-4 text-warning" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">{d.regime} · {d.declarationNo || "(no number)"}</p>
          <p className="text-[0.6rem] text-muted-foreground font-mono truncate">
            {ustn ? `${ustn.slice(0, 22)}…` : "—"} · {d.trade?.seller?.legalName || "?"} → {d.trade?.buyer?.legalName || "?"}
          </p>
          <p className="text-[0.6rem] text-muted-foreground">Nafeza: {d.nafezaStatus || "—"}</p>
        </div>
        <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(d.status), borderColor: `${statusColor(d.status)}55` }}>{d.status}</Badge>
      </div>
      {isActionable && ustn && (
        <div className="flex flex-wrap items-center gap-1.5 mt-2 ml-12">
          <span className="text-[0.6rem] text-muted-foreground mr-1">{perspective === "cbr" ? "Broker action:" : "Regulator action:"}</span>
          {(Object.keys(CLEARANCE_ACTION_META) as ClearanceAction[]).map((a) => {
            const meta = CLEARANCE_ACTION_META[a];
            const Icon = meta.icon;
            return (
              <Button
                key={a}
                size="sm"
                variant="outline"
                className="h-6 px-2 text-[0.65rem]"
                disabled={submitting}
                onClick={() => { setAction(a); setText(""); }}
              >
                <Icon className={`w-3 h-3 mr-1 ${meta.accent}`} /> {meta.label}
              </Button>
            );
          })}
        </div>
      )}
      {action && (
        <Dialog open onOpenChange={(o) => { if (!o && !submitting) { setAction(null); setText(""); } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(() => { const M = CLEARANCE_ACTION_META[action]; const Icon = M.icon; return <Icon className={`w-4 h-4 ${M.accent}`} />; })()}
                {CLEARANCE_ACTION_META[action].label} declaration
              </DialogTitle>
              <DialogDescription>
                {ustn ? `USTN ${ustn.slice(0, 24)}…` : "This declaration"} · {d.regime} · {d.declarationNo || "(no number)"}.{" "}
                {CLEARANCE_ACTION_META[action].field === "reason"
                  ? "Provide a reason — this will be visible to the trader and recorded in the audit trail."
                  : "Optional notes for the trader (recommended)."}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="clearance-text" className="text-xs">
                {CLEARANCE_ACTION_META[action].field === "reason" ? "Reason" : "Notes"}
                {CLEARANCE_ACTION_META[action].required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Textarea
                id="clearance-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={4}
                placeholder={CLEARANCE_ACTION_META[action].field === "reason" ? "e.g., Documentation incomplete — missing EUR.1" : "Optional context for the trader…"}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" disabled={submitting} onClick={() => { setAction(null); setText(""); }}>Cancel</Button>
              <Button size="sm" disabled={submitting} onClick={submit}>
                {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Submitting…</> : <>Confirm {CLEARANCE_ACTION_META[action].label}</>}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ============ CBR: Declarations / Certificates / Clearance ============
export function CbrScreens({ data, tab }: { data: Data; tab: string }) {
  const decls = data.customsDecls || [];
  const tenantGtid = data?.tenant?.gtid;
  return (
    <div className="space-y-4">
      <SectionHeader title={tab === "declarations" ? "Customs Declarations (Nafeza)" : tab === "certificates" ? "Certificates of Origin" : "Clearance Status"} subtitle="File SAD via Nafeza · EUR.1 · idempotency keys · mTLS" />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {decls.map((d: any) => (
            <ClearanceDeclarationRow key={d.id} d={d} actorGtid={tenantGtid} perspective="cbr" />
          ))}
          {decls.length === 0 && <p className="text-xs text-muted-foreground text-center py-8">No declarations assigned to you. New customs declarations will appear here once a trader designates you as their broker.</p>}
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
                <div className="w-full mt-3 p-2 rounded-lg bg-success/5 border border-emerald-500/20 text-xs">
                  <p className="text-success font-semibold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> B/L Issued: <span className="font-mono">{issuedBLs[s.id].blNumber}</span></p>
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
        {shipments.length === 0 && <Card className="p-6 text-center text-sm text-muted-foreground col-span-2">No shipments assigned.</Card>}
      </div>
    </div>
  );
}

// ============ LSP: Assignments / Milestones / Addenda ============

// LSP Assignment Row — shows shipment + inline form to assign driver/truck/container
function LspAssignmentRow({ s, tab }: { s: any; tab: string }) {
  const [showAssign, setShowAssign] = useState(false);
  const [driverName, setDriverName] = useState(s.driverName || "");
  const [truckNumber, setTruckNumber] = useState(s.truckNumber || "");
  const [containerNo, setContainerNo] = useState(s.containerNo || "");
  const [loadingDate, setLoadingDate] = useState(s.loadingDate ? s.loadingDate.slice(0, 10) : "");
  const [submitting, setSubmitting] = useState(false);
  const qc = useQueryClient();

  const assign = async () => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/sgtx/logistics/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: s.trade?.ustn,
          shipmentSeq: s.sequence,
          driverName, truckNumber, containerNo,
          loadingDate: loadingDate || undefined,
        }),
      });
      const d = await res.json();
      if (d.ok) {
        toast.success("Assignment saved", { description: `Driver: ${driverName}, Truck: ${truckNumber}, Container: ${containerNo}` });
        setShowAssign(false);
        qc.invalidateQueries({ queryKey: ["dashboard"] });
      } else { toast.error(d.error || "Assignment failed"); }
    } catch (e: any) { toast.error(e.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 hover:bg-muted/30 -mx-4 px-4 py-1 rounded">
        <div className="w-9 h-9 rounded-lg bg-warning/15 flex items-center justify-center"><Package className="w-4 h-4 text-warning" /></div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium">Container {s.containerNo || "—"} · {s.vesselName || "—"}</p>
          <p className="text-[0.6rem] text-muted-foreground font-mono">{s.trade?.ustn?.slice(0, 22)}… · {s.trade?.seller?.legalName}</p>
          <p className="text-[0.6rem] text-muted-foreground">{s.originPort} → {s.destPort} · ETA {fmtDate(s.eta)}</p>
          {s.driverName && <p className="text-[0.6rem] text-gold mt-0.5">🚚 Driver: {s.driverName} · Truck: {s.truckNumber}</p>}
        </div>
        <Badge variant="outline" className="text-[0.6rem]" style={{ color: statusColor(s.status), borderColor: `${statusColor(s.status)}55` }}>{s.status.replace(/_/g, " ")}</Badge>
        {tab === "assignments" && (
          <Button size="sm" className="bg-gold-gradient text-sovereign h-7 text-xs" onClick={() => setShowAssign(!showAssign)}>
            {showAssign ? "Cancel" : s.driverName ? "Edit" : "Assign"}
          </Button>
        )}
        {tab === "milestones" && <Button size="sm" className="bg-gold-gradient text-sovereign h-7">Confirm</Button>}
      </div>
      {showAssign && (
        <div className="mt-2 p-3 rounded-lg bg-gold/5 border border-gold/20 space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <div>
              <Label className="text-[0.6rem]">Driver Name</Label>
              <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Ahmed Hassan" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[0.6rem]">Truck Number</Label>
              <Input value={truckNumber} onChange={e => setTruckNumber(e.target.value)} placeholder="DXB-1234" className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[0.6rem]">Container Number</Label>
              <Input value={containerNo} onChange={e => setContainerNo(e.target.value)} placeholder="MEDU1234567" className="h-8 text-xs font-mono" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[0.6rem]">Loading Date</Label>
              <Input type="date" value={loadingDate} onChange={e => setLoadingDate(e.target.value)} className="h-8 text-xs" />
            </div>
            <div className="flex items-end">
              <Button size="sm" className="bg-gold-gradient text-sovereign h-8 text-xs w-full" onClick={assign} disabled={submitting || !driverName.trim() || !truckNumber.trim()}>
                {submitting ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Saving…</> : <><Send className="w-3 h-3 mr-1" /> Save Assignment</>}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============ LSP: RFQ Row with "Send Quote" form (CG-1 fix) ============
// Replaces the previously read-only RFQ rendering. The LSP can now respond to
// a seller's broadcast RFQ with a real freight rate, transit time, validity
// date, and notes. On submit the form POSTs to /api/sgtx/providers/quote
// (providerType: "LSP") which creates a ServiceQuotation + Smart-Inboxes the
// seller with an "Accept Quote" CTA.
function LspRfqRow({ q, tenantGtid }: { q: any; tenantGtid: string }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [freightRateUsd, setFreightRateUsd] = useState<string>("");
  const [transitDays, setTransitDays] = useState<string>("");
  const [validityDate, setValidityDate] = useState<string>("");
  const [notes, setNotes] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const rate = Number(freightRateUsd);
    if (!Number.isFinite(rate) || rate <= 0) {
      toast.error("Freight rate is required", { description: "Enter a positive USD amount." });
      return;
    }
    setSubmitting(true);
    try {
      // Derive validityDays from the picked date (clamped to >= 1 day).
      let validityDays = 7;
      if (validityDate) {
        const diffMs = new Date(validityDate).getTime() - Date.now();
        validityDays = Math.max(1, Math.ceil(diffMs / 86_400_000));
      }
      // Transit days → ETA (used by the route + surfaced to the seller).
      const etaIso = transitDays
        ? new Date(Date.now() + Number(transitDays) * 86_400_000).toISOString()
        : undefined;

      const res = await fetch("/api/sgtx/providers/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn: q.ustn || undefined,
          tradeId: q.tradeId || undefined,
          providerGtid: tenantGtid,
          providerType: "LSP",
          serviceType: q.serviceType || "TRUCKING",
          feeUsd: rate,
          validityDays,
          eta: etaIso,
          notes: notes || undefined,
          description: `LSP quote for ${q.serviceType?.replace(/_/g, " ") || "logistics"} — freight $${rate} · transit ${transitDays || "—"} days`,
        }),
      });
      const d = await res.json();
      if (res.ok && d.ok) {
        toast.success("Quote sent to seller", {
          description: `Quote ${d.quoteId} · $${rate} USD · valid ${validityDays}d`,
        });
        setOpen(false);
        setFreightRateUsd(""); setTransitDays(""); setValidityDate(""); setNotes("");
        qc.invalidateQueries({ queryKey: ["lsp-rfq-inbox", tenantGtid] });
      } else {
        toast.error(d.error || "Could not send quote", { description: d.reason || "" });
      }
    } catch (e: any) {
      toast.error("Network error sending quote", { description: e?.message || "" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex items-center gap-3 hover:bg-muted/30 -mx-4 px-4 py-1 rounded">
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
          <p className="text-[0.6rem] text-muted-foreground">Est. fee</p>
          <p className="text-xs font-semibold text-gold">{fmtUsd(q.feeUsd || 0)}</p>
        </div>
        <Badge variant="outline" className="text-[0.6rem] text-warning border-amber-500/30">
          {q.status}
        </Badge>
        <Button
          size="sm"
          className="bg-gold-gradient text-sovereign h-7 text-xs"
          onClick={() => setOpen(!open)}
        >
          {open ? "Cancel" : <><Send className="w-3 h-3 mr-1" /> Send Quote</>}
        </Button>
      </div>
      {open && (
        <div className="mt-2 p-3 rounded-lg bg-gold/5 border border-gold/20 space-y-2">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <div>
              <Label className="text-[0.6rem]">Freight rate (USD) *</Label>
              <Input
                type="number"
                min={0}
                step="0.01"
                value={freightRateUsd}
                onChange={e => setFreightRateUsd(e.target.value)}
                placeholder="1,250.00"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem]">Transit days</Label>
              <Input
                type="number"
                min={0}
                value={transitDays}
                onChange={e => setTransitDays(e.target.value)}
                placeholder="7"
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[0.6rem]">Validity date</Label>
              <Input
                type="date"
                value={validityDate}
                onChange={e => setValidityDate(e.target.value)}
                className="h-8 text-xs"
              />
            </div>
          </div>
          <div>
            <Label className="text-[0.6rem]">Notes</Label>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Equipment type, cut-off times, special handling, etc."
              className="min-h-[48px] text-xs"
            />
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              className="bg-gold-gradient text-sovereign h-8 text-xs"
              onClick={submit}
              disabled={submitting || !freightRateUsd.trim()}
            >
              {submitting
                ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" /> Sending…</>
                : <><Send className="w-3 h-3 mr-1" /> Submit Quote</>}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

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
                No pending RFQs. When a seller requests a service quotation during quote preparation, it will appear here for your response.
              </p>
            ) : (
              pendingRfqs.map((q: any) => (
                <LspRfqRow key={q.id} q={q} tenantGtid={tenantGtid} />
              ))
            )}
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Active Assignments</h3>
          <p className="text-[0.6rem] text-muted-foreground mt-0.5">Containers assigned to your fleet — click Assign to enter driver, truck, and container details</p>
        </div>
        <div className="divide-y divide-border/40">
          {shipments.map((s: any) => (
            <LspAssignmentRow key={s.id} s={s} tab={tab} />
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
    return <GovFoodSafetyScreen />;
  }
  if (tab === "customs") {
    return <GovCustomsScreen tenantGtid={tenantGtid} />;
  }
  // trade-flow (default)
  return (
    <div className="space-y-4">
      <SectionHeader title="National Trade Flow" subtitle="Real-time visibility of every cross-border trade moving through SGTX" />
      {tradesLoading && dashboardTrades.length === 0 ? (
        <Card className="p-6 text-center text-sm text-muted-foreground flex items-center justify-center gap-2">
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
            <Card className="p-6 text-center text-sm text-muted-foreground">
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

// ============ GOV Customs (CG-5) — regulator oversight of Nafeza declarations ============
// Same ClearanceDeclarationRow component as CBR (same /api/sgtx/clearance/* routes),
// but viewed from the regulator perspective: every declaration in the platform,
// not just the broker's assigned ones. The GOV can Clear/Hold/Reject any
// declaration — the regulator is the oversight layer above the broker.
function GovCustomsScreen({ tenantGtid }: { tenantGtid?: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["customs-declaration-list"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/customs-declaration/list?limit=200");
        if (!r.ok) return { declarations: [] as any[], total: 0 };
        return r.json();
      } catch {
        return { declarations: [], total: 0 };
      }
    },
    staleTime: 30_000,
  });
  const decls: any[] = data?.declarations || [];
  const pending = decls.filter((d) => ["DRAFT", "SUBMITTED", "ASSESSED"].includes(d.status));
  const cleared = decls.filter((d) => d.status === "CLEARED");
  const held    = decls.filter((d) => d.status === "HELD");
  const rejected = decls.filter((d) => d.status === "REJECTED");

  return (
    <div className="space-y-4">
      <SectionHeader title="Customs Assessment" subtitle="Nafeza declarations · assess · clear · hold — regulator oversight layer" />
      <ExecutiveCards cards={[
        { label: "Total Declarations", value: String(decls.length), icon: Landmark, accent: "#ca8a04" },
        { label: "Pending Action", value: String(pending.length), icon: Clock, accent: "#fbbf24" },
        { label: "Cleared", value: String(cleared.length), icon: CheckCircle2, accent: "#10b981", trendDir: cleared.length ? "up" : "flat" },
        { label: "Held / Rejected", value: String(held.length + rejected.length), icon: AlertTriangle, accent: "#ef4444" },
      ]} />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {isLoading && decls.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-gold" /> Loading declarations from Nafeza…
            </div>
          ) : decls.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-8">
              No customs declarations have been filed via Nafeza yet. Declarations will appear here as brokers file SADs for their assigned trades.
            </p>
          ) : (
            decls.map((d: any) => (
              <ClearanceDeclarationRow key={d.id} d={d} actorGtid={tenantGtid} perspective="gov" />
            ))
          )}
        </div>
      </Card>
    </div>
  );
}

// ============ GOV Food Safety (CG-6) — replaces hardcoded demo data ============
// Fetches REAL food-safety signals from /api/sgtx/health/food-safety:
//   - QC inspections with result=FAIL on food commodities
//   - PHYTO / HEALTH_CERT documents not yet VERIFIED
// Empty-state shows "No active food-safety alerts" rather than fake data.
function GovFoodSafetyScreen() {
  const { data, isLoading } = useQuery({
    queryKey: ["food-safety-alerts"],
    queryFn: async () => {
      try {
        const r = await fetch("/api/sgtx/health/food-safety?limit=50");
        if (!r.ok) return { alerts: [] as any[], summary: { total: 0, qcFails: 0, pendingCerts: 0 } };
        return r.json();
      } catch {
        return { alerts: [], summary: { total: 0, qcFails: 0, pendingCerts: 0 } };
      }
    },
    staleTime: 30_000,
  });
  const alerts: any[] = data?.alerts || [];
  const summary = data?.summary || { total: alerts.length, qcFails: 0, pendingCerts: 0 };

  return (
    <div className="space-y-4">
      <SectionHeader title="Food Safety (NFSA)" subtitle="Phytosanitary · health certificates · lab report oversight — live signals" />
      <ExecutiveCards cards={[
        { label: "Active Alerts", value: String(summary.total || alerts.length), icon: AlertTriangle, accent: summary.total ? "#ef4444" : "#10b981" },
        { label: "QC FAILs", value: String(summary.qcFails || 0), icon: AlertCircle, accent: "#ef4444" },
        { label: "Pending Certs", value: String(summary.pendingCerts || 0), icon: FileText, accent: "#fbbf24" },
        { label: "Verified (30d)", value: "—", icon: CheckCircle2, accent: "#10b981" },
      ]} />
      <Card className="overflow-hidden">
        <div className="divide-y divide-border/40">
          {isLoading && alerts.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin text-gold" /> Loading food-safety alerts…
            </div>
          ) : alerts.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <CheckCircle2 className="w-6 h-6 mx-auto mb-2 text-success/60" />
              <p className="text-sm font-medium text-foreground">No active food-safety alerts</p>
              <p className="text-[0.65rem] text-muted-foreground mt-1">
                QC FAIL inspections and pending phytosanitary / health certificates will appear here in real time.
              </p>
            </div>
          ) : (
            alerts.map((a: any) => {
              const isFail = a.kind === "QC_FAIL";
              const color = isFail ? "#ef4444" : (a.status === "REJECTED" ? "#ef4444" : "#fbbf24");
              const Icon = isFail ? AlertCircle : FileText;
              return (
                <div key={a.reference} className="px-4 py-3 hover:bg-muted/30 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1a` }}>
                    <Icon className="w-4 h-4" style={{ color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{isFail ? "QC FAIL" : a.status === "REJECTED" ? "Certificate rejected" : "Certificate pending"}{a.ustn ? ` · ${a.ustn.slice(0, 22)}…` : ""}</p>
                    <p className="text-[0.6rem] text-muted-foreground truncate">{a.summary}</p>
                    <p className="text-[0.6rem] text-muted-foreground">{fmtDate(a.createdAt)}</p>
                  </div>
                  <Badge variant="outline" className="text-[0.6rem]" style={{ color, borderColor: `${color}55` }}>{isFail ? "FAIL" : a.status}</Badge>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

function IntegrationsFull() {
  const { data: integ } = useQuery({ queryKey: ["integrations"], queryFn: async () => (await fetch("/api/sgtx/integrations")).json() });
  if (!integ) return <Card className="p-6 text-center text-sm text-muted-foreground">Loading integrations…</Card>;
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
  if (tab === "worldwide-routes") return <WorldwideRoutesDashboard />;
  if (tab === "routes-reference") return <PortPairReference />;
  if (tab === "shipments") return <div className="space-y-4"><SectionHeader title={portal.id.includes("seller") ? "Outbound Shipments" : "Shipments"} subtitle="Shared Shipments Vault · click any USTN to open the Trade Command Center" /><ShipmentsVault trades={trades} role={portal.id.includes("buyer") ? "buyer" : "seller"} /></div>;
  if (tab === "documents") return <div className="space-y-4"><SectionHeader title="Documents" subtitle="USTN-linked · PDF/A-3 · verify · upload · request" /><DocumentsList documents={trades.flatMap((t: any) => t.documents || [])} /></div>;
  if (tab === "invoices") return <div className="space-y-4"><SectionHeader title="Invoices & Payments" subtitle="ETA-compliant XML · PSP split · non-custodial FeeLock" /><InvoicesList invoices={data.invoices || []} perspective={portal.id.includes("seller") ? "payee" : "payer"} /></div>;
  // NOTE: `milestones` is guarded for LSP (has its own Milestone Confirmation screen in LspScreens).
  // NOTE: `audit` is guarded for admin (has its own Governor Audit screen — AdminAuditScreen).
  if (tab === "milestones" && portal.id !== "lsp") return <ShipmentsMilestoneScreen data={data} />;
  if (tab === "settlement") return <SettlementScreen data={data} />;
  if (tab === "audit" && portal.id !== "admin") return <AuditScreen data={data} />;
  if (tab === "admin") return <CompanyAdminScreen data={data} />;
  if (tab === "compliance") return <ComplianceScreen data={data} />;
  if (tab === "disputes") return <DisputesScreen data={data} />;
  if (tab === "distressed") return <DistressedCargoScreen data={data} />;
  if (tab === "network") return <NetworkScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "readiness") return <ReadinessScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "lifecycle") return <LifecycleScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "org-graph") return <OrgGraphScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "passport") return <TrustPassportScreen tenantGtid={portal.defaultTenantGtid} />;
  if (tab === "chat") return <GtidChatScreen tenantGtid={portal.defaultTenantGtid} />;

  // ── Trade UI (TRADE-UI task) — VGM/DG/Seals, L/C+UCP600, COO, Reefer, Lots
  // The dispatcher derives an active USTN + tradeId from the dashboard's
  // trades (preferring IN_EXECUTION / CONTRACT_SIGNED) so the panels have a
  // trade context to operate on. Each panel handles its own loading / empty
  // states when no trade is available.
  const readyTradesForTradeUi = trades.filter((t: any) =>
    ["QUOTE_ACCEPTED", "BUYER_SUBMITTED", "CONTRACT_SIGNED", "IN_EXECUTION", "DELIVERED", "SETTLED"].includes(t.status),
  );
  const activeTradeForTradeUi = readyTradesForTradeUi[0] || trades[0] || null;
  const activeUstnForTradeUi: string = activeTradeForTradeUi?.ustn || "";
  const activeTradeIdForTradeUi: string = activeTradeForTradeUi?.id || "";
  // First shipment with a valid id (used for the reefer telemetry panel).
  const activeShipmentIdForTradeUi: string =
    (activeTradeForTradeUi?.shipments?.[0]?.id as string | undefined) ||
    (activeTradeForTradeUi?.shipments?.[0] as any)?.id ||
    "";

  if (tab === "container-compliance") {
    return (
      <ContainerCompliancePanel
        tradeId={activeTradeIdForTradeUi}
        ustn={activeUstnForTradeUi}
      />
    );
  }
  if (tab === "lc-management") {
    return <LetterOfCreditPanel ustn={activeUstnForTradeUi} />;
  }
  if (tab === "trade-certificates") {
    return <CertificateOfOriginPanel ustn={activeUstnForTradeUi} />;
  }
  if (tab === "reefer-telemetry") {
    return (
      <ReeferTelemetryPanel
        shipmentId={activeShipmentIdForTradeUi}
        ustn={activeUstnForTradeUi}
      />
    );
  }
  if (tab === "lot-management") {
    return (
      <LotManagementPanel
        tradeId={activeTradeIdForTradeUi}
        ustn={activeUstnForTradeUi}
      />
    );
  }

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
    if (tab === "quote-builder") return <QuoteBuilderScreen data={data} />;
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
    if (["requests", "queue", "reports", "certificates"].includes(tab)) return <LabScreens data={data} tab={tab} />;
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
    if (tab === "defi") return <FinancierPortfolioScreen initialTab="defi" title="DeFi Pools" subtitle="On-chain liquidity · stablecoin reserves · ZK proof-of-reserves · non-custodial" />;
    if (tab === "preferences") return <FinancierPreferencesScreen />;
    if (tab === "borrowers") return <div className="space-y-4"><SectionHeader title="Financed Companies" subtitle="Historical borrower data · repayment performance · non-marketplace" /><Card className="p-4 text-xs text-muted-foreground">Borrower history available for companies you've previously financed.</Card></div>;
    if (tab === "collateral") return <div className="space-y-4"><SectionHeader title="Collateral & Margin Calls" subtitle="FeeLock-secured · ZK proof-of-reserves" /><Card className="p-4 text-xs text-muted-foreground">All loans are over-collateralised via FeeLock. No margin calls currently active.</Card></div>;
    // `settlement` handled by universal handler above (identical component) — L7 dead-duplicate removed.
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
