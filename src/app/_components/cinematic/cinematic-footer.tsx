"use client";

import { SGTXLogo } from "./brand-identity";

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
          {/* Brand — unified SGTX logo lockup */}
          <div>
            <SGTXLogo size="md" animated showTagline glow />
            <p className="mt-5 text-[11.5px] text-slate-500 leading-relaxed max-w-sm">
              Sovereign Governed Trade Execution Infrastructure.
              Non-custodial. Non-marketplace. Constitutionally bound.
              Every irreversible action passes through the Governor.
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
