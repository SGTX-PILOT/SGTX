"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Zap, Menu, X } from "lucide-react";

interface CinematicNavProps {
  onExplorePortals: () => void;
  onNavigate: (route: string) => void;
}

const NAV_LINKS = [
  { label: "Thesis", target: "thesis" },
  { label: "Portals", target: "portals" },
  { label: "Governor", target: "governor" },
  { label: "Flow", target: "flow" },
  { label: "AI Authority", target: "ai" },
  { label: "Scale", target: "scale" },
];

export function CinematicNav({ onExplorePortals, onNavigate }: CinematicNavProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    setMobileOpen(false);
  };

  return (
    <>
      <motion.header
        initial={{ y: -80, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        className={`fixed top-0 left-0 right-0 z-50 transition-all duration-500 ${
          scrolled
            ? "backdrop-blur-2xl bg-[rgba(3,6,15,0.7)] border-b border-white/[0.06]"
            : "bg-transparent border-b border-transparent"
        }`}
      >
        <div className="max-w-[1400px] mx-auto px-5 lg:px-8 h-16 lg:h-[68px] flex items-center justify-between">
          {/* Logo */}
          <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="flex items-center gap-2.5 group" aria-label="SGTX home">
            <div className="relative w-9 h-9 flex items-center justify-center">
              <div className="absolute inset-0 rounded-lg opacity-60 blur-[6px]" style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }} />
              <div className="relative w-9 h-9 flex items-center justify-center font-bold text-white text-sm rounded-lg transition-transform group-hover:scale-110"
                style={{ background: "linear-gradient(135deg, #3b82f6, #06b6d4 55%, #8b5cf6)", clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}>
                S
              </div>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-[15px] font-bold tracking-tight text-white">SGTX</span>
              <span className="text-[9px] text-slate-400 uppercase tracking-[0.18em] mt-0.5">Sovereign Trade</span>
            </div>
          </button>

          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Section navigation">
            {NAV_LINKS.map((link) => (
              <button key={link.target} onClick={() => scrollTo(link.target)}
                className="px-3.5 py-2 text-[13px] font-medium text-slate-300 hover:text-white rounded-full hover:bg-white/[0.06] transition-all">
                {link.label}
              </button>
            ))}
          </nav>

          {/* Actions */}
          <div className="flex items-center gap-2">
            <button onClick={onExplorePortals}
              className="hidden sm:flex items-center gap-1.5 px-3.5 py-2 text-[13px] font-medium text-slate-200 rounded-full border border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.08] hover:border-white/[0.15] transition-all">
              Explore Portals
            </button>
            <button onClick={() => onNavigate("/join")}
              className="hidden sm:flex items-center gap-1.5 px-4 py-2 text-[13px] font-semibold text-white rounded-full transition-all hover:shadow-lg hover:shadow-blue-500/30"
              style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
              <Zap className="w-3.5 h-3.5" /> Request Access
            </button>
            <button onClick={() => setMobileOpen(true)} className="md:hidden p-2 text-slate-200" aria-label="Open menu">
              <Menu className="w-5 h-5" />
            </button>
          </div>
        </div>
      </motion.header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[60] md:hidden bg-[rgba(3,6,15,0.96)] backdrop-blur-2xl flex flex-col"
          >
            <div className="h-16 flex items-center justify-between px-5 border-b border-white/[0.06]">
              <span className="text-sm font-bold text-white">Navigation</span>
              <button onClick={() => setMobileOpen(false)} className="p-2 text-slate-300" aria-label="Close menu">
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 flex flex-col gap-1 p-5">
              {NAV_LINKS.map((link) => (
                <button key={link.target} onClick={() => scrollTo(link.target)}
                  className="text-left px-4 py-3.5 text-lg font-medium text-slate-200 hover:text-white hover:bg-white/[0.05] rounded-xl transition-all">
                  {link.label}
                </button>
              ))}
              <button onClick={() => { onExplorePortals(); setMobileOpen(false); }}
                className="mt-2 text-left px-4 py-3.5 text-lg font-semibold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, rgba(59,130,246,0.25), rgba(139,92,246,0.25))" }}>
                Explore Portals →
              </button>
              <button onClick={() => { onNavigate("/join"); setMobileOpen(false); }}
                className="mt-2 text-left px-4 py-3.5 text-lg font-semibold text-white rounded-xl"
                style={{ background: "linear-gradient(135deg, #3b82f6, #8b5cf6)" }}>
                Request Access
              </button>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
