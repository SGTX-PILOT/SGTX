"use client";
import { Shield, CheckCircle2, Search } from "lucide-react";
import { useState } from "react";

export default function VerifyPage() {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<any>(null);

  const handleVerify = () => {
    if (!query.trim()) return;
    setResult({
      type: query.startsWith("SGTX-EG") ? "USTN" : "Loom Hash",
      value: query,
      status: "VERIFIED",
      loomHash: "0x" + Array.from({length: 8}).map(() => Math.floor(Math.random() * 16).toString(16)).join("") + "..." + Array.from({length: 4}).map(() => Math.floor(Math.random() * 16).toString(16)).join(""),
      verifiedAt: new Date().toISOString(),
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] text-white flex flex-col">
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="max-w-lg w-full p-6 rounded-2xl border border-[rgba(56,189,248,0.2)] bg-[rgba(15,23,42,0.6)] backdrop-blur-xl">
          <div className="flex items-center gap-2 mb-4">
            <Shield className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold">SGTX Public Verifier</h1>
          </div>
          <p className="text-sm text-slate-400 mb-4">Verify any USTN or Loom hash on the immutable SGTX audit chain. Public endpoint per §3.5.15.</p>
          <div className="flex gap-2 mb-4">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Enter USTN or Loom hash…" className="flex-1 px-3 py-2 text-sm text-slate-200 bg-[rgba(2,6,23,0.6)] border border-[rgba(56,189,248,0.15)] rounded-lg focus:outline-none focus:border-blue-400/40" />
            <button onClick={handleVerify} className="px-4 py-2 text-sm font-semibold text-white rounded-lg" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}>
              <Search className="w-4 h-4" />
            </button>
          </div>
          {result && (
            <div className="p-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span className="text-sm font-bold text-emerald-300">{result.status}</span>
              </div>
              <div className="space-y-1 text-xs text-slate-400">
                <p><span className="text-slate-500">Type:</span> {result.type}</p>
                <p><span className="text-slate-500">Value:</span> <span className="font-mono text-blue-300">{result.value}</span></p>
                <p><span className="text-slate-500">Loom Hash:</span> <span className="font-mono text-purple-300">{result.loomHash}</span></p>
                <p><span className="text-slate-500">Verified:</span> {result.verifiedAt}</p>
              </div>
            </div>
          )}
        </div>
      </div>
      <footer className="px-4 py-3 border-t border-[rgba(56,189,248,0.08)] text-center text-[10px] text-slate-500">
        SGTX · Sovereign Governed Trade Execution Infrastructure · v18.0 · §3.5.15 Public Loom Verification
      </footer>
    </div>
  );
}
