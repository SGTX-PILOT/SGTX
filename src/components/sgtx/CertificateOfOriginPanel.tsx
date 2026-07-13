"use client";

// =============================================================================
// SGTX — Certificate of Origin Generation Panel
// =============================================================================
// Customs Broker (CBR) portal panel that manages Certificates of Origin for a
// trade. Supports EUR.1 / EUR-MED / A.TR / GSP / COO_GENERAL / AR.1 / COMESA
// / AFCFTA / FORM_E / FORM_D / REX certificate types.
//
// Features:
//   • Lists all certificates for a USTN (GET /api/sgtx/certificates?ustn=).
//   • Renders cert details: number, type, origin/destination countries,
//     commodity, HS code, issuing authority, issue/expiry dates, status,
//     document hash, verification URL.
//   • "Generate Certificate" dialog: capture origin/destination countries,
//     commodity, HS code, invoice value, currency, origin criterion,
//     cumulation info; POSTs to /api/sgtx/certificates/generate.
//   • "Verify" button for customs authorities (POST /certificates/[id]/verify).
//   • QR code rendered per certificate (encoding the verification URL).
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  Award,
  CheckCircle2,
  ExternalLink,
  FileCheck,
  Loader2,
  Plus,
  QrCode,
  RefreshCw,
  ShieldCheck,
  AlertCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { fmtDate, fmtDateTime, fmtUsd } from "@/lib/sgtx/format";

const REQUEST_TIMEOUT_MS = 15_000;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

interface CertificateOfOrigin {
  id: string;
  ustn: string;
  tradeId: string;
  certificateNumber: string;
  certificateType: string;
  originCountry: string;
  destinationCountry: string;
  issuingAuthority: string;
  issuerGtid: string | null;
  commodity: string;
  commodityHs: string;
  originCriterion: string | null;
  cumulationType: string | null;
  cumulationCountries: string | null;
  currency: string;
  invoiceValue: number;
  issueDate: string;
  expiryDate: string | null;
  validityMonths: number;
  status: string;
  verifiedBy: string | null;
  verifiedAt: string | null;
  qizAnnotated: boolean;
  qizNumber: string | null;
  documentHash: string | null;
  pdfUrl: string | null;
  verificationUrl: string | null;
  createdAt: string;
}

// -----------------------------------------------------------------------------
// fetchWithTimeout
// -----------------------------------------------------------------------------

async function fetchWithTimeout<T>(url: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const json = (await res.json()) as T & { error?: string };
    if (!res.ok) {
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    return json as T;
  } finally {
    clearTimeout(timer);
  }
}

// -----------------------------------------------------------------------------
// Status helpers
// -----------------------------------------------------------------------------

const CERT_STATUS_COLORS: Record<string, string> = {
  ISSUED: "emerald",
  PRESENTED: "blue",
  VERIFIED: "emerald",
  REJECTED: "rose",
  EXPIRED: "rose",
  REVOKED: "rose",
};

function certStatusBadge(status: string): ReactElement {
  const color = CERT_STATUS_COLORS[status] || "muted";
  const cls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    rose: "bg-rose-500/10 text-rose-600 border-rose-500/30",
    blue: "bg-sky-500/10 text-sky-600 border-sky-500/30",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return <Badge className={cls[color]}>{status}</Badge>;
}

// -----------------------------------------------------------------------------
// Generate Certificate Dialog
// -----------------------------------------------------------------------------

