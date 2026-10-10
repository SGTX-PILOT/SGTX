"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, LayoutDashboard, Workflow, ChevronRight, Search, Loader2 } from "lucide-react";
import { PORTAL_SHOWCASE, type PortalShowcaseItem } from "./portals-showcase";
import { PORTAL_BUNDLE } from "./portal-bundle";
import { BrandMark } from "./brand-identity";

interface Props {
  open: boolean;
  activePortal: number;
  onSelectPortal: (n: number) => void;
  onClose: () => void;
}

export function PortalLauncher({ open, activePortal, onSelectPortal, onClose }: Props) {
  const [mode, setMode] = useState<"dashboard" | "workflow">("dashboard");
  const [search, setSearch] = useState("");

  // Lock body scroll while open
  useEffect(() => {
    if (open) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = prev; };
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && open) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = PORTAL_SHOWCASE.filter(p =>
    !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.role.toLowerCase().includes(search.toLowerCase())
  );

  const current: PortalShowcaseItem = PORTAL_SHOWCASE.find(p => p.number === activePortal)!;
  const Icon = current.icon;
  const entry = PORTAL_BUNDLE[activePortal];
  const ActiveComponent = entry ? (mode === "dashboard" ? entry.dashboard : entry.workflow) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-[70] bg-[rgba(2,4,12,0.85)] backdrop-blur-2xl flex"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.96, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.97, opacity: 0, y: 8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            onClick={(e) => e.stopPropagation()}
            className="relative m-3 lg:m-6 flex-1 rounded-2xl border border-white/[0.08] bg-[#050816]/95 shadow-2xl overflow-hidden flex flex-col lg:flex-row"
            style={{ maxHeight: "calc(100vh - 1.5rem)" }}
          >
            {/* Sidebar (portal switcher) */}
            <aside className="lg:w-[300px] flex-shrink-0 border-b lg:border-b-0 lg:border-r border-white/[0.06] flex flex-col max-h-[40vh] lg:max-h-none">
              <div className="p-4 border-b border-white/[0.06]">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <BrandMark size="xs" glow={false} />
                    <span className="text-[11px] font-mono uppercase tracking-[0.25em] text-cyan-400">12 Portals</span>
                  </div>
                  <button onClick={onClose} className="lg:hidden p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5" aria-label="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search portals…"
                    className="w-full pl-8 pr-3 py-2 text-[12px] rounded-lg bg-white/[0.04] border border-white/[0.06] text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/15"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5 portals-scrollbar">
                {filtered.map(p => {
                  const PI = p.icon;
                  return (
                    <button
                      key={p.number}
                      onClick={() => onSelectPortal(p.number)}
                      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left transition-all ${
                        activePortal === p.number ? "bg-white/[0.06] border border-white/[0.08]" : "border border-transparent hover:bg-white/[0.03]"
                      }`}
                    >
                      <div className="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0"
                        style={{ background: p.accentSoft, border: `1px solid ${p.accent}30` }}>
                        <PI className="w-3.5 h-3.5" style={{ color: p.accent }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[12px] font-medium text-white truncate">{p.shortName}</div>
                        <div className="text-[9.5px] text-slate-500 font-mono truncate">{p.tenantType}</div>
                      </div>
                      {activePortal === p.number && <ChevronRight className="w-3.5 h-3.5 text-slate-400 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Main panel */}
            <div className="flex-1 flex flex-col min-w-0">
              {/* Header */}
              <header className="flex items-center justify-between gap-3 px-4 lg:px-6 h-14 border-b border-white/[0.06] flex-shrink-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ background: current.accentSoft, border: `1px solid ${current.accent}40` }}>
                    <Icon className="w-4 h-4" style={{ color: current.accent }} />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-[13px] font-semibold text-white truncate">{current.name}</h2>
                    <p className="text-[10px] text-slate-500 font-mono truncate">{current.tenantType} · {current.devicePriority}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {/* Mode toggle */}
                  <div className="flex items-center bg-white/[0.04] border border-white/[0.08] rounded-lg p-0.5">
                    <button
                      onClick={() => setMode("dashboard")}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                        mode === "dashboard" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <LayoutDashboard className="w-3 h-3" /> Dashboard
                    </button>
                    <button
                      onClick={() => setMode("workflow")}
                      className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md transition-all ${
                        mode === "workflow" ? "bg-white/[0.08] text-white" : "text-slate-400 hover:text-white"
                      }`}
                    >
                      <Workflow className="w-3 h-3" /> Workflow
                    </button>
                  </div>
                  <button onClick={onClose} className="hidden lg:flex p-2 rounded-md text-slate-400 hover:text-white hover:bg-white/5" aria-label="Close launcher">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </header>

              {/* Body — portal content from bundle */}
              <div className="flex-1 overflow-y-auto portals-scrollbar bg-[#02040c]/40">
                <div key={`${activePortal}-${mode}`} className="min-h-full animate-in">
                  {ActiveComponent ? <ActiveComponent /> : (
                    <div className="flex items-center justify-center h-full min-h-[400px] text-slate-500 text-[12px]">
                      <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                        <span>Loading {current.shortName} {mode}…</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Footer — workflow harmony note */}
              <footer className="px-4 lg:px-6 py-2.5 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-500 flex-shrink-0">
                <span className="font-mono">USTN <span className="text-slate-300">SGTX-EG-26-NH3T-0042</span></span>
                <span className="hidden sm:inline">Same trade · all 12 portals · fee <span className="text-slate-300">0.144%</span> · G1→G7</span>
                <span className="font-mono text-slate-400">SGTX</span>
              </footer>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
