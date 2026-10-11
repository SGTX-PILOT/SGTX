"use client";

import { motion } from "framer-motion";
import { ArrowUpRight, Smartphone, Monitor, Tablet } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface PortalShowcaseItem {
  number: number;
  name: string;
  shortName: string;
  role: string;
  tenantType: string;
  devicePriority: "Mobile-First" | "Web-First" | "Hybrid";
  icon: LucideIcon;
  accent: string;       // primary hex
  accentSoft: string;   // rgba for backgrounds
  gradient: string;     // gradient string
  tagline: string;
}

// 12 portals — each with a unique accent (no two look alike)
export const PORTAL_SHOWCASE: PortalShowcaseItem[] = [
  { number: 1, name: "Trader Portal — Buyer Mode", shortName: "Buyer", role: "Importers & procurement", tenantType: "TRD · BUY", devicePriority: "Hybrid", icon: ({ ...p }) => <ShoppingBag {...p} />, accent: "#60a5fa", accentSoft: "rgba(96,165,250,0.14)", gradient: "linear-gradient(135deg,#3b82f6,#60a5fa)", tagline: "13-section trade request" },
  { number: 2, name: "Trader Portal — Seller Mode", shortName: "Seller", role: "Exporters & sales", tenantType: "TRD · SELL", devicePriority: "Hybrid", icon: ({ ...p }) => <Store {...p} />, accent: "#a78bfa", accentSoft: "rgba(167,139,250,0.14)", gradient: "linear-gradient(135deg,#8b5cf6,#a78bfa)", tagline: "EXW lock + 3-mode logistics" },
  { number: 3, name: "LSP Portal", shortName: "LSP", role: "Trucking · forwarding · warehousing", tenantType: "LSP", devicePriority: "Hybrid", icon: ({ ...p }) => <Truck {...p} />, accent: "#22d3ee", accentSoft: "rgba(34,211,238,0.14)", gradient: "linear-gradient(135deg,#06b6d4,#22d3ee)", tagline: "VRP routes · driver app" },
  { number: 4, name: "Shipping Line Portal", shortName: "SHIP", role: "Ocean carriers · NVOCCs", tenantType: "SHIP", devicePriority: "Web-First", icon: ({ ...p }) => <Ship {...p} />, accent: "#38bdf8", accentSoft: "rgba(56,189,248,0.14)", gradient: "linear-gradient(135deg,#0ea5e9,#38bdf8)", tagline: "Vessel schedule · eBL" },
  { number: 5, name: "Laboratory Portal", shortName: "LAB", role: "ISO 17025 accredited labs", tenantType: "LAB", devicePriority: "Web-First", icon: ({ ...p }) => <FlaskConical {...p} />, accent: "#818cf8", accentSoft: "rgba(129,140,248,0.14)", gradient: "linear-gradient(135deg,#6366f1,#818cf8)", tagline: "MRL validation · calibration" },
  { number: 6, name: "QC Inspection Portal", shortName: "QC", role: "ISO 17020 inspection", tenantType: "QC", devicePriority: "Hybrid", icon: ({ ...p }) => <ClipboardCheck {...p} />, accent: "#2dd4bf", accentSoft: "rgba(45,212,191,0.14)", gradient: "linear-gradient(135deg,#14b8a6,#2dd4bf)", tagline: "AQL · HF ViT · AR overlay" },
  { number: 7, name: "Customs Broker Portal", shortName: "CBR", role: "Licensed customs brokers", tenantType: "CBR", devicePriority: "Hybrid", icon: ({ ...p }) => <Building2 {...p} />, accent: "#fbbf24", accentSoft: "rgba(251,191,36,0.14)", gradient: "linear-gradient(135deg,#f59e0b,#fbbf24)", tagline: "QR + GPS digital seal" },
  { number: 8, name: "Financier (Bank) Portal", shortName: "FIN Bank", role: "Banks · ISO 20022", tenantType: "FIN · BANK", devicePriority: "Web-First", icon: ({ ...p }) => <Landmark {...p} />, accent: "#34d399", accentSoft: "rgba(52,211,153,0.14)", gradient: "linear-gradient(135deg,#10b981,#34d399)", tagline: "Risk sim · GNN · LP waterfall" },
  { number: 9, name: "Financier (PFI) Portal", shortName: "PFI", role: "Private financiers", tenantType: "FIN · PRIVATE", devicePriority: "Web-First", icon: ({ ...p }) => <Wallet {...p} />, accent: "#fb7185", accentSoft: "rgba(251,113,133,0.14)", gradient: "linear-gradient(135deg,#e11d48,#fb7185)", tagline: "Niche matrix · appetite slider" },
  { number: 10, name: "Government Portal", shortName: "GOV", role: "Customs · ports · ministries", tenantType: "GOV", devicePriority: "Web-First", icon: ({ ...p }) => <ShieldHalf {...p} />, accent: "#facc15", accentSoft: "rgba(250,204,21,0.14)", gradient: "linear-gradient(135deg,#ca8a04,#facc15)", tagline: "Trade flow map · fraud radar" },
  { number: 11, name: "Admin Portal", shortName: "Admin", role: "Governance Authority · multisig", tenantType: "ADM", devicePriority: "Web-First", icon: ({ ...p }) => <ShieldCheck {...p} />, accent: "#c084fc", accentSoft: "rgba(192,132,252,0.14)", gradient: "linear-gradient(135deg,#a855f7,#c084fc)", tagline: "Blast radius · 3-of-5 ceremony" },
  { number: 12, name: "Marketplace Partner Portal", shortName: "MP", role: "External platforms · Marketplace API", tenantType: "MP", devicePriority: "Web-First", icon: ({ ...p }) => <Network {...p} />, accent: "#e879f9", accentSoft: "rgba(232,121,249,0.14)", gradient: "linear-gradient(135deg,#c026d3,#e879f9)", tagline: "Leads funnel · revenue donut" },
];

