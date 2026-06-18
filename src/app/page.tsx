"use client";

import { useAppStore } from "@/store/app-store";
import { CinematicLanding } from "@/components/sgtx/CinematicLanding";
import { PortalLauncher } from "@/components/sgtx/PortalLauncher";
import { PortalShell } from "@/components/sgtx/PortalShell";
import { TradeCommandCenter } from "@/components/sgtx/TradeCommandCenter";
import { OnboardingWizard } from "@/components/sgtx/OnboardingWizard";
import { PortalContent } from "@/components/portals/PortalContent";
import { PORTAL_MAP } from "@/lib/sgtx/portal-config";
import { AnimatePresence, motion } from "framer-motion";

export default function Home() {
  const view = useAppStore((s) => s.view);
  const activePortalId = useAppStore((s) => s.activePortalId);
  const activeUstn = useAppStore((s) => s.activeUstn);

  const portal = activePortalId ? PORTAL_MAP[activePortalId] : null;

  return (
    <>
      <AnimatePresence mode="wait">
        {view === "landing" && (
          <motion.div key="landing" exit={{ opacity: 0 }} transition={{ duration: 0.5 }}>
            <CinematicLanding />
          </motion.div>
        )}
        {view === "launcher" && (
          <motion.div key="launcher" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <PortalLauncher />
          </motion.div>
        )}
        {view === "onboarding" && (
          <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
            <OnboardingWizard />
          </motion.div>
        )}
        {view === "portal" && portal && (
          <motion.div key={`portal-${portal.id}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
            <PortalShell portal={portal}>
              {(data) => <PortalContent portal={portal} data={data} />}
            </PortalShell>
          </motion.div>
        )}
      </AnimatePresence>

      {/* TCC overlay — always available when a USTN is active */}
      <AnimatePresence>
        {view === "tcc" && activeUstn && (
          <motion.div key="tcc" initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.98 }} transition={{ duration: 0.25 }}>
            <TradeCommandCenter />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
