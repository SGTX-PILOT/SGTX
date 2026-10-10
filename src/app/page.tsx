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
import { FinalCTA } from "./_components/cinematic/final-cta";
import { CinematicFooter } from "./_components/cinematic/cinematic-footer";

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

      {/* Main scroll content */}
      <main className="relative z-10 flex-1 flex flex-col">
        <CinematicHero onExplorePortals={openLauncher} onNavigate={navigate} />
        <TrustMarquee />
        <ThesisSection />
        <PortalsShowcase onOpenPortal={openPortal} onOpenLauncher={openLauncher} />
        <GovernorSection />
        <TradeFlowSection />
        <AILadderSection />
        <MetricsSection />
        <PaymentsSection />
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