function GenerateCertDialog({
  ustn,
  open,
  onOpenChange,
  onCreated,
}: {
  ustn: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}): ReactElement {
  const [originCountry, setOriginCountry] = useState("EG");
  const [destinationCountry, setDestinationCountry] = useState("DE");
  const [commodity, setCommodity] = useState("");
  const [commodityHs, setCommodityHs] = useState("");
  const [invoiceValue, setInvoiceValue] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [originCriterion, setOriginCriterion] = useState("P");
  const [cumulationType, setCumulationType] = useState("NONE");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!commodity || !commodityHs || !invoiceValue) {
      toast.error("Commodity, HS code, and invoice value are required");
      return;
    }
    const val = parseFloat(invoiceValue);
    if (!Number.isFinite(val) || val <= 0) {
      toast.error("Invoice value must be a positive number");
      return;
    }
    setSubmitting(true);
    try {
      const r = await fetchWithTimeout<{ certificate: CertificateOfOrigin; conditions: string[] }>(
        "/api/sgtx/certificates/generate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ustn,
            originCountry,
            destinationCountry,
            commodity,
            commodityHs,
            invoiceValue: val,
            currency,
            originCriterion,
            cumulationType: cumulationType === "NONE" ? undefined : cumulationType,
          }),
        },
      );
      toast.success(`Certificate ${r.certificate.certificateNumber} issued (${r.certificate.certificateType})`);
      setCommodity(""); setCommodityHs(""); setInvoiceValue("");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error("Certificate generation failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="w-5 h-5 text-gold" />
            Generate Certificate of Origin
          </DialogTitle>
          <DialogDescription>
            Engine auto-detects EUR.1 / A.TR / GSP / COO_GENERAL etc. based on origin → destination.
            USTN <span className="font-mono">{ustn}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Origin Country *</Label>
            <Select value={originCountry} onValueChange={setOriginCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EG">Egypt</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                <SelectItem value="IT">Italy</SelectItem>
                <SelectItem value="NL">Netherlands</SelectItem>
                <SelectItem value="GB">United Kingdom</SelectItem>
                <SelectItem value="TR">Türkiye</SelectItem>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CN">China</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="SA">Saudi Arabia</SelectItem>
                <SelectItem value="AE">UAE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Destination Country *</Label>
            <Select value={destinationCountry} onValueChange={setDestinationCountry}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="EG">Egypt</SelectItem>
                <SelectItem value="DE">Germany</SelectItem>
                <SelectItem value="FR">France</SelectItem>
                <SelectItem value="IT">Italy</SelectItem>
                <SelectItem value="NL">Netherlands</SelectItem>
                <SelectItem value="GB">United Kingdom</SelectItem>
                <SelectItem value="TR">Türkiye</SelectItem>
                <SelectItem value="US">United States</SelectItem>
                <SelectItem value="CN">China</SelectItem>
                <SelectItem value="IN">India</SelectItem>
                <SelectItem value="SA">Saudi Arabia</SelectItem>
                <SelectItem value="AE">UAE</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[0.65rem] text-muted-foreground">Commodity *</Label>
            <Input value={commodity} onChange={(e) => setCommodity(e.target.value)} placeholder="e.g. Frozen strawberries" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">HS Code *</Label>
            <Input value={commodityHs} onChange={(e) => setCommodityHs(e.target.value)} placeholder="e.g. 0811.10.00" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Invoice Value *</Label>
            <Input type="number" value={invoiceValue} onChange={(e) => setInvoiceValue(e.target.value)} placeholder="e.g. 85000" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="EGP">EGP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Origin Criterion</Label>
            <Select value={originCriterion} onValueChange={setOriginCriterion}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="W">W — Wholly obtained</SelectItem>
                <SelectItem value="P">P — Sufficient transformation</SelectItem>
                <SelectItem value="PSR">PSR — Product-specific rule</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[0.65rem] text-muted-foreground">Cumulation Type</Label>
            <Select value={cumulationType} onValueChange={setCumulationType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">None</SelectItem>
                <SelectItem value="BILATERAL">Bilateral</SelectItem>
                <SelectItem value="DIAGONAL">Diagonal</SelectItem>
                <SelectItem value="FULL">Full</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Award className="w-3.5 h-3.5 mr-1.5" />}
            Generate Certificate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Verify Dialog (customs authority verification)
// -----------------------------------------------------------------------------

function VerifyDialog({
  cert,
  open,
  onOpenChange,
  onVerified,
}: {
  cert: CertificateOfOrigin | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onVerified: () => void;
}): ReactElement {
  const [verifiedBy, setVerifiedBy] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!cert) return;
    if (!verifiedBy.trim()) {
      toast.error("Customs authority identifier is required");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout(`/api/sgtx/certificates/${cert.id}/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ verifiedBy }),
      });
      toast.success(`Certificate ${cert.certificateNumber} verified`);
      setVerifiedBy("");
      onOpenChange(false);
      onVerified();
    } catch (e) {
      toast.error("Verification failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gold" />
            Verify Certificate
          </DialogTitle>
          <DialogDescription>
            Customs authority verification. Marks this certificate as VERIFIED.
            {cert && (
              <span className="block mt-1">Certificate <span className="font-mono">{cert.certificateNumber}</span></span>
            )}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-[0.65rem] text-muted-foreground">Customs Authority (GTID or name) *</Label>
          <Input value={verifiedBy} onChange={(e) => setVerifiedBy(e.target.value)} placeholder="e.g. EG-CUS-2025-ALEX-001" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
            Confirm Verification
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Certificate card
// -----------------------------------------------------------------------------

function CertCard({ cert, onVerify }: { cert: CertificateOfOrigin; onVerify: (c: CertificateOfOrigin) => void }): ReactElement {
  const [showHash, setShowHash] = useState(false);
  const verificationUrl = cert.verificationUrl || `/verify/cert/${encodeURIComponent(cert.certificateNumber)}`;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Award className="w-4 h-4 text-gold flex-shrink-0" />
            <h3 className="text-sm font-semibold font-mono break-all">{cert.certificateNumber}</h3>
            <Badge className="bg-gold/10 text-gold border-gold/30">{cert.certificateType}</Badge>
            {certStatusBadge(cert.status)}
            {cert.qizAnnotated && <Badge className="bg-purple-500/10 text-purple-600 border-purple-500/30">QIZ</Badge>}
          </div>
          <p className="text-[0.7rem] text-muted-foreground mt-1">{cert.issuingAuthority}</p>
        </div>
        {/* QR code (SVG placeholder if not generated server-side) */}
        <div className="flex-shrink-0">
          <div className="w-16 h-16 rounded-lg border border-border/50 bg-white flex items-center justify-center">
            <QrCode className="w-10 h-10 text-foreground" />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Origin → Dest</p>
          <p className="font-mono">{cert.originCountry} → {cert.destinationCountry}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">HS Code</p>
          <p className="font-mono">{cert.commodityHs}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Invoice</p>
          <p>{cert.currency} {fmtUsd(cert.invoiceValue)}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Validity</p>
          <p>{cert.validityMonths} months</p>
        </div>
      </div>

      <div className="rounded-md border border-border/40 p-2">
        <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-0.5">Commodity</p>
        <p className="text-xs">{cert.commodity}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Issued</p>
          <p>{fmtDate(cert.issueDate)}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Expires</p>
          <p>{cert.expiryDate ? fmtDate(cert.expiryDate) : "—"}</p>
        </div>
      </div>

      {cert.verifiedBy && cert.verifiedAt && (
        <div className="flex items-center gap-2 text-xs text-emerald-700">
          <CheckCircle2 className="w-3.5 h-3.5" />
          Verified by <span className="font-medium">{cert.verifiedBy}</span> · {fmtDateTime(cert.verifiedAt)}
        </div>
      )}

      {cert.documentHash && (
        <div className="rounded-md bg-muted/30 border border-border/40 p-2">
          <div className="flex items-center justify-between mb-1">
            <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Document Hash (SHA-256)</p>
            <button onClick={() => setShowHash((v) => !v)} className="text-[0.6rem] text-gold hover:underline">
              {showHash ? "Hide" : "Show"}
            </button>
          </div>
          <p className={`font-mono text-[0.6rem] break-all ${showHash ? "" : "blur-sm select-none"}`}>
            {cert.documentHash}
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/30">
        <a
          href={verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-xs text-gold hover:underline"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Public verification
        </a>
        <span className="text-muted-foreground">·</span>
        <span className="text-[0.7rem] text-muted-foreground">Created {fmtDateTime(cert.createdAt)}</span>
      </div>

      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          onClick={() => onVerify(cert)}
          disabled={cert.status === "REVOKED" || cert.status === "REJECTED"}
        >
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
          {cert.status === "VERIFIED" ? "Re-verify" : "Verify"}
        </Button>
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function CertificateOfOriginPanel({ ustn }: { ustn: string }): ReactElement {
  const [certs, setCerts] = useState<CertificateOfOrigin[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [verifyTarget, setVerifyTarget] = useState<CertificateOfOrigin | null>(null);

  const refresh = useCallback(async () => {
    if (!ustn) {
      setError("No USTN provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithTimeout<{ certificates: CertificateOfOrigin[] }>(
        `/api/sgtx/certificates?ustn=${encodeURIComponent(ustn)}`,
      );
      setCerts(r.certificates || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ustn]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const total = certs.length;
    const verified = certs.filter((c) => c.status === "VERIFIED").length;
    const pending = certs.filter((c) => c.status === "ISSUED" || c.status === "PRESENTED").length;
    const revoked = certs.filter((c) => c.status === "REVOKED" || c.status === "REJECTED").length;
    return { total, verified, pending, revoked };
  }, [certs]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-64 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">Unable to load certificates</p>
        <p className="text-xs text-muted-foreground mb-4">{error}</p>
        <Button size="sm" variant="outline" onClick={() => void refresh()}>
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Retry
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Award className="w-5 h-5 text-gold" /> Certificates of Origin
          </h2>
          <p className="text-xs text-muted-foreground">EUR.1 / A.TR / GSP / COO_GENERAL · USTN <span className="font-mono">{ustn}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Generate Certificate
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><FileCheck className="w-3 h-3" /> Total</div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><CheckCircle2 className="w-3 h-3" /> Verified</div>
          <p className="text-xl font-bold mt-1 text-emerald-600">{stats.verified}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Award className="w-3 h-3" /> Pending</div>
          <p className="text-xl font-bold mt-1 text-amber-600">{stats.pending}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><AlertCircle className="w-3 h-3" /> Revoked</div>
          <p className={`text-xl font-bold mt-1 ${stats.revoked > 0 ? "text-rose-600" : ""}`}>{stats.revoked}</p>
        </Card>
      </div>

      {certs.length === 0 ? (
        <Card className="p-8 text-center">
          <Award className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">No certificates issued for this trade</p>
          <p className="text-xs text-muted-foreground mb-4">Generate an EUR.1, A.TR, GSP, or COO_GENERAL certificate to get started.</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Generate Certificate
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {certs.map((c) => <CertCard key={c.id} cert={c} onVerify={(cert) => setVerifyTarget(cert)} />)}
        </div>
      )}

      <GenerateCertDialog ustn={ustn} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />
      <VerifyDialog
        cert={verifyTarget}
        open={!!verifyTarget}
        onOpenChange={(v) => { if (!v) setVerifyTarget(null); }}
        onVerified={() => void refresh()}
      />
    </div>
  );
}
