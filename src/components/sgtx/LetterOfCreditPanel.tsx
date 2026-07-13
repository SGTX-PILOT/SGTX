"use client";

// =============================================================================
// SGTX — Letter of Credit + UCP 600 Validation Panel
// =============================================================================
// Bank / Financier portal panel that manages Letters of Credit for a trade.
//
// Features:
//   • Lists all L/Cs for a USTN (GET /api/sgtx/financing/letter-of-credit?ustn=).
//   • Shows L/C details: number, type, amount, expiry, applicant/beneficiary,
//     required documents, ports, latest shipment date, presentation days.
//   • "Validate Documents" dialog: user inputs document data
//     ({type, content, signed, dated, issuer, original}) and POSTs to
//     /api/sgtx/financing/lc/validate. Verdict (COMPLIANT/WARNING/DISCREPANT),
//     discrepancies, warnings, examination notes are surfaced.
//   • "Create L/C" form: full UCP 600 terms (lcNumber, lcType, issuanceDate,
//     expiryDate, issuingBankName, applicant, beneficiary, currency, amount,
//     requiredDocuments, ports, latestShipmentDate, presentationDays, etc.)
//     POSTs to /api/sgtx/financing/letter-of-credit.
//   • Status badges: ISSUED, ADVISED, CONFIRMED, AMENDED, PRESENTED, EXAMINED,
//     PAID, DISCREPANT, REFUSED, EXPIRED.
//
// Theme: gold / silver / black / white. shadcn/ui + lucide-react.
// =============================================================================

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { toast } from "sonner";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  FileText,
  Landmark,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { fmtDate, fmtDateTime, fmtUsd } from "@/lib/sgtx/format";

const REQUEST_TIMEOUT_MS = 15_000;

// -----------------------------------------------------------------------------
// Types — narrow mirrors of the L/C + UCP 600 validation response shapes.
// -----------------------------------------------------------------------------

interface LetterOfCredit {
  id: string;
  ustn: string;
  tradeId: string;
  lcNumber: string;
  lcType: string;
  issuanceDate: string;
  expiryDate: string;
  expiryPlace: string | null;
  issuingBankName: string;
  issuingBankGtid: string | null;
  advisingBankName: string | null;
  confirmingBankName: string | null;
  applicantName: string;
  applicantAddress: string | null;
  applicantGtid: string | null;
  beneficiaryName: string;
  beneficiaryAddress: string | null;
  beneficiaryGtid: string | null;
  currency: string;
  amount: number;
  tolerancePlus: number;
  toleranceMinus: number;
  portOfLoading: string | null;
  portOfDischarge: string | null;
  placeOfDelivery: string | null;
  latestShipmentDate: string | null;
  partialShipments: string;
  transshipments: string;
  requiredDocuments: string; // JSON array
  documentCount: number;
  presentationDays: number;
  presentationPlace: string | null;
  bankingCharges: string;
  status: string;
  amendmentCount: number;
  lastValidationAt: string | null;
  lastValidationResult: string | null; // JSON
  discrepancyCount: number;
  createdAt: string;
}

interface ValidationDiscrepancy {
  rule?: string;
  article?: string;
  severity?: string;
  message: string;
}

interface ValidationResult {
  verdict: "COMPLIANT" | "WARNING" | "DISCREPANT";
  discrepancies: ValidationDiscrepancy[];
  warnings: ValidationDiscrepancy[];
  examinationNotes?: string[];
  examinedAt?: string;
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
// Status badge helpers
// -----------------------------------------------------------------------------

const LC_STATUS_COLORS: Record<string, string> = {
  ISSUED: "emerald",
  ADVISED: "emerald",
  CONFIRMED: "emerald",
  AMENDED: "amber",
  PRESENTED: "blue",
  EXAMINED: "blue",
  PAID: "emerald",
  DISCREPANT: "rose",
  REFUSED: "rose",
  EXPIRED: "rose",
  CANCELLED: "muted",
};

function lcStatusBadge(status: string): ReactElement {
  const color = LC_STATUS_COLORS[status] || "muted";
  const cls: Record<string, string> = {
    emerald: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
    amber: "bg-amber-500/10 text-amber-600 border-amber-500/30",
    rose: "bg-rose-500/10 text-rose-600 border-rose-500/30",
    blue: "bg-sky-500/10 text-sky-600 border-sky-500/30",
    muted: "bg-muted text-muted-foreground border-border",
  };
  return <Badge className={cls[color]}>{status}</Badge>;
}

function verdictBadge(verdict: string): ReactElement {
  if (verdict === "COMPLIANT") {
    return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30"><CheckCircle2 className="w-3 h-3" /> COMPLIANT</Badge>;
  }
  if (verdict === "WARNING") {
    return <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30"><AlertCircle className="w-3 h-3" /> WARNING</Badge>;
  }
  return <Badge className="bg-rose-500/15 text-rose-700 border-rose-500/30"><AlertCircle className="w-3 h-3" /> DISCREPANT</Badge>;
}

function parseRequiredDocuments(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw.split(",").map((s) => s.trim()).filter(Boolean);
  }
}

