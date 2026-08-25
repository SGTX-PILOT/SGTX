// @ts-nocheck
"use client";
// ═══════════════════════════════════════════════════════════════════════════════
// SGTX One-Click Action Bar — v13.1 FINAL "Least Clicks" UX
// ═══════════════════════════════════════════════════════════════════════════════
// A prominent, always-visible action bar rendered at the TOP of every portal's
// Command Center. Designed per the user's mandate: "MAKE IT USER FRIENDLY WITH
// LEAST AMOUNT OF CLICKS TO PROCESS THE WHOLE TRADE."
//
// Each portal gets TWO primary actions:
//   1. "1-Click Trade" — the single most common trade-initiation action
//   2. "1-Click Payment" — the single most common payment/financial action
//
// For non-trade portals (QC, Lab, Gov, etc.), the buttons are contextually
// adapted to that portal's primary workflow (e.g. "1-Click Inspection" for QC,
// "1-Click Declare" for Customs Broker, "1-Click Assess" for Government).
//
// The bar uses a gold-gradient design language to visually distinguish it from
// the rest of the dashboard, signalling "this is your fastest path to action."
// ═══════════════════════════════════════════════════════════════════════════════

import { useMemo, type ReactNode } from "react";
import { toast } from "sonner";
import {
  Zap, Banknote, Plus, ShieldCheck, FileText, CheckCircle2,
  Truck, Ship, FlaskConical, Landmark, Gavel, Globe2,
  Store, Package, Users, Activity, AlertTriangle, Cpu,
  type LucideIcon,
} from "lucide-react";

export interface OneClickAction {
  label: string;
  icon: LucideIcon;
  tab: string;
  variant: "primary" | "secondary";
  description?: string;
}

interface PortalActionConfig {
  tradeAction: OneClickAction;
  paymentAction: OneClickAction;
}

// Per-portal action configuration — each portal gets its two most common
// "least-click" actions. The `tab` field deep-links into the portal's own
// tab system so one click lands the user directly on the action screen.
const PORTAL_ACTIONS: Record<string, PortalActionConfig> = {
  "trader-buyer": {
    tradeAction: { label: "1-Click New Trade", icon: Plus, tab: "new-trade", variant: "primary", description: "Start a new trade request" },
    paymentAction: { label: "1-Click Pay Invoice", icon: Banknote, tab: "invoices", variant: "secondary", description: "Approve pending invoice" },
  },
  "trader-seller": {
    tradeAction: { label: "1-Click Submit Quote", icon: Store, tab: "quote-builder", variant: "primary", description: "Build & send EXW quote" },
    paymentAction: { label: "1-Click Request Payout", icon: Banknote, tab: "invoices", variant: "secondary", description: "Request settlement payout" },
  },
  lsp: {
    tradeAction: { label: "1-Click Dispatch", icon: Truck, tab: "dispatch-planner", variant: "primary", description: "Assign driver & dispatch" },
    paymentAction: { label: "1-Click Log Milestone", icon: CheckCircle2, tab: "milestones", variant: "secondary", description: "Confirm delivery milestone" },
  },
  ship: {
    tradeAction: { label: "1-Click Issue B/L", icon: FileText, tab: "bl", variant: "primary", description: "Issue Bill of Lading" },
    paymentAction: { label: "1-Click Authorize Release", icon: ShieldCheck, tab: "containers", variant: "secondary", description: "Authorize container release" },
  },
  lab: {
    tradeAction: { label: "1-Click Start Sampling", icon: FlaskConical, tab: "queue", variant: "primary", description: "Begin lab sampling" },
    paymentAction: { label: "1-Click Release Report", icon: FileText, tab: "reports", variant: "secondary", description: "Publish test report" },
  },
  qc: {
    tradeAction: { label: "1-Click Start Inspection", icon: ShieldCheck, tab: "schedule", variant: "primary", description: "Begin QC inspection" },
    paymentAction: { label: "1-Click Issue Report", icon: CheckCircle2, tab: "reports", variant: "secondary", description: "Publish QC report" },
  },
  cbr: {
    tradeAction: { label: "1-Click File Declaration", icon: Landmark, tab: "declarations", variant: "primary", description: "File customs declaration (Nafeza)" },
    paymentAction: { label: "1-Click Clear Shipment", icon: CheckCircle2, tab: "clearance", variant: "secondary", description: "Clear customs & release" },
  },
  bank: {
    tradeAction: { label: "1-Click Submit Bid", icon: Banknote, tab: "opportunities", variant: "primary", description: "Bid on financing request" },
    paymentAction: { label: "1-Click Disburse", icon: Zap, tab: "portfolio", variant: "secondary", description: "Disburse approved loan" },
  },
  pfi: {
    tradeAction: { label: "1-Click Submit Offer", icon: Banknote, tab: "opportunities", variant: "primary", description: "Submit financing offer" },
    paymentAction: { label: "1-Click Release Funds", icon: Zap, tab: "portfolio", variant: "secondary", description: "Release approved funds" },
  },
  gov: {
    tradeAction: { label: "1-Click Assess Declaration", icon: Landmark, tab: "customs", variant: "primary", description: "Assess customs declaration" },
    paymentAction: { label: "1-Click Reconcile FX", icon: Banknote, tab: "fx", variant: "secondary", description: "Reconcile FX settlement" },
  },
  admin: {
    tradeAction: { label: "1-Click Run Audit", icon: ShieldCheck, tab: "audit", variant: "primary", description: "Run Governor audit" },
    paymentAction: { label: "1-Check Integrations", icon: Cpu, tab: "integrations", variant: "secondary", description: "Check integration health" },
  },
  "marketplace-partner": {
    tradeAction: { label: "1-Click View Leads", icon: Users, tab: "leads", variant: "primary", description: "View incoming leads" },
    paymentAction: { label: "1-Click Generate Key", icon: Cpu, tab: "api-keys", variant: "secondary", description: "Generate API key" },
  },
};

