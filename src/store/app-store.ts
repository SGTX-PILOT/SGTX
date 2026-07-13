"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export type AppView = "landing" | "auth" | "join" | "launcher" | "portal" | "tcc" | "onboarding";
export type TraderMode = "BUY" | "SELL" | "DUAL";

interface AppState {
  view: AppView;
  activePortalId: string | null; // trader-buyer | trader-seller | lsp | ship | lab | qc | cbr | bank | pfi | gov | admin | marketplace-partner
  activeTenantGtid: string | null; // which tenant identity the user is "acting as"
  activeUstn: string | null; // for TCC view
  traderMode: TraderMode; // for dual-mode toggle
  landingEntered: boolean; // has the cinematic intro completed
  sidebarCollapsed: boolean;

  setView: (v: AppView) => void;
  enterPortal: (portalId: string, tenantGtid: string) => void;
  exitToLauncher: () => void;
  openTcc: (ustn: string) => void;
  closeTcc: () => void;
  setTraderMode: (m: TraderMode) => void;
  setLandingEntered: (v: boolean) => void;
  toggleSidebar: () => void;
}

const PORTAL_DEFAULT_TENANT: Record<string, string> = {
  "trader-buyer": "SGTX-DE-TRD-001234-5B6C",
  "trader-seller": "SGTX-EG-TRD-002139-7F3A",
  "trader-dual": "SGTX-VN-TRD-005521-3D9E",
  lsp: "SGTX-EG-LSP-000120-4C7D",
  ship: "SGTX-EG-SHP-000031-9E8F",
  lab: "SGTX-EG-LAB-000014-6F4D",
  qc: "SGTX-EG-QC-000022-8A1C",
  cbr: "SGTX-EG-CBR-000009-5E7B",
  bank: "SGTX-EG-BNK-000007-1F8D",
  pfi: "SGTX-EG-PFI-000011-3C2E",
  gov: "SGTX-EG-GOV-000001-9A0B",
  admin: "SGTX-ZZ-ADM-000001-A1B2",
  "marketplace-partner": "SGTX-ZZ-MKT-000001-C3D4",
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      view: "landing",
      activePortalId: null,
      activeTenantGtid: null,
      activeUstn: null,
      traderMode: "BUY",
      landingEntered: false,
      sidebarCollapsed: false,

      setView: (v) => set({ view: v }),
      enterPortal: (portalId, tenantGtid) =>
        set({
          view: "portal",
          activePortalId: portalId,
          activeTenantGtid: tenantGtid || PORTAL_DEFAULT_TENANT[portalId] || null,
          activeUstn: null,
        }),
      exitToLauncher: () =>
        set({ view: "launcher", activePortalId: null, activeTenantGtid: null, activeUstn: null }),
      openTcc: (ustn) => set({ view: "tcc", activeUstn: ustn }),
      closeTcc: () => set({ view: "portal", activeUstn: null }),
      setTraderMode: (m) => set({ traderMode: m }),
      setLandingEntered: (v) => set({ landingEntered: v }),
      toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
    }),
    {
      name: "sgtx-app-state",
      // Only persist preferences, NOT view/portal — always start at landing
      partialize: (s) => ({ traderMode: s.traderMode, landingEntered: s.landingEntered }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.view = "landing";
          state.activePortalId = null;
          state.activeTenantGtid = null;
          state.activeUstn = null;
        }
      },
    }
  )
);
