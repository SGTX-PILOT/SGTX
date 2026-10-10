"use client";

import { motion } from "framer-motion";

const STANDARDS = [
  "ISO 20022", "UNCITRAL Model Law", "ICC UCP 600", "WCO SAFE Framework",
  "WTO TFA", "ISO 17025", "ISO 17020", "eIDAAS QES", "WebAuthn L2",
  "Ed25519", "OPA Rego", "WasmEdge", "NATS", "ISO 27001",
];

export function TrustMarquee() {
  return (
    <section className="relative py-10 border-y border-white/[0.04]">
      <div className="max-w-[1400px] mx-auto px-5 lg:px-8">
        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          className="text-center text-[10px] uppercase tracking-[0.35em] text-slate-500 mb-6"
        >
          Built to the standards that govern global trade
        </motion.p>
        <div className="relative overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 12%, black 88%, transparent)" }}>
          <motion.div className="flex items-center gap-12 whitespace-nowrap"
            animate={{ x: ["0%", "-50%"] }}
            transition={{ duration: 32, repeat: Infinity, ease: "linear" }}
          >
            {[...STANDARDS, ...STANDARDS].map((s, i) => (
              <span key={i} className="text-[14px] font-semibold tracking-tight text-slate-400/80 hover:text-slate-200 transition-colors">
                {s}
              </span>
            ))}
          </motion.div>
        </div>
      </div>
    </section>
  );
}
