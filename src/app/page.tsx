"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// SGTX — Sovereign Governed Trade Execution — CINEMATIC LANDING PAGE
// ═══════════════════════════════════════════════════════════════════════════════
//
// ARCHITECTURE — Billion-dollar, scroll-driven, cinematic:
//   1. AuroraBackground      — fixed drifting gradient mesh (CSS, instant)
//   2. CinematicNav          — minimal sticky nav (transparent → blur on scroll)
//   3. CinematicHero         — full-viewport: 3D sigil + magnetic cursor + live ticker
//   4. TrustMarquee          — infinite scrolling standards bar
//   5. ThesisSection         — "Not a marketplace" denial + 4 pillars
//   6. PortalsShowcase       — 12-card interactive grid → opens PortalLauncher
//   7. GovernorSection       — dramatic G1-G7 vertical progression
//   8. TradeFlowSection      — horizontal scroll-cinematic (12 phases pinned)
//   9. AILadderSection        — A0-A5 vertical reveal (A5 forbidden)
//  10. MetricsSection        — animated counters
//  11. FinalCTA              — cinematic close
//  12. CinematicFooter       — sticky bottom
//
// PORTAL ACCESS:
//   The 24 portal experiences (12 dashboards + 12 workflows) are NOT dumped inline.
//   They live in PortalLauncher — a full-screen overlay that lazy-loads the
//   selected portal's dashboard OR workflow chunk on demand. Zero portal code
//   ships to the homepage bundle until the user opens the launcher.
//
// TECH: Next.js 16 + TypeScript + Tailwind v4 + Framer Motion + (R3F preserved as opt-in)
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { AuroraBackground } from "./_components/cinematic/aurora-background";
import { CinematicNav } from "./_components/cinematic/cinematic-nav";
import { CinematicHero } from "./_components/cinematic/cinematic-hero";
import { TrustMarquee } from "./_components/cinematic/trust-marquee";
import { ThesisSection } from "./_components/cinematic/thesis-section";
import { PortalsShowcase } from "./_components/cinematic/portals-showcase";
import { PortalLauncher } from "./_components/cinematic/portal-launcher";
import { GovernorSection } from "./_components/cinematic/governor-section";
import { TradeFlowSection } from "./_components/cinematic/trade-flow-section";
import { AILadderSection } from "./_components/cinematic/ai-ladder-section";
import { MetricsSection } from "./_components/cinematic/metrics-section";
import { PaymentsSection } from "./_components/cinematic/payments-section";
import { SettlementRouterSection } from "./_components/cinematic/settlement-router-section";
import { AdminSection } from "./_components/cinematic/admin-section";
import { SecuritySection } from "./_components/cinematic/security-section";
import { NetworkEffectsSection } from "./_components/cinematic/network-effects-section";
import { RoadmapSection } from "./_components/cinematic/roadmap-section";
import dynamic from "next/dynamic";
import { FinalCTA } from "./_components/cinematic/final-cta";
import { CinematicFooter } from "./_components/cinematic/cinematic-footer";

// ── Reflection Pool (R3F WebGL) — browser-only, lazy-loaded ──────────────
const ReflectionPool = dynamic(() => import("./_components/reflection-pool"), {
  ssr: false,
  loading: () => (
    <div className="h-full min-h-[200px] flex items-center justify-center bg-gradient-to-b from-[rgba(15,23,42,0.4)] to-[rgba(2,6,23,0.6)]">
      <div className="text-xs text-slate-600 animate-pulse">Loading reflection pool…</div>
    </div>
  ),
});

function ReflectionPoolSection() {
  return (
    <section className="relative h-[240px] lg:h-[320px] overflow-hidden" aria-label="Reflection pool">
      <ReflectionPool />
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
        <div className="text-center">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1">Governor-Governed · Constitutionally Enforced · Loom-Audited</p>
          <p className="text-[9px] text-slate-600">Every irreversible action passes through the Governor (G1-G7)</p>
        </div>
      </div>
    </section>
  );
}

export default function LandingPage() {
  const router = useRouter();
  const navigate = useCallback((route: string) => router.push(route), [router]);

  const [launcherOpen, setLauncherOpen] = useState(false);
  const [activePortal, setActivePortal] = useState<number>(1);

  const openPortal = useCallback((n: number) => {
    setActivePortal(n);
    setLauncherOpen(true);
  }, []);
  const openLauncher = useCallback(() => {
    setLauncherOpen(true);
  }, []);

  return (
    <div className="relative min-h-screen flex flex-col overflow-x-hidden text-white"
      style={{
        fontFamily: 'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
        background: "#02040c",
      }}
    >
      {/* Fixed cinematic backdrop */}
      <AuroraBackground />

      {/* Floating nav */}
      <CinematicNav onExplorePortals={openLauncher} onNavigate={navigate} />

      {/* Main scroll content — logical flow: Foundation → Product → Proof → Control → Future */}
      <main className="relative z-10 flex-1 flex flex-col">
        <CinematicHero onExplorePortals={openLauncher} onNavigate={navigate} />
        <TrustMarquee />
        {/* Foundation: what SGTX is */}
        <ThesisSection />
        <GovernorSection />
        <TradeFlowSection />
        <AILadderSection />
        {/* Product: what SGTX does */}
        <PortalsShowcase onOpenPortal={openPortal} onOpenLauncher={openLauncher} />
        <PaymentsSection />
        <SettlementRouterSection />
        {/* Proof: scale + security + network */}
        <MetricsSection />
        <SecuritySection />
        <NetworkEffectsSection />
        {/* Control: platform owner */}
        <AdminSection />
        {/* Future */}
        <RoadmapSection />
        <ReflectionPoolSection />
        <FinalCTA onNavigate={navigate} onExplorePortals={openLauncher} />
      </main>

      {/* Sticky footer */}
      <CinematicFooter onNavigate={navigate} />

      {/* Portal launcher overlay — lazy-loads any of 24 portal experiences on demand */}
      <PortalLauncher
        open={launcherOpen}
        activePortal={activePortal}
        onSelectPortal={setActivePortal}
        onClose={() => setLauncherOpen(false)}
      />
    </div>
  );
}
