"use client";

import { motion } from "framer-motion";
import { PORTALS } from "@/lib/sgtx/portal-config";
import { useAppStore } from "@/store/app-store";
import { SgtxLogo } from "./SgtxLogo";
import { ArrowRight, ArrowLeft, Building2, Plus } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type Tenant = {
  gtid: string; legalName: string; type: string; country: string; trustScore: number; kybTier: number; lifecycleState: string;
};

export function PortalLauncher() {
  const enterPortal = useAppStore((s) => s.enterPortal);
  const setView = useAppStore((s) => s.setView);
  const [selectedPortal, setSelectedPortal] = useState<string | null>(null);

  const { data: tenants } = useQuery<Tenant[]>({
    queryKey: ["tenants"],
    queryFn: async () => (await fetch("/api/sgtx/tenants")).json(),
  });

  const tenantByType = (type: string) => tenants?.find((t) => t.type === type);

  return (
    <div className="min-h-screen bg-background sovereign-radial">
      <div className="absolute inset-0 sovereign-grid opacity-20" />
      <div className="relative z-10 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between px-6 sm:px-10 py-5 border-b border-border/40">
          <div className="flex items-center gap-3">
            <SgtxLogo size={40} animated={false} />
            <div>
              <p className="font-display font-bold text-lg leading-none">
                <span className="text-silver-gradient">SG</span><span className="text-gold-gradient">TX</span>
              </p>
              <p className="text-[0.6rem] tracking-[0.3em] text-muted-foreground uppercase">Portal Gateway</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setView("onboarding")}
              className="text-xs bg-gold-gradient text-sovereign font-semibold px-4 py-2 rounded-full hover:opacity-90 transition-opacity flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" /> Onboard New Tenant
            </button>
            <button
              onClick={() => setView("landing")}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1.5"
            >
              <ArrowLeft className="w-3 h-3" /> Back to intro
            </button>
          </div>
        </header>

        {/* Hero */}
        <div className="px-6 sm:px-10 pt-10 pb-6 text-center">
          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-display text-3xl sm:text-4xl font-bold"
          >
            Choose your <span className="text-gold-gradient">sovereign portal</span>
          </motion.h2>
          <p className="text-muted-foreground mt-3 max-w-2xl mx-auto text-sm sm:text-base">
            SGTX is a non-marketplace operating system. Select the role you operate as today.
            Each portal shares one USTN-linked truth layer.
          </p>
        </div>

        {/* Portal grid */}
        <div className="flex-1 px-6 sm:px-10 pb-10">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {PORTALS.map((p, i) => {
              const tenant = tenantByType(p.tenantType);
              const Icon = p.icon;
              return (
                <motion.button
                  key={p.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: i * 0.05 }}
                  whileHover={{ y: -4 }}
                  onClick={() => enterPortal(p.id, p.defaultTenantGtid)}
                  className="group relative text-left glass-panel rounded-2xl p-5 hover:ring-gold transition-all overflow-hidden"
                  style={{ borderTop: `2px solid ${p.accent}55` }}
                >
                  {/* Hover sheen */}
                  <div
                    className="absolute -top-12 -right-12 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity blur-2xl"
                    style={{ background: p.accent }}
                  />
                  <div className="relative flex items-start justify-between mb-4">
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center border"
                      style={{ background: `${p.accent}1a`, borderColor: `${p.accent}44` }}
                    >
                      <Icon className="w-6 h-6" style={{ color: p.accent }} />
                    </div>
                    {p.dualMode && (
                      <span className="text-[0.6rem] px-2 py-0.5 rounded-full bg-gold/15 text-gold border border-gold/30 tracking-wider uppercase">
                        Dual-Mode
                      </span>
                    )}
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-gold transition-colors">{p.name}</h3>
                  <p className="text-xs text-muted-foreground mt-1 leading-relaxed line-clamp-2">{p.description}</p>

                  {tenant && (
                    <div className="mt-4 pt-3 border-t border-border/40 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0" style={{ background: tenant.logoColor || p.accent }}>
                          <Building2 className="w-3 h-3 text-white" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-foreground truncate">{tenant.legalName}</p>
                          <p className="text-[0.6rem] text-muted-foreground font-mono truncate">{tenant.gtid}</p>
                        </div>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted-foreground group-hover:text-gold group-hover:translate-x-0.5 transition-all flex-shrink-0" />
                    </div>
                  )}
                </motion.button>
              );
            })}

            {/* Admin card */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: PORTALS.length * 0.05 }}
              whileHover={{ y: -4 }}
              onClick={() => enterPortal("admin", "SGTX-EG-GOV-000001-9A0B")}
              className="group text-left rounded-2xl p-5 border border-dashed border-border hover:border-gold hover:bg-gold/5 transition-all"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center border border-border bg-muted/30 mb-4">
                <Building2 className="w-6 h-6 text-muted-foreground group-hover:text-gold transition-colors" />
              </div>
              <h3 className="font-semibold text-foreground">Platform Admin</h3>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Governance authority, add-on toggles, chaos testing, integrations health, PQC re-signing.
              </p>
              <p className="text-[0.6rem] text-muted-foreground mt-4 tracking-widest uppercase">Constitutional Layer</p>
            </motion.button>
          </div>
        </div>

        {/* Footer note */}
        <footer className="px-6 sm:px-10 py-5 border-t border-border/40 text-center">
          <p className="text-[0.65rem] text-muted-foreground tracking-wider">
            🔐 Non-marketplace · All relationships are established outside SGTX and onboarded by users themselves.
          </p>
        </footer>
      </div>
    </div>
  );
}