// Lazy icon imports kept inline to avoid circular deps
import { ShoppingBag, Store, Truck, Ship, FlaskConical, ClipboardCheck, Building2, Landmark, Wallet, ShieldHalf, ShieldCheck, Network } from "lucide-react";

const deviceIcon = (p: string) => (p === "Mobile-First" ? Smartphone : p === "Web-First" ? Monitor : Tablet);

interface Props {
  onOpenPortal: (n: number) => void;
  onOpenLauncher: () => void;
}

export function PortalsShowcase({ onOpenPortal, onOpenLauncher }: Props) {
  return (
    <section id="portals" className="relative py-24 lg:py-32 px-5 lg:px-8">
      <div className="max-w-[1400px] mx-auto">
        {/* Heading */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.6 }}
          className="flex items-center gap-3 mb-8"
        >
          <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-[0.3em]">§ 02 · The Twelve Portals</span>
          <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.4fr,1fr] gap-8 lg:gap-12 items-end mb-10">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="text-[clamp(2rem,5vw,4rem)] font-bold leading-[1.05] tracking-[-0.02em] text-white"
          >
            One workspace
            <br />
            <span className="bg-clip-text text-transparent" style={{ backgroundImage: "linear-gradient(120deg,#60a5fa,#22d3ee 50%,#a78bfa)" }}>
              per operating role.
            </span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6, delay: 0.15 }}
            className="text-[14px] lg:text-[15px] text-slate-300 leading-relaxed max-w-md"
          >
            Twelve purpose-built portals. Each one a complete dashboard
            — scoped to one operating role. Open any portal to enter
            the full workspace, on demand.
          </motion.p>
        </div>

        {/* Grid of 12 portal cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 lg:gap-4">
          {PORTAL_SHOWCASE.map((p, i) => {
            const Icon = p.icon;
            const DIcon = deviceIcon(p.devicePriority);
            return (
              <motion.button
                key={p.number}
                initial={{ opacity: 0, y: 24, scale: 0.97 }}
                whileInView={{ opacity: 1, y: 0, scale: 1 }}
                viewport={{ once: true, margin: "-40px" }}
                transition={{ duration: 0.5, delay: (i % 4) * 0.06, ease: [0.16, 1, 0.3, 1] }}
                onClick={() => onOpenPortal(p.number)}
                className="group relative text-left p-4 lg:p-5 rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm overflow-hidden hover:border-white/[0.16] transition-all hover:-translate-y-1 hover:shadow-2xl"
                style={{ minHeight: "180px" }}
              >
                {/* Hover radial glow */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                  style={{ background: `radial-gradient(circle at 50% 0%, ${p.accentSoft} 0%, transparent 65%)` }} />
                {/* Top border accent on hover */}
                <div className="absolute top-0 left-0 right-0 h-px opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: `linear-gradient(to right, transparent, ${p.accent}, transparent)` }} />

                <div className="relative h-full flex flex-col">
                  {/* Top row: icon + number */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110 group-hover:rotate-3"
                      style={{ background: p.accentSoft, border: `1px solid ${p.accent}30` }}>
                      <Icon className="w-5 h-5" style={{ color: p.accent }} />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-mono text-slate-500">#{String(p.number).padStart(2, "0")}</span>
                      <DIcon className="w-3 h-3 text-slate-600" />
                    </div>
                  </div>

                  {/* Name */}
                  <h3 className="text-[14px] font-semibold text-white leading-tight mb-1">{p.shortName}</h3>
                  <p className="text-[10.5px] text-slate-400 leading-snug mb-3 flex-1">{p.role}</p>

                  {/* Tagline + CTA */}
                  <div className="pt-2.5 border-t border-white/[0.06] flex items-center justify-between">
                    <span className="text-[9.5px] font-mono uppercase tracking-wider" style={{ color: p.accent }}>{p.tagline}</span>
                    <ArrowUpRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-white transition-colors" />
                  </div>
                </div>
              </motion.button>
            );
          })}
        </div>

        {/* Launcher CTA */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-between gap-4 p-5 rounded-2xl border border-white/[0.06] bg-gradient-to-r from-white/[0.03] to-transparent"
        >
          <div>
            <p className="text-[14px] font-semibold text-white">Open the Universal Launcher</p>
            <p className="text-[12px] text-slate-400">Browse all 12 portals and switch between dashboard + workflow modes.</p>
          </div>
          <button onClick={onOpenLauncher}
            className="group inline-flex items-center gap-2 px-5 py-2.5 text-[13px] font-semibold text-white rounded-full transition-all hover:shadow-lg"
            style={{ background: "linear-gradient(135deg,#3b82f6,#8b5cf6)" }}>
            Open Launcher
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}