function parseValidationResult(raw: string | null): ValidationResult | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as ValidationResult;
  } catch {
    return null;
  }
}

// -----------------------------------------------------------------------------
// Validate Documents Dialog
// -----------------------------------------------------------------------------

interface DocInput {
  type: string;
  content: string;
  signed: boolean;
  dated: string;
  issuer: string;
  original: boolean;
}

function ValidateDocsDialog({
  lc,
  open,
  onOpenChange,
  onValidated,
}: {
  lc: LetterOfCredit;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onValidated: () => void;
}): ReactElement {
  const [docs, setDocs] = useState<DocInput[]>([
    { type: "COMMERCIAL_INVOICE", content: "", signed: false, dated: "", issuer: "", original: true },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ValidationResult | null>(null);

  const addDoc = () => {
    setDocs((d) => [...d, { type: "BILL_LADING", content: "", signed: false, dated: "", issuer: "", original: true }]);
  };
  const removeDoc = (idx: number) => {
    setDocs((d) => d.filter((_, i) => i !== idx));
  };
  const updateDoc = (idx: number, patch: Partial<DocInput>) => {
    setDocs((d) => d.map((doc, i) => (i === idx ? { ...doc, ...patch } : doc)));
  };

  const validate = async () => {
    setSubmitting(true);
    setResult(null);
    try {
      const r = await fetchWithTimeout<{ verdict: string; discrepancies: ValidationDiscrepancy[]; warnings: ValidationDiscrepancy[]; examinationNotes?: string[]; examinedAt?: string }>(
        "/api/sgtx/financing/lc/validate",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            letterOfCreditId: lc.id,
            documents: docs.map((d) => ({
              type: d.type,
              content: d.content,
              signed: d.signed,
              dated: d.dated || undefined,
              issuer: d.issuer,
              original: d.original,
            })),
          }),
        },
      );
      setResult(r as ValidationResult);
      toast.success(`Validation: ${r.verdict}`);
      onValidated();
    } catch (e) {
      toast.error("Validation failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-gold" />
            Validate Documents · UCP 600
          </DialogTitle>
          <DialogDescription>
            L/C <span className="font-mono">{lc.lcNumber}</span> · {lc.currency} {fmtUsd(lc.amount)} · expires {fmtDate(lc.expiryDate)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg border border-border/50 p-3 bg-muted/20">
            <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Required Documents</p>
            <div className="flex flex-wrap gap-1.5">
              {parseRequiredDocuments(lc.requiredDocuments).map((d, i) => (
                <Badge key={i} variant="outline" className="text-[0.65rem]">{d}</Badge>
              ))}
              {parseRequiredDocuments(lc.requiredDocuments).length === 0 && (
                <span className="text-xs text-muted-foreground">None specified</span>
              )}
            </div>
          </div>

          {docs.map((doc, idx) => (
            <Card key={idx} className="p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold">Document {idx + 1}</p>
                {docs.length > 1 && (
                  <Button size="sm" variant="ghost" className="h-6 text-[0.65rem] text-rose-600" onClick={() => removeDoc(idx)}>Remove</Button>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground">Type</Label>
                  <Select value={doc.type} onValueChange={(v) => updateDoc(idx, { type: v })}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="COMMERCIAL_INVOICE">Commercial Invoice</SelectItem>
                      <SelectItem value="BILL_LADING">Bill of Lading</SelectItem>
                      <SelectItem value="COO">Certificate of Origin</SelectItem>
                      <SelectItem value="PACKING_LIST">Packing List</SelectItem>
                      <SelectItem value="INSURANCE_CERT">Insurance Certificate</SelectItem>
                      <SelectItem value="INSPECTION_CERT">Inspection Certificate</SelectItem>
                      <SelectItem value="DRAFT">Draft (Bill of Exchange)</SelectItem>
                      <SelectItem value="BENEFICIARY_CERT">Beneficiary Certificate</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground">Issuer</Label>
                  <Input className="h-8 text-xs" value={doc.issuer} onChange={(e) => updateDoc(idx, { issuer: e.target.value })} placeholder="Issuing party name" />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-[0.65rem] text-muted-foreground">Content / summary</Label>
                  <Input className="h-8 text-xs" value={doc.content} onChange={(e) => updateDoc(idx, { content: e.target.value })} placeholder="Brief content description" />
                </div>
                <div className="space-y-1">
                  <Label className="text-[0.65rem] text-muted-foreground">Date</Label>
                  <Input className="h-8 text-xs" type="date" value={doc.dated} onChange={(e) => updateDoc(idx, { dated: e.target.value })} />
                </div>
                <div className="flex items-end gap-3 pb-1">
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={doc.signed} onChange={(e) => updateDoc(idx, { signed: e.target.checked })} className="rounded" />
                    Signed
                  </label>
                  <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                    <input type="checkbox" checked={doc.original} onChange={(e) => updateDoc(idx, { original: e.target.checked })} className="rounded" />
                    Original
                  </label>
                </div>
              </div>
            </Card>
          ))}

          <Button size="sm" variant="outline" onClick={addDoc}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Add Document
          </Button>

          {result && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="rounded-lg border border-gold/30 bg-gold/[0.04] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-gold" /> Examination Result
                </p>
                {verdictBadge(result.verdict)}
              </div>
              {result.discrepancies.length > 0 && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-rose-600 mb-1">Discrepancies ({result.discrepancies.length})</p>
                  <ul className="space-y-1 text-xs">
                    {result.discrepancies.map((d, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 text-rose-600 flex-shrink-0" />
                        <span>
                          {d.article && <span className="font-mono text-[0.65rem] bg-rose-500/10 px-1 rounded mr-1">{d.article}</span>}
                          {d.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.warnings.length > 0 && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-amber-600 mb-1">Warnings ({result.warnings.length})</p>
                  <ul className="space-y-1 text-xs">
                    {result.warnings.map((w, i) => (
                      <li key={i} className="flex items-start gap-1.5">
                        <AlertCircle className="w-3 h-3 mt-0.5 text-amber-600 flex-shrink-0" />
                        <span>
                          {w.article && <span className="font-mono text-[0.65rem] bg-amber-500/10 px-1 rounded mr-1">{w.article}</span>}
                          {w.message}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {result.examinationNotes && result.examinationNotes.length > 0 && (
                <div>
                  <p className="text-[0.7rem] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Examination Notes</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {result.examinationNotes.map((n, i) => <li key={i}>· {n}</li>)}
                  </ul>
                </div>
              )}
              {result.examinedAt && (
                <p className="text-[0.65rem] text-muted-foreground">Examined at {fmtDateTime(result.examinedAt)}</p>
              )}
            </motion.div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={validate} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />}
            Run UCP 600 Validation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// Create L/C Dialog
// -----------------------------------------------------------------------------

function CreateLcDialog({
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
  const [lcNumber, setLcNumber] = useState("");
  const [lcType, setLcType] = useState("IRREVOCABLE");
  const [issuingBankName, setIssuingBankName] = useState("");
  const [applicantName, setApplicantName] = useState("");
  const [beneficiaryName, setBeneficiaryName] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [issuanceDate, setIssuanceDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [latestShipmentDate, setLatestShipmentDate] = useState("");
  const [portOfLoading, setPortOfLoading] = useState("");
  const [portOfDischarge, setPortOfDischarge] = useState("");
  const [presentationDays, setPresentationDays] = useState("21");
  const [requiredDocs, setRequiredDocs] = useState("COMMERCIAL_INVOICE,BILL_LADING,COO,PACKING_LIST");
  const [partialShipments, setPartialShipments] = useState("ALLOWED");
  const [transshipments, setTransshipments] = useState("ALLOWED");
  const [bankingCharges, setBankingCharges] = useState("BENEFICIARY");
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!lcNumber || !issuingBankName || !applicantName || !beneficiaryName || !issuanceDate || !expiryDate) {
      toast.error("Required fields missing");
      return;
    }
    const amt = parseFloat(amount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be positive");
      return;
    }
    setSubmitting(true);
    try {
      await fetchWithTimeout("/api/sgtx/financing/letter-of-credit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ustn,
          lcNumber,
          lcType,
          issuingBankName,
          applicantName,
          beneficiaryName,
          currency,
          amount: amt,
          issuanceDate,
          expiryDate,
          latestShipmentDate: latestShipmentDate || undefined,
          portOfLoading: portOfLoading || undefined,
          portOfDischarge: portOfDischarge || undefined,
          presentationDays: parseInt(presentationDays, 10) || 21,
          requiredDocuments: requiredDocs.split(",").map((s) => s.trim()).filter(Boolean),
          partialShipments,
          transshipments,
          bankingCharges,
        }),
      });
      toast.success(`L/C ${lcNumber} created`);
      // Reset + close
      setLcNumber(""); setIssuingBankName(""); setApplicantName(""); setBeneficiaryName("");
      setAmount(""); setIssuanceDate(""); setExpiryDate(""); setLatestShipmentDate("");
      setPortOfLoading(""); setPortOfDischarge("");
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error("L/C creation failed", { description: (e as Error).message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Landmark className="w-5 h-5 text-gold" />
            Issue New Letter of Credit
          </DialogTitle>
          <DialogDescription>UCP 600 compliant L/C issuance · USTN <span className="font-mono">{ustn}</span></DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">L/C Number *</Label>
            <Input value={lcNumber} onChange={(e) => setLcNumber(e.target.value)} placeholder="e.g. SBLC-2026-0001" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">L/C Type *</Label>
            <Select value={lcType} onValueChange={setLcType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="IRREVOCABLE">Irrevocable</SelectItem>
                <SelectItem value="REVOCABLE">Revocable</SelectItem>
                <SelectItem value="CONFIRMED">Confirmed</SelectItem>
                <SelectItem value="UNCONFIRMED">Unconfirmed</SelectItem>
                <SelectItem value="STANDBY">Standby</SelectItem>
                <SelectItem value="REVOLVING">Revolving</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[0.65rem] text-muted-foreground">Issuing Bank *</Label>
            <Input value={issuingBankName} onChange={(e) => setIssuingBankName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Applicant *</Label>
            <Input value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Beneficiary *</Label>
            <Input value={beneficiaryName} onChange={(e) => setBeneficiaryName(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Currency *</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
                <SelectItem value="EGP">EGP</SelectItem>
                <SelectItem value="AED">AED</SelectItem>
                <SelectItem value="CNY">CNY</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Amount *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 250000" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Issuance Date *</Label>
            <Input type="date" value={issuanceDate} onChange={(e) => setIssuanceDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Expiry Date *</Label>
            <Input type="date" value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Latest Shipment Date</Label>
            <Input type="date" value={latestShipmentDate} onChange={(e) => setLatestShipmentDate(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Port of Loading</Label>
            <Input value={portOfLoading} onChange={(e) => setPortOfLoading(e.target.value)} placeholder="e.g. EGALX" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Port of Discharge</Label>
            <Input value={portOfDischarge} onChange={(e) => setPortOfDischarge(e.target.value)} placeholder="e.g. DEHAM" />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Presentation Days</Label>
            <Input type="number" value={presentationDays} onChange={(e) => setPresentationDays(e.target.value)} />
          </div>
          <div className="space-y-1 sm:col-span-2">
            <Label className="text-[0.65rem] text-muted-foreground">Required Documents (comma-separated)</Label>
            <Input value={requiredDocs} onChange={(e) => setRequiredDocs(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Partial Shipments</Label>
            <Select value={partialShipments} onValueChange={setPartialShipments}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALLOWED">Allowed</SelectItem>
                <SelectItem value="NOT_ALLOWED">Not Allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Transshipments</Label>
            <Select value={transshipments} onValueChange={setTransshipments}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALLOWED">Allowed</SelectItem>
                <SelectItem value="NOT_ALLOWED">Not Allowed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-[0.65rem] text-muted-foreground">Banking Charges</Label>
            <Select value={bankingCharges} onValueChange={setBankingCharges}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="BENEFICIARY">Beneficiary</SelectItem>
                <SelectItem value="APPLICANT">Applicant</SelectItem>
                <SelectItem value="SHARED">Shared</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <Plus className="w-3.5 h-3.5 mr-1.5" />}
            Issue L/C
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// -----------------------------------------------------------------------------
// L/C detail card
// -----------------------------------------------------------------------------

function LcCard({ lc, onValidate }: { lc: LetterOfCredit; onValidate: (lc: LetterOfCredit) => void }): ReactElement {
  const docs = parseRequiredDocuments(lc.requiredDocuments);
  const lastResult = parseValidationResult(lc.lastValidationResult);
  return (
    <Card className="p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <FileText className="w-4 h-4 text-gold flex-shrink-0" />
            <h3 className="text-sm font-semibold font-mono">{lc.lcNumber}</h3>
            {lcStatusBadge(lc.status)}
            {lc.amendmentCount > 0 && <Badge variant="outline" className="text-[0.65rem]">Amended ×{lc.amendmentCount}</Badge>}
            {lastResult && verdictBadge(lastResult.verdict)}
          </div>
          <p className="text-[0.7rem] text-muted-foreground mt-1">
            {lc.lcType} · {lc.currency} {fmtUsd(lc.amount)}
            {lc.tolerancePlus > 0 || lc.toleranceMinus > 0 ? ` · ±${lc.tolerancePlus}/${lc.toleranceMinus}%` : ""}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => onValidate(lc)}>
          <ShieldCheck className="w-3.5 h-3.5 mr-1.5" /> Validate Documents
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Issuance</p>
          <p>{fmtDate(lc.issuanceDate)}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Expiry</p>
          <p className={new Date(lc.expiryDate).getTime() < Date.now() ? "text-rose-600 font-semibold" : ""}>
            {fmtDate(lc.expiryDate)}
          </p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Latest Shipment</p>
          <p>{lc.latestShipmentDate ? fmtDate(lc.latestShipmentDate) : "—"}</p>
        </div>
        <div>
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider">Presentation</p>
          <p>{lc.presentationDays} days</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
        <div className="rounded-md border border-border/40 p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-0.5">Applicant</p>
          <p className="font-medium">{lc.applicantName}</p>
          {lc.applicantAddress && <p className="text-muted-foreground">{lc.applicantAddress}</p>}
        </div>
        <div className="rounded-md border border-border/40 p-2">
          <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-0.5">Beneficiary</p>
          <p className="font-medium">{lc.beneficiaryName}</p>
          {lc.beneficiaryAddress && <p className="text-muted-foreground">{lc.beneficiaryAddress}</p>}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Landmark className="w-3.5 h-3.5 text-muted-foreground" />
        <span className="text-muted-foreground">Issuing bank:</span> <span className="font-medium">{lc.issuingBankName}</span>
        {lc.confirmingBankName && (
          <>
            <span className="text-muted-foreground mx-1">·</span>
            <span className="text-muted-foreground">Confirmed by:</span> <span className="font-medium">{lc.confirmingBankName}</span>
          </>
        )}
      </div>

      {(lc.portOfLoading || lc.portOfDischarge) && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">Route:</span>
          <span className="font-mono">{lc.portOfLoading || "—"}</span>
          <span className="text-muted-foreground">→</span>
          <span className="font-mono">{lc.portOfDischarge || "—"}</span>
          {lc.placeOfDelivery && <span className="text-muted-foreground">· {lc.placeOfDelivery}</span>}
        </div>
      )}

      <div>
        <p className="text-[0.6rem] text-muted-foreground uppercase tracking-wider mb-1">Required Documents ({docs.length})</p>
        <div className="flex flex-wrap gap-1.5">
          {docs.length === 0 ? <span className="text-xs text-muted-foreground">—</span> : docs.map((d, i) => (
            <Badge key={i} variant="outline" className="text-[0.65rem]">{d}</Badge>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 text-[0.7rem] text-muted-foreground pt-1 border-t border-border/30">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Created {fmtDateTime(lc.createdAt)}</span>
        {lc.lastValidationAt && (
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Last validated {fmtDateTime(lc.lastValidationAt)}</span>
        )}
        {lc.discrepancyCount > 0 && (
          <Badge className="bg-rose-500/10 text-rose-600 border-rose-500/30">{lc.discrepancyCount} discrepancies</Badge>
        )}
      </div>
    </Card>
  );
}

// -----------------------------------------------------------------------------
// Main panel
// -----------------------------------------------------------------------------

export function LetterOfCreditPanel({ ustn }: { ustn: string }): ReactElement {
  const [lcs, setLcs] = useState<LetterOfCredit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [validateTarget, setValidateTarget] = useState<LetterOfCredit | null>(null);

  const refresh = useCallback(async () => {
    if (!ustn) {
      setError("No USTN provided.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const r = await fetchWithTimeout<{ lettersOfCredit: LetterOfCredit[] }>(
        `/api/sgtx/financing/letter-of-credit?ustn=${encodeURIComponent(ustn)}`,
      );
      setLcs(r.lettersOfCredit || []);
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
    const total = lcs.length;
    const active = lcs.filter((l) => !["EXPIRED", "REFUSED", "CANCELLED", "PAID"].includes(l.status)).length;
    const discrepant = lcs.filter((l) => l.status === "DISCREPANT" || l.discrepancyCount > 0).length;
    const totalValue = lcs.reduce((s, l) => s + (l.amount || 0), 0);
    return { total, active, discrepant, totalValue };
  }, [lcs]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full rounded-xl" />)}
        </div>
        <div className="space-y-3">
          {[0, 1].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="p-6 text-center">
        <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
        <p className="text-sm font-semibold mb-1">Unable to load Letters of Credit</p>
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
            <FileText className="w-5 h-5 text-gold" /> Letters of Credit
          </h2>
          <p className="text-xs text-muted-foreground">UCP 600 examination · USTN <span className="font-mono">{ustn}</span></p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => void refresh()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Issue New L/C
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><FileText className="w-3 h-3" /> Total L/Cs</div>
          <p className="text-xl font-bold mt-1">{stats.total}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Clock className="w-3 h-3" /> Active</div>
          <p className="text-xl font-bold mt-1 text-emerald-600">{stats.active}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><AlertCircle className="w-3 h-3" /> Discrepant</div>
          <p className={`text-xl font-bold mt-1 ${stats.discrepant > 0 ? "text-rose-600" : ""}`}>{stats.discrepant}</p>
        </Card>
        <Card className="p-3">
          <div className="flex items-center gap-2 text-[0.65rem] text-muted-foreground uppercase tracking-wider"><Landmark className="w-3 h-3" /> Total Value</div>
          <p className="text-xl font-bold mt-1">{fmtUsd(stats.totalValue)}</p>
        </Card>
      </div>

      {lcs.length === 0 ? (
        <Card className="p-8 text-center">
          <Landmark className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-semibold mb-1">No Letters of Credit on this trade</p>
          <p className="text-xs text-muted-foreground mb-4">Issue a new L/C to initiate UCP 600 examination.</p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1.5" /> Issue New L/C
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {lcs.map((lc) => <LcCard key={lc.id} lc={lc} onValidate={(l) => setValidateTarget(l)} />)}
        </div>
      )}

      <CreateLcDialog ustn={ustn} open={createOpen} onOpenChange={setCreateOpen} onCreated={() => void refresh()} />
      {validateTarget && (
        <ValidateDocsDialog
          lc={validateTarget}
          open={!!validateTarget}
          onOpenChange={(v) => { if (!v) setValidateTarget(null); }}
          onValidated={() => void refresh()}
        />
      )}
    </div>
  );
}
