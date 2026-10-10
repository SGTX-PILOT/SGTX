"use client";

import { motion } from "framer-motion";

interface Props {
  onNavigate: (route: string) => void;
}

const FOOTER_LINKS = [
  { label: "Sign In", route: "/login" },
  { label: "Request Access", route: "/join" },
  { label: "Admin", route: "/login?next=/admin" },
  { label: "Trades", route: "/login?next=/trades" },
  { label: "Money", route: "/login?next=/money" },
];

export function CinematicFooter({ onNavigate }: Props) {
  return (
    <footer className="relative mt-auto border-t border-white/[0.06] bg-[rgba(2,4,12,0.6)] backdrop-blur-xl">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-8 py-8 lg:py-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr,1fr,1fr] gap-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 flex items-center justify-center font-bold text-white text-xs rounded-lg"
                style={{ background: "linear-gradient(135deg,#3b82f6,#06b6d4 55%,#8b5cf6)", clipPath: "polygon(50% 0%, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)" }}>
                S
              </div>
              <div className="flex flex-col leading-none">
                <span className="text-[13px] font-bold text-white">SGTX</span>
                <span className="text-[8.5px] text-slate-500 uppercase tracking-[0.18em] mt-0.5">Sovereign Trade</span>
              </div>
            </div>
            <p className="text-[11.5px] text-slate-500 leading-relaxed max-w-sm">
              Sovereign Governed Trade Execution Infrastructure. v18.0 Production Edition.
              Non-custodial. Non-marketplace. Constitutionally bound.
            </p>
          </div>

          {/* Links */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 mb-3">Access</p>
            <ul className="space-y-2">
              {FOOTER_LINKS.map(l => (
                <li key={l.label}>
                  <button onClick={() => onNavigate(l.route)} className="text-[12px] text-slate-400 hover:text-white transition-colors">
                    {l.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Standards */}
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 mb-3">Built on</p>
            <ul className="space-y-1.5 text-[11px] font-mono text-slate-500">
              <li>ISO 20022 · UNCITRAL · ICC</li>
              <li>OPA + WasmEdge · NATS</li>
              <li>Ed25519 · QES · WebAuthn</li>
              <li>Loom SHA-256 hash chain</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-5 border-t border-white/[0.04] flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-[10.5px] text-slate-600 font-mono">
            © {new Date().getFullYear()} SGTX · Governor-governed · Loom-audited · Strictest-rule jurisdiction
          </p>
          <div className="flex items-center gap-4 text-[10.5px] text-slate-600 font-mono">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full animate-pulse" />
              All systems operational
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
