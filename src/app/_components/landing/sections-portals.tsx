"use client";

// ═══════════════════════════════════════════════════════════════════════════════
// Phase C — Portal Architecture (§16)
// Sections: 12 Portals · Device Priority · Mobile Apps · Unified Navigation
// ═══════════════════════════════════════════════════════════════════════════════

import { motion } from "framer-motion";
import { Smartphone, Monitor, Tablet } from "lucide-react";
import {
  TWELVE_PORTALS, PORTAL_NAV, MOBILE_APPS,
} from "@/lib/sgtx/landing/landing-catalog";
import { SectionHeading } from "./sections-foundation";

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({ opacity: 1, y: 0, transition: { delay: i * 0.04, duration: 0.4 } }),
};
const stagger = { hidden: {}, visible: { transition: { staggerChildren: 0.04 } } };

const deviceIcon = (priority: string) => {
  if (priority === "Mobile-First") return Smartphone;
  if (priority === "Web-First") return Monitor;
  return Tablet;
};

const deviceColor = (priority: string) => {
  if (priority === "Mobile-First") return "text-emerald-300 bg-emerald-500/10";
  if (priority === "Web-First") return "text-blue-300 bg-blue-500/10";
  return "text-purple-300 bg-purple-500/10";
};

export function PortalsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.1.2 · One Workspace Per Role"
          title="The Twelve Portals"
          subtitle="Each portal is a workspace for one operating role. Tenants, employees, permissions, and data scopes are defined in §4."
        />
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-80px" }}
          variants={stagger}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-6"
        >
          {TWELVE_PORTALS.map((p, i) => {
            const Icon = p.icon;
            const DIcon = deviceIcon(p.devicePriority);
            return (
              <motion.div
                key={p.number}
                variants={fadeUp}
                custom={i}
                className="p-4 rounded-xl border border-[rgba(56,189,248,0.1)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm hover:border-[rgba(56,189,248,0.3)] transition-all group"
              >
                <div className="flex items-start justify-between mb-2">
                  <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/15 to-purple-500/15 flex items-center justify-center">
                    <Icon className="w-4 h-4 text-blue-300" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${deviceColor(p.devicePriority)}`}>
                      <DIcon className="w-2.5 h-2.5 inline mr-0.5" />
                      {p.devicePriority}
                    </span>
                    <span className="text-[9px] font-mono text-slate-500">#{p.number}</span>
                  </div>
                </div>
                <h3 className="text-xs font-semibold text-white leading-tight mb-1">{p.name}</h3>
                <p className="text-[10px] text-slate-400 leading-relaxed mb-2">{p.role}</p>
                <div className="pt-2 border-t border-[rgba(56,189,248,0.06)]">
                  <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-0.5">Tenant</p>
                  <p className="text-[9px] font-mono text-blue-300">{p.tenantType}</p>
                </div>
                {p.companionApp !== "Responsive web" && (
                  <p className="text-[9px] text-slate-500 mt-1.5 italic leading-relaxed">📱 {p.companionApp}</p>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      </div>
    </section>
  );
}

export function MobileAppsSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.1.4 · Offline-First Field Operations"
          title="Three Companion Mobile Apps"
          subtitle="Field roles receive offline-first mobile apps. All trade-critical actions can also be performed from any web browser."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {MOBILE_APPS.map((app, i) => {
            const Icon = app.icon;
            return (
              <motion.div
                key={app.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.45 }}
                className="p-5 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-gradient-to-b from-[rgba(15,23,42,0.6)] to-[rgba(2,6,23,0.4)] backdrop-blur-sm"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Icon className="w-5 h-5 text-emerald-300" />
                  </div>
                  <h3 className="text-sm font-semibold text-white">{app.name}</h3>
                </div>
                <p className="text-[9px] text-slate-500 mb-3 font-mono leading-relaxed">{app.stack}</p>
                <div className="space-y-1.5">
                  {app.features.map(f => (
                    <div key={f} className="flex items-start gap-2">
                      <span className="w-1 h-1 rounded-full bg-emerald-400 mt-1.5 shrink-0" />
                      <p className="text-[10px] text-slate-300 leading-relaxed">{f}</p>
                    </div>
                  ))}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export function PortalNavigationSection() {
  return (
    <section className="px-4 lg:px-6 py-8">
      <div className="max-w-[1400px] mx-auto">
        <SectionHeading
          kicker="§16.1.6 · Consistent Across All Portals"
          title="Unified Portal Navigation Structure"
          subtitle="A user who learns one portal can navigate any other. Global header is identical in every portal."
        />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-6">
          <div className="p-5 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Monitor className="w-4 h-4 text-blue-400" /> Global Header (All Portals)
            </h3>
            <div className="space-y-2">
              {PORTAL_NAV.header.map(h => (
                <div key={h.label} className="flex items-start gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
                  <span className="text-[10px] font-mono text-blue-300 shrink-0 w-32">{h.label}</span>
                  <span className="text-[10px] text-slate-400 leading-relaxed">{h.desc}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-5 rounded-2xl border border-[rgba(56,189,248,0.12)] bg-[rgba(15,23,42,0.6)] backdrop-blur-sm">
            <h3 className="text-sm font-semibold text-white mb-3 flex items-center gap-2">
              <Smartphone className="w-4 h-4 text-emerald-400" /> Common Sidebar Tabs
            </h3>
            <div className="space-y-2">
              {PORTAL_NAV.commonSidebar.map(s => (
                <div key={s.label} className="flex items-start gap-2 p-2 rounded-lg bg-[rgba(255,255,255,0.02)]">
                  <span className="text-[10px] font-mono text-emerald-300 shrink-0 w-32">{s.label}</span>
                  <span className="text-[10px] text-slate-400 leading-relaxed">{s.desc}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
