// SGTX Portals — Lazy Code-Splitting Wrappers
// =============================================================================
// This module provides lazy/dynamic wrappers around the heavyweight
// PortalContent component (currently a single 8,300-LOC file) so that Next.js
// can emit it as a separate chunk and only download it when a user actually
// navigates to a portal view (rather than on the landing page initial load).
//
// The wrappers here are intentionally NON-DESTRUCTIVE — they do not modify
// PortalContent.tsx. They simply re-export its components through
// `next/dynamic` so callers can opt into the lazy path one at a time.
//
// Usage:
//   import { LazyPortalContent } from "@/components/portals/lazy-portals";
//   ... <LazyPortalContent portal={portal} data={data} />
//
// When the PortalContent module is later physically split (per RECS-1
// follow-up), the same `dynamic()` pattern can be applied to each extracted
// sub-component to achieve per-screen code-splitting.
// ============================================================================

import dynamic from "next/dynamic";
import type { ComponentType } from "react";
import { SgtxLoader } from "@/components/sgtx/premium-ui";
import type { PortalConfig } from "@/lib/sgtx/portal-config";

// ---------------------------------------------------------------------------
// Shared loading fallback — keeps the layout stable while the chunk loads.
// ---------------------------------------------------------------------------
const portalLoading = () => (
  <div className="flex h-[60vh] w-full items-center justify-center">
    <SgtxLoader />
  </div>
);

// ---------------------------------------------------------------------------
// Lazy PortalContent — the master entry-point for every portal view.
// `ssr: false` because the component reads from the client-only app store and
// issues authenticated API calls on mount; pre-rendering it server-side
// would only double the work.
// ---------------------------------------------------------------------------
export const LazyPortalContent: ComponentType<{
  portal: PortalConfig;
  data: any;
}> = dynamic(
  () => import("./PortalContent").then((m) => m.PortalContent),
  {
    ssr: false,
    loading: portalLoading,
  },
) as ComponentType<{ portal: PortalConfig; data: any }>;

// ---------------------------------------------------------------------------
// Lazy heavyweight screens — each of these is currently exported from
// PortalContent.tsx, so loading any one of them through `dynamic()` still
// pulls the whole chunk. Listing them here serves two purposes:
//
//   1. It documents which screens are the heaviest (line counts in the source
//      file) and therefore the highest-value targets for a future physical
//      extraction into their own modules.
//   2. When the extraction happens, swapping `() => import("./PortalContent")
//      .then(m => m.X)` for `() => import("./screens/X")` is a one-line
//      change per export — every consumer already goes through these
//      wrappers.
//
// These wrappers are exported so callers can opt in today; they do not
// change bundle behaviour until the underlying file is split.
// ---------------------------------------------------------------------------

export const LazyCommandCenter = dynamic(
  () => import("./PortalContent").then((m) => m.CommandCenter),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ portal: PortalConfig; data: any }>;

export const LazyNewTradeRequestScreen = dynamic(
  () => import("./PortalContent").then((m) => m.NewTradeRequestScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType;

export const LazyQuoteBuilderScreen = dynamic(
  () => import("./PortalContent").then((m) => m.QuoteBuilderScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data?: any }>;

export const LazyContractSigningScreen = dynamic(
  () => import("./PortalContent").then((m) => m.ContractSigningScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data?: any }>;

export const LazyShipmentsMilestoneScreen = dynamic(
  () => import("./PortalContent").then((m) => m.ShipmentsMilestoneScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data: any }>;

export const LazySettlementScreen = dynamic(
  () => import("./PortalContent").then((m) => m.SettlementScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data: any }>;

export const LazyDistressedCargoScreen = dynamic(
  () => import("./PortalContent").then((m) => m.DistressedCargoScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data: any }>;

export const LazyDisputesScreen = dynamic(
  () => import("./PortalContent").then((m) => m.DisputesScreen),
  { ssr: false, loading: portalLoading },
) as ComponentType<{ data: any }>;

// ---------------------------------------------------------------------------
// Re-export every named PortalContent export via a single lazy module
// accessor. Consumers that need a screen NOT listed above can use this
// pattern as a template — every screen not yet wrapped is a 3-line addition.
// ---------------------------------------------------------------------------
export async function loadPortalContentModule() {
  return await import("./PortalContent");
}