interface OneClickActionBarProps {
  portalId: string;
  onNavigate: (tab: string, label: string) => void;
}

export function OneClickActionBar({ portalId, onNavigate }: OneClickActionBarProps) {
  const config = useMemo(() => PORTAL_ACTIONS[portalId], [portalId]);

  if (!config) return null;

  const handleTrade = () => {
    onNavigate(config.tradeAction.tab, config.tradeAction.label);
    toast.success(`${config.tradeAction.label}`, {
      description: config.tradeAction.description || `Opening ${config.tradeAction.tab}…`,
    });
  };

  const handlePayment = () => {
    onNavigate(config.paymentAction.tab, config.paymentAction.label);
    toast.success(`${config.paymentAction.label}`, {
      description: config.paymentAction.description || `Opening ${config.paymentAction.tab}…`,
    });
  };

  return (
    <div className="rounded-xl border-2 border-gold/30 bg-gradient-to-r from-gold/10 via-gold/5 to-transparent p-3 sm:p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <Zap className="w-4 h-4 text-gold flex-shrink-0" />
        <p className="text-[0.6rem] tracking-widest text-gold uppercase font-bold">
          1-Click Actions
        </p>
        <span className="text-[0.55rem] text-muted-foreground ml-auto hidden sm:inline">
          Fastest path to trade & payment
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:gap-3">
        <button
          type="button"
          onClick={handleTrade}
          className="group relative flex items-center gap-2 sm:gap-3 rounded-lg bg-gold-gradient px-3 py-2.5 sm:px-4 sm:py-3 text-sovereign font-bold shadow-lg hover:shadow-xl hover:scale-[1.02] transition-all duration-200 min-h-[44px]"
          aria-label={config.tradeAction.label}
        >
          <config.tradeAction.icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <div className="text-left flex-1 min-w-0">
            <p className="text-[0.65rem] sm:text-xs leading-tight font-bold truncate">
              {config.tradeAction.label}
            </p>
            <p className="text-[0.5rem] sm:text-[0.6rem] opacity-80 truncate hidden sm:block">
              {config.tradeAction.description}
            </p>
          </div>
        </button>
        <button
          type="button"
          onClick={handlePayment}
          className="group relative flex items-center gap-2 sm:gap-3 rounded-lg border-2 border-gold/40 bg-background/60 px-3 py-2.5 sm:px-4 sm:py-3 text-gold font-bold hover:bg-gold/10 hover:border-gold/60 transition-all duration-200 min-h-[44px]"
          aria-label={config.paymentAction.label}
        >
          <config.paymentAction.icon className="w-4 h-4 sm:w-5 sm:h-5 flex-shrink-0" />
          <div className="text-left flex-1 min-w-0">
            <p className="text-[0.65rem] sm:text-xs leading-tight font-bold truncate">
              {config.paymentAction.label}
            </p>
            <p className="text-[0.5rem] sm:text-[0.6rem] opacity-70 truncate hidden sm:block">
              {config.paymentAction.description}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
