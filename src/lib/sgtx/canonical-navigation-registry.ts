// ═══════════════════════════════════════════════════════════════════════════════
// SGTX v18 §16 — Centralized Navigation Registry
// ═══════════════════════════════════════════════════════════════════════════════
//
// Single source of truth for ALL navigation items across the platform.
// Consumed by: landing page header, CockpitShell sidebar, mobile nav, breadcrumbs.
//
// Every navigation item has:
//   - unique key
//   - display label
//   - icon (lucide-react component)
//   - route (actual Next.js route)
//   - required role (which tenant roles can see this)
//   - required permission (which permission string is needed)
//   - trader-mode dependency (BUY/SELL/DUAL — only for TRD tenants)
//   - feature availability state (available/coming-soon/disabled)
//   - destination component (which page renders)
//   - breadcrumb metadata
//   - analytics/event key

import {
  Inbox, ArrowRight, Users, BarChart3, Scale, Brain, BookOpen,
  Home, Package, DollarSign, FileText, Settings, Shield,
  TrendingUp, Bell, Search, Globe2, Activity, Cpu, Lock,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type NavFeatureState = "available" | "coming-soon" | "disabled";
export type NavRole = "TRD" | "LSP" | "SHIP" | "LAB" | "QC" | "CBR" | "FIN" | "GOV" | "MP" | "ADM" | "ALL";
export type NavTraderMode = "BUY" | "SELL" | "DUAL" | "ANY";

export interface NavItem {
  key: string;
  label: string;
  icon: LucideIcon;
  route: string;
  roles: NavRole[];
  permission?: string;
  traderMode?: NavTraderMode;
  featureState: NavFeatureState;
  component: string;
  breadcrumb: string[];
  analyticsKey: string;
  description?: string;
}

// ── Public landing page navigation ──────────────────────────────────────────
export const LANDING_NAV: NavItem[] = [
  { key: "home", label: "Home", icon: Home, route: "/login?next=/home", roles: ["ALL"], featureState: "available", component: "LandingPage", breadcrumb: ["Home"], analyticsKey: "nav.home" },
  { key: "smart-inbox", label: "Smart Inbox", icon: Inbox, route: "/login?next=/home", roles: ["ALL"], featureState: "available", component: "HomePage", breadcrumb: ["Smart Inbox"], analyticsKey: "nav.inbox" },
  { key: "trade-execution", label: "Trade Execution", icon: ArrowRight, route: "/login?next=/trades", roles: ["TRD", "ADM"], featureState: "available", component: "TradesPage", breadcrumb: ["Trades"], analyticsKey: "nav.trades" },
  { key: "network", label: "Network", icon: Users, route: "/login?next=/network", roles: ["ALL"], featureState: "available", component: "NetworkPage", breadcrumb: ["Network"], analyticsKey: "nav.network" },
  { key: "analytics", label: "Analytics", icon: BarChart3, route: "/login?next=/home", roles: ["ALL"], featureState: "available", component: "HomePage", breadcrumb: ["Analytics"], analyticsKey: "nav.analytics" },
  { key: "compliance", label: "Compliance", icon: Scale, route: "/login?next=/trust", roles: ["ALL"], featureState: "available", component: "TrustPage", breadcrumb: ["Trust"], analyticsKey: "nav.trust" },
  { key: "ai-intelligence", label: "AI Intelligence", icon: Brain, route: "/login?next=/home", roles: ["ALL"], featureState: "available", component: "HomePage", breadcrumb: ["AI"], analyticsKey: "nav.ai" },
  { key: "resources", label: "Resources", icon: BookOpen, route: "/login?next=/network", roles: ["ALL"], featureState: "available", component: "NetworkPage", breadcrumb: ["Resources"], analyticsKey: "nav.resources" },
];

// ── Cockpit sidebar navigation (authenticated) ─────────────────────────────
export const COCKPIT_NAV: NavItem[] = [
  {
    key: "cockpit-home", label: "Home", icon: Home, route: "/home",
    roles: ["ALL"], featureState: "available", component: "HomePage",
    breadcrumb: ["Home"], analyticsKey: "cockpit.home",
    description: "Smart Inbox + Trade Command Center",
  },
  {
    key: "cockpit-trades", label: "Trades", icon: ArrowRight, route: "/trades",
    roles: ["TRD", "ADM"], featureState: "available", component: "TradesPage",
    breadcrumb: ["Trades"], analyticsKey: "cockpit.trades",
    description: "Trade list + new trade + TCC",
  },
  {
    key: "cockpit-operations", label: "Operations", icon: Package, route: "/operations",
    roles: ["LSP", "SHIP", "LAB", "QC", "CBR", "GOV", "TRD", "ADM"], featureState: "available", component: "OperationsPage",
    breadcrumb: ["Operations"], analyticsKey: "cockpit.operations",
    description: "LSP/SHIP/LAB/QC/CBR/GOV portals",
  },
  {
    key: "cockpit-money", label: "Money", icon: DollarSign, route: "/money",
    roles: ["TRD", "FIN", "GOV", "ADM"], featureState: "available", component: "MoneyPage",
    breadcrumb: ["Money"], analyticsKey: "cockpit.money",
    description: "Invoices + financing + settlement",
  },
  {
    key: "cockpit-trust", label: "Trust", icon: Shield, route: "/trust",
    roles: ["ALL"], featureState: "available", component: "TrustPage",
    breadcrumb: ["Trust"], analyticsKey: "cockpit.trust",
    description: "Trust Passport + TRI score",
  },
  {
    key: "cockpit-network", label: "Network", icon: Users, route: "/network",
    roles: ["ALL"], featureState: "available", component: "NetworkPage",
    breadcrumb: ["Network"], analyticsKey: "cockpit.network",
    description: "Saved contacts + corridors",
  },
  {
    key: "cockpit-admin", label: "Admin", icon: Settings, route: "/admin",
    roles: ["ADM", "GOV"], featureState: "available", component: "AdminPage",
    breadcrumb: ["Admin"], analyticsKey: "cockpit.admin",
    description: "Constitutional policies + Governor log + tenant management",
  },
];

// ── Header controls ──────────────────────────────────────────────────────────
export const HEADER_CONTROLS: NavItem[] = [
  { key: "search", label: "Search", icon: Search, route: "/home", roles: ["ALL"], featureState: "available", component: "UniversalSearch", breadcrumb: ["Search"], analyticsKey: "header.search", description: "Universal search + USTN resolution" },
  { key: "notifications", label: "Notifications", icon: Bell, route: "/home", roles: ["ALL"], featureState: "available", component: "NotificationCenter", breadcrumb: ["Notifications"], analyticsKey: "header.notifications" },
  { key: "language", label: "Language", icon: Globe2, route: "#", roles: ["ALL"], featureState: "available", component: "LanguageSelector", breadcrumb: ["Language"], analyticsKey: "header.language" },
  { key: "theme", label: "Theme", icon: Settings, route: "#", roles: ["ALL"], featureState: "available", component: "ThemeToggle", breadcrumb: ["Theme"], analyticsKey: "header.theme" },
];

// ── Role-specific quick actions (max 8 per role per v18 §2.5.2) ────────────
export const QUICK_ACTIONS: Record<string, NavItem[]> = {
  TRD_BUY: [
    { key: "qa-new-trade", label: "New Trade Request", icon: ArrowRight, route: "/trades/new", roles: ["TRD"], traderMode: "BUY", featureState: "available", component: "TradeRequestWizard", breadcrumb: ["Trades", "New"], analyticsKey: "qa.new-trade" },
    { key: "qa-money", label: "Money", icon: DollarSign, route: "/money", roles: ["TRD"], traderMode: "BUY", featureState: "available", component: "MoneyPage", breadcrumb: ["Money"], analyticsKey: "qa.money" },
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["TRD"], traderMode: "BUY", featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  TRD_SELL: [
    { key: "qa-pending-requests", label: "Pending Requests", icon: Inbox, route: "/operations/seller", roles: ["TRD"], traderMode: "SELL", featureState: "available", component: "SellerWorkspace", breadcrumb: ["Operations", "Seller"], analyticsKey: "qa.pending-requests" },
    { key: "qa-trades", label: "Trades", icon: ArrowRight, route: "/trades", roles: ["TRD"], traderMode: "SELL", featureState: "available", component: "TradesPage", breadcrumb: ["Trades"], analyticsKey: "qa.trades" },
  ],
  LSP: [
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["LSP"], featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  SHIP: [
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["SHIP"], featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  LAB: [
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["LAB"], featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  QC: [
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["QC"], featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  CBR: [
    { key: "qa-operations", label: "Operations", icon: Package, route: "/operations", roles: ["CBR"], featureState: "available", component: "OperationsPage", breadcrumb: ["Operations"], analyticsKey: "qa.operations" },
  ],
  FIN: [
    { key: "qa-money", label: "Money", icon: DollarSign, route: "/money", roles: ["FIN"], featureState: "available", component: "MoneyPage", breadcrumb: ["Money"], analyticsKey: "qa.money" },
  ],
  GOV: [
    { key: "qa-admin", label: "Admin", icon: Settings, route: "/admin", roles: ["GOV"], featureState: "available", component: "AdminPage", breadcrumb: ["Admin"], analyticsKey: "qa.admin" },
  ],
  ADM: [
    { key: "qa-admin", label: "Admin", icon: Settings, route: "/admin", roles: ["ADM"], featureState: "available", component: "AdminPage", breadcrumb: ["Admin"], analyticsKey: "qa.admin" },
  ],
};

// ── Helper: filter nav by role + trader mode ─────────────────────────────────
export function filterNavByRole(items: NavItem[], role: NavRole, traderMode?: NavTraderMode): NavItem[] {
  return items.filter(item => {
    // Check role
    if (!item.roles.includes("ALL") && !item.roles.includes(role)) return false;
    // Check trader mode (only for TRD tenants)
    if (item.traderMode && item.traderMode !== "ANY" && traderMode && item.traderMode !== traderMode && traderMode !== "DUAL") return false;
    // Check feature state
    if (item.featureState === "disabled") return false;
    return true;
  });
}

// ── Helper: get quick actions for a role + mode ─────────────────────────────
export function getQuickActions(role: NavRole, traderMode?: NavTraderMode): NavItem[] {
  let key = role;
  if (role === "TRD" && traderMode) {
    key = `TRD_${traderMode}`;
  }
  return QUICK_ACTIONS[key] || QUICK_ACTIONS[role] || [];
}
